// @ts-nocheck
// garmin-webhook-user — Garmin's user-level notifications (docs/WORKORDER-garmin-partner-readiness-2026-09-07.md §1).
//
// Registered in the Garmin developer portal as the endpoint for two notification types:
//
//   { deregistrations: [{ userId, userAccessToken? }] }
//       The user removed efforts in Garmin Connect. Garmin requires the partner to stop pulling and delete
//       that user's Garmin data. We: find our user through the stored Garmin user id, delete the Garmin
//       connection rows, delete every Garmin-sourced workout and its dependent rows (by workout id: the
//       user keeps the account, only Garmin-sourced data goes), delete the garmin_activities rows, and
//       write a connection_events row.
//
//   { userPermissionsChange: [{ userId, permissions: [...] }] }
//       The user narrowed what we may read. We store the list on the connection row
//       (connection_data.garmin_permissions). The activities webhook checks it before fetching details:
//       no ACTIVITY_EXPORT → the activity is skipped.
//
// Auth: verify_jwt=false (Garmin sends no JWT). The URL carries `?k=<GARMIN_WEBHOOK_SECRET>`; without it
// the reply is 401 (strict: this endpoint never had a bare URL). Always reply 200 fast, then do the work
// after the reply (EdgeRuntime.waitUntil, the same shape as strava-webhook / endurance-checkpoint).
import { checkWebhookSecret } from '../_shared/webhook-secret.ts';
import { logConnectionEvent, serviceClient } from '../_shared/provider-deregister.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const auth = checkWebhookSecret(req, null);
  if (!auth.ok) {
    console.warn(JSON.stringify({ event: 'garmin_webhook_user_refused', mode: auth.mode }));
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  console.log(JSON.stringify({ event: 'garmin_webhook_user', auth: auth.mode, keys: Object.keys(payload ?? {}) }));

  const work = handle(payload).catch((e) => console.error('garmin-webhook-user failed:', `${e}`));
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil as ((p: Promise<unknown>) => void) | undefined;
  if (waitUntil) waitUntil(work); else await work;

  return new Response('OK', { status: 200 });
});

async function handle(payload) {
  const supabase = serviceClient();
  const deregs = Array.isArray(payload?.deregistrations) ? payload.deregistrations : [];
  const perms = Array.isArray(payload?.userPermissionsChange) ? payload.userPermissionsChange
    : Array.isArray(payload?.userPermissionChange) ? payload.userPermissionChange : [];

  for (const d of deregs) {
    const garminUserId = String(d?.userId ?? '').trim();
    if (!garminUserId) continue;
    const users = await usersForGarminId(supabase, garminUserId);
    if (users.length === 0) {
      console.log(JSON.stringify({ event: 'garmin_deregistration_unmatched', garmin_user_id: garminUserId }));
      await logConnectionEvent(supabase, { user_id: null, provider: 'garmin', event: 'deregistration', detail: { garmin_user_id: garminUserId, matched: false } });
      continue;
    }
    for (const userId of users) {
      const counts = await deleteGarminData(supabase, userId, garminUserId);
      await logConnectionEvent(supabase, { user_id: userId, provider: 'garmin', event: 'deregistration', detail: { garmin_user_id: garminUserId, matched: true, deleted: counts } });
    }
  }

  for (const p of perms) {
    const garminUserId = String(p?.userId ?? '').trim();
    if (!garminUserId) continue;
    const permissions = Array.isArray(p?.permissions) ? p.permissions.map(String) : [];
    const users = await usersForGarminId(supabase, garminUserId);
    for (const userId of users) {
      await storePermissions(supabase, userId, permissions);
      await logConnectionEvent(supabase, { user_id: userId, provider: 'garmin', event: 'permissions_change', detail: { garmin_user_id: garminUserId, permissions } });
    }
    if (users.length === 0) console.log(JSON.stringify({ event: 'garmin_permissions_unmatched', garmin_user_id: garminUserId }));
  }
}

/**
 * Our user ids for a Garmin user id. bright-service writes it to user_connections.connection_data.user_id;
 * older rows may carry connection_data.garmin_user_id; device_connections has provider_user_id.
 */
