/**
 * Off-plan adherence banner — the D-147 "planned sessions skipped" line, extracted
 * from coach's intent_summary IIFE so the D-262 coherence guard is testable.
 *
 * D-262 (coherence guard, NOT week-tuning): the banner may STATE THE FACT ("planned
 * sessions skipped"), but the PRESCRIPTION ("get back on schedule before adding
 * extra") must not fire while the load reads high — the app cannot tell you to
 * "add more" and "rest now" in the same breath. THE LAW: the off-plan branch reports
 * a fact; only the reconciler prescribes, and it can't prescribe two opposite things.
 *
 * The guard encodes NOTHING about WHY sessions were swapped (the app doesn't know
 * your rationale and shouldn't) — it only forbids the self-contradiction. One
 * condition (`totalAcwr >= 1.3`), mirroring the existing D-147 ACWR gate. Survives
 * Item 2 (per-domain load replaces composition reasoning, not the don't-contradict
 * rule), so it doesn't violate the Q-137 build-twice precedent.
 *
 * Root cause (Q-140): load_status is run-centric, so a deliberate discipline
 * substitution reads as BOTH overload (all-discipline gauge) and deficit (run-only
 * plan comparison) — the false-under mirror of D-259's false-over. Item 2 closes it.
 */

const FACT = 'Off plan this week — planned sessions skipped.';
const FACT_PLUS_PRESCRIPTION = `${FACT} Get back on schedule before adding extra.`;

/**
 * Returns the off-plan adherence banner string, or null when the branch does not
 * apply. Same firing conditions as the original inline branch (D-147); the only
 * change is the D-262 guard that drops the prescription clause when load is high.
 */
export function offPlanAdherenceBanner(opts: {
  /** reconciled load_status.status */
  loadStatus: string | null | undefined;
  /** run_only_week_load_pct (≤ -50 = did ≤ half the planned running) */
  runLoadPct: number | null | undefined;
  /** resolved week_intent */
  weekIntent: string;
  /** all-discipline ACWR (load_status.acwr) — the coherence signal */
  totalAcwr: number | null | undefined;
}): string | null {
  const { loadStatus, runLoadPct, weekIntent, totalAcwr } = opts;

  // D-147 firing conditions (unchanged): only a genuine run shortfall on a normal
  // training week with no overload signal; excluded on intents meant to be light.
  if (!(loadStatus === 'under' || loadStatus === 'on_target')) return null;
  if (runLoadPct == null || runLoadPct > -50) return null;
  if (['recovery', 'taper', 'deload', 'peak'].includes(weekIntent)) return null;

  // D-262 coherence guard: high total load → state the fact, drop the "add more"
  // prescription (can't say "add more" while the load reading says "rest now").
  if (totalAcwr != null && totalAcwr >= 1.3) return FACT;
  return FACT_PLUS_PRESCRIPTION;
}
