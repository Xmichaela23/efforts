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
// ⛔ IT REWRITES EVERY SESSION NOT DONE, FROM TODAY ON (Michael, 2026-09-18) — the rest of the live week
// included. It used to leave the live week alone ("the live week keeps the prescription it is being judged
// against"), and a rule change then reached nothing until next week while today's session still carried the
// old lines. Completed and skipped sessions, and anything dated before today, stay exactly as they are. Rows
// are updated in place (same row, same id, same links), never deleted and re-created. It keeps the athlete's
// place in the block and the weights from their test week: it is the same block, re-read, not a new plan.
//
// ⛔ AND THE SERVER RUNS IT BY ITSELF (2026-09-18). Every row it writes is stamped with `PLAN_WRITER_VERSION`
// (`_shared/plan-refresh.ts`); get-week queues `{ refresh: true }` on the job queue when a plan has an
// upcoming session stamped older, and the endurance re-price after an accepted number queues the same job.
// `run-jobs` calls it with the service key and the job's `user_id`.
import { daySeqForType } from '../_shared/day-seq.ts';
import { planDateOf } from '../_shared/moved-from.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveUser } from '../_shared/require-user.ts';
import { athleteToday, isRefreshable, isStaleRow, PLAN_WRITER_VERSION, STAMP_SELECT } from '../_shared/plan-refresh.ts';
import { isTestSession } from '../save-baseline-test/pick.ts';
import { resolvePlanWeekIndex } from '../_shared/plan-week.ts';
import { DELOAD_LINE } from '../_shared/standing-plan/setup-copy.ts';
import { TEST_LAST_SET_LINE } from '../_shared/strength/test-session.ts';
import type { FrameId } from '../_shared/standing-plan/frames.ts';
import { storedArrangement } from '../_shared/standing-plan/day-map.ts';
import {
  composeBlock,
  earnedMeSets,
  FRAMES,
  pretestSession,
  readTestWeek,
  restateEndurance,
  restateFromTest,
  TEST_DAY_LIFTS,
  testDayCutoff,
  testWeekLiftNames,
  // ⚠️ ONE ANSWER TO "which weekday is this date" — the same helper the restatement matches rows on.
  STANDING_PLAN_PROTOCOL_ID,
  TEST_WEEK_INDEX,
  weekLedgersFor,
  blockDescriptionFor,
} from '../_shared/standing-plan/index.ts';
import { calculateDurationWorkload, getDefaultIntensityForType, getStepsIntensity } from '../_shared/workload.ts';
// ⛔ THE ATHLETE'S ENDURANCE SWAPS, READ FROM `plan_adjustments` WHEN THE WEEKS ARE COMPOSED (2026-09-19).
import {
  adjustmentsFromSwapTags,
  applyEnduranceAdjustments,
  ENDURANCE_SLOT_PREFIX,
  enduranceSlotName,
  optionsFromSwapTags,
  swapClassOf,
  weekdayOfDate,
  type SwapAdjustment,
} from '../_shared/session-swap/plan-adjustments.ts';
import { originOf, disciplineOf } from '../_shared/session-swap/swap.ts';

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
    // token or the anon key. The service key is the job queue (`run-jobs`, the automatic refresh): it names
    // the athlete in the body, and only server code holds that key.
    const who = await resolveUser(req);
    const p = await req.json().catch(() => ({}));
    const userId = who.isService ? (typeof p?.user_id === 'string' ? p.user_id : null) : who.userId;
    if (!userId) return json({ success: false, reason: 'user_id_required' }, 400);
    // ⛔ THE AUTOMATIC REFRESH (2026-09-18): the same apply, plus the expansion always runs (a number the rows are
    // priced off may have changed with no token moving) and the job record the screens poll is kept.
    const isRefresh = p?.refresh === true;
    /**
     * ⛔ A SWAP TAP (2026-09-19): `swap-session` has written the `plan_adjustments` row and sends
     * `{ swap: { planned_id, slot, cls, from, until } }` — the sessions that row reaches (`cls`: the machine or the session). The same rewrite runs and writes
     * only those, the tapped one expanded first. Nothing else in the block is touched.
     */
    const swapTap = p?.swap && typeof p.swap === 'object' && typeof p.swap.planned_id === 'string' ? p.swap : null;
    /**
     * ⛔ THE ATHLETE'S REBUILD TAKES THEIR CURRENT EQUIPMENT (2026-09-20, Michael: "add a ladder and they appear? are we
     * smart to integrate new equipment" — it was not: the block re-composes against the kit it was BUILT with, so a
     * chip checked later reached only a new plan). The Adjust tab's "Rebuild upcoming sessions" sends
     * `use_current_equipment: true`; the kit on Baselines then replaces the block's stored one, for this pass and every
     * later one. ⚠️ ONLY THAT TAP. The automatic refresh, a logged test and a locked number keep the stored kit —
     * new equipment can change which movement a session uses, and that never happens without the athlete asking.
     */
    const useCurrentEquipment = p?.use_current_equipment === true && !isRefresh && !swapTap;
    const willWrite = p?.apply === true || isRefresh || !!swapTap;
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
    // ⛔ THE OTHER BLOCK TYPE IS AN ANSWER, NOT A FAILURE (2026-09-16): every caller asks both rematerializers and
    // reads `data.success`; a 400 here printed a failed call in the console on every plan of the other type.
    if (!isStanding) return json({ success: false, reason: 'not_a_standing_plan_block' }, 200);

    const sp = config?.standing_plan ?? null;
    if (!sp?.frame || !sp?.test_lift_names) {
      return json({ success: false, reason: 'block_carries_no_standing_plan_config' }, 400);
    }

    // The kit on Baselines, read the way the builder reads it (`generate-strength-plan`): `equipment.strength`, an
    // array of the chips' own strings. Not an array → null, and the block keeps the kit it has.
    let currentKit: string[] | null = null;
    if (useCurrentEquipment) {
      const { data: ubKit } = await supabase.from('user_baselines').select('equipment').eq('user_id', userId).maybeSingle();
      const eq = (ubKit as { equipment?: { strength?: unknown } } | null)?.equipment?.strength;
      const kit = Array.isArray(eq) ? eq.map((x) => String(x)).filter((x) => x.trim()) : null;
      currentKit = kit && kit.length > 0 ? kit : null;
    }

    const weeks = Number(plan.duration_weeks) || 12;
    // ⛔ THE ATHLETE'S DAY, NOT UTC (2026-09-18): at 6 pm Pacific the evening session is still today's and is
    // rewritten. The same day decides the block week and the retest row's date. `as_of` still wins.
    const today = asOf ?? await athleteToday(supabase, userId);
    const currentWeek = resolvePlanWeekIndex(config, today, weeks) ?? 1;

    /**
     * ⛔ THE MID-BLOCK RETEST IS A CALENDAR ROW (Michael, 2026-09-05: "lift retest = calendar row today, tagged
     * like the week-one test, linked to the plan; the rebuild reads the latest tested session per lift, any
     * week"). Adjust → Strength → Retest asks for `schedule_retest: 'lower' | 'upper'`. The row is composed
     * the way week one's test is (p215's three steps, aimed by the number the block currently prices from),
     * dated today, tagged `standing_plan 1rm_test retest`, linked to this plan. The logger renders it through
     * its standing-plan test arm (the tag), the save links the workout to the row, the restate that every
     * strength save fires reads it (`readTestWeek`, `is_test`), and the unstarted weeks re-price. The same
     * path the week-one test takes, entered from week N.
     */
    const retestGroup = p?.schedule_retest === 'lower' ? 2 : p?.schedule_retest === 'upper' ? 1 : null;
    if (retestGroup != null) {
      // ⛔ ONLY THE LIFTS THE FRAME'S WEEK LOADS (2026-09-13) — `Frame.testedLifts`. No press retest on p278.
      const lifts = (TEST_DAY_LIFTS[retestGroup] ?? []).filter((l) =>
        (FRAMES[sp.frame as keyof typeof FRAMES]?.testedLifts ?? ['bench', 'squat', 'deadlift', 'overheadPress']).includes(l));
      const names = testWeekLiftNames(sp.competition_lifts ?? {});
      const stored = (sp.working_numbers ?? null) as Record<string, Record<string, unknown>> | null;
      const seeds = (sp.seed_one_rep_maxes ?? {}) as Record<string, unknown>;
      const exercises: Record<string, unknown>[] = [];
      for (const lift of lifts) {
        // Aim the ramp by what the block prices from now (the last test's predicted 1RM), else the build seed.
        const predicted = Number(stored?.[lift]?.predicted1RM);
        const seed = Number.isFinite(predicted) && predicted > 0 ? predicted : Number(seeds?.[lift]);
        const steps = Number.isFinite(seed) && seed > 0 ? pretestSession(lift, seed, 5) : null;
        if (!steps) {
          // ⛔ NO "By feel" weight and no words of ours (2026-09-18, round 3). "No max on file to aim the warm-ups — work
          // up until the last set is genuinely hard." was on no page; the row carries p215 step 8, as the composer's
          // test row does (`TEST_LAST_SET_LINE`, one owner).
          exercises.push({ name: names[lift], reps: '6, 5, max', load_prescribed: false, slot_intent: 'ME',
            notes: TEST_LAST_SET_LINE });
          continue;
        }
        exercises.push({
          name: names[lift], sets: steps.length, reps: steps.map((st) => st.reps).join(', '), weight: steps[steps.length - 1].weight,
          load_prescribed: true, slot_intent: 'ME',
          notes: 'Retest — the last set is taken for max clean reps, and it re-prices the rest of the block.',
          set_plan: steps.map((st) => ({ weight: st.weight, reps: st.reps === 'max' ? 1 : st.reps, amrap: st.reps === 'max' })),
        });
      }
      if (exercises.length === 0) return json({ success: false, reason: 'no_lifts_for_retest' }, 400);
      const dow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // Monday=1 … Sunday=7, as activate-plan
      const row = {
        user_id: userId, training_plan_id: plan.id, template_id: String(plan.id),
        week_number: currentWeek, day_number: dow, date: today, type: 'strength',
        name: retestGroup === 2 ? 'Retest: Lower' : 'Retest: Upper',
        description: 'Work up in three steps. The last set is max clean reps and it re-prices the rest of the block.',
        duration: 45, workout_status: 'planned', source: 'training_plan',
        // ⛔ NO `computed` KEY: materialize-plan is its one writer; the column default '{}' reads as not-yet-expanded, same as null (2026-09-16, Stage 7 session 1).
        strength_exercises: exercises,
        units: (config?.units === 'metric' ? 'metric' : 'imperial'),
        tags: ['standing_plan', '1rm_test', 'retest'],
      };
      /**
       * ⛔ A SECOND TAP OPENS THE SAME RETEST (2026-09-20). Retest rows are exempt from the one-strength-row-per-plan-day
       * rule (migration `20260920230000_planned_unique_key_exempts_retest.sql` — the rule blocked a retest on any day
       * that already held a lifting or plyo session, five days in seven on the All Rounder), so nothing else stops a
       * double tap from writing two. Today's unstarted retest of the same half is handed back as it is.
       */
      const { data: already } = await supabase.from('planned_workouts').select('*')
        .eq('user_id', userId).eq('training_plan_id', plan.id).eq('date', today).eq('name', row.name)
        .contains('tags', ['retest']).eq('workout_status', 'planned').limit(1);
      if (Array.isArray(already) && already.length > 0) {
        return json({ success: true, scheduled: true, planned: already[0], current_week: currentWeek, reused: true });
      }
      const { data: inserted, error: insErr } = await supabase.from('planned_workouts').insert(row).select('*').single();
      if (insErr || !inserted) return json({ success: false, reason: 'retest_insert_failed', details: insErr?.message ?? null }, 500);
      console.log(`[standing-restate] retest scheduled plan=${plan.id} week=${currentWeek} row=${inserted.id} lifts=${lifts.join(',')}`);
      return json({ success: true, scheduled: true, planned: inserted, current_week: currentWeek });
    }

    // ── WHAT THE TEST WEEK ACTUALLY RECORDED ─────────────────────────────────
    const { data: plannedRows } = await supabase
      .from('planned_workouts')
      // ⛔ COMPLETION TRAVELS WITH THE ROW NOW — the cut is per session, not per week, so
      // `restateFromTest` has to be able to tell a done session from a future one.
      // ⛔ AND THE ENDURANCE COLUMNS, because the runs and rides are restated too (2026-09-05).
      // ⛔ AND THE WRITER VERSION stamped in each row's `computed` (2026-09-18, `_shared/plan-refresh.ts`).
      .select(`id, training_plan_id, week_number, date, type, day_seq, name, description, duration, steps_preset, strength_exercises, workout_status, completed_workout_id, tags, ${STAMP_SELECT}`)
      .eq('training_plan_id', plan.id)
      .eq('user_id', userId);

    // ⛔ THE PLANNED ROW CARRIES THE WEEK **AND THE DATE**. The date was added 2026-08-24 for the ME
    // ladder: `earnedMeSets` matches on week + WEEKDAY + movement, the same three keys the restater
    // uses, and a logged workout carries neither the plan week nor the plan's weekday of its own.
    // ⛔ `tags` TRAVEL TOO (2026-09-21): a moved session's `moved_from:` note is how the ME ladder finds its plan day.
    const weekById = new Map<string, { week: number; date: string | null; tags: unknown[]; isTest: boolean; isRetest: boolean }>();
    for (const r of plannedRows ?? []) {
      if (r?.id && typeof r.week_number === 'number') {
        const tags = (Array.isArray(r.tags) ? r.tags : []).map((t: unknown) => String(t).toLowerCase());
        // ⛔ THE ONE TEST-SESSION RULE (2026-09-16) — the same function the test save and the result card use.
        weekById.set(String(r.id), { week: r.week_number, date: typeof r.date === 'string' ? r.date : null, tags: Array.isArray(r.tags) ? r.tags : [], isTest: isTestSession({ name: r.name, tags: r.tags }), isRetest: tags.includes('retest') });
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
      tags: weekById.get(String(w?.planned_id))?.tags ?? [],
      // ⛔ A TEST SESSION IS A TEST WHATEVER ITS WEEK (the mid-block retest, 2026-09-05); nothing else is (2026-09-16).
      is_test: weekById.get(String(w?.planned_id))?.isTest === true,
      is_retest: weekById.get(String(w?.planned_id))?.isRetest === true,
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
    // ⛔ ABSTAIN ON THE DRY RUN, LOUDLY. No completed test set means no working number, and the block keeps the
    // "by feel" contract it was written with rather than being prescribed off a guess.
    // ⛔ BUT AN APPLY STILL REWRITES (2026-09-18): the sessions take today's shape with the weights they have — by
    // feel on a lift awaiting its test, the file's number on a lift that has one. The rebuild used to answer
    // "rebuilt" here and write nothing, and the automatic refresh has to reach a block before its test too.
    // The stored working numbers and `test_read` are not written from an empty read (below).
    if (found.length === 0 && !willWrite) {
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

    // ⛔ THE DELOAD WEEK IS A TOOL THE ATHLETE DEPLOYS (2026-09-05, Michael: "build the deload week and put it
    // here"). The book rejects overreach-to-deload (p120) and offers the TAPER/DELOAD column of p274 as something
    // you switch to — a race near, a break needed — not a week the plan schedules. `taper_weeks` in the body sets
    // it (weeks not yet started only); absent, the plan's stored choice stands. Week one (the test week) never.
    const requestedTaper = Array.isArray(p?.taper_weeks) ? (p.taper_weeks as unknown[]).map(Number) : null;
    const storedTaper = Array.isArray(sp.taper_weeks) ? (sp.taper_weeks as unknown[]).map(Number) : [];
    const taperWeeks = (requestedTaper ?? storedTaper)
      .filter((n) => Number.isInteger(n) && n > TEST_WEEK_INDEX && n <= weeks && n >= currentWeek)
      .sort((x, y) => x - y);
    /**
     * ⛔ WHICH WEEK THE DELOAD TOGGLE OFFERS, AND WHETHER IT CAN (2026-09-15, one-truth workorder Stage 4
     * session 1). Adjust worked this out on the phone — `Number(d.weeks) || 12` beside the same `|| 12`
     * here, `currentWeek + 1`, and the `≤ weeks` gate — so the rule for "next week" lived in two places
     * and the fallback literal in two more. The block knows its own next week; the screen prints it.
     */
    const nextWeek = currentWeek + 1;
    const deloadOffer = {
      next_week: nextWeek,
      next_is_deload: taperWeeks.includes(nextWeek),
      can_deload: nextWeek <= weeks,
      // The line under the button: this program's own page, or null (`DELOAD_LINE`, one owner).
      deload_line: DELOAD_LINE[sp.frame as FrameId] ?? null,
    };

    const composeBase = {
      frame: sp.frame,
      weeks,
      taperWeeks,
      // ⛔ Half marathon (2026-09-24): the race the block was built to, read back so race week is rebuilt the same way.
      ...(sp.race && typeof sp.race === 'object' ? { race: sp.race } : {}),
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
      equipment: currentKit ?? (Array.isArray(sp?.athlete_equipment)
        ? sp.athlete_equipment
        : (Array.isArray(config?.athlete_equipment) ? config.athlete_equipment : null)),
      demonstratedWeeklyMiles: sp.demonstrated_weekly_miles ?? null,
      // ⛔ THE RUN DAYS THE BLOCK WAS BUILT WITH (2026-09-22) — they carry the athlete's extra easy runs.
      ...(sp.endurance_days_by_sport && typeof sp.endurance_days_by_sport === 'object'
        ? { enduranceDaysBySport: sp.endurance_days_by_sport }
        : {}),
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
      dayOffset: storedArrangement(sp.day_order, sp.day_offset),
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
      // ⛔ A RETEST IS MEASURED, NOT EARNED (D-469's rule, applied to the mid-block retest): its all-out set
      // re-prices the block through `readTestWeek` and must not also read as a rung on that weekday.
      logged: joined.filter((r) => r.is_retest !== true),
      // ⛔ HISTORY AND THE LIVE WEEK ARE EVIDENCE; THE FUTURE IS NOT. The same boundary the restater
      // draws for writing, drawn here for reading.
      throughWeek: currentWeek,
      // ⛔ A TEST-WEEK BLOCK TRAINED WEEK ONE BY FEEL; the probe re-prices it, the ladder must not read it.
      byFeelWeek: sp.test_skipped === true ? null : TEST_WEEK_INDEX,
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
      // ⛔ TODAY ON (2026-09-18): the rest of the live week too; before today stays as it is.
      fromDate: today,
    });

    /**
     * ⛔ THE RUNS AND RIDES TAKE TODAY'S SHAPE TOO (2026-09-05). Until now only the lift rows were
     * restated; a library correction or a deload column never reached an existing calendar. Same
     * laws: unstarted sessions only, the diff comes back on the dry run, applying is the tap.
     */
    /**
     * ⛔ THE ATHLETE'S ENDURANCE SWAPS ARE PART OF WHAT THE PLAN BUILDS (2026-09-19). Each is a `plan_adjustments` row —
     * the list the logger's lift swap already writes — and `applyEnduranceAdjustments` makes the composed session what
     * the athlete chose, on the dates the row covers. The lift restate above reads `composed` as it always did;
     * materialize-plan applies a lift swap when it expands the row.
     */
    const tapRow = swapTap ? (plannedRows ?? []).find((r: Record<string, unknown>) => String(r.id) === String(swapTap.planned_id)) : null;
    const tapDate = tapRow ? String(tapRow.date ?? '').slice(0, 10) : null;
    // ⚠️ A SWAP ON A SESSION DATED BEFORE TODAY (one the athlete missed) still writes that session.
    const writeFrom = tapDate && tapDate < today ? tapDate : today;
    const loadSwaps = async (): Promise<SwapAdjustment[]> => {
      const { data } = await supabase.from('plan_adjustments')
        .select('id, exercise_name, substitute_exercise_name, applies_from, applies_until, status, created_at')
        .eq('user_id', userId).eq('status', 'active').like('exercise_name', `${ENDURANCE_SLOT_PREFIX}%`)
        .not('substitute_exercise_name', 'is', null);
      return (data ?? []) as SwapAdjustment[];
    };
    let swaps = await loadSwaps();
    /**
     * ⛔ A SWAP MADE BEFORE THIS SHIPPED, READ INTO `plan_adjustments` HERE, ONCE (`adjustmentsFromSwapTags`): a session
     * not done, today on, whose swap tags no active row accounts for. The next rewrite finds the row and reads nothing.
     */
    let migrated = 0;
    if (willWrite) {
      const bySlot = new Map<string, Array<{ date: string; options: string[] }>>();
      for (const r of (plannedRows ?? []) as Record<string, unknown>[]) {
        if (!isRefreshable(r, writeFrom)) continue;
        // ⛔ The plan's date (`_shared/moved-from.ts`): a swap names the plan's slot, so a moved session keeps its slot.
        const date = planDateOf(r);
        const planSport = originOf(r as never) ?? disciplineOf(String(r.type ?? ''));
        const slot = planSport ? enduranceSlotName(date, r as never) : null;
        if (!planSport || !slot) continue;
        // ⚠️ NOT WHAT A TAP IS ABOUT TO REWRITE: the sessions the tapped adjustment reaches, in its class, are the tap's
        // (Back to the plan on a swapped session must not read that session's swap back in).
        const tapReaches = swapTap && date >= String(swapTap.from ?? '') && (!swapTap.until || date <= String(swapTap.until))
          && slot === String(swapTap.slot);
        const options = optionsFromSwapTags(r as never, planSport).filter((o) => !(tapReaches && swapClassOf(o) === swapTap.cls)).filter((o) => !swaps.some((a) =>
          a.exercise_name === slot && swapClassOf(a.substitute_exercise_name) === swapClassOf(o)
          && a.applies_from <= date && (!a.applies_until || a.applies_until >= date)));
        bySlot.set(slot, [...(bySlot.get(slot) ?? []), { date, options }]);
      }
      const inserts = [];
      for (const [slot, list] of bySlot) {
        if (!list.some((x) => x.options.length)) continue;
        list.sort((a, b) => a.date.localeCompare(b.date));
        for (const a of adjustmentsFromSwapTags(slot, list)) {
          inserts.push({ ...a, user_id: userId, plan_id: plan.id, status: 'active', reason: 'endurance swap' });
        }
      }
      if (inserts.length) {
        const { error: migErr } = await supabase.from('plan_adjustments').insert(inserts);
        if (migErr) console.warn(`[standing-restate] swaps not read into plan_adjustments: ${migErr.message}`);
        else { migrated = inserts.length; swaps = await loadSwaps(); }
      }
    }
    // The calendar date of a block week's weekday — the stored rows say it; the block's Monday-anchored weeks otherwise.
    const dateByWeekDay = new Map<string, string>();
    for (const r of (plannedRows ?? []) as Record<string, unknown>[]) {
      // ⛔ The plan's date, not a moved row's (`_shared/moved-from.ts`) — this maps the plan's slots.
      if (typeof r.week_number === 'number' && r.date) dateByWeekDay.set(`${r.week_number}|${weekdayOfDate(planDateOf(r))}`, planDateOf(r));
    }
    const planned = applyEnduranceAdjustments(composed, swaps, (week, day) => dateByWeekDay.get(`${week}|${day}`) ?? null);

    const endurance = restateEndurance({ composed: planned, planned: plannedRows ?? [], afterWeek: TEST_WEEK_INDEX, fromDate: writeFrom });

    /**
     * ⛔ THE ENDURANCE ROWS: tokens, minutes, words, tags and the sport off the composition; `computed` is re-expanded by
     * materialize-plan (it reads each row's own tokens), and the planned load is re-estimated the way activate-plan
     * estimated it at build (D-238: duration x intensity^2). A row whose sport changes loses the old sport's structure,
     * subtitle and expansion with it, as the swap's own patch cleared them.
     */
    const writeEnduranceRow = async (u: typeof endurance.rows[number]) => {
      const intensity = getStepsIntensity(u.steps_preset, u.type) || getDefaultIntensityForType(u.type) || 0.70;
      const load = u.duration > 0 ? Math.round(calculateDurationWorkload(u.duration, intensity)) : 0;
      // ⛔ A ROW CHANGING SPORT KEEPS ITS PLACE ON A FREE KEY (2026-09-20, `_shared/day-seq.ts`). A run becoming a ride
      // on a day that already has a ride would repeat the ride's key, and the write failed.
      const cur = u.type_moved ? (plannedRows ?? []).find((r: Record<string, unknown>) => String(r.id) === u.id) : null;
      const daySeq = cur ? await daySeqForType(supabase, cur, u.type) : null;
      const { error } = await supabase
        .from('planned_workouts')
        .update({
          type: u.type,
          ...(daySeq != null ? { day_seq: daySeq } : {}),
          name: u.name, description: u.description, rendered_description: u.description,
          duration: u.duration, steps_preset: u.steps_preset.length ? u.steps_preset : null, tags: u.tags,
          workload_planned: load > 0 ? load : null,
          ...(u.type_moved ? { computed: null, workout_structure: null, friendly_summary: null, intervals: null } : {}),
        })
        .eq('id', u.id)
        .eq('user_id', userId);
      return !error;
    };

    // ── THE SWAP TAP: the sessions the adjustment reaches, the tapped one first ────────────────────────
    if (swapTap) {
      if (!tapRow) return json({ success: false, reason: 'swap_session_not_in_plan' }, 200);
      const from = String(swapTap.from ?? (tapRow ? planDateOf(tapRow) : tapDate)).slice(0, 10);
      const until = swapTap.until ? String(swapTap.until).slice(0, 10) : null;
      const reached = new Set((plannedRows ?? [])
        .filter((r: Record<string, unknown>) => {
          const d = planDateOf(r);
          if (String(r.id) === String(tapRow.id)) return true;
          return enduranceSlotName(d, r as never) === String(swapTap.slot) && d >= from && (!until || d <= until);
        })
        .map((r: Record<string, unknown>) => String(r.id)));
      const rows = endurance.rows
        .filter((u) => reached.has(u.id) || (migrated > 0 && u.id !== String(tapRow.id)))
        .sort((a, b) => (a.id === String(tapRow.id) ? -1 : b.id === String(tapRow.id) ? 1 : a.id.localeCompare(b.id)));
      const ids: string[] = [];
      for (const u of rows) {
        if (!(await writeEnduranceRow(u))) continue;
        ids.push(u.id);
        try {
          // ⛔ THE TAPPED SESSION FIRST, so the athlete sees it at once; `stamp_writer_version`: this code just wrote it.
          const { error: mErr } = await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: u.id, stamp_writer_version: true } });
          if (mErr) console.warn(`[standing-restate] swap expansion failed ${u.id}: ${mErr.message}`);
        } catch (e) { console.warn(`[standing-restate] swap expansion failed ${u.id}: ${(e as Error)?.message ?? String(e)}`); }
      }
      const matched = ids.includes(String(tapRow.id))
        || !endurance.unmatched.some((x) => `${x.week}|${x.day}` === `${tapRow.week_number}|${weekdayOfDate(planDateOf(tapRow))}`);
      console.log(`[standing-restate] swap plan=${plan.id} row=${tapRow.id} slot=${swapTap.slot} ${from}→${until ?? 'end'} written=${ids.length} migrated=${migrated}`);
      if (!matched) return json({ success: false, reason: 'swap_session_not_matched' }, 200);
      // ⛔ THE SESSIONS THE SWAP REACHES, the tapped one first — rewritten now or already as chosen — which is what the
      // receipt counts ("this and N later").
      const reachedIds = (plannedRows ?? [])
        .filter((r: Record<string, unknown>) => reached.has(String(r.id)) && (String(r.id) === String(tapRow.id) || isRefreshable(r, writeFrom)))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(a.date).localeCompare(String(b.date)))
        .map((r: Record<string, unknown>) => String(r.id));
      const list = [String(tapRow.id), ...reachedIds.filter((id: string) => id !== String(tapRow.id))];
      return json({ success: true, swap: { ids: list, written: ids.length, migrated } });
    }

    if (!willWrite) {
      return json({
        success: true, applied: false, current_week: currentWeek, taper_weeks: taperWeeks, weeks,
        ...deloadOffer,
        working_numbers: workingNamed, missing: reading.missing,
        changes: restated.changes, unmatched: restated.unmatched,
        endurance_changes: endurance.changes, endurance_unmatched: endurance.unmatched,
        // ⛔ WHAT THE HEAVY SETS HAVE EARNED, AND OFF WHAT. A surface offering the athlete this diff
        // has to be able to say why a second set appeared, or it is a number they never agreed to.
        me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
        // ⛔ WHAT THE BAR HAS EARNED AND OFF WHAT — the same rule the set ladder ships under. A
        // surface offering the athlete this diff has to be able to say why a weight moved early.
        me_bar: { by_pattern: ladder.bar, state: ladder.barState, last_reps: ladder.lastReps },
      });
    }

    // ⛔ THE JOB RECORD THE SCREENS POLL (`endurance-checkpoint` `reprice_status`), kept by the refresh only.
    const refreshable = (plannedRows ?? []).filter((r: Record<string, unknown>) => isRefreshable(r, today));
    const writeJob = async (patch: Record<string, unknown>) => {
      if (!isRefresh) return;
      try {
        const { data: cur } = await supabase.from('plans').select('config').eq('id', plan.id).eq('user_id', userId).maybeSingle();
        const cfg = (cur?.config && typeof cur.config === 'object') ? cur.config as Record<string, unknown> : {};
        const prior = (cfg.reprice_job && typeof cfg.reprice_job === 'object') ? cfg.reprice_job as Record<string, unknown> : {};
        await supabase.from('plans').update({ config: { ...cfg, reprice_job: { ...prior, ...patch } } }).eq('id', plan.id).eq('user_id', userId);
      } catch (e) { console.warn('[standing-restate] job record not written:', (e as Error)?.message ?? String(e)); }
    };
    await writeJob({ started_at: new Date().toISOString(), total: refreshable.length, done: 0, finished_at: null });

    // ⚠️ ROW BY ROW, so a failure part-way leaves the rest of the block intact rather than
    // half-rewritten under a transaction we do not have.
    let written = 0;
    for (const u of restated.rows) {
      const { error } = await supabase
        .from('planned_workouts')
        // ⛔ AND THE SESSION'S WORDS when the composer's differ (2026-09-18) — `RestatedRow.name` / `.description`.
        .update({
          strength_exercises: u.strength_exercises,
          ...(u.name != null ? { name: u.name } : {}),
          ...(u.description != null ? { description: u.description, rendered_description: u.description } : {}),
        })
        .eq('id', u.id)
        .eq('user_id', userId);
      if (!error) written += 1;
    }

    // ⛔ THE ENDURANCE ROWS (`writeEnduranceRow` above); `computed` is re-expanded by the whole-plan refresh below.
    let enduranceWritten = 0;
    for (const u of endurance.rows) {
      if (await writeEnduranceRow(u)) enduranceWritten += 1;
    }

    // ⛔ THE WORKING NUMBERS ARE STORED UNDER THE BLOCK'S OWN KEY, never `config.training_max`
    // (pivot §3). That key is the previous program's 85%-of-a-true-1RM with three live readers, and a number
    // written there would be spent as if it were that other quantity.
    // ⚠️ RE-READ FIRST, so the job record written above survives this write.
    const { data: cfgNow } = await supabase.from('plans').select('config').eq('id', plan.id).eq('user_id', userId).maybeSingle();
    const baseConfig = (cfgNow?.config && typeof cfgNow.config === 'object') ? cfgNow.config as Record<string, unknown> : config;
    const { error: cfgErr } = await supabase
      .from('plans')
      .update({
        /**
         * ⛔ THE PLAN'S OWN DESCRIPTION, REWRITTEN IN THE SAME PASS AS ITS SESSIONS (2026-09-19). The build wrote it once
         * (`generate-strength-plan` → `plans.description`) and this write carried only `config`, so a plan built before
         * a wording change kept the old words on the Plan screen and in the download. The same builder function
         * (`blockDescriptionFor`), off `probe` — the block at its authored set counts, as it was built. The version
         * stamp that queues this pass is the only trigger (`isRefresh`); an athlete's apply (a test read, a deload)
         * leaves it alone, so a plan refreshed once is not rewritten until the version moves.
         */
        ...(isRefresh ? { description: blockDescriptionFor(probe, weeks) } : {}),
        config: {
          ...baseConfig,
          standing_plan: {
            ...sp,
            // The kit the athlete rebuilt with becomes the block's own (see `useCurrentEquipment`).
            ...(currentKit ? { athlete_equipment: currentKit } : {}),
            taper_weeks: taperWeeks,
            // ⛔ AN EMPTY READ WRITES NO NUMBERS (2026-09-18): an apply before the test keeps what the block had.
            ...(found.length > 0 ? { working_numbers: reading.working, test_read: true } : {}),
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
            // ⚠️ `planned` — the weeks with the athlete's endurance swaps in them, which is what the calendar carries.
            week_ledgers: weekLedgersFor(planned),
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
    // ⛔ THE EXPANSION ALSO RUNS WHEN A ROW IS STAMPED OLDER, OR ON THE REFRESH (2026-09-18): a row whose tokens did not
    // move may still expand differently under newer code or a newly accepted number, and it is only stamped once
    // it has been expanded here.
    const staleCount = (plannedRows ?? []).filter((r: Record<string, unknown>) => isStaleRow(r, today)).length;
    if (written > 0 || enduranceWritten > 0 || staleCount > 0 || isRefresh) {
      try {
        // ⛔ `skip_done`: a session already done keeps its steps and their ids, byte for byte — a logged run's
        // intervals point at those ids. The rebuild never rewrites a done row's prescription, and now not its
        // expansion either. `from_date` (2026-09-18): nor a session dated before today.
        // ⛔ `stamp_writer_version`: every row it expands was just written by this code — see `_shared/plan-refresh.ts`.
        const { error: matErr } = await supabase.functions.invoke('materialize-plan', {
          body: { training_plan_id: plan.id, skip_done: true, from_date: today, stamp_writer_version: true },
        });
        computedRefreshed = !matErr;
        if (matErr) console.warn(`[standing-restate] computed refresh failed: ${matErr.message}`);
      } catch (e) {
        console.warn(`[standing-restate] computed refresh failed: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    /**
     * ⛔ THE STAMP (2026-09-18) rides the expansion above (`stamp_writer_version`): every session not done, today on,
     * now reads as written by this code, whether or not its words moved. Counted back here for the job record.
     */
    let stamped = 0;
    let staleAfter = 0;
    if (computedRefreshed) {
      try {
        const { data: back } = await supabase.from('planned_workouts')
          .select(`id, date, workout_status, completed_workout_id, ${STAMP_SELECT}`)
          .eq('training_plan_id', plan.id).eq('user_id', userId).gte('date', today);
        const open = (back ?? []).filter((r: Record<string, unknown>) => isRefreshable(r, today));
        stamped = open.filter((r: Record<string, unknown>) => Number(r.writer_version) === PLAN_WRITER_VERSION).length;
        staleAfter = open.filter((r: Record<string, unknown>) => isStaleRow(r, today)).length;
      } catch (e) { console.warn('[standing-restate] stamps not read back:', (e as Error)?.message ?? String(e)); }
    }
    await writeJob({ done: computedRefreshed ? stamped : 0, finished_at: new Date().toISOString(), writer_version: PLAN_WRITER_VERSION });

    /**
     * ⛔ THE LENGTHS REPORTED ARE THE LENGTHS STORED (2026-09-10). A run or ride's minutes are what
     * materialize-plan expands its tokens to, and the refresh above has just done that; the composer's own
     * figure for the same tokens can differ by several minutes. So an applied change reports the minutes the
     * row now carries, read back, never the figure the composer proposed.
     */
    if (computedRefreshed && endurance.changes.length > 0) {
      try {
        const ids = endurance.rows.map((r) => r.id);
        const { data: after } = await supabase.from('planned_workouts').select('id, duration').in('id', ids).eq('user_id', userId);
        const byId = new Map((after ?? []).map((r: { id: string; duration: number | null }) => [String(r.id), Number(r.duration)]));
        for (const c of endurance.changes) {
          const row = endurance.rows.find((r) => r.week === c.week && r.day === c.day && r.type === c.type && r.name === c.name);
          const stored = row ? byId.get(row.id) : undefined;
          if (Number.isFinite(stored) && (stored as number) > 0) c.to_minutes = stored as number;
        }
      } catch (e) {
        console.warn(`[standing-restate] stored lengths not read back: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    console.log(
      `[standing-restate] plan=${plan.id} week=${currentWeek} lifts=${found.join(',')} `
      + `rows=${written}/${restated.rows.length} changes=${restated.changes.length} `
      + `endurance_rows=${enduranceWritten}/${endurance.rows.length} endurance_changes=${endurance.changes.length} `
      + `unmatched=${restated.unmatched.length} `
      + `me_sets=${JSON.stringify(ladder.sets)} me_bar=${JSON.stringify(ladder.bar)} `
      + `me_unread=${ladder.unread} refresh=${isRefresh} stale=${staleCount}→${staleAfter} stamped=${stamped} v=${PLAN_WRITER_VERSION}`,
    );

    return json({ taper_weeks: taperWeeks, weeks,
      ...deloadOffer,
      success: true, applied: true, rows_written: written, endurance_rows_written: enduranceWritten,
      current_week: currentWeek,
      working_numbers: workingNamed, missing: reading.missing,
      changes: restated.changes, unmatched: restated.unmatched,
      endurance_changes: endurance.changes, endurance_unmatched: endurance.unmatched,
      me_sets: { by_pattern: ladder.sets, history: ladder.history, unread: ladder.unread },
      me_bar: { by_pattern: ladder.bar, state: ladder.barState, last_reps: ladder.lastReps },
      config_written: !cfgErr,
      computed_refreshed: computedRefreshed,
      rows_stamped: stamped, rows_stale_after: staleAfter, writer_version: PLAN_WRITER_VERSION,
    // ⚠️ A REFRESH WHOSE EXPANSION FAILED ANSWERS 502, so the job queue tries it again (the rewrite is idempotent).
    }, isRefresh && !computedRefreshed ? 502 : 200);
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return json({ success: false, reason: status === 401 ? 'unauthorized' : 'error', details: (e as Error)?.message ?? String(e) }, status);
  }
});
