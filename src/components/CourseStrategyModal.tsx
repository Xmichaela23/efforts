import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { invokeFunction } from '@/lib/supabase';
import { EffortsWordmark } from '@/components/EffortsButton';

const ZONE_STROKE: Record<string, string> = {
  conservative: 'rgb(34, 197, 94)',
  cruise: 'rgb(59, 130, 246)',
  caution: 'rgb(234, 179, 8)',
  push: 'rgb(239, 68, 68)',
};

const ZONE_BG: Record<string, string> = {
  conservative: 'rgba(34, 197, 94, 0.09)',
  cruise: 'rgba(59, 130, 246, 0.09)',
  caution: 'rgba(234, 179, 8, 0.1)',
  push: 'rgba(239, 68, 68, 0.09)',
};

const ZONE_BORDER_SOFT: Record<string, string> = {
  conservative: 'rgba(34, 197, 94, 0.28)',
  cruise: 'rgba(59, 130, 246, 0.28)',
  caution: 'rgba(234, 179, 8, 0.32)',
  push: 'rgba(239, 68, 68, 0.28)',
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

function zoneBg(effortZone: string): string {
  const k = String(effortZone || '').toLowerCase();
  return ZONE_BG[k] ?? 'rgba(255,255,255,0.04)';
}

function zoneBorderSoft(effortZone: string): string {
  const k = String(effortZone || '').toLowerCase();
  return ZONE_BORDER_SOFT[k] ?? 'rgba(255,255,255,0.1)';
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
    /** Server copy when anchor finish time differs from stated plan goal. */
    goal_time_mismatch_blurb?: string | null;
    strategy_updated_at: string | null;
    strategy_stale: boolean;
    has_strategy: boolean;
    /** [mi, ft] pairs from API, or legacy `{ distance_m, elevation_m }` rows (client normalizes). */
    elevation_profile: unknown[];
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
}

const EMPTY_DISPLAY_GROUPS: CourseDetailPayload['display_groups'] = [];

const SVG_W = 800;
/** Plot area height (elevation curve only). */
const PLOT_IH = 182;
const MT = 10;
const MILE_STRIP = 36;
const SVG_H = MT + PLOT_IH + MILE_STRIP + 10;
const ML = 44;
const MR = 12;
const MI_M = 1609.344;
const FT_PER_M = 3.28084;

/**
 * Normalize API payload to chart series. Supports [mi, ft] from course-detail or legacy { distance_m, elevation_m } rows.
 */
function normalizeElevationChartSeries(raw: CourseDetailPayload['course']['elevation_profile'] | undefined): { mi: number; ft: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: { mi: number; ft: number }[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      const mi = Number(row[0]);
      const y = Number(row[1]);
      if (Number.isFinite(mi) && Number.isFinite(y)) out.push({ mi, ft: y });
      continue;
    }
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const o = row as Record<string, unknown>;
      const dm = Number(o.distance_m);
      const em = Number(o.elevation_m);
      if (Number.isFinite(dm) && Number.isFinite(em)) {
        out.push({ mi: dm / MI_M, ft: em * FT_PER_M });
      }
    }
  }
  out.sort((a, b) => a.mi - b.mi);
  return out;
}

