/**
 * ═══ WAS THIS SESSION ACTUALLY DONE — one answer (2026-09-10, audit H-T10) ═══════════════════════
 *
 * ⛔ THE PHONE DECIDED THIS ITSELF, AND DIFFERENTLY FROM THE SERVER. `UnifiedWorkoutView` treated a
 * row marked completed but carrying no distance, moving time, analysis or logged set as a planned
 * session (a prescription is not a receipt, D-204), while `get-week` derived the row's status from
 * `computed` and `strength_exercises` alone. The same row could open as done on one screen and as
 * planned on another. `get-week` and `workout-detail` now send `is_executed` from this function and
 * the drawer reads it.
 *
 * ⚠️ THE RULE IS THE DRAWER'S, MOVED UNCHANGED: the row says `completed` AND it carries at least one
 * receipt — a computed overall or intervals, a manual completion, a distance or a time, an analysis,
 * or a strength/mobility set that was actually performed (reps, a hold time or a weight).
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "is-executed" supabase/functions
 */

// deno-lint-ignore no-explicit-any
type Row = Record<string, any> | null | undefined;

const positive = (v: unknown): boolean => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

function parseMaybe(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function hasPerformedSet(raw: unknown): boolean {
  const list = parseMaybe(raw);
  if (!Array.isArray(list)) return false;
  return list.some((ex) => Array.isArray(ex?.sets) && ex.sets.some((s: Record<string, unknown>) =>
    positive(s?.reps) || positive(s?.duration_seconds) || positive(s?.weight)));
}

export function isExecutedWorkout(row: Row): boolean {
  if (!row) return false;
  if (String(row.workout_status ?? '').toLowerCase() !== 'completed') return false;
  const computed = parseMaybe(row.computed) as Record<string, unknown> | null;
  if (computed && typeof computed === 'object') {
    if (computed.overall) return true;
    if (Array.isArray(computed.intervals) && computed.intervals.length > 0) return true;
  }
  if (row.completedmanually === true || row.completedManually === true) return true;
  if (positive(row.distance) || positive(row.moving_time) || positive(row.elapsed_time)) return true;
  if (row.workout_analysis) return true;
  return hasPerformedSet(row.strength_exercises) || hasPerformedSet(row.mobility_exercises);
}
