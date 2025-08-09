/* global Deno */
// Supabase Edge Function: import-garmin-history
// Purpose: Import Garmin historical data by chunking into 24h windows and calling backfill
// Method: POST
// Body: { token: string, days?: number, garminUserId?: string }

const GARMIN_APIS_BASE = 'https://apis.garmin.com';

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

    // Process in 24-hour chunks
    for (let i = 0; i < clampedDays; i++) {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() - i);
      
      const startTime = startOfUtcDaySeconds(day);
      const endTime = startTime + 86400; // +24 hours
      
      const result = await triggerBackfillWindow(token, userId, startTime, endTime);
      results.push(result);
      
      // Add small delay between requests to avoid rate limiting
      if (i < clampedDays - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successful = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

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
