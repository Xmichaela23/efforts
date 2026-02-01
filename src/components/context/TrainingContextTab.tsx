/**
 * =============================================================================
 * TRAINING CONTEXT TAB
 * =============================================================================
 * 
 * Main component for the Training Context screen
 * Displays comprehensive training context including:
 * - ACWR gauge with status
 * - 7-day training load chart
 * - Sport breakdown
 * - Smart insights
 * - 14-day activity timeline
 * 
 * Replaces the old WeeklyAnalysisTab
 */

import React from 'react';
import { Loader2, RefreshCw, AlertCircle, Target, Activity, Dumbbell, TrendingUp } from 'lucide-react';
import { useTrainingContext } from '@/hooks/useTrainingContext';
import { TrainingLoadChart } from './TrainingLoadChart';
import { SportBreakdown } from './SportBreakdown';
import { SmartInsights } from './SmartInsights';
import { ActivityTimeline } from './ActivityTimeline';

interface TrainingContextTabProps {
  date?: string; // Defaults to today
  onSelectWorkout?: (workout: any) => void;
}

export const TrainingContextTab: React.FC<TrainingContextTabProps> = ({ date, onSelectWorkout }) => {
  // Default to today if no date provided
  const focusDate = date || new Date().toLocaleDateString('en-CA');
  
  const { data, loading, error, refresh } = useTrainingContext(focusDate);

  // Loading state
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <div className="text-sm">Loading training context...</div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-400">
        <AlertCircle className="w-8 h-8 mb-3" />
        <div className="text-sm text-center">{error}</div>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <div className="text-sm">No training data available</div>
        <div className="text-xs text-white/40 mt-2">Complete some workouts to see your training context</div>
      </div>
    );
  }

  // Server-computed display values (smart server, dumb client). Fallback only for old cached responses.
  type FatigueTier = 'Low' | 'Moderate' | 'Elevated';
  const aerobicTier: FatigueTier = data.display_aerobic_tier ?? (() => {
    if (data.weekly_verdict) {
      if (data.weekly_verdict.label === 'high') return 'Low' as FatigueTier;
      if (data.weekly_verdict.label === 'medium') return 'Moderate' as FatigueTier;
      return 'Elevated' as FatigueTier;
    }
    const trend = data.weekly_readiness?.recent_form_trend;
    if (trend === 'worsening') return 'Elevated' as FatigueTier;
    if (trend === 'improving') return 'Low' as FatigueTier;
    return 'Moderate' as FatigueTier;
  })();
  const structuralTier: FatigueTier = data.display_structural_tier ?? (() => {
    const rir = data.structural_load?.avg_rir_acute;
    if (rir == null || rir >= 2) return 'Low' as FatigueTier;
    if (rir >= 1) return 'Moderate' as FatigueTier;
    return 'Elevated' as FatigueTier;
  })();
  const limiterLine = data.display_limiter_line ?? (() => {
    const o: Record<FatigueTier, number> = { Low: 0, Moderate: 1, Elevated: 2 };
    return o[aerobicTier] > o[structuralTier] ? 'Today is limited by aerobic fatigue.'
      : o[structuralTier] > o[aerobicTier] ? 'Today is limited by structural fatigue.'
      : 'No clear limiter.';
  })();
  const loadChangeRiskLabel = data.display_load_change_risk_label ?? (
    data.acwr.status === 'undertrained' || data.acwr.status === 'recovery' || data.acwr.status === 'optimal_recovery' ? 'Below baseline'
    : data.acwr.status === 'optimal' ? 'In range'
    : data.acwr.status === 'elevated' ? 'Ramping fast'
    : 'Overreaching'
  );

  // Plan-aware ACWR label (for burnout copy only)
  const hasActivePlan = !!data.acwr.plan_context?.hasActivePlan;
  const weekIntent = data.acwr.plan_context?.weekIntent;
  const isBuildBaselinePeak = weekIntent === 'build' || weekIntent === 'baseline' || weekIntent === 'peak';
  const acwrStatusLabel = hasActivePlan && isBuildBaselinePeak && data.acwr.status === 'undertrained'
    ? 'Below Base'
    : data.acwr.status.replace('_', ' ');

  const burnoutRiskStatus = (acwrStatusLabel === 'Below Base' || data.acwr.status === 'undertrained' || data.acwr.status === 'recovery' || data.acwr.status === 'optimal_recovery')
    ? 'Low'
    : data.acwr.status === 'optimal'
      ? 'Good'
      : data.acwr.status === 'elevated'
        ? 'Elevated'
        : 'High';
  const burnoutRiskCopy: Record<string, string> = {
    Low: 'You aren\'t adding mileage too fast for your current base.',
    Good: 'Your training load is in a safe progression zone.',
    Elevated: 'Volume is building; prioritize recovery and sleep.',
    High: 'Back off slightly to reduce injury and illness risk.',
  };

  // One-line explanations for fatigue tiers (reusable; teaches without wall of text)
  const fatigueTierCopy: Record<FatigueTier, string> = {
    Low: 'You should handle normal training well.',
    Moderate: 'This will feel harder than normal if you push intensity.',
    Elevated: 'Prioritize recovery; quality work will underperform.',
  };

  return (
    <div className="space-y-3 pb-6">
      {/* Cockpit strip (matches dashboard week strip language) */}
      <div
        className="flex items-center justify-between relative"
        style={{
          backgroundColor: '#000000',
          padding: '0.55rem 0.75rem',
          borderRadius: '10px',
          border: '0.5px solid rgba(255, 255, 255, 0.12)',
          backgroundImage: `
            radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.16) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 45%, rgba(255, 255, 255, 0.06) 0%, transparent 62%),
            linear-gradient(45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.14) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: 'cover, cover, 26px 26px, 26px 26px, 52px 52px, 52px 52px',
          backgroundPosition: 'center, center, center, center, center, center',
          backgroundBlendMode: 'screen, screen, soft-light, soft-light, soft-light, soft-light',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.05) inset,
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset -1px -1px 0 rgba(0,0,0,0.35),
            0 8px 18px rgba(0,0,0,0.45),
            0 0 22px rgba(255,255,255,0.06),
            0 0 22px rgba(255,215,0,0.06),
            0 0 26px rgba(74,158,255,0.05)
          `,
        }}
      >
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Updated from your last 7 days
          </span>
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Today
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`p-2 rounded-lg transition-colors ${
            loading
              ? 'text-white/30 cursor-not-allowed'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          title="Refresh context"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 1. Week Narrative (coach dashboard: headline + bullets + implication). When present, replaces verdict-style Week Review. */}
      {data.week_narrative ? (
        <div className="instrument-card flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Week {data.week_narrative.week_index} • Day {data.week_narrative.week_day_index} of 7 ({data.week_narrative.phase.replace('_', ' ')})
            {data.week_narrative.week_focus_label ? ` • ${data.week_narrative.week_focus_label}` : ''}
          </p>
          {data.week_narrative.body_response_line && (
            <p className="text-xs text-white/40">{data.week_narrative.body_response_line}</p>
          )}
          {data.week_narrative.plan_goal_line && (
            <p className="text-xs text-white/60">{data.week_narrative.plan_goal_line}</p>
          )}
          <p className="text-sm font-medium text-white/95">{data.week_narrative.synthesis.headline}</p>
          <ul className="text-sm text-white/85 list-disc list-inside space-y-0.5">
            {data.week_narrative.synthesis.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {data.week_narrative.carryover && data.week_narrative.carryover.level !== 'low' && (
            <p className="text-xs text-white/50">
              Carryover (last week): {data.week_narrative.carryover.level}
              {data.week_narrative.carryover.pct_of_baseline != null && ` — ${data.week_narrative.carryover.pct_of_baseline}% of baseline`}
              {data.week_narrative.carryover.interpretation ? ` — ${data.week_narrative.carryover.interpretation}` : '.'}
            </p>
          )}
          {data.week_narrative.synthesis.implication && (
            <p className="text-sm text-white/80 pt-1 border-t border-white/10">
              {data.week_narrative.synthesis.implication}
            </p>
          )}
          {import.meta.env.DEV && data.week_narrative.debug_week_narrative && (
            <details className="mt-2 pt-2 border-t border-white/10 text-xs font-mono text-white/50" open={false}>
              <summary className="cursor-pointer text-white/40">debug_week_narrative</summary>
              <pre className="mt-1 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {JSON.stringify(data.week_narrative.debug_week_narrative, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ) : data.week_review ? (
        <div className="instrument-card flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Week {data.week_review.week_index} check-in
          </p>
          {data.week_review.plan_goal_line && (
            <p className="text-xs text-white/60">{data.week_review.plan_goal_line}</p>
          )}
          {data.week_review.week_verdict && (
            <>
              <p className="text-sm font-medium text-white/95">{data.week_review.week_verdict.headline}</p>
              {data.week_review.week_verdict.detail && (
                <p className="text-xs text-white/60">{data.week_review.week_verdict.detail}</p>
              )}
            </>
          )}
          <p className="text-sm text-white/90">
            Day {data.week_review.week_day_index} of 7 • {data.week_review.phase.charAt(0).toUpperCase() + data.week_review.phase.slice(1).replace('_', ' ')}
            {data.week_review.week_focus_label ? ` • ${data.week_review.week_focus_label}` : ''}
          </p>
          <p className="text-sm text-white/85">
            {data.week_review.completed.sessions_missed != null
              ? `${data.week_review.completed.sessions_completed_total} session${data.week_review.completed.sessions_completed_total !== 1 ? 's' : ''} this week • ${data.week_review.completed.sessions_matched_to_plan}/${data.week_review.planned.sessions_to_date} planned matched • Missed: ${data.week_review.completed.sessions_missed} • Remaining: ${data.week_review.planned.sessions_remaining}`
              : `${data.week_review.completed.sessions_completed_total} session${data.week_review.completed.sessions_completed_total !== 1 ? 's' : ''} this week • ${data.week_review.completed.sessions_matched_to_plan}/${data.week_review.planned.sessions_to_date} planned matched • Remaining: ${data.week_review.planned.sessions_remaining}`}
          </p>
          {data.week_review.match_coverage_note && (
            <p className="text-xs text-white/40">{data.week_review.match_coverage_note}</p>
          )}
          {data.week_review.completed.sessions_moved > 0 && data.week_review.moved_examples?.length ? (
            <p className="text-sm text-white/85">
              Moved: {data.week_review.completed.sessions_moved} session{data.week_review.completed.sessions_moved !== 1 ? 's' : ''}
              {data.week_review.moved_examples[0]
                ? ` (done ${new Date(data.week_review.moved_examples[0].done_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })} instead of ${new Date(data.week_review.moved_examples[0].planned_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })})`
                : ''}
            </p>
          ) : null}
          {data.week_review.key_session_audits.length > 0 && (
            <p className="text-sm text-white/85">
              Key sessions: {data.week_review.key_session_audits.filter(a => a.status === 'hit' || a.status === 'close').length}/{data.week_review.key_session_audits.length} on target
            </p>
          )}
          {data.week_review.key_session_audits.slice(0, 2).map((audit, i) => (
            <div key={i} className="pt-1 border-t border-white/10">
              <p className="text-sm text-white/90">{audit.headline}</p>
              {audit.delta && (
                <p className="text-xs text-white/60 mt-0.5">
                  Target {audit.delta.planned} → Actual {audit.delta.actual}
                  {audit.delta.direction === 'fast' && audit.delta.seconds_per_mile < 0 && (
                    <span> ({Math.abs(audit.delta.seconds_per_mile)}s fast{audit.delta.pct !== 0 ? `, ${Math.abs(audit.delta.pct)}% fast` : ''})</span>
                  )}
                  {audit.delta.direction === 'slow' && audit.delta.seconds_per_mile > 0 && (
                    <span> ({audit.delta.seconds_per_mile}s slow{audit.delta.pct !== 0 ? `, ${audit.delta.pct}% slow` : ''})</span>
                  )}
                </p>
              )}
              {audit.detail && <p className="text-xs text-white/60 mt-0.5">One adjustment: {audit.detail}</p>}
            </div>
          ))}
          {import.meta.env.DEV && data.week_review.debug_week_truth && (
            <details className="mt-2 pt-2 border-t border-white/10 text-xs font-mono text-white/50" open={false}>
              <summary className="cursor-pointer text-white/40">debug_week_truth</summary>
              <pre className="mt-1 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {JSON.stringify(data.week_review.debug_week_truth, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ) : data.context_summary && data.context_summary.length > 0 ? (
        <div className="instrument-card flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            {data.plan_checkin?.plan_is_active ? 'Plan Check-in' : "Today's context"}
          </p>
          {/* Show week line once: from context_summary[0] if it's the week line, else from plan_checkin */}
          {data.plan_checkin?.plan_is_active && !data.context_summary[0]?.startsWith('Week ') && (
            <p className="text-xs uppercase tracking-wider text-white/40">
              Week {data.plan_checkin.plan_week_index} of {data.plan_checkin.plan_week_total} — {data.plan_checkin.plan_phase_label}
            </p>
          )}
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{data.context_summary[0]}</p>
          {data.context_summary.slice(1).map((line, i) => (
            <p key={i} className="text-sm text-white/90 leading-relaxed">{line}</p>
          ))}
        </div>
      ) : (
        <>
          {/* Fallback: plan science + banner when no context_summary (e.g. old cache) */}
          {data.acwr?.plan_context?.hasActivePlan && (data.acwr.plan_context.weekIndex != null || data.acwr.plan_context.weeks_remaining != null) && (
            <div className="text-xs text-white/50 px-1 flex flex-wrap gap-x-2">
              {data.acwr.plan_context.weekIndex != null && data.acwr.plan_context.duration_weeks != null && (
                <span>Week {data.acwr.plan_context.weekIndex} of {data.acwr.plan_context.duration_weeks}</span>
              )}
              {data.acwr.plan_context.weeks_remaining != null && (
                <span>{data.acwr.plan_context.race_date ? `${data.acwr.plan_context.weeks_remaining} weeks to race` : `${data.acwr.plan_context.weeks_remaining} weeks to go`}</span>
              )}
              {data.acwr.plan_context.next_week_intent != null && data.acwr.plan_context.next_week_intent !== 'unknown' && (
                <span>Next week: {data.acwr.plan_context.next_week_focus_label || data.acwr.plan_context.next_week_intent}</span>
              )}
            </div>
          )}
          {data.context_banner && (
            <div className="instrument-card flex flex-col gap-1.5">
              <p className="text-sm font-medium text-white/95">{data.context_banner.line1}</p>
              <p className="text-sm text-white/80">{data.context_banner.line2}</p>
              <p className="text-sm text-white/80">{data.context_banner.line3}</p>
              {data.context_banner.acwr_clause && (
                <p className="text-sm text-amber-400/90 pt-0.5">{data.context_banner.acwr_clause}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* 2. Next key session (from week_narrative or week_review) */}
      {(() => {
        const nextKey = data.week_narrative?.next_key_session ?? data.week_review?.next_key_session;
        if (!nextKey?.title) return null;
        return (
          <div className="text-sm text-white/85 py-2 px-3 rounded-lg border border-white/10 bg-white/[0.03]">
            <span className="text-white/60">Next key session: </span>
            <span className="text-white/90">{nextKey.title}</span>
            {(nextKey.date_local || nextKey.date) && (
              <span className="text-white/50 ml-1">
                — {new Date((nextKey.date_local || nextKey.date)! + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            )}
            {nextKey.primary_target && (
              <p className="text-xs text-white/60 mt-0.5">Target: {nextKey.primary_target}</p>
            )}
          </div>
        );
      })()}

      {/* Today: role in the week (from plan) + one action — congruent with Week Narrative */}
      {(() => {
        const isRestDay = data.day_type === 'rest';
        const dayTypeUnknown = data.day_type == null;
        const hasStimulus = data.has_planned_stimulus !== false;
        const todayTitle = data.week_narrative?.today_role_label
          ? `Today: ${data.week_narrative.today_role_label}`
          : 'Today';

        if (dayTypeUnknown) {
          return (
            <div className="instrument-card">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white">{todayTitle}</span>
              </div>
              <p className="text-sm text-white/70">Updating today&apos;s status…</p>
              <p className="text-xs text-white/50 mt-1">Refresh to see recovery or readiness.</p>
            </div>
          );
        }
        if (isRestDay) {
          return (
            <div className="instrument-card">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white">{todayTitle}</span>
              </div>
              <p className="text-sm text-white/90">{data.next_action ?? 'Rest day. Resume tomorrow.'}</p>
              {(aerobicTier === 'Moderate' || aerobicTier === 'Elevated') && (
                <p className="text-xs text-white/50 mt-2">Moderate fatigue is expected heading into a rest day.</p>
              )}
            </div>
          );
        }
        if (data.day_type === 'training' && data.has_planned_stimulus === false) {
          return (
            <div className="instrument-card">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white">{todayTitle}</span>
              </div>
              <p className="text-sm text-white/85">{data.next_action ?? 'Follow your plan — no changes needed.'}</p>
            </div>
          );
        }
        if (data.weekly_verdict && hasStimulus) {
          const pct = data.weekly_verdict.readiness_pct;
          const readinessTier = pct >= 80 ? 'High' : pct >= 60 ? 'Moderate' : 'Low';
          return (
            <div className="instrument-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Target className="w-4 h-4 shrink-0 text-white/50" />
                  <span className="text-sm font-medium text-white">{todayTitle}</span>
                </div>
                {!data.week_narrative?.today_role_label && (
                  <div className="flex flex-col items-end shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={`text-lg font-semibold ${
                          data.weekly_verdict.label === 'high' ? 'text-green-400' : data.weekly_verdict.label === 'medium' ? 'text-amber-400' : 'text-white/70'
                        }`}
                      >
                        {pct}%
                      </span>
                      <span className="text-[11px] text-white/50 whitespace-nowrap">{readinessTier}</span>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-white/85 mt-1">
                {data.next_action ?? (data.weekly_verdict.label === 'high' ? 'No changes needed today.' : data.weekly_verdict.label === 'medium' ? 'Proceed with planned session; keep intensity controlled.' : 'Reduce intensity today; stay within plan.')}
              </p>
              {data.readiness_source_date && !data.week_narrative?.today_role_label && (
                <p className="text-xs text-white/40 mt-2">
                  {data.readiness_source_start_date
                    ? `Based on your last runs (${new Date(data.readiness_source_start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.readiness_source_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
                    : `Based on your run on ${new Date(data.readiness_source_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </p>
              )}
            </div>
          );
        }
        return (
          <div className="instrument-card">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-white/50" />
              <span className="text-sm font-medium text-white">{todayTitle}</span>
            </div>
            <p className="text-sm text-white/85">{data.next_action ?? 'Follow your plan — no changes needed.'}</p>
            {!data.week_narrative?.today_role_label && (
              <p className="text-xs text-white/50 mt-2">
                Complete a run with HR to see execution readiness (heart-rate drift and on-target execution).
              </p>
            )}
          </div>
        );
      })()}

      {/* Load Change Risk — premium scan path #4 */}
      {data.acwr.data_days < 7 ? (
        <div className="text-xs text-white/50 py-2 px-3">
          Train for {7 - data.acwr.data_days} more day{7 - data.acwr.data_days !== 1 ? 's' : ''} to unlock load change risk.
        </div>
      ) : (
        <div className="space-y-1">
          <div className={`flex items-center justify-between text-sm py-2 px-3 rounded-lg border border-white/10 ${data.acwr.ratio > 1.3 ? 'bg-amber-500/10 border-amber-400/30' : 'bg-white/[0.03]'}`}>
            <span className="text-white/60">Load Change Risk</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-white/80">{data.acwr.ratio.toFixed(2)}</span>
              <span className={`font-medium ${data.acwr.ratio > 1.5 ? 'text-red-400' : data.acwr.ratio > 1.3 ? 'text-amber-400' : 'text-white/80'}`}>
                {loadChangeRiskLabel}
              </span>
            </span>
          </div>
          {data.display_load_change_risk_helper && (
            <p className="text-xs text-white/50 px-3">{data.display_load_change_risk_helper}</p>
          )}
        </div>
      )}

      <div aria-hidden="true" className="instrument-divider" />

      {/* Details accordion: Today's signals + Why — premium scan path #5 */}
      <details className="instrument-card" open={false}>
        <summary className="text-sm font-medium text-white/80 cursor-pointer list-none flex items-center gap-2 py-2">
          <TrendingUp className="w-4 h-4 text-white/50" />
          <span>Today&apos;s signals</span>
        </summary>
        <div className="pt-2 mt-1 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-white/50" />
          <span className="text-sm font-medium text-white">Today&apos;s signals</span>
        </div>
        <div className="space-y-3">
          {/* Aerobic Load — helper only for Moderate/Elevated (option B) */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Activity className="w-3.5 h-3.5 text-teal-400/80" />
                <span>Aerobic Load</span>
              </div>
              <span className={`font-medium ${aerobicTier === 'Low' ? 'text-green-400' : aerobicTier === 'Elevated' ? 'text-amber-400' : 'text-white/80'}`}>
                {aerobicTier === 'Low' ? 'Low' : aerobicTier === 'Moderate' ? 'Moderate' : 'Elevated'} fatigue
              </span>
            </div>
            {aerobicTier !== 'Low' && (
              <p className="text-xs text-white/50 mt-0.5 pl-5">{fatigueTierCopy[aerobicTier]}</p>
            )}
          </div>
          {/* Structural Load — helper only for Moderate/Elevated */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Dumbbell className="w-3.5 h-3.5 text-orange-400/80" />
                <span>Structural Load</span>
              </div>
              <span className={`font-medium ${structuralTier === 'Low' ? 'text-green-400' : structuralTier === 'Elevated' ? 'text-amber-400' : 'text-white/80'}`}>
                {structuralTier === 'Low' ? 'Low' : structuralTier === 'Moderate' ? 'Moderate' : 'Elevated'} fatigue
              </span>
            </div>
            {structuralTier !== 'Low' && (
              <p className="text-xs text-white/50 mt-0.5 pl-5">{fatigueTierCopy[structuralTier]}</p>
            )}
          </div>
          {/* Limiter as label (no repeated prose) */}
          <p className="text-sm text-white/80 pt-1 border-t border-white/10">
            Limiter: {data.display_limiter_label ?? (limiterLine === 'No clear limiter.' ? 'None' : limiterLine.replace('Today is limited by ', '').replace('.', ''))}
          </p>
        </div>
        </div>
      </details>

      {/* Why (collapsed; instrumentation language) */}
      <details className="instrument-card py-2 px-3" open={false}>
        <summary className="text-xs text-white/50 cursor-pointer list-none flex items-center gap-1">
          <span className="text-white/60">Why</span>
          <span className="text-white/40">Aerobic (recent run efficiency, HR drift, on-target execution). Structural (strength volume, avg RIR).</span>
        </summary>
        <div className="mt-2 pt-2 border-t border-white/10">
          <p className="text-xs text-white/50">
            <span className="text-white/70">Aerobic:</span> recent run efficiency, HR drift, on-target execution.
          </p>
          <p className="text-xs text-white/50 mt-1">
            <span className="text-white/70">Structural:</span> strength volume (7d), avg RIR (7d).
          </p>
        </div>
      </details>

      {/* Projected week load — only when no context_summary (summary already includes it) */}
      {data.projected_week_load && !data.context_summary?.length && (
        <div className="text-xs text-white/50 py-2 px-3">
          {data.projected_week_load.message}
        </div>
      )}

      {/* Other insights (optional) */}
      {data.insights && data.insights.length > 0 && (
        <SmartInsights insights={data.insights} />
      )}

      {/* Training Load Chart */}
      <TrainingLoadChart 
        timeline={data.timeline} 
        totalWorkload={data.sport_breakdown.total_workload} 
      />

      {/* Plan progress (only when on an active plan and data is available) */}
      {data.plan_progress && data.acwr?.plan_context?.hasActivePlan && (
        <div className="instrument-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">On-plan progress</span>
            <span className="text-xs text-white/40">
              {data.plan_progress.week_start} → {data.plan_progress.week_end}
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="text-sm text-white/80">
              {(() => {
                const status = data.week_review?.week_verdict?.headline
                  ? (data.week_review.week_verdict.headline.includes('behind')
                      ? 'behind'
                      : data.week_review.week_verdict.headline.includes('trending hot')
                        ? 'hot'
                        : data.week_review.week_verdict.headline.includes('not matched')
                          ? 'not_matched'
                          : data.week_review.week_verdict.headline.includes('on track')
                            ? 'on_track'
                            : data.plan_progress.status)
                  : data.plan_progress.status;
                if (status === 'behind') return <span className="text-amber-400 font-medium">Behind</span>;
                if (status === 'hot') return <span className="text-amber-400 font-medium">Execution hot</span>;
                if (status === 'not_matched') return <span className="text-white/70 font-medium">Not matched</span>;
                if (status === 'on_track') return <span className="text-green-400 font-medium">On track</span>;
                if (status === 'ahead') return <span className="text-blue-400 font-medium">Ahead</span>;
                return <span className="text-white/60 font-medium">Unknown</span>;
              })()}
              <span className="text-white/40 ml-2">
                {data.acwr.plan_context?.planName ? `${data.acwr.plan_context.planName}` : 'Active plan'}
                {data.acwr.plan_context?.weekIndex ? ` • Week ${data.acwr.plan_context.weekIndex}` : ''}
              </span>
            </div>

            {(() => {
              const pct = data.week_review?.workload_pct_of_planned_to_date ?? data.plan_progress.percent_of_planned_to_date;
              if (typeof pct !== 'number') return null;
              return (
                <div className="text-sm text-white/80">
                  <span className="font-medium">{pct}%</span>
                  <span className="text-white/40"> of planned workload so far (to-date)</span>
                </div>
              );
            })()}
          </div>

          <div className="mt-1 text-xs text-white/50 flex items-center justify-between">
            <span>
              Sessions: {data.week_review
                ? `${data.week_review.completed.sessions_matched_to_plan}/${data.week_review.planned.sessions_to_date} matched (to-date)`
                : `${data.plan_progress.matched_planned_sessions_to_date}/${data.plan_progress.planned_sessions_to_date} matched (to-date)`}
            </span>
            <span>
              Match: {data.week_review
                ? `${Math.round((data.week_review.completed.match_coverage_pct || 0) * 100)}%`
                : `${Math.round((data.plan_progress.match_confidence || 0) * 100)}%`}
            </span>
          </div>

          <div className="mt-1 text-xs text-white/50">
            {data.week_review?.planned_to_date_workload != null && data.week_review?.completed_matched_workload != null
              ? <>Workload so far: {Math.round(data.week_review.completed_matched_workload)} matched / {Math.round(data.week_review.planned_to_date_workload)} planned to-date</>
              : <>Workload so far: {Math.round(data.plan_progress.completed_to_date_total)} completed / {Math.round(data.plan_progress.planned_to_date_total)} planned to-date</>}
            {data.plan_progress.planned_week_total > 0 && data.plan_progress.planned_week_total !== data.plan_progress.planned_to_date_total && (
              <span className="text-white/40"> • {Math.round(data.plan_progress.planned_week_total)} planned (full week)</span>
            )}
          </div>

          {data.week_review?.match_coverage_note ? (
            <div className="mt-2 text-xs text-white/40 italic">
              {data.week_review.match_coverage_note}
            </div>
          ) : (data.plan_progress.match_confidence ?? 0) < 0.5 && (
            <div className="mt-2 text-xs text-white/40 italic">
              Sessions not matched—your activities may be on different days than the planned sessions, or start workouts from your plan to link them. The % above compares completed workload so far to planned workload for the same period (same units).
            </div>
          )}
        </div>
      )}

      {/* Week Comparison */}
      {data.week_comparison && (
        <div className="instrument-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Week-over-Week</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${
                data.week_comparison.change_direction === 'increase' 
                  ? 'text-green-400' 
                  : data.week_comparison.change_direction === 'decrease'
                    ? 'text-red-400'
                    : 'text-white/60'
              }`}>
                {data.week_comparison.change_direction === 'increase' && '+'}
                {data.week_comparison.change_direction === 'decrease' && '-'}
                {Math.abs(data.week_comparison.change_percent)}%
              </span>
              <span className="text-xs text-white/40">
                ({Math.round(data.week_comparison.previous_week_total)} → {Math.round(data.week_comparison.current_week_total)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sport Breakdown */}
      <SportBreakdown breakdown={data.sport_breakdown} />

      <div aria-hidden="true" className="instrument-divider" />

      {/* Activity Timeline */}
      <ActivityTimeline 
        timeline={data.timeline} 
        focusDate={focusDate} 
        onSelectWorkout={onSelectWorkout}
      />
    </div>
  );
};

export default TrainingContextTab;

