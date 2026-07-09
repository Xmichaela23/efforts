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

import { SLICE_LOADED_ACWR_MIN } from './per-domain-load.ts';

const FACT = 'Off plan this week — planned sessions skipped.';
const FACT_PLUS_PRESCRIPTION = `${FACT} Get back on schedule before adding extra.`;
// Pin 1: attribute by the arm that fired — only claim "easy cross-training" when
// the easy_cardio slice is what's loaded; the total-only arm stays generic.
const CARRIED_EASY = 'Running behind plan — total load carried via easy cross-training.';
const CARRIED_GENERIC = 'Running behind plan — total load carried across your training.';

export function offPlanAdherenceBanner(opts: {
  /** reconciled load_status.status */
  loadStatus: string | null | undefined;
  /** run_only_week_load_pct (≤ -50 = did ≤ half the planned running) */
  runLoadPct: number | null | undefined;
  /** resolved week_intent */
  weekIntent: string;
  /** all-discipline ACWR (load_status.acwr) — the "loaded overall" signal */
  totalAcwr: number | null | undefined;
  /** easy_cardio slice ACWR (per-domain) — the "carried via easy cross-training" signal */
  easyCardioAcwr: number | null | undefined;
}): string | null {
  const { loadStatus, runLoadPct, weekIntent, totalAcwr, easyCardioAcwr } = opts;

  // D-147 firing conditions (unchanged): a real run shortfall on a normal training
  // week; excluded on intents meant to be light.
  if (!(loadStatus === 'under' || loadStatus === 'on_target')) return null;
  if (runLoadPct == null || runLoadPct > -50) return null;
  if (['recovery', 'taper', 'deload', 'peak'].includes(weekIntent)) return null;

  // Q-140 kill: is the load carried by another slice? Attribute by the arm that fired (pin 1).
  const easyLoaded = easyCardioAcwr != null && easyCardioAcwr >= SLICE_LOADED_ACWR_MIN;
  const totalLoaded = totalAcwr != null && totalAcwr >= SLICE_LOADED_ACWR_MIN;
  if (easyLoaded) return CARRIED_EASY;       // easy_cardio is the carrier — name it
  if (totalLoaded) return CARRIED_GENERIC;   // loaded overall but not via easy_cardio — stay generic

  // Nothing loaded → genuinely under-training; the prescription is correct here.
  return FACT_PLUS_PRESCRIPTION;
}
