// @ts-nocheck
/**
 * D-033 / Phase 1 — run pace feedback loop (reconciler) tests.
 *
 * Pin tests for `resolveRunEasyPace` covering all 9 scenarios from
 * `docs/PHASE-1-RUN-PACE-SPEC.md` section 6, including the 3 LOAD-BEARING
 * ACWR-gate scenarios (6.7, 6.8, 6.9) that distinguish accumulated fatigue
 * from genuine fitness decline.
 *
 * The reconciler is a pure function: no DB access, no environment reads.
 * These tests assert the decision tree only; an e2e fixture in the full
 * engine path (request → buildPhaseTimeline → buildWeek) is intentionally
 * NOT included here — the reconciler engages at request handler entry
 * (`generate-combined-plan/index.ts`) and the override is in-memory on
 * `state.learned_fitness`. Engine-level coverage lives in the existing
 * Phase 0 byte-identical test (which now explicitly sets
 * `run_observed_fitness: null` to keep its assertion stable).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/run-pace-feedback.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveRunEasyPace, type ResolvedRunEasyPace } from './science.ts';
import type { RunObservedFitness } from './types.ts';

const BASELINE_360 = {
  value: 360,
  confidence: 'high' as const,
  sample_count: 12,
};

function makeObserved(
  weekly: (number | null)[],
  weeklyAcwr: (number | null)[] = [1.0, 1.0, 1.0, 1.0],
): RunObservedFitness {
  const nonNull = weekly.filter((v): v is number => typeof v === 'number');
  let median: number | null = null;
  if (nonNull.length >= 3) {
    const sorted = [...nonNull].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  return {
    median_easy_pace_sec_per_km: median,
    weekly_easy_paces_sec_per_km: weekly,
    weekly_acwr: weeklyAcwr,
    window_weeks: 4,
    efficiency_index: null,
    interval_adherence_pct: null,
    longest_run_minutes: null,
  };
}

// ── 6.1 — single anomalous week does NOT swing pace ─────────────────────────

Deno.test('6.1: single PR week (one outlier) → median within ±4% → baseline', () => {
  // newest first: matches baseline, +1.4%, -1.4%, PR week -8%
  const observed = makeObserved([360, 365, 355, 331]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

// ── 6.2 — sustained worsening engages (streak AND median both cross) ────────
// Path B (2026-05-22): both gates required. Fixture has weeks 1+2 clearly >+4%
// AND a 4-week median of +4.4% (just past the band). Either gate alone would
// not engage — see §6.10 for the streak-without-median regression pin.

Deno.test('6.2: streak AND median both cross → reconciled_worse', () => {
  // sorted [372, 374, 378, 380] → median = (374+378)/2 = 376 → +4.4% (outside band)
  // streak: 380>374.4 ✓, 378>374.4 ✓, 374 NOT >374.4 → streak = 2
  const observed = makeObserved([380, 378, 374, 372], [1.0, 1.0, 1.0, 1.0]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'reconciled_worse');
  // reconciled pace = observed median (376), not baseline
  assertEquals(r?.paceSecPerKm, 376);
  assertEquals(r?.paceSecPerKm, observed.median_easy_pace_sec_per_km);
});

// ── 6.3 — improving needs 4 consecutive weeks; 2 is not enough ──────────────

Deno.test('6.3: only 2 consecutive fast weeks → baseline (improving needs 4)', () => {
  const observed = makeObserved([340, 342, 360, 365]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

// ── 6.4 — 4 consecutive fast weeks engages reconciled_better ────────────────

Deno.test('6.4: 4 consecutive fast weeks → reconciled_better', () => {
  const observed = makeObserved([340, 340, 340, 340]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'reconciled_better');
  assertEquals(r?.paceSecPerKm, 340);
});

// ── 6.5 — low-confidence baseline + sufficient observed → observed wins ────

Deno.test('6.5: low-confidence baseline + observed → observed_no_baseline', () => {
  const lowBaseline = { value: 380, confidence: 'low' as const, sample_count: 1 };
  const observed = makeObserved([360, 360, 360, 360]);
  const r = resolveRunEasyPace(lowBaseline, observed);
  assertEquals(r?.source, 'observed_no_baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

// ── 6.6 — insufficient observed data → wrapper returns null upstream ────────
// (the reconciler still has a path: observed.median is null → treats as missing)

Deno.test('6.6a: observed has only 2 non-null weeks → median null → baseline', () => {
  // The wrapper normally returns null at <3 non-null; defensively, if it ever
  // passed through, the reconciler should still degrade safely.
  const observed = makeObserved([360, 365, null, null]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

Deno.test('6.6b: observed null entirely → baseline', () => {
  const r = resolveRunEasyPace(BASELINE_360, null);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

// ── 6.7 — LOAD-BEARING ACWR gate suppresses worsening during high load ──────
// Path B: fixture must satisfy BOTH streak AND median gates so the ACWR gate
// is the only thing preventing engagement. Uses §6.2-style fixture with
// elevated ACWR on the worsening window.

Deno.test('6.7: worsening during high-ACWR build → baseline_acwr_gated (LOAD-BEARING)', () => {
  // Streak: weeks 1+2 > 374.4 → consecutiveSlow = 2 ✓
  // Median: 376 → +4.4% outside band ✓
  // ACWR: worsening-window weeks 1.45, 1.55 → both > 1.3 → gate engages.
  const observed = makeObserved(
    [380, 378, 374, 372],
    [1.45, 1.55, 1.20, 1.10],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline_acwr_gated');
  // Plan does NOT tighten in response to fatigue the plan was designed to create.
  assertEquals(r?.paceSecPerKm, 360);
});

// ── 6.8 — worsening with normal ACWR → reconciler engages (genuine regression)
// Path B: same §6.2-style fixture (streak + median both fire) with clean ACWR.

Deno.test('6.8: worsening with normal ACWR → reconciled_worse (genuine regression)', () => {
  const observed = makeObserved(
    [380, 378, 374, 372],
    [0.95, 1.05, 1.10, 1.00],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'reconciled_worse');
  assertEquals(r?.paceSecPerKm, 376);
  assertEquals(r?.paceSecPerKm, observed.median_easy_pace_sec_per_km);
});

// ── 6.9 — improving path has NO ACWR gate; engages even at high load ────────

Deno.test('6.9: 4 fast weeks during high ACWR → reconciled_better (no gate on improving)', () => {
  const observed = makeObserved(
    [340, 342, 340, 338],
    [1.45, 1.55, 1.35, 1.40],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'reconciled_better');
  assertEquals(r?.paceSecPerKm, observed.median_easy_pace_sec_per_km);
});

// ── 6.10 — LOAD-BEARING regression pin for Path B (streak AND median required)
// This is the test that MOTIVATED the Path B amendment. A 2-week +5% streak
// at the leading edge with the rest of the window at baseline yields an in-band
// median (+2.5%). Under sane ACWR (1.0-1.2), the streak gate alone would have
// triggered engagement in the pre-Path-B implementation — but the median gate
// catches this case. Result MUST be 'baseline', not 'baseline_acwr_gated' (the
// ACWR gate is never reached because the median gate fails first).

Deno.test('6.10: 2wk streak + median in-band + good ACWR → baseline (LOAD-BEARING Path B pin)', () => {
  // Streak: weeks 1+2 both > 374.4 → consecutiveSlow = 2 ✓ (gate fires)
  // Median: sorted [358, 360, 378, 380] → (360+378)/2 = 369 → +2.5% INSIDE band ✗
  // ACWR: 1.10/1.15/1.05/1.00 → all ≤ 1.3 (would pass if it were reached)
  const observed = makeObserved(
    [380, 378, 360, 358],
    [1.10, 1.15, 1.05, 1.00],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(
    r?.source,
    'baseline',
    'Path B: median gate must reject before ACWR is even evaluated. If this returns reconciled_worse, streak-alone engagement has regressed. If this returns baseline_acwr_gated, gate ordering has regressed (ACWR should NOT be the reason — median is).',
  );
  assertEquals(r?.paceSecPerKm, 360);
});

// ── Additional unit tests on the decision tree ──────────────────────────────

Deno.test('unit: both inputs missing → null', () => {
  const r = resolveRunEasyPace(null, null);
  assertEquals(r, null);
});

Deno.test('unit: baseline only (observed null) → baseline', () => {
  const r = resolveRunEasyPace(BASELINE_360, null);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});

Deno.test('unit: low-confidence baseline + null observed → null', () => {
  // Baseline unusable, observed missing — nothing to return.
  const r = resolveRunEasyPace(
    { value: 380, confidence: 'low', sample_count: 1 },
    null,
  );
  assertEquals(r, null);
});

Deno.test('unit: baseline value zero treated as unusable', () => {
  const r = resolveRunEasyPace(
    { value: 0, confidence: 'high', sample_count: 5 },
    makeObserved([360, 360, 360, 360]),
  );
  assertEquals(r?.source, 'observed_no_baseline');
});

Deno.test('unit: sample_count=1 (below min) treated as unusable', () => {
  const r = resolveRunEasyPace(
    { value: 360, confidence: 'high', sample_count: 1 },
    makeObserved([350, 350, 350, 350]),
  );
  assertEquals(r?.source, 'observed_no_baseline');
});

Deno.test('unit: ambiguous (median outside band, but consec counts low) → baseline', () => {
  // Median is outside ±4% band, but weeks are mixed (no streak of 2 in same direction)
  const observed = makeObserved([380, 340, 360, 358]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  // Median = (358+360)/2 = 359; that's within band, so → baseline.
  assertEquals(r?.source, 'baseline');
});

Deno.test('unit: median just above band but only 1 consec slow week → baseline (case 8)', () => {
  // Week 1 slow >+4%, week 2 within band — only 1 consec; median pushed out only by week 1.
  // Median of [380, 365, 360, 358] sorted = [358, 360, 365, 380] → median = (360+365)/2 = 362.5
  // 362.5 / 360 = +0.7% within band → case 4 baseline.
  const observed = makeObserved([380, 365, 360, 358]);
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline');
});

Deno.test('unit: ACWR null in BOTH worsening weeks → baseline_acwr_gated', () => {
  // Path B: fixture must satisfy streak + median both — only then is ACWR consulted.
  const observed = makeObserved(
    [380, 378, 374, 372],
    [null, null, 1.10, 1.00],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline_acwr_gated');
});

Deno.test('unit: ACWR null in ONE worsening week + other ≤1.3 → reconciled_worse (partial-data tolerance)', () => {
  const observed = makeObserved(
    [380, 378, 374, 372],
    [null, 1.10, 1.20, 1.00],
  );
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'reconciled_worse');
});

Deno.test('unit: source enum exhaustiveness — values match type', () => {
  const sources: Array<ResolvedRunEasyPace['source']> = [
    'baseline',
    'reconciled_worse',
    'reconciled_better',
    'observed_no_baseline',
    'baseline_acwr_gated',
  ];
  // Exercise each source by constructing a fixture that hits it.
  const hit: Record<string, boolean> = {};
  hit['baseline'] =
    resolveRunEasyPace(BASELINE_360, makeObserved([360, 360, 360, 360]))?.source ===
    'baseline';
  hit['reconciled_worse'] =
    resolveRunEasyPace(BASELINE_360, makeObserved([380, 378, 374, 372]))?.source ===
    'reconciled_worse';
  hit['reconciled_better'] =
    resolveRunEasyPace(BASELINE_360, makeObserved([340, 340, 340, 340]))?.source ===
    'reconciled_better';
  hit['observed_no_baseline'] =
    resolveRunEasyPace(
      { value: 380, confidence: 'low', sample_count: 1 },
      makeObserved([360, 360, 360, 360]),
    )?.source === 'observed_no_baseline';
  hit['baseline_acwr_gated'] =
    resolveRunEasyPace(
      BASELINE_360,
      makeObserved([380, 378, 374, 372], [1.45, 1.55, 1.20, 1.10]),
    )?.source === 'baseline_acwr_gated';
  for (const s of sources) {
    assertEquals(hit[s], true, `source ${s} must be reachable`);
  }
});

Deno.test('unit: anti-volatility — single PR cannot swing reconciled pace (regression pin)', () => {
  // Spec 6.1 in stronger form: even with an extreme PR outlier, median + within-band
  // logic returns baseline. This pin would fail if the engine ever consumed the raw
  // weekly[0] value instead of the median.
  const observed = makeObserved([260, 360, 360, 360]); // week 1 is -27.8% PR
  const r = resolveRunEasyPace(BASELINE_360, observed);
  assertEquals(r?.source, 'baseline');
  assertEquals(r?.paceSecPerKm, 360);
});
