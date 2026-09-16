// @ts-nocheck
// Function: save-baseline-test
//
// ⛔ THE SERVER OWNS THE TESTED 1RM (2026-07-30, Michael: *"no client math, dumb client smart server"*).
//
// WHAT THIS REPLACES. `StrengthLogger.tsx` did all four of these on the phone:
//   1. computed the estimated 1RM from the test set,
//   2. canonicalised the lift key (its own mapping, the D-224 OHP guard),
//   3. decided which results auto-write and which need the athlete (raise vs down),
//   4. wrote `user_baselines.performance_numbers` directly.
//
// Every one of those is a decision or a stored fact, and the number they produce is THE most
// load-bearing in the strength system — a whole block's working weights are derived from it. Two
// screens could not have disagreed about it, because only one screen computed it; that is worse, not
// better. It meant the number that SET the weights and the number that JUDGED the work came from
// different machines running different code.
//
// ⚠️ WHAT STAYS ON THE PHONE, LEGITIMATELY: the Keep-vs-Update dialog. That is CONSENT, not a
// derivation — only the athlete knows whether a lower test is a real regression or a bad day. So this
// function is two-phase: it reports what needs deciding, and writes once the decisions come back.
//
// ⚠️ NOT A NEW FORMULA. `estimate1RM` (via `estimate1RMRounded`) is the app's one 1RM formula (D-339, the standard), the same
// module `compute-facts` uses. This function moves WHERE the arithmetic runs, not WHAT it computes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import { estimate1RMRounded } from '../../../src/lib/estimate-1rm.ts';
import { pickTestLifts } from './pick.ts';
import { KG_PER_LB, liftInAthletesUnit } from '../_shared/strength/session-volume.ts';

/**
 * ⛔ THE TYPED WEIGHT CONVERTS HERE, ON THE WAY IN (2026-09-16, Stage 4 session 4). The logger sends each
 * exercise in the unit its boxes show (`unit`), and a set the athlete never retyped carries the pounds the
 * server gave it (`weight_lb`). Every max is stored in pounds, so a kilogram box converts by the definition
 * constant before the set is picked; a 100 typed on a metric account is 100 kg, not 100 lb.
 * An exercise with no `unit` is an older app bundle, whose boxes were pounds.
 */
function setsInPounds(exercises: unknown[]): unknown[] {
  return exercises.map((ex: any) => {
    const kg = String(ex?.unit ?? 'lb') === 'kg';
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    return {
      ...ex,
      unit: 'lb',
      sets: sets.map((st: any) => {
        const typed = Number(st?.weight) || 0;
        const lb = Number(st?.weight_lb);
        const { weight_lb: _drop, ...rest } = st ?? {};
        return { ...rest, weight: Number.isFinite(lb) && lb > 0 ? lb : (kg ? typed / KG_PER_LB : typed) };
      }),
    };
  });
}

/**
 * ⛔ THE OHP WRITE GUARD (D-224), MOVED SERVER-SIDE UNCHANGED. Overhead press has ONE canonical key —
 * `overheadPress1RM`, which is what `materialize-plan` reads. A result landing under a variant
 * (`overhead` / `ohp` / `overhead_press`) drifts into the void: written, never read, and the athlete
 * sees a saved number that changes no weight.
 */
function canonKey(k: string): string {
  const s = String(k || '');
  if (s === 'overhead' || s === 'ohp' || s === 'overhead_press') return 'overheadPress1RM';
  if (s === 'pullup' || s === 'pull_up' || s === 'pullups' || s === 'pullupmaxreps') return 'pullupMaxReps';
  return s;
}

const LIFT_LABEL: Record<string, string> = {
  bench: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
  overheadPress1RM: 'Overhead Press',
  pullupMaxReps: 'Pull ups',
};

