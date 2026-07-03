/**
 * Fixtures for the Canonical Capacity Resolver (D-231).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/capacity-resolver.test.ts --no-check
 *
 * The four fixtures the ship-gate requires (Michael, 2026-07-02):
 *   1. 150-vs-125 bench PRECEDENCE — PERMANENT REGRESSION TEST (do not delete). The plan prescribes
 *      off typed 150; the coach MUST judge off 150, not learned 125. This is the guard on the
 *      "Bench 125→115 · back off" score-that-lies bug (Q-107 H1).
 *   2. captured real snapshot row — representative multi-lift row (SYNTHETIC stand-in; NOT Michael's
 *      data per D-226. Acceptance run substitutes his real row).
 *   3. gap-fill — learned exists, typed absent → learned fills the gap, flagged provisional.
 *   4. stale-typed — typed older than fresh logged evidence → typed STILL wins as the value
 *      (never overridden), typedStale=true, suggestion surfaces.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveStrengthCapacity,
  canonicalizeLiftKey,
} from './capacity-resolver.ts';

const TODAY = '2026-07-02';
const RECENT = '2026-06-28'; // ~4 days ago — fresh
const OLD = '2026-02-15';    // ~4.5 months ago — stale/anchor-predates

// ── Fixture 1 — PERMANENT REGRESSION: typed 150 wins over learned 125 ────────────────────────────
Deno.test('REGRESSION[150-vs-125]: bench resolves to typed 150, NOT learned 125; drift suggested not applied', () => {
  const res = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150, squat: 315, deadlift: 405, overheadPress1RM: 100 },
    learnedStrength1rms: {
      bench_press: { value: 125, confidence: 'high', sample_count: 8, last_logged: RECENT },
    },
    asOf: TODAY,
    typedAsOf: RECENT,
  });

  // THE load-bearing assertion: the canonical answer is the TYPED number. Judge off 150.
  assertEquals(res.value, 150);
  assertEquals(res.source, 'typed');
  assertEquals(res.provisional, false);

  // Learned drift is NOTICED (surfaced as a suggestion) but NEVER silently applied.
  assert(res.suggestion != null, 'a >5% trusted+fresh divergence should surface a suggestion');
  assertEquals(res.suggestion!.baseline, 150);
  assertEquals(res.suggestion!.computed, 125);
  assert(res.suggestion!.divergencePct < 0, 'learned 125 is below typed 150 → negative divergence');
});

// ── Fixture 1b — alias fan resolves (kills OHP-into-the-void; D-224 canonicalizer) ────────────────
Deno.test('alias canonicalization: every OHP/bench/pullup alias maps to one canonical key', () => {
  assertEquals(canonicalizeLiftKey('overhead_press'), 'overheadPress1RM');
  assertEquals(canonicalizeLiftKey('ohp'), 'overheadPress1RM');
  assertEquals(canonicalizeLiftKey('OverheadPress1RM'), 'overheadPress1RM');
  assertEquals(canonicalizeLiftKey('bench_press'), 'bench');
  assertEquals(canonicalizeLiftKey('benchPress'), 'bench');
  assertEquals(canonicalizeLiftKey('pull_ups'), 'pullupMaxReps');
  assertEquals(canonicalizeLiftKey('not_a_lift'), null);

  // An OHP result carried under the learned alias still resolves against the typed canonical key.
  const res = resolveStrengthCapacity({
    key: 'ohp',
    typed: { overheadPress1RM: 105 },
    learnedStrength1rms: { overhead_press: { value: 95, confidence: 'high', sample_count: 5, last_logged: RECENT } },
    asOf: TODAY,
    typedAsOf: RECENT,
  });
  assertEquals(res.key, 'overheadPress1RM');
  assertEquals(res.value, 105);
});

// ── Fixture 2 — representative real snapshot row (SYNTHETIC; not Michael's data, D-226) ────────────
Deno.test('captured-row[representative]: mixed typed/learned row resolves each lift by precedence', () => {
  const typed = { bench: 150, squat: 315, deadlift: 405, overheadPress1RM: 100, pullupMaxReps: 12 };
  const learned = {
    bench_press: { value: 125, confidence: 'high', sample_count: 8, last_logged: RECENT },
    squat: { value: 320, confidence: 'medium', sample_count: 4, last_logged: RECENT }, // ~1.6% — under 5%, no suggestion
    deadlift: { value: 405, confidence: 'high', sample_count: 6, last_logged: RECENT }, // equal — no suggestion
    overhead_press: { value: 100, confidence: 'high', sample_count: 5, last_logged: RECENT },
  };
  const asOf = TODAY, typedAsOf = RECENT;

  const bench = resolveStrengthCapacity({ key: 'bench', typed, learnedStrength1rms: learned, asOf, typedAsOf });
  assertEquals(bench.value, 150);
  assert(bench.suggestion != null); // 125 vs 150 diverges

  const squat = resolveStrengthCapacity({ key: 'squat', typed, learnedStrength1rms: learned, asOf, typedAsOf });
  assertEquals(squat.value, 315);
  assertEquals(squat.suggestion, null); // <5% divergence → no nudge

  const dead = resolveStrengthCapacity({ key: 'deadlift', typed, learnedStrength1rms: learned, asOf, typedAsOf });
  assertEquals(dead.value, 405);
  assertEquals(dead.suggestion, null); // equal → no nudge

  // Pull-ups: rep-based, typed only, no learned e1RM — resolves to the typed rep count, never a suggestion.
  const pull = resolveStrengthCapacity({ key: 'pullupMaxReps', typed, learnedStrength1rms: learned, asOf, typedAsOf });
  assertEquals(pull.value, 12);
  assertEquals(pull.source, 'typed');
  assertEquals(pull.suggestion, null);
});

// ── Fixture 3 — gap-fill: learned exists, typed absent ────────────────────────────────────────────
Deno.test('gap-fill: no typed squat → trusted learned fills the gap, flagged provisional', () => {
  const res = resolveStrengthCapacity({
    key: 'squat',
    typed: { bench: 150 }, // no squat
    learnedStrength1rms: { squat: { value: 250, confidence: 'high', sample_count: 5, last_logged: RECENT } },
    asOf: TODAY,
    typedAsOf: RECENT,
  });
  assertEquals(res.value, 250);
  assertEquals(res.source, 'learned_gapfill');
  assertEquals(res.provisional, true);
  assertEquals(res.suggestion, null); // nothing typed to diverge from — it IS the fill
});

Deno.test('gap-fill is GATED: an untrusted (thin) learned aggregate does NOT become truth', () => {
  const res = resolveStrengthCapacity({
    key: 'deadlift',
    typed: {}, // nothing typed
    // the classic footgun: deadlift 175 from ONE February session — thin + stale
    learnedStrength1rms: { deadlift: { value: 175, confidence: 'low', sample_count: 1, last_logged: OLD } },
    asOf: TODAY,
    typedAsOf: null,
  });
  assertEquals(res.value, null);
  assertEquals(res.source, 'none'); // "no data" beats trusting a single stale session
});

// ── Fixture 4 — stale-typed: typed older than fresh logged evidence ───────────────────────────────
Deno.test('stale-typed: typed still WINS as the value (never overridden); typedStale + suggestion flag it', () => {
  const res = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150 },
    typedAsOf: OLD, // typed baseline is months old
    learnedStrength1rms: {
      bench_press: { value: 170, confidence: 'high', sample_count: 6, last_logged: RECENT }, // logged lifts moved UP past typed
    },
    asOf: TODAY,
  });
  // Value is STILL 150 — learned never silently overrides typed, even when typed is stale and learned is higher.
  assertEquals(res.value, 150);
  assertEquals(res.source, 'typed');
  assertEquals(res.typedStale, true);
  assert(res.suggestion != null && res.suggestion.divergencePct > 0, 'fresh higher logged evidence → upward suggestion');
});

Deno.test('fresh-typed (not stale): equal-age typed with no divergence → not stale, no suggestion', () => {
  const res = resolveStrengthCapacity({
    key: 'bench',
    typed: { bench: 150 },
    typedAsOf: RECENT,
    learnedStrength1rms: { bench_press: { value: 150, confidence: 'high', sample_count: 6, last_logged: RECENT } },
    asOf: TODAY,
  });
  assertEquals(res.value, 150);
  assertEquals(res.typedStale, false);
  assertEquals(res.suggestion, null);
});
