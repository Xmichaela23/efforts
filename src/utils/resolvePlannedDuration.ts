// Lightweight resolver for planned workout duration (minutes)
// Priority:
// 1) computed.total_duration_seconds
// 2) sum(computed.steps[].seconds | common time fields)
// 3) sum(intervals[].duration and nested segments)
// 4) total_duration_seconds field on root
// 5) duration (already minutes)

export function resolvePlannedDurationMinutes(workout: any): number | null {
  try {
    if (!workout) return null;
    // Single source of truth: authoritative stored total only (no fallbacks)
    // Root stored total (materialized by Weekly)
    const rootTs = Number((workout as any)?.total_duration_seconds);
    if (Number.isFinite(rootTs) && rootTs > 0) return Math.max(1, Math.round(rootTs / 60));

    // If no totals anywhere, do not guess. Hide badge.
    return null;
  } catch { return null; }
}

export default resolvePlannedDurationMinutes;


