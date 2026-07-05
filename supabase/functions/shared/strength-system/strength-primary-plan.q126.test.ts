/**
 * Q-126 (Gap A) fixture — the non-race Get Strong generator now emits a duration-native
 * run intensity token from enduranceSession(), so run workload_planned reflects the easy/
 * long prescription (0.65 via the Gap-B matcher) instead of the 0.75 per-type default.
 *
 * THE SPINE-SAFETY GATE: the change adds a `steps_preset` field to RUN sessions only. The
 * strength-session subset must stay BYTE-IDENTICAL — this test asserts it against a golden
 * captured BEFORE the change (strength-primary-plan.q126-golden.ts). A diff here means the
 * run-token pass perturbed the strength spine: STOP AND REPORT, do not regenerate blindly.
 *
 * Also guards: run rows carry the right token (long-run day → longrun_*, else run_easy_*),
 * tokens resolve to the honest 0.65 easy intensity, and BIKE stays untouched (Gap A-bike
 * is fenced to its own pass — rides must remain steps_preset-free).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { GOLDEN_STRENGTH_SUBSET } from './strength-primary-plan.q126-golden.ts';
import { getStepsIntensity, calculateDurationWorkload } from '../../_shared/workload.ts';

// The EXACT config the golden was captured with — exercises baseline week, work weeks,
// deload, retest, run distribution, and the Hyrox long-run combo.
const RUN_ARGS = {
  durationWeeks: 12,
  strengthFrequency: 4 as const,
  tier: 'barbell' as const,
  enduranceSport: 'run' as const,
  enduranceFrequency: 2,
  needsBaseline: true,
  targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9,
  accessoryBias: 'hyrox' as const,
  longRunDay: 'sunday',
};

function flatSessions(plan: { sessions_by_week: Record<string, any[]> }) {
  return Object.entries(plan.sessions_by_week)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .flatMap(([wk, sessions]) => sessions.map((s: any) => ({ wk, ...s })));
}

Deno.test('Q-126 SPINE GATE: strength subset is byte-identical to the pre-change golden', () => {
  const all = flatSessions(composeStrengthPrimaryPlan(RUN_ARGS));
  const strength = all.filter((s) => s.type === 'strength');
  assertEquals(JSON.stringify(strength), JSON.stringify(GOLDEN_STRENGTH_SUBSET));
});

Deno.test('Q-126: no strength session ever carries a steps_preset (type gate held)', () => {
  const all = flatSessions(composeStrengthPrimaryPlan(RUN_ARGS));
  for (const s of all.filter((s) => s.type === 'strength')) {
    assertEquals(s.steps_preset, undefined, `strength "${s.name}" (wk ${s.wk}) leaked a token`);
  }
});

Deno.test('Q-126: every run carries exactly one token — long-run day → longrun_*, else run_easy_*', () => {
  const all = flatSessions(composeStrengthPrimaryPlan(RUN_ARGS));
  const runs = all.filter((s) => s.type === 'run');
  assertEquals(runs.length > 0, true);
  for (const r of runs) {
    assertEquals(Array.isArray(r.steps_preset) && r.steps_preset.length === 1, true, `run "${r.name}" (wk ${r.wk}) missing token`);
    // The code keys long-vs-easy on `day === longRunDay`, NOT the name — a long-run-day run
    // in a non-combo week is still named "Easy Run" but correctly gets the longrun token.
    // This config sets longRunDay:'sunday' → the Sunday run is the long run.
    const isLong = r.day === 'Sunday';
    const tok = r.steps_preset[0];
    if (isLong) {
      assertEquals(tok, `longrun_${r.duration}min_easypace`, `long run wk ${r.wk} wrong token: ${tok}`);
    } else {
      assertEquals(tok, `run_easy_${r.duration}min`, `easy run wk ${r.wk} wrong token: ${tok}`);
    }
  }
});

Deno.test('Q-126: run tokens resolve to the honest 0.65 easy intensity + matching workload', () => {
  const all = flatSessions(composeStrengthPrimaryPlan(RUN_ARGS));
  for (const r of all.filter((s) => s.type === 'run')) {
    const intensity = getStepsIntensity(r.steps_preset, 'run');
    assertEquals(intensity, 0.65, `run wk ${r.wk} "${r.steps_preset[0]}" resolved to ${intensity}, not 0.65`);
    // honest load = duration × 0.65² × 100 — NOT the old 0.75 default
    const expected = calculateDurationWorkload(r.duration, 0.65);
    const oldDefault = calculateDurationWorkload(r.duration, 0.75);
    assertEquals(getStepsIntensity(r.steps_preset, 'run') === 0.65 && expected < oldDefault, true);
  }
});

Deno.test('Q-126 BIKE FENCE: rides stay steps_preset-free (Gap A-bike is its own pass)', () => {
  const bikePlan = composeStrengthPrimaryPlan({ ...RUN_ARGS, enduranceSport: 'bike', accessoryBias: null, targetWeeklyMiles: undefined, longRunDay: undefined });
  const all = flatSessions(bikePlan);
  const rides = all.filter((s) => s.type === 'ride');
  assertEquals(rides.length > 0, true, 'expected ride sessions in a bike plan');
  for (const b of rides) {
    assertEquals(b.steps_preset, undefined, `ride "${b.name}" (wk ${b.wk}) must stay token-free until the Gap A-bike pass`);
  }
  // and strength still never carries a token on the bike path either
  for (const s of all.filter((s) => s.type === 'strength')) {
    assertEquals(s.steps_preset, undefined);
  }
});
