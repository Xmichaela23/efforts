/**
 * EDGE FUNCTION: backfill-strength-load
 *
 * ⛔ WHY THIS EXISTS, AND WHY IT IS THE DELIVERABLE RATHER THAN THE FORMULA (D1, 2026-08-01).
 *
 * D1 made a calisthenic set count: bodyweight fills in as the load, so chin-ups, dips, box jumps and
 * bodyweight hip thrusts stop scoring zero. That is a one-line change to a shared function. The
 * DANGEROUS part is that per-workout scores are STORED, not recomputed on read — and the load
 * verdict is a RATIO of the last 7 days against the last 28.
 *
 * So without this pass, the day the new scoring ships: this week's sessions carry the new (high)
 * price while the previous four weeks keep the old (near-zero) one. The ratio spikes for a reason
 * that has nothing to do with training, the load status crosses into 'high', and the reconciler
 * turns that into "pull back" on a week the athlete did exactly what was asked. The fix would have
 * manufactured the precise false alarm it was written to remove.
 *
 * ⛔ BOTH SIDES, IN ONE PASS. Re-pricing what was DONE without re-pricing what was PLANNED is the
 * same fault one layer along: every strength session would read as heavier than planned, forever.
 *
 * ⚠️ THIS FUNCTION COMPUTES NO SCORE OF ITS OWN.
 *   - Completed workouts: it invokes `calculate-workload`, the canonical writer. One formula.
 *   - Planned rows: it calls the shared `calculatePlannedStrengthWorkload` on the stored
 *     materialized prescription — the same function `materialize-plan` uses at authoring time.
 * A backfill that re-implements the thing it is backfilling is how two numbers start disagreeing.
 *
 * Idempotent: re-running re-prices to the same values. Start with `{ dry_run: true }`.
 *
 * Input:  { dry_run?: boolean, since?: 'YYYY-MM-DD', limit?: number (default 25), offset?: number }
 * Output: { next_offset, workouts: {...}, planned: {...} } — counts + a sample of before/after.
 *         ⚠️ CHUNKED: keep calling with the returned `next_offset` until it comes back null. The
 *         planned side is done in full on every call (it is cheap and idempotent).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveUser } from '../_shared/require-user.ts';
import { calculatePlannedStrengthWorkload, resolveBodyweightLb } from '../_shared/workload.ts';
import { resolveAthleteTimezone } from '../_shared/athlete-timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Strength lives under more than one type string in history (see bulk-reanalyze's own filter). */
const STRENGTH_TYPES = ['strength', 'strength_training'];