/** SVG elevation (custom SVG; avoids Recharts dropping short segment series on device). */
function CourseElevationBySegments({
  fullSeries,
  maxMi,
  displayGroups,
  focusedGroupId,
  pixelWidth,
}: {
  fullSeries: { mi: number; ft: number }[];
  maxMi: number;
  displayGroups: CourseDetailPayload['display_groups'];
  /** When set, draws a band for this display group (tap-to-focus). */
  focusedGroupId: number | null;
  /** Fixed CSS width in px (expanded scroll mode); omit for fluid 100% width. */
  pixelWidth?: number;
}) {
  const iw = SVG_W - ML - MR;
  const ih = PLOT_IH;
  const mt = MT;
  const plotBottom = mt + ih;
  const mileLineY0 = plotBottom + 2;
  const mileLineY1 = plotBottom + 8;
  const mileTextY = plotBottom + 22;

  const fts = fullSeries.map((p) => p.ft).filter((v) => Number.isFinite(v));
  if (fts.length === 0) return null;
  let ftMin = Math.min(...fts);
  let ftMax = Math.max(...fts);
  if (!Number.isFinite(ftMin) || !Number.isFinite(ftMax)) return null;
  const rawSpan = ftMax - ftMin;
  const pad = Math.max(rawSpan * 0.04, rawSpan < 30 ? 15 : 5);
  ftMin -= pad;
  ftMax += pad;
  const ftSpan = Math.max(ftMax - ftMin, 1);
  const xOf = (mi: number) => ML + (mi / maxMi) * iw;
  const yOf = (ft: number) => mt + ih - ((ft - ftMin) / ftSpan) * ih;

  const baselinePts = fullSeries.map((p) => `${xOf(p.mi)},${yOf(p.ft)}`).join(' ');
  const yGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => ftMin + ftSpan * t);
  const yTickFts = [ftMin, ftMin + ftSpan / 2, ftMax];

  const intMiles = Math.min(200, Math.max(0, Math.floor(maxMi + 1e-6)));
  const mileMarks: { atMi: number; label: string }[] = [];
  for (let m = 0; m <= intMiles; m++) mileMarks.push({ atMi: m, label: String(m) });
  if (maxMi - intMiles > 0.08) {
    mileMarks.push({ atMi: maxMi, label: maxMi.toFixed(1) });
  }

  const focused = focusedGroupId != null ? displayGroups.find((g) => g.id === focusedGroupId) : null;
  const hx0 = focused ? xOf(focused.start_mi) : 0;
  const hx1 = focused ? xOf(focused.end_mi) : 0;

  /** Long segments drawn first (underneath); short caution/push on top so cruise does not cover them. */
  const paintOrder = [...displayGroups].sort((a, b) => {
    const da = a.end_mi - a.start_mi;
    const db = b.end_mi - b.start_mi;
    if (db !== da) return db - da;
    return a.start_mi - b.start_mi;
  });

  const strokeWidthForSpan = (spanMi: number) =>
    spanMi < 1.2 ? 5.5 : spanMi < 3 ? 4.5 : 3.5;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={pixelWidth ?? '100%'}
      height={pixelWidth != null ? Math.round((pixelWidth * SVG_H) / SVG_W) : undefined}
      preserveAspectRatio="xMidYMid meet"
      className={pixelWidth != null ? 'max-w-none shrink-0' : 'h-auto w-full max-h-[min(42vh,280px)]'}
      role="img"
      aria-label="Elevation by segment effort"
    >
      {yGrid.map((ft) => (
        <line
          key={`h-${ft}`}
          x1={ML}
          y1={yOf(ft)}
          x2={SVG_W - MR}
          y2={yOf(ft)}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 3"
        />
      ))}

      {focused && hx1 > hx0 && (
        <rect
          x={hx0}
          y={mt}
          width={hx1 - hx0}
          height={ih}
          fill={zoneStroke(focused.effort_zone)}
          opacity={0.14}
          pointerEvents="none"
        />
      )}

      <polyline fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} points={baselinePts} />

      {paintOrder.map((g) => {
        const pts = segmentChartPoints(fullSeries, g.start_mi, g.end_mi);
        if (pts.length < 2) return null;
        const points = pts.map((p) => `${xOf(p.mi)},${yOf(p.ft)}`).join(' ');
        const span = g.end_mi - g.start_mi;
        return (
          <polyline
            key={g.id}
            fill="none"
            stroke={zoneStroke(g.effort_zone)}
            strokeWidth={strokeWidthForSpan(span)}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        );
      })}

      {yTickFts.map((ft) => (
        <text
          key={`yl-${ft}`}
          x={ML - 6}
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

      <line
        x1={ML}
        y1={plotBottom}
        x2={SVG_W - MR}
        y2={plotBottom}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />

      {mileMarks.map((mk, i) => {
        const xm = xOf(Math.min(mk.atMi, maxMi));
        const mInt = Math.round(mk.atMi);
        const showLabel =
          maxMi <= 18 ? true : mk.atMi >= maxMi - 0.01 ? true : mInt % 2 === 0 || mk.atMi === 0;
        return (
          <g key={`mi-${mk.atMi}-${i}`}>
            <line x1={xm} y1={mileLineY0} x2={xm} y2={mileLineY1} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            {showLabel && (
              <text x={xm} y={mileTextY} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={9}>
                {mk.label}
              </text>
            )}
          </g>
        );
      })}

      <text
        x={SVG_W - MR - 2}
        y={mileTextY + 2}
        textAnchor="end"
        fill="rgba(255,255,255,0.32)"
        fontSize={9}
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
}: CourseStrategyModalProps) {
  const [payload, setPayload] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [focusedGroupId, setFocusedGroupId] = useState<number | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!courseId) return;
    if (opts?.silent) setRefetching(true);
    else setLoading(true);
    setErr(null);
    const { data, error } = await invokeFunction<CourseDetailPayload>('course-detail', { course_id: courseId });
    if (opts?.silent) setRefetching(false);
    else setLoading(false);
    if (error) {
      setErr(error.message);
      if (!opts?.silent) setPayload(null);
      return;
    }
    setPayload(data);
  }, [courseId]);

  useEffect(() => {
    if (open && courseId) void load();
    if (!open) {
      setPayload(null);
      setErr(null);
      setChartExpanded(false);
      setFocusedGroupId(null);
    }
  }, [open, courseId, load]);

  useEffect(() => {
    if (focusedGroupId == null) return;
    const t = window.setTimeout(() => setFocusedGroupId(null), 3200);
    return () => window.clearTimeout(t);
  }, [focusedGroupId]);

  const runStrategy = async () => {
    if (!courseId) return;
    setUpdating(true);
    setErr(null);
    const { error } = await invokeFunction('course-strategy', { course_id: courseId });
    setUpdating(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await load({ silent: true });
  };

  const busy = loading || refetching || updating;

  const fullSeries = normalizeElevationChartSeries(payload?.course?.elevation_profile);
  const maxMi = payload?.course?.distance_mi ?? Math.max(0.1, ...fullSeries.map((d) => d.mi));
  const displayGroups = payload?.display_groups ?? EMPTY_DISPLAY_GROUPS;
  const expandedChartPixelW = Math.round(Math.max(720, Math.min(2000, maxMi * 52)));

  const focusSegmentOnChart = useCallback(
    (g: CourseDetailPayload['display_groups'][0]) => {
      setFocusedGroupId(g.id);
      requestAnimationFrame(() => {
        const el = chartScrollRef.current;
        if (!el || !chartExpanded || maxMi <= 0) return;
        const centerFrac = (g.start_mi + g.end_mi) / 2 / maxMi;
        const target = centerFrac * el.scrollWidth - el.clientWidth / 2;
        el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      });
    },
    [chartExpanded, maxMi],
  );

  useEffect(() => {
    if (!chartExpanded || focusedGroupId == null || maxMi <= 0) return;
    const g = displayGroups.find((x) => x.id === focusedGroupId);
    if (!g) return;
    const id = requestAnimationFrame(() => {
      const el = chartScrollRef.current;
      if (!el) return;
      const centerFrac = (g.start_mi + g.end_mi) / 2 / maxMi;
      const target = centerFrac * el.scrollWidth - el.clientWidth / 2;
      el.scrollLeft = Math.max(0, target);
    });
    return () => cancelAnimationFrame(id);
  }, [chartExpanded, focusedGroupId, maxMi, displayGroups]);

  if (!open || !courseId) return null;

  const elevationChartSvg =
    fullSeries.length > 0 ? (
      <CourseElevationBySegments
        fullSeries={fullSeries}
        maxMi={maxMi}
        displayGroups={displayGroups}
        focusedGroupId={focusedGroupId}
      />
    ) : null;

  const elevationChartSvgExpanded =
    fullSeries.length > 0 ? (
      <CourseElevationBySegments
        fullSeries={fullSeries}
        maxMi={maxMi}
        displayGroups={displayGroups}
        focusedGroupId={focusedGroupId}
        pixelWidth={expandedChartPixelW}
      />
    ) : null;

  // Portal to document.body so stacking is above .mobile-header (z-50); fixed inside
  // .mobile-main-content would trap z-index below the global header wordmark.
  const modal = (
    <div
      className="fixed left-0 right-0 top-0 z-[10000] flex flex-col bg-[#0a0a0b] overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--tabbar-extra))',
      }}
    >
      <header
        className="shrink-0 border-b border-white/10 bg-[#0a0a0b]/95 backdrop-blur-md"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex justify-center pt-1 pb-0.5">
          <EffortsWordmark size={30} />
        </div>
        <div className="flex items-start justify-between gap-2 pb-3 pt-1">
          <div className="min-w-0 flex-1 pr-2">
            <p className="truncate text-sm font-medium text-white/90">{payload?.course.name ?? 'Course strategy'}</p>
            {payload?.course.goal_time && (
              <div className="space-y-0.5">
                <p
                  className="text-[11px] text-white/55 leading-snug"
                  title={`${payload.course.goal_time_source === 'predicted' ? 'Projected from your training' : 'Your goal'} ${payload.course.goal_time}`}
                >
                  {payload.course.goal_time_source === 'predicted' ? (
                    <>
                      Projected from your training{' '}
                      <span className="text-white/80">{payload.course.goal_time}</span>
                    </>
                  ) : (
                    <>
                      Your goal <span className="text-white/80">{payload.course.goal_time}</span>
                    </>
                  )}
                </p>
                {payload.course.plan_target_time && (
                  <p className="text-[10px] text-white/40">Plan {payload.course.plan_target_time}</p>
                )}
                {payload.course.goal_time_mismatch_blurb && (
                  <p className="text-[10px] text-white/45 leading-snug pt-0.5">{payload.course.goal_time_mismatch_blurb}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              disabled={busy || !courseId}
              className="rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white/85 disabled:opacity-35"
              aria-label="Reload chart and pacing from server"
            >
              <RefreshCw className={`h-5 w-5 ${refetching ? 'animate-spin' : ''}`} />
            </button>
            {payload?.course.has_strategy && (
              <button
                type="button"
                onClick={() => void runStrategy()}
                disabled={busy}
                className="rounded-full px-2.5 py-1.5 text-[11px] font-medium text-sky-400 hover:bg-white/10 hover:text-sky-300 disabled:opacity-35"
              >
                {updating ? 'Rebuilding…' : 'Rebuild'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white/85"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6 space-y-4 max-w-3xl mx-auto w-full"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <p className="text-[10px] text-white/40">Full course · tap a segment card to highlight</p>
              <button
                type="button"
                onClick={() => setChartExpanded(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-sky-400/90 hover:bg-white/10 hover:text-sky-300"
                aria-label="Expand elevation chart"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                Expand
              </button>
            </div>
            {elevationChartSvg ?? (
              <p className="px-2 py-6 text-center text-[12px] text-white/45">
                Elevation data missing or invalid for charting.
              </p>
            )}
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
        {!loading && payload && fullSeries.length === 0 && (
          <p className="text-[12px] text-white/45">No elevation profile loaded for this course.</p>
        )}

        {(payload?.display_groups ?? []).length > 0 && (
          <div className="space-y-3 pb-8">
            {payload!.display_groups.map((g) => {
              const z = zoneStroke(g.effort_zone);
              const focused = focusedGroupId === g.id;
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => focusSegmentOnChart(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      focusSegmentOnChart(g);
                    }
                  }}
                  className={`rounded-xl border pl-3 pr-3 py-2.5 shadow-sm cursor-pointer transition-[box-shadow,opacity] active:opacity-95 outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                    focused ? 'ring-2 ring-white/35' : ''
                  }`}
                  style={{
                    marginLeft: g.tier === 1 ? 12 : 0,
                    borderLeftWidth: 4,
                    borderLeftColor: z,
                    backgroundColor: zoneBg(g.effort_zone),
                    borderColor: zoneBorderSoft(g.effort_zone),
                    borderRightWidth: 1,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderStyle: 'solid',
                  }}
                >
                  <p className="text-[13px] font-medium text-white/90">{g.label}</p>
                  <p className="mt-1 font-mono text-[11px] font-medium" style={{ color: z }}>
                    {g.pace_range} · {g.hr_range}
                  </p>
                  {!!g.cue && <p className="mt-1 text-[12px] text-white/55 leading-snug">{g.cue}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // Expanded chart must be portaled to body (sibling to the modal), not nested under overflow-y-auto /
  // overflow-hidden — on iOS/Capacitor that clips or mispositions fixed UI and the dismiss control.
  const expandedChartOverlay =
    chartExpanded && elevationChartSvgExpanded ? (
      <div
        role="presentation"
        className="fixed inset-0 z-[10002] flex flex-col bg-black/92 backdrop-blur-sm"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={() => setChartExpanded(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded elevation chart"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 py-2.5"
            style={{
              paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
          >
            <span className="min-w-0 truncate text-[13px] font-medium text-white/85">Course elevation</span>
            <button
              type="button"
              onClick={() => setChartExpanded(false)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full py-2 pl-3 pr-3 text-white/80 hover:bg-white/10"
              aria-label="Done"
            >
              <Minimize2 className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-[13px] font-medium">Done</span>
            </button>
          </div>
          <p
            className="shrink-0 pt-2 text-[11px] text-white/45"
            style={{
              paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
          >
            Scroll horizontally · tap segment cards to jump
          </p>
          <div
            ref={chartScrollRef}
            className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-3 py-4 flex items-center"
            style={{
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
            }}
          >
            {elevationChartSvgExpanded}
          </div>
        </div>
      </div>
    ) : null;

  if (typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(modal, document.body)}
      {expandedChartOverlay ? createPortal(expandedChartOverlay, document.body) : null}
    </>
  );
}
