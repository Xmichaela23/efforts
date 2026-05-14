/**
 * Run: deno test src/lib/resolve-current-ftp.test.ts --no-check
 *
 * Tests the FTP precedence rule. Decision: 3-tier with explicit `'learned-low'` source so
 * quality-gated consumers can opt out of low-confidence values while permissive consumers
 * accept the best-available value. See `src/lib/resolve-current-ftp.ts` header for full
 * precedence semantics.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentFtp } from './resolve-current-ftp.ts';

Deno.test('resolveCurrentFtp — learned >= medium wins over manual', () => {
  const result = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 265, confidence: 'medium' },
    },
    performance_numbers: { ftp: 250 },
  });
  assertEquals(result, { value: 265, source: 'learned' });
});

Deno.test('resolveCurrentFtp — learned high wins over manual', () => {
  const result = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 280, confidence: 'high' },
    },
    performance_numbers: { ftp: 250 },
  });
  assertEquals(result, { value: 280, source: 'learned' });
});

Deno.test('resolveCurrentFtp — learned < medium falls back to manual when manual present', () => {
  const result = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 270, confidence: 'low' },
    },
    performance_numbers: { ftp: 250 },
  });
  assertEquals(result, { value: 250, source: 'manual' });
});

Deno.test('resolveCurrentFtp — both null returns null with source null', () => {
  const result = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: null },
    performance_numbers: { ftp: null },
  });
  assertEquals(result, { value: null, source: null });
});

Deno.test('resolveCurrentFtp — learned-low source when learned present and no manual', () => {
  // Per user decision 2026-05-13: low-confidence learned + no manual → return learned
  // with explicit `'learned-low'` source so consumers can choose whether to accept it.
  // Better than `null` for permissive consumers (display, workload computation, device
  // sync); quality-gated consumers (race projections, fitness inference, materialize-plan)
  // check `source !== 'learned-low'` to opt out.
  const result = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 220, confidence: 'low' },
    },
    performance_numbers: { ftp: null },
  });
  assertEquals(result, { value: 220, source: 'learned-low' });
});

Deno.test('resolveCurrentFtp — null baselines input returns null', () => {
  assertEquals(resolveCurrentFtp(null), { value: null, source: null });
  assertEquals(resolveCurrentFtp(undefined), { value: null, source: null });
  assertEquals(resolveCurrentFtp({}), { value: null, source: null });
});

Deno.test('resolveCurrentFtp — invalid values (zero, negative, non-numeric) ignored', () => {
  // Manual ftp = 0 should be treated as missing, not as a real reading.
  const zero = resolveCurrentFtp({ performance_numbers: { ftp: 0 } });
  assertEquals(zero, { value: null, source: null });

  // Negative learned value (impossible but defensive) is ignored.
  const negative = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: -10, confidence: 'high' } },
  });
  assertEquals(negative, { value: null, source: null });

  // String coercion (`performance_numbers` may be persisted as a string in some paths).
  const stringy = resolveCurrentFtp({ performance_numbers: { ftp: '245' as unknown as number } });
  assertEquals(stringy, { value: 245, source: 'manual' });
});

Deno.test('resolveCurrentFtp — only learned_fitness key present (no performance_numbers)', () => {
  // Common at the AthleticRecordPage call site where the two are read separately and
  // some baselines blobs only carry one or the other.
  const result = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 290, confidence: 'high' },
    },
  });
  assertEquals(result, { value: 290, source: 'learned' });
});
