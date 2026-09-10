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
  assertEquals(zonesForBaselinesRow({}), { power: null, swim_pace: null, run_easy_hr: null });
  assertEquals(zonesForBaselinesRow(null), { power: null, swim_pace: null, run_easy_hr: null });
});
