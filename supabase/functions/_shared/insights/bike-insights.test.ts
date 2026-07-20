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
  assert(/aerobic engine carried it/.test(s));
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
