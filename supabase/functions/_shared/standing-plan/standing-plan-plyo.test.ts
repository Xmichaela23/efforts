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
        assertEquals(r.reps, PLYO_DOSE.effortsPerDrill.hi); // a range now (2026-09-02); the row carries the top as capacity
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
    assert(drillForWeek(family, 2) !== drillForWeek(family, 3), `${family} did not move week to week`);
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
    const wk = composeWeek({ ...BASE, week: 2, column } as never);
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
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard' } as never);
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
    assert(line.label !== 'Plyometrics', 'the plyo session reached the dosing ledger');
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
  assert(!noLadder.includes('Ladder Drills'), 'ladder drills prescribed to an athlete with no ladder');
  assert(noLadder.some((n) => n === 'Hopscotch' || n === 'Ickey Shuffle'), 'the footspeed family still fills from the same bucket');
  const withLadder = weeksOfNames(['Barbell + plates', 'Agility ladder']);
  assert(withLadder.includes('Ladder Drills'), 'an athlete with a ladder never sees the ladder drill');
});

