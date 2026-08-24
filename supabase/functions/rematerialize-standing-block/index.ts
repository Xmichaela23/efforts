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
// one walks a WENDLER TRAINING MAX (85% of a true 1RM) through cycle verdicts. This one reads a
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
  STANDING_PLAN_PROTOCOL_ID,
  TEST_WEEK_INDEX,
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
      .select('id, week_number, date, strength_exercises')
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

    const composed = composeBlock({
      ...composeBase,
      ...(Object.keys(ladder.sets).length > 0 ? { meSetsByPattern: ladder.sets } : {}),
    });

    const restated = restateFromTest({
      composed,
      planned: plannedRows ?? [],
      // ⛔ HISTORY AND THE LIVE WEEK STAND.
      afterWeek: Math.max(TEST_WEEK_INDEX, currentWeek),
    });

    if (!willWrite) {
      return json({
        success: true, applied: false, current_week: currentWeek,
        working_numbers: workingNamed, missing: reading.missing,
        changes: restated.changes, unmatched: restated.unmatched,
        // ⛔ WHAT THE HEAVY SETS HAVE EARNED, AND OFF WHAT. A surface offering the athlete this diff
        // has to be able to say why a second set appeared, or it is a number they never agreed to.
        me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
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
    // (pivot §3). That key is Wendler's 85%-of-a-true-1RM with three live readers, and a number
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
      + `me_sets=${JSON.stringify(ladder.sets)} me_unread=${ladder.unread}`,
    );

    return json({
      success: true, applied: true, rows_written: written,
      current_week: currentWeek,
      working_numbers: workingNamed, missing: reading.missing,
      changes: restated.changes, unmatched: restated.unmatched,
      me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
      config_written: !cfgErr,
      computed_refreshed: computedRefreshed,
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return json({ success: false, reason: status === 401 ? 'unauthorized' : 'error', details: (e as Error)?.message ?? String(e) }, status);
  }
});
