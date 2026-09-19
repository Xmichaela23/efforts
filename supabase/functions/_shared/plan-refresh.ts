/**
 * ═══ THE PLAN WRITER VERSION, AND THE REFRESH IT TRIGGERS (2026-09-18) ═══════════════════════════════
 *
 * ⛔ BUMP `PLAN_WRITER_VERSION` HERE AND NOWHERE ELSE, whenever the code that writes a planned session changes
 * (the Standing Plan composer, `restateFromTest` / `restateEndurance`, materialize-plan's expansion). Same idea
 * as `COACH_PAYLOAD_VERSION`: one number, stamped on what was written, read back to tell old from new.
 *
 * Every expanded planned row carries the version that wrote it in `computed.writer_version`. materialize-plan
 * writes it, and only when the caller says the row's content was just written by this code
 * (`stamp_writer_version: true`: activate-plan at build, `rematerialize-standing-block` after a rebuild). Any
 * other expansion (get-week filling a missing one, adapt-plan's re-layout) writes `computed` without it, and the
 * row reads as older — which costs one extra refresh, never a wrong session. A row with no stamp reads as 0.
 *
 * When a plan has an expanded session not yet done, dated today or later, stamped below this number, `get-week`
 * queues ONE refresh of that plan on the job queue (`rematerialize-standing-block` with `refresh: true`, run by
 * `run-jobs` one job after another). The endurance re-price after an accepted threshold queues the same job, so
 * a plan is rewritten once, not twice.
 *
 * ⚠️ INSIDE `computed`, NOT A NEW COLUMN: planned_workouts has no metadata column (checked 2026-09-18 against the
 * live table), materialize-plan is `computed`'s one writer, and the stamp rides the same write as the expansion.
 * ⚠️ STANDING PLAN BLOCKS ONLY — the refresh is that block's rebuild; other plan types are never queued.
 */
import { STANDING_PLAN_PROTOCOL_ID } from './standing-plan/protocol-id.ts';
import { fetchAthleteTimezone, resolveAthleteTimezone } from './athlete-timezone.ts';
import { localDateInTz } from './local-date.ts';

// 2 (2026-09-18): one name per movement (83 spellings merged), every movement filed by its page, the pull-up leads the primary pull cell.
// 3 (2026-09-18): decline bench to Secondary push, bodyweight dips off Braced push, sandbag throw only with a sandbag,
//   the kit's own name for the stiff-legged deadlift.
// 4 (2026-09-18): a commercial gym has a sandbag; one name per movement on a kit (a dumbbell kit's Romanian deadlift reads
//   DB Romanian Deadlift; the rear delt fly and the home rear delt machine are one option).
// 5 (2026-09-18): on a dumbbell kit the pullover machine is not offered (it is p220's DB pullover).
// OURS — code version counter, not a training number (`PLAN_WRITER_VERSION`)
export const PLAN_WRITER_VERSION = 5;

/** The job kind `run-jobs` posts to. The refresh IS the Adjust rebuild, run for the athlete by the server. */
export const PLAN_REFRESH_KIND = 'rematerialize-standing-block';

type RowLike = {
  date?: unknown;
  workout_status?: unknown;
  completed_workout_id?: unknown;
  /** The whole `computed`, or the two keys read on their own (`STAMP_SELECT`). */
  computed?: unknown;
  writer_version?: unknown;
  normalization_version?: unknown;
};

/**
 * The columns the stale check reads — the two keys of `computed` it needs, not the steps. PostgREST JSON paths.
 * ⚠️ `normalization_version` comes back as the JSON value; a row never expanded has none.
 */
export const STAMP_SELECT = 'writer_version:computed->writer_version, normalization_version:computed->normalization_version';

/** A session the athlete has done or skipped. Never refreshed, never counted. */
export function isDoneRow(r: RowLike): boolean {
  if (r?.completed_workout_id) return true;
  const s = String(r?.workout_status ?? '').toLowerCase();
  return s === 'completed' || s === 'skipped';
}

const computedOf = (r: RowLike): Record<string, unknown> | null =>
  (r?.computed && typeof r.computed === 'object' && !Array.isArray(r.computed) ? r.computed as Record<string, unknown> : null);

/** The version stamped on a row; 0 when it carries none (written before stamping existed). */
export function writerVersionOf(r: RowLike): number {
  const v = Number(r?.writer_version ?? computedOf(r)?.writer_version);
  return Number.isFinite(v) ? v : 0;
}

/** materialize-plan has expanded this row. A row never expanded is get-week's job, not the refresh's. */
export function isExpanded(r: RowLike): boolean {
  return (r?.normalization_version ?? computedOf(r)?.normalization_version) != null;
}

/** A session the refresh rewrites: not done, dated today or later. */
export function isRefreshable(r: RowLike, today: string): boolean {
  const d = String(r?.date ?? '').slice(0, 10);
  return !!d && d >= today && !isDoneRow(r);
}

/**
 * ⛔ "TODAY" IS THE ATHLETE'S DAY, NOT THE SERVER'S (2026-09-18). The server runs on UTC, so from 5 pm Pacific
 * `toISOString()` is already tomorrow and that evening's session would count as the past — left as it is by the
 * refresh. The zone is the one the app already stores (`user_baselines.timezone`, reported by the phone on load,
 * `_shared/athlete-timezone.ts`), and the date is `localDateInTz` — the same two calls calendar-sync makes. No
 * zone on file = UTC, that module's neutral. Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function athleteToday(supabase: any, userId: string, now: Date = new Date()): Promise<string> {
  const tz = resolveAthleteTimezone({ storedTimezone: await fetchAthleteTimezone(supabase, userId) });
  return localDateInTz(now, tz);
}

/** A refreshable, expanded session written by older code. */
export function isStaleRow(r: RowLike, today: string): boolean {
  return isRefreshable(r, today) && isExpanded(r) && writerVersionOf(r) < PLAN_WRITER_VERSION;
}

