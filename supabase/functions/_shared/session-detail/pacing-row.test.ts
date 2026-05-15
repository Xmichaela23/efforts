/**
 * Tests for formatCyclingPacingRow — the cycling PACING row (power progression
 * across structured work intervals), the cycling analogue of running's
 * pace-progression Pacing row. Built from the normalized `intervals` array
 * (from granular_analysis.interval_breakdown), work intervals only.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/pacing-row.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatCyclingPacingRow } from './build.ts';

Deno.test('≥2 work intervals → "Work intervals: {first}W → {last}W"', () => {
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'work', executed: { power_watts: 245 } },
      { interval_type: 'work', executed: { power_watts: 280 } },
      { interval_type: 'work', executed: { power_watts: 312 } },
    ]),
    { label: 'Pacing', value: 'Work intervals: 245W → 312W' },
  );
});

Deno.test('non-work intervals ignored; first→last is first/last WORK interval', () => {
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'warmup', executed: { power_watts: 120 } },
      { interval_type: 'work', executed: { power_watts: 250 } },
      { interval_type: 'recovery', executed: { power_watts: 90 } },
      { interval_type: 'work', executed: { power_watts: 300 } },
      { interval_type: 'cooldown', executed: { power_watts: 110 } },
    ]),
    { label: 'Pacing', value: 'Work intervals: 250W → 300W' },
  );
});

Deno.test('fewer than 2 work intervals → null (steady/endurance ride)', () => {
  assertEquals(formatCyclingPacingRow([{ interval_type: 'work', executed: { power_watts: 250 } }]), null);
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'warmup', executed: { power_watts: 120 } },
      { interval_type: 'cooldown', executed: { power_watts: 110 } },
    ]),
    null,
  );
  assertEquals(formatCyclingPacingRow([]), null);
});

Deno.test('work intervals without usable power → null', () => {
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'work', executed: { power_watts: null } },
      { interval_type: 'work', executed: { power_watts: 0 } },
      { interval_type: 'work', executed: {} },
    ]),
    null,
  );
});

Deno.test('intervals lacking power are dropped; needs ≥2 with power', () => {
  // Only one work interval has usable power → < 2 → null
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'work', executed: { power_watts: 250 } },
      { interval_type: 'work', executed: { power_watts: null } },
    ]),
    null,
  );
});

Deno.test('rounds fractional watts; null/non-array input → null', () => {
  assertEquals(
    formatCyclingPacingRow([
      { interval_type: 'work', executed: { power_watts: 245.4 } },
      { interval_type: 'work', executed: { power_watts: 311.6 } },
    ]),
    { label: 'Pacing', value: 'Work intervals: 245W → 312W' },
  );
  assertEquals(formatCyclingPacingRow(null), null);
  assertEquals(formatCyclingPacingRow(undefined), null);
  assertEquals(formatCyclingPacingRow('nope' as any), null);
});
