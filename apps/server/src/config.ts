import { z } from 'zod';

/**
 * Environment validation.
 *
 * The process refuses to start on a bad config rather than booting into a
 * broken state. Someone self-hosting this gets a clear error at `docker
 * compose up`, not a mystery at 9am with a room full of people.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  INSTANCE_NAME: z.string().min(1).default('Crisol'),
  DEFAULT_LOCALE: z.string().min(2).max(5).default('es'),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),

  SESSION_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters — generate one with: openssl rand -hex 32')
    .refine((v) => !v.includes('cambiame'), 'still set to the example value'),

  MEDIA_DIR: z.string().min(1).default('/data/media'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
  MAX_SCENARIO_MB: z.coerce.number().int().positive().default(2048),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid configuration. Check your .env file:\n${problems}`);
}
