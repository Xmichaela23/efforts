import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { invokeFunction } from '@/lib/supabase';

const ZONE_STROKE: Record<string, string> = {
  conservative: 'rgb(34, 197, 94)',
  cruise: 'rgb(59, 130, 246)',
  caution: 'rgb(234, 179, 8)',
  push: 'rgb(239, 68, 68)',
};

/** Elevation at arbitrary mile (chart series is sorted by mi). */
function interpolateFtAtMi(series: { mi: number; ft: number }[], mi: number): number {
  if (series.length === 0) return 0;
  if (mi <= series[0].mi) return series[0].ft;
  const last = series[series.length - 1];
  if (mi >= last.mi) return last.ft;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].mi <= mi) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  const t = (mi - a.mi) / Math.max(1e-9, b.mi - a.mi);
  return a.ft + t * (b.ft - a.ft);
}

/**
 * Polyline for one display segment: always includes interpolated endpoints at start_mi / end_mi
 * so short segments (e.g. 1 mi caution) still draw even when the downsampled profile has no inner points.
 */
function segmentChartPoints(
  series: { mi: number; ft: number }[],
  startMi: number,
  endMi: number,
): { mi: number; ft: number }[] {
  if (!(endMi > startMi)) return [];
  const inner = series.filter((p) => p.mi > startMi && p.mi < endMi);
  const pts: { mi: number; ft: number }[] = [
    { mi: startMi, ft: interpolateFtAtMi(series, startMi) },
    ...inner,
    { mi: endMi, ft: interpolateFtAtMi(series, endMi) },
  ];
  const out: { mi: number; ft: number }[] = [];
  for (const p of pts) {
    if (out.length === 0 || Math.abs(out[out.length - 1].mi - p.mi) > 1e-6) out.push(p);
    else out[out.length - 1] = p;
  }
  return out;
}

function zoneStroke(effortZone: string): string {
  const k = String(effortZone || '').toLowerCase();
  return ZONE_STROKE[k] ?? 'rgba(255,255,255,0.35)';
}

export type CourseDetailPayload = {
  course: {
    id: string;
    name: string;
    distance_mi: number;
    elevation_gain_ft: number;
    elevation_loss_ft: number;
    goal_time: string | null;
    /** When set, header shows predicted vs plan-target copy from coach race_readiness. */
    goal_time_source?: 'predicted' | 'plan' | null;
    plan_target_time?: string | null;
    strategy_updated_at: string | null;
    strategy_stale: boolean;
    has_strategy: boolean;
    elevation_profile: [number, number][];
  };
  display_groups: Array<{
    id: number;
    start_mi: number;
    end_mi: number;
    label: string;
    terrain_type: string;
    effort_zone: string;
    pace_range: string;
    hr_range: string;
    cue: string;
    tier: number;
  }>;
};

interface CourseStrategyModalProps {
  open: boolean;
  courseId: string | null;
  onClose: () => void;
  /** Coach `race_readiness.predicted_finish_time_seconds` when this course is for that race goal. */
  predictedFinishTimeSeconds?: number | null;
}

const ELEV_CHART_W = 800;
const ELEV_CHART_H = 220;

