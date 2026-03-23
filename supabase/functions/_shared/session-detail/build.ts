// =============================================================================
// SESSION_DETAIL_V1 — Build from snapshot slice + workout_analysis
// =============================================================================

import type { SessionDetailV1, IntervalRow, SessionInterpretation, DeviationDimension, DeviationDirection } from './types.ts';
import type { LedgerDay, ActualSession, PlannedSession, SessionMatch } from '../athlete-snapshot/types.ts';

function normType(t: string | null | undefined): string {
  const s = String(t || '').toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  if (s.startsWith('yoga') || s.startsWith('pilates') || s.startsWith('mobility')) return 'mobility';
  return s || 'other';
}

export type SessionDetailInput = {
  workoutId: string;
  workoutDate: string;
  workoutType: string;
  workoutName: string | null;
  ledgerDay: LedgerDay | null;
  actualSession: ActualSession | null;
  match: SessionMatch | null;
  plannedSession: PlannedSession | null;
  /** Raw planned_workouts row with strength_exercises (for strength weight deviation) */
  plannedRowRaw?: { strength_exercises?: any[]; computed?: any } | null;
  /** Completed workout strength_exercises (for strength weight deviation) */
  completedStrengthExercises?: any[] | null;
  observations: string[];
  workoutAnalysis: Record<string, unknown> | null;
  narrativeText: string | null;
  /** Optional: from body_response.load_status for weekly_impact */
  loadStatus?: { status: 'on_target' | 'high' | 'elevated' | 'under'; interpretation?: string } | null;
  /** Completed workout's `computed` field (from compute-workout-analysis). */
  completedComputed?: Record<string, unknown> | null;
  /** Completed workout's refined_type (e.g. 'pool_swim', 'open_water_swim'). */
  completedRefinedType?: string | null;
};

