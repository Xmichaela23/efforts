// ============================================================================
// THE GATE — WHAT THE ATHLETE GOT LAST TIME REACHES THE ROW (stage 2, items 5 and 6).
//
//   ~/.deno/bin/deno test -A --no-check --sloppy-imports \
//     supabase/functions/_shared/standing-plan/standing-plan-last-result.test.ts
//
// ⛔ TWO BUGS, ONE FACT.
//
//   ITEM 5 — THE PHANTOM. `set_plan` stamped the top of the rep band on every ME set, so the logger
//   opened every heavy set reading FIVE. An athlete who tapped Done without editing handed the
//   progression a five-rep session they never performed, and two of those in a row move the bar.
//
//   ITEM 6 — THE FROZEN BLOCK. The row printed "1-5" and nothing else, and on a light bar the weight
//   moves once in twelve weeks. A block progressing exactly as designed reads as frozen for eight.
//
// Both are answered by the same fact — what they actually got — so it travels as one argument.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { earnedMeSets } from './me-history.ts';
import { restateFromTest } from './restate.ts';
import { prescribe } from '../strength-grid/index.ts';

const LIGHT_BENCH = {
  lift: 'bench' as const, workingNumber: 163, predicted1RM: 170,
  epley: 171, brzycki: 169, from: { weight: 145, reps: 3 },
};
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: { bench: LIGHT_BENCH },
  roundTo: 5,
};
const ME_BAND = (() => {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 };
})();

function dateOn(day: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return new Date(Date.parse('2026-01-04T00:00:00Z') + names.indexOf(day) * 86400000)
    .toISOString().slice(0, 10);
}
const benchOf = (wk: any) => wk.sessions
  .flatMap((s: any) => s.strength_exercises ?? [])
  .find((e: any) => e.name === 'Bench Press');

// ── ITEM 5 — THE PHANTOM ────────────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ THE HEAVY SET NEVER OPENS AT THE TOP OF THE BAND — the phantom five-rep session', () => {
  const bench = benchOf(composeWeek({ ...BASE, week: 4, column: 'standard' } as never));
  assert(bench, 'the fixture stopped producing a bench ME row');
  assertEquals(bench.reps, `${ME_BAND.lo}-${ME_BAND.hi}`, 'the row stopped printing the band');
  // ⚠️ WORK SETS ONLY. The ramp (pp.139-140) sits in front of them and its rungs carry their
  // own rep counts — a warm-up at 5 reps is not the heavy set opening at the top of the band.
  for (const p of (bench.set_plan ?? []).filter((x: any) => x?.warmup !== true)) {
    assert(p.reps == null || p.reps < ME_BAND.hi,
      `the heavy set still opens at ${p.reps} — the top of his band, which nobody has to earn`);
  }
  // ⛔ AND WITH NO HISTORY IT OPENS BLANK, NOT AT THE FLOOR. Michael's ruling, 2026-08-25: prefilling
  // the band floor "read as do 1 rep". The row's own 1-5 carries the target instead.
  // ⚠️ WORK SETS ONLY — the ramp (pp.139-140) sits in front and is not a prescription set.
  assertEquals((bench.set_plan ?? []).filter((p: any) => p?.warmup !== true).every((p: any) => p.reps == null), true);
  // ⚠️ AND THE WEIGHT IS STILL THERE. Only the rep count opens blank — item 5 prefills the weight.
  assert(Number(bench.weight) > 0, 'the heavy set lost its prescribed weight');
});

Deno.test('⛔ THE OTHER THREE INTENTS KEEP THEIR SET PLAN — this is an ME ruling, not a rewrite', () => {
  const wk = composeWeek({ ...BASE, week: 4, column: 'standard' } as never);
  const priced = wk.sessions.flatMap((s: any) => s.strength_exercises ?? [])
    .filter((e: any) => e.slot_intent && e.slot_intent !== 'ME' && Array.isArray(e.set_plan));
  assert(priced.length > 0, 'no non-ME row with a set plan — the assertion below is vacuous');
  for (const e of priced) {
    for (const p of e.set_plan.filter((x: any) => x?.warmup !== true)) {
      assert(Number.isFinite(Number(p.reps)) && Number(p.reps) > 0,
        `${e.name} (${e.slot_intent}) lost its per-set rep count`);
    }
  }
});

