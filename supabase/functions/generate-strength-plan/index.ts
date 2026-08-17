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
import { LIFT_LABEL, liftsBelowEntryMinimum, missingBarbellLifts, readBarbellMaxes, STRENGTH_ENTRY_MIN_1RM_LB } from '../shared/strength-system/barbell-maxes.ts';
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
    // V1 is barbell, gated on baselines, with add-ons re-homed to Adjust (D-323). Callers may still
    // send them; they are ignored rather than honoured.
    //
    // ⛔ `lifting_days` JOINED THAT LIST (§1f-0, 2026-08-17). It was the one shape field this handler
    // still honoured — 4 by default, 3 as an opt-in — and there is no shape question left: every
    // Strong Focus block is THREE days, Squat · Bench · Deadlift + Press. The composer's
    // `StrengthPrimaryArgs` no longer declares the argument at all, so the read below was pushing a
    // value nothing could receive. ⚠️ An old caller sending `lifting_days: 3` is now ignored rather
    // than honoured, which is the same answer it would have got — three days is the only shape built.
    // ⛔ Do not reintroduce it, and do not add a four-day branch "for later".
    const {
      user_id, duration_weeks,
      endurance_sport, endurance_frequency, goal_name, start_date, preview,
      target_weekly_miles, easy_pace_min_per_mile, long_run_day, assistance_picks, swim_days,
      // Added 2026-07-26 — the doctrine's second pin and the bike volume. Both were collected at
      // intake, stored on the goal, and dropped at `create-goal-and-materialize-plan` before this
      // function ever saw them.
      hard_days, target_weekly_ride_hours,
      // The bike, travelling beside the primary sport (2026-07-27). `{ hours, long_ride_day }`.
      bike,
    } = body as Record<string, unknown>;

    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ONE baselines read, serving the maxes, the easy pace, and the assistance equipment gate.
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('learned_fitness, performance_numbers, effort_paces, equipment')
      .eq('user_id', String(user_id))
      .maybeSingle();

    // ⛔ THE ATHLETE'S DECLARED KIT, READ SERVER-SIDE (2026-08-13). Fetched here rather than trusted
    // from the caller for the same reason the maxes are: the build must gate on what the athlete
    // actually declared, not on whatever a stale client session carried. Not an array → null, which
    // the gate treats as "we have not asked" (ungated), never as "owns nothing".
    const equipmentStrength = (() => {
      const eq = (ub as { equipment?: { strength?: unknown } } | null)?.equipment?.strength;
      return Array.isArray(eq) ? eq.map((s) => String(s)) : null;
    })();

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

    // ⛔ THE 65 LB ENTRY MINIMUM, per lift (2026-08-13). Mirrors the gate in
    // `create-goal-and-materialize-plan` because this function is also invoked directly — same
    // shared reader and threshold (`barbell-maxes.ts`), so the two cannot drift apart. Under 65,
    // even the 35 lb women's bar cannot carry the lightest set; 65-84 is admitted and flagged.
    const low = liftsBelowEntryMinimum(maxes).map((l) => `${LIFT_LABEL[l]} (${maxes[l]} lb)`);
    if (low.length > 0) {
      const named = low.length === 1 ? low[0] : `${low.slice(0, -1).join(', ')} and ${low[low.length - 1]}`;
      console.error(`[strength-plan] refused: below entry minimum — ${named}`);
      return json({
        success: false,
        error: `This plan needs a 1RM of at least ${STRENGTH_ENTRY_MIN_1RM_LB} lb on each of the four lifts — below that, even a 35 lb bar can't carry its lightest sets. Your ${named} ${low.length > 1 ? 'are' : 'is'} under that line.`,
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

    // ⛔ THE CONTINUITY READER IS DELETED (2026-08-16). It computed `weeksSince` / `logs` off
    // `learned_fitness.strength_1rms` to pick the leader:anchor ratio. **The ratio is fixed now** —
    // every cycle but the last is a leader, capped at two (`wendler-531.ts:leaderCount`) — because
    // an endurance load is a permanent stressor and this athlete never has the headroom for
    // back-to-back anchor cycles. The tiers also produced 1 leader : 2 anchors, which is not one of
    // Forever's three published models. Reader deleted with the branch it fed; do not reinstate one
    // without reinstating a consumer first.
    const gsPosture = (body as Record<string, unknown>).strength_posture;
    const blockShape = {
      strengthPosture: typeof gsPosture === 'string' ? gsPosture : 'develop',
    };

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
      blockShape,
      pullupMaxReps: Number(((ub as any)?.performance_numbers)?.pullupMaxReps) || undefined,
      // ⛔ D-326 layer 2 — the earned advance. Absent on a fresh block (nothing is logged yet), and
      // present on a REBUILD, where the finished cycles carry real evidence. Validated rather than
      // trusted: an unrecognised verdict is dropped, because a bad value here moves the bar.
      cycleVerdicts: (() => {
        const raw = (body as Record<string, unknown>).cycle_verdicts;
        if (!raw || typeof raw !== 'object') return undefined;
        // ⛔ `advance_untrusted` HAD TO BE ADDED HERE OR IT WOULD BE DROPPED AT THE DOOR. This
        // allowlist validates rather than trusts, which is correct — but an unlisted verdict is
        // silently discarded, and a discarded verdict falls to `unknownMeans: 'advance'`. The bar
        // would still have climbed, so nothing would look broken; the provenance flag on the estimate
        // is what would have gone missing.
        // ⛔ `miss` ADDED 2026-08-12 (slice a) FOR THE SAME REASON. It is the verdict a shortfall now
        // carries before it has been confirmed as a stall. Unlisted, a real MISS would be discarded
        // here and fall to `unknownMeans: 'advance'`: the bar would climb off a failed set and
        // nothing would look broken. Keep this in step with the union in `wendler-531.ts`.
        // ⛔ `recalibrate` ADDED 2026-08-15 (§1d), SAME REASON AGAIN. It is the verdict a TM-test
        // week produces when the training max itself is wrong. Unlisted, it would be discarded here
        // and fall to `unknownMeans: 'advance'` — the bar would climb off a set the athlete could
        // not complete twice. Keep this in step with the union in `wendler-531.ts`.
        const ok = new Set(['advance', 'advance_untrusted', 'reset', 'hold', 'miss', 'recalibrate']);
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (!Array.isArray(v)) continue;
          const clean = v.filter((x) => typeof x === 'string' && ok.has(x)) as string[];
          if (clean.length === v.length) out[k] = clean;
        }
        return Object.keys(out).length > 0 ? (out as any) : undefined;
      })(),
      // ⛔ WHERE THE PREVIOUS BLOCK ENDED, per lift, absolute lb — the transition gate's output
      // (§1d). Present only on a rebuild that had a closing TM-test week to read. Validated rather
      // than trusted for the same reason the verdicts are: this number IS the block's loading, and a
      // posted junk value would set every weight in twelve weeks.
      // ⚠️ ABSENT → the composer derives from the 1RM on file, which is what every block did before
      // this wire existed. A supplier that cannot read must not reset anyone's bar.
      priorTrainingMax: (() => {
        const raw = (body as Record<string, unknown>).prior_training_max;
        if (!raw || typeof raw !== 'object') return undefined;
        const keys = ['bench', 'squat', 'deadlift', 'overheadPress'] as const;
        const out: Record<string, number> = {};
        for (const k of keys) {
          const v = Number((raw as Record<string, unknown>)[k]);
          // A training max under the empty bar is not a training max; it is a malformed payload.
          if (Number.isFinite(v) && v >= 45) out[k] = Math.round(v);
        }
        return Object.keys(out).length > 0 ? (out as any) : undefined;
      })(),
      // D-327 — the ONE hard aerobic day and its discipline. Collected since 2026-07-25 and dropped
      // at the caller until now. Validated here rather than trusted: an unknown discipline is
      // treated as absent, because a pin the composer cannot place is worse than no pin.
      //
      // ⚠️ `terrain` IS VALIDATED THE SAME WAY AND FOR THE SAME REASON (2026-08-06) — an unknown
      // value is treated as ABSENT, and absent means `hill_3min`. That is the conservative arm: it
      // is the session every block built before this field existed, so a malformed or stale terrain
      // degrades to the shipped behaviour rather than to no hard session at all.
      // ⛔ Do not add it to the allowlist without adding it to `HardRunTerrain` — an unlisted value
      // is silently discarded here, which would look like the athlete's pick being ignored.
      // ⛔ UP TO TWO, ANY MIX (§1i, 2026-08-17). This was a single `hard_day` object; the field is
      // REPLACED, not widened alongside — a singular field beside an array is how a caller keeps
      // writing the dead one. Each entry is validated on its own: an unknown discipline drops that
      // ENTRY, not the whole answer, so one malformed slot cannot cost the athlete the other.
      // ⚠️ THE COMPOSER CAPS AT TWO AND DEDUPES BY DAY. Validating here and capping there is not two
      // owners of one rule: this decides what is well-formed, that decides what the block can carry.
      hardDays: (Array.isArray(hard_days) ? hard_days : [])
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const hd = raw as Record<string, unknown>;
          if (typeof hd.day !== 'string') return null;
          if (hd.discipline !== 'run' && hd.discipline !== 'bike') return null;
          const terrainOk = new Set(['hill_3min', 'hill_short', 'treadmill', 'flat']);
          const terrain = typeof hd.terrain === 'string' && terrainOk.has(hd.terrain)
            ? hd.terrain as 'hill_3min' | 'hill_short' | 'treadmill' | 'flat'
            : undefined;
          return {
            day: hd.day,
            discipline: hd.discipline as 'run' | 'bike',
            ...(terrain ? { terrain } : {}),
            // ⚠️ ABSENT OR UNRECOGNISED → `prescribed`, the shipped behaviour. A club day is the
            // athlete telling us they already attend it; nothing may infer that on their behalf.
            ownership: hd.ownership === 'club' ? 'club' as const : 'prescribed' as const,
          };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null),
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
      // ⛔ THE ATHLETE'S ASSISTANCE PICKS — TWELVE NOW, NOT THREE (D-407). Passed through RAW and
      // migrated inside the composer by `normalizeAssistancePrefs`, which reads the current per-day
      // shape, the old flat `{push, pull, single_leg_core}` that every pre-2026-08-13 goal carries,
      // and nothing at all. ⚠️ DO NOT NARROW THE CAST BACK TO `Record<string, string>` — the new
      // shape is nested, and a cast that lies here is how a persisted-key migration gets skipped.
      assistancePicks: assistance_picks ?? null,
      // The build-time assistance gate (resolveDayAssistance): keep performable picks, replace the
      // rest from the same category's pool, loadable gear first, bands last. See StrengthPrimaryArgs.
      athleteEquipment: equipmentStrength,
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
          // ⛔ THE PLAN SAYS WHICH PROTOCOL IT IS ON, IN THE KEY EVERYONE ALREADY READS (Q-230 Part A).
          //
          // This block is not produced by the run/tri protocol selector, so it never wrote this key —
          // it said what it was in `source` instead. Two dialects for one fact, and the readers were
          // split down the middle: `materialize-plan` knew both, `coach` knew only this one. So on
          // every Strength Focus block the coach resolved a null protocol, which made
          // `protocolExpectsE1rmToDip(null)` false and left the generic *"estimated one-rep maxes have
          // been sliding"* line un-suppressed — on a block whose own prescription is the reason they
          // dipped (audit F3). Fixed on the WRITE side, where one stamp ends it, rather than by
          // teaching each reader a second dialect.
          //
          // ⚠️ `source` STAYS, and `block-identity.ts` still reads it as a fallback. Every block built
          // before today — including live ones — identifies itself only that way, and rewriting a
          // running plan's config to satisfy a reader is the wrong direction.
          strength_protocol: 'strength_primary',
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
          assistance_picks: assistance_picks ?? null, // what the athlete chose, per day (D-407)
          swim_days: Number(swim_days) > 0 ? Math.min(4, Math.round(Number(swim_days))) : 0,
          volume_notes: plan.volume_notes ?? null, // pace-estimate disclosure only (cap logic retired)
          volume_state: plan.volume_state ?? null, // above|below|in_band → client renders the tradeoff copy
          // ⛔ SLICE 4a — THE CEILING SURVIVES THE INSERT. Which lifts pin at 90% of their max on
          // file, and when. It was computed at build time and thrown away here: the fact reached the
          // athlete only as a sentence inside `description`, and nothing structured was ever stored,
          // so no later surface could act on it. A pinned lift is a CALIBRATION question about a max
          // that has stopped being true — this is the row the retest/raise offer reads.
          // ⚠️ Absent = nothing pinned. Never write `[]` for "we didn't look".
          strength_calibration: plan.strength_calibration ?? null,
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
