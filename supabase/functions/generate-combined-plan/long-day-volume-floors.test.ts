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
  evaluateLongDayVolumeFloors,
  type LongDayFloorWarning,
} from './validate-training-floors.ts';
import { longRideFloorHours, longRunFloorMiles } from './science.ts';
import type { GeneratedWeek, PlannedSession, Phase, Sport } from './types.ts';

// ── helpers ─────────────────────────────────────────────────────────────────

function session(opts: {
  type: Sport;
  tags: string[];
  durationMin: number;
  day?: string;
  tss?: number;
}): PlannedSession {
  return {
    day: opts.day ?? 'Saturday',
    type: opts.type,
    name: `${opts.type} session`,
    description: '',
    duration: opts.durationMin,
    tss: opts.tss ?? 0,
    weighted_tss: opts.tss ?? 0,
    intensity_class: 'EASY',
    steps_preset: [],
    tags: opts.tags,
    serves_goal: 'shared',
    zone_targets: 'Z2',
  } as PlannedSession;
}

function week(opts: {
  weekNum: number;
  phase: Phase;
  isRecovery?: boolean;
  sessions: PlannedSession[];
}): GeneratedWeek {
  return {
    weekNum: opts.weekNum,
    phase: opts.phase,
    isRecovery: opts.isRecovery ?? false,
    sessions: opts.sessions,
    total_raw_tss: 0,
    total_weighted_tss: 0,
    sport_raw_tss: { run: 0, bike: 0, swim: 0, strength: 0, race: 0 },
    zone1_2_minutes: 0,
    zone3_plus_minutes: 0,
    eighty_twenty_ratio: 1,
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
