// ============================================================================
// THE GATE — A3: named plyometric drills, on the ruled placements, no generic row.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-plyo.test.ts
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — see `docs/NOTES-session-a-device-fixes-2026-08-24.md`.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { PLYO_DOSE } from './frames.ts';
import {
  drillForWeek,
  PLYO_FAMILIES,
  PLYO_FAMILIES_PER_DAY,
  PLYO_FAMILY_IDS,
  PLYO_FAMILY_MIX_IS_OURS,
  PLYO_ROTATION_ORDER_IS_HIS,
} from './plyo.ts';
import { FRAMES } from './frames.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { equipmentForExercise, isBodyweightLogged } from '../../../../src/lib/strength-logging-mode.ts';
import { isPlyometricMovement } from '../../../../src/lib/strength-rest-timer.ts';

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  roundTo: 5,
};

const everyDrill = () => PLYO_FAMILY_IDS.flatMap((f) => PLYO_FAMILIES[f].drills);

Deno.test('⛔ NO GENERIC ROW SURVIVES — every plyo row names a drill from his own three families', () => {
  // ⛔ THE DEVICE FINDING, EXACTLY. The built block read `Plyometric drills 3×4` — the name of a
  // CATEGORY with a set count on it, which p227's first instruction ("all drills are done
  // SEPARATELY") cannot be followed from.
  const named = new Set(everyDrill());
  for (const week of [2, 3, 4, 5]) {
    for (const column of ['standard', 'taper'] as const) {
      const wk = composeWeek({ ...BASE, week, column } as never);
      const rows = wk.sessions.filter((s) => s.tags.includes('plyo'))
        .flatMap((s) => s.strength_exercises ?? []);
      assert(rows.length > 0, `week ${week} ${column}: no plyometric row at all`);
      for (const r of rows) {
        assert(named.has(r.name), `week ${week} ${column}: "${r.name}" is not one of his drills`);
        assert(!/^plyometric drills$/i.test(r.name), 'the placeholder row is back');
        // ⛔ ONE ROW, ONE DRILL. `sets: 3` on a row called "drills" is the placeholder in disguise.
        assertEquals(r.sets, 1, `${r.name}: a plyo row prescribes one drill`);
        assertEquals(r.reps, ''); // 2026-09-18: no count — p227 gives none; the 3-4 was ours
        assertEquals(r.load_prescribed, false);
      }
    }
  }
});

Deno.test('⛔ EVERY DRILL RESOLVES IN THE CATALOGUE AND LOGS AS A PLYOMETRIC, NOT A BARBELL LIFT', () => {
  /**
   * ⛔ D-322's DISEASE WITH A NEW FACE. A prescribed name the catalogue does not hold returns null
   * from `getExerciseConfig`, and `equipmentForExercise` then falls through to its `barbell` default
   * — a plate calculator and a 45 lb bar drawn over an A-skip. That is the 2026-08-01 Box Jump defect
   * re-entering through vocabulary rather than through a rule.
   *
   * ⚠️ BOTH HALVES ARE CHECKED. A config entry with no classifier word still draws a load column, and
   * a classifier word with no config entry still borrows a neighbour's ratio through the fuzzy match.
   */
  for (const name of everyDrill()) {
    /**
     * ⛔ `via` MUST BE AN EXACT MATCH, AND MUTATION TESTING IS WHY. `getExerciseConfig` falls back to
     * a FUZZY match and returns a NEIGHBOUR'S config with a console warning — so asserting only that
     * it is non-null passed even with the drill's own key renamed away. That is D-322 exactly: the
     * row silently borrows another movement's ratio and display format, and the test that was
     * supposed to catch it reports green.
     */
    const r = resolveExerciseConfig(name);
    assert(r.config != null, `"${name}" has no entry in exercise-config.ts`);
    assert(r.via !== 'fuzzy', `"${name}" only resolves by fuzzy match — it borrows "${r.matchedKey}"`);
    assertEquals(r.config!.pattern, 'plyometric', `"${name}" is not classified plyometric`);
    assertEquals(equipmentForExercise(name), 'plyo', `"${name}" would be drawn a load column`);
    // ⛔ AND THE REST TIMER, which is a THIRD private list with a THIRD normalizer. p227's own rule
    // is "ample rest"; a drill that misses this list rests ninety seconds like an accessory.
    assert(isPlyometricMovement(name), `"${name}" would be rested like an accessory`);
  }
});

