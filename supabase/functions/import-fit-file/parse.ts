/**
 * ═══ A .FIT FILE BECOMES A WORKOUT HERE, NOT ON THE PHONE (2026-09-10, audit H-D05) ═══════════════
 *
 * ⛔ THE PHONE PARSED THE FILE (`FitFileImporter.tsx`, a parser loaded from a CDN at run time) and sent
 * the summary it built: the sport defaulted to ride, elevation gain was multiplied by 1,000 and loss was
 * not (so loss was stored 1,000x too small), intensity factor was stored as 50 where the analysis stores
 * 0.50, and no samples were sent, so the server could never compute anything from the recording. The
 * phone now uploads the raw file; this module turns it into the same workout shape `save-imported-workout`
 * has always taken, plus the recording itself.
 *
 * WHAT CHANGED IN THE MOVE, on purpose:
 *   · the parser runs in metres and metres per second, so gain and loss need no conversion (the ×1,000
 *     went with the kilometre setting the phone used);
 *   · intensity factor is stored as the decimal the analysis writes (`compute-workout-analysis`);
 *   · `sensor_data.samples[]` and `gps_track[]` are built from the file's records in the Garmin field
 *     names the pipeline reads (`compute-workout-summary` `rowsFromSamples`), so recompute-workout can
 *     compute intervals, drift and the chart lines from the recording.
 * Everything else — the sport words, the summary fields, the device name — is the phone's mapping as it
 * was.
 */
// esm.sh, as the other functions load their npm dependencies (`ingest-phone-workout` takes supabase-js the same way).
import * as fitParserModule from 'https://esm.sh/fit-file-parser@1.9.5';

// deno-lint-ignore no-explicit-any
type Json = any;

/** The library's default export may sit one level down depending on the loader. */
const FitParser: Json = (fitParserModule as Json).default?.default ?? (fitParserModule as Json).default;

export type FitSample = {
  startTimeInSeconds: number;
  timestamp: number;
  timerDurationInSeconds: number;
  heartRate?: number;
  speedMetersPerSecond?: number;
  totalDistanceInMeters?: number;
  elevationInMeters?: number;
  powerInWatts?: number;
  cadence?: number;
  latitudeInDegree?: number;
  longitudeInDegree?: number;
  temperature?: number;
};

export type FitGpsPoint = {
  lat: number;
  lng: number;
  elevation: number | null;
  startTimeInSeconds: number;
  timestamp: number;
};

/** Parse the raw bytes. Rejects with the library's message when the file is not FIT. */
export function parseFitBuffer(buf: Uint8Array | ArrayBuffer): Promise<Json> {
  return new Promise((resolve, reject) => {
    try {
      const parser = new FitParser({
        force: true,
        speedUnit: 'm/s',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        pressureUnit: 'bar',
        elapsedRecordField: true,
        mode: 'both',
      });
      parser.parse(buf, (error: Json, data: Json) => {
        if (error) reject(new Error(`Failed to parse FIT file: ${error?.message || error}`));
        else resolve(data);
      });
    } catch (e) {
      reject(new Error(`Failed to parse FIT file: ${(e as Error)?.message || e}`));
    }
  });
}

/** The phone's sport words, unchanged. */
export function mapFitSportToAppType(sport: string | null | undefined): string {
  if (!sport) return 'ride';
  const s = String(sport).toLowerCase();
  if (s.includes('cycling') || s.includes('biking') || sport === 'cycling') return 'ride';
  if (s.includes('running') || sport === 'running') return 'run';
  if (s.includes('swimming') || sport === 'swimming') return 'swim';
  if (s.includes('strength') || s.includes('training') || s.includes('fitness')) return 'strength';
  return 'ride';
}

