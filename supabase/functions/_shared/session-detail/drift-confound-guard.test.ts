/**
 * Unconditioned-comparison guard — the "higher than your typical" drift verdict is a fitness
 * implication, but heat and terrain INFLATE drift, so on a hot/hilly run that verdict asserts a
 * decline conditions explain ("score that lies", D-242). This pins: hot/hilly high reading names
 * the confound (no fitness verdict); a clean-conditions high reading still says "higher than
 * typical"; and the neutral/low branches are untouched.
 *
 * Run: deno test supabase/functions/_shared/session-detail/drift-confound-guard.test.ts --no-check --allow-read
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';

// factPacket with a real drift signal above typical, plus weather/terrain knobs.
function fp(opts: { tempF?: number; heat?: string; terrainBpm?: number; typical?: number; signal?: number }): any {
  return {
    derived: {
      hr_drift_bpm: opts.signal ?? 12,
      pace_normalized_drift_bpm: opts.signal ?? 12,
      drift_explanation: opts.terrainBpm ? 'terrain_driven' : null,
      hr_drift_typical: opts.typical ?? 6,
      terrain_contribution_bpm: opts.terrainBpm ?? null,
      interval_execution: { total_steps: 1 },
    },
    facts: {
      total_duration_min: 50,
      segments: [],
      weather: { temperature_f: opts.tempF ?? 60, heat_stress_level: opts.heat ?? 'none' },
    },
  };
}
const hr = (rows: Array<{ label: string; value: string }>) => rows.find((r) => r.label === 'Heart rate')?.value ?? '';
const build = (packet: any) => buildAnalysisDetailRows(packet, [], false, null, false, [], 'run', null, null, null);

Deno.test('HOT run, drift above typical → names the heat, NOT a fitness verdict', () => {
  const v = hr(build(fp({ tempF: 82, signal: 12, typical: 6 })));
  assertStringIncludes(v, 'the heat drove it');
  assertEquals(/higher than your typical/.test(v), false);
});

Deno.test('HILLY run, drift above typical → names the terrain, NOT a fitness verdict', () => {
  const v = hr(build(fp({ terrainBpm: 5, signal: 12, typical: 6 })));
  assertStringIncludes(v, 'the terrain drove it');
  assertEquals(/higher than your typical/.test(v), false);
});

Deno.test('CLEAN conditions, drift above typical → still says "higher than your typical" (real signal)', () => {
  const v = hr(build(fp({ tempF: 58, signal: 12, typical: 6 })));
  assertStringIncludes(v, 'higher than your typical');
});

Deno.test('LOW drift vs typical is never confound-guarded (heat cannot lower drift)', () => {
  const v = hr(build(fp({ tempF: 85, signal: 4, typical: 10 })));
  assertStringIncludes(v, 'lower than your typical');
});
