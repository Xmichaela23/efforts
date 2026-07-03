/**
 * H4 (Q-107) — RACE header must never fabricate a "0w out" countdown.
 *
 * Run from repo root:
 *   deno test src/lib/race-header.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveRaceHeader } from './race-header.ts';

// ── THE BUG — active plan, marathon distance, no race date/time → must show NO countdown ──────────
Deno.test('no-race: no readiness, goalMeta default 0, no finish time → hasRealRace false, weeksOut null', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: null, goalMetaWeeksOut: 0, hasAnyFinishTime: false });
  assertEquals(r.hasRealRace, false); // → header hides "{dist} — 0w out"; only "Add a race target" shows
  assertEquals(r.weeksOut, null);     // never the ?? 0 placeholder
});

Deno.test('no-race: goalMeta undefined entirely → still no fabricated countdown', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: undefined, goalMetaWeeksOut: undefined, hasAnyFinishTime: false });
  assertEquals(r.hasRealRace, false);
  assertEquals(r.weeksOut, null);
});

// ── REAL RACE — a genuine countdown must render ───────────────────────────────────────────────────
Deno.test('real race via readiness: readinessWeeksOut 8 → weeksOut 8, real', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: 8, goalMetaWeeksOut: 0, hasAnyFinishTime: true });
  assertEquals(r.hasRealRace, true);
  assertEquals(r.weeksOut, 8);
});

Deno.test('real race via dated goalMeta: goalMetaWeeksOut 12 (no readiness) → weeksOut 12, real', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: null, goalMetaWeeksOut: 12, hasAnyFinishTime: false });
  assertEquals(r.hasRealRace, true);
  assertEquals(r.weeksOut, 12);
});

Deno.test('race today via readiness: readinessWeeksOut 0 is a REAL 0 (not the placeholder) → shows 0w out', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: 0, goalMetaWeeksOut: 0, hasAnyFinishTime: true });
  assertEquals(r.hasRealRace, true);
  assertEquals(r.weeksOut, 0); // readiness gave a genuine 0 → "race day" is legitimate
});

// ── goal/projection but no countdown → real race context, distance shows, no fabricated weeks-out ──
Deno.test('finish time but no countdown: hasAnyFinishTime true, no weeks_out → real, weeksOut null (show dist only)', () => {
  const r = resolveRaceHeader({ readinessWeeksOut: null, goalMetaWeeksOut: 0, hasAnyFinishTime: true });
  assertEquals(r.hasRealRace, true);
  assertEquals(r.weeksOut, null); // header shows "{dist}" with no "— Nw out"
});
