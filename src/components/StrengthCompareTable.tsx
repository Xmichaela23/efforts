import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessionDetailV1 } from '@shared/session-detail/types.ts';

export interface StrengthSet {
  reps?: number;
  /** The plan's own words for a range ("6-12") — never a midpoint. */
  reps_text?: string;
  duration_seconds?: number;
  weight: number;
  /** D-094: qualitative weight label (e.g. "Bodyweight", "Heavy barbell", "Band")
   *  surfaced when the planned weight is a non-numeric string. Rendered in place
   *  of the lb-suffixed number. Null/undefined for numeric weights. */
  weight_display?: string;
  rir?: number;
  completed?: boolean;
}

/** One row of the table — `session_detail_v1.strength_slots[n]`. */
export type StrengthSlot = NonNullable<SessionDetailV1['strength_slots']>[number];

/**
 * Lowercase, strip (Left)/(Right), collapse spaces. Used ONLY to find the logged exercise an edit
 * writes back to; it pairs nothing.
 */
function normalizeName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s*\((?:left|right)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** D-095: per-exercise prior-session payload from workout-detail, keyed by `canonicalize`. */
export type PreviousStrengthByExercise = Record<string, {
  date: string;
  days_ago: number;
  sets: StrengthSet[];
}>;

/** D-349: server-priced volume load. */
export type StrengthVolumePayload = {
  planned: Array<{ name: string; volume_lb: number }>;
  completed: Array<{ name: string; volume_lb: number }>;
  planned_total_lb: number;
  completed_total_lb: number;
  bodyweight_lb: number | null;
};

interface StrengthCompareTableProps {
  /**
   * ⛔ THE ROWS ARE THE SERVER'S (2026-09-10, audit H-S11 / H-S12 / H-S13) — `session_detail_v1.strength_slots`,
   * paired by `matchExercises`, the matcher the analyzer scores with. This table used to pair planned
   * and logged rows with its own name matcher, average RIR with its own rule, sum reps and volume
   * deltas, and print a planned "4-6" as 5. It now draws what it is sent. Absent → no rows.
   */
  slots?: StrengthSlot[] | null;
  completedWorkoutRaw?: any;
  previousByExercise?: PreviousStrengthByExercise | null;
  workoutId?: string | null;
  onAdjustmentSaved?: () => void;
}

// Format an ISO date-only string ("2026-05-18") as a short, self-evident label ("May 18").
// Parsed by parts (not new Date()) so a date-only string never shifts a day across timezones.
const PREV_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatPrevDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return null;
  const month = PREV_MONTHS[parseInt(m[2], 10) - 1];
  return month ? `${month} ${parseInt(m[3], 10)}` : null;
}

