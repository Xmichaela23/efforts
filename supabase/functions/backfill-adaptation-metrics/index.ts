/**
 * Backfill Adaptation Metrics (cheap lane)
 *
 * Populates workouts.computed.adaptation by invoking compute-adaptation-metrics
 * in small batches to avoid timeouts.
 *
 * Usage: POST /backfill-adaptation-metrics
 * Body: { days_back?: number, dry_run?: boolean, limit?: number, offset?: number, force_recompute?: boolean }
 *
 * Notes:
 * - Uses the authenticated user from the bearer token to scope the backfill.
 * - Safe to rerun (skips workouts that already have computed.adaptation).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get auth user (scope backfill to caller)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = authData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const daysBack = Number(body?.days_back ?? 183);
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Math.max(Number(body?.limit ?? 25), 1), 50); // 1..50
    const offset = Math.max(Number(body?.offset ?? 0), 0);
    const forceRecompute = body?.force_recompute === true;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Only run + strength are currently meaningful for adaptation metrics
    const allowedTypes = ['run', 'running', 'walk', 'hike', 'strength', 'strength_training'];

    // Fetch a small page in date range (filtering done below)
    const baseQuery = supabase
      .from('workouts')
      .select('id,name,date,type,computed', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('workout_status', 'completed')
      .gte('date', startDateStr)
      .in('type', allowedTypes)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Default mode: only process missing computed.adaptation
    const { data: workouts, error: queryError, count } = forceRecompute
      ? await baseQuery
      : await baseQuery.is('computed->adaptation', null);

    if (queryError) throw new Error(`Query failed: ${queryError.message}`);

    const rawBatch = Array.isArray(workouts) ? workouts : [];
    const total = count ?? 0;
    const hasMore = (offset + limit) < total;
    const nextOffset = offset + limit;

    // Decide which records need (re)compute
    const batch = rawBatch.filter((w: any) => {
      const computed = w?.computed && typeof w.computed === 'string' ? (() => { try { return JSON.parse(w.computed); } catch { return {}; } })() : (w?.computed || {});
      const adaptation = computed?.adaptation;
      const workoutType = adaptation?.workout_type ?? null;
      if (!forceRecompute) {
        // already filtered by SQL; keep all
        return true;
      }
      // force mode: refresh only missing/null/non_comparable
      if (!adaptation) return true;
      if (workoutType == null) return true;
      if (workoutType === 'non_comparable') return true;
      return false;
    });

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          days_back: daysBack,
          start_date: startDateStr,
          force_recompute: forceRecompute,
          total_in_range: total,
          batch_size: rawBatch.length,
          will_process: batch.length,
          offset,
          has_more: hasMore,
          next_offset: hasMore ? nextOffset : null,
          workouts: batch.map((w) => ({ id: w.id, name: w.name, date: w.date, type: w.type })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ id: string; name?: string; date?: string; type?: string; status: 'success' | 'error'; error?: string }> = [];

    for (const w of batch) {
      try {
        const { error: invokeError } = await supabase.functions.invoke('compute-adaptation-metrics', {
          body: { workout_id: w.id },
        });
        if (invokeError) {
          results.push({ id: w.id, name: w.name, date: w.date, type: w.type, status: 'error', error: invokeError.message });
        } else {
          results.push({ id: w.id, name: w.name, date: w.date, type: w.type, status: 'success' });
        }
      } catch (e: any) {
        results.push({ id: w.id, name: w.name, date: w.date, type: w.type, status: 'error', error: e?.message || String(e) });
      }

      // Gentle rate limiting to keep within function timeouts
      await sleep(120);
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    return new Response(
      JSON.stringify({
        dry_run: false,
        days_back: daysBack,
        start_date: startDateStr,
        force_recompute: forceRecompute,
        processed: results.length,
        success: successCount,
        errors: errorCount,
        offset,
        has_more: hasMore,
        next_offset: hasMore ? nextOffset : null,
        message: hasMore ? `Batch complete. Run again with offset=${nextOffset} to continue.` : (forceRecompute ? 'All workouts scanned!' : 'All missing workouts processed!'),
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[backfill-adaptation-metrics] error:', error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

