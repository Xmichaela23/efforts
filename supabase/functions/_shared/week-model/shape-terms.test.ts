// ⛔ THE SHAPE TERMS — Michael's 2026-08-19 ruling, one test per clause. Run:
//   ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/week-model/shape-terms.test.ts
//
// ⛔ WHY THIS FILE EXISTS AND WHY IT IS NOT IN `model.test.ts`. That file pins Layer 1 — what is
// LEGAL. Nothing here is a legality claim: every term below chooses between weeks that are already
// legal, and a failure in one produces a worse week rather than an unsafe one.
//
// ⛔⛔ AND THE REAL REASON: NONE OF THESE THREE TERMS FIRES ANYWHERE ON THE 61-SHAPE SWEEP.
// The composer's three-day Wendler structure (Squat · Bench · Deadlift+Press) never puts three
// stressors on one day, so `overCap` and `lockedDayExtras` are dormant guards on real athlete
// input. `SPEC-week-solver.md`'s own law says *"a test that has never failed is not evidence"* —
// so the cases are constructed here by hand, because production data will not construct them.
// ⛔⛔ AND THE TERMS ARE TESTED DIRECTLY, NOT ONLY THROUGH `resolve()`. The first version of this
// file drove every case through the resolver and ALL of it was vacuous: zeroing each new weight in
// turn broke nothing, because `crowding` and Layer 1 were already producing the asserted outcome.
// A test that passes with the term deleted is not evidence the term works. Each weight below is
// mutation-checked — set it to 0 and the matching test fails.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Session, type Unit, buildUnits, isStressor, stressorsOf } from './model.ts';
import {
  type Placement,
  lockedDayExtras,
  overCap,
  recoveryDaysOf,
  resolve,
  restDaysOf,
  stressorStreakExcess,
} from './resolve.ts';

const S = (id: string, label: string, load: Session['load'], sport?: Session['sport']): Session =>
  ({ id, label, load, minutes: 60, sport });

const SQ = S('sq', 'Back Squat', 'heavy_lower');
const DL = S('dl', 'Deadlift', 'heavy_lower');
const BENCH = S('bench', 'Bench Press', 'upper');
const PRESS = S('press', 'Overhead Press', 'upper');
const HARD_RUN = S('hr', 'Hard Run', 'hard_cardio', 'run');
const LONG_RUN = S('lr', 'Long Run', 'long_run', 'run');
const LONG_RIDE = S('lb', 'Long Ride', 'long_ride', 'bike');
const EASY_RUN = S('er', 'Easy Run', 'easy', 'run');

const place = (sessions: Session[], pins: Record<string, number>) =>
  buildUnits(sessions, pins).map((u) => ({ unit: u, day: u.pinnedDay! }));

// ── THE VOCABULARY ───────────────────────────────────────────────────────────

Deno.test('⛔ UPPER AND EASY ARE NOT STRESSORS — that classification is the whole unlock', () => {
  assertEquals(isStressor('heavy_lower'), true);
  assertEquals(isStressor('hard_cardio'), true);
  assertEquals(isStressor('long_run'), true);
  assertEquals(isStressor('long_ride'), true);
  assertEquals(isStressor('upper'), false, 'a bench press is not what makes a week punishing');
  assertEquals(isStressor('easy'), false);
});

Deno.test('the coupled pair carries exactly TWO stressors — which is why the cap is two, not one', () => {
  const [unit] = buildUnits([SQ, HARD_RUN], {});
  assertEquals(unit.sessions.length, 2, 'the squat and the hard run are one unit');
  assertEquals(stressorsOf(unit), 2, 'the cap must permit the arrangement Layer 1 builds');
});

// ── RECOVERY vs BLANK — two different questions ──────────────────────────────

Deno.test('⛔ A DAY CARRYING ONLY A BENCH PRESS IS A RECOVERY DAY AND IS NOT A BLANK DAY', () => {
  // Monday bench, Tuesday squat. Wednesday-Sunday empty.
  const ps = place([BENCH, SQ], { bench: 0, sq: 1 });
  assert(recoveryDaysOf(ps).includes(0), 'Monday has no stressor, so it is a recovery day');
  assertEquals(restDaysOf(ps).includes(0), false, 'but it is NOT blank — the press is on it');
  assertEquals(recoveryDaysOf(ps).includes(1), false, 'Tuesday holds the squat');
});

// ── 1. THE BLANK DAY IS EXPENSIVE ────────────────────────────────────────────

Deno.test('⛔⛔ A TIGHT WEEK STILL KEEPS ONE COMPLETELY BLANK DAY — spreading loses to it', () => {
  // Michael, 2026-08-19: "stripping away an athlete's only true day off just to make the weekly
  // layout look perfectly symmetrical is a failure of coaching."
  //
  // ⚠️ THE WEEK HAS TO BE TIGHT OR THE TEST PROVES NOTHING. The long days take the weekend and the
  // coupled pair takes Tuesday, leaving FOUR open days for FIVE units. Something must double up,
  // and every one of these units is free to sit anywhere — so a solver that valued spreading over
  // the day off would take all four days and hand back a seven-day week.
  //
  // ⛔ MUTATION-CHECKED: drop the `blank` weight from 40 to 3 and this fails.
  const easyA = S('ea', 'Easy Run A', 'easy', 'run');
  const easyB = S('eb', 'Easy Ride B', 'easy', 'bike');
  const r = resolve(
    buildUnits([SQ, HARD_RUN, DL, BENCH, PRESS, easyA, easyB, LONG_RIDE, LONG_RUN],
      { sq: 1, hr: 1, lb: 5, lr: 6 }),
  );
  const placements = r.ok ? r.placements : r.best;
  assert(
    restDaysOf(placements).length >= 1,
    `no blank day left: ${placements.map((p) => `${p.day}:${p.unit.label}`).join(' · ')}`,
  );
  // And the day off is a real one — nothing on it at all, not merely no stressor.
  const blank = restDaysOf(placements)[0];
  assertEquals(
    placements.some((p) => p.day === blank), false, 'the blank day carries a session',
  );
});

