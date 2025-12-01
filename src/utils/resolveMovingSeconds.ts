// Unified resolver for moving seconds across views
// Prefers server-computed overall duration; falls back to provider seconds,
// then physics-based estimates, then minute fields converted to seconds.

export function resolveMovingSeconds(workout: any): number | null {
  try {
    const src = workout as any;
    const isPlanned = String(src?.workout_status || '').toLowerCase() === 'planned';
    
    // For planned workouts, use planned duration calculation
    if (isPlanned) {
      const comp: any = src?.computed || {};
      let secs = 0;
      // Priority 1: total_duration_seconds at root level
      const rootTs = Number(src?.total_duration_seconds);
      if (Number.isFinite(rootTs) && rootTs > 0) secs = rootTs;
      // Priority 2: computed.total_duration_seconds
      const ts = Number(comp?.total_duration_seconds);
      if (secs <= 0 && Number.isFinite(ts) && ts > 0) secs = ts;
      // Priority 3: sum of computed.steps.seconds
      if (secs <= 0 && Array.isArray(comp?.steps) && comp.steps.length > 0) {
        try {
          secs = comp.steps.reduce((a: number, s: any) => a + (Number(s?.seconds) || 0), 0);
        } catch {}
      }
      // Priority 4: sum of intervals
      if (secs <= 0 && Array.isArray(src?.intervals) && src.intervals.length > 0) {
        try {
          const sumIntervals = (arr: any[]): number => arr.reduce((acc: number, it: any) => {
            if (Array.isArray(it?.segments) && Number(it?.repeatCount) > 0) {
              const segSum = it.segments.reduce((s: number, sg: any) => s + (Number(sg?.duration) || 0), 0);
              return acc + segSum * Number(it.repeatCount);
            }
            return acc + (Number(it?.duration) || 0);
          }, 0);
          const sInt = sumIntervals(src.intervals);
          if (Number.isFinite(sInt) && sInt > 0) secs = sInt;
        } catch {}
      }
      // Priority 5: extract from steps_preset or description
      if (secs <= 0) {
        const steps: string[] = Array.isArray(src?.steps_preset) ? src.steps_preset : [];
        const txt = String(src?.description || '').toLowerCase();
        // Check steps_preset for duration patterns
        if (steps.length > 0) {
          try {
            for (const step of steps) {
              const stepStr = String(step).toLowerCase();
              const minMatch = stepStr.match(/(\d+)\s*(?:min|m|minutes?)/i);
              if (minMatch) {
                const mins = Number(minMatch[1]);
                if (Number.isFinite(mins) && mins > 0) {
                  secs = mins * 60;
                  break;
                }
              }
              const hourMatch = stepStr.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
              if (hourMatch) {
                const hours = Number(hourMatch[1]);
                if (Number.isFinite(hours) && hours > 0) {
                  secs = hours * 3600;
                  break;
                }
              }
            }
          } catch {}
        }
        // Check description for duration patterns
        if (secs <= 0 && txt) {
          try {
            const minMatch = txt.match(/(\d+)\s*(?:min|m|minutes?)/i);
            if (minMatch) {
              const mins = Number(minMatch[1]);
              if (Number.isFinite(mins) && mins > 0) secs = mins * 60;
            } else {
              const hourMatch = txt.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
              if (hourMatch) {
                const hours = Number(hourMatch[1]);
                if (Number.isFinite(hours) && hours > 0) secs = hours * 3600;
              }
            }
          } catch {}
        }
      }
      if (secs > 0) return Math.round(secs);
      return null;
    }
    
    // Ensure metrics is parsed if it arrives as a JSON string
    const METRICS = (() => {
      try {
        return typeof src?.metrics === 'string' ? JSON.parse(src.metrics) : src?.metrics;
      } catch { return src?.metrics; }
    })();

    // 0) Unified server-computed moving seconds (but skip if obviously rounded from minutes)
    try {
      const computed = Number(src?.computed?.overall?.duration_s_moving);
      if (Number.isFinite(computed) && computed > 0) {
        const movingTimeMinutes = Number(src?.moving_time);
        const isRounded = Number.isFinite(movingTimeMinutes) && computed === Math.round(movingTimeMinutes * 60);
        if (!isRounded) return Math.round(computed);
      }
    } catch {}

    // 1) Explicit seconds from provider metrics
    // Strict moving-time seconds only (do NOT include total elapsed here)
    const secCandidates = [
      Number(METRICS?.moving_time_seconds),
      Number(METRICS?.movingDurationInSeconds),
      Number(METRICS?.total_timer_time_seconds),
      Number(METRICS?.timerDurationInSeconds),
    ];
    for (const v of secCandidates) {
      if (Number.isFinite(v) && v > 0) return Math.round(v);
    }

    // 2) Derive from distance and average speed/pace; clamp to elapsed seconds when known
    const getElapsedSeconds = (): number | null => {
      const s1 = Number(METRICS?.total_elapsed_time_seconds ?? METRICS?.durationInSeconds);
      if (Number.isFinite(s1) && s1 > 0) return Math.round(s1);
      const mins = [
        Number(METRICS?.total_elapsed_time),
        Number(src?.total_elapsed_time),
        Number(src?.elapsed_time),
        Number(METRICS?.elapsed_time),
        Number(src?.duration)
      ].find((n) => Number.isFinite(n) && (n as number) > 0) as number | undefined;
      if (typeof mins === 'number') return Math.round(mins * 60);
      return null;
    };

    const getDistanceMeters = (): number | null => {
      // Prefer server-computed overall distance if present
      const cm = Number(src?.computed?.overall?.distance_m);
      if (Number.isFinite(cm) && cm > 0) return Math.round(cm);
      // Then explicit meters
      const dm = Number(src?.distance_meters ?? METRICS?.distance_meters);
      if (Number.isFinite(dm) && dm > 0) return Math.round(dm);
      // Then distance in km → meters
      const dk = Number(src?.distance);
      if (Number.isFinite(dk) && dk > 0) return Math.round(dk * 1000);
      return null;
    };

    try {
      const distM = getDistanceMeters();
      const elapsed = getElapsedSeconds();
      if (Number.isFinite(distM) && (distM as number) > 0) {
        // Prefer average speed (km/h or m/s)
        const mps = (() => {
          const vKph = Number(src?.avg_speed);
          if (Number.isFinite(vKph) && vKph > 0) return vKph / 3.6; // km/h → m/s
          return null;
        })();
        if (Number.isFinite(mps as any) && (mps as number) > 0) {
          let sec = Math.round((distM as number) / (mps as number));
          if (elapsed && sec > elapsed) sec = elapsed;
          if (sec > 0) return sec;
        }
        // Fall back to average pace (sec/km)
        const paceSecPerKm = Number(src?.avg_pace);
        if (Number.isFinite(paceSecPerKm) && paceSecPerKm > 0) {
          let sec = Math.round((distM as number) / 1000 * paceSecPerKm);
          if (elapsed && sec > elapsed) sec = elapsed;
          if (sec > 0) return sec;
        }
      }
    } catch {}

    // 3) Samples last timer if present (device timer seconds)
    try {
      const samples = Array.isArray(src?.sensor_data?.samples)
        ? src.sensor_data.samples
        : (Array.isArray(src?.sensor_data) ? src.sensor_data : []);
      if (samples && samples.length > 0) {
        const last: any = samples[samples.length - 1];
        const timer = Number(last?.timerDurationInSeconds ?? last?.timerDuration);
        if (Number.isFinite(timer) && timer > 0) return Math.round(timer);
      }
    } catch {}

    // 4) Minute fields → convert to seconds (moving/elapsed/timer minutes)
    const minuteCandidates = [
      Number(METRICS?.total_timer_time),
      Number(src?.moving_time),
      Number(METRICS?.moving_time),
      Number(src?.elapsed_time),
      Number(METRICS?.elapsed_time),
    ];
    for (const m of minuteCandidates) {
      if (Number.isFinite(m) && m > 0) return Math.round(m * 60);
    }

    // 5) Absolute last resort: overall elapsed seconds (never for swim)
    try {
      const sport = String(src?.type || '').toLowerCase();
      if (sport !== 'swim') {
        const elapsedFinal = Number(METRICS?.total_elapsed_time_seconds ?? METRICS?.durationInSeconds);
        if (Number.isFinite(elapsedFinal) && elapsedFinal > 0) return Math.round(elapsedFinal);
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}

export default resolveMovingSeconds;


