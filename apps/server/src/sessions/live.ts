import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { countVotes } from '@crisol/engine';
import { nextPhaseId } from '@crisol/engine';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { COOKIE } from '../auth/routes.js';
import { append, controlView, currentState, participantView, roster } from './service.js';

interface Identity {
  sessionId: string;
  /** Set for the facilitator's own sockets. */
  userId?: string;
  participantId?: string;
  roleId?: string;
  /**
   * The projected room view. It authenticates like a facilitator (whoever sets
   * up the projector is running the exercise) but must never be treated as one:
   * the whole room is looking at it, so it gets the general role's view and no
   * presenter cue, roster or live tally.
   */
  screen?: boolean;
}

const identities = new WeakMap<Socket, Identity>();

/**
 * The live layer.
 *
 * Every action becomes an event in the log first, then everyone is sent a fresh
 * view derived from that log. No client is ever the source of truth, so a
 * reload — or a facilitator whose browser died — costs nothing.
 */
export function registerLive(app: FastifyInstance, sql: Sql, _config: Config) {
  const io = new Server(app.server, { path: '/socket.io', serveClient: false });

  const broadcast = async (sessionId: string) => {
    const loaded = await currentState(sql, sessionId);
    if (!loaded) return;
    const people = await roster(sql, sessionId);
    const control = controlView(loaded.scenario, loaded.state, people);
    const serverNow = new Date().toISOString();

    const generalRoleId = loaded.scenario.roles.find((role) => role.isGeneral)?.id ?? '';

    for (const socket of await io.in(`session:${sessionId}`).fetchSockets()) {
      const identity = identities.get(socket as unknown as Socket);
      // A participant only ever receives their own role's view; the projected
      // screen gets the general one.
      const view =
        identity?.userId && !identity.screen
          ? control
          : participantView(
              loaded.scenario,
              loaded.state,
              identity?.screen ? generalRoleId : (identity?.roleId ?? ''),
              identity?.participantId ?? null,
              people.length,
            );
      socket.emit('state', { ...view, serverNow, runningSince: loaded.state.runningSince });
    }
  };

  io.on('connection', (socket) => {
    void (async () => {
      const { sessionId, participantId, rejoinToken } = socket.handshake.query as Record<string, string>;
      if (!sessionId) return socket.disconnect(true);

      let identity: Identity = { sessionId };

      /**
       * Explicit participant credentials beat the session cookie.
       *
       * Whoever runs the exercise is signed in on the same browser they use to
       * check what a participant sees. If the ambient cookie won, that tab would
       * get the facilitator's unfiltered view — every role's private material on
       * screen — and its votes would be silently dropped for having no
       * participant behind them. Asking to be a participant makes you one.
       */
      const asksToBeParticipant = Boolean(participantId || rejoinToken);

      if (!asksToBeParticipant) {
        const cookies = socket.handshake.headers.cookie ?? '';
        const token = cookies
          .split(';')
          .map((part) => part.trim().split('='))
          .find(([name]) => name === COOKIE)?.[1];

        if (token) {
          const [row] = await sql<{ userId: string }[]>`
            select user_id as "userId" from auth_sessions
            where token = ${decodeURIComponent(token)} and expires_at > now()
          `;
          if (row) {
            identity = { sessionId, userId: row.userId };
            if (socket.handshake.query.screen === '1') identity.screen = true;
          }
        }
      }

      if (!identity.userId) {
        const [participant] = await sql<{ id: string; roleId: string }[]>`
          select id, role_id as "roleId" from participants
          where session_id = ${sessionId}
            and (id = ${participantId ?? ''} or rejoin_token = ${rejoinToken ?? ''})
        `;
        if (!participant) return socket.disconnect(true);
        identity = { sessionId, participantId: participant.id, roleId: participant.roleId };
        await sql`update participants set last_seen_at = now() where id = ${participant.id}`;
      }

      identities.set(socket, identity);
      await socket.join(`session:${sessionId}`);

      const actor = identity.userId
        ? ({ kind: 'user', userId: identity.userId } as const)
        : ({ kind: 'participant', participantId: identity.participantId! } as const);

      const requireFacilitator = () => {
        // The screen is a mirror, never a control: it must not be able to act
        // even though it signed in with the same account.
        if (identity.userId && !identity.screen) return true;
        socket.emit('denied', 'Sólo quien conduce puede hacer eso');
        return false;
      };

      /**
       * Wraps a handler so a failure is logged and the client told, instead of
       * becoming an unhandled rejection that leaves the room silently stuck.
       */
      const on = (event: string, handler: (payload: never) => Promise<unknown>) => {
        socket.on(event, (payload: unknown) => {
          handler((payload ?? {}) as never).catch((error) => {
            app.log.error({ err: error, event, sessionId }, 'fallo procesando una acción en vivo');
            socket.emit('denied', 'Algo falló en el servidor. Probá de nuevo.');
          });
        });
      };

      const phaseNow = async () => {
        const loaded = await currentState(sql, sessionId);
        if (!loaded) return null;
        const phase = loaded.scenario.phases.find((p) => p.id === loaded.state.currentPhaseId);
        return phase ? { ...loaded, phase } : { ...loaded, phase: null };
      };

      on('vote', async ({ optionId }: { optionId: string }) => {
        if (!identity.participantId) return;
        const loaded = await phaseNow();
        const decision = loaded?.phase?.decision;
        if (!loaded || !decision) return;
        if (!loaded.state.answersOpen) return socket.emit('denied', 'Las respuestas están cerradas');
        if (!decision.options.some((o) => o.id === optionId)) return;

        await sql`
          insert into votes (session_id, decision_id, participant_id, option_id)
          values (${sessionId}, ${decision.id}, ${identity.participantId}, ${optionId})
          on conflict (session_id, decision_id, participant_id)
          do update set option_id = excluded.option_id, created_at = now()
        `;
        await append(sql, sessionId, {
          kind: 'vote_cast',
          actor,
          decisionId: decision.id,
          participantId: identity.participantId,
          optionId,
        });
        await broadcast(sessionId);
      });

      on('start', async () => {
        if (!requireFacilitator()) return;
        const loaded = await currentState(sql, sessionId);
        const first = [...(loaded?.scenario.phases ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];
        if (!loaded || !first || loaded.state.status !== 'draft') return;

        await append(sql, sessionId, { kind: 'session_started', actor, phaseId: first.id });
        await append(sql, sessionId, {
          kind: 'phase_started',
          actor,
          phaseId: first.id,
          durationSeconds: first.durationSeconds,
        });
        await sql`update sessions set status = 'live' where id = ${sessionId}`;
        await broadcast(sessionId);
      });

      on('answers', async ({ open }: { open: boolean }) => {
        if (!requireFacilitator()) return;
        const loaded = await phaseNow();
        const decision = loaded?.phase?.decision;
        if (!decision) return socket.emit('denied', 'Esta fase no tiene una votación');
        await append(sql, sessionId, {
          kind: open ? 'answers_opened' : 'answers_closed',
          actor,
          decisionId: decision.id,
        });
        await broadcast(sessionId);
      });

      on('reveal', async () => {
        if (!requireFacilitator()) return;
        const loaded = await phaseNow();
        const decision = loaded?.phase?.decision;
        if (!decision) return;
        await append(sql, sessionId, { kind: 'results_revealed', actor, decisionId: decision.id });
        await broadcast(sessionId);
      });

      /**
       * Closes the current decision. `optionId` means the facilitator is
       * choosing against the vote, which is recorded as such — the report has to
       * be able to say the table did not decide this one.
       */
      on('resolve', async ({ optionId }: { optionId?: string } = {}) => {
        if (!requireFacilitator()) return;
        const loaded = await phaseNow();
        const decision = loaded?.phase?.decision;
        if (!loaded || !decision) return;

        const outcome = countVotes(decision, loaded.state.votes[decision.id] ?? {});

        if (optionId && optionId !== outcome.winnerId) {
          await append(sql, sessionId, {
            kind: 'facilitator_override',
            actor,
            decisionId: decision.id,
            optionId,
            wouldHaveWonOptionId: outcome.winnerId,
            tally: outcome.tally,
          });
        } else {
          const chosen = optionId ?? outcome.winnerId;
          if (!chosen) {
            return socket.emit('denied', 'Hay empate: elegí una opción para desempatar');
          }
          await append(sql, sessionId, {
            kind: 'decision_resolved',
            actor,
            decisionId: decision.id,
            optionId: chosen,
            tally: outcome.tally,
            resolvedBy: outcome.winnerId === chosen ? 'vote' : 'tie_break',
          });
        }
        await broadcast(sessionId);
      });

      on('advance', async () => {
        if (!requireFacilitator()) return;
        const loaded = await phaseNow();
        if (!loaded?.phase) return;

        const decision = loaded.phase.decision;
        const resolved = decision ? loaded.state.resolved[decision.id] : undefined;
        if (decision && !resolved) {
          return socket.emit('denied', 'Cerrá la decisión antes de avanzar');
        }

        const target = nextPhaseId(loaded.scenario, loaded.phase, resolved?.optionId ?? null);
        await append(sql, sessionId, { kind: 'phase_ended', actor, phaseId: loaded.phase.id });

        if (!target) {
          await append(sql, sessionId, { kind: 'session_ended', actor });
          await sql`update sessions set status = 'ended', ended_at = now() where id = ${sessionId}`;
        } else {
          const next = loaded.scenario.phases.find((p) => p.id === target);
          if (next) {
            await append(sql, sessionId, {
              kind: 'phase_started',
              actor,
              phaseId: next.id,
              durationSeconds: next.durationSeconds,
            });
          }
        }
        await broadcast(sessionId);
      });

      on('pause', async () => {
        if (!requireFacilitator()) return;
        await append(sql, sessionId, { kind: 'session_paused', actor });
        await sql`update sessions set status = 'paused' where id = ${sessionId}`;
        await broadcast(sessionId);
      });

      on('resume', async ({ remainingSeconds }: { remainingSeconds: number | null }) => {
        if (!requireFacilitator()) return;
        await append(sql, sessionId, { kind: 'session_resumed', actor, remainingSeconds });
        await sql`update sessions set status = 'live' where id = ${sessionId}`;
        await broadcast(sessionId);
      });

      socket.on('disconnect', async () => {
        if (identity.participantId) {
          await append(sql, sessionId, {
            kind: 'participant_left',
            actor,
            participantId: identity.participantId,
          }).catch(() => {});
          await broadcast(sessionId).catch(() => {});
        }
      });

      if (identity.participantId) {
        const [p] = await sql<{ displayName: string }[]>`
          select display_name as "displayName" from participants where id = ${identity.participantId}
        `;
        await append(sql, sessionId, {
          kind: 'participant_joined',
          actor,
          participantId: identity.participantId,
          displayName: p?.displayName ?? '',
          roleId: identity.roleId ?? '',
        });
      }

      await broadcast(sessionId);
    })().catch((error) => {
      app.log.error({ err: error }, 'fallo en el socket');
      socket.disconnect(true);
    });
  });

  app.addHook('onClose', async () => {
    await io.close();
  });
}