/** A Standing Plan block, in either dialect (`block-identity.ts` reads both). */
export function isStandingPlanConfig(config: unknown): boolean {
  const c = (config ?? {}) as Record<string, unknown>;
  return String(c.strength_protocol ?? '') === STANDING_PLAN_PROTOCOL_ID
    || String(c.source ?? '').toLowerCase() === STANDING_PLAN_PROTOCOL_ID;
}

/**
 * OURS — a plan whose refresh ran in the last hour is not queued again for stale rows. A refresh that could
 * not stamp a row (it failed, or the row was added after it) would otherwise be queued on every calendar read.
 */
export const STALE_REQUEUE_WAIT_MS = 60 * 60 * 1000;

export type QueueResult = { queued: boolean; reason: string; rows_pending: number };

/**
 * Queue one refresh of this plan. `why: 'stale'` (get-week) skips when a refresh for the plan is queued or
 * running, or finished within `STALE_REQUEUE_WAIT_MS`; `why: 'reprice'` (a number was accepted) skips only when
 * one is still queued, because a running refresh may have read the number before it changed.
 * Writes `config.reprice_job` at queue time so a screen polling `reprice_status` has a count at once.
 * Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function queuePlanRefresh(supabase: any, args: {
  userId: string;
  planId: string;
  why: 'stale' | 'reprice';
  rowsPending: number;
}): Promise<QueueResult> {
  const { userId, planId, why, rowsPending } = args;
  try {
    const { data: recent } = await supabase
      .from('jobs')
      .select('id, status, finished_at, created_at')
      .eq('kind', PLAN_REFRESH_KIND)
      .eq('user_id', userId)
      .eq('payload->>plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(5);
    const jobs = Array.isArray(recent) ? recent : [];
    if (jobs.some((j: { status?: string }) => j.status === 'queued')) return { queued: false, reason: 'already_queued', rows_pending: rowsPending };
    if (why === 'stale') {
      if (jobs.some((j: { status?: string }) => j.status === 'running')) return { queued: false, reason: 'running', rows_pending: rowsPending };
      const cutoff = Date.now() - STALE_REQUEUE_WAIT_MS;
      if (jobs.some((j: { finished_at?: string | null }) => j.finished_at && Date.parse(j.finished_at) > cutoff)) {
        return { queued: false, reason: 'refreshed_recently', rows_pending: rowsPending };
      }
    }
    const { error } = await supabase.from('jobs').insert({
      kind: PLAN_REFRESH_KIND,
      user_id: userId,
      payload: { plan_id: planId, apply: true, refresh: true, why, writer_version: PLAN_WRITER_VERSION },
      next_run_at: new Date().toISOString(),
    });
    if (error) return { queued: false, reason: `queue_failed: ${error.message}`, rows_pending: rowsPending };
    try {
      const { data: cur } = await supabase.from('plans').select('config').eq('id', planId).eq('user_id', userId).maybeSingle();
      const cfg = (cur?.config && typeof cur.config === 'object') ? cur.config as Record<string, unknown> : {};
      await supabase.from('plans').update({
        config: { ...cfg, reprice_job: { queued_at: new Date().toISOString(), started_at: null, total: rowsPending, done: 0, finished_at: null } },
      }).eq('id', planId).eq('user_id', userId);
    } catch (e) { console.warn('[plan-refresh] job record not written:', (e as Error)?.message ?? String(e)); }
    console.log(JSON.stringify({ event: 'plan_refresh_queued', user_id: userId, plan_id: planId, why, rows_pending: rowsPending, writer_version: PLAN_WRITER_VERSION }));
    return { queued: true, reason: why, rows_pending: rowsPending };
  } catch (e) {
    return { queued: false, reason: `queue_failed: ${(e as Error)?.message ?? String(e)}`, rows_pending: rowsPending };
  }
}

/**
 * The read-side check: does this plan have a session not yet done, dated today or later, written by older code?
 * If so, queue the refresh. One small select of the plan's rows from today on. Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function queueRefreshIfStale(supabase: any, userId: string, planId: string, todayIn?: string): Promise<QueueResult | null> {
  try {
    // The athlete's day (`athleteToday`) unless the caller already has it.
    const today = todayIn ?? await athleteToday(supabase, userId);
    const { data: rows } = await supabase
      .from('planned_workouts')
      .select(`id, date, workout_status, completed_workout_id, ${STAMP_SELECT}`)
      .eq('training_plan_id', planId)
      .eq('user_id', userId)
      .gte('date', today);
    const list = Array.isArray(rows) ? rows : [];
    if (!list.some((r: RowLike) => isStaleRow(r, today))) return null;
    const pending = list.filter((r: RowLike) => isRefreshable(r, today)).length;
    return await queuePlanRefresh(supabase, { userId, planId, why: 'stale', rowsPending: pending });
  } catch (e) {
    console.warn('[plan-refresh] stale check failed:', (e as Error)?.message ?? String(e));
    return null;
  }
}
