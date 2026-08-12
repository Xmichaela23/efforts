/**
 * STRENGTH row as a dual read — VOLUME direction (activity/load fact) leads, e1RM is the secondary
 * fitness read. Volume: higher = more training (lowerIsBetter false). The e1RM-clause-drop (assert
 * "holding" only when there IS an e1RM trend) is enforced in assemble.ts and rendered accordingly.
 *
 *   deno test supabase/functions/_shared/state-trend/strength-fitness.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strengthVolumeToSeries, computeStrengthVolumeState, computeStrengthState, type LiftSeries } from './strength.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

// e1RM NOISE GUARD (2026-07-19) — a directional e1RM verdict must clear the lift's own within-window
// scatter, or it reads holding. Regression for the live bug: a squat read "sliding" −2.5% on ~4% of
// session-to-session scatter (noise wearing a verdict). Same gate run decoupling already uses.
const squat = (values: number[]): LiftSeries[] => {
  // weekly points anchored to the RECENT end (newest inside freshnessDays), all in the 42d window.
  const dates = ['2026-05-26', '2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30'];
  const use = dates.slice(-values.length);
  return [{ canonical: 'squat', displayName: 'Back Squat', points: values.map((v, i) => ({ date: use[i], value: v })) }];
};

// ⛔ REWRITTEN FOR [D-420] (2026-08-12). These three pinned the e1RM NOISE GUARD through the strength
// direction verdict — "a −2.5% slide on 4% scatter must read holding". **That verdict no longer
// exists**, so there is no strength-shaped assertion left to make about it. Two things keep this from
// being a coverage loss: the guard itself is still pinned generically in
// `classify-noise-guard.test.ts` (it is a property of `classifyTrend`, not of strength), and what
// these inputs must now produce — NO direction, in any shape — is asserted here instead. Keeping the
// same three input series on purpose: if the retirement is ever undone, these fire first.
const NO_DIRECTION_INPUTS: number[][] = [
  [202, 198, 210, 188, 200, 190], // was "holding" (slide buried in scatter)
  [212, 208, 196, 194],           // was "sliding" (clean slide)
  [188, 192, 206, 210],           // was "improving" (clean gain)
];

Deno.test('⛔ D-420: no strength input produces a direction verdict — rising, falling or flat', () => {
  for (const values of NO_DIRECTION_INPUTS) {
    const s = computeStrengthState(squat(values), AS_OF, 1.2);
    assertEquals(s.overall, 'needs_data');
    assertEquals(s.overallPctChange, null);
    assertEquals(s.lifts[0].trend.verdict, 'needs_data');
    assertEquals(s.lifts[0].trend.pctChange, null);
  }
});

Deno.test('D-420: the RECEIPTS survive the retirement — the row still knows what it read', () => {
  // Sample count, recency and the points themselves are facts and are still published; only the
  // judgement is gone. The record + rep PRs + chart are built from exactly these.
  const s = computeStrengthState(squat([212, 208, 196, 194]), AS_OF, 1.2);
  const t = s.lifts[0].trend;
  assertEquals(t.sampleCount, 4);
  assert(t.newestAgeDays != null);
  assertEquals(t.points.length, 4);
});

Deno.test('strengthVolumeToSeries: drops zero/invalid volume', () => {
  const s = strengthVolumeToSeries([
    { date: '2026-06-10', total_volume_lbs: 12000 },
    { date: '2026-06-17', total_volume_lbs: 0 },      // drop
    { date: '2026-06-24', total_volume_lbs: null },   // drop
    { date: '2026-07-01', total_volume_lbs: 14000 },
  ]);
  assertEquals(s.map((p) => p.value), [12000, 14000]);
});

// Volume RISING = more training → "improving" (up-arrow). NOT a fitness claim — a load fact.
Deno.test('computeStrengthVolumeState: rising volume → improving (more training)', () => {
  const series = [
    { date: '2026-05-25', value: 9000 },
    { date: '2026-06-08', value: 11000 },
    { date: '2026-06-22', value: 13000 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(t.verdict, 'improving');
});

// Volume FALLING = less training → "sliding" (down-arrow), not asserted as fitness loss.
Deno.test('computeStrengthVolumeState: falling volume → sliding (less training)', () => {
  const series = [
    { date: '2026-05-25', value: 13000 },
    { date: '2026-06-08', value: 11000 },
    { date: '2026-06-22', value: 9000 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(t.verdict, 'sliding');
});

// Wider band: a small volume wobble (<8%) reads holding, not a direction.
Deno.test('computeStrengthVolumeState: small wobble (<8%) → holding', () => {
  const series = [
    { date: '2026-05-25', value: 12000 },
    { date: '2026-06-08', value: 12300 },
    { date: '2026-06-22', value: 12100 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assert(t.verdict === 'holding' || t.verdict === 'needs_data');
});
