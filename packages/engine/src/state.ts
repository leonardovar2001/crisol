import type {
  Chart,
  ChartEffect,
  Decision,
  Phase,
  Scenario,
  SessionEvent,
} from '@crisol/shared';

/**
 * The pure session engine.
 *
 * `(scenario, events) -> state`. Nothing in this package may import a network
 * client, a database driver, or anything that touches a clock it does not own.
 * That constraint is what lets the same engine serve the live facilitated mode
 * today and a self-guided mode later, without a rewrite.
 */

export interface ResolvedDecision {
  decisionId: string;
  optionId: string;
  tally: Record<string, number>;
  /** How we got here. `override` means the facilitator chose against the vote. */
  resolvedBy: 'vote' | 'tie_break' | 'override';
  /** Only set on an override: what the table had actually chosen. */
  wouldHaveWonOptionId: string | null;
}

export interface ParticipantState {
  id: string;
  displayName: string;
  roleId: string;
  present: boolean;
}

/** Chart values keyed by chart key, then series name. */
export type ChartState = Record<string, Record<string, number[]>>;

export interface SessionState {
  status: 'draft' | 'live' | 'paused' | 'ended';
  currentPhaseId: string | null;
  /** ISO timestamp of the last `phase_started` / `session_resumed`. */
  runningSince: string | null;
  /** `null` while an untimed phase is running — there is no countdown to show. */
  remainingSeconds: number | null;
  answersOpen: boolean;
  resultsVisible: boolean;
  participants: Record<string, ParticipantState>;
  /** decisionId -> participantId -> optionId. A participant has at most one live vote. */
  votes: Record<string, Record<string, string>>;
  resolved: Record<string, ResolvedDecision>;
  charts: ChartState;
  /** Every phase entered, in order. With branching this is not the authored order. */
  path: string[];
}

export function initialState(scenario: Scenario): SessionState {
  return {
    status: 'draft',
    currentPhaseId: null,
    runningSince: null,
    remainingSeconds: null,
    answersOpen: false,
    resultsVisible: false,
    participants: {},
    votes: {},
    resolved: {},
    charts: Object.fromEntries(
      scenario.charts.map((c) => [c.key, structuredClone(c.initialSeries)]),
    ),
    path: [],
  };
}

// ── Chart effects ────────────────────────────────────────────────────────────

function applyOperation(current: number, effect: ChartEffect): number {
  switch (effect.operation) {
    case 'set':
      return effect.value;
    case 'add':
      return current + effect.value;
    case 'subtract':
      return current - effect.value;
    case 'percent_change':
      return current * (1 + effect.value / 100);
  }
}

function applyEffect(charts: ChartState, chart: Chart, effect: ChartEffect): void {
  const series = charts[chart.key]?.[effect.targetSeries];
  if (!series) return; // authored against a series that no longer exists

  if (effect.targetPoint === null) {
    for (let i = 0; i < series.length; i += 1) {
      series[i] = applyOperation(series[i] ?? 0, effect);
    }
    return;
  }

  const point = series[effect.targetPoint];
  if (point === undefined) return;
  series[effect.targetPoint] = applyOperation(point, effect);
}

function fireEffects(
  scenario: Scenario,
  charts: ChartState,
  matches: (effect: ChartEffect) => boolean,
): void {
  for (const chart of scenario.charts) {
    for (const effect of chart.effects) {
      if (matches(effect)) applyEffect(charts, chart, effect);
    }
  }
}

// ── Voting ───────────────────────────────────────────────────────────────────

export function tally(votes: Record<string, string>, decision: Decision): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    decision.options.map((o) => [o.id, 0]),
  );
  for (const optionId of Object.values(votes)) {
    const current = counts[optionId];
    // Votes for options that no longer exist are dropped, not counted.
    if (current !== undefined) counts[optionId] = current + 1;
  }
  return counts;
}

export interface VoteOutcome {
  tally: Record<string, number>;
  /** `null` when there is a tie the engine will not break on its own. */
  winnerId: string | null;
  tied: string[];
}

/**
 * Every participant's vote weighs the same. In the real world it does not —
 * that is the point of the exercise, and arguing about it is part of the debrief.
 */
export function countVotes(decision: Decision, votes: Record<string, string>): VoteOutcome {
  const counts = tally(votes, decision);
  const top = Math.max(...Object.values(counts));

  // No votes at all is a tie between every option, not a win for the first one.
  const tied = decision.options.filter((o) => counts[o.id] === top).map((o) => o.id);

  if (tied.length === 1) return { tally: counts, winnerId: tied[0] ?? null, tied: [] };
  if (decision.tieBreaker === 'first_listed') {
    const first = [...decision.options].sort((a, b) => a.sortOrder - b.sortOrder)
      .find((o) => tied.includes(o.id));
    return { tally: counts, winnerId: first?.id ?? null, tied };
  }
  // 'presenter': the engine reports the tie and waits for a human.
  return { tally: counts, winnerId: null, tied };
}

