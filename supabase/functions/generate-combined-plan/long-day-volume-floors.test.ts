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
  effectiveLongRideFloorHours,
  effectiveLongRunFloorMiles,
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

Deno.test('longRideFloorHours: 70.3 base = 2.25h (3h peak × 0.75)', () => {
  assertEquals(longRideFloorHours('70.3', 'base'), 2.25);
});

Deno.test('longRideFloorHours: 70.3 build = 2.5h (3h × 0.85, quarter-hour quantized)', () => {
  // 3 × 0.85 = 2.55 → round(10.2)/4 = 2.5
  assertEquals(longRideFloorHours('70.3', 'build'), 2.5);
});

Deno.test('longRideFloorHours: 70.3 race_specific = 3.0h (3h × 1.00)', () => {
  assertEquals(longRideFloorHours('70.3', 'race_specific'), 3.0);
});

Deno.test('longRideFloorHours: ironman base = 4.5h (6h × 0.75)', () => {
  assertEquals(longRideFloorHours('ironman', 'base'), 4.5);
});

Deno.test('longRideFloorHours: ironman build = 5.0h (6h × 0.85, quarter-hour quantized)', () => {
  // 6 × 0.85 = 5.10 → round(20.4)/4 = 5.0
  assertEquals(longRideFloorHours('ironman', 'build'), 5.0);
});

Deno.test('longRideFloorHours: ironman race_specific = 6.0h (6h × 1.00)', () => {
  assertEquals(longRideFloorHours('ironman', 'race_specific'), 6.0);
});

Deno.test('longRideFloorHours: olympic base = 1.25h (1.5h × 0.75)', () => {
  // 1.5 × 0.75 = 1.125 → round(4.5)/4 = 1.25
  assertEquals(longRideFloorHours('olympic', 'base'), 1.25);
});

Deno.test('longRideFloorHours: sprint base = 0.75h (1h × 0.75)', () => {
  assertEquals(longRideFloorHours('sprint', 'base'), 0.75);
});

Deno.test('longRideFloorHours: taper returns 0 (validator skips)', () => {
  assertEquals(longRideFloorHours('70.3', 'taper'), 0);
});

Deno.test('longRideFloorHours: recovery returns 0 (validator skips)', () => {
  assertEquals(longRideFloorHours('ironman', 'recovery'), 0);
});

// ── §2 evaluator basics: long ride below floor → warning ────────────────────

Deno.test('long_ride at 60min in 70.3 base (floor 2.25h) → warning', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 90 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // long_ride: 1.0h < 2.25h floor → warning. long_run: 90/9.5 = 9.5mi vs 8.5 floor → no warning.
  assertEquals(out.length, 1);
  assertEquals(out[0].discipline, 'long_ride');
  assertEquals(out[0].weekNum, 3);
  assertEquals(out[0].metrics.observed, 1.0);
  assertEquals(out[0].metrics.floor, 2.25);
});

Deno.test('long_ride at 135min in 70.3 base (floor 2.25h) → no warning (exactly at floor)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 4,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 135 }),
        session({ type: 'run', tags: ['long_run'], durationMin: 90 }),
      ],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // 135/60 = 2.25h, equals floor — not below.
  assertEquals(out.filter((w) => w.discipline === 'long_ride').length, 0);
});

Deno.test('long_run below floor in 70.3 build (floor 9.5mi)', () => {
  // longRunFloorMiles('70.3','build') = 11 × 0.85 = 9.35 → round(18.7)/2 = 9.5
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
  assert(lrideWarn.message.includes('3h')); // floor (3.0 → "3" via JS number stringification)
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
        session({ type: 'bike', tags: ['long_ride'], durationMin: 135 }), // 2.25h = base floor → ok
        session({ type: 'run', tags: ['long_run'], durationMin: 90 }), // 9.5mi vs 8.5 floor → ok
      ],
    }),
    week({
      weekNum: 2,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 60 }), // 1h < 2.25 floor → warn
        session({ type: 'run', tags: ['long_run'], durationMin: 90 }),
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

Deno.test('enforce: long_ride below floor in 70.3 base bumped to 2.25h (135min)', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 45 }), // 0.75h < 2.25h floor
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  assertEquals(lride.duration, 135);
  assertEquals(lride.name, 'Long Ride — 2.3 hr'); // (2.25).toFixed(1) → "2.3"
  assertEquals(lride.steps_preset, ['bike_endurance_135min_Z2']);
});

Deno.test('enforce: long_ride at floor (135min) is not touched', () => {
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [
        session({ type: 'bike', tags: ['long_ride'], durationMin: 135 }),
      ],
    }),
  ];
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  assertEquals(lride.duration, 135);
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

