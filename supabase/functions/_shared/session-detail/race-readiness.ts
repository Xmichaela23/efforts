/**
 * Race readiness for session_detail_v1 — only for 28-day block peak runs (≥12 mi, longest in window).
 *
 * Deterministic: every sentence is a fixed template filled from the session's fact packet
 * (`buildSessionRaceReadinessFacts`). The model that used to write this block was deleted with the
 * no-AI work order (2026-09-07); what was its fallback is now the only path. Copy obeys docs/COPY-VOICE.md.
 */
import type { PlanContext } from '../plan-context.ts';
import type { SessionDetailV1, SessionRaceReadinessV1 } from './types.ts';

const MI = 1609.34;

function addDaysIsoYmd(iso: string, deltaDays: number): string {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parseWorkoutAnalysisField(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

/** Best-effort miles for prior-run comparison (session_detail_v1 preferred, then row distance km). */
function extractDistanceMilesFromWorkoutRow(w: Record<string, unknown>): number | null {
  const wa = parseWorkoutAnalysisField(w.workout_analysis);
  const sdv = wa.session_detail_v1 as Record<string, unknown> | undefined;
  const ct = sdv?.completed_totals as Record<string, unknown> | undefined;
  const dm = ct?.distance_m;
  if (typeof dm === 'number' && dm > 0) return Math.round((dm / MI) * 100) / 100;
  const distKm = w.distance;
  if (typeof distKm === 'number' && distKm > 0) return Math.round(((distKm * 1000) / MI) * 100) / 100;
  return null;
}

/**
 * Max distance (mi) among completed runs in [sessionDate-28d, sessionDate], excluding this workout.
 * Limited to 20 rows (recent first). On error, returns 0 (fail open for gate).
 */
async function fetchLongestPriorRunDistanceMiles(
  supabase: any,
  userId: string,
  sessionDateYmd: string,
  currentWorkoutId: string,
): Promise<number> {
  try {
    const end = String(sessionDateYmd).slice(0, 10);
    const start = addDaysIsoYmd(end, -28);
    const curId = String(currentWorkoutId);
    const { data, error } = await supabase
      .from('workouts')
      .select('id, date, type, workout_analysis, distance')
      .eq('user_id', userId)
      .eq('workout_status', 'completed')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .limit(20);
    if (error) {
      console.warn('[race_readiness] prior_long_runs query error (fail open):', error.message);
      return 0;
    }
    let maxMiles = 0;
    for (const w of Array.isArray(data) ? data : []) {
      const row = w as Record<string, unknown>;
      if (String(row.id || '') === curId) continue;
      if (String(row.type || '').toLowerCase() !== 'run') continue;
      const mi = extractDistanceMilesFromWorkoutRow(row);
      if (mi != null && mi > maxMiles) maxMiles = mi;
    }
    return maxMiles;
  } catch (e) {
    console.warn('[race_readiness] prior_long_runs exception (fail open):', e);
    return 0;
  }
}

function fmtPaceSecPerMi(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function fmtFinishClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

/** Aligns with session-detail/build.ts mile-split pacing row (non-structured intervals only). */
function computeMileSplitRaceFacts(
  wa: Record<string, unknown> | null | undefined,
  derived: Record<string, unknown> | undefined,
  gapAdjusted: boolean,
): {
  pacing_split_seconds_per_mile: number | null;
  fastest_mile: number | null;
  fastest_mile_pace_sec_per_mi: number | null;
  fastest_mile_pace: string | null;
} {
  const empty = {
    pacing_split_seconds_per_mile: null as number | null,
    fastest_mile: null as number | null,
    fastest_mile_pace_sec_per_mi: null as number | null,
    fastest_mile_pace: null as string | null,
  };
  const ie = derived?.interval_execution as { total_steps?: number } | undefined;
  if (typeof ie?.total_steps === 'number' && ie.total_steps > 2) return empty;
  const comp = (wa as any)?.computed;
  const splitsMi: any[] = Array.isArray(comp?.analysis?.events?.splits?.mi) ? comp.analysis.events.splits.mi : [];
  const rawSplits = splitsMi
    .map((s: any) => {
      const pacePerKm = Number(s?.avgPace_s_per_km);
      const gapPerKm = Number(s?.avgGapPace_s_per_km);
      return {
        mile: Number(s?.n),
        pace: Number.isFinite(pacePerKm) && pacePerKm > 0 ? pacePerKm * 1.60934 : NaN,
        gap: Number.isFinite(gapPerKm) && gapPerKm > 0 ? gapPerKm * 1.60934 : NaN,
      };
    })
    .filter((s) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);
  if (rawSplits.length < 2) return empty;
  const hasGap = gapAdjusted && rawSplits.every((s) => Number.isFinite(s.gap) && s.gap > 0);
  const splits = hasGap
    ? rawSplits.map((s) => ({ mile: s.mile, pace: s.gap as number }))
    : rawSplits.map((s) => ({ mile: s.mile, pace: s.pace }));
  const mid = Math.ceil(splits.length / 2);
  const firstHalf = splits.slice(0, mid);
  const secondHalf = splits.slice(mid);
  const avg = (arr: typeof splits) => arr.reduce((s, x) => s + x.pace, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const pacing_split_seconds_per_mile = Math.round((secondAvg - firstAvg) * 10) / 10;
  const fastest = rawSplits.reduce((a, b) => (a.pace < b.pace ? a : b));
  const fm = Math.floor(fastest.pace / 60);
  const fs = Math.round(fastest.pace % 60);
  return {
    pacing_split_seconds_per_mile,
    fastest_mile: fastest.mile,
    fastest_mile_pace_sec_per_mi: Math.round(fastest.pace * 10) / 10,
    fastest_mile_pace: `${fm}:${String(fs).padStart(2, '0')}/mi`,
  };
}

function elevationProfileLabel(
  elevFt: number | null,
  terrainType: string | null,
): 'rolling' | 'flat' | 'hilly' | null {
  if (elevFt != null && elevFt >= 1200) return 'hilly';
  if (elevFt != null && elevFt <= 100) return 'flat';
  const t = String(terrainType || '').toLowerCase();
  if (/mountain|steep|hilly|aggressive|alpine/.test(t)) return 'hilly';
  if (/flat|track|treadmill/.test(t)) return 'flat';
  if (elevFt != null) return 'rolling';
  if (/rolling|undulat|mixed/.test(t)) return 'rolling';
  return elevFt == null && !t ? null : 'rolling';
}

/**
 * Race distance in miles for finish-time math when the plan goal names a standard event.
 * Null when unknown (ultra, custom, or unlabeled) — the copy must not assume 26.2.
 */
function inferTargetRaceDistanceMiles(goalLabel: string | null | undefined): number | null {
  const s = String(goalLabel || '').toLowerCase();
  if (!s.trim()) return null;
  if (/\bhalf\b/.test(s) && /\bmarathon\b/.test(s)) return 13.1;
  if (/\bhalf\b/.test(s) && !/\bfull\b/.test(s)) return 13.1;
  if (/\b13\.1\b/.test(s)) return 13.1;
  if (/\bmarathon\b|\bfull\s+marathon\b|\b26\.2\b|\b42\.?195\b/.test(s)) return 26.2;
  if (/\b10\s*k\b|\b10k\b|\b6\.2\b/.test(s)) return 6.21371192;
  if (/\b5\s*k\b|\b5k\b|\b3\.1\b/.test(s)) return 3.10685596;
  if (/\bultra\b|\b50k\b|\b100k\b|\b50\s*mile\b/i.test(s)) return null;
  return null;
}

function isLongRunLike(
  workoutTypeKey: string,
  plannedName: string | null,
  plannedRx: string | null,
  distMi: number | null,
): boolean {
  const wt = workoutTypeKey.toLowerCase();
  if (/long/i.test(wt)) return true;
  const pt = [plannedName, plannedRx].filter(Boolean).join(' ').toLowerCase();
  if (
    /long\s*run|marathon\s*prep|marathon\s*long|last\s*long|mlr|progression\s*long|endurance\s*long|20\+?\s*m|32\+?\s*k/.test(
      pt,
    )
  ) {
    return true;
  }
  if (distMi != null && distMi >= 12) return true;
  return false;
}

/** Norm type + fact workout_type: allow Garmin-style "endurance" runs, exclude obvious non-run sports. */
function isRunningSessionForRaceReadiness(sessionNormType: string, workoutTypeKey: string): boolean {
  const nt = String(sessionNormType || '').toLowerCase().trim();
  const wtk = String(workoutTypeKey || '').toLowerCase();
  if (/\b(bike|biking|cycling|cycle|ride|riding|swim|swimming|row|kayak)\b/.test(wtk)) return false;
  if (nt === 'run') return true;
  if (nt === 'endurance') return true;
  if (/run|jog|treadmill|trail/.test(wtk)) return true;
  return false;
}

export function raceReadinessGateSkipReason(params: {
  sessionNormType: string;
  workoutTypeKey: string;
  planId: string | null;
  raceDateIso: string | null;
  daysUntilRace: number | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  isLongRunLike: boolean;
}): string | null {
  if (!isRunningSessionForRaceReadiness(params.sessionNormType, params.workoutTypeKey)) {
    return `not_run_session(norm=${params.sessionNormType},facts_type=${params.workoutTypeKey})`;
  }
  if (!params.planId) return 'no_plan_id';
  if (!params.raceDateIso) return 'no_race_date';
  if (params.daysUntilRace == null || params.daysUntilRace <= 0) return 'race_past_or_unknown_days';
  // Many plans taper earlier than three weeks out — keep window wide enough to match product taper UX.
  if (params.daysUntilRace > 28) return `outside_window_days=${params.daysUntilRace}`;
  const longEnough =
    (params.distanceMiles != null && params.distanceMiles >= 12) ||
    (params.distanceMiles == null && params.durationMinutes != null && params.durationMinutes >= 90);
  if (!longEnough) return 'distance_duration_short';
  if (!params.isLongRunLike) return 'not_long_run_like';
  return null;
}

export function gateSessionRaceReadiness(params: {
  sessionNormType: string;
  workoutTypeKey: string;
  planId: string | null;
  raceDateIso: string | null;
  daysUntilRace: number | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  isLongRunLike: boolean;
}): boolean {
  return raceReadinessGateSkipReason(params) === null;
}

export function buildSessionRaceReadinessFacts(params: {
  sessionDetail: SessionDetailV1;
  workoutAnalysis: Record<string, unknown> | null;
  planContext: PlanContext;
  row: Record<string, unknown>;
  /** Set only after 28d block-peak gate passes */
  blockPeakMeta?: { longest_prior_distance_miles: number } | null;
}): Record<string, unknown> {
  const { sessionDetail: sd, workoutAnalysis: wa, planContext: pc, row, blockPeakMeta } = params;
  const fp = (wa as any)?.fact_packet_v1 || (wa as any)?.session_state_v1?.details?.fact_packet_v1;
  const facts = fp?.facts || {};
  const derived = fp?.derived || {};
  const vsSim = derived.comparisons?.vs_similar;
  const perf = (wa as any)?.performance || {};

  const distM = sd.completed_totals?.distance_m ?? null;
  const distanceMiles =
    typeof distM === 'number' && distM > 0 ? Math.round((distM / MI) * 100) / 100 : null;
  const durS = sd.completed_totals?.duration_s ?? null;
  const durationMinutes =
    typeof durS === 'number' && durS > 0 ? Math.round((durS / 60) * 10) / 10 : null;

  const paceSec = sd.completed_totals?.avg_pace_s_per_mi ?? null;
  const avgPace =
    typeof paceSec === 'number' && paceSec > 0 ? fmtPaceSecPerMi(Math.round(paceSec)) : null;

  const avgHr = sd.completed_totals?.avg_hr ?? row.avg_heart_rate ?? row.metrics?.avg_heart_rate ?? null;
  const maxHr = row.max_heart_rate ?? row.metrics?.max_heart_rate ?? null;

  const hra = (wa as any)?.granular_analysis?.heart_rate_analysis as
    | { hr_drift_bpm?: number; terrain_contribution_bpm?: number }
    | undefined;

  /** Terrain-adjusted late-minus-early HR from this run's GPS (analyzer); before pace-normalization story. */
  const hrDriftTerrainAdjusted =
    typeof derived.hr_drift_bpm === 'number'
      ? derived.hr_drift_bpm
      : typeof hra?.hr_drift_bpm === 'number'
        ? hra.hr_drift_bpm
        : null;

  const paceNormalizedDriftBpm =
    typeof derived.pace_normalized_drift_bpm === 'number' ? derived.pace_normalized_drift_bpm : null;

  const terrainContributionBpm =
    typeof derived.terrain_contribution_bpm === 'number'
      ? derived.terrain_contribution_bpm
      : typeof hra?.terrain_contribution_bpm === 'number'
        ? hra.terrain_contribution_bpm
        : null;

  const hrDrift =
    typeof paceNormalizedDriftBpm === 'number'
      ? paceNormalizedDriftBpm
      : typeof derived.hr_drift_bpm === 'number'
        ? derived.hr_drift_bpm
        : typeof hra?.hr_drift_bpm === 'number'
          ? hra.hr_drift_bpm
          : null;

  const typicalHrDrift =
    typeof derived.hr_drift_typical === 'number' && Math.abs(derived.hr_drift_typical) >= 1
      ? derived.hr_drift_typical
      : null;

  const hrDriftVsTypical =
    typeof hrDrift === 'number' && typeof typicalHrDrift === 'number'
      ? Math.round((hrDrift - typicalHrDrift) * 10) / 10
      : null;

  const gapAdjusted = !!(sd.execution?.gap_adjusted ?? perf?.gap_adjusted);
  const splitFacts = computeMileSplitRaceFacts(wa, derived as Record<string, unknown>, gapAdjusted);

  const hrDriftExplanation =
    typeof derived.drift_explanation === 'string' ? String(derived.drift_explanation) : null;
  const pacingSpeedupsNote =
    derived.pacing_pattern && typeof (derived.pacing_pattern as any).speedups_note === 'string'
      ? String((derived.pacing_pattern as any).speedups_note)
      : null;

  const pacingRow = Array.isArray(sd.analysis_details?.rows)
    ? sd.analysis_details!.rows!.find((r) => String(r.label || '').toLowerCase() === 'pacing')
    : null;
  const pacingSplit = pacingRow?.value != null ? String(pacingRow.value) : null;

  const hrRow = Array.isArray(sd.analysis_details?.rows)
    ? sd.analysis_details!.rows!.find((r) => String(r.label || '').toLowerCase() === 'heart rate')
    : null;
  const heartRateSummary = hrRow?.value != null ? String(hrRow.value) : null;

  const wx = facts.weather as Record<string, unknown> | null | undefined;
  const conditionsTempAvg =
    wx && typeof wx.temperature_f === 'number' ? Math.round(wx.temperature_f as number) : null;
  const conditionsTempStart =
    wx && typeof wx.temp_start_f === 'number' ? Math.round(wx.temp_start_f as number) : null;
  const conditionsTempEnd =
    wx && typeof wx.temp_end_f === 'number' ? Math.round(wx.temp_end_f as number) : null;
  const conditionsTempPeak =
    wx && typeof wx.temp_peak_f === 'number'
      ? Math.round(wx.temp_peak_f as number)
      : conditionsTempAvg;
  const conditionsHeatFlag = conditionsTempPeak != null ? conditionsTempPeak >= 70 : null;
  let conditionsHeatNote: string | null = null;
  if (
    conditionsTempStart != null &&
    conditionsTempPeak != null &&
    conditionsTempPeak - conditionsTempStart >= 8
  ) {
    conditionsHeatNote =
      `Started ~${conditionsTempStart}°F; conditions peaked near ${conditionsTempPeak}°F during the session — heat load was heavier toward the final miles.`;
  } else if (
    conditionsTempStart != null &&
    conditionsTempEnd != null &&
    conditionsTempPeak != null
  ) {
    conditionsHeatNote = `Temps ~${conditionsTempStart}°F → ~${conditionsTempEnd}°F (peak ~${conditionsTempPeak}°F).`;
  }
  const elevFt =
    typeof facts.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
  const terrainType = typeof facts.terrain_type === 'string' ? facts.terrain_type : null;
  const elevationProfile = elevationProfileLabel(elevFt, terrainType);

  const rpeRaw = (row as any)?.rpe;
  const rpe = typeof rpeRaw === 'number' && Number.isFinite(rpeRaw) ? Math.round(rpeRaw * 10) / 10 : null;

  const ns = sd.next_session;
  const nextSessionName = ns && typeof ns.name === 'string' ? ns.name : null;
  const nextSessionPrescription =
    ns && typeof ns.prescription === 'string' && ns.prescription.trim() ? ns.prescription : null;

  const similarRuns =
    vsSim && typeof vsSim.sample_size === 'number'
      ? {
          sample_size: vsSim.sample_size,
          pace_delta_sec: vsSim.pace_delta_sec,
          hr_delta_bpm: vsSim.hr_delta_bpm,
          drift_delta_bpm: vsSim.drift_delta_bpm,
          assessment: vsSim.assessment,
        }
      : null;

  const targetRaceDistanceMiles = inferTargetRaceDistanceMiles(pc.goalProfileOrDistance);

  const out: Record<string, unknown> = {
    days_to_race: pc.daysUntilRace,
    race_date: pc.raceDateIso,
    race_name: pc.raceName ?? pc.planName,
    race_type: pc.goalProfileOrDistance,
    target_race_distance_miles: targetRaceDistanceMiles,
    course_profile: pc.courseProfileJson,
    workout_date: sd.date,
    distance_miles: distanceMiles,
    duration_minutes: durationMinutes,
    avg_pace: avgPace,
    avg_hr: typeof avgHr === 'number' ? Math.round(avgHr) : avgHr,
    max_hr: typeof maxHr === 'number' ? Math.round(maxHr) : maxHr,
    hr_drift_bpm: typeof hrDrift === 'number' ? Math.round(hrDrift * 10) / 10 : hrDrift,
    hr_drift_bpm_terrain_adjusted:
      typeof hrDriftTerrainAdjusted === 'number'
        ? Math.round(hrDriftTerrainAdjusted * 10) / 10
        : null,
    pace_normalized_drift_bpm:
      typeof paceNormalizedDriftBpm === 'number'
        ? Math.round(paceNormalizedDriftBpm * 10) / 10
        : null,
    terrain_contribution_bpm:
      typeof terrainContributionBpm === 'number'
        ? Math.round(terrainContributionBpm * 10) / 10
        : null,
    hr_drift_explanation: hrDriftExplanation,
    typical_hr_drift_bpm:
      typeof typicalHrDrift === 'number' ? Math.round(typicalHrDrift * 10) / 10 : null,
    hr_drift_vs_typical: hrDriftVsTypical,
    pacing_split: pacingSplit,
    pacing_split_seconds_per_mile: splitFacts.pacing_split_seconds_per_mile,
    fastest_mile: splitFacts.fastest_mile,
    fastest_mile_pace: splitFacts.fastest_mile_pace,
    fastest_mile_pace_sec_per_mi: splitFacts.fastest_mile_pace_sec_per_mi,
    pacing_speedups_note: pacingSpeedupsNote,
    heart_rate_row_summary: heartRateSummary,
    conditions_temp_f: conditionsTempAvg,
    conditions_temp_start_f: conditionsTempStart,
    conditions_temp_end_f: conditionsTempEnd,
    conditions_temp_peak_f: conditionsTempPeak,
    conditions_heat_flag: conditionsHeatFlag,
    conditions_heat_note: conditionsHeatNote,
    elevation_gain_ft: elevFt,
    elevation_profile: elevationProfile,
    terrain_type: terrainType,
    rpe,
    ...(blockPeakMeta
      ? {
          is_block_peak_run: true,
          longest_prior_distance_miles: blockPeakMeta.longest_prior_distance_miles,
        }
      : {}),
    next_session_name: nextSessionName,
    next_session_prescription: nextSessionPrescription,
    next_session_description: nextSessionPrescription,
    execution_score: sd.execution?.execution_score ?? perf.execution_adherence ?? null,
    pace_adherence_pct: sd.execution?.pace_adherence ?? perf.pace_adherence ?? null,
    duration_adherence_pct: sd.execution?.duration_adherence ?? perf.duration_adherence ?? null,
    target_finish_time_seconds:
      pc.targetFinishTimeSeconds != null && pc.targetFinishTimeSeconds > 0
        ? pc.targetFinishTimeSeconds
        : null,
    target_race_goal_finish_clock:
      pc.targetFinishTimeSeconds != null && pc.targetFinishTimeSeconds > 0
        ? fmtFinishClock(pc.targetFinishTimeSeconds)
        : null,
    similar_runs: similarRuns,
    recent_trend_summary: sd.trend?.summary ?? null,
    insights_narrative_excerpt:
      typeof sd.narrative_text === 'string' ? sd.narrative_text.slice(0, 400) : null,
  };

  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === null || out[k] === '') {
      delete out[k];
    }
  }
  return out;
}

export function raceReadinessDeterministicFallback(
  facts: Record<string, unknown>,
  planCtx?: PlanContext | null,
): SessionRaceReadinessV1 | null {
  const d = facts.days_to_race;
  const days = typeof d === 'number' && d > 0 ? d : null;
  if (days == null) return null;
  const raceLabel =
    typeof facts.race_name === 'string' && String(facts.race_name).trim()
      ? String(facts.race_name).trim()
      : 'the race';
  const dist = facts.distance_miles;
  const distN = typeof dist === 'number' && dist > 0 ? dist : null;
  const heat = facts.conditions_heat_flag === true;
  const heatNote = typeof facts.conditions_heat_note === 'string' ? facts.conditions_heat_note.trim() : '';
  const drift = typeof facts.hr_drift_bpm === 'number' ? Math.round(facts.hr_drift_bpm) : null;
  const typ = typeof facts.typical_hr_drift_bpm === 'number' ? Math.round(facts.typical_hr_drift_bpm) : null;
  const driftWhy =
    typeof facts.hr_drift_explanation === 'string' ? String(facts.hr_drift_explanation).trim() : '';
  const avgHrF = typeof facts.avg_hr === 'number' ? Math.round(facts.avg_hr) : null;
  const splitRaw = facts.pacing_split_seconds_per_mile;
  const split = typeof splitRaw === 'number' && Math.abs(splitRaw) >= 5 ? Math.round(splitRaw) : null;
  const elev = typeof facts.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
  const ep = typeof facts.elevation_profile === 'string' ? String(facts.elevation_profile) : null;
  const fastestMile = typeof facts.fastest_mile === 'number' ? Math.round(facts.fastest_mile) : null;
  const fastestMilePace =
    typeof facts.fastest_mile_pace === 'string' ? String(facts.fastest_mile_pace).trim() : '';
  const avgPaceStr = typeof facts.avg_pace === 'string' ? String(facts.avg_pace).trim() : '';

  // ── verdict: the observed facts, one sentence each, no reader-directed language ──
  const lines: string[] = [];
  if (drift != null && typ != null) {
    lines.push(`Heart-rate drift +${drift} bpm against a typical +${typ} bpm.`);
    if (driftWhy === 'terrain_driven') lines.push('Late climbing accounts for part of that rise.');
  } else if (drift != null) {
    lines.push(`Heart-rate drift +${drift} bpm.`);
  }
  if (avgHrF != null) lines.push(`Average heart rate ${avgHrF} bpm.`);
  if (split != null) {
    lines.push(
      split > 0
        ? `Second-half pace ${split} s/mi slower than the first.`
        : `Second-half pace ${Math.abs(split)} s/mi faster than the first.`,
    );
  }
  if (elev != null && ep) lines.push(`${ep.charAt(0).toUpperCase()}${ep.slice(1)} terrain, about ${elev} ft of gain.`);
  if (heat && heatNote) lines.push(heatNote.endsWith('.') ? heatNote : `${heatNote}.`);
  else if (heat) lines.push('Warm conditions add heart-rate cost in the back half.');
  lines.push(`${days} days remain before ${raceLabel}.`);
  const verdict = lines.join(' ');

  // ── tactical line: one race-day consequence tied to a number from this session ──
  const earlyMilesLabel =
    distN != null && distN < 12 ? 'the first 2–3 miles' : distN != null && distN < 16 ? 'the first 3–4 miles' : 'the first 5 miles';
  let tactical_instruction: string;
  if (fastestMile != null && fastestMilePace) {
    tactical_instruction =
      `Fastest mile today: mile ${fastestMile} at ${fastestMilePace}. ${earlyMilesLabel.charAt(0).toUpperCase()}${earlyMilesLabel.slice(1)} at ${raceLabel} run faster than that pace set up the same second-half slowdown.`;
  } else if (avgPaceStr) {
    tactical_instruction =
      `Average pace today ${avgPaceStr}. ${earlyMilesLabel.charAt(0).toUpperCase()}${earlyMilesLabel.slice(1)} at ${raceLabel} held at that pace or slower hold heart-rate drift in today's range.`;
  } else if (avgHrF != null) {
    tactical_instruction =
      `Average heart rate today ${avgHrF} bpm. ${earlyMilesLabel.charAt(0).toUpperCase()}${earlyMilesLabel.slice(1)} at ${raceLabel} at a similar heart rate leave the same margin for the back half.`;
  } else {
    tactical_instruction =
      `${days} days to ${raceLabel}. The first 2–3 miles run 15–20 s/mi slower than goal pace leave margin for the back half.`;
  }
  if (split != null && split > 0) {
    tactical_instruction += ` Early pace above today's average repeats the ${split} s/mi second-half slowdown.`;
  }

  // ── taper line ──
  const planTaper = planCtx?.has_taper_phase === true;
  const nextN = typeof facts.next_session_name === 'string' ? facts.next_session_name : '';
  const nextP = typeof facts.next_session_prescription === 'string' ? facts.next_session_prescription : '';
  let taper_guidance = planTaper
    ? 'The plan already reduces volume from here. Volume added in the last two weeks arrives as fatigue on race day; short race-pace touches hold the pace familiar without adding load.'
    : 'Hard days stacked without recovery this close to the race arrive as fatigue on race day.';
  if (planTaper && (nextN || nextP)) {
    taper_guidance += ` Next on the plan: ${nextN}${nextP ? ` — ${nextP.slice(0, 120)}` : ''}.`;
  }

  const headline =
    drift != null && typ != null && drift < typ
      ? `${days} days out — heart-rate drift below typical`
      : distN != null
        ? `${days} days out — ${distN} mi long run logged`
        : `${days} days out — long run toward ${raceLabel} logged`;
  return {
    headline,
    verdict,
    tactical_instruction,
    flag: null,
    projection:
      typeof facts.target_race_goal_finish_clock === 'string'
        ? `Goal finish on file: ${facts.target_race_goal_finish_clock}. A single long run confirms the workload; it does not predict the finish.`
        : 'No goal finish time on file. Race pace comes off recent long-run effort until a target is set in the plan.',
    taper_guidance,
  };
}

export async function buildSessionRaceReadiness(params: {
  sessionDetail: SessionDetailV1;
  workoutAnalysis: Record<string, unknown> | null;
  planContext: PlanContext;
  row: Record<string, unknown>;
  supabase?: any;
  userId?: string | null;
}): Promise<SessionRaceReadinessV1 | null> {
  try {
    return await buildSessionRaceReadinessImpl(params);
  } catch (e) {
    console.warn('[race_readiness] unexpected error (suppress):', e instanceof Error ? e.message : e);
    return null;
  }
}

async function buildSessionRaceReadinessImpl(params: {
  sessionDetail: SessionDetailV1;
  workoutAnalysis: Record<string, unknown> | null;
  planContext: PlanContext;
  row: Record<string, unknown>;
  supabase?: any;
  userId?: string | null;
}): Promise<SessionRaceReadinessV1 | null> {
  const sd = params.sessionDetail;
  const wa = params.workoutAnalysis;
  const pc = params.planContext;
  const fp = (wa as any)?.fact_packet_v1 || (wa as any)?.session_state_v1?.details?.fact_packet_v1;
  const facts = fp?.facts || {};
  const workoutTypeKey = String(facts.workout_type || sd.type || '').toLowerCase();
  const planned = sd.plan_context?.planned;
  const plannedName = planned && typeof (planned as any).name === 'string' ? String((planned as any).name) : null;
  const plannedRx =
    planned && typeof (planned as any).prescription === 'string'
      ? String((planned as any).prescription)
      : null;
  const distM = sd.completed_totals?.distance_m ?? null;
  const distMi = typeof distM === 'number' && distM > 0 ? distM / MI : null;
  const durS = sd.completed_totals?.duration_s ?? null;
  const durMin = typeof durS === 'number' && durS > 0 ? durS / 60 : null;

  const longRun = isLongRunLike(workoutTypeKey, plannedName, plannedRx, distMi);

  const gateParams = {
    sessionNormType: String(sd.type || '').toLowerCase(),
    workoutTypeKey,
    planId: pc.plan_id ?? null,
    raceDateIso: pc.raceDateIso,
    daysUntilRace: pc.daysUntilRace,
    distanceMiles: distMi,
    durationMinutes: durMin,
    isLongRunLike: longRun,
  };
  const skip = raceReadinessGateSkipReason(gateParams);
  if (skip) {
    console.warn('[race_readiness] gate_skip:', skip);
    return null;
  }

  if (distMi == null || distMi < 12) {
    console.warn('[race_readiness] gate_skip: below_12mi_block_peak_threshold', { distMi });
    return null;
  }

  const sessionDate = String(sd.date || '').slice(0, 10);
  const wid = String((params.row as { id?: string }).id || '');
  let longestPrior = 0;
  if (params.supabase && params.userId && wid && sessionDate) {
    longestPrior = await fetchLongestPriorRunDistanceMiles(
      params.supabase,
      String(params.userId),
      sessionDate,
      wid,
    );
  } else {
    console.warn('[race_readiness] prior_long_runs skipped (no supabase/userId/row id) — fail open longestPrior=0');
  }

  const isBlockPeak = distMi >= 12 && distMi >= longestPrior;
  if (!isBlockPeak) {
    console.warn('[race_readiness] gate_skip: not_block_peak', {
      current: distMi,
      longest_prior: longestPrior,
    });
    return null;
  }

  const packet = buildSessionRaceReadinessFacts({
    ...params,
    blockPeakMeta: { longest_prior_distance_miles: longestPrior },
  });
  return raceReadinessDeterministicFallback(packet, pc);
}

