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

function pickStrengthProtocol(obj: Record<string, unknown> | null | undefined): string | undefined {
  if (!obj) return undefined;
  const v = obj.strength_protocol ?? obj.strengthProtocol;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

export type StrengthIntentArc = 'support' | 'performance';

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

/** Parse `training_prefs.preferred_days` from Arc (object with long_run, long_ride, swim[], strength[]). */
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
    if (e !== undefined) patch.swim_easy_day = e;
    if (q !== undefined) patch.swim_quality_day = q;
  }
  const strRaw = o.strength ?? o.strength_days;
  if (Array.isArray(strRaw) && strRaw.length > 0) {
    patch.strength_preferred_days = strRaw.map((x) => {
      const idx = parseSunFirstDayIndex(x);
      return idx !== undefined ? titleCaseWeekdayFromIndex(idx) : String(x).trim();
    }).filter((s) => s.length > 0);
  }
  return patch;
}

export interface CombinedSchedulePrefs {
  long_run_day?: number;
  long_ride_day?: number;
  swim_easy_day?: number;
  swim_quality_day?: number;
  rest_days?: number[];
  strength_protocol?: string;
  /** From Arc: support = tri accessory loads; performance = compound / progressive overload. */
  strength_intent?: StrengthIntentArc;
  /** Weekday titles e.g. Monday — strength sessions prefer these days when set. */
  strength_preferred_days?: string[];
}

/** Later sources override earlier ones. */
export function mergeCombinedSchedulePrefs(
  ...sources: Array<Record<string, unknown> | null | undefined>
): CombinedSchedulePrefs {
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
    const rd = pickRestDays(src);
    const sp = pickStrengthProtocol(src);
    const siRaw = src.strength_intent ?? src.strengthIntent;
    const si =
      siRaw === 'support' || siRaw === 'performance' ? (siRaw as StrengthIntentArc) : undefined;
    const pdPatch = parsePreferredDaysPatch(src);

    if (lr !== undefined) out.long_run_day = lr;
    if (lrd !== undefined) out.long_ride_day = lrd;
    if (se !== undefined) out.swim_easy_day = se;
    if (sq !== undefined) out.swim_quality_day = sq;
    if (rd !== undefined) out.rest_days = rd;
    if (sp !== undefined) out.strength_protocol = sp;
    if (si !== undefined) out.strength_intent = si;
    if (pdPatch.long_run_day !== undefined) out.long_run_day = pdPatch.long_run_day;
    if (pdPatch.long_ride_day !== undefined) out.long_ride_day = pdPatch.long_ride_day;
    if (pdPatch.swim_easy_day !== undefined) out.swim_easy_day = pdPatch.swim_easy_day;
    if (pdPatch.swim_quality_day !== undefined) out.swim_quality_day = pdPatch.swim_quality_day;
    if (pdPatch.strength_preferred_days?.length) {
      out.strength_preferred_days = pdPatch.strength_preferred_days;
    }
  }
  return out;
}
