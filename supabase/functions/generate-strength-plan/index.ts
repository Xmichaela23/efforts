// ══════════════════════════════════════════════════════════════════════════════
// 🟢 THE ACTIVE SURFACE (2026-08-22). This is the ONE plan path still open.
//
// The marathon and triathlon builders are CLOSED FOR REPAIRS — see the banners on
// `generate-run-plan/index.ts`, `generate-triathlon-plan/index.ts` and
// `generate-combined-plan/index.ts`, and `ENGINE-STATE.md`.
//
// ⚠️ RECOMMENDED, NOT RULED: the audit of 2026-08-22 proposes the Standing Plan
// work wire in HERE first, because its gate — strength set to `develop`, no endurance discipline
// set to `develop` — already means "strength leading, endurance held," which is the
// position the new plan shapes are built around.
//
// ⚠️ "Strong Focus" as a SEPARATE SHIPPED PLAN was set aside 2026-08-22. What is
// active is this BUILDER, not that plan concept. Do not resurrect the plan on the
// strength of this banner.
// ══════════════════════════════════════════════════════════════════════════════
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
/**
 * ⛔ THE STANDING PLAN — stage 4 slice 2, the wiring. `DECISIONS-2026-08-22-standing-plan-pivot.md` §9.
 *
 * ⚠️ THE PIVOT DOC SAYS "wire through `generate-strength-plan`'s GATE" AND THIS FILE HAS NO GATE.
 * The posture gate — strength `develop`, no endurance `develop` — lives one hop upstream at
 * `create-goal-and-materialize-plan/index.ts:2493` and decides which BUILDER is invoked. This file
 * decides which COMPOSER builds the block, which is the other half of the same dial. Putting the
 * frame resolver upstream would mean two files carrying the same condition — the disease the
 * ride-count banner below is a monument to.
 *
 * ⛔ THE FALLBACK IS THE WHOLE POINT. A position with no frame — a cyclist, an athlete keeping a
 * bike or a swim, strength alone — takes the Get Stronger path below, unchanged. That path is not
 * edited by this stage and is pinned byte-identical by `standing-plan.test.ts`.
 */
import {
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  demonstratedRunVolume,
  assignSports,
  evidenceForSkip,
  evidenceWorkingNumbers,
  EVIDENCE_WINDOW_DAYS,
  FRAMES,
  isLongSlot,
  resolveFrame,
  STANDING_PLAN_PROTOCOL_ID,
  testWeekLiftNames,
  PATTERN_FOR_TESTED_LIFT,
} from '../_shared/standing-plan/index.ts';
/**
 * ⛔ THE ONE OWNER OF THE TRUSTED-REP CEILING (`wendler-531.ts:605-655`) — 8 reps general, 5 on the
 * deadlift, with LeSuer 1997 / Reynolds 2006 / Mayhew 2008 written out at the site. The skip check
 * needs it and the Standing Plan module may not import that file (its own source lint keeps the two
 * loading systems apart), so it is supplied from here as an argument.
 *
 * ⚠️ IT IS NOT WENDLER'S NUMBER. It is the app's e1RM trust ceiling, which happens to live in that
 * file; a second copy in the new module would be the doubled disease.
 */
import { trustedMaxRepsFor } from '../shared/strength-system/loading/wendler-531.ts';
/**
 * ⛔ THE ONE OWNER OF THE STORED PICK SHAPE (A1, 2026-08-24). `normalizeAssistancePrefs` migrates the
 * v1 flat shape, drops unrecognised keys and never returns a partial week — everything a second
 * reader of `training_prefs.assistance_picks` would have to reimplement and eventually get wrong.
 *
 * ⚠️ IT IS IMPORTED HERE AND NOT IN THE STANDING-PLAN MODULE, DELIBERATELY.
 * `standing-plan.test.ts`'s module lint forbids that directory from importing `assistance-catalog`
 * at all — it is Wendler's model and the Standing Plan may not reach into it. So the flattening
 * happens at the WIRE, and the composer takes plain movement names.
 */
import { normalizeAssistancePrefs } from '../../../src/lib/assistance-catalog.ts';
import { LIFT_LABEL, liftsBelowEntryMinimum, missingBarbellLifts, readBarbellMaxes, STRENGTH_ENTRY_MIN_1RM_LB } from '../shared/strength-system/barbell-maxes.ts';
import { describeThresholdBasis, resolveCurrentRunEasyPace, resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrent5kPace } from '../../../src/lib/resolve-current-5k-pace.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
/**
 * ⛔ THE RIDE-COUNT RULE HAS ONE OWNER NOW (stage 4, 2026-08-21). This file held its own
 * `Math.min(3, …)` — the range was raised to 4 on 2026-08-19 in the composer (twice) and in
 * `create-goal-and-materialize-plan`, and THIS copy was missed. An athlete who tapped `4` had it
 * rewritten to `3` here, silently, one hop after the validator that had just accepted it.
 * See `_shared/athlete-weekly-intent.ts`.
 */
