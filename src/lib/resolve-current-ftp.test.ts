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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LEARNER PROPOSES, THE ATHLETE ACCEPTS (2026-09-04, docs/SPEC-ftp-accept-2026-09-04.md).
// `ride_ftp_accepted` is what the app runs on; `ride_ftp_estimated` is the live measurement.
// Spec acceptance 1: accepted beats estimated; no accepted → estimated, byte-identical; manual beats
// both; learned-low never proposes. Plus the seed's failure mode: a bad accepted must not blank FTP.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { pendingFtpProposal, appliedLearnedFtp, acceptEstimatedFtp } from './resolve-current-ftp.ts';

const accepted = (value: number, from = value) => ({
  value, confidence: 'high', source: 'compound', accepted_at: '2026-09-04T00:00:00Z', accepted_from: from,
});

Deno.test('accept — accepted beats a newer, different estimate', () => {
  const r = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
  });
  assertEquals(r, { value: 167, source: 'learned' });
});

Deno.test('accept — accepted beats the estimate in BOTH directions (estimate below accepted too)', () => {
  const r = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: 160, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
  });
  assertEquals(r, { value: 167, source: 'learned' });
});

Deno.test('accept — accepted still applies when the live estimate has since dropped to low confidence', () => {
  // The athlete said yes to a confident number. A thin week does not un-say it.
  const r = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: 150, confidence: 'low' }, ride_ftp_accepted: accepted(167) },
    performance_numbers: { ftp: 181 },
  });
  assertEquals(r, { value: 167, source: 'learned' });
});

Deno.test('accept — NO accepted value → today\'s behaviour, byte-identical', () => {
  // The regression guard for every athlete the seed has not reached yet.
  assertEquals(
    resolveCurrentFtp({ learned_fitness: { ride_ftp_estimated: { value: 176, confidence: 'high' } }, performance_numbers: { ftp: 181 } }),
    { value: 176, source: 'learned' },
  );
  assertEquals(
    resolveCurrentFtp({ learned_fitness: { ride_ftp_estimated: { value: 176, confidence: 'low' } }, performance_numbers: { ftp: 181 } }),
    { value: 181, source: 'manual' },
  );
  assertEquals(
    resolveCurrentFtp({ learned_fitness: { ride_ftp_estimated: { value: 176, confidence: 'low' } } }),
    { value: 176, source: 'learned-low' },
  );
  assertEquals(
    resolveCurrentFtp({ learned_fitness: { ride_ftp_estimated: { value: 176, confidence: 'high' }, ride_ftp_accepted: null } }),
    { value: 176, source: 'learned' },
  );
});

Deno.test('accept — "my number" beats accepted AND estimated', () => {
  const r = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
    performance_numbers: { ftp: 181, ftp_source: 'manual' },
  });
  assertEquals(r, { value: 181, source: 'manual' });
});

Deno.test('accept — "auto" returns the accepted number, not the live estimate', () => {
  const r = resolveCurrentFtp({
    learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
    performance_numbers: { ftp: 181, ftp_source: 'learned' },
  });
  assertEquals(r, { value: 167, source: 'learned' });
});

Deno.test('accept — a broken accepted value (0 / null / string junk) is ignored, not a blank FTP', () => {
  // The seed step's failure mode from the spec: get it wrong and every athlete's FTP blanks. It must not.
  for (const bad of [0, -5, null, 'x', undefined]) {
    const r = resolveCurrentFtp({
      learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: { value: bad as any } },
    });
    assertEquals(r, { value: 171, source: 'learned' }, `bad accepted value ${String(bad)}`);
  }
  // Accepted with nothing else on file is still honoured (stringy JSONB survives).
  assertEquals(
    resolveCurrentFtp({ learned_fitness: { ride_ftp_accepted: { ...accepted(167), value: '167' as any } } }),
    { value: 167, source: 'learned' },
  );
});

// ── pendingFtpProposal ─────────────────────────────────────────────────────────────────────────
Deno.test('pending — estimate differs from accepted → the proposal', () => {
  const p = pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
  });
  assertEquals(p, { measured: 171, applied: 167, confidence: 'high' });
  const down = pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 160, confidence: 'medium' }, ride_ftp_accepted: accepted(167) },
  });
  assertEquals(down, { measured: 160, applied: 167, confidence: 'medium' });
});

