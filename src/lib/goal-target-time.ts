/**
 * Client-side: goal row, then plan config. course-strategy uses coach predicted when the client passes it;
 * the edge function also computes the same VDOT projection server-side if omitted. Plan time is fallback/context only.
 */
export function resolveEventTargetTimeSeconds(
  goal: { target_time?: number | null },
  planConfig?: Record<string, unknown> | null,
): number | null {
  const g = goal.target_time != null ? Number(goal.target_time) : null;
  if (g != null && Number.isFinite(g) && g > 0) return g;
  const pc = planConfig ?? {};
  const tt = pc.target_time != null ? Number(pc.target_time) : null;
  if (tt != null && Number.isFinite(tt) && tt > 0) return tt;
  const mts = pc.marathon_target_seconds != null ? Number(pc.marathon_target_seconds) : null;
  if (mts != null && Number.isFinite(mts) && mts > 0) return mts;
  return null;
}
