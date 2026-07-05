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
  /** "Do you know your 1RMs?" → NO. Week 1 becomes a baseline test (offered, not forced); weeks 2-12
   *  train off the result. Default false (the athlete entered their 1RMs → train from week 1). */
  needsBaseline?: boolean;
  /** Get Strong maintenance-endurance band (run only). Typed weekly miles + the athlete's easy pace
   *  (min/mi) → the run volume, clamped to the science band: floor holds the aerobic base (Hickson/
   *  Spiering, freq 2-3×/wk), ceiling caps interference (Wilson, running>cycling). Flat, no ramp.
   *  Absent → the fixed ~2×35min default. See SCIENCE-strength-primary-loading.md. */
  targetWeeklyMiles?: number;
  easyPaceMinPerMile?: number;
  /** Optional accessory-bias add-on: injects ONE posterior-chain accessory slot on Upper A — glute
   *  (hip-extension/single-leg) or the Hyrox station rotation (sled/carry/lunge). Absent → byte-identical
   *  to a plain Get Stronger plan. Qualitative loading only (never %1RM). See SCIENCE-glute-accessory-bias.md
   *  + SCIENCE-hyrox-accessory-bias.md. */
  accessoryBias?: 'glute' | 'hyrox' | null;
  /** Preferred long-run day from intake. CONSTRAINED to Sat/Sun (heavy lower is Tue/Fri) — only 'sunday'
   *  moves it off the grid default (Saturday). The Hyrox fatigued-legs combo follows the long run. */
  longRunDay?: string;
};

type StrengthExercise = { name: string; sets: number; reps: number | string; weight: string };

type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: StrengthExercise[];
  steps_preset?: string[];
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
 * The Get Strong ATR arc: accumulate → intensify → DELOAD → realize(peak) → strength retest.
 * A block this long needs recovery every 6–8 wk (CONVENTION/consensus) — the deload sits between
 * intensify and peak so the athlete recovers BEFORE the heavy singles. The final week is the retest.
 */
export function buildArcPhases(weeks: number): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const loading = Math.max(3, weeks - 1); // reserve the last week for the retest
  const baseLen = Math.max(1, Math.round(loading * 0.36));
  const powerLen = Math.max(1, Math.round(loading * 0.18));
  const deloadLen = 1;
  const peakLen = Math.max(1, loading - baseLen - powerLen - deloadLen);
  const phases: ArcPhase[] = [];
  let w = 1;
  phases.push({ name: 'Base', start_week: w, end_week: w + baseLen - 1, weeks_in_phase: baseLen }); w += baseLen;
  phases.push({ name: 'Power', start_week: w, end_week: w + powerLen - 1, weeks_in_phase: powerLen }); w += powerLen;
  const deloadWeek = w;
  phases.push({ name: 'Deload', start_week: w, end_week: w + deloadLen - 1, weeks_in_phase: deloadLen }); w += deloadLen;
  phases.push({ name: 'Peak', start_week: w, end_week: w + peakLen - 1, weeks_in_phase: peakLen }); w += peakLen;
  // The block ends on an AMRAP RETEST week (D-224, replacing the D-223 consolidation stopgap). AMRAP holds a
  // FIXED ~88% weight and OPENS the reps — getting stronger shows up as MORE reps → higher e1RM, so it can't
  // force a loss the way the old fixed-88%×3 "estimate" did (that back-projected ~97% of the old max every time).
  phases.push({ name: 'Retest', start_week: weeks, end_week: weeks, weeks_in_phase: 1 });
  return { phases, recovery_weeks: [deloadWeek] };
}

function phaseFor(week: number, phases: ArcPhase[]): ArcPhase {
  return phases.find((p) => week >= p.start_week && week <= p.end_week) ?? phases[phases.length - 1];
}

// ── The loading scheme — block periodization that PROGRESSES THE MAX (no phase reset) ─────
// accumulate → intensify → REALIZE (heavy singles ≥96%) → TEST (open PR ≥100%). The peak phase
// exposes the CNS to a near-maximal single so the retest can express a new max; the retest opens
// at 100% and prescribes a PR attempt above it. Primary lifts carry the heavy load; accessories
// stay at back-off volume so a 97% "single" never lands on a Pull-Up or RDL.
type Scheme = { sets: number; reps: number | string; pct: number };
type WorkLoad = { primary: Scheme; secondary: Scheme; deadlift: Scheme; label: string };

