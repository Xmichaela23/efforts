// @ts-nocheck
// Function: resolve-exercise-weight
//
// ⛔ THE SERVER DECIDES WHAT GOES ON THE BAR (2026-07-30, Michael: *"no client math, dumb client smart server"*).
//
// WHAT THIS REPLACES. `StrengthLogger.tsx` resolved the weight for an ADDED or SWAPPED exercise on the
// phone (added 2026-07-24). Four things it did there:
//   1. picked the day's intensity, defaulting to **0.70** when no row carried one — a hardcoded
//      fallback deciding real load;
//   2. back-inferred a percentage from the old exercise's ratio when the row had none;
//   3. queried `workouts` DIRECTLY for the last twenty sessions and scanned them with its own
//      name-matcher, to find what this lift was last loaded at;
//   4. multiplied and rounded to a weight.
//
// The formula itself was always shared with `materialize-plan` — that part was never the problem. The
// problem is that the DECISIONS around it lived on one device: a phone with a stale bundle would seed
// a different weight than the server would, for the same lift on the same day, and nothing would ever
// disagree loudly enough to notice.
//
// ⚠️ THIS IS A SEED, AND IT STAYS A SEED. It prefills the weight box; the athlete can overwrite it and
// what gets logged is whatever they actually lift. But an untouched seed IS what gets stored, which is
// why it belongs here (see the rule: does it get saved, or shown as a fact?).
//
// ⛔ IT DOES NOT WRITE ANYTHING. Read-only: baselines and history in, one number out. It cannot move a
// planned session or change a prescription.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import {
  getExerciseConfig,
  calculatePrescribedWeight,
  resolveSwapSeedWeight,
  getBaseline1RM,
  heaviestCompletedWeight,
  normalizeLiftKey,
} from '../../../src/lib/exercise-config.ts';

/**
 * ⛔ THE DEFAULT INTENSITY, AND IT IS THE LAST RESORT — not the first answer.
 *
 * Precedence is: the row's own authored percentage → a back-inference from what the athlete is
 * currently loading → this. Michael on fallbacks: *"i have fallabck ptsd from early AI builds of this
 * app that were all fallbacks and nothing worked."* This one survives because a blank weight box on an
 * exercise the athlete just added is worse than a conservative starting point — but the response says
 * WHICH branch answered, so a surface can tell a derived number from a guessed one.
 */
const DEFAULT_INTENSITY = 0.70;

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
    const { userId } = await requireUser(req);
    const p = await req.json();

    const name = String(p?.name ?? '').trim();
    if (!name) return json({ success: false, reason: 'name_required' }, 400);

    /** The percentage the PLANNED ROW carried, when it had one. Null → we resolve it below. */
    const plannedPercent = Number.isFinite(Number(p?.planned_percent)) && Number(p?.planned_percent) > 0
      ? Number(p.planned_percent) : null;
    /** For a SWAP: the exercise being replaced, and what the athlete is currently loading on it. */
    const previousName = String(p?.previous_name ?? '').trim() || null;
    const currentWeight = Number(p?.current_weight) || 0;
    const targetReps = Number.isFinite(Number(p?.target_reps)) && Number(p?.target_reps) > 0
      ? Number(p.target_reps) : undefined;
    /** Today, so history never includes the session being logged. */
    const onDate = String(p?.date ?? '').slice(0, 10) || null;

    const cfg = getExerciseConfig(name);
    // Bodyweight and band movements carry no load to resolve. Silence, not zero.
    if (!cfg || cfg.displayFormat === 'bodyweight' || cfg.displayFormat === 'band') {
      return json({ success: true, weight: null, source: 'no_load' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` } } },
    );

    const { data: baselines } = await supabase
      .from('user_baselines')
      .select('performance_numbers, learned_fitness')
      .eq('user_id', userId)
      .maybeSingle();

    const performanceNumbers = (baselines?.performance_numbers as Record<string, any>) ?? {};
    const learned1rms = ((baselines?.learned_fitness as any)?.strength_1rms ?? {}) as Record<string, any>;

    // ── THE PERCENTAGE ────────────────────────────────────────────────────────
    let percent = plannedPercent;
    let percentSource: 'planned' | 'back_inferred' | 'default' = 'planned';
    if (percent == null && previousName && currentWeight > 0) {
      // Back-infer from what the athlete is loading on the exercise being replaced. Legacy rows only —
      // the rounding inflation is the lesser evil versus a flat default.
      const oldCfg = getExerciseConfig(previousName);
      const oldRef = oldCfg ? getBaseline1RM(oldCfg, performanceNumbers) : null;
      const ratio = Number(oldCfg?.ratio ?? 0);
      if (oldRef && oldRef > 0 && ratio > 0) {
        percent = Math.max(0.3, Math.min(0.95, currentWeight / (oldRef * ratio)));
        percentSource = 'back_inferred';
      }
    }
    if (percent == null || !(percent > 0)) { percent = DEFAULT_INTENSITY; percentSource = 'default'; }

    // ── (a) THE LIFT'S OWN MEASURED 1RM ───────────────────────────────────────
    const ownKey = normalizeLiftKey(name).replace(/\s+/g, '_');
    const ownValue = Number(learned1rms?.[ownKey]?.value);
    if (Number.isFinite(ownValue) && ownValue > 0) {
      // Its OWN max, so no cross-lift ratio applies — only the per-hand split, if any.
      let w = ownValue * percent;
      if (cfg.displayFormat === 'perHand' && cfg.ratioIsTotal) w = w / 2;
      return json({
        success: true,
        weight: Math.max(5, Math.round(w / 5) * 5),
        source: 'own_measured_1rm',
        percent, percent_source: percentSource,
      });
    }

    // ── (b) WHAT THIS LIFT WAS LAST LOADED AT ─────────────────────────────────
    // ⛔ This query used to run FROM THE PHONE. One indexed read, one lift, scanned newest-first.
    try {
      let q = supabase
        .from('workouts')
        .select('date,strength_exercises')
        .eq('user_id', userId)
        .in('type', ['strength', 'weight_training', 'weights'])
        .order('date', { ascending: false })
        .limit(20);
      if (onDate) q = q.lt('date', onDate);
      const { data: rows } = await q;
      const want = normalizeLiftKey(name);
      for (const w of rows ?? []) {
        let exs: any[] = [];
        try {
          const raw = (w as any).strength_exercises;
          exs = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
        } catch { exs = []; }
        for (const ex of exs) {
          if (normalizeLiftKey(ex?.name || '') !== want) continue;
          const best = heaviestCompletedWeight(ex?.sets);
          if (best != null) {
            return json({ success: true, weight: best, source: 'last_logged', percent, percent_source: percentSource });
          }
        }
      }
    } catch { /* graceful: fall through to the baseline proxy */ }

    // ── (c) THE BASELINE PROXY ────────────────────────────────────────────────
    const resolved = previousName
      ? resolveSwapSeedWeight(name, percent, performanceNumbers, targetReps)
      : calculatePrescribedWeight(name, percent, performanceNumbers, undefined, false);

    return json({
      success: true,
      weight: resolved?.weight ?? null,
      source: resolved?.weight != null ? 'baseline_proxy' : 'unknown',
      percent, percent_source: percentSource,
    });
  } catch (e: any) {
    return json({ success: false, reason: 'error', details: e?.message ?? String(e) }, 500);
  }
});