Deno.test('⛔ THE LOGGER SEES EVERY DRILL AS BODYWEIGHT — and it is no longer a private list', async () => {
  /**
   * ⛔ IT WAS THREE LISTS, THREE NORMALIZERS, ONE VOCABULARY. `isBodyweightMove` lived inline in
   * `StrengthLogger.tsx` and stripped spaces AND hyphens, so its stems were spelt differently again
   * (`askip`, `stiffleggedrun`, `ladderdrill`) — and this test had to LINT THE REGEX out of the
   * component by grep, because a unit test cannot render it.
   *
   * ✅ **2026-08-27: THE COMPONENT NOW ASKS THE SHARED TYPE TABLE** (`isBodyweightLogged`), so the
   * question can be asked directly instead of pattern-matched out of a 6,000-line file. The trigger
   * was an Ab Wheel Rollout on Michael's live session being drawn a bar and a plate calculator; the
   * same regex was missing 55 other movements.
   *
   * ⚠️ THE DRILLS ARE THE CASE THAT MUST NOT REGRESS. p227 names them and none carries a jump or hop
   * word, so they were the reason three separate lists were extended by hand in 2026-08-24.
   */
  for (const name of everyDrill()) {
    assert(isBodyweightLogged(name), `"${name}" would be drawn a load column by the logger`);
  }
  // ⛔ AND THE INLINE REGEX MUST NOT COME BACK. It is the fifth private classifier for this question
  // and it was wrong in both directions; a `const isBodyweightMove = ... /dip|chinup/` here again
  // means the shared answer has been quietly forked.
  const src = await Deno.readTextFile(
    new URL('../../../../src/components/StrengthLogger.tsx', import.meta.url).pathname);
  assert(!/\/dip\|chinup/.test(src), 'the logger re-inlined its own bodyweight regex');
  assert(src.includes('isBodyweightLogged'), 'the logger stopped asking the shared classifier');
});

Deno.test('⛔⛔ WEEK 1 IS FOOTSPEED AND IN-PLACE WORK — p89\'s ramp, not the table\'s order', () => {
  /**
   * ⛔ p89, *"Building to Plyos"*: *"I typically introduce an athlete to plyometrics via a
   * combination of foot-speed drills and static plyometrics"*, and only *"with these skills
   * mastered… you can proceed to more conventional dynamic plyometrics, such as skipping, bounding,
   * and hops/jumps."* p88 adds that these are movements many trainees have not performed since
   * school *"if ever"*.
   *
   * ⛔ THE DEFECT THIS PINS: the rotation walked the p227 TABLE, so week 1 served an A-skip
   * (skipping) and single-leg hops (hops) — one from each half of the group he puts SECOND.
   *
   * ⚠️ THE NAMES AND THE FAMILIES DID NOT MOVE, only the order. `rotation` must stay a permutation
   * of `drills`, or a drill has been invented or lost.
   */
  for (const family of PLYO_FAMILY_IDS) {
    const f = PLYO_FAMILIES[family];
    assertEquals([...f.rotation].sort(), [...f.drills].sort(),
      `${family}: the rotation is not a permutation of his drills`);
  }

  // ⛔ THE AFTER-MASTERY GROUP, IN HIS OWN WORDS: skipping, bounding, hops/jumps. None of them in
  // week 1, on either column.
  const AFTER_MASTERY = ['A-Skip', 'B-Skip', 'Bounding', 'Single-Leg Hops', 'Skater Hops', 'Lunge Hops'];
  for (const column of ['standard', 'taper'] as const) {
    const wk = composeWeek({ ...BASE, week: 1, column } as never);
    const names = wk.sessions.filter((s) => s.tags.includes('plyo'))
      .flatMap((s) => (s.strength_exercises ?? []).map((e) => e.name));
    assert(names.length > 0, `${column}: week 1 has no plyo rows`);
    for (const n of names) {
      assert(!AFTER_MASTERY.includes(n), `${column}: week 1 serves "${n}", which p89 puts after mastery`);
    }
  }

  // ⛔ AND THE ORDER IS LABELLED HIS. It was the table's order presented as a ramp, which is the
  // silent reconciliation this codebase labels its way out of.
  assert(/p89/.test(PLYO_ROTATION_ORDER_IS_HIS));
  assert(/his/i.test(PLYO_ROTATION_ORDER_IS_HIS));
});

