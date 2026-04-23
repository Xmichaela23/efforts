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

function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
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

export interface CombinedSchedulePrefs {
  long_run_day?: number;
  long_ride_day?: number;
  swim_easy_day?: number;
  swim_quality_day?: number;
  rest_days?: number[];
  strength_protocol?: string;
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

    if (lr !== undefined) out.long_run_day = lr;
    if (lrd !== undefined) out.long_ride_day = lrd;
    if (se !== undefined) out.swim_easy_day = se;
    if (sq !== undefined) out.swim_quality_day = sq;
    if (rd !== undefined) out.rest_days = rd;
    if (sp !== undefined) out.strength_protocol = sp;
  }
  return out;
}
