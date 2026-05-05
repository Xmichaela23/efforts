/**
 * Parse schedule-related fields from goals.training_prefs (and Arc/LLM payloads)
 * for generate-combined-plan athlete_state.
 *
 * Convention: 0 = Sunday … 6 = Saturday (matches week-builder long_run_day / rest_days).
 */

const DAY_ALIASES: Record<string, number> = {
  'sun': 0,
  'sunday': 0,
  'mon': 1,
  'monday': 1,
  'tue': 2,
  'tues': 2,
  'tuesday': 2,
  'wed': 3,
  'weds': 3,
  'wednesday': 3,
  'thu': 4,
  'thur': 4,
  'thurs': 4,
  'thursday': 4,
  'fri': 5,
  'friday': 5,
  'sat': 6,
  'saturday': 6,
};

export function parseSunFirstDayIndex(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
    return raw;
  }
  const s = String(raw).trim().toLowerCase().replace(/\.$/, '');
  if (!s) return undefined;
  if (s in DAY_ALIASES) return DAY_ALIASES[s];
  return undefined;
}

function pickDay(obj: Record<string, unknown> | null | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = parseSunFirstDayIndex(obj[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function pickRestDays(obj: Record<string, unknown> | null | undefined): number[] | undefined {
  if (!obj) return undefined;
  const raw = obj.rest_days ?? obj.restDays;
  if (!Array.isArray(raw)) return undefined;
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : parseSunFirstDayIndex(x);
    if (n !== undefined && n >= 0 && n <= 6) out.push(n);
  }
  return out.length > 0 ? [...new Set(out)] : undefined;
}

/** Read `training_prefs.days_per_week` (4–7). */
export function readDaysPerWeekFromPrefs(
  prefs: Record<string, unknown> | null | undefined,
): number | undefined {
  if (!prefs) return undefined;
  const v = prefs.days_per_week ?? prefs.daysPerWeek;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 4 && n <= 7) return n;
  }
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) {
    const n = parseInt(v.trim(), 10);
    if (n >= 4 && n <= 7) return n;
  }
  return undefined;
}

/**
 * When `days_per_week` < 7 and `rest_days` missing or wrong length, pick off days
 * (Sun-first indices) avoiding long run / long ride when set.
 */
export function deriveRestDaysForBudget(
  daysPerWeek: number | undefined,
  existingRestDays: number[] | undefined,
  longRunSunFirst: number | undefined,
  longRideSunFirst: number | undefined,
): number[] {
  const sortU = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
  if (daysPerWeek == null || !Number.isFinite(daysPerWeek)) {
    return sortU(existingRestDays ?? []);
  }
  const n = Math.round(daysPerWeek);
  if (n >= 7) {
    if (existingRestDays?.length) return sortU(existingRestDays);
    return [];
  }
  if (n < 4) return sortU(existingRestDays ?? []);
  const need = 7 - n;
  if (existingRestDays && existingRestDays.length === need) {
    return sortU(existingRestDays);
  }
  const avoid = new Set<number>();
  if (longRunSunFirst != null && longRunSunFirst >= 0 && longRunSunFirst <= 6) {
    avoid.add(longRunSunFirst);
  }
  if (longRideSunFirst != null && longRideSunFirst >= 0 && longRideSunFirst <= 6) {
    avoid.add(longRideSunFirst);
  }
  const order = [1, 4, 2, 5, 3, 0, 6];
  const picked: number[] = [];
  for (const d of order) {
    if (picked.length >= need) break;
    if (!avoid.has(d)) picked.push(d);
  }
  for (let d = 0; d <= 6 && picked.length < need; d++) {
    if (!picked.includes(d)) picked.push(d);
  }
  return sortU(picked.slice(0, need));
}