export default function StrengthCompareTable({ slots, completedWorkoutRaw, previousByExercise, workoutId, onAdjustmentSaved }: StrengthCompareTableProps){
  // editingSet: { exerciseName, setIndex } — which completed set is being edited inline
  const [editingSet, setEditingSet] = useState<{ exerciseName: string; setIndex: number } | null>(null);
  const [editFields, setEditFields] = useState<{ reps: string; weight: string; rir: string; resistance: string }>({ reps: '', weight: '', rir: '', resistance: '' });
  const [savingSet, setSavingSet] = useState(false);

  const startEditSet = (exerciseName: string, setIndex: number, set: StrengthSet) => {
    setEditingSet({ exerciseName, setIndex });
    setEditFields({
      reps: set.reps != null ? String(set.reps) : '',
      weight: set.weight != null ? String(set.weight) : '',
      rir: set.rir != null ? String(set.rir) : '',
      resistance: (set as any).resistance_level != null ? String((set as any).resistance_level) : '',
    });
  };

  const cancelEditSet = () => {
    setEditingSet(null);
    setEditFields({ reps: '', weight: '', rir: '', resistance: '' });
  };

  const saveEditSet = async () => {
    if (!editingSet || !completedWorkoutRaw?.id) return;
    setSavingSet(true);
    try {
      const exKey = editingSet.exerciseName;
      const setIdx = editingSet.setIndex;
      const raw = completedWorkoutRaw;
      const type = raw?.type?.toLowerCase?.() ?? 'strength';
      const field = type === 'mobility' ? 'mobility_exercises' : 'strength_exercises';

      // Parse current exercises
      let exercises: any[] = [];
      try {
        const val = raw[field];
        exercises = Array.isArray(val) ? val : JSON.parse(val || '[]');
      } catch { exercises = []; }

      // Find the LOGGED exercise by name (case-insensitive) — the row's `executed_name`, so an edit on
      // a swapped row writes to what was actually done.
      const exIdx = exercises.findIndex((e: any) =>
        normalizeName(e.name) === normalizeName(exKey)
      );
      if (exIdx === -1) return;

      const sets: any[] = Array.isArray(exercises[exIdx].sets) ? [...exercises[exIdx].sets] : [];
      if (setIdx >= sets.length) return;

      const updated = { ...sets[setIdx] };
      if (editFields.reps !== '') updated.reps = parseInt(editFields.reps, 10);
      if (editFields.weight !== '') updated.weight = parseFloat(editFields.weight);
      if (editFields.rir !== '') updated.rir = parseFloat(editFields.rir);
      // Band assist (help lb) — editable on assist-capable moves so a mis-logged band is correctable.
      if (editFields.resistance !== '') updated.resistance_level = parseFloat(editFields.resistance);
      sets[setIdx] = updated;

      const updatedExercises = exercises.map((e: any, i: number) =>
        i === exIdx ? { ...e, sets } : e
      );

      await supabase
        .from('workouts')
        .update({ [field]: updatedExercises })
        .eq('id', raw.id);

      cancelEditSet();
      onAdjustmentSaved?.();
    } catch (e) {
      console.error('saveEditSet error:', e);
    } finally {
      setSavingSet(false);
    }
  };

  const rows = Array.isArray(slots) ? slots : [];

  return (
    <div>
      {/* ⛔ THE EDIT HINT IS GONE (2026-07-30, Michael). It sat above every strength session, in
          amber, permanently — instructions for a control that is already visible on every row. */}

      {rows.map((r, i)=> {
        const previousEntry = previousByExercise?.[r.previous_key] ?? null;
        const previousSets: StrengthSet[] = Array.isArray(previousEntry?.sets) ? previousEntry!.sets : [];
        const previousDate = previousEntry?.date ?? null;
        const previousDaysAgo = typeof previousEntry?.days_ago === 'number' ? previousEntry!.days_ago : null;
        const hasPrevious = previousSets.length > 0;
        // ⛔ A ROW WITH A REP TOTAL HAS NO PLANNED COLUMN — there is no per-set plan to put in it; the
        // prescription is on the header line (`target_label`).
        const totalRow = r.reps_target != null;
        const plannedSets = r.planned_sets as StrengthSet[];
        const completedSets = r.completed_sets as unknown as StrengthSet[];
        // ⛔ THE PREVIOUS SESSION DOES NOT GET TO INVENT SET ROWS: the row count is THIS session — what
        // was asked for, or what was done, whichever is longer.
        const maxLen = Math.max(plannedSets.length, completedSets.length);
        const pairs = Array.from({ length: maxLen }, (_, idx) => ({
          planned: plannedSets[idx],
          completed: completedSets[idx],
          previous: previousSets[idx],
        }));

        return (
          // ⛔ ONE SECTION PER LIFT (2026-09-12): State's hairline and padding, so the lifts read as
          // LOAD / THIS WEEK / BODY do — one instrument, sectioned — instead of blocks that ran together.
          <div key={i} className="px-3 py-3 border-t border-white/[0.055] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-footnote font-medium text-white">{r.name}</span>
                {/* ⛔ THE SUBSTITUTE IS TITLE TEXT, NOT AN ANNOTATION (2026-08-02, Michael). */}
                {r.status === 'swapped' && r.executed_name && (
                  <span className="text-footnote font-medium text-white">
                    <span className="text-label-secondary">→ </span>{r.executed_name}
                  </span>
                )}
                {r.status === 'not_logged' && r.status_label && (
                  <span className="text-caption text-label-secondary uppercase tracking-wide">{r.status_label}</span>
                )}
                {/* ⛔ THE BOOK'S WORD FOR THE SLOT — Maximal effort / Dynamic effort / Hypertrophy / Skill
                    (Michael, 2026-09-12), the same words Today's cards print. Composed by
                    `session-detail/strength-slots.ts` at read time; the phone prints it. */}
                {r.intent_word && (
                  <span className="text-caption text-label-secondary uppercase tracking-wide">{r.intent_word}</span>
                )}
                {r.status === 'unplanned' && r.status_label && (
                  <span className="text-caption text-label-secondary uppercase tracking-wide">{r.status_label}</span>
                )}
                {/* THE PRESCRIPTION, ON THE ROW IT BELONGS TO — a rep total or a band, "by feel". It says
                    "Planned", because nothing else on this row does (2026-08-02, Michael). */}
                {r.target_label && (
                  <span className="text-caption text-label-secondary">
                    <span className="text-label-secondary">Planned </span>{r.target_label}
                  </span>
                )}
              </div>
              {/* THE THREE WORDS — how the top set felt (D-338). Blank stays blank. */}
              {r.difficulty_word && (
                <span className="text-caption text-label-secondary">{r.difficulty_word}</span>
              )}
              {/* RIR — the analyzer's average against the target, when both exist. */}
              {r.target_rir != null && r.avg_rir != null && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-footnote shrink-0 ${
                  r.rir_concern ? 'bg-amber-500/15' : 'bg-white/5'
                }`}>
                  <span className={`font-semibold ${r.rir_concern ? 'text-amber-400' : 'text-white'}`}>
                    {r.avg_rir.toFixed(1)}
                  </span>
                  <span className="text-label-secondary">/</span>
                  <span className="font-semibold text-label-secondary">{r.target_rir}</span>
                  <span className="text-label-secondary text-caption ml-1">RIR</span>
                </div>
              )}
            </div>
            {r.rir_line && (
              <p className={`text-caption mb-1 ${r.rir_concern ? 'text-amber-400' : r.rir_verdict === 'too_easy' ? 'text-sky-400' : 'text-label-secondary'}`}>
                {r.rir_line}
              </p>
            )}
            {/* ⛔ NO ROWS, NO COLUMN HEADERS. A lift that was never logged used to draw
                "Set · Planned · Completed" over empty space. */}
            {pairs.length > 0 && (
            // Column heads in State's label voice: 11 px, uppercase, tracked, muted.
            <div className="grid grid-cols-12 gap-x-2 text-caption uppercase tracking-wide text-label-secondary border-b border-white/10 pb-1">
              <div className="col-span-2">Set</div>
              {totalRow ? (
                hasPrevious ? (
                  <>
                    <div className="col-span-4" title={previousDate ? `${previousDate}${previousDaysAgo != null ? ` · ${previousDaysAgo} days ago` : ''}` : undefined}>
                      Previous{formatPrevDate(previousDate) ? <span className="text-label-secondary font-normal"> · {formatPrevDate(previousDate)}</span> : (previousDaysAgo != null ? <span className="text-label-secondary font-normal"> · {previousDaysAgo}d</span> : null)}
                    </div>
                    <div className="col-span-5">Completed</div>
                  </>
                ) : (
                  <div className="col-span-9">Completed</div>
                )
              ) : hasPrevious ? (
                <>
                  <div className="col-span-3" title={previousDate ? `${previousDate}${previousDaysAgo != null ? ` · ${previousDaysAgo} days ago` : ''}` : undefined}>
                    Previous{formatPrevDate(previousDate) ? <span className="text-label-secondary font-normal"> · {formatPrevDate(previousDate)}</span> : (previousDaysAgo != null ? <span className="text-label-secondary font-normal"> · {previousDaysAgo}d</span> : null)}
                  </div>
                  <div className="col-span-3">Planned</div>
                  <div className="col-span-4">Completed</div>
                </>
              ) : (
                <>
                  <div className="col-span-5">Planned</div>
                  <div className="col-span-5">Completed</div>
                </>
              )}
            </div>
            )}
            <div className="space-y-1">
              {pairs.map((pair, idx) => {
                const p = pair.planned as StrengthSet | undefined;
                const c = pair.completed as StrengthSet | undefined;
                // The set's own place in the saved row — the edit writes there, not at the drawn index.
                const editIndex = typeof (c as any)?.set_index === 'number' ? (c as any).set_index as number : idx;
                const editName = r.executed_name ?? r.name;
                const formatSeconds = (s: number) => {
                  const mins = Math.floor(s / 60);
                  const secs = s % 60;
                  return mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${s}s`;
                };
                const fmt = (s?: StrengthSet, isBw?: boolean, showRir?: boolean) => {
                  if (!s) return '—';
                  const hasNumericContent = !!(s.reps || s.reps_text || s.duration_seconds || s.weight);
                  const hasQualitativeWeight = !!s.weight_display;
                  const hasRirSignal = showRir && typeof s.rir === 'number';
                  if (!hasNumericContent && !hasQualitativeWeight && !hasRirSignal) return '—';
                  const rirTxt = showRir && typeof s.rir === 'number' ? ` (RIR ${s.rir})` : '';
                  // ⛔ THE WEIGHT ARRIVES AS TEXT, IN THE ATHLETE'S OWN UNIT (2026-09-16, Stage 4 session 3).
                  // This rounded the stored pounds and wrote "lb" beside them, so a metric account read
                  // pounds labelled pounds. A planned set keeps `weight_display` (the plan's own words —
                  // "bodyweight", a range); a performed one now carries the same field, converted.
                  const weightClause = (() => {
                    if (isBw) return '';
                    if (s.weight_display) return ` × ${s.weight_display}`;
                    return '';
                  })();
                  // Band assist on dips / chin-ups / pull-ups is stored in `resistance_level` (D-351).
                  const assistClause = (s as { assist_display?: string | null }).assist_display
                    ? ` · −${(s as { assist_display?: string | null }).assist_display} assist`
                    : '';
                  if (s.duration_seconds && s.duration_seconds > 0) {
                    return `${formatSeconds(s.duration_seconds)}${weightClause}${assistClause}${rirTxt}`;
                  }
                  // ⛔ THE ALL-OUT SET SAYS SO — "5+" (D-338).
                  /* server-field: strength_slots[].reps_text */
                  const repsValue = s.reps_text ?? (s.reps || 0);
                  const repsTxt = (s as any).amrap ? `${repsValue}+ reps` : `${repsValue} reps`;
                  return `${repsTxt}${weightClause}${assistClause}${rirTxt}`;
                };
                const isEditing = editingSet?.exerciseName === editName && editingSet?.setIndex === editIndex;
                return (
                  <div key={idx}>
                    {isEditing ? (
                      <div className="py-1.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {c?.duration_seconds == null && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-caption text-label-secondary uppercase">Reps</span>
                              <input
                                type="number" inputMode="numeric"
                                value={editFields.reps}
                                onChange={e => setEditFields(f => ({ ...f, reps: e.target.value }))}
                                className="w-14 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-subhead text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          {!r.bodyweight && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-caption text-label-secondary uppercase">Weight (lb)</span>
                              <input
                                type="number" inputMode="decimal"
                                value={editFields.weight}
                                onChange={e => setEditFields(f => ({ ...f, weight: e.target.value }))}
                                className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-subhead text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          {r.band_assisted && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-caption text-label-secondary uppercase">Assist (lb)</span>
                              <input
                                type="number" inputMode="decimal"
                                value={editFields.resistance}
                                onChange={e => setEditFields(f => ({ ...f, resistance: e.target.value }))}
                                className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-subhead text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-caption text-label-secondary uppercase">RIR</span>
                            <input
                              type="number" inputMode="decimal"
                              value={editFields.rir}
                              onChange={e => setEditFields(f => ({ ...f, rir: e.target.value }))}
                              className="w-12 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-subhead text-center focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div className="flex gap-1.5 ml-auto">
                            <button
                              onClick={cancelEditSet}
                              className="px-2.5 py-1 text-caption border border-white/20 rounded text-label-secondary hover:bg-white/5"
                            >Cancel</button>
                            <button
                              onClick={saveEditSet}
                              disabled={savingSet}
                              className="px-2.5 py-1 text-caption bg-amber-500 text-black rounded font-medium hover:bg-amber-400 disabled:opacity-50"
                            >{savingSet ? '…' : 'Save'}</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-12 gap-x-2 text-footnote group [&>div]:min-w-0 [&>div]:break-words">
                        <div className="col-span-2 text-label-secondary">{idx+1}</div>
                        {totalRow ? (
                          hasPrevious ? (
                            <>
                              <div className="col-span-4 text-label-secondary">{fmt(pair.previous, r.bodyweight, true)}</div>
                              <div className="col-span-5 text-label">{fmt(c, false, true)}</div>
                            </>
                          ) : (
                            <div className="col-span-9 text-label">{fmt(c, false, true)}</div>
                          )
                        ) : hasPrevious ? (
                          <>
                            {/* ⛔ PLANNED READS AT THE SAME LEVEL AS COMPLETED (2026-08-02, Michael).
                                ⚠️ PREVIOUS stays lower on purpose — context from another session. */}
                            <div className="col-span-3 text-label-secondary">{fmt(pair.previous, r.bodyweight, true)}</div>
                            <div className="col-span-3 text-label">{fmt(p, r.bodyweight, true)}</div>
                            <div className="col-span-3 text-label">{fmt(c, false, true)}</div>
                          </>
                        ) : (
                          <>
                            <div className="col-span-5 text-label">{fmt(p, r.bodyweight, true)}</div>
                            <div
                              className={`col-span-4 text-label ${c && workoutId ? 'cursor-pointer' : ''}`}
                              onClick={c && workoutId ? () => startEditSet(editName, editIndex, c) : undefined}
                            >{fmt(c, false, true)}</div>
                          </>
                        )}
                        {c && workoutId && (
                          <div className="col-span-1 flex justify-end">
                            <button
                              onClick={() => startEditSet(editName, editIndex, c)}
                              className="text-label-secondary hover:text-label transition-colors text-caption uppercase tracking-wider leading-none px-1"
                              title="Edit this set"
                              aria-label="Edit this set"
                            >edit</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* ⛔ THE ONE COMPARISON A REP-TOTAL ROW CAN HONESTLY MAKE: reps against the total. A COUNT,
                not a grade — no colour, no percentage, no verdict. */}
            {r.reps_line && (
              <div className="text-caption text-label border-t border-white/10 pt-1 flex items-center justify-end gap-1.5">
                <span>{r.reps_line}</span>
              </div>
            )}
            {/* ⛔ A ROW THE PLAN NEVER PRICED STILL DID REAL WORK (D-349 follow-up, 2026-08-01): the
                volume line shows whenever either side has volume; the delta only against a plan that
                priced load. */}
            {(r.planned_volume_lb > 0 || r.volume_lb > 0) && (
              <div className="text-caption border-t border-white/10 pt-1 flex items-center justify-end gap-2">
                <span className="text-label-secondary">Vol:</span>
                {r.volume_delta_lb != null ? (
                  <>
                    <span className="text-label-secondary">{r.planned_volume_lb.toLocaleString()} lb</span>
                    <span className="text-label-secondary">→</span>
                    <span className="text-label">{r.volume_lb.toLocaleString()} lb</span>
                    <span className={r.volume_direction === 'down' ? 'text-rose-400' : 'text-green-400'}>
                      {r.volume_direction === 'down' ? '-' : '+'}{Math.abs(r.volume_delta_lb).toLocaleString()} lb
                    </span>
                  </>
                ) : (
                  <span className="text-label">{r.volume_lb.toLocaleString()} lb</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* ⛔ "vs plan" IS DELETED (2026-08-02) — it compared two different sessions (the plan prices only
          the main lift; the log prices every row) and the previous program tracks no tonnage. The
          session total lives once, on the Performance tiles (`strength_totals.volume_lb`). */}
    </div>
  );
}
