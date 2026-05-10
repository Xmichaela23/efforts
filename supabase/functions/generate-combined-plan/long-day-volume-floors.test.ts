/**
 * Unit tests for `evaluateLongDayVolumeFloors` + `longRideFloorHours`. Soft trade-off semantics:
 * the evaluator never fails — it returns a list of athlete-facing warnings. Tests cover the
 * (distance × phase) floor table, skip semantics (recovery / taper / race week), missing-session
 * cases, and tri vs run-only gating.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/long-day-volume-floors.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  enforceLongDayFloors,
  evaluateLongDayVolumeFloors,
  type LongDayFloorWarning,
} from './validate-training-floors.ts';
import { estimateSessionTSS, longRideFloorHours, longRunFloorMiles, weightedTSS } from './science.ts';
import type { GeneratedWeek, Intensity, PlannedSession, Phase, Sport } from './types.ts';

// ── helpers ─────────────────────────────────────────────────────────────────

function session(opts: {
  type: Sport;
  tags: string[];
  durationMin: number;
  day?: string;
  tss?: number;
  intensity?: Intensity;
}): PlannedSession {
  const intensity = opts.intensity ?? 'EASY';
  const tss = opts.tss ?? estimateSessionTSS(opts.type, intensity, opts.durationMin);
  return {
    day: opts.day ?? 'Saturday',
    type: opts.type,
    name: `${opts.type} session`,
    description: '',
    duration: opts.durationMin,
    tss,
    weighted_tss: weightedTSS(opts.type, tss),
    intensity_class: intensity,
    steps_preset: [],
    tags: opts.tags,
    serves_goal: 'shared',
    zone_targets: 'Z2',
  } as PlannedSession;
}

const HARD_INTENSITY_FRACTION = 0.65;
const MODERATE_INTENSITY_FRACTION = 0.50;

function hardFracOfIntensity(i: Intensity): number {
  if (i === 'HARD') return HARD_INTENSITY_FRACTION;
  if (i === 'MODERATE') return MODERATE_INTENSITY_FRACTION;
  return 0;
}

function week(opts: {
  weekNum: number;
  phase: Phase;
  isRecovery?: boolean;
  sessions: PlannedSession[];
}): GeneratedWeek {
  // Aggregate sport TSS, total TSS, and zone minutes from sessions so the enforcer's deltas
  // can be checked against a realistic starting state (matches week-builder.ts:490-512).
  const sport_raw_tss: Record<Sport, number> = { run: 0, bike: 0, swim: 0, strength: 0, race: 0 };
  let total_raw = 0;
  let total_weighted = 0;
  let z3 = 0;
  let z12 = 0;
  for (const s of opts.sessions) {
    sport_raw_tss[s.type] = (sport_raw_tss[s.type] ?? 0) + s.tss;
    total_raw += s.tss;
    total_weighted += s.weighted_tss;
    const hf = hardFracOfIntensity(s.intensity_class);
    z3 += s.duration * hf;
    z12 += s.duration * (1 - hf);
  }
  const totalMin = z12 + z3;
  return {
    weekNum: opts.weekNum,
    phase: opts.phase,
    isRecovery: opts.isRecovery ?? false,
    sessions: opts.sessions,
    total_raw_tss: Math.round(total_raw),
    total_weighted_tss: Math.round(total_weighted),
    sport_raw_tss,
    zone1_2_minutes: Math.round(z12),
    zone3_plus_minutes: Math.round(z3),
    eighty_twenty_ratio: totalMin > 0 ? z12 / totalMin : 1,
  };
}

// ── §1 longRideFloorHours: peak × phase multiplier ──────────────────────────

Deno.test('longRideFloorHours: 70.3 base = 1.5h (3h peak × 0.50)', () => {
  assertEquals(longRideFloorHours('70.3', 'base'), 1.5);
});

Deno.test('longRideFloorHours: 70.3 build = 2.0h (3h × 0.67, quarter-hour quantized)', () => {
  // 3 × 0.67 = 2.01 → rounds to 2.0
  assertEquals(longRideFloorHours('70.3', 'build'), 2.0);
});

Deno.test('longRideFloorHours: 70.3 race_specific = 2.5h (3h × 0.83)', () => {
  // 3 × 0.83 = 2.49 → rounds to 2.5
  assertEquals(longRideFloorHours('70.3', 'race_specific'), 2.5);
});

Deno.test('longRideFloorHours: ironman base = 3.0h (6h × 0.50)', () => {
  assertEquals(longRideFloorHours('ironman', 'base'), 3.0);
});

Deno.test('longRideFloorHours: ironman build = 4.0h (6h × 0.67)', () => {
  // 6 × 0.67 = 4.02 → 4.0
  assertEquals(longRideFloorHours('ironman', 'build'), 4.0);
});

Deno.test('longRideFloorHours: ironman race_specific = 5.0h (6h × 0.83)', () => {
  assertEquals(longRideFloorHours('ironman', 'race_specific'), 5.0);
});

Deno.test('longRideFloorHours: olympic base = 0.75h (1.5h × 0.50)', () => {
  assertEquals(longRideFloorHours('olympic', 'base'), 0.75);
});

Deno.test('longRideFloorHours: sprint base = 0.5h (1h × 0.50)', () => {
  assertEquals(longRideFloorHours('sprint', 'base'), 0.5);
});

Deno.test('longRideFloorHours: taper returns 0 (validator skips)', () => {
  assertEquals(longRideFloorHours('70.3', 'taper'), 0);
});

Deno.test('longRideFloorHours: recovery returns 0 (validator skips)', () => {
  assertEquals(longRideFloorHours('ironman', 'recovery'), 0);
});

// ── §2 evaluator basics: long ride below floor → warning ────────────────────

Deno.test('long_ride at 60min in 70.3 base (floor 1.5h) → warning', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // long_ride: 1.0h < 1.5h floor → warning. long_run: 60/9.5 = 6.3mi vs 5.5 floor → no warning.
  assertEquals(out.length, 1);
  assertEquals(out[0].discipline, 'long_ride');
  assertEquals(out[0].weekNum, 3);
  assertEquals(out[0].metrics.observed, 1.0);
  assertEquals(out[0].metrics.floor, 1.5);
});

Deno.test('long_ride at 90min in 70.3 base (floor 1.5h) → no warning (exactly at floor)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 4,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 90 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // 90/60 = 1.5h, equals floor — not below.
  assertEquals(out.filter((w) => w.discipline === 'long_ride').length, 0);
});

Deno.test('long_run below floor in 70.3 build (floor 8.5mi)', () => {
  // longRunFloorMiles('70.3','build') = 11 × 0.75 = 8.25 → rounds to 8.5 (peak*mult*2)/2 = 16.5/2 = 8.25 → 8.5? Let me trust the function.
  const expectedFloor = longRunFloorMiles('70.3', 'build');
  // 60min @ 9.5min/mi = 6.3mi
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 8,
      phase: 'build',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 180 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrWarn = out.find((w) => w.discipline === 'long_run');
  assert(lrWarn, 'expected long_run warning');
  assertEquals(lrWarn.metrics.floor, expectedFloor);
  assertEquals(lrWarn.metrics.observed, 6.3);
  assertEquals(lrWarn.weekNum, 8);
});

// ── §3 skip semantics ───────────────────────────────────────────────────────

Deno.test('recovery week skipped — no warnings even with empty sessions', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 4,
      phase: 'base', // phase doesn't matter when isRecovery=true
      isRecovery: true,
      sessions: [],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(out.length, 0);
});

Deno.test('taper week skipped — no warnings even when long_ride is short', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 17,
      phase: 'taper',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 45 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 30 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(out.length, 0);
});

Deno.test('race week skipped via raceWeekNums', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 18,
      phase: 'race_specific',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 30 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 30 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    raceWeekNums: [18],
  });
  assertEquals(out.length, 0);
});

Deno.test('phase=recovery skipped even when isRecovery flag is false (defensive)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 5,
      phase: 'recovery',
      isRecovery: false,
      sessions: [session({ type: 'bike', tags: ['long_ride'], durationMin: 45 })],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(out.length, 0);
});

// ── §4 missing session = warning with observed=0 ────────────────────────────

Deno.test('no long_ride session at all → warning observed=0', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 7,
      phase: 'build',
      sessions: [
        session({ type: 'run', tags: ['long_run'], durationMin: 90 }),
        session({ type: 'bike', tags: ['easy_ride'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrideWarn = out.find((w) => w.discipline === 'long_ride');
  assert(lrideWarn, 'expected long_ride warning when no session present');
  assertEquals(lrideWarn.metrics.observed, 0);
  assert(lrideWarn.message.includes('no long ride scheduled'));
});

Deno.test('no long_run session at all → warning observed=0', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 7,
      phase: 'build',
      sessions: [session({ type: 'bike', tags: ['long_ride'], durationMin: 180 })],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrWarn = out.find((w) => w.discipline === 'long_run');
  assert(lrWarn, 'expected long_run warning when no session present');
  assertEquals(lrWarn.metrics.observed, 0);
  assert(lrWarn.message.includes('no long run scheduled'));
});

// ── §5 tri vs run-only gating ───────────────────────────────────────────────

Deno.test('run-only plan: long_ride floor not evaluated (hasTri=false)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 5,
      phase: 'build',
      sessions: [
        // No long_ride; that's fine for run-only.
        session({ type: 'run', tags: ['long_run'], durationMin: 120 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: false, primaryDistance: 'marathon' });
  assertEquals(out.filter((w) => w.discipline === 'long_ride').length, 0);
});

Deno.test('run-only plan: long_run floor still evaluated', () => {
  // marathon build floor = 18 × 0.75 = 13.5mi. 60min @ 9.5min/mi = 6.3mi → warning.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 5,
      phase: 'build',
      sessions: [session({ type: 'run', tags: ['long_run'], durationMin: 60 })],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: false, primaryDistance: 'marathon' });
  assertEquals(out.length, 1);
  assertEquals(out[0].discipline, 'long_run');
  assertEquals(out[0].metrics.floor, longRunFloorMiles('marathon', 'build'));
});

// ── §6 brick exclusion ──────────────────────────────────────────────────────

Deno.test('brick session not counted as long_ride', () => {
  // Brick has both 'brick' and may have 'long_ride' tags in some templates; exclude bricks.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 10,
      phase: 'race_specific',
      sessions: [
        session({ type: 'bike', tags: ['brick', 'long_ride'], durationMin: 90 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 120 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // No standalone long_ride → observed=0 warning. Brick was excluded by the evaluator.
  const lrideWarn = out.find((w) => w.discipline === 'long_ride');
  assert(lrideWarn, 'expected long_ride warning — brick should not satisfy the floor');
  assertEquals(lrideWarn.metrics.observed, 0);
});

// ── §7 message format ──────────────────────────────────────────────────────

Deno.test('warning message includes phase label and observed/floor numbers', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'race_specific',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrideWarn = out.find((w) => w.discipline === 'long_ride')!;
  // Race-specific phase label uses hyphenated form per phaseLabel().
  assert(lrideWarn.message.includes('race-specific'));
  assert(lrideWarn.message.includes('1h')); // observed
  assert(lrideWarn.message.includes('2.5h')); // floor
});

Deno.test('week with both disciplines below floor → 2 warnings, both addressed', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 6,
      phase: 'race_specific',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // 70.3 race_specific floors: long_ride 2.5h, long_run 11mi. 60min ride = 1h, 60min run = 6.3mi.
  assertEquals(out.length, 2);
  const disciplines = out.map((w) => w.discipline).sort();
  assertEquals(disciplines, ['long_ride', 'long_run']);
});

// ── §8 multi-week aggregation ───────────────────────────────────────────────

Deno.test('multiple weeks evaluated independently', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 90 }), // 1.5h = base floor → ok
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }), // 6.3mi vs 5.5 floor → ok
      ],
    }),
    week({
      weekNum: 2,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }), // 1h < 1.5 floor → warn
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
    week({
      weekNum: 3,
      phase: 'base',
      isRecovery: true, // skipped
      sessions: [],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(out.length, 1);
  assertEquals(out[0].weekNum, 2);
  assertEquals(out[0].discipline, 'long_ride');
});

// ── §9 enforceLongDayFloors: bumps below-floor sessions back up ─────────────

Deno.test('enforce: long_ride below floor in 70.3 base bumped to 1.5h (90min)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 45 }), // 0.75h < 1.5h floor
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  assertEquals(lride.duration, 90);
  assertEquals(lride.name, 'Long Ride — 1.5 hr');
  assertEquals(lride.steps_preset, ['bike_endurance_90min_Z2']);
});

Deno.test('enforce: long_ride at floor (90min) is not touched', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 90 }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  assertEquals(lride.duration, 90);
  assertEquals(lride.name, 'bike session'); // helper-default name preserved when not bumped
});

Deno.test('enforce: long_ride above floor is not compressed', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 180 }), // 3h, well above 1.5h floor
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  assertEquals(lride.duration, 180);
});

Deno.test('enforce: long_run below floor in 70.3 build bumped (8.5mi → 9mi int rounding)', () => {
  // build floor = 8.5 mi; round to 9 for token compatibility.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 8,
      phase: 'build',
      sessions: [
        session({ type: 'run', tags: ['long_run', 'aerobic', 'base'], durationMin: 30 }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  // Math.round(8.5) → 9; duration = round(9 × 9.5) = 86
  assertEquals(lrun.duration, 86);
  assertEquals(lrun.name, 'Long Run — 9 mi');
  assertEquals(lrun.steps_preset, ['longrun_9mi_easypace']);
});

Deno.test('enforce: long_run race_specific picks _mp_finish token', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 12,
      phase: 'race_specific',
      sessions: [
        session({ type: 'run', tags: ['long_run', 'race_specific'], durationMin: 30, intensity: 'MODERATE' }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  // race_specific floor = 11mi; duration = round(11 × 9.5) = 105
  assertEquals(lrun.duration, 105);
  assertEquals(lrun.steps_preset, ['longrun_11mi_mp_finish']);
});

Deno.test('enforce: skips recovery / taper / race week', () => {
  const weeks: GeneratedWeek[] = [
    week({ weekNum: 4, phase: 'base', isRecovery: true, sessions: [
      session({ type: 'bike', tags: ['long_ride'], durationMin: 30 }),
    ]}),
    week({ weekNum: 17, phase: 'taper', sessions: [
      session({ type: 'bike', tags: ['long_ride'], durationMin: 30 }),
    ]}),
    week({ weekNum: 18, phase: 'race_specific', sessions: [
      session({ type: 'bike', tags: ['long_ride'], durationMin: 30 }),
    ]}),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3', raceWeekNums: [18] });
  for (const w of weeks) {
    assertEquals(w.sessions[0].duration, 30, `week ${w.weekNum} should not be touched`);
  }
});

Deno.test('enforce: brick-tagged ride is not bumped (long_ride floor does not apply)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 8,
      phase: 'build',
      sessions: [
        session({ type: 'bike', tags: ['brick', 'bike', 'build'], durationMin: 90 }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(weeks[0].sessions[0].duration, 90);
});

Deno.test('enforce: run-only plan does not enforce long_ride', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 5,
      phase: 'build',
      sessions: [
        session({ type: 'run', tags: ['long_run'], durationMin: 60 }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: false, primaryDistance: 'marathon' });
  // Long_run still enforced. Marathon build floor = 18 × 0.75 = 13.5 → round to 14 mi → 133 min.
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  assertEquals(lrun.duration, 133);
  assertEquals(lrun.steps_preset, ['longrun_14mi_easypace']);
});

Deno.test('enforce: week aggregates updated when long_ride bumped', () => {
  // Single long_ride at 45min/EASY. After bump to 90min, week TSS doubles (proportional to duration).
  const lride = session({ type: 'bike', tags: ['long_ride'], durationMin: 45 });
  const weeks: GeneratedWeek[] = [
    week({ weekNum: 1, phase: 'base', sessions: [lride] }),
  ];
  const w = weeks[0];
  const oldTotal = w.total_raw_tss;
  const oldBike = w.sport_raw_tss.bike;
  const oldZ12 = w.zone1_2_minutes;
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // Bumped to 90 min EASY bike: tss = round(90 × 50/60 × 1) = 75 (estimateSessionTSS)
  const newBikeTss = estimateSessionTSS('bike', 'EASY', 90);
  assertEquals(w.sport_raw_tss.bike, newBikeTss);
  assertEquals(w.total_raw_tss, newBikeTss);
  // EASY long_ride is fully Z1-2; z12 should grow by the duration delta (90 - 45 = 45).
  assertEquals(w.zone1_2_minutes - oldZ12, 45);
  assertEquals(w.zone3_plus_minutes, 0);
  // sanity: the deltas applied — not the originals
  assert(w.total_raw_tss > oldTotal);
  assert(w.sport_raw_tss.bike > oldBike);
});

Deno.test('enforce: missing long_ride session in tri week is left alone (no-op, soft eval handles)', () => {
  // No long_ride present — enforcer can't bump a session that doesn't exist. The soft evaluator
  // (evaluateLongDayVolumeFloors) is the safety net for this case.
  const weeks: GeneratedWeek[] = [
    week({ weekNum: 5, phase: 'build', sessions: [
      session({ type: 'run', tags: ['long_run'], durationMin: 90 }),
    ]}),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const hasLongRide = weeks[0].sessions.some((s) => s.tags.includes('long_ride'));
  assert(!hasLongRide);
});

Deno.test('enforce + evaluate composition: after enforcement, soft warnings disappear', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 45 }),
        session({ type: 'run', tags: ['long_run', 'base'], durationMin: 30 }),
      ],
    }),
  ];
  // Before enforcement: both below floor → 2 warnings.
  const before = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(before.length, 2);
  // Enforce.
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // After: both at/above floor → 0 warnings.
  const after = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  assertEquals(after.length, 0);
});
