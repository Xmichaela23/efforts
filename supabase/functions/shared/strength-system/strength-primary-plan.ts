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

/**
 * Retest week (HAS-1RMs default): an OPTIONAL COURTESY, not a 4-lift max-out ceremony. The peak week
 * already did the heavy near-max work, so this is sparing:
 *   - Squat + Bench = a light, OPTIONAL max-CHECK that EXPRESSES the gain — work up to a SMALL PR
 *     above the old max (~102.5%), so it renders ABOVE the peak single (fixes retest-below-peak).
 *   - Deadlift + OHP = a top working set → ESTIMATE the e1RM (Epley/Brzycki). No formal max-out.
 * (The HAS/NO-1RM conditional — required up-front baseline when there's no anchor — is a create-goal
 * gate that depends on the write-back wire, Q-097.)
 */
function retestSessions(): { name: string; focus: 'upper' | 'lower'; kind: 'check' | 'estimate'; ex: StrengthExercise[] }[] {
  return [
    { name: 'Bench Press', focus: 'upper', kind: 'check', ex: [{ name: 'Bench Press — optional max-check (aim small PR)', sets: 1, reps: 1, weight: '102.5% 1RM' }] },
    { name: 'Back Squat', focus: 'lower', kind: 'check', ex: [{ name: 'Back Squat — optional max-check (aim small PR)', sets: 1, reps: 1, weight: '102.5% 1RM' }] },
    { name: 'Overhead Press', focus: 'upper', kind: 'estimate', ex: [{ name: 'Overhead Press — top working set', sets: 1, reps: 3, weight: '88% 1RM' }] },
    { name: 'Deadlift', focus: 'lower', kind: 'estimate', ex: [{ name: 'Deadlift — top working set', sets: 1, reps: 3, weight: '88% 1RM' }] },
  ];
}

function enduranceSession(sport: 'run' | 'bike', day: string, isRetestWeek: boolean, overrideMins?: number): PlanSession {
  const mins = overrideMins ?? (sport === 'bike' ? (isRetestWeek ? 35 : 45) : (isRetestWeek ? 25 : 35));
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
      `Establish your 1RMs — warm up, then work up to a heavy set on ${lifts.join(' + ')}. The app reads ` +
      `it as your max (no % yet; this sets the numbers the rest of the block loads off).`,
    duration: 60,
    strength_exercises: lifts.map((name) => ({ name, sets: 1, reps: 3, weight: 'work up to a heavy 3' })),
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
  const runDayList: string[] = [...grid.endurance];
  for (const d of upperLiftDays) { if (runDayList.length >= runFreq) break; if (!runDayList.includes(d)) runDayList.push(d); }
  const longRunDay = grid.endurance[grid.endurance.length - 1] ?? runDayList[runDayList.length - 1]; // the long run lands on a run-only day (Sat)

  const runMinutesByDay: Record<string, number> = {};
  let volume_notes: string | null = null;
  // Honor typed miles whenever they exist — never silently drop them to the fixed default just because the
  // easy pace is unlearned. Missing pace → estimate + disclose (it re-maps once easy runs are logged).
  if (enduranceSport === 'run' && (args.targetWeeklyMiles ?? 0) > 0 && runDayList.length > 0) {
    const paceKnown = (args.easyPaceMinPerMile ?? 0) > 0;
    const pace = paceKnown ? args.easyPaceMinPerMile! : FALLBACK_EASY_MIN_PER_MILE;
    const floor = Math.round(FLOOR_MIN / pace);
    const ceiling = Math.round(CEILING_MIN / pace);
    const asked = Math.round(args.targetWeeklyMiles!);
    const held = Math.max(floor, Math.min(ceiling, asked));
    if (asked > ceiling) volume_notes = `Held to ${ceiling} mi/wk — in a strength-focus block, easy running past ~3hrs/wk competes with lifting recovery; we hold it so strength leads. [Wilson 2012]`;
    else if (asked < floor) volume_notes = `Bumped to ${floor} mi/wk — below this you'd lose aerobic base; this floor holds it. [Hickson 1981, Spiering 2021]`;
    if (!paceKnown) volume_notes = `${volume_notes ? volume_notes + ' ' : ''}Run durations estimated at ${FALLBACK_EASY_MIN_PER_MILE}:00/mi until we learn your easy pace — they re-map once you log a few easy runs.`;
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
      // #3 — retest: ramp to a heavy single on each main lift. NOT a deload.
      retestSessions().slice(0, grid.strength.length).forEach((s, i) => {
        const isCheck = s.kind === 'check';
        weekSessions.push({
          day: grid.strength[i],
          type: 'strength',
          name: isCheck
            ? `Retest — ${s.name} (optional courtesy max-check)`
            : `Retest — ${s.name} (top working set → estimate e1RM)`,
          description: isCheck
            ? `Optional courtesy check — you already have a baseline, so this is "see your new max if ` +
              `you want." Feeling fresh? Work up to a heavy single and aim for a SMALL PR above your old ` +
              `max (~102.5%); the engine logs your new 1RM. Not feeling it? A light top set is fine — no ` +
              `grinding, no spotter-less max-out.`
            : `Top working set — one heavy set of 3 near your working max; the engine ESTIMATES your ` +
              `e1RM from it (Epley/Brzycki, ±3–5%). No formal max-out on this lift.`,
          duration: 60,
          strength_exercises: s.ex,
          // 1rm_test / estimate_1rm so logging feeds the e1RM write-back (Q-097); 'optional' on the courtesy check.
          tags: ['strength', s.focus, 'phase:retest', 'retest', '1rm_test', 'estimate_1rm', 'protocol:strength_primary', ...(isCheck ? ['optional'] : [])],
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
            `${s.ex.map((e) => `${e.name} ${e.sets}×${e.reps} @ ${e.weight}`).join(' · ')}. Top set ${load.primary.pct}% 1RM.`,
          duration: 60,
          strength_exercises: s.ex,
          tags: ['strength', s.focus, `phase:${phase.name.toLowerCase()}`, 'protocol:strength_primary'],
        });
      });
    }

    // Endurance = maintenance, underneath. Runs spread across runDayList (run-only days + stacked upper days),
    // each with its distributed duration; bike keeps its off-day default.
    if (enduranceSport === 'run') {
      runDayList.forEach((day) => weekSessions.push(enduranceSession('run', day, isRetestWeek, runMinutesByDay[day])));
    } else if (enduranceSport) {
      grid.endurance.forEach((day) => weekSessions.push(enduranceSession(enduranceSport, day, isRetestWeek, undefined)));
    }

    weekSessions.sort((a, b) => {
      const d = DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]);
      if (d !== 0) return d;
      // Same day (a stacked lift+run): LIFT FIRST — strength is the goal, so it gets the fresh adaptive
      // signal; the easy maintenance run follows [Eddens 2018, Zhang 2026, Tundidor-Duque 2026].
      return (a.type === 'strength' ? 0 : 1) - (b.type === 'strength' ? 0 : 1);
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
      `intensify → deload → peak, ending in an OPTIONAL courtesy 1RM check on the key lifts (you have ` +
      `a baseline) — a small PR if you're fresh, estimates from working sets on the rest; no mandatory ` +
      `max-out.${enduranceNote} Expect a MEASURED gain — concurrent strength gains are ` +
      `real but modest (typically a few %); honest progression, not a hyped PR. The athlete picks the ` +
      `outcome; the engine runs the arc.`,
    duration_weeks: durationWeeks,
    sessions_by_week,
    phaseStructure,
    volume_notes,
  };
}
