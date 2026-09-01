/**
 * ⛔⛔ THE HEAVY/VELOCITY BAND DOES NOT APPLY IN A TEST WEEK (FIXLIST 2c, ruled by Michael 2026-09-01).
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/test-week-band.test.ts --no-check
 *
 * ⛔ WHY THE FLAG EXISTS, AND WHY IT IS NOT A BUG BEING PAPERED OVER. p084's heavy band opens at 90%
 * of the max; the p215 pretest ramps to 0.8625 of the predicted max. So the heavy count in a test
 * week is STRUCTURALLY ZERO — it does not resolve once every set is logged, because no prescribed set
 * that week can reach the band. A number that can never be non-zero in a phase must not print in that
 * phase.
 *
 * ⛔ AND IT IS A STATED FLAG, NOT AN EMPTY `perPattern`. Emptiness cannot distinguish "no band applies"
 * from "no data". These fixtures pin BOTH directions: the flag goes false only on a test week, and
 * the numbers themselves are untouched either way.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-09-01';

/** One logged lifting session, priced against a known max so it lands in a band. */
const session = (date: string) => ({
  date,
  label: 'Test: Lower',
  exercises: [{
    name: 'Deadlift',
    slot_intent: 'ME',
    sets: [{ weight: 345, reps: 5, completed: true }],
  }],
});

const inputs = (extra: Record<string, unknown>) => ({
  asOf: AS_OF,
  exerciseRows: [],
  bikeRows: [], bikeLoad: [], runJoined: [], runEffHistory: [], swimRows: [],
  strengthVolumeRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: {},
  posture: null, declaredSessionsPerWeek: 3,
  strengthBaselines: { deadlift: 400 },
  loggedSessions: [session('2026-08-31')],
  ...extra,
} as any);

Deno.test('⛔ NO TEST DATES → THE BAND APPLIES (today\'s behaviour, unchanged)', () => {
  const r = assembleStateTrends(inputs({}));
  const vw = (r as any).viadaWeek;
  assert(vw != null, 'a logged week should produce a card');
  assertEquals(vw.patternBandApplies, true);
});

Deno.test('⛔⛔ A TEST DATE INSIDE THE WINDOW → THE BAND DOES NOT APPLY', () => {
  const r = assembleStateTrends(inputs({ testWeekDates: ['2026-08-31'] }));
  const vw = (r as any).viadaWeek;
  assert(vw != null);
  assertEquals(vw.patternBandApplies, false, 'the logged session falls on a test day');
});

Deno.test('⚠️ A TEST DATE OUTSIDE THE WINDOW DOES NOT SUPPRESS — the flag describes THIS card\'s seven days', () => {
  const r = assembleStateTrends(inputs({ testWeekDates: ['2026-06-01'] }));
  const vw = (r as any).viadaWeek;
  assert(vw != null);
  assertEquals(vw.patternBandApplies, true);
});

Deno.test('⚠️ AN EMPTY TEST-DATE LIST IS NOT A SUPPRESSION', () => {
  const r = assembleStateTrends(inputs({ testWeekDates: [] }));
  assertEquals(((r as any).viadaWeek)?.patternBandApplies, true);
});

Deno.test('⛔ THE NUMBERS THEMSELVES ARE UNTOUCHED — the flag hides the row, it does not change the dose', () => {
  const on = (assembleStateTrends(inputs({})) as any).viadaWeek;
  const off = (assembleStateTrends(inputs({ testWeekDates: ['2026-08-31'] })) as any).viadaWeek;
  assert(on != null && off != null);
  assertEquals(JSON.stringify(off.perPattern), JSON.stringify(on.perPattern),
    'suppression is a display flag; perPattern must be byte-identical');
  assertEquals(JSON.stringify(off.perMuscle), JSON.stringify(on.perMuscle));
});
