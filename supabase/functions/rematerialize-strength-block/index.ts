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
  deloadSingleSets,
  setsForWeek,
  tmTestSets,
  warmupSetsForWeek,
  weightForSet,
  workingNumberForCycles,
  barFloorForWorkingNumber,
  WEEKS_PER_CYCLE,
  type CycleKind,
  type WorkingNumberVerdict,
} from '../shared/strength-system/loading/wendler-531.ts';
import {
  // ⛔ ONE COPY OF THE STORED-SHAPE READER (2026-08-15). It lived here and `create-goal` did not have
  // it, so the two disagreed about where a block's cycles are; both read this now.
  cyclesFromStoredPhases,
  groupSessionsByCycle,
  verdictsForBlock,
} from '../shared/strength-system/loading/cycle-verdicts.ts';
// ⛔ SLICE b — the calibration record. This module decides no loading; it records what moved and is
// the ONLY thing that can make an undo stick. Read its header before touching the undo path.
import {
  type LiftCalibrationInput,
  type StrengthCalibrationEvent,
  calibrationEventsFor,
  suppressUndone,
  undoLatestCalibration,
} from '../shared/strength-system/loading/calibration.ts';
import { resolvePlanWeekIndex } from '../_shared/plan-week.ts';

/**
 * ⛔ ONE CLOCK, AND IT IS NOT IN THE PURE MODULES. `calibration.ts` takes an ISO string rather than
 * reading a clock, so it stays replayable in fixtures; this is where the real time enters.
 */
const nowIso = () => new Date().toISOString();

/** The four main lifts, by the key their working number is stored under and the name they carry. */
const LIFTS = [
  { ref: 'squat', name: 'Back Squat', lower: true },
  { ref: 'deadlift', name: 'Deadlift', lower: true },
  { ref: 'bench', name: 'Bench Press', lower: false },
  { ref: 'overheadPress', name: 'Overhead Press', lower: false },
] as const;

/**
 * ⛔ WHAT SHAPE IS THIS WEEK, ACCORDING TO WHAT THE BUILDER STORED. Added 2026-08-15 (§1c).
 *
 * The block now contains weeks that belong to no cycle — the 7th-week deload and the TM-test weeks —
 * and each has its own set list. This reads them off `config.phase_structure` for the same reason
 * `cyclesFromStoredPhases` does: re-deriving the shape now could produce a different layout than the
 * one on the athlete's calendar, and the rewrite would then be against a block that does not exist.
 *
 * ⛔ **A BLOCK BUILT BEFORE THIS CHANGE IS LEFT ALONE ON ITS LIGHT WEEKS** (`legacy_deload`). Those
 * blocks carry a 40/50/60% deload welded to the end of each four-week cycle. Rewriting one as a
 * Forever 7th week (70/80/90/100%) would silently switch protocol mid-block on weeks the athlete has
 * already seen the shape of. The cycle weeks still get their new working numbers; the old deload
 * keeps its prescription, which is the smallest-consequence week in the block. Detected by the
 * absence of any `TM Test` phase entry — a new block always has at least the closing one.
 */
