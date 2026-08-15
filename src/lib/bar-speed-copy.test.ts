import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barSpeedLineFor, BAR_SPEED_COPY, BAR_SPEED_AMRAP_AFTER, topSetIndex } from './strength-focus-copy.ts';
import {
  deloadSingleSets,
  setsForWeek,
  tmTestSets,
  WEEKS_PER_CYCLE,
  VALIDITY_CHECK_PCT,
} from '../../supabase/functions/shared/strength-system/loading/wendler-531.ts';

/**
 * ⛔ THE LOAD-BEARING PIN: a prescribed set NEVER gets the AMRAP line.
 * AMRAPs exist only in the anchor cycle (`wendler-531.ts:61`), so on weeks 1-8 the top set is a
 * prescribed five. Telling that athlete "slow rep = last rep" is telling them to chase reps the
 * plan did not ask for — the D-324 class of bug, where a screen described an engine that had
 * changed underneath it.
 */
Deno.test('bar speed — a prescribed work set gets the QUALITY line, never the stop rule', () => {
  assertEquals(barSpeedLineFor({}), BAR_SPEED_COPY.work_set);
  assertEquals(barSpeedLineFor({ isAmrap: false }), BAR_SPEED_COPY.work_set);
  // the exact failure this pins
  assertEquals(barSpeedLineFor({}) === BAR_SPEED_COPY.amrap, false);
});

Deno.test('bar speed — the AMRAP set gets the stop rule', () => {
  assertEquals(barSpeedLineFor({ isAmrap: true }), BAR_SPEED_COPY.amrap);
});

Deno.test('bar speed — the 95% validity set announces itself BEFORE the unrack', () => {
  assertEquals(barSpeedLineFor({ isValiditySet: true }), BAR_SPEED_COPY.validity_set);
});

Deno.test('bar speed — deload outranks warm-up, work set and AMRAP', () => {
  assertEquals(barSpeedLineFor({ isDeload: true }), BAR_SPEED_COPY.deload);
  assertEquals(barSpeedLineFor({ isDeload: true, isAmrap: true }), BAR_SPEED_COPY.deload);
  assertEquals(barSpeedLineFor({ isDeload: true, isWarmup: true }), BAR_SPEED_COPY.deload);
});

/**
 * ⛔ THE GATE IS NEVER SUPPRESSED. If the two ever collide, the athlete must still be told this is
 * the set that decides the working number. Suppressing it is the expensive failure; a gate line on
 * a deload is cosmetic.
 */
Deno.test('bar speed — the 95% gate outranks the deload, so it can never be silently swallowed', () => {
  assertEquals(barSpeedLineFor({ isDeload: true, isValiditySet: true }), BAR_SPEED_COPY.validity_set);
});

/**
 * And the structural fact the precedence is defending against.
 *
 * ⛔ REWRITTEN 2026-08-15 (§1c), AND THE ANSWER FLIPPED. This asserted that a deload set can never
 * reach 95%, derived from `setsForWeek('leader', WEEKS_PER_CYCLE)` — which was week 4, the old
 * 40/50/60 deload. A cycle is three weeks now, so that expression IS the 95% week, and the light
 * weeks are standalone shapes that go all the way to the training max.
 *
 * **So the collision is no longer structurally impossible, and the precedence is now load-bearing
 * rather than defensive.** What keeps the deload honest is a different fact: its top set carries no
 * `amrap` flag, so nothing in it is a validity set to begin with.
 */
Deno.test('bar speed — a light week reaches the training max, and none of it is an open set', () => {
  const deload = deloadSingleSets();
  assertEquals(deload.some((s) => s.pct >= VALIDITY_CHECK_PCT), true, 'the TM single is at 100%');
  assertEquals(deload.some((s) => s.amrap), false, 'and none of it is measured');
  // Week 3 of a cycle still carries the 95% set, so the gate has its real home.
  const wk3 = setsForWeek('leader', WEEKS_PER_CYCLE);
  assertEquals(wk3[wk3.length - 1].pct, VALIDITY_CHECK_PCT);
  // ⛔ AND THE TEST WEEK IS A SECOND REAL HOME FOR IT (§1d): an open set AT the training max.
  const test = tmTestSets();
  assertEquals(test.at(-1)!.amrap, true);
  assertEquals(test.at(-1)!.pct >= VALIDITY_CHECK_PCT, true);
});

Deno.test('bar speed — warm-up outranks the work-set default but not the deload', () => {
  assertEquals(barSpeedLineFor({ isWarmup: true }), BAR_SPEED_COPY.warmup);
});