/** SVG elevation (Recharts multi-Line + per-series data was dropping short segments on device). */
function CourseElevationBySegments({
  fullSeries,
  maxMi,
  displayGroups,
}: {
  fullSeries: { mi: number; ft: number }[];
  maxMi: number;
  displayGroups: CourseDetailPayload['display_groups'];
}) {
  const ml = 44;
  const mr = 12;
  const mt = 10;
  const mb = 26;
  const iw = ELEV_CHART_W - ml - mr;
  const ih = ELEV_CHART_H - mt - mb;
  const fts = fullSeries.map((p) => p.ft);
  const ftMin = Math.min(...fts);
  const ftMax = Math.max(...fts);
  const ftSpan = Math.max(ftMax - ftMin, 1);
  const xOf = (mi: number) => ml + (mi / maxMi) * iw;
  const yOf = (ft: number) => mt + ih - ((ft - ftMin) / ftSpan) * ih;

  const baselinePts = fullSeries.map((p) => `${xOf(p.mi)},${yOf(p.ft)}`).join(' ');
  const xGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => maxMi * t);
  const yGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => ftMin + ftSpan * t);

  const xTickMis = [0, maxMi / 2, maxMi];
  const yTickFts = [ftMin, ftMin + ftSpan / 2, ftMax];

  const sortedGroups = [...displayGroups].sort((a, b) => a.start_mi - b.start_mi);

  const fmtMi = (mi: number) => (Math.abs(mi - Math.round(mi)) < 0.05 ? String(Math.round(mi)) : mi.toFixed(1));

  return (
    <svg
      viewBox={`0 0 ${ELEV_CHART_W} ${ELEV_CHART_H}`}
      className="h-[220px] w-full min-w-[800px]"
      role="img"
      aria-label="Elevation by segment effort"
    >
      {yGrid.map((ft) => (
        <line
          key={`h-${ft}`}
          x1={ml}
          y1={yOf(ft)}
          x2={ELEV_CHART_W - mr}
          y2={yOf(ft)}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 3"
        />
      ))}
      {xGrid.map((mi) => (
        <line
          key={`v-${mi}`}
          x1={xOf(mi)}
          y1={mt}
          x2={xOf(mi)}
          y2={mt + ih}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 3"
        />
      ))}

      <polyline fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} points={baselinePts} />

      {sortedGroups.map((g) => {
        const pts = segmentChartPoints(fullSeries, g.start_mi, g.end_mi);
        if (pts.length < 2) return null;
        const points = pts.map((p) => `${xOf(p.mi)},${yOf(p.ft)}`).join(' ');
        return (
          <polyline
            key={g.id}
            fill="none"
            stroke={zoneStroke(g.effort_zone)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        );
      })}

      {yTickFts.map((ft) => (
        <text
          key={`yl-${ft}`}
          x={ml - 6}
          y={yOf(ft) + 3}
          textAnchor="end"
          fill="rgba(255,255,255,0.42)"
          fontSize={10}
        >
          {Math.round(ft)}
        </text>
      ))}
      <text
        x={12}
        y={mt + ih / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fill="rgba(255,255,255,0.32)"
        fontSize={10}
        transform={`rotate(-90 12 ${mt + ih / 2})`}
      >
        ft
      </text>

      {xTickMis.map((mi) => (
        <text key={`x-${mi}`} x={xOf(mi)} y={ELEV_CHART_H - 8} textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize={10}>
          {fmtMi(mi)}
        </text>
      ))}
      <text
        x={ELEV_CHART_W - mr - 2}
        y={ELEV_CHART_H - 8}
        textAnchor="end"
        fill="rgba(255,255,255,0.32)"
        fontSize={10}
      >
        mi
      </text>
    </svg>
  );
}

