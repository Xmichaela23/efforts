/**
 * ⛔ ONE TEST PER APPROVED LINE, AND ONE FOR THE SILENCE.
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/session-boom.test.ts
 *
 * ⚠️ THE STRINGS ARE ASSERTED VERBATIM against docs/WORKORDER-booms-2026-09-09.md. If a line here has
 * to change, the work order changes first — these are Michael's words and the test is the pin.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sessionBoomLine, type BoomWorkout } from './session-boom.ts';

const BLOCK = '2026-07-06';

const ride = (date: string, extra: Partial<BoomWorkout> = {}): BoomWorkout => ({
  id: `r-${date}`, date, type: 'ride', workout_status: 'completed', ...extra,
});
const lift = (date: string, extra: Partial<BoomWorkout> = {}): BoomWorkout => ({
  id: `l-${date}`, date, type: 'strength', workout_status: 'completed', week_number: 3, ...extra,
});
const curve = (o: Record<string, number>) => ({ computed: { power_curve: o } });
const hr = (n: number) => ({ workout_analysis: { bike_fitness_v1: { hr_at_band: n } } });
const drift = (pct: number) => ({ workout_analysis: { session_detail_v1: { classification: { decoupling: { pct } } } } });
const mins = (n: number) => ({ computed: { overall: { duration_s_moving: n * 60 } } });

/* ── RIDE ────────────────────────────────────────────────────────────────────────────────────── */

Deno.test('ride 1 — best power, and the LONGEST duration that is a best wins', () => {
  const line = sessionBoomLine({
    workout: ride('2026-09-09', curve({ '5s': 900, '20min': 265 })),
    prior: [ride('2026-08-01', curve({ '5s': 850, '20min': 250 }))],
    blockStartISO: BLOCK,
  });
  assertEquals(line, 'Best 20-minute power since July: 265 W.');
});

Deno.test('ride 1 — a 5 s best alone still speaks', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', curve({ '5s': 900, '20min': 240 })),
    prior: [ride('2026-08-01', curve({ '5s': 850, '20min': 250 }))],
    blockStartISO: BLOCK,
  }), 'Best 5-second power since July: 900 W.');
});

Deno.test('⛔ ride 1 — the FIRST ride of a window beats nothing', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', curve({ '20min': 265 })),
    prior: [],
    blockStartISO: BLOCK,
  }), null);
});

Deno.test('⛔ ride 1 — a ride BEFORE the block does not set the bar', () => {
  // The 300 W ride is outside the window, so 265 is still the best since July.
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', curve({ '20min': 265 })),
    prior: [ride('2026-06-01', curve({ '20min': 300 })), ride('2026-08-01', curve({ '20min': 250 }))],
    blockStartISO: BLOCK,
  }), 'Best 20-minute power since July: 265 W.');
});

Deno.test('ride 2 — longest ride', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', mins(180)),
    prior: [ride('2026-08-01', mins(150)), ride('2026-07-20', mins(120))],
    blockStartISO: BLOCK,
  }), 'Longest ride since July.');
});

Deno.test('ride 3 — heart rate lower at easy power than the last EIGHT', () => {
  const priors = Array.from({ length: 8 }, (_, i) => ride(`2026-08-0${i + 1}`, hr(140)));
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', hr(134)),
    prior: priors,
    blockStartISO: BLOCK,
  }), 'Your heart rate was 6 bpm lower at easy power than your last eight rides.');
});

Deno.test('⛔ ride 3 — seven rides is not eight', () => {
  const priors = Array.from({ length: 7 }, (_, i) => ride(`2026-08-0${i + 1}`, hr(140)));
  assertEquals(sessionBoomLine({ workout: ride('2026-09-09', hr(134)), prior: priors, blockStartISO: BLOCK }), null);
});

Deno.test('⛔ ride 3 — a ride the engine excluded from the trend is not a reading', () => {
  const priors = Array.from({ length: 8 }, (_, i) => ride(`2026-08-0${i + 1}`, hr(140)));
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', { workout_analysis: { bike_fitness_v1: { hr_at_band: 134, counts_toward_trend: false } } }),
    prior: priors,
    blockStartISO: BLOCK,
  }), null);
});

Deno.test('ride 4 — drift under the line, N rides running', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', drift(3.1)),
    prior: [ride('2026-09-05', drift(4.2)), ride('2026-09-01', drift(2.0)), ride('2026-08-28', drift(6.5))],
    blockStartISO: BLOCK,
  }), 'Drift under 5 percent, 3 rides in a row.');
});

Deno.test('⛔ ride 4 — one ride is not a run of anything', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', drift(3.1)),
    prior: [ride('2026-09-05', drift(7.0))],
    blockStartISO: BLOCK,
  }), null);
});

