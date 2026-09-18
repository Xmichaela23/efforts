// Calendar sync, the part that reads the database and talks to Garmin and Intervals.icu (2026-09-13).
//
// One run for one athlete: work out every planned workout that belongs on a provider calendar in the next
// SYNC_WINDOW_DAYS, compare with calendar_deliveries (what Efforts sent before), then remove, update and create
// on the provider and record the result. It never writes planned_workouts, so it cannot re-trigger itself.
//
// Explicit failures: a workout that cannot be converted is reported by id and its earlier copy is left alone; a
// provider whose credentials cannot be used is reported and nothing of that provider's is touched this run.

import { destinationFor, diffDeliveries, syncWindow, contentHash, type Delivery, type Desired, type Destinations, type Provider } from './plan.ts';
import { serializeRide } from '../intervals/serialize.ts';
import { upsertEvents, deleteEventsByExternalId, type IntervalsAuth } from '../intervals/client.ts';
import { convertWorkoutToGarmin } from '../garmin/convert-workout.ts';
import { applyGarminBaselines } from '../garmin/prepare.ts';
import { ensureValidGarminAccessToken, sendToGarmin, scheduleWorkoutOnDate, deleteGarminSchedule, deleteGarminWorkout } from '../garmin/training-api.ts';
import { decryptToken } from '../token-crypto.ts';
// The title every Efforts screen shows ("Ride — Long Ride"); the saved name is often just "Ride".
import { deriveWorkoutTitle } from '../../../../src/lib/derive-workout-title.ts';
import { intentTitle } from '../intent-title.ts';
import { recordProviderResult } from '../connection-health.ts';
import { fetchAthleteTimezone } from '../athlete-timezone.ts';
import { localDateInTz } from '../local-date.ts';

export type SyncReport = {
  user_id: string;
  today: string;
  window: { from: string; to: string };
  created: number;
  updated: number;
  removed: number;
  /** A workout that could not be converted, or a provider call that failed. */
  errors: Array<{ provider: Provider; planned_workout_id?: string; message: string }>;
  /** True when any provider call failed (worth a retry); conversion failures alone do not set it. */
  retry: boolean;
};

type WithPayload = Desired & { payload: any; row: any };

