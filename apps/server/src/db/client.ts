import postgres from 'postgres';
import type { Config } from '../config.js';

export type Sql = postgres.Sql;

export function connect(config: Config): Sql {
  // Timestamps come back as Date objects. Callers that need a string must call
  // toISOString() — Postgres's own text format ("2026-08-03 00:44:12+00") is not
  // ISO 8601 and quietly fails anything that validates for it.
  return postgres(config.DATABASE_URL, { max: 10, onnotice: () => {} });
}

/**
 * Waits for Postgres to accept connections.
 *
 * `docker compose up` starts both services at once and the database is not
 * ready the instant the port opens. Without this the first boot after an
 * install fails with a connection error that looks like a bug.
 */
export async function waitForDatabase(sql: Sql, attempts = 30): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
