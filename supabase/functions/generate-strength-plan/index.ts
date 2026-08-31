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
// generate-strength-plan — STRENGTH FOCUS (BARBELL, 4-DAY). the previous program.
//
// Contract: docs/SPEC-get-stronger.md. Strength is the spine; maintenance endurance
// (run OR bike — sport-agnostic) fills underneath. Composes the plan via the chassis
// (the Standing Plan composer), persists the standard `plans` row
// + `sessions_by_week`, returns plan_id. create-goal links + runs activate-plan (the
// same pipe as run/combined) — so it materializes into the calendar identically.
//
// Called internally by create-goal with the service-role key (like generate-run-plan).
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
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
  isWeekday,
  titleCaseDay,
  type Weekday,
  defaultCompetitionLifts,
  demonstratedRunVolume,
  demonstratedWeeklyMinutes,
  assignSports,
  FRAMES,
  isLongSlot,
  resolveFrame,
  STANDING_PLAN_PROTOCOL_ID,
  testWeekLiftNames,
  PATTERN_FOR_TESTED_LIFT,
  flattenViadaPicks,
  normalizeViadaPrefs,
} from '../_shared/standing-plan/index.ts';
/**
 * ⛔ THE ONE OWNER OF THE TRUSTED-REP CEILING (`_shared/strength/trusted-reps.ts`) — 8 reps general, 5 on the
 * deadlift, with LeSuer 1997 / Reynolds 2006 / Mayhew 2008 written out at the site. The skip check
 * needs it and the Standing Plan module may not import that file (its own source lint keeps the two
 * loading systems apart), so it is supplied from here as an argument.
 *
 * ⚠️ IT IS NOT THE PREVIOUS PROGRAM'S NUMBER. It is the app's e1RM trust ceiling, which happens to live in that
 * file; a second copy in the new module would be the doubled disease.
 */
