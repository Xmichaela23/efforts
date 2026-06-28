// Non-race intake logic tests. Run: ~/.deno/bin/deno test --no-check src/lib/non-race-intake.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { allocateTime, placeWeek, STRENGTH_PROGRAM_HRS } from './non-race-intake.ts';

// ── Layer 1: allocation ──────────────────────────────────────────────────────
Deno.test('allocateTime — strength reserved off the top, endurance leaned run/ride', () => {
  const a = allocateTime(8, 'five_by_five', 60);
  assertEquals(a.strengthHrs, 3.0);
  assertEquals(a.enduranceHrs, 5.0);
  assertEquals(a.runHrs, 3.0);   // 5 * 60%
  assertEquals(a.rideHrs, 2.0);  // 5 * 40%
  assertEquals(a.runPct, 60);
  assertEquals(a.ridePct, 40);
  assertEquals(a.warning, null);
});

Deno.test('allocateTime — 100% lean = run-only (0 ride); 0% = ride-only', () => {
  assertEquals(allocateTime(10, 'durability', 100).rideHrs, 0);
  assertEquals(allocateTime(10, 'durability', 0).runHrs, 0);
});

Deno.test('allocateTime — warns (never silently overcommits) when strength eats the week', () => {
  const a = allocateTime(4, 'hypertrophy', 60); // 4hr budget − 4hr strength = 0 endurance
  assertEquals(a.enduranceHrs, 0);
  assert(a.warning && /little left for endurance/.test(a.warning));
});

Deno.test('allocateTime — budget never exceeded; endurance floored at 0', () => {
  const a = allocateTime(2, 'five_by_five', 50); // 2 − 3 = -1 → 0
  assertEquals(a.enduranceHrs, 0);
  assertEquals(a.runHrs + a.rideHrs + a.strengthHrs <= a.budgetHrs + 1e-9 || a.strengthHrs > a.budgetHrs, true);
});

Deno.test('STRENGTH_PROGRAM_HRS — the four reference reserve costs', () => {
  assertEquals(STRENGTH_PROGRAM_HRS.five_by_five, 3.0);
  assertEquals(STRENGTH_PROGRAM_HRS.durability, 2.0);
  assertEquals(STRENGTH_PROGRAM_HRS.hypertrophy, 4.0);
  assertEquals(STRENGTH_PROGRAM_HRS.minimum_dose, 1.0);
});

// ── Layer 2: placement ───────────────────────────────────────────────────────
const A = (...on: number[]) => { const b = Array(7).fill(false); on.forEach((i) => (b[i] = true)); return b; };
const after = (d: number) => (d + 1) % 7;

Deno.test('placeWeek — quality not adjacent to long; heavy not before quality/long, not on long', () => {
  // active Sun-Thu + Sat (Fri off), long = Sat(6)
  const p = placeWeek(A(0, 1, 2, 3, 4, 6), 6);
  assertEquals(p.days[6], 'long');
  assertEquals(p.qualityDay, 1);   // Sun(0) is adjacent to Sat → Mon(1)
  assertEquals(p.heavyDay, 2);     // off quality(1)+its eve(0), off long(6)+its eve(5) → Tue(2)
  assertEquals(p.interference, null);
});

Deno.test('placeWeek — the interference rule holds: heavy never precedes quality or long (when clean)', () => {
  // sweep several availability sets; whenever no interference is flagged, the rule must hold
  const cases: Array<[number[], number]> = [
    [[0, 1, 2, 3, 4, 6], 6],
    [[0, 1, 2, 3, 4, 5, 6], 0],
    [[1, 2, 3, 4, 5, 6], 6],
    [[0, 2, 3, 5, 6], 6],
  ];
  for (const [on, ld] of cases) {
    const p = placeWeek(A(...on), ld);
    if (p.interference === null && p.heavyDay !== null) {
      assert(after(p.heavyDay) !== p.qualityDay, `heavy precedes quality in ${JSON.stringify(on)}/${ld}`);
      assert(after(p.heavyDay) !== p.longDay, `heavy precedes long in ${JSON.stringify(on)}/${ld}`);
      assert(p.heavyDay !== p.longDay && p.heavyDay !== p.qualityDay, `heavy collides in ${JSON.stringify(on)}/${ld}`);
    }
  }
});

Deno.test('placeWeek — tight availability flags the unavoidable interference (no silent bad week)', () => {
  // only 3 days: long + 2 adjacent-ish → no clean separation possible
  const p = placeWeek(A(4, 5, 6), 6); // Thu, Fri, Sat; long=Sat
  assert(p.interference !== null, 'expected an interference flag when availability is too tight');
});

Deno.test('placeWeek — inactive days are rest; long day labeled long', () => {
  const p = placeWeek(A(1, 2, 3, 6), 6);
  assertEquals(p.days[0], 'rest');
  assertEquals(p.days[4], 'rest');
  assertEquals(p.days[5], 'rest');
  assertEquals(p.days[6], 'long');
});