Deno.test('enforce: long_run below floor in 70.3 build bumped (9.5mi → 10mi int rounding)', () => {
  // build floor = 11 × 0.85 = 9.35 → round half = 9.5; round to int = 10 for token compatibility.
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
  // Math.round(9.5) → 10; duration = round(10 × 9.5) = 95
  assertEquals(lrun.duration, 95);
  assertEquals(lrun.name, 'Long Run — 10 mi');
  assertEquals(lrun.steps_preset, ['longrun_10mi_easypace']);
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
  // Long_run still enforced. Marathon build floor = 18 × 0.85 = 15.3 → 15.5 (half-mi);
  // round to 16 mi → 152 min.
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  assertEquals(lrun.duration, 152);
  assertEquals(lrun.steps_preset, ['longrun_16mi_easypace']);
});

Deno.test('enforce: week aggregates updated when long_ride bumped', () => {
  // Single long_ride at 45min/EASY. After bump to 135min (2.25h base floor), week TSS triples.
  const lride = session({ type: 'bike', tags: ['long_ride'], durationMin: 45 });
  const weeks: GeneratedWeek[] = [
    week({ weekNum: 1, phase: 'base', sessions: [lride] }),
  ];
  const w = weeks[0];
  const oldTotal = w.total_raw_tss;
  const oldBike = w.sport_raw_tss.bike;
  const oldZ12 = w.zone1_2_minutes;
  enforceLongDayFloors(weeks, { hasTri: true, primaryDistance: '70.3' });
  // Bumped to 135 min EASY bike: estimateSessionTSS('bike','EASY',135).
  const newBikeTss = estimateSessionTSS('bike', 'EASY', 135);
  assertEquals(w.sport_raw_tss.bike, newBikeTss);
  assertEquals(w.total_raw_tss, newBikeTss);
  // EASY long_ride is fully Z1-2; z12 should grow by the duration delta (135 - 45 = 90).
  assertEquals(w.zone1_2_minutes - oldZ12, 90);
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

// ── §10 history-aware effective floor ───────────────────────────────────────

Deno.test('effective floor: no history → spec floor wins (run)', () => {
  // 70.3 base spec = 8.5; recent = 0 → 0.5 × 0 = 0; max = 8.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 0), 8.5);
});

Deno.test('effective floor: low recent volume → spec floor wins (run)', () => {
  // 70.3 base spec = 8.5; recent = 10 → 5.0; max = 8.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 10), 8.5);
});

Deno.test('effective floor: high recent volume → next-phase cap binds (run)', () => {
  // 70.3 base spec = 8.5; recent = 20 → raw 10.0; next-phase cap (build) = 9.5; capped = 9.5.
  // (Pre-fix this returned 10 because the cap was race-specific peak 11; new contract caps at
  // the next phase the athlete will inhabit, preventing race-distance prescription in early base.)
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 20), 9.5);
});

Deno.test('effective floor: ride mirrors run formula', () => {
  // 70.3 base spec = 2.25h; recent = 5h → 2.5; max = 2.5.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 5), 2.5);
  // recent = 0 → spec wins.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 0), 2.25);
});

Deno.test('effective floor: ride taper/recovery returns 0 even with high recent', () => {
  // Spec floor in taper/recovery is 0 (validators skip). Function preserves the 0 sentinel
  // so callers know this phase is exempt regardless of recent volume.
  assertEquals(effectiveLongRideFloorHours('70.3', 'taper', 6), 0);
  assertEquals(effectiveLongRideFloorHours('70.3', 'recovery', 6), 0);
});

Deno.test('enforce: history-aware floor lifts long_run above spec but caps at next-phase peak', () => {
  // Athlete with recent_longest_run = 20mi → raw 10; next-phase cap (build) = 9.5; effective = 9.5.
  // Long_run currently at 30min (3.2mi). After enforcement: bumped to 9.5mi → Math.round(9.5)=10
  // → duration = Math.round(10 * 9.5) = 95min, steps_preset = longrun_10mi_easypace.
  // (bumpLongRunToFloor rounds floorMi to the nearest integer for the token; 9.5 rounds to 10.)
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [session({ type: 'run', tags: ['long_run', 'base'], durationMin: 30 })],
    }),
  ];
  enforceLongDayFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRunMi: 20,
  });
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  assertEquals(lrun.duration, 95);
  assertEquals(lrun.steps_preset, ['longrun_10mi_easypace']);
});

