/* global Deno */
// Supabase Edge Function: import-garmin-history
// Purpose: Import Garmin historical data by chunking into 24h windows and calling backfill
// Method: POST
// Body: { token: string, days?: number, garminUserId?: string }

const GARMIN_APIS_BASE = 'https://apis.garmin.com';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recordProviderResult } from '../_shared/connection-health.ts';

/**
 * Connection health (docs/WORKORDER-plumbing-2026-09-07.md §4). The body carries the token, not the
 * athlete, so the athlete is read off the caller's JWT; with no verifiable user the write is skipped.
 */
async function reportGarminHealth(req: Request, status: number, error: string | null): Promise<void> {
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await supabase.auth.getUser(jwt);
    const userId = data?.user?.id;
    if (!userId) return;
    await recordProviderResult(supabase, { provider: 'garmin', userId, status, error });
  } catch (e) {
    console.warn('[import-garmin-history] health write skipped:', (e as Error)?.message ?? e);
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type'
  };
}

async function fetchGarminUserId(token: string): Promise<string | null> {
  try {
    const resp = await fetch(`${GARMIN_APIS_BASE}/wellness-api/rest/user/id`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    return body?.userId || null;
  } catch {
    return null;
  }
}

function startOfUtcDaySeconds(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

async function triggerBackfillWindow(token: string, garminUserId: string, startTime: number, endTime: number) {
  // Try the backfill endpoint without userId param (might be inferred from token)
  const url = `${GARMIN_APIS_BASE}/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${startTime}&summaryEndTimeInSeconds=${endTime}`;
  
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return {
      status: resp.status,
      ok: resp.ok,
      startTime,
      endTime,
      response: resp.ok ? await resp.text() : await resp.text()
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      startTime,
      endTime,
      error: error.message
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors()
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed'
      }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...cors()
        }
      });
    }

    const { token, days = 90, garminUserId } = await req.json().catch(() => ({}));

    if (!token) {
      return new Response(JSON.stringify({
        error: 'Missing token'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...cors()
        }
      });
    }

    // Resolve Garmin user id if not provided
    let userId = garminUserId;
    if (!userId) {
      userId = await fetchGarminUserId(token);
      if (!userId) {
        return new Response(JSON.stringify({
          error: 'Unable to resolve Garmin user id'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...cors()
          }
        });
      }
    }

    const clampedDays = Math.max(1, Math.min(days, 180));
    const now = new Date();
    const results = [];

    // Windows of 30 days, newest first (2026-09-07). Garmin's backfill accepts at most 30 days per
    // request, so 90 days is three requests, not ninety one-day ones. A window that was already
    // requested comes back 409 and counts as done: Garmin delivers each activity once, through the
    // activities webhook, minutes later.
    const WINDOW_DAYS = 30;
    const endOfToday = startOfUtcDaySeconds(now) + 86400;
    for (let offset = 0; offset < clampedDays; offset += WINDOW_DAYS) {
      const span = Math.min(WINDOW_DAYS, clampedDays - offset);
      const endTime = endOfToday - offset * 86400;
      const startTime = endTime - span * 86400;

      const result = await triggerBackfillWindow(token, userId, startTime, endTime);
      if (result.status === 409) { result.ok = true; result.response = 'already requested'; }
      results.push(result);

      if (offset + WINDOW_DAYS < clampedDays) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    const successful = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    // Health: a 401/403 on any window means the token is dead; otherwise the last window's answer.
    const reauth = results.find(r => r.status === 401 || r.status === 403);
    const last = results[results.length - 1];
    if (reauth) await reportGarminHealth(req, reauth.status, `backfill/activities → ${reauth.status}`);
    else if (last) await reportGarminHealth(req, last.status, last.ok ? null : `backfill/activities → ${last.status}`);

    return new Response(JSON.stringify({
      ok: true,
      userId,
      days: clampedDays,
      windows: results.length,
      successful,
      failed,
      results: results.map(r => ({
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        ok: r.ok,
        message: r.response || r.error
      }))
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...cors()
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...cors()
      }
    });
  }
});
