import React from 'react';
import { RouteDoorway } from './RouteDoorway';

// NOTE: the per-session TrendSparkline (raw-pace / pace-at-HR direction, D-050/Q-025) was RETIRED —
// macro trends live on State (single source), and the workout screen renders `discipline_trend`
// (read from the cached spine, never a competing verdict). The dead sparkline component + its
// TrendData/TrendPoint types + the `trend` prop field were removed 2026-07-11 so the competing-
// verdict chart can't be accidentally re-wired (Q-157 cleanup). Server still emits `trend: null`.

export type NextSession = {
  name: string;
  date: string | null;
  type: string | null;
  prescription: string | null;
};

type RouteHistoryPoint = {
  date: string;
  pace_s_per_km: number | null;
  /** GRADE-adjusted pace — terrain removed (Minetti/GAP, the Strava-GAP / TP-NGP model).
   *  Preferred when non-null; falls back to `pace_s_per_km` per-row when the run had no
   *  usable elevation. (Before 2026-07-14 this field carried the EFFORT-adjusted number and
   *  the chart claimed to have removed hills it had never looked at.) */
  gap_pace_s_per_km?: number | null;
  /** EFFORT-adjusted pace — pace at comparable cardiac effort (pace x avg_hr / threshold_hr).
   *  A different question from GAP. Not plotted by the route sparkline. */
  effort_adjusted_pace_s_per_km?: number | null;
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
      {/* Macro trends live on the State screen now (single source of truth). The per-session
          discipline context is `discipline_trend` (read from the cached spine, never a competing
          verdict). The old raw-pace/pace-at-HR TrendSparkline was DELETED 2026-07-11 (Q-157) — no
          raw-pace chart, no dashed HR overlay, nothing here can stamp a rival direction. */}
      {/* Segment verdict: the familiarity line is the DOORWAY — tap to open the server-authored verdict
          card + a quiet flag-driven chart. Reads segment_verdicts (spine-authored, Law 5); the client
          only renders (Law 4). PLURAL — one doorway per core this run traversed. Supersedes the old
          terrain.route doorway (Q-133 peel-back of that read-path still owed). */}
      {Array.isArray((sd as any)?.segment_verdicts) &&
        (sd as any).segment_verdicts.map((sv: any, i: number) => (
          <RouteDoorway key={i} verdict={sv} />
        ))}
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
