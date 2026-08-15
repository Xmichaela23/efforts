// @ts-nocheck
// Function: rematerialize-strength-block
//
// ⛔ THE ALL-OUT REPS MOVE THE WEIGHT (Q-226, 2026-07-30).
//
// Until now a Strength Focus block advanced on the CALENDAR. `workingNumberForCycle` steps +5 upper /
// +10 lower every four weeks and nothing can stop it — miss the reps and the bar climbs anyway, then
// the next all-out set measures that bar and writes it back as the athlete's max. The plan grades its
// own homework (D-326 layer 2 / Q-223).
//
// ⛔ NOTHING HERE IS NEW MATH. Every piece has been built, tested and unreachable:
//   `verdictFrom95Set`        — beat the prescribed reps at 95% and the number goes up; only just
//                               make it and it holds; fall short and it holds too (a free re-try).
//   `groupSessionsByCycle`    — logged sessions → the cycle they belong to.
//   `verdictsForBlock`        — finished cycles read evidence; future cycles stay a forecast.
//   `workingNumberForCycles`  — walks the cycles applying each verdict, and owns the stall count:
//                               a SECOND consecutive miss is what drops the number 10% (p31/p33).
//                               ⚠️ The 90%-of-1RM ceiling this used to enforce was removed 2026-08-12.
//   `setsForWeek` / `weightForSet` — the same functions the composer wrote the block with.
// This function is the wire between them. The reader could never live in the composer: it authors all
// twelve weeks up front, so no verdict CAN exist for weeks that have not happened. Something had to
// come back afterwards, and this is it.
//
// ⛔ IT PROPOSES. IT DOES NOT SILENTLY WRITE. That is the law here, not caution: the auto-progression
// that used to move strength load on every ingest was DELETED because it "raised or dropped prescribed
// weight with no prompt, no consent, and no gate — the athlete opened the logger to a number they
// never agreed to." Default is a dry run returning the diff; `apply: true` is the athlete's tap.
//
// ⚠️ IT ONLY EVER REWRITES WEEKS THAT HAVE NOT STARTED. History is not editable, and a session already
// logged against a prescription keeps the prescription it was judged against.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import {
  cyclesForBlock,
  setsForWeek,
  warmupSetsForWeek,
  weightForSet,
  workingNumberForCycles,
  BAR_LB,
  WEEKS_PER_CYCLE,
  type CycleKind,
  type WorkingNumberVerdict,
} from '../shared/strength-system/loading/wendler-531.ts';
import {
  groupSessionsByCycle,
  verdictsForBlock,
} from '../shared/strength-system/loading/cycle-verdicts.ts';
import { resolvePlanWeekIndex } from '../_shared/plan-week.ts';

/** The four main lifts, by the key their working number is stored under and the name they carry. */
const LIFTS = [
  { ref: 'squat', name: 'Back Squat', lower: true },
  { ref: 'deadlift', name: 'Deadlift', lower: true },
  { ref: 'bench', name: 'Bench Press', lower: false },
  { ref: 'overheadPress', name: 'Overhead Press', lower: false },
] as const;

/**
 * ⛔ THE CYCLES THE BUILDER ACTUALLY WROTE, not a fresh guess at them.
 *
 * `cyclesForBlock(weeks, shape)` needs the shape inputs (continuity, posture, aerobic load) that were
 * true AT BUILD TIME. Re-deriving them now can produce a different leader/anchor split than the block
 * on the athlete's calendar, which would rewrite weights against a structure that does not exist.
 * `config.phase_structure` is what the composer stored; read it. Falls back to the default split only
 * when a plan predates that field.
 */
