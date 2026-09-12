import React from 'react';
import { GalaxyButton } from '@/components/ui/galaxy-button';
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
    weather?: { temperature_f?: number | null; display?: string | null } | null;
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
  /** The stored failure line ("Analysis failed at …" / "Analysis did not finish.") — plumbing §3. */
  analysisFailure?: string | null;
  onRecompute: () => void;
  recomputeDisabled?: boolean;
  /** When true, the NEXT/up-next block is NOT rendered inline — the caller renders <NextUp> elsewhere
   *  (strength Performance tab moves it to the bottom, below the compare table). */
  hideNextUp?: boolean;
  /** "R, G, B" for this workout's discipline — drives the readout label tint. Omit for off-white. */
  accentRgb?: string;
}

/**
 * One reading in State's row grammar (StateBodyBlock): the label in the muted 11 px lowercase voice,
 * the value at 13 px beside it. A fixed label column so the sentences align; long ones wrap under
 * themselves, never under the label.
 */
function Reading({ label, text }: { label: string; text: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-x-2.5">
      <span className="shrink-0 w-[92px] text-[11px] text-white/45 lowercase tracking-wide leading-snug">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-white/85 leading-snug">{text}</span>
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
    // Label ABOVE the text, matching the other labeled blocks on this screen. Beside-the-paragraph
    // (flex) left the "NEXT" label orphaned at the top-left of a multi-line prescription and read as
    // off-centered (Michael 2026-08-11).
    <Reading
      label="Next"
      text={(
        <>
          {dayName && <span className="text-white/55">{dayName} </span>}
          {session.name}
          {session.prescription && (
            <span className="text-white/55"> — {session.prescription}</span>
          )}
        </>
      )}
    />
  );
}

function isRaceReadinessShape(
  rr: NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'],
): rr is NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'] {
  return !!rr && typeof (rr as { verdict?: string }).verdict === 'string';
}

