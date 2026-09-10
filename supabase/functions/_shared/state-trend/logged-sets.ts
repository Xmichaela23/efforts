/**
 * ⛔ "FROM YOUR LOGGED SETS" — THE SET HISTORY PER LIFT, DECIDED HERE (audit 2026-09-10, H-S20).
 *
 * WHAT THIS REPLACED: the State screen ran its own `exercise_log` query (`useExerciseLog(8)`) and
 * picked, on the phone, each lift's last five sessions, which of them wears the "best" tag, each
 * accessory's heaviest set, and which lifts are listed at all. The rules are moved unchanged; the
 * rows are the ones `compute-snapshot` already fetches for the strength series.
 *
 * ⚠️ WHICH LIFTS ARE "MAIN" IS NOT DECIDED HERE. That list is the coach's (`response_model.strength.
 * per_lift`, sufficient and coached), so the coach splits these lifts into the main rows and "your
 * best sets" — see `coach/strength-logged-sets.ts`. This file answers only "what did you lift, when".
 *
 * ⚠️ THE e1RM IS PRINTED ONLY WHEN IT CAN BE TRUSTED (D-417): a set past the lift's trusted rep ceiling
 * inflates its own estimate, so it still lists, carries no e1RM, and cannot win "best".
 */
import { trustedMaxReps } from '../../../../src/lib/estimate-1rm.ts';
import { canonicalDisplayName } from '../canonicalize.ts';

/** OURS — the State list's window: the last 8 weeks of logged sets (was `useExerciseLog(8)` on the screen). */
export const LOGGED_SETS_WEEKS = 8;
/** OURS — sessions a lift needs before it is listed (was the hook's own `rows.length >= 2`). */
export const LOGGED_SETS_MIN_SESSIONS = 2;
/** OURS — the most recent sessions shown under a main lift, newest first. */
export const LOGGED_SETS_RECENT = 5;

export interface LoggedSetRow {
  date: string;
  weight: number;
  reps: number;
  /** The session's estimated 1RM — null when the reps are past the trusted ceiling (not printed). */
  e1rm: number | null;
  /** The strongest trusted reading of the sessions listed. At most one per lift; none when no set is trusted. */
  best: boolean;
}

export interface LoggedLift {
  canonical: string;
  displayName: string;
  /** Sessions logged in the window with an estimate. */
  sessions: number;
  /** The last `LOGGED_SETS_RECENT` sessions, newest first. */
  recent: LoggedSetRow[];
  /** The heaviest set in the window, decided on WEIGHT (never on the estimate). Null when no weight was logged. */
  heaviest: { date: string; weight: number; reps: number } | null;
}

type Row = { date: string; canonical_name: string; estimated_1rm: number | null; reps?: number | null; best_weight?: number | null };

function isoMinusDays(ymd: string, days: number): string {
  return new Date(new Date(ymd + 'T12:00:00Z').getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export function buildLoggedLifts(rows: ReadonlyArray<Row>, asOf: string): LoggedLift[] {
  const since = isoMinusDays(asOf, LOGGED_SETS_WEEKS * 7);
  const byCanonical = new Map<string, Row[]>();
  for (const r of rows) {
    if ((Number(r.estimated_1rm) || 0) <= 0) continue;
    if (!r.date || r.date < since) continue;
    const arr = byCanonical.get(r.canonical_name) ?? [];
    arr.push(r);
    byCanonical.set(r.canonical_name, arr);
  }
  return [...byCanonical.entries()]
    .filter(([, rs]) => rs.length >= LOGGED_SETS_MIN_SESSIONS)
    .map(([canonical, rs]) => {
      const entries = [...rs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, e1rm: Number(r.estimated_1rm), weight: Number(r.best_weight) || 0, reps: Number(r.reps) || 0 }));
      const trusted = (e: { reps: number }) => e.reps > 0 && e.reps <= trustedMaxReps(canonical);
      const recentEntries = [...entries].reverse().slice(0, LOGGED_SETS_RECENT);
      const bestIdx = recentEntries.reduce(
        (bi, e, i) => (trusted(e) && (bi < 0 || e.e1rm > recentEntries[bi].e1rm)) ? i : bi,
        -1,
      );
      // ⛔ THE RECORD IS THE HEAVIEST SET, decided on WEIGHT — an estimate ranks by reps (D-417: a
      // 105 × 35 read as a 225 "max"), and an accessory has no tested max for one to stand on.
      const heaviest = entries.reduce(
        (b, e) => (e.weight > (b?.weight ?? 0) ? e : b),
        null as (typeof entries)[number] | null,
      );
      return {
        canonical,
        displayName: canonicalDisplayName(canonical),
        sessions: entries.length,
        recent: recentEntries.map((e, i) => ({
          date: e.date, weight: e.weight, reps: e.reps,
          e1rm: e.e1rm > 0 && trusted(e) ? e.e1rm : null,
          best: i === bestIdx,
        })),
        heaviest: heaviest && heaviest.weight > 0 ? { date: heaviest.date, weight: heaviest.weight, reps: heaviest.reps } : null,
      };
    })
    // Most-logged first — the order the screen's list has always had.
    .sort((a, b) => b.sessions - a.sessions);
}