Deno.test('⛔ THE ORDER IS THE WORK ORDER\'S — power beats length beats heart rate beats drift', () => {
  /* ⚠️ ONE `computed` OBJECT — spreading `curve()` and `mins()` together drops the first, which is
     exactly how this fixture first tested nothing at all. */
  const priors = Array.from({ length: 8 }, (_, i) => ride(`2026-08-0${i + 1}`, {
    ...hr(140),
    computed: { power_curve: { '20min': 250 }, overall: { duration_s_moving: 3600 } },
  }));
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', { computed: { power_curve: { '20min': 265 }, overall: { duration_s_moving: 9999 } }, workout_analysis: { bike_fitness_v1: { hr_at_band: 120 }, session_detail_v1: { classification: { decoupling: { pct: 1 } } } } }),
    prior: priors,
    blockStartISO: BLOCK,
  }), 'Best 20-minute power since July: 265 W.');
});

/* ── RUN ─────────────────────────────────────────────────────────────────────────────────────── */

const runRow = (date: string, extra = {}) => ({ id: `x-${date}`, date, type: 'run', workout_status: 'completed', ...extra });

/** `fact_packet_v1.facts.vs_similar.trend_points` — what `fact-packet/build.ts` writes per run. */
const paceAtHr = (curPace: number, curHr: number, priorPaceAtHr: number[], type = 'easy') => ({
  workout_analysis: {
    fact_packet_v1: {
      facts: {
        workout_type: type,
        vs_similar: {
          trend_points: [
            ...priorPaceAtHr.map((v, i) => ({ date: `2026-08-0${i + 1}`, pace_at_hr: v, avg_hr: 150, pace_sec_per_mi: 600 })),
            { date: '2026-09-09', is_current: true, pace_sec_per_mi: curPace, avg_hr: curHr, pace_at_hr: Math.round(curPace * 100 / curHr * 10) / 10 },
          ],
        },
      },
    },
  },
});

Deno.test('run 2 — the longest run IS built (only the fastest split waits for best efforts)', () => {
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', mins(180)),
    prior: [runRow('2026-08-01', mins(90))],
    blockStartISO: BLOCK,
  }), 'Longest run since July.');
});

Deno.test('run 3 — pace at the SAME heart rate, off the trend read', () => {
  // Eight priors at 4.00 s/mi per bpm; at 150 bpm they would run 600 s/mi. This run ran 590.
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', paceAtHr(590, 150, Array(8).fill(400))),
    prior: [],
    blockStartISO: BLOCK,
  }), 'Your easy pace was 10 s/mi faster at the same heart rate than your last eight runs.');
});

Deno.test('⛔ run 3 — SEVEN priors is not eight', () => {
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', paceAtHr(590, 150, Array(7).fill(400))),
    prior: [], blockStartISO: BLOCK,
  }), null);
});

Deno.test('⛔ run 3 — NOT ON A HARD RUN. The line says "your easy pace"', () => {
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', paceAtHr(590, 150, Array(8).fill(400), 'tempo')),
    prior: [], blockStartISO: BLOCK,
  }), null);
});

Deno.test('⛔ run 3 — slower at the same heart rate says nothing', () => {
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', paceAtHr(615, 150, Array(8).fill(400))),
    prior: [], blockStartISO: BLOCK,
  }), null);
});

Deno.test('run 4 — drift', () => {
  assertEquals(sessionBoomLine({
    workout: runRow('2026-09-09', drift(2.0)),
    prior: [runRow('2026-09-05', drift(3.0))],
    blockStartISO: BLOCK,
  }), 'Drift under 5 percent, 2 runs in a row.');
});

/* ── LIFT — TWO LINES ONLY ───────────────────────────────────────────────────────────────────── */

const SETS = (n: number, rir: number | null, reps = 4) =>
  Array.from({ length: n }, () => ({ reps, weight: 145, completed: true, ...(rir == null ? {} : { rir }) }));

const clean = (week: number, day = 'Wednesday', movement = 'Bench Press') =>
  ({ week, day, movement, outcome: 'clean' });

Deno.test('lift 1 — the lift gets a second heavy set next time', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09'),
    prior: [],
    meHistory: { push_upper: [clean(2), clean(3)] },
  }), 'Bench Press gets a second heavy set next time.');
});

Deno.test('⛔ lift 1 — one clean session earns nothing', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09'), prior: [],
    meHistory: { push_upper: [clean(3)] },
  }), null);
});

Deno.test('⛔ lift 1 — THE THIRD RUNG SAYS NOTHING. The approved line says "a second"', () => {
  // clean, clean → a second set. Then clean, clean again → a third, which this sentence cannot name.
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09'), prior: [],
    meHistory: { push_upper: [clean(1), clean(1), clean(2), clean(3)] },
  }), null);
});

