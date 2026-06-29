// ============================================================================
// STRENGTH-FOCUS SPLIT  (Q-088 / D-220)  — 4-day Upper / Lower / Upper / Lower
//
// The freq-4 developer for the strength-focus MODE (endurance maintain / out).
// ONE module, TWO content lanes (D-220) — the U/L/U/L is STRUCTURE ONLY; the
// lane supplies content:
//
//   - 'build' : 5×5-DERIVED upper/lower split (compound, 70→85% linear). NOT the
//     full-body `five_by_five` protocol (which stays full-body A/B 2×) — a split
//     built from the SAME compound vocabulary. The composition is CONVENTION:
//     SCIENCE-5x5-linear-progression.md prescribes 5×5 as full-body 2×; the
//     4-day split is the engine's convention, redistributing the doc's compound
//     vocabulary + load model across 4 days. Every name resolves in
//     exercise-role.ts (D-208) — zero role-table edits.
//
//   - 'power': `performance_neural`-DERIVED, REBALANCED from its native 1L+2U to
//     an even 2L/2U. Reuses neural's session builders verbatim (no new content).
//
// Selected ONLY at strengthFrequency 4 — the frequency policy
// (../frequency-policy.ts) gates it there. Spec: docs/SPEC-q088-freq4-run-path.md.
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';
import {
  createLowerNeuralSession,
  createLowerMaintenanceSession,
  createUpperStrengthSession,
  createUpperMaintenanceSession,
} from './performance-neural.ts';
// NB: performance-neural's createBaseHypertrophyLower is deliberately NOT reused — it emits
// `intent: 'LOWER_HYPERTROPHY' as any` (performance-neural.ts:162), which is not a valid
// StrengthIntent and throws in isUpper/isLowerIntent. The power lane uses the neural/maintenance
// lowers (valid intents). The base-phase hypertrophy ramp is a later refinement, pending a fix to
// that latent neural bug.

export type SplitLane = 'build' | 'power';

// ── build lane: 5×5-DERIVED load curve (lifted from five_by_five; SCIENCE §2/§3) ──
const START_PCT = 70;
const PEAK_PCT = 85;
const STEP_PCT = 1.25; // ~1–3%/week linear increment (SCIENCE §2)
const DELOAD_PCT = 45; // recovery/taper weeks (SCIENCE §3)

function loadForWeek(weekInPhase: number, isDeload: boolean): number {
  if (isDeload) return DELOAD_PCT;
  return Math.min(PEAK_PCT, START_PCT + Math.max(0, weekInPhase - 1) * STEP_PCT);
}

function ex(name: string, sets: number, reps: number, load: number): StrengthExercise {
  return { name, sets, reps, weight: `${load}% 1RM` };
}

function buildSession(name: string, focus: 'upper' | 'lower', exercises: StrengthExercise[]): IntentSession {
  return {
    // No LOWER_STRENGTH intent exists in the taxonomy; LOWER_NEURAL is the
    // heaviest lower intent and classifies as lower for placement. The exercise
    // content (5×5 @ %1RM) carries the real prescription; intent drives buffering.
    intent: focus === 'upper' ? 'UPPER_STRENGTH' : 'LOWER_NEURAL',
    priority: 'required',
    name: `Strength Focus — ${name}`,
    description:
      `5×5-derived ${focus} strength (4-day split). ` +
      `${exercises.map(e => `${e.name} ${e.sets}×${e.reps}`).join(' · ')}. Target ${exercises[0]?.weight}.`,
    duration: 60,
    exercises,
    repProfile: 'strength',
    tags: ['strength', focus, 'protocol:strength_focus_split', 'lane:build', 'derived:5x5', `day:${name.toLowerCase().replace(/\s+/g, '_')}`],
  };
}

// build lane U/L/U/L (CONVENTION — see header). Deadlift stays reduced-volume
// 1×5 (SCIENCE §1). All names resolve in exercise-role.ts today.
function buildLaneSessions(ctx: ProtocolContext): IntentSession[] {
  const isTaper = String(ctx.phase?.name ?? '').toLowerCase() === 'taper';
  const load = loadForWeek(ctx.weekInPhase, ctx.isRecovery || isTaper);
  return [
    buildSession('Upper A', 'upper', [ex('Bench Press', 5, 5, load), ex('Barbell Row', 5, 5, load)]),
    buildSession('Lower A', 'lower', [ex('Back Squat', 5, 5, load), ex('Romanian Deadlift', 3, 5, load)]),
    buildSession('Upper B', 'upper', [ex('Overhead Press', 5, 5, load), ex('Pull Up', 3, 5, load)]),
    buildSession('Lower B', 'lower', [ex('Back Squat', 3, 5, load), ex('Conventional Deadlift', 1, 5, load)]),
  ];
}

// power lane: reuse performance_neural's builders, REBALANCED 1L+2U → 2L/2U,
// ordered U/L/U/L. performance_neural itself is unchanged.
function powerLaneSessions(ctx: ProtocolContext): IntentSession[] {
  const tier: 'barbell' | 'bodyweight' =
    ctx.userBaselines.equipment === 'commercial_gym' ? 'barbell' : 'bodyweight';
  const { phase, weekInPhase, isRecovery } = ctx;

  const lowerPrimary = tier === 'barbell'
    ? createLowerNeuralSession(phase, weekInPhase, isRecovery, tier)
    : createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier);
  const upperPrimary = createUpperStrengthSession(phase, weekInPhase, isRecovery, tier);
  const upperSecondary = createUpperMaintenanceSession(phase, weekInPhase, isRecovery, tier);
  const lowerSecondary = createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier);

  // U / L / U / L
  return [upperPrimary, lowerPrimary, upperSecondary, lowerSecondary];
}

function makeCreateWeekSessions(lane: SplitLane) {
  return function createWeekSessions(ctx: ProtocolContext): IntentSession[] {
    const all = lane === 'build' ? buildLaneSessions(ctx) : powerLaneSessions(ctx);
    // Designed for freq 4; defensively emit up to strengthFrequency in U/L/U/L
    // order if ever called lower (the gate normally routes here only at 4).
    const freq = Math.max(1, Math.min(4, Number(ctx.strengthFrequency) || 4));
    return all.slice(0, freq);
  };
}

/**
 * Factory — ONE module, lane param (D-220). Returns a StrengthProtocol for the
 * given content lane. Registered in selector.ts under two ids.
 */
export function makeStrengthFocusSplit(lane: SplitLane): StrengthProtocol {
  return {
    id: lane === 'build' ? 'strength_focus_build' : 'strength_focus_power',
    name: lane === 'build'
      ? 'Strength Focus — Build (4-day U/L split)'
      : 'Strength Focus — Power (4-day U/L split)',
    description: lane === 'build'
      ? '5×5-derived 4-day upper/lower split for a strength-focus block (endurance maintained or parked). Compound lifts, 5×5, 70→85% 1RM linear.'
      : 'Neural-speed-derived 4-day upper/lower split, rebalanced to even 2 lower / 2 upper, for a strength-focus block.',
    tradeoffs: [
      'Requires endurance in maintain/out posture — not for a concurrent develop block',
      lane === 'build'
        ? 'Barbell-dependent compound split; not sport-specific'
        : 'Low-volume neural emphasis; not a hypertrophy program',
      '4 sessions/week — needs 4 placeable days (rest days become lift days)',
    ],
    createWeekSessions: makeCreateWeekSessions(lane),
  };
}

export const strengthFocusBuildProtocol = makeStrengthFocusSplit('build');
export const strengthFocusPowerProtocol = makeStrengthFocusSplit('power');
