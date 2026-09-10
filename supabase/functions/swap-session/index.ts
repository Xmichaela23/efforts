// @ts-nocheck
/**
 * swap-session — the Instead sheet's options and the write behind a tap (2026-09-10, audit H-T15).
 *
 * ⛔ THE PHONE RENDERS WHAT THIS SENDS AND POSTS THE TAP. Which swaps a planned session offers (the
 * machine, another sport, the long day, back to the plan), the words on each, and the row or rows a
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
 *       `materialize-plan`, returns the written rows.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { sanitizePosture } from '../_shared/state-trend/posture.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { applySwap, describeSheet, hasSportSwap } from '../_shared/session-swap/sheet.ts';

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

/** Usable FTP: learned (medium or high confidence) or typed — the read `useResolvedFtp` did. */
async function loadFtp(db, userId: string): Promise<number | null> {
  try {
    const { data } = await db.from('user_baselines').select('performance_numbers, learned_fitness')
      .eq('user_id', userId).maybeSingle();
    const r = resolveCurrentFtp({ learned_fitness: data?.learned_fitness, performance_numbers: data?.performance_numbers });
    return (r.source === 'learned' || r.source === 'manual') && Number.isFinite(r.value) && r.value > 0 ? r.value : null;
  } catch {
    // No FTP, no hard ride.
    return null;
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

async function contextFor(db, userId: string, session, cache: Map<string, unknown[]>, posture, ftp) {
  const monday = mondayOf(String(session.date));
  if (!cache.has(monday)) cache.set(monday, await loadWeek(db, userId, monday));
  return { session, week: cache.get(monday), posture, ftp };
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
    const [posture, ftp] = await Promise.all([loadPosture(db, userId), loadFtp(db, userId)]);
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

    const plannedId = typeof body?.planned_id === 'string' ? body.planned_id.trim() : '';
    if (!plannedId) return json({ success: false, error: 'planned_id or planned_ids required' }, 400);
    const { data: session } = await db.from('planned_workouts').select('*').eq('id', plannedId).eq('user_id', userId).maybeSingle();
    if (!session) return json({ success: false, error: 'Planned session not found' }, 404);
    const ctx = await contextFor(db, userId, session, weeks, posture, ftp);

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
    const result = await applySwap({
      db, userId, ctx,
      optionId: String(body.option_id),
      restOfPlan: body?.scope === 'rest_of_plan',
      materialize,
    });
    if (!result.ok) return json({ success: false, error: result.error });
    const { data: rows } = await db.from('planned_workouts').select('*').eq('user_id', userId).in('id', result.ids);
    return json({ success: true, receipt: result.receipt, also_written: result.alsoWritten, rows: rows ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});
