export const calculateExecutionPercentage = (plannedStep: any, executedStep: any): number | null => {
  if (!executedStep) return null;

  try {
    // Pace adherence (run/walk/swim) — normalize possible deciseconds and unit variants
    {
      // Planned pace: prefer explicit seconds-per-mile or range midpoint
      const paceRange = Array.isArray((plannedStep as any)?.pace_range) ? (plannedStep as any).pace_range : null;
      const paceMidSecPerMi = paceRange && paceRange.length === 2
        ? (() => {
            const a = Number(paceRange[0]);
            const b = Number(paceRange[1]);
            return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a + b) / 2) : null;
          })()
        : (Number((plannedStep as any)?.pace_sec_per_mi) || null);
      let plannedSecPerMeter: number | null = null;
      if (Number.isFinite(paceMidSecPerMi)) plannedSecPerMeter = (paceMidSecPerMi as number) / 1609.34;

      // Text targets like "10:30/mi", "4:40/km", "/100m", "/100yd"
      const parsePaceTextToSecPerMeter = (txt?: string | null): number | null => {
        if (!txt) return null;
        const s = String(txt).trim().toLowerCase();
        let m = s.match(/(\d{1,2}):(\d{2})\s*\/(mi|mile)/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 1609.34; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/km/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 1000; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/100m/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 100; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/100yd/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / (100 * 0.9144); }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/m/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec; }
        return null;
      };

      if (plannedSecPerMeter == null) {
        plannedSecPerMeter = parsePaceTextToSecPerMeter((plannedStep as any)?.paceTarget || (plannedStep as any)?.target_pace || (plannedStep as any)?.pace);
      }

      if (plannedSecPerMeter != null) {
        // Executed pace: prefer seconds-per-mile; normalize possible deciseconds; else derive from distance/time
        let execPaceMi = Number((executedStep as any)?.avg_pace_s_per_mi);
        if (Number.isFinite(execPaceMi) && execPaceMi > 1200) execPaceMi = execPaceMi / 10; // deciseconds → seconds
        let execSecPerMeter: number | null = null;
        if (Number.isFinite(execPaceMi) && execPaceMi > 0) execSecPerMeter = execPaceMi / 1609.34;
        if (execSecPerMeter == null) {
          const dM = Number((executedStep as any)?.distance_m);
          const tS = Number((executedStep as any)?.duration_s);
          if (Number.isFinite(dM) && dM > 0 && Number.isFinite(tS) && tS > 0) execSecPerMeter = tS / dM;
        }
        if (execSecPerMeter != null && execSecPerMeter > 0) {
          // Lower is better for pace → adherence = target/actual * 100
          return Math.round((plannedSecPerMeter / execSecPerMeter) * 100);
        }
      }
    }

    // Swim pace adherence (per 100 yards)
    // Trigger when step appears swim-related and not a drill/technique, with sufficient distance
    {
      const kindStr = String((plannedStep as any)?.type || (plannedStep as any)?.kind || (plannedStep as any)?.name || '').toLowerCase();
      const looksSwim = /swim|pool|lap|freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly/.test(kindStr) ||
                        (typeof (plannedStep as any)?.distance_yd === 'number');
      const isExcluded = /drill|technique/.test(kindStr);
      if (looksSwim && !isExcluded) {
        const mToYd = 1.09361;
        const plannedMeters = Number((plannedStep as any)?.distanceMeters ?? (plannedStep as any)?.distance_m ?? (plannedStep as any)?.m ?? (plannedStep as any)?.meters);
        const plannedYards = Number((plannedStep as any)?.distance_yd ?? (plannedStep as any)?.distance_yds ?? (Number.isFinite(plannedMeters) ? plannedMeters * mToYd : NaN));
        const plannedSec = Number((plannedStep as any)?.seconds || (plannedStep as any)?.duration || (plannedStep as any)?.duration_sec || (plannedStep as any)?.durationSeconds);

        const execMeters = Number((executedStep as any)?.distance_m);
        const execYards = Number.isFinite(execMeters) ? execMeters * mToYd : NaN;
        const execSec = Number((executedStep as any)?.duration_s);

        if (Number.isFinite(plannedYards) && plannedYards > 0 && Number.isFinite(plannedSec) && plannedSec > 0 &&
            Number.isFinite(execYards) && execYards >= 25 && Number.isFinite(execSec) && execSec > 0) {
          const plannedPacePer100 = plannedSec / (plannedYards / 100);
          const execPacePer100 = execSec / (execYards / 100);
          if (plannedPacePer100 > 0 && execPacePer100 > 0) {
            return Math.round((plannedPacePer100 / execPacePer100) * 100);
          }
        }
      }
    }

    // Power adherence (cycling)
    const powerRange = (plannedStep?.power_range || plannedStep?.powerRange) as { lower?: number; upper?: number } | undefined;
    const lower = Number(powerRange?.lower);
    const upper = Number(powerRange?.upper);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower > 0 && upper > 0) {
      const targetMidpoint = (lower + upper) / 2;
      const executedWatts = Number((executedStep as any)?.avg_power_w || (executedStep as any)?.avg_watts || (executedStep as any)?.power);
      if (Number.isFinite(executedWatts) && executedWatts > 0 && targetMidpoint > 0) {
        const percentage = Math.round((executedWatts / targetMidpoint) * 100);
        console.log(`🔍 [ADHERENCE DEBUG] Power: ${executedWatts}W vs ${lower}-${upper}W (midpoint: ${targetMidpoint}W) = ${percentage}%`);
        return percentage;
      }
    }

    // Duration adherence
    const plannedDuration = Number((plannedStep as any)?.seconds || (plannedStep as any)?.duration || (plannedStep as any)?.duration_sec || (plannedStep as any)?.durationSeconds);
    const executedDuration = Number((executedStep as any)?.duration_s);
    if (Number.isFinite(plannedDuration) && plannedDuration > 0 && Number.isFinite(executedDuration) && executedDuration > 0) {
      return Math.round((executedDuration / plannedDuration) * 100);
    }

    // Distance adherence
    const plannedDistance = Number((plannedStep as any)?.distanceMeters || (plannedStep as any)?.distance_m || (plannedStep as any)?.m || (plannedStep as any)?.meters);
    const executedDistance = Number((executedStep as any)?.distance_m);
    if (Number.isFinite(plannedDistance) && plannedDistance > 0 && Number.isFinite(executedDistance) && executedDistance > 0) {
      return Math.round((executedDistance / plannedDistance) * 100);
    }
  } catch {}

  return null;
};


