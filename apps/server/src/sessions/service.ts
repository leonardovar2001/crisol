import { randomInt } from 'node:crypto';
import type postgres from 'postgres';
import { scenarioSchema, sessionEventSchema, type Scenario, type SessionEvent } from '@crisol/shared';
import { countVotes, deriveState, nextPhaseId, type SessionState } from '@crisol/engine';
import type { Sql } from '../db/client.js';
import { newId, newToken } from '../ids.js';

export interface SessionRow {
  id: string;
  document: Scenario;
  joinCode: string;
  status: 'draft' | 'live' | 'paused' | 'ended';
  locale: string;
}

/** Six digits: short enough to read out loud across a room. */
async function freeJoinCode(sql: Sql): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = String(randomInt(100000, 1000000));
    const taken = await sql`
      select 1 from sessions where join_code = ${code} and status <> 'ended'
    `;
    if (taken.length === 0) return code;
  }
  throw new Error('no free join code');
}

export async function createSession(sql: Sql, scenarioId: string, userId: string) {
  const [row] = await sql<{ document: Scenario }[]>`
    select document from scenarios where id = ${scenarioId}
  `;
  if (!row) return null;

  // Validate on the way in: a session must never start from a document the
  // engine cannot run.
  const scenario = scenarioSchema.parse(row.document);
  const id = newId('ses');
  const joinCode = await freeJoinCode(sql);

  await sql`
    insert into sessions (id, scenario_id, document, join_code, locale, created_by)
    values (${id}, ${scenarioId}, ${sql.json(scenario)}, ${joinCode}, ${scenario.defaultLocale}, ${userId})
  `;

  // Every role that is not the general one gets a private code.
  const codes = scenario.roles
    .filter((role) => !role.isGeneral)
    .map((role) => ({ roleId: role.id, accessCode: String(randomInt(100, 1000)) + '-' + newToken().slice(0, 6) }));

  for (const code of codes) {
    await sql`
      insert into session_role_access (session_id, role_id, access_code)
      values (${id}, ${code.roleId}, ${code.accessCode})
    `;
  }

  return { id, joinCode, roleCodes: codes };
}

export async function loadSession(sql: Sql, id: string): Promise<SessionRow | null> {
  const [row] = await sql<SessionRow[]>`
    select id, document, join_code as "joinCode", status, locale
    from sessions where id = ${id}
  `;
  return row ?? null;
}

export async function findByJoinCode(sql: Sql, code: string): Promise<SessionRow | null> {
  const [row] = await sql<SessionRow[]>`
    select id, document, join_code as "joinCode", status, locale
    from sessions where join_code = ${code} and status <> 'ended'
  `;
  return row ?? null;
}

export async function loadEvents(sql: Sql, sessionId: string): Promise<SessionEvent[]> {
  const rows = await sql<{ seq: number; at: Date; kind: string; actor: unknown; payload: object }[]>`
    select seq, at, kind, actor, payload
    from session_events where session_id = ${sessionId} order by seq
  `;

  return rows.map((row) => {
    const parsed = sessionEventSchema.safeParse({
      seq: row.seq,
      at: new Date(row.at).toISOString(),
      kind: row.kind,
      actor: row.actor,
      ...row.payload,
    });
    // Never skip an unreadable event. Dropping one silently rewrites what
    // happened in the session and produces a report that is quietly wrong —
    // far worse than refusing to load it.
    if (!parsed.success) {
      throw new Error(
        `evento ${row.seq} (${row.kind}) de la sesión ${sessionId} no se puede leer: ` +
          parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '),
      );
    }
    return parsed.data;
  });
}

/**
 * A plain `Omit` over a discriminated union collapses it to the fields every
 * member shares, which would let `{ kind: 'vote_cast' }` through with no
 * `optionId`. Distributing keeps each variant intact.
 */
type WithoutMeta<T> = T extends unknown ? Omit<T, 'seq' | 'at'> : never;
type NewEvent = WithoutMeta<SessionEvent>;

/**
 * Appends one event.
 *
 * The sequence number is picked and inserted in a single statement, and the
 * primary key `(session_id, seq)` is what actually guarantees a total order: if
 * two facilitators click at the same instant, one insert loses on the unique
 * constraint and simply retries with the next number. No locking needed.
 */
export async function append(
  sql: Sql,
  sessionId: string,
  event: NewEvent,
): Promise<{ seq: number }> {
  const { kind, actor, ...rest } = event as NewEvent & Record<string, unknown>;
  const payload = rest as postgres.JSONValue;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [row] = await sql<{ seq: number }[]>`
        insert into session_events (session_id, seq, kind, actor, payload)
        select ${sessionId}, coalesce(max(seq), 0) + 1, ${kind},
               ${sql.json(actor as postgres.JSONValue)}, ${sql.json(payload)}
        from session_events where session_id = ${sessionId}
        returning seq
      `;
      if (row) return { seq: row.seq };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '23505' || attempt === 4) throw error;
    }
  }
  throw new Error(`no se pudo escribir el evento tras varios intentos: ${kind}`);
}

export async function currentState(sql: Sql, sessionId: string) {
  const session = await loadSession(sql, sessionId);
  if (!session) return null;
  const events = await loadEvents(sql, sessionId);
  return { session, scenario: session.document, state: deriveState(session.document, events) };
}