Deno.test('the drills rotate week to week — he asks for the variety outright', () => {
  // ⛔ p275: the plyo warm-up is left open-ended *"because variety and week-to-week modification are
  // encouraged."* ⚠️ MUTATION-TESTED by freezing the week index.
  for (const family of PLYO_FAMILY_IDS) {
    assert(PLYO_FAMILIES[family].drills.length >= 2, `${family} has one drill and cannot rotate`);
    // The foot-speed family rotates for an athlete with an agility ladder; without one it has one drill (below).
    assert(drillForWeek(family, 2, ['Agility ladder']) !== drillForWeek(family, 3, ['Agility ladder']), `${family} did not move week to week`);
  }
  // ⛔ AND NO DRILL IS PRESCRIBED TWICE IN A WEEK — one from each family, and the families are
  // disjoint, so a repeat would mean the same family was read twice.
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard' } as never);
  const names = wk.sessions.filter((s) => s.tags.includes('plyo'))
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => e.name));
  assertEquals(new Set(names).size, names.length, 'a drill appears twice in one week');
});

Deno.test('⛔⛔ THE PLYO DAY IS THE FRAME\'S, AND THIS MODULE HOLDS NO DAY NUMBER OF ITS OWN', async () => {
  /**
   * ⛔ A THREE-DAY SPREAD — day 1 × 1, day 3 × 2, day 6 × 1 — WAS BUILT AND REVERTED ON 2026-08-24.
   * `DEVICE-FINDINGS-standing-plan-2026-08-24.md` A3 attributed it to p246; **it is the half-marathon
   * frame's layout (p250)**, and Michael confirmed the findings doc had conflated the two. p246 as
   * transcribed off the image on 2026-08-23 prints *"Plyo warm-up"* on day 3 alone, in BOTH columns.
   *
   * ⛔ THE GUARD AGAINST IT COMING BACK IS STRUCTURAL, not a number in a test: `plyo.ts` owns the
   * FAMILIES and `frames.ts` owns the DAY, so there is nowhere to write a second day. This asserts
   * that separation as well as the outcome.
   */
  const src = await Deno.readTextFile(new URL('./plyo.ts', import.meta.url).pathname);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\bday\s*:/.test(code), 'plyo.ts carries a day number — the frame owns the day');

  for (const column of ['standard', 'taper'] as const) {
    const marked = FRAMES.strength_5k.columns[column].filter((d) => d.plyo === true);
    assertEquals(marked.map((d) => d.day), [3], `${column}: the frame moved its plyo day`);
    // 2026-09-20: a kit with the agility ladder reaches all three families; without it the day holds two (below).
    const wk = composeWeek({ ...BASE, week: 2, column, equipment: ['Agility ladder'] } as never);
    const sessions = wk.sessions.filter((s) => s.tags.includes('plyo'));
    assertEquals(sessions.length, 1, `${column}: the week does not hold exactly one plyo session`);
    assertEquals(sessions[0].strength_exercises!.length, PLYO_FAMILIES_PER_DAY.length);
  }
});

Deno.test('one drill from each of his three families, and that arrangement is labelled OURS', () => {
  // ⛔ HIS: p227 caps a day at "three or four" and names exactly three families; p275 puts the
  // warm-up at one to three skills. ⚠️ OURS: taking one from each bucket rather than three from one.
  assertEquals(PLYO_FAMILIES_PER_DAY, PLYO_FAMILY_IDS);
  assert(/ours/i.test(PLYO_FAMILY_MIX_IS_OURS));
  // 2026-09-20: with the agility ladder every family is reachable; the foot-speed family needs it.
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', equipment: ['Agility ladder'] } as never);
  const rows = wk.sessions.filter((s) => s.tags.includes('plyo')).flatMap((s) => s.strength_exercises ?? []);
  for (const family of PLYO_FAMILY_IDS) {
    assertEquals(rows.filter((r) => PLYO_FAMILIES[family].drills.includes(r.name)).length, 1,
      `${family} is not represented exactly once`);
  }
  assert(wk.notes.some((n) => n.kind === 'ours' && n.text === PLYO_FAMILY_MIX_IS_OURS),
    'the block does not say the family mix is ours');
});

Deno.test('the drills never enter the dosing ledger', () => {
  /**
   * ⛔ p147 COUNTS HEAVY WORK SETS. A four-effort skip is neither heavy nor a barbell set, and
   * counting it would charge the day against p086's fourteen-set ceiling — which decides which
   * session the muscle floor lands on. ⚠️ Measured by the ledger's own session list: a plyo session
   * has no ledger line at all.
   */
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard' } as never);
  const drills = new Set(everyDrill());
  for (const line of wk.ledger.perSession) {
    assert(line.label !== 'Plyo warm-up', 'the plyo session reached the dosing ledger');
  }
  // And no drill is attributed to a muscle, in either direction.
  for (const m of wk.ledger.perMuscle) {
    for (const from of m.secondaryFrom) assert(!drills.has(from), `${from} was counted against ${m.muscle}`);
  }
});