function pickStrengthProtocol(obj: Record<string, unknown> | null | undefined): string | undefined {
  if (!obj) return undefined;
  const v = obj.strength_protocol ?? obj.strengthProtocol;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

export type StrengthIntentArc = 'support' | 'performance';
/** Tri swim program: 3×/wk focus path vs 2×/wk race-support path (week-builder uses in Step 2+). */
export type SwimIntentArc = 'focus' | 'race';
export type TrainingIntentArc = 'completion' | 'performance' | 'first_race' | 'comeback';

const TITLE_BY_SUN: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

function titleCaseWeekdayFromIndex(idx: number): string {
  return TITLE_BY_SUN[idx] ?? 'Monday';
}

/** Parse `training_prefs.preferred_days` from Arc (long ride/run, quality/easy bike & run, swim[], strength[]). */
export function parsePreferredDaysPatch(
  src: Record<string, unknown> | null | undefined,
): Partial<CombinedSchedulePrefs> {
  if (!src) return {};
  const pd = src.preferred_days ?? src.preferredDays;
  if (!pd || typeof pd !== 'object' || Array.isArray(pd)) return {};
  const o = pd as Record<string, unknown>;
  const patch: Partial<CombinedSchedulePrefs> = {};
  const lrun = parseSunFirstDayIndex(o.long_run ?? o.longRun);
  const lride = parseSunFirstDayIndex(o.long_ride ?? o.longRide);
  if (lrun !== undefined) patch.long_run_day = lrun;
  if (lride !== undefined) patch.long_ride_day = lride;
  const swimRaw = o.swim;
  if (Array.isArray(swimRaw) && swimRaw.length >= 1) {
    const e = parseSunFirstDayIndex(swimRaw[0]);
    const q = parseSunFirstDayIndex(swimRaw[1] ?? swimRaw[0]);
    const t = swimRaw.length >= 3 ? parseSunFirstDayIndex(swimRaw[2]) : undefined;
    if (e !== undefined) patch.swim_easy_day = e;
    if (q !== undefined) patch.swim_quality_day = q;
    if (t !== undefined) patch.swim_third_day = t;
    console.log('[combined-schedule-prefs] swim parse:', {
      raw: swimRaw,
      swim_easy_day: patch.swim_easy_day,
      swim_quality_day: patch.swim_quality_day,
      swim_third_day: patch.swim_third_day,
    });
  }
  const strRaw = o.strength ?? o.strength_days;
  if (Array.isArray(strRaw) && strRaw.length > 0) {
    patch.strength_preferred_days = strRaw.map((x) => {
      const idx = parseSunFirstDayIndex(x);
      return idx !== undefined ? titleCaseWeekdayFromIndex(idx) : String(x).trim();
    }).filter((s) => s.length > 0);
  }
  const qRun = parseSunFirstDayIndex(
    o.quality_run ?? o.qualityRun ?? o.run_quality ?? o.tempo_run ?? o.tempoRun,
  );
  const eRun = parseSunFirstDayIndex(
    o.easy_run ?? o.easyRun ?? o.run_easy ?? o.mid_week_easy_run ?? o.midWeekEasyRun ?? o.recovery_run,
  );
  if (qRun !== undefined) patch.run_quality_day = qRun;
  if (eRun !== undefined) patch.run_easy_day = eRun;
  const qBike = parseSunFirstDayIndex(
    o.quality_bike ?? o.qualityBike ?? o.bike_quality ?? o.bikeQuality ?? o.mid_week_quality_bike,
  );
  const eBike = parseSunFirstDayIndex(
    o.easy_bike ?? o.easyBike ?? o.bike_easy ?? o.bikeEasy ?? o.mid_week_easy_bike,
  );
  if (qBike !== undefined) patch.bike_quality_day = qBike;
  if (eBike !== undefined) patch.bike_easy_day = eBike;
  console.log('[combined-schedule-prefs] bike/run parse:', {
    raw: {
      run_quality: o.run_quality,
      quality_run: o.quality_run,
      run_easy: o.run_easy,
      easy_run: o.easy_run,
      bike_quality: o.bike_quality,
      quality_bike: o.quality_bike,
      bike_easy: o.bike_easy,
      easy_bike: o.easy_bike,
    },
    parsed: {
      run_quality_day: patch.run_quality_day,
      run_easy_day: patch.run_easy_day,
      bike_quality_day: patch.bike_quality_day,
      bike_easy_day: patch.bike_easy_day,
    },
  });
  return patch;
}

export interface CombinedSchedulePrefs {
  long_run_day?: number;
  long_ride_day?: number;
  /** Mid-week tempo / threshold / intervals (tri combined template). 0=Sun … 6=Sat */
  run_quality_day?: number;
  /** Mid-week easy aerobic run. 0=Sun … 6=Sat */
  run_easy_day?: number;
  swim_easy_day?: number;
  swim_quality_day?: number;
  /** From `preferred_days.swim[2]`; third slot when `swim_intent === 'focus'`. */
  swim_third_day?: number;
  /** Mid-week bike quality (threshold / tempo / SS). 0=Sun … 6=Sat */
  bike_quality_day?: number;
  /** Route-estimated or user-confirmed group-ride anchor duration in hours. */
  bike_quality_group_ride_hours?: number;
  /** Route-estimated or user-confirmed group-ride anchor duration in minutes. */
  bike_quality_group_ride_minutes?: number;
  /** GPX/route-estimated group-ride anchor duration in hours. */
  bike_quality_route_estimated_hours?: number;
  /** GPX/route-estimated group-ride anchor duration in minutes. */
  bike_quality_route_estimated_minutes?: number;
  /** Mid-week easy aerobic bike add-on. 0=Sun … 6=Sat */
  bike_easy_day?: number;
  /** Arc-level intent used by scheduling exceptions and progression defaults. */
  training_intent?: TrainingIntentArc;
  rest_days?: number[];
  strength_protocol?: string;
  /** From Arc: support = tri accessory loads; performance = compound / progressive overload. */
  strength_intent?: StrengthIntentArc;
  /** Tri swim: focus = higher-volume program; race = maintenance / execute leg (engine Step 2+). */
  swim_intent?: SwimIntentArc;
  /**
   * Where the swim-focus TSS increase is funded from (only meaningful when swim_intent === 'focus').
   * split = 2:1 bike/run reduction; protect_run = all from bike; protect_bike = all from run.
   */
  swim_load_source?: 'split' | 'protect_run' | 'protect_bike';
  /** Weekday titles e.g. Monday — strength sessions prefer these days when set. */
  strength_preferred_days?: string[];
  /**
   * Athlete-recorded choices from the conflict resolution UI, keyed by `conflict_id`.
   * Passed straight through to `generate-combined-plan` `athlete_state` so week-builder
   * can honour them on regeneration.
   */
  conflict_preferences?: Record<string, string>;
}

/** Later sources override earlier ones. */
export function mergeCombinedSchedulePrefs(
  ...sources: Array<Record<string, unknown> | null | undefined>
): CombinedSchedulePrefs {
  const pickFinitePositive = (
    src: Record<string, unknown>,
    keys: string[],
  ): number | undefined => {
    for (const key of keys) {
      const raw = src[key];
      const num =
        typeof raw === 'number'
          ? raw
          : (typeof raw === 'string' && raw.trim().length > 0 ? Number(raw) : NaN);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return undefined;
  };
  const out: CombinedSchedulePrefs = {};
  for (const src of sources) {
    if (!src) continue;
    const lr = pickDay(src, ['long_run_day', 'longRunDay', 'long_run', 'longRun']);
    const lrd = pickDay(src, ['long_ride_day', 'longRideDay', 'long_ride', 'longRide']);
    const se = pickDay(src, ['swim_easy_day', 'swimEasyDay', 'easy_swim_day', 'swim_recovery_day']);
    const sq = pickDay(src, [
      'swim_quality_day',
      'swimQualityDay',
      'quality_swim_day',
      'swim_main_day',
    ]);
    const st = pickDay(src, ['swim_third_day', 'swimThirdDay', 'third_swim_day', 'swimThird']);
    const rd = pickRestDays(src);
    const sp = pickStrengthProtocol(src);
    const siRaw = src.strength_intent ?? src.strengthIntent;
    const si =
      siRaw === 'support' || siRaw === 'performance' ? (siRaw as StrengthIntentArc) : undefined;
    const swimIRaw = src.swim_intent ?? src.swimIntent;
    const swimI =
      swimIRaw === 'focus' || swimIRaw === 'race' ? (swimIRaw as SwimIntentArc) : undefined;
    const swimLSRaw = src.swim_load_source ?? src.swimLoadSource;
    const swimLS: CombinedSchedulePrefs['swim_load_source'] =
      swimLSRaw === 'split' || swimLSRaw === 'protect_run' || swimLSRaw === 'protect_bike'
        ? swimLSRaw
        : undefined;
    const tiRaw = src.training_intent ?? src.trainingIntent;
    const ti =
      tiRaw === 'completion' || tiRaw === 'performance' || tiRaw === 'first_race' || tiRaw === 'comeback'
        ? (tiRaw as TrainingIntentArc)
        : undefined;
    const groupRideHours = pickFinitePositive(src, [
      'bike_quality_group_ride_hours',
      'bikeQualityGroupRideHours',
      'group_ride_duration_hours',
      'groupRideDurationHours',
      'group_ride_estimated_hours',
      'groupRideEstimatedHours',
      'route_estimated_hours',
      'routeEstimatedHours',
    ]);
    const groupRideMinutes = pickFinitePositive(src, [
      'bike_quality_group_ride_minutes',
      'bikeQualityGroupRideMinutes',
      'group_ride_duration_minutes',
      'groupRideDurationMinutes',
      'group_ride_estimated_minutes',
      'groupRideEstimatedMinutes',
      'route_estimated_minutes',
      'routeEstimatedMinutes',
    ]);
    const routeEstimatedHours = pickFinitePositive(src, [
      'bike_quality_route_estimated_hours',
      'bikeQualityRouteEstimatedHours',
      'route_estimated_hours',
      'routeEstimatedHours',
      'group_ride_route_estimated_hours',
      'groupRideRouteEstimatedHours',
    ]);
    const routeEstimatedMinutes = pickFinitePositive(src, [
      'bike_quality_route_estimated_minutes',
      'bikeQualityRouteEstimatedMinutes',
      'route_estimated_minutes',
      'routeEstimatedMinutes',
      'group_ride_route_estimated_minutes',
      'groupRideRouteEstimatedMinutes',
    ]);
    const pdPatch = parsePreferredDaysPatch(src);

    if (lr !== undefined) out.long_run_day = lr;
    if (lrd !== undefined) out.long_ride_day = lrd;
    if (se !== undefined) out.swim_easy_day = se;
    if (sq !== undefined) out.swim_quality_day = sq;
    if (st !== undefined) out.swim_third_day = st;
    if (rd !== undefined) out.rest_days = rd;
    if (sp !== undefined) out.strength_protocol = sp;
    if (si !== undefined) out.strength_intent = si;
    if (swimI !== undefined) out.swim_intent = swimI;
    if (swimLS !== undefined) out.swim_load_source = swimLS;
    if (ti !== undefined) out.training_intent = ti;
    if (pdPatch.long_run_day !== undefined) out.long_run_day = pdPatch.long_run_day;
    if (pdPatch.long_ride_day !== undefined) out.long_ride_day = pdPatch.long_ride_day;
    if (pdPatch.swim_easy_day !== undefined) out.swim_easy_day = pdPatch.swim_easy_day;
    if (pdPatch.swim_quality_day !== undefined) out.swim_quality_day = pdPatch.swim_quality_day;
    if (pdPatch.swim_third_day !== undefined) out.swim_third_day = pdPatch.swim_third_day;
    if (pdPatch.run_quality_day !== undefined) out.run_quality_day = pdPatch.run_quality_day;
    if (pdPatch.run_easy_day !== undefined) out.run_easy_day = pdPatch.run_easy_day;
    if (pdPatch.bike_quality_day !== undefined) out.bike_quality_day = pdPatch.bike_quality_day;
    if (pdPatch.bike_easy_day !== undefined) out.bike_easy_day = pdPatch.bike_easy_day;
    if (groupRideHours !== undefined) out.bike_quality_group_ride_hours = groupRideHours;
    if (groupRideMinutes !== undefined) out.bike_quality_group_ride_minutes = groupRideMinutes;
    if (routeEstimatedHours !== undefined) {
      out.bike_quality_route_estimated_hours = routeEstimatedHours;
    }
    if (routeEstimatedMinutes !== undefined) {
      out.bike_quality_route_estimated_minutes = routeEstimatedMinutes;
    }
    if (pdPatch.strength_preferred_days?.length) {
      out.strength_preferred_days = pdPatch.strength_preferred_days;
    }
    const cpRaw = src.conflict_preferences ?? src.conflictPreferences;
    if (cpRaw && typeof cpRaw === 'object' && !Array.isArray(cpRaw)) {
      out.conflict_preferences = {
        ...(out.conflict_preferences ?? {}),
        ...(cpRaw as Record<string, string>),
      };
    }
  }
  return out;
}
