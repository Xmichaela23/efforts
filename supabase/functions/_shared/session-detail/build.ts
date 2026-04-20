// =============================================================================
// SESSION_DETAIL_V1 — Build from snapshot slice + workout_analysis
// =============================================================================

import type { SessionDetailV1, IntervalRow, SessionInterpretation, DeviationDimension, DeviationDirection } from './types.ts';
import type { LedgerDay, ActualSession, PlannedSession, SessionMatch } from '../athlete-snapshot/types.ts';
import type { ReadinessSnapshotV1 } from '../readiness-types.ts';
import { packageSessionDetailReadiness } from './readiness-load-context.ts';

/** Match fact-packet ai-summary: session HR drift is not meaningful for structured interval sessions. */
function shouldSuppressSessionHrDrift(factPacket: any, intervals?: IntervalRow[]): boolean {
  const derived = factPacket?.derived;
  const ie = derived?.interval_execution;
  if (typeof ie?.total_steps === 'number' && ie.total_steps > 2) return true;
  const facts = factPacket?.facts;
  const segments = Array.isArray(facts?.segments) ? facts.segments : [];
  const paces = segments
    .map((s: any) => {
      const n = Number(s?.pace_sec_per_mi);
      return Number.isFinite(n) && n > 120 && n < 2400 ? n : null;
    })
    .filter((n): n is number => n != null);
  if (paces.length >= 5) {
    const spread = Math.max(...paces) - Math.min(...paces);
    if (spread >= 75) return true;
  }
  // Stale fact packets may omit interval_execution; use rendered interval rows (easy + strides + recoveries).
  if (intervals && intervals.length >= 4) {
    const rec = intervals.filter((iv) => String(iv.interval_type).toLowerCase() === 'recovery').length;
    const workish = intervals.filter((iv) => {
      const t = String(iv.interval_type).toLowerCase();
      return t === 'work' || t === 'warmup';
    }).length;
    if (rec >= 1 && workish >= 2) return true;
  }
  return false;
}

