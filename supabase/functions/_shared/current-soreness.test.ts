/**
 * resolveCurrentSoreness — the STATE soreness read (D-354).
 * Bug-case first: a thin baseline must render NOTHING, never "normal".
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolveCurrentSoreness } from './cross-domain-carryover.ts';

const day = (n: number) => new Date(Date.UTC(2026, 6, n, 12)).toISOString();
const e = (n: number, soreness: number) => ({ workoutId: `w${n}`, startTime: day(n), soreness });

Deno.test('no entries -> nothing, not a verdict', () => {
  const r = resolveCurrentSoreness([], { asOf: day(30) });
  assertEquals(r.level, null);
  assertEquals(r.logged, 0);
});

Deno.test('THIN BASELINE renders nothing — "normal" off 2 points is a claim', () => {
  const r = resolveCurrentSoreness([e(1, 3), e(2, 3), e(28, 3)], { asOf: day(30) });
  assertEquals(r.baselineOk, false);
  assertEquals(r.level, null);
});

Deno.test('steady soreness reads normal once the baseline is real', () => {
  const hist = [1, 2, 3, 4, 5, 6].map((n) => e(n, 3));
  const r = resolveCurrentSoreness([...hist, e(28, 3), e(29, 3)], { asOf: day(30) });
  assertEquals(r.baselineOk, true);
  assertEquals(r.level, 'normal');
});

Deno.test('a real step above the athlete own norm reads elevated', () => {
  const hist = [1, 2, 3, 4, 5, 6].map((n) => e(n, 2));
  const r = resolveCurrentSoreness([...hist, e(28, 6), e(29, 6)], { asOf: day(30) });
  assertEquals(r.level, 'elevated');
});

Deno.test('the recent window is EXCLUDED from its own baseline', () => {
  const hist = [1, 2, 3, 4, 5, 6].map((n) => e(n, 2));
  const r = resolveCurrentSoreness([...hist, e(28, 6), e(29, 6)], { asOf: day(30) });
  assertEquals(r.mean, 2); // 2, not dragged up by the sore week
});

Deno.test('an un-migrated 1-10 value cannot corrupt the baseline', () => {
  const hist = [1, 2, 3, 4, 5, 6].map((n) => e(n, 2));
  const r = resolveCurrentSoreness([...hist, e(7, 9), e(28, 2), e(29, 2)], { asOf: day(30) });
  assertEquals(r.mean, 2); // the 9 is dropped, not blended
  assertEquals(r.level, 'normal');
});
