import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authenticatedSubFromBearer } from '../_shared/bearer-auth.ts';
import { ensureStravaAccessToken } from '../_shared/strava-access-token.ts';
import {
  normalizeHttpsUrlMax512,
  parseStravaRouteIdFromUrl,
  snapshotFromStravaRouteApi,
  type GroupRideRouteSnapshot,
} from '../_shared/group-ride-route-snapshot.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const userId = authenticatedSubFromBearer(req);
    if (!userId) {
      return json({ success: false, error: 'Sign in required (Authorization: Bearer …).' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as { route_url?: unknown };
    const route_url = typeof body.route_url === 'string' ? body.route_url : '';

    const normalized = normalizeHttpsUrlMax512(route_url);
    if (!normalized) {
      return json({ success: false, error: 'route_url must be a valid https URL.' }, 400);
    }

    const routeId = parseStravaRouteIdFromUrl(normalized);
    if (routeId == null) {
      return json({
        success: false,
        error: 'Not a Strava routes URL — expected a path like /routes/<numeric id>.',
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const tokenRes = await ensureStravaAccessToken(supabase, userId);
    if (!tokenRes.ok) {
      return json({
        success: false,
        needs_strava_connect: true,
        error: tokenRes.error,
      }, 200);
    }

    const r = await fetch(`https://www.strava.com/api/v3/routes/${routeId}`, {
      headers: { Authorization: `Bearer ${tokenRes.accessToken}` },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.warn('[fetch-strava-route] Strava routes GET failed', r.status, txt.slice(0, 300));
      return json(
        {
          success: false,
          error:
            r.status === 404
              ? 'Route not found or not visible with your Strava account.'
              : `Strava route fetch failed (${r.status}).`,
        },
        200,
      );
    }

    const routeJson = (await r.json()) as Record<string, unknown>;
    const snapshot = snapshotFromStravaRouteApi(routeJson, normalized);
    if (!snapshot) {
      return json({ success: false, error: 'Strava returned an unreadable route payload.' }, 200);
    }

    const out: { success: true; snapshot: GroupRideRouteSnapshot } = {
      success: true,
      snapshot,
    };
    return json(out);
  } catch (e) {
    console.error('[fetch-strava-route]', e);
    return json({ success: false, error: String(e) }, 500);
  }
});