/** Linear-interpolate the % across a phase and round to the nearest 0.5. */
function rampPct(phase: ArcPhase, week: number, start: number, end: number): number {
  const span = Math.max(1, phase.weeks_in_phase - 1);
  const t = span === 0 ? 0 : (week - phase.start_week) / span; // 0..1 across the phase
  return Math.round((start + t * (end - start)) * 2) / 2;
}

/** Per-week primary/secondary/deadlift schemes. The PEAK's last week is a heavy single (96–97%). */
function workLoad(phase: ArcPhase, week: number): WorkLoad {
  switch (phase.name) {
    case 'Power': {
      const p = rampPct(phase, week, 84, 90); // intensify — heavy triples
      return { primary: { sets: 5, reps: 3, pct: p }, secondary: { sets: 3, reps: 3, pct: p }, deadlift: { sets: 1, reps: 3, pct: p }, label: 'Power — heavy triples (intensify)' };
    }
    case 'Deload': {
      // Recover before the heavy singles: ~50% volume + intensity drop (CONVENTION).
      return { primary: { sets: 2, reps: 5, pct: 65 }, secondary: { sets: 2, reps: 5, pct: 60 }, deadlift: { sets: 1, reps: 5, pct: 60 }, label: 'Deload — recover before the peak (≈50% volume + intensity drop)' };
    }
    case 'Peak': {
      // REALIZE post-deload: heavy DOUBLES ramping to ~94% — primes the CNS without a near-max single.
      // The ONE near-max single is the retest check (wk12), so squat/bench aren't maxed two weeks running.
      const p = rampPct(phase, week, 88, 94);
      return { primary: { sets: 3, reps: 2, pct: p }, secondary: { sets: 2, reps: 3, pct: 85 }, deadlift: { sets: 1, reps: 2, pct: p }, label: 'Peak — heavy doubles (realize)' };
    }
    case 'Base':
    default: {
      const p = rampPct(phase, week, 72, 82); // accumulate — work capacity + hypertrophy base
      return { primary: { sets: 5, reps: 5, pct: p }, secondary: { sets: 3, reps: 5, pct: p }, deadlift: { sets: 1, reps: 5, pct: p }, label: 'Base — 5×5 (accumulate)' };
    }
  }
}

function exer(name: string, s: Scheme): StrengthExercise {
  return { name, sets: s.sets, reps: s.reps, weight: `${s.pct}% 1RM` };
}

// Spread the weekly maintenance miles across N runs as a LONG-RUN share + easy fill — NOT total÷N
// (the two-equal-runs bug). Descending: index 0 is the long run. Weights graduate (flatter as N grows:
// 3d ≈ 9/6/5, 4d ≈ 6/5/5/4), then rounded so the parts sum back to the total.
function distributeRunMiles(total: number, n: number): number[] {
  if (n <= 1) return [Math.max(1, Math.round(total))];
  const WEIGHTS: Record<number, number[]> = {
    2: [1.4, 1.0],
    3: [1.5, 1.0, 0.85],
    4: [1.2, 1.0, 1.0, 0.85],
  };
  const w = WEIGHTS[n] ?? Array.from({ length: n }, (_, i) => (i === 0 ? 1.4 : 1)); // fallback: long + even fill
  const sum = w.reduce((a, b) => a + b, 0);
  const miles = w.map((x) => Math.max(1, Math.round((total * x) / sum)));
  const drift = Math.round(total) - miles.reduce((a, b) => a + b, 0); // absorb rounding on the long run
  miles[0] = Math.max(1, miles[0] + drift);
  return miles;
}

/** The 4 REAL barbell sessions (U/L/U/L) for a work week. Primary lift heavy, accessory at back-off. */
function workSessions(load: WorkLoad): { name: string; focus: 'upper' | 'lower'; ex: StrengthExercise[] }[] {
  const { primary: P, secondary: S, deadlift: D } = load;
  return [
    { name: 'Upper A', focus: 'upper', ex: [exer('Bench Press', P), exer('Barbell Row', S)] },
    { name: 'Lower A (squat)', focus: 'lower', ex: [exer('Back Squat', P), exer('Romanian Deadlift', S)] },
    { name: 'Upper B', focus: 'upper', ex: [exer('Overhead Press', P), exer('Pull Up', S)] },
    // Lower B is the HINGE/lighter day — one heavy back squat/week (Lower A) is plenty for untrained legs.
    // Deadlift stays low-volume (highest-fatigue lift); the squat pattern here is a lighter Front Squat, so
    // no session stacks heavy back-squat + heavy deadlift and the legs aren't hammered twice. [concurrent recovery]
    { name: 'Lower B (hinge)', focus: 'lower', ex: [exer('Conventional Deadlift', D), exer('Front Squat', S)] },
  ];
}