/**
 * ⛔ NEAREST 5 LB, ROUNDED ONCE (2026-09-15, TRUTH-MAP §9 Q5) — `estimate1RMRounded`, the same function
 * compute-facts and the test result read. Viada p215's own worked example rounds 224.25 to 225, and the
 * prescription basis is already 96% of this number (p215), so the old floor was a second haircut the page
 * does not print. STATE-SOURCES row "e1RM = average of Epley and Brzycki, nearest 5 lb".
 */
function roundedFromTest(weight: number, reps: number): number {
  return estimate1RMRounded(Number(weight) || 0, Number(reps) || 0);
}

/**
 * ⛔ PULL-UPS ARE A REP COUNT, NOT AN ESTIMATE. `pullupMaxReps` stores how many you did — there is no
 * weight to estimate a max from, and zero reps is a VALID baseline ("goal: your first pull-up"). So
 * no formula, no 5 lb rounding, and no `weight > 0` gate. Preserved from the client behaviour it
 * replaces; getting this wrong would silently drop every bodyweight result.
 */
function isRepCountLift(key: string): boolean {
  return key === 'pullupMaxReps';
}

/**
 * ⛔ AND A BAND-ASSISTED REP COUNT IS NOT A CAPACITY. Added 2026-08-13.
 *
 * A rep-count lift is stored verbatim — no formula, no rounding — which is right, and it is exactly
 * why an assisted count is dangerous here: it lands in `performance_numbers.pullupMaxReps` unaltered
 * and becomes the athlete's tested max. The client now refuses to send one, and this is the server's
 * own guard rather than trust in the caller: a payload is a claim, not a measurement.
 *
 * ⚠️ READS THE SET'S `resistance_level`, the same overloaded field the logger writes and
 * `band-assistance.ts` disambiguates. Absent → not assisted, which is the honest default for every
 * historical payload that predates the field being sent.
 */
