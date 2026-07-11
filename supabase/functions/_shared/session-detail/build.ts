// =============================================================================
// SESSION_DETAIL_V1 — Build from snapshot slice + workout_analysis
// =============================================================================

import type { SessionDetailV1, SegmentVerdictV1, IntervalRow, SessionInterpretation, DeviationDimension, DeviationDirection } from './types.ts';
import type { VerdictDirection } from '../core-verdict.ts';
import type { ArcPerformanceBridgeV1 } from './arc-performance-bridge.ts';
import { mergeArcPerformanceNarrative } from './arc-performance-bridge.ts';
import type { LedgerDay, ActualSession, PlannedSession, SessionMatch } from '../athlete-snapshot/types.ts';
import type { ReadinessSnapshotV1 } from '../readiness-types.ts';
import { packageSessionDetailReadiness } from './readiness-load-context.ts';
import { swimPacePer100Seconds } from '../swim/swim-pace.ts';
import type { SwimScalars } from '../swim/swim-scalars.ts';
import { resolveRunGap, type RunScalars } from '../run/run-scalars.ts';
import { routeHeadline } from '../heat-adjust.ts';

// Server-authored Tier-1 route readout (Familiar Routes, "arm of State"). The honest, effort-aware
// headline the client renders VERBATIM — no client-side re-derivation. Heat is parked; this is the
// efficiency-over-time read on the SAME metric State uses. null (< 4 comparable runs) → familiarity only.
type RouteReadout = {
  badge: string;
  headline: string;
  why: string;
  direction: 'improving' | 'holding' | 'declining' | 'still_learning';
  points: number;
};
function buildRouteReadout(history: unknown): RouteReadout | null {
  const h = routeHeadline(history as any);
  if (!h) return null;
  const n = h.points;
  switch (h.direction) {
    case 'improving':
      return { badge: 'Improving', headline: 'You’re getting faster on this route.',
        why: 'At the same heart rate, across your runs here — real fitness, not just a day you pushed.',
        direction: 'improving', points: n };
    case 'declining':
      return { badge: 'Slower at effort', headline: 'Slipping a little on this route.',
        why: 'Lately you’re running it slower at the same heart rate. Worth a look — not a verdict.',
        direction: 'declining', points: n };
    case 'holding':
      return { badge: 'Holding', headline: 'Holding steady here.',
        why: 'Same speed for the same effort across your runs — you’re maintaining on this route.',
        direction: 'holding', points: n };
    default:
      return { badge: 'Still reading', headline: `${n} runs in — the trend isn’t clear yet.`,
        why: 'Your easy runs here vary a lot day to day. Keep logging this route and the read sharpens.',
        direction: 'still_learning', points: n };
  }
}

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

export function humanizePlannedSegmentLabel(
  raw: string,
  intervalType?: string,
  numbers?: { intervalNumber?: number | null; recoveryNumber?: number | null },
): string {
  const s = String(raw || '').trim();
  const it = String(intervalType || '').toLowerCase();
  const low = s.toLowerCase();
  // Defense-in-depth: stale workout_analysis rows from before the analyzer fix
  // may carry the legacy 'Overall session' literal. Collapse to 'Overall' so
  // the table renders consistently without backfill.
  if (low === 'overall session' || it === 'overall') return 'Overall';
  const ivN = numbers?.intervalNumber;
  const recN = numbers?.recoveryNumber;
  const hasIvN = typeof ivN === 'number' && Number.isFinite(ivN) && ivN > 0;
  const hasRecN = typeof recN === 'number' && Number.isFinite(recN) && recN > 0;
  // D-039 Fix 7: detect labels that are just pace-range strings (no
  // semantic word). Steady-state single-segment sessions currently render
  // labels like "10:56-11:22/mi" or "81:00 @ 10:56-11:..." — the table
  // columns already show pace + time + distance, so a label echoing the
  // same pace-range is redundant. Convert to a clean semantic label.
  // Regex tolerates trailing dots (truncated UI) and either /mi or /km.
  // Uses [\d.]+ for the second pace so truncated forms like "11:.." match.
  const isPaceRangeOnly = /^(?:\d+:\d+\s*@\s*)?\d+:[\d.]+\s*[-–]\s*\d+:[\d.]+(?:\s*\/(?:mi|km))?\s*\.*\s*$/.test(s);
  if (isPaceRangeOnly) {
    if (it === 'warmup') return 'Warmup';
    if (it === 'cooldown') return 'Cooldown';
    if (it === 'recovery') return hasRecN ? `Recovery ${recN}` : 'Recovery';
    if (it === 'work' && hasIvN) return `Interval ${ivN}`;
    // 'work' without an interval number, or no interval type → generic.
    // 'Steady' fits any continuous-effort segment without prescribing intent;
    // better than echoing the pace-range string back into the label cell.
    return 'Steady';
  }
  // Empty raw OR a bare kind word → synthesize from intervalType + number.
  // Matches interval-breakdown.ts:980-983 so PACING and segments-table agree.
  const isBareKind = low === '' || low === 'work' || low === 'recovery' || low === 'warmup' || low === 'cooldown';
  if (isBareKind) {
    if (it === 'warmup') return 'Warmup';
    if (it === 'cooldown') return 'Cooldown';
    if (it === 'recovery') return hasRecN ? `Recovery ${recN}` : 'Recovery';
    if (it === 'work') return hasIvN ? `Interval ${ivN}` : 'Work';
    // Unknown kind + no label: best we can do.
    if (low === 'recovery') return hasRecN ? `Recovery ${recN}` : 'Recovery';
    if (low === 'warmup') return 'Warmup';
    if (low === 'cooldown') return 'Cooldown';
    if (low === 'work') return hasIvN ? `Interval ${ivN}` : 'Work';
  }
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
  /** D-182: SWIM pace + HR scalars from the RAW workouts columns (the authoritative layer for swims —
   *  computed.overall is sample-derived and has been wrong). Resolved in workout-detail via
   *  resolveSwimScalars; null for non-swims (which keep computed.overall, GPS-authoritative). */
  completedSwimScalars?: SwimScalars | null;
  /** D-185: RUN pace + HR scalars from the ONE run resolver (resolveRunScalars — computed.overall
   *  primary with the narrative-trusted guard/reconciliation, raw columns fallback). Resolved in
   *  workout-detail; null for non-runs. So the card reads the SAME guarded pace/HR the narrative does. */
  completedRunScalars?: RunScalars | null;
  /** Completed workout's refined_type (e.g. 'pool_swim', 'open_water_swim'). */
  completedRefinedType?: string | null;
  /** Next planned session from the week (forward-looking context). */
  nextSession?: { name: string; date: string | null; type: string | null; prescription: string | null } | null;
  /** From buildReadiness(asOf = workout date). If fetch threw, set readinessUnavailable. */
  readinessSnapshot?: ReadinessSnapshotV1 | null;
  /** True when buildReadiness threw — keep legacy load context. */
  readinessUnavailable?: boolean;
  /** From `getArcContext` + `buildArcPerformanceBridge` in workout-detail. */
  arcPerformance?: ArcPerformanceBridgeV1 | null;
  /** Ride-start temperature °F from workouts.weather_data (temperature_start_f
   *  ?? temperature), resolved in workout-detail. The contract had no weather
   *  field — added for the cycling Performance stat line + TERRAIN row. */
  weatherTempF?: number | null;
  /** Step 4b — this session's discipline spine verdict, pre-read from
   *  athlete_snapshot.state_trends_v1 in workout-detail. The builder only passes it through
   *  (no re-derivation); null when no cache is available. */
  disciplineTrend?: SessionDetailV1['discipline_trend'];
  /** core_verdicts rows for the core(s) this run traversed — loaded by workout-detail (the ONLY DB
   *  reader). build.ts renders them (Law 4); it does not fetch or recompute. */
  coreVerdicts?: CoreVerdictRow[] | null;
};

