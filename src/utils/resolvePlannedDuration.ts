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

    // 1) computed total
    try {
      const ts = Number((workout as any)?.computed?.total_duration_seconds);
      if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));
    } catch {}

    // 2) sum of computed steps
    try {
      const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
      if (steps.length) {
        const pickSeconds = (st: any): number => {
          const candidates = [
            st?.seconds,
            st?.duration_s,
            st?.duration,
            st?.duration_sec,
            st?.durationSeconds,
            st?.timeSeconds,
            st?.time_sec
          ];
          for (const v of candidates) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
          return 0;
        };
        const total = steps.reduce((a: number, st: any) => a + pickSeconds(st), 0);
        if (Number.isFinite(total) && total > 0) return Math.max(1, Math.round(total / 60));
      }
    } catch {}

    // 3) intervals sum
    try {
      const intervals: any[] = Array.isArray((workout as any)?.intervals) ? (workout as any).intervals : [];
      if (intervals.length) {
        const sumIntervals = (arr: any[]): number => arr.reduce((acc: number, it: any) => {
          // Nested segments with repeatCount
          if (Array.isArray(it?.segments) && Number(it?.repeatCount) > 0) {
            const segSum = it.segments.reduce((s: number, sg: any) => s + (Number(sg?.duration) || 0), 0);
            return acc + segSum * Number(it.repeatCount);
          }
          const d = Number(it?.duration);
          return acc + (Number.isFinite(d) ? d : 0);
        }, 0);
        const totalSec = sumIntervals(intervals);
        if (Number.isFinite(totalSec) && totalSec > 0) return Math.max(1, Math.round(totalSec / 60));
      }
    } catch {}

    // 4) root total seconds
    try {
      const ts = Number((workout as any)?.total_duration_seconds);
      if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));
    } catch {}

    // 5) stored minutes
    try {
      const mins = Number((workout as any)?.duration);
      if (Number.isFinite(mins) && mins > 0) return Math.max(1, Math.round(mins));
    } catch {}

    return null;
  } catch { return null; }
}

export default resolvePlannedDurationMinutes;


