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

    // Only trust Weekly’s stored compute. Do NOT fabricate.
    const comp: any = (workout as any)?.computed || {};
    const tsA = Number(comp?.total_duration_seconds);
    const tsB = Number(comp?.total_seconds);
    const ts = Number.isFinite(tsA) && tsA > 0 ? tsA : (Number.isFinite(tsB) && tsB > 0 ? tsB : NaN);
    if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));

    // Optionally accept sum of computed steps.seconds (still from Weekly compute)
    const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : [];
    if (steps.length) {
      const total = steps.reduce((a: number, st: any) => a + (Number(st?.seconds) || 0), 0);
      if (Number.isFinite(total) && total > 0) return Math.max(1, Math.round(total / 60));
    }

    // If no computed totals, do not guess. Hide badge.
    return null;
  } catch { return null; }
}

export default resolvePlannedDurationMinutes;


