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
    // Match Weekly exactly: computed.total_duration_seconds → sum(computed.steps.seconds) → sum(intervals.duration) → duration field
    // 1) computed total
    const comp: any = (workout as any)?.computed || {};
    const ts = Number(comp?.total_duration_seconds);
    if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));

    // 2) Sum of computed steps.seconds
    const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : [];
    if (steps.length) {
      const total = steps.reduce((a: number, st: any) => a + (Number(st?.seconds) || 0), 0);
      if (Number.isFinite(total) && total > 0) return Math.max(1, Math.round(total / 60));
    }

    // 3) Sum of intervals (stored numeric durations)
    try {
      const intervals: any[] = Array.isArray((workout as any)?.intervals) ? (workout as any).intervals : [];
      if (intervals.length) {
        const totalSec = intervals.reduce((acc: number, it: any) => {
          if (Array.isArray(it?.segments) && Number(it?.repeatCount) > 0) {
            const segSum = it.segments.reduce((s: number, sg: any) => s + (Number(sg?.duration) || 0), 0);
            return acc + segSum * Number(it.repeatCount);
          }
          const d = Number(it?.duration);
          return acc + (Number.isFinite(d) ? d : 0);
        }, 0);
        if (Number.isFinite(totalSec) && totalSec > 0) return Math.max(1, Math.round(totalSec / 60));
      }
    } catch {}

    // 4) Last resort: explicit duration minutes field
    const minsField = Number((workout as any)?.duration);
    if (Number.isFinite(minsField) && minsField > 0) return Math.max(1, Math.round(minsField));

    // If no totals anywhere, do not guess. Hide badge.
    return null;
  } catch { return null; }
}

export default resolvePlannedDurationMinutes;


