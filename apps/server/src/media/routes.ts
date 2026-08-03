import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { newId } from '../ids.js';
import { requireUser } from '../auth/routes.js';

/** What an author is allowed to upload. Anything else is rejected by type. */
const ALLOWED = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/svg+xml', '.svg'],
  ['audio/mpeg', '.mp3'],
  ['audio/ogg', '.ogg'],
  ['audio/wav', '.wav'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['application/pdf', '.pdf'],
]);

export function registerMedia(app: FastifyInstance, sql: Sql, config: Config) {
  app.post('/api/scenarios/:scenarioId/media', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { scenarioId } = request.params as { scenarioId: string };

    const [scenario] = await sql<{ id: string }[]>`
      select id from scenarios where id = ${scenarioId}
    `;
    if (!scenario) return reply.code(404).send({ error: 'No existe ese escenario' });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'No llegó ningún archivo' });

    const extension = ALLOWED.get(file.mimetype);
    if (!extension) {
      return reply.code(415).send({
        error: `No se admite ${file.mimetype}. Imágenes, audio, video o PDF.`,
      });
    }

    const bytes = await file.toBuffer();
    if (file.file.truncated) {
      return reply.code(413).send({
        error: `El archivo pasa el límite de ${config.MAX_UPLOAD_MB} MB por archivo.`,
      });
    }

    // Per-scenario budget: one author with long videos should not fill the disk
    // of whoever is hosting the instance.
    const [usage] = await sql<{ used: string }[]>`
      select coalesce(sum(size_bytes), 0)::text as used
      from media_assets where scenario_id = ${scenarioId}
    `;
    const budget = config.MAX_SCENARIO_MB * 1024 * 1024;
    if (Number(usage?.used ?? 0) + bytes.byteLength > budget) {
      return reply.code(413).send({
        error: `Este escenario llegó al límite de ${config.MAX_SCENARIO_MB} MB en total.`,
      });
    }

    const id = newId('med');
    const key = join(scenarioId, `${id}${extension}`);
    await mkdir(join(config.MEDIA_DIR, scenarioId), { recursive: true });
    await writeFile(join(config.MEDIA_DIR, key), bytes);

    const asset = {
      id,
      filename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };

    await sql`
      insert into media_assets (id, scenario_id, filename, mime_type, size_bytes, sha256, storage_key)
      values (${id}, ${scenarioId}, ${asset.filename}, ${asset.mimeType}, ${asset.sizeBytes},
              ${asset.sha256}, ${key})
    `;

    return reply.code(201).send({ ...asset, url: `/api/media/${id}` });
  });

  /**
   * Serving is open by opaque id, deliberately: during a live session the people
   * looking at an image are anonymous participants with no account. The id is
   * unguessable and the scenario document itself stays behind authentication.
   */
  app.get('/api/media/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [asset] = await sql<{ mimeType: string; storageKey: string; filename: string }[]>`
      select mime_type as "mimeType", storage_key as "storageKey", filename
      from media_assets where id = ${id}
    `;
    if (!asset) return reply.code(404).send({ error: 'No existe' });

    const path = join(config.MEDIA_DIR, asset.storageKey);
    try {
      await stat(path);
    } catch {
      request.log.error({ id, path }, 'media row without a file on disk');
      return reply.code(404).send({ error: 'No existe' });
    }

    // SVG can carry script; never let one run against our own origin.
    const inline = asset.mimeType !== 'image/svg+xml';
    return reply
      .type(asset.mimeType)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(asset.filename)}"`,
      )
      .send(createReadStream(path));
  });

  app.delete('/api/media/:id', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };
    const [asset] = await sql<{ storageKey: string }[]>`
      select storage_key as "storageKey" from media_assets where id = ${id}
    `;
    if (!asset) return reply.code(404).send({ error: 'No existe' });

    await sql`delete from media_assets where id = ${id}`;
    await rm(join(config.MEDIA_DIR, asset.storageKey), { force: true });
    return reply.code(204).send();
  });

  app.get('/api/scenarios/:scenarioId/media', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { scenarioId } = request.params as { scenarioId: string };
    return sql`
      select id, filename, mime_type as "mimeType", size_bytes as "sizeBytes", sha256,
             '/api/media/' || id as url
      from media_assets where scenario_id = ${scenarioId}
      order by created_at desc
    `;
  });

  app.get('/api/scenarios/:scenarioId/media/usage', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { scenarioId } = request.params as { scenarioId: string };
    const [row] = await sql<{ used: string }[]>`
      select coalesce(sum(size_bytes), 0)::text as used
      from media_assets where scenario_id = ${scenarioId}
    `;
    return {
      usedBytes: Number(row?.used ?? 0),
      budgetBytes: config.MAX_SCENARIO_MB * 1024 * 1024,
      maxFileBytes: config.MAX_UPLOAD_MB * 1024 * 1024,
    };
  });
}