function humanizePlannedSegmentLabel(raw: string, intervalType?: string): string {
  const s = String(raw || '').trim();
  const it = String(intervalType || '').toLowerCase();
  if (!s && it === 'recovery') return 'Recovery';
  const low = s.toLowerCase();
  if (low === 'recovery') return 'Recovery';
  if (low === 'warmup') return 'Warmup';
  if (low === 'cooldown') return 'Cooldown';
  if (low === 'work') return 'Work';
  return s;
}

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
  /** Next planned session from the week (forward-looking context). */
  nextSession?: { name: string; date: string | null; type: string | null; prescription: string | null } | null;
  /** From buildReadiness(asOf = workout date). If fetch threw, set readinessUnavailable. */
  readinessSnapshot?: ReadinessSnapshotV1 | null;
  /** True when buildReadiness threw — keep legacy load context. */
  readinessUnavailable?: boolean;
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
    nextSession,
    readinessSnapshot,
    readinessUnavailable,
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
  /** Any link to a planned row — ledger can expose match.planned_id before planned hydrate is present. */
  const hasPlanned = !!match?.planned_id;
  const planModified = assessedAgainst === 'actual';
  const allZero =
    (executionScore ?? 0) === 0 &&
    (paceAdherence ?? 0) === 0 &&
    (powerAdherence ?? 0) === 0 &&
    (durationAdherence ?? 0) === 0;

  const showAdherenceChips =
    !allZero &&
    (executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null);

  const hasMeasuredExecution =
    executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null;

  const weightDev = computeStrengthWeightDeviation(type, plannedRowRaw, completedStrengthExercises);
  const volumeDev = computeStrengthVolumeDeviation(type, plannedRowRaw, completedStrengthExercises);

  // ── Interval rows (pre-resolved) ──────────────────────────────────────────
  const intervalDisplay = sessionState?.details?.interval_display || {};
  const sessionRows: any[] = Array.isArray(sessionState?.details?.interval_rows) ? sessionState.details.interval_rows : [];

  const intervals: IntervalRow[] = [];
  const ibList: any[] = Array.isArray(ib?.intervals) ? ib.intervals : [];
  // Use any non-empty breakdown intervals (some pipelines set available:false while still emitting rows).
  if (ibList.length > 0) {
    for (const iv of ibList) {
      const lower = iv.planned_pace_range_lower ?? iv.planned_pace_range?.lower;
      const upper = iv.planned_pace_range_upper ?? iv.planned_pace_range?.upper;
      const sr = sessionRows.find((r: any) =>
        r.planned_step_id === iv.interval_id || r.row_id === iv.interval_id,
      ) ?? null;
      const paceRaw = fin(iv?.actual_pace_min_per_mi);
      const paceSec = paceRaw != null ? Math.round(paceRaw * 60) : (fin(sr?.executed?.actual_pace_sec_per_mi) ?? null);
      // 0,0 from strides / distance-only reps is not a real range — avoid "0:00-0:00/mi"
      const hasRange =
        Number.isFinite(lower) &&
        Number.isFinite(upper) &&
        Number(lower) > 0 &&
        Number(upper) > 0;
      const ivType = normIntervalType(iv?.interval_type || iv?.kind);
      intervals.push({
        id: String(iv?.interval_id || iv?.interval_number || intervals.length),
        interval_type: ivType,
        interval_number: typeof iv?.interval_number === 'number' ? iv.interval_number : undefined,
        recovery_number: typeof iv?.recovery_number === 'number' ? iv.recovery_number : undefined,
        planned_label: humanizePlannedSegmentLabel(
          String(iv?.planned_label ?? sr?.planned_label ?? iv?.interval_type ?? ''),
          ivType,
        ),
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
        pace_adherence_pct: (() => {
          if (iv && iv.pace_adherence_percent === null) return null;
          const fromIv = fin(iv?.pace_adherence_percent);
          if (fromIv != null) return fromIv;
          return fin(sr?.adherence_pct);
        })(),
        duration_adherence_pct: fin(iv?.duration_adherence_percent),
      });
    }
  } else if (sessionRows.length > 0) {
    // Analysis sometimes omits interval_breakdown.intervals while session_state_v1.interval_rows
    // still has plan-aligned rows — smart server should still ship a renderable table.
    const dataRows = sessionRows.filter((r: any) => String(r?.kind || '').toLowerCase() !== 'overall');
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const ex = r?.executed || {};
      const paceS = fin(ex.avg_pace_s_per_mi) ?? fin(ex.pace_s_per_mi);
      const rowKind = normIntervalType(r?.kind);
      intervals.push({
        id: String(r.row_id || r.planned_step_id || i),
        interval_type: rowKind,
        planned_label: humanizePlannedSegmentLabel(String(r.planned_label ?? ''), rowKind),
        planned_duration_s: null,
        planned_pace_display: typeof r.planned_pace_display === 'string' ? r.planned_pace_display : null,
        planned_pace_range: undefined,
        executed: {
          duration_s: fin(ex.duration_s),
          distance_m: fin(ex.distance_m),
          avg_hr: fin(ex.avg_hr),
          actual_pace_sec_per_mi: paceS,
          actual_gap_sec_per_mi: null,
          power_watts: fin(ex.power_watts) ?? null,
        },
        pace_adherence_pct: fin(r.adherence_pct),
        duration_adherence_pct: null,
      });
    }
  }

  let intervalDisplayMode = (() => {
    const m = String(intervalDisplay?.mode || '');
    if (m === 'interval_compare_ready' || m === 'overall_only' || m === 'awaiting_recompute') return m as any;
    return 'none' as const;
  })();
  if (intervals.length > 0 && intervalDisplayMode === 'overall_only') {
    intervalDisplayMode = 'interval_compare_ready';
  }

  // ── Summary (pre-merged bullets) ───────────────────────────────────────────
  const summaryTitle = String(sessionState?.summary?.title || 'Insights');
  const summaryBullets = mergeDedupe(
    arrayOfStrings(sessionState?.summary?.bullets),
    arrayOfStrings(observations),
    arrayOfStrings(sessionState?.narrative?.observations),
  );

  // ── Narrative ──────────────────────────────────────────────────────────────
  /** Goal-race sessions: adherence summary has race headline + pacing/HR — use for INSIGHTS, not LLM/GAP fallback. */
  const goalRaceNarrativeFromAdherence = (() => {
    const ap = adherenceSummary?.plan_impact;
    if (String(ap?.focus || '').trim() !== 'Race result') return null;
    const verdict = typeof adherenceSummary?.verdict === 'string' ? adherenceSummary.verdict.trim() : '';
    const insights: any[] = Array.isArray(adherenceSummary?.technical_insights)
      ? adherenceSummary.technical_insights
      : [];
    const pieces: string[] = [];
    if (verdict) pieces.push(verdict);
    for (const t of insights) {
      const lab = String(t?.label || '').trim();
      const val = typeof t?.value === 'string' ? t.value.trim() : '';
      if (!val) continue;
      if (lab === 'Race day') continue;
      pieces.push(val);
    }
    return pieces.length >= 1 ? pieces.join(' ') : null;
  })();

  const llmNarrative = (typeof narrativeText === 'string' && narrativeText.trim()) ||
    (typeof sessionState?.narrative?.text === 'string' ? sessionState.narrative.text.trim() : '') || null;
  const resolvedNarrative =
    goalRaceNarrativeFromAdherence ||
    llmNarrative ||
    buildFallbackNarrative(
      factPacket,
      executionScore,
      type,
      !!match?.planned_id,
      match?.summary ?? null,
      !!perf?.gap_adjusted,
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
  const fpFacts = factPacket?.facts || {};
  const fpDerived = factPacket?.derived || {};
  const completedTotals: SessionDetailV1['completed_totals'] = {
    duration_s: completedDurS,
    distance_m: completedDistM,
    avg_pace_s_per_mi: fin(compOverall?.avg_pace_s_per_mi) ?? fin(fpFacts?.avg_pace_sec_per_mi),
    avg_gap_s_per_mi: fin(compOverall?.avg_gap_s_per_mi) ?? fin(fpFacts?.avg_gap_sec_per_mi),
    avg_hr: fin(compOverall?.avg_hr) ?? fin(fpFacts?.avg_hr) ?? fin(actualSession?.avg_heart_rate as any),
    swim_pace_per_100_s: completedSwimPer100,
  };

  // Single planned/executed row must match completed_totals (same source as Details / chips).
  if (type === 'run' && intervals.length === 1 && completedDistM != null && completedDistM > 0) {
    const row = intervals[0];
    row.executed = {
      ...row.executed,
      distance_m: completedDistM,
      duration_s: completedDurS ?? row.executed.duration_s,
      avg_hr: completedTotals.avg_hr ?? row.executed.avg_hr,
      actual_pace_sec_per_mi: completedTotals.avg_pace_s_per_mi ?? row.executed.actual_pace_sec_per_mi,
      actual_gap_sec_per_mi: completedTotals.avg_gap_s_per_mi ?? row.executed.actual_gap_sec_per_mi,
    };
  }

  // ── Week label ─────────────────────────────────────────────────────────────
  const weekLabel = buildWeekLabel(factPacket);

  // ── Analysis detail rows ───────────────────────────────────────────────────
  const analysisDetailRows = buildAnalysisDetailRows(
    factPacket,
    flagsV1,
    summaryBullets.length > 0,
    comp,
    !!perf?.gap_adjusted,
    intervals,
  );

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

    trend: (() => {
      try {
        const pts = factPacket?.derived?.comparisons?.vs_similar?.trend_points;
        if (!Array.isArray(pts) || pts.length < 3) return null;
        const fmtPace = (s: number) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${String(sec).padStart(2, '0')}/mi`; };
        const sorted = [...pts].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
        const points = sorted.map((p: any) => ({
          date: String(p.date),
          value: Number(p.pace_sec_per_mi),
          avg_hr: p.avg_hr != null ? Number(p.avg_hr) : null,
          is_current: !!p.is_current,
          label: fmtPace(Number(p.pace_sec_per_mi)),
        }));
        const mid = Math.ceil(points.length / 2);
        const avgArr = (arr: typeof points) => arr.reduce((s, p) => s + p.value, 0) / arr.length;
        const firstHalfAvg = avgArr(points.slice(0, mid));
        const secondHalfAvg = avgArr(points.slice(mid));
        const delta = Math.round(firstHalfAvg - secondHalfAvg);
        const direction = delta > 10 ? 'improving' as const : delta < -10 ? 'declining' as const : 'stable' as const;
        const absDelta = Math.abs(delta);
        const summary = (isEasyLike && direction !== 'stable')
          ? ''
          : direction === 'stable'
            ? `Consistent across ${points.length} workouts`
            : `${absDelta}s/mi ${direction === 'improving' ? 'faster' : 'slower'} over ${points.length} workouts`;
        return {
          metric_label: 'Pace',
          unit: '/mi',
          points,
          direction,
          summary,
          lower_is_better: true,
        };
      } catch { return null; }
    })(),

    next_session: nextSession ?? null,

    terrain: (() => {
      const tc = factPacket?.derived?.terrain_context;
      if (!tc?.route_runs) return null;
      const r = tc.route_runs as any;
      if (!Array.isArray(r.history) || r.history.length < 2) return null;
      return {
        route: {
          name: String(r.name || 'Same route'),
          times_run: Number(r.times_run || 0),
          history: r.history,
        },
      };
    })(),

    display: {
      show_adherence_chips: showAdherenceChips,
      interval_display_reason: intervalDisplay?.reason ?? null,
      has_measured_execution: hasMeasuredExecution,
    },

    strength_weight_deviation: weightDev,
    strength_volume_deviation: volumeDev,
    strength_rir_summary: (() => {
      const exerciseAdherence = (wa as any)?.detailed_analysis?.exercise_adherence;
      if (!Array.isArray(exerciseAdherence)) return null;
      const withRIR = exerciseAdherence
        .filter((ea: any) => ea.matched && ea.adherence?.target_rir != null)
        .map((ea: any) => ({
          name: String(ea.executed?.name || ea.planned?.name || ''),
          target_rir: ea.adherence.target_rir as number,
          avg_rir: ea.adherence.avg_rir != null ? ea.adherence.avg_rir as number : null,
          rir_verdict: ea.adherence.rir_verdict as 'too_easy' | 'on_target' | 'too_hard' | null,
        }));
      return withRIR.length > 0 ? withRIR : null;
    })(),
    readiness: (() => {
      if (readinessUnavailable || !readinessSnapshot) return null;
      return packageSessionDetailReadiness(readinessSnapshot);
    })(),
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
    /** Filled by workout-detail via LLM when gated (long run near race). */
    race_readiness: null,
  };
}

// ── Helpers for builder ────────────────────────────────────────────────────

function fin(v: unknown): number | null {
  // Preserve explicit null (JSON null for "no adherence" e.g. strides) — Number(null) is 0 in JS
  if (v === null || v === undefined) return null;
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
  const typeLabel = type === 'run' ? 'run' : type === 'ride' ? 'ride' : type === 'swim' ? 'swim' : 'workout';

  const durMinForRace = typeof facts.total_duration_min === 'number' ? facts.total_duration_min : null;
  const daysUntilRace = typeof facts.plan?.days_until_race === 'number' ? facts.plan.days_until_race : null;
  const workoutTypeKey = String(facts.workout_type || '').toLowerCase();
  const longRunForRaceFrame =
    type === 'run' &&
    hasPlanned &&
    (workoutTypeKey.includes('long') || (durMinForRace != null && durMinForRace >= 90));

  let raceProximityLead: string | null = null;
  if (
    daysUntilRace != null &&
    daysUntilRace > 0 &&
    daysUntilRace <= 21 &&
    longRunForRaceFrame
  ) {
    const frame =
      daysUntilRace <= 7
        ? 'With race week approaching,'
        : daysUntilRace <= 14
          ? 'Inside the final two weeks before your race,'
          : `With roughly ${daysUntilRace} days until race day,`;
    const body =
      executionScore != null && executionScore >= 88
        ? 'this long run is a useful whole-session checkpoint: execution vs plan is strong, and end-to-end HR behavior matters as much as average pace.'
        : executionScore != null && executionScore >= 75
          ? 'treat this as a full-run checkpoint — pace and cardiovascular drift across the entire session show how you’re absorbing volume before the taper.'
          : 'focus on how you felt and how HR trended across the full run; this close to race day, repeatable fatigue response beats any single mile split.';
    raceProximityLead = `${frame} ${body}`;
  }

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
  // On net climbing, GAP (flat-equivalent) should be faster than clock pace (lower sec/mi).
  // If gap > pace with meaningful gain, skip GAP copy and fall through to terrain-only below.
  const hasGapComparison =
    gapAdjusted && gap != null && pace != null && Math.abs(pace - gap) > 5;
  const gapContradictsClimb =
    hasGapComparison && elevFt != null && elevFt > 50 && gap > pace;

  if (hasGapComparison && !gapContradictsClimb) {
    const costSec = Math.round(pace - gap);
    sentences.push(`The ${terrain || 'hilly'} course${elevFt != null && elevFt > 50 ? ` (${elevFt} ft gain)` : ''} cost about ${costSec}s/mi — effort-adjusted pace was ${fmtPace(gap)} vs ${fmtPace(pace)} actual.`);
  } else if (terrain && elevFt != null && elevFt > 50) {
    sentences.push(`${terrain.charAt(0).toUpperCase() + terrain.slice(1)} course with ${elevFt} ft of climbing.`);
  }

  // HR drift: use pace-normalized drift + drift_explanation when available
  const paceNormDriftFb = typeof derived?.pace_normalized_drift_bpm === 'number' ? derived.pace_normalized_drift_bpm : null;
  const driftExpFb = typeof derived?.drift_explanation === 'string' ? derived.drift_explanation : null;
  const driftSignalFb = paceNormDriftFb ?? driftBpm;
  const durMinFb = typeof facts.total_duration_min === 'number' ? facts.total_duration_min : null;

  if (driftExpFb === 'pace_driven' && driftBpm != null && Math.abs(driftBpm) >= 5) {
    sentences.push(`HR rose ${Math.abs(Math.round(driftBpm))} bpm — proportional to the pace increase, not cardiovascular drift.`);
  } else if (driftSignalFb != null && Math.abs(driftSignalFb) >= 3) {
    // Match buildAnalysisDetailRows: only compare to "typical" when baseline is meaningful (not 0 / noise).
    const typMeaningful = driftTyp != null && Math.abs(driftTyp) >= 1;
    if (driftExpFb === 'terrain_driven' && terrain) {
      sentences.push(`HR drifted ${Math.abs(Math.round(driftSignalFb))} bpm, consistent with the ${terrain} terrain.`);
    } else if (typMeaningful && Math.abs(driftSignalFb) - Math.abs(driftTyp) <= 3) {
      sentences.push(`HR drift was normal for this effort — no red flags.`);
    } else if (driftSignalFb > 0 && typMeaningful && Math.abs(driftSignalFb) > Math.abs(driftTyp) + 3) {
      sentences.push(`HR drifted +${Math.abs(Math.round(driftSignalFb))} bpm, more than your typical +${Math.round(Math.abs(driftTyp))}.`);
    } else if (durMinFb != null) {
      const expectedMax = durMinFb >= 150 ? 20 : durMinFb >= 90 ? 15 : durMinFb >= 60 ? 12 : 8;
      const absDr = Math.abs(driftSignalFb);
      if (absDr <= expectedMax) {
        sentences.push(`HR drift ${Math.abs(Math.round(driftSignalFb))} bpm — normal for a ${Math.round(durMinFb)}-minute run.`);
      } else if (!typMeaningful) {
        sentences.push(`HR drift ${Math.abs(Math.round(driftSignalFb))} bpm over ${Math.round(durMinFb)} min — a bit high for this duration; conditions and fueling matter.`);
      }
    }
  }

  // Heat: only mention if it matters
  if (wx?.heat_stress_level && wx.heat_stress_level !== 'none') {
    const tempF = typeof wx.temperature_f === 'number' ? Math.round(wx.temperature_f) : null;
    if (tempF != null) {
      sentences.push(`${wx.heat_stress_level.charAt(0).toUpperCase() + wx.heat_stress_level.slice(1)} heat stress at ${tempF}°F — expect pace to run slower in these conditions.`);
    }
  }

  // Execution: brief context if planned
  if (sentences.length === 0 && hasPlanned && executionScore != null && executionScore >= 90) {
    sentences.push(`Clean ${typeLabel} — hit plan targets with ${Math.round(executionScore)}% execution. Nothing to flag.`);
  } else if (sentences.length === 0 && hasPlanned && executionScore != null) {
    sentences.push(`Execution came in at ${Math.round(executionScore)}% of plan.`);
  }

  if (raceProximityLead) {
    sentences.unshift(raceProximityLead);
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
  factPacket: any, flagsV1: any[], hasBullets: boolean, comp: any, gapAdjusted: boolean = false,
  intervals: IntervalRow[] = [],
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (!factPacket) return rows;
  const derived = factPacket?.derived;

  try {
    const lim = derived?.primary_limiter;
    // Suppress fatigue limiter: it uses mixed-modality load data that can't
    // distinguish a bike ride from a hard run. Show only session-observable limiters.
    if (lim?.limiter && lim.limiter !== 'fatigue') {
      const conf = typeof lim.confidence === 'number' ? Math.round(lim.confidence * 100) : null;
      const ev0 = Array.isArray(lim.evidence) && lim.evidence[0] ? String(lim.evidence[0]) : '';
      rows.push({
        label: 'Limiter',
        value: `${String(lim.limiter)}${conf != null ? ` (${conf}%)` : ''}${ev0 ? ` — ${ev0}` : ''}`.trim(),
      });
    }
  } catch { /* */ }



  try {
    const ie = derived?.interval_execution;
    const isStructured = typeof ie?.total_steps === 'number' && ie.total_steps > 2;

    if (isStructured) {
      // For structured intervals, report work-interval consistency instead
      // of overall positive/negative split (pace variation is intentional).
      const workIntervals = intervals.filter((r) => r.interval_type === 'work');
      if (workIntervals.length >= 2) {
        const paces = workIntervals
          .map((r) => r.executed?.actual_pace_sec_per_mi ?? null)
          .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
        if (paces.length >= 2) {
          const spread = Math.round(Math.max(...paces) - Math.min(...paces));
          const fmtPace = (s: number) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${String(sec).padStart(2, '0')}/mi`; };
          if (spread <= 10) {
            rows.push({ label: 'Pacing', value: `Work intervals consistent (${fmtPace(paces[0])}–${fmtPace(paces[paces.length - 1])})` });
          } else {
            const firstPace = paces[0];
            const lastPace = paces[paces.length - 1];
            const drift = Math.round(lastPace - firstPace);
            if (drift > 10) {
              rows.push({ label: 'Pacing', value: `Work intervals faded ${drift}s/mi (${fmtPace(firstPace)} → ${fmtPace(lastPace)})` });
            } else if (drift < -10) {
              rows.push({ label: 'Pacing', value: `Work intervals sped up ${Math.abs(drift)}s/mi (${fmtPace(firstPace)} → ${fmtPace(lastPace)})` });
            } else {
              rows.push({ label: 'Pacing', value: `Work intervals: ${spread}s/mi spread (${fmtPace(Math.min(...paces))}–${fmtPace(Math.max(...paces))})` });
            }
          }
        }
      }
    } else {
      const splitsMi: any[] = Array.isArray(comp?.analysis?.events?.splits?.mi) ? comp.analysis.events.splits.mi : [];

      const rawSplits = splitsMi.map((s: any) => {
        const pacePerKm = Number(s?.avgPace_s_per_km);
        const gapPerKm = Number(s?.avgGapPace_s_per_km);
        return {
          mile: Number(s?.n),
          pace: Number.isFinite(pacePerKm) && pacePerKm > 0 ? pacePerKm * 1.60934 : NaN,
          gap: Number.isFinite(gapPerKm) && gapPerKm > 0 ? gapPerKm * 1.60934 : NaN,
        };
      }).filter((s) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);

      if (rawSplits.length >= 2) {
        const hasGap = gapAdjusted && rawSplits.every((s) => Number.isFinite(s.gap) && s.gap > 0);
        const splits = hasGap
          ? rawSplits.map((s) => ({ mile: s.mile, pace: s.gap }))
          : rawSplits.map((s) => ({ mile: s.mile, pace: s.pace }));

        const mid = Math.ceil(splits.length / 2);
        const firstHalf = splits.slice(0, mid);
        const secondHalf = splits.slice(mid);
        const avg = (arr: typeof splits) => arr.reduce((s, x) => s + x.pace, 0) / arr.length;
        const firstAvg = avg(firstHalf);
        const secondAvg = avg(secondHalf);
        const diff = firstAvg - secondAvg;
        const absDiff = Math.abs(Math.round(diff));
        const effortLabel = hasGap ? 'effort' : 'pacing';
        let pattern: string;
        if (absDiff <= 15) {
          pattern = hasGap ? 'Even effort (grade-adjusted)' : 'Even pacing';
        } else if (diff > 0) {
          pattern = `Negative split — ${effortLabel} ${absDiff}s/mi faster in second half`;
        } else {
          pattern = `Positive split — ${effortLabel} slowed ${absDiff}s/mi${hasGap ? ' (grade-adjusted)' : ''}`;
        }

        const fastest = rawSplits.reduce((a, b) => a.pace < b.pace ? a : b);
        const fm = Math.floor(fastest.pace / 60);
        const fs = Math.round(fastest.pace % 60);
        const fastestStr = `Fastest: Mile ${fastest.mile} at ${fm}:${String(fs).padStart(2, '0')}/mi`;

        rows.push({ label: 'Pacing', value: `${pattern}. ${fastestStr}` });
      }
    }
  } catch { /* */ }

  try {
    const rawAbsDrift = typeof derived?.hr_drift_bpm === 'number' ? derived.hr_drift_bpm : null;
    const paceNormDrift = typeof (derived as any)?.pace_normalized_drift_bpm === 'number'
      ? (derived as any).pace_normalized_drift_bpm : null;
    const driftExplanation = (derived as any)?.drift_explanation as string | null;
    const driftTypical = typeof derived?.hr_drift_typical === 'number' ? derived.hr_drift_typical : null;
    const durMinHr = typeof factPacket?.facts?.total_duration_min === 'number' ? factPacket.facts.total_duration_min : null;

    const signal = paceNormDrift ?? rawAbsDrift;

    const durationExpectedMax =
      durMinHr != null
        ? (durMinHr >= 150 ? 20 : durMinHr >= 90 ? 15 : durMinHr >= 60 ? 12 : 8)
        : null;

    if (shouldSuppressSessionHrDrift(factPacket, intervals)) {
      // no row
    } else if (driftExplanation === 'pace_driven' && rawAbsDrift != null && Math.abs(rawAbsDrift) >= 5) {
      rows.push({
        label: 'Heart rate',
        value: `HR rose ${Math.round(Math.abs(rawAbsDrift))} bpm across the session — proportional to the pace increase (negative split), not cardiovascular drift`,
      });
    } else if (signal != null && Math.abs(signal) >= 3) {
      const absSig = Math.round(Math.abs(signal));
      const sign = signal > 0 ? '+' : '';
      let value = `Drifted ${sign}${absSig} bpm over the session`;

      if (driftExplanation === 'terrain_driven') {
        const terrainContrib = typeof derived?.terrain_contribution_bpm === 'number' ? derived.terrain_contribution_bpm : null;
        if (terrainContrib != null) {
          value += ` (mostly terrain-driven; ~${Math.round(Math.abs(terrainContrib))} bpm from grade changes)`;
        }
      } else if (driftExplanation === 'mixed' && rawAbsDrift != null && Math.abs(rawAbsDrift) > Math.abs(signal) + 3) {
        value += ` (pace-normalized from ${rawAbsDrift > 0 ? '+' : ''}${Math.round(rawAbsDrift)} raw)`;
      }

      // Duration context first, then typical comparison
      if (durationExpectedMax != null && absSig <= durationExpectedMax) {
        value += ` — normal for ${Math.round(durMinHr!)} min`;
      }

      if (driftTypical != null && Math.abs(driftTypical) >= 1) {
        const typSign = driftTypical > 0 ? '+' : '';
        const delta = absSig - Math.abs(driftTypical);
        if (Math.abs(delta) <= 3) {
          value += durationExpectedMax != null && absSig <= durationExpectedMax
            ? ` (typical ${typSign}${Math.round(driftTypical)})`
            : ` — within your normal range (typical ${typSign}${Math.round(driftTypical)})`;
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
    const concerns = flagsV1
      .filter((f: any) => f && f.type === 'concern' && typeof f.message === 'string' && f.message.length > 0 && Number(f.priority || 99) <= 2)
      .sort((a: any, b: any) => Number(a.priority || 99) - Number(b.priority || 99))
      .slice(0, 2);
    for (const f of concerns) {
      rows.push({ label: 'Flag', value: String(f.message) });
    }
  } catch { /* */ }

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
  if (eq === 'harder' || eq === 'easier' || eq === 'longer' || eq === 'shorter'
    || sq === 'pushed_hard' || sq === 'dialed_back'
    || sq === 'under_intensity' || sq === 'over_intensity') {
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
