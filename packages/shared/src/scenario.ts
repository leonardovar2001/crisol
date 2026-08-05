import { z } from 'zod';

/**
 * The portable scenario format.
 *
 * This is what `scenario.json` inside an exported `.zip` contains. It is the
 * contract between instances: anything that can be authored must be
 * expressible here, or it cannot be shared — and sharing scenarios is the
 * point of the project.
 *
 * Adding a field is a minor bump. Removing or repurposing one is a major bump
 * and needs a migration in the importer.
 */
export const SCHEMA_VERSION = 1;

/** Text in every locale the scenario ships. Keyed by BCP-47 tag: `es`, `en`, `pt-BR`. */
const localized = z.record(z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/), z.string());
export type Localized = z.infer<typeof localized>;

const id = z.string().min(1).max(64);

// ── Roles ────────────────────────────────────────────────────────────────────
// A role is a point of view. It decides what each participant gets to see,
// which is what makes the exercise interesting.

export const roleSchema = z.object({
  id,
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: localized,
  description: localized.optional(),
  /** The role assigned to anyone who joins with just the room code. Exactly one. */
  isGeneral: z.boolean().default(false),
  /**
   * How many people this role holds. `null` is unlimited.
   *
   * A role code is a bearer token: whoever has it gets the role. Without a
   * limit, one leaked link turns every curious participant into Legales and the
   * information asymmetry — the whole point of the exercise — quietly collapses.
   */
  capacity: z.number().int().positive().max(10000).nullable().default(null),
  sortOrder: z.number().int().nonnegative(),
});

// ── Content ──────────────────────────────────────────────────────────────────

export const contentSchema = z.object({
  id,
  /** `null` means every role sees it. */
  roleId: id.nullable().default(null),
  kind: z.enum(['text', 'image', 'audio', 'video', 'file']),
  /** Used by `text`, and as caption/alt text for the media kinds. */
  body: localized.optional(),
  mediaId: id.nullable().default(null),
  sortOrder: z.number().int().nonnegative(),
});

// ── Decisions ────────────────────────────────────────────────────────────────

export const decisionOptionSchema = z.object({
  id,
  label: localized,
  description: localized.optional(),
  sortOrder: z.number().int().nonnegative(),
  /**
   * Branching. `null` follows the phase's default path.
   *
   * This single field is what makes a scenario linear or branching: never set
   * it and the exercise runs straight through; set it on one option and it
   * forks there. There is no "mode" to choose up front.
   */
  nextPhaseId: id.nullable().default(null),
});

export const decisionSchema = z.object({
  id,
  prompt: localized,
  options: z.array(decisionOptionSchema).min(2),
  /** Who breaks a tie. The presenter decides, or the first listed option wins. */
  tieBreaker: z.enum(['presenter', 'first_listed']).default('presenter'),
  /** Whether votes appear as they come in, or only when the presenter reveals them. */
  resultsReveal: z.enum(['live', 'on_presenter_command']).default('on_presenter_command'),
});

// ── Charts ───────────────────────────────────────────────────────────────────
// Deliberately small: a handful of values that move. No formulas, no chained
// conditions, no global variables. If a scenario needs more than this, the
// problem is the scenario.

export const chartEffectSchema = z.object({
  id,
  trigger: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('on_phase_enter'), phaseId: id }),
    z.object({ kind: z.literal('on_option_chosen'), optionId: id }),
  ]),
  /** Which series, and which point within it. `null` targets the whole series. */
  targetSeries: z.string().min(1),
  targetPoint: z.union([z.number().int().nonnegative(), z.null()]).default(null),
  operation: z.enum(['set', 'add', 'subtract', 'percent_change']),
  value: z.number(),
});

export const chartSchema = z.object({
  id,
  key: z.string().regex(/^[a-z0-9_]+$/),
  title: localized,
  kind: z.enum(['line', 'bar', 'pie', 'stat', 'gauge']),
  unit: z.string().max(16).optional(),
  /** Starting values, before any effect has fired. */
  initialSeries: z.record(z.string(), z.array(z.number())),
  effects: z.array(chartEffectSchema).default([]),
});

// ── Phases ───────────────────────────────────────────────────────────────────

export const phaseSchema = z.object({
  id,
  sortOrder: z.number().int().nonnegative(),
  title: localized,
  kind: z.enum(['briefing', 'inject', 'dashboard', 'decision', 'debrief']),
  /**
   * `null` means no time limit: the phase advances when whoever is running the
   * session says so.
   *
   * A countdown makes sense for a crisis exercise and is wrong for, say, a
   * classroom working through a branching problem at its own pace. The core
   * cannot assume urgency — that belongs to the scenario.
   */
  durationSeconds: z.number().int().positive().max(24 * 60 * 60).nullable(),
  /** The default path out of this phase. `null` means "the next one by order". */
  nextPhaseId: id.nullable().default(null),
  /** The facilitator's script. Never shown to participants or on the projected screen. */
  presenterCue: localized.optional(),
  contents: z.array(contentSchema).default([]),
  /** Chart keys visible during this phase. */
  visibleCharts: z.array(z.string()).default([]),
  decision: decisionSchema.nullable().default(null),
});

// ── Scenario ─────────────────────────────────────────────────────────────────

export const mediaRefSchema = z.object({
  id,
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
});

export const scenarioSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: localized,
    description: localized.optional(),
    defaultLocale: z.string().min(2).max(5),
    roles: z.array(roleSchema).min(1),
    phases: z.array(phaseSchema).min(1),
    charts: z.array(chartSchema).default([]),
    media: z.array(mediaRefSchema).default([]),
  })
  .superRefine((scenario, ctx) => {
    const generals = scenario.roles.filter((r) => r.isGeneral);
    if (generals.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles'],
        message: `exactly one role must be marked isGeneral, found ${generals.length}`,
      });
    }

    const phaseIds = new Set(scenario.phases.map((p) => p.id));
    const chartKeys = new Set(scenario.charts.map((c) => c.key));

    const reportDangling = (target: string | null, path: (string | number)[]) => {
      if (target !== null && !phaseIds.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `points at unknown phase "${target}"`,
        });
      }
    };

    scenario.phases.forEach((phase, i) => {
      reportDangling(phase.nextPhaseId, ['phases', i, 'nextPhaseId']);
      phase.decision?.options.forEach((option, j) => {
        reportDangling(option.nextPhaseId, ['phases', i, 'decision', 'options', j, 'nextPhaseId']);
      });
      phase.visibleCharts.forEach((key, j) => {
        if (!chartKeys.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['phases', i, 'visibleCharts', j],
            message: `unknown chart "${key}"`,
          });
        }
      });
    });
  });

export type Scenario = z.infer<typeof scenarioSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type DecisionOption = z.infer<typeof decisionOptionSchema>;
export type Chart = z.infer<typeof chartSchema>;
export type ChartEffect = z.infer<typeof chartEffectSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Content = z.infer<typeof contentSchema>;
