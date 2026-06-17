import React, { useMemo, useState } from 'react';
import {
  type SessionInterpretationV1,
  fmtTime,
} from '@/utils/performance-format';
import { formatSwimPace } from '@/utils/workoutFormatting';

type IntervalRow = {
  id: string;
  interval_type: string;
  interval_number?: number;
  recovery_number?: number;
  planned_label: string;
  planned_duration_s: number | null;
  planned_pace_range?: { lower_sec_per_mi: number; upper_sec_per_mi: number };
  planned_pace_display?: string | null;
  executed: {
    duration_s: number | null;
    distance_m: number | null;
    avg_hr: number | null;
    actual_pace_sec_per_mi: number | null;
    actual_gap_sec_per_mi?: number | null;
    power_watts?: number | null;
  };
  pace_adherence_pct: number | null;
  duration_adherence_pct: number | null;
};

export type GoalRaceReferenceMode = 'projection' | 'goal';

type EnduranceIntervalTableProps = {
  sessionDetail: {
    workout_id?: string;
    type?: string;
    execution?: {
      execution_score?: number | null;
      pace_adherence?: number | null;
      power_adherence?: number | null;
      duration_adherence?: number | null;
      gap_adjusted?: boolean;
    };
    intervals?: IntervalRow[];
    intervals_display?: {
      mode?: string | null;
      reason?: string | null;
    };
    completed_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      avg_gap_s_per_mi?: number | null;
      avg_hr?: number | null;
      swim_pace_per_100_s?: number | null;
      swim_work_rest?: string | null; // D-194
    };
    planned_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      swim_pace_per_100_s?: number | null;
      swim_unit?: 'yd' | 'm' | null;
    };
    classification?: {
      is_structured_interval?: boolean;
      is_easy_like?: boolean;
      is_auto_lap_or_split?: boolean;
      is_pool_swim?: boolean;
      /** D-040 Fix C: server-side variance gate flag (D-034). */
      is_mixed_effort?: boolean;
      /** D-041 Fix C: duration-derived workout_type from fact-packet facts.
       * Used as a label-only signal for the 'Steady' override; NEVER a target. */
      workout_type?: string | null;
    };
    pacing?: { coefficient_of_variation?: number | null };
    display?: { show_adherence_chips?: boolean; has_measured_execution?: boolean };
    plan_context?: { planned_id?: string | null };
    session_interpretation?: SessionInterpretationV1;
    race?: {
      is_goal_race?: boolean;
      goal_avg_pace_s_per_mi?: number | null;
      fitness_projection_avg_pace_s_per_mi?: number | null;
    } | null;
  } | null;
  hasSessionDetail: boolean;
  useImperial: boolean;
  noPlannedCompare: boolean;
  /** Goal race: which benchmark targets and adherence use (client toggle). */
  goalRaceReferenceMode?: GoalRaceReferenceMode | null;
  /** D-166: swim extras from the completed workout row (pool/lengths/fins aren't in session_detail) —
   * folded into the unified swim card so they share the metrics grid with distance/duration/pace/HR. */
  swimExtras?: { poolLengthM?: number | null; lengths?: number | null; finsUsed?: boolean } | null;
};

