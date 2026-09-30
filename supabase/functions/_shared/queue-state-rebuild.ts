/**
 * ⛔ STATE IS REBUILT AFTER A SYNC, NOT ON THE NEXT OPEN (2026-09-30).
 *
 * Every sync marks `coach_cache` out of date (`invalidate-user-training-cache.ts`), and nothing rebuilt it.
 * The next State or Today open paid for the whole `coach` run in the foreground — about 25–35 reads one
 * after another, the fitness model walked over the whole history — before the screen could fill in.
 *
 * This queues one `coach` run for the athlete through the job queue (`run-jobs`, once a minute). The run
 * writes a fresh `coach_cache` row, so the next open reads it. The field standard: work the numbers out when
 * the data arrives, and have the screen read the stored result.
 *
 * ONE QUEUED RUN PER ATHLETE. A sync fires several steps (recompute, plan check, profile + snapshot); each
 * calls this. If a run is already waiting, its start is pushed back instead of adding another, so a burst
 * becomes one rebuild after the burst. A run already going is left alone and a new one queues behind it.
 *
 * `skip_cache: true` because the queued run must rebuild even when the row was not marked out of date
 * (the snapshot step writes `athlete_snapshot`, which `coach` reads, without marking the row).
 * The athlete's stored zone rides in the payload so the run's "today" is the athlete's today — the same
 * precedence `athlete-timezone.ts` sets (a live client's zone, else the stored one, else UTC).
 *
 * Never throws: a failed queue write leaves the old behaviour (State rebuilds on open).
 */
import { fetchAthleteTimezone } from './athlete-timezone.ts';

/**
 * OURS — how long after the last change the rebuild starts. Long enough for the rest of a sync's queued
 * steps (claimed in start-time order) to run first; short enough that the athlete opening the app after a
 * ride usually finds it done. `run-jobs` ticks once a minute, so the real wait is 60–120 s.
 */
export const STATE_REBUILD_DELAY_MS = 60_000;

export async function queueStateRebuild(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  logPrefix = 'queue-state-rebuild',
): Promise<void> {
  try {
    const nextRunAt = new Date(Date.now() + STATE_REBUILD_DELAY_MS).toISOString();
    const timezone = await fetchAthleteTimezone(supabase, userId);
    const payload: Record<string, unknown> = { skip_cache: true, source: 'queue-state-rebuild' };
    if (timezone) payload.timezone = timezone;

    const { data: waiting } = await supabase
      .from('jobs')
      .select('id')
      .eq('kind', 'coach')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .limit(1);
    const waitingId = Array.isArray(waiting) && waiting.length ? waiting[0].id : null;
    if (waitingId != null) {
      await supabase.from('jobs').update({ next_run_at: nextRunAt, payload }).eq('id', waitingId).eq('status', 'queued');
      return;
    }
    const { error } = await supabase.from('jobs').insert({ kind: 'coach', user_id: userId, payload, next_run_at: nextRunAt });
    if (error) console.error(`[${logPrefix}] queue State rebuild failed:`, error.message ?? error);
  } catch (e) {
    console.error(`[${logPrefix}] queue State rebuild failed:`, e);
  }
}