Deno.test('⛔ WITH A LAST TIME, THE SET OPENS ON WHAT THEY GOT — never higher', () => {
  const wk = composeWeek({
    ...BASE, week: 4, column: 'standard', meLastRepsByPattern: { push_upper: [5, 4, 3] },
  } as never);
  const bench = benchOf(wk);
  // ⚠️ THE MOST RECENT, not the best. A window of 5-4-3 is a lift heading down, and opening on the 5
  // would hand the athlete back a number they have not made in two sessions.
  for (const p of (bench.set_plan ?? []).filter((x: any) => x?.warmup !== true)) assertEquals(p.reps, 3);
});

// ── ITEM 6 — THE FROZEN BLOCK ───────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ THE ROW CARRIES LAST TIME\'S RESULT, AND THE BAND STRING IS UNTOUCHED', () => {
  const bench = benchOf(composeWeek({
    ...BASE, week: 4, column: 'standard', meLastRepsByPattern: { push_upper: [4, 5] },
  } as never));
  assertEquals(bench.last_reps, [4, 5]);
  /**
   * ⛔ AND IT IS ITS OWN FIELD RATHER THAN TEXT INSIDE `reps`. Four readers parse that string —
   * `isRepBandRow`'s anchored `^\d+-\d+$`, `hasRepTotal`, the logger's leading-digit prefill and the
   * plan formatter — so appending "· last 5" to it would silently reclassify the row on every one of
   * them. The band stays the band.
   */
  assertEquals(bench.reps, `${ME_BAND.lo}-${ME_BAND.hi}`);
});

Deno.test('⛔ NO HISTORY MEANS NO LINE — the row says nothing rather than something empty', () => {
  const bench = benchOf(composeWeek({ ...BASE, week: 4, column: 'standard' } as never));
  assertEquals(bench.last_reps, undefined);
  const empty = benchOf(composeWeek({
    ...BASE, week: 4, column: 'standard', meLastRepsByPattern: { push_upper: [] },
  } as never));
  assertEquals(empty.last_reps, undefined, 'an empty window rendered as a result');
});

Deno.test('⛔ AND ONLY THE ME SLOT CARRIES IT — a DE row is a different intent', () => {
  const wk = composeWeek({
    ...BASE, week: 4, column: 'standard', meLastRepsByPattern: { push_upper: [5] },
  } as never);
  const notMe = wk.sessions.flatMap((s: any) => s.strength_exercises ?? [])
    .filter((e: any) => e.slot_intent !== 'ME');
  assert(notMe.length > 0);
  for (const e of notMe) assertEquals(e.last_reps, undefined, `${e.name} took the heavy slot's result`);
});

// ── THE RESTATER: A FLAT WEEK STILL GETS THE NUMBER ─────────────────────────────────────────────

