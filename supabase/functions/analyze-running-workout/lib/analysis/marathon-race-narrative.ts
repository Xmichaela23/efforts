/**
 * Marathon goal-race debrief: coaching-grade analysis from per-mile splits, terrain, and conditions.
 * Interprets data — does not restate what the runner already sees on their watch.
 */

import type { GoalRaceCompletionMatch } from '../../../_shared/goal-race-completion.ts';
import { collectSuspectStopMiles } from '../../../_shared/race-debrief.ts';

type MileSplit = {
  mile: number;
  pace_s_per_mi: number;
  avg_hr_bpm?: number | null;
  grade_percent?: number | null;
  terrain_type?: string | null;
  elevation_gain_m?: number | null;
  start_elevation_m?: number | null;
  end_elevation_m?: number | null;
};

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function fmtClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function avgOf(vals: (number | null | undefined)[]): number | null {
  const clean = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function avgPaceForMiles(splits: MileSplit[], from: number, to: number): number | null {
  const slice = splits.filter((x) => x.mile >= from && x.mile <= to);
  return avgOf(slice.map((x) => x.pace_s_per_mi));
}

/** Build the pacing execution story from per-mile splits. Returns a coaching-grade interpretation. */
function buildPacingInsight(sorted: MileSplit[], goalPaceSec: number | null): string {
  if (sorted.length < 4) return '';

  const n = sorted.length;
  const totalAvg = avgOf(sorted.map((s) => s.pace_s_per_mi));
  if (!totalAvg) return '';

  const halfIdx = Math.floor(n / 2);
  const p1 = avgPaceForMiles(sorted, sorted[0].mile, sorted[halfIdx - 1].mile);
  const p2 = avgPaceForMiles(sorted, sorted[halfIdx].mile, sorted[n - 1].mile);

  // Fastest and slowest miles (excluding obvious outlier short last mile)
  const fullMiles = sorted.filter((s) => s.pace_s_per_mi > 300 && s.pace_s_per_mi < 1800);
  const fastest = fullMiles.length ? fullMiles.reduce((a, b) => (b.pace_s_per_mi < a.pace_s_per_mi ? b : a)) : null;

  const parts: string[] = [];

  // Execution pattern
  if (p1 != null && p2 != null) {
    const delta = p1 - p2; // positive = negative split (ran faster second half)
    if (delta > 60) {
      parts.push(`Significant negative split — second half ${fmtPace(p2)} vs first ${fmtPace(p1)} (${Math.round(delta)}s/mi faster). Strong controlled execution or late-course descent benefit.`);
    } else if (delta > 15) {
      parts.push(`Slight negative split — second half ${fmtPace(p2)} vs first ${fmtPace(p1)} (${Math.round(delta)}s/mi). Clean pacing arc.`);
    } else if (delta > -15) {
      parts.push(`Even split — first ${fmtPace(p1 ?? 0)} · second ${fmtPace(p2 ?? 0)}. Consistent output throughout.`);
    } else {
      parts.push(`Positive split — second half ${fmtPace(p2)} vs first ${fmtPace(p1)} (${Math.round(Math.abs(delta))}s/mi slower). Fade in the back half.`);
    }
  }

  // Goal pace context
  if (goalPaceSec != null && totalAvg != null) {
    const diff = totalAvg - goalPaceSec;
    if (Math.abs(diff) <= 10) {
      parts.push(`Avg pace ${fmtPace(totalAvg)} — on goal pace.`);
    } else if (diff > 10) {
      parts.push(`Avg pace ${fmtPace(totalAvg)} — ${Math.round(diff)}s/mi slower than goal (${fmtPace(goalPaceSec)}).`);
    } else {
      parts.push(`Avg pace ${fmtPace(totalAvg)} — ${Math.round(Math.abs(diff))}s/mi ahead of goal (${fmtPace(goalPaceSec)}).`);
    }
  }

  // Fastest mile context
  if (fastest) {
    const terrainNote = fastest.grade_percent != null && fastest.grade_percent < -0.8
      ? ` (${Math.abs(Math.round(fastest.grade_percent * 10) / 10)}% downhill)`
      : fastest.grade_percent != null && fastest.grade_percent > 0.8
        ? ` (into a ${Math.round(fastest.grade_percent * 10) / 10}% climb — notable effort)`
        : '';
    parts.push(`Fastest mile: ${fastest.mile} at ${fmtPace(fastest.pace_s_per_mi)}${terrainNote}.`);
  }

  // Terrain response: do uphills / downhills correspond to pace changes?
  const uphillMiles = sorted.filter((s) => (s.grade_percent ?? 0) > 0.8);
  const downhillMiles = sorted.filter((s) => (s.grade_percent ?? 0) < -0.8);
  if (uphillMiles.length >= 2 && downhillMiles.length >= 2) {
    const uphillAvg = avgOf(uphillMiles.map((s) => s.pace_s_per_mi));
    const downhillAvg = avgOf(downhillMiles.map((s) => s.pace_s_per_mi));
    if (uphillAvg && downhillAvg && uphillAvg - downhillAvg > 60) {
      const hillNames = uphillMiles.slice(0, 3).map((s) => `mi ${s.mile}`).join(', ');
      parts.push(`Terrain response: climbs (${hillNames}) averaged ${fmtPace(uphillAvg)}, descents ${fmtPace(downhillAvg)} — ${Math.round(uphillAvg - downhillAvg)}s/mi differential.`);
    }
  } else if (downhillMiles.length >= 3) {
    const downhillAvg = avgOf(downhillMiles.map((s) => s.pace_s_per_mi));
    if (downhillAvg && totalAvg && totalAvg - downhillAvg > 45) {
      parts.push(`Net-downhill course — descent miles averaged ${fmtPace(downhillAvg)} vs overall ${fmtPace(totalAvg)}.`);
    }
  }

  return parts.join(' ');
}

/** Interpret HR arc relative to duration, conditions, and per-mile terrain. */
function buildHrInsight(args: {
  sorted: MileSplit[];
  earlyHr: number | null;
  lateHr: number | null;
  driftBpm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  durationMinutes: number | null;
  weatherTempStartF: number | null;
  weatherTempEndF: number | null;
  weatherTempRise: number | null;
}): string {
  const { sorted, earlyHr, lateHr, avgHr, maxHr, durationMinutes, weatherTempStartF, weatherTempEndF, weatherTempRise } = args;
  const e = earlyHr != null ? Math.round(earlyHr) : null;
  const l = lateHr != null ? Math.round(lateHr) : null;
  const a = avgHr != null ? Math.round(avgHr) : null;

  const parts: string[] = [];

  // Per-mile HR arc — find where drift accelerated
  const hrMiles = sorted.filter((s) => s.avg_hr_bpm != null && s.avg_hr_bpm > 40);
  const m1Hr = hrMiles.length ? Math.round(hrMiles[0].avg_hr_bpm!) : e;
  const mLastHr = hrMiles.length ? Math.round(hrMiles[hrMiles.length - 1].avg_hr_bpm!) : l;

  if (m1Hr != null && mLastHr != null) {
    const totalDrift = mLastHr - m1Hr;

    // Use actual temp window to partition HR drift: heat load vs effort accumulation
    // ~0.8 bpm per °F of temp rise; additional ~0.15 bpm per °F above 60°F (baseline heat stress)
    let heatBpm: number | null = null;
    const hasRealTempWindow = weatherTempStartF != null && weatherTempEndF != null;
    if (hasRealTempWindow) {
      const rise = weatherTempRise ?? (weatherTempEndF! - weatherTempStartF!);
      const avgTemp = (weatherTempStartF! + weatherTempEndF!) / 2;
      const riseContrib = rise > 2 ? rise * 0.8 : 0;
      const heatStressContrib = avgTemp > 60 ? (avgTemp - 60) * 0.15 : 0;
      heatBpm = Math.round(riseContrib + heatStressContrib);
    } else if (weatherTempStartF != null && weatherTempStartF > 62) {
      heatBpm = Math.round((weatherTempStartF - 62) * 0.3);
    }

    const effortDrift = heatBpm != null && heatBpm > 0 ? Math.max(0, totalDrift - heatBpm) : totalDrift;

    const tempContext = hasRealTempWindow
      ? `${Math.round(weatherTempStartF!)}→${Math.round(weatherTempEndF!)}°F`
      : weatherTempStartF != null ? `${Math.round(weatherTempStartF)}°F` : null;

    if (heatBpm != null && heatBpm > 3 && tempContext) {
      parts.push(
        `HR mile 1 ~${m1Hr} → final miles ~${mLastHr} bpm (+${totalDrift} bpm). ` +
          `${tempContext} across the race: ~${heatBpm} bpm from heat load, ~${effortDrift} bpm from effort accumulation.`,
      );
    } else {
      parts.push(`HR mile 1 ~${m1Hr} → final miles ~${mLastHr} bpm (+${totalDrift} bpm).`);
    }

    const alreadyHeatPartitioned = heatBpm != null && heatBpm > 3 && tempContext;

    if (totalDrift <= 15 && durationMinutes != null && durationMinutes > 200) {
      parts.push(`Minimal drift for a marathon — efficient cardiac response at this pace and temperature.`);
    } else if (totalDrift <= 25) {
      parts.push(`Normal decoupling arc for 26.2. No late-race spike.`);
    } else if (totalDrift <= 35) {
      const heatEcho =
        !alreadyHeatPartitioned && heatBpm != null && heatBpm > 5 ? ` ~${heatBpm} bpm from heat.` : '';
      const interpret =
        `A gradual rise across the race is typical; a sharp jump in the final miles usually means fueling, hydration, or a pacing ceiling—check the per-mile curve.`;
      if (alreadyHeatPartitioned) {
        parts.push(interpret);
      } else {
        parts.push(`Higher drift (+${totalDrift} bpm).${heatEcho} ${interpret}`);
      }
    } else {
      parts.push(`Significant drift (+${totalDrift} bpm) — review the per-mile HR curve for where it accelerated.`);
    }
  } else if (e != null && l != null) {
    parts.push(`HR ${e} → ${l} bpm (+${l - e} bpm) early-to-late windows.`);
  } else if (a != null) {
    parts.push(`Avg ${a} bpm${maxHr != null ? ` · max ${Math.round(maxHr)} bpm` : ''}.`);
  }

  // HR response to terrain — uphills should show HR spike, downhills recovery
  const uphillHr = sorted.filter((s) => (s.grade_percent ?? 0) > 0.8 && s.avg_hr_bpm != null);
  const downhillHr = sorted.filter((s) => (s.grade_percent ?? 0) < -0.8 && s.avg_hr_bpm != null);
  if (uphillHr.length >= 2 && downhillHr.length >= 2 && a != null) {
    const upAvgHr = avgOf(uphillHr.map((s) => s.avg_hr_bpm!));
    const downAvgHr = avgOf(downhillHr.map((s) => s.avg_hr_bpm!));
    if (upAvgHr && downAvgHr && upAvgHr - downAvgHr > 8) {
      parts.push(`HR responded appropriately to grade: climbs averaged ${Math.round(upAvgHr)} bpm vs descents ${Math.round(downAvgHr)} bpm — cardiac cost tracked the terrain.`);
    }
  }

  return parts.join(' ');
}

/** Build conditions insight: terrain profile + weather with context. */
function buildConditionsInsight(args: {
  elevationGainM: number | null;
  sorted: MileSplit[];
  weatherTempF: number | null;
  weatherTempEndF: number | null;
  weatherTempPeakF: number | null;
  weatherHumidity: number | null;
  weatherWindMph: number | null;
}): string {
  const { elevationGainM, sorted, weatherTempF, weatherTempEndF, weatherTempPeakF, weatherHumidity, weatherWindMph } = args;
  const parts: string[] = [];

  // Elevation
  if (elevationGainM != null && elevationGainM > 0) {
    const gainFt = Math.round(elevationGainM * 3.28084);

    // Compute net from per-mile data if available
    let netFt: number | null = null;
    if (sorted.length > 0) {
      const firstElev = sorted[0].start_elevation_m;
      const lastElev = sorted[sorted.length - 1].end_elevation_m;
      if (firstElev != null && lastElev != null) {
        netFt = Math.round((lastElev - firstElev) * 3.28084);
      }
    }

    if (netFt != null && netFt < -50) {
      parts.push(`${gainFt} ft gain on a net ${Math.abs(netFt)} ft downhill course — real climbs early, descent opens later.`);
    } else if (netFt != null && Math.abs(netFt) < 50) {
      parts.push(`${gainFt} ft gain on a net-flat course.`);
    } else {
      parts.push(`${gainFt} ft total gain.`);
    }
  }

  // Weather — full recorded window
  if (weatherTempF != null && Number.isFinite(weatherTempF)) {
    const startF = Math.round(weatherTempF);
    const endF = weatherTempEndF != null ? Math.round(weatherTempEndF) : null;
    const peakF = weatherTempPeakF != null ? Math.round(weatherTempPeakF) : null;

    const tempRange = endF != null && endF !== startF
      ? `${startF}→${endF}°F`
      : `${startF}°F`;
    const peakNote = peakF != null && peakF > startF + 3 && (endF == null || peakF > endF + 2)
      ? ` (peak ${peakF}°F)`
      : '';

    const avgF = endF != null ? (startF + endF) / 2 : startF;
    const heatNote = avgF <= 55
      ? 'Cool — minimal heat stress.'
      : avgF <= 62
        ? 'Near-optimal marathon conditions.'
        : avgF <= 70
          ? 'Moderate heat load — meaningful HR contribution, especially late.'
          : 'Warm — significant heat tax throughout.';

    const extras: string[] = [];
    if (weatherHumidity != null && weatherHumidity > 70) extras.push(`${Math.round(weatherHumidity)}% humidity`);
    if (weatherWindMph != null && weatherWindMph > 12) extras.push(`${Math.round(weatherWindMph)} mph wind`);

    parts.push(`${tempRange}${peakNote}. ${heatNote}${extras.length ? ` ${extras.join(', ')}.` : ''}`);
  }

  return parts.join(' ');
}

export interface MarathonAdherenceSummary {
  verdict: string;
  technical_insights: { label: string; value: string }[];
  plan_impact: { focus: string; outlook: string };
}

export function buildMarathonGoalRaceAdherenceSummary(args: {
  match: GoalRaceCompletionMatch;
  granularAnalysis: any;
  detailedAnalysis: any;
  workout: { moving_time?: number | null; duration?: number | null; elapsed_time?: number | null };
  weatherTempF?: number | null;
  weatherProfile?: any | null;
}): MarathonAdherenceSummary {
  const { match, granularAnalysis, detailedAnalysis, workout, weatherTempF, weatherProfile } = args;
  const hr = granularAnalysis?.heart_rate_analysis;
  const drift = hr?.hr_drift_bpm != null ? Number(hr.hr_drift_bpm) : null;
  const early = hr?.early_avg_hr != null ? Number(hr.early_avg_hr) : null;
  const late = hr?.late_avg_hr != null ? Number(hr.late_avg_hr) : null;
  const avgHr =
    hr?.average_heart_rate != null
      ? Number(hr.average_heart_rate)
      : null;
  const maxHr =
    hr?.max_heart_rate != null ? Number(hr.max_heart_rate)
      : hr?.summary?.maxHr != null ? Number(hr.summary.maxHr)
      : null;

  const movSec = resolveMovingSeconds(workout, granularAnalysis);
  const elSec = resolveElapsedSeconds(workout, movSec);
  const durationMinutes = (elSec ?? movSec) != null ? ((elSec ?? movSec)! / 60) : null;

  const mileTerrain = detailedAnalysis?.mile_by_mile_terrain;
  const rawSplits: MileSplit[] = Array.isArray(mileTerrain?.splits) ? mileTerrain.splits : [];
  const sorted = [...rawSplits].sort((a, b) => a.mile - b.mile);

  const elevationGainM: number | null = (() => {
    const mt = mileTerrain?.elevation_gain_m;
    if (mt != null && Number.isFinite(Number(mt))) return Number(mt);
    const wg = (workout as any)?.elevation_gain;
    if (wg != null && Number.isFinite(Number(wg))) return Number(wg);
    return null;
  })();

  // Goal pace from match
  const goalPaceSec: number | null = (() => {
    const gts = match.goalTimeSeconds;
    if (gts != null && Number.isFinite(gts) && gts > 0) {
      // Assume marathon distance: 26.2 miles
      return gts / 26.2;
    }
    return null;
  })();

  // Headline: elapsed time, instrument-panel
  const name = match.eventName || 'Race';
  const el = elSec != null && elSec > 120 ? fmtClock(elSec) : null;
  const mov = movSec != null && movSec > 120 ? fmtClock(movSec) : null;
  const headline = el ? `${el} — ${name}` : mov ? `${mov} moving — ${name}` : name;

  const wp = weatherProfile ?? null;
  const conditionsInsight = buildConditionsInsight({
    elevationGainM,
    sorted,
    weatherTempF: wp?.temperature_start_f ?? weatherTempF ?? null,
    weatherTempEndF: wp?.temperature_end_f ?? null,
    weatherTempPeakF: wp?.temperature_peak_f ?? null,
    weatherHumidity: wp?.humidity ?? null,
    weatherWindMph: wp?.windSpeed ?? null,
  });

  let pacingInsight = buildPacingInsight(sorted, goalPaceSec);
  const suspectStopMiles = collectSuspectStopMiles(
    sorted.map((s) => ({
      mile: s.mile,
      paceSeconds: s.pace_s_per_mi,
      grade: s.grade_percent ?? 0,
    })),
  );
  if (suspectStopMiles.length) {
    pacingInsight +=
      (pacingInsight.trim() ? ' ' : '') +
      `Likely non-running slow segments (aid/stop): ${suspectStopMiles.map((m) => `${m}`).join(', ')}.`;
  }

  const hrInsight = buildHrInsight({
    sorted,
    earlyHr: early != null && Number.isFinite(early) ? early : null,
    lateHr: late != null && Number.isFinite(late) ? late : null,
    driftBpm: drift != null && Number.isFinite(drift) ? drift : null,
    avgHr: avgHr != null && Number.isFinite(avgHr) ? avgHr : null,
    maxHr: maxHr != null && Number.isFinite(maxHr) ? maxHr : null,
    durationMinutes,
    weatherTempStartF: wp?.temperature_start_f ?? weatherTempF ?? null,
    weatherTempEndF: wp?.temperature_end_f ?? null,
    weatherTempRise: (wp?.temperature_end_f != null && wp?.temperature_start_f != null)
      ? wp.temperature_end_f - wp.temperature_start_f
      : null,
  });

  const technical_insights: { label: string; value: string }[] = [
    { label: 'Finish', value: headline },
  ];
  if (conditionsInsight.trim()) {
    technical_insights.push({ label: 'Conditions', value: conditionsInsight.trim() });
  }
  if (pacingInsight.trim()) {
    technical_insights.push({ label: 'Pacing', value: pacingInsight.trim() });
  }
  if (hrInsight.trim()) {
    technical_insights.push({ label: 'Heart rate', value: hrInsight.trim() });
  }

  return {
    verdict: headline,
    technical_insights,
    plan_impact: {
      focus: 'Race result',
      outlook: 'Goal race — training adherence metrics do not apply.',
    },
  };
}

function resolveMovingSeconds(workout: any, granular: any): number | null {
  const o = granular?.computed?.overall ?? workout?.computed?.overall;
  const dsm = Number(o?.duration_s_moving);
  if (Number.isFinite(dsm) && dsm > 60) return Math.round(dsm);
  const mv = Number(workout?.moving_time);
  if (Number.isFinite(mv) && mv > 0) return mv < 1000 ? Math.round(mv * 60) : Math.round(mv);
  return null;
}

function resolveElapsedSeconds(workout: any, movSec: number | null): number | null {
  const o = (workout as any)?.computed?.overall;
  const dse = Number(o?.duration_s_elapsed);
  if (Number.isFinite(dse) && dse > 0) return Math.round(dse);
  const el = Number(workout?.elapsed_time);
  if (Number.isFinite(el) && el > 0) {
    return el < 1000 ? Math.round(el * 60) : Math.round(el);
  }
  return movSec;
}