function weekShapeFromStored(config: any, week: number):
  { kind: 'cycle' | 'tm_test' | 'deload_single' | 'legacy_deload'; cycleIndex: number } | null {
  const phases = config?.phase_structure?.phases;
  if (!Array.isArray(phases)) return null;
  const sorted = [...phases]
    .filter((p: any) => Number.isFinite(Number(p?.start_week)))
    .map((p: any) => ({ name: String(p?.name ?? '').trim().toLowerCase(), start: Number(p.start_week) }))
    .sort((a, b) => a.start - b.start);
  const isForeverShape = sorted.some((p) => p.name === 'tm test' || p.name === 'tm_test');

  let cycleIndex = 0;
  let matched: { name: string; start: number } | null = null;
  for (const p of sorted) {
    if (p.start > week) break;
    if (p.name === 'leader' || p.name === 'anchor') cycleIndex += 1;
    matched = p;
  }
  if (!matched) return null;
  if (matched.name === 'leader' || matched.name === 'anchor') {
    return { kind: 'cycle', cycleIndex: Math.max(1, cycleIndex) };
  }
  // ⚠️ The opening test week runs on cycle 1's number — it validates what the leaders are about to
  // use (Forever p.21). `Math.max(1, …)` is what makes that true when no cycle has started yet.
  if (matched.name === 'tm test' || matched.name === 'tm_test') {
    return { kind: 'tm_test', cycleIndex: Math.max(1, cycleIndex) };
  }
  if (matched.name === 'deload' || matched.name === 'recovery') {
    return { kind: isForeverShape ? 'deload_single' : 'legacy_deload', cycleIndex: Math.max(1, cycleIndex) };
  }
  return null;
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
    // ⛔ SLICE b — THE UNDO. `undo_lift` is a `training_max` key ('squat', 'overheadPress', …). It
    // marks that lift's most recent un-undone calibration event as undone and then re-applies, which
    // now suppresses the step. ⚠️ IT IS A WRITE, so it implies `apply` — an undo that only computed a
    // diff would leave the athlete's tap doing nothing.
    const undoLift = typeof p?.undo_lift === 'string' ? String(p.undo_lift) : null;
    const willWrite = apply || !!undoLift;

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
    const cycles = cyclesFromStoredPhases(config, weeks);
    // ⛔ THE STORED WORKING NUMBERS, never recomputed from `performance_numbers`. The composer's own
    // note: recomputing would let the write-back drag them and the controlled progression would be gone.
    const baseWn = (config?.training_max ?? {}) as Record<string, number>;
    // ⛔ THE CALIBRATION LOG — D-421's surviving wire, repopulated by slice b off the reset/bump
    // events instead of the retired ceiling pin. It is BOTH the announcement history and the
    // suppression record: an event with `undone_at` set means the athlete declined that step, and it
    // has to keep meaning that on every future recompute (see `suppressUndone`).
    const priorEvents: StrengthCalibrationEvent[] = Array.isArray(config?.strength_calibration)
      ? (config.strength_calibration as StrengthCalibrationEvent[])
      : [];
    // ⚠️ THE UNDO IS RESOLVED BEFORE ANY NUMBER IS COMPUTED, so this run already sees the suppression
    // it just created. Marking it afterwards would write the change and reverse it on the NEXT save.
    const undoResult = undoLift ? undoLatestCalibration(priorEvents, undoLift as never, nowIso()) : null;
    const events: StrengthCalibrationEvent[] = undoResult ? undoResult.events : priorEvents;
    // ⛔ `one_rep_maxes_at_build` IS NO LONGER READ HERE — 2026-08-12, slice a. It existed only to
    // feed the 90%-of-1RM ceiling, which is deleted. It is still WRITTEN at build time and is still
    // the number a calibration offer would replace, so nothing about the stored config changes.

    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const currentWeek = resolvePlanWeekIndex(config, today, weeks) ?? 1;
    // ⛔ THE CYCLE THE ATHLETE IS IN — returned to the client (slice b) so no surface has to re-derive
    // it from the phase structure. A second derivation is how two screens start naming different
    // cycles for the same week. ⚠️ A standalone week (TM test / 7th-week deload) belongs to NO cycle,
    // so this reports the cycle it FOLLOWS, which is the one the lift's number is still running on.
    const currentCycle = (() => {
      const shape = weekShapeFromStored(config, currentWeek);
      if (shape) return shape.cycleIndex;
      const c = cycles.find((x) => currentWeek >= x.startWeek && currentWeek <= x.endWeek);
      return c?.index ?? 1;
    })();

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
      const walked = cycles.map((c) => workingNumberForCycles(base, c.index, lift.lower, verdicts, {
        // ⛔ NO `oneRM` AS OF 2026-08-12 (slice a) — the 90%-of-1RM ceiling is deleted. The brake on
        // this path is the confirmed stall: one missed 95% set HOLDS the weight, a second consecutive
        // one drops it 10% (`STALL_CONFIRM_SESSIONS`, Wendler p31/p33).
        unknownMeans: 'hold',
      }));
      const byCycle = cycles.map((c, i) => ({
        cycle: c.index,
        kind: c.kind,
        // ⛔ SLICE b — THE ATHLETE'S UNDO WINS OVER THE ENGINE'S ARITHMETIC, and this is the one line
        // that makes it stick. The walk is pure, so it reaches the same number on every recompute
        // forever; without this, an undo would be silently reverted by the next save.
        workingNumber: suppressUndone(lift.ref as never, c.index, walked[i].workingNumber, events),
      }));
      // ⚠️ `resetAtCycle` IS SLICE a's OWN OUTPUT and is what tells a `reset` apart from a `bump`. It
      // was exposed for exactly this and consumed by nothing until now.
      const resetAtCycle = walked[walked.length - 1]?.resetAtCycle ?? null;
      perLift[lift.ref] = { name: lift.name, verdicts, byCycle, resetAtCycle };
    }

    // ── THE DIFF, ON WEEKS THAT HAVE NOT STARTED ─────────────────────────────
    const changes: Array<Record<string, unknown>> = [];
    const rowUpdates: Array<{ id: string; strength_exercises: any[] }> = [];
    for (const row of plannedRows ?? []) {
      const wk = Number(row?.week_number);
      if (!Number.isFinite(wk) || wk <= currentWeek) continue;   // history and the live week stand
      // ⛔ THE WEEK'S SHAPE FIRST, THEN ITS CYCLE (2026-08-15, §1c). A standalone week is in no cycle,
      // so the old `cycles.find(...)` returned nothing for it and its rows were silently skipped —
      // which for a TM-test week would leave the block's own gate running on a stale weight.
      const shape = weekShapeFromStored(config, wk);
      if (!shape || shape.kind === 'legacy_deload') continue;    // see `weekShapeFromStored`
      const cyc = cycles.find((c) => c.index === shape.cycleIndex);
      if (!cyc) continue;
      const weekInCycle = shape.kind === 'cycle' ? wk - cyc.startWeek + 1 : 0;
      if (shape.kind === 'cycle' && !(weekInCycle >= 1 && weekInCycle <= WEEKS_PER_CYCLE)) continue;
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
        // the first progression would silently undo it. ⚠️ A STANDALONE WEEK GETS NO RAMP: its own
        // sets open at 70% and climb, which is the same reason the old deload carve-out existed.
        const isStandalone = shape.kind !== 'cycle';
        const spec = shape.kind === 'tm_test'
          ? tmTestSets()
          : shape.kind === 'deload_single'
            ? deloadSingleSets()
            : [...warmupSetsForWeek(weekInCycle), ...setsForWeek(cyc.kind, weekInCycle)];
        const oldPlan = Array.isArray(ex?.set_plan) ? ex.set_plan : [];
        const newPlan = spec.map((s) => {
          const raw = weightForSet(wn, s.pct);
          const isDeload = isStandalone;
          return {
            // Warm-ups floor at the empty bar — same rule as the composer (mainLiftRow). And AS OF
            // 2026-08-13 so do the work sets of a light week, also mirroring the composer: a
            // standalone week has no ramp in front, so a light working number authors sub-bar sets
            // (Michael's OHP: 30×5 on a 45 lb bar).
            // ⚠️ This is the composer's rule DUPLICATED — keep the two in step.
            // Per-lift floor, same rule as the composer: 45 when the lift's normal weeks clear
            // the bar naturally, 35 for a lighter lift (its women's-bar sets are flagged at build).
            weight: (s.warmup || isDeload) ? Math.max(barFloorForWorkingNumber(wn), raw) : raw,
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
          week: wk, cycle: cyc.index, lift: lift.name, ref: lift.ref,
          from_top_set: topOld, to_top_set: topNew,
          date: String(row?.date ?? '').slice(0, 10),
        });
        return { ...ex, set_plan: newPlan, weight: topNew };
      });
      if (touched) rowUpdates.push({ id: String(row.id), strength_exercises: next });
    }

    // ── THE CALIBRATION EVENTS THIS RECOMPUTE PRODUCES ───────────────────────
    //
    // ⛔ DERIVED FROM THE ROW DIFF, NOT FROM THE VERDICTS. A verdict fires every cycle — `advance` is
    // the default (p30) — so announcing one per verdict would make the notice furniture. What is
    // worth telling the athlete is that the weights AHEAD OF THEM are not the weights they saw
    // yesterday, which is exactly what `changes` already measures.
    const changedCyclesByRef = new Map<string, Set<number>>();
    for (const c of changes) {
      const ref = String((c as any).ref ?? '');
      if (!ref) continue;
      if (!changedCyclesByRef.has(ref)) changedCyclesByRef.set(ref, new Set());
      changedCyclesByRef.get(ref)!.add(Number((c as any).cycle));
    }
    const calibrationInputs: LiftCalibrationInput[] = LIFTS
      .filter((l) => perLift[l.ref])
      .map((l) => ({
        ref: l.ref as never,
        name: l.name,
        byCycle: perLift[l.ref].byCycle,
        resetAtCycle: perLift[l.ref].resetAtCycle ?? null,
        changedCycles: [...(changedCyclesByRef.get(l.ref) ?? [])],
      }));
    const newEvents = calibrationEventsFor(calibrationInputs, cycles.length, nowIso());

    if (!willWrite) {
      // ⚠️ A DRY RUN STILL REPORTS THE EVENTS IT WOULD RECORD, so a caller can decide whether the
      // change is worth announcing before it commits to writing anything.
      return json({
        success: true, applied: false, current_week: currentWeek, current_cycle: currentCycle,
        per_lift: perLift, changes, events: newEvents, calibration: events,
      });
    }

    // ⚠️ THE WRITE. Row by row, so a failure part-way leaves the rest of the block intact rather than
    // half-rewritten under a single failed transaction we do not have.
    let written = 0;
    for (const u of rowUpdates) {
      const { error } = await supabase
        .from('planned_workouts')
        .update({ strength_exercises: u.strength_exercises })
        .eq('id', u.id)
        .eq('user_id', userId);
      if (!error) written += 1;
    }

    // ⛔ THE LOG IS WRITTEN EVEN WHEN NO ROW MOVED, because an UNDO is exactly that case: the
    // suppression already cancelled the step, so there is nothing left to rewrite — and the
    // `undone_at` stamp is the only durable record that the athlete declined it.
    const nextCalibration = [...events, ...newEvents];
    const changedLog = !!undoResult || newEvents.length > 0;
    if (changedLog) {
      const { error: cfgErr } = await supabase
        .from('plans')
        .update({ config: { ...config, strength_calibration: nextCalibration } })
        .eq('id', plan.id)
        .eq('user_id', userId);
      // ⚠️ A FAILED LOG WRITE IS LOUD BUT NOT FATAL — the prescriptions are already correct on the
      // calendar. What is lost is the undo affordance, and saying so beats failing the whole call.
      if (cfgErr) console.warn(`[rematerialize] calibration log not written: ${cfgErr.message}`);
    }

    // ⛔ THE LOGGER READS `computed`, NOT `strength_exercises` (Q-285, 2026-08-24 — found on the
    // Standing Plan, and this path has the identical hole). `computed.steps` is materialize-plan's
    // expansion of `strength_exercises`, written at build time; a cycle verdict or an undo that
    // rewrites the rows without refreshing it leaves every prefill surface (Pick planned, get-week's
    // `planned.steps`) prescribing the weights the block was BUILT with. Materialize owns
    // `computed`, so it is re-asked rather than re-implemented — the adapt-plan relayout idiom. Its
    // numeric pass-through keeps the rewritten weight verbatim and it does not write
    // `strength_exercises` back. ⚠️ Loud but not fatal: get-week only re-materializes a MISSING
    // computed, never a stale one.
    let computedRefreshed = false;
    if (written > 0) {
      try {
        const { error: matErr } = await supabase.functions.invoke('materialize-plan', {
          body: { training_plan_id: plan.id },
        });
        computedRefreshed = !matErr;
        if (matErr) console.warn(`[rematerialize] computed refresh failed: ${matErr.message}`);
      } catch (e) {
        console.warn(`[rematerialize] computed refresh failed: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    console.log(
      `[rematerialize] plan=${plan.id} week=${currentWeek} rows=${written}/${rowUpdates.length} ` +
      `changes=${changes.length} events=${newEvents.length}${undoLift ? ` undo=${undoLift}` : ''}`,
    );
    return json({
      success: true, applied: true, rows_written: written,
      computed_refreshed: computedRefreshed,
      current_week: currentWeek, current_cycle: currentCycle,
      per_lift: perLift, changes,
      events: newEvents,
      calibration: nextCalibration,
      undone: undoResult?.undone ?? null,
    });
  } catch (e: any) {
    return json({ success: false, reason: 'error', details: e?.message ?? String(e) }, 500);
  }
});
