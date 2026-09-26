/**
 * The zones Profile and Welcome print, built from the stored row (2026-09-10, audit H-B04–H-B06).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/save-baselines/zones.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { zonesForBaselinesRow } from './zones.ts';
import { heartRateZoneSet, hrZoneBinText, timeInZones } from '../_shared/endurance/display-zones.ts';

Deno.test('a typed FTP, a threshold 100 and a typed run threshold give all three', () => {
  const z = zonesForBaselinesRow({
    performance_numbers: { ftp: 250, ftp_source: 'manual', swimPace100: '1:45' },
    configured_hr_zones: { manual_run_lthr: 160 },
    learned_fitness: null,
  });
  assertEquals(z.power?.ftp, 250);
  // Coggan's L2 at FTP 250: from one watt above L1's top (137) to 75% (187) — the ride counts the same watts.
  assertEquals(z.power?.rows[1].range, '138-187W');
  assertEquals(z.swim_pace?.threshold_100, '1:45');
  assertEquals(z.swim_pace?.rows[3], { label: 'Threshold', range: '1:43–1:48', anchor: true });
  // 70% and 89% of 160, the server's easy band — not the 85–89% the Welcome screen printed.
  assertEquals([z.run_easy_hr?.floor, z.run_easy_hr?.ceiling, z.run_easy_hr?.anchor], [112, 142, 'lthr']);
});

Deno.test('stored JSON strings are read the same', () => {
  const z = zonesForBaselinesRow({
    performance_numbers: JSON.stringify({ ftp: 200 }),
    configured_hr_zones: JSON.stringify({}),
    learned_fitness: JSON.stringify({}),
  });
  assertEquals(z.power?.rows[0].range, '0-110W');
});

Deno.test('nothing on file: nothing to print', () => {
  // d3f7f3a4 (Stage 4 session 1) added the `readout` block; with nothing on file it carries rows with no number.
  const values = (o: unknown): unknown[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (k === 'value' ? [v] : values(v)))
      : [];
  for (const row of [{}, null]) {
    const { readout, ...zones } = zonesForBaselinesRow(row);
    assertEquals(zones, { power: null, swim_pace: null, run_easy_hr: null });
    assertEquals(values(readout).filter((v) => v != null), []);
    assertEquals([readout.run.zones.rows, readout.bike.zones.rows], [[], []]);
    assertEquals([readout.run.threshold_proposal, readout.bike.ftp_proposal], [null, null]);
  }
});

Deno.test('run threshold proposal: both paces in the athlete unit, and which way it moved', () => {
  const row = (units: string) => ({
    units,
    performance_numbers: { threshold_pace_sec_per_km: 280, threshold_pace_source: 'manual' },
    learned_fitness: { run_threshold_pace_sec_per_km: { value: 432 / 1.609344, confidence: 'medium' } },
  });
  const imp = zonesForBaselinesRow(row('imperial')).readout?.run.threshold_proposal;
  assertEquals([imp?.measured_display, imp?.applied_display, imp?.faster, imp?.button], ['7:12/mi', '7:31/mi', true, 'use 7:12/mi']);
  const met = zonesForBaselinesRow(row('metric')).readout?.run.threshold_proposal;
  assertEquals([met?.measured_display, met?.applied_display, met?.faster], ['4:28/km', '4:40/km', true]);
});

// ── heart-rate zones: the table Baselines prints IS the set a session is counted in (2026-09-26) ──────────────

const TODAY = '2026-09-26';
/** The audited account's shape: Strava's automatic table stored at connect (220 − age), inferred max 164. */
const STRAVA_CFG = {
  source: 'strava',
  custom_zones: false,
  zones: [{ min: 0, max: 110 }, { min: 110, max: 137 }, { min: 137, max: 150 }, { min: 150, max: 164 }, { min: 164, max: null }],
  max_heart_rate: 164,
};
const learnedRideThreshold = { ride_threshold_hr: { value: 153, confidence: 'high', sample_count: 25 } };

