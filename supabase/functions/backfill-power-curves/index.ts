/**
 * Backfill Power Curves
 * 
 * One-time function to recalculate power curves and best efforts
 * for existing workouts that have sensor_data but no power_curve yet.
 * 
 * Usage: POST /backfill-power-curves
 * Body: { "days_back": 60, "dry_run": false }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    // - Has sensor_data (so we can calculate power curve)
    // - Is a bike or run
    // - Doesn't already have power_curve or best_efforts
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

    // Filter to those without power_curve/best_efforts
    const needsBackfill = (workouts || []).filter(w => {
      const computed = w.computed || {};
      const type = (w.type || '').toLowerCase();
      
      if (type === 'ride' || type === 'cycling' || type === 'bike') {
        return !computed.power_curve;
      }
      if (type === 'run' || type === 'running') {
        return !computed.best_efforts;
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