const num = (v: Json): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pos = (v: Json): number | null => { const n = num(v); return n != null && n > 0 ? n : null; };
const localDate = (iso: Json): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The file's records as the pipeline's samples and track. Records with no timestamp are skipped. */
export function samplesFromRecords(records: Json[]): { samples: FitSample[]; gps_track: FitGpsPoint[] } {
  const samples: FitSample[] = [];
  const gps_track: FitGpsPoint[] = [];
  let t0: number | null = null;
  for (const r of Array.isArray(records) ? records : []) {
    const ts = r?.timestamp ? new Date(r.timestamp).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    const sec = Math.round(ts / 1000);
    if (t0 == null) t0 = sec;
    const timer = num(r.timer_time) ?? num(r.elapsed_time) ?? (sec - t0);
    const s: FitSample = { startTimeInSeconds: sec, timestamp: sec * 1000, timerDurationInSeconds: timer };
    const hr = pos(r.heart_rate); if (hr != null) s.heartRate = hr;
    const v = num(r.enhanced_speed) ?? num(r.speed); if (v != null && v >= 0) s.speedMetersPerSecond = v;
    const d = num(r.distance); if (d != null && d >= 0) s.totalDistanceInMeters = d;
    const alt = num(r.enhanced_altitude) ?? num(r.altitude); if (alt != null) s.elevationInMeters = alt;
    const p = num(r.power); if (p != null && p >= 0) s.powerInWatts = p;
    const cad = num(r.cadence); if (cad != null && cad >= 0) s.cadence = cad;
    const temp = num(r.temperature); if (temp != null) s.temperature = temp;
    const lat = num(r.position_lat), lng = num(r.position_long);
    if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      s.latitudeInDegree = lat; s.longitudeInDegree = lng;
      gps_track.push({ lat, lng, elevation: alt, startTimeInSeconds: sec, timestamp: sec * 1000 });
    }
    samples.push(s);
  }
  return { samples, gps_track };
}

/**
 * The workout `save-imported-workout` takes, built from the parsed file. Same fields the phone sent,
 * in the same places, plus the recording. Throws when the file holds no activity.
 */