Deno.test('Baselines prints exactly the heart-rate zones a ride is counted in, and a ride\'s card prints them too', () => {
  const row = { configured_hr_zones: STRAVA_CFG, learned_fitness: learnedRideThreshold, birthday: '1970-03-01', gender: 'male' };
  const table = zonesForBaselinesRow(row, { today: TODAY }).readout.bike.zones;
  const set = heartRateZoneSet(row, 'ride', { today: TODAY })!;
  assertEquals(set.schema, 'friel-ride');
  assertEquals(table.rows, set.rows.map((r) => ({ name: r.name, range: r.range })));
  assertEquals(table.basis, 'from your threshold heart rate');
  assertEquals(table.estimate, false);
  // The analysis stores each bin with the set it came from; the card's words for it are the table's rows.
  const bpm = Array.from({ length: 191 }, (_, i) => 40 + i);
  const secs = timeInZones(bpm, bpm.map((_, i) => i), set.tops)!;
  const bins = set.rows.map((r, i) => ({ i, t_s: secs[i], min: r.min, max: r.max }));
  assertEquals(hrZoneBinText({ schema: set.schema, anchor_bpm: set.anchor_bpm, bins }), table.rows);
  // Every beat from 41 to 230 was counted once, in the row that prints it.
  assertEquals(secs.reduce((a, b) => a + b, 0), 190);
  set.rows.forEach((r, i) => assertEquals(secs[i], (r.max ?? 230) - Math.max(r.min, 41) + 1, r.name));
});

Deno.test('no imported table is read: Strava\'s zones and its inferred max never set a zone edge', () => {
  // With the learned ride threshold: Friel at 153, not Strava's 110/137/150/164.
  const withThreshold = heartRateZoneSet({ configured_hr_zones: STRAVA_CFG, learned_fitness: learnedRideThreshold }, 'ride', { today: TODAY })!;
  assertEquals([withThreshold.schema, withThreshold.anchor_bpm, withThreshold.rows[4].range], ['friel-ride', 153, '153–157 bpm']);
  // No threshold: % of the learned max (176), not Strava's 164 — and the Max heart rate row shows the same 176.
  const lf = { ride_max_hr_observed: { value: 176, confidence: 'high', sample_count: 40 } };
  const row = { configured_hr_zones: STRAVA_CFG, learned_fitness: lf, birthday: '1970-03-01' };
  const byMax = heartRateZoneSet(row, 'ride', { today: TODAY })!;
  assertEquals([byMax.schema, byMax.anchor_bpm, byMax.estimate], ['max-hr', 176, false]);
  const readout = zonesForBaselinesRow(row, { today: TODAY }).readout.bike;
  assertEquals(readout.max_hr.value, '176 bpm · auto');
  assertEquals(readout.zones.rows.map((r) => r.range), ['105 bpm and under', '106–122 bpm', '123–140 bpm', '141–157 bpm', '158 bpm and up']);
  // Not the analysis's old last resort either: a Strava table and nothing else of the athlete's gives no zones.
  assertEquals(heartRateZoneSet({ configured_hr_zones: STRAVA_CFG }, 'ride', { today: TODAY }), null);
});

Deno.test('the chain per sport: a typed max, then the age estimate (flagged), then nothing', () => {
  const typed = heartRateZoneSet({ configured_hr_zones: { manual_run_max_hr: 181 }, birthday: '1970-03-01' }, 'run', { today: TODAY })!;
  assertEquals([typed.schema, typed.anchor_bpm, typed.estimate], ['max-hr', 181, false]);
  // The ride has no typed or learned max of its own, so the age tier: Tanaka 208 − 0.7 × 56 = 168.8 → 169.
  const man = heartRateZoneSet({ configured_hr_zones: { manual_run_max_hr: 181 }, birthday: '1970-03-01', gender: 'male' }, 'ride', { today: TODAY })!;
  assertEquals([man.schema, man.anchor_bpm, man.estimate], ['max-hr-age', 169, true]);
  // Gulati for women: 206 − 0.88 × 56 = 156.7 → 157.
  const woman = heartRateZoneSet({ birthday: '1970-03-01', gender: 'female' }, 'run', { today: TODAY })!;
  assertEquals([woman.schema, woman.anchor_bpm], ['max-hr-age', 157]);
  const table = zonesForBaselinesRow({ birthday: '1970-03-01', gender: 'female' }, { today: TODAY }).readout.run.zones;
  assertEquals([table.rows.length, table.basis, table.estimate], [5, 'estimated from your age', true]);
  // The max row never prints the age estimate.
  assertEquals(zonesForBaselinesRow({ birthday: '1970-03-01' }, { today: TODAY }).readout.run.max_hr.value, null);
  // No threshold, no max, no birthday: no zones, and the empty line.
  const none = zonesForBaselinesRow({ configured_hr_zones: STRAVA_CFG }, { today: TODAY }).readout.run.zones;
  assertEquals([none.rows, none.estimate], [[], false]);
  // A run threshold anchors the run table only; the ride stays on its own numbers.
  const runOnly = { configured_hr_zones: { manual_run_lthr: 165 }, birthday: '1970-03-01' };
  assertEquals(heartRateZoneSet(runOnly, 'run', { today: TODAY })?.schema, 'friel-run');
  assertEquals(heartRateZoneSet(runOnly, 'ride', { today: TODAY })?.schema, 'max-hr-age');
});