Deno.test('pending — equal (to the watt) → nothing pending', () => {
  assertEquals(pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 167, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
  }), null);
  assertEquals(pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 167.4, confidence: 'high' }, ride_ftp_accepted: accepted(167) },
  }), null);
});

Deno.test('pending — learned-low never proposes', () => {
  assertEquals(pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 190, confidence: 'low' }, ride_ftp_accepted: accepted(167) },
  }), null);
});

Deno.test('pending — no accepted value on file → nothing pending (the estimate already applies)', () => {
  assertEquals(pendingFtpProposal({
    learned_fitness: { ride_ftp_estimated: { value: 171, confidence: 'high' } },
  }), null);
});

Deno.test('pending — "my number" sees no proposal; "my number" with an empty field still does', () => {
  const lf = { ride_ftp_estimated: { value: 171, confidence: 'high' }, ride_ftp_accepted: accepted(167) };
  assertEquals(pendingFtpProposal({ learned_fitness: lf, performance_numbers: { ftp: 181, ftp_source: 'manual' } }), null);
  // Preference with nothing behind it falls through to auto (resolver rule) — so the proposal shows.
  assertEquals(pendingFtpProposal({ learned_fitness: lf, performance_numbers: { ftp_source: 'manual' } }), { measured: 171, applied: 167, confidence: 'high' });
  // "auto" with a typed number on file: the typed number is dormant, the proposal shows.
  assertEquals(pendingFtpProposal({ learned_fitness: lf, performance_numbers: { ftp: 181 } }), { measured: 171, applied: 167, confidence: 'high' });
});

Deno.test('pending — null / empty input', () => {
  assertEquals(pendingFtpProposal(null), null);
  assertEquals(pendingFtpProposal({}), null);
  assertEquals(pendingFtpProposal({ learned_fitness: null }), null);
});

// ── appliedLearnedFtp ──────────────────────────────────────────────────────────────────────────
Deno.test('appliedLearnedFtp — accepted metric when present, else the estimate, else null', () => {
  const est = { value: 171, confidence: 'high' };
  assertEquals(appliedLearnedFtp({ ride_ftp_estimated: est, ride_ftp_accepted: accepted(167) }), accepted(167));
  assertEquals(appliedLearnedFtp({ ride_ftp_estimated: est }), est);
  assertEquals(appliedLearnedFtp({ ride_ftp_estimated: est, ride_ftp_accepted: { value: 0 } as any }), est);
  assertEquals(appliedLearnedFtp(null), null);
  assertEquals(appliedLearnedFtp({}), null);
});

// ── acceptEstimatedFtp — the one write ─────────────────────────────────────────────────────────
Deno.test('accept write — copies the estimate into accepted with the stamp; the estimate is untouched', () => {
  const now = new Date('2026-09-04T10:00:00Z');
  const est = { value: 171, confidence: 'high', source: 'compound', sample_count: 12 };
  const before = { ride_ftp_estimated: est, ride_ftp_accepted: accepted(167), run_easy_pace_sec_per_km: { value: 330 } };
  const after = acceptEstimatedFtp(before, 'baselines', now);
  assertEquals(after, {
    ...before,
    ride_ftp_accepted: { ...est, accepted_at: '2026-09-04T10:00:00.000Z', accepted_from: 171, accepted_via: 'baselines' },
  });
  assertEquals(before.ride_ftp_accepted, accepted(167), 'input not mutated');
  // and the resolver now returns it, nothing pending
  assertEquals(resolveCurrentFtp({ learned_fitness: after as any }), { value: 171, source: 'learned' });
  assertEquals(pendingFtpProposal({ learned_fitness: after as any }), null);
});

Deno.test('accept write — refuses a low-confidence or missing estimate (learned-low never proposes)', () => {
  assertEquals(acceptEstimatedFtp({ ride_ftp_estimated: { value: 190, confidence: 'low' } }, 'checkpoint'), null);
  assertEquals(acceptEstimatedFtp({ ride_ftp_estimated: { value: 0, confidence: 'high' } }, 'checkpoint'), null);
  assertEquals(acceptEstimatedFtp({}, 'checkpoint'), null);
  assertEquals(acceptEstimatedFtp(null, 'checkpoint'), null);
});
