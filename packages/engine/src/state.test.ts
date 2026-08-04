import { describe, expect, it } from 'vitest';
import { scenarioSchema, type Scenario, type SessionEvent } from '@crisol/shared';
import { countVotes, deriveState, nextPhaseId } from './state.js';

/**
 * A three-phase exercise. Phase 1 decides; option B jumps straight to phase 3,
 * skipping phase 2. Option A takes the default path. One chart moves.
 */
const scenario: Scenario = scenarioSchema.parse({
  schemaVersion: 1,
  slug: 'test',
  title: { es: 'Prueba' },
  defaultLocale: 'es',
  roles: [{ id: 'r1', key: 'general', name: { es: 'General' }, isGeneral: true, sortOrder: 0 }],
  charts: [
    {
      id: 'c1',
      key: 'reclamos',
      title: { es: 'Reclamos' },
      kind: 'line',
      initialSeries: { total: [100, 100, 100] },
      effects: [
        {
          id: 'e1',
          trigger: { kind: 'on_phase_enter', phaseId: 'p2' },
          targetSeries: 'total',
          targetPoint: null,
          operation: 'add',
          value: 50,
        },
        {
          id: 'e2',
          trigger: { kind: 'on_option_chosen', optionId: 'oB' },
          targetSeries: 'total',
          targetPoint: 2,
          operation: 'percent_change',
          value: 20,
        },
      ],
    },
  ],
  phases: [
    {
      id: 'p1',
      sortOrder: 0,
      title: { es: 'Apertura' },
      kind: 'decision',
      durationSeconds: 600,
      visibleCharts: ['reclamos'],
      decision: {
        id: 'd1',
        prompt: { es: '¿Qué hacemos?' },
        tieBreaker: 'presenter',
        options: [
          { id: 'oA', label: { es: 'Contener' }, sortOrder: 0 },
          { id: 'oB', label: { es: 'Escalar' }, sortOrder: 1, nextPhaseId: 'p3' },
        ],
      },
    },
    { id: 'p2', sortOrder: 1, title: { es: 'Intermedia' }, kind: 'inject', durationSeconds: 600 },
    { id: 'p3', sortOrder: 2, title: { es: 'Cierre' }, kind: 'debrief', durationSeconds: 600 },
  ],
});

const phase = (id: string) => scenario.phases.find((p) => p.id === id)!;
const decision = phase('p1').decision!;

let seq = 0;
const ev = (e: Omit<SessionEvent, 'seq' | 'at' | 'actor'> & Partial<SessionEvent>): SessionEvent =>
  ({ seq: (seq += 1), at: new Date(seq * 1000).toISOString(), actor: { kind: 'system' }, ...e }) as SessionEvent;

describe('branching', () => {
  it('follows authored order when nothing overrides it', () => {
    expect(nextPhaseId(scenario, phase('p1'), 'oA')).toBe('p2');
  });

  it('jumps when the chosen option overrides the path', () => {
    expect(nextPhaseId(scenario, phase('p1'), 'oB')).toBe('p3');
  });

  it('ends the exercise after the last phase', () => {
    expect(nextPhaseId(scenario, phase('p3'), null)).toBeNull();
  });
});

describe('voting', () => {
  it('gives every participant the same weight', () => {
    const outcome = countVotes(decision, { a: 'oA', b: 'oA', c: 'oB' });
    expect(outcome.winnerId).toBe('oA');
    expect(outcome.tally).toEqual({ oA: 2, oB: 1 });
  });

  it('reports a tie instead of picking, when the presenter decides', () => {
    const outcome = countVotes(decision, { a: 'oA', b: 'oB' });
    expect(outcome.winnerId).toBeNull();
    expect(outcome.tied).toEqual(['oA', 'oB']);
  });

  it('breaks a tie by order when configured to', () => {
    const auto = { ...decision, tieBreaker: 'first_listed' as const };
    expect(countVotes(auto, { a: 'oA', b: 'oB' }).winnerId).toBe('oA');
  });

  it('treats zero votes as a tie, not a win for the first option', () => {
    expect(countVotes(decision, {}).winnerId).toBeNull();
  });
});