async function usersForGarminId(supabase, garminUserId: string): Promise<string[]> {
  const ids = new Set<string>();
  const q = async (table, col) => {
    const { data } = await supabase.from(table).select('user_id').eq('provider', 'garmin').eq(col, garminUserId);
    for (const r of data ?? []) if (r?.user_id) ids.add(r.user_id);
  };
  await q('user_connections', 'connection_data->>user_id');
  await q('user_connections', 'connection_data->>garmin_user_id');
  await q('device_connections', 'provider_user_id');
  await q('device_connections', 'connection_data->>user_id');
  return [...ids];
}

/** Every public table with a workout_id column, read from PostgREST at run time (same idea as delete_user_data's sweep). */
async function workoutIdTables(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  const spec = await res.json();
  const defs = spec?.definitions ?? {};
  return Object.keys(defs).filter((t) => t !== 'workouts' && defs[t]?.properties && 'workout_id' in defs[t].properties).sort();
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * Delete the user's Garmin-sourced data, nothing else:
 *   1. workouts with garmin_activity_id → their dependents in every workout_id table, then the workouts
 *      (planned_workouts.completed_workout_id pointing at them is cleared so no plan row points at a ghost)
 *   2. garmin_activities for the user / the Garmin user id
 *   3. the garmin rows in user_connections and device_connections (stop pulling)
 * Returns per-table counts for the event row and the log.
 */
async function deleteGarminData(supabase, userId: string, garminUserId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (k, n) => { counts[k] = (counts[k] ?? 0) + (n ?? 0); };

  const { data: rows, error: wErr } = await supabase.from('workouts').select('id').eq('user_id', userId).not('garmin_activity_id', 'is', null);
  if (wErr) throw new Error(`workouts select: ${wErr.message}`);
  const ids = (rows ?? []).map((r) => r.id);

  if (ids.length > 0) {
    const tables = await workoutIdTables();
    for (const t of tables) {
      for (const part of chunk(ids, 200)) {
        const { data, error } = await supabase.from(t).delete().in('workout_id', part).select('workout_id');
        if (error) { console.warn(`delete ${t} by workout_id: ${error.message}`); continue; }
        bump(t, data?.length ?? 0);
      }
    }
    for (const part of chunk(ids, 200)) {
      const { data } = await supabase.from('planned_workouts').update({ completed_workout_id: null }).in('completed_workout_id', part).select('id');
      bump('planned_workouts.completed_workout_id cleared', data?.length ?? 0);
      const { data: del, error } = await supabase.from('workouts').delete().in('id', part).select('id');
      if (error) throw new Error(`workouts delete: ${error.message}`);
      bump('workouts', del?.length ?? 0);
    }
  } else {
    counts.workouts = 0;
  }

  const ga1 = await supabase.from('garmin_activities').delete().eq('user_id', userId).select('id');
  bump('garmin_activities', ga1.data?.length ?? 0);
  const ga2 = await supabase.from('garmin_activities').delete().eq('garmin_user_id', garminUserId).select('id');
  bump('garmin_activities', ga2.data?.length ?? 0);

  const uc = await supabase.from('user_connections').delete().eq('user_id', userId).eq('provider', 'garmin').select('id');
  bump('user_connections', uc.data?.length ?? 0);
  const dc = await supabase.from('device_connections').delete().eq('user_id', userId).eq('provider', 'garmin').select('id');
  bump('device_connections', dc.data?.length ?? 0);

  console.log(JSON.stringify({ event: 'garmin_data_deleted', user_id: userId, garmin_user_id: garminUserId, counts }));
  return counts;
}

/** Store the permission list on every garmin connection row the user has (both tables). */
async function storePermissions(supabase, userId: string, permissions: string[]) {
  const at = new Date().toISOString();
  for (const table of ['user_connections', 'device_connections']) {
    const { data } = await supabase.from(table).select('id, connection_data').eq('user_id', userId).eq('provider', 'garmin');
    for (const row of data ?? []) {
      const connection_data = { ...(row.connection_data ?? {}), garmin_permissions: permissions, garmin_permissions_at: at };
      const { error } = await supabase.from(table).update({ connection_data }).eq('id', row.id);
      if (error) console.warn(`${table} permissions update: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ event: 'garmin_permissions_stored', user_id: userId, permissions }));
}
