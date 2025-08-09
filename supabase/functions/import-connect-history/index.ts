/* global Deno */
// Supabase Edge Function: import-connect-history
// Purpose: Import Garmin historical data using Connect API (not Wellness backfill)
// Method: POST
// Body: { token: string, days?: number }

const GARMIN_CONNECT_BASE = 'https://connectapi.garmin.com';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type'
  };
}

async function fetchActivitiesPage(token: string, start: number, limit: number) {
  // Use Connect API to get activity list
  const url = `${GARMIN_CONNECT_BASE}/modern/proxy/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`;
  
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: await resp.text()
      };
    }
    
    const activities = await resp.json();
    return {
      ok: true,
      activities: Array.isArray(activities) ? activities : []
    };
  } catch (error) {
    return {
      ok: false,
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

    const { token, days = 30 } = await req.json().catch(() => ({}));

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

    // Connect API doesn't have 24h limits like Wellness
    // Just fetch activities in pages
    const limit = 50; // Activities per page
    const maxActivities = days * 2; // Assume max 2 activities per day
    const results = [];
    let totalActivities = 0;

    // Fetch in pages until we have enough
    for (let start = 0; totalActivities < maxActivities; start += limit) {
      const result = await fetchActivitiesPage(token, start, limit);
      
      if (!result.ok) {
        results.push({
          page: Math.floor(start / limit),
          error: result.error,
          status: result.status
        });
        break;
      }

      const activities = result.activities || [];
      if (activities.length === 0) {
        // No more activities
        break;
      }

      totalActivities += activities.length;
      results.push({
        page: Math.floor(start / limit),
        count: activities.length,
        activities: activities.slice(0, 5) // Just return first 5 as sample
      });

      // If we got less than limit, we're at the end
      if (activities.length < limit) {
        break;
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(JSON.stringify({
      ok: true,
      totalActivities,
      pages: results.length,
      results
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
