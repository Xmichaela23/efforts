// @ts-nocheck
// Function: endurance-checkpoint
//
// ⛔ THE SIX-WEEK CHECKPOINT (Michael, 2026-09-02; Viada p123 / p112 / p275). Endurance numbers on a
// Standing Plan block are frozen at activation. Once week 6 is behind the athlete (and again when the
// block ends), this reports what the rows not yet started were priced off versus what the resolvers
// say now, with his three signals as facts over the block's completed hard sessions. The athlete
// accepts or keeps. Accept re-prices the unstarted endurance rows through `materialize-plan`.
//
// ⛔ IT DECIDES NOTHING AND WRITES NOTHING ON A DRY RUN, except that it asks the learner to run first
// so "live" is current — the same learner every ingest milestone already runs. `apply: true` is the
// athlete's tap; `decision: 'keep'` records the answer and moves nothing. Same law as
// `rematerialize-standing-block`: it proposes; it does not silently write.
//
// ⚠️ IT ONLY EVER RE-PRICES ROWS THAT HAVE NOT STARTED. History is not editable.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import { resolvePlanWeekIndex } from '../_shared/plan-week.ts';
import { STANDING_PLAN_PROTOCOL_ID } from '../_shared/standing-plan/index.ts';
import {
  checkpointDue, diffAnchors, evidenceFor, isRepriceable,
  type Anchors, type HardSession, type LiveNumbers,
} from '../_shared/standing-plan/endurance-checkpoint.ts';
import { resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrentFtp, pendingFtpProposal } from '../../../src/lib/resolve-current-ftp.ts';
import { pendingRunThresholdProposal } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { displayFormat, M_PER_MI } from '../_shared/display-format.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * ONE ROW THROUGH THE PER-ROW MATERIALIZER, AND WHY IT FAILED WHEN IT DID (2026-09-16, Stage 7 session 3). Both
 * loops below counted a row only when the call returned no error, and threw the error and the row id away — a
 * re-price finished "30 of 33" with nothing on record about the three. The status, the row, its date and type and
 * the reply are logged now, so the misses can be named.
 */
async function repriceOneRow(supabase: any, r: any, tag: string, misses?: Array<Record<string, unknown>>): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: String(r.id) } });
    if (!error) return true;
    const ctx = (error as { context?: Response }).context;
    let body = '';
    try { body = ctx && typeof ctx.text === 'function' ? (await ctx.text()).slice(0, 300) : ''; } catch { /* no body */ }
    console.warn(`[${tag}] row ${r.id} (${r.date} ${r.type}) not re-priced: status=${ctx?.status ?? 'none'} ${error.name ?? ''} ${error.message ?? ''} body=${body} data=${JSON.stringify(data ?? null).slice(0, 200)}`);
    misses?.push({ id: r.id, date: r.date, type: r.type, status: ctx?.status ?? null, error: `${error.name ?? ''} ${error.message ?? ''}`.trim(), body });
    return false;
  } catch (e) {
    console.warn(`[${tag}] row ${r.id} (${r.date} ${r.type}) not re-priced: threw ${(e as Error)?.message ?? String(e)}`);
    misses?.push({ id: r.id, date: r.date, type: r.type, status: null, error: `threw ${(e as Error)?.message ?? String(e)}` });
    return false;
  }
}

/**
 * ⛔ THIRTY CALLS A REQUEST (2026-09-16, Stage 7 session 3). One request to this function can send about 30 calls to
 * other edge functions; every call after that fails before it leaves ("FunctionsFetchError: Failed to send a request to
 * the Edge Function"). Measured on throwaway blocks of 32 re-priceable rows: rows 1–30 re-priced and rows 31–32 failed
 * — in date order, in reverse order, one at a time or four at a time, and again on a second try inside the same request;
 * each failed row re-priced when sent on its own. That was the "30 of 33". Not on Supabase's published limits page
 * (read 2026-09-16), so the number is what was measured, not a documented one.
 * So a request re-prices at most `budget` rows and hands the rest to a fresh request of this function
 * (`reprice_continue`), which is itself one call. Four rows at a time keeps each request short.
 * OURS — `REPRICE_CALLS_PER_REQUEST` 29 (the measured 30 less the hand-off call) and the batch of 4.
 */
