// ============================================================================
// generate-strength-plan — the STRENGTH-PRIMARY engine (SPEC-product-shape Program 1)
//
// Strength is the spine (the conductor's base→power→sharpen→retest arc); maintenance
// endurance (run OR bike — sport-agnostic) fills underneath. Composes the plan via
// the chassis (shared/strength-system/strength-primary-plan.ts), persists the standard
// `plans` row + `sessions_by_week`, returns plan_id. create-goal links + runs activate-plan
// (the same pipe as run/combined) — so it materializes into the calendar identically.
//
// Called internally by create-goal with the service-role key (like generate-run-plan).
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { composeStrengthPrimaryPlan } from '../shared/strength-system/strength-primary-plan.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      user_id, duration_weeks, strength_frequency, strength_tier,
      endurance_sport, endurance_frequency, goal_name, start_date, preview, needs_baseline,
      target_weekly_miles, easy_pace_min_per_mile, accessory_bias, long_run_day,
    } = body as Record<string, unknown>;

    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Q-105: resolve the athlete's easy pace from baselines when the caller didn't pass one, so the
    // "run durations estimated at 10:00/mi until we learn your easy pace" NOTE isn't shown to someone whose
    // pace is already known. The materialized run durations already honor a known pace — this fixes the
    // generation-time COPY (paceKnown → the note is suppressed). Pace-unit footgun: learned_fitness is
    // sec/km; performance_numbers.easyPace carries a /mi or /km suffix.
    let easyPaceMin: number | undefined = Number(easy_pace_min_per_mile) > 0 ? Number(easy_pace_min_per_mile) : undefined;
    if (easyPaceMin === undefined) {
      try {
        const { data: ub } = await supabase
          .from('user_baselines').select('learned_fitness, performance_numbers').eq('user_id', String(user_id)).maybeSingle();
        const secPerKm = Number((ub?.learned_fitness as any)?.run_easy_pace_sec_per_km?.value);
        if (Number.isFinite(secPerKm) && secPerKm > 0) {
          easyPaceMin = (secPerKm * 1.60934) / 60; // sec/km → min/mi
        } else {
          const ep = String((ub?.performance_numbers as any)?.easyPace || '').trim();
          const m = ep.match(/(\d{1,2}):(\d{2})/);
          if (m) {
            const perUnit = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
            easyPaceMin = /km/i.test(ep) ? perUnit * 1.60934 : perUnit; // min/km → min/mi, else already min/mi
          }
        }
      } catch { /* no baselines → the 10:00/mi fallback note is honest */ }
    }

    // Accessory-bias add-on (glute | hyrox); anything else → none (byte-identical plain plan).
    const bias: 'glute' | 'hyrox' | null = accessory_bias === 'glute' || accessory_bias === 'hyrox' ? accessory_bias : null;

    const tier: 'barbell' | 'bodyweight' =
      strength_tier === 'strength_power' || strength_tier === 'barbell' ? 'barbell' : 'bodyweight';
    const freq: 3 | 4 = Number(strength_frequency) >= 4 ? 4 : 3;
    const sport: 'run' | 'bike' | null =
      endurance_sport === 'bike' || endurance_sport === 'run' ? endurance_sport : null;

    const plan = composeStrengthPrimaryPlan({
      durationWeeks: Number(duration_weeks) > 0 ? Number(duration_weeks) : 12,
      strengthFrequency: freq,
      tier,
      enduranceSport: sport,
      enduranceFrequency: Number.isFinite(Number(endurance_frequency)) ? Number(endurance_frequency) : 2,
      goalName: typeof goal_name === 'string' ? goal_name : undefined,
      needsBaseline: needs_baseline === true,
      targetWeeklyMiles: Number(target_weekly_miles) > 0 ? Number(target_weekly_miles) : undefined,
      easyPaceMinPerMile: easyPaceMin,
      accessoryBias: bias,
      longRunDay: typeof long_run_day === 'string' ? long_run_day : undefined,
    });
    console.log(`[strength-plan] composed: ${plan.name} (${plan.duration_weeks}wk, freq ${freq}, ${sport ?? 'strength-only'}, tier ${tier})`);

    if (preview === true) {
      return json({ success: true, plan_id: null, plan, phase_structure: plan.phaseStructure }, 200);
    }

    const { data: inserted, error } = await supabase
      .from('plans')
      .insert({
        user_id,
        name: plan.name,
        description: plan.description,
        duration_weeks: plan.duration_weeks,
        current_week: 1,
        status: 'active',
        plan_type: 'generated',
        config: {
          source: 'strength_primary',
          plan_version: 'strength_primary_v1',
          program: 'get_strong',
          strength_frequency: freq,
          strength_tier: tier,
          endurance_sport: sport,
          endurance_frequency: Number(endurance_frequency ?? 2),
          phase_structure: plan.phaseStructure,
          volume_notes: plan.volume_notes ?? null, // pace-estimate disclosure only (cap logic retired)
          volume_state: (plan as any).volume_state ?? null, // above|below|in_band → client renders the tradeoff copy
          accessory_bias: bias, // glute|hyrox|null — the add-on selection (for the card + record)
          user_selected_start_date: start_date ?? null,
        },
        sessions_by_week: plan.sessions_by_week,
        notes_by_week: {},
        weeks: [],
      })
      .select('id')
      .single();

    if (error || !inserted) {
      console.error('[strength-plan] insert failed:', error?.message);
      return json({ success: false, error: error?.message || 'Failed to save strength plan' }, 500);
    }
    return json({ success: true, plan_id: inserted.id, sport: 'strength', combined: false }, 200);
  } catch (e) {
    console.error('[strength-plan] error:', (e as Error)?.message);
    return json({ success: false, error: (e as Error)?.message || 'strength plan generation failed' }, 500);
  }
});
