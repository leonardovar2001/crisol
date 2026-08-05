import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { scenarioSchema, type Scenario } from '@crisol/shared';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { newId } from '../ids.js';
import { requireUser } from '../auth/routes.js';

interface Row {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  document: Scenario;
  updatedAt: string;
  createdAt: string;
}

function titleOf(document: Scenario): string {
  return document.title[document.defaultLocale] ?? document.slug;
}

/**
 * Ensures the slug is unique by suffixing `-2`, `-3`… rather than rejecting.
 * Importing the same scenario twice is a normal thing to want; failing on it
 * would just make people rename by hand.
 */
async function uniqueSlug(sql: Sql, wanted: string, exceptId?: string): Promise<string> {
  const taken = await sql<{ slug: string }[]>`
    select slug from scenarios
    where slug = ${wanted} or slug like ${`${wanted}-%`}
    ${exceptId ? sql`and id <> ${exceptId}` : sql``}
  `;
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(wanted)) return wanted;
  for (let n = 2; ; n += 1) {
    const candidate = `${wanted}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function registerScenarios(app: FastifyInstance, sql: Sql, config: Config) {
  app.get('/api/scenarios', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const rows = await sql<
      { id: string; slug: string; title: string; status: string; phases: number; updatedAt: string }[]
    >`
      select id, slug, title, status,
             jsonb_array_length(document -> 'phases') as phases,
             updated_at as "updatedAt"
      from scenarios
      order by updated_at desc
    `;
    return rows;
  });

  app.get('/api/scenarios/:id', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };
    const [row] = await sql<Row[]>`
      select id, slug, title, status, document, updated_at as "updatedAt"
      from scenarios where id = ${id}
    `;
    if (!row) return reply.code(404).send({ error: 'No existe ese escenario' });
    return row;
  });

  app.post('/api/scenarios', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = scenarioSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'El escenario no es válido', issues: parsed.error.issues });
    }

    const document = { ...parsed.data, slug: await uniqueSlug(sql, parsed.data.slug) };
    const id = newId('esc');
    await sql`
      insert into scenarios (id, slug, title, schema_version, document, created_by)
      values (${id}, ${document.slug}, ${titleOf(document)}, ${document.schemaVersion},
              ${sql.json(document)}, ${user.id})
    `;
    return reply.code(201).send({ id, slug: document.slug });
  });

  app.put('/api/scenarios/:id', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };

    const parsed = scenarioSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'El escenario no es válido', issues: parsed.error.issues });
    }

    const document = { ...parsed.data, slug: await uniqueSlug(sql, parsed.data.slug, id) };
    const updated = await sql`
      update scenarios
      set slug = ${document.slug}, title = ${titleOf(document)},
          schema_version = ${document.schemaVersion}, document = ${sql.json(document)},
          updated_at = now()
      where id = ${id}
      returning id
    `;
    if (updated.length === 0) return reply.code(404).send({ error: 'No existe ese escenario' });
    return { id, slug: document.slug };
  });

  app.delete('/api/scenarios/:id', async (request, reply) => {
    if (!(await requireUser(request, reply))) return;
    const { id } = request.params as { id: string };

    const deleted = await sql`delete from scenarios where id = ${id} returning id`;
    if (deleted.length === 0) return reply.code(404).send({ error: 'No existe ese escenario' });

    // The database cascade drops the media rows; the bytes are ours to clean up.
    // Without this, every deleted scenario leaves files nothing references and
    // nobody can find — a slow disk leak on somebody else's server.
    await rm(join(config.MEDIA_DIR, id), { recursive: true, force: true }).catch((error) => {
      request.log.error({ err: error, id }, 'no se pudieron borrar los archivos del escenario');
    });

    return reply.code(204).send();
  });
}
