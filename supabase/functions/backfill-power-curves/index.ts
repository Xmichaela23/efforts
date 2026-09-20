/**
 * Backfill Power Curves
 *
 * Recomputes the per-workout analysis for rows whose `computed` is missing a field the current
 * analyser writes. It does not compute anything itself — it re-invokes `compute-workout-analysis`,
 * which is the one place an effort is measured.
 *
 * ⛔ WIDENED 2026-09-19 (WORKORDER-record-efforts stage 1). It used to ask one question per sport:
 * does the ride have a `power_curve`, does the run have `best_efforts`. Both were true on every row
 * the moment the first backfill finished, so the new record fields would never have been reached and
 * a second backfill would have been written beside this one. It now asks whether the row is missing
 * ANY field this version writes, and a row that already has them all is skipped.
 *
 * Newest first, resumable through `offset` — the response hands back the next one.
 *
 * Usage: POST /backfill-power-curves
 * Body: { "days_back": 60, "dry_run": false, "limit": 10, "offset": 0 }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
// The stamp `compute-workout-analysis` writes. One constant, so the two can never disagree.
import { ANALYSIS_VERSION } from '../_shared/analysis-version.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const daysBack = body.days_back || 60;
    const dryRun = body.dry_run === true;
    const limit = body.limit || 10; // Smaller batches to avoid timeout
    const offset = body.offset || 0; // For pagination

    console.log(`🔄 Backfill request: ${daysBack} days, dry_run=${dryRun}, limit=${limit}, offset=${offset}`);

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Find workouts needing backfill
    // - Has sensor_data (so there are samples to measure)
    // - Is a bike or run
    // - Is missing at least one field the current analyser writes
    const { data: workouts, error: queryError, count } = await supabase
      .from('workouts')
      .select('id, name, date, type, computed', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .in('type', ['ride', 'run', 'cycling', 'running', 'bike'])
      .not('sensor_data', 'is', null)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    /**
     * The fields the current analyser writes, per sport. A row missing any one of them is recomputed.
     *
     * ⚠️ A LONG RIDE WITH NO POWER METER HAS NO `power_curve`, AND THAT IS THE RIGHT ANSWER — so the
     * absence of a field cannot mean "not computed yet" on its own. `computed.analysis.version` is
     * what says which analyser last ran: a row stamped with the current version has been measured by
     * this code and is skipped whatever it holds. A row below it, or with no stamp, is recomputed once.
     */
    const RIDE_FIELDS = ['power_curve', 'ride_records'];
    const RUN_FIELDS = ['best_efforts', 'pace_curve', 'hr_curve', 'run_best_distances', 'run_records'];

    const needsBackfill = (workouts || []).filter(w => {
      const computed = w.computed || {};
      const type = (w.type || '').toLowerCase();
      if (computed?.analysis?.version === ANALYSIS_VERSION) return false;

      if (type === 'ride' || type === 'cycling' || type === 'bike') {
        return RIDE_FIELDS.some(f => computed[f] == null);
      }
      if (type === 'run' || type === 'running') {
        return RUN_FIELDS.some(f => computed[f] == null);
      }
      return false;
    });

    console.log(`📊 Found ${workouts?.length || 0} workouts in batch, ${needsBackfill.length} need backfill, ${count} total`);

    const hasMore = (offset + limit) < (count || 0);
    const nextOffset = offset + limit;

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        total_in_range: count || 0,
        batch_size: workouts?.length || 0,
        needs_backfill: needsBackfill.length,
        offset,
        has_more: hasMore,
        next_offset: hasMore ? nextOffset : null,
        workouts: needsBackfill.map(w => ({
          id: w.id,
          name: w.name,
          date: w.date,
          type: w.type
        }))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process each workout
    const results: { id: string; name: string; status: string; error?: string }[] = [];
    
    for (const workout of needsBackfill) {
      try {
        console.log(`⚙️ Processing: ${workout.name} (${workout.date})`);
        
        const { error: invokeError } = await supabase.functions.invoke('compute-workout-analysis', {
          body: { workout_id: workout.id }
        });

        if (invokeError) {
          results.push({ 
            id: workout.id, 
            name: workout.name, 
            status: 'error', 
            error: invokeError.message 
          });
        } else {
          results.push({ 
            id: workout.id, 
            name: workout.name, 
            status: 'success' 
          });
        }

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err: any) {
        results.push({ 
          id: workout.id, 
          name: workout.name, 
          status: 'error', 
          error: err.message 
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Backfill batch complete: ${successCount} success, ${errorCount} errors`);

    return new Response(JSON.stringify({
      dry_run: false,
      processed: results.length,
      success: successCount,
      errors: errorCount,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
      message: hasMore 
        ? `Batch complete. Run again with offset=${nextOffset} to continue.`
        : 'All workouts processed!',
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

