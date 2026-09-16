// @ts-nocheck
/**
 * save-baselines — the athlete's typed baselines in, the derived numbers computed and saved here.
 *
 * ⛔ THE RULE (2026-09-10): the phone sends what the athlete typed; this function derives and saves;
 * the phone never writes a derived number. Before today `AppContext.saveUserBaselines`,
 * `TrainingBaselines`, the Goals quick calibration, Adjust and the Welcome screen each wrote to
 * `user_baselines` directly, and two of the numbers they wrote were derived on the phone:
 *   · `effort_*` and `performance_numbers.fiveK_pace`, from the 5K;
 *   · `configured_hr_zones` zone tables, from threshold / max / resting heart rate.
 *
 * POST {
 *   baselines?:   user_baselines columns as typed (derived columns in it are ignored),
 *   heart_rate?:  { manual_run_lthr, manual_run_max_hr, manual_ride_lthr, manual_ride_max_hr, resting_heart_rate }
 *                 — a present key sets the value, null clears it, an absent key keeps the stored one,
 *   calibration?: { five_k_pace: 'm:ss', easy_pace?: 'm:ss', units: 'metric' | 'imperial' },
 *   preview?:     true — with `calibration`, return the derived score and paces without saving.
 *   accept?:      { kind: 'ftp' | 'run_threshold', value } — "use this number": the value the button showed
 *                 (watts, or seconds per km). Saved on its own; see `acceptMeasuredForSave`.
 *                 { kind: 'lift', lift, value } | { kind: 'swim_pace', value } — My Record's "Logged suggests …
 *                 Update" (2026-09-10, audit H-B12): the logged lift in pounds, or seconds per 100 yd. Checked
 *                 against `_shared/baseline-suggestions.ts`, which respects locked lifts.
 *   paces?:       { threshold: 'm:ss' } — a typed PACE, IN THE ATHLETE'S OWN UNIT. Per km for a metric
 *                 account, per mile otherwise; converted and stored per mile here. Same shape as
 *                 `heart_rate`: a present key sets it, an absent key leaves the stored one alone.
 *                 ⛔ The phone used to do this multiplication (`× 1.609344`, two copies) and the server
 *                 never saw the kilometre value. It does now, and the phone multiplies nothing.
 *   lifts?:       { squat: 102, … } — a typed 1RM IN THE ATHLETE'S OWN UNIT (kilograms on a metric
 *                 account), or pull-up reps. Converted to pounds here — every lift consumer is pound-native
 *                 — and written to `locked_baselines` (your number) AND `performance_numbers` (the seed a
 *                 new block starts from). `null` clears the lock for that lift, which is "auto".
 *   zones?:       true, alone — READ ONLY: everything Adjust and Training Baselines print (2026-09-10 for
 *                 the zone rows, audit H-B04–H-B06; the whole readout 2026-09-15). Nothing is saved. Send
 *                 `today` (the athlete's own YYYY-MM-DD) with it. See `zones.ts`.
 *   today?:       the phone's LOCAL date, `YYYY-MM-DD`. Drives lift freshness, the age, and the day a
 *                 retest lands on. Absent falls back to UTC, which is a day ahead after 5 pm Pacific.
 * }
 * → { success, effort, performance_numbers, configured_hr_zones, locked_baselines, zones }
 *   accept → { success, accepted: { kind, value }, learned_fitness, performance_numbers, zones }, or 409 with
 *            `error: 'nothing_to_accept' | 'value_changed'`
 *            lift / swim_pace → { success, accepted: { kind, lift, value, locked }, performance_numbers, locked_baselines }
 *   zones  → { success, zones: { power, swim_pace, run_easy_hr } }
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import {
  acceptMeasuredForSave,
  liftsForSave,
  pacesForSave,
  effortFieldsForPerformanceNumbers,
  effortFieldsFromFiveKTimeSec,
  fiveKClockFromCalibration,
  hrZoneConfigForSave,
  performanceNumbersForSave,
} from './derive.ts';
import { zonesForBaselinesRow } from './zones.ts';
import { acceptRecordSuggestion } from '../_shared/baseline-suggestions.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Columns the phone may never write: derived here, learned elsewhere, or row identity. */
const NOT_TYPED = [
  'id', 'user_id', 'created_at', 'updated_at',
  'effort_score', 'effort_source_distance', 'effort_source_time', 'effort_paces',
  'effort_paces_source', 'effort_score_status', 'effort_updated_at',
  'configured_hr_zones', 'learned_fitness',
];

