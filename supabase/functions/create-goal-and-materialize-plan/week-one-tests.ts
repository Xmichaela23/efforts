/**
 * THE WEEK-ONE TEST SESSIONS, INSERTED WITH THE PLAN (2026-09-10, audit H-W03).
 *
 * ⛔ THE SERVER CREATES AND DATES THEM. "Know your numbers?" stores the athlete's answer on the goal
 * (`training_prefs.baseline_numbers`, `run` / `ftp` = 'test'). The builder used to insert the test
 * sessions itself after the plan came back, and labelled every one week 1 whatever its date — so a
 * start late in the week put the FTP test in the plan's week two while calling it week one.
 *
 * ⚠️ THE DAY IS UNCHANGED: day 3 and day 5 of the block (`RETEST_OFFSET_DAYS`, OURS,
 * docs/STATE-SOURCES.md), counted from the plan's own first day. With a Monday start that is the
 * Wednesday and Friday of week 1.
 * ⛔ THE WEEK IS THE PLAN'S: the week the date falls in, counted from the Monday `activate-plan` dates
 * week 1 from. Not moved earlier to force it into week 1 — `activate-plan` puts nothing before the
 * start day, and neither does this.
 *
 * ⚠️ THE SAME ROWS THE PHONE WROTE: the `_shared/baseline-test-rows.ts` bodies (the tags are the
 * contract), linked to the plan, `source: 'manual'`, then the planned workload computed.
 * ⚠️ ONLY FOR A SPORT IN THE PLAN — posture present and not 'out', the test the builder uses to show
 * the row at all.
 * ⚠️ A FAILURE HERE DOES NOT UNDO THE PLAN. It is logged; the test can be scheduled from Baselines.
 */
import {
  runThresholdTestRow,
  ftpTestRow,
  RETEST_OFFSET_DAYS,
  addDaysISO,
  type BaselineTestRow,
} from '../_shared/baseline-test-rows.ts';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The Monday of the week holding `iso` — the anchor `activate-plan` dates week 1 from. */
export function mondayOfISO(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** Which test rows the goal asks for: day 3 / day 5 from `blockStart`, labelled with the plan week they fall in. */
export function weekOneTestRows(
  prefs: Record<string, unknown> | null | undefined,
  blockStart: string,
): Array<BaselineTestRow & { week_number: number }> {
  const choice = (prefs?.baseline_numbers ?? {}) as Record<string, unknown>;
  const posture = (prefs?.per_discipline_posture ?? {}) as Record<string, unknown>;
  const inPlan = (sport: string) => posture?.[sport] != null && posture?.[sport] !== 'out';
  const anchor = mondayOfISO(blockStart);
  const weekOf = (date: string) => Math.floor((Date.parse(date) - Date.parse(anchor)) / (7 * 86_400_000)) + 1;
  const rows: Array<BaselineTestRow & { week_number: number }> = [];
  if (inPlan('run') && choice?.run === 'test') {
    const date = addDaysISO(blockStart, RETEST_OFFSET_DAYS.run);
    rows.push({ ...runThresholdTestRow(date), week_number: weekOf(date) });
  }
  if (inPlan('bike') && choice?.ftp === 'test') {
    const date = addDaysISO(blockStart, RETEST_OFFSET_DAYS.ftp);
    rows.push({ ...ftpTestRow(date), week_number: weekOf(date) });
  }
  return rows;
}

/** Insert the goal's week-one tests into a just-built plan. Returns how many rows were inserted. */
export async function scheduleWeekOneTests(opts: {
  supabase: any;
  functionsBaseUrl: string;
  serviceKey: string;
  userId: string;
  goalId: string | null | undefined;
  planId: string | null | undefined;
}): Promise<number> {
  const { supabase, functionsBaseUrl, serviceKey, userId, goalId, planId } = opts;
  try {
    if (!goalId || !planId) return 0;
    const { data: goal } = await supabase
      .from('goals').select('training_prefs').eq('id', goalId).eq('user_id', userId).maybeSingle();
    const prefs = (goal?.training_prefs ?? {}) as Record<string, unknown>;
    if (!prefs.baseline_numbers) return 0;

    const { data: plan } = await supabase
      .from('plans').select('config').eq('id', planId).eq('user_id', userId).maybeSingle();
    // The plan's first day: its stored start, else (no start was picked, so `activate-plan` began on a
    // Monday) the Monday of its first week-1 session.
    let start = String(plan?.config?.user_selected_start_date || plan?.config?.start_date || '').slice(0, 10);
    if (!ISO_DAY.test(start)) {
      const { data: first } = await supabase
        .from('planned_workouts').select('date')
        .eq('training_plan_id', planId).eq('week_number', 1)
        .order('date', { ascending: true }).limit(1);
      const firstDate = String(first?.[0]?.date || '').slice(0, 10);
      start = ISO_DAY.test(firstDate) ? mondayOfISO(firstDate) : '';
    }
    if (!ISO_DAY.test(start)) {
      console.warn('[week-one-tests] the plan has no start date; no test sessions inserted', planId);
      return 0;
    }

    const rows = weekOneTestRows(prefs, start);
    let inserted = 0;
    for (const row of rows) {
      const { data: saved, error } = await supabase
        .from('planned_workouts')
        .insert({
          ...row,
          intervals: [],
          strength_exercises: [],
          mobility_exercises: [],
          source: 'manual',
          training_plan_id: planId,
          user_id: userId,
        })
        .select('id')
        .single();
      if (error || !saved) {
        console.warn('[week-one-tests] insert failed:', row.name, error?.message);
        continue;
      }
      inserted += 1;
      /**
       * ⛔ EXPANDED AT INSERT, LIKE EVERY OTHER ROW OF THE PLAN (2026-09-10). The row body's minutes (45 for the
       * time trial, 60 for the FTP test) are a round figure; the first materialize of the row sets them to
       * what its steps add up to (36 and 55), and that first materialize used to be whichever came first — the
       * calendar's missing-steps pass or a rebuild. The same session read 45 one day and 36 the next. Expanding
       * it here stores the steps' own length from the start, and the planned load below reads that length.
       */
      let minutes = row.duration;
      try {
        await fetch(`${functionsBaseUrl}/materialize-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ planned_workout_id: saved.id }),
        });
        const { data: expanded } = await supabase.from('planned_workouts').select('duration').eq('id', saved.id).maybeSingle();
        if (Number(expanded?.duration) > 0) minutes = Number(expanded.duration);
      } catch (e) {
        console.warn('[week-one-tests] expanding the test session failed:', e);
      }
      try {
        await fetch(`${functionsBaseUrl}/calculate-workload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            workout_id: saved.id,
            workout_data: {
              type: row.type,
              duration: minutes,
              steps_preset: row.steps_preset,
              strength_exercises: [],
              mobility_exercises: [],
              workout_status: 'planned',
            },
          }),
        });
      } catch (e) {
        console.warn('[week-one-tests] workload for the test session failed:', e);
      }
    }
    if (inserted > 0) console.log(`[week-one-tests] ${inserted} test session(s) inserted into plan ${planId}`);
    return inserted;
  } catch (e) {
    console.warn('[week-one-tests] failed (the plan is built):', e);
    return 0;
  }
}