import {
  normalizeEasyPace,
  normalizeRideDays,
  normalizeRideHours,
  normalizeRunDays,
  normalizeRunMiles,
  normalizeSwimDays,
  RIDE_DAYS_DEFAULT,
  RIDE_HOURS_DEFAULT,
  RUN_DAYS_DEFAULT,
} from '../_shared/athlete-weekly-intent.ts';

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

    /**
     * ⛔ THE RIDE ASK, NORMALISED AT THE DOOR AND ANNOUNCED WHEN IT FALLS BACK (stage 4,
     * 2026-08-21). §2.0 of `REPORT-session-structure-and-clumping-2026-08-20.md` measured THREE
     * independent "default to 2" clauses on this chain and **only one of them logged when it
     * fired** — so a dropped answer never appeared as missing, it appeared as a plausible plan
     * built on a number nobody chose. This is the second of the three learning to speak.
     *
     * ⚠️ IT ANNOUNCES, IT DOES NOT SUBSTITUTE. The default itself is applied in exactly one place
     * (the composer's `rideIntent`); absent is forwarded as absent. A door that filled the gap in
     * would be the fourth clause.
     */
    const rideDaysAsked = normalizeRideDays(
      bike && typeof bike === 'object' ? (bike as Record<string, unknown>).days : undefined,
    );
    const rideHoursAsked = normalizeRideHours(
      bike && typeof bike === 'object' ? (bike as Record<string, unknown>).hours : undefined,
      target_weekly_ride_hours,
    );
    /**
     * ⛔ THE RUN AND SWIM ASKS, NORMALISED AT THE SAME DOOR AND ANNOUNCED THE SAME WAY (stage 4 run
     * half, 2026-08-22). Q-270 measured a FOUR-deep default chain on the run count — here, at
     * `create-goal`, again below in the rebuild body, and the composer's own floor — of which only
     * `create-goal` ever said anything. Two of those four are this file's, and they speak now.
     *
     * ⚠️ THE SWIM HAS NO DEFAULT TO ANNOUNCE, deliberately: an unanswered swim is no swim, and the
     * app never books a session nobody asked for. It is normalised here only so the clamp has one
     * owner.
     */
    const runDaysAsked = normalizeRunDays(endurance_frequency);
    const runMilesAsked = normalizeRunMiles(target_weekly_miles);
    // ⚠️ SELECTION IS THE COMPOSER'S — it needs the gated hard days, which this door has not resolved.
    // What the door CAN see is whether a run-shaped answer arrived at all, which is what it reports.
    const runShaped = endurance_sport === 'run' || runMilesAsked != null
      || typeof long_run_day === 'string';
    if (runShaped && runDaysAsked == null) {
      console.log(
        `[strength-plan] a run-shaped block arrived with no run count — endurance_frequency was `
        + `${JSON.stringify(endurance_frequency)}; falling back to OUR number, ${RUN_DAYS_DEFAULT}.`,
      );
    }
    const rideDeclared = !!bike || rideHoursAsked != null;
    if (rideDeclared) {
      const fellBack: string[] = [];
      if (rideDaysAsked == null) fellBack.push(`ride days -> ${RIDE_DAYS_DEFAULT}`);
      if (rideHoursAsked == null) fellBack.push(`ride hours -> ${RIDE_HOURS_DEFAULT}`);
      if (fellBack.length > 0) {
        console.log(
          `[strength-plan] the athlete kept a bike and one of their answers did not arrive — ` +
          `falling back to OUR number for: ${fellBack.join(', ')}`,
        );
      }
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ONE baselines read, serving the maxes, the easy pace, and the assistance equipment gate.
    const { data: ub } = await supabase
      .from('user_baselines')
      // ⚠️ `units` ADDED 2026-08-23 (stage 4 slice 2). `resolveEnduranceAnchors` DECLARES it and this
      // door never fetched it — the SELECT-projection footgun this repo has hit repeatedly. It feeds
      // the swim anchor only, so the run frame is unaffected either way; a resolver is fed what it
      // asks for rather than what today's caller happens to need.
      .select('learned_fitness, performance_numbers, effort_paces, equipment, units')
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
    let easyPaceMin: number | undefined = normalizeEasyPace(easy_pace_min_per_mile) ?? undefined;
    if (easyPaceMin === undefined) {
      try {
        const resolved = resolveCurrentRunEasyPace(ub as any);
        if (resolved.sec_per_mi != null) easyPaceMin = resolved.sec_per_mi / 60;   // sec/mi -> min/mi
      } catch { /* no baselines → the honest "estimated at 10:00/mi until we learn your easy pace" note fires */ }
    }

    /**
     * ⛔ THE HARD DAY'S NUMBERS — FED FROM THE RESOLVERS THAT ALREADY OWN THEM (§7, 2026-08-17).
     *
     * This function resolved the EASY pace and nothing else, so no FTP and no threshold pace ever
     * reached the composer — §7's starved-input pattern, the same shape as the run-pace resolver
     * that was written, tested and never once ran. ⛔ THREE RESOLVERS ALREADY EXIST and are the
     * single source of truth for their fact; none of this re-derives anything:
     *   · `resolveCurrentFtp`               — bike wattage (D-240's athlete choice honoured)
     *   · `resolveCurrentRunThresholdPace`  — a MEASURED threshold pace, when the athlete has one
     *   · `resolveCurrent5kPace`            — the number the run gate actually tests
     *
     * ⚠️ THE 5K IS THE GATE, NOT THE THRESHOLD PACE. There is no independent threshold pace on most
     * athletes — the app derives it as 5K + 20 s/mi (`materialize-plan`'s own rule), so gating on a
     * derived number would refuse athletes who have everything the session needs. The threshold
     * pace is passed as well, and the session copy says which of the two it used.
     *
     * ⚠️ RESOLVED SERVER-SIDE FROM THE BASELINES ROW, not trusted from the caller — the same reason
     * the maxes and the equipment are. A stale client session must not decide whether an athlete
     * gets a progression.
     */
    const ftpResolved = resolveCurrentFtp(ub as never);
    const thrResolved = resolveCurrentRunThresholdPace(ub as never);
    const fiveKResolved = resolveCurrent5kPace(ub as never);

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

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ THE STANDING PLAN FORK (stage 4 slice 2, 2026-08-23). Pivot §9.
     *
     * ⛔ EVERYTHING ABOVE THIS POINT IS SHARED AND UNCHANGED — the baselines read, the four 1RMs,
     * the entry refusals, the equipment, the three pace/FTP resolvers. Both composers need exactly
     * those inputs, so the fork is here rather than at the door: a second door would be a second
     * copy of the entry gate, and the entry gate is the thing this file and `create-goal` already
     * share a reader for so they cannot drift.
     *
     * ⛔ AND IT IS A FORK, NOT A REPLACEMENT. `resolveFrame` returns `null` WITH A REASON for every
     * position this build cannot serve, and the reason is logged rather than swallowed. Get
     * Stronger is the answer for all of them and its composer is not touched by this stage.
     * ═══════════════════════════════════════════════════════════════════════════════════════════
     */
    const framePosition = { enduranceSport: sport };
    const frameResolution = resolveFrame(framePosition);

    if (frameResolution.frame) {
      const frameId = frameResolution.frame;
      /**
       * ⛔ THE ADVANCED TIER IS GATED ON WHAT THE ATHLETE RAN, NOT ON WHAT THEY SAID (ruled
       * 2026-08-23). So this is a workouts read, not a baselines read — `current_volume.run` is the
       * athlete's typed intention and is precisely what the ruling excludes.
       *
       * ⚠️ IT ABSTAINS RATHER THAN GUESSING. A failed read leaves `weeklyMiles` null,
       * `advancedTierSessions(null)` is 0, and the athlete gets the BASE tier — which is the same
       * block every athlete gets today. A reader that cannot read must never add volume.
       */
      let demonstrated: { weeklyMiles: number | null; runs: number; source: string } = {
        weeklyMiles: null, runs: 0, source: 'the run history could not be read',
      };
      try {
        const asOf = (typeof start_date === 'string' && start_date.trim())
          ? String(start_date).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const from = new Date(Date.parse(`${asOf}T00:00:00Z`) - 35 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        const { data: runRows } = await supabase
          .from('workouts')
          .select('type, date, distance')
          .eq('user_id', String(user_id))
          .eq('type', 'run')
          .gte('date', from)
          .lte('date', asOf);
        demonstrated = demonstratedRunVolume(runRows as never, asOf);
      } catch (e) {
        console.warn('[standing-plan] demonstrated run volume unreadable; base tier:', (e as Error)?.message);
      }

      /**
       * ⛔ THE PINNED-LONG-DAY WARNING THAT STOOD HERE IS GONE, BECAUSE THE PIN IS HONOURED NOW.
       *
       * Slice 2 told the athlete *"the long run sits on Saturday, you asked for Sunday, and this
       * version cannot move it"* — stage 4's gap 1, stated rather than fixed. `chooseDayMap` below
       * rotates the frame so the pin lands, and the ONLY case that still costs anything is two pins
       * that no single rotation can both reach. That case goes down `dayMap.compromises` into
       * `placement_compromises`, which is the channel the athlete already reads.
       * ⛔ Do not reinstate a second sentence about days here — two owners of one message is how a
       * screen ends up saying both.
       */
      const wiringNotes: { kind: 'source' | 'ours' | 'inferred' | 'gap' | 'warning'; text: string; cite?: string }[] = [];
      if (runMilesAsked != null) {
        wiringNotes.push({
          kind: 'source',
          text: 'The programme owns how many runs the week carries and how long they are, so the '
            + 'weekly mileage you typed is not what sets them.',
          cite: 'Viada p246',
        });
      }

      /**
       * ⛔ THE ATHLETE'S PINNED DAYS, HONOURED BY ROTATING THE FRAME (job 2, slice 3).
       *
       * The frame owns the ORDER and the SPACING; it names no weekday anywhere (p246 numbers its
       * days 1-7). So a pin is satisfied by rotating the whole week, which moves every day by the
       * same amount and leaves every pairing, every gap and the rest day exactly where the page puts
       * them. ⚠️ The old fixed Monday start was itself a rotation — offset zero — that nobody chose.
       *
       * ⛔ IT NEVER REFUSES. A pin that cannot be reached is stated through the compromise channel
       * the athlete already reads, and the week is still built (D-325 §7).
       */
      /**
       * ⛔ THE LONG SLOT'S SPORT DECIDES WHICH LONG PIN IS LIVE (the compromise wire, 2026-08-24).
       * Computed here, before the day map, because the frame has ONE long session and an athlete
       * keeping both sports can pin two long days. The unservable one is reported, not dropped.
       */
      const mixForFrame = {
        runs: runDaysAsked ?? RUN_DAYS_DEFAULT,
        rides: rideDaysAsked ?? (bike && typeof bike === 'object' ? RIDE_DAYS_DEFAULT : 0),
        swimDays: normalizeSwimDays(swim_days) ?? 0,
        /**
         * ⛔ THE ATHLETE'S OWN PER-SLOT ANSWER, when the wizard collected one. Counts alone do not
         * say WHICH slot is which — see `SportMix.slots`. ⚠️ Validated here rather than trusted, the
         * same discipline every other field on this body uses: an unrecognised value drops the whole
         * map, so the dial assigns rather than a half-applied answer taking effect.
         */
        slots: (() => {
          const raw = (body as Record<string, unknown>).endurance_slots;
          if (!raw || typeof raw !== 'object') return null;
          const out: Record<string, 'run' | 'ride'> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (v !== 'run' && v !== 'ride') return null;
            out[k] = v;
          }
          return Object.keys(out).length > 0 ? out : null;
        })(),
      };
      const longSlotSport = (() => {
        const a = assignSports(FRAMES[frameId].columns.standard, mixForFrame);
        const long = Object.entries(a.byKey).find(([k]) => {
          const [d, i] = k.split(':').map(Number);
          const slot = FRAMES[frameId].columns.standard.find((x) => x.day === d)?.endurance[i];
          return slot ? isLongSlot(slot) : false;
        });
        return long?.[1]?.sport ?? 'run';
      })();

      const dayMap = chooseDayMap(frameId, {
        longRunDay: typeof long_run_day === 'string' ? long_run_day : null,
        longRideDay: bike && typeof bike === 'object'
          && typeof (bike as Record<string, unknown>).long_ride_day === 'string'
          ? (bike as Record<string, unknown>).long_ride_day as string
          : null,
        longSlotSport,
        // ⚠️ The hard days the caller validated above, not the raw body — one reader for what a
        // well-formed hard day is.
        hardDays: (Array.isArray(hard_days) ? hard_days : [])
          .map((h) => (h && typeof h === 'object' ? (h as Record<string, unknown>).day : null))
          .map((d) => (typeof d === 'string' ? d : null)),
        startDateIso: typeof start_date === 'string' ? start_date : null,
      });

      /**
       * ⛔ THE TEST-WEEK SKIP — OFFERED ON EVIDENCE, NEVER ON A PREFERENCE (Michael, 2026-08-23).
       *
       * ⛔ THE DEFAULT IS THE TEST. `skip_test_week` has to arrive true AND the evidence has to be
       * there; either alone builds the test week. An absent answer is an answer: run the test.
       *
       * ⛔ AND THE NUMBER COMES FROM THE LOGGED SET, NOT FROM `performance_numbers`. That is what
       * makes "a typed-in max never skips" true by construction rather than by a rule — the stored
       * figure is never read on this path at all. `wendler-531.ts:244` records that a typed number
       * and a tested one are the same shape on disk, so provenance cannot be asked of the value.
       */
      const competitionLifts = defaultCompetitionLifts();
      // ⛔ ONLY THE LIFTS THIS BLOCK PRESCRIBES FROM. The overhead press is tested and never loaded
      // in this frame (no `push_upper` competition slot would carry a press), so demanding evidence
      // for it would refuse the skip for no benefit to anybody.
      const allNames = testWeekLiftNames(competitionLifts);
      const prescribedFrom: Record<string, string> = {};
      for (const [lift, name] of Object.entries(allNames)) {
        if (PATTERN_FOR_TESTED_LIFT[lift as keyof typeof PATTERN_FOR_TESTED_LIFT]) {
          prescribedFrom[lift] = name;
        }
      }
      const skipAsked = (body as Record<string, unknown>).skip_test_week === true;
      let skipOffer: ReturnType<typeof evidenceForSkip> = {
        available: false, evidence: {}, missing: [], summary: '',
      };
      try {
        const asOf = (typeof start_date === 'string' && start_date.trim())
          ? String(start_date).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const from = new Date(Date.parse(`${asOf}T00:00:00Z`) - (EVIDENCE_WINDOW_DAYS + 1) * 86400000)
          .toISOString().slice(0, 10);
        const { data: liftRows } = await supabase
          .from('workouts')
          .select('workout_date, date, strength_exercises')
          .eq('user_id', String(user_id))
          .eq('type', 'strength')
          .gte('date', from)
          .lte('date', asOf);
        skipOffer = evidenceForSkip({
          rows: liftRows as never,
          liftForName: prescribedFrom as never,
          trustedMaxRepsFor,
          asOfIso: asOf,
        });
      } catch (e) {
        // ⚠️ A READER THAT CANNOT READ DOES NOT SKIP A TEST. The offer stays unavailable and the
        // block runs the test week, which is the safe direction and the default anyway.
        console.warn('[standing-plan] skip evidence unreadable; the test week stands:', (e as Error)?.message);
      }
      const skipping = skipAsked && skipOffer.available;
      if (skipAsked && !skipOffer.available) {
        console.log(
          '[standing-plan] a skip was asked for and the evidence is not there — building the test '
          + `week: ${skipOffer.missing.map((m) => `${m.lift}: ${m.reason}`).join('; ')}`,
        );
      }

      /**
       * ⛔ THE ATHLETE'S ACCESSORY PICKS, FLATTENED (A1, 2026-08-24). Twelve per-day choices become a
       * deduped list of movement names, because this frame's four days do not map onto the picker's
       * three and placing a pick by what it TRAINS is the only honest reading. Full reasoning on
       * `ComposeArgs.accessoryPicks`.
       *
       * ⚠️ THE FOCUS CHIPS ARE NOT CONSUMED HERE AND THAT IS NOT AN OVERSIGHT. `prefs.focus` biases
       * WHICH movement fills a Wendler category; the Standing Plan's slots are already named by
       * pattern and category from p246, so a chip has no slot to re-point. ⛔ Wiring the chips is
       * SESSION B's B2 and it is listed there — do not add a second reader for them here.
       */
      const accessoryPicks = (() => {
        const raw = (body as Record<string, unknown>).assistance_picks;
        if (!raw || typeof raw !== 'object') return undefined;
        const prefs = normalizeAssistancePrefs(raw);
        const out: string[] = [];
        for (const day of Object.values(prefs.by_day ?? {})) {
          for (const movement of Object.values(day ?? {})) {
            const name = String(movement ?? '').trim();
            if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
          }
        }
        return out.length > 0 ? out : undefined;
      })();

      const row = buildStandingPlanRow({
        compose: {
          frame: frameId,
          ...(accessoryPicks ? { accessoryPicks } : {}),
          // ⛔ THE ATHLETE HAS NOT BEEN ASKED YET (stage 5). Seeded from the four lifts the entry
          // gate already demanded — see `defaultCompetitionLifts` for why it is three, not four.
          competitionLifts,
          /**
           * ⛔ ABSENT UNLESS THE SKIP WAS TAKEN. On the default path the test is in week one and this
           * row is written before it, so there is nothing to put here and the numbers land when the
           * test is read back. On the skip path they come from the logged sets — the same 96%-of-a-
           * two-formula-average quantity (p215) the test would have produced, so nothing downstream
           * can tell which route a block took by looking at its numbers.
           */
          workingNumbers: skipping ? evidenceWorkingNumbers(skipOffer) : undefined,
          skipTestWeek: skipping,
          seed1RMs: {
            bench: maxes.bench,
            squat: maxes.squat,
            deadlift: maxes.deadlift,
            overheadPress: maxes.overheadPress,
          },
          baselines: ub as never,
          equipment: equipmentStrength,
          demonstratedWeeklyMiles: demonstrated.weeklyMiles,
          /**
           * ⛔ THE ATHLETE'S SPORT MIX (slice 4). ⚠️ A RATIO, NOT A COUNT — pivot §2: *"the program
           * owns session count; athlete owns sport + level."* The frame holds four endurance slots
           * and these numbers decide which sport fills each one, never how many there are. Reading
           * them as counts is the ask-15-get-20 defect the work order exists to kill.
           *
           * ⛔ RIDES COME FROM THE NORMALISED DAY COUNT, NOT FROM RIDE HOURS. `create-goal` forwards
           * `target_weekly_ride_hours` off the goal's prefs with no posture gate, so a runner who
           * typed ride hours into an earlier block still carries the number; reading that as "wants
           * rides" would put riding into a week nobody asked for. `bike.days` is the ask.
           */
          // ⚠️ THE SAME OBJECT THE LONG-SLOT SPORT WAS RESOLVED FROM. Two derivations of one mix is
          // how a preview and a plan start disagreeing about which day is the long one.
          sportMix: mixForFrame,
          roundTo: 5,
        },
        weeks: Number(duration_weeks) > 0 ? Number(duration_weeks) : 12,
        // ⛔ NO SCHEDULED TAPER — p120. The deload column is a tool you deploy (a race two weeks
        // out, p247), never a recovery week on a timer. This block has no race in it.
        taperWeeks: [],
        goalName: typeof goal_name === 'string' ? goal_name : undefined,
        demonstratedMilesSource: demonstrated.source,
        dayMap,
        skipEvidence: skipping ? (skipOffer.evidence as Record<string, unknown>) : null,
        extraNotes: wiringNotes,
      });

      console.log(
        `[standing-plan] composed: ${row.name} (${row.duration_weeks}wk, frame ${frameId}) — `
        + `test week ${row.config.test_week}, demonstrated ${demonstrated.weeklyMiles ?? 'unknown'} mi/wk `
        + `(${demonstrated.source}); no working numbers until the test is read.`,
      );

      if (preview === true) {
        /**
         * ⛔ THE PREVIEW CARRIES THE OFFER, so a surface can put it in front of the athlete before
         * they commit. `NonRaceBuilder.tsx:2716` already reads `plan.placement_compromises` off this
         * payload; `skip_test_week` rides beside it rather than inside the plan, because it is a
         * question about the block, not a property of it.
         *
         * ⚠️ IT REPORTS THE OFFER EVEN WHEN THE ANSWER WAS NO. `available` plus `missing` is what
         * lets a screen say *"we could start from your logged sets"* — or say nothing, honestly,
         * because the sets are not there.
         */
        return json({
          success: true, plan_id: null, plan: row, phase_structure: row.phaseStructure,
          skip_test_week: {
            available: skipOffer.available,
            taken: skipping,
            summary: skipOffer.summary,
            missing: skipOffer.missing,
            window_days: EVIDENCE_WINDOW_DAYS,
          },
        }, 200);
      }

      const { data: spInserted, error: spError } = await supabase
        .from('plans')
        .insert({
          user_id,
          name: row.name,
          description: row.description,
          duration_weeks: row.duration_weeks,
          current_week: 1,
          status: 'active',
          plan_type: 'generated',
          config: {
            // ⛔ IT SAYS WHAT IT IS IN BOTH DIALECTS, for the same reason Q-230 made Get Stronger do
            // it: `block-identity.ts` reads `strength_protocol` first and falls back to `source`,
            // and a block that answers only one of them reads as a stranger to half the app.
            source: STANDING_PLAN_PROTOCOL_ID,
            strength_protocol: STANDING_PLAN_PROTOCOL_ID,
            plan_version: 'standing_plan_v1',
            program: 'standing_plan',
            endurance_sport: sport,
            phase_structure: row.phaseStructure,
            /**
             * ⛔⛔ THERE IS NO `training_max` KEY ON THIS ROW, AND ITS ABSENCE IS THE DESIGN
             * (pivot §3). That key is Wendler's 85% of a TRUE 1RM and has three live readers. This
             * block's number is Viada's 96% of a FRESH prediction (p215). Writing one into the
             * other's key is the conversion the whole `working-number.ts` module exists to make
             * impossible — and a reader that found a number there would spend it as if it were the
             * other quantity.
             */
            standing_plan: row.config,
            one_rep_maxes_at_build: maxes,   // provenance: what aimed the test's warm-ups
            standing_plan_notes: row.notes,  // surfacing only — sources, gaps and what we could not honour
            user_selected_start_date: start_date ?? null,
          },
          sessions_by_week: row.sessions_by_week,
          notes_by_week: {},
          weeks: [],
        })
        .select('id')
        .single();

      if (spError || !spInserted) {
        console.error('[standing-plan] insert failed:', spError?.message);
        return json({ success: false, error: spError?.message || 'Failed to save the plan' }, 500);
      }
      return json({
        success: true, plan_id: spInserted.id, sport: 'strength', combined: false,
        strength_days: row.strength_days,
      }, 200);
    }

    console.log(
      `[strength-plan] no Standing Plan frame for this position (${frameResolution.reason}) — `
      + 'building the Get Stronger block, unchanged.',
    );

    const plan = composeStrengthPrimaryPlan({
      durationWeeks: Number(duration_weeks) > 0 ? Number(duration_weeks) : 12,
      oneRepMaxes: {
        bench: maxes.bench,
        squat: maxes.squat,
        deadlift: maxes.deadlift,
        overheadPress: maxes.overheadPress,
      },
      enduranceSport: sport,
      // ⛔ THE `: 2` HERE WAS LAYER 2 AND 3 OF Q-270's FOUR-DEEP DEFAULT CHAIN. It is the shared
      // constant now, and the announcement below is what makes a dropped answer visible.
      // ⚠️ `?? RUN_DAYS_DEFAULT` rather than `?? undefined`, because the composer's arg is required
      // and a missing value has to become the default SOMEWHERE — this is the door that says so.
      enduranceFrequency: runDaysAsked ?? RUN_DAYS_DEFAULT,
      goalName: typeof goal_name === 'string' ? goal_name : undefined,
      // ⚠️ `?? undefined`, not `?? 0` — absent must stay absent, because `null` miles and `0` miles
      // reach different branches of `runSelected` downstream.
      targetWeeklyMiles: runMilesAsked ?? undefined,
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
          if (hd.discipline !== 'run' && hd.discipline !== 'bike') return null;
          // ⛔ THE DAY IS OPTIONAL (§1i placement model, slice 8). Absent means "the engine proposes
          // one" — the normal case for a prescribed hard day. A day that is PRESENT but not a string
          // is still malformed and still drops the entry; absent and unusable are different answers.
          if (hd.day != null && typeof hd.day !== 'string') return null;
          /**
           * ⛔⛔ THIS ALLOWLIST WAS THE 2026-08-06 SET AND THE WIZARD MOVED PAST IT ON 2026-08-18.
           * Michael, on a built plan: *"it ended up giving me hills"* — after choosing Speed focus.
           *
           * Two fields were dropped ON THE FLOOR here, silently:
           *   • `goal` ('speed' | 'vo2') — the whole Speed-vs-VO2 split. Absent reads as `vo2`, so
           *     every sprint athlete got hill repeats and nothing said why.
           *   • `environment` — the bike's smart-trainer / stationary / road / climb answer, which
           *     had no reader at all.
           * And `terrain` kept an allowlist of four, so the three SPEED grounds (`track`,
           * `flat_road`, `turf`) and the threshold's `treadmill_1pct` were stripped as unrecognised.
           *
           * ⛔ THIS IS THE "COLLECTED AND DROPPED" PATTERN THIS CODEBASE KEEPS FINDING — the wizard
           * stored the answer, the goal row carried it, and the translation layer between them had
           * never heard of it. ⚠️ The allowlists now live beside the type they gate; adding a value
           * to `HardRunTerrain` or `HardRideEnvironment` without adding it HERE silently degrades the
           * athlete's pick to "not asked".
           */
          const terrainOk = new Set([
            'hill_3min', 'hill_short', 'treadmill', 'flat',   // the VO2 grounds
            'track', 'flat_road', 'turf',                     // the speed grounds
            'treadmill_1pct',                                 // the threshold ground
          ]);
          const terrain = typeof hd.terrain === 'string' && terrainOk.has(hd.terrain)
            ? hd.terrain as never
            : undefined;
          const envOk = new Set(['smart_trainer', 'stationary', 'flat_road', 'hill_climb', 'long_climb']);
          const environment = typeof hd.environment === 'string' && envOk.has(hd.environment)
            ? hd.environment as never
            : undefined;
          return {
            ...(typeof hd.day === 'string' && hd.day.trim() !== '' ? { day: hd.day } : {}),
            discipline: hd.discipline as 'run' | 'bike',
            ...(terrain ? { terrain } : {}),
            // ⚠️ ONLY 'speed' IS FORWARDED. Absent or anything else degrades to the shipped default
            // (`vo2`) in the composer, which is the same allowlist discipline as terrain.
            ...(hd.goal === 'speed' ? { goal: 'speed' as const } : {}),
            ...(environment ? { environment } : {}),
            /**
             * ⛔ THE ATHLETE'S INTENT ALLOCATION (2026-08-18) — WHICH SESSION THIS DAY IS.
             *
             * ⚠️ THIS IS THE FIELD THAT WOULD HAVE BEEN DROPPED NEXT. `goal` and `environment` were
             * both stored by the wizard, carried on the goal row, and thrown away right here for
             * twelve days — *"it ended up giving me hills"*. This one decides whether the athlete's
             * hard run is a sprint session or a threshold run, so losing it would put the plan in
             * direct contradiction with the card that promised it. Same allowlist discipline:
             * anything unrecognised degrades to absent, and absent falls back to list order.
             */
            ...(hd.role === 'intensity' || hd.role === 'threshold'
              ? { role: hd.role as 'intensity' | 'threshold' } : {}),
            // ⚠️ ABSENT OR UNRECOGNISED → `prescribed`, the shipped behaviour. A club day is the
            // athlete telling us they already attend it; nothing may infer that on their behalf.
            ownership: hd.ownership === 'club' ? 'club' as const : 'prescribed' as const,
          };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null),
      // §7 — the hard sessions' pace and wattage, and the gate that drops a hard day without one.
      // ⚠️ `learned-low` FTP IS ACCEPTED HERE. A low-confidence estimate is still a number the
      // session can be prescribed and progressed against, and the alternative is no hard ride at
      // all; the quality gate exists for plan targets that are baked for twelve weeks, which this
      // is not — the block rebuilds.
      ftpWatts: ftpResolved.value,
      thresholdPaceSecPerMi: thrResolved.sec_per_mi,
      /**
       * ⛔ AND WHERE IT CAME FROM. The session copy used to infer "measured" from the number merely
       * being non-null, which announced a typed value and a VDOT lookup as measurements.
       *
       * ⛔ `unknown` IS TRANSLATED, NOT PASSED (2026-08-19). The resolver abstaining does NOT mean the
       * session ships without a pace: `materialize-plan`'s threshold token falls through to **5K + 20
       * s/mi** (`:1596`), which is that file's own long-standing rule and is exactly why §7's hard-day
       * gate tests the 5K rather than a threshold. So a session whose resolver said "unknown" would
       * have told the athlete "no number yet" on a card that then showed them a pace target — the
       * two-authorities lie, one screen apart.
       *
       * The gate guarantees the 5K exists for any prescribed hard run that survives, so when the
       * resolver abstains the honest word is `derived-from-5k`.
       */
      thresholdPaceBasis: (() => {
        const b = describeThresholdBasis(thrResolved).state;
        if (b !== 'unknown') return b;
        return fiveKResolved.sec_per_mi != null ? 'derived-from-5k' : 'unknown';
      })(),
      fiveKPaceSecPerMi: fiveKResolved.sec_per_mi,
      // Bike hours (D-323 §6) — hours, never miles. Used on the bike-PRIMARY path.
      // ⚠️ `?? undefined`, not `?? 0` — absent must stay absent all the way to the composer, which
      // is the only place a default for it may be applied (and it says so when it does).
      targetWeeklyRideHours: rideHoursAsked ?? undefined,
      // ⛔ THE BIKE ALONGSIDE THE RUN. Validated here rather than trusted: a malformed block is
      // treated as absent, because a bike the composer cannot place is worse than no bike.
      bike: bike && typeof bike === 'object'
        ? {
            hours: normalizeRideHours((bike as Record<string, unknown>).hours, undefined) ?? undefined,
            longRideDay: typeof (bike as Record<string, unknown>).long_ride_day === 'string'
              ? (bike as Record<string, unknown>).long_ride_day as string : undefined,
            // ⛔ ONE STATEMENT OF THE 1-4 RANGE. The `Math.min(3, …)` that stood here is the whole
            // reason `_shared/athlete-weekly-intent.ts` exists — see the import at the top.
            days: normalizeRideDays((bike as Record<string, unknown>).days) ?? undefined,
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
      // ⛔ ONE STATEMENT OF THE SWIM CLAMP. The `Math.min(4, …)` that stood here is `SWIM_DAYS_MAX`
      // in `_shared/athlete-weekly-intent.ts`; the screen offers 1/2/3 and the wire has always
      // accepted 4, which is the safe direction (see the constant).
      swimDays: normalizeSwimDays(swim_days) ?? 0,
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
          endurance_frequency: runDaysAsked ?? RUN_DAYS_DEFAULT,
          phase_structure: plan.phaseStructure,
          // ⛔ THE WORKING NUMBERS, STORED. They ratchet +5 upper / +10 lower per cycle on their own
          // schedule. Derived instead of stored, the AMRAP write-back that lifts `performance_numbers`
          // would drag them with it and the controlled progression would be gone (SPEC §1).
          training_max: plan.training_max,
          one_rep_maxes_at_build: maxes, // provenance: what the working numbers were computed from
          assistance_picks: assistance_picks ?? null, // what the athlete chose, per day (D-407)
          swim_days: normalizeSwimDays(swim_days) ?? 0,
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
