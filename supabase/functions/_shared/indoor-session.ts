/**
 * ═══ IS THIS SESSION INDOORS? ONE ANSWER, EVERY SURFACE ═════════════════════════════════════════
 *
 * Michael, 2026-09-09: an indoor ride or run shows no weather, no heat and no hills reading, the
 * indoor placeholder instead of a map, and no map-derived columns in the metric strip.
 *
 * ⛔ ONE PREDICATE, BECAUSE THE FAILURE MODE IS DISAGREEMENT. The viewer already asked this question
 * three ways — `hasGPSData` for chart smoothing, `isVirtualActivity` for the placeholder, and a
 * `venue:` tag read on the server for the heat and hills lines — and a session that is indoors to
 * one of them and outdoors to another is how a trainer ride ends up with a garage temperature
 * printed under a real map. `isVirtualActivity` now delegates here, so every existing caller of it
 * gets this answer too.
 *
 * ⛔ FIVE WAYS TO KNOW, AND THEY ARE NOT EQUAL. The first four are STATEMENTS — the athlete's, or
 * the device's, about what this session was. The fifth is an INFERENCE from the track, and it is
 * last on purpose: a statement beats a guess, and a guess about missing data is the weakest thing
 * this file does.
 */
/**
 * ⛔ THE `venue:` PREFIX IS OWNED HERE NOW, and `src/lib/session-discipline-swap.ts` re-exports it.
 * The machine swap writes the tag and this file reads it; both sides of one literal cannot live in
 * a client file when the server has to read it too.
 */
export const VENUE_PREFIX = 'venue:';

/**
 * ⛔ 100 m. A session that never leaves a circle this size did not travel: it is a trainer in a
 * garage, a treadmill, or a watch that recorded one fix and stopped. ⚠️ OURS — no source gives a
 * figure for "did this activity move". It is chosen against consumer GPS error, which is roughly
 * 5-10 m open-sky and can drift to 30-40 m indoors or between buildings; 100 m clears that with room
 * and is far below the shortest real outdoor session anybody logs.
 */
export const INDOOR_RADIUS_M = 100;

type Rowish = Record<string, unknown> | null | undefined;

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/**
 * The provider's own word for the sport. ⚠️ BOTH SPELLINGS OF EVERY TYPE. Garmin sends
 * `indoor_cycling` and `INDOOR_CYCLING`, Strava sends `VirtualRide`, and older rows carry
 * `indoorcycling` with no separator — matching one spelling is how a treadmill run stayed outdoors.
 */
const INDOOR_SPORT_WORDS = [
  'indoor_cycling', 'indoorcycling', 'indoor cycling',
  'virtual_ride', 'virtualride', 'virtual ride',
  'treadmill_running', 'treadmillrunning', 'treadmill',
  'indoor_running', 'indoorrunning', 'indoor running',
  'virtual_run', 'virtualrun', 'virtual run',
];

function sourceSaysIndoor(w: Rowish): boolean {
  const fields = [lower(w?.provider_sport), lower(w?.activity_type), lower((w as { sport_type?: unknown })?.sport_type)];
  for (const f of fields) {
    if (!f) continue;
    if (f.includes('virtual') || f.includes('treadmill')) return true;
    if (INDOOR_SPORT_WORDS.some((word) => f === word || f.includes(word))) return true;
  }
  return false;
}

/**
 * Strava's own flags. `trainer` is the stationary-trainer bit; `virtual` marks Zwift and its like.
 * ⚠️ BOTH ARE READ — the endurance-swaps work order noted `trainer` was already stored and nothing
 * ever read `virtual`, so a Zwift ride arrived flagged and was treated as an outdoor ride.
 */
function stravaSaysIndoor(w: Rowish): boolean {
  const sd = (w as { strava_data?: unknown })?.strava_data;
  let parsed: Record<string, unknown> | null = null;
  if (typeof sd === 'string') { try { parsed = JSON.parse(sd); } catch { parsed = null; } }
  else if (sd && typeof sd === 'object') parsed = sd as Record<string, unknown>;
  const a = (parsed?.original_activity ?? parsed) as Record<string, unknown> | undefined;
  if (a?.trainer === true || a?.virtual === true) return true;
  // Some rows carry the flags at the top level rather than inside `strava_data`.
  return (w as { trainer?: unknown })?.trainer === true || (w as { virtual?: unknown })?.virtual === true;
}

