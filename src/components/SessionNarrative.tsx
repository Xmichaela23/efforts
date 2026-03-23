import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  type SessionInterpretationV1,
  planAssessmentLines,
} from '@/utils/performance-format';

interface SessionNarrativeProps {
  sessionDetail: {
    execution?: { execution_score?: number | null; pace_adherence?: number | null; power_adherence?: number | null; duration_adherence?: number | null; performance_assessment?: string | null; assessed_against?: string | null; status_label?: string | null };
    observations?: string[];
    narrative_text?: string | null;
    intervals?: Array<{ id: string; interval_type: string; planned_label: string; planned_duration_s: number | null; executed: { duration_s: number | null; distance_m: number | null; avg_hr: number | null; actual_pace_sec_per_mi?: number | null }; pace_adherence_pct?: number | null; duration_adherence_pct?: number | null }>;
    display?: { show_adherence_chips?: boolean; interval_display_reason?: string | null; has_measured_execution?: boolean };
    plan_context?: { planned_id?: string | null; planned?: unknown | null; match?: { summary?: string } | null };
    session_interpretation?: SessionInterpretationV1;
  } | null;
  hasSessionDetail: boolean;
  completedSrc: any;
  noPlannedCompare: boolean;
  planLinkNote: string | null;
  recomputing: boolean;
  recomputeError: string | null;
  onRecompute: () => void;
}