/** No line may tell a prescribed-set athlete to go until something breaks down. */
Deno.test('bar speed — no rep-chasing vocabulary on the non-AMRAP lines', () => {
  const banned = ['until', 'as many', 'failure', 'fails'];
  for (const key of ['warmup', 'work_set', 'deload', 'validity_set'] as const) {
    for (const word of banned) {
      assertEquals(
        BAR_SPEED_COPY[key].toLowerCase().includes(word),
        false,
        `${key} must not contain "${word}": ${BAR_SPEED_COPY[key]}`,
      );
    }
  }
});

// ─── D-326 — the top-set rule ──────────────────────────────────────────────────────────────────

Deno.test('topSetIndex — the HEAVIEST set, not the last (warm-ups must not steal the tap)', () => {
  // 5/3/1 leader week: three ascending sets. The third is the top.
  assertEquals(topSetIndex([{ weight: 120 }, { weight: 140 }, { weight: 160 }]), 2);
  // A back-off set after the top set must NOT take it.
  assertEquals(topSetIndex([{ weight: 120 }, { weight: 190 }, { weight: 135 }]), 1);
  // Warm-ups sitting in the same array.
  assertEquals(topSetIndex([{ weight: 45 }, { weight: 95 }, { weight: 135 }, { weight: 185 }]), 3);
});

Deno.test('topSetIndex — ties resolve to the LAST, where 5/3/1 puts the top set', () => {
  assertEquals(topSetIndex([{ weight: 160 }, { weight: 160 }, { weight: 160 }]), 2);
});

Deno.test('topSetIndex — nothing loaded suppresses the tap rather than guessing', () => {
  assertEquals(topSetIndex([]), -1);
  assertEquals(topSetIndex([{ weight: 0 }, { weight: 0 }]), -1);
  assertEquals(topSetIndex([{}, { weight: null }]), -1);
});

// ── THE AMRAP DOCTRINE, REVERSED 2026-08-01 ─────────────────────────────────────────────────────
//
// The original rule was "slow rep = last rep" — end the "+" set at the first slow rep, on the
// reasoning that speed is the earliest sign of form breaking down. Stricter than the source it
// cited: Wendler says to GRIND IT OUT, not to failure (5/3/1 2nd ed. p.24). A grinding rep is a
// rep, and the count off that set is what moves the training max — so a speed-stop systematically
// under-reports the number the block runs on.
//
// ⛔ THESE PIN THE REVERSAL SO IT CANNOT DRIFT BACK. The stop rule itself never moved: not to
// failure. What moved is WHERE it sits — at the edge of failure, not at the first sign of effort.
Deno.test('AMRAP — gives the grinding reps permission, and does NOT stop at the first slow one', () => {
  const s = BAR_SPEED_COPY.amrap.toLowerCase();
  assert(s.includes('grind'), `AMRAP line must invite the grind: ${BAR_SPEED_COPY.amrap}`);
  assert(!s.includes('slow'), `AMRAP line must not reinstate the speed-stop: ${BAR_SPEED_COPY.amrap}`);
});

Deno.test('AMRAP — still names failure as the ceiling (the stop rule never moved)', () => {
  assert(/before failure|not to failure|short of failure/.test(BAR_SPEED_COPY.amrap.toLowerCase()),
    `AMRAP line must keep an explicit not-to-failure ceiling: ${BAR_SPEED_COPY.amrap}`);
});

Deno.test('AMRAP — the closing line agrees with the opener instead of contradicting it', () => {
  // The old closer ("Stop when it slows, not when it fails.") carried the retired speed-stop and
  // would have argued with the new opener on the same set.
  const after = BAR_SPEED_AMRAP_AFTER.toLowerCase();
  assert(after.includes('failure'), `closing line must name the ceiling: ${BAR_SPEED_AMRAP_AFTER}`);
  assert(!after.includes('slow'), `closing line must not reinstate the speed-stop: ${BAR_SPEED_AMRAP_AFTER}`);
});

// ⛔ THE BANNED-WORD LINT DELIBERATELY DOES NOT COVER `amrap`, and now it matters more than before.
// On a PRESCRIBED set "failure" would mean rep-chasing; on the AMRAP it is the ceiling. Same word,
// opposite job — which is exactly why the lint above lists its four keys explicitly rather than
// iterating the whole table.
Deno.test('AMRAP is exempt from the rep-chasing lint, and the prescribed lines still are not', () => {
  assert(BAR_SPEED_COPY.amrap.toLowerCase().includes('failure'));
  for (const key of ['warmup', 'work_set', 'deload', 'validity_set'] as const) {
    assert(!BAR_SPEED_COPY[key].toLowerCase().includes('failure'),
      `${key} must not mention failure: ${BAR_SPEED_COPY[key]}`);
  }
});
