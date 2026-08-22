// THE SPORTS STOP CLUMPING — cyclic consecutive same-sport days (stage 2, 2026-08-21).
//
// ⛔ THE DEFECT THIS PINS. The week came out `runs Mon-Tue-Wed, rides Fri-Sat` and the resolver did
// not prefer the alternating week over it. Not weakly — the trace report ran the real scorer and
// EVERY term came out the same, 54 against 54:
//
//   as built     runs [Mon,Tue,Wed,Sun]  rides [Fri,Sat]   interleaving 2  clustering 0  SCORE 54
//   alternating  runs [Mon,Wed,Fri,Sun]  rides [Tue,Sat]   interleaving 2  clustering 0  SCORE 54
//
// Which week an athlete got was decided by enumeration order. There was nothing to tune; a measure
// was missing.
//
// ⛔ AND THE TWO TERMS THAT LOOKED LIKE THEY COVERED IT ARE THE REASON NOBODY LOOKED FURTHER:
//   • `interleaving` asked "is one sport bracketed by the other" — a span, not neighbours. A week
//     with an easy run early and the long run on Sunday answers YES for nearly every ride placement,
//     so the CLUMPED week scored the maximum.
//   • `clustering` only saw units whose sessions are ALL `easy`, so a hard Tuesday made Mon-Tue-Wed
//     invisible to it. ⚠️ Its NAME is the trap.
// Both are absorbed into `sportAdjacency`; the tests below pin that the absorption lost nothing.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/week-model/sport-adjacency.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildUnits, type Session } from './model.ts';
import { resolve, restDaysOf, score, sportAdjacency } from './resolve.ts';

const D = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** One endurance session of a sport, as the adapter would build it. */
const ses = (id: string, sport: 'run' | 'bike', load: 'easy' | 'hard_cardio' | 'long_run'): Session =>
  ({ id, label: id, load, sport, minutes: 60 });

/** Place a fixed set of sessions on fixed days and score the result. */
const weekOf = (spec: Array<[string, 'run' | 'bike', 'easy' | 'hard_cardio' | 'long_run', number]>) => {
  const sessions = spec.map(([id, sport, load]) => ses(id, sport, load));
  const pins: Record<string, number> = {};
  for (const [id, , , day] of spec) pins[id] = day;
  return buildUnits(sessions, pins).map((u) => ({ unit: u, day: u.pinnedDay! }));
};

Deno.test('⛔ THE REPORT\'S TWO WEEKS NO LONGER TIE — the clumped one loses', () => {
  // runs Mon,Tue,Wed,Sun · rides Fri,Sat  — the week Michael was actually shipped.
  const asBuilt = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.tue],
    ['r2', 'run', 'easy', D.wed], ['r3', 'run', 'long_run', D.sun],
    ['b0', 'bike', 'easy', D.fri], ['b1', 'bike', 'easy', D.sat],
  ]);
  // runs Mon,Wed,Fri,Sun · rides Tue,Sat — the same sessions, alternating.
  const alternating = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.wed],
    ['r2', 'run', 'easy', D.fri], ['r3', 'run', 'long_run', D.sun],
    ['b0', 'bike', 'easy', D.tue], ['b1', 'bike', 'easy', D.sat],
  ]);
  // ⛔ THE ASSERTION IS THE ORDERING, NOT THE MARGIN. A specific point gap would fail the next time
  // any unrelated weight moves, and the claim is only ever "the alternating week wins".
  assert(
    score(alternating) > score(asBuilt),
    `the clumped week still ties or wins: as-built ${score(asBuilt)} vs alternating ${score(alternating)}`,
  );
});

Deno.test('⛔ CYCLIC — Sunday into Monday is back-to-back training', () => {
  // ⚠️ A term blind to the wrap rates Sat-Sun-Mon as two separate singles. The week repeats; the
  // calendar's edge is a drawing convention. Same shape `stressorStreakExcess` already uses.
  const wrapped = weekOf([
    ['r0', 'run', 'easy', D.sun], ['r1', 'run', 'easy', D.mon],
    ['b0', 'bike', 'easy', D.wed],
  ]);
  const spread = weekOf([
    ['r0', 'run', 'easy', D.sun], ['r1', 'run', 'easy', D.tue],
    ['b0', 'bike', 'easy', D.wed],
  ]);
  assert(score(spread) > score(wrapped), 'the Sunday-into-Monday pair scored the same as a spread week');
});

Deno.test('⛔ A HARD DAY IS VISIBLE — this is what `clustering` could not see', () => {
  // `clustering` filtered to units whose sessions are ALL `easy`, so a hard Tuesday between two easy
  // runs made Mon-Tue-Wed score ZERO. That is the exact shape Michael was shipped.
  const withHard = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.tue], ['r2', 'run', 'easy', D.wed],
  ]);
  const spread = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.wed], ['r2', 'run', 'easy', D.fri],
  ]);
  assert(score(spread) > score(withHard), 'a hard session between two easy runs is still invisible');
});

Deno.test('DIFFERENT sports on back-to-back days cost nothing — this is spread, not separation', () => {
  const alternating = weekOf([
    ['r0', 'run', 'easy', D.mon], ['b0', 'bike', 'easy', D.tue], ['r1', 'run', 'easy', D.wed],
  ]);
  const clumped = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'easy', D.tue], ['b0', 'bike', 'easy', D.thu],
  ]);
  assert(
    score(alternating) > score(clumped),
    'a run/ride/run week did not beat a run/run/ride week',
  );
});