// ── Branching ────────────────────────────────────────────────────────────────

/**
 * Where the exercise goes after `phase`.
 *
 * Precedence: the chosen option's override, then the phase's default, then the
 * next phase by authored order. A scenario that never sets an override runs
 * linear; one that sets it anywhere branches there. Same model either way.
 */
export function nextPhaseId(
  scenario: Scenario,
  phase: Phase,
  chosenOptionId: string | null,
): string | null {
  if (chosenOptionId !== null && phase.decision) {
    const option = phase.decision.options.find((o) => o.id === chosenOptionId);
    if (option?.nextPhaseId) return option.nextPhaseId;
  }
  if (phase.nextPhaseId) return phase.nextPhaseId;

  const ordered = [...scenario.phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((p) => p.id === phase.id);
  return ordered[index + 1]?.id ?? null;
}

// ── Reducer ──────────────────────────────────────────────────────────────────

export function applyEvent(
  scenario: Scenario,
  state: SessionState,
  event: SessionEvent,
): SessionState {
  const next: SessionState = {
    ...state,
    participants: { ...state.participants },
    votes: { ...state.votes },
    resolved: { ...state.resolved },
    charts: structuredClone(state.charts),
    path: [...state.path],
  };

  switch (event.kind) {
    case 'session_started':
      next.status = 'live';
      break;

    case 'session_paused':
      next.status = 'paused';
      next.runningSince = null;
      break;

    case 'session_resumed':
      next.status = 'live';
      next.runningSince = event.at;
      next.remainingSeconds = event.remainingSeconds;
      break;

    case 'session_ended':
      next.status = 'ended';
      next.runningSince = null;
      break;

    case 'phase_started': {
      next.currentPhaseId = event.phaseId;
      next.runningSince = event.at;
      next.remainingSeconds = event.durationSeconds;
      next.answersOpen = false;
      next.resultsVisible = false;
      next.path.push(event.phaseId);
      fireEffects(scenario, next.charts, (e) =>
        e.trigger.kind === 'on_phase_enter' && e.trigger.phaseId === event.phaseId);
      break;
    }

    case 'phase_ended':
      next.answersOpen = false;
      break;

    case 'timer_adjusted':
      next.remainingSeconds = event.remainingSeconds;
      // The clock has to restart from now. Without this the clients keep
      // measuring elapsed time from the old start, so adding two minutes to a
      // phase that has been running for five gives back nothing.
      if (next.status === 'live') next.runningSince = event.at;
      break;

    case 'participant_joined':
      next.participants[event.participantId] = {
        id: event.participantId,
        displayName: event.displayName,
        roleId: event.roleId,
        present: true,
      };
      break;

    case 'participant_left': {
      const existing = next.participants[event.participantId];
      // Leaving marks absence, it never drops the vote — a phone locking mid
      // session must not silently change the outcome.
      if (existing) next.participants[event.participantId] = { ...existing, present: false };
      break;
    }

    case 'answers_opened':
      next.answersOpen = true;
      break;

    case 'answers_closed':
      next.answersOpen = false;
      break;

    case 'vote_cast': {
      const forDecision = { ...(next.votes[event.decisionId] ?? {}) };
      forDecision[event.participantId] = event.optionId;
      next.votes[event.decisionId] = forDecision;
      break;
    }

    case 'results_revealed':
      next.resultsVisible = true;
      break;

    case 'decision_resolved':
      next.resolved[event.decisionId] = {
        decisionId: event.decisionId,
        optionId: event.optionId,
        tally: event.tally,
        resolvedBy: event.resolvedBy,
        wouldHaveWonOptionId: null,
      };
      fireEffects(scenario, next.charts, (e) =>
        e.trigger.kind === 'on_option_chosen' && e.trigger.optionId === event.optionId);
      break;

    case 'facilitator_override':
      next.resolved[event.decisionId] = {
        decisionId: event.decisionId,
        optionId: event.optionId,
        tally: event.tally,
        resolvedBy: 'override',
        wouldHaveWonOptionId: event.wouldHaveWonOptionId,
      };
      fireEffects(scenario, next.charts, (e) =>
        e.trigger.kind === 'on_option_chosen' && e.trigger.optionId === event.optionId);
      break;
  }

  return next;
}

/** Rebuild a session from its log. Used on reconnect, on restart, and by the report. */
export function deriveState(scenario: Scenario, events: readonly SessionEvent[]): SessionState {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .reduce((state, event) => applyEvent(scenario, state, event), initialState(scenario));
}
