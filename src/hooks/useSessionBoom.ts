/**
 * ═══ THE INPUTS FOR ONE LINE OF GOOD NEWS ═══════════════════════════════════════════════════════
 *
 * docs/WORKORDER-booms-2026-09-09.md. `session-boom.ts` decides WHICH line; this hook is the only
 * thing that fetches, and it fetches the smallest window that can answer the questions the approved
 * lines ask.
 *
 * ⛔ NOTHING IS MEASURED HERE EITHER. Both queries select stored columns — the power curve, the ride
 * card's own analysis blob, and `exercise_log` — and hand them over untouched.
 *
 * ⚠️ IT RUNS ONLY FOR A COMPLETED SESSION OF A SPORT THAT HAS LINES. A swim, a walk or a planned row
 * makes no request at all: most sessions have no line, and the cheapest version of "no line" is not
 * asking.
 */
import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { sessionBoomLine, type BoomWorkout } from '@/lib/session-boom';

/** The sports the work order writes lines for. Everything else short-circuits before the fetch. */
const SPORTS = new Set(['ride', 'bike', 'cycling', 'run', 'strength']);

/**
 * ⛔ A YEAR IS THE WIDEST ANY LINE LOOKS. Every window is "since the block started, else this year",
 * so a year of that athlete's own rows is the ceiling — and the `date` index makes it one cheap read.
 */
function yearStartISO(dateISO: string): string {
  const y = Number(String(dateISO).slice(0, 4));
  return Number.isFinite(y) ? `${y}-01-01` : '1900-01-01';
}

export function useSessionBoom(workout: BoomWorkout | null | undefined): string | null {
  const { useImperial } = useAppContext();
  const coach = useCoachWeekContext();
  const [line, setLine] = useState<string | null>(null);

  const id = workout?.id ? String(workout.id) : null;
  const date = String(workout?.date ?? '').slice(0, 10);
  const type = String(workout?.type ?? '').toLowerCase();
  const done = String(workout?.workout_status ?? '').toLowerCase() === 'completed';
  const meBlock = coach.data?.weekly_state_v1?.me_history_v1 ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!id || !date || !done || !SPORTS.has(type)) { setLine(null); return; }

    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      const from = yearStartISO(date);
      try {
        /**
         * ⚠️ THE SAME SPORT ONLY, AND EVERY SPELLING OF IT. `bike` and `cycling` are both on the wire
         * for a ride; asking for one would silently halve a rider's history and make a best look like
         * a best when it was not.
         */
        const types = type === 'run' ? ['run']
          : type === 'strength' ? ['strength']
            : ['ride', 'bike', 'cycling'];

        const priorQ = supabase
          .from('workouts')
          /**
           * ⚠️ NO `week_number` — `workouts` HAS NO SUCH COLUMN (PGRST204, caught by the burner
           * against the real schema; it lives on `planned_workouts`). The resolver reads the week off
           * the row the CARD hands it, which is the unified item, not off this query.
           */
          .select('id,date,type,workout_status,computed,workout_analysis,strength_exercises')
          .eq('user_id', userId)
          .eq('workout_status', 'completed')
          .in('type', types)
          .gte('date', from)
          .lte('date', date)
          /**
           * ⛔ THIS SESSION IS FETCHED WITH THE OTHERS, NOT READ OFF THE CARD'S OWN ROW — and that is
           * a fix, not a convenience. The row a card holds is the UNIFIED item, whose `computed` the
           * client rebuilds: it carries `overall` and NOT `power_curve`, so comparing the card's row
           * against fetched rows compared a session with no curve to eight that had one, and the
           * power line could never fire. (Caught in the harness: `curve undefined` on the session,
           * present on every prior.) One query, one column set, both sides of the comparison.
           */
          .order('date', { ascending: false })
          .limit(200);

        const logQ = type === 'strength'
          ? supabase
            .from('exercise_log')
            .select('date,workout_id,canonical_name,exercise_name,slot_intent,sets_completed')
            .eq('user_id', userId)
            .gte('date', from)
            .lte('date', date)
            .limit(1000)
          : null;

        const [priorRes, logRes] = await Promise.all([priorQ, logQ ?? Promise.resolve({ data: [] as unknown[] })]);
        if (cancelled) return;

        const rows = (Array.isArray(priorRes.data) ? priorRes.data : []) as BoomWorkout[];
        const fetchedSelf = rows.find((r) => String(r?.id ?? '') === id) ?? null;
        const prior = rows.filter((r) => String(r?.id ?? '') !== id);
        const logAll = (Array.isArray((logRes as { data?: unknown[] }).data) ? (logRes as { data: unknown[] }).data : []) as
          Array<{ date?: string | null; workout_id?: string | null }>;
        const logToday = logAll.filter((r) => String(r?.workout_id ?? '') === id);
        const logPrior = logAll.filter((r) => String(r?.workout_id ?? '') !== id);

        setLine(sessionBoomLine({
          /**
           * ⚠️ THE FETCHED ROW OVER THE CARD'S, AND THE CARD'S UNDERNEATH IT. The table has the
           * stored columns; the unified item has `week_number`, which `workouts` does not carry at
           * all. Neither is complete on its own.
           */
          workout: { ...(workout as BoomWorkout), ...(fetchedSelf ?? {}) },
          prior,
          /**
           * ⚠️ NO BLOCK START IS SENT, SO EVERY WINDOW IS "THIS YEAR" — the work order's own fallback.
           * The coach payload names the block but does not carry its first day; wiring a start date
           * means a server field, and a line that says `since January` is true either way.
           */
          blockStartISO: null,
          meHistory: meBlock?.history ?? null,
          meAtWeight: meBlock?.at_weight ?? null,
          logToday,
          logPrior,
          useImperial,
        }));
      } catch (e) {
        // ⚠️ A FAILED READ IS NO LINE, NEVER A WRONG ONE. Silence is already the normal answer.
        console.warn('[boom] could not read the session history', e);
        if (!cancelled) setLine(null);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, date, type, done, useImperial, meBlock]);

  return line;
}

export default useSessionBoom;