Deno.test('⛔⛔ THE RESULT REACHES A ROW WHOSE WEIGHT DID NOT MOVE — the third axis', () => {
  /**
   * ⛔ THE SAME TRAP `setsMove` WAS WRITTEN FOR, ONE FIELD ALONG. What the athlete got changes every
   * session; the weight changes once in twelve weeks. A diff that tested only the weight and the set
   * count would compute the result correctly and never write it to a single calendar row — the
   * silent no-op this whole file warns about. ⚠️ MUTATION-TESTED by dropping `repsMove`.
   */
  const authored = composeBlock({ ...BASE, weeks: 8, taperWeeks: [] } as never);
  const withResult = composeBlock({
    ...BASE, weeks: 8, taperWeeks: [], meLastRepsByPattern: { push_upper: [3] },
  } as never);

  const planned = authored.flatMap((wk: any) => wk.sessions
    .filter((s: any) => s.type === 'strength')
    .map((s: any, i: number) => ({
      id: `${wk.week}-${i}`, week_number: wk.week, date: dateOn(s.day),
      strength_exercises: s.strength_exercises,
    })));

  const restated = restateFromTest({ composed: withResult, planned, afterWeek: 3 });
  const row = restated.rows.find((r) => r.strength_exercises.some((e: any) => e.name === 'Bench Press'));
  assert(row, 'no bench row was rewritten — the result never reached the calendar');
  const bench = row!.strength_exercises.find((e: any) => e.name === 'Bench Press') as any;
  assertEquals(bench.last_reps, [3]);
  // ⚠️ THE FIRST WORK SET, not the first row in the plan — the ramp (pp.139-140) is in front of it.
  assertEquals((bench.set_plan ?? []).filter((x: any) => x?.warmup !== true)[0]?.reps, 3, 'the logger prefill did not travel with it');

  /**
   * ⛔ AND IT IS NOT A `changes` ENTRY. That list is the PRESCRIPTION diff the athlete is asked to
   * accept; what they lifted last Tuesday is provenance the row displays. Putting it there would ask
   * for consent to a change nobody made.
   */
  assertEquals(restated.changes.filter((c) => c.movement === 'Bench Press').length, 0);
});

Deno.test('⛔ AND IT CLEARS. A pattern that just jumped has no last time at the new weight', () => {
  // ⚠️ THE HALF THAT IS EASY TO MISS: writing the number is not enough if it can never be taken back.
  // After a jump the window is empty by construction, and a row still showing last block's 5 would be
  // a claim about a session performed at a lighter bar.
  const withResult = composeBlock({
    ...BASE, weeks: 8, taperWeeks: [], meLastRepsByPattern: { push_upper: [3] },
  } as never);
  const cleared = composeBlock({ ...BASE, weeks: 8, taperWeeks: [] } as never);
  const planned = withResult.flatMap((wk: any) => wk.sessions
    .filter((s: any) => s.type === 'strength')
    .map((s: any, i: number) => ({
      id: `${wk.week}-${i}`, week_number: wk.week, date: dateOn(s.day),
      strength_exercises: s.strength_exercises,
    })));
  const restated = restateFromTest({ composed: cleared, planned, afterWeek: 3 });
  const row = restated.rows.find((r) => r.strength_exercises.some((e: any) => e.name === 'Bench Press'));
  assert(row, 'the stale result was left on the calendar for the rest of the block');
  const bench = row!.strength_exercises.find((e: any) => e.name === 'Bench Press') as any;
  assertEquals(bench.last_reps, undefined);
});

// ── END TO END ──────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE READER HANDS THE COMPOSER THE NUMBER IT NEEDS', () => {
  const authored = composeBlock({ ...BASE, weeks: 12, taperWeeks: [] } as never);
  const rows = authored.flatMap((b: any) => b.meRows)
    .filter((r: any) => r.movement === 'Bench Press' && r.week <= 3);
  assert(rows.length >= 1);
  const logged = rows.map((r: any) => ({
    week_number: r.week,
    date: dateOn(r.day),
    strength_exercises: [{
      name: r.movement,
      sets: [{ reps: 3, weight: r.weight ?? 145, completed: true }],
    }],
  }));
  const reading = earnedMeSets({ composed: authored, logged, throughWeek: 3 });
  assertEquals(reading.lastReps.push_upper, [3]);
  // ⚠️ THE SAME SHAPE THE COMPOSER TAKES, so the restater can pass it straight through — one fact,
  // one owner, no reshaping at the seam.
  const bench = benchOf(composeWeek({
    ...BASE, week: 6, column: 'standard', meLastRepsByPattern: reading.lastReps,
  } as never));
  assertEquals(bench.last_reps, [3]);
  assertEquals((bench.set_plan ?? []).filter((x: any) => x?.warmup !== true)[0]?.reps, 3);
});
