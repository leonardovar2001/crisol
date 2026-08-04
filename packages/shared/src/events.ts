import { z } from 'zod';

/**
 * The session event log.
 *
 * Append-only, totally ordered per session. This is the source of truth for a
 * live run: current state is derived by folding these, and also materialised
 * on the session row for speed.
 *
 * It is what gives us, from one mechanism:
 *   - participant reconnection (replay to catch up)
 *   - recovery when the facilitator's browser dies (state was never in the tab)
 *   - the after-action report (it *is* the report)
 *   - an audit trail of who decided what, and when
 *
 * Events are facts about the past. Never edit one, never delete one.
 */

const id = z.string().min(1).max(64);

const base = z.object({
  seq: z.number().int().positive(),
  at: z.string().datetime(),
  /** Who caused it. `system` covers timers and anything automatic. */
  actor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), userId: id }),
    z.object({ kind: z.literal('participant'), participantId: id }),
    z.object({ kind: z.literal('system') }),
  ]),
});

export const sessionEventSchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('session_started'), phaseId: id }),
  base.extend({ kind: z.literal('session_paused') }),
  base.extend({ kind: z.literal('session_resumed'), remainingSeconds: z.number().int().nonnegative().nullable() }),
  base.extend({ kind: z.literal('session_ended') }),

  /** `durationSeconds` is null for an untimed phase. */
  base.extend({ kind: z.literal('phase_started'), phaseId: id, durationSeconds: z.number().int().positive().nullable() }),
  base.extend({ kind: z.literal('phase_ended'), phaseId: id }),
  base.extend({ kind: z.literal('timer_adjusted'), remainingSeconds: z.number().int().nonnegative() }),

  base.extend({ kind: z.literal('participant_joined'), participantId: id, displayName: z.string(), roleId: id }),
  base.extend({ kind: z.literal('participant_left'), participantId: id }),

  base.extend({ kind: z.literal('answers_opened'), decisionId: id }),
  base.extend({ kind: z.literal('answers_closed'), decisionId: id }),
  base.extend({ kind: z.literal('vote_cast'), decisionId: id, participantId: id, optionId: id }),
  base.extend({ kind: z.literal('results_revealed'), decisionId: id }),

  /** The mesa's vote carried. */
  base.extend({
    kind: z.literal('decision_resolved'),
    decisionId: id,
    optionId: id,
    tally: z.record(z.string(), z.number().int().nonnegative()),
    resolvedBy: z.enum(['vote', 'tie_break']),
  }),

  /**
   * A note taken while running the exercise, or afterwards during the debrief.
   *
   * This is where the value of a session that nobody wrote down goes to die:
   * the table argues its way to something better than any of the options, and
   * ten minutes later nobody remembers it. Notes are private to whoever runs
   * the exercise — never sent to participants or to the projected screen.
   */
  base.extend({
    kind: z.literal('note_added'),
    noteId: id,
    /** `null` for a note written after the exercise ended. */
    phaseId: id.nullable(),
    /** Set when the note is about a specific decision. */
    decisionId: id.nullable(),
    body: z.string().min(1).max(4000),
  }),

  /** Notes are never edited in place; removing one is its own fact. */
  base.extend({ kind: z.literal('note_removed'), noteId: id }),

  /**
   * The facilitator overrode the vote.
   *
   * Recorded separately and on purpose: the report must be able to say "this
   * decision did not come from the table, and here is what the table actually
   * chose". That is useful debrief material, not something to hide.
   */
  base.extend({
    kind: z.literal('facilitator_override'),
    decisionId: id,
    optionId: id,
    wouldHaveWonOptionId: id.nullable(),
    tally: z.record(z.string(), z.number().int().nonnegative()),
    reason: z.string().max(500).optional(),
  }),
]);

export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type SessionEventKind = SessionEvent['kind'];