/** Shape of a core_verdicts row as consumed here. `direction` is typed to the SOURCE union so the
 *  mapper's never-guard fails to compile if a new VerdictDirection variant is added upstream. */
type CoreVerdictRow = {
  direction: VerdictDirection;
  metric: 'same_effort_pace' | 'raw_pace' | null;
  pct: number | null;
  ci_low: number | null;
  ci_high: number | null;
  n: number;
  n_hr_aligned: number;
  window_days: number;
  method: string | null;
  span_days: number | null;
  /** Windowed per-effort chart points, prepared by workout-detail (the data-loading layer); build.ts
   *  passes them through untouched — no windowing/recompute here (Law 4). */
  chart_points?: SegmentVerdictV1['chart_points'];
  runs_all_time?: number;
};

/** Map spine-authored core verdict rows → the render contract. NO recomputation (Law 4). Exhaustive
 *  direction switch behind a never-guard: a new VerdictDirection variant fails compilation here. */
function buildSegmentVerdicts(rows: CoreVerdictRow[] | null | undefined): SegmentVerdictV1[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r): SegmentVerdictV1 => {
    let copy: string;
    let flags: { show_arrow: boolean; show_slope: boolean; show_pct: boolean };
    switch (r.direction) {
      case 'still_learning': // below-confidence: has data, CI won't commit
        copy = 'Still building a read on this stretch.';
        flags = { show_arrow: false, show_slope: false, show_pct: false };
        break;
      case 'still_building': // below-floor: not enough runs yet (DISTINCT copy — PIN 2)
        copy = 'Not enough runs on this stretch yet.';
        flags = { show_arrow: false, show_slope: false, show_pct: false };
        break;
      case 'holding': // confidently flat — the ~0 pct + CI band IS the finding (PIN 3 → show_pct true)
        copy = 'Holding steady on this stretch — same pace for the same effort.';
        flags = { show_arrow: false, show_slope: false, show_pct: true };
        break;
      case 'improving':
        copy = 'You’re getting faster on this stretch.';
        flags = { show_arrow: true, show_slope: true, show_pct: true };
        break;
      case 'declining':
        copy = 'Slipping a little on this stretch.';
        flags = { show_arrow: true, show_slope: true, show_pct: true };
        break;
      default: {
        const _exhaustive: never = r.direction; // new VerdictDirection variant → compile error here
        throw new Error(`unhandled segment verdict direction: ${_exhaustive}`);
      }
    }
    const verdict: SegmentVerdictV1['verdict'] = {
      direction: r.direction,
      metric: r.metric,
      n: r.n,
      n_hr_aligned: r.n_hr_aligned,
      window_days: r.window_days,
      method: r.method,
      span_days: r.span_days,
    };
    // Suppress pct AND ci entirely unless show_pct — no hidden number reaches the client (rule D).
    if (flags.show_pct) {
      if (r.pct != null) verdict.pct = r.pct;
      if (r.ci_low != null && r.ci_high != null) verdict.ci = [r.ci_low, r.ci_high];
    }
    return {
      copy,
      render_flags: flags,
      provenance: r.n_hr_aligned === r.n ? 'hr_aligned' : 'raw_pace_only',
      verdict,
      chart_points: Array.isArray(r.chart_points) ? r.chart_points : [], // server-windowed; passthrough
      runs_all_time: typeof r.runs_all_time === 'number' ? r.runs_all_time : r.n,
    };
  });
}

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
    completedSwimScalars,
    completedRunScalars,
    weatherTempF,
    completedRefinedType,
    nextSession,
    readinessSnapshot,
    readinessUnavailable,
    arcPerformance,
  } = input;

  const type = normType(workoutType) as SessionDetailV1['type'];
  const wa = workoutAnalysis || {};
  // Q-097/Q-102 phase 2: a 1RM/baseline TEST is measurement, not training. When flagged by the analyzer
  // (top-level or session_state_v1), the Performance screen renders the test-result frame INSTEAD of the
  // training table + execution/volume — so suppress the execution score + training narrative here.
  const isTest = (wa as any).is_test === true || (wa as any)?.session_state_v1?.is_test === true;
  const testResult = ((wa as any).test_result_v1 || (wa as any)?.session_state_v1?.test_result_v1) ?? null;
  const isGoalRace = (wa as any).is_goal_race === true;
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
  // A test has no execution score — never let one leak onto the Performance screen (Q-097/Q-102).
  if (isTest) executionScore = null;

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
    !isGoalRace &&
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
      // D-089: cycling interval_breakdown carries planned_power_range_lower/upper
      // (watts). Mirror the pace-range derivation so rides surface "150-167 W"
      // in the planned-label subtitle without a cycling-specific code path.
      const pwLower = iv.planned_power_range_lower ?? iv.planned_power_range?.lower;
      const pwUpper = iv.planned_power_range_upper ?? iv.planned_power_range?.upper;
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
      const hasPowerRange =
        Number.isFinite(pwLower) &&
        Number.isFinite(pwUpper) &&
        Number(pwLower) > 0 &&
        Number(pwUpper) > 0;
      const ivType = normIntervalType(iv?.interval_type || iv?.kind);
      intervals.push({
        id: String(iv?.interval_id || iv?.interval_number || intervals.length),
        interval_type: ivType,
        interval_number: typeof iv?.interval_number === 'number' ? iv.interval_number : undefined,
        recovery_number: typeof iv?.recovery_number === 'number' ? iv.recovery_number : undefined,
        planned_label: humanizePlannedSegmentLabel(
          String(iv?.planned_label ?? sr?.planned_label ?? iv?.interval_type ?? ''),
          ivType,
          {
            intervalNumber: typeof iv?.interval_number === 'number' ? iv.interval_number : null,
            recoveryNumber: typeof iv?.recovery_number === 'number' ? iv.recovery_number : null,
          },
        ),
        planned_duration_s: fin(iv?.planned_duration_s),
        planned_pace_range: hasRange ? { lower_sec_per_mi: Number(lower), upper_sec_per_mi: Number(upper) } : undefined,
        planned_pace_display: (() => {
          if (typeof sr?.planned_pace_display === 'string') return sr.planned_pace_display;
          if (hasRange) return fmtPaceRange(Number(lower), Number(upper));
          // D-089: cycling — use the power range as the planned subtitle.
          if (hasPowerRange) return `${Math.round(Number(pwLower))}-${Math.round(Number(pwUpper))} W`;
          return null;
        })(),
        executed: {
          duration_s: fin(iv?.actual_duration_s) ?? fin(sr?.executed?.duration_s),
          distance_m: fin(iv?.actual_distance_m) ?? fin(sr?.executed?.distance_m),
          avg_hr: fin(iv?.avg_heart_rate_bpm) ?? fin(sr?.executed?.avg_hr),
          actual_pace_sec_per_mi: paceSec,
          actual_gap_sec_per_mi: null,
          power_watts: fin(iv?.avg_power_watts) ?? null,
        },
        // D-089: for cycling, fall back to power_adherence_percent so the
        // adherence badge renders watts-vs-target on rides (client already
        // colors pct via pctColor — sport-neutral).
        // D-090: explicit null in power_adherence_percent means "ungraded"
        // (cycling recovery rows). Short-circuit before the sr.adherence_pct
        // fallback — that fallback would still produce a spurious badge.
        pace_adherence_pct: (() => {
          if (iv && iv.pace_adherence_percent === null) return null;
          if (iv && iv.power_adherence_percent === null) return null;
          const fromIv = fin(iv?.pace_adherence_percent) ?? fin(iv?.power_adherence_percent);
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
    // Number work and recovery rows so the label synthesizer can produce
    // "Interval N" / "Recovery N" when the analyzer didn't ship a label.
    let workCursor = 0;
    let recoveryCursor = 0;
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const ex = r?.executed || {};
      const paceS = fin(ex.avg_pace_s_per_mi) ?? fin(ex.pace_s_per_mi);
      const rowKind = normIntervalType(r?.kind);
      const isWork = rowKind === 'work';
      const isRecovery = rowKind === 'recovery';
      const ivN = isWork ? (++workCursor) : null;
      const recN = isRecovery ? (++recoveryCursor) : null;
      intervals.push({
        id: String(r.row_id || r.planned_step_id || i),
        interval_type: rowKind,
        interval_number: ivN ?? undefined,
        recovery_number: recN ?? undefined,
        planned_label: humanizePlannedSegmentLabel(String(r.planned_label ?? ''), rowKind, {
          intervalNumber: ivN,
          recoveryNumber: recN,
        }),
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
  const isGoalRaceSessionEarly = String(adherenceSummary?.plan_impact?.focus || '').trim() === 'Race result';
  // Goal races use structured technical_insights — suppress bullets so they don't render alongside
  const summaryBullets = isGoalRaceSessionEarly
    ? []
    : mergeDedupe(
        arrayOfStrings(sessionState?.summary?.bullets),
        arrayOfStrings(observations),
        arrayOfStrings(sessionState?.narrative?.observations),
      );

  // ── Narrative ──────────────────────────────────────────────────────────────
  const isGoalRaceSession = isGoalRaceSessionEarly;

  const goalRaceNarrativeFromAdherence = (() => {
    if (!isGoalRaceSession) return null;
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

  // Sport-guard: race_debrief_text + run-shaped narrative copy is run-only. Even if a
  // dirty row has stale run analysis (historical mis-route surviving the analyzer
  // spread-merge — see docs/MAINTENANCE-DEBT.md "Cross-sport analysis-key bleed"),
  // never surface pace-per-mile / run-debrief copy on a non-run session. Fix 1 scrubs
  // the data at write time; this is the defense-in-depth display guard so a row that
  // hasn't been re-analyzed yet still can't render run copy on a ride/swim.
  const raceDebriefText =
    type === 'run' &&
    typeof (wa as any).race_debrief_text === 'string' && String((wa as any).race_debrief_text).trim()
      ? String((wa as any).race_debrief_text).trim()
      : null;

  // Goal races: use null so structured technical_insights render as label/value rows, not a wall of text
  const resolvedNarrative = isGoalRaceSession
    ? null
    : llmNarrative || null;

  // ── Planned totals (must come before completed — swim unit needed for pace calc) ─
  const plannedTotals: SessionDetailV1['planned_totals'] = buildPlannedTotals(plannedComp, plannedSession, plannedRowRaw);

  // ── Completed totals ───────────────────────────────────────────────────────
  const completedDurS = fin(compOverall?.duration_s_moving);
  const completedDistM = fin(compOverall?.distance_m);
  const swimUnit = plannedTotals.swim_unit || 'yd';
  // D-182: for SWIMS, moving-seconds + distance + avg-HR come from the RAW-column scalar
  // (completedSwimScalars), NOT computed.overall — which is sample-derived and has produced impossible
  // swim values (moving > elapsed). This is the SAME source the narrative reads, so card and narrative
  // can never diverge on pace/HR again (the D-156 lesson, now enforced cross-surface). Non-swims keep
  // computed.overall untouched (GPS-authoritative). Falls back to compOverall if no scalar was passed.
  const swimDurS = type === 'swim' ? (completedSwimScalars?.movingSeconds ?? completedDurS) : completedDurS;
  const swimDistM = type === 'swim' ? (completedSwimScalars?.distanceMeters ?? completedDistM) : completedDistM;
  // D-167: single-sourced via the shared helper so the analyzer's narrative pace can't diverge from
  // this (the Performance-tab) value. Moving duration ÷ distance, per 100 of the display unit.
  const completedSwimPer100 = type === 'swim'
    ? swimPacePer100Seconds(swimDurS, swimDistM, swimUnit === 'yd' ? 'yd' : 'm')
    : null;
  const fpFacts = factPacket?.facts || {};
  const fpDerived = factPacket?.derived || {};
  // D-185: RUN GAP via the ONE read-through accessor (sample-derived; the analyzer owns it). Honest
  // null today (overall-GAP not yet persisted — "make honest now, persist later"); never fabricated.
  const completedRunGap = type === 'run' ? resolveRunGap({ workout_analysis: wa, computed: comp }) : null;
  // D-163: a swim's planned duration is TOTAL session time (incl. rest), so the swim block must show the
  // athlete's ELAPSED pool time (from the analyzer's session_elapsed_s) — NOT moving time, which excludes
  // rest and made "duration" read short. Pace stays on moving time (completedSwimPer100 uses completedDurS
  // above, computed before this). Non-swims and missing elapsed fall back to moving.
  // D-182: prefer the raw-column elapsed scalar for swims (authoritative; perf.session_elapsed_s and
  // computed.overall have both been unreliable). Falls back to the prior perf-derived value.
  const completedElapsedS = (type === 'swim' ? completedSwimScalars?.elapsedSeconds : null) ?? fin((perf as any)?.session_elapsed_s);
  // D-194: work:rest readout for the swim card — single-sourced from the same swim scalars as pace/
  // duration (resolveSwimScalars), never recomputed elsewhere. "Work 24:00 · Rest 11:00". Null for
  // non-swims or when elapsed isn't a clean superset of moving (some sources carry only one).
  const swimMovingS = type === 'swim' ? (completedSwimScalars?.movingSeconds ?? null) : null;
  const swimWorkRest = (() => {
    if (swimMovingS == null || completedElapsedS == null) return null;
    if (!(completedElapsedS > swimMovingS) || !(swimMovingS > 0)) return null;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    return `Work ${fmt(swimMovingS)} · Rest ${fmt(completedElapsedS - swimMovingS)}`;
  })();
  const completedTotals: SessionDetailV1['completed_totals'] = {
    duration_s: (type === 'swim' && completedElapsedS != null && completedElapsedS > 0) ? completedElapsedS : swimDurS,
    distance_m: swimDistM,
    // Land pace (min/mi) + GAP are meaningless for a swim — null them so the swim screen never
    // renders "5:03/mi". Swim pace lives in swim_pace_per_100_s. (Layer 1: numbers honest; the
    // full swim-native template — speed chart, cadence, grade rows — is the separate Layer 2.)
    // D-185: RUN reads the ONE run resolver (completedRunScalars / resolveRunGap) so card == narrative
    // == facts; the compOverall/fpFacts terms are belt-and-suspenders fallback (fire only if the
    // resolver returns null) and keep walk/hike on the prior path. Swim nulls land pace (D-182).
    avg_pace_s_per_mi: type === 'swim' ? null : ((type === 'run' ? fin(completedRunScalars?.paceSecPerMi) : null) ?? fin(compOverall?.avg_pace_s_per_mi) ?? fin(fpFacts?.avg_pace_sec_per_mi)),
    avg_gap_s_per_mi: type === 'swim' ? null : ((type === 'run' ? fin(completedRunGap) : null) ?? fin(compOverall?.avg_gap_s_per_mi) ?? fin(fpFacts?.avg_gap_sec_per_mi)),
    // D-182 swim avg-HR from the raw-column scalar; D-185 run avg-HR from the run resolver (matches the
    // narrative); other non-swims unchanged.
    avg_hr: (type === 'swim' ? completedSwimScalars?.avgHr : (type === 'run' ? completedRunScalars?.avgHr : null)) ?? fin(compOverall?.avg_hr) ?? fin(fpFacts?.avg_hr) ?? fin(actualSession?.avg_heart_rate as any),
    swim_pace_per_100_s: completedSwimPer100,
    swim_work_rest: swimWorkRest, // D-194
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
  const weekLabel = (() => {
    if (isGoalRaceSession) {
      const verdict = String(adherenceSummary?.verdict || '');
      const m = verdict.match(/Congratulations on finishing\s+(.+?)(?:\s*$|[.!])/i);
      if (m?.[1]) return `Goal race • ${m[1].trim()}`;
      return 'Goal race';
    }
    return buildWeekLabel(factPacket);
  })();

  // D-036 aerobic decoupling, resolved ONCE (single source): the classification
  // block below and the Performance "Aerobic decoupling" row both read this — they
  // cannot diverge. { pct, basis, assessment } from the analyzer's heart_rate_summary.
  const decouplingV1 = (() => {
    const hrs = (wa as any)?.heart_rate_summary;
    if (!hrs || typeof hrs !== 'object') return null;
    const pct = (hrs as any)?.decouplingPct;
    const basis = (hrs as any)?.decouplingBasis ?? null;
    const assessment = (hrs as any)?.decouplingAssessment ?? null;
    if (pct == null && basis == null && assessment == null) return null;
    return {
      pct: typeof pct === 'number' && Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null,
      basis: (basis === 'gap' || basis === 'raw') ? basis : null,
      assessment: (['excellent','good','moderate','high'] as const).includes(assessment as any) ? assessment : null,
    };
  })();

  // ── Analysis detail rows ───────────────────────────────────────────────────
  // Goal races use structured technical_insights only — suppress fact-packet rows to avoid duplication
  const analysisDetailRows = isGoalRaceSession
    ? []
    : buildAnalysisDetailRows(
        factPacket,
        flagsV1,
        summaryBullets.length > 0,
        comp,
        !!perf?.gap_adjusted,
        intervals,
        type,
        (wa as any)?.vs_similar_v1 ?? null,
        (typeof weatherTempF === 'number' && Number.isFinite(weatherTempF)) ? Math.round(weatherTempF) : null,
        decouplingV1,
      );

  // ── Adherence narrative ────────────────────────────────────────────────────
  const techInsights: Array<{ label: string; value: string }> = Array.isArray(adherenceSummary?.technical_insights)
    ? adherenceSummary.technical_insights
        .filter((t: any) => t?.label && t?.value)
        .map((t: any) => ({ label: String(t.label), value: String(t.value) }))
    : [];
  const planImpactText = (() => {
    if (isGoalRaceSession) return null; // goal race has no plan adherence context
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

  // Cycling Insights fallback: when no LLM ai_summary exists (narrativeText/
  // session_state_v1.narrative.text both null) a ride's Insights block was near-empty.
  // Synthesize a deterministic narrative from the fact packet (NP/IF/classified_type/
  // VI + HR + a flag). Template, not LLM — used only when the LLM summary is absent;
  // a real ai_summary always wins. Run/swim/strength keep their existing path.
  const cyclingNarrativeFallback = (() => {
    if (type !== 'ride' || resolvedNarrative || isGoalRaceSession) return null;
    const f = (factPacket?.facts || {}) as any;
    const np = Number(f.normalized_power_w);
    const ifv = Number(f.intensity_factor);
    const vi = Number(f.variability_index);
    const ct = f.classified_type ? String(f.classified_type).replace(/_/g, ' ') : null;
    const dur = Number(f.total_duration_min);
    const avgHr = Number(f.avg_hr);
    const parts: string[] = [];
    const lead = ct ? `${ct.charAt(0).toUpperCase()}${ct.slice(1)} ride` : 'Ride';
    if (Number.isFinite(np) && np > 0 && Number.isFinite(ifv) && ifv > 0) {
      parts.push(`${lead}: ${Math.round(np)}W normalized power at IF ${ifv.toFixed(2)}${Number.isFinite(dur) && dur > 0 ? ` over ${Math.round(dur)} min` : ''}.`);
    } else if (Number.isFinite(dur) && dur > 0) {
      parts.push(`${lead} — ${Math.round(dur)} min.`);
    } else {
      parts.push(`${lead}.`);
    }
    if (Number.isFinite(vi) && vi > 0) {
      parts.push(vi <= 1.05
        ? `Steady output (VI ${vi.toFixed(2)}) — well-controlled power.`
        : `Variable output (VI ${vi.toFixed(2)}) — surgey power delivery.`);
    }
    if (Number.isFinite(avgHr) && avgHr > 0) parts.push(`Avg HR ${Math.round(avgHr)} bpm.`);
    const flag = Array.isArray(flagsV1)
      ? flagsV1.find((x: any) => x && typeof x.message === 'string' && x.message.trim())
      : null;
    if (flag) parts.push(String(flag.message).trim());
    return parts.length ? parts.join(' ') : null;
  })();

  const performanceNarrativeText = mergeArcPerformanceNarrative({
    analysisNarrative: resolvedNarrative || cyclingNarrativeFallback,
    isGoalRaceSession,
  });

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
      // D-208: strength component attribution (per-component score + skipped exercises w/ role +
      // which component cost the most). Drives the "what moved it" microcopy. Null for endurance.
      component_attribution:
        (sessionState?.details?.execution_summary?.component_attribution
          ?? (wa as any)?.detailed_analysis?.execution_summary?.component_attribution) ?? null,
    },

    observations,
    // A test tells its story through the test-result frame, not a training narrative (Q-097/Q-102).
    narrative_text: isTest ? null : performanceNarrativeText,
    coaching_note: plannedComp?.coaching_note ?? null,
    arc_performance: arcPerformance,
    race_debrief_text: raceDebriefText,
    race:
      (sessionState as any).race && typeof (sessionState as any).race === 'object'
        ? ((sessionState as any).race as SessionDetailV1['race'])
        : null,

    summary: { title: summaryTitle, bullets: summaryBullets },

    completed_totals: completedTotals,
    planned_totals: plannedTotals,
    weather: (typeof weatherTempF === 'number' && Number.isFinite(weatherTempF))
      ? { temperature_f: Math.round(weatherTempF) }
      : null,

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
      // D-041 Fix C: surface duration-derived workout_type from fact-packet
      // facts. Soft descriptive label only — NEVER a target (D-035 carryover).
      // Client uses it as a label-only signal (e.g. "Steady" label override
      // for single-segment long_run / easy_run). Don't gate effort
      // interpretation on this field downstream.
      workout_type: (factPacket?.facts as any)?.workout_type
        ? String((factPacket!.facts as any).workout_type)
        : null,
      // D-NNN: variance gate — surfaced from session_state_v1.glance (analyzer-computed).
      // Client renders; never derives. Defaults to false when older rows lack
      // the field (stale-until-touched, per spec §5).
      is_mixed_effort: Boolean((sessionState as any)?.glance?.is_mixed_effort),
      variance_signal: ((sessionState as any)?.glance?.variance_signal as SessionDetailV1['classification']['variance_signal']) ?? null,
      classified_type_variance_override: Boolean((sessionState as any)?.glance?.classified_type_variance_override),
      // D-035: server-computed unplanned flag. One canonical signal for chips
      // (hide), LLM input (drop prescribed-range), and narrative (UNPLANNED MODE).
      is_unplanned: !match?.planned_id,
      // D-036: GAP-corrected aerobic decoupling. Sourced from analyzer's
      // workout_analysis.heart_rate_summary (sample-level, warmup-skipped).
      // Null when not computed (interval workout, < 20 min of paced-HR data,
      // cycling/swim) — older rows without the fields render decoupling: null.
      decoupling: decouplingV1,
      // D-264 step-0 receipt: HR drift (bpm) sourced from the FIXED pipeline
      // (buildActualSession → session.hr_drift_bpm), NOT a re-read of workout_analysis —
      // proves the real nested row flows through deployed code end-to-end.
      hr_drift_bpm: (actualSession as any)?.hr_drift_bpm ?? null,
    },

    splits_mi: splitsMi,
    pacing: {
      coefficient_of_variation: pacingCV,
      // D-NNN: extended variance numerics from analyzer glance. Client uses
      // these to render (e.g., show a "GAP" badge on CV) but never recomputes.
      coefficient_of_variation_basis: ((sessionState as any)?.glance?.pace_cv_basis as 'gap' | 'raw' | null) ?? null,
      pace_spread_s_per_mi: null,
      variability_index: ((sessionState as any)?.glance?.variability_index as number | null) ?? null,
      power_cv_pct: ((sessionState as any)?.glance?.power_cv_pct as number | null) ?? null,
    },

    // TREND removed (2026-07-05): this block computed its OWN raw-pace / raw-power trend — a fork vs the
    // State screen (see the State-vs-Performance audit). Macro trends now live ONLY on State; the
    // per-session route context is the same-route EFFICIENCY read on `terrain.route.efficiency` below
    // (State's efficiency metric, restricted to this route). `pickCyclingTrendSeries` stays exported
    // but is no longer called here.
    trend: null,

    discipline_trend: input.disciplineTrend ?? null,

    next_session: nextSession ?? null,

    terrain: (() => {
      const tc = factPacket?.derived?.terrain_context;
      if (!tc?.route_runs) return null;
      const r = tc.route_runs as any;
      const history = Array.isArray(r.history) ? r.history : [];
      const timesRun = Number(r.times_run || 0);
      // Gate on FAMILIARITY (cluster total), not on recent history — a route run a lot but not lately
      // should still show "run Nx". The efficiency DIRECTION is intentionally NOT surfaced here (heat-
      // confounded + contradicts State's decoupling-led read); State owns efficiency trends.
      if (timesRun < 2 && history.length < 2) return null;
      return {
        route: {
          times_run: timesRun,
          first_seen: r.first_seen ? String(r.first_seen).slice(0, 10) : null,
          comparable_runs: history.length,
          chart_eligible: history.length >= 8,
          history,
          readout: buildRouteReadout(history),
        },
      };
    })(),

    // Per-core segment verdict(s) — rendered from core_verdicts (spine-authored, Law 5); build.ts
    // maps, never recomputes (Law 4). [] when this run traversed no core.
    segment_verdicts: buildSegmentVerdicts(input.coreVerdicts),

    display: {
      show_adherence_chips: isTest ? false : showAdherenceChips,
      interval_display_reason: intervalDisplay?.reason ?? null,
      has_measured_execution: isTest ? false : hasMeasuredExecution,
    },

    // Q-097/Q-102 phase 2 — a 1RM/baseline TEST + its per-lift result. The Performance screen renders the
    // test-result frame instead of the training table + execution/volume when is_test is true.
    is_test: isTest,
    test_result: testResult,

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

/**
 * Mode-aware cycling TREND series selection (design Build Order #1). The doc's
 * resolved TREND table maps the dominant "unplanned, no segments" case to the
 * 20-min power best over 90 days, so pwr20_trend_v1 (Item D) is the primary
 * series; np_trend_v1 is the fallback so an already-populated NP sparkline
 * never regresses. Other TREND-table rows (Mode 1 block-adherence, Mode 3/4
 * segment series, no-power decoupling series) require persistence outside the
 * autonomous tier and are documented at the call site. Returns the chosen
 * dated points (≥3) + display labels, or null.
 */
export function pickCyclingTrendSeries(
  wa: unknown,
): { points: any[]; metricLabel: string; noun: string; rideType: string | null } | null {
  const w = (wa ?? null) as any;
  const pwr20 = w?.pwr20_trend_v1?.points;
  if (Array.isArray(pwr20) && pwr20.length >= 3) {
    // pwr20_trend_v1 is filtered to one classified_type by the analyzer;
    // surface it so the summary reads "over N vo2 rides".
    const ct = w?.pwr20_trend_v1?.classified_type;
    return {
      points: pwr20,
      metricLabel: 'Best 20-min power',
      noun: '20-min power',
      rideType: ct ? String(ct).replace(/_/g, ' ') : null,
    };
  }
  const nptr = w?.np_trend_v1?.points;
  if (Array.isArray(nptr) && nptr.length >= 3) {
    // D-092: suppress the mixed-type NP fallback on planned structured sessions
    // (plan_intent ∈ sweet_spot/threshold/vo2/tempo/...). The user opened a
    // sweet-spot ride; an aggregate NP trend across endurance + sweet-spot +
    // recovery rides is not a meaningful comparison for "is the threshold work
    // trending up?". Type-filtered pwr20 didn't have ≥3 points yet — better to
    // show no TREND than a misleading one. Unplanned/non-structured rides still
    // get the fallback because they have no intent for which the mixed series
    // would be misleading.
    const planIntent = w?.fact_packet_v1?.facts?.plan_intent;
    const structuredIntents = new Set([
      'sweet_spot', 'threshold', 'vo2', 'tempo',
      'anaerobic', 'neuromuscular', 'race_prep',
    ]);
    if (typeof planIntent === 'string' && structuredIntents.has(planIntent)) {
      return null;
    }
    // Fallback: NP series is NOT type-filtered (mixed ride types) — no type word.
    return { points: nptr, metricLabel: 'Normalized power', noun: 'NP', rideType: null };
  }
  return null;
}

/**
 * Cycling vs-similar context row from vs_similar_v1 (Tier 3 item 10 / D-010).
 * vs_similar_v1 only carries np_delta_w (current − avg of matched rides), so the
 * absolute "avg" NP is reconstructed as currentNp − np_delta_w. Spec format:
 *   "NP {X}W vs {Y}W avg on similar {type} rides — {assessment}"
 * Falls back to a delta phrasing when the current NP isn't available (we can't
 * show absolute X/Y without it, but the comparison itself is still meaningful).
 * Label is 'vs similar' (NOT 'Trend' — the Trend sparkline is the separate
 * top-level `trend` contract field; a same-named analysis_details row is
 * confusing). Watts use uppercase W for consistency with the rest of the
 * cycling display (Power row, trend unit), not the spec's informal lowercase w.
 * Gate: vs_similar_v1 not null (it is contractually null below 3 matches).
 */
export function formatCyclingVsSimilarRow(
  vsSimilar: any,
  currentNpW: number | null | undefined,
): { label: string; value: string } | null {
  if (!vsSimilar) return null;
  // np_delta_w is `number | null` per contract; null = no delta → no row.
  // (Number(null) === 0, so an explicit null check is required before the
  // finite check, otherwise a null delta would render as a 0W comparison.)
  if (vsSimilar.np_delta_w == null) return null;
  const npD = Number(vsSimilar.np_delta_w);
  if (!Number.isFinite(npD)) return null;
  const type = vsSimilar.matched_type
    ? `${String(vsSimilar.matched_type).replace(/_/g, ' ')} rides`
    : 'similar rides';
  const asmt = typeof vsSimilar.assessment === 'string' && vsSimilar.assessment
    ? String(vsSimilar.assessment).replace(/_/g, ' ')
    : null;
  const tail = asmt ? ` — ${asmt}` : '';
  const cur = Number(currentNpW);
  if (Number.isFinite(cur) && cur > 0) {
    const avg = Math.round(cur - npD);
    return { label: 'vs similar', value: `NP ${Math.round(cur)}W vs ${avg}W avg on similar ${type}${tail}` };
  }
  // No current NP — can't show absolute X/Y; fall back to the signed delta.
  const sign = npD >= 0 ? '+' : '';
  return { label: 'vs similar', value: `NP ${sign}${Math.round(npD)}W vs avg on similar ${type}${tail}` };
}

/**
 * Cycling PACING row — power progression across the structured ride's work
 * intervals (the cycling analogue of running's pace-progression Pacing row).
 * Source is the normalized `intervals` array (built from
 * granular_analysis.interval_breakdown upstream), filtered to interval_type
 * 'work' with a finite positive avg power. ≥2 work intervals → first → last
 * avg power; null otherwise (steady/endurance rides have no work-interval
 * progression and produce no row).
 */
export function formatCyclingPacingRow(
  intervals: Array<{ interval_type?: string; executed?: { power_watts?: number | null } }> | null | undefined,
): { label: string; value: string } | null {
  if (!Array.isArray(intervals)) return null;
  const work = intervals
    .filter((iv) => String(iv?.interval_type) === 'work')
    .map((iv) => Number(iv?.executed?.power_watts))
    .filter((w) => Number.isFinite(w) && w > 0);
  if (work.length < 2) return null;
  return {
    label: 'Pacing',
    value: `Work intervals: ${Math.round(work[0])}W → ${Math.round(work[work.length - 1])}W`,
  };
}

/**
 * EFFICIENCY row from computed.analysis.efficiency (the block compute-workout-
 * analysis writes via ride-physiology.computeRideEfficiency). Reads the ACTUAL
 * persisted keys efficiency_factor + aerobic_decoupling_pct. (The request named
 * the decoupling field generically; the shipped shape uses
 * `aerobic_decoupling_pct` — Friel aerobic decoupling %. Documented deviation.)
 * Gate: BOTH finite — decoupling is only present for steady efforts ≥20 min, so
 * short/interval rides correctly produce no row. Label literal per request.
 */
export function formatCyclingEfficiencyRow(
  efficiency: unknown,
): { label: string; value: string } | null {
  const e = (efficiency ?? null) as any;
  if (!e || typeof e !== 'object') return null;
  // Explicit null/undefined check before Number(): aerobic_decoupling_pct is
  // optional (absent on short/interval rides; may round-trip as null through
  // JSONB) and Number(null) === 0 would otherwise render a bogus "0% HR
  // decoupling" row. Same Number(null) trap class as the vs-similar fix.
  if (e.efficiency_factor == null || e.aerobic_decoupling_pct == null) return null;
  const ef = Number(e.efficiency_factor);
  const dec = Number(e.aerobic_decoupling_pct);
  if (!Number.isFinite(ef) || !Number.isFinite(dec)) return null;
  // D-062 / Item 4 — plain-language translation per Q-010 / SESSION-CONTEXT.md
  // §3 cosmetic footgun. "EF" (Efficiency Factor — NP/avg HR) and "HR decoupling"
  // (Friel pace-vs-HR drift %) are technical-coaching terms; the INSIGHTS prose
  // is already kept jargon-clean by `summaryHasJargon` (SESSION-CONTEXT §7
  // 3-guard-stack footgun) but the dashboard rows still leaked the abbreviations.
  // Athletes recognize "watts per heartbeat" and "HR drift" more readily.
  return { label: 'EFFICIENCY', value: `Watts per heartbeat ${ef} · HR drift ${dec}%` };
}

/**
 * CLIMBING row from computed.analysis.climbing (ride-physiology.computeRideVam).
 * The request named the fields `vertical_ascent_rate_m_per_h` / `total_ascent_m`;
 * the shipped shape persists `vam_m_per_h` / `climb_ascent_m` — read the real
 * keys (the requested names would resolve undefined and the row would never
 * render). Documented deviation. Gate: VAM finite and > 0 (flat rides have no
 * climbing block at all — computeRideVam returns null below 30 m / 120 s).
 * Label literal per request.
 */
export function formatCyclingClimbingRow(
  climbing: unknown,
): { label: string; value: string } | null {
  const c = (climbing ?? null) as any;
  if (!c || typeof c !== 'object') return null;
  const vam = Number(c.vam_m_per_h);
  if (!Number.isFinite(vam) || vam <= 0) return null;
  const ascent = Number(c.climb_ascent_m);
  const ascentStr = Number.isFinite(ascent) ? ` · ${Math.round(ascent)}m gain` : '';
  return { label: 'CLIMBING', value: `VAM ${Math.round(vam)} m/h${ascentStr}` };
}

export function buildAnalysisDetailRows(
  factPacket: any, flagsV1: any[], hasBullets: boolean, comp: any, gapAdjusted: boolean = false,
  intervals: IntervalRow[] = [], sport: string = '', vsSimilar: any = null,
  weatherTempF: number | null = null,
  decoupling: { pct: number | null; basis: 'gap' | 'raw' | null; assessment: 'excellent' | 'good' | 'moderate' | 'high' | null } | null = null,
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



  // SPORT GUARD (2026-05-14): this entire block emits `s/mi` pace-per-mile copy —
  // "Negative split — pacing Ns/mi faster", "Fastest: Mile N at M:SS/mi", structured
  // "Work intervals faded Ns/mi". It reads `computed.analysis.events.splits.mi`, which
  // compute-workout-analysis populates for ANY workout with a GPS distance series
  // (including an Edge-1040 bike ride). With no discipline check it rendered run
  // pacing copy on the cycling goal-race workout (the reported "Mile 9 at 2:51/mi"
  // bug — actual source, distinct from race_debrief_text / the goal-race debrief
  // block). Pace-per-mile is a running construct; cyclists get power/NP pacing
  // elsewhere. Run-only. See docs/MAINTENANCE-DEBT.md "Cross-sport analysis-key bleed".
  try {
    if (sport !== 'run') throw new Error('skip: pace-per-mile pacing is run-only');
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

  // Cycling counterpart to the run Pacing row above: rides have no pace-per-mile
  // construct, so surface NP/IF instead. Mirrors the analyzer's own technical
  // insight (analyze-cycling-workout/index.ts:292) — same fields, same wording —
  // so the Insights box isn't near-empty on a ride. Run is excluded (it gets the
  // Pacing row); this fires for ride/other non-run sports with power data.
  try {
    if (sport === 'run') throw new Error('skip: run gets the Pacing row');
    const cf = factPacket?.facts;
    // fact_packet_v1.facts persists this as `normalized_power_w` (rounded int) —
    // see _shared/cycling-v1/build.ts:173. NOT `normalized_power` (no such key).
    const np = cf?.normalized_power_w;
    const ifv = cf?.intensity_factor;
    if (typeof np === 'number' && np > 0 && typeof ifv === 'number' && ifv > 0) {
      // D-062 / Item 4 — translate "IF 0.85" to "85% of threshold" per Q-010
      // plain-language cosmetic pass. Athletes read percent-of-threshold
      // more readily than the IF (Intensity Factor) abbreviation; same
      // numeric content, plain wording. Mirrors the SESSION-CONTEXT §7
      // 3-guard-stack jargon ban on the INSIGHTS narrative side.
      const pctThreshold = Math.round(ifv * 100);
      // D-113: describe execution from execution data — derived.executed_intensity
      // (easy/moderate/hard), NOT classified_type which is the planned intent. Stops
      // the row asserting "sweet spot effort" on a 79%-of-threshold ride. classified_type
      // stays untouched for grouping/trends; just not rendered as the execution descriptor here.
      const ei = (factPacket as any)?.derived?.executed_intensity;
      const effortDescriptor = (typeof ei === 'string' && ei !== 'unknown') ? `${ei} effort` : null;
      const suffix = effortDescriptor ? ` — ${effortDescriptor}` : '';
      rows.push({ label: 'Power', value: `Normalized power ${np}W (${pctThreshold}% of threshold)${suffix}` });
    }
  } catch { /* */ }

  // ── Cycling parity rows (ride only) ─────────────────────────────────────────
  // Rides have no pace-per-mile / route-history / weather facts in the cycling fact
  // packet, so the run-shaped HR-drift / Conditions blocks below no-op for rides.
  // These emit the cycling equivalents from data already in the cycling fact packet
  // (avg/max HR, ftp_bins) + completed computed (elevation) + vs_similar_v1. All
  // route through analysis_details.rows, which the client renders verbatim and
  // relabels Conditions→Terrain on elevation strings.

  // Heart rate (cycling): no derived.hr_drift_bpm in the cycling packet, so surface
  // avg/max instead of the run drift narrative.
  try {
    if (sport === 'ride') {
      const f = (factPacket?.facts || {}) as any;
      const avgHr = Number(f.avg_hr);
      const maxHr = Number(f.max_hr);
      const parts: string[] = [];
      if (Number.isFinite(avgHr) && avgHr > 0) parts.push(`Avg ${Math.round(avgHr)} bpm`);
      if (Number.isFinite(maxHr) && maxHr > 0) parts.push(`Max ${Math.round(maxHr)} bpm`);
      if (parts.length > 0) rows.push({ label: 'Heart rate', value: parts.join(' · ') });
    }
  } catch { /* */ }

  // Efficiency (cycling): HR-at-power EF + Friel aerobic decoupling from
  // computed.analysis.efficiency. Placed after Heart rate per spec.
  try {
    if (sport === 'ride') {
      const row = formatCyclingEfficiencyRow(comp?.analysis?.efficiency);
      if (row) rows.push(row);
    }
  } catch { /* */ }

  // Power zones: ftp_bins is minutes per %-FTP band (CyclingFtpBinsV1). Show
  // meaningful bands (>2 min) biggest-first and roll the remainder into
  // "+Xm other" so the displayed total accounts for the FULL ride duration.
  // Two sources of "missing" time: (a) small non-zero bands ≤2 min; (b) the
  // bins only count PEDALING — computeFtpBinsMinutes skips pw≤0, so coasting/
  // descending time (20+ min on a climbing route) is never binned. Anchor the
  // remainder to facts.total_duration_min so the row total matches the header
  // duration. (Was also capped at top-4, which silently dropped whole zones.)
  try {
    if (sport === 'ride') {
      const bins = (factPacket?.derived?.ftp_bins || null) as Record<string, number> | null;
      if (bins && typeof bins === 'object') {
        const label: Record<string, string> = {
          lt_0_60_min: 'Recovery',
          p0_60_0_75_min: 'Endurance',
          p0_75_0_85_min: 'Tempo',
          p0_85_0_95_min: 'Sweet spot',
          p0_95_1_05_min: 'Threshold',
          p1_05_1_20_min: 'VO2',
          gt_1_20_min: 'Anaerobic',
        };
        const nonZero = Object.keys(label)
          .map((k) => ({ name: label[k], min: Math.round(Number(bins[k]) || 0) }))
          .filter((s) => s.min > 0)
          .sort((a, b) => b.min - a.min);
        // Bands >2 min shown individually; the rest (≤2 min) aggregate into
        // "+Xm other" so nothing is dropped and the total ≈ ride duration. If
        // no band clears 2 min (tiny / evenly split ride), show all non-zero.
        const majors = nonZero.filter((s) => s.min > 2);
        const shown = majors.length > 0 ? majors : nonZero;
        // (a) small non-shown non-zero bands + (b) un-binned coasting/rounding
        // drift (ride duration − total binned pedaling minutes), clamped ≥0.
        const smallRemainder = nonZero
          .filter((s) => !shown.includes(s))
          .reduce((sum, s) => sum + s.min, 0);
        const binnedTotal = nonZero.reduce((sum, s) => sum + s.min, 0);
        const rideMin = Math.round(Number((factPacket as any)?.facts?.total_duration_min) || 0);
        const unbinned = rideMin > 0 ? Math.max(0, rideMin - binnedTotal) : 0;
        const otherMin = smallRemainder + unbinned;
        const segs = shown.map((s) => `${s.name} ${s.min}m`);
        if (otherMin > 0) segs.push(`+${otherMin}m other`);
        if (segs.length > 0) rows.push({ label: 'Power zones', value: segs.join(' · ') });
      }
    }
  } catch { /* */ }

  // Pacing (cycling): power progression across structured work intervals — the
  // cycling analogue of running's Pacing row. See formatCyclingPacingRow.
  try {
    if (sport === 'ride') {
      const row = formatCyclingPacingRow(intervals);
      if (row) rows.push(row);
    }
  } catch { /* */ }

  // Terrain (cycling): elevation gain from completed computed (temp is not persisted
  // for rides — omitted). Labelled "Conditions" so the client relabels it TERRAIN.
  try {
    if (sport === 'ride') {
      // computed.overall.elevation_gain_m is frequently null for rides; the value
      // actually lives on the activity lap (computed.analysis.events.laps[0]
      // .total_elevation_gain, metres). Prefer overall when present, else the lap.
      const lap0 = comp?.analysis?.events?.laps?.[0];
      const elevM = Number(
        comp?.overall?.elevation_gain_m ??
          comp?.overall?.elevation_gain ??
          lap0?.total_elevation_gain,
      );
      if (Number.isFinite(elevM) && elevM > 15) {
        const tempSuffix = (typeof weatherTempF === 'number' && Number.isFinite(weatherTempF))
          ? ` · ${Math.round(weatherTempF)}°F`
          : '';
        rows.push({ label: 'Conditions', value: `${Math.round(elevM * 3.28084)} ft gain${tempSuffix}` });
      }
    }
  } catch { /* */ }

  // Climbing (cycling): VAM + ascent from computed.analysis.climbing. Placed
  // after Terrain (the Conditions row above) per spec.
  try {
    if (sport === 'ride') {
      const row = formatCyclingClimbingRow(comp?.analysis?.climbing);
      if (row) rows.push(row);
    }
  } catch { /* */ }

  // vs-similar context row from vs_similar_v1 (Tier 3 item 10 / D-010). Renders
  // even when the NP sparkline lacks ≥3 dated points. See formatCyclingVsSimilarRow.
  try {
    if (sport === 'ride') {
      const row = formatCyclingVsSimilarRow(vsSimilar, factPacket?.facts?.normalized_power_w);
      if (row) rows.push(row);
    }
  } catch { /* */ }

  try {
    const rawAbsDrift = typeof derived?.hr_drift_bpm === 'number' ? derived.hr_drift_bpm : null;
    const paceNormDrift = typeof (derived as any)?.pace_normalized_drift_bpm === 'number'
      ? (derived as any).pace_normalized_drift_bpm : null;
    const driftExplanation = (derived as any)?.drift_explanation as string | null;
    const driftTypical = typeof derived?.hr_drift_typical === 'number' ? derived.hr_drift_typical : null;

    const signal = paceNormDrift ?? rawAbsDrift;

    // Aerobic decoupling — the SINGLE durability verdict for this run (D-036 %, the
    // TrainingPeaks/intervals.icu Pa:Hr standard; <5% = solid base). Renders ONLY on a
    // GAP-basis (terrain-neutral) graded read. When shown, it OWNS "how did the aerobic
    // system hold up" — the descriptive bpm line below is suppressed so there is exactly
    // one HR-behaviour read, never two that can disagree. Raw/confounded/short/interval
    // runs have no % → fall through to the measured (verdict-free) bpm description.
    const decouplingShown = !!(decoupling && decoupling.basis === 'gap'
      && typeof decoupling.pct === 'number' && decoupling.assessment);
    if (decouplingShown) {
      const a = decoupling!.assessment;
      const word = a === 'excellent' ? 'excellent — HR stayed locked to pace'
        : a === 'good' ? 'good — strong aerobic base'
        : a === 'moderate' ? 'moderate — some drift over the run'
        : 'high — HR climbed well above pace';
      rows.push({ label: 'Aerobic decoupling', value: `${decoupling!.pct}% — ${word}` });
    }

    if (decouplingShown || sport === 'swim' || shouldSuppressSessionHrDrift(factPacket, intervals)) {
      // Decoupling % owns it (above), OR swims get no land HR-drift row (terrain/grade/pace
      // framing is land-only), OR interval/variable-pace runs where "HR rose" is meaningless.
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

      // Own-baseline comparison only (no phase-blind duration band — Q-158). Compares
      // this run's drift to the athlete's OWN typical drift; the durationExpectedMax
      // "normal for X min" verdict was removed — it ignored heat + plan phase and could
      // contradict the analyzer's own conditions-aware read.
      if (driftTypical != null && Math.abs(driftTypical) >= 1) {
        const typSign = driftTypical > 0 ? '+' : '';
        const delta = absSig - Math.abs(driftTypical);
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
    if (sport === 'swim') throw new Error('swim-skip-conditions'); // Layer 2: no land terrain/grade/elevation row for swims
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
