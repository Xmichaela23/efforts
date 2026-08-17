/**
 * Q-126 (Gap A) — the Strength Focus generator emits a duration-native run intensity token from
 * enduranceSession(), so run workload_planned reflects the easy/long prescription (0.65 via the
 * Gap-B matcher) instead of the 0.75 per-type default.
 *
 * Guards: run rows carry the right token (long-run day → longrun_*, else run_easy_*), tokens
 * resolve to the honest 0.65 easy intensity, strength never leaks one, and BIKE stays untouched
 * (Gap A-bike is fenced to its own pass — rides must remain steps_preset-free).
 *
 * ⚠️ THE BYTE-IDENTICAL GOLDEN IS GONE, deliberately. It pinned the ATR block's strength sessions
 * (`strength-primary-plan.q126-golden.ts`), and the 5/3/1 rewrite changes every one of them BY
 * DESIGN — a golden that must be regenerated is not a gate. What it actually protected is the
 * type fence below: the run-token pass must never touch a strength row. That is asserted directly
 * now, on the property rather than on a snapshot of the output.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { getStepsIntensity, calculateDurationWorkload } from '../../_shared/workload.ts';

const RUN_ARGS = {
  durationWeeks: 12,
  oneRepMaxes: { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 },
  fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run' as const,
  enduranceFrequency: 2,
  targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9,
  longRunDay: 'sunday',
};

function flatSessions(plan: { sessions_by_week: Record<string, any[]> }) {
  return Object.entries(plan.sessions_by_week)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .flatMap(([wk, sessions]) => sessions.map((s: any) => ({ wk, ...s })));
}

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

Deno.test('Q-126: run tokens resolve honestly — easy 0.65, and the LONG RUN 0.70', () => {
  // ⛔ THIS ASSERTED 0.65 FOR EVERY RUN INCLUDING THE LONG ONE, and passed, because
  // `longrun_easypace: 0.70` never matched any real token (see workload-run-tokens.test.ts).
  // The long run is not an easy run: it is the biggest single session of the week and the table
  // has always said 0.70. Corrected 2026-07-27.
  const all = flatSessions(composeStrengthPrimaryPlan(RUN_ARGS));
  let longRuns = 0;
  for (const r of all.filter((s) => s.type === 'run')) {
    const token = String(r.steps_preset?.[0] ?? '');
    const isLong = token.startsWith('longrun_');
    const want = isLong ? 0.70 : 0.65;
    if (isLong) longRuns++;
    const intensity = getStepsIntensity(r.steps_preset, 'run');
    assertEquals(intensity, want, `run wk ${r.wk} "${token}" resolved to ${intensity}, not ${want}`);
    // Still honest against the old silent default either way.
    assert(calculateDurationWorkload(r.duration, want) < calculateDurationWorkload(r.duration, 0.75));
  }
  assert(longRuns > 0, 'no long runs in the fixture — this test would pass vacuously');
});

Deno.test('Q-126 BIKE FENCE: rides stay steps_preset-free (Gap A-bike is its own pass)', () => {
  const bikePlan = composeStrengthPrimaryPlan({ ...RUN_ARGS, enduranceSport: 'bike', targetWeeklyMiles: undefined, longRunDay: undefined });
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
