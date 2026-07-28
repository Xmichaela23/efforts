// ============================================================================
// generate-strength-plan — STRENGTH FOCUS (BARBELL, 4-DAY). Wendler 5/3/1.
//
// Contract: docs/SPEC-get-stronger.md. Strength is the spine; maintenance endurance
// (run OR bike — sport-agnostic) fills underneath. Composes the plan via the chassis
// (shared/strength-system/strength-primary-plan.ts), persists the standard `plans` row
// + `sessions_by_week`, returns plan_id. create-goal links + runs activate-plan (the
// same pipe as run/combined) — so it materializes into the calendar identically.
//
// Called internally by create-goal with the service-role key (like generate-run-plan).
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { composeStrengthPrimaryPlan } from '../shared/strength-system/strength-primary-plan.ts';
import { LIFT_LABEL, missingBarbellLifts, readBarbellMaxes } from '../shared/strength-system/barbell-maxes.ts';
import { resolveCurrentRunEasyPace } from '../../../src/lib/resolve-current-run-pace.ts';

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
    // `strength_frequency` / `strength_tier` / `needs_baseline` / `accessory_bias` are no longer read:
    // V1 is four days, barbell, gated on baselines, with add-ons re-homed to Adjust (D-323). Callers
    // may still send them; they are ignored rather than honoured.
    const {
      user_id, duration_weeks,
      endurance_sport, endurance_frequency, goal_name, start_date, preview,
      target_weekly_miles, easy_pace_min_per_mile, long_run_day, assistance_picks, swim_days,
      // Added 2026-07-26 — the doctrine's second pin and the bike volume. Both were collected at
      // intake, stored on the goal, and dropped at `create-goal-and-materialize-plan` before this
      // function ever saw them.
      hard_day, target_weekly_ride_hours,
      // The bike, travelling beside the primary sport (2026-07-27). `{ hours, long_ride_day }`.
      bike,
    } = body as Record<string, unknown>;

    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ONE baselines read, serving both the maxes and the easy pace.
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('learned_fitness, performance_numbers, effort_paces')
      .eq('user_id', String(user_id))
      .maybeSingle();

    // ⛔ NO 1RM, NO ENTRY (SPEC-get-stronger §0). Read HERE rather than trusted from the caller: this
    // function is also invoked directly, and every session's weight comes off these four numbers — a
    // missing one is a lifting day with no weight on it. Same reader the entry gate in
    // `create-goal-and-materialize-plan` uses (`barbell-maxes.ts`), so the two cannot drift apart.
    const maxes = readBarbellMaxes((ub?.performance_numbers ?? {}) as Record<string, unknown>);
    const missing = missingBarbellLifts(maxes);
    if (missing.length > 0) {
      const list = missing.map((l) => LIFT_LABEL[l]);
      const named = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
      console.error(`[strength-plan] refused: missing ${named}`);
      return json({
        success: false,
        error: `Missing ${named}. Every session in this plan loads off your maxes, so it cannot be built without them.`,
      }, 409);
    }

    // Q-105: resolve the athlete's easy pace from baselines when the caller didn't pass one, so the
    // "run durations estimated at 10:00/mi until we learn your easy pace" NOTE isn't shown to someone whose
    // pace is already known. The materialized run durations already honor a known pace — this fixes the
    // generation-time COPY (paceKnown → the note is suppressed). Pace-unit footgun: learned_fitness is
    // sec/km; performance_numbers.easyPace carries a /mi or /km suffix.
    // D-287 — was a LOCAL ad-hoc easy-pace resolver: learned -> manual, with its own sec/km->min/mi
    // conversion and its own unit-sniffing regex. A private copy of a shared decision is exactly the disease
    // `resolveCurrentFtp` was written to cure, and it chose a DIFFERENT answer than the plan and the workout
    // card did. Routed through the ONE resolver, which owns the units and honours the athlete's Q-174 choice.
    let easyPaceMin: number | undefined = Number(easy_pace_min_per_mile) > 0 ? Number(easy_pace_min_per_mile) : undefined;
    if (easyPaceMin === undefined) {
      try {
        const resolved = resolveCurrentRunEasyPace(ub as any);
        if (resolved.sec_per_mi != null) easyPaceMin = resolved.sec_per_mi / 60;   // sec/mi -> min/mi
      } catch { /* no baselines → the honest "estimated at 10:00/mi until we learn your easy pace" note fires */ }
    }

    const sport: 'run' | 'bike' | null =
      endurance_sport === 'bike' || endurance_sport === 'run' ? endurance_sport : null;

    const plan = composeStrengthPrimaryPlan({
      durationWeeks: Number(duration_weeks) > 0 ? Number(duration_weeks) : 12,
      oneRepMaxes: {
        bench: maxes.bench,
        squat: maxes.squat,
        deadlift: maxes.deadlift,
        overheadPress: maxes.overheadPress,
      },
      enduranceSport: sport,
      enduranceFrequency: Number.isFinite(Number(endurance_frequency)) ? Number(endurance_frequency) : 2,
      goalName: typeof goal_name === 'string' ? goal_name : undefined,
      targetWeeklyMiles: Number(target_weekly_miles) > 0 ? Number(target_weekly_miles) : undefined,
      easyPaceMinPerMile: easyPaceMin,
      longRunDay: typeof long_run_day === 'string' ? long_run_day : undefined,
      // D-327 — the ONE hard aerobic day and its discipline. Collected since 2026-07-25 and dropped
      // at the caller until now. Validated here rather than trusted: an unknown discipline is
      // treated as absent, because a pin the composer cannot place is worse than no pin.
      hardDay: hard_day && typeof hard_day === 'object'
        && typeof (hard_day as Record<string, unknown>).day === 'string'
        && ((hard_day as Record<string, unknown>).discipline === 'run'
          || (hard_day as Record<string, unknown>).discipline === 'bike')
        ? hard_day as { day: string; discipline: 'run' | 'bike' }
        : undefined,
      // Bike hours (D-323 §6) — hours, never miles. Used on the bike-PRIMARY path.
      targetWeeklyRideHours: Number(target_weekly_ride_hours) > 0
        ? Number(target_weekly_ride_hours) : undefined,
      // ⛔ THE BIKE ALONGSIDE THE RUN. Validated here rather than trusted: a malformed block is
      // treated as absent, because a bike the composer cannot place is worse than no bike.
      bike: bike && typeof bike === 'object'
        ? {
            hours: Number((bike as Record<string, unknown>).hours) > 0
              ? Number((bike as Record<string, unknown>).hours) : undefined,
            longRideDay: typeof (bike as Record<string, unknown>).long_ride_day === 'string'
              ? (bike as Record<string, unknown>).long_ride_day as string : undefined,
            days: Number((bike as Record<string, unknown>).days) >= 1
              ? Math.min(3, Math.round(Number((bike as Record<string, unknown>).days))) : undefined,
          }
        : null,
      // The athlete's three assistance picks. Validated inside the composer against the shared
      // menu, so an unknown name falls back to the default rather than reaching a session.
      assistancePicks: assistance_picks && typeof assistance_picks === 'object'
        ? assistance_picks as Record<string, string>
        : null,
      // Swim is BOOKED, not coached — the athlete says how many; the app holds the time (D-323 §5).
      swimDays: Number(swim_days) > 0 ? Math.min(4, Math.round(Number(swim_days))) : 0,
    });
    console.log(
      `[strength-plan] composed: ${plan.name} (${plan.duration_weeks}wk, ${sport ?? 'strength-only'}) ` +
      `working numbers ${JSON.stringify(plan.training_max)}`,
    );

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
          plan_version: 'strength_531_v1',
          program: 'get_strong',
          strength_frequency: 4,          // SPEC §1 — four days, locked. No 3-day option in V1.
          strength_tier: 'barbell',
          endurance_sport: sport,
          endurance_frequency: Number(endurance_frequency ?? 2),
          phase_structure: plan.phaseStructure,
          // ⛔ THE WORKING NUMBERS, STORED. They ratchet +5 upper / +10 lower per cycle on their own
          // schedule. Derived instead of stored, the AMRAP write-back that lifts `performance_numbers`
          // would drag them with it and the controlled progression would be gone (SPEC §1).
          training_max: plan.training_max,
          one_rep_maxes_at_build: maxes, // provenance: what the working numbers were computed from
          assistance_picks: assistance_picks ?? null, // what the athlete chose for the three slots
          swim_days: Number(swim_days) > 0 ? Math.min(4, Math.round(Number(swim_days))) : 0,
          volume_notes: plan.volume_notes ?? null, // pace-estimate disclosure only (cap logic retired)
          volume_state: plan.volume_state ?? null, // above|below|in_band → client renders the tradeoff copy
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
    // ⛔ RETURN THE DAYS THE SOLVER USED so the caller can record what actually happened rather than
    // the seed's guess. See `strength_days` on the composer's return type.
    return json({
      success: true, plan_id: inserted.id, sport: 'strength', combined: false,
      strength_days: plan.strength_days,
    }, 200);
  } catch (e) {
    console.error('[strength-plan] error:', (e as Error)?.message);
    return json({ success: false, error: (e as Error)?.message || 'strength plan generation failed' }, 500);
  }
});
