// ============================================================================
// ENDURANCE PINS BEAT THE FRAME ORDER — the 2026-08-25 ruling, as regressions.
//
// ⛔ WHAT IS AT STAKE. This file's own law is that the frame owns the ORDER and the SPACING, and
// the athlete owns only which weekday the block opens on — a whole-week ROTATION, which costs the
// frame nothing. Michael's ruling ("user choice always wins, it's just informed") and the fork
// answered 2026-08-25 carve ONE hole in that: an endurance session steps out of the frame order
// onto the day the athlete pinned. The lifts do not.
//
// ⛔ SO THERE ARE THREE CLAIMS, AND THE THIRD IS THE ONE THAT WILL BREAK BY ACCIDENT:
//   1. A pinned endurance day lands on that weekday, whatever rotation the frame chose.
//   2. The LIFTS keep the frame's order and spacing — the hole is endurance-only.
//   3. NO PINS IS THE OLD WEEK, BYTE FOR BYTE. Every block built before this field existed came
//      through the rotation alone, and the field must be inert when nobody set it.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check \
//        supabase/functions/_shared/standing-plan/pins-beat-frame.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  composeWeek,
  defaultCompetitionLifts,
  FRAMES,
  WEEKDAYS,
  workingNumberFromTest,
  type ComposeArgs,
  type Weekday,
} from './index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const BASE: Omit<ComposeArgs, 'week' | 'column'> = {
  frame: 'strength_5k',
  competitionLifts: defaultCompetitionLifts(),
  workingNumbers: {
    bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
    squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
  },
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

/** Week 2 — past the test week, so the ordinary endurance slots are all present. */
const week = (extra: Partial<ComposeArgs> = {}) =>
  composeWeek({ ...BASE, week: 2, column: 'standard', ...extra });

const days = (w: ReturnType<typeof composeWeek>, pred: (s: { type?: string; name: string }) => boolean) =>
  w.sessions.filter(pred).map((s) => s.day);

const isLift = (s: { type?: string }) => s.type === 'strength';
const isEndurance = (s: { type?: string }) => s.type != null && s.type !== 'strength';

/** The frame's long slot is the LSD family; its hard slots are MLSS / near-threshold. */
const LONG_NAME = /Long/i;

Deno.test('⛔ A PINNED LONG DAY LANDS ON THAT WEEKDAY, whatever rotation the frame picked', () => {
  for (const target of ['Tuesday', 'Thursday', 'Sunday'] as Weekday[]) {
    const w = week({ dayOffset: 0, endurancePins: { long: target } });
    const longDays = days(w, (s) => isEndurance(s) && LONG_NAME.test(s.name));
    assert(longDays.length > 0, 'the week produced no long session to pin');
    for (const d of longDays) {
      assertEquals(d, target, `the long session ignored its pin: wanted ${target}, got ${d}`);
    }
  }
});

Deno.test('⛔ THE PIN BEATS THE ROTATION — the same pin wins under every offset', () => {
  // ⚠️ THIS IS THE WHOLE POINT OF THE RULING. Under the old law the rotation decided and the pin was
  // only an input to choosing it; a pin the rotation could not reach was reported and dropped.
  for (let offset = 0; offset < 7; offset++) {
    const w = week({ dayOffset: offset, endurancePins: { long: 'Wednesday' } });
    for (const d of days(w, (s) => isEndurance(s) && LONG_NAME.test(s.name))) {
      assertEquals(d, 'Wednesday', `offset ${offset} overrode the pin`);
    }
  }
});

Deno.test('⛔ THE HOLE IS ENDURANCE-ONLY — the lifts keep the frame order and spacing', () => {
  // ⛔ THE LIFTS ARE THE HALF OF THE FRAME THAT IS LOAD-BEARING ON ITS OWN: the ME/DE ordering and
  // the gaps between lifting days. A pin must not disturb them, and this is the assertion that says
  // so if anyone extends `enduranceDayFor` to `day.strength`.
  const plain = week({ dayOffset: 2 });
  const pinned = week({ dayOffset: 2, endurancePins: { long: 'Wednesday', hard: ['Monday', 'Friday'] } });
  const shape = (w: ReturnType<typeof composeWeek>) =>
    w.sessions.filter(isLift).map((s) => `${s.name}@${s.day}`).sort().join(' | ');
  assertEquals(shape(pinned), shape(plain), 'pinning an endurance day moved the lifting');
});

