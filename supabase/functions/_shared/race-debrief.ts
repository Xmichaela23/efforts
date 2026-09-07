/**
 * Race-debrief helpers — deterministic only.
 *
 * Course-strategy zone collapse, race-day weather resolution and the suspect-stop mile finder, shared by
 * analyze-running-workout, cycling-goal-race-completion and the marathon adherence digest. The model-written
 * debrief paragraph that used to live here (`generateRaceDebrief`) was deleted with the no-AI work order
 * (2026-09-07); `workout_analysis.race_debrief_text` is now written null.
 *
 * Weather: persisted canonical row is `workouts.weather_data` (get-weather / analysis). Client UI uses the
 * same field names via `src/lib/sessionWeather.ts`. Here, `resolveRaceDebriefWeather` adds `race_courses`
 * snapshot + `avg_temperature` device fallback.
 */

export type RawCourseSegmentRow = {
  segment_order: number;
  start_distance_m: number;
  end_distance_m: number;
  display_group_id?: number | null;
  effort_zone?: string | null;
  display_label?: string | null;
  coaching_cue?: string | null;
  avg_grade_pct?: number | null;
  terrain_type?: string | null;
  target_hr_low?: number | null;
  target_hr_high?: number | null;
};

export type CourseStrategyZoneLine = {
  mileStart: number;
  mileEnd: number;
  effortZone: string | null;
  displayLabel: string | null;
  coachingCue: string | null;
  targetHrLow: number | null;
  targetHrHigh: number | null;
};

const MI = 1609.34;

/** Collapse geometry segments into display groups (same display_group_id) for debrief mile ranges. */
export function collapseCourseSegmentsToZones(segments: RawCourseSegmentRow[]): CourseStrategyZoneLine[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const sorted = [...segments]
    .filter((s) => s != null && typeof s === 'object')
    .sort((a, b) => Number(a.segment_order) - Number(b.segment_order));

  const byGroup = new Map<number, RawCourseSegmentRow[]>();
  for (const s of sorted) {
    const gid = s.display_group_id != null && Number.isFinite(Number(s.display_group_id))
      ? Number(s.display_group_id)
      : Number(s.segment_order);
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(s);
  }

  const zones: CourseStrategyZoneLine[] = [];
  for (const [, segs] of byGroup) {
    if (segs.length === 0) continue;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const startM = Number(first.start_distance_m);
    const endM = Number(last.end_distance_m);
    if (!Number.isFinite(startM) || !Number.isFinite(endM)) continue;
    const mileStart = Math.round((startM / MI) * 10) / 10;
    const mileEnd = Math.round((endM / MI) * 10) / 10;
    zones.push({
      mileStart,
      mileEnd,
      effortZone: first.effort_zone != null ? String(first.effort_zone).trim() : null,
      displayLabel: first.display_label != null ? String(first.display_label).trim() : null,
      coachingCue: first.coaching_cue != null ? String(first.coaching_cue).trim() : null,
      targetHrLow: first.target_hr_low != null ? Number(first.target_hr_low) : null,
      targetHrHigh: first.target_hr_high != null ? Number(first.target_hr_high) : null,
    });
  }
  zones.sort((a, b) => a.mileStart - b.mileStart);
  return zones;
}

function formatCourseStrategyZonesBlock(zones: CourseStrategyZoneLine[] | null | undefined): string {
  if (!zones || zones.length === 0) return 'not available';
  return zones
    .map((z) => {
      const zone = z.effortZone
        ? z.effortZone.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : '—';
      const label = z.displayLabel || 'segment';
      const cue = z.coachingCue ? ` — ${z.coachingCue}` : '';
      const hr =
        z.targetHrLow != null && z.targetHrHigh != null
          ? ` | pre-race HR band ${z.targetHrLow}–${z.targetHrHigh} bpm`
          : '';
      return `Mi ${z.mileStart}–${z.mileEnd}: ${zone} (${label})${cue}${hr}`;
    })
    .join('\n');
}

/** Resolved weather for debrief: prefer race-day activity (workout.weather_data), fall back to race_courses snapshot. */
export type RaceDebriefWeatherResolved = {
  startTempF: number | null;
  finishTempF: number | null;
  humidityPct: number | null;
  conditions: string | null;
  /** Provenance for the LLM fact block—single merge rule. */
  provenance: string;
};

function asNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function meaningfulCondition(c: unknown): string | null {
  if (c == null || typeof c !== 'string') return null;
  const t = c.trim();
  if (!t || t === '—' || t === '-' || t.toLowerCase() === 'unknown') return null;
  return t;
}

