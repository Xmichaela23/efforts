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

    const weekById = new Map<string, number>();
    for (const r of plannedRows ?? []) {
      if (r?.id && typeof r.week_number === 'number') weekById.set(String(r.id), r.week_number);
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
      week_number: weekById.get(String(w?.planned_id)) ?? null,
      strength_exercises: w?.strength_exercises ?? null,
    }));

    const reading = readTestWeek(joined, sp.test_lift_names);
    const found = Object.keys(reading.working);
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
    const composed = composeBlock({
      frame: sp.frame,
      weeks,
      taperWeeks: [],
      competitionLifts: sp.competition_lifts ?? {},
      workingNumbers: reading.working,
      seed1RMs: sp.seed_one_rep_maxes ?? {},
      equipment: Array.isArray(config?.athlete_equipment) ? config.athlete_equipment : null,
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
      // ⚠️ A SKIPPED BLOCK HAS NO TEST WEEK AND MUST NOT GROW ONE ON A RESTATE. It also has nothing
      // to restate — `readTestWeek` finds no week-one test sets and this function abstains above —
      // but carrying the flag keeps the re-composition identical to the block that was built.
      skipTestWeek: sp.test_skipped === true,
      roundTo: 5,
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
        working_numbers: reading.working, missing: reading.missing,
        changes: restated.changes, unmatched: restated.unmatched,
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
          standing_plan: { ...sp, working_numbers: reading.working, test_read: true },
        },
      })
      .eq('id', plan.id)
      .eq('user_id', userId);
    // ⚠️ LOUD BUT NOT FATAL — the calendar is already correct. What is lost is the block's record of
    // where its numbers came from, and saying so beats failing the whole call.
    if (cfgErr) console.warn(`[standing-restate] working numbers not stored: ${cfgErr.message}`);

    console.log(
      `[standing-restate] plan=${plan.id} week=${currentWeek} lifts=${found.join(',')} `
      + `rows=${written}/${restated.rows.length} changes=${restated.changes.length} `
      + `unmatched=${restated.unmatched.length}`,
    );

    return json({
      success: true, applied: true, rows_written: written,
      current_week: currentWeek,
      working_numbers: reading.working, missing: reading.missing,
      changes: restated.changes, unmatched: restated.unmatched,
      config_written: !cfgErr,
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return json({ success: false, reason: status === 401 ? 'unauthorized' : 'error', details: (e as Error)?.message ?? String(e) }, status);
  }
});
