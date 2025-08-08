// Supabase Edge Function: swift-task
// Purpose: Safe proxy for a limited set of Garmin Activities API endpoints
// Usage (GET):
//  /functions/v1/swift-task?path=/modern/proxy/activitylist-service/activities/search/activities?start=0&limit=100&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&token=GARMIN_ACCESS_TOKEN
//  /functions/v1/swift-task?path=/modern/proxy/activity-service/activity/{activityId}&token=GARMIN_ACCESS_TOKEN

// Notes:
// - Only whitelisted paths are allowed
// - Requires a valid `token` (Garmin OAuth access token) provided by the client
// - This function simply forwards the request and returns the upstream response

const GARMIN_BASE = 'https://connectapi.garmin.com';

function isAllowedPath(path: string): boolean {
  // Restrict to read-only activity endpoints we need
  return (
    path.startsWith('/modern/proxy/activitylist-service/activities/search/activities') ||
    path.startsWith('/modern/proxy/activity-service/activity/')
  );
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';
    const token = url.searchParams.get('token') || '';

    if (!path) {
      return new Response(JSON.stringify({ error: 'Missing required query param: path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing required query param: token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedPath(path)) {
      return new Response(JSON.stringify({ error: 'Path not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const target = `${GARMIN_BASE}${path}`;

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
      },
    });

    // Pass-through status and body
    const contentType = upstream.headers.get('Content-Type') || 'application/json';
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

