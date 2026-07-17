/**
 * Fixtures for the F3 snapshot version guard (fan-out ordering fix, 2026-07-17).
 * Written against the RULINGS, not the code: (2/F3) one freshness definition, and a guard that
 * refuses a STALE write — demonstrated refusing, not only fresh writes succeeding.
 * Run: deno test supabase/functions/compute-snapshot/watermark.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveSnapshotWatermark, snapshotWriteAllowed } from './watermark.ts';

const FIXED = new Date('2026-07-17T12:00:00.000Z');
const fixedNow = () => FIXED;

// ── deriveSnapshotWatermark: THE single definition of "fresher" ───────────────────────────────
Deno.test('watermark: an explicit source_watermark is used verbatim (orchestrator post-analyze stamp)', () => {
  const w = deriveSnapshotWatermark({ source_watermark: '2026-07-17T09:30:00.000Z' }, fixedNow);
  assertEquals(w, '2026-07-17T09:30:00.000Z');
});

Deno.test('watermark: absent source_watermark falls to now() (a direct caller always wins over older)', () => {
  assertEquals(deriveSnapshotWatermark({}, fixedNow), FIXED.toISOString());
  assertEquals(deriveSnapshotWatermark({ source_watermark: null }, fixedNow), FIXED.toISOString());
  assertEquals(deriveSnapshotWatermark(undefined, fixedNow), FIXED.toISOString());
});

Deno.test('watermark: garbage source_watermark falls to now() — never a spurious epoch that would lose', () => {
  assertEquals(deriveSnapshotWatermark({ source_watermark: 'not-a-date' }, fixedNow), FIXED.toISOString());
});

// ── snapshotWriteAllowed: mirror of trg_guard_snapshot_watermark (the DB is the authority) ─────
Deno.test('guard NEGATIVE: a stale write (older inputs) is REFUSED', () => {
  // stored is fresh (post-analyze); incoming is the one-behind trigger → must lose.
  const stored = '2026-07-17T10:00:05.000Z';
  const incomingStale = '2026-07-17T10:00:00.000Z';
  assertEquals(snapshotWriteAllowed(incomingStale, stored), false);
});

Deno.test('guard: a fresh write (newer inputs) is allowed', () => {
  assertEquals(snapshotWriteAllowed('2026-07-17T10:00:05.000Z', '2026-07-17T10:00:00.000Z'), true);
});

Deno.test('guard: equal watermarks allowed (idempotent re-run)', () => {
  const t = '2026-07-17T10:00:00.000Z';
  assertEquals(snapshotWriteAllowed(t, t), true);
});

Deno.test('guard: a null on EITHER side allows — a legacy row is never frozen; a null caller wins upstream', () => {
  assertEquals(snapshotWriteAllowed(null, '2026-07-17T10:00:00.000Z'), true); // legacy incoming
  assertEquals(snapshotWriteAllowed('2026-07-17T10:00:00.000Z', null), true); // legacy stored (pre-migration row)
  assertEquals(snapshotWriteAllowed(null, null), true);
});

Deno.test('guard: unparseable timestamps allow (fail open — never freeze a row on bad data)', () => {
  assertEquals(snapshotWriteAllowed('nonsense', '2026-07-17T10:00:00.000Z'), true);
});
