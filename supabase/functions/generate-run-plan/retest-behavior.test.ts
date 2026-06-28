// Strength Island Phase One — the retest terminal must behave like a rested taper (not a rename).
// Run: ~/.deno/bin/deno test --no-check supabase/functions/generate-run-plan/retest-behavior.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';
import { canonicalizePhaseName, isRestedTerminal, protocolPhaseName } from '../_shared/periodization/index.ts';

const baseParams = {
  distance: 'half', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 12, days_per_week: '4-5', user_id: 'test',
} as const;

function sessionsByWeek(terminalShape: 'taper' | 'retest') {
  const g = new SustainableGenerator({ ...baseParams, terminalShape } as never);
  const plan = (g as unknown as { generatePlan(): { sessions_by_week: Record<string, Array<{ tags?: string[] }>> } }).generatePlan();
  return plan.sessions_by_week;
}
const lastWeek = (sbw: Record<string, Array<{ tags?: string[] }>>) =>
  sbw[Object.keys(sbw).sort((a, b) => +a - +b).pop()!] ?? [];
const hasSpeedwork = (sessions: Array<{ tags?: string[] }>) =>
  sessions.some((s) => (s.tags ?? []).some((t) => t === 'strides' || t === 'fartlek'));

// ── the authority ────────────────────────────────────────────────────────────
Deno.test('periodization authority: taper + retest (both cases) are rested terminals; loading phases are not', () => {
  assert(isRestedTerminal(canonicalizePhaseName('Taper')));
  assert(isRestedTerminal(canonicalizePhaseName('Retest')));   // run engine's renamed terminal
  assert(isRestedTerminal(canonicalizePhaseName('retest')));   // combined engine's lowercase enum
  assert(!isRestedTerminal(canonicalizePhaseName('Base')));
  assert(!isRestedTerminal(canonicalizePhaseName('Speed')));
  assert(!isRestedTerminal(canonicalizePhaseName('Build')));
  assert(!isRestedTerminal(canonicalizePhaseName('Race Prep')));
  // protocol bridge: rested terminal → 'Taper' (so the protocols' isTaper fires); else unchanged
  assertEquals(protocolPhaseName(canonicalizePhaseName('Retest'), 'Retest'), 'Taper');
  assertEquals(protocolPhaseName(canonicalizePhaseName('Base'), 'Base'), 'Base');
});

// ── the fix: retest terminal is a real rested week ───────────────────────────
Deno.test('retest terminal week has NO speedwork (real rested week, not a rename)', () => {
  assert(!hasSpeedwork(lastWeek(sessionsByWeek('retest'))), 'retest terminal must not contain strides/fartlek');
});

// ── parity: races unaffected — taper terminal behaves the same (it always suppressed speedwork) ──
Deno.test('race taper terminal also has no speedwork — retest now behaves identically to taper', () => {
  assert(!hasSpeedwork(lastWeek(sessionsByWeek('taper'))), 'taper terminal must not contain speedwork');
});

// ── control: the fix is terminal-only — a build/speed week still gets speedwork ──
Deno.test('control: a mid-block speed week still has speedwork (fix is terminal-only)', () => {
  // duration 12 → Base 1-4, Speed 5-8; week 6 is Speed and not a recovery week
  assert(hasSpeedwork(sessionsByWeek('retest')['6'] ?? []), 'a speed-phase week should still get speedwork');
});
