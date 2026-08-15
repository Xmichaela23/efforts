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

Deno.test('a light lift keeps sub-45 sets — the room below the standard bar is real, not clamped away', () => {
  // OHP 1RM 60 → working number 51 → week 1 ≈ 35/40/45. Under the flag model these floor at the
  // 35 lb women's bar rather than being clamped to 45 — clamping would flatten the wave into
  // identical empty-bar sets and hide that the lift is light. (60 is below the 65 entry gate, so
  // no real athlete reaches this compose — the pin guards the floor math itself.)
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { squat: 110, deadlift: 150, bench: 150, overheadPress: 60 },
    enduranceSport: 'run',
  });
  const week1 = ohpSetPlan(plan, '1');
  assert(week1.some((w) => w < BAR), `expected a sub-bar work set in week 1, got ${JSON.stringify(week1)}`);
});

// ── THE ENTRY MINIMUM + THE WOMEN'S-BAR BAND (2026-08-13, the flag model) ───────────────────────
import { liftsBelowEntryMinimum, readBarbellMaxes, STRENGTH_ENTRY_MIN_1RM_LB } from './barbell-maxes.ts';
import { barFloorForWorkingNumber, workingNumberFrom1RM } from './loading/wendler-531.ts';

Deno.test('entry minimum is 65 — under it refused; 65-84 admitted (the women\'s-bar band); missing is the other gate', () => {
  assertEquals(STRENGTH_ENTRY_MIN_1RM_LB, 65);
  const maxes = readBarbellMaxes({ squat: 110, deadlift: 150, bench: 150, overheadPress1RM: 60 });
  assertEquals(liftsBelowEntryMinimum(maxes), ['overheadPress']);
  // 70 — inside the band: admitted, not refused.
  assertEquals(liftsBelowEntryMinimum(readBarbellMaxes({ squat: 110, deadlift: 150, bench: 150, overheadPress1RM: 70 })), []);
  // A missing lift (0) belongs to missingBarbellLifts, not to this gate — two refusals, two names.
  assertEquals(liftsBelowEntryMinimum(readBarbellMaxes({ squat: 110, deadlift: 150, bench: 150 })), []);
});

Deno.test('the per-lift floor: 85+ lifts floor at 45; the 65-84 band floors at the 35 women\'s bar', () => {
  assertEquals(barFloorForWorkingNumber(workingNumberFrom1RM(100)), 45); // Michael's press
  assertEquals(barFloorForWorkingNumber(workingNumberFrom1RM(85)), 45);  // the boundary clears 45
  assertEquals(barFloorForWorkingNumber(workingNumberFrom1RM(70)), 35);  // band lift
});

Deno.test('a 70 lb press builds: sets floor at 35, none below it, and the plan copy names the women\'s bar', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { squat: 110, deadlift: 150, bench: 150, overheadPress: 70 },
    enduranceSport: 'run',
  });
  for (const wk of ['1', '4']) {
    for (const w of ohpSetPlan(plan, wk)) {
      assert(w >= 35, `week ${wk} set at ${w} lb is below the 35 lb women's bar`);
    }
  }
  assert(ohpSetPlan(plan, '1').some((w) => w < 45), 'a band lift should use the room below 45');
  assert(plan.description.includes('35 lb bar'), 'the plan description must flag the light-bar sets');
  assert(plan.description.includes('Overhead Press'), 'and name the lift');
});

Deno.test('an 85+ block keeps the 45 floor everywhere and carries no women\'s-bar flag', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { squat: 110, deadlift: 150, bench: 150, overheadPress: 100 },
    enduranceSport: 'run',
  });
  for (const w of ohpSetPlan(plan, '4')) assert(w >= 45, `deload set at ${w} lb is below the bar`);
  assert(!plan.description.includes('35 lb bar'), 'no flag when every lift clears 45');
});