export function workoutFromFit(data: Json, fileName: string): Json {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const records = Array.isArray(data?.records) ? data.records : [];
  // A workout or course file parses cleanly and carries an `activity` block with nothing in it.
  if (sessions.length === 0 && records.length === 0) {
    throw new Error('No activity in this file');
  }
  const s = sessions[0] ?? data?.session ?? {};

  const workoutTimestamp = data?.local_timestamp ?? data?.timestamp ?? s?.start_time ?? records[0]?.timestamp ?? null;
  const workoutDate = localDate(workoutTimestamp) ?? new Date().toISOString().slice(0, 10);

  let sport = 'cycling';
  if (Array.isArray(data?.sports) && data.sports[0]?.sport) sport = data.sports[0].sport;
  else if (s?.sport) sport = s.sport;
  const workoutType = mapFitSportToAppType(sport);

  const { samples, gps_track } = samplesFromRecords(records);
  const lastDistance = samples.length ? samples[samples.length - 1].totalDistanceInMeters ?? null : null;

  // Seconds; the phone rounded the elapsed time first, then the timer time.
  const duration = pos(s.total_elapsed_time) != null ? Math.round(Number(s.total_elapsed_time))
    : pos(s.total_timer_time) != null ? Math.round(Number(s.total_timer_time))
    : samples.length ? Math.round(samples[samples.length - 1].timerDurationInSeconds) : 0;
  // Kilometres, two decimals, as the phone sent it (the parser now runs in metres).
  const distanceM = pos(s.total_distance) ?? (lastDistance != null && lastDistance > 0 ? lastDistance : null);
  const distance = distanceM != null ? Math.round(distanceM / 10) / 100 : null;

  const zones = data?.zones_target ?? {};
  const profile = data?.user_profile ?? {};
  const fileId = Array.isArray(data?.file_ids) ? data.file_ids[0] : data?.file_id;

  // Metres, both. The parser's kilometre setting was why gain needed ×1,000 on the phone; loss missed it.
  const elevationGain = pos(s.total_ascent) ?? pos(s.elevation_gain) ?? pos(s.ascent) ?? pos(s.total_elevation_gain) ?? pos(s.enhanced_ascent);
  const elevationLoss = pos(s.total_descent);

  const metrics = {
    avg_heart_rate: pos(s.avg_heart_rate),
    max_heart_rate: pos(s.max_heart_rate),
    avg_power: pos(s.avg_power),
    max_power: pos(s.max_power),
    normalized_power: pos(s.normalized_power),
    calories: pos(s.total_calories),
    elevation_gain: elevationGain != null ? Math.round(elevationGain) : null,
    elevation_loss: elevationLoss != null ? Math.round(elevationLoss) : null,
    avg_speed: pos(s.enhanced_avg_speed) ?? pos(s.avg_speed),
    max_speed: pos(s.enhanced_max_speed) ?? pos(s.max_speed),
    avg_cadence: pos(s.avg_cadence),
    max_cadence: pos(s.max_cadence),
    training_stress_score: pos(s.training_stress_score),
    // The decimal the analysis stores (0.50), not the phone's 50.
    intensity_factor: pos(s.intensity_factor) != null ? Math.round(Number(s.intensity_factor) * 1000) / 1000 : null,
    avg_temperature: num(s.avg_temperature),
    max_temperature: num(s.max_temperature),
    total_timer_time: pos(s.total_timer_time),
    total_elapsed_time: pos(s.total_elapsed_time),
    total_work: pos(s.total_work),
    total_descent: elevationLoss != null ? Math.round(elevationLoss) : null,
    avg_vam: num(s.avg_vam),
    total_training_effect: pos(s.total_training_effect),
    total_anaerobic_effect: pos(s.total_anaerobic_effect),
    functional_threshold_power: pos(zones.functional_threshold_power),
    threshold_heart_rate: pos(zones.threshold_heart_rate),
    hr_calc_type: zones.hr_calc_type ?? null,
    pwr_calc_type: zones.pwr_calc_type ?? null,
    age: pos(profile.age),
    weight: pos(profile.weight),
    height: pos(profile.height),
    gender: profile.gender ?? null,
    default_max_heart_rate: pos(profile.default_max_heart_rate),
    resting_heart_rate: pos(profile.resting_heart_rate),
    dist_setting: profile.dist_setting ?? null,
    weight_setting: profile.weight_setting ?? null,
    avg_fractional_cadence: num(s.avg_fractional_cadence),
    avg_left_pedal_smoothness: num(s.avg_left_pedal_smoothness),
    avg_left_torque_effectiveness: num(s.avg_left_torque_effectiveness),
    max_fractional_cadence: num(s.max_fractional_cadence),
    left_right_balance: num(s.left_right_balance),
    threshold_power: pos(s.threshold_power),
    total_cycles: pos(s.total_cycles),
  };

  return {
    id: `fit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    name: String(fileName || 'Imported Workout').replace(/\.fit$/i, '').replace(/[_-]/g, ' '),
    type: workoutType,
    date: workoutDate,
    duration,
    distance,
    timestamp: workoutTimestamp,
    start_position_lat: num(s.start_position_lat) ?? (gps_track[0]?.lat ?? null),
    start_position_long: num(s.start_position_long) ?? (gps_track[0]?.lng ?? null),
    friendly_name: profile?.friendly_name ?? data?.device_info?.friendly_name ?? data?.file_creator?.friendly_name ?? fileId?.friendly_name ?? null,
    moving_time: metrics.total_timer_time,
    elapsed_time: metrics.total_elapsed_time,
    metrics,
    deviceInfo: {
      manufacturer: fileId?.manufacturer ?? data?.file_creator?.software_version ?? 'Unknown',
      product: fileId?.product ?? 'FIT Device',
    },
    sensor_data: samples.length ? { samples } : null,
    gps_track: gps_track.length ? gps_track : null,
  };
}