// ── Accessory-bias add-on (glute | hyrox) — ONE shared mechanism ──────────────────────────────────────
// Placement: the single bias slot lands on Upper A ONLY — an upper day (no heavy-Lower conflict) and the
// earliest in the week, maximally removed from the weekend long run. This satisfies "no posterior-chain
// eccentric volume on heavy-Lower or long-run days" for ANY selection [Wilson 2012 running>cycling;
// running is eccentric-impact-dominant]. Skipped on the deload week (byte-identical) and absent on the
// retest week (no work sessions). Qualitative loading only — the weight is coaching text (no digits/%), so
// materialize's qualitative path renders it verbatim; these are NOT %1RM-anchored barbell lifts.
const GLUTE_ROTATION: StrengthExercise[] = [
  { name: 'Barbell Hip Thrust', sets: 3, reps: '8-12', weight: 'Heavy' },       // Contreras 2015 (glute-specific)
  { name: 'Single-Leg Squat', sets: 3, reps: '8/leg', weight: 'Add weight if able' }, // DiStefano 2009 (max glute-max recruitment)
  { name: 'Back Extension', sets: 3, reps: '12-15', weight: 'Bodyweight' },
];
const HYROX_ROTATION: StrengthExercise[] = [
  { name: 'Sled Push', sets: 3, reps: '20 m', weight: 'Heavy' },
  { name: 'Farmers Carry', sets: 3, reps: '40 m', weight: 'Heavy' },
  { name: 'Sandbag Lunge', sets: 3, reps: '20 m', weight: 'Moderate' },
  { name: 'Sled Pull', sets: 3, reps: '20 m', weight: 'Heavy' },
  { name: 'Back Extension', sets: 3, reps: '15', weight: 'Bodyweight' },
];
function biasAccessoryFor(preset: 'glute' | 'hyrox', week: number): StrengthExercise {
  const rot = preset === 'glute' ? GLUTE_ROTATION : HYROX_ROTATION;
  return { ...rot[(week - 1) % rot.length] }; // rotate for variety across weeks
}
// Endurance-benefit microcopy — honest per the verified science (NOT a speed promise; transfer is unproven).
function biasMicrocopy(preset: 'glute' | 'hyrox', sport: 'run' | 'bike' | null): string {
  if (preset === 'glute') {
    return sport === 'bike'
      ? 'Glute slot: the pedal stroke leaves the glutes under-loaded — direct hip-extension builds the power the saddle does not.'
      : 'Glute slot: direct hip-extension + single-leg work — builds the hip strength and stability that hold up over long mileage.';
  }
  return 'Hyrox slot: station patterns (sled / carry / lunge) — trained to handle the competition loads under fatigue, not for a faster finish.';
}

// ── Fatigued-legs combo (Hyrox preset only) ──────────────────────────────────────────────────────────
// The signature Hyrox stimulus: run → station on TIRED legs. Delivered as a same-day PAIRING — a SHORT run
// followed by a station strength session (run-first) — NOT a single mixed run+strength row (materialize is
// single-type per session; a true mixed row needs new code, the flagged balloon). One per work week, on a
// run-only mid-week day (not heavy-Lower, not the long run). Station is equipment-substituted at materialize
// via substituteExerciseForEquipment (home gym → DB/barbell). Skipped on deload + retest (kept byte-identical).
const FATIGUED_LEGS_STATION: StrengthExercise[] = [
  { name: 'Sled Push', sets: 4, reps: '25 m', weight: 'Heavy' },
  { name: 'Sandbag Lunge', sets: 4, reps: '20 m', weight: 'Moderate' },
  { name: 'Farmers Carry', sets: 4, reps: '40 m', weight: 'Heavy' },
];
function fatiguedLegsStation(week: number): StrengthExercise {
  return { ...FATIGUED_LEGS_STATION[(week - 1) % FATIGUED_LEGS_STATION.length] };
}

