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
    // Single source of truth: authoritative stored totals only (no heuristic fallbacks)
    // 1) Root stored total (materialized by Weekly)
    const rootTs = Number((workout as any)?.total_duration_seconds);
    if (Number.isFinite(rootTs) && rootTs > 0) return Math.max(1, Math.round(rootTs / 60));

    // 2) computed total
    const comp: any = (workout as any)?.computed || {};
    const ts = Number(comp?.total_duration_seconds);
    if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));

    // 3) Sum of computed steps.seconds
    const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : [];
    if (steps.length) {
      const total = steps.reduce((a: number, st: any) => a + (Number(st?.seconds) || 0), 0);
      if (Number.isFinite(total) && total > 0) return Math.max(1, Math.round(total / 60));
    }

    // If no totals anywhere, do not guess. Hide badge.
    return null;
  } catch { return null; }
}

export default resolvePlannedDurationMinutes;