export default function SessionNarrative({
  sessionDetail: sd,
  hasSessionDetail,
  completedSrc,
  noPlannedCompare,
  planLinkNote,
  recomputing,
  recomputeError,
  onRecompute,
}: SessionNarrativeProps) {
  const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);

  const workoutAnalysis = completedSrc?.workout_analysis;
  const sessionState = workoutAnalysis?.session_state_v1;
  const hasSessionState = !!(sessionState && sessionState.version === 1);
  const summaryTitle = String(sessionState?.summary?.title || 'Insights');
  const summaryBullets = (hasSessionDetail && Array.isArray(sd?.observations) && sd.observations.length > 0)
    ? sd.observations.filter((b: string) => typeof b === 'string' && b.trim().length > 0).map((b: string) => b.trim())
    : (Array.isArray(sessionState?.summary?.bullets)
      ? sessionState.summary.bullets.filter((b: any) => typeof b === 'string' && b.trim().length > 0).map((b: string) => b.trim())
      : []);
  const narrativeText = (hasSessionDetail && typeof sd?.narrative_text === 'string' ? sd.narrative_text.trim() : '')
    || (typeof sessionState?.narrative?.text === 'string' ? sessionState.narrative.text.trim() : '');
  const hasNarrative = narrativeText.length > 0;
  const hasSummaryBullets = summaryBullets.length > 0;
  const factPacketV1 = sessionState?.details?.fact_packet_v1 ?? null;
  const flagsV1 = sessionState?.details?.flags_v1 ?? null;
  const adherenceSummary = sessionState?.details?.adherence_summary ?? null;
  const hasFactPacketV1 =
    factPacketV1 &&
    factPacketV1.version === 1 &&
    typeof factPacketV1.generated_at === 'string' &&
    !!factPacketV1.facts &&
    !!factPacketV1.derived;
  const SUMMARY_LABELS = new Set([
    'Summary',
    'Cardiac Drift',
    'Aerobic Efficiency',
    'Aerobic Stress',
    'Aerobic Response',
    'Elevated Drift',
    'High Cardiac Stress',
    'Interval Summary',
    'Zone Summary',
  ]);

  const technicalInsightsAll = Array.isArray(adherenceSummary?.technical_insights)
    ? adherenceSummary.technical_insights
    : [];
  const technicalInsightsForRender = hasSummaryBullets
    ? technicalInsightsAll.filter((t: { label: string }) => !SUMMARY_LABELS.has(String(t?.label || '').trim()))
    : technicalInsightsAll;

  const planContextText = (hasSessionDetail && typeof sd?.plan_context?.match?.summary === 'string' && sd.plan_context.match.summary.trim().length > 0)
    ? sd.plan_context.match.summary.trim()
    : (adherenceSummary?.plan_impact?.outlook && adherenceSummary.plan_impact.outlook !== 'No plan context.' ? adherenceSummary.plan_impact.outlook : '');
  const hasPlanImpactForRender = planContextText.length > 0;
  const hasTechnicalForRender = technicalInsightsForRender.length > 0;
  const hasStructuredForRender = (!!adherenceSummary && hasTechnicalForRender) || hasPlanImpactForRender;
  const hasNothing = !hasNarrative && !hasSummaryBullets && !hasStructuredForRender && !hasFactPacketV1;

  if ((!hasSessionState && !hasSessionDetail) || hasNothing) {
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
            disabled={recomputing || !completedSrc?.id}
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
          {hasSessionState
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
          disabled={recomputing || !completedSrc?.id}
          className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15 disabled:opacity-50"
          title="Re-run analysis for this workout"
        >
          {recomputing ? 'Recomputing…' : 'Recompute analysis'}
        </button>
      </div>
      {hasSessionDetail &&
        sd?.session_interpretation &&
        sd?.display?.show_adherence_chips === false &&
        (() => {
          const pa = planAssessmentLines(sd.session_interpretation);
          if (pa.length === 0) return null;
          return (
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Plan assessment</span>
              {pa.map((line, i) => (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">{line}</p>
              ))}
            </div>
          );
        })()}
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
              const bullets: string[] = summaryBullets;

              const seen = new Set<string>();
              const out = bullets.filter((b) => {
                const k = b.trim();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });

              return out.slice(0, 4).map((b: string, i: number) => (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">{b}</p>
              ));
            })()}
          </div>
        </div>
      )}
      {hasFactPacketV1 && (
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
            {(() => {
              const rows: Array<{ label: string; value: string }> = [];

              try {
                const siStim = hasSessionDetail ? sd?.session_interpretation : null;
                const hasSiStimulus =
                  typeof siStim?.training_effect?.actual_stimulus === 'string' &&
                  siStim.training_effect.actual_stimulus.trim().length > 0;
                if (hasSiStimulus) {
                  const te = siStim!.training_effect!;
                  const alignLabel =
                    te.alignment === 'on_target'
                      ? 'Mostly matched plan'
                      : te.alignment === 'partial'
                        ? 'Mixed vs plan'
                        : te.alignment === 'missed'
                          ? 'Below plan'
                          : te.alignment === 'exceeded'
                            ? 'Above plan'
                            : String(te.alignment || '');
                  rows.push({
                    label: 'Stimulus',
                    value: `${alignLabel}: ${te.actual_stimulus}`.trim(),
                  });
                } else {
                  const stim = factPacketV1?.derived?.stimulus;
                  if (stim && typeof stim.achieved === 'boolean') {
                    rows.push({
                      label: 'Stimulus',
                      value: stim.achieved
                        ? `Achieved (${stim.confidence}). ${Array.isArray(stim.evidence) && stim.evidence[0] ? stim.evidence[0] : ''}`.trim()
                        : `Possibly missed (${stim.confidence}). ${stim.partial_credit || ''}`.trim(),
                    });
                  }
                }
              } catch {}

              try {
                const lim = factPacketV1?.derived?.primary_limiter;
                if (lim?.limiter) {
                  const conf = typeof lim.confidence === 'number' ? Math.round(lim.confidence * 100) : null;
                  const ev0 = Array.isArray(lim.evidence) && lim.evidence[0] ? String(lim.evidence[0]) : '';
                  rows.push({
                    label: 'Limiter',
                    value: `${String(lim.limiter)}${conf != null ? ` (${conf}%)` : ''}${ev0 ? ` — ${ev0}` : ''}`.trim(),
                  });
                }
              } catch {}

              try {
                const vs = factPacketV1?.derived?.comparisons?.vs_similar;
                if (vs && typeof vs.sample_size === 'number' && vs.sample_size > 0 && vs.assessment !== 'insufficient_data') {
                  const map: Record<string, string> = {
                    better_than_usual: 'Better than usual',
                    typical: 'Typical',
                    worse_than_usual: 'Worse than usual',
                  };
                  rows.push({
                    label: 'Similar workouts',
                    value: `${map[String(vs.assessment)] || String(vs.assessment)} (n=${vs.sample_size})`,
                  });
                }
              } catch {}

              try {
                const tr = factPacketV1?.derived?.comparisons?.trend;
                if (tr && typeof tr.data_points === 'number' && tr.data_points > 0 && tr.direction !== 'insufficient_data') {
                  rows.push({
                    label: 'Trend',
                    value: `${String(tr.direction)}${tr.magnitude ? ` — ${tr.magnitude}` : ''}`.trim(),
                  });
                }
              } catch {}

              try {
                const mbt =
                  (completedSrc as any)?.workout_analysis?.mile_by_mile_terrain ||
                  (completedSrc as any)?.workout_analysis?.detailed_analysis?.mile_by_mile_terrain;

                const splitsRaw = Array.isArray((mbt as any)?.splits) ? (mbt as any).splits : [];
                const fmtPace = (sec: number): string => {
                  if (!Number.isFinite(sec) || sec <= 0) return '';
                  const m = Math.floor(sec / 60);
                  const s = Math.round(sec % 60);
                  return `${m}:${String(s).padStart(2, '0')}/mi`;
                };

                const splits = splitsRaw
                  .map((s: any) => ({
                    mile: Number(s?.mile),
                    pace: Number(s?.pace_s_per_mi ?? s?.pace_sec_per_mi ?? s?.pace_sec_per_mile),
                    terrain: String(s?.terrain_type || '').trim(),
                  }))
                  .filter((s: any) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);

                const noteFallback = (factPacketV1 as any)?.derived?.pacing_pattern?.speedups_note;

                if (splits.length >= 2) {
                  let best: { mile: number; pickupSec: number; pace: number; terrain?: string } | null = null;
                  for (let i = 1; i < splits.length; i++) {
                    const prev = splits[i - 1];
                    const cur = splits[i];
                    const pickupSec = prev.pace - cur.pace;
                    if (pickupSec > (best?.pickupSec ?? 0) && pickupSec <= 120) {
                      best = { mile: cur.mile, pickupSec, pace: cur.pace, terrain: cur.terrain };
                    }
                  }

                  if (best && Number.isFinite(best.pickupSec) && best.pickupSec >= 10) {
                    const terr = best.terrain ? ` (${best.terrain})` : '';
                    const deltaMin = Math.floor(best.pickupSec / 60);
                    const deltaSec = Math.round(best.pickupSec % 60);
                    const deltaStr = deltaMin > 0
                      ? `${deltaMin}:${String(deltaSec).padStart(2, '0')}/mi faster`
                      : `${deltaSec}s/mi faster`;
                    rows.push({
                      label: 'Speed',
                      value: `Biggest pickup: Mile ${best.mile}${terr} at ${fmtPace(best.pace)} (${deltaStr} than prior mile)`,
                    });
                  } else if (noteFallback && typeof noteFallback === 'string' && noteFallback.trim().length > 0) {
                    rows.push({ label: 'Speed', value: noteFallback.trim() });
                  }
                } else if (noteFallback && typeof noteFallback === 'string' && noteFallback.trim().length > 0) {
                  rows.push({ label: 'Speed', value: noteFallback.trim() });
                }
              } catch {}

              try {
                const wx = factPacketV1?.facts?.weather;
                if (wx && typeof wx.dew_point_f === 'number' && wx.heat_stress_level && wx.heat_stress_level !== 'none') {
                  rows.push({
                    label: 'Conditions',
                    value: `Dew point ${Math.round(wx.dew_point_f)}°F (${wx.heat_stress_level})`,
                  });
                }
              } catch {}

              try {
                const tl = factPacketV1?.derived?.training_load;
                if (tl && typeof tl.cumulative_fatigue === 'string') {
                  const evidence = Array.isArray(tl.fatigue_evidence) && tl.fatigue_evidence.length > 0
                    ? tl.fatigue_evidence.join(' — ')
                    : tl.cumulative_fatigue.charAt(0).toUpperCase() + tl.cumulative_fatigue.slice(1).toLowerCase() + ' fatigue';
                  rows.push({
                    label: 'Fatigue',
                    value: evidence.trim(),
                  });
                }
              } catch {}

              if (!hasSummaryBullets) {
                try {
                  const flags = Array.isArray(flagsV1) ? flagsV1 : [];
                  const top = flags
                    .filter((f: any) => f && typeof f.message === 'string' && f.message.length > 0)
                    .sort((a: any, b: any) => Number(a.priority || 99) - Number(b.priority || 99))
                    .slice(0, 3);
                  for (const f of top) {
                    rows.push({ label: 'Flag', value: String(f.message) });
                  }
                } catch {}
              }

              const dedup = new Set<string>();
              const out = rows.filter((r) => {
                const k = `${r.label}::${r.value}`;
                if (dedup.has(k)) return false;
                dedup.add(k);
                return true;
              }).slice(0, 8);

              return out.map((r, i) => (
                <div key={i}>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{r.label}</span>
                  <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{r.value}</p>
                </div>
              ));
            })()}
          </div>
          )}
        </div>
      )}
      {!hasNarrative && hasStructuredForRender && (
        <>
          {technicalInsightsForRender.length > 0 && (
            <div className="space-y-2">
              {technicalInsightsForRender.map((t: { label: string; value: string }, i: number) => (
                <div key={i}>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t.label}</span>
                  <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{t.value}</p>
                </div>
              ))}
            </div>
          )}
          {hasPlanImpactForRender && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {hasSessionDetail ? 'Plan context' : String(adherenceSummary?.plan_impact?.focus || 'Weekly outlook').replace(/coach/ig, 'training')}
              </span>
              <p className="text-sm text-gray-300 leading-relaxed mt-0.5">{planContextText}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