Deno.test('⛔ AND THE REST SLOT IS THE FRAME\'S — pinning does not invent or delete a day off', () => {
  // ⚠️ A pin can legitimately FILL the frame's rest day — that is the athlete's call and it comes
  // back as a trade-off note on the screen. What must not happen is the composer silently moving
  // the lifting to manufacture a new one.
  const plain = week({ dayOffset: 2 });
  const pinned = week({ dayOffset: 2, endurancePins: { long: 'Wednesday' } });
  const liftDays = (w: ReturnType<typeof composeWeek>) =>
    [...new Set(w.sessions.filter(isLift).map((s) => s.day))].sort().join(',');
  assertEquals(liftDays(pinned), liftDays(plain), 'the lifting days moved to rearrange the rest day');
});

Deno.test('⛔⛔ NO PINS IS THE OLD WEEK, BYTE FOR BYTE — the field is inert when nobody set it', () => {
  // ⚠️ THE REGRESSION THAT WOULD BE INVISIBLE. Every block built before this field existed came
  // through the rotation alone; an accidental default here would rewrite all of them.
  for (let offset = 0; offset < 7; offset++) {
    const plain = week({ dayOffset: offset });
    const emptyObj = week({ dayOffset: offset, endurancePins: {} });
    const emptyVals = week({ dayOffset: offset, endurancePins: { long: null, hard: [null, undefined] } });
    const shape = (w: ReturnType<typeof composeWeek>) =>
      w.sessions.map((s) => `${s.name}@${s.day}`).sort().join(' | ');
    assertEquals(shape(emptyObj), shape(plain), `offset ${offset}: an empty pins object changed the week`);
    assertEquals(shape(emptyVals), shape(plain), `offset ${offset}: null pins changed the week`);
  }
});

Deno.test('⛔ AN UNPINNED SLOT STILL ROTATES — a pin on one anchor does not freeze the others', () => {
  // Pin only the long day; the hard slots must still follow the frame's rotation, not collapse onto
  // some default. ⚠️ Compared across two offsets, because "follows the rotation" IS "moves with it".
  const a = week({ dayOffset: 0, endurancePins: { long: 'Sunday' } });
  const b = week({ dayOffset: 3, endurancePins: { long: 'Sunday' } });
  const hardish = (w: ReturnType<typeof composeWeek>) =>
    w.sessions.filter((s) => isEndurance(s) && !LONG_NAME.test(s.name)).map((s) => s.day).join(',');
  assert(
    hardish(a) !== hardish(b),
    'the unpinned endurance slots stopped following the rotation once one anchor was pinned',
  );
  for (const d of days(a, (s) => isEndurance(s) && LONG_NAME.test(s.name))) assertEquals(d, 'Sunday');
  for (const d of days(b, (s) => isEndurance(s) && LONG_NAME.test(s.name))) assertEquals(d, 'Sunday');
});

Deno.test('⛔ A PIN NAMING A DAY THAT IS NOT A WEEKDAY IS NOT A PIN — it degrades to the rotation', () => {
  // ⚠️ Absent and unusable must be the same answer here. A malformed pin that reached the composer
  // as a live value would compare against nothing and silently strand the session.
  const plain = week({ dayOffset: 1 });
  const junk = week({ dayOffset: 1, endurancePins: { long: '' as unknown as Weekday } });
  const shape = (w: ReturnType<typeof composeWeek>) =>
    w.sessions.map((s) => `${s.name}@${s.day}`).sort().join(' | ');
  assertEquals(shape(junk), shape(plain), 'an unusable pin was treated as a real one');
});

Deno.test('the frame still has exactly one long slot and the pins map onto real anchors', () => {
  // A guard on the assumption the whole file rests on: `anchorRoleOf` in compose.ts keys off the
  // family names below, and a frame edit that renames them would make every pin above a no-op.
  const standard = FRAMES.strength_5k.columns.standard;
  const families = standard.flatMap((d) => d.endurance.map((e) => e.family));
  assertEquals(families.filter((f) => f === 'run_lsd').length, 1, 'the frame no longer has one long slot');
  assert(
    families.some((f) => f === 'run_mlss' || f === 'run_near_threshold'),
    'the frame has no hard slot for a hard-day pin to land on',
  );
  assertEquals(WEEKDAYS.length, 7);
});
