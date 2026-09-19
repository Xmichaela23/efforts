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
// ⚠️ IT ONLY EVER RE-PRICES ROWS NOT COMPLETED OR SKIPPED, DATED TODAY OR LATER (2026-09-18). History is not
// editable.
//
// ⛔ THE RE-PRICE IS THE PLAN REFRESH (2026-09-18). An accepted number no longer runs its own loop through the
// per-row materializer; it queues the same refresh the server runs when a plan's sessions were written by older
// code (`_shared/plan-refresh.ts` → `rematerialize-standing-block` on the job queue), so the plan is rewritten
// once, not twice. The per-row loop, its 29-call budget and its hand-off to a fresh request are deleted with it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { athleteToday, isRefreshable, queuePlanRefresh } from '../_shared/plan-refresh.ts';
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

const HARD_FAMILIES = new Set(['run_mlss', 'run_near_threshold', 'ride_sweet_spot', 'ride_anaerobic']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const p = await req.json().catch(() => ({}));
    const willWrite = p?.apply === true;
    const decision: 'accept' | 'keep' = p?.decision === 'keep' ? 'keep' : 'accept';
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${key}` } } });
    // ⛔ THE ATHLETE'S DAY, NOT UTC (2026-09-18) — the plan week, whether the checkpoint is due, and the count of
    // sessions a re-price updates, on the same day the refresh uses (`athleteToday`). `as_of` still wins.
    const today = typeof p?.as_of === 'string' ? String(p.as_of).slice(0, 10) : await athleteToday(supabase, userId);

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
    // ⛔ THE RE-PRICE IS A BACKGROUND JOB (2026-09-05, Michael: "let's make it right"), and since 2026-09-18 it is
    // the plan refresh on the job queue (`queuePlanRefresh`). The server records the job on the plan
    // (`config.reprice_job`) and replies at once; the screen polls `reprice_status` for the count.
    if (p?.reprice_status === true) {
      return json({ success: true, job: (config as Record<string, unknown>)?.reprice_job ?? null });
    }
    if (p?.reprice === true) {
      const { data: rows } = await supabase
        .from('planned_workouts')
        .select('id, date, workout_status, completed_workout_id')
        .eq('training_plan_id', plan.id)
        .eq('user_id', userId);
      const pending = (rows ?? []).filter((r: any) => isRefreshable(r, today)).length;
      const q = await queuePlanRefresh(supabase, { userId, planId: String(plan.id), why: 'reprice', rowsPending: pending });
      if (!q.queued && q.reason !== 'already_queued') {
        console.warn(`[reprice] plan=${plan.id} not queued: ${q.reason}`);
        return json({ success: false, reason: 'refresh_not_queued', details: q.reason }, 500);
      }
      return json({ success: true, queued: true, rows_pending: pending });
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
    // ⛔ TODAY ON (2026-09-18) — the rows the refresh re-prices.
    const pending = all.filter((r: any) => isRepriceable(r) && String(r?.date ?? '').slice(0, 10) >= today);
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
      // ⛔ THE PLAN REFRESH, QUEUED (2026-09-18) — the same job as every other re-price. The endurance rows it will
      // re-price are counted as re-priced once it is queued, as the handed-on rows were before.
      const all2 = (rows ?? []) as any[];
      const q = await queuePlanRefresh(supabase, {
        userId, planId: String(plan.id), why: 'reprice',
        rowsPending: all2.filter((r) => isRefreshable(r, today)).length,
      });
      if (q.queued || q.reason === 'already_queued') repriced = pending.length;
      else console.warn(`[checkpoint] plan=${plan.id} refresh not queued: ${q.reason}`);
    }
    const record = {
      week: due.week, answered_at: new Date().toISOString(), decision,
      live, on_plan: onPlan, rows_repriced: repriced,
      ...(ftpAccepted != null ? { ftp_accepted_w: ftpAccepted } : {}),
    };
    // ⚠️ RE-READ FIRST, so the refresh's job record written above survives this write.
    const { data: cfgNow } = await supabase.from('plans').select('config').eq('id', plan.id).eq('user_id', userId).maybeSingle();
    const baseConfig = (cfgNow?.config && typeof cfgNow.config === 'object') ? cfgNow.config : config;
    const { error: cfgErr } = await supabase
      .from('plans')
      .update({ config: { ...baseConfig, standing_plan: { ...sp, endurance_checkpoints: [...(Array.isArray(sp.endurance_checkpoints) ? sp.endurance_checkpoints : []), record] } } })
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
