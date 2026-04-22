import React, { useMemo, useState } from 'react';
import {
  type SessionInterpretationV1,
  fmtTime,
} from '@/utils/performance-format';

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
};

export default function EnduranceIntervalTable({
  sessionDetail: sd,
  hasSessionDetail,
  useImperial,
  noPlannedCompare,
  goalRaceReferenceMode = null,
}: EnduranceIntervalTableProps) {
  const [showAllIntervals, setShowAllIntervals] = useState(false);

  const sportType = String(sd?.type || '').toLowerCase();
  const isRide = /ride|bike|cycling/.test(sportType);
  const isSwim = /swim/.test(sportType);
  const isPoolSwim = !!sd?.classification?.is_pool_swim;
  const isEasyLike = !!sd?.classification?.is_easy_like;
  const isGoalRace = !!sd?.race?.is_goal_race;
  const race = sd?.race;
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
  if (isPoolSwim) {
    return <PoolSwimOverall sd={sd} useImperial={useImperial} />;
  }

  // ── Awaiting recompute ───────────────────────────────────────────────────
  if (displayMode === 'awaiting_recompute') {
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
    const ct = sd.completed_totals;
    if (!ct) return null;
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
                      <span className="text-[13px] font-medium truncate pr-2">{String(iv.planned_label ?? '')}</span>
                      {pct != null && !isGoalRace && (
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

// ── Pool swim overall comparison ───────────────────────────────────────────

function PoolSwimOverall({ sd, useImperial }: { sd: NonNullable<EnduranceIntervalTableProps['sessionDetail']>; useImperial: boolean }) {
  const ct = sd.completed_totals;
  const pt = sd.planned_totals;
  if (!ct) return null;

  const swimUnit = pt?.swim_unit || 'yd';
  const executedDurS = ct.duration_s ?? 0;
  const executedDistM = ct.distance_m ?? 0;
  const plannedDurS = pt?.duration_s ?? 0;
  const plannedDistM = pt?.distance_m ?? 0;

  const distPct = plannedDistM > 0 && executedDistM > 0 ? Math.round((executedDistM / plannedDistM) * 100) : null;
  const timePct = plannedDurS > 0 && executedDurS > 0 ? Math.round((executedDurS / plannedDurS) * 100) : null;
  const distDelta = plannedDistM > 0 && executedDistM > 0 ? executedDistM - plannedDistM : null;
  const timeDelta = plannedDurS > 0 && executedDurS > 0 ? executedDurS - plannedDurS : null;

  const anyVal = distPct != null || timePct != null;
  if (!anyVal) return null;

  const fmtDistDelta = (m: number) => {
    const sign = m >= 0 ? '+' : '−';
    const abs = Math.abs(m);
    if (useImperial || swimUnit === 'yd') return `${sign}${Math.round(abs / 0.9144)} yd`;
    return `${sign}${Math.round(abs)} m`;
  };
  const fmtTimeDelta = (s: number) => {
    const sign = s >= 0 ? '+' : '−';
    const v = Math.abs(Math.round(s));
    const m = Math.floor(v / 60);
    const ss = v % 60;
    return `${sign}${m}:${String(ss).padStart(2, '0')}`;
  };
  const fmtDistLocal = (m: number) =>
    (useImperial || swimUnit === 'yd') ? `${Math.round(m / 0.9144)} yd` : `${Math.round(m)} m`;
  const fmtTimeLocal = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const chip = (label: string, pct: number | null, text: string) => {
    if (pct == null) return null;
    return (
      <div className="flex flex-col items-center px-2">
        <div className="text-sm font-semibold text-gray-100">{pct}%</div>
        <div className="text-[11px] text-gray-700">{label}</div>
        <div className="text-[11px] text-gray-600">{text}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-center gap-6 text-center">
        <div className="flex items-end gap-3">
          {chip('Distance', distPct, distDelta != null ? fmtDistDelta(distDelta) : '—')}
          {chip('Duration', timePct, timeDelta != null ? fmtTimeDelta(timeDelta) : '—')}
        </div>
      </div>
      <div className="mt-4 px-4 py-3 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-1">Planned</div>
            <div className="font-medium">{plannedDistM > 0 ? fmtDistLocal(plannedDistM) : '—'}</div>
            <div className="text-gray-600">{plannedDurS > 0 ? fmtTimeLocal(plannedDurS) : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Executed</div>
            <div className="font-medium">{executedDistM > 0 ? fmtDistLocal(executedDistM) : '—'}</div>
            <div className="text-gray-600">{executedDurS > 0 ? fmtTimeLocal(executedDurS) : '—'}</div>
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
