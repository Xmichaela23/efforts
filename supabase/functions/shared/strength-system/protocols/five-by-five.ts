// ============================================================================
// 5×5 LINEAR PROGRESSION PROTOCOL
//
// Universal novice/early-intermediate barbell strength: 5×5 on compound lifts,
// A/B alternating, 3×/week, deadlift at reduced volume. See
// docs/SCIENCE-5x5-linear-progression.md (cited).
//
// Cut 3 (this file): STRUCTURE at a single anchor load. The block-linear weekly
// %1RM curve (70→85) + the deeper deload (40-50%) land in Cut 4.
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';

// Cut 3: a single placeholder anchor load. Cut 4 replaces this with the block-linear 70→85% curve
// (by week-in-block) and the 40-50% deload. Recovery/taper weeks lighten here as a placeholder only.
const ANCHOR_PCT = 75;

export const fiveByFiveProtocol: StrengthProtocol = {
  id: 'five_by_five',
  name: '5×5 Linear Progression',
  description:
    'Linear-progression barbell strength: 5×5 on compound lifts, A/B alternating, 3×/week ' +
    '(deadlift 1×5). Cut 3 = structure at a single anchor load; the 70→85% weekly curve is Cut 4.',
  tradeoffs: [
    'Barbell-dependent (squat / bench / deadlift / overhead press / row)',
    'Linear progression is finite (~16–20 weeks) — the block ends in a retest',
    'Full-body strength sessions; not sport-specific',
  ],
  createWeekSessions,
};

function workoutA(load: number): StrengthExercise[] {
  return [
    { name: 'Back Squat', sets: 5, reps: 5, weight: `${load}% 1RM` },
    { name: 'Bench Press', sets: 5, reps: 5, weight: `${load}% 1RM` },
    { name: 'Barbell Row', sets: 5, reps: 5, weight: `${load}% 1RM` },
  ];
}

function workoutB(load: number): StrengthExercise[] {
  return [
    { name: 'Back Squat', sets: 5, reps: 5, weight: `${load}% 1RM` },
    { name: 'Overhead Press', sets: 5, reps: 5, weight: `${load}% 1RM` },
    // Deadlift at reduced volume (1×5) — its systemic/recovery cost is disproportionate (§1).
    { name: 'Deadlift', sets: 1, reps: 5, weight: `${load}% 1RM` },
  ];
}

function session(which: 'A' | 'B', load: number): IntentSession {
  const exercises = which === 'A' ? workoutA(load) : workoutB(load);
  return {
    intent: 'FULLBODY_STRENGTH',
    priority: 'required',
    name: `5×5 Workout ${which}`,
    description:
      `5×5 linear progression — Workout ${which} ` +
      `(${which === 'A' ? 'Squat / Bench / Row' : 'Squat / Overhead Press / Deadlift 1×5'}). ` +
      `Target ${load}% 1RM, 5×5.`,
    duration: 60,
    exercises,
    repProfile: 'strength',
    tags: ['strength', 'full_body', 'protocol:five_by_five', `workout:${which.toLowerCase()}`],
  };
}

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { weekIndex, isRecovery, strengthFrequency, phase } = context;
  const isTaper = phase.name === 'Taper';

  // A/B alternation by week parity: one week leads A → [A,B,A]; the next leads B → [B,A,B].
  const lead: 'A' | 'B' = weekIndex % 2 === 1 ? 'A' : 'B';
  const other: 'A' | 'B' = lead === 'A' ? 'B' : 'A';
  const pattern: Array<'A' | 'B'> = strengthFrequency >= 3 ? [lead, other, lead] : [lead, other];

  // Cut 3: single anchor load; recovery/taper lighten as a placeholder (Cut 4 = block-linear curve + 40-50% deload).
  const load = isRecovery || isTaper ? Math.round(ANCHOR_PCT * 0.6) : ANCHOR_PCT;

  return pattern.map((w) => session(w, load));
}
