import type { Scenario, SessionEvent } from '@crisol/shared';
import { deriveState } from '@crisol/engine';

/**
 * The after-action report.
 *
 * Built entirely by reading the event log — nothing is recorded separately for
 * it. That is the payoff of the append-only design: the report cannot drift
 * from what actually happened, because it *is* what happened.
 */

export interface DecisionReport {
  phaseTitle: string;
  prompt: string;
  options: { id: string; label: string; votes: number; won: boolean }[];
  /** How the outcome was reached. `override` means it did not come from the table. */
  resolvedBy: 'vote' | 'tie_break' | 'override' | 'unresolved';
  /** Only on an override: what the table had actually chosen. */
  wouldHaveWon: string | null;
  votesCast: number;
  peoplePresent: number;
  /** Seconds between opening the answers and closing the decision. */
  deliberationSeconds: number | null;
}

export interface PhaseReport {
  id: string;
  title: string;
  kind: string;
  plannedSeconds: number | null;
  actualSeconds: number | null;
  startedAt: string;
}

export interface SessionReport {
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  totalSeconds: number | null;
  status: string;
  participants: { displayName: string; roleName: string }[];
  /** The phases actually visited, in order — with branching this is not the authored order. */
  path: PhaseReport[];
  decisions: DecisionReport[];
  /** Phases the exercise never reached, because the table went another way. */
  skippedPhases: string[];
  facilitatorOverrides: number;
  timeline: { at: string; label: string }[];
}

function text(value: Record<string, string> | undefined, locale: string): string {
  if (!value) return '';
  return value[locale] ?? Object.values(value)[0] ?? '';
}

const LABELS: Record<string, string> = {
  session_started: 'Empezó el ejercicio',
  session_paused: 'Pausa',
  session_resumed: 'Se reanudó',
  session_ended: 'Terminó el ejercicio',
  answers_opened: 'Se abrió la votación',
  answers_closed: 'Se cerró la votación',
  results_revealed: 'Se mostraron los resultados',
  timer_adjusted: 'Se ajustó el tiempo',
};

export function buildReport(
  scenario: Scenario,
  events: readonly SessionEvent[],
  roster: { displayName: string; roleId: string }[],
): SessionReport {
  const locale = scenario.defaultLocale;
  const state = deriveState(scenario, events);
  const phaseById = new Map(scenario.phases.map((p) => [p.id, p]));

  const started = events.find((e) => e.kind === 'session_started');
  const ended = events.find((e) => e.kind === 'session_ended');

  // How long each phase really took, which is rarely what was planned.
  const path: PhaseReport[] = [];
  for (const event of events) {
    if (event.kind !== 'phase_started') continue;
    const phase = phaseById.get(event.phaseId);
    if (!phase) continue;
    const end = events.find(
      (e) => e.seq > event.seq && (e.kind === 'phase_ended' || e.kind === 'session_ended'),
    );
    path.push({
      id: phase.id,
      title: text(phase.title, locale),
      kind: phase.kind,
      plannedSeconds: phase.durationSeconds,
      actualSeconds: end
        ? Math.round((Date.parse(end.at) - Date.parse(event.at)) / 1000)
        : null,
      startedAt: event.at,
    });
  }

  const decisions: DecisionReport[] = [];
  for (const phase of scenario.phases) {
    const decision = phase.decision;
    if (!decision) continue;
    const resolved = state.resolved[decision.id];
    // A decision nobody reached is not part of the story.
    if (!resolved && !path.some((p) => p.id === phase.id)) continue;

    const tally = resolved?.tally ?? {};
    const opened = events.find((e) => e.kind === 'answers_opened' && e.decisionId === decision.id);
    const closed = events.find(
      (e) =>
        (e.kind === 'decision_resolved' || e.kind === 'facilitator_override') &&
        e.decisionId === decision.id,
    );

    decisions.push({
      phaseTitle: text(phase.title, locale),
      prompt: text(decision.prompt, locale),
      options: [...decision.options]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => ({
          id: option.id,
          label: text(option.label, locale),
          votes: tally[option.id] ?? 0,
          won: resolved?.optionId === option.id,
        })),
      resolvedBy: resolved?.resolvedBy ?? 'unresolved',
      wouldHaveWon: resolved?.wouldHaveWonOptionId
        ? text(
            decision.options.find((o) => o.id === resolved.wouldHaveWonOptionId)?.label,
            locale,
          )
        : null,
      votesCast: Object.values(tally).reduce((sum, n) => sum + n, 0),
      peoplePresent: roster.length,
      deliberationSeconds:
        opened && closed ? Math.round((Date.parse(closed.at) - Date.parse(opened.at)) / 1000) : null,
    });
  }

  const visited = new Set(path.map((p) => p.id));

  return {
    title: text(scenario.title, locale),
    startedAt: started?.at ?? null,
    endedAt: ended?.at ?? null,
    totalSeconds:
      started && ended ? Math.round((Date.parse(ended.at) - Date.parse(started.at)) / 1000) : null,
    status: state.status,
    participants: roster.map((person) => ({
      displayName: person.displayName,
      roleName: text(scenario.roles.find((r) => r.id === person.roleId)?.name, locale),
    })),
    path,
    decisions,
    skippedPhases: scenario.phases
      .filter((phase) => !visited.has(phase.id))
      .map((phase) => text(phase.title, locale)),
    facilitatorOverrides: events.filter((e) => e.kind === 'facilitator_override').length,
    timeline: events.flatMap((event) => {
      if (event.kind === 'phase_started') {
        const phase = phaseById.get(event.phaseId);
        return [{ at: event.at, label: `Fase: ${text(phase?.title, locale)}` }];
      }
      const label = LABELS[event.kind];
      return label ? [{ at: event.at, label }] : [];
    }),
  };
}
