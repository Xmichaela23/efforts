/**
 * D-237 fixture (no silent impersonation): the "HR N bpm above YOUR norm for this
 * pace" observation may fire ONLY against a REAL easy-HR-at-pace norm. When the
 * norm is missing, the observer must refuse — emit a bare "HR N bpm." with no
 * norm claim — never a comparison against a fabricated value.
 *
 * Guards the C2 fix: coach used to synthesize `easy_hr_at_pace = 140 + hr_drift`
 * (a made-up constant + a dimensionally-wrong drift delta) and surface it as the
 * athlete's own norm. Coach now passes null. This pins the contract that protects
 * against re-fabrication: a non-null norm is the ONLY way the "your norm" line
 * appears, so any future re-introduction of a fake norm is a visible test change.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/athlete-snapshot/body-response-norm-honesty.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildBodyResponse } from './body-response.ts';

function runLedger(avgHr: number) {
  return [{
    date: '2026-07-01', day_name: 'Wednesday', is_today: false, is_past: true, planned: [], matches: [],
    actual: [{
      workout_id: 'r1', type: 'run', name: 'Easy Run', source: 'garmin' as const,
      duration_seconds: 3000, distance_meters: 8000, pace: '9:00/mi', avg_hr: avgHr,
      load_actual: 180, rpe: 5, feeling: null, execution_score: 88, decoupling_pct: 3.0,
      strength_actual: null,
    }],
  }];
}
const LOAD = { actual_vs_planned_pct: null, acwr: null, running_acwr: null, cycling_acwr: null };
const CROSS = { interference: false, detail: 'balanced' };

function runObs(norms: any, avgHr = 152): string[] {
  const out = buildBodyResponse(runLedger(avgHr) as any, norms, true, LOAD, CROSS, 'build');
  return out.session_signals[0]?.observations ?? [];
}

const NORMS_NULL = {
  easy_hr_at_pace: null, threshold_pace_sec_per_mi: null, avg_execution_score: 90,
  avg_rpe: 4.3, avg_hr_drift_bpm: 6, avg_decoupling_pct: 3.5, avg_rir: 2,
};

Deno.test('null easy-HR norm → bare "HR N bpm.", NO "your norm" claim (C2 refuse)', () => {
  const obs = runObs(NORMS_NULL);
  assertEquals(obs.includes('HR 152 bpm.'), true);
  assertEquals(obs.some((o) => o.includes('your norm')), false);
  assertEquals(obs.some((o) => o.includes('normal range')), false);
});

Deno.test('REAL easy-HR norm → the "your norm" line fires (only with a real value)', () => {
  const obs = runObs({ ...NORMS_NULL, easy_hr_at_pace: 144 });
  assertEquals(obs.includes('HR 152 bpm — 8 bpm above your norm for this pace.'), true);
});

Deno.test('the retired fabrication (140 + drift 6 = 146) would have LIED by ~6 bpm', () => {
  // Documents the bug: 152 vs a real 144 norm is +8; the fake 140+6=146 norm made it +6.
  // With null (the fix) there is no number to be wrong — the claim simply isn't made.
  const obsNull = runObs(NORMS_NULL);
  assertEquals(obsNull.some((o) => /\d+ bpm (above|below) your norm/.test(o)), false);
});
