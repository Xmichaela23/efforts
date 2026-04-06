/**
 * LLM race readiness for session_detail_v1 — long runs near plan race day.
 * Uses shared callLLM (model from env / llm.ts). On failure returns null.
 */
import { callLLM } from '../llm.ts';
import type { PlanContext } from '../plan-context.ts';
import type { SessionDetailV1, SessionRaceReadinessLlmV1 } from './types.ts';

const MI = 1609.34;

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
 * Null when unknown (ultra, custom, or unlabeled) — LLM must not invent 26.2.
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
  if (distMi != null && distMi >= 12.5) return true;
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
    (params.distanceMiles != null && params.distanceMiles >= 10) ||
    (params.durationMinutes != null && params.durationMinutes >= 90);
  if (!longEnough) return 'distance_duration_short';
  if (!params.isLongRunLike) return 'not_long_run_like';
  return null;
}

export function gateSessionRaceReadinessLlm(params: {
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
}): Record<string, unknown> {
  const { sessionDetail: sd, workoutAnalysis: wa, planContext: pc, row } = params;
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
    plan_has_taper: pc.has_taper_phase,
    current_phase: pc.current_phase,
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

function extractJsonObject(text: string): string | null {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** Remove accidental snake_case key references like "(conditions_heat_flag)" from model copy. */
function stripSnakeCaseKeyParens(s: string): string {
  const t = String(s || '').replace(/\s*\([a-z][a-z0-9]*(?:_[a-z][a-z0-9]*)+\)/gi, ' ');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** tactical_instruction must anchor to today's data with a digit (pace, bpm, mile, °F, s/mi). */
function tacticalInstructionHasConcreteNumber(s: string): boolean {
  return /\d/.test(String(s || ''));
}

function parseRaceReadinessLlmResponse(text: string | null | undefined): SessionRaceReadinessLlmV1 | null {
  if (!text) return null;
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) return null;
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    const headline = stripSnakeCaseKeyParens(String(o.headline || '').trim());
    const verdict = stripSnakeCaseKeyParens(String(o.verdict || '').trim());
    const tactical_instruction = stripSnakeCaseKeyParens(String(o.tactical_instruction || '').trim());
    const projection = stripSnakeCaseKeyParens(String(o.projection || '').trim());
    const taper_guidance = stripSnakeCaseKeyParens(String(o.taper_guidance || '').trim());
    const flagRaw = o.flag;
    const flag =
      flagRaw === null || flagRaw === undefined || String(flagRaw).toLowerCase() === 'null'
        ? null
        : stripSnakeCaseKeyParens(String(flagRaw).trim()) || null;
    if (!headline || !verdict || !tactical_instruction || !projection || !taper_guidance) return null;
    if (!tacticalInstructionHasConcreteNumber(tactical_instruction)) return null;
    return { headline, verdict, tactical_instruction, flag, projection, taper_guidance };
  } catch {
    return null;
  }
}

/** When the LLM is unavailable or returns invalid JSON, still surface a structured block from FACTS-only copy. */
export function raceReadinessDeterministicFallback(
  facts: Record<string, unknown>,
): SessionRaceReadinessLlmV1 | null {
  const d = facts.days_to_race;
  const days = typeof d === 'number' && d > 0 ? d : null;
  if (days == null) return null;
  const raceLabel =
    typeof facts.race_name === 'string' && String(facts.race_name).trim()
      ? String(facts.race_name).trim()
      : 'your race';
  const dist = facts.distance_miles;
  const heat = facts.conditions_heat_flag === true;
  const heatNote = typeof facts.conditions_heat_note === 'string' ? facts.conditions_heat_note.trim() : '';
  const drift = typeof facts.hr_drift_bpm === 'number' ? facts.hr_drift_bpm : null;
  const typ = typeof facts.typical_hr_drift_bpm === 'number' ? facts.typical_hr_drift_bpm : null;
  const driftWhy =
    typeof facts.hr_drift_explanation === 'string' ? String(facts.hr_drift_explanation).trim() : '';
  const avgHrF = typeof facts.avg_hr === 'number' ? Math.round(facts.avg_hr) : null;
  const split = facts.pacing_split_seconds_per_mile;
  const elev = typeof facts.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
  const ep = typeof facts.elevation_profile === 'string' ? String(facts.elevation_profile) : null;
  const coachBits: string[] = [];
  if (drift != null && typ != null) {
    coachBits.push(
      `Drift +${Math.round(drift)} bpm vs your typical +${Math.round(typ)} bpm is a solid aerobic read`,
    );
    if (driftWhy === 'terrain_driven') {
      coachBits.push('late climbing factored into that picture — the pipeline already terrain-adjusted the HR story');
    }
  }
  if (avgHrF != null) coachBits.push(`${avgHrF} bpm average`);
  if (typeof split === 'number' && Math.abs(split) >= 5) {
    coachBits.push(
      split > 0
        ? `you slowed about +${Math.round(split)}s/mi in the second half`
        : `you picked it up ~${Math.round(Math.abs(split))}s/mi in the second half`,
    );
  }
  if (elev != null && ep) coachBits.push(`${ep} terrain (~${elev} ft gain)`);
  if (heat && heatNote) coachBits.push(heatNote);
  else if (heat) coachBits.push('it was warm enough to tax the back half');
  const verdict =
    (coachBits.length ? coachBits.join(' — ') + '. ' : '') +
    `You're on track with ${days} days until ${raceLabel}.`;

  const fastestMile = typeof facts.fastest_mile === 'number' ? facts.fastest_mile : null;
  const fastestMilePace =
    typeof facts.fastest_mile_pace === 'string' ? String(facts.fastest_mile_pace).trim() : '';
  const avgPaceStr = typeof facts.avg_pace === 'string' ? String(facts.avg_pace).trim() : '';
  const distN = typeof dist === 'number' && dist > 0 ? dist : null;
  const earlyMilesLabel =
    distN != null && distN < 12 ? 'the first 2–3 miles' : distN != null && distN < 16 ? 'the first 3–4 miles' : 'the first 5 miles';

  let tactical_instruction = '';
  if (fastestMile != null && fastestMilePace) {
    tactical_instruction =
      `Your fastest mile today was mile ${Math.round(fastestMile)} at ${fastestMilePace} — stay slower than that effort through ${earlyMilesLabel} at ${raceLabel} so you don't repeat today's fade.`;
  } else if (avgPaceStr) {
    const thirdLabel =
      distN != null && distN >= 18 ? 'roughly the first third of the race' : earlyMilesLabel;
    tactical_instruction = `You averaged ${avgPaceStr} today — use that as an early ceiling for ${thirdLabel} at ${raceLabel} if you want the same aerobic control you showed here.`;
  } else if (avgHrF != null && drift != null && typ != null) {
    tactical_instruction = `You held ~${avgHrF} bpm average with +${Math.round(drift)} bpm drift vs your typical +${Math.round(typ)} — cap early effort at a similar HR at ${raceLabel} through ${earlyMilesLabel}, then reassess.`;
  } else if (drift != null && typ != null) {
    tactical_instruction = `You held +${Math.round(drift)} bpm drift versus your usual +${Math.round(typ)} — keep the first third of ${raceLabel} controlled; lungs and legs should feel easier if the morning is cooler.`;
    if (heat && heatNote) {
      tactical_instruction += ` ${heatNote}`;
    } else if (heat) {
      tactical_instruction += ' Heat added cost today; at a cooler gun you can afford the same HR at slightly truer pace early.';
    }
  } else if (avgHrF != null) {
    tactical_instruction = `You averaged ${avgHrF} bpm today — treat that as your early-race HR anchor through ${earlyMilesLabel} at ${raceLabel}, then let pace follow if breathing stays easy.`;
  } else {
    tactical_instruction = `With ${days} days to ${raceLabel}, run the first 2–3 miles ~15–20 s/mi slower than race goal pace feels, then build only if everything feels easy.`;
  }
  if (typeof split === 'number' && Math.abs(split) >= 5) {
    tactical_instruction += ` You faded +${Math.round(split)}s/mi second half today — don't chase early pace that sets up the same pattern.`;
  }
  const planTaper = facts.plan_has_taper === true;
  const nextN = typeof facts.next_session_name === 'string' ? facts.next_session_name : '';
  const nextP = typeof facts.next_session_prescription === 'string' ? facts.next_session_prescription : '';
  let taper_guidance = planTaper
    ? 'Your plan already structures taper — do not add extra volume. Protect sleep, normal fueling, and any short race-pace touches only if legs feel fresh.'
    : 'Keep recovery between hard days honest; avoid stacking fatigue this close to the race.';
  if (planTaper && (nextN || nextP)) {
    taper_guidance += ` Next on plan: ${nextN}${nextP ? ` — ${nextP.slice(0, 120)}` : ''}. Optional sessions are fine to skip if you feel flat.`;
  }
  const headline =
    drift != null && typ != null && drift < typ
      ? `${days} days out — drift beat your typical in tough conditions`
      : typeof dist === 'number'
        ? `${days} days out — ${dist} mi long run checked off`
        : `${days} days out — long work toward ${raceLabel}`;
  return {
    headline,
    verdict,
    tactical_instruction,
    flag: null,
    projection:
      typeof facts.target_race_goal_finish_clock === 'string'
        ? `Goal finish on file: ${facts.target_race_goal_finish_clock}. Treat today as workload confirmation, not a race predictor.`
        : 'No goal finish time on file — set a target in the plan or pace off recent long-run effort.',
    taper_guidance,
  };
}

export async function generateSessionRaceReadinessLlm(
  facts: Record<string, unknown>,
): Promise<SessionRaceReadinessLlmV1 | null> {
  const systemPrompt = `You are an experienced endurance coach. Your job is to produce one JSON object whose string values sound like you are speaking directly to the athlete after studying their long run.

CRITICAL — OUTPUT HYGIENE: Never put fact field names, JSON keys, snake_case identifiers, or technical labels in any string you write. Do not write things like "(conditions_heat_flag)" or "pacing_split_seconds_per_mile". Reason from the numeric values and plain-language ideas only. Say "it peaked near 80°F", not the key name.

Use only numbers and relationships that appear in DATA. Do not invent stats, dates, or race details. If something is missing, omit that thread instead of guessing.

Today's elevation describes this workout's terrain load (use for fitness / drift / pace reads). Never treat it as the race course unless the plan course profile is in DATA (see user instructions).

If DATA includes target_race_distance_miles, finish-time estimates must agree with per-mile pace × that distance (see user instructions).

tactical_instruction must include numbers that appear in today's DATA only — never copy placeholder or example numbers from the instructions (see user instructions).

Output: valid JSON only. No markdown fences, no preamble, no commentary outside the JSON.`;

  const dtr = facts.days_to_race;
  const rname = facts.race_name;
  const daysPart = typeof dtr === 'number' ? String(dtr) : 'unknown';
  const racePart =
    typeof rname === 'string' && String(rname).trim() ? String(rname).trim() : 'the race';

  const userPrompt = `You are an experienced endurance coach. An athlete just finished a long run about ${daysPart} days before ${racePart}. Write a race readiness assessment that reads like a smart coach who actually looked at the numbers — not a system summarizing a form.

DATA (for your eyes only — do not echo key names in your answer):
${JSON.stringify(facts, null, 2)}

HOW TO REASON:

Heart rate: Compare average HR, drift, and typical drift if both exist. If drift is lower than their typical, say plainly that it is a fitness / execution signal. If it was hot (use the temperature values or any described ramp from start to peak), strip the heat tax: late-run HR in rising heat is expected, not automatic loss of fitness. What does the HR story say about aerobic capacity right now?

HR DRIFT CONTEXT (pipeline — use when interpreting "controlled drift"): hr_drift_bpm is the primary aerobic signal: when pace_normalized_drift_bpm is present, hr_drift_bpm matches it (HR change after accounting for intentional pace shift across the run). Otherwise hr_drift_bpm is terrain-adjusted HR drift from this activity's GPS (early vs late grade). hr_drift_bpm_terrain_adjusted is the analyzer's late-minus-early HR after that terrain adjustment (when present). terrain_contribution_bpm is how much raw HR change was attributed to hillier late terrain before that step. hr_drift_explanation classifies the story: "terrain_driven" means late hills largely explain the HR pattern; "cardiac_drift" is aerobic decoupling after pace/terrain accounting; "pace_driven" means HR tracked a deliberate pace change; "mixed" is several factors. When you say their drift was controlled or their aerobic system held steady, ground it in hr_drift_explanation and these fields — not only the magnitude.

Pace: If they slowed (positive split in the data), say so with the actual magnitude. Was it explainable by heat, rolling or hilly terrain, or discipline — vs unexplained collapse? What should they take away for race execution?

Conditions: If the temperature at the end or peak is much higher than at the start, heat was back-loaded and the hardest miles were the hottest — that reframes late fade. When DATA also suggests late climbing (e.g. rolling/hilly elevation_profile, meaningful elevation_gain_ft, hr_drift_explanation "terrain_driven", or positive terrain_contribution_bpm), treat final miles as carrying both heat and grade stress together — not heat alone. Cooler race morning usually means easier early hours — connect that to ${racePart}.

Race day: Tie the threads together for ${racePart} specifically. What does today predict? What should they do the same or differently?

PROJECTION / FINISH TIME SANITY: If DATA includes target_race_distance_miles (e.g. 26.2 for a marathon), any finish-time range you give must match your stated average pace per mile within ~5 minutes — compute: total minutes ≈ (pace minutes per mile) × (race miles). Example: ~10:45/mi for 26.2 mi is about 4h 42m, not 2h 45m. If target_race_distance_miles is null, do not assume 26.2; give pace guidance or a wide honest range and avoid precise finish clocks unless target_race_goal_finish_clock is on file.

Today's route vs ${racePart} (both matter, different roles): Today's elevation gain and terrain profile in DATA reflect the terrain load that shaped this session's drift and pace — reference them when reasoning about fitness and execution under real hills. Do not imply they describe ${racePart}'s course unless DATA includes a plan course profile (course_profile). Without course_profile, keep race-day terrain out of verdict and tactical copy too — not only projection.

COURSE PROFILE RULE (applies especially to "projection"): Only reference race course elevation, net gain/loss, or profile (rolling, hilly, net downhill, etc.) as ${racePart}'s course if DATA includes course_profile from the plan config. If course_profile is absent or empty, do not compare the race to today's route in projection: base "projection" on temperature delta between today's conditions and likely race morning, plus today's HR, pace, and drift. Never use today's elevation_gain_ft or elevation_profile as a stand-in for race terrain (e.g. do not say "similarly rolling (545 ft gain)" for the marathon unless that figure is explicitly race data inside course_profile).

Taper: If their plan already includes taper structure, do not tell them to "cut volume" generically. Say what to protect (sleep, fuel, short sharp work if any) and what optional pieces to skip if tired. Name the actual next session if the data includes it.

TACTICAL_INSTRUCTION (mandatory): One race-day line tied to this session's DATA only. Use whatever anchors exist in DATA: fastest_mile + fastest_mile_pace, avg_pace, hr_drift_bpm vs typical_hr_drift_bpm, avg_hr, pacing_split_seconds_per_mile, temps, distance_miles — combine them so the athlete gets a concrete guardrail (pace ceiling, HR ceiling, or early-mile discipline vs a split they actually ran). Vary the wording run to run; do not reuse canned phrases from week to week if the numbers change.

Shape (illustrative — substitute values ONLY from DATA, never from this prompt): "Your fastest mile was mile [N] at [pace from DATA] — don't run faster than [X] in the early miles at ${racePart}." OR "You averaged [avg_pace] / [avg_hr] bpm — use that as an early cap at ${racePart}." If fastest_mile is missing, use avg_pace or HR; if those are missing, use drift vs typical + duration.

Bad (reject): generic intent with no digits from DATA, or any numbers that are not in DATA for this workout.

OUTPUT RULES:
- Second person ("you", "your").
- Cite real numbers from DATA (+7 bpm, 15 mi, 37 s/mi, °F, etc.) — never cite field names.
- No filler ("great job", "keep it up", "as you prepare").
- If there is no honest concern, "flag" must be null.
- "tactical_instruction" must satisfy TACTICAL_INSTRUCTION above: digits must reflect this session's DATA, not example numbers from the prompt.
- "projection" must include brief reasoning, not only a time — and must follow COURSE PROFILE RULE above (no today's-elevation-as-race-proxy). Pace × target_race_distance_miles must match any finish clock you state (±~5 min).

Respond with this exact JSON shape — string values only where shown, flag may be null:
{
  "headline": "specific, include at least one concrete number or comparison",
  "verdict": "3-4 sentences: coach reasoning tying HR + pace + conditions to race day",
  "tactical_instruction": "one sentence; every number must appear in DATA for this workout — see TACTICAL_INSTRUCTION",
  "flag": "one real concern if the data supports it, otherwise null",
  "projection": "finish or pace estimate with brief reasoning; race terrain only if course_profile in DATA — else temp + HR/pace only",
  "taper_guidance": "2-3 sentences specific to the next ~two weeks — not generic advice"
}`;

  const raw = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 1100,
    temperature: 0.28,
    model: 'sonnet',
  });
  if (raw == null || raw === '') {
    console.warn('[race_readiness_llm] callLLM returned empty — check ANTHROPIC_API_KEY / credits / model');
  }
  const parsed = parseRaceReadinessLlmResponse(raw);
  if (!parsed && raw) {
    console.warn(
      '[race_readiness_llm] empty or invalid LLM response (parse failed or tactical_instruction missing concrete number)',
    );
  }
  return parsed;
}

export async function trySessionRaceReadinessLlm(params: {
  sessionDetail: SessionDetailV1;
  workoutAnalysis: Record<string, unknown> | null;
  planContext: PlanContext;
  row: Record<string, unknown>;
}): Promise<SessionRaceReadinessLlmV1 | null> {
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
    console.warn('[race_readiness_llm] gate_skip:', skip);
    return null;
  }

  const packet = buildSessionRaceReadinessFacts(params);
  const llm = await generateSessionRaceReadinessLlm(packet);
  if (llm) return llm;
  const fb = raceReadinessDeterministicFallback(packet);
  if (fb) {
    console.warn('[race_readiness_llm] using deterministic fallback (LLM empty or parse failed)');
  }
  return fb;
}
