/**
 * Backfill Adaptation Metrics (cheap lane)
 *
 * Populates workouts.computed.adaptation by invoking compute-adaptation-metrics
 * in small batches to avoid timeouts.
 *
 * Usage: POST /backfill-adaptation-metrics
 * Body: { days_back?: number, dry_run?: boolean, limit?: number, offset?: number }
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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Only run + strength are currently meaningful for adaptation metrics
    const allowedTypes = ['run', 'running', 'walk', 'hike', 'strength', 'strength_training'];

    // Find workouts missing computed.adaptation (small page)
    const { data: workouts, error: queryError, count } = await supabase
      .from('workouts')
      .select('id,name,date,type,computed', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('workout_status', 'completed')
      .gte('date', startDateStr)
      .in('type', allowedTypes)
      // PostgREST supports JSON path; this matches workouts where computed.adaptation is NULL / absent
      .is('computed->adaptation', null)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (queryError) throw new Error(`Query failed: ${queryError.message}`);

    const batch = Array.isArray(workouts) ? workouts : [];
    const total = count ?? 0;
    const hasMore = (offset + limit) < total;
    const nextOffset = offset + limit;

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          days_back: daysBack,
          start_date: startDateStr,
          total_missing: total,
          batch_size: batch.length,
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
        processed: results.length,
        success: successCount,
        errors: errorCount,
        offset,
        has_more: hasMore,
        next_offset: hasMore ? nextOffset : null,
        message: hasMore ? `Batch complete. Run again with offset=${nextOffset} to continue.` : 'All missing workouts processed!',
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