Deno.test('⛔ NO DRILL AN ATHLETE CANNOT DO — ladder drills need an agility ladder (WORKORDER-plyo-screen §3)', () => {
  const weeksOfNames = (equipment: string[] | null) =>
    [1, 2, 3, 4, 5, 6].flatMap((week) => {
      const wk = composeWeek({ ...BASE, week, column: 'standard', equipment } as never);
      return wk.sessions.filter((s) => s.tags.includes('plyo')).flatMap((s) => (s.strength_exercises ?? []).map((e) => e.name));
    });
  const noLadder = weeksOfNames(['Barbell + plates', 'Dumbbells', 'Pull-up bar', 'Resistance bands']);
  // 2026-09-20: all three foot-speed drills are done in an agility ladder, so none is prescribed without one.
  assert(!noLadder.some((n) => /ladder drills|ickey shuffle|hopscotch/i.test(n)), 'a ladder drill prescribed to an athlete with no ladder');
  assert(noLadder.length === 12, `six plyo days of two drills each, got ${noLadder.length}`);
  const withLadder = weeksOfNames(['Barbell + plates', 'Agility ladder']);
  assert(withLadder.includes('Ladder Drills'), 'an athlete with a ladder never sees the ladder drill');
});

Deno.test('⛔ all three foot-speed drills need the agility ladder; the week\'s pick and the swap list ask one rule (2026-09-20)', async () => {
  const { plyoSwapGroups } = await import('./swap-groups.ts');
  // No ladder: the foot-speed family gives no drill at all, and the plyo day holds the other two (p275: one to three).
  for (let w = 1; w <= 12; w++) assertEquals(drillForWeek('footspeed', w, ['Barbell', 'Dumbbells']), null);
  const day = composeWeek({ ...BASE, week: 4, column: 'standard', equipment: ['Barbell', 'Dumbbells'] } as never)
    .sessions.filter((x) => x.tags.includes('plyo')).flatMap((x) => (x.strength_exercises ?? []).map((e) => e.name));
  assertEquals(day, ['Bounding', 'Single-Leg Hops']);
  // With the ladder it walks all three, in p89's order, and the day holds three.
  assertEquals([1, 2, 3, 4].map((w) => drillForWeek('footspeed', w, ['Agility ladder'])), ['Ladder Drills', 'Ickey Shuffle', 'Hopscotch', 'Ladder Drills']);
  // The swap list under the Ickey Shuffle offers the other two ladder drills only with the ladder.
  assertEquals(plyoSwapGroups('Ickey Shuffle', ['Barbell']), []);
  assertEquals(plyoSwapGroups('Ickey Shuffle', ['Agility ladder'])[0].options.map((o) => o.name), ['Ladder Drills', 'Hopscotch']);
  // The other two families need nothing.
  assertEquals(drillForWeek('bounding', 4, []), 'Bounding');
  assertEquals(drillForWeek('ground_contact', 4, null), 'Single-Leg Hops');
});