export function buildSessionDetailV1(input: SessionDetailInput): SessionDetailV1 {
  const {
    workoutId,
    workoutDate,
    workoutType,
    workoutName,
    ledgerDay,
    actualSession,
    match,
    plannedSession,
    plannedRowRaw,
    completedStrengthExercises,
    observations,
    workoutAnalysis,
    narrativeText,
    loadStatus,
    completedComputed,
    completedRefinedType,
  } = input;

  const type = normType(workoutType) as SessionDetailV1['type'];
  const wa = workoutAnalysis || {};
  const perf = (wa as any).performance || {};
  const sessionState = (wa as any).session_state_v1 || {};
  const factPacket = (wa as any).fact_packet_v1 || (sessionState?.details as any)?.fact_packet_v1;
  const granular = (wa as any).granular_analysis || {};
  const detailed = (wa as any).detailed_analysis || {};
  const adherenceSummary = (wa as any).adherence_summary ?? sessionState?.details?.adherence_summary ?? null;
  const flagsV1: any[] = Array.isArray(sessionState?.details?.flags_v1) ? sessionState.details.flags_v1 : [];
  const ib = detailed?.interval_breakdown || granular?.interval_breakdown;
  const comp = (completedComputed || {}) as any;
  const compOverall = comp?.overall || {};
  const plannedComp = (plannedRowRaw as any)?.computed || {};

  // ── Execution resolution ───────────────────────────────────────────────────
  const paceAdherence = fin(perf?.pace_adherence);
  const powerAdherence = fin(perf?.power_adherence);
  const durationAdherence = fin(perf?.duration_adherence);

  let executionScore: number | null = null;
  if (actualSession?.execution_score != null && Number.isFinite(Number(actualSession.execution_score))) {
    executionScore = Number(actualSession.execution_score);
  }
  if (executionScore === null && Number.isFinite(perf?.execution_adherence)) {
    executionScore = perf.execution_adherence;
  }
  if (executionScore === null && Number.isFinite(sessionState?.glance?.execution_score)) {
    executionScore = sessionState.glance.execution_score;
  }
  if (executionScore === 0) {
    const fromPerf = fin(perf?.execution_adherence);
    if (fromPerf != null && fromPerf > 0) {
      executionScore = fromPerf;
    } else {
      const parts: number[] = [];
      if (paceAdherence != null && paceAdherence > 0) parts.push(paceAdherence);
      if (powerAdherence != null && powerAdherence > 0) parts.push(powerAdherence);
      if (durationAdherence != null && durationAdherence > 0) parts.push(durationAdherence);
      if (parts.length > 0) {
        executionScore = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
      }
    }
  }

  const assessedAgainst = factPacket?.derived?.execution?.assessed_against ?? null;
  const hasPlanned = !!plannedSession && !!match?.planned_id;
  const planModified = assessedAgainst === 'actual';
  const allZero =
    (executionScore ?? 0) === 0 &&
    (paceAdherence ?? 0) === 0 &&
    (powerAdherence ?? 0) === 0 &&
    (durationAdherence ?? 0) === 0;

  const showAdherenceChips =
    hasPlanned && !planModified && !allZero &&
    (executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null);

  const hasMeasuredExecution =
    executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null;

  const weightDev = computeStrengthWeightDeviation(type, plannedRowRaw, completedStrengthExercises);
  const volumeDev = computeStrengthVolumeDeviation(type, plannedRowRaw, completedStrengthExercises);

  // ── Interval rows (pre-resolved) ──────────────────────────────────────────
  const intervalDisplay = sessionState?.details?.interval_display || {};
  const sessionRows: any[] = Array.isArray(sessionState?.details?.interval_rows) ? sessionState.details.interval_rows : [];

  const intervals: IntervalRow[] = [];
  if (ib?.available && Array.isArray(ib.intervals)) {
    for (const iv of ib.intervals) {
      const lower = iv.planned_pace_range_lower ?? iv.planned_pace_range?.lower;
      const upper = iv.planned_pace_range_upper ?? iv.planned_pace_range?.upper;
      const sr = sessionRows.find((r: any) =>
        r.planned_step_id === iv.interval_id || r.row_id === iv.interval_id,
      ) ?? null;
      const paceRaw = fin(iv?.actual_pace_min_per_mi);
      const paceSec = paceRaw != null ? Math.round(paceRaw * 60) : (fin(sr?.executed?.actual_pace_sec_per_mi) ?? null);
      const hasRange = Number.isFinite(lower) && Number.isFinite(upper);
      intervals.push({
        id: String(iv?.interval_id || iv?.interval_number || intervals.length),
        interval_type: normIntervalType(iv?.interval_type || iv?.kind),
        interval_number: typeof iv?.interval_number === 'number' ? iv.interval_number : undefined,
        recovery_number: typeof iv?.recovery_number === 'number' ? iv.recovery_number : undefined,
        planned_label: String(sr?.planned_label ?? iv?.planned_label ?? iv?.interval_type ?? ''),
        planned_duration_s: fin(iv?.planned_duration_s),
        planned_pace_range: hasRange ? { lower_sec_per_mi: Number(lower), upper_sec_per_mi: Number(upper) } : undefined,
        planned_pace_display: typeof sr?.planned_pace_display === 'string' ? sr.planned_pace_display : (hasRange ? fmtPaceRange(Number(lower), Number(upper)) : null),
        executed: {
          duration_s: fin(iv?.actual_duration_s) ?? fin(sr?.executed?.duration_s),
          distance_m: fin(iv?.actual_distance_m) ?? fin(sr?.executed?.distance_m),
          avg_hr: fin(iv?.avg_heart_rate_bpm) ?? fin(sr?.executed?.avg_hr),
          actual_pace_sec_per_mi: paceSec,
          actual_gap_sec_per_mi: null,
          power_watts: fin(iv?.avg_power_watts) ?? null,
        },
        pace_adherence_pct: fin(sr?.adherence_pct) ?? fin(iv?.pace_adherence_percent),
        duration_adherence_pct: fin(iv?.duration_adherence_percent),
      });
    }
  }

  const intervalDisplayMode = (() => {
    const m = String(intervalDisplay?.mode || '');
    if (m === 'interval_compare_ready' || m === 'overall_only' || m === 'awaiting_recompute') return m as any;
    return 'none' as const;
  })();

  // ── Summary (pre-merged bullets) ───────────────────────────────────────────
  const summaryTitle = String(sessionState?.summary?.title || 'Insights');
  const summaryBullets = mergeDedupe(
    arrayOfStrings(sessionState?.summary?.bullets),
    arrayOfStrings(observations),
    arrayOfStrings(sessionState?.narrative?.observations),
  );

  // ── Narrative ──────────────────────────────────────────────────────────────
  const llmNarrative = (typeof narrativeText === 'string' && narrativeText.trim()) ||
    (typeof sessionState?.narrative?.text === 'string' ? sessionState.narrative.text.trim() : '') || null;
  const resolvedNarrative = llmNarrative || buildFallbackNarrative(
    factPacket, executionScore, type, !!match?.planned_id, match?.summary ?? null, !!perf?.gap_adjusted,
  );

  // ── Planned totals (must come before completed — swim unit needed for pace calc) ─
  const plannedTotals: SessionDetailV1['planned_totals'] = buildPlannedTotals(plannedComp, plannedSession, plannedRowRaw);

  // ── Completed totals ───────────────────────────────────────────────────────
  const completedDurS = fin(compOverall?.duration_s_moving);
  const completedDistM = fin(compOverall?.distance_m);
  const swimUnit = plannedTotals.swim_unit || 'yd';
  const completedSwimPer100 = (() => {
    if (type !== 'swim') return null;
    if (completedDurS != null && completedDurS > 0 && completedDistM != null && completedDistM > 0) {
      const per100count = swimUnit === 'yd' ? (completedDistM / 0.9144) / 100 : completedDistM / 100;
      if (per100count > 0) return Math.round(completedDurS / per100count);
    }
    return null;
  })();
  const completedTotals: SessionDetailV1['completed_totals'] = {
    duration_s: completedDurS,
    distance_m: completedDistM,
    avg_pace_s_per_mi: fin(compOverall?.avg_pace_s_per_mi),
    avg_gap_s_per_mi: fin(compOverall?.avg_gap_s_per_mi),
    avg_hr: fin(compOverall?.avg_hr) ?? fin(actualSession?.avg_heart_rate as any),
    swim_pace_per_100_s: completedSwimPer100,
  };

  // ── Week label ─────────────────────────────────────────────────────────────
  const weekLabel = buildWeekLabel(factPacket);

  // ── Analysis detail rows ───────────────────────────────────────────────────
  const analysisDetailRows = buildAnalysisDetailRows(factPacket, flagsV1, summaryBullets.length > 0, comp);

  // ── Adherence narrative ────────────────────────────────────────────────────
  const techInsights: Array<{ label: string; value: string }> = Array.isArray(adherenceSummary?.technical_insights)
    ? adherenceSummary.technical_insights
        .filter((t: any) => t?.label && t?.value)
        .map((t: any) => ({ label: String(t.label), value: String(t.value) }))
    : [];
  const planImpactText = (() => {
    const fromMatch = match?.summary;
    if (typeof fromMatch === 'string' && fromMatch.trim()) return fromMatch.trim();
    const outlook = adherenceSummary?.plan_impact?.outlook;
    if (typeof outlook === 'string' && outlook.trim() && outlook !== 'No plan context.') return outlook.trim();
    return null;
  })();
  const planImpactLabel = (() => {
    if (match?.summary) return 'Plan context';
    const focus = adherenceSummary?.plan_impact?.focus;
    return typeof focus === 'string' && focus ? String(focus).replace(/coach/ig, 'training') : null;
  })();

  // ── Classification ─────────────────────────────────────────────────────────
  const isStructuredInterval = (() => {
    if (intervalDisplayMode === 'interval_compare_ready') return true;
    if (intervalDisplayMode === 'overall_only') return false;
    if (intervalDisplayMode === 'awaiting_recompute') return true;
    const pSteps: any[] = Array.isArray(plannedComp?.steps) ? plannedComp.steps : [];
    return pSteps.filter((s: any) => s?.kind === 'work' || s?.type === 'work' || s?.kind === 'interval').length >= 2;
  })();
  const isEasyLike = (() => {
    const fpFacts = factPacket?.facts;
    if (!fpFacts) return false;
    const wt = String(fpFacts.workout_type || '').toLowerCase();
    const wi = String(fpFacts.plan?.week_intent || '').toLowerCase();
    const rw = !!fpFacts.plan?.is_recovery_week;
    return rw || /easy|recovery|long\s?run|base|endurance/i.test(wt) || /recovery|easy/i.test(wi);
  })();
  const isAutoLapOrSplit = !!(detailed?.interval_breakdown?.is_auto_lap_or_split);
  const isPoolSwim = type === 'swim' && (
    String(completedRefinedType || '').toLowerCase() === 'pool_swim' ||
    (String(completedRefinedType || '').toLowerCase() !== 'open_water_swim')
  );

  // ── Splits ─────────────────────────────────────────────────────────────────
  const rawSplitsMi: any[] = Array.isArray(comp?.analysis?.events?.splits?.mi)
    ? comp.analysis.events.splits.mi : [];
  const splitsMi: SessionDetailV1['splits_mi'] = rawSplitsMi.map((s: any) => ({
    n: Number(s?.n) || 0,
    pace_s_per_mi: fin(s?.avgPace_s_per_km) != null ? Math.round(Number(s.avgPace_s_per_km) * 1.60934) : null,
    gap_s_per_mi: fin(s?.avgGapPace_s_per_km) != null ? Math.round(Number(s.avgGapPace_s_per_km) * 1.60934) : null,
    grade_pct: fin(s?.avgGrade_pct),
    hr: fin(s?.avgHr_bpm),
  }));

  // ── Pacing CV ──────────────────────────────────────────────────────────────
  const pacingCV = fin((wa as any)?.analysis?.pacing_analysis?.pacing_variability?.coefficient_of_variation)
    ?? fin(granular?.pacing_analysis?.pacing_variability?.coefficient_of_variation);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    workout_id: workoutId,
    date: workoutDate,
    type,
    name: workoutName || workoutType || 'Workout',

    plan_context: {
      planned_id: match?.planned_id ?? null,
      planned: plannedSession
        ? {
            planned_id: plannedSession.planned_id,
            type: plannedSession.type,
            name: plannedSession.name,
            prescription: plannedSession.prescription,
            duration_seconds: plannedSession.duration_seconds,
            distance_meters: plannedSession.distance_meters,
            load_planned: plannedSession.load_planned,
            strength_prescription: plannedSession.strength_prescription,
          }
        : null,
      match: match
        ? {
            endurance_quality: match.endurance_quality as SessionDetailV1['plan_context']['match']['endurance_quality'],
            strength_quality: match.strength_quality as SessionDetailV1['plan_context']['match']['strength_quality'],
            summary: match.summary,
          }
        : null,
      week_label: weekLabel,
    },

    execution: {
      execution_score: executionScore != null ? Math.round(executionScore) : null,
      pace_adherence: paceAdherence != null ? Math.round(paceAdherence) : null,
      power_adherence: powerAdherence != null ? Math.round(powerAdherence) : null,
      duration_adherence: durationAdherence != null ? Math.round(durationAdherence) : null,
      performance_assessment: granular?.performance_assessment ?? null,
      assessed_against: assessedAgainst,
      status_label: sessionState?.glance?.status_label ?? null,
      gap_adjusted: !!perf?.gap_adjusted,
    },

    observations,
    narrative_text: resolvedNarrative,

    summary: { title: summaryTitle, bullets: summaryBullets },

    completed_totals: completedTotals,
    planned_totals: plannedTotals,

    analysis_details: { rows: analysisDetailRows },

    adherence: {
      technical_insights: techInsights,
      plan_impact_label: planImpactLabel,
      plan_impact_text: planImpactText,
    },

    intervals,
    intervals_display: {
      mode: intervalDisplayMode,
      reason: intervalDisplay?.reason ?? null,
    },

    classification: {
      is_structured_interval: isStructuredInterval,
      is_easy_like: isEasyLike,
      is_auto_lap_or_split: isAutoLapOrSplit,
      is_pool_swim: isPoolSwim,
    },

    splits_mi: splitsMi,
    pacing: { coefficient_of_variation: pacingCV },

    display: {
      show_adherence_chips: showAdherenceChips,
      interval_display_reason: intervalDisplay?.reason ?? null,
      has_measured_execution: hasMeasuredExecution,
    },

    strength_weight_deviation: weightDev,
    strength_volume_deviation: volumeDev,
    session_interpretation: buildSessionInterpretation({
      type,
      match,
      plannedSession,
      executionScore,
      paceAdherence,
      powerAdherence,
      durationAdherence,
      weightDeviation: weightDev,
      volumeDeviation: volumeDev,
      loadStatus,
      planContextSummary: match?.summary ?? null,
      intervals,
    }),
  };
}

