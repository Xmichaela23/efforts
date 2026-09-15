/**
 * ⛔ AN UNATTACH STAYS UNATTACHED (2026-09-15, Michael: 14 Sep still showed Execution 62%, "30 of 48 min"
 * and the plan line after Unattach).
 *
 * `detach-planned` clears the link and then runs `recompute-workout`, whose first step is
 * `auto-attach-planned` — which found the same-day planned run and linked it straight back. So the
 * athlete's Unattach is remembered on the workout (`workout_metadata.unattached_planned_ids`), the
 * automatic matcher skips those planned sessions for that workout, and an explicit Attach of one
 * removes it from the list. The same rule as TrainingPeaks' and Garmin Connect's pairing: an unpaired
 * workout is not re-paired automatically.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "unattached-planned" supabase/functions
 */

const KEY = 'unattached_planned_ids';

/** `workout_metadata` can arrive as a JSON string or null. */
export function metadataObject(raw: unknown): Record<string, unknown> {
  let m: unknown = raw;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { m = null; }
  }
  return m && typeof m === 'object' && !Array.isArray(m) ? { ...(m as Record<string, unknown>) } : {};
}

/** The planned session ids the athlete unattached from this workout. */
export function unattachedPlannedIds(rawMetadata: unknown): string[] {
  const list = metadataObject(rawMetadata)[KEY];
  return Array.isArray(list) ? list.map((v) => String(v)).filter(Boolean) : [];
}

/** Metadata with `plannedId` added to the unattached list (no duplicates). */
export function withUnattached(rawMetadata: unknown, plannedId: string): Record<string, unknown> {
  const m = metadataObject(rawMetadata);
  const ids = unattachedPlannedIds(m);
  if (plannedId && !ids.includes(plannedId)) ids.push(plannedId);
  m[KEY] = ids;
  return m;
}

/** Metadata with `plannedId` removed from the unattached list; null when nothing changes. */
export function withoutUnattached(rawMetadata: unknown, plannedId: string): Record<string, unknown> | null {
  const m = metadataObject(rawMetadata);
  const ids = unattachedPlannedIds(m);
  if (!ids.includes(plannedId)) return null;
  const rest = ids.filter((id) => id !== plannedId);
  if (rest.length) m[KEY] = rest;
  else delete m[KEY];
  return m;
}
