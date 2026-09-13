import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildRunHrCurve, thresholdHrFromHrCurves } from './run-critical-speed.ts';

// One sample per second.
const secs = (n: number) => Array.from({ length: n }, (_, i) => i);

Deno.test('highest 20-minute average, not the fastest stretch: a hard block in the middle of an easy run', () => {
  // 20 min at 130, 25 min at 170, 20 min at 130
  const hr = [...Array(1200).fill(130), ...Array(1500).fill(170), ...Array(1200).fill(130)];
  const c = buildRunHrCurve(secs(hr.length), hr)!;
  assertEquals(c['1200'].avgHr, 170);
  assertEquals(c['3600'].avgHr, 147); // (25 min × 170 + 35 min × 130) / 60
});

Deno.test('a few seconds of spike barely moves a 20-minute average', () => {
  const hr = Array(1500).fill(160);
  for (let i = 700; i < 710; i++) hr[i] = 197;
  const c = buildRunHrCurve(secs(hr.length), hr)!;
  assertEquals(c['1200'].avgHr, 160);
});

Deno.test('a run shorter than 20 minutes has no windows; a strap that drops out for most of a window is skipped', () => {
  assertEquals(buildRunHrCurve(secs(1000), Array(1000).fill(150)), null);
  const gappy = Array(1300).fill(null).map((_, i) => (i % 3 === 0 ? 150 : null));
  assertEquals(buildRunHrCurve(secs(1300), gappy), null);
});

Deno.test('uneven sampling is time-weighted', () => {
  // 1200 s at 1 Hz on 140, then one 1200 s gap-sample at 180: the 180 sample covers only the final second (no next sample)
  const t = [...secs(1300)];
  const hr = [...Array(1300).fill(140)];
  const c = buildRunHrCurve(t, hr)!;
  assertEquals(c['1200'].avgHr, 140);
});

Deno.test("threshold: TrainingPeaks' rule — higher of best 60-minute average and 95% of best 20-minute average", () => {
  const out = thresholdHrFromHrCurves([
    { date: '2026-04-02', hrCurve: { '1200': { avgHr: 152, timeS: 1200 } } },            // 144
    { date: '2026-09-02', hrCurve: { '1200': { avgHr: 181, timeS: 1200 }, '3600': { avgHr: 168, timeS: 3600 } } }, // 172 vs 168
  ])!;
  assertEquals(out, { value: 172, date: '2026-09-02', basis: '20', windowAvgHr: 181 });
  const sixty = thresholdHrFromHrCurves([{ date: '2026-05-01', hrCurve: { '1200': { avgHr: 170, timeS: 1200 }, '3600': { avgHr: 165, timeS: 3600 } } }])!;
  assertEquals(sixty.basis, '60');
  assertEquals(thresholdHrFromHrCurves([{ date: 'x', hrCurve: null }]), null);
});
