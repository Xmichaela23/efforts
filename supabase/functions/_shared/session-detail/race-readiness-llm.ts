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

  const hrDriftVsTypical =
    typeof hrDrift === 'number' && typeof typicalHrDrift === 'number'
      ? Math.round((hrDrift - typicalHrDrift) * 10) / 10
      : null;

  const gapAdjusted = !!(sd.execution?.gap_adjusted ?? perf?.gap_adjusted);
  const splitFacts = computeMileSplitRaceFacts(wa, derived as Record<string, unknown>, gapAdjusted);

  const driftExplanation =
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
    hr_drift_vs_typical: hrDriftVsTypical,
    drift_explanation: driftExplanation,
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
    const taper_guidance = String(o.taper_guidance || '').trim();
    const flagRaw = o.flag;
    const flag =
      flagRaw === null || flagRaw === undefined || String(flagRaw).toLowerCase() === 'null'
        ? null
        : String(flagRaw).trim() || null;
    if (!headline || !verdict || !tactical_instruction || !projection || !taper_guidance) return null;
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
  const dur = facts.duration_minutes;
  const bits: string[] = [];
  bits.push(`${days} days from ${raceLabel}`);
  if (typeof dist === 'number') bits.push(`${dist} mi in the legs`);
  else if (typeof dur === 'number') bits.push(`${Math.round(dur)} minutes on feet`);
  const exec = facts.execution_score;
  if (typeof exec === 'number') bits.push(`execution vs plan about ${Math.round(exec)}%`);
  const verdict = bits.join('; ') + '. Use pacing and heart-rate rows above as the primary readiness read.';
  const heat = facts.conditions_heat_flag === true;
  const heatNote = typeof facts.conditions_heat_note === 'string' ? facts.conditions_heat_note : '';
  const drift = typeof facts.hr_drift_bpm === 'number' ? facts.hr_drift_bpm : null;
  const typ = typeof facts.typical_hr_drift_bpm === 'number' ? facts.typical_hr_drift_bpm : null;
  let tactical_instruction =
    'Race day: open using the same controlled effort you held mid-run today; let course and weather dictate when to press.';
  if (drift != null && typ != null) {
    tactical_instruction = `HR drift +${Math.round(drift)} bpm vs your typical +${Math.round(typ)} bpm`;
    if (heat) {
      tactical_instruction += heatNote
        ? ` — ${heatNote}`
        : ' — heat was a factor (conditions_heat_flag); cooler race morning should feel easier at the same HR.';
    }
    tactical_instruction += ' Hold the first third conservative relative to that baseline.';
  }
  const split = facts.pacing_split_seconds_per_mile;
  if (typeof split === 'number' && Math.abs(split) >= 5) {
    tactical_instruction += ` Pacing shifted ${split > 0 ? '+' : ''}${split}s/mi second half vs first — use that discipline pattern on race day.`;
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
  return {
    headline: `${days} days out — key long run in the bank`,
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
  const systemPrompt = `You are a performance coach writing race readiness JSON for an athlete.
Write in a direct, specific, unsentimental style. Reason only from the FACTS object — do not invent numbers or dates.
If a fact is missing, do not guess; omit that angle. Output valid JSON only — no markdown, no preamble.`;

  const dtr = facts.days_to_race;
  const rname = facts.race_name;
  const daysPart = typeof dtr === 'number' ? String(dtr) : 'unknown';
  const racePart =
    typeof rname === 'string' && String(rname).trim() ? String(rname).trim() : 'the race';

  const userPrompt = `You are a performance coach writing a race readiness assessment for an athlete ${daysPart} days out from ${racePart}.

Reason from the specific data. Do not write generic training advice. Every sentence should connect directly to a number or condition in the facts below.

FACTS:
${JSON.stringify(facts, null, 2)}

REASONING INSTRUCTIONS:

1. VERDICT: Connect today's session specifically to race day. Reason about:
   - Was HR drift better or worse than typical, and WHY (consider temp: if conditions_heat_flag is true, heat is a factor — strip the heat tax and assess underlying fitness)
   - If conditions_temp_end_f or conditions_temp_peak_f is much higher than conditions_temp_start_f (>8°F delta), heat load was concentrated in the final miles — discount late-run HR rise and pace fade when judging fitness; use conditions_heat_note if present
   - Pacing: positive split (pacing_split_seconds_per_mile > 0) means second half slower — tie to heat, hills (elevation_profile / elevation_gain_ft), discipline, or fatigue. What does it predict for race execution?
   - If conditions_heat_flag is true, explicitly note heat and what the performance means adjusted for that context
   - What does this run predict about race day performance?

2. TACTICAL_INSTRUCTION: One specific, actionable race-day instruction derived from today's data. Reference actual numbers from FACTS where possible.

3. FLAG: One honest concern if the data supports it. Be specific. If none, return null — do not invent.

4. PROJECTION: Estimate finish time or pace range from today's effort, adjusted for likely race conditions (cooler temps, course_profile if present). Brief reasoning.

5. TAPER_GUIDANCE:
   - If plan_has_taper is true AND current_phase suggests taper (or plan_has_taper true): Do NOT say "cut volume" — the plan handles load. Give session-specific guidance for the window before race: what to protect (sleep, fueling, short intensity touch if any), what to avoid (new fatigue/soreness). Reference next_session_name / next_session_prescription when present for optional work.
   - If the athlete showed strain today, note that skipping optional upcoming work can be correct — use next session fields by name.
   - Frame as how to execute the taper already in the plan, not prescribing a new taper.

Respond with this exact JSON structure — no preamble, no markdown:
{
  "headline": "short, specific — days to race and one key finding",
  "verdict": "2-4 sentences. Reason from data to race prediction. No filler.",
  "tactical_instruction": "one race-day instruction with numbers from FACTS where possible",
  "flag": "specific concern or null",
  "projection": "finish time or pace range with brief reasoning",
  "taper_guidance": "2-3 sentences for this athlete and upcoming sessions — not generic volume advice"
}`;

  const raw = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 1100,
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
