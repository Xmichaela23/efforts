import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBikeInsight } from './bike-insights.ts';

Deno.test('endurance WITH power — efficiency + load, no fabricated anything', () => {
  const s = composeBikeInsight({
    type: 'endurance', hasPower: true, durationMin: 90,
    power: { np: 205, avg: 198, if: 0.68, tss: 62, vi: 1.02, ftp: 300 },
    efficiency: { factor: 1.8 }, decoupling: { pct: 3.9 },
  })!;
  console.log('\n  ENDURANCE (power):\n   ', s, '\n');
  assert(s.includes('205 W'));
  // 2026-09-03: the clause states the measurement and stops. "The aerobic engine carried it, the watts
  // didn't cost you HR" was the paragraph restating — louder — a figure printed two lines below it.
  assert(/Heart rate held with the power/.test(s));
  // 0.68 IS the endurance band, so the label is earned here.
  assert(/62 TSS at 0\.68 intensity — an aerobic-base load\./.test(s));
});

Deno.test('an aerobic-family ride at threshold intensity is NOT called base work', () => {
  // ⛔ THE REGRESSION THIS PINS (2026-09-03, Michael's ride): the label printed under EVERY
  // aerobic-family ride whatever the intensity, so 0.98 — threshold on Coggan's scale, where the
  // endurance band tops out at 0.75 — was announced as "an aerobic-base load".
  const s = composeBikeInsight({
    type: 'endurance', hasPower: true, durationMin: 68,
    power: { np: 164, avg: 146, if: 0.98, tss: 109, vi: 1.04, ftp: 168 },
    decoupling: { pct: 7.4 },
  })!;
  assert(!/aerobic-base load/.test(s));
  assert(/109 TSS at 0\.98 intensity — harder than base work\./.test(s));
  // And the heart-rate clause follows the number, not the other way round.
  assert(/Heart rate climbed relative to the power/.test(s));
  assert(!/didn't cost you HR/.test(s));
});

Deno.test('endurance HR-ONLY — honest lighter read, never a made-up watt', () => {
  const s = composeBikeInsight({ type: 'endurance', hasPower: false, decoupling: { pct: 4.2 } })!;
  console.log('  ENDURANCE (HR only):\n   ', s, '\n');
  assert(!/\bW\b|watt|normalized|TSS|intensity/i.test(s)); // NO power words when there's no power
  assert(/heart rate held/i.test(s));
});

Deno.test('threshold intervals WITH power — held target', () => {
  const s = composeBikeInsight({
    type: 'threshold', hasPower: true,
    power: { np: 285, if: 0.95, tss: 78 },
    intervals: { hit: 4, total: 4, heldTarget: true },
  })!;
  console.log('  THRESHOLD (power):\n   ', s, '\n');
  assert(s.includes('all 4 work intervals'));
  assert(/held your target range/.test(s));
});

Deno.test('VO2 intervals HR-only — reps read, no fabricated power', () => {
  const s = composeBikeInsight({ type: 'vo2', hasPower: false, intervals: { hit: 5, total: 6, consistent: false }, decoupling: { pct: 8 } })!;
  console.log('  VO2 (HR only):\n   ', s, '\n');
  assert(s.includes('5 of 6'));
  assert(!/\bW\b|watt|normalized|TSS/i.test(s));
});

Deno.test('group ride — mixed by design, never graded', () => {
  const s = composeBikeInsight({ type: 'group', hasPower: true, distanceMi: 42, durationMin: 130, power: { np: 220, tss: 140 } })!;
  console.log('  GROUP:\n   ', s, '\n');
  assert(/by design/i.test(s));
});

Deno.test('nothing to say → silence', () => {
  assertEquals(composeBikeInsight({ type: 'other', hasPower: false }), null);
});
