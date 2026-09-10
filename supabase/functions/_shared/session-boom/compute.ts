/**
 * ═══ THE GOOD-NEWS LINE, WORKED OUT ONCE AND STORED ══════════════════════════════════════════════
 *
 * Audit H-T14 (2026-09-10). `line.ts` decides WHICH line; this reads its inputs off the database and
 * stores the answer on `workouts.computed.session_boom_v1`. `workout-detail` sends it as
 * `session_detail_v1.boom`; Today's done card reads the same stored value off the `get-week` row.
 *
 * ⛔ WHERE IT RUNS: `compute-session-boom`, which `recompute-workout` calls right after the analyser (and
 * `bulk-reanalyze-workouts` after its analyser). Every input is written by an earlier step of that
 * chain — the power curve and moving time by summary and analysis, heart rate at easy power, drift and
 * the run's pace-at-heart-rate points by the analyser, `exercise_log` by compute-facts, the planned
 * row's week by auto-attach. Run any earlier and the line is worked out from a half-written session.
 * ⚠️ `ingest-activity` needs nothing of its own: every activity it takes goes through
 * `recompute-workout`, as do the phone's saved, imported and manual sessions.
 * ⚠️ ITS OWN FUNCTION, NOT A STEP INSIDE THE ORCHESTRATOR, because the rule reaches the standing-plan
 * composer (the heavy-set band and ladder): about 190 modules against the orchestrator's 6.
 *
 * ⛔ STORED IN `computed`, NOT `workout_analysis`, AND THROUGH `merge_computed`. The run and lift
 * analysers REPLACE `workout_analysis` whole on every run — and `auto-attach-planned` fires them outside
 * this chain — so a line kept there would vanish whenever a session was attached or analysed again.
 * Every writer of `computed` merges into it (`merge_computed` is `computed || patch`), so the line
 * stays until this runs again.
 *
 * ⛔ THE WHOLE WINDOW, NOT 200 ROWS. The phone read the newest 200 sessions of the sport since 1 January
 * and compared against those, so a rider with more than 200 rides in the year could be told a best that
 * was not one. This pages through every earlier session in the window, reading only the stored fields
 * the rules use.
 *
 * ⛔ THE BLOCK START IS SENT. The phone always passed none, so every window was "this year". The start is
 * the plan's own (`config.user_selected_start_date`, else `config.start_date` — the one
 * `plan-context.ts` counts weeks from), for the plan the session was done on: the planned row's plan,
 * else the athlete's active plan. ⚠️ ONLY WHEN THE SESSION IS ON OR AFTER IT — a session from before the
 * block started is not "since" it, and its window stays the year.
 */
import { sessionBoom, windowStart, type BoomWorkout, type BoomExerciseLogRow, type MeHistoryEntry, type SessionBoomV1 } from './line.ts';
import { completedMovingSeconds } from '../moving-seconds.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

const RIDE_TYPES = ['ride', 'bike', 'cycling'];

/** The sports the work order writes lines for. Anything else stores no line and reads nothing. */
function sportTypes(type: string): string[] | null {
  if (type === 'run') return ['run'];
  if (type === 'strength') return ['strength'];
  if (RIDE_TYPES.includes(type)) return RIDE_TYPES;
  return null;
}

/** One PostgREST page. ⚠️ THE PROJECT'S ROW CAP IS 1,000, so a page asks for exactly that and no more. */
const PAGE = 1000;

/**
 * The columns an earlier session contributes, and nothing else — a year of rides carries sample
 * series and analysis blobs no rule here reads.
 */
const PRIOR_SELECT = [
  'id', 'date', 'type',
  'power_curve:computed->power_curve',
  'duration_s_moving:computed->overall->duration_s_moving',
  'hr_at_band:workout_analysis->bike_fitness_v1->hr_at_band',
  'counts_toward_trend:workout_analysis->bike_fitness_v1->counts_toward_trend',
  'decoupling_pct:workout_analysis->heart_rate_summary->decouplingPct',
  'hr_drift_pct:workout_analysis->hr_drift_v1->pct',
].join(',');

/** A narrow prior row back into the shape `line.ts` reads. Exported for its test. */
export function priorFromRow(r: Record<string, unknown>): BoomWorkout {
  const bf = r.hr_at_band != null || r.counts_toward_trend != null
    ? { hr_at_band: r.hr_at_band, ...(r.counts_toward_trend != null ? { counts_toward_trend: r.counts_toward_trend } : {}) }
    : undefined;
  return {
    id: r.id as string,
    date: r.date as string,
    type: r.type as string,
    workout_status: 'completed',
    computed: {
      ...(r.power_curve != null ? { power_curve: r.power_curve } : {}),
      ...(r.duration_s_moving != null ? { overall: { duration_s_moving: r.duration_s_moving } } : {}),
    },
    workout_analysis: {
      ...(bf ? { bike_fitness_v1: bf } : {}),
      ...(r.decoupling_pct != null ? { heart_rate_summary: { decouplingPct: r.decoupling_pct } } : {}),
      ...(r.hr_drift_pct != null ? { hr_drift_v1: { pct: r.hr_drift_pct } } : {}),
    },
  };
}

