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
  assertEquals(line, 'Best 20-minute power since July: 265 W');
});

Deno.test('ride 1 — a 5 s best alone still speaks', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', curve({ '5s': 900, '20min': 240 })),
    prior: [ride('2026-08-01', curve({ '5s': 850, '20min': 250 }))],
    blockStartISO: BLOCK,
  }), 'Best 5-second power since July: 900 W');
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
  }), 'Best 20-minute power since July: 265 W');
});

Deno.test('ride 2 — longest ride', () => {
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', mins(180)),
    prior: [ride('2026-08-01', mins(150)), ride('2026-07-20', mins(120))],
    blockStartISO: BLOCK,
  }), 'Longest ride since July');
});

Deno.test('ride 3 — heart rate lower at easy power than the last EIGHT', () => {
  const priors = Array.from({ length: 8 }, (_, i) => ride(`2026-08-0${i + 1}`, hr(140)));
  assertEquals(sessionBoomLine({
    workout: ride('2026-09-09', hr(134)),
    prior: priors,
    blockStartISO: BLOCK,
  }), 'Heart rate 6 bpm lower at easy power than your last eight rides');
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
  }), 'Drift under 5 percent for 3 rides running');
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
  }), 'Best 20-minute power since July: 265 W');
});

/* ── RUN ─────────────────────────────────────────────────────────────────────────────────────── */

Deno.test('run 3 and 4 are built; 1 and 2 are not (best efforts is not built)', () => {
  const run = (date: string, extra = {}) => ({ id: `x-${date}`, date, type: 'run', workout_status: 'completed', ...extra });
  const priors = Array.from({ length: 8 }, (_, i) => run(`2026-08-0${i + 1}`, hr(150)));
  assertEquals(sessionBoomLine({ workout: run('2026-09-09', hr(145)), prior: priors, blockStartISO: BLOCK }),
    'Heart rate 5 bpm lower at easy pace than your last eight runs');
  assertEquals(sessionBoomLine({
    workout: run('2026-09-09', drift(2.0)),
    prior: [run('2026-09-05', drift(3.0))],
    blockStartISO: BLOCK,
  }), 'Drift under 5 percent for 2 runs running');
  // ⛔ No "Longest run since" — a run that is the longest of the window says nothing yet.
  assertEquals(sessionBoomLine({ workout: run('2026-09-09', mins(180)), prior: [run('2026-08-01', mins(60))], blockStartISO: BLOCK }), null);
});

/* ── LIFT ────────────────────────────────────────────────────────────────────────────────────── */

const SETS = (n: number, rir: number | null, reps = 4) =>
  Array.from({ length: n }, () => ({ reps, weight: 145, completed: true, ...(rir == null ? {} : { rir }) }));

Deno.test('lift 1 — a set earned, off the ladder\'s own history', () => {
  // Wednesday 2026-09-09, week 3. Two cleans in a row is the earn (ME_CLEAN_SESSIONS_TO_EARN).
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09'),
    prior: [],
    meHistory: { push_upper: [
      { week: 2, day: 'Wednesday', movement: 'Bench Press', outcome: 'clean' },
      { week: 3, day: 'Wednesday', movement: 'Bench Press', outcome: 'clean' },
    ] },
    meAtWeight: { push_upper: 145 },
  }), 'A set earned on Bench Press: two clean sessions at 145 lb');
});

Deno.test('⛔ lift 1 — one clean session earns nothing', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09'),
    prior: [],
    meHistory: { push_upper: [{ week: 3, day: 'Wednesday', movement: 'Bench Press', outcome: 'clean' }] },
    meAtWeight: { push_upper: 145 },
  }), null);
});

Deno.test('⛔ lift 1 — an OLDER rung is not re-announced when an old session is opened', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { week_number: 5 }),
    prior: [],
    meHistory: { push_upper: [
      { week: 2, day: 'Monday', movement: 'Bench Press', outcome: 'clean' },
      { week: 3, day: 'Monday', movement: 'Bench Press', outcome: 'clean' },
    ] },
    meAtWeight: { push_upper: 145 },
  }), null);
});

Deno.test('lift 2 — every heavy set with reps to spare', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(3, 2) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), 'Every heavy set with reps to spare');
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

Deno.test('lift 3 — speed sets all fast', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Speed Squat', sets: SETS(6, 4, 3) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Speed Squat', slot_intent: 'DE', sets_completed: 6, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), 'Speed sets all fast');
});

Deno.test('⛔ lift 3 — a speed set ground out to failure is not fast', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Speed Squat', sets: [...SETS(5, 4, 3), ...SETS(1, 0, 3)] }] }),
    prior: [],
    logToday: [{ exercise_name: 'Speed Squat', slot_intent: 'DE', sets_completed: 6, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), null);
});

Deno.test('lift 4 — most work sets this block', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', sets_completed: 9, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [
      { exercise_name: 'Bench Press', sets_completed: 4, date: '2026-09-02', workout_id: 'w-1' },
      { exercise_name: 'Row', sets_completed: 4, date: '2026-09-02', workout_id: 'w-1' },
    ],
  }), 'Most work sets this block: 9');
});

Deno.test('⛔ lift 4 — NEVER at 14 or over (p86 is a ceiling as well as a floor)', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [] }),
    prior: [],
    logToday: [{ exercise_name: 'Bench Press', sets_completed: 15, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [{ exercise_name: 'Bench Press', sets_completed: 8, date: '2026-09-02', workout_id: 'w-1' }],
  }), null);
});

Deno.test('lift 5 — sessions on one lift without a miss', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Deadlift', sets: SETS(2, 2) }] }),
    prior: [],
    logToday: [{ exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [
      { exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-02', workout_id: 'w-1' },
      { exercise_name: 'Deadlift', sets_completed: 2, date: '2026-08-26', workout_id: 'w-2' },
    ],
  }), '3 sessions on Deadlift without a miss');
});

Deno.test('⛔ lift 5 — a set at zero reps is a miss', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Deadlift', sets: [...SETS(1, 2), { reps: 0, weight: 315, completed: true }] }] }),
    prior: [],
    logToday: [{ exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-09', workout_id: 'w-now' }],
    logPrior: [{ exercise_name: 'Deadlift', sets_completed: 2, date: '2026-09-02', workout_id: 'w-1' }],
  }), null);
});

Deno.test('⛔ lift order — the earned set beats every line under it', () => {
  assertEquals(sessionBoomLine({
    workout: lift('2026-09-09', { strength_exercises: [{ name: 'Bench Press', sets: SETS(3, 2) }] }),
    prior: [],
    meHistory: { push_upper: [
      { week: 2, day: 'Wednesday', movement: 'Bench Press', outcome: 'clean' },
      { week: 3, day: 'Wednesday', movement: 'Bench Press', outcome: 'clean' },
    ] },
    meAtWeight: { push_upper: 145 },
    logToday: [{ exercise_name: 'Bench Press', slot_intent: 'ME', sets_completed: 3, date: '2026-09-09', workout_id: 'l-2026-09-09' }],
  }), 'A set earned on Bench Press: two clean sessions at 145 lb');
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
