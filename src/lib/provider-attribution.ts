/**
 * ═══ PROVIDER ATTRIBUTION — THE ONE READER ═══════════════════════════════════════════════════════
 *
 * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md. Lifted out of `TodaysEffort.tsx` (where it
 * lived as a closure since the pill row) so Today's done card, the Week tab, the drawer and the
 * derived-data footers all ask ONE function where a row came from. Nothing here renders; the words
 * and the colours are `src/components/ProviderAttribution.tsx`'s.
 *
 * ⛔ WHY THE ROW SHAPE IS MESSY: `get-week` emits `source` / `is_strava_imported` (the drawer's
 * fields); the app-context rows carry `provider`, `strava_data` / `garmin_data` and the id prefixes
 * (the old pill row's fields). Both shapes reach the same screens, so this reader accepts both.
 *
 * Garmin API Brand Guidelines v6.30.2025: every dashboard, activity feed, overview card or summary
 * view carrying Garmin device-sourced data shows "Garmin [device model]"; device unknown → "Garmin".
 * developers.strava.com/guidelines: a Garmin-sourced activity that arrives through Strava is still
 * attributed to Garmin per Garmin's guidelines (Strava's community notice on Garmin attribution).
 */

export type ProviderSource = 'strava' | 'garmin' | null;

export type ProviderAttribution = {
  source: ProviderSource;
  /** The device model with any leading "Garmin " stripped — "Edge 540", "ELEMNT ROAM". */
  deviceName?: string;
  /** True when the device that recorded the row is a Garmin, whichever provider delivered it. */
  deviceIsGarmin: boolean;
};

/**
 * The Garmin device families (work order §5). Garmin's own device-name list is not in the repo, so
 * a name that starts with the word Garmin OR with one of these families is a Garmin device. Accents
 * are folded first: Garmin writes "fēnix" and "vívoactive", Strava's `device_name` may not.
 */
const GARMIN_FAMILIES = ['forerunner', 'fenix', 'edge', 'venu', 'instinct', 'epix', 'enduro', 'vivoactive'] as const;

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function isGarminDeviceName(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const name = fold(raw);
  if (/^garmin\b/.test(name)) return true;
  return GARMIN_FAMILIES.some((f) => name === f || name.startsWith(`${f} `) || name.startsWith(`${f}-`));
}

function readDeviceInfo(w: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  try {
    const di = (w as { device_info?: unknown })?.device_info ?? (w as { deviceInfo?: unknown })?.deviceInfo;
    if (typeof di === 'string') return JSON.parse(di);
    return di && typeof di === 'object' ? (di as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Provider + device for a row. `source: null` for a manual or planned row. */
export function getProviderAttribution(w: unknown): ProviderAttribution {
  try {
    const row = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    const provider = String(row.provider ?? '').toLowerCase();
    // `source` is the drawer's field (get-week's `w.source`); only its two provider values count.
    const source = String(row.source ?? '').toLowerCase();
    const id = String(row.id ?? '');
    const isStravaImported =
      provider === 'strava' || source === 'strava' || !!row.is_strava_imported ||
      !!row.strava_data || !!row.strava_activity_id || id.startsWith('strava_');
    const isGarminImported =
      provider === 'garmin' || source === 'garmin' ||
      !!row.garmin_data || !!row.garmin_activity_id || id.startsWith('garmin_');

    const di = readDeviceInfo(row);
    const rawDeviceName = di?.device_name ?? di?.deviceName ?? di?.product ?? di?.name ?? di?.model;
    const rawName = typeof rawDeviceName === 'string' ? rawDeviceName.trim() : '';
    const deviceName = rawName ? rawName.replace(/^Garmin\s+/i, '') : undefined;
    const deviceIsGarmin = isGarminDeviceName(rawName);

    if (isStravaImported) return { source: 'strava', deviceName, deviceIsGarmin };
    if (isGarminImported) return { source: 'garmin', deviceName, deviceIsGarmin: true };
    return { source: null, deviceIsGarmin: false };
  } catch {
    return { source: null, deviceIsGarmin: false };
  }
}

/**
 * The Garmin attribution text, or null when the row carries no Garmin device data.
 *   Garmin row               → "Garmin Edge 540" / "Garmin"
 *   Strava row, Garmin device → "Garmin Edge 540 via Strava"
 *   Strava row, other device  → null (the Powered by Strava mark is the attribution)
 */
export function garminAttributionText(a: ProviderAttribution): string | null {
  if (a.source === 'garmin') return a.deviceName ? `Garmin ${a.deviceName}` : 'Garmin';
  if (a.source === 'strava' && a.deviceIsGarmin) return `Garmin ${a.deviceName} via Strava`;
  return null;
}

/** True when the row's numbers came off a Garmin device, by either provider. */
export function isGarminSourced(w: unknown): boolean {
  return garminAttributionText(getProviderAttribution(w)) != null;
}

/**
 * ⛔ THE WEEK'S DISTINCT GARMIN DEVICES, FOR ONE HEADER LINE (2026-09-09).
 *
 * Garmin API Brand Guidelines v6.30.2025 permit a GLOBAL attribution — "such as in a header or
 * footer" — for a multi-entry display, as an alternative to attributing every entry. The Week tab is
 * that display: seven rows of one-line sessions, where a per-row "Garmin Forerunner 965" after every
 * set of numbers doubled the width of the line it sat on and left no room for the session's own name.
 * One line above the rows names every device the week's data came off, which is the same claim made
 * once instead of nine times.
 *
 * ⚠️ NO STRAVA MARK IN THIS LIST. It is a list of DEVICES; a Garmin watch whose data arrived through
 * Strava is still that watch, and it contributes `Garmin [model]` here. Strava's own attribution
 * belongs on the per-entry line that still exists on Today's done card, which is a summary card and
 * not a multi-entry display.
 *
 * ⚠️ DISTINCT, AND IN THE ORDER THE WEEK MET THEM — a rider who used one head unit all week gets one
 * name, not five copies of it.
 */
export function garminDevicesForWeek(rows: ReadonlyArray<unknown>): string[] {
  const seen: string[] = [];
  for (const row of rows ?? []) {
    const a = getProviderAttribution(row);
    const isGarminData = a.source === 'garmin' || (a.source === 'strava' && a.deviceIsGarmin);
    if (!isGarminData) continue;
    // "Garmin [device model]", or "Garmin" alone when the model never arrived — the guidelines'
    // own fallback, and the same one `garminAttributionText` applies per row.
    const label = a.deviceName ? `Garmin ${a.deviceName}` : 'Garmin';
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
}
