// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANALYSIS_VERSION = 'v0.1.0'; // initial server analytics version

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Load workout essentials
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id, user_id, type, source, strava_activity_id, garmin_activity_id, gps_track, sensor_data, laps, computed')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const sport = String(w.type || 'run').toLowerCase();

    // Parse JSON columns if stringified
    function parseJson(val: any) {
      if (val == null) return null;
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
    }
    const gps = parseJson(w.gps_track) || [];
    const sensorRaw = parseJson(w.sensor_data) || [];
    const sensor = Array.isArray(sensorRaw?.samples) ? sensorRaw.samples : (Array.isArray(sensorRaw) ? sensorRaw : []);
    const laps = parseJson(w.laps) || [];

    // Minimal provider provenance for envelope
    const input = {
      provider: (w.source || '').toLowerCase() || null,
      sourceIds: {
        garminActivityId: w.garmin_activity_id || null,
        stravaActivityId: w.strava_activity_id || null,
      },
      units: { distance: 'm', elevation: 'm', speed: 'mps', pace: 's_per_km', hr: 'bpm', power: 'w' }
    };

    // NOTE: Implement full analysis later. For now, produce a stub that the UI can render against.
    const analysis: any = {
      version: ANALYSIS_VERSION,
      computedAt: new Date().toISOString(),
      input,
      series: { sampling: { strategy: 'stub', targetPoints: 0 } },
      events: { laps: Array.isArray(laps) ? laps.slice(0, 50) : [] },
      zones: {},
      bests: {},
      ui: { footnote: `Computed at ${ANALYSIS_VERSION}`, renderHints: { preferPace: sport === 'run' } }
    };

    // Write under workouts.computed.analysis without clobbering existing computed
    const computed = (() => {
      const c = parseJson(w.computed) || {};
      return { ...c, analysis };
    })();

    const { error: upErr } = await supabase
      .from('workouts')
      .update({ computed })
      .eq('id', workout_id);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ success: true, analysisVersion: ANALYSIS_VERSION }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
