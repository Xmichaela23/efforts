/**
 * Snapshot freshness — the F3 version guard's value + a mirror of its comparison.
 * See docs/AUDIT-fanout-ordering-2026-07-17.md.
 *
 * THE SINGLE DEFINITION of a snapshot's freshness token lives here (deriveSnapshotWatermark).
 * compute-snapshot stamps it into `athlete_snapshot.input_watermark`; nothing else defines it.
 *
 * The AUTHORITATIVE comparison is the DB trigger `trg_guard_snapshot_watermark`
 * (migration 20260717) — it enforces the guard for every writer, row-locked and race-proof.
 * `snapshotWriteAllowed` below MIRRORS that trigger's logic so the intended semantics can be
 * fixtured and locked; it is not the enforcement point. If you change one, change both.
 */

/**
 * "Fresher" == inputs assembled later. An orchestrator that owns the fan-out ordering passes
 * `source_watermark` captured right AFTER its analyze step, so a post-analyze snapshot outranks a
 * one-behind one. A direct caller (recompute UI, coach) passes none and defaults to now() — it
 * always wins over anything older; ties are idempotent. Garbage input falls back to now() (never
 * a spurious epoch that would let a real write lose).
 */
export function deriveSnapshotWatermark(body: any, now: () => Date = () => new Date()): string {
  const raw = body?.source_watermark;
  if (raw != null) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return now().toISOString();
}

/**
 * Mirror of trg_guard_snapshot_watermark: refuse an UPDATE whose inputs are OLDER than the stored
 * row's. A null on either side allows the write (a legacy row with no watermark must not be frozen;
 * a caller with no watermark defaults to now() upstream and wins). Equal watermarks allow (idempotent).
 */
export function snapshotWriteAllowed(
  incomingWatermark: string | null | undefined,
  storedWatermark: string | null | undefined,
): boolean {
  if (incomingWatermark == null || storedWatermark == null) return true;
  const inc = new Date(incomingWatermark).getTime();
  const cur = new Date(storedWatermark).getTime();
  if (!Number.isFinite(inc) || !Number.isFinite(cur)) return true;
  return inc >= cur;
}
