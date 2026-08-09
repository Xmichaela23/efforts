import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
// ⛔ ONE VOCABULARY (stage 4). See `src/lib/discipline.ts`.
import { normalizeDiscipline } from '@/lib/discipline';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative, { NextUp } from './SessionNarrative';
import { StrengthTestResult } from './StrengthTestResult';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';
import { formatDuration } from '@/utils/workoutFormatting';
import AppleHealthSwimEnrichment from './AppleHealthSwimEnrichment';

// Step 4b — this session's DISCIPLINE spine verdict, read from session_detail_v1.discipline_trend
// (which workout-detail reads from athlete_snapshot.state_trends_v1 — the SAME cache the STATE
// screen and coach read). The per-session screen shows the discipline's trend context without
// re-deriving it. needs_data renders as an honest "building" state, never a false direction.
function DisciplineTrendLine({ sd }: { sd: any }) {
  const dt = sd?.discipline_trend;
  if (!dt) return null;
  const VERD: Record<string, { w: string; c: string; a: string }> = {
    improving: { w: 'improving', c: 'text-emerald-400', a: '↑' },
    holding: { w: 'holding', c: 'text-amber-300', a: '→' },
    sliding: { w: 'sliding', c: 'text-red-400', a: '↓' },
    needs_data: { w: 'building — need more sessions', c: 'text-white/40', a: '' },
  };
  const v = VERD[dt.verdict] || VERD.needs_data;
  const pct = dt.pct_change;
  // D-160 sign fix: pct_change is the RAW metric delta (classify.ts keeps it raw so the UI knows the
  // real direction of movement). For lower-is-better disciplines (swim/run pace) a faster session is
  // a NEGATIVE delta, so the engine flips only the VERDICT — leaving "↑ improving  −34.6%" on screen,
  // which reads as a contradiction. The verdict already encodes good/bad; show the magnitude signed by
  // the verdict (improving → +, sliding → −) so the number and the arrow always agree.
  const pctDisplay = pct == null ? null
    : dt.verdict === 'improving' ? `+${Math.abs(pct)}%`
    : dt.verdict === 'sliding' ? `−${Math.abs(pct)}%`
    : `${pct > 0 ? '+' : ''}${pct}%`;
  return (
    <div className="flex items-baseline gap-1.5 py-1 text-[12px]">
      <span className="text-white/45">{dt.discipline} trend</span>
      <span className={`inline-flex items-baseline gap-0.5 ${v.c}`}>{v.a && <span>{v.a}</span>}<span>{v.w}</span></span>
      {dt.verdict !== 'needs_data' && pctDisplay && <span className="text-white/35">{pctDisplay}</span>}
    </div>
  );
}

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
  session_detail_v1?: Record<string, any> | null;
  /** True while `scope=session_detail` workout-detail request is in flight */
  sessionDetailLoading?: boolean;
};

