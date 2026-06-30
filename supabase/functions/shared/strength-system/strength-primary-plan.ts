// ============================================================================
// STRENGTH-PRIMARY PLAN  (SPEC-product-shape Program 1; replaces the (b)-run stopgap)
//
// Strength is the SPINE. The arc (base→power→sharpen→retest) IS the plan structure;
// maintenance endurance (run OR bike — sport-agnostic) fills the off-days underneath.
// Materializes through the same activate-plan pipe (standard sessions_by_week shape).
//
// LOADING (block periodization, confirmed 2026-06-29): ONE continuous progression off
// the athlete's real 1RM, no phase reset — 4 REAL barbell sessions every work phase
// (no overlay maintenance fillers):
//   base    5×5 @ 70→77%   (the foundation — structure preserved from strength_focus_build)
//   power   5×3 @ 80→87%   (real barbell power; replaces the (b)-run maintenance-filler lane)
//   sharpen 3×3 @ 88→92%   (peak intensity, volume drops)
//   retest  work up to a heavy single — re-baseline the 1RM (NOT a 45% deload)
// The % strings ("X% 1RM") are resolved to lb at materialization off the stored 1RM, so
// when the athlete retests their max the whole block re-anchors automatically.
//
// This builder is self-contained — it does NOT delegate to the shared overlay protocols
// (strength_focus_power et al.), so the (b)-run path + the base structure stay untouched.
// ============================================================================

export type StrengthPrimaryArgs = {
  durationWeeks: number;
  strengthFrequency: 3 | 4;
  tier: 'barbell' | 'bodyweight';
  /** The athlete's maintained endurance discipline (sport-agnostic). null = strength-only. */
  enduranceSport: 'run' | 'bike' | null;
  enduranceFrequency: number; // ~2 maintenance sessions/week
  goalName?: string;
};

type StrengthExercise = { name: string; sets: number; reps: number | string; weight: string };

type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: StrengthExercise[];
  tags: string[];
};

type ArcPhase = { name: string; start_week: number; end_week: number; weeks_in_phase: number };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// Strength-primary day grids: strength owns the prime days; endurance fills the gaps; Sunday rests.
const GRID: Record<string, { strength: string[]; endurance: string[] }> = {
  '4+2': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: ['Wednesday', 'Saturday'] },
  '4+1': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: ['Saturday'] },
  '4+0': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: [] },
  '3+2': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Tuesday', 'Saturday'] },
  '3+3': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Tuesday', 'Thursday', 'Saturday'] },
  '3+1': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Saturday'] },
};

/**
 * The Get Strong arc timeline: base → power → sharpen → strength retest. Proportional to the block
 * length; the final week is always the retest (1RM re-baseline).
 */
export function buildArcPhases(weeks: number): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const body = Math.max(1, weeks - 1); // reserve the last week for the retest
  const baseLen = Math.max(1, Math.round(body * 0.45));
  const powerLen = Math.max(1, Math.round(body * 0.35));
  const sharpenLen = Math.max(0, body - baseLen - powerLen);
  const phases: ArcPhase[] = [];
  let w = 1;
  phases.push({ name: 'Base', start_week: w, end_week: w + baseLen - 1, weeks_in_phase: baseLen }); w += baseLen;
  phases.push({ name: 'Power', start_week: w, end_week: w + powerLen - 1, weeks_in_phase: powerLen }); w += powerLen;
  if (sharpenLen > 0) {
    phases.push({ name: 'Sharpen', start_week: w, end_week: w + sharpenLen - 1, weeks_in_phase: sharpenLen });
    w += sharpenLen;
  }
  phases.push({ name: 'Retest', start_week: weeks, end_week: weeks, weeks_in_phase: 1 });
  return { phases, recovery_weeks: [] };
}

function phaseFor(week: number, phases: ArcPhase[]): ArcPhase {
  return phases.find((p) => week >= p.start_week && week <= p.end_week) ?? phases[phases.length - 1];
}

// ── The continuous loading scheme (block periodization; no phase reset) ──────────────────
type WorkLoad = { sets: number; reps: number; secSets: number; pct: number; label: string };

/** Linear-interpolate the % across a phase and round to the nearest 0.5. */
function rampPct(phase: ArcPhase, week: number, start: number, end: number): number {
  const span = Math.max(1, phase.weeks_in_phase - 1);
  const t = span === 0 ? 0 : (week - phase.start_week) / span; // 0..1 across the phase
  return Math.round((start + t * (end - start)) * 2) / 2;
}

/** Sets/reps/% for a WORK week (base/power/sharpen). The % climbs continuously, reps drop by phase. */
function workLoad(phase: ArcPhase, week: number): WorkLoad {
  switch (phase.name) {
    case 'Power':
      return { sets: 5, reps: 3, secSets: 3, pct: rampPct(phase, week, 80, 87), label: 'Power (5×3, heavier)' };
    case 'Sharpen':
      return { sets: 3, reps: 3, secSets: 2, pct: rampPct(phase, week, 88, 92), label: 'Sharpen (3×3, peak intensity)' };
    case 'Base':
    default:
      return { sets: 5, reps: 5, secSets: 3, pct: rampPct(phase, week, 70, 77), label: 'Strength base (5×5)' };
  }
}

function exer(name: string, sets: number, reps: number | string, pct: number): StrengthExercise {
  return { name, sets, reps, weight: `${pct}% 1RM` };
}

