// position-in-range — the fitness dot's band scalar. Run: deno test position-in-range.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { positionInRange } from './position-in-range.ts';

const s = (...vals: number[]) => vals.map((value, i) => ({ date: `2026-01-${i + 1}`, value }));

// higher-is-better (efficiency): current at the top of the range → best (1); bottom → worst (0).
Deno.test('higher-is-better: current at the max sits at the best edge', () => {
  const r = positionInRange(s(1.5, 1.6, 1.7, 1.8), { higherIsBetter: true });
  assertEquals(r!.positionPct, 1);
  assertEquals(r!.confident, true);
});
Deno.test('higher-is-better: current at the min sits at the worst edge', () => {
  const r = positionInRange(s(1.8, 1.7, 1.6, 1.5), { higherIsBetter: true });
  assertEquals(r!.positionPct, 0);
});

// lower-is-better (decoupling): orientation flips so LOW value = best. This is the whole point —
// "aerobic base needs work" (a high, bad decoupling) and "improving" (falling) stop fighting: the dot
// shows WHERE (near the worst edge), the arrow shows WHICH WAY (toward best).
Deno.test('lower-is-better: current at the min (best) sits at the best edge', () => {
  const r = positionInRange(s(8, 6, 5, 3), { higherIsBetter: false });
  assertEquals(r!.positionPct, 1); // 3 is the lowest decoupling → best
});
Deno.test('lower-is-better: current at the max (worst) sits at the worst edge', () => {
  const r = positionInRange(s(3, 5, 6, 8), { higherIsBetter: false });
  assertEquals(r!.positionPct, 0); // 8 is the highest decoupling → worst
});

// Confidence floor: thin data → not confident → grey/unlabeled dot.
Deno.test('below the sample floor → not confident', () => {
  assertEquals(positionInRange(s(1.5, 1.7), { higherIsBetter: true })!.confident, false);
});
Deno.test('a flat range (no spread) → mid, not confident (no range to place in)', () => {
  const r = positionInRange(s(1.6, 1.6, 1.6, 1.6), { higherIsBetter: true });
  assertEquals(r!.positionPct, 0.5);
  assertEquals(r!.confident, false);
});

Deno.test('empty series → null', () => {
  assertEquals(positionInRange([], { higherIsBetter: true }), null);
});
