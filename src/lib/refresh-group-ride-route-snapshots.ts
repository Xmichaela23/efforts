import { supabase, getStoredUserId, invokeFunction } from '@/lib/supabase';
import type { GroupRideRouteSnapshot } from '@/lib/group-ride-route-snapshot';
import { stravaRouteUrlLooksFetchable } from '@/lib/group-ride-route-snapshot';

function normalizeRouteUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim().slice(0, 512);
  if (!t) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.href.slice(0, 512);
  } catch {
    return undefined;
  }
}

export type RefreshGroupRideSnapshotsResult = {
  urls_attempted: number;
  goals_updated: number;
  snapshots_applied: number;
  errors: string[];
};

/**
 * For active/paused event goals with a Strava routes URL but missing or stale
 * `group_ride_route_snapshot`, call `fetch-strava-route` and persist the snapshot on each goal.
 * Run after Strava OAuth so cold-start URL paste gets topography without revisiting Arc wizard.
 */
export async function refreshGroupRideRouteSnapshotsForUser(): Promise<RefreshGroupRideSnapshotsResult> {
  const out: RefreshGroupRideSnapshotsResult = {
    urls_attempted: 0,
    goals_updated: 0,
    snapshots_applied: 0,
    errors: [],
  };

  const userId = getStoredUserId();
  if (!userId) {
    out.errors.push('Not signed in');
    return out;
  }

  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, training_prefs')
    .eq('user_id', userId)
    .eq('goal_type', 'event')
    .in('status', ['active', 'paused']);

  if (error) {
    out.errors.push(error.message);
    return out;
  }
  if (!goals?.length) return out;

  type Row = { id: string; training_prefs: Record<string, unknown> | null };
  const rows = goals as Row[];

  const urlToGoalIds = new Map<string, Set<string>>();

  for (const r of rows) {
    const tp = r.training_prefs;
    if (!tp || typeof tp !== 'object' || Array.isArray(tp)) continue;
    const url = normalizeRouteUrl(tp.group_ride_route_url ?? tp.groupRideRouteUrl);
    if (!url || !stravaRouteUrlLooksFetchable(url)) continue;

    const snapRaw = tp.group_ride_route_snapshot ?? tp.groupRideRouteSnapshot;
    const snapOk =
      snapRaw &&
      typeof snapRaw === 'object' &&
      !Array.isArray(snapRaw) &&
      typeof (snapRaw as GroupRideRouteSnapshot).route_url_normalized === 'string' &&
      (snapRaw as GroupRideRouteSnapshot).route_url_normalized === url;

    if (snapOk) continue;

    if (!urlToGoalIds.has(url)) urlToGoalIds.set(url, new Set());
    urlToGoalIds.get(url)!.add(r.id);
  }

  for (const [url, goalIdSet] of urlToGoalIds) {
    out.urls_attempted += 1;

    const { data, error: invErr } = await invokeFunction<{
      success?: boolean;
      snapshot?: GroupRideRouteSnapshot;
      error?: string;
      needs_strava_connect?: boolean;
    }>('fetch-strava-route', { route_url: url });

    if (invErr) {
      out.errors.push(invErr.message);
      continue;
    }

    const body = data as Record<string, unknown> | null;
    if (!body || body.success !== true || body.snapshot == null) {
      const msg =
        typeof body?.error === 'string'
          ? body.error
          : body?.needs_strava_connect === true
            ? 'Connect Strava first'
            : 'Route fetch failed';
      out.errors.push(msg);
      continue;
    }

    const snapshot = body.snapshot as GroupRideRouteSnapshot;
    out.snapshots_applied += 1;

    for (const goalId of goalIdSet) {
      const row = rows.find((x) => x.id === goalId);
      const prev =
        row?.training_prefs && typeof row.training_prefs === 'object' && !Array.isArray(row.training_prefs)
          ? { ...row.training_prefs }
          : {};
      const training_prefs = { ...prev, group_ride_route_snapshot: snapshot };

      const { error: upErr } = await supabase
        .from('goals')
        .update({ training_prefs })
        .eq('id', goalId)
        .eq('user_id', userId);

      if (upErr) out.errors.push(`${goalId}: ${upErr.message}`);
      else out.goals_updated += 1;
    }
  }

  try {
    window.dispatchEvent(new CustomEvent('goals:invalidate'));
  } catch {
    void 0;
  }

  return out;
}