function RaceReadinessBlock({ rr }: { rr: NonNullable<SessionNarrativeProps['sessionDetail']>['race_readiness'] }) {
  if (!isRaceReadinessShape(rr) || !String(rr.headline || '').trim()) return null;
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
          <span className="readout-label text-[10px] font-medium uppercase tracking-wide">Race day</span>
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
  analysisFailure,
  onRecompute,
  recomputeDisabled,
  hideNextUp,
  accentRgb,
}: SessionNarrativeProps) {
  // "Failed" on screen (docs/WORKORDER-plumbing-2026-09-07.md §3). The tap's own error outranks the
  // stored line while it is fresh; "Try again" is the existing recompute tap. Plain words, no codes.
  const failureText = recomputeError || analysisFailure || null;
  const failureBlock = failureText ? (
    <div className="flex items-center justify-between gap-3 mb-1">
      <p className="text-sm text-red-300/90 m-0">{failureText}</p>
      <GalaxyButton
        variant="secondary"
        size="sm"
        onClick={onRecompute}
        disabled={recomputing || recomputeDisabled}
        className="shrink-0 text-xs"
        title="Run the analysis again"
      >
        {recomputing ? 'Trying…' : 'Try again'}
      </GalaxyButton>
    </div>
  ) : null;
  const summaryTitle = sd?.summary?.title || 'Insights';
  const summaryBullets = Array.isArray(sd?.summary?.bullets) ? sd!.summary!.bullets! : [];
  const narrativeText = (typeof sd?.narrative_text === 'string' && sd.narrative_text.trim()) || '';
  const raceDebriefText = (typeof sd?.race_debrief_text === 'string' && sd.race_debrief_text.trim()) || '';
  // ⛔ THE NARRATIVE NO LONGER RENDERS (see the block below), so it no longer COUNTS as content
  // either. It used to suppress the summary bullets and the technical rows — "show these only when
  // there is no paragraph" — and leaving that in would have left the section blank on exactly the
  // sessions the paragraph used to fill. `narrativeText` still resolves for anything that reads it.
  const hasNarrative = false;
  void narrativeText;
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
          <GalaxyButton
            variant="secondary"
            size="sm"
            onClick={onRecompute}
            disabled={recomputing || recomputeDisabled}
            className="text-xs"
            title="Generate analysis for this workout"
          >
            {recomputing ? 'Recomputing…' : 'Recompute analysis'}
          </GalaxyButton>
        </div>
        {failureBlock}
        <p className="text-sm text-gray-500 italic">
          {hasSessionDetail
            ? 'No insights available for this workout yet. Recompute analysis to refresh.'
            : 'No session insight contract found for this workout yet. Click "Recompute analysis" to generate it.'}
        </p>
      </div>
    );
  }

  return (
    // `--card-accent-rgb` scopes the readout typography below to THIS workout's discipline
    // (2026-08-15, Michael: "apply to the performance screens using each discipline's colour"), the
    // same variable the State plates and the logger cards read. Section labels then tint to the
    // sport with no prop threading. Falls back to the app's off-white when the caller sends none.
    // ⛔ A SECTION, NOT A CARD IN A CARD (2026-09-12). The Performance panel now wears State's bed
    // (UnifiedWorkoutView `getCardClass`), and State builds its sections with a hairline divider,
    // never a second card nested inside the first. This block used to be its own galaxy card with a
    // sport-coloured border sitting inside the panel; it is now the panel's next section, divided
    // from the tiles above by the same hairline State uses. The accent variable stays, for the
    // section labels' tint.
    <div
      className="px-3 py-3 space-y-2 border-t border-white/[0.055]"
      style={{
        ...(accentRgb ? { ['--card-accent-rgb' as any]: accentRgb } : {}),
        ['--card-accent-a' as any]: '0.22',
      }}
    >
      {noPlannedCompare && (
        <div className="text-xs text-gray-500 italic">
          {planLinkNote ?? 'No planned session to compare.'}
        </div>
      )}
      {/* ⛔ RECOMPUTE RIDES ON THE STAT LINE (2026-08-02, Michael: "can recompute be on the top right so
          it doesn't interfere with layout"). It used to own a full-width row of its own between the
          adherence chips and the first real content, which pushed everything down and read as a section
          heading. It is a maintenance control, not content: it belongs at the edge, sharing a line. */}
      {failureBlock}
      {(() => {
        // Stat line above INSIGHTS: distance · duration · temperature.
        // distance/duration from session_detail_v1.completed_totals; temperature
        // from session_detail_v1.weather (workouts.weather_data, same source as
        // the Details tab).
        const distM = sd?.completed_totals?.distance_m;
        const durS = sd?.completed_totals?.duration_s;
        // The server composes the temperature string (start → end when it moved). `temperature_f` is
        // the fallback for a session built before `display` existed.
        const tDisplay = sd?.weather?.display
          ?? (typeof sd?.weather?.temperature_f === 'number' ? `${sd.weather.temperature_f}°F` : null);
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
        if (tDisplay) parts.push(tDisplay);
        // ⛔ NO STANDING RECOMPUTE BUTTON (2026-09-12, Michael: "helpful for dev, not sure it's
        // necessary for users"). `failureBlock` still carries "Try again" when the stored analysis
        // failed, and the empty state above still offers it when there is no analysis at all. A
        // session whose analysis is fine shows nothing to press.
        // The section's header, in State's voice (BODY / THIS WEEK): 11 px, uppercase, tracked, the
        // sport's colour. It used to be a 14 px grey stat line with no relation to the screen next door.
        return parts.length > 0
          ? <div className="readout-label text-[11px] font-semibold tracking-[0.12em] uppercase">{parts.join(' · ')}</div>
          : null;
      })()}
      {hasRaceDebrief && (
        <div className="space-y-1.5">
          {raceDebriefSections ? (
            raceDebriefSections.map(({ label, text }) => (
              <Reading key={label} label={label} text={text} />
            ))
          ) : (
            <Reading label="Race debrief" text={raceDebriefText} />
          )}
        </div>
      )}
      {sd?.forward_context && (sd.forward_context.headline || sd.forward_context.body) && (
        <div>
          <span className="readout-label text-xs font-medium uppercase tracking-wide">
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
      {/**
        * ⛔ THE INSIGHTS PARAGRAPH IS GONE (2026-09-03, Michael: "cut the paragraph… still have that
        * nonsense paragraph").
        *
        * It was prose composed over numbers that are printed, measured, on the rows directly beneath it
        * — heart rate, efficiency, pacing, terrain. Every time it disagreed with one of them the
        * paragraph was the thing that was wrong: it announced "heart rate stayed in step with the
        * power" above a row reading 7.4%, and called an 0.98 intensity factor "an aerobic-base load".
        * Both were fixed at the source the same day and it still read as filler, because a sentence
        * restating the number under it adds nothing and can only ever be a second chance to be wrong.
        *
        * ⚠️ THE COMPOSER STAYS (`_shared/insights/*`, `workout_analysis.ai_summary`). It is not deleted
        * — the coach and the week read from it, and `narrativeText` still resolves. This is a RENDER
        * decision on the session screen only.
        */}
      {/* The INSIGHTS bullets are gone too (Michael, 2026-09-07: "kill insights"): the one line left, "HR 131 bpm", is already in the table above. */}
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
      {/* ⛔ ONE LIST, IN THE ORDER AN ATHLETE READS (Michael, 2026-09-07). The server sends two lists — the
          session rows (heart rate, efficiency, pacing, terrain) and the adherence insights (power adherence,
          interval execution, drift, intensity, plan context). They used to print in two blocks, so the two
          heart-rate readings sat four rows apart and the ride's effort came near the bottom. Merged here and
          ordered: what I did · did I hit the plan · what it says about my engine. Same order TrainingPeaks
          prints a ride in. Anything unlisted keeps its place after these. */}
      {(() => {
        const ORDER: Record<string, number> = {
          'GRADE-ADJUSTED PACE': 1, 'INTENSITY': 1, 'PACING': 2, 'TERRAIN': 3, 'CONDITIONS': 3,
          'POWER ADHERENCE': 4, 'INTERVAL EXECUTION': 5, 'PLAN CONTEXT': 6,
          'HEART RATE': 7, 'CARDIAC DRIFT': 8, 'EFFICIENCY': 9,
        };
        const rows: Array<{ label: string; value: string }> = [];
        const push = (rawLabel: unknown, rawValue: unknown) => {
          const value = String(rawValue ?? '');
          let label = String(rawLabel ?? '');
          if (label.toUpperCase() === 'CONDITIONS' && /\bft\b|gain|descent|downhill|uphill|elevation|grade|climb/i.test(value)) label = 'TERRAIN';
          if (label && value) rows.push({ label, value });
        };
        if (hasAnalysisDetails) analysisRows.slice(0, 8).forEach((r) => push(r.label, r.value));
        if (!hasNarrative && hasStructuredForRender) {
          technicalInsightsForRender.forEach((t) => push(t.label, t.value));
          if (hasPlanImpactForRender) push(planImpactLabel, planImpactText);
        }
        const rank = (l: string) => ORDER[l.toUpperCase()] ?? 50;
        const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.label) - rank(b.r.label) || a.i - b.i).map((x) => x.r);
        // ⛔ ONE ROW PER READING, STATE'S GRAMMAR (2026-09-12): the label in BODY's muted lowercase
        // voice on the left, the sentence at 13 px beside it, wrapping under itself when long. It was a
        // label on its own line over a paragraph, six times — twice the height for the same words.
        // ⚠️ Words unchanged; only the label's case is the label style's, as State's rows are.
        return ordered.length > 0 ? (
          <div className="space-y-1.5">
            {ordered.map((r, i) => (
              <Reading key={`${r.label}-${i}`} label={r.label} text={r.value} />
            ))}
          </div>
        ) : null;
      })()}
      {sd?.race_readiness && isRaceReadinessShape(sd.race_readiness) && (
        <RaceReadinessBlock rr={sd.race_readiness} />
      )}
      {/* NEXT sits last (Michael, 2026-09-07: it was in the middle of the ride's details). */}
      {!hideNextUp && nextSession && <NextUp session={nextSession} />}
    </div>
  );
}
