// export-data — "Download your data" on the Account screen (docs/WORKORDER-menu-and-export-2026-09-07.md §2).
//
// Called with the athlete's OWN JWT; the id comes from `requireUser` (the verified token), never from the
// body, so the only account this can export is the caller's. Builds one zip in memory, uploads it to the
// private `exports` bucket at `<uid>/efforts-export-<date>.zip` (service role — the client never writes
// there; migration 20260907030000 gives the owner read on their own folder) and returns a signed URL that
// is good for 60 minutes.
//
// Contents, UTF-8 CSV with a header row, plus one JSON:
//   workouts.csv  one row per completed workout (any sport)
//   sets.csv      one row per logged strength set, in the Strong CSV layout — the header below is copied
//                 from a real Strong export (Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,
//                 Distance,Seconds,Notes,Workout Notes,RPE); Hevy's "Import from Strong" reads that file.
//                 Sets live on workouts.strength_exercises[].sets[] — that is what StrengthLogger saves
//                 (src/components/StrengthLogger.tsx, completedWorkout.strength_exercises); exercise_log
//                 holds one derived row per exercise (best set), not the sets, so it is not the source here.
//   plans.csv     one row per planned session, each carrying its plan's name / start / end
//   profile.json  who you are + the numbers on file, each with its source word, + exported_at
// No tokens, no connection rows, no photo.
//
// Housekeeping: there is no scheduled job in this repo (grepped supabase/migrations for cron.schedule —
// none), so objects under <uid>/ older than 24 h are removed here, on the athlete's next export.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BUCKET = 'exports';
const LINK_SECONDS = 60 * 60;          // the sheet says "good for one hour"
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;                      // PostgREST's default max-rows; page so a long history is complete

