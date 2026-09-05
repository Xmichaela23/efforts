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
import { resolveCurrentFtp, pendingFtpProposal, acceptEstimatedFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { pendingRunThresholdProposal, acceptLearnedRunThreshold } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';

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
    if (!isStanding) return json({ success: false, reason: 'not_a_standing_plan_block' }, 400);
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
    if (p?.reprice === true) {
      const { data: rows } = await supabase
        .from('planned_workouts')
        .select('id, week_number, date, type, tags, computed, workout_status, completed_workout_id')
        .eq('training_plan_id', plan.id)
        .eq('user_id', userId)
        .order('date');
      const pending = (rows ?? []).filter((r: any) => isRepriceable(r, today));
      let repriced = 0;
      for (const r of pending) {
        try {
          const { error } = await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: String(r.id) } });
          if (!error) repriced += 1;
        } catch (e) { console.warn(`[reprice] row ${r.id} not re-priced:`, (e as Error)?.message ?? String(e)); }
      }
      console.log(`[reprice] plan=${plan.id} repriced=${repriced}/${pending.length}`);
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
      .select('performance_numbers, learned_fitness, locked_baselines, configured_hr_zones, effort_source_distance, effort_source_time')
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
      const [{ data: ws }, { data: facts }] = await Promise.all([
        supabase.from('workouts').select('id, date, type, avg_heart_rate, avg_pace, avg_power, normalized_power, rpe, workout_metadata').in('id', ids),
        supabase.from('workout_facts').select('workout_id, run_facts').in('workout_id', ids),
      ]);
      const driftById = new Map<string, number | null>();
      for (const f of facts ?? []) driftById.set(String(f.workout_id), Number.isFinite(Number(f?.run_facts?.hr_drift_pct)) ? Number(f.run_facts.hr_drift_pct) : null);
      sessions = (ws ?? []).map((w: any) => {
        const sport: 'run' | 'ride' = String(w.type).toLowerCase() === 'run' ? 'run' : 'ride';
        const rpe = Number(w?.workout_metadata?.session_rpe ?? w?.rpe);
        const work = sport === 'run' ? Number(w.avg_pace) : Number(w.normalized_power ?? w.avg_power);
        return {
          date: String(w.date ?? ''), sport,
          avg_hr: Number.isFinite(Number(w.avg_heart_rate)) && Number(w.avg_heart_rate) > 0 ? Number(w.avg_heart_rate) : null,
          work: Number.isFinite(work) && work > 0 ? work : null,
          rpe: Number.isFinite(rpe) && rpe > 0 ? rpe : null,
          drift_pct: driftById.get(String(w.id)) ?? null,
        };
      });
    }
    const evidence = { run: evidenceFor('run', sessions), ride: evidenceFor('ride', sessions) };

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
      // Accept the FTP first — one write, the same shape the Baselines row writes. Re-read the JSONB
      // so a learner run between the read above and now is not clobbered.
      if (ftpProposal) {
        try {
          const { data: fresh } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', userId).maybeSingle();
          const lf = (fresh?.learned_fitness && typeof fresh.learned_fitness === 'object') ? fresh.learned_fitness as Record<string, unknown> : null;
          const next = acceptEstimatedFtp(lf, 'checkpoint');
          if (next) {
            const { error: accErr } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', userId);
            if (accErr) console.warn(`[checkpoint] FTP not accepted: ${accErr.message}`);
            else ftpAccepted = Number((next.ride_ftp_accepted as { value: number }).value);
          }
        } catch (e) { console.warn('[checkpoint] FTP accept failed:', (e as Error)?.message ?? String(e)); }
      }
      // Run threshold: the same accept, the same door (2026-09-05).
      try {
        const { data: fresh2 } = await supabase.from('user_baselines').select('learned_fitness, performance_numbers').eq('user_id', userId).maybeSingle();
        const lf2 = (fresh2?.learned_fitness && typeof fresh2.learned_fitness === 'object') ? fresh2.learned_fitness as Record<string, unknown> : null;
        const pn2 = (fresh2?.performance_numbers && typeof fresh2.performance_numbers === 'object') ? fresh2.performance_numbers as Record<string, unknown> : null;
        if (pendingRunThresholdProposal({ learned_fitness: lf2, performance_numbers: pn2 } as any)) {
          const nextT = acceptLearnedRunThreshold(lf2, 'checkpoint');
          if (nextT) {
            const { error: tErr } = await supabase.from('user_baselines').update({ learned_fitness: nextT, updated_at: new Date().toISOString() }).eq('user_id', userId);
            if (tErr) console.warn(`[checkpoint] run threshold not accepted: ${tErr.message}`);
          }
        }
      } catch (e) { console.warn('[checkpoint] run threshold accept failed:', (e as Error)?.message ?? String(e)); }
      for (const r of pending) {
        try {
          const { error } = await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: String(r.id) } });
          if (!error) repriced += 1;
        } catch (e) { console.warn(`[checkpoint] row ${r.id} not re-priced:`, (e as Error)?.message ?? String(e)); }
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