/** Parse `workouts.weather_data` (JSON string or object) for merge with course strategy. */
export function parseWorkoutWeatherDataBlob(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      return typeof j === 'object' && j != null ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

/**
 * Single merge rule for race debrief weather:
 * - Per field: prefer `activity` (workout.weather_data from get-weather), then a single representative temp from
 *   `workouts.avg_temperature` (device °C → °F) when Open-Meteo rows are missing, then `race_courses` snapshot.
 * - Activity may expose `temperature` when start/end are absent—used as fallback for both start and finish when needed.
 */
export function resolveRaceDebriefWeather(args: {
  courseStrategy?: {
    start_temp_f?: number | null;
    finish_temp_f?: number | null;
    humidity_pct?: number | null;
    conditions?: string | null;
  } | null;
  activity?: Record<string, unknown> | null;
  /** Garmin / device average temp on the workout row (°C); used only when weather_data has no temps. */
  deviceAvgTempC?: number | null;
}): RaceDebriefWeatherResolved {
  const wd = args.activity;
  const cs = args.courseStrategy;

  const aStart = asNum(wd?.temperature_start_f);
  const aEnd = asNum(wd?.temperature_end_f);
  const aSingle = asNum(wd?.temperature);
  const aHum = asNum(wd?.humidity);
  const aCond = meaningfulCondition(wd?.condition);

  const cStart = asNum(cs?.start_temp_f);
  const cEnd = asNum(cs?.finish_temp_f);
  const cHum = asNum(cs?.humidity_pct);
  const cCond = meaningfulCondition(cs?.conditions);

  const deviceFallbackF = (() => {
    if (aStart != null || aEnd != null || aSingle != null) return null;
    const c = args.deviceAvgTempC;
    if (c == null || !Number.isFinite(c) || c === 0) return null;
    return Math.round((c * 9) / 5 + 32);
  })();

  const effectiveSingle = aSingle ?? deviceFallbackF;

  const startTempF = aStart ?? effectiveSingle ?? cStart ?? null;
  const finishTempF = aEnd ?? effectiveSingle ?? cEnd ?? null;
  const humidityPct = (() => {
    if (aHum != null && Number.isFinite(aHum) && aHum >= 0) return Math.round(aHum);
    if (cHum != null && Number.isFinite(cHum) && cHum >= 0) return Math.round(cHum);
    return null;
  })();
  const conditions = aCond ?? cCond ?? null;

  const startSource: 'activity' | 'device_avg' | 'course' | 'none' =
    aStart != null ? 'activity'
    : aSingle != null ? 'activity'
    : deviceFallbackF != null ? 'device_avg'
    : cStart != null ? 'course'
    : 'none';
  const finishSource: 'activity' | 'device_avg' | 'course' | 'none' =
    aEnd != null ? 'activity'
    : aSingle != null ? 'activity'
    : deviceFallbackF != null ? 'device_avg'
    : cEnd != null ? 'course'
    : 'none';
  const humSource: 'activity' | 'course' | 'none' =
    aHum != null && aHum >= 0 ? 'activity' : cHum != null ? 'course' : 'none';
  const condSource: 'activity' | 'course' | 'none' =
    aCond ? 'activity' : cCond ? 'course' : 'none';

  const provenance =
    `WEATHER MERGE (authoritative): Prefer workout.weather_data (Open-Meteo), then workouts.avg_temperature as °F when no API temps, then race_courses snapshot. ` +
    `Field sources — start: ${startSource}, finish: ${finishSource}, humidity: ${humSource}, conditions: ${condSource}. ` +
    `If any numeric temp or humidity appears in WEATHER below, do not claim weather is missing.`;

  return {
    startTempF,
    finishTempF,
    humidityPct,
    conditions,
    provenance,
  };
}

/** Per-mile pace (sec/mi) + grade (%). Used by the marathon deterministic digest. */
export type SuspectStopSplitInput = {
  mile: number;
  paceSeconds: number;
  grade: number;
};

/**
 * Miles that look like aid/bathroom/etc. slowdowns versus surrounding running pace.
 * Kept permissive on grade so real stops on rolling courses are not silently dropped.
 */
export function collectSuspectStopMiles(splits: SuspectStopSplitInput[]): number[] {
  if (splits.length < 4) return [];
  const sorted = [...splits].sort((a, b) => a.mile - b.mile);
  const flagged = new Set<number>();
  /** ~1.5+ min slower than local running context */
  const THRESH_VS_AVG = 90;
  const THRESH_VS_FAST_NEIGHBOR = 80;
  const THRESH_VS_LOCAL_MEDIAN = 95;
  const MAX_GRADE_ABS = 2.6;

  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (Math.abs(cur.grade) > MAX_GRADE_ABS) continue;
    const neighAvg = (prev.paceSeconds + next.paceSeconds) / 2;
    const fastNeighbor = Math.min(prev.paceSeconds, next.paceSeconds);
    if (cur.paceSeconds - neighAvg >= THRESH_VS_AVG || cur.paceSeconds - fastNeighbor >= THRESH_VS_FAST_NEIGHBOR) {
      flagged.add(cur.mile);
    }
  }

  for (let i = 2; i < sorted.length - 2; i++) {
    const cur = sorted[i];
    if (Math.abs(cur.grade) > MAX_GRADE_ABS) continue;
    const peers = [sorted[i - 2], sorted[i - 1], sorted[i + 1], sorted[i + 2]].map((s) => s.paceSeconds).sort(
      (a, b) => a - b,
    );
    const median = (peers[1] + peers[2]) / 2;
    if (cur.paceSeconds - median >= THRESH_VS_LOCAL_MEDIAN) flagged.add(cur.mile);
  }

  return [...flagged].sort((a, b) => a - b).slice(0, 8);
}
