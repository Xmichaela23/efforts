/**
 * Fixtures for the Canonical Capacity Resolver — AUTO / LOCKED model (2026-09-02, Michael).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/capacity-resolver.test.ts --no-check
 *
 * ⛔ THIS REVERSES D-231 (typed-wins). The new precedence is LOCKED > trusted-LEARNED (auto) > TYPED (seed).
 * The safety the old typed-wins guard protected — a light/deload set silently dropping the number and the
 * coach lying "back off" (Q-107 H1) — is now carried by the TRUST GATE (≥3 samples, ≥medium confidence,
 * fresh) plus upstream slot_intent filtering. The DELOAD-GUARD fixture below is the permanent regression test:
 * an untrusted low learned aggregate must NOT drop the typed number.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveStrengthCapacity,
  canonicalizeLiftKey,
} from './capacity-resolver.ts';

const TODAY = '2026-07-02';
const RECENT = '2026-06-28'; // ~4 days ago — fresh
const OLD = '2026-02-15';    // ~4.5 months ago — stale

// ── AUTO (default): a TRUSTED logged value wins over the typed seed ───────────────────────────────
Deno.test('AUTO: trusted logged bench 125 wins over the typed seed 150 (logs are the source)', () => {
  const res = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150 },
    learnedStrength1rms: { bench_press: { value: 125, confidence: 'high', sample_count: 8, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.value, 125);
  assertEquals(res.source, 'learned');
  assertEquals(res.provisional, false);
});

// ── ⛔ DELOAD GUARD (permanent): an UNTRUSTED low learned set must NOT drop the number ─────────────
Deno.test('DELOAD-GUARD: a thin/low-confidence light set does NOT drop the number (no "back off" lie)', () => {
  const res = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150 },
    // one far-from-failure speed/deload session — low confidence, single sample
    learnedStrength1rms: { bench_press: { value: 115, confidence: 'low', sample_count: 1, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.value, 150);        // stays on the typed seed — the light day cannot drop it
  assertEquals(res.source, 'typed');
});

// ── LOCKED: the athlete set it and turned auto off — it wins over any learned value ────────────────
Deno.test('LOCKED wins over trusted learned, higher or lower', () => {
  const lowerLearned = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150 },
    learnedStrength1rms: { bench_press: { value: 125, confidence: 'high', sample_count: 8, last_logged: RECENT } },
    locked: { bench: 160 },
    asOf: TODAY,
  });
  assertEquals(lowerLearned.value, 160);
  assertEquals(lowerLearned.source, 'locked');

  const higherLearned = resolveStrengthCapacity({
    key: 'deadlift',
    typed: { deadlift: 150 },
    learnedStrength1rms: { deadlift: { value: 225, confidence: 'high', sample_count: 6, last_logged: RECENT } },
    locked: { deadlift: 185 },
    asOf: TODAY,
  });
  assertEquals(higherLearned.value, 185);       // the app does NOT climb past a locked value on its own
  assertEquals(higherLearned.source, 'locked');
  assert(higherLearned.suggestion != null, 'a trusted learned above the locked value surfaces a suggestion');
});

// ── alias fan resolves (kills OHP-into-the-void; D-224 canonicalizer) ─────────────────────────────
Deno.test('alias canonicalization: every OHP/bench/pullup alias maps to one canonical key', () => {
  assertEquals(canonicalizeLiftKey('overhead_press'), 'overheadPress1RM');
  assertEquals(canonicalizeLiftKey('ohp'), 'overheadPress1RM');
  assertEquals(canonicalizeLiftKey('bench_press'), 'bench');
  assertEquals(canonicalizeLiftKey('pull_ups'), 'pullupMaxReps');
  assertEquals(canonicalizeLiftKey('not_a_lift'), null);

  const res = resolveStrengthCapacity({
    key: 'ohp',
    typed: { overheadPress1RM: 105 },
    learnedStrength1rms: { overhead_press: { value: 110, confidence: 'high', sample_count: 9, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.key, 'overheadPress1RM');
  assertEquals(res.value, 110);          // trusted learned wins
  assertEquals(res.source, 'learned');
});

// ── AUTO fills a gap: typed absent, trusted learned present ───────────────────────────────────────
Deno.test('gap-fill: no typed squat → trusted learned is the value (source learned)', () => {
  const res = resolveStrengthCapacity({
    key: 'squat',
    typed: { bench: 150 },
    learnedStrength1rms: { squat: { value: 250, confidence: 'high', sample_count: 5, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.value, 250);
  assertEquals(res.source, 'learned');
});

Deno.test('gap-fill is GATED: an untrusted thin/stale learned aggregate does NOT become truth', () => {
  const res = resolveStrengthCapacity({
    key: 'deadlift',
    typed: {}, // nothing typed
    learnedStrength1rms: { deadlift: { value: 175, confidence: 'low', sample_count: 1, last_logged: OLD } },
    asOf: TODAY,
  });
  assertEquals(res.value, null);
  assertEquals(res.source, 'none');
});

// ── Pull-ups: rep-based, no learned e1RM — always the typed/locked rep count ───────────────────────
Deno.test('pull-ups resolve to the typed rep count (no learned e1RM exists for them)', () => {
  const res = resolveStrengthCapacity({
    key: 'pullupMaxReps',
    typed: { pullupMaxReps: 12 },
    learnedStrength1rms: { bench_press: { value: 125, confidence: 'high', sample_count: 8, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.value, 12);
  assertEquals(res.source, 'typed');
});
