import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type TrendPoint = {
  date: string;
  value: number;
  avg_hr: number;
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
};

type NextSession = {
  name: string;
  date: string | null;
  type: string | null;
  prescription: string | null;
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
    summary?: { title?: string; bullets?: string[] };
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
  } | null;
  hasSessionDetail: boolean;
  noPlannedCompare: boolean;
  planLinkNote: string | null;
  recomputing: boolean;
  recomputeError: string | null;
  onRecompute: () => void;
  recomputeDisabled?: boolean;
}

function TrendSparkline({ trend }: { trend: TrendData }) {
  const pts = trend.points;
  if (pts.length < 3) return null;

  const values = pts.map((p) => p.value);
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
    y: PAD + ((p.value - minV) / range) * plotH,
    ...p,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const arrow = trend.direction === 'improving' ? '↗' : trend.direction === 'declining' ? '↘' : '→';
  const color = trend.direction === 'improving' ? '#34d399' : trend.direction === 'declining' ? '#f87171' : '#9ca3af';

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Trend</span>
        <span className="text-xs" style={{ color }}>{arrow} {trend.summary}</span>
      </div>
      <div className="mt-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, height: 52 }}>
          <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={c.is_current ? 3.5 : 2}
              fill={c.is_current ? color : 'rgba(156,163,175,0.5)'}
              stroke={c.is_current ? color : 'none'}
              strokeWidth={c.is_current ? 1 : 0}
            />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5" style={{ maxWidth: 280 }}>
          <span>{pts[0].label}</span>
          <span className="font-medium" style={{ color }}>{pts[pts.length - 1].label} ← today</span>
        </div>
      </div>
    </div>
  );
}

function NextUp({ session }: { session: NextSession }) {
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

export default function SessionNarrative({
  sessionDetail: sd,
  hasSessionDetail,
  noPlannedCompare,
  planLinkNote,
  recomputing,
  recomputeError,
  onRecompute,
  recomputeDisabled,
}: SessionNarrativeProps) {
  const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);

  const summaryTitle = sd?.summary?.title || 'Insights';
  const summaryBullets = Array.isArray(sd?.summary?.bullets) ? sd!.summary!.bullets! : [];
  const narrativeText = (typeof sd?.narrative_text === 'string' && sd.narrative_text.trim()) || '';
  const hasNarrative = narrativeText.length > 0;
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
  const hasNothing = !hasNarrative && !hasSummaryBullets && !hasStructuredForRender && !hasAnalysisDetails;

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
      {trend && <TrendSparkline trend={trend} />}
      {nextSession && <NextUp session={nextSession} />}
      {hasAnalysisDetails && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAnalysisDetailsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide hover:text-gray-300"
          >
            {analysisDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Analysis Details
          </button>
          {analysisDetailsOpen && (
          <div className="space-y-1.5">
            {analysisRows.slice(0, 8).map((r, i) => (
              <div key={i}>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{String(r.label ?? '')}</span>
                <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{String(r.value ?? '')}</p>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
      {!hasNarrative && hasStructuredForRender && (
        <>
          {technicalInsightsForRender.length > 0 && (
            <div className="space-y-2">
              {technicalInsightsForRender.map((t, i: number) => (
                <div key={i}>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{String(t.label ?? '')}</span>
                  <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{String(t.value ?? '')}</p>
                </div>
              ))}
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
