/**
 * Bulk Re-analyze Workouts
 *
 * Re-runs workout analysis for existing workouts to populate new fields
 * like HR drift, terrain-adjusted metrics, etc.
 *
 * Usage: POST /bulk-reanalyze-workouts
 * Body: {
 *   days_back?: number (default 90),
 *   workout_type?: 'run' | 'strength' | 'cycling' | 'swim' | 'all' (default 'run'),
 *   dry_run?: boolean (default true),
 *   limit?: number (default 5, max 10),
 *   offset?: number (default 0),
 *   filter?: 'all' | 'missing_hr_drift' | 'missing_analysis' (default 'missing_hr_drift')
 * }
 *
 * Notes:
 * - Uses authenticated user from bearer token
 * - Safe to rerun (overwrites existing analysis)
 * - Processes in small batches to avoid timeouts
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

function getAnalysisFunctionName(workoutType: string): string | null {
  switch (workoutType.toLowerCase()) {
    case 'run':
    case 'running':
      return 'analyze-running-workout';
    case 'strength':
    case 'strength_training':
      return 'analyze-strength-workout';
    case 'ride':
    case 'cycling':
    case 'bike':
      return 'analyze-cycling-workout';
    case 'swim':
    case 'swimming':
      return 'analyze-swim-workout';
    default:
      return null;
  }
}

function getWorkoutTypesForFilter(filter: string): string[] {
  switch (filter.toLowerCase()) {
    case 'run':
    case 'running':
      return ['run', 'running'];
    case 'strength':
      return ['strength', 'strength_training'];
    case 'cycling':
    case 'bike':
    case 'ride':
      return ['ride', 'cycling', 'bike'];
    case 'swim':
    case 'swimming':
      return ['swim', 'swimming'];
    case 'all':
      return ['run', 'running', 'strength', 'strength_training', 'ride', 'cycling', 'bike', 'swim', 'swimming'];
    default:
      return ['run', 'running'];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get auth user
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
    const daysBack = Number(body?.days_back ?? 90);
    const workoutTypeFilter = String(body?.workout_type ?? 'run').toLowerCase();
    const dryRun = body?.dry_run !== false; // Default to true for safety
    const limit = Math.min(Math.max(Number(body?.limit ?? 10), 1), 25); // 1..25
    const offset = Math.max(Number(body?.offset ?? 0), 0);
    const filter = String(body?.filter ?? 'missing_hr_drift').toLowerCase();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const allowedTypes = getWorkoutTypesForFilter(workoutTypeFilter);

    console.log(`🔄 [BULK-REANALYZE] Starting: daysBack=${daysBack}, types=${allowedTypes.join(',')}, filter=${filter}, limit=${limit}, offset=${offset}`);

    // Build query based on filter type
    let query = supabase
      .from('workouts')
      .select('id, name, date, type, workout_analysis, planned_id', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('workout_status', 'completed')
      .gte('date', startDateStr)
      .in('type', allowedTypes)
      .order('date', { ascending: true }) // Process oldest first so historical comparisons work
      .range(offset, offset + limit - 1);

    const { data: workouts, error: queryError, count } = await query;

    if (queryError) throw new Error(`Query failed: ${queryError.message}`);

    const rawBatch = Array.isArray(workouts) ? workouts : [];
    const total = count ?? 0;

    // Apply filter logic
    const batch = rawBatch.filter((w: any) => {
      if (filter === 'all') return true;
      
      const analysis = w?.workout_analysis;
      
      if (filter === 'missing_analysis') {
        return !analysis || Object.keys(analysis).length === 0;
      }
      
      if (filter === 'missing_hr_drift') {
        // Check multiple possible locations for HR drift
        const hrDrift = 
          analysis?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
          analysis?.heart_rate_summary?.drift_bpm ??
          analysis?.detailed_analysis?.workout_summary?.hr_drift ??
          null;
        return hrDrift === null || hrDrift === undefined;
      }
      
      return true;
    });

    const hasMore = (offset + limit) < total;
    const nextOffset = offset + limit;

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          days_back: daysBack,
          start_date: startDateStr,
          workout_type: workoutTypeFilter,
          filter,
          total_in_range: total,
          batch_fetched: rawBatch.length,
          will_process: batch.length,
          offset,
          has_more: hasMore,
          next_offset: hasMore ? nextOffset : null,
          workouts: batch.map((w) => ({
            id: w.id,
            name: w.name,
            date: w.date,
            type: w.type,
            has_planned: !!w.planned_id,
            has_analysis: !!w.workout_analysis,
            has_hr_drift: !!(
              w.workout_analysis?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
              w.workout_analysis?.heart_rate_summary?.drift_bpm ??
              w.workout_analysis?.detailed_analysis?.workout_summary?.hr_drift
            )
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process workouts
    const results: Array<{
      id: string;
      name?: string;
      date?: string;
      type?: string;
      status: 'success' | 'error' | 'skipped';
      error?: string;
      hr_drift_bpm?: number | null;
    }> = [];

    for (const w of batch) {
      const functionName = getAnalysisFunctionName(w.type);
      
      if (!functionName) {
        results.push({
          id: w.id,
          name: w.name,
          date: w.date,
          type: w.type,
          status: 'skipped',
          error: `No analyzer for type: ${w.type}`
        });
        continue;
      }

      try {
        console.log(`🔄 [BULK-REANALYZE] Processing ${w.id} (${w.type}) via ${functionName}`);
        
        const { data, error: invokeError } = await supabase.functions.invoke(functionName, {
          body: { workout_id: w.id },
        });

        if (invokeError) {
          results.push({
            id: w.id,
            name: w.name,
            date: w.date,
            type: w.type,
            status: 'error',
            error: invokeError.message
          });
        } else {
          // Extract HR drift from response if available
          const hrDrift = data?.analysis?.heart_rate_analysis?.hr_drift_bpm ?? null;
          results.push({
            id: w.id,
            name: w.name,
            date: w.date,
            type: w.type,
            status: 'success',
            hr_drift_bpm: hrDrift
          });
        }
      } catch (e: any) {
        results.push({
          id: w.id,
          name: w.name,
          date: w.date,
          type: w.type,
          status: 'error',
          error: e?.message || String(e)
        });
      }

      // Rate limiting between calls (analysis functions are heavy)
      await sleep(500);
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;

    console.log(`✅ [BULK-REANALYZE] Complete: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        dry_run: false,
        days_back: daysBack,
        start_date: startDateStr,
        workout_type: workoutTypeFilter,
        filter,
        processed: results.length,
        success: successCount,
        errors: errorCount,
        skipped: skippedCount,
        offset,
        has_more: hasMore,
        next_offset: hasMore ? nextOffset : null,
        message: hasMore
          ? `Batch complete. Run again with offset=${nextOffset} to continue.`
          : 'All matching workouts processed!',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[bulk-reanalyze-workouts] error:', error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
