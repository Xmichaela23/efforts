/**
 * Tests for the EFFICIENCY and CLIMBING cycling analysis_details rows.
 * Source data: computed.analysis.efficiency / computed.analysis.climbing
 * (written by _shared/cycling-v1/ride-physiology.ts).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/cycling-rows.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatCyclingClimbingRow, formatCyclingEfficiencyRow } from './build.ts';

// ── EFFICIENCY ──────────────────────────────────────────────────────────────

// D-062 / Q-010: the EFFICIENCY row is plain-language ("Watts per heartbeat … · HR drift …%"), NOT the
// old jargon ("EF … · …% HR decoupling"). This test drifted from that shipped change; realigned 2026-07-12.
Deno.test('efficiency: both values finite → "Watts per heartbeat {ef} · HR drift {dec}%"', () => {
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }),
    { label: 'EFFICIENCY', value: 'Watts per heartbeat 1.62 · HR drift 4.3%' },
  );
  // 0% decoupling is finite → still renders
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.7, aerobic_decoupling_pct: 0 }),
    { label: 'EFFICIENCY', value: 'Watts per heartbeat 1.7 · HR drift 0%' },
  );
});

Deno.test('efficiency: decoupling absent (short/interval ride) → null (gate: both finite)', () => {
  assertEquals(formatCyclingEfficiencyRow({ efficiency_factor: 1.62 }), null);
  assertEquals(formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: null }), null);
});

Deno.test('efficiency: missing EF → null; null/non-object → null', () => {
  assertEquals(formatCyclingEfficiencyRow({ aerobic_decoupling_pct: 4.3 }), null);
  assertEquals(formatCyclingEfficiencyRow(null), null);
  assertEquals(formatCyclingEfficiencyRow(undefined), null);
  assertEquals(formatCyclingEfficiencyRow('x'), null);
});

// ── CLIMBING ────────────────────────────────────────────────────────────────

Deno.test('climbing: VAM > 0 with ascent → "VAM {vam} m/h · {ascent}m gain"', () => {
  assertEquals(
    formatCyclingClimbingRow({ vam_m_per_h: 1180, climb_ascent_m: 240 }),
    { label: 'CLIMBING', value: 'VAM 1180 m/h · 240m gain' },
  );
});

Deno.test('climbing: rounds vam and ascent', () => {
  assertEquals(
    formatCyclingClimbingRow({ vam_m_per_h: 1179.6, climb_ascent_m: 239.4 }),
    { label: 'CLIMBING', value: 'VAM 1180 m/h · 239m gain' },
  );
});

Deno.test('climbing: ascent absent/non-finite → VAM only (no gain segment)', () => {
  assertEquals(
    formatCyclingClimbingRow({ vam_m_per_h: 900 }),
    { label: 'CLIMBING', value: 'VAM 900 m/h' },
  );
});

Deno.test('climbing: VAM 0 / negative / non-finite / null → null (flat rides)', () => {
  assertEquals(formatCyclingClimbingRow({ vam_m_per_h: 0, climb_ascent_m: 5 }), null);
  assertEquals(formatCyclingClimbingRow({ vam_m_per_h: -10 }), null);
  assertEquals(formatCyclingClimbingRow({ climb_ascent_m: 240 }), null);
  assertEquals(formatCyclingClimbingRow(null), null);
  assertEquals(formatCyclingClimbingRow(undefined), null);
});