// ── Helpers for builder ────────────────────────────────────────────────────

function fin(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((b: any) => typeof b === 'string' && b.trim().length > 0).map((b: string) => b.trim());
}

function mergeDedupe(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const b of list) {
      const k = b.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(b); }
    }
  }
  return out;
}

function normIntervalType(t: unknown): IntervalRow['interval_type'] {
  const s = String(t || 'work').toLowerCase();
  if (s === 'warmup' || s === 'warm_up' || s === 'warm-up') return 'warmup';
  if (s === 'cooldown' || s === 'cool_down' || s === 'cool-down') return 'cooldown';
  if (s === 'recovery' || s === 'rest') return 'recovery';
  return 'work';
}

function fmtPaceRange(lowerSec: number, upperSec: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.round(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  };
  return `${fmt(lowerSec)}-${fmt(upperSec)}/mi`;
}

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

/** Deterministic coaching paragraph built from structured data when LLM is unavailable.
 *  Follows the same principle as the LLM prompt: lead with insight, not metrics. */
function buildFallbackNarrative(
  factPacket: any, executionScore: number | null, type: string,
  hasPlanned: boolean, _matchSummary: string | null, gapAdjusted: boolean,
): string | null {
  if (!factPacket) return null;
  const facts = factPacket.facts || {};
  const derived = factPacket.derived || {};

  const pace = typeof facts.avg_pace_sec_per_mi === 'number' ? facts.avg_pace_sec_per_mi : null;
  const gap = typeof facts.avg_gap_sec_per_mi === 'number' ? facts.avg_gap_sec_per_mi : null;
  const avgHr = typeof facts.avg_hr === 'number' ? facts.avg_hr : null;
  const terrain = typeof facts.terrain_type === 'string' && facts.terrain_type !== 'flat' ? facts.terrain_type : null;
  const elevFt = typeof facts.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
  const wx = facts.weather;
  const driftBpm = typeof derived.hr_drift_bpm === 'number' ? derived.hr_drift_bpm : null;
  const driftTyp = typeof derived.hr_drift_typical === 'number' ? derived.hr_drift_typical : null;
  const vsSim = derived.comparisons?.vs_similar;
  const fatigue = derived.training_load;
  const typeLabel = type === 'run' ? 'run' : type === 'ride' ? 'ride' : type === 'swim' ? 'swim' : 'workout';

  const sentences: string[] = [];

  // Lead: similar-run trend (most interesting insight if available)
  if (vsSim && typeof vsSim.sample_size === 'number' && vsSim.sample_size > 0 && vsSim.assessment !== 'insufficient_data') {
    const pDelta = typeof vsSim.pace_delta_sec === 'number' ? vsSim.pace_delta_sec : null;
    if (vsSim.assessment === 'better_than_usual' && pDelta != null && Math.abs(pDelta) >= 3) {
      sentences.push(`You're ${Math.abs(Math.round(pDelta))}s/mi faster than your last ${vsSim.sample_size} comparable ${typeLabel}s${avgHr != null ? ' at similar HR' : ''} — real progress.`);
    } else if (vsSim.assessment === 'worse_than_usual' && pDelta != null && Math.abs(pDelta) >= 3) {
      sentences.push(`This came in ${Math.abs(Math.round(pDelta))}s/mi slower than your recent comparable ${typeLabel}s.`);
    } else {
      sentences.push(`Right in line with your typical pace across ${vsSim.sample_size} similar ${typeLabel}s.`);
    }
  }

  // Terrain + GAP: connect hills to pace when relevant
  if (gapAdjusted && gap != null && pace != null && Math.abs(pace - gap) > 5) {
    const costSec = Math.round(pace - gap);
    sentences.push(`The ${terrain || 'hilly'} course${elevFt != null && elevFt > 50 ? ` (${elevFt} ft gain)` : ''} cost about ${costSec}s/mi — effort-adjusted pace was ${fmtPace(gap)} vs ${fmtPace(pace)} actual.`);
  } else if (terrain && elevFt != null && elevFt > 50) {
    sentences.push(`${terrain.charAt(0).toUpperCase() + terrain.slice(1)} course with ${elevFt} ft of climbing.`);
  }

  // HR drift: interpret, don't just report
  if (driftBpm != null && Math.abs(driftBpm) >= 3) {
    if (driftTyp != null && Math.abs(driftBpm) - Math.abs(driftTyp) <= 3) {
      sentences.push(`HR drift was normal for this effort — no red flags.`);
    } else if (driftBpm > 0 && terrain) {
      sentences.push(`HR climbed ${Math.abs(Math.round(driftBpm))} bpm, consistent with the ${terrain} terrain — you were climbing, not fading.`);
    } else if (driftBpm > 0 && driftTyp != null && Math.abs(driftBpm) > Math.abs(driftTyp) + 3) {
      sentences.push(`HR drifted +${Math.abs(Math.round(driftBpm))} bpm, more than your typical +${Math.abs(Math.round(driftTyp))} — worth checking hydration and sleep.`);
    }
  }

  // Heat: only mention if it matters
  if (wx?.heat_stress_level && wx.heat_stress_level !== 'none') {
    const tempF = typeof wx.temperature_f === 'number' ? Math.round(wx.temperature_f) : null;
    if (tempF != null) {
      sentences.push(`${wx.heat_stress_level.charAt(0).toUpperCase() + wx.heat_stress_level.slice(1)} heat stress at ${tempF}°F — expect pace to run slower in these conditions.`);
    }
  }

  // Fatigue / load: make it actionable
  if (fatigue?.cumulative_fatigue && fatigue.cumulative_fatigue !== 'low') {
    const weekPct = typeof fatigue.week_load_pct === 'number' ? fatigue.week_load_pct : null;
    if (weekPct != null && weekPct > 120) {
      sentences.push(`Weekly load is running hot at ${Math.round(weekPct)}% — easy day tomorrow.`);
    } else if (fatigue.cumulative_fatigue === 'high') {
      sentences.push(`Fatigue is accumulating — recovery before the next key session matters.`);
    }
  }

  // Execution: brief context if planned
  if (sentences.length === 0 && hasPlanned && executionScore != null && executionScore >= 90) {
    sentences.push(`Clean ${typeLabel} — hit plan targets with ${Math.round(executionScore)}% execution. Nothing to flag.`);
  } else if (sentences.length === 0 && hasPlanned && executionScore != null) {
    sentences.push(`Execution came in at ${Math.round(executionScore)}% of plan.`);
  }

  return sentences.length >= 1 ? sentences.join(' ') : null;
}

