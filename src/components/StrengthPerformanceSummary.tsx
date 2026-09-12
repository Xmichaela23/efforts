import React, { useEffect, useState } from 'react';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { Pencil } from 'lucide-react';
import StrengthCompareTable, { type StrengthSlot } from './StrengthCompareTable';
import { useAppContext } from '@/contexts/AppContext';
// The session clock's display + parse rules, shared with the logger so the number that ticks in the
// header and the number that reads back here can never format or validate differently.
import { MAX_SESSION_MINUTES, formatSessionMinutes, parseEditedMinutes } from '@/lib/strength-session-clock';
// ⛔ SLICE b — the courtesy echo. Same hook, same component, same undo as State; see that hook's
// header for why there is exactly one reader.
import { useStrengthCalibration } from '@/hooks/useStrengthCalibration';
import StrengthCalibrationNotice from '@/components/StrengthCalibrationNotice';

interface StrengthPerformanceSummaryProps {
  /** Unused by this screen since the rows moved to `session_detail_v1` (2026-09-10); still passed. */
  planned: any | null;
  completed: any | null;
  type: 'strength' | 'mobility';
  sessionDetail?: Record<string, any> | null;
  onRecompute?: () => Promise<void>;
  recomputing?: boolean;
  recomputeError?: string | null;
  /** The stored failure line ("Analysis failed at …" / "Analysis did not finish.") — plumbing §3. */
  analysisFailure?: string | null;
}

/**
 * ═══ THE STRENGTH PERFORMANCE TAB READS session_detail_v1 AND COMPUTES NOTHING (2026-09-10) ══════
 *
 * Audit H-S11–H-S14. This screen used to rebuild the planned exercises from `computed.steps` (turning
 * a planned "4-6" into 5), parse the logged sets, count "Completed X of Y" with its own name matcher,
 * re-home the server's swap pairings by containment, and total sets and reps counting any set with
 * reps, ticked or not. The table below paired rows and averaged RIR on its own too.
 *
 * ⛔ ALL OF IT IS NOW THE SERVER'S: `strength_slots` (the rows, paired by the analyzer's matcher),
 * `strength_counts` (the X of Y) and `strength_totals` (the tiles). A set counts when it was ticked.
 */
