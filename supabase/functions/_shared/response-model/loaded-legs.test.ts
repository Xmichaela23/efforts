/**
 * D-232 surgical loaded-legs diagnosis — label + Why + suggestion per branch.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/loaded-legs.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLoadedLegsDiagnosis, classifyFatigueLabel, readinessForLoadVerdict } from './loaded-legs.ts';

const LL = { label: 'LEGS LOADED' as const, why: '', suggestion: '' };
const SORE = { label: 'LEGS SORE' as const, why: '', suggestion: '' };

// ── label rule — the case-6 amendment: unattributed effort-up is EFFORT UP, NOT FATIGUED ──────────
Deno.test('label: cross-domain lower-body → LEGS LOADED', () => {
  assertEquals(classifyFatigueLabel({ loadedLegs: LL, systemic: false }), 'LEGS LOADED');
});
Deno.test('label: declared soreness → LEGS SORE', () => {
  assertEquals(classifyFatigueLabel({ loadedLegs: SORE, systemic: false }), 'LEGS SORE');
});
Deno.test('label: systemic (no attribution) → FATIGUED', () => {
  assertEquals(classifyFatigueLabel({ loadedLegs: null, systemic: true }), 'FATIGUED');
});
Deno.test('label[case 6]: unattributed effort-up, balanced load → EFFORT UP (never FATIGUED)', () => {
  assertEquals(classifyFatigueLabel({ loadedLegs: null, systemic: false }), 'EFFORT UP');
});

// ── D-416: readiness the LOAD path consumes — a non-systemic `fatigued` never relabels the load ──────
// The flagged cascade: one +0.7 RPE bump → raw readiness 'fatigued' (single signal) → chip refines to
// EFFORT UP, but the raw value used to reach the reconciler + accent and print "a bit high" / "needs
// absorbing". The load path now reads this refined value, so those never fire off a lone soft signal.
Deno.test('load-readiness: EFFORT UP (single signal) → downgraded to normal — the flagged case', () => {
  assertEquals(readinessForLoadVerdict('fatigued', 'EFFORT UP'), 'normal');
});
Deno.test('load-readiness: LEGS LOADED (localized) → normal (not systemic)', () => {
  assertEquals(readinessForLoadVerdict('fatigued', 'LEGS LOADED'), 'normal');
});
Deno.test('load-readiness: LEGS SORE (declared, localized) → normal (soreness lives on BODY, not LOAD)', () => {
  assertEquals(readinessForLoadVerdict('fatigued', 'LEGS SORE'), 'normal');
});
Deno.test('load-readiness: systemic FATIGUED → stays fatigued (still raises load)', () => {
  assertEquals(readinessForLoadVerdict('fatigued', 'FATIGUED'), 'fatigued');
});
Deno.test('load-readiness: overreached → untouched (genuine threshold, still raises)', () => {
  assertEquals(readinessForLoadVerdict('overreached', null), 'overreached');
});
Deno.test('load-readiness: normal/fresh/adapting/detrained → untouched', () => {
  assertEquals(readinessForLoadVerdict('normal', null), 'normal');
  assertEquals(readinessForLoadVerdict('fresh', null), 'fresh');
  assertEquals(readinessForLoadVerdict('adapting', null), 'adapting');
  assertEquals(readinessForLoadVerdict('detrained', null), 'detrained');
});

const BASE = {
  dayName: 'Monday', sessionRpe: 9, effortCurrent: 5.3, effortBaseline: 4.4,
  loadLabel: 'load balanced', athleteReportedSoreness: false,
};

// ── 1. Novel movement, plan starts soon (Michael's exact target strings) ──────────────────────────
Deno.test('novel + plan-start: names the movement, plan-aware suggestion', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, movement: 'lunges', isNovel: true, planEvent: "Monday's opener" });
  assertEquals(d.label, 'LEGS LOADED');
  assertEquals(d.why, "Why: Monday's lower-body work — lunges (not in your recent training), RPE 9 — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic");
  assertEquals(d.suggestion, "Expect this to ease over 2–3 days — new movements hit hardest the first time. Fine to keep rides/runs easy until it clears; you'll be fresh for Monday's opener.");
});

// ── 2. Novel movement, no imminent plan event ─────────────────────────────────────────────────────
Deno.test('novel + no plan event: generic ease-over-2-3-days suggestion', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, movement: 'lunges', isNovel: true, planEvent: null });
  assertEquals(d.label, 'LEGS LOADED');
  assertEquals(d.why, "Why: Monday's lower-body work — lunges (not in your recent training), RPE 9 — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic");
  assertEquals(d.suggestion, 'Expect this to ease over 2–3 days — easy movement helps more than rest.');
});

// ── 3. Non-novel lower-body ───────────────────────────────────────────────────────────────────────
Deno.test('non-novel: no movement clause, normal-loading suggestion', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, movement: 'squats', isNovel: false, planEvent: null });
  assertEquals(d.label, 'LEGS LOADED');
  assertEquals(d.why, "Why: Monday's lower-body work — RPE 9 — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic");
  assertEquals(d.suggestion, 'Normal loading response — keep efforts easy if legs still feel heavy.');
});

// ── 4. Athlete-reported soreness → LEGS SORE (state language, declared truth) ──────────────────────
Deno.test('athlete-reported soreness: LEGS SORE label, soreness-specific suggestion', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, movement: 'lunges', isNovel: true, planEvent: null, athleteReportedSoreness: true });
  assertEquals(d.label, 'LEGS SORE');
  assertEquals(d.why, "Why: Monday's lower-body work (RPE 9) — you reported sore legs, efforts since feeling harder (5.3 vs 4.4) · load balanced");
  assertEquals(d.suggestion, 'Soreness like this typically eases in 2–3 days — easy movement helps more than rest.');
});
Deno.test('athlete-reported soreness + plan-start: appends the plan clause', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, movement: 'lunges', isNovel: true, planEvent: "Monday's opener", athleteReportedSoreness: true });
  assertEquals(d.suggestion, "Soreness like this typically eases in 2–3 days — easy movement helps more than rest. You'll be fresh for Monday's opener.");
});

// ── edge: missing RPE (no fabricated number) ──────────────────────────────────────────────────────
Deno.test('missing session RPE: omit the RPE clause, keep the rest', () => {
  const d = buildLoadedLegsDiagnosis({ ...BASE, sessionRpe: null, movement: 'lunges', isNovel: true, planEvent: null });
  assertEquals(d.why, "Why: Monday's lower-body work — lunges (not in your recent training) — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic");
});