// ── Views ────────────────────────────────────────────────────────────────────

function text(value: Record<string, string> | undefined, locale: string): string {
  if (!value) return '';
  return value[locale] ?? Object.values(value)[0] ?? '';
}

export interface PhaseView {
  id: string;
  title: string;
  kind: string;
  index: number;
  total: number;
}

export interface ParticipantView {
  status: SessionState['status'];
  phase: PhaseView | null;
  remainingSeconds: number | null;
  contents: { id: string; kind: string; body: string; mediaUrl: string | null }[];
  decision: {
    id: string;
    prompt: string;
    options: { id: string; label: string; description: string }[];
    answersOpen: boolean;
    myVote: string | null;
  } | null;
  results: { tally: Record<string, number>; winnerId: string | null; byFacilitator: boolean } | null;
  participants: number;
}

/**
 * What one participant is allowed to see, right now.
 *
 * Filtering happens here and not in the browser on purpose: material meant for
 * another role must never reach a device that should not have it. Opening the
 * developer tools should show nothing extra.
 */
export function participantView(
  scenario: Scenario,
  state: SessionState,
  roleId: string,
  participantId: string | null,
  participantCount: number,
): ParticipantView {
  const locale = scenario.defaultLocale;
  const ordered = [...scenario.phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const phase = ordered.find((p) => p.id === state.currentPhaseId) ?? null;

  if (!phase) {
    return {
      status: state.status,
      phase: null,
      remainingSeconds: null,
      contents: [],
      decision: null,
      results: null,
      participants: participantCount,
    };
  }

  const contents = [...phase.contents]
    .filter((content) => content.roleId === null || content.roleId === roleId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((content) => ({
      id: content.id,
      kind: content.kind,
      body: text(content.body, locale),
      mediaUrl: content.mediaId ? `/api/media/${content.mediaId}` : null,
    }));

  const decision = phase.decision;
  const resolved = decision ? state.resolved[decision.id] : undefined;
  const showResults = Boolean(
    decision && (state.resultsVisible || decision.resultsReveal === 'live' || resolved),
  );

  return {
    status: state.status,
    phase: {
      id: phase.id,
      title: text(phase.title, locale),
      kind: phase.kind,
      index: ordered.findIndex((p) => p.id === phase.id) + 1,
      total: ordered.length,
    },
    remainingSeconds: state.remainingSeconds,
    contents,
    decision: decision
      ? {
          id: decision.id,
          prompt: text(decision.prompt, locale),
          options: [...decision.options]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((option) => ({
              id: option.id,
              label: text(option.label, locale),
              description: text(option.description, locale),
            })),
          answersOpen: state.answersOpen,
          myVote: participantId ? (state.votes[decision.id]?.[participantId] ?? null) : null,
        }
      : null,
    results:
      decision && showResults
        ? {
            tally: resolved?.tally ?? countVotes(decision, state.votes[decision.id] ?? {}).tally,
            winnerId: resolved?.optionId ?? null,
            byFacilitator: resolved?.resolvedBy === 'override',
          }
        : null,
    participants: participantCount,
  };
}

export interface ControlView extends ParticipantView {
  /** The facilitator sees the tally at all times, revealed or not. */
  liveTally: Record<string, number> | null;
  /** Private notes. Deliberately absent from `ParticipantView`. */
  notes: { id: string; phaseId: string | null; decisionId: string | null; body: string; at: string }[];
  presenterCue: string;
  roster: { id: string; displayName: string; roleName: string }[];
  nextPhaseTitle: string | null;
  resultsVisible: boolean;
}

export function controlView(
  scenario: Scenario,
  state: SessionState,
  roster: { id: string; displayName: string; roleId: string }[],
): ControlView {
  const locale = scenario.defaultLocale;
  const base = participantView(scenario, state, '', null, roster.length);
  const ordered = [...scenario.phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const phase = ordered.find((p) => p.id === state.currentPhaseId) ?? null;
  const decision = phase?.decision ?? null;

  // The facilitator's copy is unfiltered: they need to know what every role is
  // looking at to run the room.
  const contents = phase
    ? [...phase.contents]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((content) => ({
          id: content.id,
          kind: content.kind,
          body: text(content.body, locale),
          mediaUrl: content.mediaId ? `/api/media/${content.mediaId}` : null,
        }))
    : [];

  const next = phase ? nextPhaseId(scenario, phase, null) : null;

  return {
    ...base,
    contents,
    liveTally: decision ? countVotes(decision, state.votes[decision.id] ?? {}).tally : null,
    notes: state.notes,
    presenterCue: phase ? text(phase.presenterCue, locale) : '',
    roster: roster.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      roleName: text(scenario.roles.find((r) => r.id === p.roleId)?.name, locale),
    })),
    nextPhaseTitle: next ? text(ordered.find((p) => p.id === next)?.title, locale) : null,
    resultsVisible: state.resultsVisible,
  };
}

export async function roster(sql: Sql, sessionId: string) {
  return sql<{ id: string; displayName: string; roleId: string }[]>`
    select id, display_name as "displayName", role_id as "roleId"
    from participants where session_id = ${sessionId} order by first_seen_at
  `;
}