export default function StrengthPerformanceSummary({ completed, sessionDetail, onRecompute, recomputing, recomputeError, analysisFailure }: StrengthPerformanceSummaryProps) {
  // ⛔ SLICE b — the calibration read, unconditional so the hook list is stable. It self-silences on
  // any plan that is not a strength block, and the notice renders nothing when no event is standing.
  const calibration = useStrengthCalibration(true);
  // ── SESSION DURATION, AND IT IS EDITABLE ─────────────────────────────────────────────────────
  //
  // The EDIT belongs here rather than in the live logger — mid-session the clock is the truth and a
  // manual override would immediately be overwritten by the next tick. After the save, the athlete
  // is the truth.
  const { updateWorkout } = useAppContext();
  const savedDurationMin = Number(completed?.duration) || 0;
  // Local mirror so the tile shows the corrected number immediately; `completed` is refetched by the
  // parent on its own schedule and would otherwise snap back to the old value for a beat.
  const [durationMin, setDurationMin] = useState<number>(savedDurationMin);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState('');
  const [durationSaving, setDurationSaving] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);
  // Follow the row when the parent hands us a different workout (or a refetch of this one), but not
  // while an edit is open — that would yank the field out from under the athlete mid-type.
  useEffect(() => {
    if (!editingDuration) setDurationMin(savedDurationMin);
  }, [savedDurationMin, editingDuration]);

  const slots: StrengthSlot[] | null = Array.isArray(sessionDetail?.strength_slots) ? sessionDetail!.strength_slots : null;
  const counts = (sessionDetail?.strength_counts ?? null) as { exercises_completed: number; exercises_planned: number } | null;
  const totals = (sessionDetail?.strength_totals ?? null) as { sets_completed: number; reps_completed: number; volume_lb: number } | null;
  // The all-out set + the block it belonged to — both server-computed, rendered verbatim.
  const allOut = sessionDetail?.strength_all_out ?? null;
  const allOutReason = sessionDetail?.strength_all_out_reason ?? null;
  const block = sessionDetail?.block ?? null;
  // ── WHAT BLOCK THIS SESSION BELONGED TO (Q-230 / D-339, wired 2026-08-01) ─────────────────────
  // ⚠️ Every piece is optional: no plan link → no card → nothing renders. A week that the plan does
  // not place prints "week 3 of 12" with no word, and a card with no block length prints "week 3".
  const blockLine = (() => {
    if (!block) return null;
    const week = block.week_index ?? null;
    if (week == null) return null;
    const weeks = block.block_weeks ?? null;
    /**
     * ⛔ THE PHASE WORD IS STRIPPED HERE TOO (2026-08-29) — same removal as the State row, same
     * reason: `PHASE_NAME`'s vocabulary is the previous program's block shape, and none of those words
     * is Viada's. "week 1 of 12" is a position and stays.
     */
    return weeks != null && weeks > 0 ? `week ${week} of ${weeks}` : `week ${week}`;
  })();
  const workoutId = sessionDetail?.workout_id ?? (completed as any)?.id ?? null;
  // D-095: per-exercise prior-session lookup populated by workout-detail, keyed by `canonicalize`;
  // each row carries its own `previous_key`.
  const previousByExercise = (sessionDetail?.previous_strength_by_exercise as
    Record<string, { date: string; days_ago: number; sets: any[] }> | null
    | undefined) ?? null;

  // Q-181: declared substitutions. The server already decided whether each one is worth saying —
  // an IN-SLOT swap comes back with note:null (nothing was missed; not news). We render only the
  // sentences it chose to speak, verbatim. The client does not re-decide. (Law 4.)
  const execSubstitutionNotes: string[] = (() => {
    const subs = sessionDetail?.execution?.substitutions;
    if (!Array.isArray(subs)) return [];
    return subs
      .map((s: { note?: string | null }) => (typeof s?.note === 'string' ? s.note.trim() : ''))
      .filter((n: string) => n.length > 0);
  })();

  const commitDuration = async () => {
    const parsed = parseEditedMinutes(durationDraft);
    if (parsed === null) {
      setDurationError(`Enter whole minutes, 1 to ${MAX_SESSION_MINUTES}.`);
      return;
    }
    if (!workoutId) {
      setDurationError('This session has no id to save against.');
      return;
    }
    if (parsed === durationMin) { setEditingDuration(false); setDurationError(null); return; }
    setDurationSaving(true);
    setDurationError(null);
    try {
      await updateWorkout(String(workoutId), { duration: parsed });
      setDurationMin(parsed);
      setEditingDuration(false);
      // The analyzer stamps `execution_summary.session_duration` from this column, so a correction
      // only reaches it on the next recompute. Ask for one when the screen offers it.
      void onRecompute?.();
    } catch {
      // Keep the field open holding what was typed — a failed write must not look like a save.
      setDurationError('Could not save. Try again.');
    } finally {
      setDurationSaving(false);
    }
  };

  return (
    // space-y-3, not 4 (2026-09-12, Michael: "a lot of dead space up top"). The block line, the
    // count row and the all-out line each stood a full 16 px apart before the table began.
    <div className="space-y-3">
      {/* THE BLOCK THIS SESSION BELONGED TO — one quiet line above the numbers it frames, so a light
          week reads as a light week instead of as an under-performed one. */}
      {blockLine && (
        <div className="text-[11px] text-white/40">
          {block?.plan_name ? `${block.plan_name} · ${blockLine}` : blockLine}
        </div>
      )}
      {/* ═══ D-338 — NO EXECUTION PERCENTAGE ON A STRENGTH SESSION. What replaces it is a FACT: how many
          of the plan's slots were filled. ⛔ AND NOTHING AT ALL WHEN THERE IS NO PLAN (D-035) —
          `strength_counts` is null then. */}
      {/* ⛔ NO RECOMPUTE BUTTON UNLESS THE ANALYSIS FAILED (2026-09-12, Michael: "Recompute has been
          helpful for dev, not sure it's necessary for users"). It sat at the top of every lift as a
          standing control. A stored analysis that is fine has nothing to recompute; one that failed
          says so in the block below, with "Try again" — that is the athlete's path. The dev path is
          the calendar's re-analyze. `onRecompute` stays wired for that block. */}
      {counts && counts.exercises_planned > 0 && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="readout-label text-xs font-medium uppercase tracking-wide">Completed</span>
            <span className="text-lg font-semibold text-white">
              {counts.exercises_completed} of {counts.exercises_planned}
            </span>
            <span className="text-xs text-gray-400">· {counts.exercises_planned === 1 ? 'exercise' : 'exercises'}</span>
          </div>
          {/* Q-181 — THE SWAP RECEIPT, deterministic and server-written. An IN-SLOT swap renders nothing. */}
          {execSubstitutionNotes.map((note, i) => (
            <p key={i} className="text-sm text-white/80 mt-1.5 leading-snug">{note}</p>
          ))}
        </div>
      )}
      {/* "Failed" on screen (plumbing §3): the tap's own error outranks the stored line while fresh. */}
      {(recomputeError || analysisFailure) && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs text-rose-300/90 m-0">{recomputeError || analysisFailure}</p>
          {onRecompute && (
            <GalaxyButton variant="secondary" size="sm" onClick={onRecompute} disabled={recomputing} className="shrink-0 text-xs" title="Run the analysis again">
              {recomputing ? 'Trying…' : 'Try again'}
            </GalaxyButton>
          )}
        </div>
      )}
      {/* ── THE ALL-OUT SET (2026-07-30) — server-computed, rendered verbatim. ⚠️ When the panel is
          empty it SAYS SO. */}
      {Array.isArray(allOut) && allOut.length === 0 && allOutReason && (
        <div className="text-[12px] text-white/40">
          {allOutReason === 'session_had_no_all_out_set'
            ? 'No all-out set on this session.'
            : allOutReason === 'no_reps_on_all_out_set'
              ? 'The all-out set has no reps logged.'
              : 'No planned session to read the all-out set from.'}
        </div>
      )}
      {Array.isArray(allOut) && allOut.length > 0 && (
        <div className="galaxy-card mt-3 mb-1 rounded-xl border border-strength/25 p-3" style={{ ['--card-accent-a' as any]: '0.20' }}>
          <div className="readout-label text-[11px] uppercase tracking-wider mb-2">All-out set</div>
          {allOut.map((a: any, i: number) => (
            <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
              <div className="text-sm text-white/90">
                <span className="text-white/60">{a.name}</span>{' '}
                <span className="tabular-nums font-semibold">{a.weight} lb × {a.reps}</span>
              </div>
              {/* ⛔ STRONG/HEVY-CLEAN (2026-08-11) — a rep record is a "Rep PR" badge and nothing else. */}
              {a.is_rep_record && (
                <div className="text-[13px] mt-0.5">
                  {/* Strength orange, not green — green means bike (Michael 2026-08-15). */}
                  <span className="text-strength font-medium">Rep PR</span>
                </div>
              )}
              <div className="text-[12px] text-white/50 mt-1 tabular-nums">
                Estimated max {a.estimated_1rm} lb
              </div>
            </div>
          ))}
          {/* The 95% week is the one that moves the bar, whatever else is on screen. */}
          {block?.is_measurement_week === true && (
            <p className="text-[12px] text-white/55 mt-2 leading-snug">
              This is the set that sets your next cycle's weight.
            </p>
          )}
          {/* ⛔ THE COURTESY ECHO — SLICE b. The same line State carries, routing to the same undo. */}
          <StrengthCalibrationNotice
            lifts={calibration.byLift}
            undo={calibration.undo}
            variant="echo"
          />
        </div>
      )}
      <StrengthCompareTable
        slots={slots}
        completedWorkoutRaw={completed}
        previousByExercise={previousByExercise}
        workoutId={workoutId}
        onAdjustmentSaved={() => {
          window.dispatchEvent(new CustomEvent('plan:adjusted'));
          onRecompute?.();
        }}
      />
      {totals && (totals.sets_completed > 0 || totals.volume_lb > 0) && (
        <>
        <div className="grid grid-cols-4 gap-2 pt-3 mt-1 border-t border-white/10 text-center">
          <div>
            <div className="text-lg font-semibold text-white">{totals.sets_completed}</div>
            <div className="text-[11px] text-white/50">Total Sets</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totals.reps_completed}</div>
            <div className="text-[11px] text-white/50">Total Reps</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totals.volume_lb.toLocaleString()}</div>
            <div className="text-[11px] text-white/50">Volume (lbs)</div>
          </div>
          {/* DURATION — the fourth tile, and the only editable one. It reads "—" on sessions logged
              before the clock existed, and the edit is how those get a number at all. */}
          <div>
            {editingDuration ? (
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                disabled={durationSaving}
                value={durationDraft}
                onChange={(e) => { setDurationDraft(e.target.value); setDurationError(null); }}
                onBlur={() => { void commitDuration(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
                  if (e.key === 'Escape') { setEditingDuration(false); setDurationError(null); }
                }}
                className="w-full bg-white/[0.10] border border-white/25 rounded-md px-1 py-0.5 text-lg font-semibold text-white text-center tabular-nums outline-none focus:border-white/50"
                aria-label="Session duration in minutes"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDurationDraft(durationMin > 0 ? String(durationMin) : '');
                  setDurationError(null);
                  setEditingDuration(true);
                }}
                className="relative w-full text-lg font-semibold text-white hover:text-white/80"
                aria-label={durationMin > 0 ? `Session duration ${durationMin} minutes, edit` : 'Add session duration'}
              >
                {formatSessionMinutes(durationMin)}
                <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
              </button>
            )}
            <div className="text-[11px] text-white/50">{editingDuration ? 'Minutes' : 'Duration'}</div>
          </div>
        </div>
        {durationError && (
          <div className="text-[11px] text-amber-300/90 text-right">{durationError}</div>
        )}
        </>
      )}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="text-sm text-gray-700">
          <div className="font-medium mb-1">Add‑ons</div>
          {completed.addons.map((a:any, idx:number)=> (
            <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
              <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
              <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