describe('chart effects', () => {
  it('fires on entering a phase', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'session_started', phaseId: 'p1' }),
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({ kind: 'phase_started', phaseId: 'p2', durationSeconds: 600 }),
    ]);
    expect(state.charts.reclamos?.total).toEqual([150, 150, 150]);
  });

  it('fires on the chosen option, on the targeted point only', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({
        kind: 'decision_resolved',
        decisionId: 'd1',
        optionId: 'oB',
        tally: { oA: 1, oB: 2 },
        resolvedBy: 'vote',
      }),
    ]);
    expect(state.charts.reclamos?.total).toEqual([100, 100, 120]);
  });

  it('does not fire for options that were not chosen', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({
        kind: 'decision_resolved',
        decisionId: 'd1',
        optionId: 'oA',
        tally: { oA: 2, oB: 1 },
        resolvedBy: 'vote',
      }),
    ]);
    expect(state.charts.reclamos?.total).toEqual([100, 100, 100]);
  });
});

describe('untimed phases', () => {
  it('is accepted by the scenario schema', () => {
    const untimed = scenarioSchema.parse({
      ...scenario,
      phases: scenario.phases.map((p) => ({ ...p, durationSeconds: null })),
    });
    expect(untimed.phases.every((p) => p.durationSeconds === null)).toBe(true);
  });

  it('leaves no countdown to show', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p2', durationSeconds: null }),
    ]);
    expect(state.currentPhaseId).toBe('p2');
    expect(state.remainingSeconds).toBeNull();
  });

  it('still runs a timed phase normally', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
    ]);
    expect(state.remainingSeconds).toBe(600);
  });
});

describe('adjusting the clock', () => {
  it('restarts the countdown from the moment it was adjusted', () => {
    const events = [
      ev({ kind: 'session_started', phaseId: 'p1' }),
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({ kind: 'timer_adjusted', remainingSeconds: 900 }),
    ];
    const state = deriveState(scenario, events);
    expect(state.remainingSeconds).toBe(900);
    // Otherwise the clients would subtract the time already spent in the phase
    // from the new value and the extra minutes would vanish on arrival.
    expect(state.runningSince).toBe(events[2]?.at);
  });

  it('leaves a paused session paused', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({ kind: 'session_paused' }),
      ev({ kind: 'timer_adjusted', remainingSeconds: 300 }),
    ]);
    expect(state.remainingSeconds).toBe(300);
    expect(state.runningSince).toBeNull();
  });
});

describe('facilitator override', () => {
  it('records what the table would have chosen', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({
        kind: 'facilitator_override',
        decisionId: 'd1',
        optionId: 'oB',
        wouldHaveWonOptionId: 'oA',
        tally: { oA: 5, oB: 1 },
      }),
    ]);
    const resolved = state.resolved.d1!;
    expect(resolved.optionId).toBe('oB');
    expect(resolved.resolvedBy).toBe('override');
    expect(resolved.wouldHaveWonOptionId).toBe('oA');
  });
});

describe('replay', () => {
  it('keeps a vote when the participant drops off', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'participant_joined', participantId: 'u1', displayName: 'Ana', roleId: 'r1' }),
      ev({ kind: 'answers_opened', decisionId: 'd1' }),
      ev({ kind: 'vote_cast', decisionId: 'd1', participantId: 'u1', optionId: 'oA' }),
      ev({ kind: 'participant_left', participantId: 'u1' }),
    ]);
    expect(state.participants.u1?.present).toBe(false);
    expect(state.votes.d1?.u1).toBe('oA');
  });

  it('keeps only the latest vote per participant', () => {
    const state = deriveState(scenario, [
      ev({ kind: 'vote_cast', decisionId: 'd1', participantId: 'u1', optionId: 'oA' }),
      ev({ kind: 'vote_cast', decisionId: 'd1', participantId: 'u1', optionId: 'oB' }),
    ]);
    expect(state.votes.d1).toEqual({ u1: 'oB' });
  });

  it('is deterministic regardless of the order events arrive in', () => {
    const events = [
      ev({ kind: 'phase_started', phaseId: 'p1', durationSeconds: 600 }),
      ev({ kind: 'phase_started', phaseId: 'p2', durationSeconds: 600 }),
      ev({ kind: 'phase_started', phaseId: 'p3', durationSeconds: 600 }),
    ];
    const forwards = deriveState(scenario, events);
    const shuffled = deriveState(scenario, [...events].reverse());
    expect(shuffled).toEqual(forwards);
    expect(forwards.path).toEqual(['p1', 'p2', 'p3']);
  });
});