function cyclesFromStoredPhases(config: any, weeks: number):
  Array<{ index: number; kind: CycleKind; startWeek: number; endWeek: number }> | null {
  const phases = config?.phase_structure?.phases;
  if (!Array.isArray(phases) || phases.length === 0) return null;
  const work = phases
    .filter((p: any) => {
      const n = String(p?.name ?? '').toLowerCase();
      return n === 'leader' || n === 'anchor';
    })
    .map((p: any) => ({
      kind: String(p.name).toLowerCase() as CycleKind,
      startWeek: Number(p.start_week),
    }))
    .filter((p: any) => Number.isFinite(p.startWeek))
    .sort((a: any, b: any) => a.startWeek - b.startWeek);
  if (work.length === 0) return null;
  return work.map((p: any, i: number) => ({
    index: i + 1,
    kind: p.kind,
    startWeek: p.startWeek,
    // A cycle is four weeks: three work weeks and its deload.
    endWeek: Math.min(p.startWeek + WEEKS_PER_CYCLE - 1, weeks),
  }));
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { userId } = await requireUser(req);
    const p = await req.json().catch(() => ({}));
    const apply = p?.apply === true;
    const asOf = String(p?.as_of ?? '').slice(0, 10) || null;

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
    const isStrengthPrimary = String(config?.source ?? '').toLowerCase() === 'strength_primary'
      || String(config?.strength_protocol ?? '') === 'strength_primary';
    if (!isStrengthPrimary) return json({ success: false, reason: 'not_a_strength_block' }, 400);

    const weeks = Number(plan.duration_weeks) || Number(config?.duration_weeks) || 12;
    const cycles = cyclesFromStoredPhases(config, weeks) ?? cyclesForBlock(weeks).map((c) => ({ ...c }));
    // ⛔ THE STORED WORKING NUMBERS, never recomputed from `performance_numbers`. The composer's own
    // note: recomputing would let the write-back drag them and the controlled progression would be gone.
    const baseWn = (config?.training_max ?? {}) as Record<string, number>;
    // ⛔ `one_rep_maxes_at_build` IS NO LONGER READ HERE — 2026-08-12, slice a. It existed only to
    // feed the 90%-of-1RM ceiling, which is deleted. It is still WRITTEN at build time and is still
    // the number a calibration offer would replace, so nothing about the stored config changes.

    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const currentWeek = resolvePlanWeekIndex(config, today, weeks) ?? 1;

    // ── WHAT WAS LOGGED ──────────────────────────────────────────────────────
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
    const joined = (doneRows ?? []).map((w: any) => ({
      week_number: weekById.get(String(w?.planned_id)) ?? null,
      strength_exercises: w?.strength_exercises ?? null,
    }));

    const grouped = groupSessionsByCycle(joined, cycles);

    // ── THE VERDICTS, AND THE NUMBERS THEY EARN ──────────────────────────────
    const perLift: Record<string, any> = {};
    for (const lift of LIFTS) {
      // ⚠️ `unknownMeans: 'hold'` — NOT 'advance'. A missing signal is not evidence of progress
      // (Michael, 2026-07-27). The forecast exception belongs to a fresh block, not to this path:
      // here, an absent verdict on a FINISHED cycle means nothing was logged.
      const verdicts = verdictsForBlock(cycles, grouped, lift.name, currentWeek) as WorkingNumberVerdict[];
      const base = Number(baseWn[lift.ref]) || 0;
      if (!(base > 0)) continue;
      const byCycle = cycles.map((c) => ({
        cycle: c.index,
        kind: c.kind,
        // ⛔ NO `oneRM` AS OF 2026-08-12 (slice a) — the 90%-of-1RM ceiling is deleted. The brake on
        // this path is the confirmed stall: one missed 95% set HOLDS the weight, a second consecutive
        // one drops it 10% (`STALL_CONFIRM_SESSIONS`, Wendler p31/p33).
        workingNumber: workingNumberForCycles(base, c.index, lift.lower, verdicts, {
          unknownMeans: 'hold',
        }).workingNumber,
      }));
      perLift[lift.ref] = { name: lift.name, verdicts, byCycle };
    }

    // ── THE DIFF, ON WEEKS THAT HAVE NOT STARTED ─────────────────────────────
    const changes: Array<Record<string, unknown>> = [];
    const rowUpdates: Array<{ id: string; strength_exercises: any[] }> = [];
    for (const row of plannedRows ?? []) {
      const wk = Number(row?.week_number);
      if (!Number.isFinite(wk) || wk <= currentWeek) continue;   // history and the live week stand
      const cyc = cycles.find((c) => wk >= c.startWeek && wk <= c.endWeek);
      if (!cyc) continue;
      const weekInCycle = wk - cyc.startWeek + 1;
      if (!(weekInCycle >= 1 && weekInCycle <= WEEKS_PER_CYCLE)) continue;
      const exs = Array.isArray(row?.strength_exercises) ? row.strength_exercises : null;
      if (!exs) continue;

      let touched = false;
      const next = exs.map((ex: any) => {
        const lift = LIFTS.find((l) => String(ex?.name ?? '').toLowerCase() === l.name.toLowerCase());
        if (!lift || !perLift[lift.ref]) return ex;
        const wn = perLift[lift.ref].byCycle.find((b: any) => b.cycle === cyc.index)?.workingNumber;
        if (!(Number(wn) > 0)) return ex;
        // ⛔ THE SAME FUNCTIONS THE COMPOSER USED. Percentages come from `setsForWeek`, not from a
        // second table — a rewrite that invented its own ramp would be a different programme.
        // ⛔ SAME SHAPE THE COMPOSER WRITES — warm-up ramp in front, then the work sets. A rewrite
        // that emitted work sets alone would STRIP the ramp the composer authored (Wendler p.31), so
        // the first progression would silently undo it. `warmupSetsForWeek` is empty on a deload.
        const spec = [...warmupSetsForWeek(weekInCycle), ...setsForWeek(cyc.kind, weekInCycle)];
        const oldPlan = Array.isArray(ex?.set_plan) ? ex.set_plan : [];
        const newPlan = spec.map((s) => {
          const raw = weightForSet(wn, s.pct);
          const isDeload = weekInCycle === WEEKS_PER_CYCLE;
          return {
            // Warm-ups floor at the empty bar — same rule as the composer (mainLiftRow). And AS OF
            // 2026-08-13 so do DELOAD work sets, also mirroring the composer: week 4 is 40/50/60%
            // with no ramp, so a light working number authors sub-bar sets (Michael's OHP: 30×5 on
            // a 45 lb bar). ⚠️ This is the composer's rule DUPLICATED — keep the two in step.
            weight: (s.warmup || isDeload) ? Math.max(BAR_LB, raw) : raw,
            reps: s.reps,
            ...(s.amrap ? { amrap: true } : null),
            ...(s.warmup ? { warmup: true } : null),
          };
        });
        // The top set is the last WORK set, not the last row — warm-ups are prepended. Compare on it,
        // so the progression verdict reads the measured set, never a warm-up.
        const workOld = oldPlan.filter((s: any) => !s?.warmup);
        const workNew = newPlan.filter((s: any) => !s.warmup);
        const topOld = Number(workOld[workOld.length - 1]?.weight) || Number(ex?.weight) || 0;
        const topNew = Number(workNew[workNew.length - 1]?.weight) || 0;
        if (topOld === topNew) return ex;
        touched = true;
        changes.push({
          week: wk, cycle: cyc.index, lift: lift.name,
          from_top_set: topOld, to_top_set: topNew,
          date: String(row?.date ?? '').slice(0, 10),
        });
        return { ...ex, set_plan: newPlan, weight: topNew };
      });
      if (touched) rowUpdates.push({ id: String(row.id), strength_exercises: next });
    }

    if (!apply) {
      return json({ success: true, applied: false, current_week: currentWeek, per_lift: perLift, changes });
    }

    // ⚠️ THE ATHLETE TAPPED. Row by row, so a failure part-way leaves the rest of the block intact
    // rather than half-rewritten under a single failed transaction we do not have.
    let written = 0;
    for (const u of rowUpdates) {
      const { error } = await supabase
        .from('planned_workouts')
        .update({ strength_exercises: u.strength_exercises })
        .eq('id', u.id)
        .eq('user_id', userId);
      if (!error) written += 1;
    }
    console.log(`[rematerialize] plan=${plan.id} week=${currentWeek} rows=${written}/${rowUpdates.length} changes=${changes.length}`);
    return json({ success: true, applied: true, rows_written: written, current_week: currentWeek, per_lift: perLift, changes });
  } catch (e: any) {
    return json({ success: false, reason: 'error', details: e?.message ?? String(e) }, 500);
  }
});