// deno-lint-ignore no-explicit-any
export async function runCalendarSync(supabase: any, userId: string, now = new Date()): Promise<SyncReport> {
  const tz = await fetchAthleteTimezone(supabase, userId);
  const today = localDateInTz(now, tz);
  const window = syncWindow(today);
  const report: SyncReport = { user_id: userId, today, window, created: 0, updated: 0, removed: 0, errors: [], retry: false };

  const { data: userRow, error: userErr } = await supabase.from('users').select('preferences').eq('id', userId).maybeSingle();
  if (userErr) throw new Error(`users read failed: ${userErr.message}`);
  const destinations: Destinations = (userRow?.preferences?.workout_destinations && typeof userRow.preferences.workout_destinations === 'object')
    ? userRow.preferences.workout_destinations : {};

  // ── credentials ──────────────────────────────────────────────────────────────────────────
  const { data: conns, error: connErr } = await supabase.from('user_connections')
    .select('provider, access_token, refresh_token, expires_at, connection_data')
    .eq('user_id', userId).in('provider', ['garmin', 'intervals_icu']);
  if (connErr) throw new Error(`user_connections read failed: ${connErr.message}`);
  const usable = new Set<Provider>();
  let garminToken: string | null = null;
  let intervalsAuth: IntervalsAuth | null = null;
  for (const c of conns ?? []) {
    try {
      if (c.provider === 'garmin' && c.access_token) {
        garminToken = await ensureValidGarminAccessToken(supabase, userId, c.access_token, c.refresh_token, c.expires_at);
        usable.add('garmin');
      } else if (c.provider === 'intervals_icu' && c.access_token) {
        const secret = await decryptToken(c.access_token);
        const athleteId = String(c.connection_data?.athlete_id ?? '');
        if (!athleteId) throw new Error('connection has no athlete_id');
        intervalsAuth = c.connection_data?.auth === 'oauth'
          ? { kind: 'oauth', accessToken: secret, athleteId }
          : { kind: 'api_key', key: secret, athleteId };
        usable.add('intervals_icu');
      }
    } catch (e) {
      report.errors.push({ provider: c.provider, message: `credentials unusable: ${(e as Error).message}` });
    }
  }

  // ── what belongs on each calendar ───────────────────────────────────────────────────────
  const { data: rows, error: rowsErr } = await supabase.from('planned_workouts').select('*')
    .eq('user_id', userId).gte('date', window.from).lte('date', window.to);
  if (rowsErr) throw new Error(`planned_workouts read failed: ${rowsErr.message}`);

  let baselines: any = null;
  if (usable.has('garmin')) {
    const { data } = await supabase.from('user_baselines').select('units, performance_numbers, learned_fitness').eq('user_id', userId).maybeSingle();
    baselines = data ?? null;
  }

  const desired: WithPayload[] = [];
  const keep = new Set<string>();
  for (const row of rows ?? []) {
    const provider = destinationFor(row, destinations, usable, today);
    if (!provider) continue;
    try {
      let payload: any;
      // The day's title in the book's terms rides on the row, as get-week sends it (2026-09-18).
      const title = deriveWorkoutTitle({ ...row, intent_title: intentTitle(row?.name) || null });
      if (provider === 'intervals_icu') {
        if (String(row.type).toLowerCase() !== 'ride') throw new Error(`Intervals.icu sending covers rides only so far; this is a ${row.type}`);
        payload = serializeRide({ ...row, name: title });
      } else {
        const copy = structuredClone(row);
        copy.name = title;
        applyGarminBaselines(copy, baselines);
        payload = convertWorkoutToGarmin(copy);
      }
      desired.push({ planned_workout_id: row.id, provider, date: row.date, content_hash: await contentHash(row.date, payload), payload, row });
    } catch (e) {
      keep.add(row.id);
      report.errors.push({ provider, planned_workout_id: row.id, message: (e as Error).message });
    }
  }

  const { data: sentRows, error: sentErr } = await supabase.from('calendar_deliveries')
    .select('planned_workout_id, provider, date, content_hash, provider_workout_id, provider_schedule_id')
    .eq('user_id', userId).in('provider', [...usable]);
  if (sentErr) throw new Error(`calendar_deliveries read failed: ${sentErr.message}`);
  const actions = diffDeliveries<WithPayload>(desired, (sentRows ?? []) as Delivery[], today, keep);

  const saveDelivery = async (d: WithPayload, workoutId: string | null, scheduleId: string | null) => {
    const { error } = await supabase.from('calendar_deliveries').upsert({
      user_id: userId, planned_workout_id: d.planned_workout_id, provider: d.provider, date: d.date,
      content_hash: d.content_hash, provider_workout_id: workoutId, provider_schedule_id: scheduleId,
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'planned_workout_id,provider' });
    if (error) throw new Error(`calendar_deliveries write failed: ${error.message}`);
  };
  const dropDelivery = async (s: Delivery) => {
    const { error } = await supabase.from('calendar_deliveries').delete()
      .eq('planned_workout_id', s.planned_workout_id).eq('provider', s.provider);
    if (error) throw new Error(`calendar_deliveries delete failed: ${error.message}`);
  };

  // ── Intervals.icu ───────────────────────────────────────────────────────────────────────
  if (intervalsAuth) {
    const removes = actions.remove.filter((s) => s.provider === 'intervals_icu');
    const writes = [...actions.create, ...actions.update.map((u) => u.desired)].filter((d) => d.provider === 'intervals_icu');
    try {
      if (removes.length) {
        await deleteEventsByExternalId(intervalsAuth, removes.map((s) => s.planned_workout_id));
        for (const s of removes) await dropDelivery(s);
        report.removed += removes.length;
      }
      if (writes.length) {
        const ids = await upsertEvents(intervalsAuth, writes.map((d) => d.payload));
        for (const d of writes) await saveDelivery(d, ids.get(d.planned_workout_id) ?? null, null);
        report.created += actions.create.filter((d) => d.provider === 'intervals_icu').length;
        report.updated += actions.update.filter((u) => u.desired.provider === 'intervals_icu').length;
      }
      if (removes.length || writes.length) await recordProviderResult(supabase, { provider: 'intervals_icu', userId, status: 200, table: 'user_connections' } as any);
    } catch (e) {
      report.retry = true;
      report.errors.push({ provider: 'intervals_icu', message: (e as Error).message });
      const status = Number((e as any)?.status);
      if (Number.isFinite(status) && status >= 400) await recordProviderResult(supabase, { provider: 'intervals_icu', userId, status, error: (e as Error).message, table: 'user_connections' } as any);
    }
  }

  // ── Garmin ──────────────────────────────────────────────────────────────────────────────
  if (garminToken) {
    const token = garminToken;
    const removeOnGarmin = async (s: Delivery): Promise<string | null> => {
      if (s.provider_schedule_id) {
        const r = await deleteGarminSchedule(s.provider_schedule_id, token);
        if (!r.success) return r.error ?? `schedule delete ${r.status}`;
      }
      if (s.provider_workout_id) {
        const r = await deleteGarminWorkout(s.provider_workout_id, token);
        if (!r.success) return r.error ?? `workout delete ${r.status}`;
      }
      return null;
    };
    const createOnGarmin = async (d: WithPayload): Promise<{ workoutId: string; scheduleId: string } | string> => {
      const sent = await sendToGarmin(d.payload, token);
      if (typeof sent.status === 'number') await recordProviderResult(supabase, { provider: 'garmin', userId, status: sent.status, error: sent.success ? null : sent.error ?? null });
      if (!sent.success || !sent.workoutId) return sent.error ?? 'Garmin returned no workout id';
      const sched = await scheduleWorkoutOnDate({ garminWorkoutId: String(sent.workoutId), date: d.date, accessToken: token });
      if (!sched.success || !sched.scheduleId) {
        await deleteGarminWorkout(String(sent.workoutId), token);
        return sched.error ?? 'Garmin returned no schedule id';
      }
      return { workoutId: String(sent.workoutId), scheduleId: String(sched.scheduleId) };
    };

    for (const s of actions.remove.filter((x) => x.provider === 'garmin')) {
      const err = await removeOnGarmin(s);
      if (err) { report.retry = true; report.errors.push({ provider: 'garmin', planned_workout_id: s.planned_workout_id, message: err }); continue; }
      await dropDelivery(s);
      report.removed += 1;
    }
    // A changed workout on Garmin is replaced: delete the old copy, then create the new one.
    for (const u of actions.update.filter((x) => x.desired.provider === 'garmin')) {
      const err = await removeOnGarmin(u.delivery);
      if (err) { report.retry = true; report.errors.push({ provider: 'garmin', planned_workout_id: u.desired.planned_workout_id, message: err }); continue; }
      await dropDelivery(u.delivery);
      const made = await createOnGarmin(u.desired);
      if (typeof made === 'string') { report.retry = true; report.errors.push({ provider: 'garmin', planned_workout_id: u.desired.planned_workout_id, message: made }); continue; }
      await saveDelivery(u.desired, made.workoutId, made.scheduleId);
      report.updated += 1;
    }
    for (const d of actions.create.filter((x) => x.provider === 'garmin')) {
      const made = await createOnGarmin(d);
      if (typeof made === 'string') { report.retry = true; report.errors.push({ provider: 'garmin', planned_workout_id: d.planned_workout_id, message: made }); continue; }
      await saveDelivery(d, made.workoutId, made.scheduleId);
      report.created += 1;
    }
  }

  return report;
}
