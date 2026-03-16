// @ts-nocheck
/**
 * EDGE FUNCTION: backfill-planned-workload
 *
 * Updates workload_planned for planned_workouts rows where it is currently null,
 * using the same TRIMP formula that activate-plan now runs at insertion time.
 * Safe to re-run: only touches rows with workload_planned IS NULL.
 *
 * Input (POST JSON): { user_id?: string, dry_run?: boolean }
 *   - user_id: optional override (defaults to the calling user)
 *   - dry_run: if true, compute but don't write (returns what would change)
 *
 * Output: { updated, skipped, dry_run }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getStepsIntensity,
  calculateTRIMPWorkload,
  calculateDurationWorkload,
  getDefaultIntensityForType,
} from '../_shared/workload.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function estimatePlannedWorkload(
  type: string,
  durationMinutes: number,
  stepsTokens: string[],
  maxHR: number | null,
  restingHR: number | null,
): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const intensity = getStepsIntensity(stepsTokens, type) || getDefaultIntensityForType(type) || 0.70;
  if (maxHR && maxHR > 0) {
    const rhr = restingHR && restingHR > 0 ? restingHR : 55;
    const avgHR = Math.round(rhr + intensity * (maxHR - rhr));
    const trimp = calculateTRIMPWorkload({ avgHR, maxHR, restingHR: rhr, durationMinutes });
    if (trimp !== null && trimp > 0) return Math.round(trimp);
  }
  return Math.round(calculateDurationWorkload(durationMinutes, intensity));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const body = await req.json().catch(() => ({}));

    // Allow service-role calls (CLI/admin) with explicit user_id in body
    const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let userId: string;
    if (isServiceRole) {
      if (!body?.user_id) {
        return new Response(JSON.stringify({ error: 'user_id required for service-role calls' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body.user_id;
    } else {
      const { data: userData } = await supabase.auth.getUser(token || undefined);
      if (!userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body?.user_id || userData.user.id;
    }
    const dryRun: boolean = body?.dry_run === true;

    // Fetch athlete HR baselines
    let maxHR: number | null = null;
    let restingHR: number | null = null;
    try {
      const { data: ub } = await supabase
        .from('user_baselines')
        .select('performance_numbers,learned_baselines')
        .eq('user_id', userId)
        .maybeSingle();
      const perf = (ub as any)?.performance_numbers || {};
      const learned = (ub as any)?.learned_baselines || {};
      maxHR = Number(learned?.run_max_hr_observed?.value || perf?.maxHeartRate || perf?.max_heart_rate || 0) || null;
      restingHR = Number(perf?.restingHeartRate || perf?.resting_heart_rate || 0) || null;
    } catch { /* non-fatal */ }

    // Fetch all planned_workouts with null workload_planned
    const { data: rows, error: fetchErr } = await supabase
      .from('planned_workouts')
      .select('id, type, duration, steps_preset')
      .eq('user_id', userId)
      .is('workload_planned', null);

    if (fetchErr) throw fetchErr;

    const toUpdate = (rows || []).map((r: any) => {
      const type = String(r?.type || 'run').toLowerCase();
      const durationMinutes = Number(r?.duration || 0);
      const tokens: string[] = Array.isArray(r?.steps_preset) ? r.steps_preset.map(String) : [];
      const workload = estimatePlannedWorkload(type, durationMinutes, tokens, maxHR, restingHR);
      return { id: r.id, workload_planned: workload > 0 ? workload : null };
    }).filter((r: any) => r.workload_planned !== null);

    if (!dryRun && toUpdate.length > 0) {
      // Update in batches of 100 to avoid request size limits
      const BATCH = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const batch = toUpdate.slice(i, i + BATCH);
        for (const row of batch) {
          await supabase
            .from('planned_workouts')
            .update({ workload_planned: row.workload_planned })
            .eq('id', row.id)
            .is('workload_planned', null);
        }
      }
    }

    console.log(`[backfill-planned-workload] user=${userId} rows_null=${rows?.length} will_update=${toUpdate.length} dry_run=${dryRun} maxHR=${maxHR} restHR=${restingHR}`);

    return new Response(JSON.stringify({
      updated: dryRun ? 0 : toUpdate.length,
      skipped: (rows?.length || 0) - toUpdate.length,
      dry_run: dryRun,
      would_update: dryRun ? toUpdate.length : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
