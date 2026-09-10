/**
 * ⛔ AN INDOOR SESSION REPORTS NO HEAT AND NO HILLS (docs/WORKORDER-endurance-swaps-2026-09-09.md §1).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports supabase/functions/_shared/session-detail/indoor-venue-rows.test.ts
 *
 * ⚠️ THE DRIFT NUMBER IS NEVER TOUCHED — only the two explanations that cannot be true on a trainer
 * or a treadmill. Pinned both ways: the outdoor session must still say them.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';

const hot = {
  facts: {
    weather: { temperature_f: 88, humidity_pct: 62, heat_stress_level: 'moderate' },
    terrain_type: 'hilly',
    elevation_gain_ft: 900,
  },
  // `interval_execution` sends the read down the branch that prints the basis suffix, the way an
  // interval ride's own packet does.
  derived: { terrain_contribution_bpm: 6, interval_execution: { total_steps: 6 } },
};
const drift = { pct: 7.4, basis: 'raw' as const, assessment: null, confounded: false };

const rows = (indoors: boolean) =>
  buildAnalysisDetailRows(hot, [], false, null, false, [], 'ride', null, 88, drift, null, null, null, indoors);
const row = (indoors: boolean, label: string) => rows(indoors).find((r) => r.label === label)?.value ?? null;

Deno.test('⛔ OUTDOORS SAYS BOTH — the baseline this suppression is measured against', () => {
  assert(String(row(false, 'Heart rate')).includes('hills mixed in'), String(row(false, 'Heart rate')));
  assert(String(row(false, 'Conditions')).includes('88°F'), String(row(false, 'Conditions')));
});

Deno.test('⛔ INDOORS SAYS NEITHER, AND KEEPS THE NUMBER', () => {
  const hr = String(row(true, 'Heart rate'));
  assert(hr.includes('7.4%'), hr);            // the measurement stands
  assert(!hr.includes('hills'), hr);
  assertEquals(row(true, 'Conditions'), null); // the heat line and the hills line are the row
});

/**
 * ⛔ THE SECOND PLACE HEAT SPEAKS is the bpm read's own-baseline comparison — *"above your typical
 * +4, but the heat drove it"*. Indoors that sentence explains a real drift away with weather that
 * was not in the room, so the confound is off and the plain comparison stands.
 */
const bpm = {
  facts: { weather: { temperature_f: 88, heat_stress_level: 'moderate' } },
  derived: { hr_drift_bpm: 11, hr_drift_typical: 4, terrain_contribution_bpm: 6, drift_explanation: 'terrain_driven' },
};
const bpmRow = (indoors: boolean) =>
  buildAnalysisDetailRows(bpm, [], false, null, false, [], 'ride', null, 88, null, null, null, null, indoors)
    .find((r) => r.label === 'Heart rate')?.value ?? '';

Deno.test('⛔ "THE HEAT DROVE IT" IS AN OUTDOOR SENTENCE', () => {
  assert(bpmRow(false).includes('heat'), bpmRow(false));
  assert(!bpmRow(true).includes('heat'), bpmRow(true));
  assert(!bpmRow(true).includes('terrain'), bpmRow(true));
  assert(bpmRow(true).includes('higher than your typical'), bpmRow(true));
});