function parseExercises(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through — an unparseable row is skipped, never guessed at */ }
  }
  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    // ⛔ B1 AUTH, DUAL-MODE — a human re-prices THEMSELVES; an operator re-prices a named athlete.
    //
    // A one-off migration is run by whoever ships the change, not by the athlete tapping something,
    // so this needs the internal path that `calculate-workload` / `adapt-plan` already use. The rule
    // is the shared one and it is not relaxed here: the SERVICE key is a server-only secret and is
    // the only thing that may name someone else. A human JWT is scoped to its own `sub` and the body
    // `user_id` is IGNORED — otherwise this becomes "rewrite any athlete's training history" behind
    // a public key, which is the exact hole B1 closed.
    const { userId: jwtUserId, isService } = await resolveUser(req);
    const userId = isService ? String(body?.user_id ?? '').trim() : jwtUserId!;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'user_id required for a service-role call' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const dryRun: boolean = body?.dry_run !== false; // ⛔ DRY BY DEFAULT — this rewrites history.
    const batchSize: number = Number(body?.batch_size) || 25;
    const since: string | null = typeof body?.since === 'string' ? body.since.slice(0, 10) : null;
    // ⛔ CHUNKED BY DEFAULT, AND 25 IS A MEASURED NUMBER (2026-08-01).
    //
    // Asking for all 97 workouts in one invocation reported **37 failures, three times, at the same
    // count** — while every one of those calls succeeded when driven from outside, and chunks of 10
    // and 25 came back 97-for-97 clean. So it is a ceiling on a long-running edge invocation making
    // sibling calls, not bad data and not contention between parallel calls (it survived the switch
    // to sequential). Rather than leave a pass whose default mode silently half-finishes — the exact
    // mixed old/new window this whole thing exists to prevent — the default IS the chunk, and the
    // response hands back `next_offset` until there is nothing left.
    const limit: number = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 25;
    const offset: number = Number.isFinite(Number(body?.offset)) ? Number(body.offset) : 0;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── The athlete's body weight, resolved ONCE for the planned side ────────────────────────────
    // ⚠️ Null (never recorded) is not a failure: the new pricing is then identical to the old, so
    // this pass is a no-op and says so, rather than inventing a weight to make the numbers move.
    const { data: baselineRow } = await admin
      .from('user_baselines')
      // `timezone` rides along on a read this pass already does (Q-252 Stage 2) — it is threaded
      // into the compute-snapshot invoke at the end so this headless path names the athlete's zone
      // explicitly instead of leaving the callee to infer one.
      .select('weight, units, timezone')
      .eq('user_id', userId)
      .maybeSingle();
    const bodyweightLb = resolveBodyweightLb(baselineRow as any);
    const athleteTimezone = resolveAthleteTimezone({ storedTimezone: (baselineRow as any)?.timezone });

    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // 1. COMPLETED strength workouts — re-priced by the canonical writer
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    let wQuery = admin
      .from('workouts')
      .select('id, date, name, type, workload_actual')
      .eq('user_id', userId)
      .in('type', STRENGTH_TYPES)
      .order('date', { ascending: false });
    if (since) wQuery = wQuery.gte('date', since);
    const { data: workoutRows, error: wErr } = await wQuery;
    if (wErr) throw new Error(`workouts read failed: ${wErr.message}`);

    const allWorkouts = workoutRows ?? [];
    const workouts = allWorkouts.slice(offset, offset + limit);
    let wProcessed = 0, wUpdated = 0, wErrors = 0;
    // ⚠️ The REASONS ride back in the response, not only into a log this project cannot read from
    // the CLI. A count of failures with no cause is what turned one diagnosis into three runs.
    const wErrorSamples: string[] = [];
    const wSample: Array<{ date: string; name: string | null; before: number | null; after?: number | null }> = [];

    if (!dryRun) {
      // ⛔ SEQUENTIAL, AND THAT IS NOT A STYLE CHOICE (2026-08-01, found on the first real run).
      //
      // The first cut fired five `calculate-workload` invocations at a time, copying the idiom from
      // `sweep-user-history`. On 97 workouts it reported **37 failures, twice, deterministically** —
      // and every one of those 37 succeeded when retried one at a time. So it was contention on the
      // edge runtime, not bad data. A half-finished re-pricing is the WORST possible outcome here:
      // it is precisely the mixed old/new window the whole pass exists to prevent, and it would have
      // looked like a partial success in the response.
      //
      // ⚠️ A migration is not a hot path. There is no reason to buy 25 seconds with the one property
      // it must never trade — finishing. It is also retried once, so a genuine blip does not leave a
      // hole either.
      const invokeOnce = async (fn: string, payload: unknown) => {
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(`${fn} HTTP ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
      };
      const invoke = async (fn: string, payload: unknown) => {
        try { await invokeOnce(fn, payload); } catch { await invokeOnce(fn, payload); }
      };

      for (const w of workouts as any[]) {
        try {
          // 1. The stored load score — the ACWR substrate.
          await invoke('calculate-workload', { workout_id: w.id });
          // 2. ⛔ AND THE FACTS, OR ONLY HALF THE SESSION IS RE-PRICED. `workout_facts.strength_facts
          //    .total_volume_lbs` is written by a DIFFERENT function, and it is what the State
          //    strength VOLUME row and the per-muscle split are drawn from. Re-pricing the load and
          //    not the facts leaves two numbers about the same session disagreeing on the same
          //    screen — the exact fault D1 folded compute-facts in to avoid.
          //    `skip_snapshot` because the snapshot is rebuilt once at the end, not 97 times.
          await invoke('compute-facts', { workout_id: w.id, skip_snapshot: true });
          wUpdated++;
        } catch (e: any) {
          wErrors++;
          if (wErrorSamples.length < 5) wErrorSamples.push(`${w.date}: ${String(e?.message ?? e).slice(0, 180)}`);
          console.error('[backfill-strength-load] workout failed:', w.date, e?.message ?? e);
        }
        wProcessed++;
        if (wProcessed % 20 === 0) {
          console.log(`[backfill-strength-load] workouts ${wProcessed}/${workouts.length} (${wUpdated} ok, ${wErrors} failed)`);
        }
      }

      // One snapshot rebuild at the end, so the weekly aggregates every screen reads are built from
      // the re-priced facts rather than the ones they replaced.
      try {
        await invoke('compute-snapshot', { user_id: userId, timezone: athleteTimezone });
      } catch (e: any) {
        console.error('[backfill-strength-load] snapshot rebuild failed (re-run to refresh):', e?.message ?? e);
      }

      // Read the re-priced values back so the caller sees what actually moved, rather than a claim.
      const ids = workouts.slice(0, 10).map((w: any) => w.id);
      const { data: after } = await admin.from('workouts').select('id, workload_actual').in('id', ids);
      const afterById = new Map((after ?? []).map((r: any) => [r.id, r.workload_actual]));
      for (const w of workouts.slice(0, 10) as any[]) {
        wSample.push({ date: w.date, name: w.name, before: w.workload_actual, after: afterById.get(w.id) ?? null });
      }
    } else {
      for (const w of workouts.slice(0, 10) as any[]) {
        wSample.push({ date: w.date, name: w.name, before: w.workload_actual });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // 2. PLANNED strength rows — re-priced on the same basis
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ Reads the MATERIALIZED prescription (resolved weights in lb), which is what the authoring
    // path prices. A row that was never materialized has nothing to price and is skipped, not zeroed.
    let pQuery = admin
      .from('planned_workouts')
      .select('id, date, name, type, workload_planned, strength_exercises')
      .eq('user_id', userId)
      .in('type', STRENGTH_TYPES);
    if (since) pQuery = pQuery.gte('date', since);
    const { data: plannedRows, error: pErr } = await pQuery;
    if (pErr) throw new Error(`planned_workouts read failed: ${pErr.message}`);

    const planned = plannedRows ?? [];
    let pProcessed = 0, pUpdated = 0, pSkipped = 0, pErrors = 0;
    const pSample: Array<{ date: string; before: number | null; after: number }> = [];

    for (const row of planned as any[]) {
      pProcessed++;
      const exercises = parseExercises(row.strength_exercises);
      if (exercises.length === 0) { pSkipped++; continue; }
      const next = calculatePlannedStrengthWorkload(exercises, { bodyweightLb });
      if (!(next > 0)) { pSkipped++; continue; }
      if (next === row.workload_planned) { pSkipped++; continue; } // already on the new basis
      if (pSample.length < 10) pSample.push({ date: row.date, before: row.workload_planned, after: next });
      if (!dryRun) {
        const { error: upErr } = await admin
          .from('planned_workouts')
          .update({ workload_planned: next })
          .eq('id', row.id);
        if (upErr) { pErrors++; console.error('[backfill-strength-load] planned update failed:', upErr.message); continue; }
      }
      pUpdated++;
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      bodyweight_lb: bodyweightLb,
      // ⚠️ Stated plainly: with no recorded body weight the new pricing equals the old one, so a
      // pass that reports 0 changes here is correct rather than broken.
      note: bodyweightLb == null
        ? 'No body weight on file — bodyweight sets score as they did before; this pass changes nothing.'
        : null,
      // Null when the last chunk is done — the operator loops until this is null.
      next_offset: offset + workouts.length < allWorkouts.length ? offset + workouts.length : null,
      workouts: { found: allWorkouts.length, in_this_chunk: workouts.length, processed: wProcessed, updated: wUpdated, errors: wErrors, error_samples: wErrorSamples, sample: wSample },
      planned: { found: planned.length, processed: pProcessed, updated: pUpdated, skipped: pSkipped, errors: pErrors, sample: pSample },
      duration_ms: Date.now() - startTime,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[backfill-strength-load] failed:', error?.message ?? error);
    return new Response(JSON.stringify({ success: false, error: String(error?.message ?? error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
