// THE DELOAD BAR FLOOR (2026-08-13) — week 4's work sets cannot prescribe below the empty bar.
//
// ⛔ THE DEFECT THIS PINS. Michael's week-4 OHP on device read 30×5, 40×5, 50×5 — with plate chips —
// on a 45 lb bar. `mainLiftRow` floors WARM-UPS at `BAR_LB` and deliberately not work sets, on the
// stated reasoning that a sub-bar work set implies a broken training max the athlete would notice.
// Deload weeks break that assumption: 40/50/60% of the working number, with no warm-up ramp in
// front (`warmupSetsForWeek` returns none — "the work sets ARE the ramp"), so any working number
// under ~112 lb authored unliftable sets. The deload now takes the same floor the ramp would have.
//
// ⚠️ NON-DELOAD WORK SETS STAY UNFLOORED, and the second test pins that deliberately — masking a
// near-empty-bar training max on a normal week is the thing the original no-floor call exists to
// avoid. Do not "fix" it while touching the deload.
//
// Deterministic: no LLM anywhere in this path, so one run is definitive.
//
// Run: ~/.deno/bin/deno test --no-check --allow-read supabase/functions/shared/strength-system/deload-bar-floor.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const BAR = 45;

function ohpSetPlan(plan: { sessions_by_week: Record<string, unknown[]> }, week: string): number[] {
  const sessions = plan.sessions_by_week[week] as Array<{ strength_exercises?: Array<{ name: string; set_plan?: Array<{ weight: number; warmup?: boolean }> }> }>;
  for (const s of sessions) {
    const ohp = (s.strength_exercises ?? []).find((e) => e.name === 'Overhead Press');
    if (ohp?.set_plan) return ohp.set_plan.filter((p) => !p.warmup).map((p) => p.weight);
  }
  throw new Error(`no Overhead Press set_plan in week ${week}`);
}

Deno.test('deload work sets floor at the empty bar — a light press cannot prescribe 30 lb on a barbell', () => {
  // OHP 1RM 100 → working number 85 → deload 40/50/60% = 34/42.5/51 → rounded 30/40/50: two sets
  // below the bar, exactly Michael's device screenshot. Floored, they read 45/45/50.
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { squat: 110, deadlift: 150, bench: 150, overheadPress: 100 },
    enduranceSport: 'run',
  });
  const deload = ohpSetPlan(plan, '4');
  assertEquals(deload.length, 3);
  for (const w of deload) {
    assert(w >= BAR, `deload set at ${w} lb is below the ${BAR} lb bar`);
  }
  // The floor clamps, it does not flatten: the top set was already legal and must keep its number.
  assert(deload[deload.length - 1] >= deload[0], 'the deload still ramps');
});

Deno.test('non-deload work sets are deliberately NOT floored — a sub-bar week-1 set stays visible', () => {
  // OHP 1RM 60 → working number 51 → week 1 at 65/75/85% ≈ 35/40/45: the first work set sits below
  // the bar and must SURVIVE, because on a normal week that number is the athlete's cue that the
  // training max itself is near-empty-bar — masking it is the failure the original call avoids.
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { squat: 110, deadlift: 150, bench: 150, overheadPress: 60 },
    enduranceSport: 'run',
  });
  const week1 = ohpSetPlan(plan, '1');
  assert(week1.some((w) => w < BAR), `expected a sub-bar work set in week 1, got ${JSON.stringify(week1)}`);
});
