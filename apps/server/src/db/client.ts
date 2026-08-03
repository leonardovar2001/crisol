import postgres from 'postgres';
import type { Config } from '../config.js';

export type Sql = postgres.Sql;

export function connect(config: Config): Sql {
  return postgres(config.DATABASE_URL, {
    max: 10,
    // Timestamps come back as ISO strings; the engine treats them as opaque.
    types: {
      date: {
        to: 1184,
        from: [1082, 1083, 1114, 1184],
        serialize: (value: Date | string) =>
          value instanceof Date ? value.toISOString() : value,
        parse: (value: string) => value,
      },
    },
    onnotice: () => {},
  });
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
