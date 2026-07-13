/**
 * Off-plan adherence banner — the D-147 "planned sessions skipped" line, extracted
 * from coach's intent_summary IIFE.
 *
 * D-263 build-step 3 (the Q-140 kill) SUPERSEDES the D-262 interim guard: instead
 * of suppressing the "add more" prescription when raw ACWR is high, the banner now
 * consults PER-DOMAIN load. When a run shortfall coincides with load genuinely
 * carried by another slice, it mints the coherent verdict ("running behind, load
 * carried via easy cross-training") — de-contradiction, not just suppression. The
 * "add more" prescription fires ONLY when nothing is loaded (`totalAcwr <
 * SLICE_LOADED_ACWR_MIN`), which is the honest under-training case.
 *
 * BIDIRECTIONAL guarantee (why D-262 could retire): add-more requires
 * `not loadCarried` ⟹ `totalAcwr < 1.0`; "rest now" requires `totalAcwr > 1.5`.
 * Mutually exclusive by construction — add-more and rest-now can never co-occur.
 *
 * THE LAW (D-260): the branch reports a fact / a composition read; it never
 * prescribes two opposite things. Root cause tracked in Q-140 (load_status is
 * run-centric); Item 2's per-domain view is what makes this coherent.
 */

import { SLICE_LOADED_ACWR_MIN, dominantAcuteSlice, type PerDomainLoad } from './per-domain-load.ts';

const FACT = 'Off plan this week — planned sessions skipped.';
const FACT_PLUS_PRESCRIPTION = `${FACT} Get back on schedule before adding extra.`;
// Attribution names the carrier when one slice holds the acute-load majority, else
// stays generic (no dominant carrier — a CORRECT read, not a fallback).
const CARRIED_EASY = 'Running behind plan — total load carried via easy cross-training.';
const CARRIED_GENERIC = 'Running behind plan — total load carried across your training.';

// D-268 Phase 2: strength-primary copy — running is NOT the plan's primary, so a run shortfall is
// not "behind plan". The banner keys on STRENGTH adherence instead.
const STRENGTH_ON_PLAN_CARRIED = 'On plan — strength on track; endurance via cross-training.';
const STRENGTH_ON_PLAN_LIGHT = 'Strength on track — room to add endurance.';
const STRENGTH_BEHIND = 'Behind on strength this week — your priority sessions.';

export function offPlanAdherenceBanner(opts: {
  /** reconciled load_status.status */
  loadStatus: string | null | undefined;
  /** run_only_week_load_pct (≤ -50 = did ≤ half the planned running) */
  runLoadPct: number | null | undefined;
  /** resolved week_intent */
  weekIntent: string;
  /** all-discipline ACWR (load_status.acwr) — the "loaded overall" gate */
  totalAcwr: number | null | undefined;
  /** per-domain slices — attribution keys on COMPOSITION (acute-load share), not
   *  per-slice ACWR (null-by-floor in prod; D-263 bs3 fix). */
  perDomain: PerDomainLoad | null | undefined;
  /** D-268 Phase 2: the plan's primary discipline. Absent/'endurance'/'hybrid'/'unknown' →
   *  the original run-centric banner (unchanged). */
  planPrimary?: string | null;
  /** D-268 Phase 2: primary-discipline (strength) adherence from computePrimaryAdherence. */
  primaryAdherence?: { discipline: string; met: boolean; note: string } | null;
}): string | null {
  const { loadStatus, runLoadPct, weekIntent, totalAcwr, perDomain, planPrimary, primaryAdherence } = opts;

  // D-147 firing conditions (unchanged): a real run shortfall on a normal training
  // week; excluded on intents meant to be light.
  if (!(loadStatus === 'under' || loadStatus === 'on_target')) return null;
  if (runLoadPct == null || runLoadPct > -50) return null;
  if (['recovery', 'taper', 'deload', 'peak'].includes(weekIntent)) return null;

  const totalLoaded = totalAcwr != null && totalAcwr >= SLICE_LOADED_ACWR_MIN;

  // ── D-268 Phase 2: strength-primary — a run shortfall is NOT "behind plan". Key on strength.
  if (planPrimary === 'strength') {
    if (primaryAdherence?.met === true) {
      return totalLoaded ? STRENGTH_ON_PLAN_CARRIED : STRENGTH_ON_PLAN_LIGHT;
    }
    return STRENGTH_BEHIND; // the genuine miss — strength is the priority, not running
  }

  // ── Endurance / hybrid / unknown: the original run-centric banner (unchanged) ──────────────────
  // Loaded overall? Total ACWR is the always-available gate (per-slice ratios are null-by-floor).
  // Not loaded → genuinely under-training; the prescription is correct.
  if (!totalLoaded) return FACT_PLUS_PRESCRIPTION;
  // Q-140 kill: loaded overall → attribute by acute-load COMPOSITION. Name the carrier only when a
  // slice holds the majority; else the generic line is correct.
  return dominantAcuteSlice(perDomain) === 'easy_cardio' ? CARRIED_EASY : CARRIED_GENERIC;
}
