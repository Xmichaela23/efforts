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

// D-062 / Q-010: the EFFICIENCY row is plain-language ("Watts per heartbeat …"), NOT the old jargon
// ("EF … · …% HR decoupling"). This test drifted from that shipped change; realigned 2026-07-12.
//
// ⛔ DRIFT LEFT THIS ROW 2026-08-02. It used to ride along as "· HR drift 4.3%" — the bike burying its
// durability read inside an efficiency figure while the RUN gave the same idea a row of its own. It now
// has its own "Heart rate" row on both sports. `aerobic_decoupling_pct` is STILL REQUIRED here as an
// eligibility signal (a ride without it is not a readable aerobic effort); it is simply not printed.
// ⛔ AND THE ROW IS A COMPARISON, NOT A DEFINITION (2026-09-15, approved copy). It spent its second
// half explaining what the number is and which way is good; it now says what it is against the rider's
// own recent rides. With no trend to read, the number alone.
Deno.test('efficiency: both values finite → "Watts per heartbeat {ef}", drift NOT printed here', () => {
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }),
    { label: 'EFFICIENCY', value: 'Watts per heartbeat 1.62.' },
  );
  // 0% decoupling is finite → still renders (Number(null) trap: 0 is a value, absent is not)
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.7, aerobic_decoupling_pct: 0 }),
    { label: 'EFFICIENCY', value: 'Watts per heartbeat 1.70.' },
  );
});

Deno.test('efficiency: the rider\'s own recent average is the second sentence', () => {
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.42, aerobic_decoupling_pct: 3.1 }, { recentEf: 1.384 }),
    { label: 'EFFICIENCY', value: 'Watts per heartbeat 1.42. Your average on steady rides over the last four weeks is 1.38.' },
  );
});

/**
 * ⛔ STEADY AEROBIC RIDES ONLY (2026-09-15). The gate is `bike_fitness_v1.counts_toward_trend`, already
 * stamped on every ride; only an explicit `false` withholds the row, so a ride analysed before the field
 * existed still prints one.
 */
Deno.test('efficiency: an interval ride gets no row, however good its numbers are', () => {
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }, { countsTowardTrend: false }),
    null,
  );
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }, { countsTowardTrend: true })?.label,
    'EFFICIENCY',
  );
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }, { countsTowardTrend: null })?.label,
    'EFFICIENCY',
  );
});

/**
 * ⛔ AND THE SECOND GATE, WHICH IS THE ONE THAT ACTUALLY CATCHES AN INTERVAL RIDE (verified on a
 * throwaway account 2026-09-15). p237's anaerobic ride spends over 40 minutes in the aerobic band —
 * a 15-minute warm-up, four 4-minute spins, a 10-minute cool-down — so Garmin's dwell rule passes it
 * and the row appeared on an interval session. `sessionSteadiness` is the ladder that knows the family.
 */
Deno.test('efficiency: a session the steadiness ladder refuses gets no row', () => {
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }, { countsTowardTrend: true, steady: false }),
    null,
  );
  assertEquals(
    formatCyclingEfficiencyRow({ efficiency_factor: 1.62, aerobic_decoupling_pct: 4.3 }, { countsTowardTrend: true, steady: true })?.label,
    'EFFICIENCY',
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