/** The athlete's own statement: a `venue:` tag, written by the machine swap (p275). */
function venueSaysIndoor(w: Rowish): boolean {
  const raw = (w as { tags?: unknown })?.tags;
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') { try { const p: unknown = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ } }
  return tags.some((t) => lower(t).startsWith(VENUE_PREFIX));
}

/** `[lng, lat]` or `{lat, lng}` — both shapes reach this file, from `gps_track` and from the viewer. */
function pointsOf(w: Rowish): Array<{ lat: number; lng: number }> {
  let raw = (w as { gps_track?: unknown })?.gps_track;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const p of raw as unknown[]) {
    if (Array.isArray(p) && p.length >= 2) {
      const lng = Number(p[0]); const lat = Number(p[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
      continue;
    }
    const o = p as Record<string, unknown> | null;
    const lat = Number(o?.lat ?? o?.latitude ?? o?.latitudeInDegree);
    const lng = Number(o?.lng ?? o?.lon ?? o?.longitude ?? o?.longitudeInDegree);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

/** Metres between two coordinates. Equirectangular — exact enough at the scale of a garage. */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const mLat = (a.lat + b.lat) / 2 * Math.PI / 180;
  const x = dLng * Math.cos(mLat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

/**
 * ⛔ DID THE TRACK GO ANYWHERE? The widest separation between any point and the first, which is a
 * cheap upper bound on the cluster's size and needs no bounding-box maths.
 * ⚠️ RETURNS `null` WHEN THERE IS NO TRACK TO JUDGE — that is "not asked", not "did not move", and
 * the caller must not read it as indoors on its own.
 */
export function trackSpreadM(w: Rowish): number | null {
  const pts = pointsOf(w);
  if (pts.length === 0) return null;
  if (pts.length === 1) return 0;
  let max = 0;
  for (const p of pts) max = Math.max(max, metresBetween(pts[0], p));
  return max;
}

/**
 * ⛔ THE ANSWER. A statement first, the track only after.
 *
 * ⚠️ ABSENT GPS IS NOT EVIDENCE UNLESS THE FIELD IS ACTUALLY ABSENT ON A LOADED ROW. A viewer that
 * has not hydrated `gps_track` yet must not flip a real outdoor ride to indoors for a frame and back
 * again — the placeholder would flash over the map on every open. `undefined` means "not loaded" and
 * is left alone; an explicit empty array on a ride means the ride recorded no positions.
 */
export function isIndoorSession(w: Rowish): boolean {
  if (!w) return false;
  if (sourceSaysIndoor(w)) return true;
  if (stravaSaysIndoor(w)) return true;
  if (venueSaysIndoor(w)) return true;

  const name = lower(w?.name);
  if (name.includes('zwift') || name.includes('watopia') || name.includes('makuri')) return true;

  const type = lower(w?.type);
  const isRideOrRun = type === 'ride' || type === 'bike' || type === 'cycling' || type === 'run' || type === 'walk';
  if (!isRideOrRun) return false;

  const hasStart = (Number.isFinite(Number(w?.start_position_lat)) && Number(w?.start_position_lat) !== 0)
    || (Number.isFinite(Number((w as { starting_latitude?: unknown })?.starting_latitude)) && Number((w as { starting_latitude?: unknown })?.starting_latitude) !== 0);

  const raw = (w as { gps_track?: unknown })?.gps_track;
  // Not loaded. Say nothing rather than guess — see the note above.
  if (raw === undefined || raw === null) return false;

  const spread = trackSpreadM(w);
  // ⛔ A RIDE OR RUN WITH AN EMPTY TRACK IS INDOORS, unless a start fix says otherwise (a GPS that
  // dropped out after locking on is an outdoor session with a broken recording).
  if (spread == null) return !hasStart;
  return spread <= INDOOR_RADIUS_M;
}

export default isIndoorSession;
