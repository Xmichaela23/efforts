// @ts-nocheck
/**
 * swap-session — the Instead sheet's options and the write behind a tap (2026-09-10, audit H-T15).
 *
 * ⛔ THE PHONE RENDERS WHAT THIS SENDS AND POSTS THE TAP. Which swaps a planned session offers (the
 * machine, another sport, the long day, back to the plan, and on a hard session the book's other
 * workouts for it — `_shared/session-swap/workout-choice.ts`), the words on each, and the row or rows a
 * tap writes were all decided on the phone, in `src/lib/session-discipline-swap.ts` and
 * `src/lib/swap-write.ts`, by three screens feeding them their own copies of the week. The same code
 * now lives in `_shared/session-swap/` and runs here, against the stored rows.
 *
 * Three calls, one function:
 *   · { planned_ids: [...] }                                  → { sport_swap: { [id]: boolean } }
 *       Which sessions carry the swap glyph (Today's cards, the calendar chip).
 *   · { planned_id }                                          → { header, rest_of_plan, options }
 *       The sheet: each option's id, kind, label, line, warnings, and whether it is a sport swap.
 *   · { planned_id, option_id, scope: 'today' | 'rest_of_plan' } → { receipt, also_written, rows }
 *       Writes the option (and its later repeats for rest of plan), expands the new sessions through
 *       `materialize-plan`, returns the written rows. On a Standing Plan block the option is a `plan_adjustments` row
 *       and `rematerialize-standing-block` writes the sessions it reaches (2026-09-19).
 *   · { lift: { planned_id, slot, substitute, scope } }          → { success }
 *       The logger's lift swap (2026-09-19, was `persistPlanSwap` on the phone): the same `plan_adjustments` row,
 *       one date for "Just today", open-ended for "Rest of plan"; the slot's own movement is Back to the plan. Then
 *       materialize-plan re-expands the sessions it reaches, which is where a lift swap is applied.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { sanitizePosture } from '../_shared/state-trend/posture.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
/**
 * ⛔ THE THRESHOLD PACE THE SESSION'S OWN STEPS ARE PRICED AT — `materialize-plan`'s §1b-threshold
 * tier, the same resolver it calls (`_resolvedThresholdSecPerMi`). The sheet's workout lines read it
 * so a pace on the sheet is the pace on the row after the tap.
 * ⚠️ A PLAN WITH A SNAPSHOT PIN FREEZES ITS PACES and `materialize-plan` prefers that pin; this reads
 * the live resolver. The two agree unless a pinned plan's athlete has since moved, which is the
 * pre-existing pin behaviour rather than something the sheet introduces.
 */
import { resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
import { applySwap, describeSheet, hasSportSwap } from '../_shared/session-swap/sheet.ts';
import { loadWorkoutMinutes } from '../_shared/session-swap/workout-choice.ts';
// ⛔ A SWAP ON A STANDING PLAN BLOCK IS A `plan_adjustments` ROW AND THE PLAN REWRITES ITSELF (2026-09-19).
import { isStandingPlanConfig } from '../_shared/plan-refresh.ts';
import { enduranceSlotName, swapClassOf, writeSwapAdjustment } from '../_shared/session-swap/plan-adjustments.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function mondayOf(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The athlete's declared posture off the newest active goal — the read `useDeclaredPosture` did. */
async function loadPosture(db, userId: string) {
  try {
    const { data } = await db.from('goals').select('training_prefs')
      .eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return sanitizePosture(data?.training_prefs?.per_discipline_posture);
  } catch {
    // Undeclared is not a verdict: the gate behaves as it did before postures existed.
    return null;
  }
}

/**
 * The athlete's baselines row, and the usable FTP off it: learned (medium or high confidence) or
 * typed — the read `useResolvedFtp` did. The row is what a chosen workout is built against, the same
 * columns `generate-strength-plan` hands the composer for its anchors.
 */
async function loadBaselines(db, userId: string): Promise<{
  ftp: number | null;
  baselines: Record<string, unknown> | null;
  pricing: { thresholdSecPerMi: number | null; ftp: number | null; units: 'imperial' | 'metric' | null };
}> {
  try {
    const { data } = await db.from('user_baselines').select('performance_numbers, learned_fitness, units')
      .eq('user_id', userId).maybeSingle();
    const r = resolveCurrentFtp({ learned_fitness: data?.learned_fitness, performance_numbers: data?.performance_numbers });
    const ftp = (r.source === 'learned' || r.source === 'manual') && Number.isFinite(r.value) && r.value > 0 ? r.value : null;
    // ⚠️ NO THRESHOLD ON FILE IS NULL, and the workout lines then print the page's percentages —
    // the same state the session's own steps reach (D-285: no number is invented from a 5K).
    const thr = resolveCurrentRunThresholdPace(data ?? {}).sec_per_mi ?? null;
    const units = String(data?.units ?? '').toLowerCase() === 'metric' ? 'metric' : 'imperial';
    return { ftp, baselines: data ?? null, pricing: { thresholdSecPerMi: thr, ftp, units } };
  } catch {
    // No FTP, no hard ride; no baselines, the workouts build with no anchors, as the composer does.
    return { ftp: null, baselines: null, pricing: { thresholdSecPerMi: null, ftp: null, units: null } };
  }
}

/** One Monday-to-Sunday week as get-week lists it: planned rows, plus completed activities no planned row holds. */
async function loadWeek(db, userId: string, monday: string) {
  const sunday = addDays(monday, 6);
  const [{ data: planned }, { data: done }] = await Promise.all([
    db.from('planned_workouts').select('*').eq('user_id', userId).gte('date', monday).lte('date', sunday),
    db.from('workouts').select('id,date,type,name,workout_status,planned_id').eq('user_id', userId).gte('date', monday).lte('date', sunday),
  ]);
  const rows = Array.isArray(planned) ? planned : [];
  const plannedIds = new Set(rows.map((p) => String(p.id)));
  const extra = (Array.isArray(done) ? done : []).filter((w) => !w.planned_id || !plannedIds.has(String(w.planned_id)));
  return [...rows, ...extra];
}

async function contextFor(db, userId: string, session, cache: Map<string, unknown[]>, posture, ftp, baselines = null, pricing = undefined) {
  const monday = mondayOf(String(session.date));
  if (!cache.has(monday)) cache.set(monday, await loadWeek(db, userId, monday));
  return { session, week: cache.get(monday), posture, ftp, baselines, pricing };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  try {
    const { userId } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey);
    const [posture, { ftp, baselines, pricing }] = await Promise.all([loadPosture(db, userId), loadBaselines(db, userId)]);
    const weeks = new Map<string, unknown[]>();

    // ── The glyph: which of these sessions offer a sport swap ────────────────────────────────────
    if (Array.isArray(body?.planned_ids)) {
      const ids = [...new Set(body.planned_ids.map((x) => String(x)).filter(Boolean))].slice(0, 200);
      const sport_swap: Record<string, boolean> = {};
      if (ids.length === 0) return json({ success: true, sport_swap });
      const { data: rows } = await db.from('planned_workouts').select('*').eq('user_id', userId).in('id', ids);
      for (const row of Array.isArray(rows) ? rows : []) {
        sport_swap[String(row.id)] = hasSportSwap(await contextFor(db, userId, row, weeks, posture, ftp));
      }
      return json({ success: true, sport_swap });
    }

    // ── The logger's lift swap ─────────────────────────────────────────────────────────────────────
    if (body?.lift && typeof body.lift === 'object') {
      const lift = body.lift;
      const liftId = typeof lift.planned_id === 'string' ? lift.planned_id.trim() : '';
      const slot = typeof lift.slot === 'string' ? lift.slot.trim() : '';
      const substitute = typeof lift.substitute === 'string' ? lift.substitute.trim() : '';
      if (!liftId || !slot || !substitute) return json({ success: false, error: 'planned_id, slot and substitute required' }, 400);
      const { data: row } = await db.from('planned_workouts').select('id, date, training_plan_id')
        .eq('id', liftId).eq('user_id', userId).maybeSingle();
      if (!row) return json({ success: false, error: 'Planned session not found' }, 404);
      const date = String(row.date).slice(0, 10);
      const scope = lift.scope === 'rest_of_plan' ? 'rest_of_plan' : 'today';
      // ⛔ THE SLOT'S OWN MOVEMENT IS BACK TO THE PLAN — the swap list offers it first after a swap (`swapGroupsFor`).
      const back = substitute.toLowerCase() === slot.toLowerCase();
      const w = await writeSwapAdjustment(db, {
        userId, planId: row.training_plan_id ?? null, slot, date, scope,
        substitute: back ? null : substitute, sameClass: () => true, reason: 'exercise swap',
      });
      if (!w.ok) return json({ success: false, error: 'Could not write the session' }, 500);
      if (row.training_plan_id) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/materialize-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify(scope === 'today'
              ? { planned_workout_id: row.id }
              : { training_plan_id: row.training_plan_id, skip_done: true, from_date: date }),
          });
        } catch (e) {
          console.warn('[swap-session] materialize-plan after a lift swap failed:', e);
        }
      }
      return json({ success: true });
    }

    const plannedId = typeof body?.planned_id === 'string' ? body.planned_id.trim() : '';
    if (!plannedId) return json({ success: false, error: 'planned_id or planned_ids required' }, 400);
    const { data: session } = await db.from('planned_workouts').select('*').eq('id', plannedId).eq('user_id', userId).maybeSingle();
    if (!session) return json({ success: false, error: 'Planned session not found' }, 404);
    const ctx = {
      ...(await contextFor(db, userId, session, weeks, posture, ftp, baselines, pricing)),
      workoutMinutes: await loadWorkoutMinutes(db, userId, session),
    };

    // ── The sheet ────────────────────────────────────────────────────────────────────────────────
    if (!body?.option_id) {
      return json({ success: true, ...(await describeSheet(db, userId, ctx)) });
    }

    // ── The tap ──────────────────────────────────────────────────────────────────────────────────
    const materialize = async (id: string) => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/materialize-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ planned_workout_id: id }),
        });
      } catch (e) {
        // The row is swapped either way; opening it re-materialises it.
        console.warn('[swap-session] materialize-plan failed:', id, e);
      }
    };
    /**
     * ⛔ ONE LIST, ONE WRITER (2026-09-19). A Standing Plan block's sessions are rebuilt from its composition on every
     * rewrite, so a swap written only onto the rows was undone by the next one. There the tap is a `plan_adjustments`
     * row — the list the lift swap already uses — and `rematerialize-standing-block` writes the sessions it reaches.
     */
    let rewrite;
    if (session.training_plan_id) {
      const { data: plan } = await db.from('plans').select('id, config').eq('id', session.training_plan_id).eq('user_id', userId).maybeSingle();
      const date = String(session.date ?? '').slice(0, 10);
      const slot = enduranceSlotName(date, session);
      if (plan && slot && isStandingPlanConfig(plan.config)) {
        rewrite = async (swap) => {
          const cls = swap.revert ?? swapClassOf(swap.option);
          const w = await writeSwapAdjustment(db, {
            userId, planId: plan.id, slot, date, scope: swap.scope,
            substitute: swap.revert ? null : swap.option,
            sameClass: (sub) => swapClassOf(sub) === cls,
            reason: 'endurance swap',
          });
          if (!w.ok) return { ok: false, error: 'Could not write the session' };
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/rematerialize-standing-block`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                user_id: userId, plan_id: plan.id,
                swap: { planned_id: String(session.id), slot, cls, from: date, until: swap.scope === 'today' ? date : null },
              }),
            });
            const out = await r.json().catch(() => ({}));
            if (!out?.success || !Array.isArray(out?.swap?.ids)) {
              return { ok: false, error: out?.reason === 'swap_session_not_matched' || out?.reason === 'swap_session_not_in_plan' ? 'The plan no longer holds this session' : 'Could not write the session' };
            }
            return { ok: true, ids: out.swap.ids.map(String) };
          } catch (e) {
            console.warn('[swap-session] plan rewrite failed:', e);
            return { ok: false, error: 'Could not write the session' };
          }
        };
      }
    }
    const result = await applySwap({
      db, userId, ctx,
      optionId: String(body.option_id),
      restOfPlan: body?.scope === 'rest_of_plan',
      materialize,
      rewrite,
    });
    if (!result.ok) return json({ success: false, error: result.error });
    const { data: rows } = await db.from('planned_workouts').select('*').eq('user_id', userId).in('id', result.ids);
    return json({ success: true, receipt: result.receipt, also_written: result.alsoWritten, rows: rows ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});
