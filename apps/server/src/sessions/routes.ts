import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Sql } from '../db/client.js';
import { newId, newToken } from '../ids.js';
import { requireUser } from '../auth/routes.js';
import { append, createSession, findByJoinCode, loadEvents, loadSession, roster } from './service.js';
import { buildReport } from './report.js';

const joinBody = z.object({
  joinCode: z.string().regex(/^\d{6}$/),
  displayName: z.string().trim().min(1).max(40),
  roleCode: z.string().trim().max(40).optional(),
});

export function registerSessions(app: FastifyInstance, sql: Sql) {
  app.post('/api/scenarios/:id/sessions', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };

    const created = await createSession(sql, id, user.id);
    if (!created) return reply.code(404).send({ error: 'No existe ese escenario' });
    return reply.code(201).send(created);
  });

  app.get('/api/sessions', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    return sql`
      select s.id, s.join_code as "joinCode", s.status, s.created_at as "createdAt",
             s.document -> 'title' ->> (s.document ->> 'defaultLocale') as title,
             (select count(*) from participants p where p.session_id = s.id) as participants
      from sessions s
      order by s.created_at desc
      limit 50
    `;
  });

  app.get('/api/sessions/:id', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };
    const session = await loadSession(sql, id);
    if (!session) return reply.code(404).send({ error: 'No existe esa sesión' });

    const codes = await sql<{ roleId: string; accessCode: string }[]>`
      select role_id as "roleId", access_code as "accessCode"
      from session_role_access where session_id = ${id}
    `;
    return {
      id: session.id,
      joinCode: session.joinCode,
      status: session.status,
      title: session.document.title[session.document.defaultLocale] ?? session.document.slug,
      roles: session.document.roles.map((role) => ({
        id: role.id,
        name: role.name[session.document.defaultLocale] ?? role.key,
        isGeneral: role.isGeneral,
        accessCode: codes.find((c) => c.roleId === role.id)?.accessCode ?? null,
      })),
    };
  });

  app.get('/api/sessions/:id/report', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };

    const session = await loadSession(sql, id);
    if (!session) return reply.code(404).send({ error: 'No existe esa sesión' });

    return buildReport(session.document, await loadEvents(sql, id), await roster(sql, id));
  });

  /**
   * Notes written from the report, after the exercise.
   *
   * The live control adds notes over its socket; this is for the debrief, when
   * there is no session running to broadcast to.
   */
  app.post('/api/sessions/:id/notes', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };

    const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'La nota está vacía' });
    if (!(await loadSession(sql, id))) return reply.code(404).send({ error: 'No existe esa sesión' });

    const noteId = newId('nota');
    await append(sql, id, {
      kind: 'note_added',
      actor: { kind: 'user', userId: user.id },
      noteId,
      phaseId: null,
      decisionId: null,
      body: parsed.data.body,
    });
    return reply.code(201).send({ noteId });
  });

  app.delete('/api/sessions/:id/notes/:noteId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, noteId } = request.params as { id: string; noteId: string };
    if (!(await loadSession(sql, id))) return reply.code(404).send({ error: 'No existe esa sesión' });

    await append(sql, id, {
      kind: 'note_removed',
      actor: { kind: 'user', userId: user.id },
      noteId,
    });
    return reply.code(204).send();
  });

  /** Anonymous entry. No account, no password — a room code and a name. */
  app.post('/api/sessions/join', async (request, reply) => {
    const parsed = joinBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Faltan datos para entrar' });

    const session = await findByJoinCode(sql, parsed.data.joinCode);
    if (!session) return reply.code(404).send({ error: 'No hay ninguna sesión con ese código' });

    const general = session.document.roles.find((role) => role.isGeneral);
    let roleId = general?.id ?? session.document.roles[0]?.id;

    if (parsed.data.roleCode) {
      const [match] = await sql<{ roleId: string }[]>`
        select role_id as "roleId" from session_role_access
        where session_id = ${session.id} and access_code = ${parsed.data.roleCode}
      `;
      if (!match) return reply.code(403).send({ error: 'Ese código de rol no es válido' });
      roleId = match.roleId;
    }
    if (!roleId) return reply.code(500).send({ error: 'El escenario no tiene roles' });

    const id = newId('par');
    const rejoinToken = newToken();
    await sql`
      insert into participants (id, session_id, display_name, role_id, rejoin_token)
      values (${id}, ${session.id}, ${parsed.data.displayName}, ${roleId}, ${rejoinToken})
    `;

    return reply.code(201).send({
      sessionId: session.id,
      participantId: id,
      rejoinToken,
      roleId,
      roleName:
        session.document.roles.find((r) => r.id === roleId)?.name[session.document.defaultLocale] ??
        '',
    });
  });

  /**
   * Coming back after a locked phone, a dropped connection or a closed tab.
   * The token is the seat: same participant, same role, same vote.
   */
  app.post('/api/sessions/rejoin', async (request, reply) => {
    const token = z.object({ rejoinToken: z.string().min(1) }).safeParse(request.body);
    if (!token.success) return reply.code(400).send({ error: 'Falta el token' });

    const [row] = await sql<{ id: string; sessionId: string; roleId: string; displayName: string }[]>`
      select p.id, p.session_id as "sessionId", p.role_id as "roleId", p.display_name as "displayName"
      from participants p
      join sessions s on s.id = p.session_id
      where p.rejoin_token = ${token.data.rejoinToken} and s.status <> 'ended'
    `;
    if (!row) return reply.code(404).send({ error: 'Esa sesión ya no está abierta' });

    await sql`update participants set last_seen_at = now() where id = ${row.id}`;
    return { sessionId: row.sessionId, participantId: row.id, roleId: row.roleId, displayName: row.displayName };
  });
}