/** The plan's first day, when the session is on or after it. */
export function blockStartFor(config: Record<string, unknown> | null | undefined, sessionDateISO: string): string | null {
  const raw = config?.user_selected_start_date ?? config?.start_date;
  const iso = typeof raw === 'string' ? raw.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso <= sessionDateISO ? iso : null;
}

/**
 * Same stored line? ⚠️ KEY ORDER IGNORED — Postgres `jsonb` hands keys back in its own order, so a plain
 * `JSON.stringify` comparison said "changed" on every run and wrote the same line again (caught live on
 * a throwaway, 2026-09-10). Exported for its test.
 */
export function sameBoom(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
}

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try { return JSON.parse(v); } catch { return null; }
}

export type ComputeSessionBoomResult = { boom: SessionBoomV1 | null; written: boolean };

/**
 * Works out the line for one session and stores it (null when there is none, so a line that stopped
 * being true does not linger). Throws on a failed read or write; the callers treat that as non-fatal.
 */
export async function computeSessionBoom(supabase: Db, workoutId: string, userId: string): Promise<ComputeSessionBoomResult> {
  const { data: row, error: rowErr } = await supabase
    .from('workouts')
    .select('id,user_id,date,type,workout_status,planned_id,computed,workout_analysis,metrics,strength_exercises,moving_time,elapsed_time,duration,distance,avg_heart_rate')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) return { boom: null, written: false };

  const date = String(row.date ?? '').slice(0, 10);
  const type = String(row.type ?? '').toLowerCase();
  const types = sportTypes(type);
  const done = String(row.workout_status ?? '').toLowerCase() === 'completed';
  const existing = (parseJson(row.computed) as Record<string, unknown> | null)?.session_boom_v1;

  let boom: SessionBoomV1 | null = null;
  if (types && done && date) {
    // The planned row: its week (the ladder keys a heavy session by week and weekday) and its plan.
    let weekNumber: number | null = null;
    let planId: string | null = null;
    if (row.planned_id) {
      const { data: pw, error: pwErr } = await supabase
        .from('planned_workouts')
        .select('week_number,training_plan_id')
        .eq('id', row.planned_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (pwErr) throw pwErr;
      weekNumber = Number.isFinite(Number(pw?.week_number)) && pw?.week_number != null ? Number(pw.week_number) : null;
      planId = pw?.training_plan_id ? String(pw.training_plan_id) : null;
    }
    let plan: { config?: unknown } | null = null;
    {
      let q = supabase.from('plans').select('id,config').eq('user_id', userId);
      q = planId ? q.eq('id', planId) : q.eq('status', 'active').order('created_at', { ascending: false }).limit(1);
      const { data: plans, error: planErr } = await q;
      if (planErr) throw planErr;
      plan = Array.isArray(plans) ? (plans[0] ?? null) : (plans ?? null);
    }
    const config = (parseJson(plan?.config) ?? null) as Record<string, unknown> | null;
    const blockStartISO = blockStartFor(config, date);

    const workout: BoomWorkout = {
      id: String(row.id),
      date,
      type,
      workout_status: 'completed',
      week_number: weekNumber,
      moving_seconds: completedMovingSeconds(row),
      computed: parseJson(row.computed) as Record<string, unknown> | null,
      workout_analysis: parseJson(row.workout_analysis),
      strength_exercises: parseJson(row.strength_exercises),
    };

    const prior: BoomWorkout[] = [];
    let logToday: BoomExerciseLogRow[] = [];
    let meHistory: Partial<Record<string, MeHistoryEntry[]>> | null = null;

    if (type === 'strength') {
      const { data: logs, error: logErr } = await supabase
        .from('exercise_log')
        .select('date,workout_id,canonical_name,exercise_name,slot_intent,sets_completed')
        .eq('user_id', userId)
        .eq('workout_id', workoutId);
      if (logErr) throw logErr;
      logToday = Array.isArray(logs) ? logs : [];
      const sp = (config?.standing_plan ?? null) as { me_history?: unknown } | null;
      meHistory = sp?.me_history && typeof sp.me_history === 'object'
        ? sp.me_history as Partial<Record<string, MeHistoryEntry[]>>
        : null;
    } else {
      const from = windowStart(blockStartISO, date).iso;
      for (let offset = 0; ; offset += PAGE) {
        const { data: page, error: pageErr } = await supabase
          .from('workouts')
          .select(PRIOR_SELECT)
          .eq('user_id', userId)
          .eq('workout_status', 'completed')
          .in('type', types)
          .gte('date', from)
          .lt('date', date)
          .neq('id', workoutId)
          // Most recent first — the eight-session and the streak rules walk back from today.
          .order('date', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (pageErr) throw pageErr;
        const rows = Array.isArray(page) ? page : [];
        for (const r of rows) prior.push(priorFromRow(r as Record<string, unknown>));
        if (rows.length < PAGE) break;
      }
    }

    boom = sessionBoom({ workout, prior, blockStartISO, meHistory, logToday });
  }

  // ⚠️ NO WRITE WHEN NOTHING CHANGED — a swim recomputed a hundred times stores nothing a hundred times.
  if (sameBoom(existing, boom)) return { boom, written: false };
  const { error: writeErr } = await supabase.rpc('merge_computed', {
    p_workout_id: workoutId,
    p_partial_computed: { session_boom_v1: boom },
  });
  if (writeErr) throw writeErr;
  return { boom, written: true };
}