const KM_PER_MI = 1.609344;
const FT_PER_M = 3.28084;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-authorization',
  } as Record<string, string>;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } });

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────────────
type Cell = string | number | null | undefined | boolean;
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(header: string[], rows: Cell[][]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
const round = (n: unknown, dp = 2): number | null => {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
const num = (n: unknown): number | null => (Number.isFinite(Number(n)) && n !== null && n !== '' ? Number(n) : null);

// ── zip (STORE, no compression — CSV of a few MB is fine uncompressed, and this needs no dependency) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}
function zipStore(files: Array<{ name: string; data: Uint8Array }>, now = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const local = new Uint8Array(30 + name.length + f.data.length);
    local.set(new Uint8Array(lh.buffer), 0); local.set(name, 30); local.set(f.data, 30 + name.length);
    locals.push(local);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    const central = new Uint8Array(46 + name.length);
    central.set(new Uint8Array(ch.buffer), 0); central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const l of locals) { out.set(l, p); p += l.length; }
  for (const c of centrals) { out.set(c, p); p += c.length; }
  out.set(new Uint8Array(eocd.buffer), p);
  return out;
}

// ── data ───────────────────────────────────────────────────────────────────────────────────────────────
async function allRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const WORKOUT_COLS = [
  'id', 'name', 'type', 'date', 'timestamp', 'duration', 'moving_time', 'distance', 'avg_heart_rate', 'max_heart_rate',
  'avg_power', 'normalized_power', 'avg_pace', 'elevation_gain', 'workload_actual', 'source', 'is_strava_imported',
  'strava_activity_id', 'garmin_activity_id', 'healthkit_id', 'workout_status', 'workout_metadata', 'description',
  'strength_exercises', 'rpe',
].join(',');

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** garmin / strava / healthkit / manual — the four words the work order names. */
function sourceWord(w: Row): string {
  const s = String(w.source || '').toLowerCase();
  if (s === 'garmin' || w.garmin_activity_id) return 'garmin';
  if (s === 'strava' || w.is_strava_imported || w.strava_activity_id) return 'strava';
  if (s === 'healthkit' || w.healthkit_id) return 'healthkit';
  return 'manual';
}
const notesOf = (w: Row): string => {
  const m = w.workout_metadata;
  const n = m && typeof m === 'object' ? m.notes : null;
  return typeof n === 'string' ? n : '';
};
/** Strong writes "1h 5m" / "45m" in its Duration column. */
function strongDuration(min: unknown): string {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}
/** Strong's Date is "YYYY-MM-DD HH:MM:SS" (local). The row's date + the clock from `timestamp` when there is one. */
function strongDate(w: Row): string {
  const day = String(w.date || '').slice(0, 10);
  let clock = '12:00:00';
  if (w.timestamp) {
    const t = new Date(w.timestamp);
    if (!Number.isNaN(t.getTime())) clock = t.toISOString().slice(11, 19);
  }
  return `${day} ${clock}`;
}
function parseExercises(raw: unknown): Row[] {
  if (Array.isArray(raw)) return raw as Row[];
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
/** A set counts as logged when the logger marked it completed, or (legacy rows without the flag) it carries a number. */
function isLogged(s: Row): boolean {
  if (s.completed === true) return true;
  if (s.completed === false) return false;
  return (Number(s.reps) > 0) || (Number(s.weight) > 0) || (Number(s.duration_seconds) > 0);
}

function workoutsCsv(rows: Row[]): string {
  const header = ['date', 'sport', 'name', 'duration_min', 'distance_mi', 'distance_km', 'avg_hr', 'max_hr', 'avg_power',
    'normalized_power', 'avg_pace_min_per_mi', 'elevation_ft', 'load', 'source', 'notes'];
  const out = rows.map((w) => {
    const km = num(w.distance);
    const paceSecPerKm = num(w.avg_pace);
    const elevM = num(w.elevation_gain);
    return [
      String(w.date || '').slice(0, 10), w.type ?? '', w.name ?? '', round(w.duration, 0),
      km != null ? round(km / KM_PER_MI, 2) : null, km != null ? round(km, 2) : null,
      num(w.avg_heart_rate), num(w.max_heart_rate), num(w.avg_power), num(w.normalized_power),
      paceSecPerKm != null && paceSecPerKm > 0 ? round((paceSecPerKm * KM_PER_MI) / 60, 2) : null,
      elevM != null ? round(elevM * FT_PER_M, 0) : null,
      num(w.workload_actual), sourceWord(w), notesOf(w),
    ];
  });
  return csv(header, out);
}

function setsCsv(rows: Row[]): { text: string; count: number } {
  // Copied from a real Strong export; Hevy imports this layout.
  const header = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'];
  const out: Cell[][] = [];
  for (const w of rows) {
    const exercises = parseExercises(w.strength_exercises);
    if (exercises.length === 0) continue;
    const date = strongDate(w), name = w.name ?? '', dur = strongDuration(w.duration), wnotes = notesOf(w);
    for (const ex of exercises) {
      const sets = Array.isArray(ex.sets) ? ex.sets : Array.isArray(ex.completed_sets) ? ex.completed_sets : [];
      let order = 0;
      for (const s of sets as Row[]) {
        if (!isLogged(s)) continue;
        order += 1;
        const weight = num(s.weight);
        const band = typeof s.resistance_level === 'string' && s.resistance_level.trim() ? `band ${s.resistance_level.trim()}` : '';
        const exNotes = [typeof ex.notes === 'string' ? ex.notes : '', band].filter(Boolean).join('; ');
        // RIR is what the logger records; Strong/Hevy carry RPE. RPE = 10 − RIR is the field convention
        // (Hevy, RPE calculators). Auto-filled RIR is a suggestion, not observed effort (D-203) — left blank.
        const rir = num(s.rir);
        const rpe = rir != null && s.rir_autofilled !== true ? Math.max(1, Math.min(10, 10 - rir)) : null;
        out.push([date, name, dur, ex.name ?? '', order, weight ?? 0, num(s.reps) ?? 0, 0, num(s.duration_seconds) ?? 0, exNotes, wnotes, rpe]);
      }
    }
  }
  return { text: csv(header, out), count: out.length };
}

function plansCsv(plans: Row[], planned: Row[]): { text: string; count: number } {
  const header = ['plan', 'start', 'end', 'date', 'sport', 'name', 'minutes', 'done'];
  const byPlan = new Map<string, Row[]>();
  for (const p of planned) {
    const k = String(p.training_plan_id || '');
    if (!byPlan.has(k)) byPlan.set(k, []);
    byPlan.get(k)!.push(p);
  }
  const out: Cell[][] = [];
  for (const plan of plans) {
    const sessions = (byPlan.get(String(plan.id)) ?? []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const cfg = plan.config && typeof plan.config === 'object' ? plan.config : {};
    const start = String(cfg.user_selected_start_date || cfg.start_date || sessions[0]?.date || '').slice(0, 10);
    let end = sessions.length ? String(sessions[sessions.length - 1].date).slice(0, 10) : '';
    if (!end && start && Number(plan.duration_weeks) > 0) {
      const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(plan.duration_weeks) * 7 - 1);
      end = d.toISOString().slice(0, 10);
    }
    if (sessions.length === 0) { out.push([plan.name ?? '', start, end, null, null, null, null, null]); continue; }
    for (const s of sessions) {
      // `duration` defaults to 0 on planned rows that carry seconds instead; a zero is not a length.
      const minutes = Number(s.duration) > 0 ? round(s.duration, 0) : Number(s.total_duration_seconds) > 0 ? round(Number(s.total_duration_seconds) / 60, 0) : null;
      out.push([plan.name ?? '', start, end, String(s.date || '').slice(0, 10), s.type ?? '', s.name ?? '', minutes, s.workout_status === 'completed']);
    }
  }
  return { text: csv(header, out), count: out.length };
}

/** Each number with its source word — the `_source` keys the Profile screen writes, else "entered" (typed by the athlete). */
function profileJson(ub: Row | null, exportedAt: string): string {
  const pn: Row = ub?.performance_numbers && typeof ub.performance_numbers === 'object' ? ub.performance_numbers : {};
  const prof: Row = ub?.profile && typeof ub.profile === 'object' ? ub.profile : {};
  const withSource = (value: unknown, source?: unknown) =>
    value === null || value === undefined || value === '' ? null : { value, source: typeof source === 'string' && source ? source : 'entered' };
  const units = ub?.units === 'metric' ? 'metric' : 'imperial';
  const body = {
    name: prof.name ?? null,
    location: prof.location ?? null,
    birthday: ub?.birthday ?? null,
    units,
    weight_unit: units === 'metric' ? 'kg' : 'lb',   // the unit every set weight in sets.csv is in
    height: ub?.height ?? null,
    weight: ub?.weight ?? null,
    numbers: {
      squat: withSource(pn.squat),
      bench: withSource(pn.bench),
      deadlift: withSource(pn.deadlift),
      overhead_press: withSource(pn.overheadPress1RM),
      ftp: withSource(pn.ftp, pn.ftp_source),
      threshold_pace_min_per_mi: withSource(pn.threshold_pace_min_per_mi, pn.threshold_pace_source),
      threshold_hr: withSource(pn.threshold_heart_rate, pn.lthr_source),
      five_k: withSource(pn.fiveK, pn.fiveK_source),
      easy_pace: withSource(pn.easyPace),
      resting_hr: withSource(pn.restingHeartRate),
    },
    zones: ub?.configured_hr_zones ?? null,
    effort_paces: ub?.effort_paces ? { value: ub.effort_paces, source: ub.effort_paces_source ?? 'calculated' } : null,
    exported_at: exportedAt,
  };
  return JSON.stringify(body, null, 2) + '\n';
}

async function ensureBucket(): Promise<void> {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 52428800, allowedMimeTypes: ['application/zip'] });
  if (error && !/already exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`);
}

/** Objects under <uid>/ older than a day go; the link they backed expired 23 hours ago. */
async function sweepOld(uid: string, now: number): Promise<number> {
  const { data: objects } = await admin.storage.from(BUCKET).list(uid, { limit: 1000 });
  const stale = (objects ?? [])
    .filter((o) => o.name && o.created_at && now - new Date(o.created_at).getTime() > SWEEP_AFTER_MS)
    .map((o) => `${uid}/${o.name}`);
  if (stale.length === 0) return 0;
  const { error } = await admin.storage.from(BUCKET).remove(stale);
  return error ? 0 : stale.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let userId: string;
  try {
    ({ userId } = await requireUser(req));
  } catch (e) {
    return json({ error: `${e}` }, (e as { status?: number })?.status ?? 401);
  }

  try {
    const now = new Date();
    const exportedAt = now.toISOString();

    const [workouts, plans, planned, baselines] = await Promise.all([
      allRows<Row>((from, to) => admin.from('workouts').select(WORKOUT_COLS).eq('user_id', userId)
        .or('workout_status.eq.completed,workout_status.is.null').order('date', { ascending: true }).order('id', { ascending: true }).range(from, to)),
      allRows<Row>((from, to) => admin.from('plans').select('id,name,duration_weeks,config,status,created_at').eq('user_id', userId)
        .order('created_at', { ascending: true }).range(from, to)),
      allRows<Row>((from, to) => admin.from('planned_workouts').select('training_plan_id,date,type,name,duration,total_duration_seconds,workout_status')
        .eq('user_id', userId).order('date', { ascending: true }).range(from, to)),
      admin.from('user_baselines').select('units,birthday,height,weight,performance_numbers,profile,configured_hr_zones,effort_paces,effort_paces_source')
        .eq('user_id', userId).maybeSingle().then(({ data, error }) => { if (error) throw new Error(error.message); return data as Row | null; }),
    ]);

    const sets = setsCsv(workouts);
    const planRows = plansCsv(plans, planned);
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: 'workouts.csv', data: enc.encode(workoutsCsv(workouts)) },
      { name: 'sets.csv', data: enc.encode(sets.text) },
      { name: 'plans.csv', data: enc.encode(planRows.text) },
      { name: 'profile.json', data: enc.encode(profileJson(baselines, exportedAt)) },
    ], now);

    await ensureBucket();
    const swept = await sweepOld(userId, now.getTime());
    const filename = `efforts-export-${exportedAt.slice(0, 10)}.zip`;
    const path = `${userId}/${filename}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, zip, { contentType: 'application/zip', upsert: true });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS, { download: filename });
    if (signErr || !signed?.signedUrl) throw new Error(`sign: ${signErr?.message ?? 'no url'}`);

    const counts = { workouts: workouts.length, sets: sets.count, plans: plans.length, planned_sessions: planRows.count };
    console.log(JSON.stringify({ event: 'export_built', user_id: userId, bytes: zip.length, counts, swept }));
    return json({ url: signed.signedUrl, filename, expires_in: LINK_SECONDS, counts });
  } catch (e) {
    console.error(JSON.stringify({ event: 'export_failed', user_id: userId, error: `${e}` }));
    return json({ error: `${e}` }, 500);
  }
});
