import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeRunInsight, type RunInsightInput } from './run-insights.ts';

// The real 80-min out-and-back (2026-07-19): even effort, HR held (decoupling 4.4%), rolling +249ft,
// warm 78°F mild heat, RPE 3, base-phase maintenance.
const REAL_STEADY: RunInsightInput = {
  type: 'steady', intent: 'maintenance', distanceMi: 5.7, durationMin: 80,
  pacing: { pattern: 'even_effort', hrHeld: true, outAndBack: true },
  decoupling: { pct: 4.4, assessment: 'good' },
  terrain: { gainFt: 249, rolling: true },
  conditions: { tempF: 78, heatStress: 'mild' },
  execution: { rpe: 3, hitIntent: true },
};

Deno.test('steady out-and-back reads as insight (terrain, not fatigue) — no banned words, no LLM', () => {
  const s = composeRunInsight(REAL_STEADY)!;
  console.log('\n  STEADY (real run):\n   ', s, '\n');
  assert(s.includes('terrain, not fatigue')); // the non-obvious read
  assert(!/held steady|the pace held/i.test(s)); // never claims the PACE was steady
  assert(!/!/.test(s));
});

Deno.test('a REAL fade is named honestly (HR climbed while pace fell)', () => {
  const s = composeRunInsight({ type: 'steady', pacing: { pattern: 'positive_split', hrHeld: false }, decoupling: { pct: 9.5, assessment: 'high' } })!;
  console.log('  FADE:\n   ', s, '\n');
  assert(/drifted up|climbed|positive split/i.test(s));
});

Deno.test('intervals: reps landed + consistency', () => {
  const s = composeRunInsight({ type: 'interval', intervals: { hit: 6, total: 6, consistent: true } })!;
  console.log('  INTERVAL:\n   ', s, '\n');
  assert(s.includes('all 6 work intervals'));
});

Deno.test('long run, HR held on a flat course — quieter read', () => {
  const s = composeRunInsight({ type: 'long', intent: 'maintenance', pacing: { pattern: 'even_effort', hrHeld: true }, decoupling: { pct: 3.1, assessment: 'excellent' }, terrain: { gainFt: 40 } })!;
  console.log('  LONG (flat):\n   ', s, '\n');
  assert(s.length > 0);
});

Deno.test('hills: reps landed on the climbs', () => {
  const s = composeRunInsight({ type: 'hills', intervals: { hit: 8, total: 8, consistent: false }, terrain: { gainFt: 620 } })!;
  console.log('  HILLS:\n   ', s, '\n');
  assert(s.includes('8 hill reps'));
  assert(/climbs came in slower/i.test(s));
});

Deno.test('fartlek: mixed by design, NEVER graded as a fade', () => {
  // a fartlek has huge pace variance + HR swings. If the composer applied steady logic it would libel it.
  const s = composeRunInsight({ type: 'fartlek', distanceMi: 6.2, durationMin: 50, pacing: { pattern: 'positive_split', hrHeld: false }, decoupling: { pct: 11, assessment: 'high' } })!;
  console.log('  FARTLEK:\n   ', s, '\n');
  assert(/by design/i.test(s));
  assert(!/fade|positive split|drifted up|not fatigue/i.test(s)); // must NOT grade it
});

Deno.test('nothing worth saying → silence (null), not padding', () => {
  const s = composeRunInsight({ type: 'other', pacing: null, decoupling: null });
  assertEquals(s, null);
});