// ── 2. THE CAP — counted in stressors ABOVE two ──────────────────────────────

/** A one-session unit on a named day, for scoring a shape the resolver would never choose. */
const at = (s: Session, day: number): Placement => ({
  unit: { id: s.id, label: s.label, sessions: [s], internalGapHours: 0 } as Unit,
  day,
});

Deno.test('⛔ THE CAP CHARGES PER STRESSOR ABOVE TWO, AND THE COUPLED PAIR AT TWO IS FREE', () => {
  const HARD_RIDE = S('hb', 'Hard Ride', 'hard_cardio', 'bike');
  // The coupled pair — two stressors on one day, exactly at the cap.
  const coupled = buildUnits([SQ, HARD_RUN], {}).map((u) => ({ unit: u, day: 1 }));
  assertEquals(overCap(coupled), 0, 'the arrangement Layer 1 deliberately builds must cost nothing');

  // Three stressors on one day: two uncoupled hard days plus a long ride. All three are LEGAL
  // together under `COST` — hard_cardio needs nothing, long_ride needs nothing — so the law has no
  // opinion and this term is the only thing that objects.
  const three = [at(HARD_RUN, 3), at(HARD_RIDE, 3), at(LONG_RIDE, 3)];
  assertEquals(overCap(three), 1, 'one stressor above the cap');
  const four = [...three, at(DL, 3)];
  assertEquals(overCap(four), 2, 'it escalates — a fourth costs another');
});

// ── 3. THE LOCK — a day at the cap takes nothing more ────────────────────────

Deno.test('⛔ A DAY HOLDING THE COUPLED PAIR IS FULL — an added press is charged, a spread one is not', () => {
  // Michael's words: "a heavy lower-body lift plus a hard endurance session locks the day. Upper
  // body must spill to adjacent days." ⚠️ The press is NOT a stressor, so `overCap` is SILENT on
  // this day — that is exactly why the lock has to exist as its own term.
  const [pair] = buildUnits([SQ, HARD_RUN], {});
  const locked = [{ unit: pair, day: 1 }, at(PRESS, 1)];
  assertEquals(overCap(locked), 0, 'two stressors — the cap has nothing to say');
  assertEquals(lockedDayExtras(locked), 1, 'but a third session was added to a full day');

  const spread = [{ unit: pair, day: 1 }, at(PRESS, 3)];
  assertEquals(lockedDayExtras(spread), 0, 'the press on its own day is free');

  // ⚠️ A day BELOW the cap is not locked — a bench beside a lone squat is a normal stacked day.
  assertEquals(lockedDayExtras([at(SQ, 1), at(PRESS, 1)]), 0, 'one stressor is not a locked day');
});

// ── 4. THE STREAK COUNTS STRESSOR DAYS, NOT ACTIVE DAYS ──────────────────────

Deno.test('⛔ THE STREAK IS CYCLIC AND COUNTS ONLY STRESSOR DAYS', () => {
  const HARD_RIDE = S('hb', 'Hard Ride', 'hard_cardio', 'bike');
  const stress = (days: number[]) => days.map((d, i) =>
    at(S(`s${i}`, `Hard ${i}`, 'hard_cardio', 'run'), d));

  assertEquals(stressorStreakExcess(stress([0, 1, 2])), 0, 'three in a row is the allowance');
  assertEquals(stressorStreakExcess(stress([0, 1, 2, 3])), 1, 'the fourth is charged');
  assertEquals(stressorStreakExcess(stress([0, 1, 2, 3, 4])), 2, 'and the fifth again');
  assertEquals(stressorStreakExcess(stress([0, 1, 3, 4])), 0, 'a gap resets the run');

  // ⛔ THE WEEK IS A CYCLE. Friday-to-Tuesday is five consecutive days; reading the array
  // end-to-end would see three and two and charge nothing.
  assertEquals(stressorStreakExcess(stress([4, 5, 6, 0, 1])), 2, 'Fri→Tue is a five-day run');

  // ⚠️ AND THE UPPER DAY IS INVISIBLE TO IT — this is what resolves the tension between "fill the
  // dead zones" and "no five-day blocks". Bench on Wednesday does not join Mon/Tue to Thu/Fri.
  const withBench = [...stress([0, 1]), at(BENCH, 2), at(HARD_RIDE, 3), at(DL, 4)];
  assertEquals(stressorStreakExcess(withBench), 0, 'the bench day breaks the run, not extends it');
});

Deno.test('the easy sessions still spread — the shape terms did not eat the old preference', () => {
  // A guard on the rewrite rather than on any new term: `clustering` and the rest of the score
  // predate this ruling and must survive it.
  const easies: Session[] = [0, 1, 2].map((i) =>
    S(`e${i}`, `Easy Run ${i}`, 'easy', 'run'));
  const r = resolve(buildUnits([...easies, SQ, LONG_RUN], { lr: 6 }));
  assert(r.ok, 'a light week is legal');
  const days = r.placements
    .filter((p) => p.unit.sessions.every((s) => s.load === 'easy'))
    .map((p) => p.day)
    .sort((a, b) => a - b);
  const backToBack = days.filter((d, i) => i > 0 && d - days[i - 1] === 1).length;
  assert(backToBack <= 1, `the easy runs bunched: ${days.join(',')}`);
});