const REPRICE_CALLS_PER_REQUEST = 29;
const REPRICE_BATCH = 4;
async function repriceRows(
  supabase: any, rows: any[], tag: string, misses: Array<Record<string, unknown>>, budget: number,
  onBatch?: (done: number) => Promise<void>,
): Promise<{ repriced: number; rest: any[] }> {
  const now = rows.slice(0, Math.max(0, budget));
  let repriced = 0;
  for (let i = 0; i < now.length; i += REPRICE_BATCH) {
    const oks = await Promise.all(now.slice(i, i + REPRICE_BATCH).map((r) => repriceOneRow(supabase, r, tag, misses)));
    repriced += oks.filter(Boolean).length;
    if (onBatch) await onBatch(repriced);
  }
  return { repriced, rest: rows.slice(now.length) };
}

/** One call: the rows not yet reached go to a fresh request of this function, as the same athlete. */
async function handOffReprice(supabase: any, req: Request, planId: string, rest: any[], job: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('endurance-checkpoint', {
      body: { reprice: true, plan_id: planId, reprice_continue: { ids: rest.map((r) => String(r.id)), job } },
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    });
    if (error) console.warn(`[reprice] hand-off failed: ${error.name ?? ''} ${error.message ?? ''}`);
    return !error;
  } catch (e) { console.warn('[reprice] hand-off threw:', (e as Error)?.message ?? String(e)); return false; }
}