/** The 4 REAL barbell sessions (U/L/U/L) for a work week — same clean structure every phase. */
function workSessions(load: WorkLoad): { name: string; focus: 'upper' | 'lower'; ex: StrengthExercise[] }[] {
  const { sets, reps, secSets, pct } = load;
  return [
    { name: 'Upper A', focus: 'upper', ex: [exer('Bench Press', sets, reps, pct), exer('Barbell Row', sets, reps, pct)] },
    { name: 'Lower A', focus: 'lower', ex: [exer('Back Squat', sets, reps, pct), exer('Romanian Deadlift', secSets, reps, pct)] },
    { name: 'Upper B', focus: 'upper', ex: [exer('Overhead Press', sets, reps, pct), exer('Pull Up', secSets, reps, pct)] },
    { name: 'Lower B', focus: 'lower', ex: [exer('Back Squat', secSets, reps, pct), exer('Conventional Deadlift', 1, reps, pct)] },
  ];
}

/** Retest week: work up to a heavy single on each main lift to RE-BASELINE the 1RM (not a deload). */
function retestSessions(): { name: string; focus: 'upper' | 'lower'; ex: StrengthExercise[]; test: string }[] {
  const ramp = (lift: string): StrengthExercise[] => [
    { name: `${lift} — warm-up`, sets: 1, reps: '5 / 3 / 2 / 1', weight: 'ramp 50→85% 1RM' },
    { name: `${lift} — top single`, sets: 1, reps: 1, weight: 'work up to a NEW max (≥100% of current 1RM)' },
  ];
  return [
    { name: 'Bench Press', focus: 'upper', ex: ramp('Bench Press'), test: 'Bench Press' },
    { name: 'Back Squat', focus: 'lower', ex: ramp('Back Squat'), test: 'Back Squat' },
    { name: 'Overhead Press', focus: 'upper', ex: ramp('Overhead Press'), test: 'Overhead Press' },
    { name: 'Deadlift', focus: 'lower', ex: ramp('Deadlift'), test: 'Deadlift' },
  ];
}

function enduranceSession(sport: 'run' | 'bike', day: string, isRetestWeek: boolean): PlanSession {
  const mins = sport === 'bike' ? (isRetestWeek ? 35 : 45) : (isRetestWeek ? 25 : 35);
  const label = sport === 'bike' ? 'Easy Ride' : 'Easy Run';
  return {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: label,
    description: `~${mins} min easy aerobic, conversational — maintenance only (held so strength leads).`,
    duration: mins,
    tags: ['easy', 'maintenance', 'aerobic'],
  };
}

/**
 * Compose a strength-primary plan: the arc as the spine + maintenance endurance underneath.
 * Returns the standard plan structure — the caller persists it and runs activate-plan.
 */
export function composeStrengthPrimaryPlan(args: StrengthPrimaryArgs): {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<string, PlanSession[]>;
  phaseStructure: { phases: ArcPhase[]; recovery_weeks: number[] };
} {
  const { durationWeeks, strengthFrequency, enduranceSport, enduranceFrequency } = args;
  const phaseStructure = buildArcPhases(durationWeeks);
  const grid = GRID[`${strengthFrequency}+${enduranceSport ? enduranceFrequency : 0}`]
    ?? GRID[`${strengthFrequency}+2`] ?? GRID['4+2'];

  const sessions_by_week: Record<string, PlanSession[]> = {};

  for (let week = 1; week <= durationWeeks; week++) {
    const phase = phaseFor(week, phaseStructure.phases);
    const isRetestWeek = phase.name === 'Retest';
    const weekSessions: PlanSession[] = [];

    if (isRetestWeek) {
      // #3 — retest: ramp to a heavy single on each main lift. NOT a deload.
      retestSessions().slice(0, grid.strength.length).forEach((s, i) => {
        weekSessions.push({
          day: grid.strength[i],
          type: 'strength',
          name: `Retest — ${s.name} (work up to a new max)`,
          description: `Re-baseline your 1RM. Warm up, then work up in singles to a NEW max ${s.test}. Log it — the next block loads off this number.`,
          duration: 60,
          strength_exercises: s.ex,
          tags: ['strength', s.focus, 'phase:retest', 'retest', 'protocol:strength_primary'],
        });
      });
    } else {
      // #1 + #2 — 4 real barbell sessions every work phase, continuous loading off the real 1RM.
      const load = workLoad(phase, week);
      workSessions(load).slice(0, grid.strength.length).forEach((s, i) => {
        weekSessions.push({
          day: grid.strength[i],
          type: 'strength',
          name: `Strength Focus — ${s.name}`,
          description:
            `${load.label} — 4-day split. ` +
            `${s.ex.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ')}. Target ${load.pct}% 1RM.`,
          duration: 60,
          strength_exercises: s.ex,
          tags: ['strength', s.focus, `phase:${phase.name.toLowerCase()}`, 'protocol:strength_primary'],
        });
      });
    }

    // Endurance = maintenance, underneath, on the off-days.
    if (enduranceSport) {
      grid.endurance.forEach((day) => weekSessions.push(enduranceSession(enduranceSport, day, isRetestWeek)));
    }

    weekSessions.sort((a, b) => DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]));
    sessions_by_week[String(week)] = weekSessions;
  }

  const enduranceNote = enduranceSport
    ? ` ${enduranceSport === 'bike' ? 'Riding' : 'Running'} held at maintenance underneath.`
    : '';
  return {
    name: args.goalName?.trim() || `Get Stronger — ${durationWeeks} Weeks`,
    description:
      `Strength-led block: a continuous base→power→sharpen arc on heavy barbell compounds ` +
      `(balanced upper/lower), ending in a 1RM retest.${enduranceNote} The athlete picked the outcome; the engine runs the arc.`,
    duration_weeks: durationWeeks,
    sessions_by_week,
    phaseStructure,
  };
}
