import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barSpeedLineFor, BAR_SPEED_COPY, topSetIndex } from './strength-focus-copy.ts';
import {
  setsForWeek,
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
 * And the structural fact the precedence is defending against: TODAY they cannot meet. Derived from
 * `setsForWeek` rather than asserted in prose, so a change to the cycle shape speaks here instead of
 * failing silently on a phone.
 */
Deno.test('bar speed — no deload set is a 95% set (the collision is structurally impossible today)', () => {
  const deload = setsForWeek('leader', WEEKS_PER_CYCLE);
  assertEquals(deload.some((s) => s.pct >= VALIDITY_CHECK_PCT), false);
  // ...and week 3 genuinely carries it, so the gate has a real home.
  const wk3 = setsForWeek('leader', 3);
  assertEquals(wk3[wk3.length - 1].pct, VALIDITY_CHECK_PCT);
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
