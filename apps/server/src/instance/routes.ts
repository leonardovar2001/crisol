import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { requireUser } from '../auth/routes.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

const theme = z.object({
  baseColor: z.string().regex(HEX, 'Tiene que ser un color en formato #rrggbb'),
  accentColor: z.string().regex(HEX, 'Tiene que ser un color en formato #rrggbb'),
});

/** Relative luminance, per WCAG. Used to keep the base dark enough to build on. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function registerInstance(app: FastifyInstance, sql: Sql, config: Config) {
  /** Public: the login screen needs the colours before anyone has signed in. */
  app.get('/api/instance', async () => {
    const [row] = await sql<{ baseColor: string; accentColor: string }[]>`
      select base_color as "baseColor", accent_color as "accentColor"
      from instance_settings where id = true
    `;
    return {
      name: config.INSTANCE_NAME,
      defaultLocale: config.DEFAULT_LOCALE,
      theme: {
        baseColor: row?.baseColor ?? '#0f3040',
        accentColor: row?.accentColor ?? '#4fa8cc',
      },
    };
  });

  app.put('/api/instance/theme', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (user.role !== 'owner') {
      return reply.code(403).send({ error: 'Sólo quien administra la instancia puede cambiar esto' });
    }

    const parsed = theme.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Colores inválidos' });
    }

    // The whole palette is derived by lightening or darkening the base. If the
    // base is already light, the dark mode built from it has no contrast left.
    if (luminance(parsed.data.baseColor) > 0.35) {
      return reply.code(400).send({
        error: 'El color base tiene que ser oscuro: es el fondo del modo oscuro y la tinta del claro.',
      });
    }

    await sql`
      update instance_settings
      set base_color = ${parsed.data.baseColor},
          accent_color = ${parsed.data.accentColor},
          updated_at = now()
      where id = true
    `;
    return parsed.data;
  });
}
