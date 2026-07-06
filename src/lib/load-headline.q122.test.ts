// Q-122: plan-phase-aware load word — a high-but-on-plan build week reads "building on plan",
// not "back off". Only the 'back off' band (1.3<ACWR≤1.5) is eligible; the ≥1.5 redline and the
// early-week denominator floor (planned<150) are hard gates; overshoot beyond 120% → "back off".
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planAwareVolumeLabel, acwrVolumeLabel } from './load-headline.ts';

const P = (o: Partial<Parameters<typeof planAwareVolumeLabel>[0]>) =>
  planAwareVolumeLabel({ acwr: 1.4, weekIntent: 'build', wtdActualLoad: 220, wtdPlannedLoad: 200, ...o });

Deno.test('back off band + build + on-plan (≤120%) → building on plan', () => {
  assertEquals(P({}), 'building on plan');                         // 220/200 = +10%
  assertEquals(P({ wtdActualLoad: 240 }), 'building on plan');     // +20% exactly (boundary)
  assertEquals(P({ acwr: 1.31 }), 'building on plan');             // just into the band
  assertEquals(P({ acwr: 1.5 }), 'building on plan');              // top of the band
});

Deno.test('genuinely over the plan (>120%) → back off stands', () => {
  assertEquals(P({ wtdActualLoad: 260 }), 'back off');             // +30%
});

Deno.test('early-week denominator floor: planned < 150 → raw ACWR (no plan read)', () => {
  assertEquals(P({ wtdPlannedLoad: 100 }), 'back off');
  assertEquals(P({ wtdPlannedLoad: null }), 'back off');
  assertEquals(P({ wtdActualLoad: null }), 'back off');
});

Deno.test('not a build week → never softened', () => {
  assertEquals(P({ weekIntent: 'recovery' }), 'back off');
  assertEquals(P({ weekIntent: 'baseline' }), 'back off');
  assertEquals(P({ weekIntent: null }), 'back off');
});

Deno.test('≥1.5 redline is NEVER overridden by the plan', () => {
  assertEquals(P({ acwr: 1.6 }), 'rest now');
  assertEquals(P({ acwr: 2.0 }), 'rest now');
});

Deno.test('lower bands unaffected (only "back off" is eligible)', () => {
  assertEquals(P({ acwr: 1.1 }), 'balanced');
  assertEquals(P({ acwr: 0.7 }), 'build more');
  // and the raw label is untouched — the marker keeps reading it
  assertEquals(acwrVolumeLabel(1.4), 'back off');
});
