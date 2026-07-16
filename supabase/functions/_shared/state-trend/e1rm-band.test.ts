// e1RM band vs baseline — the honest strength frame. Run: deno test --no-check e1rm-band.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeE1rmBand, buildStrengthBaselines } from './strength.ts';

const lift = (canonical: string, ...vals: number[]) => ({
  canonical, displayName: canonical, points: vals.map((value, i) => ({ date: `2026-01-${i + 1}`, value })),
});

// THE FIX: working at ~82% of baseline must land the dot near 0.82 — NOT pegged right like the 12wk range.
Deno.test('vs baseline: current e1RM ÷ baseline places the dot at the real ratio, not maxed', () => {
  const series = [lift('squat', 80, 85, 90), lift('bench_press', 115, 120, 125)];
  const band = computeE1rmBand(series, { squat: 110, bench_press: 150 });
  // avg(90/110, 125/150) = avg(0.818, 0.833) ≈ 0.826
  assertEquals(Math.round(band!.positionPct * 100), 83);
  assertEquals(band!.confident, true); // 2 primaries with a baseline
});

// The peg the 12wk range produces in a build — proving why baseline anchoring matters.
Deno.test('12wk range pegs a monotonic build to the far right (the bug baseline anchoring fixes)', () => {
  const series = [lift('squat', 80, 85, 90), lift('bench_press', 115, 120, 125)]; // rising every session
  const band = computeE1rmBand(series, null); // no baseline → fallback
  assertEquals(band!.positionPct, 1);         // pegged right — "at your max"
  assertEquals(band!.confident, false);       // but HEDGED grey, never asserted
});

Deno.test('buildStrengthBaselines maps typed + learned onto the primary-lift keys', () => {
  const m = buildStrengthBaselines({ squat: 110, bench1RM: 150 }, { deadlift: 200 });
  assertEquals(m!.squat, 110);
  assertEquals(m!.bench_press, 150);
  assertEquals(m!.deadlift, 200);
  assertEquals(m!.trap_bar_deadlift, 200); // shares the deadlift baseline
});

Deno.test('no primaries → null', () => {
  assertEquals(computeE1rmBand([lift('bicep_curl', 30, 35)], { squat: 110 }), null);
});
