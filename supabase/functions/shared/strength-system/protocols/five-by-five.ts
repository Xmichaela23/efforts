// ============================================================================
// 5×5 LINEAR PROGRESSION PROTOCOL
//
// Universal novice/early-intermediate barbell strength: 5×5 on compound lifts,
// A/B alternating, 2×/week (endurance-adapted develop frequency), deadlift at
// reduced volume. See docs/SCIENCE-5x5-linear-progression.md (cited).
//
// Cut 4: the block-linear weekly %1RM curve (70→85 by week-in-block) + the deeper
// deload (recovery weeks → ~45%). The duration ceiling (= target_weeks) and the
// retest terminal are the non-race phase timeline's job (D-213), not this module's.
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';

// Block-linear progression (SCIENCE §2): a fixed weekly load increment from 70% toward the 85% strength
// zone. The plateau at 85% is itself the signal the linear block is nearing its ceiling (§4 → retest).
const START_PCT = 70;
const PEAK_PCT = 85;
const STEP_PCT = 1.25; // ~1-3%/week (SCIENCE §2) — the fixed weekly increment that IS linear progression
// Deload (SCIENCE §3): recovery weeks drop to ~45% (the 40-50% band) — deeper than a maintenance deload.
const DELOAD_PCT = 45;

// Working %1RM for a given week-in-block. Deload weeks → the deload load; otherwise the linear ramp,
// clamped at the 85% ceiling.
function loadForWeek(weekInBlock: number, isDeload: boolean): number {
  if (isDeload) return DELOAD_PCT;
  return Math.min(PEAK_PCT, START_PCT + Math.max(0, weekInBlock - 1) * STEP_PCT);
}

export const fiveByFiveProtocol: StrengthProtocol = {
  id: 'five_by_five',
  name: '5×5 Linear Progression',
  description:
    'Linear-progression barbell strength: 5×5 on compound lifts, A/B alternating, 2×/week ' +
    '(deadlift 1×5). Load climbs 70→85% 1RM by week-in-block; recovery weeks deload to ~45%.',
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
  const { weekIndex, weekInPhase, isRecovery, strengthFrequency, phase } = context;
  const isTaper = phase.name === 'Taper';

  // A/B alternation by absolute-week parity: a week is A-B, the next B-A.
  const lead: 'A' | 'B' = weekIndex % 2 === 1 ? 'A' : 'B';
  const other: 'A' | 'B' = lead === 'A' ? 'B' : 'A';
  // 2×/week — the endurance-adapted develop frequency (SCIENCE §1; Rønnestad 2× develop / 1× maintain).
  // Capped at 2 even when strengthFrequency is 3 (a third slot would be maintenance, not this develop module's job).
  const pattern: Array<'A' | 'B'> = strengthFrequency <= 1 ? [lead] : [lead, other];

  // Block-linear curve by week-in-block; recovery (and taper) weeks deload.
  const load = loadForWeek(weekInPhase, isRecovery || isTaper);

  return pattern.map((w) => session(w, load));
}
