// THE QUALITY SESSION CONSTRUCTOR — what the 61-shape sweep CANNOT reach.
//
// ⛔ READ THIS BEFORE ADDING A CASE HERE. The sweep (`scripts/dump-plans.ts`) is the primary gate
// and it is stronger than any of these tests: it re-expands every token through the REAL
// `materialize-plan` expander across 61 shapes × 12 weeks and asserts the stated duration equals
// what production will compute. Anything the sweep already covers does not belong in this file —
// a second assertion of a covered fact is the doubled disease in miniature.
//
// ⛔ WHAT THE SWEEP CANNOT REACH, AND WHY EACH CASE IS HERE:
//
//   THE FLOOR. No session the composer can currently emit has less than 10 minutes of allowance
//   left after its core, so the floor NEVER FIRES on any of the 61 shapes. It is the safety half of
//   the whole stage — *"a week whose budget is eaten by the long day still can't prescribe a bare
//   maximal sprint"* — and it is entirely untested by the gate. Synthetic cores are the only way to
//   reach it.
//
//   THE CEILING and THE FRACTIONAL ROUNDING are reachable in principle but only on specific weeks
//   of specific shapes; pinned directly so a future retune fails here rather than in a diff nobody
//   reads.
//
// ⚠️ MUTATION-TESTED 2026-08-20, every case, before being believed. Two of three test files written
// on 2026-08-19 passed with the code deleted.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/quality-session.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../_shared/state-trend/week-accent.ts';
import {
  type QualityCore,
  WARMUP_CEILING_MIN,
  WARMUP_FLOOR_MIN,
  qualityBudgetMinutes,
  wrapQualitySession,
  wrapperNote,
} from './quality-session.ts';

const core = (workSeconds: number, selfWrapped = false): QualityCore =>
  ({ tokens: ['work_token'], workSeconds, selfWrapped });

// ── §1 THE FLOOR — the safety half, and the sweep cannot reach it ─────────────────────────────

Deno.test('⛔ a core that eats its whole allowance STILL gets the full warm-up', () => {
  // 40 minutes of work against a 45-minute allowance leaves 5 — half the floor.
  const w = wrapQualitySession(core(40 * 60), 45, 'run');
  assertEquals(w.warmupMinutes, WARMUP_FLOOR_MIN, 'the warm-up was shortened to fit the allowance');
  assertEquals(w.fields.steps_preset[0], `warmup_run_${WARMUP_FLOOR_MIN}min_easy`);
});

Deno.test('⛔ the floor OUTRANKS the allowance — the session goes over, the warm-up does not go under', () => {
  const w = wrapQualitySession(core(40 * 60), 45, 'run');
  // 40 min of work + a 10 min floor = 50, which is 5 past the allowance. That is the intended
  // direction: the hard session is paid first and the easy volume flexes around it (Hickson).
  assertEquals(w.fields.duration, 50);
  assertEquals(w.budgetMinutes, 50, 'the budget must subtract what was actually built');
});

Deno.test('⛔ a core LONGER than its whole allowance still cannot be prescribed bare', () => {
  // The pathological input the work order asks about: nothing left at all, and then some.
  const w = wrapQualitySession(core(60 * 60), 35, 'run');
  assertEquals(w.warmupMinutes, WARMUP_FLOOR_MIN);
  assertEquals(w.fields.duration, 70);
  assertEquals(w.fields.steps_preset[0].startsWith('warmup_'), true);
});

Deno.test('a floored wrapper emits NO cool-down token rather than a zero-minute one', () => {
  const w = wrapQualitySession(core(40 * 60), 45, 'run');
  assertEquals(w.cooldownMinutes, 0);
  // ⛔ `cooldown_run_0min_easy` PARSES — the expander's regex takes any integer — and would reach
  // the watch as a zero-second step, which is the same species of error as the one-second
  // lap-button rest that `hills-lap-button.test.ts` exists to prevent.
  assertEquals(w.fields.steps_preset.some((t) => /_0min/.test(t)), false);
  assertEquals(w.fields.steps_preset.length, 2, 'expected warm-up + work only');
});

// ── §2 THE SPENT ALLOWANCE — the leak this stage closed ──────────────────────────────────────

Deno.test('⛔ the leftover allowance becomes the wrapper, so budgeted EQUALS built', () => {
  // The threshold ride's week 1: 4 × 5 min with 1 min after every rep = 24 min, allowance 45.
  const w = wrapQualitySession(core(24 * 60), 45, 'bike');
  assertEquals(w.fields.duration, 45, 'the allowance was not fully spent');
  assertEquals(w.budgetMinutes, w.fields.duration, 'the budget and the build disagree');
  assertEquals(w.warmupMinutes + w.cooldownMinutes, 21, 'the 21 leaked minutes are the wrapper');
  assertEquals(w.fields.steps_preset, ['warmup_bike_11min', 'work_token', 'cooldown_bike_10min']);
});

Deno.test('⛔ fractional work seconds do not drift — the sprint session lands on its allowance', () => {
  // `run_sprint_6x12s_r150s` is 822 seconds — 13.7 minutes, not 14.
  const w = wrapQualitySession(core(822), 35, 'run');
  assertEquals(w.fields.duration, 35);
  assertEquals(w.warmupMinutes, 11);
  assertEquals(w.cooldownMinutes, 10);
});

