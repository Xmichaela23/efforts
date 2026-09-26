import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
// ⛔ ONE VOCABULARY (stage 4). See `src/lib/discipline.ts`.
import { normalizeDiscipline } from '@/lib/discipline';
import { getDisciplineColorRgb } from '@/lib/context-utils';
import { supabase, ensureFreshSession } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative, { NextUp, Reading } from './SessionNarrative';
import { StrengthTestResult } from './StrengthTestResult';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';
import { GarminDerivedDataLine } from './ProviderAttribution';
import { useGarminDataPresence } from '@/hooks/useGarminDataPresence';
import { formatDuration } from '@/utils/workoutFormatting';
import AppleHealthSwimEnrichment from './AppleHealthSwimEnrichment';
import SessionZoneCards from './SessionZoneCards';

// Step 4b — this session's DISCIPLINE spine verdict, read from session_detail_v1.discipline_trend
// (which workout-detail reads from athlete_snapshot.state_trends_v1 — the SAME cache the STATE
// screen and coach read). The per-session screen shows the discipline's trend context without
// re-deriving it. needs_data renders as an honest "building" state, never a false direction.
function DisciplineTrendLine({ sd }: { sd: any }) {
  // ⛔ REMOVED 2026-09-04 (one reference per metric): `discipline_trend` is the Garmin 28/28 verdict, which State
  // no longer prints; the session screen may not print it either. The field stays on the contract, unread.
  void sd;
  return null;
  // eslint-disable-next-line no-unreachable
  const dt = sd?.discipline_trend;
  if (!dt) return null;
  const VERD: Record<string, { w: string; c: string; a: string }> = {
    improving: { w: 'improving', c: 'text-emerald-400', a: '↑' },
    holding: { w: 'holding', c: 'text-amber-300', a: '→' },
    sliding: { w: 'sliding', c: 'text-red-400', a: '↓' },
    needs_data: { w: 'building — need more sessions', c: 'text-label-secondary', a: '' },
  };
  const v = VERD[dt.verdict] || VERD.needs_data;
  const pct = dt.pct_change;
  // D-160 sign fix: pct_change is the RAW metric delta (classify.ts keeps it raw so the UI knows the
  // real direction of movement). For lower-is-better disciplines (swim/run pace) a faster session is
  // a NEGATIVE delta, so the engine flips only the VERDICT — leaving "↑ improving  −34.6%" on screen,
  // which reads as a contradiction. The verdict already encodes good/bad; show the magnitude signed by
  // the verdict (improving → +, sliding → −) so the number and the arrow always agree.
  // ⛔ THE SIGNED CHANGE IS THE SERVER'S (2026-09-16, Stage 4 session 3) — `signed_pct`, the same
  // `verdictSignedPct` rule State's rows read since 2026-09-15. D-160: the raw delta is negative when
  // a lower-is-better metric improves, so the magnitude is signed by what the VERDICT means and the
  // number and the arrow always agree. Three copies of that became one.
  const pctDisplay = (dt as { signed_pct?: string | null }).signed_pct ?? null;
  return (
    <div className="flex items-baseline gap-1.5 py-1 text-caption">
      <span className="text-label-secondary">{dt.discipline} trend</span>
      <span className={`inline-flex items-baseline gap-0.5 ${v.c}`}>{v.a && <span>{v.a}</span>}<span>{v.w}</span></span>
      {dt.verdict !== 'needs_data' && pctDisplay && <span className="text-label-secondary">{pctDisplay}</span>}
    </div>
  );
}

/**
 * ⛔ A RIDE'S TIMES (2026-09-26, Michael: "Garmin's three times, under Garmin's names, on every screen that shows a
 * ride's time"). `session_detail_v1.times` — Time, Moving Time, Elapsed Time, whichever the ride's source sent, the
 * same rows the Details tab prints from `display_metrics.times`; composed once on the server
 * (`_shared/session-detail/session-times.ts`) and printed here as sent. Same type as the tiles above.
 */
function SessionTimes({ rows }: { rows: Array<{ key: string; label: string; display: string }> }) {
  return (
    <div className="flex items-start justify-around w-full px-3 mb-3">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col items-center px-1 min-w-0">
          <div className="readout-num text-body whitespace-nowrap">{r.display}</div>
          <div className="readout-label text-caption uppercase text-center whitespace-nowrap">{r.label}</div>
        </div>
      ))}
    </div>
  );
}

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
  session_detail_v1?: Record<string, any> | null;
  /** True while `scope=session_detail` workout-detail request is in flight */
  sessionDetailLoading?: boolean;
  /** 2026-09-26: the heart-rate and power zone cards, moved from Details — true for the sessions Details drew them for. */
  showZones?: boolean;
};