function buildWeekLabel(factPacket: any): string | null {
  try {
    const plan = factPacket?.facts?.plan;
    if (!plan) return null;
    const weekNum = typeof plan?.week_number === 'number' ? plan.week_number : null;
    const focusLabel = typeof plan?.week_focus_label === 'string' && plan.week_focus_label ? plan.week_focus_label : null;
    const phase = typeof plan?.phase === 'string' && plan.phase ? plan.phase : null;
    const weekIntent = typeof plan?.week_intent === 'string' && plan.week_intent && plan.week_intent !== 'unknown' ? plan.week_intent : null;
    const humanLabel = focusLabel || phase || (weekIntent ? weekIntent.charAt(0).toUpperCase() + weekIntent.slice(1) : null);
    if (!humanLabel) return null;
    return weekNum != null ? `Week ${weekNum} • ${humanLabel}` : humanLabel;
  } catch { return null; }
}

function buildPlannedTotals(
  plannedComp: any, plannedSession: PlannedSession | null, plannedRowRaw: any,
): SessionDetailV1['planned_totals'] {
  const steps: any[] = Array.isArray(plannedComp?.steps) ? plannedComp.steps : [];
  const durS = (() => {
    const t = fin(plannedComp?.total_duration_seconds);
    if (t != null && t > 0) return t;
    let sum = 0;
    for (const st of steps) {
      sum += Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0;
    }
    return sum > 0 ? sum : fin(plannedSession?.duration_seconds);
  })();
  const distM = (() => {
    let m = 0;
    for (const st of steps) {
      const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0);
      if (Number.isFinite(dm) && dm > 0) m += dm;
    }
    return m > 0 ? Math.round(m) : fin(plannedSession?.distance_meters);
  })();
  const avgPace = (() => {
    if (durS != null && durS > 0 && distM != null && distM > 0) {
      const miles = distM / 1609.34;
      if (miles > 0.01) return Math.round(durS / miles);
    }
    return null;
  })();
  const swimUnit = (() => {
    const u = String(plannedRowRaw?.swim_unit || '').toLowerCase();
    if (u === 'yd' || u === 'yards') return 'yd' as const;
    if (u === 'm' || u === 'meters' || u === 'metres') return 'm' as const;
    return null;
  })();
  const swimPer100 = (() => {
    const baseline = fin(plannedRowRaw?.baselines_template?.swim_pace_per_100_sec)
      ?? fin(plannedRowRaw?.baselines?.swim_pace_per_100_sec);
    if (baseline != null && baseline > 0) return Math.round(baseline);
    if (durS != null && durS > 0 && distM != null && distM > 0) {
      const unit = swimUnit || 'yd';
      const per100count = unit === 'yd' ? (distM / 0.9144) / 100 : distM / 100;
      if (per100count > 0) return Math.round(durS / per100count);
    }
    return null;
  })();
  return { duration_s: durS, distance_m: distM, avg_pace_s_per_mi: avgPace, swim_pace_per_100_s: swimPer100, swim_unit: swimUnit };
}

