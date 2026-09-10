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
 * }
 * → { success, effort, performance_numbers, configured_hr_zones }
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import {
  effortFieldsForPerformanceNumbers,
  effortFieldsFromFiveKTimeSec,
  fiveKClockFromCalibration,
  hrZoneConfigForSave,
  performanceNumbersForSave,
} from './derive.ts';

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

    const typed: Record<string, unknown> | null =
      body?.baselines && typeof body.baselines === 'object' ? { ...body.baselines } : null;
    if (typed) for (const k of NOT_TYPED) delete typed[k];
    const heartRate = body?.heart_rate && typeof body.heart_rate === 'object' ? body.heart_rate : null;
    if (!typed && !heartRate && !calClock) return json({ error: 'nothing to save' }, 400);

    const { data: existing, error: readErr } = await supabase
      .from('user_baselines')
      .select('id, units, performance_numbers, learned_fitness, configured_hr_zones')
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

    const row: Record<string, unknown> = { ...(typed ?? {}) };
    let effort = null;
    if (perfTyped) {
      const perf = performanceNumbersForSave(perfTyped, storedPerf, metric);
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
      configured_hr_zones: zonesCfg ?? parseJson(existing?.configured_hr_zones) ?? null,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[save-baselines]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
