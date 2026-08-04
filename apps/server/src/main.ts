import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { bootstrapOwner, registerAuth } from './auth/routes.js';
import { loadConfig } from './config.js';
import { connect, waitForDatabase } from './db/client.js';
import { migrate } from './db/migrate.js';
import { registerInstance } from './instance/routes.js';
import { registerMedia } from './media/routes.js';
import { registerScenarios } from './scenarios/routes.js';
import { registerLive } from './sessions/live.js';
import { registerSessions } from './sessions/routes.js';

const config = loadConfig();

const app = Fastify({
  logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
  bodyLimit: 8 * 1024 * 1024, // scenario documents, not files
});

await app.register(cookie, { secret: config.SESSION_SECRET });
await app.register(multipart, {
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

await mkdir(config.MEDIA_DIR, { recursive: true });

const sql = connect(config);
app.log.info('esperando a la base de datos…');
await waitForDatabase(sql);

const { applied, alreadyApplied } = await migrate(sql);
app.log.info(
  { aplicadas: applied, yaEstaban: alreadyApplied },
  applied.length > 0 ? 'migraciones aplicadas' : 'base de datos al día',
);

await bootstrapOwner(sql, config, app.log);

app.get('/healthz', async () => {
  await sql`select 1`;
  return { status: 'ok' };
});

registerInstance(app, sql, config);
registerAuth(app, sql, config);
registerScenarios(app, sql, config);
registerMedia(app, sql, config);
registerSessions(app, sql);
registerLive(app, sql, config);

// The built SPA ships inside the same image; there is no separate web server
// to run. In development Vite serves it instead and proxies /api here.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html'); // client-side routing
  });
}

const close = async (signal: string) => {
  app.log.info({ signal }, 'cerrando');
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