Deno.test('enforce: history-aware floor lifts long_ride above spec for high-volume athletes', () => {
  // Athlete with recent_longest_ride = 5h → effective floor = 2.5h (vs spec 2.25h).
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [session({ type: 'bike', tags: ['long_ride'], durationMin: 45 })],
    }),
  ];
  enforceLongDayFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRideHr: 5,
  });
  const lride = weeks[0].sessions.find((s) => s.tags.includes('long_ride'))!;
  // 2.5h × 60 = 150min
  assertEquals(lride.duration, 150);
  assertEquals(lride.name, 'Long Ride — 2.5 hr');
  assertEquals(lride.steps_preset, ['bike_endurance_150min_Z2']);
});

Deno.test('enforce: low-recent-volume athlete still gets spec floor (history doesn\'t lower it)', () => {
  // Athlete with recent_longest_run = 5mi (low) — formula gives 2.5mi from history. Spec base
  // floor is 8.5mi; max wins → effective floor = 8.5mi. History does not REDUCE the floor.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 1,
      phase: 'base',
      sessions: [session({ type: 'run', tags: ['long_run', 'base'], durationMin: 30 })],
    }),
  ];
  enforceLongDayFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRunMi: 5,
  });
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  // Spec floor 8.5 → round to 9 → duration 86. History (5×0.5=2.5) doesn't lower this.
  assertEquals(lrun.duration, 86);
  assertEquals(lrun.steps_preset, ['longrun_9mi_easypace']);
});

Deno.test('evaluate: history-aware floor surfaces the same effective threshold', () => {
  // Athlete with recent_longest_run = 20mi → raw 10; next-phase cap (build) = 9.5; effective 9.5.
  // Long run at 9mi (85.5min) is below the 9.5 floor → warning fires.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 2,
      phase: 'base',
      sessions: [session({ type: 'run', tags: ['long_run', 'base'], durationMin: 86 })],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRunMi: 20,
  });
  const lrWarn = out.find((w) => w.discipline === 'long_run');
  assert(lrWarn, 'expected warning when below history-aware floor');
  assertEquals(lrWarn.metrics.floor, 9.5);
});

// ── §11 next-phase cap + display-friendly rounding ─────────────────────────
// The cap on history-derived floors is the NEXT phase's floor, not the macrocycle peak.
// Base caps at build (prevents race-distance prescription in early base), build caps at
// race-specific, race-specific is its own ceiling. Rebuild caps at race-specific (the recent
// reference). Plus display-friendly rounding: 0.5mi for run, 0.25hr for ride.

Deno.test('effective floor: run base capped at build peak (70.3 → 9.5mi)', () => {
  // Athlete with recent 42mi long run → raw 21mi. 70.3 build floor = 9.5. Capped at 9.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 42), 9.5);
  // Race-specific is its own cap → 11.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'race_specific', 42), 11);
  // Build caps at race-specific → 11.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'build', 42), 11);
});

Deno.test('effective floor: run base capped at build peak (sprint → 3.5mi)', () => {
  // Sprint build floor = 0.85 × 4 = 3.4 → round 0.5 = 3.5. Recent 18mi → raw 9mi, capped at 3.5.
  assertEquals(effectiveLongRunFloorMiles('sprint', 'base', 18), 3.5);
});

Deno.test('effective floor: run base capped at build peak (ironman → 15.5mi)', () => {
  // Recent 50mi → raw 25mi. Ironman build floor = 0.85 × 18 = 15.3 → round 0.5 = 15.5.
  assertEquals(effectiveLongRunFloorMiles('ironman', 'base', 50), 15.5);
});

Deno.test('effective floor: run reproduces the buggy "21.2335mi" case (now → 9.5)', () => {
  // The original bug: recent 42.467mi → 21.2335mi leaked into "8.5mi vs 21.2335mi" message.
  // Post-fix: capped at next-phase peak (9.5 for base) and rounded to 0.5 precision.
  const v = effectiveLongRunFloorMiles('70.3', 'base', 42.467);
  assertEquals(v, 9.5);
  // Confirm it's both the threshold AND a display-friendly number (no floating noise).
  assertEquals(v.toString(), '9.5');
});

Deno.test('effective floor: run rounded to 0.5mi precision', () => {
  // 70.3 base, next-phase cap = 9.5mi.
  // Recent 17.3mi → raw 8.65 → spec 8.5 wins (raw < spec) → 8.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 17.3), 8.5);
  // Recent 19mi → raw 9.5 → above spec 8.5; equal to cap 9.5; rounds to 9.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 19), 9.5);
  // Recent 19.1mi → raw 9.55 → capped at 9.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 19.1), 9.5);
  // Recent 19.5mi → raw 9.75 → capped at 9.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 19.5), 9.5);
});