function isAssistedRepCount(lift: Record<string, unknown>): boolean {
  const raw = (lift as { resistance_level?: unknown })?.resistance_level;
  if (raw == null || String(raw).trim() === '') return false;
  const n = Number(raw);
  return Number.isFinite(n) ? n > 0 : true;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    // Ownership comes from the VERIFIED JWT, never from the body — a user id in a payload is a claim,
    // not an identity.
    const { userId } = await requireUser(req);
    const payload = await req.json();

    // ⛔ THE SERVER PICKS THE SET AND THE LIFT (2026-09-10, audit H-S08). The logger sends every set of
    // the session (`exercises`) and `pickTestLifts` chooses the saved max by the test read-back's rule.
    // `lifts` — one set per lift, already chosen on the phone — is what an app bundle from before this
    // change still sends; it is read only when `exercises` is absent.
    const sentSets = Array.isArray(payload?.exercises);
    const lifts = sentSets
      ? pickTestLifts(setsInPounds(payload.exercises), payload?.session)
      : (Array.isArray(payload?.lifts) ? payload.lifts : []);
    if (lifts.length === 0) {
      return sentSets
        ? json({ success: false, reason: 'no_test_set' })
        : json({ success: false, reason: 'no_lifts' }, 400);
    }

    /** `{ [baselineKey]: 'keep' | 'update' }` — absent on the first call. */
    const decisions: Record<string, string> = payload?.decisions && typeof payload.decisions === 'object'
      ? payload.decisions : {};

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      global: { headers: { Authorization: `Bearer ${serviceRoleKey!}` } },
    });

    const { data: row } = await supabase
      .from('user_baselines')
      .select('id, performance_numbers, units')
      .eq('user_id', userId)
      .maybeSingle();

    const currentPerf: Record<string, any> = (row?.performance_numbers as Record<string, any>) ?? {};
    // Every number echoed to the logger also comes in the athlete's unit, with the unit (Stage 4 session 4).
    const metric = String(row?.units ?? 'imperial') === 'metric';
    const unit = metric ? 'kg' : 'lb';
    const inUnit = (lb: number): number => Math.round(liftInAthletesUnit(lb, metric));
    const updatedPerf: Record<string, any> = { ...currentPerf };

    /** Results the athlete has to rule on: the test came in BELOW what is stored. */
    const downs: Array<{ key: string; lift: string; prior: number; next: number; unit: string; prior_in_unit: number; next_in_unit: number }> = [];
    /** What we computed, echoed back so the screen renders the server's number rather than its own. */
    const computed: Array<{ key: string; lift: string; weight: number; reps: number; estimated1RM: number; unit?: string; weight_in_unit?: number; estimated1RM_in_unit?: number }> = [];

    for (const l of lifts) {
      const key = canonKey(l?.baselineKey);
      if (!key) continue;
      const weight = Number(l?.weight) || 0;
      const reps = Number(l?.reps) || 0;

      let next: number;
      if (isRepCountLift(key)) {
        // ⛔ SKIP AN ASSISTED COUNT ENTIRELY — no write, no `computed` echo, no "kept" outcome. It is
        // not a lower result to decide about; it is not a measurement of this capacity at all, and
        // offering the athlete a keep/update choice about it would imply it was.
        if (isAssistedRepCount(l)) continue;
        // The rep count IS the value. Zero is legal and meaningful here.
        if (!Number.isFinite(reps) || reps < 0) continue;
        next = Math.round(reps);
      } else {
        if (!(weight > 0) || !(reps > 0)) continue;
        next = roundedFromTest(weight, reps);
        if (!(next > 0)) continue;
      }
      computed.push({
        key, lift: LIFT_LABEL[key] ?? key, weight, reps, estimated1RM: next,
        // A rep-count lift has no weight to convert; its value is a count.
        ...(isRepCountLift(key) ? {} : { unit, weight_in_unit: inUnit(weight), estimated1RM_in_unit: inUnit(next) }),
      });

      const prior = Number(currentPerf[key]);

      // A RAISE, a FIRST TIME, or an EQUAL is unambiguous — write it, no friction.
      if (!(prior > 0) || next >= prior) {
        updatedPerf[key] = next;
        continue;
      }

      // ⛔ A DOWN RESULT IS NOT SILENTLY HELD (which was D-223's ratchet-up-only) AND NOT SILENTLY
      // OVERWRITTEN. A lower number may be a real regression or a bad day, and only the athlete knows.
      const decision = String(decisions[key] ?? '').toLowerCase();
      if (decision === 'update') { updatedPerf[key] = next; continue; }
      if (decision === 'keep') { continue; } // stored value stands
      downs.push({
        key, lift: LIFT_LABEL[key] ?? key, prior, next,
        unit: isRepCountLift(key) ? '' : unit,
        prior_in_unit: isRepCountLift(key) ? prior : inUnit(prior),
        next_in_unit: isRepCountLift(key) ? next : inUnit(next),
      });
    }

    // Phase one: something needs the athlete. NOTHING is written — including the unambiguous raises,
    // so a half-applied save cannot exist if they abandon the dialog.
    if (downs.length > 0) {
      return json({ success: true, written: false, needs_decision: downs, computed });
    }

    if (Object.keys(updatedPerf).length === 0) return json({ success: false, reason: 'nothing_to_write' }, 400);

    if (row?.id) {
      const { error } = await supabase
        .from('user_baselines')
        .update({ performance_numbers: updatedPerf })
        .eq('id', row.id);
      if (error) return json({ success: false, reason: 'write_failed', details: error.message }, 500);
    } else {
      const { error } = await supabase
        .from('user_baselines')
        .insert([{ user_id: userId, performance_numbers: updatedPerf }]);
      if (error) return json({ success: false, reason: 'write_failed', details: error.message }, 500);
    }

    return json({ success: true, written: true, computed, performance_numbers: updatedPerf });
  } catch (e: any) {
    return json({ success: false, reason: 'error', details: e?.message ?? String(e) }, 500);
  }
});
