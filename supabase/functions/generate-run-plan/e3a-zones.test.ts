// E3a — non-race (sustainable) prescription gains HR+pace zones; RPE is the no-data fallback; miles
// are untouched (volume is E3b). Run:
//   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/e3a-zones.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

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
  const d = longRunDesc(plan({ lthr: 158, max_hr: 176, resting_hr: 50, vdot: 50 }));
  assert(/Z2 aerobic/.test(d), `expected Z2 aerobic: ${d}`);
  assert(/HR \d+/.test(d), `expected HR band: ${d}`);
  assert(/\/mi/.test(d), `expected a pace target: ${d}`);
});

Deno.test('E3a: Friel HR band uses the learned LTHR (158 → Z2 ~142)', () => {
  const d = longRunDesc(plan({ lthr: 158, vdot: 50 }));
  assert(/HR 134–142/.test(d), `expected Friel Z2 134–142 off LTHR 158: ${d}`);
});

Deno.test('E3a: RPE FALLBACK when no learned data (no zones, keeps effort wording)', () => {
  const d = longRunDesc(plan({}));
  assert(/conversational/.test(d), `expected RPE fallback wording: ${d}`);
  assert(!/Z2 aerobic/.test(d), `must not fabricate a zone without data: ${d}`);
  assert(!/HR \d/.test(d), `must not fabricate HR without data: ${d}`);
});

Deno.test('E3a: MILES UNCHANGED whether zones present or not (volume is untouched — E3b)', () => {
  const withZones = plan({ lthr: 158, max_hr: 176, vdot: 50 });
  const without = plan({});
  for (const wk of Object.keys(without.sessions_by_week)) {
    assertEquals(
      milesIn(longRunDesc(withZones, wk)),
      milesIn(longRunDesc(without, wk)),
      `long-run miles must match with/without zones at week ${wk}`,
    );
  }
});