// ── AMRAP baseline/retest — ONE tool, two jobs (D-224) ───────────────────────────────────────────────
// The SAME guided session both ESTABLISHES baselines (entry, no 1RM → athlete picks a ~5-rep weight) and
// RE-MEASURES them (exit, has 1RM → prescribe ~88%). Warm up, then ONE all-out set: as many CLEAN reps as
// you can. Reps are OPEN (AMRAP) — more reps than last time = the gain, measured not assumed; a fixed-rep
// prescription off the old max can't show a gain (the D-223 bug). The logger clusters Epley+Brzycki (≤10 reps,
// [LeSuer 1997]) and the write-back is ratchet-UP only (D-223).
function amrapCopy(isDeadlift: boolean): string {
  return (
    `Warm up with a ramp (to ~85%), then ONE all-out set: as many CLEAN reps as you can at the test weight. ` +
    `Stop at ~RPE 9 — about one hard rep left — or the moment form breaks. Never grind to failure alone. ` +
    `More reps than last time is your gain, measured not assumed.` +
    (isDeadlift ? ` (Deadlift e1RM reads conservative — a flat number here isn't necessarily a flat lift [LeSuer 1997].)` : '')
  );
}
// One AMRAP working set. Exit passes a %1RM weight (materialize → lb); entry passes an athlete-chosen hint.
function amrapTestSet(lift: string, weight: string): StrengthExercise {
  return { name: `${lift} — AMRAP test set`, sets: 1, reps: 'AMRAP', weight };
}
// No-1RM baseline SEED: start at the empty bar and CLIMB. Deadlift starts higher (the bar sits on plates
// at pulling height). This is the STARTING weight for the discovery loop, not the test set — the athlete
// adds weight until they land 3–6 hard clean reps; the logged set (not this seed) drives the e1RM.
function barStartLb(lift: string): number {
  return /deadlift/i.test(lift) ? 95 : 45;
}
// No-1RM discovery copy: FIND the working weight by REP COUNT, never RPE self-report — a novice can't yet
// feel "one rep left," so ">~8 reps = too light" is the objective, teachable signal. Keeps the form-break stop.
function baselineDiscoveryCopy(isDeadlift: boolean): string {
  return (
    `No max yet — we FIND your working weight. Start at the bar and do a set. More than ~8 reps? Too light — ` +
    `rest ~2 min, add weight (upper +10–20 lb, lower +20–30 lb) and go again. When you land 3–6 hard, CLEAN ` +
    `reps, that's your test set — log it. Stop on any form break; never grind to failure alone.` +
    (isDeadlift ? ` (Deadlift e1RM reads conservative — a flat number isn't necessarily a flat lift [LeSuer 1997].)` : '')
  );
}
/** Exit retest week: one AMRAP session per key lift at a fixed ~88% (a 3–5RM zone; deadlift ≤5). */
function retestAmrapSessions(grid: { strength: string[] }): PlanSession[] {
  const lifts: { name: string; focus: 'upper' | 'lower' }[] = [
    { name: 'Bench Press', focus: 'upper' },
    { name: 'Back Squat', focus: 'lower' },
    { name: 'Overhead Press', focus: 'upper' },
    { name: 'Deadlift', focus: 'lower' },
  ];
  return lifts.map((l, i) => l && grid.strength[i] ? ({
    day: grid.strength[i],
    type: 'strength' as const,
    name: `Retest — ${l.name} (AMRAP → e1RM)`,
    description: amrapCopy(/deadlift/i.test(l.name)),
    duration: 45,
    // ONE working set only (warm-up is copy-guided + the logger's warm-up add-on) so the estimate can only
    // come from the scored AMRAP set. tag 1rm_test → the logger's cluster-e1RM + ratchet-up write-back.
    strength_exercises: [amrapTestSet(l.name, '88% 1RM')],
    tags: ['strength', l.focus, 'phase:retest', 'retest', '1rm_test', 'protocol:strength_primary'],
  }) : null).filter(Boolean) as PlanSession[];
}

// Q-126 (Gap A): a duration-native intensity token for a maintenance run, so its
// workload_planned reflects the easy/long prescription (0.65 via the Gap-B matcher)
// instead of the 0.75 per-type default. Vocabulary matches the race path + the
// materialize-plan token-parser at the substring level (`run_easy` / `easypace`).
function runIntensityToken(kind: 'easy' | 'long', durationMin: number): string {
  return kind === 'long'
    ? `longrun_${durationMin}min_easypace`
    : `run_easy_${durationMin}min`;
}

