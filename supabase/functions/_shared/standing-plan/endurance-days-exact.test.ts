// ⛔ THE ATHLETE'S DAYS AND HOURS ARE EXACT — the three gaps closed 2026-08-30.
//
// Michael, after a night that started with an empty strength block and ended here: *"user says hours
// and days and we make it work."* Three halves of that rule were missing and each failed silently,
// which is the defect class this whole night was about:
//   1. a SMALLER day count than the frame's own was ignored — ask 2 runs, build 4;
//   2. ZERO was unsayable — it normalised to `undefined`, which the composer reads as "did not ask",
//      so a bike-only athlete got runs back;
//   3. an OVER-ASK was trimmed with no sentence — 15 ride hours over 2 days built ~6 and said nothing.
//
// ⚠️ ABSENT IS STILL NOT ZERO, and the last test here pins that: with no answer the frame's own week
// stands untouched, which is the 2026-08-23 default and is NOT what this change overturns.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildStandingPlanRow } from './plan-row.ts';

const LIFTS = { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' };

function week(days: unknown, runH?: number, rideH?: number) {
  const row = buildStandingPlanRow({
    compose: {
      frame: 'strength_5k', competitionLifts: LIFTS, roundTo: 5,
      enduranceDaysBySport: days, targetRunHours: runH, targetRideHours: rideH,
    } as never,
    weeks: 2, goalName: 'Strong Focus',
  }) as never as { sessions_by_week: Record<string, { type: string }[]>; notes: { text: string }[] };
  const wk1 = row.sessions_by_week['1'] ?? [];
  const n = (t: string) => wk1.filter((s) => String(s.type).toLowerCase() === t).length;
  return { runs: n('run'), rides: n('ride'), notes: (row.notes ?? []).map((x) => x.text) };
}

Deno.test('⛔ GAP 1 — a SMALLER day count shrinks the week', () => {
  assertEquals(week({ run: 2 }, 2).runs, 2, 'asked 2 runs and the frame kept its own count');
  assertEquals(week({ run: 1 }, 1).runs, 1, 'asked 1 run and the frame kept its own count');
});

Deno.test('⛔ GAP 2 — ZERO is an answer, and it removes the sport entirely', () => {
  const w = week({ run: 0, ride: 3 }, undefined, 6);
  assertEquals(w.runs, 0, 'a stated zero still built runs — zero was read as "did not answer"');
  assertEquals(w.rides, 3, 'the ride ask was not honoured exactly');
});

Deno.test('⛔ GAP 3 — an over-ask is NEVER silent', () => {
  const w = week({ ride: 2 }, undefined, 15);
  assertEquals(w.rides, 2, 'the stated day count stopped being a cap');
  const said = w.notes.some((t) => /hold|Add a ride day/i.test(t));
  assert(said, `15h across 2 rides was trimmed with no sentence. notes: ${JSON.stringify(w.notes)}`);
  // ⚠️ BOTH NUMBERS, not a vague apology — "some hours did not fit" is the same silence, politer.
  assert(w.notes.some((t) => /15h/.test(t)), 'the warning does not name what was asked');
  // ⚠️ AND NO DOUBLED "about" — `sayHours` supplies its own.
  assert(!w.notes.some((t) => /about about/.test(t)), 'doubled "about" in the shortfall line');
});

Deno.test('⛔ ABSENT IS NOT ZERO — no answer leaves the frame alone', () => {
  const w = week(undefined);
  assert(w.runs > 0, 'an unasked week lost its runs — absent was collapsed into zero');
});

// ⛔ THE STATED DAY COUNTS MUST ALSO DECIDE THE SPORT MIX (2026-08-30). The mix chooses WHICH frame
// slots become rides; the day count then trims. While the mix read `RUN_DAYS_DEFAULT` and the day
// count said zero, "how much of each sport" had two answers: at a 2-vs-2 ratio only the two hardest
// slots went to the bike and the LONG slot stayed a run, which the trim then deleted as an unasked
// run. An athlete asking for two rides and no running lost the long ride — the one session that
// carries real hours — and got two short hard rides totalling 2h20 against a 6h ask.
Deno.test('⛔ a stated zero-run / two-ride week keeps its LONG ride', () => {
  const row = buildStandingPlanRow({
    compose: {
      frame: 'strength_5k', competitionLifts: LIFTS, roundTo: 5,
      // ⚠️ THE MIX THE DOOR NOW BUILDS from the stated days — not one written by hand here.
      sportMix: { runs: 0, rides: 2 },
      enduranceDaysBySport: { run: 0, ride: 2 }, targetRideHours: 6,
    } as never,
    weeks: 2, goalName: 'Strong Focus',
  }) as never as { sessions_by_week: Record<string, { type: string; duration?: number }[]> };
  const wk1 = row.sessions_by_week['1'] ?? [];
  const rides = wk1.filter((s) => ['ride', 'bike'].includes(String(s.type).toLowerCase()));
  assertEquals(rides.length, 2, 'the stated ride count was not honoured');
  assertEquals(wk1.filter((s) => String(s.type).toLowerCase() === 'run').length, 0, 'a stated zero built runs');
  const hours = rides.reduce((t, s) => t + (s.duration ?? 0), 0) / 60;
  // ⛔ THE LONG RIDE IS THE TEST. Two short hard rides come to ~2h20; with the long one kept it is ~6h.
  assert(hours > 5, `two rides against a 6h ask built only ${hours.toFixed(2)}h — the long ride was dropped`);
});