export default function CourseStrategyModal({
  open,
  courseId,
  onClose,
  predictedFinishTimeSeconds = null,
}: CourseStrategyModalProps) {
  const [payload, setPayload] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!courseId) return;
    if (opts?.silent) setRefetching(true);
    else setLoading(true);
    setErr(null);
    const body: Record<string, unknown> = { course_id: courseId };
    if (predictedFinishTimeSeconds != null && Number.isFinite(predictedFinishTimeSeconds)) {
      body.predicted_finish_time_seconds = predictedFinishTimeSeconds;
    }
    const { data, error } = await invokeFunction<CourseDetailPayload>('course-detail', body);
    if (opts?.silent) setRefetching(false);
    else setLoading(false);
    if (error) {
      setErr(error.message);
      if (!opts?.silent) setPayload(null);
      return;
    }
    setPayload(data);
  }, [courseId, predictedFinishTimeSeconds]);

  useEffect(() => {
    if (open && courseId) void load();
    if (!open) {
      setPayload(null);
      setErr(null);
    }
  }, [open, courseId, load]);

  const runStrategy = async () => {
    if (!courseId) return;
    setUpdating(true);
    setErr(null);
    const body: Record<string, unknown> = { course_id: courseId };
    if (predictedFinishTimeSeconds != null && Number.isFinite(predictedFinishTimeSeconds)) {
      body.predicted_finish_time_seconds = predictedFinishTimeSeconds;
    }
    const { error } = await invokeFunction('course-strategy', body);
    setUpdating(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await load({ silent: true });
  };

  const busy = loading || refetching || updating;

  if (!open || !courseId) return null;

  const profile = payload?.course.elevation_profile ?? [];
  const fullSeries = profile.map(([mi, ft]) => ({ mi, ft }));
  const maxMi = payload?.course.distance_mi ?? Math.max(0.1, ...fullSeries.map((d) => d.mi));

  // Portal to document.body so stacking is above .mobile-header (z-50); fixed inside
  // .mobile-main-content would trap z-index below the global header wordmark.
  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-[#0a0a0b] overflow-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-white/10 bg-[#0a0a0b]/95 px-4 py-3 backdrop-blur-md">
        <div className="min-w-0 flex-1 pr-1">
          <p className="truncate text-sm font-medium text-white/90">{payload?.course.name ?? 'Course strategy'}</p>
          {payload?.course.goal_time && (
            <div className="space-y-0.5">
              <p className="text-[11px] text-white/45 truncate" title={`${payload.course.goal_time_source === 'predicted' ? 'Predicted finish' : 'Race target'} ${payload.course.goal_time}`}>
                {payload.course.goal_time_source === 'predicted'
                  ? <>Predicted <span className="text-white/70">{payload.course.goal_time}</span> · current fitness</>
                  : <>Target <span className="text-white/70">{payload.course.goal_time}</span></>}
              </p>
              {payload.course.plan_target_time && (
                <p className="text-[10px] text-white/35 truncate">Plan {payload.course.plan_target_time}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={busy || !courseId}
            className="rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white/75 disabled:opacity-35"
            aria-label="Reload chart and pacing from server"
          >
            <RefreshCw className={`h-5 w-5 ${refetching ? 'animate-spin' : ''}`} />
          </button>
          {payload?.course.has_strategy && (
            <button
              type="button"
              onClick={() => void runStrategy()}
              disabled={busy}
              className="rounded-full px-2.5 py-1.5 text-[11px] font-medium text-sky-400/90 hover:bg-white/10 hover:text-sky-300/95 disabled:opacity-35"
            >
              {updating ? 'Rebuilding…' : 'Rebuild'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        {loading && <p className="text-sm text-white/50">Loading…</p>}
        {err && <p className="text-sm text-red-400/90">{err}</p>}

        {payload?.course.strategy_stale && payload.course.has_strategy && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
            <span>Strategy may be outdated vs your latest training data. Use </span>
            <span className="font-medium text-white/85">Rebuild</span>
            <span> above to regenerate pacing.</span>
          </div>
        )}

        {!payload?.course.has_strategy && !loading && courseId && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 space-y-2 text-[13px] text-white/60">
            <p>No strategy yet. Needs a race target from your goal or linked plan (same as plan build).</p>
            <button
              type="button"
              disabled={updating}
              onClick={() => void runStrategy()}
              className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
            >
              {updating ? 'Generating…' : 'Generate strategy'}
            </button>
          </div>
        )}

        {fullSeries.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 overflow-x-auto">
            <CourseElevationBySegments
              fullSeries={fullSeries}
              maxMi={maxMi}
              displayGroups={payload?.display_groups ?? []}
            />
            <div className="mt-2 flex flex-wrap gap-3 px-1 text-[10px] text-white/45">
              {(['conservative', 'cruise', 'caution', 'push'] as const).map((z) => (
                <span key={z} className="inline-flex items-center gap-1 capitalize">
                  <span className="h-2 w-2 rounded-sm" style={{ background: ZONE_STROKE[z] }} />
                  {z}
                </span>
              ))}
            </div>
          </div>
        )}

        {(payload?.display_groups ?? []).length > 0 && (
          <div className="space-y-3 pb-8">
            {payload!.display_groups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                style={{ marginLeft: g.tier === 1 ? 12 : 0 }}
              >
                <p className="text-[13px] font-medium text-white/88">{g.label}</p>
                <p
                  className="mt-1 font-mono text-[11px]"
                  style={{ color: zoneStroke(g.effort_zone) }}
                >
                  {g.pace_range} · {g.hr_range}
                </p>
                {!!g.cue && <p className="mt-1 text-[12px] text-white/50 leading-snug">{g.cue}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
