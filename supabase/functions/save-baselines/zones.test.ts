/**
 * The zones Profile and Welcome print, built from the stored row (2026-09-10, audit H-B04–H-B06).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/save-baselines/zones.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { zonesForBaselinesRow } from './zones.ts';

Deno.test('a typed FTP, a threshold 100 and a typed run threshold give all three', () => {
  const z = zonesForBaselinesRow({
    performance_numbers: { ftp: 250, ftp_source: 'manual', swimPace100: '1:45' },
    configured_hr_zones: { manual_run_lthr: 160 },
    learned_fitness: null,
  });
  assertEquals(z.power?.ftp, 250);
  assertEquals(z.power?.rows[1].range, '140-188W');
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
  assertEquals(z.power?.rows[0].range, '< 110W');
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