export default function EnduranceIntervalTable({
  sessionDetail: sd,
  hasSessionDetail,
  useImperial,
  noPlannedCompare,
  goalRaceReferenceMode = null,
  swimExtras = null,
}: EnduranceIntervalTableProps) {
  const [showAllIntervals, setShowAllIntervals] = useState(false);

  const sportType = String(sd?.type || '').toLowerCase();
  const isRide = /ride|bike|cycling/.test(sportType);
  const isSwim = /swim/.test(sportType);
  const isPoolSwim = !!sd?.classification?.is_pool_swim;
  const isEasyLike = !!sd?.classification?.is_easy_like;
  const isGoalRace = !!sd?.race?.is_goal_race;
  const race = sd?.race;
  // D-040 Fix C + D-041 Fix C: detect single-segment steady-state sessions.
  // The label/subtitle override uses workout_type (label-only signal,
  // D-035 carryover: descriptive only, never a target) instead of
  // is_mixed_effort. The variance gate is for downstream effort interpretation;
  // the table-row label decision should key on whether this is a long_run /
  // easy_run with one segment — those genuinely render as 'Steady' regardless
  // of pace CV (which can be elevated on rolling terrain even on easy efforts).
  const workoutType = String(sd?.classification?.workout_type ?? '').toLowerCase();
  const singleSegmentSteady =
    Array.isArray(sd?.intervals) && sd.intervals.length === 1 &&
    (workoutType === 'long_run' || workoutType === 'easy_run');
  const displayMode = sd?.intervals_display?.mode ?? 'none';
  const displayReason = sd?.intervals_display?.reason ?? null;
  const allIntervals: IntervalRow[] = Array.isArray(sd?.intervals) ? sd!.intervals as IntervalRow[] : [];
  const hasPlanned = !!sd?.plan_context?.planned_id;
  const cv = sd?.pacing?.coefficient_of_variation ?? null;
  const leftColHeader = hasPlanned ? 'Planned' : 'Segments';

  // useMemo MUST be called before any early returns (React hooks rules)
  const visibleIntervals = useMemo(() => {
    if (showAllIntervals) return allIntervals;
    if (!isEasyLike || allIntervals.length <= 2) return allIntervals;

    const BIG_S = 900;
    const MICRO_S = 120;
    const big = allIntervals.filter((iv) => {
      const d = iv.executed.duration_s;
      return d != null && d >= BIG_S;
    });
    const nonBig = allIntervals.filter((iv) => {
      const d = iv.executed.duration_s;
      return d == null || d < BIG_S;
    });
    const allNonBigAreMicro = nonBig.length > 0 && nonBig.every((iv) => {
      const d = iv.executed.duration_s;
      return d != null && d < MICRO_S;
    });

    if (big.length >= 1 && allNonBigAreMicro) {
      return [big.sort((a, b) => (b.executed.duration_s ?? 0) - (a.executed.duration_s ?? 0))[0]];
    }
    return allIntervals;
  }, [allIntervals, isEasyLike, showAllIntervals]);

  const canToggleStrides = isEasyLike && allIntervals.length > 2 && visibleIntervals.length < allIntervals.length;

  if (!hasSessionDetail || !sd) return null;

  // ── Pool swim: overall comparison ────────────────────────────────────────
  // Layer 2: ALL swims (pool AND open-water) route through the swim block — never the land interval
  // table. Open-water uses its GPS distance directly; pool uses the resolved pool length. Neither
  // shows land splits.
  if (sd?.type === 'swim') {
    return <PoolSwimOverall sd={sd} useImperial={useImperial} swimExtras={swimExtras} />;
  }

  const ct = sd.completed_totals;
  const hasCompletedTotals =
    !!ct &&
    ((ct.duration_s ?? 0) > 0 || (ct.distance_m ?? 0) > 0 || (ct.avg_pace_s_per_mi ?? 0) > 0);

  // Stale session_detail from before unplanned interval fix — never show "planned workout" for unlinked sessions.
  if (displayMode === 'awaiting_recompute' && !hasPlanned) {
    if (hasCompletedTotals && ct) {
      return (
        <CompletedTotalsSegmentTable
          ct={ct}
          isRide={isRide}
          isSwim={isSwim}
          useImperial={useImperial}
        />
      );
    }
    return null;
  }

  // ── Awaiting recompute (linked plan / interval pipeline only) ─────────────
  if (displayMode === 'awaiting_recompute' && hasPlanned) {
    return (
      <div className="px-3 py-3 rounded-lg border border-red-400/30 bg-red-900/10 mb-3">
        <p className="text-sm text-red-200">Session interval contract missing for this planned workout.</p>
        <p className="text-xs text-red-300/90 mt-1">
          {displayReason === 'no_measured_execution_and_no_overall'
            ? 'Measured execution data is not ready yet. Recompute analysis to refresh.'
            : 'Recompute analysis to generate canonical interval rows.'}
        </p>
      </div>
    );
  }

  // ── No intervals ─────────────────────────────────────────────────────────
  if (allIntervals.length === 0 && displayMode === 'none') {
    return null;
  }

  // ── Single overall row when no interval breakdown ────────────────────────
  if (allIntervals.length === 0 && displayMode === 'overall_only') {
    if (!hasCompletedTotals || !ct) return null;
    return (
      <CompletedTotalsSegmentTable
        ct={ct}
        isRide={isRide}
        isSwim={isSwim}
        useImperial={useImperial}
      />
    );
  }

  // ── Interval table ───────────────────────────────────────────────────────
  return (
    <>
      <table className="w-full text-[13px] table-fixed">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[22%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span>{leftColHeader}</span>
                {canToggleStrides && (
                  <button
                    type="button"
                    onClick={() => setShowAllIntervals((v) => !v)}
                    className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15"
                  >
                    {showAllIntervals ? 'Hide strides' : 'Show strides'}
                  </button>
                )}
              </div>
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">
              {isRide ? 'Watts' : (isSwim ? '/100 (pref)' : 'Pace')}
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">Dist</th>
            <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">Time</th>
            <th className="px-1 py-2 pr-2 text-right font-medium text-gray-400 whitespace-nowrap">BPM</th>
          </tr>
        </thead>
        <tbody>
          {visibleIntervals.map((iv, idx) => {
            const execCell = isRide
              ? (iv.executed.power_watts != null ? `${Math.round(iv.executed.power_watts)} W` : '—')
              : fmtPaceSec(iv.executed.actual_pace_sec_per_mi);
            const distStr = fmtDist(iv.executed.distance_m, isSwim, useImperial);
            const durStr = iv.executed.duration_s != null && iv.executed.duration_s > 0
              ? fmtTime(iv.executed.duration_s) : '—';
            const hrVal = iv.executed.avg_hr != null && iv.executed.avg_hr > 0
              ? Math.round(iv.executed.avg_hr) : null;

            const refMode: GoalRaceReferenceMode = goalRaceReferenceMode ?? 'goal';
            const useProj =
              isGoalRace &&
              refMode === 'projection' &&
              race?.fitness_projection_avg_pace_s_per_mi != null &&
              !isRide;
            const useGoalTarget =
              isGoalRace &&
              refMode === 'goal' &&
              race?.goal_avg_pace_s_per_mi != null &&
              !isRide;
            const effPct = (() => {
              if (!isGoalRace || isRide) return iv.pace_adherence_pct;
              const a = iv.executed.actual_pace_sec_per_mi;
              if (a == null || !Number.isFinite(a) || a <= 0) return iv.pace_adherence_pct;
              if (useProj) {
                const t = race?.fitness_projection_avg_pace_s_per_mi;
                if (t == null) return null;
                return Math.min(100, Math.round((100 * t) / a));
              }
              if (useGoalTarget) {
                const t = race?.goal_avg_pace_s_per_mi;
                if (t == null) return iv.pace_adherence_pct;
                return Math.min(100, Math.round((100 * t) / a));
              }
              return iv.pace_adherence_pct;
            })();
            const pct = effPct;
            const subtitlePace = (() => {
              if (useProj) {
                return fmtPaceSec(race?.fitness_projection_avg_pace_s_per_mi ?? null);
              }
              if (useGoalTarget) {
                return iv.planned_pace_display || fmtPaceSec(race?.goal_avg_pace_s_per_mi ?? null);
              }
              return iv.planned_pace_display;
            })();
            const pctClass = (() => {
              if (pct == null) return 'text-white/50';
              if (isGoalRace) {
                if (useProj) {
                  const a = iv.executed.actual_pace_sec_per_mi;
                  const t = race?.fitness_projection_avg_pace_s_per_mi;
                  if (a != null && t != null) {
                    if (a < t - 0.5) return 'text-emerald-400';
                    if (a > t + 60) return 'text-amber-400/90';
                  }
                  return 'text-white/50';
                }
                if (useGoalTarget) {
                  if (pct >= 90 && pct <= 110) return 'text-emerald-400/80';
                  if (pct >= 80 && pct <= 120) return 'text-amber-400/80';
                  return 'text-amber-500/80';
                }
                return pctColor(pct);
              }
              return pctColor(pct);
            })();

            const showRangeSubtitle = (() => {
              // D-040 Fix C: single-segment steady → no subtitle (the pace
              // column already shows the actual pace; the planned range is
              // redundant on a session that wasn't prescribed a range).
              if (singleSegmentSteady) return false;
              if (useProj || useGoalTarget) return !!subtitlePace;
              if (idx === 0) return true;
              const prev = visibleIntervals[idx - 1];
              const curRange = iv.planned_pace_display || null;
              const prevRange = prev?.planned_pace_display || null;
              return curRange !== prevRange;
            })();

            const cvIndicator = pct != null && cv != null ? (
              cv > 10 ? <span className="text-[9px] text-red-500" title="High pacing variability">⚠️</span>
              : cv > 7 ? <span className="text-[9px] text-orange-500" title="Moderate pacing variability">⚠️</span>
              : cv > 3 ? <span className="text-[9px] text-yellow-500" title="Good pacing">✓</span>
              : <span className="text-[9px] text-green-500" title="Excellent pacing">✓</span>
            ) : null;

            return (
              <tr key={iv.id || idx} className="border-b border-white/10">
                <td className="px-2 py-1.5">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between w-full min-h-[2.1rem]">
                      <span className="text-[13px] font-medium truncate pr-2">{singleSegmentSteady ? 'Steady' : String(iv.planned_label ?? '')}</span>
                      {pct != null && !isGoalRace && hasPlanned && (
                        <div className="flex items-center gap-1">
                          <span className={`text-[11px] font-semibold whitespace-nowrap ${pctClass}`}>{pct}%</span>
                          {cvIndicator}
                        </div>
                      )}
                    </div>
                    {showRangeSubtitle && subtitlePace && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {String(subtitlePace)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-medium">{execCell}</td>
                <td className="px-2 py-1.5">{distStr}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{durStr}</div>
                </td>
                <td className="px-1 py-1.5 text-[13px]">
                  <div className="text-right">
                    {hrVal != null ? (
                      <>
                        <div className="font-medium">{hrVal}</div>
                        <div className="text-[10px] text-gray-400">bpm</div>
                      </>
                    ) : '—'}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

type CompletedTotals = NonNullable<
  NonNullable<EnduranceIntervalTableProps['sessionDetail']>['completed_totals']
>;

function CompletedTotalsSegmentTable({
  ct,
  isRide,
  isSwim,
  useImperial,
}: {
  ct: CompletedTotals;
  isRide: boolean;
  isSwim: boolean;
  useImperial: boolean;
}) {
  const paceStr = fmtPaceSec(ct.avg_pace_s_per_mi ?? null);
  const distStr = fmtDist(ct.distance_m ?? null, isSwim, useImperial);
  const durStr = ct.duration_s ? fmtTime(ct.duration_s) : '—';
  const hrStr = ct.avg_hr ? String(Math.round(ct.avg_hr)) : '—';
  return (
    <table className="w-full text-[13px] table-fixed">
      <colgroup>
        <col className="w-[36%]" />
        <col className="w-[22%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[12%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-white/10">
          <th className="px-2 py-2 text-left font-medium text-gray-400">Segment</th>
          <th className="px-2 py-2 text-left font-medium text-gray-400">{isRide ? 'Watts' : 'Pace'}</th>
          <th className="px-2 py-2 text-left font-medium text-gray-400">Dist</th>
          <th className="px-2 py-2 text-left font-medium text-gray-400">Time</th>
          <th className="px-1 py-2 pr-2 text-right font-medium text-gray-400">BPM</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-white/10">
          <td className="px-2 py-1.5 font-medium">Overall</td>
          <td className="px-2 py-1.5 font-medium">{isRide ? '—' : paceStr}</td>
          <td className="px-2 py-1.5">{distStr}</td>
          <td className="px-2 py-1.5 font-medium">{durStr}</td>
          <td className="px-1 py-1.5 text-right">{hrStr !== '—' ? <><div className="font-medium">{hrStr}</div><div className="text-[10px] text-gray-400">bpm</div></> : '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Pool swim overall comparison ───────────────────────────────────────────

// Minimal HR-over-time sparkline for the swim block (no axes — a glanceable shape). Used only when
// session_detail_v1 carries a populated HR series; avg-HR-only otherwise.
function SwimHrSparkline({ series }: { series: number[] }) {
  const pts = series.filter((n) => Number.isFinite(n) && n > 0);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const W = 240, H = 36;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / span) * H}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-9" preserveAspectRatio="none" aria-label="Heart rate over the swim">
      <polyline points={d} fill="none" stroke="#f87171" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PoolSwimOverall({ sd, useImperial, swimExtras }: { sd: NonNullable<EnduranceIntervalTableProps['sessionDetail']>; useImperial: boolean; swimExtras?: { poolLengthM?: number | null; lengths?: number | null; finsUsed?: boolean } | null }) {
  const ct = sd.completed_totals;
  const pt = sd.planned_totals;
  if (!ct) return null;

  const swimUnit = pt?.swim_unit || 'yd';
  const useYd = useImperial || swimUnit === 'yd';
  const executedDurS = ct.duration_s ?? 0;
  const executedDistM = ct.distance_m ?? 0;
  const plannedDurS = pt?.duration_s ?? 0;
  const plannedDistM = pt?.distance_m ?? 0;

  const distPct = plannedDistM > 0 && executedDistM > 0 ? Math.round((executedDistM / plannedDistM) * 100) : null;
  const timePct = plannedDurS > 0 && executedDurS > 0 ? Math.round((executedDurS / plannedDurS) * 100) : null;
  if (distPct == null && timePct == null && !(executedDistM > 0)) return null;

  const fmtDistLocal = (m: number) => useYd ? `${Math.round(m / 0.9144)} yd` : `${Math.round(m)} m`;
  const fmtTimeLocal = (s: number) => {
    const min = Math.floor(s / 60); const sec = Math.round(s % 60);
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const per100Unit = useYd ? 'yd' : 'm';
  const pace100 = (ct as any).swim_pace_per_100_s as number | null | undefined;
  const avgHr = (ct as any).avg_hr as number | null | undefined;
  const hrSeries = (sd as any)?.hr_series as number[] | null | undefined;

  const poolLm = Number(swimExtras?.poolLengthM) > 0 ? Number(swimExtras?.poolLengthM) : null;
  const lengths = Number(swimExtras?.lengths) > 0 ? Number(swimExtras?.lengths) : null;
  const finsUsed = !!swimExtras?.finsUsed;

  // Muted blue-tinted label — matches the Details READOUTS card so both tabs read as one design system.
  const labelStyle: React.CSSProperties = { color: 'rgba(120, 170, 255, 0.55)' };
  const tnum: React.CSSProperties = { fontFeatureSettings: '"tnum"' };

  // D-166: Pace/HR/Pool/Lengths share ONE metrics grid alongside the distance/duration headline —
  // same visual weight, not an afterthought row bolted below the card.
  const metrics: Array<[string, string]> = [];
  // D-166 refinement: keep "2:00 /100yd" on one value line with "Pace" as the muted label beneath
  // (the unit was wrapping awkwardly under "Pace").
  if (pace100 != null && pace100 > 0) metrics.push([`${formatSwimPace(pace100)} /100${per100Unit}`, 'Pace']);
  if (avgHr != null && avgHr > 0) metrics.push([`${Math.round(avgHr)}`, 'Avg HR']);
  if (poolLm != null) { const isYd = poolLm >= 20 && poolLm <= 26; metrics.push([isYd ? `${Math.round(poolLm / 0.9144)} yd` : `${Math.round(poolLm)} m`, 'Pool']); }
  if (lengths != null) metrics.push([String(lengths), 'Lengths']);

  // D-166 refinement: week/phase context ("Week 5 · Build") rides at the top of the card — it lived in
  // the top adherence header that swims now drop, and that context matters for every discipline.
  const weekLabel = (sd as any)?.plan_context?.week_label as string | null | undefined;

  // D-166 refinement: render the discipline trend INSIDE the card (was orphaned between header + card).
  const dt = (sd as any)?.discipline_trend;
  const trendNode = (() => {
    if (!dt?.verdict) return null;
    const VERD: Record<string, { w: string; c: string; a: string }> = {
      improving: { w: 'improving', c: 'text-emerald-400', a: '↑' },
      holding: { w: 'holding', c: 'text-amber-300', a: '→' },
      sliding: { w: 'sliding', c: 'text-red-400', a: '↓' },
      needs_data: { w: 'building — need more sessions', c: 'text-white/40', a: '' },
    };
    const v = VERD[dt.verdict] || VERD.needs_data;
    const pct = dt.pct_change;
    // Sign by verdict so the number agrees with the arrow (D-160 verdictSignedPct rule).
    const pctDisplay = pct == null ? null
      : dt.verdict === 'improving' ? `+${Math.abs(pct)}%`
      : dt.verdict === 'sliding' ? `−${Math.abs(pct)}%`
      : `${pct > 0 ? '+' : ''}${pct}%`;
    return (
      <div className="flex items-baseline justify-center gap-1.5 text-[12px] mb-3">
        <span style={labelStyle}>{dt.discipline} trend</span>
        <span className={`inline-flex items-baseline gap-0.5 ${v.c}`}>{v.a && <span>{v.a}</span>}<span>{v.w}</span></span>
        {dt.verdict !== 'needs_data' && pctDisplay && <span className="text-white/35">{pctDisplay}</span>}
      </div>
    );
  })();

  // Adherence as a pill+dot (matches STATE/home): green at/above plan, amber below.
  const pill = (label: string, pct: number | null) => {
    if (pct == null) return null;
    const dot = pct >= 100 ? 'bg-emerald-400' : 'bg-amber-300';
    return (
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[12px] text-gray-100" style={tnum}>{pct}%</span>
        <span className="text-[11px]" style={labelStyle}>{label}</span>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {weekLabel && (
        <div className="text-center text-[11px] uppercase tracking-wide mb-2" style={labelStyle}>{weekLabel}</div>
      )}
      {trendNode}
      {(executedDistM > 0 || executedDurS > 0) && (
        <div className="flex items-center justify-center gap-10 text-center mb-4">
          <div className="flex flex-col items-center">
            <div className="text-2xl font-light text-gray-100" style={tnum}>{executedDistM > 0 ? fmtDistLocal(executedDistM) : '—'}</div>
            <div className="text-[11px] mt-0.5" style={labelStyle}>Distance</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-2xl font-light text-gray-100" style={tnum}>{executedDurS > 0 ? fmtTimeLocal(executedDurS) : '—'}</div>
            <div className="text-[11px] mt-0.5" style={labelStyle}>Duration</div>
          </div>
        </div>
      )}

      {/* D-194: work:rest readout — "Work 24:00 · Rest 11:00", single-sourced from the server contract. */}
      {(ct as any).swim_work_rest && (
        <div className="text-center text-[12px] text-white/55 mb-4" style={tnum}>{(ct as any).swim_work_rest}</div>
      )}

      {metrics.length > 0 && (
        <div className={`grid gap-3 text-center ${metrics.length >= 4 ? 'grid-cols-4' : metrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {metrics.map(([v, l]) => (
            <div key={l} className="flex flex-col items-center">
              <div className="text-sm font-light text-gray-100 whitespace-nowrap" style={tnum}>{v}</div>
              <div className="text-[11px] mt-0.5" style={labelStyle}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {finsUsed && <div className="mt-2 text-center text-[11px] text-white/40">· some sets with fins</div>}

      {(distPct != null || timePct != null) && (
        <div className="mt-4 flex items-center justify-center gap-5">
          {pill('Distance', distPct)}
          {pill('Duration', timePct)}
        </div>
      )}

      {Array.isArray(hrSeries) && hrSeries.length > 1 && (
        <div className="mt-3"><SwimHrSparkline series={hrSeries} /></div>
      )}

      <div className="mt-4 pt-3 border-t border-white/[0.08]">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[11px] mb-1" style={labelStyle}>Planned</div>
            <div className="font-light text-gray-200" style={tnum}>{plannedDistM > 0 ? fmtDistLocal(plannedDistM) : '—'}</div>
            <div className="text-gray-400" style={tnum}>{plannedDurS > 0 ? fmtTimeLocal(plannedDurS) : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={labelStyle}>Executed</div>
            <div className="font-light text-gray-200" style={tnum}>{executedDistM > 0 ? fmtDistLocal(executedDistM) : '—'}</div>
            <div className="text-gray-400" style={tnum}>{executedDurS > 0 ? fmtTimeLocal(executedDurS) : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtPaceSec(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return '—';
  const sec = Math.round(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}/mi`;
}

function fmtDist(m: number | null | undefined, isSwim: boolean, useImperial: boolean): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  if (isSwim) return useImperial ? `${Math.round(m / 0.9144)} yd` : `${Math.round(m)} m`;
  const mi = m / 1609.34;
  return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
}

function pctColor(pct: number): string {
  if (pct >= 90 && pct <= 110) return 'text-green-600';
  if (pct >= 80 && pct <= 120) return 'text-yellow-600';
  return 'text-red-600';
}