const HARD_FAMILIES = new Set(['run_mlss', 'run_near_threshold', 'ride_sweet_spot', 'ride_anaerobic']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const p = await req.json().catch(() => ({}));
    const willWrite = p?.apply === true;
    const decision: 'accept' | 'keep' = p?.decision === 'keep' ? 'keep' : 'accept';
    const today = typeof p?.as_of === 'string' ? String(p.as_of).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${key}` } } });

    // ── THE BLOCK ──────────────────────────────────────────────────────────
    let planQ = supabase.from('plans').select('id, name, config, duration_weeks, status').eq('user_id', userId);
    planQ = p?.plan_id ? planQ.eq('id', String(p.plan_id)) : planQ.eq('status', 'active');
    const { data: plan } = await planQ.maybeSingle();
    if (!plan) return json({ success: false, reason: 'no_plan' }, 404);
    const config = plan.config ?? {};
    const isStanding = String(config?.strength_protocol ?? '') === STANDING_PLAN_PROTOCOL_ID
      || String(config?.source ?? '').toLowerCase() === STANDING_PLAN_PROTOCOL_ID;
    // ⛔ THE OTHER PLAN TYPE IS AN ANSWER, NOT A FAILURE (2026-09-16) — same as both rematerializers; callers read `data.success`.
    if (!isStanding) return json({ success: false, reason: 'not_a_standing_plan_block' }, 200);
    const sp = config?.standing_plan ?? {};
    const weeks = Number(plan.duration_weeks) || 12;
    const currentWeek = resolvePlanWeekIndex(config, today, weeks);
    const answered: number[] = Array.isArray(sp.endurance_checkpoints)
      ? sp.endurance_checkpoints.map((c: any) => Number(c?.week)).filter((w: number) => Number.isFinite(w))
      : [];
    // ⛔ RE-PRICE ON DEMAND (Michael 2026-09-02: "changing baselines changes the plan now?"). Same loop
    // the checkpoint's accept runs — every unstarted run/ride row through the per-row materializer —
    // with no checkpoint gate and nothing recorded. The Baselines screen calls this after a save that
    // changed a pace, FTP or threshold HR. Strength rows are untouched: a block's weights come from
    // its week-1 test, not from Baselines.
    // ⛔ THE RE-PRICE IS A BACKGROUND JOB (2026-09-05, Michael: "let's make it right"). The rows are re-priced
    // one call each; on a full block that is 30 calls and up to a minute. The client used to hold the request
    // open and tell the athlete to keep the screen open. Now the server records the job on the plan
    // (`config.reprice_job`), replies at once, and keeps working after the reply (EdgeRuntime.waitUntil —
    // the same mechanism strava-webhook uses). The screen polls `reprice_status` for the count. If the
    // runtime has no waitUntil, it falls back to running in the request as before.
    if (p?.reprice_status === true) {
      return json({ success: true, job: (config as Record<string, unknown>)?.reprice_job ?? null });
    }
    if (p?.reprice === true) {
      const { data: rows } = await supabase
        .from('planned_workouts')
        .select('id, week_number, date, type, tags, computed, workout_status, completed_workout_id')
        .eq('training_plan_id', plan.id)
        .eq('user_id', userId)
        .order('date');
      // A continuation carries the rows the previous request did not reach, and the job it belongs to.
      const cont = p?.reprice_continue && Array.isArray(p.reprice_continue.ids) ? p.reprice_continue : null;
      const contIds = cont ? new Set((cont.ids as unknown[]).map(String)) : null;
      const pending = (rows ?? []).filter((r: any) => isRepriceable(r, today) && (!contIds || contIds.has(String(r.id))));
      const job = cont?.job
        ? { started_at: String(cont.job.started_at), total: Number(cont.job.total) || pending.length, done: Number(cont.job.done) || 0, finished_at: null as string | null, misses: Array.isArray(cont.job.misses) ? cont.job.misses : [] }
        : { started_at: new Date().toISOString(), total: pending.length, done: 0, finished_at: null as string | null, misses: [] as Array<Record<string, unknown>> };
      const writeJob = async (j: typeof job) => {
        const { data: cur } = await supabase.from('plans').select('config').eq('id', plan.id).eq('user_id', userId).maybeSingle();
        await supabase.from('plans').update({ config: { ...((cur?.config as Record<string, unknown>) ?? config), reprice_job: j } }).eq('id', plan.id).eq('user_id', userId);
      };
      await writeJob(job);
      const run = async () => {
        const misses: Array<Record<string, unknown>> = [...job.misses];
        const { repriced, rest } = await repriceRows(supabase, pending, 'reprice', misses, REPRICE_CALLS_PER_REQUEST, (done) => writeJob({ ...job, done: job.done + done }));
        const done = job.done + repriced;
        if (rest.length > 0) {
          const next = { ...job, done, misses };
          const handed = await handOffReprice(supabase, req, plan.id, rest, next);
          if (handed) { await writeJob(next); console.log(`[reprice] plan=${plan.id} ${done}/${job.total}, ${rest.length} handed on`); return done; }
          for (const r of rest) misses.push({ id: r.id, date: r.date, type: r.type, status: null, error: 'hand-off failed' });
        }
        // The rows that did not re-price, with the reply, on the job record (nothing else keeps them).
        const { misses: _m, ...base } = job;
        await writeJob({ ...base, done, finished_at: new Date().toISOString(), ...(misses.length ? { misses } : {}) } as typeof job);
        console.log(`[reprice] plan=${plan.id} repriced=${done}/${job.total}`);
        return done;
      };
      const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil as ((p: Promise<unknown>) => void) | undefined;
      if (typeof waitUntil === 'function' && pending.length > 0) {
        waitUntil(run());
        return json({ success: true, queued: true, rows_pending: pending.length });
      }
      const repriced = await run();
      return json({ success: true, repriced: true, rows_repriced: repriced, rows_pending: pending.length });
    }

    const due = checkpointDue(currentWeek, weeks, answered);
    if (!due.due) return json({ success: true, due: false, current_week: currentWeek, reason: due.reason });

    // ── THE LEARNER RUNS FIRST, so "live" is current ───────────────────────
    if (!willWrite) {
      try { await supabase.functions.invoke('learn-fitness-profile', { body: { user_id: userId } }); }
      catch (e) { console.warn('[checkpoint] learner did not run:', (e as Error)?.message ?? String(e)); }
    }

    // ── LIVE NUMBERS — the same resolvers everything else reads ────────────
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('performance_numbers, learned_fitness, locked_baselines, configured_hr_zones, effort_source_distance, effort_source_time, units')
      .eq('user_id', userId)
      .maybeSingle();
    const thr = resolveCurrentRunThresholdPace(ub as any);
    const ftp = resolveCurrentFtp(ub as any);
    const lthr = resolveCurrentLthr(ub as any, { sport: 'run' });
    // ⛔ THE FTP THE CARD SHOWS IS THE PROPOSAL (2026-09-04, docs/SPEC-ftp-accept-2026-09-04.md). The
    // resolver now returns the ACCEPTED number, and the unstarted rows were priced off it — so "what
    // the app measures now" is the live estimate when it differs, else the resolved value. "Use the
    // measured numbers" writes the acceptance below BEFORE re-pricing, so the per-row materializer
    // (which reads the resolver) prices off the number the athlete just said yes to.
    const ftpProposal = pendingFtpProposal(ub as any);
    const live: LiveNumbers = {
      threshold_sec_per_mi: thr.sec_per_mi, threshold_source: thr.source,
      ftp_w: ftpProposal ? ftpProposal.measured : (ftp.source === 'learned' || ftp.source === 'manual' ? ftp.value : null),
      ftp_source: ftpProposal ? 'learned' : ftp.source,
      lthr_bpm: lthr.bpm, lthr_source: lthr.source,
    };

    // ── THE ROWS ───────────────────────────────────────────────────────────
    const { data: rows } = await supabase
      .from('planned_workouts')
      .select('id, week_number, date, type, tags, computed, workout_status, completed_workout_id')
      .eq('training_plan_id', plan.id)
      .eq('user_id', userId)
      .order('date');
    const all = rows ?? [];
    const pending = all.filter((r: any) => isRepriceable(r, today));
    // The stamp every unstarted row carries (identical across a materialization); the newest wins.
    const stamped = pending.map((r: any) => r?.computed?.anchors as Anchors | null).filter(Boolean);
    const onPlan: Anchors | null = stamped.length ? stamped[stamped.length - 1] : null;
    const numbers = diffAnchors(onPlan, live);

    // ── THE EVIDENCE — his three signals over the block's completed hard sessions ──
    const hardRows = all.filter((r: any) => {
      const tags: string[] = Array.isArray(r?.tags) ? r.tags.map((t: unknown) => String(t)) : [];
      const fam = tags.find((t) => t.startsWith('family:'))?.slice(7) ?? '';
      return HARD_FAMILIES.has(fam) && r?.completed_workout_id;
    });
    const ids = hardRows.map((r: any) => String(r.completed_workout_id));
    let sessions: HardSession[] = [];
    if (ids.length > 0) {
      // ⚠️ THE `workout_facts` READ IS GONE WITH THE FIELD — see the note below. Nothing else on this
      // sheet came out of that table, so the query went with it rather than being left fetching a
      // column no line prints.
      const { data: ws } = await supabase
        .from('workouts')
        .select('id, date, type, avg_heart_rate, avg_pace, avg_power, normalized_power, rpe, workout_metadata')
        .in('id', ids);
      /**
       * ⛔ NO DRIFT READ ON THIS SHEET (2026-09-12). This was the app's fifth answer to "what is this
       * session's drift": `run_facts.hr_drift_pct` straight off the facts row — heart rate alone,
       * with no steadiness test and none of the ratio precedence `_shared/session-detail/drift-pct.ts`
       * applies everywhere else — and the sheet printed it as "decoupling". The rows here are the
       * block's HARD families, which is exactly the work p107's rule does not govern. The field is
       * gone rather than wired to the shared rule, which would have blanked it on nearly every row.
       */
      sessions = (ws ?? []).map((w: any) => {
        const sport: 'run' | 'ride' = String(w.type).toLowerCase() === 'run' ? 'run' : 'ride';
        const rpe = Number(w?.workout_metadata?.session_rpe ?? w?.rpe);
        // ⛔ THE SHEET PRINTS "/mi" (2026-09-15, §8.0 #1). `workouts.avg_pace` is the provider's number in
        // seconds per KILOMETRE (`ingest-activity:511` Strava, `:1005` Garmin), and this handed it over as if it
        // were per mile — about 38% too fast on the evidence line. Converted once, here, where every other
        // number on this sheet is already per mile; the sheet formats and decides nothing.
        const work = sport === 'run' ? Number(w.avg_pace) * 1.609344 : Number(w.normalized_power ?? w.avg_power);
        return {
          date: String(w.date ?? ''), sport,
          avg_hr: Number.isFinite(Number(w.avg_heart_rate)) && Number(w.avg_heart_rate) > 0 ? Number(w.avg_heart_rate) : null,
          work: Number.isFinite(work) && work > 0 ? work : null,
          rpe: Number.isFinite(rpe) && rpe > 0 ? rpe : null,
          drift_pct: null,
        };
      });
    }
    const evidenceRaw = { run: evidenceFor('run', sessions), ride: evidenceFor('ride', sessions) };

    /**
     * ⛔ THE SHEET'S WORDS ARE WRITTEN HERE, IN THE ATHLETE'S UNIT (2026-09-16, Stage 7 session 3). The sheet
     * formatted every number itself and printed "/mi" on a metric account ("7:02/mi" beside Adjust's "4:22/km").
     * Paces are per mile on this payload; the whole pace is rounded once (`display-format`).
     */
    const dfmt = displayFormat(String((ub as { units?: unknown } | null)?.units ?? 'imperial') === 'metric');
    const paceFromPerMi = (v: number | null) => (v != null && v > 0 ? dfmt.pacePerUnit(v / (M_PER_MI / 1000)) : null);
    const numberDisplay = (v: number | null, unit: string) =>
      unit === 'sec/mi' ? paceFromPerMi(v) : (v != null && Number.isFinite(v) ? `${Math.round(v)} ${unit}` : null);
    for (const n of numbers as Array<Record<string, any>>) {
      n.on_plan_display = numberDisplay(n.on_plan, n.unit);
      n.live_display = numberDisplay(n.live, n.unit);
    }
    const halfDisplay = (sport: 'run' | 'ride', h: Record<string, any>) => ({
      ...h,
      // A ride's watts print bare: the sheet's line ends "… → 160 W".
      work_display: h.avg_work == null ? null : sport === 'run' ? paceFromPerMi(h.avg_work) : String(Math.round(h.avg_work)),
    });
    const evidence = {
      run: { ...evidenceRaw.run, early: halfDisplay('run', evidenceRaw.run.early), late: halfDisplay('run', evidenceRaw.run.late) },
      ride: { ...evidenceRaw.ride, early: halfDisplay('ride', evidenceRaw.ride.early), late: halfDisplay('ride', evidenceRaw.ride.late) },
    };

    if (!willWrite) {
      return json({
        success: true, due: true, week: due.week, current_week: currentWeek, applied: false,
        numbers, evidence, rows_pending: pending.length, rows_stamped: stamped.length,
      });
    }

    // ── APPLY: re-price the unstarted endurance rows, then record the answer ──
    let repriced = 0;
    let ftpAccepted: number | null = null;
    if (decision === 'accept') {
      /**
       * ⛔ THE ACCEPT GOES THROUGH SAVE-BASELINES (2026-09-16, Stage 7 session 1). This wrote `learned_fitness` and
       * `performance_numbers` itself — the same rules as save-baselines' accept, written twice. It now sends the
       * athlete's own token (the checkpoint already requires the athlete, above) to that accept, which re-reads the
       * row, applies `acceptMeasuredForSave` and writes once. The value sent is the one this request measured; if
       * the learner moved it since, the accept answers `value_changed` and nothing is written.
       * FTP first, then the run threshold, BEFORE re-pricing, so the rows price off the numbers just accepted.
       */
      const acceptVia = async (kind: 'ftp' | 'run_threshold', value: number): Promise<number | null> => {
        try {
          const { data, error } = await supabase.functions.invoke('save-baselines', {
            body: { accept: { kind, value, via: 'checkpoint' } },
            headers: { Authorization: req.headers.get('Authorization') ?? '' },
          });
          if (error || !data?.success) {
            console.warn(`[checkpoint] ${kind} not accepted: ${error?.message ?? data?.error ?? 'refused'}`);
            return null;
          }
          const v = Number(data?.accepted?.value);
          return Number.isFinite(v) && v > 0 ? v : null;
        } catch (e) {
          console.warn(`[checkpoint] ${kind} accept failed:`, (e as Error)?.message ?? String(e));
          return null;
        }
      };
      if (ftpProposal) ftpAccepted = await acceptVia('ftp', ftpProposal.measured);
      // Run threshold: the same accept, the same door (2026-09-05). Re-read so the FTP accept above is seen.
      try {
        const { data: fresh2 } = await supabase.from('user_baselines').select('learned_fitness, performance_numbers').eq('user_id', userId).maybeSingle();
        const lf2 = (fresh2?.learned_fitness && typeof fresh2.learned_fitness === 'object') ? fresh2.learned_fitness as Record<string, unknown> : null;
        const pn2 = (fresh2?.performance_numbers && typeof fresh2.performance_numbers === 'object') ? fresh2.performance_numbers as Record<string, unknown> : null;
        const thrProposal = pendingRunThresholdProposal({ learned_fitness: lf2, performance_numbers: pn2 } as any);
        if (thrProposal) await acceptVia('run_threshold', thrProposal.measuredSecPerKm);
      } catch (e) { console.warn('[checkpoint] run threshold accept failed:', (e as Error)?.message ?? String(e)); }
      // Up to three calls are spent above (the learner on the dry run, two accepts), so fewer rows fit in this request;
      // the rest go to a background re-price job (`reprice_continue`) and are counted as re-priced when handed on.
      const misses: Array<Record<string, unknown>> = [];
      const { repriced: inRequest, rest } = await repriceRows(supabase, pending, 'checkpoint', misses, REPRICE_CALLS_PER_REQUEST - 3);
      repriced = inRequest;
      if (rest.length > 0) {
        const job = { started_at: new Date().toISOString(), total: pending.length, done: inRequest, finished_at: null, misses };
        if (await handOffReprice(supabase, req, plan.id, rest, job)) repriced += rest.length;
      }
    }
    const record = {
      week: due.week, answered_at: new Date().toISOString(), decision,
      live, on_plan: onPlan, rows_repriced: repriced,
      ...(ftpAccepted != null ? { ftp_accepted_w: ftpAccepted } : {}),
    };
    const { error: cfgErr } = await supabase
      .from('plans')
      .update({ config: { ...config, standing_plan: { ...sp, endurance_checkpoints: [...(Array.isArray(sp.endurance_checkpoints) ? sp.endurance_checkpoints : []), record] } } })
      .eq('id', plan.id)
      .eq('user_id', userId);
    if (cfgErr) console.warn(`[checkpoint] answer not recorded: ${cfgErr.message}`);

    console.log(`[checkpoint] plan=${plan.id} week=${due.week} decision=${decision} repriced=${repriced}/${pending.length} ftp_accepted=${ftpAccepted ?? '—'}`);
    return json({ success: true, due: true, week: due.week, current_week: currentWeek, applied: true, decision, rows_repriced: repriced, ftp_accepted_w: ftpAccepted, numbers, evidence });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    const status = (e as any)?.status === 401 || /jwt|auth/i.test(msg) ? 401 : 500;
    return json({ success: false, reason: 'error', details: msg }, status);
  }
});
