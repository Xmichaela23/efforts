/**
 * intervals-activity-probe — READ-ONLY look at one athlete's Intervals.icu activities, ahead of the activity import
 * (2026-09-15, Michael: "go on the read-only server function and the check against my real Intervals.icu activities").
 *
 * ⛔ WRITES NOTHING. Service-role key only (the Intervals.icu credential is decrypted with a key that exists only as an
 * edge-function secret, so this check cannot run from a laptop). No token or key is ever returned.
 *
 * Body: { user_id, oldest?: 'YYYY-MM-DD' (default 16 weeks back), activity_id?: string }
 * Returns:
 *   · list: how many activities, by type / source / device, which come back as Strava stubs, the field names one
 *     activity carries;
 *   · one run or ride not from Strava (or `activity_id`): Intervals.icu's own totals and interval list, and the same
 *     activity's .fit file parsed by the upload parser (`import-fit-file/parse.ts`) — totals and laps — side by side.
 *
 * Endpoints from the OpenAPI document at https://intervals.icu/api/v1/docs (read 2026-09-15):
 *   GET /api/v1/athlete/{id}/activities?oldest=&newest=
 *   GET /api/v1/activity/{id}?intervals=true
 *   GET /api/v1/activity/{id}/fit-file
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveUser } from '../_shared/require-user.ts';
import { decryptToken } from '../_shared/token-crypto.ts';
import { parseFitBuffer, workoutFromFit } from '../import-fit-file/parse.ts';

const BASE = 'https://intervals.icu/api/v1';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { isService } = await resolveUser(req);
    if (!isService) return json({ error: 'forbidden' }, 403);
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id || '');
    if (!userId) return json({ error: 'user_id required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: c } = await supabase.from('user_connections').select('access_token, connection_data')
      .eq('user_id', userId).eq('provider', 'intervals_icu').maybeSingle();
    if (!c?.access_token) return json({ error: 'no Intervals.icu connection' }, 404);
    const secret = await decryptToken(c.access_token);
    const athleteId = String(c.connection_data?.athlete_id ?? '');
    const auth = c.connection_data?.auth === 'oauth' ? `Bearer ${secret}` : `Basic ${btoa(`API_KEY:${secret}`)}`;
    const get = async (path: string) => {
      const r = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
      return { status: r.status, rate: r.headers.get('X-RateLimit-Remaining'), r };
    };

    const oldest = String(body?.oldest || new Date(Date.now() - 112 * 86400000).toISOString().slice(0, 10));
    const newest = new Date().toISOString().slice(0, 10);
    const listRes = await get(`/athlete/${encodeURIComponent(athleteId)}/activities?oldest=${oldest}&newest=${newest}`);
    const list = listRes.status === 200 ? await listRes.r.json() : [];
    const tally = (key: (a: any) => unknown) => {
      const m: Record<string, number> = {};
      for (const a of list) { const k = String(key(a) ?? '—'); m[k] = (m[k] ?? 0) + 1; }
      return m;
    };
    const isStub = (a: any) => String(a?.source || '').toUpperCase() === 'STRAVA' || a?._note != null;
    const summary = {
      status: listRes.status,
      rate_remaining: listRes.rate,
      oldest, newest,
      count: list.length,
      by_type: tally((a) => a?.type),
      by_source: tally((a) => a?.source),
      by_device: tally((a) => a?.device_name),
      strava_stubs: list.filter(isStub).length,
      field_names_of_one_activity: list[0] ? Object.keys(list.find((a: any) => !isStub(a)) ?? list[0]).sort() : [],
      stub_example: list.find(isStub) ?? null,
      activities: list.slice(0, 60).map((a: any) => ({ id: a.id, start: a.start_date_local, type: a.type, source: a.source, device: a.device_name, distance_m: a.distance, moving_s: a.moving_time, elapsed_s: a.elapsed_time, external_id: a.external_id ?? null })),
    };

    const wanted = body?.activity_id
      ? list.find((a: any) => String(a.id) === String(body.activity_id)) ?? { id: body.activity_id }
      : list.find((a: any) => !isStub(a) && /run|ride/i.test(String(a?.type || '')));
    let one: any = null;
    if (wanted?.id) {
      const detRes = await get(`/activity/${encodeURIComponent(wanted.id)}?intervals=true`);
      const det = detRes.status === 200 ? await detRes.r.json() : null;
      const ivs = Array.isArray(det?.icu_intervals) ? det.icu_intervals : [];
      const fitRes = await get(`/activity/${encodeURIComponent(wanted.id)}/fit-file`);
      let fit: any = { status: fitRes.status, content_type: fitRes.r.headers.get('content-type') };
      if (fitRes.status === 200) {
        let bytes = new Uint8Array(await fitRes.r.arrayBuffer());
        fit.bytes = bytes.length;
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
          fit.gzip = true;
        }
        try {
          const data = await parseFitBuffer(bytes);
          const w = workoutFromFit(data, 'probe');
          fit = {
            ...fit,
            type: w.type, date: w.date, distance_km: w.distance, duration_s: w.duration,
            timer_s: w.moving_time ?? null, elapsed_s: w.elapsed_time ?? null,
            avg_speed: w.metrics?.avg_speed ?? null, device: w.deviceInfo ?? null,
            samples: w.sensor_data?.samples?.length ?? 0, gps_points: w.gps_track?.length ?? 0,
            laps: (w.laps ?? []).map((L: any, k: number) => ({ n: k + 1, start: L.startTimeInSeconds, elapsed_s: L.totalElapsedTimeInSeconds, timer_s: L.totalTimerTimeInSeconds, distance_m: L.totalDistanceInMeters })),
          };
        } catch (e) {
          fit.parse_error = (e as Error).message;
        }
      } else {
        fit.body = (await fitRes.r.text()).slice(0, 300);
      }
      one = {
        id: wanted.id,
        detail_status: detRes.status,
        intervals_icu: det ? {
          type: det.type, source: det.source, device: det.device_name, start: det.start_date_local,
          distance_m: det.distance, moving_s: det.moving_time, elapsed_s: det.elapsed_time,
          average_speed_mps: det.average_speed ?? null, icu_lap_count: det.icu_lap_count ?? null,
          intervals: ivs.map((i: any) => ({ label: i.label ?? null, type: i.type ?? null, start_index: i.start_index, end_index: i.end_index, distance_m: i.distance, moving_s: i.moving_time, elapsed_s: i.elapsed_time })),
        } : null,
        fit_file: fit,
        rate_remaining: fitRes.rate,
      };
    }
    return json({ list: summary, activity: one });
  } catch (e) {
    return json({ error: (e as Error).message }, (e as any)?.status ?? 500);
  }
});
