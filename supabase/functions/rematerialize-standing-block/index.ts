// @ts-nocheck
// Function: rematerialize-standing-block
//
// ⛔ THE TEST WEEK BECOMES THE BLOCK'S WEIGHTS. Stage 4 slice 2, 2026-08-23.
//
// A Standing Plan block is authored in full at build time and its pretest is in WEEK ONE, so when
// the twelve weeks are written there is no working number for any lift and every strength row after
// the test opens on the app's auto-regulated contract — the movement and the reps, and nothing about
// the weight. This function is what comes back afterwards, reads what the athlete actually lifted,
// and states the weights that follow from it.
//
// ⛔ IT IS THE SAME SHAPE AS `rematerialize-strength-block` AND SHARES NONE OF ITS ARITHMETIC. That
// one walks a THE PREVIOUS PROGRAM TRAINING MAX (85% of a true 1RM) through cycle verdicts. This one reads a
// VIADA PRETEST (96% of a fresh two-formula prediction, p215) and re-runs the Standing Plan composer.
// The two numbers are different quantities wearing one English word and no function takes both.
//
// ⛔ IT PROPOSES. IT DOES NOT SILENTLY WRITE. Dry run by default; `apply: true` is the athlete's tap.
// That is the law the deleted auto-progression earned: *"the athlete opened the logger to a number
// they never agreed to."*
//
// ⚠️ IT ONLY EVER REWRITES WEEKS THAT HAVE NOT STARTED. History is not editable, and the live week
// keeps the prescription it is being judged against.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import { resolvePlanWeekIndex } from '../_shared/plan-week.ts';
import {
  composeBlock,
  earnedMeSets,
  readTestWeek,
  restateFromTest,
  testDayCutoff,
  // ⚠️ ONE ANSWER TO "which weekday is this date" — the same helper the restatement matches rows on.
  STANDING_PLAN_PROTOCOL_ID,
  TEST_WEEK_INDEX,
  weekLedgersFor,
} from '../_shared/standing-plan/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ⛔ THE VERIFIED JWT, never a body-supplied id — the B1 auth boundary. Throws 401 on a forged
    // token, the anon key, or the service key; this is a CLIENT-FACING function by design, because
    // applying is the athlete's tap.
    const { userId } = await requireUser(req);

    const p = await req.json().catch(() => ({}));
    const willWrite = p?.apply === true;
    const asOf = typeof p?.as_of === 'string' ? String(p.as_of).slice(0, 10) : null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` } } },
    );

    // ── THE BLOCK ────────────────────────────────────────────────────────────
    let planQ = supabase.from('plans').select('id, name, config, duration_weeks, status').eq('user_id', userId);
    planQ = p?.plan_id ? planQ.eq('id', String(p.plan_id)) : planQ.eq('status', 'active');
    const { data: plan } = await planQ.maybeSingle();
    if (!plan) return json({ success: false, reason: 'no_plan' }, 404);

    const config = plan.config ?? {};
    // ⛔ BOTH DIALECTS, same as `block-identity.ts` reads them. A block that answers only one is a
    // stranger to half the app.
    const isStanding = String(config?.strength_protocol ?? '') === STANDING_PLAN_PROTOCOL_ID
      || String(config?.source ?? '').toLowerCase() === STANDING_PLAN_PROTOCOL_ID;
    if (!isStanding) return json({ success: false, reason: 'not_a_standing_plan_block' }, 400);

    const sp = config?.standing_plan ?? null;
    if (!sp?.frame || !sp?.test_lift_names) {
      return json({ success: false, reason: 'block_carries_no_standing_plan_config' }, 400);
    }

    const weeks = Number(plan.duration_weeks) || 12;
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const currentWeek = resolvePlanWeekIndex(config, today, weeks) ?? 1;

    // ── WHAT THE TEST WEEK ACTUALLY RECORDED ─────────────────────────────────
    const { data: plannedRows } = await supabase
      .from('planned_workouts')
      // ⛔ COMPLETION TRAVELS WITH THE ROW NOW — the cut is per session, not per week, so
      // `restateFromTest` has to be able to tell a done session from a future one.
      .select('id, week_number, date, strength_exercises, workout_status, completed_workout_id')
      .eq('training_plan_id', plan.id)
      .eq('user_id', userId);

    // ⛔ THE PLANNED ROW CARRIES THE WEEK **AND THE DATE**. The date was added 2026-08-24 for the ME
    // ladder: `earnedMeSets` matches on week + WEEKDAY + movement, the same three keys the restater
    // uses, and a logged workout carries neither the plan week nor the plan's weekday of its own.
    const weekById = new Map<string, { week: number; date: string | null }>();
    for (const r of plannedRows ?? []) {
      if (r?.id && typeof r.week_number === 'number') {
        weekById.set(String(r.id), { week: r.week_number, date: typeof r.date === 'string' ? r.date : null });
      }
    }
    const { data: doneRows } = await supabase
      .from('workouts')
      .select('planned_id, strength_exercises')
      .eq('user_id', userId)
      .eq('type', 'strength')
      .in('planned_id', [...weekById.keys()]);
    // ⚠️ THE WEEK NUMBER COMES FROM THE PLANNED ROW, not from the workout. `readTestWeek` refuses a
    // set it cannot prove is week one, and a logged workout carries no plan week of its own.
    const joined = (doneRows ?? []).map((w: Record<string, unknown>) => ({
      week_number: weekById.get(String(w?.planned_id))?.week ?? null,
      date: weekById.get(String(w?.planned_id))?.date ?? null,
      strength_exercises: w?.strength_exercises ?? null,
    }));

    const reading = readTestWeek(joined, sp.test_lift_names);
    /**
     * ⛔ THE NUMBERS ON FILE STAY (D-467, 2026-09-04). A block built on "Use current" carries its working
     * numbers in `config.working_numbers` (cite names the file source). A partial test — one lift missing,
     * tested in week one — reads that ONE lift here; the other lifts have no test set to read and must
     * not fall out of the block. Seed them from the stored numbers; a logged test always wins.
     */
    try {
      const stored = (sp.working_numbers ?? null) as Record<string, Record<string, unknown>> | null;
      if (stored && typeof stored === 'object') {
        for (const [lift, w] of Object.entries(stored)) {
          if ((reading.working as Record<string, unknown>)[lift]) continue;
          const cite = String(w?.cite ?? '');
          if (!/performance_numbers|strength_1rms/.test(cite)) continue; // only numbers that came from the file
          (reading.working as Record<string, unknown>)[lift] = w;
          reading.missing = reading.missing.filter((m) => m.lift !== lift);
        }
      }
    } catch (e) { console.warn('[restate] stored working numbers not read:', (e as Error)?.message ?? String(e)); }
    /**
     * ⛔ A LOCKED 1RM OVERRIDES THE TEST (Michael 2026-09-02: "user should be able to override — I don't
     * know why they would, but they should"). `user_baselines.locked_baselines[lift]` is the athlete's
     * asserted number with auto off (D-459). When one is set it IS the working number for that lift,
     * ahead of the week-1 test read; the test still stands for every unlocked lift, and a locked lift
     * with no test stops being "missing". Provenance is on the record: `cite` names the lock.
     */
    try {
      const { data: ubLock } = await supabase.from('user_baselines').select('locked_baselines').eq('user_id', userId).maybeSingle();
      const locked = (ubLock?.locked_baselines ?? null) as Record<string, unknown> | null;
      const LOCK_KEY: Record<string, string> = { bench: 'bench', squat: 'squat', deadlift: 'deadlift', overheadPress: 'overheadPress1RM' };
      if (locked && typeof locked === 'object') {
        for (const [lift, key] of Object.entries(LOCK_KEY)) {
          const v = Number(locked[key]);
          if (!Number.isFinite(v) || v <= 0) continue;
          const prior = (reading.working as Record<string, any>)[lift];
          (reading.working as Record<string, any>)[lift] = {
            lift,
            predicted1RM: v,
            workingNumber: v,
            measured: prior?.measured ?? { weight: v, reps: 1 },
            cite: 'user_baselines.locked_baselines — the athlete\'s locked number overrides the week-1 test (D-459, 2026-09-02)',
          };
          reading.missing = reading.missing.filter((m) => m.lift !== lift);
        }
      }
    } catch (e) { console.warn('[restate] locked_baselines not read:', (e as Error)?.message ?? String(e)); }
    const found = Object.keys(reading.working);
    // ⛔ THE RESPONSE CARRIES THE NAME THE ATHLETE SEES (2026-08-24, Michael on device: the sheet
    // printed `overheadPress`). `working` is keyed by lift for the composer; the sheet needs the
    // tested DISPLAY name, and `sp.test_lift_names` — the block's own record of what week one
    // prescribed, competition overrides included — is the one owner of that string. Only the
    // RESPONSE is enriched; the config write below stores the raw shape the restate reads back.
    const workingNamed = Object.fromEntries(
      Object.entries(reading.working).map(([k, v]) => [
        k, { ...(v as Record<string, unknown>), movement: (sp.test_lift_names as Record<string, string>)?.[k] ?? k },
      ]),
    );
    if (found.length === 0) {
      // ⛔ ABSTAIN, LOUDLY. No completed test set means no working number, and the block keeps the
      // "by feel" contract it was written with rather than being prescribed off a guess.
      return json({
        success: true, applied: false, current_week: currentWeek,
        reason: 'no_completed_test_sets',
        missing: reading.missing,
      });
    }

    // ── RE-COMPOSE WITH THE NUMBERS IN ───────────────────────────────────────
    //
    // ⛔ THE SAME COMPOSER THAT WROTE THE BLOCK, with one argument filled in. A rewrite that carried
    // its own percentage table would be a different programme wearing this one's name.
    /**
     * ⛔⛔ THE BLOCK'S OWN ACCESSORY PICKS, READ BACK FROM ITS CONFIG (A1) — same law as the rotation
     * and the sport mix below. `restateFromTest` matches a composed row to a calendar row on the
     * MOVEMENT NAME; re-composing from the athlete's current picks would put a different movement in
     * the same slot, match nothing, and report the block as unmatched — a silent no-op that reads as
     * "the test produced nothing".
     */
    const blockPicks = Array.isArray(sp.accessory_picks) ? sp.accessory_picks as string[] : null;
    /**
     * ⛔⛔ AND THE BLOCK'S OWN PER-SLOT PICKS AND DIAL CHIPS (D-450) — same law, larger blast
     * radius. `slotPicks` decides which movement fills five cells across six days and `dial`
     * changes SET COUNTS as well as adding rows, so a restate that re-composed without them would
     * build a week whose movements and set counts both differ from the calendar's. `restateFromTest`
     * matches on the movement NAME: every row would report unmatched and the whole restate would
     * read as "the test produced nothing".
     *
     * ⚠️ ABSENT ON EVERY BLOCK BUILT BEFORE THIS SHIPPED, which composes exactly as it did.
     */
    const blockSlotPicks = sp.slot_picks && typeof sp.slot_picks === 'object' && !Array.isArray(sp.slot_picks)
      ? sp.slot_picks as Record<string, string>
      : null;
    const blockDial = Array.isArray(sp.dial) ? sp.dial as string[] : null;

    const composeBase = {
      frame: sp.frame,
      weeks,
      taperWeeks: [] as number[],
      competitionLifts: sp.competition_lifts ?? {},
      workingNumbers: reading.working,
      seed1RMs: sp.seed_one_rep_maxes ?? {},
      /**
       * ⛔⛔ THE BLOCK'S OWN EQUIPMENT, READ BACK FROM ITS CONFIG — the same law as the rotation, the
       * sport mix and the accessory picks below, and it was the one that had no writer.
       *
       * This line read `config.athlete_equipment` and **nothing in the app ever wrote that key**, so
       * every restate re-composed UNGATED: a different movement in the same slot from the one the
       * calendar carries, matched on name by `restateFromTest`, matching nothing — the silent no-op
       * that reads as "the test produced nothing". `plan-row.ts` now stores the kit on the block
       * itself (`standing_plan.athlete_equipment`), which is where the rest of the re-composition
       * arguments live and the one place that owns it.
       *
       * ⚠️ THE OLD TOP-LEVEL KEY IS STILL READ, second. It costs a line, and a block written by
       * anything that does put it there still restates gated.
       */
      equipment: Array.isArray(sp?.athlete_equipment)
        ? sp.athlete_equipment
        : (Array.isArray(config?.athlete_equipment) ? config.athlete_equipment : null),
      demonstratedWeeklyMiles: sp.demonstrated_weekly_miles ?? null,
      /**
       * ⛔⛔ THE EXPERIENCE ANSWER THE BLOCK'S LEVELS WERE BUILT FROM, READ BACK (2026-08-27) — and
       * THIS IS THE HOP THAT MATTERS MOST. It is the sole input to the endurance level, and this
       * function rewrites every week the athlete has not started yet. Without it, the first restate
       * after week one re-composes those weeks at the frame's own printed levels: an athlete who
       * answered "Newer" watches their hard sessions and their long session grow mid-block, with
       * nothing said, on a calendar they were already training against.
       *
       * ⚠️ READ, NEVER RE-ASKED. The athlete's answer can change in a later wizard run; the calendar
       * cannot. This block's own answer is what has to be reproduced — same law as `day_offset`,
       * `sport_mix` and `athlete_equipment`.
       * ⚠️ ABSENT ON EVERY BLOCK BUILT BEFORE THIS SHIPPED, which re-composes exactly as it did.
       */
      ...(sp.endurance_experience && typeof sp.endurance_experience === 'object'
        ? { enduranceExperience: sp.endurance_experience }
        : {}),
      /**
       * ⛔⛔ THE BLOCK'S OWN ROTATION, READ BACK FROM ITS CONFIG — NOT RE-DERIVED FROM THE PINS.
       *
       * `restateFromTest` matches a composed session to a calendar row on week + WEEKDAY + movement.
       * Re-composing at offset zero against a block that runs on offset one would put every session
       * on the wrong weekday, match nothing, and report the whole block as `unmatched` — a silent
       * no-op that looks like "the test produced nothing".
       *
       * ⚠️ AND IT IS READ, NOT RECOMPUTED. The athlete's pinned days can change after the block was
       * built; the calendar cannot. `day_offset` is what this block actually ran on.
       */
      dayOffset: Number(sp.day_offset) || 0,
      /**
       * ⛔ THE DAYS THAT WERE BLOCKED WHEN THE BLOCK WAS BUILT, READ BACK — same rule as the
       * rotation above. The endurance was stepped off them at build time, so a restate that did not
       * know about them would compose those sessions back onto their frame days, match nothing on
       * weekday, and report the block as unmatched. ⚠️ Read, never re-derived from the athlete's
       * current answers: the calendar is what this has to reproduce.
       */
      ...(Array.isArray(sp.unavailable_days) && sp.unavailable_days.length > 0
        ? { unavailableDays: sp.unavailable_days as string[] } : {}),
      /**
       * ⛔ THE BLOCK'S OWN SPORT MIX, READ BACK — same rule as the rotation above. A restate that
       * re-derived the mix from the athlete's CURRENT answers would compose a different week (a ride
       * where the calendar has a run) and match nothing, reporting the whole block as unmatched.
       */
      ...(sp.sport_mix ? { sportMix: sp.sport_mix } : {}),
      // ⛔ The swim add-on rides the same restate contract: re-compose the identical week.
      ...(sp.swim_easy_sessions ? { swimEasySessions: Number(sp.swim_easy_sessions) } : {}),
      // ⚠️ A SKIPPED BLOCK HAS NO TEST WEEK AND MUST NOT GROW ONE ON A RESTATE. It also has nothing
      // to restate — `readTestWeek` finds no week-one test sets and this function abstains above —
      // but carrying the flag keeps the re-composition identical to the block that was built.
      skipTestWeek: sp.test_skipped === true,
      ...(blockPicks ? { accessoryPicks: blockPicks } : {}),
      ...(blockSlotPicks ? { slotPicks: blockSlotPicks } : {}),
      ...(blockDial ? { dial: blockDial } : {}),
      roundTo: 5,
    };

    /**
     * ⛔ TWO COMPOSITIONS, AND THE FIRST ONE IS NOT WASTE (A2, 2026-08-24).
     *
     * The ME set ladder is read off logged sessions, and finding those sessions needs to know which
     * rows WERE the ME rows — which movement, on which day, at which prescribed weight. That index
     * comes from the composer itself (`ComposedWeek.meRows`), so the shape has to exist before the
     * ladder can be read, and the ladder has to be read before the block can be composed WITH it.
     *
     * ⚠️ THE PROBE COMPOSES AT THE BLOCK'S AUTHORED SET COUNTS, which is exactly what the athlete
     * trained against — so the movements, the days and the prescribed weights it reports are the ones
     * on their calendar. Composing the probe with the earned counts would be circular.
     */
    const probe = composeBlock(composeBase);
    const ladder = earnedMeSets({
      composed: probe,
      logged: joined,
      // ⛔ HISTORY AND THE LIVE WEEK ARE EVIDENCE; THE FUTURE IS NOT. The same boundary the restater
      // draws for writing, drawn here for reading.
      throughWeek: currentWeek,
    });

    /**
     * ⛔ THE EARNED BAR REACHES THE REMAINING WEEKS HERE (item 7, 2026-08-26) — and it is the SAME
     * path the set ladder already ran on, not a second one.
     *
     * A jump earned in week three has to appear in weeks four through twelve, or the mechanism
     * computes correctly and reaches nobody's calendar. `restateFromTest` below already rewrites
     * every week after the live one when a weight moves; feeding the offset into this composition is
     * all it takes for an early jump to rebuild the rest of the block.
     *
     * ⚠️ AND ONLY THE WEEKS THAT HAVE NOT STARTED. History is not editable and the live week keeps
     * the prescription it is being judged against — the boundary `afterWeek` draws below.
     */
    const composed = composeBlock({
      ...composeBase,
      ...(Object.keys(ladder.sets).length > 0 ? { meSetsByPattern: ladder.sets } : {}),
      ...(Object.keys(ladder.bar).length > 0 ? { barOffsetsByPattern: ladder.bar } : {}),
      // ⛔ AND WHAT THEY GOT LAST TIME, ON THE SAME PATH (stage 2, items 5 and 6). The row prints it
      // so a working block stops looking frozen, and the logger's rep cell opens on it instead of on
      // the top of the band — the phantom five-rep session that used to move the bar.
      ...(Object.keys(ladder.lastReps).length > 0 ? { meLastRepsByPattern: ladder.lastReps } : {}),
    });

    /**
     * ⛔⛔ THE LAST TEST DAY, AS A DATE — the cut the restatement uses inside the test week.
     *
     * ⛔ WHY A DATE AND NOT A WEEK (Michael, 2026-08-27: *"its a dumb rule should just fill
     * everything after test"*). The old cut was `max(TEST_WEEK_INDEX, currentWeek)` under the
     * comment *"history and the live week stand"* — and the test sits INSIDE the live week, so
     * protecting the live week protected exactly the sessions the test had just enabled. He tested
     * Monday and Tuesday and Thursday still read "No weight is prescribed".
     *
     * ⚠️ TAKEN FROM THE COMPOSED WEEK'S OWN `test_week` TAG, not from a weekday named here — the
     * frame's rotation decides which days the tests land on, and a second answer to that question is
     * how the two drift.
     */
    const testCutoff = testDayCutoff(composed, plannedRows ?? [], TEST_WEEK_INDEX);

    const restated = restateFromTest({
      composed,
      planned: plannedRows ?? [],
      /**
       * ⛔ AFTER THE TEST, MINUS ANYTHING ALREADY DONE. The week index is the TEST week now rather
       * than the live one; `testDayCutoff` carries the day-level half, and `restateFromTest` skips
       * any session already completed or skipped in any week. History still stands — per session,
       * which is what it always meant.
       */
      afterWeek: TEST_WEEK_INDEX,
      testDayCutoff: testCutoff,
    });

    if (!willWrite) {
      return json({
        success: true, applied: false, current_week: currentWeek,
        working_numbers: workingNamed, missing: reading.missing,
        changes: restated.changes, unmatched: restated.unmatched,
        // ⛔ WHAT THE HEAVY SETS HAVE EARNED, AND OFF WHAT. A surface offering the athlete this diff
        // has to be able to say why a second set appeared, or it is a number they never agreed to.
        me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
        // ⛔ WHAT THE BAR HAS EARNED AND OFF WHAT — the same rule the set ladder ships under. A
        // surface offering the athlete this diff has to be able to say why a weight moved early.
        me_bar: { by_pattern: ladder.bar, state: ladder.barState, last_reps: ladder.lastReps },
      });
    }

    // ⚠️ ROW BY ROW, so a failure part-way leaves the rest of the block intact rather than
    // half-rewritten under a transaction we do not have.
    let written = 0;
    for (const u of restated.rows) {
      const { error } = await supabase
        .from('planned_workouts')
        .update({ strength_exercises: u.strength_exercises })
        .eq('id', u.id)
        .eq('user_id', userId);
      if (!error) written += 1;
    }

    // ⛔ THE WORKING NUMBERS ARE STORED UNDER THE BLOCK'S OWN KEY, never `config.training_max`
    // (pivot §3). That key is the previous program's 85%-of-a-true-1RM with three live readers, and a number
    // written there would be spent as if it were that other quantity.
    const { error: cfgErr } = await supabase
      .from('plans')
      .update({
        config: {
          ...config,
          standing_plan: {
            ...sp,
            working_numbers: reading.working,
            test_read: true,
            // ⛔ WHAT THE PATTERNS HAVE EARNED, STORED BESIDE THE NUMBERS (A2). The next restate reads
            // it back for provenance; the composition itself is re-derived from history every time,
            // so a stale value can never prescribe anything.
            me_sets_by_pattern: Object.keys(ladder.sets).length > 0 ? ladder.sets : null,
            // ⛔ AND WHAT THE BAR EARNED, ON THE SAME TERMS: provenance only. The composition
            // re-derives it from logged history on every restate, so a stale value here can never
            // prescribe a weight.
            me_bar_offsets_by_pattern: Object.keys(ladder.bar).length > 0 ? ladder.bar : null,
            /**
             * ⛔ THE FIVE WEEKLY NUMBERS, REFRESHED OFF THE WEEKS THIS RESTATE JUST COMPOSED.
             *
             * ⚠️ THE BARBELL COUNT IS WHY. A restate rewrites the remaining weeks with the ME sets
             * the athlete has EARNED, so week 6's work-set count is not the one the block was built
             * with — and the card prints that count beside a calendar that already carries the
             * extra set. The endurance minutes do not move here (the sessions are not recomposed
             * onto the calendar), and they are re-read anyway rather than merged, so one week is
             * never half-old.
             *
             * ⚠️ `composed`, NOT `probe` — the probe is deliberately composed at the block's
             * AUTHORED set counts to find the ME rows, so its ledger would report the numbers the
             * restate is replacing. See the two-compositions comment above.
             */
            week_ledgers: weekLedgersFor(composed),
            /**
             * ⛔⛔ WHAT EVERY HEAVY SESSION OF THIS BLOCK WAS — the walk `earnedMeSets` already made,
             * stored instead of thrown away.
             *
             * ⛔ IT COMPUTES NOTHING NEW. `meSessionOutcome` has run on this exact path since the ME
             * ladder shipped; the write branch kept only the set counts it implied and dropped the
             * per-session outcomes, so the one reading in the app that knows whether a heavy session
             * was finished reached the database and stopped. This is the same starvation as
             * `enduranceLedger`, one function along.
             *
             * ⚠️ THE OUTCOMES ARE THE LADDER'S OWN AND THEIR THRESHOLDS ARE NOT DISPLAY CONCERNS.
             * `clean` is every set within one rep of the band top (`ME_CLEAN_REPS_WITHIN_TOP`),
             * which is what earns the next set; a surface maps outcome to word at its own edge and
             * must never move the threshold to suit a label.
             *
             * ⚠️ HISTORY, NOT A VERDICT. Ordered as trained, one entry per matched session, so a
             * reader takes the most recent and can also show the walk. Empty on a fresh block — no
             * heavy session has been logged yet, which is a card with no word rather than a bad one.
             */
            me_history: ladder.history,
            /**
             * ⛔ WHAT THE ATHLETE GOT AT THE WEIGHT THEY ARE ON, per pattern — `barState.recentReps`
             * lifted out by `earnedMeSets`, not a second reading of the log.
             * ⚠️ EMPTY AFTER A JUMP AND THAT IS CORRECT: there is no last time at the NEW weight, and
             * saying nothing beats repeating a number earned on a lighter bar.
             */
            me_last_reps: Object.keys(ladder.lastReps).length > 0 ? ladder.lastReps : null,
            /**
             * ⛔ THE WEIGHT THOSE REPS WERE PERFORMED AT, per pattern — `barState.atWeight`.
             *
             * ⚠️ IT IS STORED BESIDE `me_last_reps` BECAUSE THE TWO ARE ONE READING. `me_last_reps`
             * is `barState.recentReps` lifted out of this same state, and both belong to `atWeight`
             * — that is the field's own comment. A surface that took the weight from anywhere else
             * would print "140 lb · last time 4 reps" where the 4 was earned at 135: one sentence,
             * two facts, and no way for a reader to tell.
             * ⚠️ NULL BEFORE THE FIRST HEAVY SESSION OF A BLOCK, like the history. A card with no
             * weight and no word does not render at all (ruled 2026-08-28) — no placeholder.
             */
            me_at_weight: (() => {
              const out: Record<string, number> = {};
              for (const [pattern, st] of Object.entries(ladder.barState ?? {})) {
                const w = Number((st as { atWeight?: number | null } | undefined)?.atWeight);
                if (Number.isFinite(w) && w > 0) out[pattern] = w;
              }
              return Object.keys(out).length > 0 ? out : null;
            })(),
          },
        },
      })
      .eq('id', plan.id)
      .eq('user_id', userId);
    // ⚠️ LOUD BUT NOT FATAL — the calendar is already correct. What is lost is the block's record of
    // where its numbers came from, and saying so beats failing the whole call.
    if (cfgErr) console.warn(`[standing-restate] working numbers not stored: ${cfgErr.message}`);

    // ⛔ THE LOGGER READS `computed`, NOT `strength_exercises` (Q-285, 2026-08-24). `computed.steps`
    // is materialize-plan's expansion of `strength_exercises`, written once at build time — so a
    // restate that rewrites the rows without refreshing it leaves every prefill surface (the
    // logger's Pick planned, get-week's `planned.steps`) showing the weights the block was BUILT
    // with, which for a Standing Plan is no weight at all. The athlete saw the sheet announce the
    // numbers and then opened week 2 to a blank box.
    //
    // ⛔ MATERIALIZE OWNS `computed`, SO IT IS RE-ASKED RATHER THAN RE-IMPLEMENTED HERE — the same
    // idiom adapt-plan uses after a strength relayout. Its numeric pass-through keeps the restated
    // weight verbatim (`isPreResolvedNumeric` → `resolved_from: 'pre_resolved'`), and it does not
    // write `strength_exercises` back, so this cannot drag the rows it is refreshing from.
    // ⚠️ LOUD BUT NOT FATAL: get-week re-materializes a MISSING computed on its own, but a STALE one
    // is never re-checked — which is exactly why this call cannot be skipped silently.
    let computedRefreshed = false;
    if (written > 0) {
      try {
        const { error: matErr } = await supabase.functions.invoke('materialize-plan', {
          body: { training_plan_id: plan.id },
        });
        computedRefreshed = !matErr;
        if (matErr) console.warn(`[standing-restate] computed refresh failed: ${matErr.message}`);
      } catch (e) {
        console.warn(`[standing-restate] computed refresh failed: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    console.log(
      `[standing-restate] plan=${plan.id} week=${currentWeek} lifts=${found.join(',')} `
      + `rows=${written}/${restated.rows.length} changes=${restated.changes.length} `
      + `unmatched=${restated.unmatched.length} `
      + `me_sets=${JSON.stringify(ladder.sets)} me_bar=${JSON.stringify(ladder.bar)} `
      + `me_unread=${ladder.unread}`,
    );

    return json({
      success: true, applied: true, rows_written: written,
      current_week: currentWeek,
      working_numbers: workingNamed, missing: reading.missing,
      changes: restated.changes, unmatched: restated.unmatched,
      me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
      me_bar: { by_pattern: ladder.bar, state: ladder.barState, last_reps: ladder.lastReps },
      config_written: !cfgErr,
      computed_refreshed: computedRefreshed,
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return json({ success: false, reason: status === 401 ? 'unauthorized' : 'error', details: (e as Error)?.message ?? String(e) }, status);
  }
});
