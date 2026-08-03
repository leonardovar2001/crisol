import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { newId, newToken } from '../ids.js';
import { hashPassword, verifyPassword } from './passwords.js';

export const COOKIE = 'crisol_session';
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'author' | 'facilitator';
  locale: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
}

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Creates the owner account on an empty instance.
 *
 * Only ever runs when there are no users at all, so it cannot be used to slip
 * an extra account into a running instance by editing the environment.
 */
export async function bootstrapOwner(sql: Sql, config: Config, log: FastifyInstance['log']) {
  const [row] = await sql<{ count: string }[]>`select count(*)::text from users`;
  if (Number(row?.count ?? 0) > 0) return;

  if (!config.BOOTSTRAP_PASSWORD) {
    log.warn(
      'No hay usuarios y BOOTSTRAP_PASSWORD está vacío. Poné una contraseña en .env y reiniciá para crear el primer usuario.',
    );
    return;
  }

  await sql`
    insert into users (id, email, display_name, password_hash, role, locale)
    values (
      ${newId('usr')},
      ${config.BOOTSTRAP_EMAIL.toLowerCase()},
      ${'Owner'},
      ${await hashPassword(config.BOOTSTRAP_PASSWORD)},
      ${'owner'},
      ${config.DEFAULT_LOCALE}
    )
  `;
  log.info({ email: config.BOOTSTRAP_EMAIL }, 'primer usuario creado — cambiá la contraseña al entrar');
}

export function registerAuth(app: FastifyInstance, sql: Sql, config: Config) {
  const secure = config.PUBLIC_URL.startsWith('https://');

  app.decorateRequest('user', null);

  // Resolves the session on every request. Routes decide what to do about it.
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const token = request.cookies[COOKIE];
    if (!token) return;

    const [row] = await sql<CurrentUser[]>`
      select u.id, u.email, u.display_name as "displayName", u.role, u.locale
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token = ${token} and s.expires_at > now()
    `;
    request.user = row ?? null;
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Faltan datos' });

    const [user] = await sql<{ id: string; passwordHash: string }[]>`
      select id, password_hash as "passwordHash"
      from users where email = ${parsed.data.email.toLowerCase()}
    `;

    // Same response and roughly the same work either way, so the endpoint does
    // not reveal which addresses have accounts.
    const ok = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await verifyPassword(parsed.data.password, 'scrypt$32768$8$1$AAAA$AAAA');

    if (!user || !ok) return reply.code(401).send({ error: 'Correo o contraseña incorrectos' });

    const token = newToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await sql`
      insert into auth_sessions (token, user_id, expires_at)
      values (${token}, ${user.id}, ${expires})
    `;
    await sql`update users set last_login_at = now() where id = ${user.id}`;

    reply.setCookie(COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      expires,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE];
    if (token) await sql`delete from auth_sessions where token = ${token}`;
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'No hay sesión' });
    return request.user;
  });
}

/** Guard for routes that need a signed-in user. */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<CurrentUser | null> {
  if (!request.user) {
    await reply.code(401).send({ error: 'Necesitás iniciar sesión' });
    return null;
  }
  return request.user;
}