/** Every column the readout is built from — one list, used by all three reads below. */
const READOUT_COLUMNS =
  'performance_numbers, learned_fitness, configured_hr_zones, locked_baselines, units, birthday, gender, height, weight, updated_at';

/** The readout, built from the stored row as it now stands. One read, one builder, three callers. */
async function readoutFor(supabase: { from: (t: string) => any }, userId: string, today: string) {
  const { data } = await supabase.from('user_baselines').select(READOUT_COLUMNS).eq('user_id', userId).maybeSingle();
  return zonesForBaselinesRow(data, { today });
}

const parseJson = (v: unknown) => {
  if (typeof v !== 'string') return v ?? null;
  try { return JSON.parse(v); } catch { return null; }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, supabase } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const nowIso = new Date().toISOString();

    /**
     * ⛔ THE ATHLETE'S OWN DATE, NOT UTC. `toISOString()` is UTC, so after 5 pm in Los Angeles it reads
     * as tomorrow — which dated a retest a day ahead and could age a lift out of its freshness window a
     * day early. The phone sends its local day; absent, UTC stands and says so by being the fallback.
     */
    const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today.slice(0, 10)
      : nowIso.slice(0, 10);

    // ⛔ THE READOUT READ. Adjust, Profile and Welcome print these rows; the phone builds none of them.
    if (body?.zones === true && !body?.baselines && !body?.heart_rate && !body?.calibration && !body?.accept
        && !body?.paces && !body?.lifts) {
      const { data: cur, error: zErr } = await supabase
        .from('user_baselines')
        .select(READOUT_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
      if (zErr) throw zErr;
      return json({ success: true, zones: zonesForBaselinesRow(cur, { today }) });
    }

    const calibration = body?.calibration && typeof body.calibration === 'object' ? body.calibration : null;
    const calClock = calibration
      ? fiveKClockFromCalibration({
          fiveKPace: calibration.five_k_pace,
          easyPace: calibration.easy_pace,
          metric: String(calibration.units) === 'metric',
        })
      : null;
    if (calibration && !calClock) return json({ error: 'The 5K pace is not usable, or is not faster than the easy pace.' }, 400);

    if (body?.preview === true) {
      if (!calClock) return json({ error: 'preview needs a calibration' }, 400);
      const e = effortFieldsFromFiveKTimeSec(calClock.fiveKTimeSec, nowIso);
      return json({ success: true, preview: true, five_k: calClock.clock, effort_score: e.effort_score, effort_paces: e.effort_paces });
    }

    const accept = body?.accept && typeof body.accept === 'object' ? body.accept : null;
    if (accept) {
      const kind = String(accept.kind);
      const value = Number(accept.value);
      if (!['ftp', 'run_threshold', 'lift', 'swim_pace'].includes(kind) || !Number.isFinite(value) || value <= 0) {
        return json({ error: 'accept needs kind ftp | run_threshold | lift | swim_pace and a positive value' }, 400);
      }
      if (kind === 'lift' || kind === 'swim_pace') {
        const { data: row, error: rowErr } = await supabase
          .from('user_baselines')
          .select('learned_fitness, performance_numbers, locked_baselines')
          .eq('user_id', userId)
          .maybeSingle();
        if (rowErr) throw rowErr;
        const rec = acceptRecordSuggestion({
          kind,
          lift: accept.lift != null ? String(accept.lift) : null,
          value,
          performanceNumbers: parseJson(row?.performance_numbers) as Record<string, unknown> | null,
          learnedFitness: parseJson(row?.learned_fitness) as Record<string, unknown> | null,
          lockedBaselines: parseJson(row?.locked_baselines) as Record<string, unknown> | null,
          asOf: nowIso.slice(0, 10),
        });
        if (!rec.ok) return json({ error: rec.reason }, rec.reason === 'unknown_lift' ? 400 : 409);
        const { error: recErr } = await supabase
          .from('user_baselines')
          .update({ performance_numbers: rec.performance_numbers, locked_baselines: rec.locked_baselines, updated_at: nowIso })
          .eq('user_id', userId);
        if (recErr) throw recErr;
        return json({
          success: true,
          accepted: { kind, lift: kind === 'lift' ? String(accept.lift) : null, value: rec.accepted_value, locked: rec.locked },
          performance_numbers: rec.performance_numbers,
          locked_baselines: rec.locked_baselines,
          zones: await readoutFor(supabase, userId, today),
        });
      }
      const { data: cur, error: curErr } = await supabase
        .from('user_baselines')
        .select('learned_fitness, performance_numbers, configured_hr_zones')
        .eq('user_id', userId)
        .maybeSingle();
      if (curErr) throw curErr;
      const res = acceptMeasuredForSave({
        kind,
        value,
        learnedFitness: parseJson(cur?.learned_fitness) as Record<string, unknown> | null,
        performanceNumbers: parseJson(cur?.performance_numbers) as Record<string, unknown> | null,
        now: new Date(),
      });
      if (!res.ok) return json({ error: res.reason }, 409);
      const { error: accErr } = await supabase
        .from('user_baselines')
        .update({ learned_fitness: res.learned_fitness, performance_numbers: res.performance_numbers, updated_at: nowIso })
        .eq('user_id', userId);
      if (accErr) throw accErr;
      return json({
        success: true,
        accepted: { kind, value: res.accepted_value },
        learned_fitness: res.learned_fitness,
        performance_numbers: res.performance_numbers,
        zones: await readoutFor(supabase, userId, today),
      });
    }

    const typed: Record<string, unknown> | null =
      body?.baselines && typeof body.baselines === 'object' ? { ...body.baselines } : null;
    if (typed) for (const k of NOT_TYPED) delete typed[k];
    const heartRate = body?.heart_rate && typeof body.heart_rate === 'object' ? body.heart_rate : null;
    const typedPaces = body?.paces && typeof body.paces === 'object' ? body.paces : null;
    const typedLifts = body?.lifts && typeof body.lifts === 'object' ? body.lifts : null;
    if (!typed && !heartRate && !calClock && !typedPaces && !typedLifts) return json({ error: 'nothing to save' }, 400);

    const { data: existing, error: readErr } = await supabase
      .from('user_baselines')
      .select('id, units, performance_numbers, learned_fitness, configured_hr_zones, locked_baselines')
      .eq('user_id', userId)
      .maybeSingle();
    if (readErr) throw readErr;

    const storedPerf = (parseJson(existing?.performance_numbers) ?? {}) as Record<string, unknown>;
    const metric = String(typed?.units ?? existing?.units ?? 'imperial') === 'metric';

    // What was typed for the performance numbers: the row's own when a full save sent them, the stored
    // ones plus the calibrated 5K when the quick calibration is the only thing saving.
    let perfTyped: Record<string, unknown> | null = null;
    if (typed && typed.performance_numbers && typeof typed.performance_numbers === 'object') {
      perfTyped = typed.performance_numbers as Record<string, unknown>;
    } else if (calClock || typed) {
      perfTyped = { ...storedPerf };
    }
    if (calClock) perfTyped = { ...(perfTyped ?? storedPerf), fiveK: calClock.clock };
    // A typed pace or a typed lift arrives in the athlete's own unit and is converted on the way in.
    if (typedPaces || typedLifts) perfTyped = { ...(perfTyped ?? storedPerf) };

    const row: Record<string, unknown> = { ...(typed ?? {}) };
    let effort = null;
    if (perfTyped) {
      let perf = performanceNumbersForSave(perfTyped, storedPerf, metric);
      perf = pacesForSave(typedPaces, perf, metric);
      const lifted = liftsForSave(typedLifts, perf, parseJson(existing?.locked_baselines) as Record<string, unknown> | null, metric);
      if (lifted) { perf = lifted.performance_numbers; row.locked_baselines = lifted.locked_baselines; }
      row.performance_numbers = perf;
      effort = effortFieldsForPerformanceNumbers(perf, nowIso);
      if (effort) Object.assign(row, effort);
    }

    let zonesCfg = null;
    if (heartRate) {
      zonesCfg = hrZoneConfigForSave({
        typed: heartRate,
        stored: parseJson(existing?.configured_hr_zones) as Record<string, unknown> | null,
        learnedFitness: parseJson(existing?.learned_fitness) as Record<string, unknown> | null,
        performanceNumbers: (row.performance_numbers ?? storedPerf) as Record<string, unknown>,
        nowIso,
      });
      if (zonesCfg) row.configured_hr_zones = zonesCfg;
    }

    if (Object.keys(row).length > 0) {
      if (existing) {
        const { error } = await supabase.from('user_baselines').update(row).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_baselines').insert([{ ...row, user_id: userId }]);
        if (error) throw error;
      }
    }

    return json({
      success: true,
      effort,
      performance_numbers: row.performance_numbers ?? null,
      locked_baselines: row.locked_baselines ?? null,
      configured_hr_zones: zonesCfg ?? parseJson(existing?.configured_hr_zones) ?? null,
      // ⛔ BUILT FROM THE ROW THAT WAS JUST WRITTEN, not from a hand-assembled copy of it — the screens
      // re-render off this and a stitched object is how the two drift apart for one render.
      zones: await readoutFor(supabase, userId, today),
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[save-baselines]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