export default function MobileSummary({ planned, completed, session_detail_v1, sessionDetailLoading, hideTopAdherence }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
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
      return (<div className="text-sm text-gray-600">No planned session to compare.</div>);
    }
  }

  const type = String(sd?.type || (planned as any)?.type || (completed as any)?.type || '').toLowerCase();

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
        throw new Error(res.error.message);
      }

      const result = res.data as {
        ok: boolean;
        stale: boolean;
        steps: string[];
        error?: string;
        code?: string;
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
        throw new Error(result.error ?? 'Recompute failed');
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
        <div className="w-full space-y-2">
          {sessionDetailLoading && !sd && (
            <div className="text-xs text-white/50 px-0.5" aria-live="polite">Loading test result…</div>
          )}
          <StrengthTestResult
            result={(sd as any).test_result}
            onRecompute={recomputeAnalysis}
            recomputing={recomputing}
          />
          {(sd as any)?.next_session && <NextUp session={(sd as any).next_session} />}
        </div>
      );
    }
    return (
      <div className="w-full space-y-2">
        {sessionDetailLoading && !sd && (
          <div className="text-xs text-white/50 px-0.5" aria-live="polite">
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

            What it printed on a real, correctly-executed 5/3/1 session:
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
        />
        {/* NEXT moved to the bottom of the strength Performance tab (below the compare table) — the
            up-next session is context to glance at after reviewing the work, not above it. */}
        {(sd as any)?.next_session && <NextUp session={(sd as any).next_session} />}
      </div>
    );
  }

  // Endurance (run/ride/swim) — all data comes from sd (session_detail_v1)

  return (
    <div className="w-full">
      {sessionDetailLoading && !hasSessionDetail && (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading performance data">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
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
            <div className="mb-1 text-center text-xs text-gray-400 uppercase tracking-widest">
              Goal race · {race.event_name}
            </div>
            <div className="flex items-start justify-center gap-8 text-center">
              {goalS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-sm font-semibold text-gray-100">{fmt(goalS)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Goal</div>
                </div>
              )}
              {projS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-sm font-semibold text-gray-100">
                    {race.fitness_projection_display ?? fmt(projS)}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Projected</div>
                </div>
              )}
              <div className="flex flex-col items-center">
                <div className="text-sm font-semibold text-gray-100">{fmt(actualS)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Actual</div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* D-166 refinement: swims drop the top adherence header — it duplicated the green-dot
          Distance/Duration pills now inside the swim card (113% Duration was showing twice). */}
      <AdherenceChips
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence || !!sd?.race?.is_goal_race || type === 'swim'}
      />

      {/* Macro discipline trend removed from Performance (lives on State). Swim's in-card trend is a
          separate placement, deferred. */}

      {/* Bike session-detail ← spine. The per-ride HR-at-power datapoint (bike_fitness_v1.hr_at_band)
          is the EXACT value the STATE efficiency trend is built from — surfacing it here connects the
          single ride to the same spine signal the dashboard reads (no re-derivation, one source). Only
          renders when the analyzer found ≥120s in the reference band; band source carries the honesty
          label (est(FTP) vs personal). Run/swim/strength already show their per-session substance
          (GAP pace, pace/100, e1RM); this brings bike to parity. */}
      {(() => {
        // ⛔ ONE VOCABULARY (stage 4) — was a private substring ladder. See `src/lib/discipline.ts`.
        const isRide = normalizeDiscipline(type) === 'ride';
        if (!isRide) return null;
        let wa: any = (completed as any)?.workout_analysis;
        if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { wa = null; } }
        const bf = wa?.bike_fitness_v1;
        if (!bf || !(Number(bf.hr_at_band) > 0)) return null;
        // ⛔ DO NOT SHOW A READING THE ENGINE THREW AWAY (2026-08-02, Michael: "why would you say 146 is
        // heart rate at easy power?"). On a hard ride it ISN'T. The in-band time is incidental — warmup,
        // descents, the sag between efforts — and heart rate there is dragged up by the work around it.
        // The STATE trend has always excluded such rides (`bikeEfficiencyRideEligible`); this card did
        // not know, so it printed the number under a label claiming it was measured at easy power AND
        // told the athlete it fed a read that had discarded it. Two lies in three lines.
        // The server decides (`counts_toward_trend`); undefined = a row analysed before the field
        // existed, and those keep rendering rather than vanishing from old sessions.
        if (bf.counts_toward_trend === false) return null;
        const src = bf.band_source === 'personal' ? 'personal'
          : bf.band_source === 'coggan_ftp' ? 'est (FTP)' : null;
        const band = (Number(bf.band_lo) > 0 && Number(bf.band_hi) > 0)
          ? `${Math.round(bf.band_lo)}–${Math.round(bf.band_hi)} W` : null;
        return (
          <div className="w-full pt-1 pb-3">
            {/* ⛔ SAME WORDS AS THE STATE BIKE ROW (2026-08-01). State's aerobic read says "138 bpm at
                easy power" and this is the single ride that feeds it — when the two screens named the
                same number differently ("Aerobic efficiency" here, "efficiency" there), a rider had no
                way to know they were looking at one measurement seen twice. The heading is now the
                plain sentence State uses; the band and its source stay, because THIS screen is where
                the per-ride provenance belongs. */}
            <div className="mb-1 text-center text-xs text-gray-400 uppercase tracking-widest">
              Heart rate at easy power
            </div>
            <div className="flex flex-col items-center">
              <div className="text-sm font-semibold text-gray-100">{bf.hr_at_band} bpm</div>
              {/* ⛔ "at Z2 power" READ AS A VERDICT ON THE RIDE (2026-08-02, Michael: "it should say the
                  zone the user was in — it says at zone 2"). It never meant that. It is the SAMPLING
                  WINDOW: this heart rate is measured only across the portions of the ride spent in the
                  aerobic power band. On a ride the engine classified THRESHOLD, a screen whose most
                  prominent label says "Z2" is telling the athlete the opposite of the truth. The band
                  stays — it is what makes the number comparable ride to ride — but it now reads as a
                  window, and the ride's real zone is named in Insights. */}
              <div className="text-[11px] text-gray-400 mt-0.5">
                measured{band ? ` in your ${band} range` : ' in your aerobic range'}{src ? ` · ${src}` : ''}
              </div>
              {/* ⛔ ONE IDEA PER LINE, AND NO SECOND "EASY" (2026-08-02, Michael: "this is confusing").
                  This block briefly carried "Above your easy ceiling of 131 bpm" as well — and "easy
                  POWER" (a watts band) sitting two lines from "easy CEILING" (a heart-rate limit) is the
                  same word meaning two different things on one card. The ceiling belongs to the Easy
                  CHIP, which is where the ride is judged; this block is not a judgement at all. It is one
                  reading, tracked over time: the heart rate it costs you to ride the same watts. Lower
                  is fitter. Say that, and stop. */}
              <div className="text-[11px] text-gray-500 mt-0.5">
                Lower over time means fitter — this feeds your bike read on State
              </div>
            </div>
          </div>
        );
      })()}


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
      {/* Pool / Lengths / fins moved INTO the unified swim card (D-166, PoolSwimOverall). */}

      {/* D-167: pool-swim narrative RE-ENABLED. The swim analyzer now emits clean plain prose with the
          authoritative pace (verified on real data — no markdown title, 2:00/100yd, 50 m pool), so swims
          get INSIGHTS like run/ride and fill the dead space below the card. SessionNarrative also hosts
          the recompute control, so the separate D-164 pool-swim recompute button is removed (Q-064). */}
      <SessionNarrative
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        planLinkNote={!planned ? 'No plan session linked.' : null}
        recomputing={recomputing}
        recomputeError={recomputeError}
        onRecompute={recomputeAnalysis}
      />

      {/* Swim "richer data — join the iOS beta" CTA REMOVED (2026-07-19, Michael) — a promo pitch on the
          swim screen; not wanted. The swim read is facts-only; we don't upsell on it. Component left in
          the tree (unrendered) for the cleanup sweep. */}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-gray-800">Add‑ons</div>
            <div className="text-gray-900 space-y-1">
              {completed.addons.map((a:any, idx:number)=> (
                <div key={idx} className="flex items-center justify-between">
                  <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                  <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


