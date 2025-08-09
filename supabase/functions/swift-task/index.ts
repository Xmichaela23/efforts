/* global Deno */
// Declare Deno for TypeScript in this project context (Edge runtime provides it at runtime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// Supabase Edge Function: swift-task
// Purpose: Safe proxy for a limited set of Garmin Activities API endpoints
// Usage (GET):
//  /functions/v1/swift-task?path=/modern/proxy/activitylist-service/activities/search/activities?start=0&limit=100&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&token=GARMIN_ACCESS_TOKEN
//  /functions/v1/swift-task?path=/modern/proxy/activity-service/activity/{activityId}&token=GARMIN_ACCESS_TOKEN
//  /functions/v1/swift-task?path=/wellness-api/rest/backfill/activities&summaryStartTimeInSeconds=UNIX&summaryEndTimeInSeconds=UNIX&token=GARMIN_ACCESS_TOKEN

// Notes:
// - Only whitelisted paths are allowed
// - Requires a valid `token` (Garmin OAuth access token) provided by the client
// - This function simply forwards the request and returns the upstream response

const GARMIN_CONNECT_BASE = 'https://connectapi.garmin.com';
const GARMIN_APIS_BASE = 'https://apis.garmin.com';

function getBaseForPath(path: string): string {
  // Wellness endpoints live on apis.garmin.com; modern/proxy lives on connectapi.garmin.com
  if (path.startsWith('/wellness-api/')) return GARMIN_APIS_BASE;
  return GARMIN_CONNECT_BASE;
}

function isAllowedPath(path: string): boolean {
  // Restrict to read-only activity endpoints we need
  return (
    // Modern proxy endpoints (listing + activity details)
    path.startsWith('/modern/proxy/activitylist-service/activities/search/activities') ||
    path.startsWith('/modern/proxy/activity-service/activity/') ||
    // Wellness endpoints for official backfill and reads
    path.startsWith('/wellness-api/rest/activities') ||
    path.startsWith('/wellness-api/rest/activityDetails') ||
    path.startsWith('/wellness-api/rest/backfill/activities') ||
    path.startsWith('/wellness-api/rest/user/permissions') ||
    path.startsWith('/wellness-api/rest/user/id')
  );
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  } as Record<string, string>;
}

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';
    const token = url.searchParams.get('token') || '';

    if (!path) {
      return new Response(JSON.stringify({ error: 'Missing required query param: path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing required query param: token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (!isAllowedPath(path)) {
      return new Response(JSON.stringify({ error: 'Path not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const targetBase = getBaseForPath(path);
    const target = `${targetBase}${path}`;

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
      headers: { 'Content-Type': contentType, ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});

