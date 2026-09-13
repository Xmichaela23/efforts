// Intervals.icu connection steps shared by intervals-connect-key (API key) and intervals-oauth (sign-in), 2026-09-13.

import { deleteEventsByExternalId, IntervalsApiError } from './client.ts';
import { decryptToken } from '../token-crypto.ts';
import { fetchAthleteTimezone } from '../athlete-timezone.ts';
import { localDateInTz } from '../local-date.ts';

/**
 * Where each sport's workouts go, set only when the athlete has not chosen: rides to Intervals.icu, runs to Garmin
 * when Garmin is connected, swim and strength nowhere. Setting it queues a sync (users_calendar_sync_destinations).
 */
// deno-lint-ignore no-explicit-any
export async function setDefaultDestinationsIfAbsent(supabase: any, userId: string): Promise<{ set: boolean }> {
  const { data: userRow, error: prefErr } = await supabase.from('users').select('preferences').eq('id', userId).maybeSingle();
  if (prefErr) throw new Error(prefErr.message);
  const prefs = userRow?.preferences ?? {};
  if (prefs.workout_destinations && typeof prefs.workout_destinations === 'object') return { set: false };
  const { data: garmin } = await supabase.from('user_connections').select('id').eq('user_id', userId).eq('provider', 'garmin').maybeSingle();
  const workout_destinations = { ride: 'intervals_icu', run: garmin ? 'garmin' : 'none', swim: 'none', strength: 'none' };
  const { error } = await supabase.from('users').update({ preferences: { ...prefs, workout_destinations } }).eq('id', userId);
  if (error) throw new Error(`saving where workouts go failed: ${error.message}`);
  return { set: true };
}

export type KeyCleanup =
  | { ran: false }
  | { ran: true; removed: number; key_rejected: boolean };

/**
 * Before the key goes (a switch to sign-in, or a disconnect). Intervals.icu matches external_id only on events created by the same OAuth
 * application (OpenAPI, events/bulk and bulk-delete), so events the key created would stay beside the copies the
 * sign-in creates. With the old key: remove every key-sent event dated today or later, and drop those delivery rows,
 * so a sign-in's next sync recreates them under its own id. Earlier dates are left as they are — the sync never touches
 * them either (calendar-sync/plan.ts diffDeliveries).
 *
 * Throws when the database or Intervals.icu fails for any reason other than refusing the key; the caller keeps the key
 * connection so the athlete can try again. A refused key (401/403) cannot remove anything, so the caller goes ahead.
 */
// deno-lint-ignore no-explicit-any
export async function removeKeySentEvents(supabase: any, userId: string, existing: any, now = new Date()): Promise<KeyCleanup> {
  if (!existing || existing.connection_data?.auth !== 'api_key' || !existing.access_token) return { ran: false };
  const athleteId = String(existing.connection_data?.athlete_id ?? '');
  if (!athleteId) return { ran: false };
  const key = await decryptToken(existing.access_token);

  const today = localDateInTz(now, await fetchAthleteTimezone(supabase, userId));
  const { data: rows, error } = await supabase.from('calendar_deliveries').select('planned_workout_id')
    .eq('user_id', userId).eq('provider', 'intervals_icu').gte('date', today);
  if (error) throw new Error(`calendar_deliveries read failed: ${error.message}`);
  const ids = (rows ?? []).map((r: any) => String(r.planned_workout_id));
  if (!ids.length) return { ran: true, removed: 0, key_rejected: false };

  // Intervals.icu first, delivery rows only after it answers. If it fails, the rows stay, so a second try finds the
  // same rides and deletes them again; bulk-delete ignores events that are already gone, so the retry is safe. The
  // other order lost the rows on a failure: the retry found nothing to remove and every ride doubled.
  let keyRejected = false;
  try {
    await deleteEventsByExternalId({ kind: 'api_key', key, athleteId }, ids);
  } catch (e) {
    if (e instanceof IntervalsApiError && (e.status === 401 || e.status === 403)) keyRejected = true;
    else throw e;
  }
  const { error: delErr } = await supabase.from('calendar_deliveries').delete()
    .eq('user_id', userId).eq('provider', 'intervals_icu').in('planned_workout_id', ids);
  if (delErr) throw new Error(`calendar_deliveries delete failed: ${delErr.message}`);
  return { ran: true, removed: keyRejected ? 0 : ids.length, key_rejected: keyRejected };
}

/** Queue one calendar sync now, unless one is already queued (same rule as the planned_workouts trigger). */
// deno-lint-ignore no-explicit-any
export async function queueCalendarSync(supabase: any, userId: string): Promise<void> {
  const { data: queued } = await supabase.from('jobs').select('id').eq('kind', 'calendar-sync').eq('user_id', userId).eq('status', 'queued').limit(1);
  if (queued?.length) return;
  const { error } = await supabase.from('jobs').insert({ kind: 'calendar-sync', user_id: userId, payload: {}, next_run_at: new Date().toISOString() });
  if (error) console.warn(JSON.stringify({ event: 'calendar_sync_queue_failed', user_id: userId, error: error.message }));
}