/**
 * recompute-workout's own line for a failed tap (2026-09-18). When nothing came back from it, it did not answer.
 * server-word: the one case the server cannot word, because it never replied.
 */
function recomputeLine(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText);
    if (typeof j?.line === 'string' && j.line) return j.line;
  } catch { /* not JSON */ }
  return 'Analysis failed: the server did not answer.';
}

export default function MobileSummary({ planned, completed, session_detail_v1, sessionDetailLoading, hideTopAdherence, showZones }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
  /**
   * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md §3 — the four tiles (workload, execution,
   * duration, drift) are DERIVED from the session's device data, so the tab carries Garmin's
   * derived-data line under them (Garmin API Brand Guidelines v6.30.2025). The window here is this
   * one session plus the athlete's connection; an account with no Garmin data gets no line.
   */
  const garminDerivedRows = useMemo(() => (completed ? [completed] : []), [completed]);
  const garminDerived = useGarminDataPresence(garminDerivedRows);
  const { useImperial } = useAppContext();

  const sd = session_detail_v1;
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);

  const hasSessionDetail = !!sd;
  const noPlannedCompare = !planned && !sd?.plan_context?.planned_id;
  if (noPlannedCompare) {
    const typeMaybe = String((completed as any)?.type || '').toLowerCase();
    const allowCompletedOnly = (
      typeMaybe === 'strength' ||
      typeMaybe === 'run' || typeMaybe === 'running' ||
      typeMaybe === 'ride' || typeMaybe === 'cycling' || typeMaybe === 'bike' ||
      typeMaybe === 'swim' || typeMaybe === 'swimming'
    );
    if (!allowCompletedOnly) {
      // A walk has no plan read, but Details drew its heart-rate zones; they came here with the rest (2026-09-26).
      return (
        <>
          <div className="text-subhead text-label-secondary">No planned session to compare.</div>
          {showZones && completed ? <SessionZoneCards workoutData={completed} /> : null}
        </>
      );
    }
  }

  const type = String(sd?.type || (planned as any)?.type || (completed as any)?.type || '').toLowerCase();

  // "Failed" on screen (docs/WORKORDER-plumbing-2026-09-07.md §3): one plain line, with "Try again". Since
  // 2026-09-18 the line is the server's (`analysis_readout`, sent by workout-detail and get-week).
  const analysisFailure: string | null = (completed as any)?.analysis_readout?.line ?? null;

  useEffect(() => {
    setRecomputeError(null);
    setRecomputing(false);
  }, [completed]);

  const recomputeAnalysis = async () => {
    const workoutId = String(sd?.workout_id || (completed as any)?.id || '');
    if (!workoutId) return;

    try {
      setRecomputing(true);
      setRecomputeError(null);

      // ⛔ A STALE TOKEN IS A 401 ON THE SERVER (2026-09-07). Tokens live 60 minutes and the phone build does
      // not auto-refresh; `ensureFreshSession` (src/lib/supabase.ts) refreshes when expired or nearly so.
      await ensureFreshSession();
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) console.warn('[MobileSummary] recompute getSession:', sessionErr);
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Not signed in');
      }

      const res = await supabase.functions.invoke('recompute-workout', {
        body: { workout_id: workoutId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.error) {
        // Say what actually came back (2026-09-07). "Edge Function returned a non-2xx status code" hid a
        // 546 compute-limit death for six days. supabase-js keeps the Response on `error.context`.
        const ctx = (res.error as { context?: Response }).context;
        let detail = '';
        try { detail = ctx ? (await ctx.text()).slice(0, 2000) : ''; } catch { /* no body */ }
        // recompute-workout answers with `line`, the card's words for its error (2026-09-18). No body from it
        // means it did not answer at all.
        throw new Error(recomputeLine(detail));
      }

      const result = res.data as {
        ok: boolean;
        stale: boolean;
        steps: string[];
        error?: string;
        code?: string;
        line?: string;
      };

      if (result.ok) {
        try {
          window.dispatchEvent(new CustomEvent('workout-detail:invalidate'));
          window.dispatchEvent(new CustomEvent('workouts:invalidate'));
        } catch (e) {
          console.warn('[MobileSummary] recompute: invalidate dispatch failed:', e);
        }
        if (result.stale) {
          console.warn('[MobileSummary] recompute partial success, steps:', result.steps);
        }
      } else {
        throw new Error(recomputeLine(JSON.stringify(result)));
      }
    } catch (e: unknown) {
      setRecomputeError(typeof e === 'string' ? e : (e as Error)?.message || String(e));
    } finally {
      setRecomputing(false);
    }
  };

  // No interactive hydration path; assume data present during development

  // Strength and Mobility — show plan vs completed immediately; session_detail enriches RIR/adherence (may be slow).
  if (type === 'strength' || type === 'mobility') {
    // Q-097/Q-102 phase 2: a 1RM/baseline TEST renders as a test RESULT (per-lift e1RM + delta + outcome),
    // NOT the training table + execution/volume. It's measurement, not a session.
    if ((sd as any)?.is_test && (sd as any)?.test_result) {
      return (
        <div className="w-full space-y-2 p-3">
          {sessionDetailLoading && !sd && (
            <div className="text-caption text-label-secondary px-0.5" aria-live="polite">Loading test result…</div>
          )}
          <StrengthTestResult
            result={(sd as any).test_result}
            onRecompute={recomputeAnalysis}
            recomputing={recomputing}
            failureText={recomputeError || analysisFailure}
          />
          {(sd as any)?.next_session && <NextUp session={(sd as any).next_session} />}
        </div>
      );
    }
    return (
      // ⛔ THE PERFORMANCE TAB'S ACCENT, SET ONCE AT THE ROOT (2026-08-15, Michael: "apply to the
      // performance screens using each discipline's colour"). Everything below — the adherence
      // tiles, the interval table's column heads, the strength summary, SessionNarrative's section
      // labels — reads `--card-accent-rgb` through the `readout-label` / `readout-num` classes in
      // index.css. One variable, no prop threading, and the Performance tab therefore cannot
      // disagree with the Details tab's plate about what colour this workout is.
      <div
        className="w-full"
        style={{ ['--card-accent-rgb' as any]: getDisciplineColorRgb(normalizeDiscipline(type) || String(type || '')) }}
      >
        {sessionDetailLoading && !sd && (
          <div className="text-caption text-label-secondary px-3 pt-3" aria-live="polite">
            Loading performance analysis…
          </div>
        )}
        {/* Macro discipline trend removed from Performance — a macro verdict lives on State (single
            source of truth). Per-session context is the same-route efficiency line in SessionNarrative. */}
        {/* D-104: render INSIGHTS narrative ABOVE the exercise table for strength
            sessions. The strength branch was missing SessionNarrative entirely —
            D-102 (lift to ai_summary) + D-103 (remove silent 401 gate) made the
            narrative reliably reach session_detail_v1.narrative_text via the
            workout-detail → buildSessionDetailV1 → narrative_text chain, but the
            client never rendered it on strength; the exercise table started
            immediately with no coaching read above it. SessionNarrative is
            sport-agnostic (reads sd.narrative_text, sd.summary, etc.) and
            gracefully no-ops the run/ride-specific blocks when their fields are
            absent on strength session_detail_v1. */}
        {/* ⛔ D-338 — NO PLAN, NO PLAN NARRATIVE. This paragraph is written against the prescription
            ("Overhead Press ran lighter than prescribed", "Dips were skipped, leaving one of four
            planned exercises unfinished") and it is read off the STORED analysis, so it survived the
            session being detached and kept describing a plan the athlete is not on. Michael saw it
            2026-07-30 on a session whose every row already said the plan column was empty.
            The narrative is only shown when there is a plan to have been measured against — the same
            law the execution block above it now follows (D-035). */}
        {/* ⛔ THE STRENGTH NARRATIVE IS GONE (2026-07-30, Michael: *"we need to lose the narrative…
            we killed it for strength"*). D-338 gated it on having a plan; the gate was not the
            problem. The paragraph itself was.

            What it printed on a real, correctly-executed the previous program session:
              *"No RIR was logged, so effort proximity can't be confirmed… back squat ran about 27%
               under the prescribed weight… Box jumps haven't appeared in recent logged training and
               can make the legs feel heavier than expected."*

            Three claims, three faults, and every one is the protocol blindness the rest of today's
            work was spent closing:
              1. RIR is not collected on this protocol BY DESIGN (`usesRir: false`), so "can't be
                 confirmed" states a missing input as a shortcoming of the session.
              2. "27% under prescribed" compares a 55/65/75 RAMP against the top-set number. The
                 athlete lifted exactly what was written.
              3. The soreness line is speculation about tomorrow, dressed as a read of today.

            ⛔ AND IT IS THE WRONG SHAPE FOR THIS SCREEN. Performance answers "what did I just do" —
            the table, the all-out set, the rep record, all of it exact and server-computed. A block
            verdict belongs on State, which owns the trend and is protocol-aware. A prose paragraph
            re-deciding a session next to the facts is a second opinion with no authority
            (Constitution Law 4).

            ⚠️ SCOPE: strength only. Run, ride and swim keep theirs — they have real per-session
            signals (pace, HR, decoupling) that no table renders. */}
        <StrengthPerformanceSummary
          planned={planned}
          completed={completed}
          type={type as 'strength' | 'mobility'}
          sessionDetail={sd}
          onRecompute={recomputeAnalysis}
          recomputing={recomputing}
          recomputeError={recomputeError}
          analysisFailure={analysisFailure}
        />
        {/* NEXT moved to the bottom of the strength Performance tab (below the compare table) — the
            up-next session is context to glance at after reviewing the work, not above it. */}
        {(sd as any)?.next_session && (
          <div className="px-3 py-3 border-t border-white/[0.055]"><NextUp session={(sd as any).next_session} /></div>
        )}
      </div>
    );
  }

  // Endurance (run/ride/swim) — all data comes from sd (session_detail_v1)

  return (
    // ⛔ SECTIONED LIKE STATE'S CARDS (2026-09-12, Michael: "get it in line with state and today").
    // Section 1: the tiles and the Garmin line. Section 2: the session's readings (SessionNarrative),
    // divided by the same hairline LOAD, THIS WEEK and BODY use. Each section pads itself.
    <div className="w-full">
      {sessionDetailLoading && !hasSessionDetail && (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading performance data">
          <Loader2 className="h-6 w-6 animate-spin text-label-secondary" />
        </div>
      )}

      {(() => {
        const race = sd?.race;
        if (!race?.is_goal_race) return null;
        const actualS = race.actual_seconds ?? null;
        const projS = race.fitness_projection_seconds ?? null;
        const goalS = race.goal_time_seconds ?? null;
        const fmt = (s: number | null | undefined) =>
          s != null && Number.isFinite(s) && s > 0 ? formatDuration(s) : '—';
        return (
          <div className="w-full pt-2 pb-3">
            <div className="mb-1 text-center text-caption text-label-secondary uppercase tracking-widest">
              Goal race · {race.event_name}
            </div>
            <div className="flex items-start justify-center gap-8 text-center">
              {goalS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-subhead font-semibold text-label">{fmt(goalS)}</div>
                  <div className="text-caption text-label-secondary mt-0.5">Goal</div>
                </div>
              )}
              {projS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-subhead font-semibold text-label">
                    {race.fitness_projection_display ?? fmt(projS)}
                  </div>
                  <div className="text-caption text-label-secondary mt-0.5">Projected</div>
                </div>
              )}
              <div className="flex flex-col items-center">
                <div className="text-subhead font-semibold text-label">{fmt(actualS)}</div>
                <div className="text-caption text-label-secondary mt-0.5">Actual</div>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="pt-2 pb-1">
      {/* D-166 refinement: swims drop the top adherence header — it duplicated the green-dot
          Distance/Duration pills now inside the swim card (113% Duration was showing twice). */}
      <AdherenceChips
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence || !!sd?.race?.is_goal_race || type === 'swim'}
      />
      {/* THE RIDE'S TIMES (2026-09-26) — under the tiles and above the Garmin line; the source's own numbers. A copy of
          the session saved on the workout carries none (the rows are sent, never saved), so the Details reply's
          `display_metrics.times` — the same rows from the same row — stands in until this tab's own reply lands. */}
      {(() => {
        const rows = Array.isArray((sd as any)?.times) ? (sd as any).times : (completed as any)?.display_metrics?.times;
        return Array.isArray(rows) && rows.length > 0 ? <SessionTimes rows={rows} /> : null;
      })()}
      {/* Garmin API Brand Guidelines v6.30.2025 — derived-data attribution, verbatim, under the tiles.
          Not inside a tooltip or a collapsed section. */}
      {garminDerived ? <GarminDerivedDataLine className="px-3 pb-1" /> : null}
      </div>

      {/* Macro discipline trend removed from Performance (lives on State). Swim's in-card trend is a
          separate placement, deferred. */}

      {/* ⛔ "HEART RATE AT EASY POWER" IS GONE FROM THE RIDE PERFORMANCE TAB (2026-09-12, Michael: "too
          much emphasis unless per the book or per anything it should take priority" — nothing gives it
          that). The book gives the bike no heart-rate read: p172 makes power the intensity control and
          FTP the number; the 5% drift line (p107) is written for running. The field reads bike aerobic
          fitness as efficiency factor (TrainingPeaks: normalized power ÷ HR) and Pw:Hr decoupling, and
          the Drift tile above already carries the latter. State dropped the same bpm as its bike
          headline on 2026-09-03 (`StatePerformanceSection.tsx`, the deleted `AerobicSignal`), so this
          block's "feeds your bike read on State" had become a claim about a link State no longer leads
          with. ⚠️ `bike_fitness_v1.hr_at_band` is NOT removed: `bike-fitness.ts` still reads it for the
          secondary efficiency verdict behind the power lead. Only the display went. */}

      {/* D-167: pool-swim narrative RE-ENABLED. The swim analyzer now emits clean plain prose with the
          authoritative pace (verified on real data — no markdown title, 2:00/100yd, 50 m pool), so swims
          get INSIGHTS like run/ride and fill the dead space below the card. SessionNarrative also hosts
          the recompute control, so the separate D-164 pool-swim recompute button is removed (Q-064). */}
      <SessionNarrative
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        recomputing={recomputing}
        recomputeError={recomputeError}
        analysisFailure={analysisFailure}
        onRecompute={recomputeAnalysis}
        // The read comes first, the interval table is the evidence under it; Next stays at the very bottom
        // (Michael, 2026-09-07: "put this above intervals" · "leave next at the bottom").
        hideNextUp
        // This workout's discipline colours the Performance tab's readout labels — the same
        // SPORT_COLORS the Details tab's plate uses, so the two tabs of one workout agree.
        accentRgb={getDisciplineColorRgb(normalizeDiscipline(type) || String(type || ''))}
      />

      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      {/* Goal race: no segments table — summary times + debrief only */}
      {!sd?.race?.is_goal_race && (
        <EnduranceIntervalTable
          sessionDetail={sd}
          hasSessionDetail={hasSessionDetail}
          useImperial={useImperial}
          noPlannedCompare={noPlannedCompare}
          swimExtras={type === 'swim' ? (() => {
            const c: any = completed || {};
            let meta = c.workout_metadata;
            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
            meta = meta || {};
            const confirmed = Array.isArray(meta.swim_steps_equipment_confirmed) ? meta.swim_steps_equipment_confirmed : [];
            const unplanned = Array.isArray(meta.swim_equipment_unplanned) ? meta.swim_equipment_unplanned : [];
            const finsUsed = confirmed.some((e: any) => e?.used === true && String(e?.equipment || '').toLowerCase().includes('fin'))
              || unplanned.some((e: any) => String(e || '').toLowerCase().includes('fin'));
            return { poolLengthM: Number(c.pool_length) || null, lengths: Number(c.number_of_active_lengths) || null, finsUsed };
          })() : null}
        />
      )}
      {/* EFFORT AND TALK TEST (2026-09-14): the server's two rows, printed as sent. Talk test only on easy and
          long runs; effort on every run and ride with an RPE logged. */}
      {((sd as any)?.talk_test_row || (sd as any)?.effort_row) && (
        <div className="space-y-1.5 px-3 py-3 border-t border-white/[0.055]">
          {(sd as any)?.talk_test_row && <Reading label="Talk test" text={(sd as any).talk_test_row} />}
          {(sd as any)?.effort_row && <Reading label="Effort" text={(sd as any).effort_row} />}
        </div>
      )}
      {/* ZONES (2026-09-26, Michael): the heart-rate and power zone cards, moved from Details — under the
          session's own numbers and readings, above Next. */}
      {showZones && completed ? <SessionZoneCards workoutData={completed} /> : null}
      {/* NEXT sits last, after the interval table (Michael, 2026-09-07). */}
      {(sd as any)?.next_session && (
        <div className="px-3 py-3 border-t border-white/[0.055]"><NextUp session={(sd as any).next_session} /></div>
      )}
      {/* Swim "richer data — join the iOS beta" CTA REMOVED (2026-07-19, Michael) — a promo pitch on the
          swim screen; not wanted. The swim read is facts-only; we don't upsell on it. Component left in
          the tree (unrendered) for the cleanup sweep. */}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-label-secondary">Add‑ons</div>
            <div className="text-label space-y-1">
              {completed.addons.map((a:any, idx:number)=> (
                <div key={idx} className="flex items-center justify-between">
                  <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                  <span className="text-label-secondary">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