/**
 * ⛔ THE ONE OWNER OF THE STORED PICK SHAPE (A1, 2026-08-24). `normalizeAssistancePrefs` migrates the
 * v1 flat shape, drops unrecognised keys and never returns a partial week — everything a second
 * reader of `training_prefs.assistance_picks` would have to reimplement and eventually get wrong.
 *
 * ⚠️ IT IS IMPORTED HERE AND NOT IN THE STANDING-PLAN MODULE, DELIBERATELY.
 * `standing-plan.test.ts`'s module lint forbids that directory from importing `assistance-catalog`
 * at all — it is the previous program's model and the Standing Plan may not reach into it. So the flattening
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
      target_weekly_miles, easy_pace_min_per_mile, long_run_day, assistance_picks, swim_days, swim_easy_sessions,
      // Added 2026-07-26 — the doctrine's second pin and the bike volume. Both were collected at
      // intake, stored on the goal, and dropped at `create-goal-and-materialize-plan` before this
      // function ever saw them.
      hard_days, long_session, target_weekly_ride_hours,
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
    // every cycle but the last is a leader, capped at two (the block-shape helper's leader cap) — because
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
    /**
     * ⛔⛔ WHICH FOCUS, READ OFF THE BODY AND VALIDATED (2026-08-30). Standard Focus builds the All
     * Rounder (p274-275); Run Focus builds Strength + 5K (p246-247). See `resolveFrame`.
     * ⚠️ AN UNRECOGNISED OR ABSENT VALUE TAKES THE 5K FRAME, which is what every caller before this
     * card existed already gets — so the default path is untouched by construction rather than by a
     * rule somebody has to remember.
     */
    const focusRaw = (body as Record<string, unknown>).focus;
    const focus = focusRaw === 'standard' ? 'standard' as const : 'run' as const;
    const framePosition = { enduranceSport: sport, focus };
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
      /**
       * ⛔ MINUTES PER SPORT, FOR THE LOW-VOLUME TIER (2026-08-27) — a different question from the
       * advanced tier's miles, and it needs the RIDES too. The tier asks whether the athlete is
       * already doing what the frame would build them, and the frame answers in minutes.
       * ⚠️ ABSENT IS NOT NEUTRAL HERE, and that is the opposite of the advanced tier's abstention: a
       * reader that cannot read must never ADD volume, and must never assume volume either.
       */
      let demonstratedMinutes: { run: number | null; ride: number | null } = { run: null, ride: null };
      try {
        const asOf = (typeof start_date === 'string' && start_date.trim())
          ? String(start_date).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const from = new Date(Date.parse(`${asOf}T00:00:00Z`) - 35 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        const { data: rows } = await supabase
          .from('workouts')
          // ⚠️ `moving_time` IS THE ONLY CLOCK READ — the row also carries `duration` and the two
          // disagree in unit. See `demonstratedWeeklyMinutes` for why an ambiguous field is refused.
          .select('type, date, distance, moving_time')
          .eq('user_id', String(user_id))
          .in('type', ['run', 'ride'])
          .gte('date', from)
          .lte('date', asOf);
        demonstrated = demonstratedRunVolume(rows as never, asOf);
        demonstratedMinutes = {
          run: demonstratedWeeklyMinutes(rows as never, asOf, 'run').weeklyMinutes,
          ride: demonstratedWeeklyMinutes(rows as never, asOf, 'ride').weeklyMinutes,
        };
      } catch (e) {
        console.warn('[standing-plan] demonstrated volume unreadable; base tier:', (e as Error)?.message);
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
      /**
       * ⛔⛔ THE INTERIM SENTENCE IS DELETED (§3c shipped, 2026-08-26). It read *"The programme owns
       * how many runs the week carries and how long they are, so the weekly mileage you typed is not
       * what sets them"* — true of the code that day, and NOT the ruling. `DECISIONS-2026-08-21`
       * §3c had already decided the opposite: **the number stays and gets bounded**, and it was
       * filed as "the first piece of the Standing Plan build". The copy shipped instead of the
       * feature, and Michael read it back on his own export a year of sessions later.
       *
       * ⛔ NOW THE NUMBER IS AN INPUT. `compose.ts` sizes every session toward it inside the book's
       * own bands, and says so when the picks cannot reach it — `volume-bounds.ts` `volumeLine`,
       * through the same compromise channel. A sentence here would be a second owner of that.
       * ⚠️ AND THE RIDE HOURS HAD NO SENTENCE AT ALL, so half the disclosure never existed. Both
       * sports are answered in one place now.
       */

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
      /**
       * ⛔⛔ HOW MANY DAYS A WEEK THEY DO EACH SPORT — their own answer, parsed ONCE and read twice
       * (Michael, 2026-08-27: *"I run for three hours a week over the course of three days…"*).
       *
       * ⛔ ZERO IS AN ANSWER (2026-08-30). This read `n > 0`, so an athlete answering "no running"
       * had their zero turned into `undefined` — which the composer reads as "nobody asked" and
       * answers with the frame's own runs. A bike-only athlete could not say they do not run.
       * ⚠️ `>= 0` keeps every other value identical; only the zero, previously unsayable, changes.
       *
       * ⛔⛔ AND IT WAS PARSED BELOW, INSIDE THE COMPOSE ARGS, WHERE `mixForFrame` COULD NOT SEE IT.
       * That was the whole bug of 2026-08-30: the mix defaulted to `RUN_DAYS_DEFAULT` while this said
       * zero, so "how much of each sport" had TWO answers. The mix decides which frame slots become
       * rides; at 2-vs-2 only the two hardest go to the bike and the LONG slot stays a run, and the
       * day-count trim then deleted it as an unasked run. An athlete asking for two rides and no
       * running lost the long ride — the only session that carries real hours — and got two short
       * hard rides. Hoisted so there is one owner.
       */
      const enduranceDaysBySport = (() => {
        const raw = (body as Record<string, unknown>).endurance_days;
        if (!raw || typeof raw !== 'object') return undefined;
        const pick = (k: string) => {
          const n = Number((raw as Record<string, unknown>)[k]);
          return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
        };
        const run = pick('run');
        const ride = pick('ride');
        return run == null && ride == null ? undefined : { run, ride };
      })();

      const mixForFrame = {
        /**
         * ⛔⛔ A STATED DAY COUNT BEATS THE RATIO DEFAULT (2026-08-30). The `?? DEFAULT` chain stays
         * exactly as it was for every athlete who has NOT answered — the 2026-08-23 rule that the
         * program owns the count, and `sport-slots.ts`'s default of hard slots to the bike with the
         * long session kept by the runner, are both untouched on that path. What changed is only
         * WHICH SOURCE WINS when the athlete has actually stated their days.
         */
        runs: runDaysAsked ?? enduranceDaysBySport?.run ?? RUN_DAYS_DEFAULT,
        rides: rideDaysAsked ?? enduranceDaysBySport?.ride
          ?? (bike && typeof bike === 'object' ? RIDE_DAYS_DEFAULT : 0),
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
        /** ⛔ The variant picks — validated shape only; the assigner validates the ids. */
        archetypes: (() => {
          const raw = (body as Record<string, unknown>).endurance_slot_archetypes;
          if (!raw || typeof raw !== 'object') return null;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof v !== 'string' || !v) return null;
            out[k] = v;
          }
          return Object.keys(out).length > 0 ? out : null;
        })(),
        /**
         * ⛔⛔ THE PER-SESSION LENGTHS (Michael, 2026-08-30) — see `SportMix.minutes`. The easy and
         * long rows take a direct minutes pick on Standard Focus, and this is the hop that carries it.
         * ⚠️ SHAPE VALIDATED HERE, MEANING VALIDATED IN THE COMPOSER: a value outside the slot's own
         * ladder resolves to the nearest real dose (`rungForMinutes`) rather than being refused, and
         * a key naming a quality slot is ignored there. What this rejects is a malformed map — and it
         * drops the WHOLE map rather than half of it, the same discipline the two fields above use,
         * because a half-applied answer builds a week nobody chose.
         */
        minutes: (() => {
          const raw = (body as Record<string, unknown>).endurance_slot_minutes;
          if (!raw || typeof raw !== 'object') return null;
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const n = Math.round(Number(v));
            if (!Number.isFinite(n) || n <= 0) return null;
            out[k] = n;
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

      /**
       * ⛔⛔ THE DAYS THE ATHLETE CANNOT TRAIN — A PIN, AND UNTIL NOW IT NEVER LEFT THE CLIENT
       * (2026-08-25). The wizard's chip row fed only the preview's own solve, so the block this
       * function composed had never heard of it and put both a lifting day and an endurance session
       * onto the day off. It reaches two places from here: the ROTATION (`chooseDayMap`, which
       * scores all seven to keep the lifts clear) and the COMPOSER (which steps the endurance off).
       *
       * ⚠️ VALIDATED, NOT TRUSTED — the same allowlist discipline as every other field on this body.
       * An unrecognised weekday is dropped rather than coerced: a bad value must mean "no
       * constraint", never "block a day nobody named".
       */
      const unavailableDays: Weekday[] = (() => {
        const raw = (body as Record<string, unknown>).unavailable_days;
        if (!Array.isArray(raw)) return [];
        const out: Weekday[] = [];
        for (const v of raw) {
          // ⚠️ NARROWED INLINE. `asWeekday` below does the same job and is declared later in this
          // scope; a `const` arrow cannot be called above its own declaration.
          const d = titleCaseDay(v);
          if (isWeekday(d) && !out.includes(d)) out.push(d);
        }
        return out;
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
        // ⛔ THE ROTATION IS SCORED TO KEEP THE LIFTS OFF THESE DAYS — see `DayPins.unavailableDays`.
        unavailableDays,
        startDateIso: typeof start_date === 'string' ? start_date : null,
      });

      /**
       * ⛔⛔ THE PINS, FORWARDED TO THE COMPOSER AS ABSOLUTES (pins-win ruling, 2026-08-25).
       *
       * `chooseDayMap` above still scores them FIRST — the rotation is chosen to reach as many pins
       * as it can, and when it reaches them all this changes nothing at all. What this adds is the
       * remainder: a pin the rotation could not reach now moves its own endurance session, instead
       * of being reported as a compromise and quietly ignored.
       *
       * ⚠️ SAME READS AS THE DAY MAP'S, DELIBERATELY. Two derivations of "which day did the athlete
       * pin" is how the rotation and the placement come to disagree about the same answer.
       * ⚠️ ORDER IS THE FRAME'S. `hard` is positional against the frame's own hard slots, which is
       * the order `anchorDaysFor` returns and the order the wizard lists them in.
       * ⚠️ TITLE-CASED HERE, because the composer speaks `Monday` and the wire speaks `monday` —
       * the casing trap this repo has now hit in three files.
       */
      // ⚠️ NARROWED, NOT CAST. `titleCaseDay` returns `''` for anything it does not recognise, and
      // an unrecognised day must degrade to "no pin" rather than to a string the composer will
      // compare against and never match.
      const asWeekday = (raw: unknown): Weekday | null => {
        const d = titleCaseDay(raw);
        return isWeekday(d) ? d : null;
      };
      /**
       * ⛔ A CLUB LONG SESSION IS A PIN BY ITS NATURE (slice 2b, 2026-08-25). Its day is fixed by
       * the world, so the composer must not treat it as a preference the rotation may miss. The DAY
       * itself already arrives as `long_run_day` / `long_ride_day`; this only says who owns it.
       * ⚠️ IT NEVER ENTERS `hard_days`, so it cannot be counted as a hard session anywhere.
       */
      const longIsClub = !!long_session && typeof long_session === 'object'
        && (long_session as Record<string, unknown>).ownership === 'club';
      const endurancePins = {
        long: asWeekday(longSlotSport === 'ride'
          ? (bike && typeof bike === 'object' ? (bike as Record<string, unknown>).long_ride_day : null)
          : long_run_day),
        hard: (Array.isArray(hard_days) ? hard_days : [])
          .map((h) => (h && typeof h === 'object' ? (h as Record<string, unknown>).day : null))
          .map(asWeekday),
      };

      /**
       * ⛔ THE TEST-WEEK SKIP — OFFERED ON EVIDENCE, NEVER ON A PREFERENCE (Michael, 2026-08-23).
       *
       * ⛔ THE DEFAULT IS THE TEST. `skip_test_week` has to arrive true AND the evidence has to be
       * there; either alone builds the test week. An absent answer is an answer: run the test.
       *
       * ⛔ AND THE NUMBER COMES FROM THE LOGGED SET, NOT FROM `performance_numbers`. That is what
       * makes "a typed-in max never skips" true by construction rather than by a rule — the stored
       * figure is never read on this path at all. the archived loading module records that a typed number
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
      /**
       * ⛔⛔ WEEK ONE IS THE TEST WEEK, FOR EVERYONE, EVERY BLOCK (Michael, 2026-08-30: *"one rep max
       * test for the first week and that should not be optional. The first week is tests."*).
       *
       * ⛔ THE SKIP OFFER IS GONE. It read the athlete's logged lifting over a window and, when the
       * evidence covered every prescribed lift, offered to derive the working numbers from those sets
       * instead of testing. The evidence reader was careful — it took the number from the logged SET
       * rather than `performance_numbers`, so a typed-in max could never skip — and none of that is
       * the point any more. The test week is the prescription, not a formality to be waived when the
       * data looks good enough.
       *
       * ⚠️ NOTHING IS STRANDED. Zero plans in the project carry `test_skipped: true` (checked
       * 2026-08-30 across every row), so no existing block depends on the skipped shape.
       * `rematerialize-standing-block` still READS the stored flag and can stay as it is — it will
       * simply never see a true again.
       * ⚠️ `evidenceForSkip` / `evidenceWorkingNumbers` in `_shared/standing-plan/test-skip.ts` now
       * have no live caller. Left in place rather than deleted, with their tests, because removing
       * them is a separate call — flagged, not smuggled.
       */
      if ((body as Record<string, unknown>).skip_test_week === true) {
        console.log(
          '[standing-plan] a caller asked to skip the test week; the option no longer exists and '
          + 'week one is the test week.',
        );
      }

      /**
       * ⛔ THE ATHLETE'S ACCESSORY PICKS, FLATTENED (A1, 2026-08-24). Twelve per-day choices become a
       * deduped list of movement names, because this frame's four days do not map onto the picker's
       * three and placing a pick by what it TRAINS is the only honest reading. Full reasoning on
       * `ComposeArgs.accessoryPicks`.
       *
       * ⛔ AND THE FOCUS CHIPS NOW TRAVEL TOO (B2, 2026-08-24). A chip cannot re-point a slot —
       * the slots are named by pattern and category from p246 — so a chip biases WHICH movement
       * fills a HYP slot: among the cell's own options, one whose prime mover the athlete asked
       * for wins. `core` is a chip only this engine reads; Get Stronger's `isFocusChip` filters it,
       * which is that path's own stated migration.
       */
      /**
       * ⛔ AND SINCE 2026-08-24 THERE ARE TWO SHAPES IN THAT ENVELOPE, ONE PER SCREEN.
       *
       * The Standing Plan's own accessory screen writes a `viada` block — seven picks named after
       * THIS frame's slots, plus the Dial chips. Get Stronger keeps writing `by_day`. Which
       * block a goal carries is how this reader knows which screen the athlete saw, so no flag is
       * needed and no goal has to be migrated.
       *
       * ⚠️ THE `by_day` FLATTENING RUNS ONLY WHEN THERE IS NO `viada` BLOCK. Running both would
       * feed the floor nine the previous program movements the athlete never chose on this path — the balanced
       * default, which this screen leaves untouched precisely because it does not ask about it.
       */
      const viadaPrefs = normalizeViadaPrefs(
        (body as Record<string, unknown>).assistance_picks
          && typeof (body as Record<string, unknown>).assistance_picks === 'object'
          ? ((body as Record<string, unknown>).assistance_picks as Record<string, unknown>).viada
          : null,
        equipmentStrength,
        // ⛔ THE FRAME — without it this reads p246's key list whatever programme is being built,
        // and returns that table's defaults in place of the athlete's answers. See its own note.
        frameId,
      );
      const accessoryPicks = (() => {
        // ⛔ THE STANDING PLAN'S OWN PICKS, FLATTENED FOR THE FLOOR. The slot picks reach their
        // cells through `slotPicks`; this list is what carries the core pick and the Dial
        // rows to `fillMuscleFloor`'s `prefer`, which is the only route those two have.
        if (viadaPrefs) {
          const named = flattenViadaPicks(viadaPrefs);
          return named.length > 0 ? named : undefined;
        }
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
      const focusChips = (() => {
        // ⛔ SUPERSEDED ON THIS PATH. The Dial moves volume; the focus chips biased a
        // cell's choice. Sending both would have the two arguing inside one slot — see
        // `exerciseForSlot`'s own note, where the bias stands down.
        if (viadaPrefs) return undefined;
        const raw = (body as Record<string, unknown>).assistance_picks;
        const focus = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).focus : null;
        if (!Array.isArray(focus)) return undefined;
        const known = ['arms', 'chest', 'shoulders', 'glutes', 'core'];
        const out = focus.map((f) => String(f)).filter((f) => known.includes(f));
        return out.length > 0 ? out : undefined;
      })();

      const row = buildStandingPlanRow({
        compose: {
          frame: frameId,
          /**
           * ⛔⛔ §3c — THE TYPED NUMBERS REACH THE COMPOSER (2026-08-26). They were read at `:161`
           * and `:176` and handed only to the archived Get Stronger composer, so
           * a Standing Plan block had never seen either of them: fifteen miles asked, about four
           * built, and the ride hours dropped without a word.
           * ⚠️ `?? undefined`, NOT `?? 0` — absent must stay absent. Zero is an answer ("no running")
           * and no answer is not; `sizeFor` keeps the library's own midpoint for the second.
           */
          targetWeeklyMiles: runMilesAsked ?? undefined,
          targetWeeklyRideHours: rideHoursAsked ?? undefined,
          /**
           * ⛔ THE HOURS ASK, PER SPORT — the wizard's dropdowns (§3c). ⚠️ Validated here rather
           * than trusted: a non-numeric or non-positive value is treated as ABSENT, because absent
           * means "no opinion" and the composer keeps the library's midpoint, while a coerced zero
           * would read as "no running at all".
           */
          targetRunHours: (() => {
            const n = Number((body as Record<string, unknown>).target_run_hours);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
          targetRideHours: (() => {
            const n = Number((body as Record<string, unknown>).target_ride_hours);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
          /**
           * ⛔⛔ HOW MANY DAYS A WEEK THEY DO EACH SPORT — their own answer, and the thing their hours
           * are divided across (Michael, 2026-08-27: *"I run for three hours a week over the course
           * of three days. I ride for four hours a week over the course of two days and then we chop
           * it up according to the plans numbers"*).
           * ⚠️ A SEPARATE FIELD FROM `run_days` / `ride_days`, deliberately. Those are the slot RATIO
           * this frame assigns sports by; this is a count of DAYS. Overloading one on the other is
           * how a ratio starts being read as a schedule.
           */
          enduranceDaysBySport,
          // ⛔ THE ATHLETE'S DAYS BEAT THE FRAME ORDER — see `endurancePins` above and the note on
          // the field in `compose.ts`. Absent pins leave the rotation exactly as it was.
          endurancePins,
          // ⛔ AND THE ENDURANCE STEPS OFF A BLOCKED DAY BY ITSELF — `ComposeArgs.unavailableDays`.
          // ⚠️ Sent even when the rotation cleared the lifts: the two are different jobs, and an
          // endurance slot can land on a blocked day under a rotation that kept every lift clear.
          ...(unavailableDays.length > 0 ? { unavailableDays } : {}),
          ...(accessoryPicks ? { accessoryPicks } : {}),
          ...(focusChips ? { focus: focusChips } : {}),
          ...(viadaPrefs ? { slotPicks: viadaPrefs.picks } : {}),
          ...(viadaPrefs && viadaPrefs.dial.length > 0
            ? { dial: viadaPrefs.dial } : {}),
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
          // ⛔ ALWAYS UNDEFINED SINCE 2026-08-30 — the working numbers come from week one's test,
          // never from logged evidence. See the test-week block above.
          workingNumbers: undefined,
          // ⛔ NEVER TRUE SINCE 2026-08-30 — week one is the test week for every block.
          skipTestWeek: false,
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
           * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — THE SOLE INPUT TO THE ENDURANCE
           * LEVEL (Michael, 2026-08-27). The wizard asks it once, per sport, on the Endurance focus
           * step, and gates Continue on it.
           *
           * ⚠️ VALIDATED HERE RATHER THAN TRUSTED, and per sport: an unrecognised value drops THAT
           * sport rather than the pair, and a dropped sport takes the frame's own printed levels —
           * which is what every block built before this shipped already carries.
           */
          enduranceExperience: (() => {
            const raw = (body as Record<string, unknown>).endurance_experience;
            if (!raw || typeof raw !== 'object') return undefined;
            const out: Record<string, string> = {};
            for (const sport of ['run', 'ride'] as const) {
              const v = (raw as Record<string, unknown>)[sport];
              if (v === 'newer' || v === 'experienced') out[sport] = v;
            }
            return Object.keys(out).length > 0 ? out as never : undefined;
          })(),
          /**
           * ⛔ IT NO LONGER DECIDES THE LEVEL (2026-08-27) — `enduranceExperience` above does, with
           * no fallback to this. Still measured and still sent: the field stays on the composer for
           * its other readers, and removing it was ruled out of scope the same day.
           */
          demonstratedWeeklyMinutes: demonstratedMinutes,
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
          /** ⛔ The easy-swim ADD-ON (Michael, 2026-08-24) — outside the four slots, cap 2. */
          swimEasySessions: Math.min(2, Math.max(0, Math.round(Number(swim_easy_sessions) || 0))),
          roundTo: 5,
        },
        weeks: Number(duration_weeks) > 0 ? Number(duration_weeks) : 12,
        // ⛔ NO SCHEDULED TAPER — p120. The deload column is a tool you deploy (a race two weeks
        // out, p247), never a recovery week on a timer. This block has no race in it.
        taperWeeks: [],
        goalName: typeof goal_name === 'string' ? goal_name : undefined,
        demonstratedMilesSource: demonstrated.source,
        dayMap,
        // ⛔ ALWAYS NULL SINCE 2026-08-30 — nothing is skipped, so there is no evidence to record.
        skipEvidence: null,
        extraNotes: wiringNotes,
      });

      console.log(
        `[standing-plan] composed: ${row.name} (${row.duration_weeks}wk, frame ${frameId}) — `
        + `test week ${row.config.test_week}, demonstrated ${demonstrated.weeklyMiles ?? 'unknown'} mi/wk `
        + `(${demonstrated.source}); no working numbers until the test is read.`,
      );

      if (preview === true) {
        /**
         * ⛔ THE PREVIEW NO LONGER CARRIES A SKIP OFFER (2026-08-30). It used to, so a surface could
         * put *"we could start from your logged sets"* in front of the athlete before they committed.
         * There is nothing to offer: week one is the test week. A field that always says "no" is a
         * question the screen would still have to render an answer to.
         */
        return json({
          success: true, plan_id: null, plan: row, phase_structure: row.phaseStructure,
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
             * (pivot §3). That key is the previous program's 85% of a TRUE 1RM and has three live readers. This
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

    /**
     * ⛔ NO FALLBACK. THE OLD STRENGTH BUILDER IS ARCHIVED (2026-08-30, Michael's call: the previous
     * program is archived until he chooses to build a plan solely on it).
     *
     * This branch used to hand every position the Standing Plan could not serve to the Get Stronger
     * composer. Strength is Viada's now, and a silent fall-through to a different method is exactly
     * the thing he cannot see coming.
     *
     * ⛔ IT REFUSES, IT DOES NOT SUBSTITUTE. `resolveFrame` returns null for exactly one position —
     * no endurance sport being held — and every frame is a hybrid week, so there is nothing honest
     * to build. Returning the resolver's own reason beats building something the athlete did not
     * ask for: a wrong plan is worse than no plan, and it was inventing a whole method.
     *
     * ⚠️ 422, NOT 500. Nothing failed; the position is one this build does not serve.
     *
     * ⚠️ IF A NON-ENDURANCE STRENGTH PRODUCT IS WANTED LATER, it is a new frame in
     * `frame-resolver.ts`, or the archived builder revived deliberately as its own plan type — not
     * a fall-through restored here.
     */
    console.log(
      `[strength-plan] refusing: no Standing Plan frame for this position (${frameResolution.reason}).`,
    );
    return json({
      success: false,
      error: `This build needs an endurance sport to hold — ${frameResolution.reason}.`,
      reason: frameResolution.reason,
    }, 422);
  } catch (e) {
    console.error('[strength-plan] error:', (e as Error)?.message);
    return json({ success: false, error: (e as Error)?.message || 'strength plan generation failed' }, 500);
  }
});