Deno.test('⛔ the leftover is ROUNDED, not floored — the anchor sprint is the case that shows it', () => {
  // ⚠️ THE LEADER WEEK ABOVE CANNOT CATCH THIS AND I SHIPPED THAT MISTAKE FIRST. Its leftover is
  // 21.3 minutes, where `floor` and `round` agree, so a floored implementation passed it. The
  // ANCHOR sprint — 4 × 12 s with 150 s walks = 498 s — leaves 26.7, where they do not: rounding
  // lands the session on 35, flooring lands it on 34 and quietly hands a minute back.
  const w = wrapQualitySession(core(498), 35, 'run');
  assertEquals(w.fields.duration, 35);
  assertEquals(w.warmupMinutes, 14);
  assertEquals(w.cooldownMinutes, 13);
});

Deno.test('the warm-up takes the larger half of an odd leftover', () => {
  // 22 minutes left over splits 11/11; 21 splits 11/10 — the extra minute goes to the half with
  // the injury claim under it, not to the cool-down.
  assertEquals(wrapQualitySession(core(24 * 60), 45, 'run').warmupMinutes, 11);
  assertEquals(wrapQualitySession(core(24 * 60), 45, 'run').cooldownMinutes, 10);
});

// ── §3 THE CEILING ───────────────────────────────────────────────────────────────────────────

Deno.test('a very short core does not buy a half-hour warm-up — the cool-down absorbs it', () => {
  // 10 min of work against a 45 min allowance leaves 35. Half of that is 18, past the ceiling.
  const w = wrapQualitySession(core(10 * 60), 45, 'bike');
  assertEquals(w.warmupMinutes, WARMUP_CEILING_MIN);
  assertEquals(w.cooldownMinutes, 35 - WARMUP_CEILING_MIN);
  assertEquals(w.fields.duration, 45, 'the allowance is still spent exactly');
});

// ── §4 SELF-WRAPPED CORES — the hill family ──────────────────────────────────────────────────

Deno.test('⛔ a self-wrapped core gets NO added tokens — the hill family would otherwise warm up twice', () => {
  const w = wrapQualitySession(core(32 * 60, true), 35, 'run');
  assertEquals(w.fields.steps_preset, ['work_token']);
  assertEquals(w.selfWrapped, true);
});

Deno.test('⛔ a self-wrapped core states its CLOCKED length, not its allowance', () => {
  // This is the anchor-week defect: `HILL_SESSION_MIN` said 35 on every week of twelve while the
  // anchor's halved rep count comes to 27. The card must say what the clock will say.
  const w = wrapQualitySession(core(27 * 60, true), 35, 'run');
  assertEquals(w.fields.duration, 27);
  // ⚠️ The BUDGET still reserves the allowance — over-subtracting on three weeks of twelve is the
  // safe direction, and it is what covers the lap-button descents the clock cannot hold.
  assertEquals(w.budgetMinutes, 35);
});

// ── §5 THE BUDGET ACROSS A WAVE ──────────────────────────────────────────────────────────────

Deno.test('⛔ the block budget takes the LARGEST week of the wave, not week 1', () => {
  // Under-subtracting hands the difference back as easy volume every week — the +3.5 mi defect
  // this composer has already fixed twice.
  const cores = [core(24 * 60), core(40 * 60), core(26 * 60)];
  assertEquals(qualityBudgetMinutes(cores, 45, 'bike'), 50);
});

Deno.test('a wave that never trips the floor budgets exactly the allowance', () => {
  const cores = [core(24 * 60), core(27 * 60), core(26 * 60)];
  assertEquals(qualityBudgetMinutes(cores, 45, 'bike'), 45);
});

// ── §6 THE COPY ──────────────────────────────────────────────────────────────────────────────

Deno.test('the card states the wrapper it was given', () => {
  const w = wrapQualitySession(core(24 * 60), 45, 'bike');
  assertEquals(wrapperNote(w), ' The 45 minutes include 11 min easy before the work and 10 after.');
});

Deno.test('a floored session says only what it has', () => {
  const w = wrapQualitySession(core(40 * 60), 45, 'run');
  assertEquals(wrapperNote(w), ' The 50 minutes include 10 min easy before the work.');
});

Deno.test('⛔ a self-wrapped session says NOTHING — its wrapper is inside its token', () => {
  // Claiming a bracket this file did not add would be a number without provenance, and the hill
  // family's copy has never mentioned one.
  assertEquals(wrapperNote(wrapQualitySession(core(32 * 60, true), 35, 'run')), '');
});

Deno.test('the wrapper copy passes the voice lint', () => {
  // ⚠️ NECESSARY, NOT SUFFICIENT — the banned list is finite and idiom has to be caught by reading
  // (`strength-focus-copy.voice.test.ts` says so at length). It catches the cheap failures: praise,
  // filler, and IMPERATIVES. "Warm up properly" would fail here; "the session includes it" does not.
  for (const w of [
    wrapQualitySession(core(24 * 60), 45, 'bike'),
    wrapQualitySession(core(40 * 60), 45, 'run'),
  ]) {
    assertEquals(voiceViolation(wrapperNote(w).trim()), null, wrapperNote(w));
  }
});
