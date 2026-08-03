import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Sql } from './client.js';

/**
 * Applies `migrations/*.sql` in filename order, once each, inside a transaction.
 *
 * Runs automatically at boot: someone self-hosting should never have to know a
 * migration command exists. Plain `.sql` files on purpose — anyone can read
 * exactly what will happen to their database before pulling a new version.
 */

const dir = fileURLToPath(new URL('../../migrations', import.meta.url));

export interface MigrationResult {
  applied: string[];
  alreadyApplied: number;
}

export async function migrate(sql: Sql): Promise<MigrationResult> {
  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const done = new Set(
    (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const statements = await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(statements);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }

  return { applied, alreadyApplied: done.size };
}