function enduranceSession(sport: 'run' | 'bike', day: string, isRetestWeek: boolean, overrideMins?: number, extraNote?: string, nameOverride?: string, kind: 'easy' | 'long' = 'easy'): PlanSession {
  const mins = overrideMins ?? (sport === 'bike' ? (isRetestWeek ? 35 : 45) : (isRetestWeek ? 25 : 35));
  const label = sport === 'bike' ? 'Easy Ride' : 'Easy Run';
  const base: PlanSession = {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: nameOverride ?? label,
    description: `~${mins} min easy aerobic, conversational — maintenance only (held so strength leads).${extraNote ?? ''}`,
    duration: mins,
    tags: ['easy', 'maintenance', 'aerobic'],
  };
  // Q-126: RUN-only token injection. Bike/ride is fenced to its own pass (Gap A-bike) —
  // it stays byte-identical (no steps_preset), same as before.
  if (sport === 'run') {
    return { ...base, steps_preset: [runIntensityToken(kind, mins)] };
  }
  return base;
}

/** Week-1 baseline test (NO-1RMs path): two NAMED "Baseline Test: Lower/Upper" sessions the logger
 *  recognizes by name — it runs the warmup-to-max flow and writes performance_numbers (the existing
 *  baseline path). Spread Mon/Thu, easy maintenance fills the rest. */