Deno.test('⛔ a stored foot-speed drill the composer no longer gives becomes the family\'s current drill on the refresh (2026-09-20)', async () => {
  const { restateFromTest } = await import('./restate.ts');
  const { composeBlock } = await import('./compose.ts');
  const NO_LADDER = ['Barbell', 'Squat rack', 'Bench', 'Dumbbells', 'Pull-up bar'];
  // ⚠️ THE KIT HERE HAS THE LADDER, so the family still gives a drill and the stored one is REPLACED by it. The kit
  // with no ladder is the next test: there the stored drill comes off the day.
  const composed = composeBlock({ ...BASE, weeks: 12, taperWeeks: [], equipment: [...NO_LADDER, 'Agility ladder'] } as never);
  // The calendar as a plan built before hopscotch needed the ladder has it: Hopscotch, the old note, no benefit line.
  const monday = new Date('2030-01-07T12:00:00Z');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planned: { id: string; week_number: number; date: string; tags: string[]; strength_exercises: unknown }[] = [];
  const wantByWeek = new Map<number, string>();
  for (const wk of composed) for (const sess of wk.sessions) {
    if (!sess.tags.includes('plyo')) continue;
    const d = new Date(monday); d.setUTCDate(d.getUTCDate() + (wk.week - 1) * 7 + DAYS.indexOf(sess.day));
    const current = (sess.strength_exercises ?? []).map((e) => e.name).find((n) => /ladder drills|ickey shuffle|hopscotch/i.test(n))!;
    const other = current === 'Hopscotch' ? 'Ickey Shuffle' : 'Hopscotch';
    wantByWeek.set(wk.week, current);
    const stored = (sess.strength_exercises ?? []).map((e) => e.name === current
      ? { name: other, sets: 1, reps: '', weight: 'Bodyweight', load_prescribed: false, how_to: 'Stand at the bottom of an agility ladder on your left foot.', notes: 'Benefit: general foot and leg control. Repeat each drill until the movement is at its best for the day and the athlete is confident in it, then move on. Fatigue, poor form and imprecise movement must all be avoided.' }
      : e);
    planned.push({ id: `${wk.week}`, week_number: wk.week, date: d.toISOString().slice(0, 10), tags: sess.tags, strength_exercises: stored });
  }
  assert(planned.length === 12, `expected 12 plyo days, got ${planned.length}`);
  const restated = restateFromTest({ composed, planned, afterWeek: 0 } as never);
  assertEquals(restated.rows.length, 12, 'not every plyo day was rewritten');
  for (const row of restated.rows) {
    const rows = row.strength_exercises as Record<string, unknown>[];
    const want = wantByWeek.get(row.week)!;
    const now = rows.find((e) => e.name === want);
    assert(now, `week ${row.week}: the stored drill was not replaced by ${want}`);
    assertEquals(now!.benefit_line, 'Benefit: general foot and leg control.');
    assert(/you feel confident in it/.test(String(now!.notes)));
    assertEquals(rows.length, 3, 'the day lost or gained a drill');
  }
});

Deno.test('⛔ with no ladder, a stored foot-speed drill comes off the plyo day on the refresh (2026-09-20)', async () => {
  const { restateFromTest } = await import('./restate.ts');
  const { composeBlock } = await import('./compose.ts');
  const NO_LADDER = ['Barbell', 'Squat rack', 'Bench', 'Dumbbells', 'Pull-up bar'];
  const composed = composeBlock({ ...BASE, weeks: 12, taperWeeks: [], equipment: NO_LADDER } as never);
  const monday = new Date('2030-01-07T12:00:00Z');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planned: { id: string; week_number: number; date: string; tags: string[]; strength_exercises: unknown }[] = [];
  for (const wk of composed) for (const sess of wk.sessions) {
    if (!sess.tags.includes('plyo')) continue;
    assertEquals((sess.strength_exercises ?? []).length, 2, 'a kit with no ladder composes two drills');
    const d = new Date(monday); d.setUTCDate(d.getUTCDate() + (wk.week - 1) * 7 + DAYS.indexOf(sess.day));
    // As a plan built earlier the same day stores it: the two drills, then the Ickey Shuffle.
    const stored = [...(sess.strength_exercises ?? []), { name: 'Ickey Shuffle', sets: 1, reps: '', weight: 'Bodyweight', load_prescribed: false, how_to: 'Stand at one side of an agility ladder, facing down it.', benefit_line: 'Benefit: general foot and leg control.', notes: 'x' }];
    planned.push({ id: `${wk.week}`, week_number: wk.week, date: d.toISOString().slice(0, 10), tags: sess.tags, strength_exercises: stored });
  }
  const restated = restateFromTest({ composed, planned, afterWeek: 0 } as never);
  assertEquals(restated.rows.length, 12, 'not every plyo day was rewritten');
  for (const row of restated.rows) {
    const names = (row.strength_exercises as { name: string }[]).map((e) => e.name);
    assertEquals(names.length, 2, `week ${row.week}: ${names.join(', ')}`);
    assert(!names.some((n) => /ladder drills|ickey shuffle|hopscotch/i.test(n)), `week ${row.week} still carries a ladder drill`);
  }
  // ⛔ AND NOTHING ELSE IS EVER DROPPED: a lifting day's stored row the composer no longer writes is still left alone.
  const lift = composed[1].sessions.find((x) => x.type === 'strength' && !x.tags.includes('plyo'))!;
  const d = new Date(monday); d.setUTCDate(d.getUTCDate() + 7 + DAYS.indexOf(lift.day));
  const extra = { name: 'Face Pull', sets: 3, reps: '12', weight: 'By feel', load_prescribed: false };
  const kept = restateFromTest({ composed, planned: [{ id: 'l', week_number: 2, date: d.toISOString().slice(0, 10), tags: lift.tags, strength_exercises: [...(lift.strength_exercises ?? []), extra] }], afterWeek: 0 } as never);
  const after = kept.rows.find((r) => r.id === 'l');
  assert(!after || (after.strength_exercises as { name: string }[]).some((e) => e.name === 'Face Pull'), 'a lifting row was dropped');
});

