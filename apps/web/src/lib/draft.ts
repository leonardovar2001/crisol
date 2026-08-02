import type { Localized, Scenario } from '@crisol/shared';
import { SCHEMA_VERSION } from '@crisol/shared';

/**
 * Authoring-side helpers.
 *
 * A draft is shaped exactly like a `Scenario` so that validating it is a
 * single `scenarioSchema.safeParse`. It may well be invalid while it is being
 * written — that is the editor's job to surface, not to prevent.
 */

export type Draft = Scenario;
export type Phase = Draft['phases'][number];
export type Role = Draft['roles'][number];
export type Content = Phase['contents'][number];
export type Decision = NonNullable<Phase['decision']>;
export type DecisionOption = Decision['options'][number];

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newId(prefix: string): string {
  let suffix = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `${prefix}_${suffix}`;
}

// ── Localised text ───────────────────────────────────────────────────────────
// The editor writes one locale at a time. Other locales are preserved untouched
// so that translating a scenario never destroys work.

export function readText(value: Localized | undefined, locale: string): string {
  return value?.[locale] ?? '';
}

export function writeText(
  value: Localized | undefined,
  locale: string,
  next: string,
): Localized {
  return { ...(value ?? {}), [locale]: next };
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ── Factories ────────────────────────────────────────────────────────────────

export function createDraft(title: string, locale = 'es'): Draft {
  return {
    schemaVersion: SCHEMA_VERSION,
    slug: slugify(title) || 'escenario',
    title: { [locale]: title },
    defaultLocale: locale,
    roles: [createRole('Participante', locale, true, 0)],
    phases: [createPhase('Apertura', locale, 0)],
    charts: [],
    media: [],
  };
}

export function createRole(name: string, locale: string, isGeneral: boolean, order: number): Role {
  return {
    id: newId('rol'),
    key: slugify(name).replace(/-/g, '_') || `rol_${order}`,
    name: { [locale]: name },
    isGeneral,
    sortOrder: order,
  };
}

export function createPhase(title: string, locale: string, order: number): Phase {
  return {
    id: newId('fase'),
    sortOrder: order,
    title: { [locale]: title },
    kind: 'briefing',
    durationSeconds: 600,
    nextPhaseId: null,
    contents: [],
    visibleCharts: [],
    decision: null,
  };
}

export function createContent(order: number): Content {
  return {
    id: newId('cont'),
    roleId: null,
    kind: 'text',
    body: {},
    mediaId: null,
    sortOrder: order,
  };
}

export function createDecision(locale: string): Decision {
  return {
    id: newId('dec'),
    prompt: { [locale]: '¿Qué hacemos?' },
    tieBreaker: 'presenter',
    resultsReveal: 'on_presenter_command',
    options: [createOption(locale, 0), createOption(locale, 1)],
  };
}

export function createOption(locale: string, order: number): DecisionOption {
  return {
    id: newId('op'),
    label: { [locale]: `Opción ${order + 1}` },
    sortOrder: order,
    nextPhaseId: null,
  };
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/** Reorders in place by index and renumbers `sortOrder` so it stays contiguous. */
export function move<T extends { sortOrder: number }>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return items;
  next.splice(to, 0, moved);
  return next.map((item, i) => ({ ...item, sortOrder: i }));
}

export function sorted<T extends { sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Duration ─────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'sin límite';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}