Deno.test('⛔ lift 1 — an OLDER rung is not re-announced when an old session is opened', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { week_number: 5 }), prior: [],
    meHistory: { push_upper: [clean(2, 'Monday'), clean(3, 'Monday')] },
  }), null);
});

Deno.test('lift 2 — every heavy set had reps to spare', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(3, 2) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), 'Every heavy set had reps to spare.');
});

Deno.test('⛔ lift 2 — an UNGRADED heavy set is not reps to spare (D-324: absent is not zero)', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: [...SETS(2, 2), ...SETS(1, null)] }] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), null);
});

Deno.test('⛔ lift 2 — a heavy set at RIR 0 is not reps to spare', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: [...SETS(2, 2), ...SETS(1, 0)] }] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), null);
});

Deno.test('⛔ THE THREE CUT LIFT LINES SAY NOTHING (revised 2026-09-09)', () => {
  // "Speed sets all fast" — bar speed is not measured.
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Speed Squat', sets: SETS(6, 4, 3) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Speed Squat', slot_intent: 'DE', sets_completed: 6, date: '2026-09-09', workout_id: 'w-now' }],
  }), null);
  // "Most work sets this block" — the plan sets the count.
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [] }), prior: [],
    logToday: [{ exercise_name: 'Bench Press', sets_completed: 9, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [{ exercise_name: 'Bench Press', sets_completed: 4, date: '2026-09-02', workout_id: 'w-1' }],
  }), null);
  // "N sessions without a miss".
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Deadlift', sets: SETS(2, 2) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [
      { exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-02', workout_id: 'w-1' },
      { exercise_name: 'Deadlift', sets_completed: 2, date: '2026-08-26', workout_id: 'w-2' },
    ],
  }), null);
});

Deno.test('⛔ lift order — the earned set beats the line under it', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(3, 2) }] }),
    prior: [],
    meHistory: { push_upper: [clean(2), clean(3)] },
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), 'Bench Press gets a second heavy set next time.');
});

Deno.test('⛔ EVERY LINE ENDS WITH A FULL STOP (revised 2026-09-09)', () => {
  const lines = [
    sessionBoomLine({ workout: ride('2026-09-09', curve({ '20min': 265 })), prior: [ride('2026-08-01', curve({ '20min': 250 }))], blockStartISO: BLOCK }),
    sessionBoomLine({ workout: ride('2026-09-09', mins(180)), prior: [ride('2026-08-01', mins(60))], blockStartISO: BLOCK }),
    sessionBoomLine({ workout: ride('2026-09-09', hr(134)), prior: Array.from({ length: 8 }, (_, i) => ride(`2026-08-0${i + 1}`, hr(140))), blockStartISO: BLOCK }),
    sessionBoomLine({ workout: ride('2026-09-09', drift(3.1)), prior: [ride('2026-09-05', drift(4.2))], blockStartISO: BLOCK }),
    sessionBoomLine({ workout: runRow('2026-09-09', paceAtHr(590, 150, Array(8).fill(400))), prior: [], blockStartISO: BLOCK }),
    sessionBoomLine({ workout: lift('2026-09-09'), prior: [], meHistory: { push_upper: [clean(2), clean(3)] } }),
    sessionBoomLine({
      workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(3, 2) }] }), prior: [],
      logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
    }),
  ];
  for (const line of lines) {
    assertEquals(typeof line, 'string');
    assertEquals(line!.endsWith('.'), true, line!);
  }
});

/* ── THE SILENCE ─────────────────────────────────────────────────────────────────────────────── */

Deno.test('⛔ AN ORDINARY SESSION SAYS NOTHING — the normal answer', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', { ...curve({ '20min': 200 }), ...mins(45) }),
    prior: [ride('2026-09-02', { ...curve({ '20min': 260 }), ...mins(120) })],
    blockStartISO: BLOCK,
  }), null);
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(1, null) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 1, date: '2026-09-09', workout_id: 'w-now' }],
  }), null);
});

Deno.test('⛔ A PLANNED SESSION IS NOT A DONE ONE', () => {
  assertEquals(sessionBoomLine({
    workout: { ...ride('2026-09-09', curve({ '20min': 400 })), workout_status: 'planned' },
    prior: [ride('2026-08-01', curve({ '20min': 250 }))],
    blockStartISO: BLOCK,
  }), null);
});

Deno.test('⛔ A SWIM, A WALK, A MOBILITY SESSION: no lines exist for them', () => {
  for (const type of ['swim', 'walk', 'mobility', 'pilates_yoga']) {
    assertEquals(sessionBoomLine({ workout: { date: '2026-09-09', type, workout_status: 'completed' }, prior: [] }), null, type);
  }
});