Deno.test('⛔ PER DAY, NOT PER SESSION — two runs on one day is ONE run-day here', () => {
  // ⚠️ `sameSportDoubles` (weight 20) owns the two-on-one-day case, and it owns it because that is
  // DATA LOSS downstream, not a shape question. If this term counted per session it would charge
  // twice for one defect and the two penalties would drift.
  //
  // ⛔ ASSERTED ON THE TERM, NOT ON THE TOTAL SCORE, AND THAT IS THE WHOLE POINT OF THIS CASE. The
  // first version compared two full scores and passed with the term counting per SESSION — mutation-
  // tested 2026-08-21, twice — because `sameSportDoubles` at 20 swamps anything this term does. A
  // test whose subject is drowned out by a heavier term is testing the heavier term.
  const doubled = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'easy', D.mon], ['b0', 'bike', 'easy', D.wed],
  ]);
  assertEquals(sportAdjacency(doubled), 0, 'two runs on ONE day were counted as adjacent');
  const consecutive = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'easy', D.tue], ['b0', 'bike', 'easy', D.thu],
  ]);
  assertEquals(sportAdjacency(consecutive), 1, 'two runs on consecutive days were not counted');
});

Deno.test('⛔ THE REPORT\'S NUMBERS, ASSERTED ON THE TERM ITSELF — 4 against 1', () => {
  // The measurement the whole stage rests on. ⚠️ Through `sportAdjacency` directly, so a future edit
  // that changes what "adjacent" means fails here rather than shifting a score nobody reads.
  const asBuilt = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.tue],
    ['r2', 'run', 'easy', D.wed], ['r3', 'run', 'long_run', D.sun],
    ['b0', 'bike', 'easy', D.fri], ['b1', 'bike', 'easy', D.sat],
  ]);
  // runs (Mon,Tue) (Tue,Wed) (Sun,Mon) = 3, rides (Fri,Sat) = 1.
  assertEquals(sportAdjacency(asBuilt), 4);
  const alternating = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'hard_cardio', D.wed],
    ['r2', 'run', 'easy', D.fri], ['r3', 'run', 'long_run', D.sun],
    ['b0', 'bike', 'easy', D.tue], ['b1', 'bike', 'easy', D.sat],
  ]);
  // runs (Sun,Mon) = 1, rides none.
  assertEquals(sportAdjacency(alternating), 1);
});

Deno.test('⛔ IT CANNOT BUY THE DAY OFF — the 2026-08-19 ordering, asserted as arithmetic', () => {
  // ⛔⛔ THIS IS THE CONSTRAINT THE WHOLE STAGE WAS BOUNDED BY, AND IT TOOK THREE ATTEMPTS TO WRITE A
  // VERSION THAT CAN FAIL. Both earlier ones survived a mutant weight of 44 and even 100:
  //   1. six runs + a blank day vs seven runs — the extra run ADDS adjacency, so the term agreed
  //      with the rest day for the wrong reason and any weight passed.
  //   2. four runs + three lifts through `resolve` — the rest day there is held by the `minRest`
  //      floor (a −500 penalty on `recoveryDaysOf`), not by `blank * 40`, so the weight never got
  //      to compete.
  //
  // ⛔ SO IT IS ASSERTED AS THE ARITHMETIC IT ACTUALLY IS: the most this term can ever swing between
  // two arrangements of the SAME sessions must stay under what a blank day is worth. Michael,
  // 2026-08-19: *"stripping away an athlete's only true day off just to make the weekly layout look
  // symmetrical is a failure of coaching."*
  const clumped = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'easy', D.tue], ['r2', 'run', 'easy', D.wed],
    ['b0', 'bike', 'easy', D.fri], ['b1', 'bike', 'easy', D.sat],
  ]);
  const spread = weekOf([
    ['r0', 'run', 'easy', D.mon], ['r1', 'run', 'easy', D.wed], ['r2', 'run', 'easy', D.fri],
    ['b0', 'bike', 'easy', D.tue], ['b1', 'bike', 'easy', D.sat],
  ]);
  // Same five sessions, same number of occupied days, so every other term is unchanged and the gap
  // IS this term's swing.
  assertEquals(sportAdjacency(clumped), 3);
  assertEquals(sportAdjacency(spread), 0);
  const swing = score(spread) - score(clumped);
  assert(swing > 0, `the spread week does not win: ${swing}`);
  // ⛔ 40 IS THE BLANK DAY. A term that can swing further than this starts trading rest days for
  // symmetry, which is the exact mistake made and caught on 2026-08-19 — `blank` was weighted 3 and
  // 37 of 61 sweep shapes came back with no rest day at all.
  assert(swing < 40, `the spread term can outbid the day off: swing ${swing} against a blank day's 40`);
});

Deno.test('the resolver actually picks the spread week when it is free to', () => {
  // ⚠️ THROUGH `resolve`, NOT THROUGH `score` — a term that scores correctly and never changes an
  // answer is the §0f loss. Three easy runs, nothing pinned, seven days.
  const units = buildUnits(
    [ses('r0', 'run', 'easy'), ses('r1', 'run', 'easy'), ses('r2', 'run', 'easy')],
    {},
  );
  const r = resolve(units, { minRestDays: 1 });
  const days = r.ok ? r.placements.map((p) => p.day) : r.best.map((p) => p.day);
  const adjacency = days.filter((d) => days.includes((d + 1) % 7)).length;
  assertEquals(adjacency, 0, `three unpinned easy runs landed on consecutive days: ${days.sort().join(',')}`);
});
