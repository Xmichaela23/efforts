/**
 * Issue 2 — classify a thrown generate-combined-plan error into the athlete-facing
 * error contract.
 *
 * Race-week hard-fails (§8.1 chronology / §8.2 A-taper inviolable / §8.5 min-rebuild
 * — the `[race-week …]` sentinel authored in phase-structure.ts) are DETERMINISTIC,
 * athlete-ACTIONABLE configuration problems ("move the B-race earlier, drop it, or
 * pick a later A-race date"), not internal bugs. They get a stable
 * `race_week_infeasible` code + HTTP 422.
 *
 * 422 is deliberate: it stays `!resp.ok`, so create-goal-and-materialize-plan's
 * internal `invokeFunction` still throws and PROPAGATES the code — it must NOT be a
 * 200 `{success:false}` body, which the wrapper's `buildCombinedPlan` treats as a
 * silent `return null` → standalone-plan fallthrough (the actionable message would
 * be swallowed). Do not change 422 to 200/4xx-without-this-reasoning.
 *
 * Everything else is a genuine internal error: generic code + HTTP 500.
 * `e.message` (not `String(e)`) — drops the leaked `"Error: "` prefix.
 */
export function classifyCombinedPlanError(e: unknown): {
  error: string;
  error_code: 'race_week_infeasible' | 'combined_plan_internal_error';
  status: 422 | 500;
} {
  const error = e instanceof Error ? e.message : String(e);
  if (error.startsWith('[race-week')) {
    return { error, error_code: 'race_week_infeasible', status: 422 };
  }
  return { error, error_code: 'combined_plan_internal_error', status: 500 };
}
