/**
 * A planned swim's subtitle line and distance, as materialize-plan writes them (audit H-T18 / H-T20).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/swim/swim-plan-summary.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { categorizeSwimTokensForDisplay, formatSwimSubtitleFromBuckets, plannedSwimDistance } from './swim-plan-summary.ts';

const line = (tokens: string[]) => formatSwimSubtitleFromBuckets(categorizeSwimTokensForDisplay(tokens), ' • ');

Deno.test('the bucket line reads as the phone printed it, word for word', () => {
  assertEquals(
    line(['swim_warmup_300yd_easy', 'swim_drills_4x50yd_catchup', 'swim_pull_4x100yd_r20_buoy', 'swim_aerobic_css_6x100yd_r15', 'swim_cooldown_200yd']),
    'WU 300 yd • Drills: catchup 4x50 • Pull 4x100 @ :20r • Aerobic 6x100 @ :15r • CD 200 yd',
  );
  assertEquals(
    line(['swim_drill_fingertip_drag_4x50yd_r15', 'swim_threshold_8x100yd_r10', 'swim_kick_4x50m']),
    'Drills: fingertip drag 4x50 @ :15r • Kick 4x50 • Aerobic threshold 8x100 @ :10r',
  );
});

Deno.test('a swim with no distance tokens has no line', () => {
  assertEquals(line(['swim_open_water_practice']), undefined);
});

Deno.test('the unit is the pool unit, else metres for a metric athlete, else yards', () => {
  assertEquals(plannedSwimDistance({ yd: 1500, m: 0 }, null, 'imperial'), { distance: 1500, unit: 'yd', label: '1500 yd' });
  assertEquals(plannedSwimDistance({ yd: 1500, m: 0 }, 'm', 'imperial'), { distance: 1372, unit: 'm', label: '1372 m' });
  assertEquals(plannedSwimDistance({ yd: 1500, m: 0 }, null, 'metric'), { distance: 1372, unit: 'm', label: '1372 m' });
  assertEquals(plannedSwimDistance({ yd: 1500, m: 0 }, 'yd', 'metric'), { distance: 1500, unit: 'yd', label: '1500 yd' });
  assertEquals(plannedSwimDistance({ yd: 0, m: 1400 }, 'm', null), { distance: 1400, unit: 'm', label: '1400 m' });
  assertEquals(plannedSwimDistance({ yd: 100, m: 50 }, null, null), { distance: 155, unit: 'yd', label: '155 yd' });
});

Deno.test('no distance prints nothing', () => {
  assertEquals(plannedSwimDistance({ yd: 0, m: 0 }, null, 'imperial'), null);
  assertEquals(plannedSwimDistance(null, 'yd', 'imperial'), null);
});