Deno.test('effective floor: ride base capped at build peak (70.3 → 2.5hr)', () => {
  // Recent 8h ride → raw 4h. 70.3 build floor = 2.5h. Capped at 2.5.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 8), 2.5);
  // Race-specific is its own cap → 3.0.
  assertEquals(effectiveLongRideFloorHours('70.3', 'race_specific', 8), 3);
  // Build caps at race-specific → 3.0.
  assertEquals(effectiveLongRideFloorHours('70.3', 'build', 8), 3);
});

Deno.test('effective floor: ride base capped at build peak (sprint)', () => {
  // Sprint build floor — recent 4h shouldn't exceed it.
  const cap = effectiveLongRideFloorHours('sprint', 'build', 0);
  const v = effectiveLongRideFloorHours('sprint', 'base', 4);
  assertEquals(v, cap);
});

Deno.test('effective floor: ride rounded to 0.25hr precision', () => {
  // 70.3 base, next-phase cap = 2.5h.
  // Recent 5.3h → raw 2.65 → above spec 2.25; capped at 2.5; rounds to 2.5.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 5.3), 2.5);
  // Recent 5.1h → raw 2.55 → rounds to 2.5 (capped).
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 5.1), 2.5);
  // Recent 4.95h → raw 2.475 → rounds to 2.5 (rounds to 0.25, but the cap is 2.5 anyway).
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 4.95), 2.5);
});

Deno.test('effective floor: rebuild caps at race-specific (post-race reference point)', () => {
  // Rebuild is the post-race ramp. The athlete just came off race-specific fitness; the cap
  // should be race-specific peak (the recent reference), not over-conservative.
  // 70.3 rebuild floor = 9.5 (0.85 × 11). Cap from nextPhaseForLongDayFloorCap = race_specific.
  // Recent 30mi → raw 15 → capped at 11 (race_specific peak).
  assertEquals(effectiveLongRunFloorMiles('70.3', 'rebuild', 30), 11);
  // Recent 0 → spec 9.5 wins.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'rebuild', 0), 9.5);
  // Ride: 70.3 rebuild floor = 2.5h. Cap = race_specific = 3.0h. Recent 8h → raw 4h → capped at 3.0.
  assertEquals(effectiveLongRideFloorHours('70.3', 'rebuild', 8), 3);
  // Recent 0 → spec 2.5 wins.
  assertEquals(effectiveLongRideFloorHours('70.3', 'rebuild', 0), 2.5);
});

Deno.test('effective floor: ride taper/recovery short-circuit still wins over cap path', () => {
  // The `spec <= 0` short-circuit must fire before the cap/round path so taper / recovery weeks
  // continue to return 0 regardless of history.
  assertEquals(effectiveLongRideFloorHours('70.3', 'taper', 42), 0);
  assertEquals(effectiveLongRideFloorHours('70.3', 'recovery', 42), 0);
});

Deno.test('evaluate: next-phase cap produces clean trade-off message (no floating-point noise)', () => {
  // Pre-fix: a 70.3 athlete with recent 42.467mi long run would see "8.5mi vs 21.2335mi".
  // Post-fix: capped at next-phase floor (9.5mi for base) and rounded clean.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 4,
      phase: 'base',
      sessions: [session({ type: 'run', tags: ['long_run', 'base'], durationMin: 80 })],
    }),
  ];
  const out = evaluateLongDayVolumeFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRunMi: 42.467,
  });
  const lrWarn = out.find((w) => w.discipline === 'long_run');
  assert(lrWarn, 'expected warning');
  assertEquals(lrWarn.metrics.floor, 9.5);
  // Message string must not contain raw `recent × 0.5` noise like "21.2335".
  assert(!lrWarn.message.includes('21.2335'), `message leaked raw value: ${lrWarn.message}`);
  assert(lrWarn.message.includes('9.5mi'), `expected canonical "9.5mi" in message: ${lrWarn.message}`);
});

Deno.test('enforce: capped floor lifts long_run to next-phase peak (not race-distance)', () => {
  // Recent 42mi (would produce a 21-mi floor pre-fix, then 11-mi race-spec cap, then 9.5-mi
  // next-phase cap). Bump quanta: floor 9.5 rounds to integer mile via Math.round → 10mi token.
  const weeks: GeneratedWeek[] = [
    week({
      weekNum: 3,
      phase: 'base',
      sessions: [session({ type: 'run', tags: ['long_run', 'base'], durationMin: 30 })],
    }),
  ];
  enforceLongDayFloors(weeks, {
    hasTri: true,
    primaryDistance: '70.3',
    recentLongestRunMi: 42,
  });
  const lrun = weeks[0].sessions.find((s) => s.tags.includes('long_run'))!;
  // Math.round(9.5) → 10; duration = Math.round(10 * 9.5) = 95
  assertEquals(lrun.duration, 95);
  assertEquals(lrun.steps_preset, ['longrun_10mi_easypace']);
});
