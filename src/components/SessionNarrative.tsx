import React from 'react';

type TrendPoint = {
  date: string;
  value: number;
  avg_hr: number | null;
  /**
   * D-050 / Q-025 — pace-at-HR (sec/mi per 100bpm). Server-emitted on each
   * point; null when avg_hr was missing. Drives the primary sparkline line
   * when `pace_at_hr_direction` is active (see TrendData below).
   */
  pace_at_hr?: number | null;
  is_current: boolean;
  label: string;
};

type TrendData = {
  metric_label: string;
  unit: string;
  points: TrendPoint[];
  direction: 'improving' | 'declining' | 'stable';
  summary: string;
  lower_is_better?: boolean;
  ride_type?: string | null; // cycling: classified-type word for the text-only TREND fallback
  /**
   * D-050 / Q-025 — per-athlete percentile-classifier output. PRIMARY
   * direction signal for the running TREND when non-null and not
   * 'insufficient_data'. Falls back to `direction` (raw-pace classifier)
   * otherwise. `pace_at_hr_basis` reports which pace basis the classifier
   * used ('gap' = grade-adjusted; 'raw' = device pace).
   */
  pace_at_hr_direction?: 'improving' | 'stable' | 'declining' | 'insufficient_data' | null;
  pace_at_hr_basis?: 'gap' | 'raw' | null;
};

export type NextSession = {
  name: string;
  date: string | null;
  type: string | null;
  prescription: string | null;
};

type RouteHistoryPoint = {
  date: string;
  pace_s_per_km: number | null;
  /** D-105: grade-adjusted pace from `route_progress_metrics.effort_adjusted_pace_sec_per_km`.
   *  Preferred when non-null; falls back to `pace_s_per_km` per-row. */
  gap_pace_s_per_km?: number | null;
  hr: number | null;
  is_current: boolean;
};

type RouteData = {
  name: string;
  times_run: number;
  history: RouteHistoryPoint[];
};

interface SessionNarrativeProps {
  sessionDetail: {
    workout_id?: string;
    execution?: {
      execution_score?: number | null;
      pace_adherence?: number | null;
      power_adherence?: number | null;
      duration_adherence?: number | null;
      performance_assessment?: string | null;
      assessed_against?: string | null;
      status_label?: string | null;
    };
    observations?: string[];
    narrative_text?: string | null;
    /** Goal-race LLM debrief (additive). */
    race_debrief_text?: string | null;
    /**
     * Server-authored "What this means for future races" block (goal-race only).
     * Built from ArcContext: next goal, phase, projection. Render verbatim.
     */
    forward_context?: {
      copy_version?: number;
      eyebrow: string;
      headline: string;
      body: string;
      projection_line: string | null;
      next_goal: {
        id: string;
        name: string;
        target_date: string;
        sport: string | null;
        distance: string | null;
        days_until: number;
        weeks_until: number;
        is_multisport: boolean;
      } | null;
      current_phase: string | null;
    } | null;
    summary?: { title?: string; bullets?: string[] };
    completed_totals?: { duration_s?: number | null; distance_m?: number | null };
    weather?: { temperature_f?: number | null } | null;
    analysis_details?: { rows?: Array<{ label: string; value: string }> };
    adherence?: {
      technical_insights?: Array<{ label: string; value: string }>;
      plan_impact_label?: string | null;
      plan_impact_text?: string | null;
    };
    intervals?: Array<any>;
    display?: {
      show_adherence_chips?: boolean;
      interval_display_reason?: string | null;
      has_measured_execution?: boolean;
    };
    plan_context?: {
      planned_id?: string | null;
      planned?: unknown | null;
      match?: { summary?: string } | null;
    };
    trend?: TrendData | null;
    next_session?: NextSession | null;
    terrain?: {
      route?: RouteData | null;
    } | null;
    race_readiness?: {
      headline: string;
      verdict: string;
      tactical_instruction: string;
      flag: string | null;
      projection: string;
      /** Present on newer server payloads; omit on older cached session_detail_v1. */
      taper_guidance?: string;
    } | null;
  } | null;
  hasSessionDetail: boolean;
  noPlannedCompare: boolean;
  planLinkNote: string | null;
  recomputing: boolean;
  recomputeError: string | null;
  onRecompute: () => void;
  recomputeDisabled?: boolean;
  /** When true, the NEXT/up-next block is NOT rendered inline — the caller renders <NextUp> elsewhere
   *  (strength Performance tab moves it to the bottom, below the compare table). */
  hideNextUp?: boolean;
}