function buildAnalysisDetailRows(
  factPacket: any, flagsV1: any[], hasBullets: boolean, comp: any,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (!factPacket) return rows;
  const derived = factPacket?.derived;

  try {
    const stim = derived?.stimulus;
    if (stim && typeof stim.achieved === 'boolean') {
      rows.push({
        label: 'Stimulus',
        value: stim.achieved
          ? `Achieved (${stim.confidence}). ${Array.isArray(stim.evidence) && stim.evidence[0] ? stim.evidence[0] : ''}`.trim()
          : `Possibly missed (${stim.confidence}). ${stim.partial_credit || ''}`.trim(),
      });
    }
  } catch { /* */ }

  try {
    const lim = derived?.primary_limiter;
    if (lim?.limiter) {
      const conf = typeof lim.confidence === 'number' ? Math.round(lim.confidence * 100) : null;
      const ev0 = Array.isArray(lim.evidence) && lim.evidence[0] ? String(lim.evidence[0]) : '';
      rows.push({
        label: 'Limiter',
        value: `${String(lim.limiter)}${conf != null ? ` (${conf}%)` : ''}${ev0 ? ` — ${ev0}` : ''}`.trim(),
      });
    }
  } catch { /* */ }

  try {
    const vs = derived?.comparisons?.vs_similar;
    if (vs && typeof vs.sample_size === 'number' && vs.sample_size > 0 && vs.assessment !== 'insufficient_data') {
      const map: Record<string, string> = {
        better_than_usual: 'Faster than usual',
        typical: 'In line with your typical pace',
        worse_than_usual: 'Slower than usual',
      };
      const label = map[String(vs.assessment)] || String(vs.assessment);
      const parts: string[] = [label];
      const paceDelta = typeof vs.pace_delta_sec === 'number' && Math.abs(vs.pace_delta_sec) >= 3
        ? vs.pace_delta_sec : null;
      const hrDelta = typeof vs.hr_delta_bpm === 'number' && Math.abs(vs.hr_delta_bpm) >= 2
        ? vs.hr_delta_bpm : null;
      if (paceDelta != null) {
        const abs = Math.abs(Math.round(paceDelta));
        parts[0] += ` by ${abs}s/mi`;
      }
      parts[0] += ` across ${vs.sample_size} similar run${vs.sample_size === 1 ? '' : 's'}`;
      if (hrDelta != null) {
        const sign = hrDelta > 0 ? '+' : '';
        parts.push(`HR ${sign}${Math.round(hrDelta)} bpm vs similar efforts`);
      }
      rows.push({ label: 'Similar workouts', value: parts.join('. ') });
    }
  } catch { /* */ }

  try {
    const tr = derived?.comparisons?.trend;
    if (tr && typeof tr.data_points === 'number' && tr.data_points > 0 && tr.direction !== 'insufficient_data') {
      rows.push({
        label: 'Trend',
        value: `${String(tr.direction)}${tr.magnitude ? ` — ${tr.magnitude}` : ''}`.trim(),
      });
    }
  } catch { /* */ }

  try {
    const splitsMi: any[] = Array.isArray(comp?.analysis?.events?.splits?.mi) ? comp.analysis.events.splits.mi : [];
    const splits = splitsMi.map((s: any) => {
      const pacePerKm = Number(s?.avgPace_s_per_km);
      return { mile: Number(s?.n), pace: Number.isFinite(pacePerKm) && pacePerKm > 0 ? pacePerKm * 1.60934 : NaN };
    }).filter((s) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);

    if (splits.length >= 2) {
      const firstPace = splits[0].pace;
      const lastPace = splits[splits.length - 1].pace;
      const diff = firstPace - lastPace;
      const absDiff = Math.abs(Math.round(diff));
      let pattern: string;
      if (absDiff <= 15) {
        pattern = 'Even pacing';
      } else if (diff > 0) {
        pattern = `Negative split — finished ${absDiff}s/mi faster than you started`;
      } else {
        pattern = `Positive split — slowed ${absDiff}s/mi over the run`;
      }

      const fastest = splits.reduce((a, b) => a.pace < b.pace ? a : b);
      const fm = Math.floor(fastest.pace / 60);
      const fs = Math.round(fastest.pace % 60);
      const fastestStr = `Fastest: Mile ${fastest.mile} at ${fm}:${String(fs).padStart(2, '0')}/mi`;

      rows.push({ label: 'Pacing', value: `${pattern}. ${fastestStr}` });
    }
  } catch { /* */ }

  try {
    const driftBpm = typeof derived?.hr_drift_bpm === 'number' ? derived.hr_drift_bpm : null;
    const driftTypical = typeof derived?.hr_drift_typical === 'number' ? derived.hr_drift_typical : null;
    if (driftBpm != null && Math.abs(driftBpm) >= 3) {
      const sign = driftBpm > 0 ? '+' : '';
      let value = `Drifted ${sign}${Math.round(driftBpm)} bpm over the session`;
      if (driftTypical != null && Math.abs(driftTypical) >= 1) {
        const typSign = driftTypical > 0 ? '+' : '';
        const delta = Math.abs(driftBpm) - Math.abs(driftTypical);
        if (Math.abs(delta) <= 3) {
          value += ` — within your normal range (typical ${typSign}${Math.round(driftTypical)})`;
        } else if (delta > 0) {
          value += ` — higher than your typical ${typSign}${Math.round(driftTypical)} bpm`;
        } else {
          value += ` — lower than your typical ${typSign}${Math.round(driftTypical)} bpm`;
        }
      }
      rows.push({ label: 'Heart rate', value });
    }
  } catch { /* */ }

  try {
    const facts = factPacket?.facts;
    const wx = facts?.weather;
    const terrainType = typeof facts?.terrain_type === 'string' && facts.terrain_type !== 'flat'
      ? facts.terrain_type : null;
    const elevFt = typeof facts?.elevation_gain_ft === 'number' ? Math.round(facts.elevation_gain_ft) : null;
    const tempF = typeof wx?.temperature_f === 'number' ? Math.round(wx.temperature_f) : null;
    const humidity = typeof wx?.humidity_pct === 'number' ? Math.round(wx.humidity_pct) : null;
    const heatLevel = typeof wx?.heat_stress_level === 'string' && wx.heat_stress_level !== 'none'
      ? wx.heat_stress_level : null;

    const parts: string[] = [];
    if (terrainType && elevFt != null && elevFt > 0) {
      parts.push(`${terrainType.charAt(0).toUpperCase() + terrainType.slice(1)} (${elevFt} ft gain)`);
    } else if (elevFt != null && elevFt > 50) {
      parts.push(`${elevFt} ft elevation gain`);
    }
    if (tempF != null) {
      let wxStr = `${tempF}°F`;
      if (humidity != null && humidity >= 50) wxStr += `, ${humidity}% humidity`;
      if (heatLevel) wxStr += ` (${heatLevel} heat stress)`;
      parts.push(wxStr);
    }
    if (parts.length > 0) {
      rows.push({ label: 'Conditions', value: parts.join(' · ') });
    }
  } catch { /* */ }

  try {
    const tl = derived?.training_load;
    if (tl && typeof tl.cumulative_fatigue === 'string') {
      const evidence = Array.isArray(tl.fatigue_evidence) && tl.fatigue_evidence.length > 0
        ? tl.fatigue_evidence.join(' — ')
        : tl.cumulative_fatigue.charAt(0).toUpperCase() + tl.cumulative_fatigue.slice(1).toLowerCase() + ' fatigue';
      rows.push({ label: 'Fatigue', value: evidence.trim() });
    }
  } catch { /* */ }

  if (!hasBullets) {
    try {
      const top = flagsV1
        .filter((f: any) => f && typeof f.message === 'string' && f.message.length > 0)
        .sort((a: any, b: any) => Number(a.priority || 99) - Number(b.priority || 99))
        .slice(0, 3);
      for (const f of top) {
        rows.push({ label: 'Flag', value: String(f.message) });
      }
    } catch { /* */ }
  }

  const dedup = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.label}::${r.value}`;
    if (dedup.has(k)) return false;
    dedup.add(k);
    return true;
  }).slice(0, 8);
}

/** Lowest pace_adherence_pct among work intervals (when present). */
function minWorkIntervalPacePct(intervals: SessionDetailV1['intervals']): number | null {
  let min: number | null = null;
  for (const iv of intervals) {
    if (iv.interval_type !== 'work') continue;
    const p = iv.pace_adherence_pct;
    if (typeof p === 'number' && Number.isFinite(p)) {
      min = min == null ? p : Math.min(min, p);
    }
  }
  return min;
}

function buildSessionInterpretation(params: {
  type: string;
  match: SessionMatch | null;
  plannedSession: PlannedSession | null;
  executionScore: number | null;
  paceAdherence: number | null;
  powerAdherence: number | null;
  durationAdherence: number | null;
  weightDeviation: SessionDetailV1['strength_weight_deviation'];
  volumeDeviation: SessionDetailV1['strength_volume_deviation'];
  loadStatus?: { status: string; interpretation?: string } | null;
  planContextSummary: string | null;
  intervals: SessionDetailV1['intervals'];
}): SessionInterpretation {
  const {
    type,
    match,
    plannedSession,
    executionScore,
    paceAdherence,
    powerAdherence,
    durationAdherence,
    weightDeviation,
    volumeDeviation,
    loadStatus,
    planContextSummary,
    intervals,
  } = params;

  const deviations: Array<{ dimension: DeviationDimension; direction: DeviationDirection; detail: string }> = [];
  let overall: 'followed' | 'modified' | 'deviated' = 'followed';

  // Strength: weight and volume deviations
  if (type === 'strength' || type === 'mobility') {
    if (weightDeviation?.direction === 'heavier') {
      deviations.push({ dimension: 'weight', direction: 'over', detail: 'Went heavier than planned' });
      overall = 'deviated';
    } else if (weightDeviation?.direction === 'lighter') {
      deviations.push({ dimension: 'weight', direction: 'under', detail: 'Went lighter than planned' });
      overall = 'deviated';
    } else if (weightDeviation?.direction === 'on_target' && (weightDeviation as any)?.message?.includes('heavier') && (weightDeviation as any)?.message?.includes('lighter')) {
      deviations.push({ dimension: 'weight', direction: 'matched', detail: 'Some heavier, some lighter' });
      overall = 'modified';
    }
    if (volumeDeviation?.direction === 'over') {
      const m = volumeDeviation.message.match(/\(([^)]+)\)/);
      const detail = m ? m[1] : 'More sets/reps than planned';
      deviations.push({ dimension: 'volume', direction: 'over', detail });
      overall = 'deviated';
    } else if (volumeDeviation?.direction === 'under') {
      const m = volumeDeviation.message.match(/\(([^)]+)\)/);
      const detail = m ? m[1] : 'Fewer sets/reps than planned';
      deviations.push({ dimension: 'volume', direction: 'under', detail });
      overall = 'deviated';
    }
  }

  // Endurance: pace, duration
  if (type === 'run' || type === 'ride' || type === 'swim') {
    const hasPace = paceAdherence != null || powerAdherence != null;
    const hasDuration = durationAdherence != null;
    const worstWorkPace = minWorkIntervalPacePct(intervals);
    if (hasPace) {
      const pct = paceAdherence ?? powerAdherence ?? 0;
      if (worstWorkPace != null && worstWorkPace < 88) {
        deviations.push({
          dimension: 'pace',
          direction: 'under',
          detail: `Weakest work interval ~${Math.round(worstWorkPace)}% vs prescribed pace (headline pace % is duration-weighted across intervals)`,
        });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct > 105) {
        deviations.push({ dimension: 'pace', direction: 'over', detail: `Pace/power ${Math.round(pct)}% of plan` });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct < 95 && pct > 0) {
        deviations.push({ dimension: 'pace', direction: 'under', detail: `Pace/power ${Math.round(pct)}% of plan` });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct >= 95 && pct <= 105) {
        deviations.push({ dimension: 'pace', direction: 'matched', detail: 'Pace on target (blended across intervals)' });
      }
    }
    if (hasDuration) {
      const pct = durationAdherence ?? 0;
      if (pct > 105) deviations.push({ dimension: 'duration', direction: 'over', detail: `Duration ${Math.round(pct)}% of plan` });
      else if (pct < 95 && pct > 0) deviations.push({ dimension: 'duration', direction: 'under', detail: `Duration ${Math.round(pct)}% of plan` });
      else if (pct >= 95 && pct <= 105) deviations.push({ dimension: 'duration', direction: 'matched', detail: 'Duration on target' });
      if (pct > 105 || (pct < 95 && pct > 0)) overall = overall === 'followed' ? 'modified' : overall;
    }
  }

  // Match quality override
  const eq = match?.endurance_quality;
  const sq = match?.strength_quality;
  if (eq === 'harder' || eq === 'easier' || eq === 'longer' || eq === 'shorter' || sq === 'pushed_hard' || sq === 'dialed_back') {
    overall = 'modified';
  }
  if (eq === 'modified' || eq === 'skipped' || sq === 'modified' || sq === 'skipped') {
    overall = 'deviated';
  }

  const namePrefix = plannedSession?.name ? `${plannedSession.name}. ` : '';
  const intendedStimulus =
    namePrefix + (plannedSession?.prescription ?? planContextSummary ?? 'Complete the planned session');

  let actualStimulus: string;
  let alignment: 'on_target' | 'partial' | 'missed' | 'exceeded' = 'on_target';

  if (type === 'run' || type === 'ride' || type === 'swim') {
    const parts: string[] = [];
    if (executionScore != null) parts.push(`execution ${Math.round(executionScore)}%`);
    if (durationAdherence != null) parts.push(`duration ${Math.round(durationAdherence)}%`);
    if (paceAdherence != null) parts.push(`pace ${Math.round(paceAdherence)}%`);
    else if (powerAdherence != null) parts.push(`power ${Math.round(powerAdherence)}%`);

    const metrics: number[] = [];
    if (executionScore != null) metrics.push(executionScore);
    if (paceAdherence != null) metrics.push(paceAdherence);
    if (powerAdherence != null) metrics.push(powerAdherence);
    if (durationAdherence != null) metrics.push(durationAdherence);

    const minPct = metrics.length ? Math.min(...metrics) : null;
    const maxPct = metrics.length ? Math.max(...metrics) : null;
    const spread = minPct != null && maxPct != null ? maxPct - minPct : 0;

    if (parts.length > 0) {
      actualStimulus = `Versus plan: ${parts.join(', ')}.`;
      if (spread >= 12) {
        actualStimulus += ' Scores diverge — treat the lowest % as the limiting factor, not the highest.';
      }
      const wiv = minWorkIntervalPacePct(intervals);
      if (wiv != null && wiv < 88) {
        actualStimulus +=
          ` One work rep was only ~${Math.round(wiv)}% vs its pace window; the headline pace chip blends all intervals.`;
      }
    } else {
      actualStimulus = planContextSummary ?? 'Session completed';
    }

    if (minPct != null) {
      if (minPct >= 105) {
        alignment = 'exceeded';
      } else if (minPct >= 92) {
        alignment = 'on_target';
      } else if (minPct >= 78) {
        alignment = 'partial';
      } else {
        alignment = 'missed';
      }
    }
  } else {
    const execPct = executionScore ?? paceAdherence ?? powerAdherence ?? durationAdherence;
    if (execPct != null) {
      if (execPct >= 95) {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = execPct >= 105 ? 'exceeded' : 'on_target';
      } else if (execPct >= 80) {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = 'partial';
      } else {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = 'missed';
      }
    } else {
      actualStimulus = planContextSummary ?? 'Session completed';
    }
  }

  const loadStatusMap = loadStatus?.status === 'high' || loadStatus?.status === 'elevated' ? 'over' as const
    : loadStatus?.status === 'under' ? 'under' as const
    : 'on_track' as const;
  const weeklyNote = loadStatus?.interpretation ?? '';

  return {
    plan_adherence: { overall, deviations },
    training_effect: {
      intended_stimulus: intendedStimulus,
      actual_stimulus: actualStimulus,
      alignment,
    },
    weekly_impact: {
      load_status: loadStatusMap,
      note: weeklyNote,
    },
  };
}

function normExName(s: string): string {
  return String(s || '').toLowerCase().trim();
}

function matchPlannedToCompleted(plannedExs: any[], compEx: any): any | null {
  return plannedExs.find(
    (p: any) => normExName(p?.name) === normExName(compEx?.name),
  ) ?? null;
}

function computeStrengthWeightDeviation(
  type: string,
  plannedRowRaw: { strength_exercises?: any[] } | null | undefined,
  completedStrengthExercises: any[] | null | undefined,
): SessionDetailV1['strength_weight_deviation'] {
  if (type !== 'strength' && type !== 'mobility') return null;
  const plannedExs = Array.isArray(plannedRowRaw?.strength_exercises) ? plannedRowRaw.strength_exercises : [];
  const compExs = Array.isArray(completedStrengthExercises) ? completedStrengthExercises : [];
  if (plannedExs.length === 0 || compExs.length === 0) return null;

  let anyHeavier = false;
  let anyLighter = false;
  for (const compEx of compExs) {
    const plannedEx = matchPlannedToCompleted(plannedExs, compEx);
    if (!plannedEx) continue;
    const plannedW = Number(plannedEx.weight) || (Array.isArray(plannedEx.sets)?.[0] ? Number(plannedEx.sets[0]?.weight) || 0 : 0);
    if (plannedW <= 0) continue;
    const sets = Array.isArray(compEx?.sets) ? compEx.sets : [];
    const bestActual = Math.max(0, ...sets.map((s: any) => Number(s?.weight) || 0));
    if (bestActual <= 0) continue;
    if (bestActual > plannedW * 1.05) anyHeavier = true;
    else if (bestActual < plannedW * 0.95) anyLighter = true;
  }

  if (anyHeavier && !anyLighter) {
    return {
      direction: 'heavier',
      message: 'You went heavier than planned — intentional?',
      show_prompt: true,
    };
  }
  if (anyLighter && !anyHeavier) {
    return {
      direction: 'lighter',
      message: 'You went lighter than planned — intentional?',
      show_prompt: true,
    };
  }
  if (anyHeavier && anyLighter) {
    return {
      direction: 'on_target',
      message: 'Some exercises heavier, some lighter than planned.',
      show_prompt: false,
    };
  }
  return null;
}

function getPlannedSetsAndReps(plannedEx: any): { sets: number; totalReps: number } {
  const sets = typeof plannedEx?.sets === 'number' ? plannedEx.sets : (Array.isArray(plannedEx?.sets) ? plannedEx.sets.length : 0);
  const repsPerSet = typeof plannedEx?.reps === 'number' ? plannedEx.reps : (parseInt(String(plannedEx?.reps || '0'), 10) || 0);
  return { sets, totalReps: sets * repsPerSet };
}

function getActualSetsAndReps(compEx: any): { sets: number; totalReps: number } {
  const setsArr = Array.isArray(compEx?.sets) ? compEx.sets : [];
  const totalReps = setsArr.reduce((sum, s) => sum + (Number(s?.reps) || 0), 0);
  return { sets: setsArr.length, totalReps };
}

function computeStrengthVolumeDeviation(
  type: string,
  plannedRowRaw: { strength_exercises?: any[] } | null | undefined,
  completedStrengthExercises: any[] | null | undefined,
): SessionDetailV1['strength_volume_deviation'] {
  if (type !== 'strength' && type !== 'mobility') return null;
  const plannedExs = Array.isArray(plannedRowRaw?.strength_exercises) ? plannedRowRaw.strength_exercises : [];
  const compExs = Array.isArray(completedStrengthExercises) ? completedStrengthExercises : [];
  if (plannedExs.length === 0 || compExs.length === 0) return null;

  const overDetails: string[] = [];
  const underDetails: string[] = [];
  for (const compEx of compExs) {
    const plannedEx = matchPlannedToCompleted(plannedExs, compEx);
    if (!plannedEx) continue;
    const planned = getPlannedSetsAndReps(plannedEx);
    const actual = getActualSetsAndReps(compEx);
    const name = String(compEx?.name || plannedEx?.name || 'exercise').trim();
    if (planned.sets === 0 && planned.totalReps === 0) continue;

    if (actual.sets > planned.sets || (planned.totalReps > 0 && actual.totalReps > planned.totalReps)) {
      const parts: string[] = [];
      if (actual.sets > planned.sets) parts.push(`${actual.sets} sets instead of ${planned.sets}`);
      if (planned.totalReps > 0 && actual.totalReps > planned.totalReps) parts.push(`${actual.totalReps} reps instead of ${planned.totalReps}`);
      overDetails.push(parts.length ? `${parts.join(', ')} on ${name}` : name);
    } else if (actual.sets < planned.sets || (planned.totalReps > 0 && actual.totalReps < planned.totalReps * 0.9)) {
      const parts: string[] = [];
      if (actual.sets < planned.sets) parts.push(`${actual.sets} sets instead of ${planned.sets}`);
      if (actual.totalReps < planned.totalReps && planned.totalReps > 0) parts.push(`${actual.totalReps} reps instead of ${planned.totalReps}`);
      underDetails.push(parts.length ? `${parts.join(', ')} on ${name}` : name);
    }
  }

  if (overDetails.length > 0 && underDetails.length === 0) {
    const detail = overDetails.length === 1 ? overDetails[0] : `${overDetails.length} exercises over plan`;
    return {
      direction: 'over',
      message: `You did more volume than planned${detail ? ` (${detail})` : ''} — intentional?`,
      show_prompt: true,
    };
  }
  if (underDetails.length > 0 && overDetails.length === 0) {
    const detail = underDetails.length === 1 ? underDetails[0] : `${underDetails.length} exercises under plan`;
    return {
      direction: 'under',
      message: `You did less volume than planned${detail ? ` (${detail})` : ''} — intentional?`,
      show_prompt: true,
    };
  }
  if (overDetails.length > 0 && underDetails.length > 0) {
    return {
      direction: 'on_target',
      message: 'Some exercises over plan, some under.',
      show_prompt: false,
    };
  }
  return null;
}