Deno.test('the line under the title counts the drills listed: one or two with no ladder, one to three with one (2026-09-20)', async () => {
  const { plyoTitleNote, P227_DRILL_LINE } = await import('./plyo.ts');
  assertEquals(plyoTitleNote(2), `Pick one or two of these drills. ${P227_DRILL_LINE}`);
  assertEquals(plyoTitleNote(3), `Pick one to three of these drills. ${P227_DRILL_LINE}`);
  // One drill listed: nothing to pick, the drill line alone.
  assertEquals(plyoTitleNote(1), P227_DRILL_LINE);
});

Deno.test('⛔ a kit that gains the agility ladder gains the foot-speed drill on the rebuild, in the composer\'s order (2026-09-20)', async () => {
  const { restateFromTest } = await import('./restate.ts');
  const { composeBlock } = await import('./compose.ts');
  const NO_LADDER = ['Barbell', 'Squat rack', 'Bench', 'Dumbbells', 'Pull-up bar'];
  // The calendar as the no-ladder block stored it: two drills a day.
  const before = composeBlock({ ...BASE, weeks: 12, taperWeeks: [], equipment: NO_LADDER } as never);
  const monday = new Date('2030-01-07T12:00:00Z');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planned: { id: string; week_number: number; date: string; tags: string[]; strength_exercises: unknown }[] = [];
  for (const wk of before) for (const sess of wk.sessions) {
    if (!sess.tags.includes('plyo')) continue;
    const d = new Date(monday); d.setUTCDate(d.getUTCDate() + (wk.week - 1) * 7 + DAYS.indexOf(sess.day));
    planned.push({ id: `${wk.week}`, week_number: wk.week, date: d.toISOString().slice(0, 10), tags: sess.tags, strength_exercises: sess.strength_exercises ?? [] });
  }
  // The athlete checks the ladder and rebuilds: the block re-composes with it.
  const after = composeBlock({ ...BASE, weeks: 12, taperWeeks: [], equipment: [...NO_LADDER, 'Agility ladder'] } as never);
  const restated = restateFromTest({ composed: after, planned, afterWeek: 0 } as never);
  assertEquals(restated.rows.length, 12, 'not every plyo day gained its drill');
  for (const row of restated.rows) {
    const names = (row.strength_exercises as { name: string }[]).map((e) => e.name);
    const want = after.find((w) => w.week === row.week)!.sessions.find((x) => x.tags.includes('plyo'))!.strength_exercises!.map((e) => e.name);
    assertEquals(names, want, `week ${row.week}`);
    assertEquals(names.length, 3);
  }
});

Deno.test('⛔ the athlete\'s own retest beside a lifting day is never rewritten as that day\'s session (2026-09-20)', async () => {
  const { restateFromTest } = await import('./restate.ts');
  const { composeBlock } = await import('./compose.ts');
  const composed = composeBlock({ ...BASE, weeks: 12, taperWeeks: [] } as never);
  const monday = new Date('2030-01-07T12:00:00Z');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const lift = composed[2].sessions.find((x) => x.type === 'strength' && !x.tags.includes('plyo'))!;
  const d = new Date(monday); d.setUTCDate(d.getUTCDate() + 14 + DAYS.indexOf(lift.day));
  const date = d.toISOString().slice(0, 10);
  const firstLift = String(lift.strength_exercises![0].name);
  // The retest's row for the same movement: p215's three steps, nothing like the day's sets.
  const retestRows = [{ name: firstLift, sets: 3, reps: '6, 5, max', weight: 135, load_prescribed: false, slot_intent: 'ME' }];
  const planned = [
    { id: 'lift', week_number: 3, date, tags: lift.tags, strength_exercises: lift.strength_exercises ?? [] },
    { id: 'retest', week_number: 3, date, tags: ['standing_plan', '1rm_test', 'retest'], strength_exercises: retestRows },
  ];
  const restated = restateFromTest({ composed, planned, afterWeek: 0 } as never);
  assert(!restated.rows.some((r) => r.id === 'retest'), 'the retest row was rewritten');
});
