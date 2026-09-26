// E3a — non-race (sustainable) prescription gains HR+pace zones; RPE is the no-data fallback; miles
// are untouched (volume is E3b). Run:
//   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/e3a-zones.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';
import { heartRateZoneSet } from '../_shared/endurance/display-zones.ts';
import { resolveRunEasyHrBand } from '../_shared/easy-hr.ts';

/**
 * The zone inputs exactly as `generate-run-plan` builds them (2026-09-26): the row's `heartRateZoneSet` rows (the
 * table Baselines prints) and the run easy band — both from a `user_baselines` row.
 */
function zonesFrom(row: Record<string, unknown>) {
  const rows = heartRateZoneSet(row as never, 'run', { today: '2026-09-26' })?.rows;
  const b = resolveRunEasyHrBand(row as never);
  return {
    hr_zone_rows: rows,
    easy_hr_band: b.floor != null && b.ceiling != null ? { floor: b.floor, ceiling: b.ceiling } : undefined,
  };
}
const thresholdRow = (lthr: number) => ({ learned_fitness: { run_threshold_hr: { value: lthr, confidence: 'high', sample_count: 6 } } });

const base = {
  distance: 'half', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 12, days_per_week: '4-5', user_id: 'test', terminalShape: 'retest',
} as const;

function plan(extra: Record<string, unknown>) {
  const g = new SustainableGenerator({ ...base, ...extra } as never);
  return (g as unknown as { generatePlan(): { sessions_by_week: Record<string, Array<{ name?: string; description?: string; tags?: string[] }>> } }).generatePlan();
}
const longRunDesc = (p: ReturnType<typeof plan>, wk = '1') =>
  (p.sessions_by_week[wk] ?? []).find((s) => (s.tags ?? []).includes('long_run'))?.description ?? '';
const milesIn = (d: string) => { const m = d.match(/^(\d+(?:\.\d+)?)\s*miles/); return m ? +m[1] : null; };

Deno.test('E3a: long run is ZONE-LED when learned data present (HR band + pace)', () => {
  const d = longRunDesc(plan({ ...zonesFrom(thresholdRow(158)), vdot: 50 }));
  assert(/Z2 aerobic/.test(d), `expected Z2 aerobic: ${d}`);
  assert(/HR \d+/.test(d), `expected HR band: ${d}`);
  assert(/\/mi/.test(d), `expected a pace target: ${d}`);
});

Deno.test('E3a: Friel HR band uses the learned LTHR (158 → Z2 ~141)', () => {
  // 70c84ad1: one Friel table (`src/lib/friel-zones.ts`), Z2 top = 89% of LTHR → round(158 × 0.89) = 141.
  const d = longRunDesc(plan({ ...zonesFrom(thresholdRow(158)), vdot: 50 }));
  assert(/HR 134–141/.test(d), `expected Friel Z2 134–141 off LTHR 158: ${d}`);
});

Deno.test('E3a: RPE FALLBACK when no learned data (no zones, keeps effort wording)', () => {
  const d = longRunDesc(plan({}));
  assert(/conversational/.test(d), `expected RPE fallback wording: ${d}`);
  assert(!/Z2 aerobic/.test(d), `must not fabricate a zone without data: ${d}`);
  assert(!/HR \d/.test(d), `must not fabricate HR without data: ${d}`);
});

Deno.test('E3a: MILES UNCHANGED whether zones present or not (volume is untouched — E3b)', () => {
  const withZones = plan({ ...zonesFrom(thresholdRow(158)), vdot: 50 });
  const without = plan({});
  for (const wk of Object.keys(without.sessions_by_week)) {
    assertEquals(
      milesIn(longRunDesc(withZones, wk)),
      milesIn(longRunDesc(without, wk)),
      `long-run miles must match with/without zones at week ${wk}`,
    );
  }
});

// ── 2026-09-26: ONE ZONE TABLE, ONE EASY RULE ─────────────────────────────────────────────────────────────
const easyRunDesc = (p: ReturnType<typeof plan>) =>
  Object.values(p.sessions_by_week).flat().find((s) => (s.tags ?? []).includes('easy_run') && /^\d+(\.\d+)? miles — easy aerobic/.test(s.description ?? ''))?.description ?? '';

Deno.test('ONE TABLE: the long run prints Zone 2 of the table Baselines prints; an easy run prints the run easy band', () => {
  const row = thresholdRow(162);
  const p = plan({ ...zonesFrom(row), vdot: 50 });
  const z2 = heartRateZoneSet(row as never, 'run', { today: '2026-09-26' })!.rows[1];
  assert(new RegExp(`HR ${z2.min}–${z2.max}`).test(longRunDesc(p)), `long run: ${longRunDesc(p)}`);
  const band = resolveRunEasyHrBand(row as never);
  const easy = easyRunDesc(p);
  assert(easy.length > 0, 'no easy run in the plan');
  assert(new RegExp(`HR ${band.floor}–${band.ceiling}`).test(easy), `easy run: ${easy}`);
});

Deno.test('ONE TABLE: no threshold → the plan prints % of max zones, not Karvonen off an assumed resting 60', () => {
  const row = { learned_fitness: { run_max_hr_observed: { value: 190, confidence: 'high', sample_count: 20 } } };
  const d = longRunDesc(plan({ ...zonesFrom(row), vdot: 50 }));
  // Garmin's Zone 2 of 190: 60–70% → 114–132. Karvonen with a resting 60 printed 138–151.
  assert(/HR 114–132/.test(d), `expected Zone 2 of the %-of-max table: ${d}`);
});

Deno.test('ONE TABLE: a TYPED run threshold is what the plan prints', () => {
  const row = { learned_fitness: { run_threshold_hr: { value: 150, confidence: 'high', sample_count: 6 } }, performance_numbers: { lthr_source: 'manual' }, configured_hr_zones: { manual_run_lthr: 170 } };
  const d = longRunDesc(plan({ ...zonesFrom(row), vdot: 50 }));
  // Friel Zone 2 off 170: round(0.85 × 170) = 145 … round(0.89 × 170) = 151.
  assert(/HR 145–151/.test(d), `expected Zone 2 off the typed 170: ${d}`);
});