function TrendSparkline({ trend }: { trend: TrendData }) {
  const pts = trend.points;
  if (pts.length < 3) return null;

  // Cycling TREND: require ≥5 same-type rides for the sparkline. With 3–4
  // points the data is too thin for a chart, so show a one-line text summary
  // instead — this gate covers BOTH the power and HR lines (no chart at all
  // under 5). Running (unit '/mi') keeps its existing ≥3 chart behavior.
  const isCyclingTrend = trend.unit === 'W';
  if (isCyclingTrend && pts.length < 5) {
    const typeWord = trend.ride_type ? `${trend.ride_type} ` : '';
    const firstV = Math.round(pts[0].value);
    const lastV = Math.round(pts[pts.length - 1].value);
    const hrVals = pts
      .map((p) => (p as any).avg_hr)
      .filter((v: any): v is number => typeof v === 'number' && Number.isFinite(v));
    let hrClause = '';
    if (hrVals.length >= 2) {
      const mid = Math.ceil(hrVals.length / 2);
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      // Lower HR later = improving (same direction as the chart's HR scaling).
      const d = avg(hrVals.slice(mid)) - avg(hrVals.slice(0, mid));
      const dir = d <= -2 ? 'improving' : d >= 2 ? 'declining' : 'consistent';
      hrClause = ` · HR ${dir}`;
    }
    const line = `${pts.length} ${typeWord}rides · ${firstV}W → ${lastV}W${hrClause}`;
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Trend</span>
        </div>
        <div className="mt-1 text-xs text-gray-400">{line}</div>
      </div>
    );
  }

  // D-050 / Q-025 — pace-at-HR mode. When the server's percentile classifier
  // returned a usable direction (not null / insufficient_data) AND ≥6 points
  // carry pace_at_hr values, plot pace_at_hr as the primary line and label
  // direction via pace_at_hr_direction. Otherwise fall back to raw-pace
  // values + direction (current behavior). Athlete-facing labels: "getting
  // more efficient" / "holding steady" / "worth watching". Never red on
  // stable / improving — only `declining` produces the red color.
  const paceAtHrCount = pts.filter((p) => p.pace_at_hr != null && Number.isFinite(p.pace_at_hr)).length;
  const usePaceAtHr =
    trend.pace_at_hr_direction != null &&
    trend.pace_at_hr_direction !== 'insufficient_data' &&
    paceAtHrCount >= 6 &&
    trend.unit === '/mi'; // running-only — cycling TREND already exits above

  const plotValueOf = (p: TrendPoint): number => (usePaceAtHr && p.pace_at_hr != null ? p.pace_at_hr : p.value);
  const values = pts.map(plotValueOf);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const range = maxV - minV || 1;

  const W = 200;
  const H = 48;
  const PAD = 4;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const coords = pts.map((p, i) => ({
    x: PAD + (i / (pts.length - 1)) * plotW,
    y: PAD + ((plotValueOf(p) - minV) / range) * plotH,
    ...p,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  // D-050 / Q-025 — direction + color override when pace-at-HR mode active.
  const effectiveDirection: 'improving' | 'declining' | 'stable' =
    usePaceAtHr && trend.pace_at_hr_direction != null && trend.pace_at_hr_direction !== 'insufficient_data'
      ? trend.pace_at_hr_direction
      : trend.direction;
  const arrow = effectiveDirection === 'improving' ? '↗' : effectiveDirection === 'declining' ? '↘' : '→';
  const color = effectiveDirection === 'improving' ? '#34d399' : effectiveDirection === 'declining' ? '#f87171' : '#9ca3af';

  // HR line — normalize independently, lower HR = higher on chart (same direction as pace improvement)
  // D-107: threshold lowered from >=3 to >=2. D-106's strict-intent TREND
  // pool narrows the data; on thin pools (e.g. an athlete's first few easy
  // runs after a build block) only 2 of 3 trend points carry HR. >=3 hid
  // the HR dashed line entirely in that case. >=2 renders a single segment
  // — sparse but honest. Backfills naturally as more same-intent runs land.
  const hrPts = pts.filter((p) => (p as any).avg_hr != null);
  const hasHr = hrPts.length >= 2;
  const hrCoords = hasHr ? (() => {
    const hrVals = pts.map((p) => (p as any).avg_hr as number | null);
    const validHr = hrVals.filter((v): v is number => v != null);
    const maxHr = Math.max(...validHr);
    const minHr = Math.min(...validHr);
    const hrRange = maxHr - minHr || 1;
    return pts.map((p, i) => {
      const hr = (p as any).avg_hr as number | null;
      return {
        x: PAD + (i / (pts.length - 1)) * plotW,
        y: hr != null ? PAD + ((hr - minHr) / hrRange) * plotH : null,
        hr,
        is_current: (p as any).is_current,
      };
    });
  })() : [];
  const hrPathSegments: string[] = [];
  if (hasHr) {
    let seg = '';
    for (const c of hrCoords) {
      if (c.y == null) { seg = ''; continue; }
      seg += seg === '' ? `M${c.x},${c.y}` : `L${c.x},${c.y}`;
    }
    if (seg) hrPathSegments.push(seg);
  }

  // HR label for today
  const todayHr = (pts[pts.length - 1] as any).avg_hr as number | null;

  // Sport-aware legend: the cycling TREND plots power (trend.unit === 'W',
  // built in _shared/session-detail/build.ts:635); running plots pace
  // (unit '/mi', build.ts:669). "pace" was hardcoded — wrong for rides.
  const seriesLabel = trend.unit === 'W' ? 'power' : 'pace';

  // D-050 / Q-025 — athlete-facing label when pace-at-HR mode active.
  // "getting more efficient" / "holding steady" / "worth watching" map from
  // pace_at_hr_direction; otherwise keep server-built `summary` (raw-pace).
  const effectiveSummary = usePaceAtHr
    ? (effectiveDirection === 'improving'
        ? `getting more efficient (${pts.length} workouts)`
        : effectiveDirection === 'declining'
          ? `worth watching (${pts.length} workouts)`
          : `holding steady (${pts.length} workouts)`)
    : trend.summary;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Trend</span>
        {effectiveSummary && <span className="text-xs" style={{ color }}>{arrow} {effectiveSummary}</span>}
      </div>
      <div className="mt-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, height: 52 }}>
          {/* Pace line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={c.is_current ? 3.5 : 2}
              fill={c.is_current ? color : 'rgba(156,163,175,0.5)'}
              stroke={c.is_current ? color : 'none'} strokeWidth={c.is_current ? 1 : 0} />
          ))}
          {/* HR line — dashed, muted red, independently scaled */}
          {hrPathSegments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#fb923c" strokeWidth="1" strokeDasharray="3 2"
              strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />
          ))}
          {hasHr && hrCoords.filter((c) => c.y != null && c.is_current).map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y!} r={2.5} fill="#fb923c" opacity={0.6} />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5" style={{ maxWidth: 280 }}>
          <span>{pts[0].label}</span>
          <span className="font-medium" style={{ color }}>
            {pts[pts.length - 1].label}
            {todayHr != null && <span className="text-orange-400/60 ml-1">· {todayHr} bpm</span>}
            {' '}← today
          </span>
        </div>
        {hasHr && (
          <div className="flex items-center gap-3 mt-1" style={{ maxWidth: 280 }}>
            <span className="flex items-center gap-1 text-[10px]" style={{ color }}>
              <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="1.5" opacity="0.8" /></svg>
              {seriesLabel}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-orange-400">
              <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#fb923c" strokeWidth="1" strokeDasharray="3 2" opacity="0.8" /></svg>
              hr
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteSparkline({ route }: { route: RouteData }) {
  // D-105: prefer grade-adjusted pace per point; fall back to raw when GAP
  // isn't available (flat-route rows, pre-D-105 backfill rows, or any row
  // where the GAP computation didn't land). The per-row gate keeps the chart
  // honest — a mixed series shows GAP where computed, raw where not, and
  // the "GAP" label below tells the athlete the chart is grade-calibrated.
  const ptsWithEffective = route.history
    .map((p) => ({ ...p, effective_pace: p.gap_pace_s_per_km ?? p.pace_s_per_km }))
    .filter((p) => p.effective_pace != null);
  if (ptsWithEffective.length < 2) return null;
  const pts = ptsWithEffective;
  const usingGap = pts.some((p) => p.gap_pace_s_per_km != null);

  const paceValues = pts.map((p) => p.effective_pace as number);
  const maxV = Math.max(...paceValues);
  const minV = Math.min(...paceValues);
  const range = maxV - minV || 1;

  const W = 200;
  const H = 48;
  const PAD = 4;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const coords = pts.map((p, i) => ({
    x: PAD + (i / (pts.length - 1)) * plotW,
    // lower pace = faster = better = higher on chart (invert)
    y: PAD + ((maxV - (p.effective_pace as number)) / range) * plotH,
    ...p,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');

  const hrPts = pts.filter((p) => p.hr != null);
  const hasHr = hrPts.length >= 2;
  const hrPathD = hasHr ? (() => {
    const hrVals = pts.map((p) => p.hr as number | null);
    const validHr = hrVals.filter((v): v is number => v != null);
    const maxHr = Math.max(...validHr);
    const minHr = Math.min(...validHr);
    const hrRange = maxHr - minHr || 1;
    return pts.map((p, i) => {
      if (p.hr == null) return null;
      const x = PAD + (i / (pts.length - 1)) * plotW;
      const y = PAD + ((p.hr - minHr) / hrRange) * plotH;
      return { x, y, is_current: p.is_current };
    });
  })() : [];

  const hrLineParts: string[] = [];
  if (hasHr) {
    let seg = '';
    for (const c of hrPathD) {
      if (!c) { seg = ''; continue; }
      seg += seg === '' ? `M${c.x},${c.y}` : `L${c.x},${c.y}`;
    }
    if (seg) hrLineParts.push(seg);
  }

  const formatPace = (s: number) => {
    const perMi = Math.round(s * 1.60934);
    return `${Math.floor(perMi / 60)}:${String(perMi % 60).padStart(2, '0')}/mi`;
  };

  const currentPt = pts[pts.length - 1];
  const color = '#9ca3af';

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Route</span>
        {/* D-107: display cluster total (times_run) in the chart-header label
            instead of comparable_runs. Post-D-107 the ROUTE intent filter is
            removed and comparable_runs is just history.length (≤10 due to the
            route_progress_metrics SELECT cap), so a label saying "8×" reads
            as the chart's data-point count rather than the athlete's actual
            cumulative experience with the route. times_run is the cluster
            sample_count — the honest "how many times have I run this route"
            answer (43 for today's test-user easy run). iOS has been using
            times_run all along; this restores parity. */}
        <span className="text-xs text-gray-500">Same route · {route.times_run ?? (route as any).comparable_runs}×</span>
        {/* D-105: tell the athlete the chart is grade-adjusted when any
            plotted point uses GAP. Otherwise the chart is raw pace and the
            label is silent (no badge = the default, no surprise). */}
        {usingGap && (
          <span
            className="text-[10px] uppercase tracking-wider text-gray-500/80 border border-gray-600/40 rounded px-1.5 py-0.5"
            title="Pace adjusted for elevation grade where available"
          >
            GAP
          </span>
        )}
      </div>
      <div className="mt-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, height: 52 }}>
          <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={c.is_current ? 3.5 : 2}
              fill={c.is_current ? '#FFD700' : 'rgba(156,163,175,0.5)'}
              stroke={c.is_current ? '#FFD700' : 'none'} strokeWidth={c.is_current ? 1 : 0} />
          ))}
          {hrLineParts.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#fb923c" strokeWidth="1" strokeDasharray="3 2"
              strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />
          ))}
          {hasHr && hrPathD.filter((c): c is NonNullable<typeof c> => !!c && c.is_current).map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={2.5} fill="#fb923c" opacity={0.6} />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5" style={{ maxWidth: 280 }}>
          <span>{pts[0].date.slice(5)}</span>
          <span className="font-medium text-yellow-400/80">
            {/* D-105: show GAP value when present for today's run; otherwise raw. */}
            {currentPt.effective_pace != null ? formatPace(currentPt.effective_pace) : ''}
            {currentPt.hr != null && <span className="text-orange-400/60 ml-1">· {currentPt.hr} bpm</span>}
            {' '}← today
          </span>
        </div>
        {hasHr && (
          <div className="flex items-center gap-3 mt-1" style={{ maxWidth: 280 }}>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="1.5" opacity="0.8" /></svg>
              pace
            </span>
            <span className="flex items-center gap-1 text-[10px] text-orange-400">
              <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#fb923c" strokeWidth="1" strokeDasharray="3 2" opacity="0.8" /></svg>
              hr
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function NextUp({ session }: { session: NextSession }) {
  const dayName = session.date ? (() => {
    try {
      const [y, m, d] = session.date.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
    } catch { return null; }
  })() : null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide shrink-0">Next</span>
      <p className="text-sm text-gray-300">
        {dayName && <span className="text-gray-400">{dayName} </span>}
        {session.name}
        {session.prescription && (
          <span className="text-gray-500"> — {session.prescription}</span>
        )}
      </p>
    </div>
  );
}

function isLlmRaceReadinessShape(
  rr: NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'],
): rr is NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'] {
  return !!rr && typeof (rr as { verdict?: string }).verdict === 'string';
}

function RaceReadinessBlock({ rr }: { rr: NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'] }) {
  if (!isLlmRaceReadinessShape(rr) || !String(rr.headline || '').trim()) return null;
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3 space-y-3">
      <div>
        <span className="text-[10px] font-semibold text-amber-200/90 uppercase tracking-wide">Race readiness</span>
        <p className="text-sm font-semibold text-gray-100 mt-1 leading-snug">{rr.headline}</p>
      </div>
      {!!String(rr.verdict || '').trim() && (
        <p className="text-sm text-gray-300 leading-relaxed">{rr.verdict}</p>
      )}
      {!!String(rr.tactical_instruction || '').trim() && (
        <div className="rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-2">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Race day</span>
          <p className="text-sm text-gray-100 mt-0.5 leading-snug">{rr.tactical_instruction}</p>
        </div>
      )}
      {rr.flag != null && String(rr.flag).trim() !== '' && (
        <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-2">
          <span className="text-[10px] font-medium text-amber-200/90 uppercase tracking-wide">Flag</span>
          <p className="text-sm text-amber-100/95 mt-0.5 leading-snug">{rr.flag}</p>
        </div>
      )}
      {!!String(rr.projection || '').trim() && (
        <p className="text-xs text-gray-400 leading-relaxed border-t border-white/10 pt-2">{rr.projection}</p>
      )}
      {!!String(rr.taper_guidance || '').trim() && (
        <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.07] px-2.5 py-2">
          <span className="text-[10px] font-medium text-sky-200/90 uppercase tracking-wide">Taper</span>
          <p className="text-sm text-gray-200 mt-0.5 leading-relaxed">{String(rr.taper_guidance).trim()}</p>
        </div>
      )}
    </div>
  );
}

export default function SessionNarrative({
  sessionDetail: sd,
  hasSessionDetail,
  noPlannedCompare,
  planLinkNote,
  recomputing,
  recomputeError,
  onRecompute,
  recomputeDisabled,
  hideNextUp,
}: SessionNarrativeProps) {
  const summaryTitle = sd?.summary?.title || 'Insights';
  const summaryBullets = Array.isArray(sd?.summary?.bullets) ? sd!.summary!.bullets! : [];
  const narrativeText = (typeof sd?.narrative_text === 'string' && sd.narrative_text.trim()) || '';
  const raceDebriefText = (typeof sd?.race_debrief_text === 'string' && sd.race_debrief_text.trim()) || '';
  const hasNarrative = narrativeText.length > 0;
  const hasRaceDebrief = raceDebriefText.length > 0;

  // Parse labeled sections: [LABEL]\ntext\n\n[LABEL]\ntext...
  const raceDebriefSections = (() => {
    if (!raceDebriefText) return null;
    const parts = raceDebriefText.split(/\[([A-Z]+)\]\s*/);
    // parts: ['', 'EXECUTION', 'text...', 'CONDITIONS', 'text...', ...]
    if (parts.length < 3) return null;
    const sections: { label: string; text: string }[] = [];
    for (let i = 1; i < parts.length - 1; i += 2) {
      const label = parts[i].trim();
      const text = parts[i + 1].trim();
      if (label && text) sections.push({ label, text });
    }
    return sections.length >= 2 ? sections : null;
  })();
  const hasSummaryBullets = summaryBullets.length > 0;

  const trend = sd?.trend ?? null;
  const nextSession = sd?.next_session ?? null;

  const analysisRows = sd?.analysis_details?.rows ?? [];
  const hasAnalysisDetails = analysisRows.length > 0;

  const techInsights = sd?.adherence?.technical_insights ?? [];
  const planImpactText = sd?.adherence?.plan_impact_text ?? '';
  const planImpactLabel = sd?.adherence?.plan_impact_label ?? 'Plan context';

  const SUMMARY_LABELS = new Set([
    'Summary', 'Cardiac Drift', 'Aerobic Efficiency', 'Aerobic Stress',
    'Aerobic Response', 'Elevated Drift', 'High Cardiac Stress',
    'Interval Summary', 'Zone Summary',
  ]);
  const technicalInsightsForRender = hasSummaryBullets
    ? techInsights.filter((t) => !SUMMARY_LABELS.has(String(t?.label || '').trim()))
    : techInsights;

  const hasPlanImpactForRender = planImpactText.length > 0;
  const hasTechnicalForRender = technicalInsightsForRender.length > 0;
  const hasStructuredForRender = hasTechnicalForRender || hasPlanImpactForRender;
  const hasNothing =
    !hasNarrative &&
    !hasRaceDebrief &&
    !hasSummaryBullets &&
    !hasStructuredForRender &&
    !hasAnalysisDetails;

  if (!hasSessionDetail || hasNothing) {
    return (
      <div className="mt-4 px-3 pb-4">
        {noPlannedCompare && (
          <div className="text-xs text-gray-500 italic mb-2">
            {planLinkNote ?? 'No planned session to compare.'}
          </div>
        )}
        <div className="flex items-center justify-end">
          <button
            onClick={onRecompute}
            disabled={recomputing || recomputeDisabled}
            className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15 disabled:opacity-50"
            title="Generate analysis for this workout"
          >
            {recomputing ? 'Recomputing…' : 'Recompute analysis'}
          </button>
        </div>
        {recomputeError && (
          <p className="text-sm text-red-400 mb-1">{recomputeError}</p>
        )}
        <p className="text-sm text-gray-500 italic">
          {hasSessionDetail
            ? 'No insights available for this workout yet. Recompute analysis to refresh.'
            : 'No session insight contract found for this workout yet. Click "Recompute analysis" to generate it.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 px-3 pb-4 space-y-3">
      {noPlannedCompare && (
        <div className="text-xs text-gray-500 italic">
          {planLinkNote ?? 'No planned session to compare.'}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          {recomputeError ? (
            <span className="text-red-300">{recomputeError}</span>
          ) : null}
        </div>
        <button
          onClick={onRecompute}
          disabled={recomputing || recomputeDisabled}
          className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15 disabled:opacity-50"
          title="Re-run analysis for this workout"
        >
          {recomputing ? 'Recomputing…' : 'Recompute analysis'}
        </button>
      </div>
      {(() => {
        // Stat line above INSIGHTS: distance · duration · temperature.
        // distance/duration from session_detail_v1.completed_totals; temperature
        // from session_detail_v1.weather (workouts.weather_data, same source as
        // the Details tab).
        const distM = sd?.completed_totals?.distance_m;
        const durS = sd?.completed_totals?.duration_s;
        const tF = sd?.weather?.temperature_f;
        const parts: string[] = [];
        if (typeof distM === 'number' && distM > 0) parts.push(`${(distM / 1609.34).toFixed(1)} mi`);
        if (typeof durS === 'number' && durS > 0) {
          const h = Math.floor(durS / 3600);
          const m = Math.floor((durS % 3600) / 60);
          const s = Math.round(durS % 60);
          parts.push(h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`);
        }
        if (typeof tF === 'number' && Number.isFinite(tF)) parts.push(`${Math.round(tF)}°F`);
        return parts.length > 0
          ? <div className="text-sm font-medium text-gray-300">{parts.join(' · ')}</div>
          : null;
      })()}
      {hasRaceDebrief && (
        <div className="space-y-4">
          {raceDebriefSections ? (
            raceDebriefSections.map(({ label, text }) => (
              <div key={label}>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {label}
                </span>
                <p className="text-sm text-gray-300 leading-relaxed mt-1">{text}</p>
              </div>
            ))
          ) : (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Race debrief
              </span>
              <p className="text-sm text-gray-300 leading-relaxed mt-1">{raceDebriefText}</p>
            </div>
          )}
        </div>
      )}
      {sd?.forward_context && (sd.forward_context.headline || sd.forward_context.body) && (
        <div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {sd.forward_context.eyebrow || 'What this means for future races'}
          </span>
          <p className="text-sm font-semibold text-gray-100 leading-snug mt-1">
            {sd.forward_context.headline}
          </p>
          {sd.forward_context.body && (
            <p className="text-sm text-gray-300 leading-relaxed mt-1">
              {sd.forward_context.body}
            </p>
          )}
          {sd.forward_context.projection_line && (
            <p className="text-sm text-teal-300/90 leading-relaxed mt-2">
              {sd.forward_context.projection_line}
            </p>
          )}
        </div>
      )}
      {hasNarrative && (
        <div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Insights
          </span>
          <p className="text-sm text-gray-300 leading-relaxed mt-1">{narrativeText}</p>
        </div>
      )}
      {!hasNarrative && hasSummaryBullets && (
        <div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {summaryTitle}
          </span>
          <div className="mt-1 space-y-1.5">
            {(() => {
              const seen = new Set<string>();
              const out = summaryBullets.filter((b) => {
                const k = b.trim();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
              return out.slice(0, 4).map((b: string, i: number) => (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">{String(b)}</p>
              ));
            })()}
          </div>
        </div>
      )}
      {/* Macro trends live on the State screen now (single source of truth). The per-session route
          context is a same-route EFFICIENCY read (State's pace-per-HR metric, this route only) — one
          clean line, no raw-pace chart, no dashed HR overlay. TrendSparkline/RouteSparkline are no
          longer rendered here. */}
      {sd?.terrain?.route && sd.terrain.route.history.length >= 2 && (() => {
        const route = sd.terrain!.route as any;
        const eff = route.efficiency as { direction: 'improving' | 'holding' | 'declining'; points: number } | null | undefined;
        // "You've run this a lot" = times_run (total cluster count), NOT the ≤10 metrics pool. Anchor a
        // time window from first_seen so 3-runs-of-metrics never reads as "you've only run this 3 times".
        const times = Math.max(Number(route.times_run) || 0, route.history?.length ?? 0);
        const yr = typeof route.first_seen === 'string' && route.first_seen.length >= 4 ? route.first_seen.slice(0, 4) : null;
        const familiarity = `${times}×${yr ? ` since ${yr}` : ''}`;
        if (eff) {
          const color = eff.direction === 'improving' ? '#34d399' : eff.direction === 'declining' ? '#f87171' : '#9ca3af';
          return (
            <div className="text-xs text-gray-500">
              Same route · run {familiarity} — <span style={{ color }}>efficiency {eff.direction}</span>
            </div>
          );
        }
        return <div className="text-xs text-gray-500">Same route · run {familiarity} — building efficiency history.</div>;
      })()}
      {hasAnalysisDetails && (
        <div className="space-y-1.5">
          {analysisRows.slice(0, 8).map((r, i) => {
            // "CONDITIONS" in old-format blocks contains elevation/course profile — label as TERRAIN.
            // True weather (temp, humidity) is a separate row or part of CONDITIONS when no terrain exists.
            const rawLabel = String(r.label ?? '');
            const value = String(r.value ?? '');
            const isTerrainData = rawLabel.toUpperCase() === 'CONDITIONS' && /\bft\b|gain|descent|downhill|uphill|elevation|grade|climb/i.test(value);
            const label = isTerrainData ? 'TERRAIN' : rawLabel;
            return (
              <div key={i}>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
                <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{value}</p>
              </div>
            );
          })}
        </div>
      )}
      {sd?.race_readiness && isLlmRaceReadinessShape(sd.race_readiness) && (
        <RaceReadinessBlock rr={sd.race_readiness} />
      )}
      {!hideNextUp && nextSession && <NextUp session={nextSession} />}
      {!hasNarrative && hasStructuredForRender && (
        <>
          {technicalInsightsForRender.length > 0 && (
            <div className="space-y-2">
              {technicalInsightsForRender.map((t, i: number) => {
                const rawLabel = String(t.label ?? '');
                const value = String(t.value ?? '');
                const isTerrainData = rawLabel.toUpperCase() === 'CONDITIONS' && /\bft\b|gain|descent|downhill|uphill|elevation|grade|climb/i.test(value);
                const label = isTerrainData ? 'TERRAIN' : rawLabel;
                return (
                <div key={i}>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
                  <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{value}</p>
                </div>
                );
              })}
            </div>
          )}
          {hasPlanImpactForRender && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {planImpactLabel}
              </span>
              <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{planImpactText}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
