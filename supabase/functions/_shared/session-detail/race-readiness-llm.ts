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
  plannedId: string | null;
  raceDateIso: string | null;
  daysUntilRace: number | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  isLongRunLike: boolean;
}): string | null {
  if (!isRunningSessionForRaceReadiness(params.sessionNormType, params.workoutTypeKey)) {
    return `not_run_session(norm=${params.sessionNormType},facts_type=${params.workoutTypeKey})`;
  }
  if (!params.plannedId) return 'no_planned_id';
  if (!params.raceDateIso) return 'no_race_date';
  if (params.daysUntilRace == null || params.daysUntilRace <= 0) return 'race_past_or_unknown_days';
  if (params.daysUntilRace > 21) return `outside_window_days=${params.daysUntilRace}`;
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
  plannedId: string | null;
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

  const hrDrift =
    typeof derived.pace_normalized_drift_bpm === 'number'
      ? derived.pace_normalized_drift_bpm
      : typeof derived.hr_drift_bpm === 'number'
        ? derived.hr_drift_bpm
        : (wa as any)?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ?? null;

  const typicalHrDrift =
    typeof derived.hr_drift_typical === 'number' && Math.abs(derived.hr_drift_typical) >= 1
      ? derived.hr_drift_typical
      : null;

  const pacingRow = Array.isArray(sd.analysis_details?.rows)
    ? sd.analysis_details!.rows!.find((r) => String(r.label || '').toLowerCase() === 'pacing')
    : null;
  const pacingSplit = pacingRow?.value != null ? String(pacingRow.value) : null;

  const hrRow = Array.isArray(sd.analysis_details?.rows)
    ? sd.analysis_details!.rows!.find((r) => String(r.label || '').toLowerCase() === 'heart rate')
    : null;
  const heartRateSummary = hrRow?.value != null ? String(hrRow.value) : null;

  const wx = facts.weather;
  const conditionsTempF =
    wx && typeof wx.temperature_f === 'number' ? Math.round(wx.temperature_f) : null;
  const elevFt =
    typeof facts.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
  const terrainType = typeof facts.terrain_type === 'string' ? facts.terrain_type : null;

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

  const out: Record<string, unknown> = {
    days_to_race: pc.daysUntilRace,
    race_date: pc.raceDateIso,
    race_name: pc.raceName ?? pc.planName,
    race_type: pc.goalProfileOrDistance,
    course_profile: pc.courseProfileJson,
    workout_date: sd.date,
    distance_miles: distanceMiles,
    duration_minutes: durationMinutes,
    avg_pace: avgPace,
    avg_hr: typeof avgHr === 'number' ? Math.round(avgHr) : avgHr,
    max_hr: typeof maxHr === 'number' ? Math.round(maxHr) : maxHr,
    hr_drift_bpm: typeof hrDrift === 'number' ? Math.round(hrDrift * 10) / 10 : hrDrift,
    typical_hr_drift_bpm:
      typeof typicalHrDrift === 'number' ? Math.round(typicalHrDrift * 10) / 10 : null,
    pacing_split: pacingSplit,
    heart_rate_row_summary: heartRateSummary,
    conditions_temp_f: conditionsTempF,
    elevation_gain_ft: elevFt,
    terrain_type: terrainType,
    execution_score: sd.execution?.execution_score ?? perf.execution_adherence ?? null,
    pace_adherence_pct: sd.execution?.pace_adherence ?? perf.pace_adherence ?? null,
    duration_adherence_pct: sd.execution?.duration_adherence ?? perf.duration_adherence ?? null,
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

function parseRaceReadinessLlmResponse(text: string | null): SessionRaceReadinessLlmV1 | null {
  if (!text) return null;
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) return null;
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    const headline = String(o.headline || '').trim();
    const verdict = String(o.verdict || '').trim();
    const tactical_instruction = String(o.tactical_instruction || '').trim();
    const projection = String(o.projection || '').trim();
    const flagRaw = o.flag;
    const flag =
      flagRaw === null || flagRaw === undefined || String(flagRaw).toLowerCase() === 'null'
        ? null
        : String(flagRaw).trim() || null;
    if (!headline || !verdict || !tactical_instruction || !projection) return null;
    return { headline, verdict, tactical_instruction, flag, projection };
  } catch {
    return null;
  }
}

export async function generateSessionRaceReadinessLlm(
  facts: Record<string, unknown>,
): Promise<SessionRaceReadinessLlmV1 | null> {
  const systemPrompt = `You are a performance coach analyzing a long training run to assess race readiness.
You write in a direct, specific, unsentimental style — no filler, no cheerleading.
You reason only from the FACTS object provided. Do not invent numbers, dates, or metrics not present in FACTS.
If a field is missing, do not guess — omit reference to it.
Respond only with valid JSON matching the schema in the user message — no markdown, no prose outside JSON.`;

  const userPrompt = `Analyze this long run and produce a race readiness assessment.

FACTS:
${JSON.stringify(facts, null, 2)}

Respond with this exact JSON structure (all string fields; flag may be null):
{
  "headline": "one sentence, e.g. '14 days out — fitness confirmed, execution clean'",
  "verdict": "2-3 sentences connecting today's data specifically to the upcoming race date in FACTS. Use only FACTS.",
  "tactical_instruction": "one specific, actionable instruction for race day based on FACTS",
  "flag": "one honest concern if one exists, otherwise null. Be specific.",
  "projection": "pace or time range estimate grounded in FACTS only; if insufficient data, say what is missing"
}`;

  const raw = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 900,
    temperature: 0.2,
    model: 'sonnet',
  });
  if (raw == null || raw === '') {
    console.warn('[race_readiness_llm] callLLM returned empty — check ANTHROPIC_API_KEY / credits / model');
  }
  const parsed = parseRaceReadinessLlmResponse(raw);
  if (!parsed && raw) {
    console.warn('[race_readiness_llm] empty or invalid LLM response (parse failed)');
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
    plannedId: sd.plan_context?.planned_id ?? null,
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
  return await generateSessionRaceReadinessLlm(packet);
}