function baselineTestWeek(
  grid: { strength: string[]; endurance: string[] },
  enduranceSport: 'run' | 'bike' | null,
): PlanSession[] {
  const test = (day: string, region: 'Lower' | 'Upper', lifts: string[], focus: 'lower' | 'upper'): PlanSession => ({
    day, type: 'strength', name: `Baseline Test: ${region} Body`,
    description:
      `Establish your working weights (${lifts.join(' + ')}) — the same AMRAP test the block ends with, so ` +
      `entry and retest speak the same language. ${baselineDiscoveryCopy(lifts.some((l) => /deadlift/i.test(l)))}`,
    duration: 60,
    // No 1RM yet → no % to resolve. Seed each lift at the empty bar (deadlift higher) as a BARE-NUMBER lb
    // string so materialize passes it straight through (the pre-resolved-numeric path) instead of hunting a
    // missing anchor — that missing-anchor hunt is exactly what rendered the blank box. The athlete climbs
    // from this seed; the logged test set (not the seed) drives the e1RM. Same AMRAP shape + 1rm_test tag →
    // same cluster e1RM + ratchet-up guard as the exit retest (ONE pipeline, no separate baseline math).
    strength_exercises: lifts.map((name) => amrapTestSet(name, String(barStartLb(name)))),
    tags: ['strength', focus, 'phase:baseline', 'baseline_test', '1rm_test', 'protocol:strength_primary'],
  });
  const sessions: PlanSession[] = [
    test(grid.strength[0], 'Lower', ['Back Squat', 'Deadlift'], 'lower'),
    test(grid.strength[2] ?? grid.strength[1], 'Upper', ['Bench Press', 'Overhead Press'], 'upper'),
  ];
  if (enduranceSport) grid.endurance.forEach((day) => sessions.push(enduranceSession(enduranceSport, day, false)));
  sessions.sort((a, b) => DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]));
  return sessions;
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
  volume_notes: string | null;
  volume_state: 'above' | 'below' | 'in_band' | null;
} {
  const { durationWeeks, strengthFrequency, enduranceSport, enduranceFrequency } = args;
  const phaseStructure = buildArcPhases(durationWeeks);
  const grid = GRID[`${strengthFrequency}+${enduranceSport ? enduranceFrequency : 0}`]
    ?? GRID[`${strengthFrequency}+2`] ?? GRID['4+2'];

  // Maintenance-endurance band (run only): typed weekly miles → run volume, CLAMPED to the science band.
  // 60 / 150 weekly minutes = the 2-3×/wk × ~20-25 / ~40-min dose (CONVENTION on exact minutes; CITED on
  // freq/duration/interference — Hickson 1981/82, Spiering 2021, Wilson 2012), pace-mapped to miles. Flat,
  // no ramp. Honor up to the science, never past it: over-ask → capped max + note; under → bumped to floor.
  const FLOOR_MIN = 60;   // ~2×/wk maintenance dose floor [Hickson 1981, Spiering 2021] — CONVENTION on exact minutes
  // Ceiling = ~3hrs/wk. Interference scales with intensity/DURATION, not easy volume [Wilson 2012] — easy zone-2
  // is low-interference, so a tighter cap over-protects an established base. 180 lets a real 20-25mi runner sit
  // near true maintenance while strength still clearly leads. (Raised from 150; D-222.)
  const CEILING_MIN = 180;
  const FALLBACK_EASY_MIN_PER_MILE = 10; // if we haven't learned the athlete's easy pace, estimate rather than DROP the typed miles

  // Run frequency (2–4): strength-4 leaves only ~2 run-only days (Wed/Sat), so extra runs STACK onto the UPPER
  // lift days (Mon/Thu). Keeps extras off the heavy-LOWER days, and heavy-lift + easy-run is the safe recreational
  // stack [Petré 2021, Wilson 2012]. Stacking is also what opens enough slots to size runs sanely (not total÷2).
  const runFreq = enduranceSport === 'run'
    ? Math.max(grid.endurance.length, Math.min(4, Math.round(Number(args.enduranceFrequency) || grid.endurance.length)))
    : grid.endurance.length;
  const upperLiftDays = [grid.strength[0], grid.strength[2]].filter(Boolean); // Upper A, Upper B — the non-leg lift days
  // Long-run day = user pick CONSTRAINED to Sat/Sun. Heavy lower is fixed at Tue (squat) + Fri (hinge); only
  // the weekend clears the 24h-pre/48h-post windows (Sat = 4 days from Tue squat; Sun = 48h before it). A
  // Sunday pick moves the long run — and the Hyrox combo — to Sunday; anything else → the grid default (Sat).
  // (Option A: user-driven within what's safe. B = composer adjacency validation, C = optimizer routing are
  // the Q-088-lineage upgrades if the fixed strength grid ever unfixes — see docs.)
  const gridLongDefault = grid.endurance[grid.endurance.length - 1]; // 'Saturday'
  const pickedLong = String(args.longRunDay ?? '').trim().toLowerCase() === 'sunday' ? 'Sunday' : gridLongDefault;
  const enduranceDays = pickedLong === gridLongDefault ? grid.endurance : grid.endurance.map((d) => d === gridLongDefault ? pickedLong : d);
  const runDayList: string[] = [...enduranceDays];
  for (const d of upperLiftDays) { if (runDayList.length >= runFreq) break; if (!runDayList.includes(d)) runDayList.push(d); }
  const longRunDay = pickedLong; // the long run (and any Hyrox combo) lands here
  // Explain stacking ONCE — on the first lift+run day (week 1), silent everywhere after. Self-gates: if no run
  // stacks onto a lift day (e.g. 2 run days), there's nothing to explain and the note never appears.
  const firstStackedRunDay = runDayList
    .filter((d) => grid.strength.includes(d))
    .sort((a, b) => DAYS.indexOf(a as typeof DAYS[number]) - DAYS.indexOf(b as typeof DAYS[number]))[0];

  // Hyrox fatigued-legs combo day = the LONG-RUN day (Saturday). ~1 combo/week is the standard Hyrox dose,
  // and it's the ONLY slot that protects the heavy days: the heavy back squat (Tue) is 4 days away, and the
  // long run already carries the day's leg load — so the station piggybacks on existing fatigue rather than
  // adding a new leg day near the heavy work. long-run→station is the real compromised-running stimulus.
  // (Honest caveat: Sat is ~24h after the LIGHT Fri hinge day — low-volume deadlift + light front squat — not
  // the heavy squat; it adds volume to an already-loaded day, which the copy discloses.)
  const fatiguedLegsDay = (args.accessoryBias === 'hyrox' && enduranceSport === 'run') ? longRunDay : null;

  const runMinutesByDay: Record<string, number> = {};
  let volume_notes: string | null = null;
  // Mileage-band STATE for the client to render the honest tradeoff copy (the three copy strings live
  // client-side, unshipped until the Q-097 build). Server no longer caps/bumps — it reports the state.
  let volume_state: 'above' | 'below' | 'in_band' | null = null;
  // Honor typed miles whenever they exist — never silently drop them to the fixed default just because the
  // easy pace is unlearned. Missing pace → estimate + disclose (it re-maps once easy runs are logged).
  if (enduranceSport === 'run' && (args.targetWeeklyMiles ?? 0) > 0 && runDayList.length > 0) {
    const paceKnown = (args.easyPaceMinPerMile ?? 0) > 0;
    const pace = paceKnown ? args.easyPaceMinPerMile! : FALLBACK_EASY_MIN_PER_MILE;
    // Soft reference band — NOT a clamp (the D-222 hard ceiling is retired; mileage amendment 2026-07-01).
    // The interference literature puts no hard wall here: cost scales with total WORK and lands on POWER,
    // not max strength (Schumann 2022 max SMD −0.06 p=0.446 vs explosive −0.28 p=0.007; Fyfe 2016 —
    // endurance intensity does NOT mediate, total work does). HONOR the athlete's typed miles; surface the
    // honest tradeoff client-side (volume_state → the three copy strings), never cap or bump. Easy-intensity
    // guardrail STAYS: maintenance runs are all-easy zone-2 (enduranceSession) — loosen volume, hold
    // intensity [Wilson 2012]. A high-mileage HARD week is the only real interference case, gated by copy.
    const floor = Math.round(FLOOR_MIN / pace);
    const ceiling = Math.round(CEILING_MIN / pace);
    const asked = Math.round(args.targetWeeklyMiles!);
    const held = Math.max(1, asked); // honor typed miles exactly — no ceiling clamp, no floor bump
    volume_state = asked > ceiling ? 'above' : (asked < floor ? 'below' : 'in_band');
    // Pace-estimate disclosure is factual (not the tradeoff copy) — keep it server-side.
    if (!paceKnown) volume_notes = `Run durations estimated at ${FALLBACK_EASY_MIN_PER_MILE}:00/mi until we learn your easy pace — they re-map once you log a few easy runs.`;
    // spread the held total: long-run share + easy fill → per-day minutes; the long run goes on the run-only long day
    const perMile = distributeRunMiles(held, runDayList.length);
    const daysLongFirst = [longRunDay, ...runDayList.filter((d) => d !== longRunDay)];
    daysLongFirst.forEach((day, i) => {
      const mi = perMile[i] ?? perMile[perMile.length - 1];
      runMinutesByDay[day] = Math.max(15, Math.round(mi * pace));
    });
  }

  const sessions_by_week: Record<string, PlanSession[]> = {};

  for (let week = 1; week <= durationWeeks; week++) {
    const phase = phaseFor(week, phaseStructure.phases);
    const isRetestWeek = phase.name === 'Retest';
    const weekSessions: PlanSession[] = [];

    if (isRetestWeek) {
      // AMRAP retest — the SAME test shape as the entry baseline (one tool). Fixed ~88%, open reps → the
      // gain shows up as more reps. Logger clusters Epley+Brzycki and ratchet-UP-only writes the new 1RM.
      retestAmrapSessions(grid).forEach((s) => weekSessions.push(s));
    } else {
      // 4 real barbell sessions, continuous loading off the real 1RM.
      const load = workLoad(phase, week);
      workSessions(load).slice(0, grid.strength.length).forEach((s, i) => {
        // Accessory-bias slot: ONE per week, on Upper A only (interference-safe day), skipped on deload
        // (keep it byte-identical). +1 exercise max; NEVER touches the main lifts. Absent bias → the exact
        // pre-add-on output (ex === s.ex, no note, no bias tag).
        // Accessory-bias slot: BOTH glute + hyrox get a +1 accessory on Upper A (the movement-familiarity
        // station). Skipped on deload (byte-identical). +1 exercise max; NEVER touches the main lifts. Plain
        // (no bias) → the exact pre-add-on output. Hyrox ALSO gets the Saturday combo (below). The guard
        // protects the PLAIN plan, not Hyrox's own strength days.
        const bias = (args.accessoryBias && phase.name !== 'Deload' && s.name === 'Upper A')
          ? biasAccessoryFor(args.accessoryBias, week) : null;
        const ex = bias ? [...s.ex, bias] : s.ex;
        const biasNote = bias ? ` ${biasMicrocopy(args.accessoryBias!, enduranceSport)}` : '';
        weekSessions.push({
          day: grid.strength[i],
          type: 'strength',
          name: `Strength Focus — ${s.name}`,
          description:
            `${load.label} — 4-day split. ` +
            `${ex.map((e) => `${e.name} ${e.sets}×${e.reps} @ ${e.weight}`).join(' · ')}. Top set ${load.primary.pct}% 1RM.${biasNote}`,
          duration: 60,
          strength_exercises: ex,
          tags: ['strength', s.focus, `phase:${phase.name.toLowerCase()}`, 'protocol:strength_primary', ...(bias ? [`bias:${args.accessoryBias}`] : [])],
        });
      });
    }

    // Endurance = maintenance, underneath. Runs spread across runDayList (run-only days + stacked upper days),
    // each with its distributed duration; bike keeps its off-day default.
    if (enduranceSport === 'run') {
      runDayList.forEach((day) => {
        // The one-time "how stacked days work" note: week 1, first lift+run day only.
        const note = (week === 1 && day === firstStackedRunDay)
          ? ` On a lift + run day, lift first — then the easy run. Run later in the day if you can (a few hours), but back-to-back is fine; your runs are easy [Petré 2021].`
          : undefined;
        // Hyrox fatigued-legs combo (work weeks only): on the LONG-RUN day, append a station AFTER the long
        // run (run-first — see the sort). The long run is NOT shortened — it IS the fatigue source. Non-hyrox
        // → fatiguedLegsDay is null → this branch is inert and the run push below is byte-identical to plain.
        const isFatigued = day === fatiguedLegsDay && !isRetestWeek && phase.name !== 'Deload';
        // Phase-1 combo clarity (copy only): retitle the pair as "1 of 2" / "2 of 2" so the calendar reads
        // as one session in two parts; the grouped-card UI is phase 2 (client bundle, post-Q-097).
        const fatNote = isFatigued ? ' This run loads your legs for part 2 — start the station within ~10 min of finishing.' : '';
        weekSessions.push(enduranceSession('run', day, false, runMinutesByDay[day], (`${note ?? ''}${fatNote}`) || undefined,
          isFatigued ? 'Combo 1 of 2 — Long run' : undefined,
          day === longRunDay ? 'long' : 'easy'));
        if (isFatigued) {
          const st = fatiguedLegsStation(week);
          weekSessions.push({
            day, type: 'strength',
            name: 'Combo 2 of 2 — Fatigued-legs station · start within ~10 min of finishing the run',
            description: `${st.name} ${st.sets}×${st.reps} @ ${st.weight} — on tired legs, that's the point. The Hyrox run→station stimulus; handle the load fatigued, not for a faster finish. This ADDS volume (the Hyrox opt-in). To rehearse the real event, aim for ~2 dedicated station sessions a month at a Hyrox-equipped gym.`,
            duration: 30, strength_exercises: [st],
            tags: ['strength', 'lower', 'fatigued_legs', 'bias:hyrox', 'protocol:strength_primary'],
          });
        }
      });
    } else if (enduranceSport) {
      grid.endurance.forEach((day) => weekSessions.push(enduranceSession(enduranceSport, day, false, undefined)));
    }

    weekSessions.sort((a, b) => {
      const d = DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]);
      if (d !== 0) return d;
      // Same day: LIFT FIRST — strength is the goal, so it gets the fresh adaptive signal; the easy
      // maintenance run follows [Eddens 2018, Zhang 2026, Tundidor-Duque 2026]. EXCEPTION: the Hyrox
      // fatigued-legs station sorts AFTER the run (that's the whole point — station on tired legs).
      const ord = (s: PlanSession) => (s.tags ?? []).includes('fatigued_legs') ? 2 : (s.type === 'strength' ? 0 : 1);
      return ord(a) - ord(b);
    });
    sessions_by_week[String(week)] = weekSessions;
  }

  // "Do you know your 1RMs?" → NO: week 1 IS a baseline test (offered, not forced). It replaces the arc's
  // week-1 base session (which can't load % without an anchor anyway); weeks 2-12 train off the result.
  // The named "Baseline Test: Lower/Upper" sessions flow through the logger's baseline path (writes
  // performance_numbers), then UnifiedWorkoutView re-materializes the % weeks.
  if (args.needsBaseline) {
    sessions_by_week['1'] = baselineTestWeek(grid, enduranceSport);
  }

  const enduranceNote = enduranceSport
    ? ` ${enduranceSport === 'bike' ? 'Riding' : 'Running'} held at maintenance underneath.`
    : '';
  return {
    name: args.goalName?.trim() || `Get Stronger — ${durationWeeks} Weeks`,
    description:
      `Strength-led ATR block on heavy barbell compounds (balanced upper/lower): accumulate → ` +
      `intensify → deload → peak, ending in an AMRAP retest — one all-out set per lift at a fixed ~88%, reps ` +
      `open, so more reps than baseline reads as your gain (measured, not assumed).${enduranceNote} Expect a ` +
      `MEASURED gain — concurrent strength gains are real but modest (typically a few %); honest progression, ` +
      `not a hyped PR. The athlete picks the outcome; the engine runs the arc.`,
    duration_weeks: durationWeeks,
    sessions_by_week,
    phaseStructure,
    volume_notes,
    volume_state,
  };
}
