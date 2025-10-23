// @ts-nocheck
// Function: workout-detail
// Behavior: Return canonical completed workout details by id with optional heavy fields

import { createClient } from 'jsr:@supabase/supabase-js@2';

type DetailOptions = {
  include_gps?: boolean;
  include_sensors?: boolean;
  include_swim?: boolean;
  resolution?: 'low' | 'high';
  normalize?: boolean;
  version?: string; // response schema version; default v1
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function isUuid(v?: string | null): boolean { return !!v && /[0-9a-fA-F-]{36}/.test(v); }

function normalizeBasic(w: any) {
  const type = String(w?.type || '').toLowerCase();
  return {
    normalization_version: String(w?.normalization_version || ''),
    id: String(w?.id || ''),
    user_id: String(w?.user_id || ''),
    date: String(w?.date || '').slice(0,10),
    type,
    workout_status: String(w?.workout_status || 'completed'),
    planned_id: w?.planned_id || null,
    // Basic metrics (pass-through; units as stored)
    distance: w?.distance ?? w?.distance_km ?? null,
    distance_meters: w?.distance_meters ?? (typeof w?.distance === 'number' ? w.distance * 1000 : null),
    moving_time: w?.moving_time ?? w?.metrics?.moving_time ?? null,
    elapsed_time: w?.elapsed_time ?? w?.metrics?.elapsed_time ?? null,
    avg_heart_rate: w?.avg_heart_rate ?? w?.metrics?.avg_heart_rate ?? null,
    max_heart_rate: w?.max_heart_rate ?? w?.metrics?.max_heart_rate ?? null,
    avg_power: w?.avg_power ?? w?.metrics?.avg_power ?? null,
    max_power: w?.max_power ?? w?.metrics?.max_power ?? null,
    avg_cadence: w?.avg_cadence ?? w?.metrics?.avg_cadence ?? null,
    max_cadence: w?.max_cadence ?? w?.metrics?.max_cadence ?? null,
    avg_speed_mps: w?.avg_speed_mps ?? null,
    avg_speed: w?.avg_speed ?? w?.metrics?.avg_speed ?? null,
    duration: w?.duration ?? null,
    calories: w?.calories ?? null,
    steps: w?.steps ?? null,
    elevation_gain: w?.elevation_gain ?? w?.metrics?.elevation_gain ?? null,
    elevation_loss: w?.elevation_loss ?? w?.metrics?.elevation_loss ?? null,
    // Computed snapshot passthrough
    computed: w?.computed || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const id = String(body?.id || '').trim();
    const opts: DetailOptions = {
      include_gps: body?.include_gps !== false,
      include_sensors: body?.include_sensors !== false,
      include_swim: body?.include_swim !== false,
      resolution: (body?.resolution === 'low' ? 'low' : 'high'),
      normalize: body?.normalize !== false,
      version: String(body?.version || 'v1'),
    };
    if (!isUuid(id)) {
      return new Response(JSON.stringify({ error: 'id must be a UUID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let userId: string | null = null;
    try {
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token as any);
        userId = userData?.user?.id || null;
      }
    } catch {}

    // Select minimal set plus optional blobs
    const baseSel = [
      'id','user_id','date','type','workout_status','planned_id','name','metrics','computed','workout_analysis',
      'avg_heart_rate','max_heart_rate','avg_power','max_power','avg_cadence','max_cadence',
      'avg_speed','distance','duration','elapsed_time','moving_time','calories','steps','elevation_gain','elevation_loss',
      'start_position_lat','start_position_long','timestamp',
      'strength_exercises','mobility_exercises'
    ].join(',');
    const gpsSel = opts.include_gps ? ',gps_track' : '';
    const sensSel = opts.include_sensors ? ',sensor_data' : '';
    // workouts table stores pool_length (meters or yards depending on source), not pool_length_m/pool_unit
    const swimSel = opts.include_swim ? ',swim_data,number_of_active_lengths,pool_length' : '';
    const select = baseSel + gpsSel + sensSel + swimSel;

    let query = supabase.from('workouts').select(select).eq('id', id) as any;
    if (userId) query = query.eq('user_id', userId);
    const { data: row, error } = await query.maybeSingle();
    if (error) throw error;
    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize light fields only (Phase 1: no heavy processing/downsampling)
    const detail = normalizeBasic(row);

    // No derived fallbacks here; detail is a thin wrapper around stored data.

    // Parse/attach structured fields
    try { (detail as any).computed = (()=>{ try { return typeof row.computed === 'string' ? JSON.parse(row.computed) : (row.computed || null); } catch { return row.computed || null; } })(); } catch {}
    try { (detail as any).metrics  = (()=>{ try { return typeof row.metrics  === 'string' ? JSON.parse(row.metrics)  : (row.metrics  || null); } catch { return row.metrics  || null; } })(); } catch {}
    try { (detail as any).workout_analysis = (()=>{ try { return typeof row.workout_analysis === 'string' ? JSON.parse(row.workout_analysis) : (row.workout_analysis || null); } catch { return row.workout_analysis || null; } })(); } catch {}
    try { (detail as any).strength_exercises = (()=>{ try { return typeof row.strength_exercises === 'string' ? JSON.parse(row.strength_exercises) : (row.strength_exercises || null); } catch { return row.strength_exercises || null; } })(); } catch {}
    try { (detail as any).mobility_exercises = (()=>{ try { return typeof row.mobility_exercises === 'string' ? JSON.parse(row.mobility_exercises) : (row.mobility_exercises || null); } catch { return row.mobility_exercises || null; } })(); } catch {}
    if (opts.include_gps) {
      try { (detail as any).gps_track = typeof row.gps_track === 'string' ? JSON.parse(row.gps_track) : (row.gps_track || null); } catch { (detail as any).gps_track = row.gps_track || null; }
    }
    if (opts.include_sensors) {
      try { (detail as any).sensor_data = typeof row.sensor_data === 'string' ? JSON.parse(row.sensor_data) : (row.sensor_data || null); } catch { (detail as any).sensor_data = row.sensor_data || null; }
    }
    if (opts.include_swim) {
      try { (detail as any).swim_data = typeof row.swim_data === 'string' ? JSON.parse(row.swim_data) : (row.swim_data || null); } catch { (detail as any).swim_data = row.swim_data || null; }
      (detail as any).number_of_active_lengths = row.number_of_active_lengths ?? null;
      (detail as any).pool_length = row.pool_length ?? null;
    }

    return new Response(JSON.stringify({ workout: detail }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


