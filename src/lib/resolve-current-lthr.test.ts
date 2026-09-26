/**
 * Run: deno test src/lib/resolve-current-lthr.test.ts --no-check
 *
 * Law-6 proof for the LTHR single-source resolver (SPEC-lthr-one-anchor.md, audit 2026-07-17), rewritten
 * 2026-09-26 when threshold heart rate became PROPOSED, THEN ACCEPTED (the FTP pattern, per sport).
 * Pins: typed → accepted → device → null, and nothing learned in between; the run's auto switch (Q-174) and that
 * it is the run's only; the D-284 gate on what may be proposed or accepted; the proposal (only when the measured
 * number differs from the one in use); the accept write; and the bike's own anchor.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveCurrentLthr,
  measuredLthr,
  pendingLthrProposal,
  acceptLearnedLthr,
  acceptedLthrValue,
  typedLthr,
} from './resolve-current-lthr.ts';

const learned = (value: number, confidence: string, sample_count: number, as_of = '2026-05-21') =>
  ({ run_threshold_hr: { value, confidence, sample_count, as_of } });
const accepted = (value: number, confidence = 'high') =>
  ({ value, confidence, sample_count: 1, as_of: '2026-09-20', accepted_at: '2026-09-21T00:00:00.000Z', accepted_from: value, accepted_via: 'baselines' });

// ── THE ANCHOR: typed, else accepted — never the learner's number ─────────────────────────────────
Deno.test('the resolver IGNORES an unaccepted learned threshold, however confident', () => {
  const r = resolveCurrentLthr({ learned_fitness: learned(162, 'high', 1) });
  assertEquals(r.bpm, null);
  assertEquals(r.source, null);
});

Deno.test('the ACCEPTED number is the anchor, and a newer measurement does not move it', () => {
  const r = resolveCurrentLthr({ learned_fitness: { ...learned(162, 'high', 1), run_threshold_hr_accepted: accepted(153) } });
  assertEquals(r.bpm, 153);
  assertEquals(r.source, 'learned');
  assertEquals(r.confidence, 'high');
  assertEquals(r.as_of, '2026-09-20');
});

Deno.test('TYPED beats ACCEPTED', () => {
  const r = resolveCurrentLthr({
    learned_fitness: { ...learned(162, 'high', 1), run_threshold_hr_accepted: accepted(153) },
    configured_hr_zones: { manual_run_lthr: 168 },
  } as never);
  assertEquals(r.bpm, 168);
  assertEquals(r.source, 'manual');
  // …and says 'manual-chosen' when the athlete chose it.
  const chosen = resolveCurrentLthr({
    learned_fitness: { run_threshold_hr_accepted: accepted(153) },
    configured_hr_zones: { manual_run_lthr: 168 },
    performance_numbers: { lthr_source: 'manual' },
  } as never);
  assertEquals([chosen.bpm, chosen.source], [168, 'manual-chosen']);
});

Deno.test('the legacy typed RUN field still counts as typed', () => {
  const r = resolveCurrentLthr({ learned_fitness: { run_threshold_hr_accepted: accepted(153) }, performance_numbers: { threshold_heart_rate: 158 } });
  assertEquals([r.bpm, r.source], [158, 'manual']);
});

Deno.test('the run\'s AUTO skips the typed number (Q-174) and lands on the accepted one — or on nothing', () => {
  const base = { configured_hr_zones: { manual_run_lthr: 168 }, performance_numbers: { lthr_source: 'learned' as const } };
  const withAccepted = resolveCurrentLthr({ ...base, learned_fitness: { run_threshold_hr_accepted: accepted(153) } } as never);
  assertEquals(withAccepted.bpm, 153);
  // A declined typed number cannot resurface, and an unaccepted measurement does not stand in for it.
  const nothingAccepted = resolveCurrentLthr({ ...base, learned_fitness: learned(162, 'high', 1) } as never);
  assertEquals(nothingAccepted.bpm, null);
});

Deno.test('the sport-agnostic configured field is not a tier (§8.0 #23)', () => {
  assertEquals(resolveCurrentLthr({ configured_hr_zones: { threshold_heart_rate: 149, source: 'manual' } }).bpm, null);
  assertEquals(resolveCurrentLthr({ configured_hr_zones: { manual_run_lthr: 149, source: 'manual' } }).bpm, 149);
});

Deno.test('device per-workout threshold is the LOWEST tier', () => {
  assertEquals(resolveCurrentLthr({}, { deviceThresholdHr: 145 }).source, 'device');
  assertEquals(resolveCurrentLthr({ learned_fitness: { run_threshold_hr_accepted: accepted(153) } }, { deviceThresholdHr: 145 }).bpm, 153);
  assertEquals(resolveCurrentLthr({ performance_numbers: { threshold_heart_rate: 158 } }, { deviceThresholdHr: 145 }).source, 'manual');
  // An unaccepted measurement does not outrank the watch file either: it is not in the chain.
  assertEquals(resolveCurrentLthr({ learned_fitness: learned(162, 'high', 1) }, { deviceThresholdHr: 145 }).bpm, 145);
});

Deno.test('empty baseline → null, never a 220-age estimate', () => {
  assertEquals(resolveCurrentLthr(null).bpm, null);
  assertEquals(resolveCurrentLthr({}).bpm, null);
  assertEquals(resolveCurrentLthr({ learned_fitness: null, performance_numbers: null }).source, null);
});

Deno.test('LAW 1: every caller gets ONE bpm — the accepted one — whatever the learner says meanwhile', () => {
  const b = { learned_fitness: { ...learned(158, 'high', 3), run_threshold_hr_accepted: accepted(151) } };
  for (let i = 0; i < 3; i++) assertEquals(resolveCurrentLthr(b).bpm, 151);
});

// ── THE MEASUREMENT (the proposal's input) and the D-284 gate ─────────────────────────────────────
Deno.test('measuredLthr: medium/high → learned; low but measured → learned-low; a formula → nothing', () => {
  assertEquals(measuredLthr({ learned_fitness: learned(151, 'medium', 2) }).source, 'learned');
  assertEquals(measuredLthr({ learned_fitness: learned(151, 'low', 3) }).source, 'learned-low');
  assertEquals(measuredLthr({ learned_fitness: learned(133, 'high', 0) }).bpm, null);                    // sample_count 0
  assertEquals(measuredLthr({ learned_fitness: { run_threshold_hr: { value: 146, confidence: 'low', sample_count: 18, is_estimate: true } } }).bpm, null);
  // An ABSENT sample_count is "not stated", not "measured nothing" (Q-171).
  assertEquals(measuredLthr({ learned_fitness: { run_threshold_hr: { value: 150, confidence: 'medium' } } }).bpm, 150);
});

// ── THE PROPOSAL — only when the measured number differs from the one in use ─────────────────────
Deno.test('proposal: measured 162 over accepted 153 → offered; over an equal number → nothing', () => {
  const p = pendingLthrProposal({ learned_fitness: { ...learned(162, 'high', 1), run_threshold_hr_accepted: accepted(153) } });
  assertEquals(p, { measured: 162, applied: 153, confidence: 'high' });
  assertEquals(pendingLthrProposal({ learned_fitness: { ...learned(153, 'high', 1), run_threshold_hr_accepted: accepted(153) } }), null);
  // Compared to the whole beat the screen prints.
  assertEquals(pendingLthrProposal({ learned_fitness: { ...learned(153.4, 'high', 1), run_threshold_hr_accepted: accepted(153) } }), null);
});

Deno.test('proposal: with NOTHING in use the measurement is still offered (applied null)', () => {
  assertEquals(pendingLthrProposal({ learned_fitness: learned(162, 'high', 1) }), { measured: 162, applied: null, confidence: 'high' });
});

Deno.test('proposal: against the TYPED number when that is the one in use (taking it switches to auto)', () => {
  const p = pendingLthrProposal({ learned_fitness: { ...learned(162, 'high', 1), run_threshold_hr_accepted: accepted(153) }, configured_hr_zones: { manual_run_lthr: 158 } } as never);
  assertEquals(p?.applied, 158);
  // A typed number above the measurement is not offered a lower one.
  assertEquals(pendingLthrProposal({ learned_fitness: learned(162, 'high', 1), configured_hr_zones: { manual_run_lthr: 168 } } as never), null);
});

Deno.test('proposal: ONLY A HIGHER NUMBER is offered (TrainingPeaks\' improvement notifications) — never a lower one', () => {
  const inUse153 = (measured: number) => ({ learned_fitness: { ...learned(measured, 'high', 1), run_threshold_hr_accepted: accepted(153) } });
  assertEquals(pendingLthrProposal(inUse153(150)), null);                  // lower → no offer
  assertEquals(pendingLthrProposal(inUse153(153)), null);                  // equal → no offer
  assertEquals(pendingLthrProposal(inUse153(154))?.measured, 154);         // higher → offered
  // The bike, the same rule.
  const ride = (measured: number) => ({ learned_fitness: { ride_threshold_hr: { value: measured, confidence: 'high', sample_count: 3 }, ride_threshold_hr_accepted: accepted(153) } });
  assertEquals(pendingLthrProposal(ride(148) as never, { sport: 'ride' }), null);
  assertEquals(pendingLthrProposal(ride(158) as never, { sport: 'ride' })?.measured, 158);
});

Deno.test('proposal: learned-low never proposes; a formula never proposes', () => {
  assertEquals(pendingLthrProposal({ learned_fitness: learned(162, 'low', 1) }), null);
  assertEquals(pendingLthrProposal({ learned_fitness: learned(162, 'high', 0) }), null);
});

// ── THE ACCEPT WRITE ──────────────────────────────────────────────────────────────────────────────
Deno.test('accept: writes the FTP shape under the sport\'s own key, and does not mutate its input', () => {
  const before = { ...learned(162, 'high', 1), run_threshold_pace_accepted: { value: 262 } };
  const now = new Date('2026-09-26T10:00:00.000Z');
  const next = acceptLearnedLthr(before, 'run', 'baselines', now) as Record<string, any>;
  assertEquals(next.run_threshold_hr_accepted, {
    value: 162, confidence: 'high', sample_count: 1, as_of: '2026-05-21',
    accepted_at: '2026-09-26T10:00:00.000Z', accepted_from: 162, accepted_via: 'baselines',
  });
  assertEquals(next.run_threshold_pace_accepted, { value: 262 });          // other keys ride through
  assertEquals((before as Record<string, unknown>).run_threshold_hr_accepted, undefined);
  assertEquals(acceptedLthrValue(next, 'run'), 162);
  assertEquals(acceptedLthrValue(next, 'ride'), null);
  // …and then it is the anchor.
  assertEquals(resolveCurrentLthr({ learned_fitness: next }).bpm, 162);
});

Deno.test('accept: nothing to accept from a low-confidence value or a formula', () => {
  assertEquals(acceptLearnedLthr(learned(162, 'low', 1), 'run', 'baselines'), null);
  assertEquals(acceptLearnedLthr(learned(162, 'high', 0), 'run', 'seed'), null);
  assertEquals(acceptLearnedLthr({}, 'run', 'baselines'), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE BIKE (2026-08-20) — same owner, its own anchor, its own accepted key
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('BIKE: reads the ride accepted value, not the run one', () => {
  const both = {
    learned_fitness: {
      run_threshold_hr_accepted: accepted(171),
      ride_threshold_hr_accepted: accepted(158),
    },
  };
  assertEquals(resolveCurrentLthr(both as never, { sport: 'ride' }).bpm, 158);
  assertEquals(resolveCurrentLthr(both as never).bpm, 171);              // default stays run
  assertEquals(resolveCurrentLthr(both as never, { sport: 'run' }).bpm, 171);
});

Deno.test('BIKE: the sport word is matched loosely — callers pass raw workout types', () => {
  const b = { learned_fitness: { ride_threshold_hr_accepted: accepted(158) } };
  for (const sport of ['ride', 'bike', 'cycling', 'Ride', 'virtual_ride']) {
    assertEquals(resolveCurrentLthr(b as never, { sport }).bpm, 158, sport);
  }
});

Deno.test('BIKE: its own typed number wins over its accepted one, and the RUN\'s auto does not hide it', () => {
  const b = {
    learned_fitness: { ride_threshold_hr_accepted: accepted(158), run_threshold_hr_accepted: accepted(171) },
    configured_hr_zones: { manual_ride_lthr: 152, manual_run_lthr: 168 },
    performance_numbers: { lthr_source: 'learned' },
  };
  // `lthr_source` is the run's switch: the run skips its typed 168; the bike's typed 152 stands.
  assertEquals(resolveCurrentLthr(b as never, { sport: 'ride' }).bpm, 152);
  assertEquals(resolveCurrentLthr(b as never, { sport: 'run' }).bpm, 171);
  assertEquals(typedLthr(b as never, { sport: 'ride' }), 152);
});

Deno.test('BIKE: REFUSES the sport-agnostic field — it is run-preferred by construction', () => {
  const runOnly = { configured_hr_zones: { manual_run_lthr: 168, threshold_heart_rate: 168 } };
  assertEquals(resolveCurrentLthr(runOnly as never, { sport: 'ride' }).bpm, null);
  assertEquals(resolveCurrentLthr(runOnly as never).bpm, 168);
});

Deno.test('BIKE: proposal and accept are per sport', () => {
  const lf = { ride_threshold_hr: { value: 153, confidence: 'medium', sample_count: 2 } };
  const p = pendingLthrProposal({ learned_fitness: lf } as never, { sport: 'ride' });
  assertEquals(p, { measured: 153, applied: null, confidence: 'medium' });
  assertEquals(pendingLthrProposal({ learned_fitness: lf } as never, { sport: 'run' }), null);
  const next = acceptLearnedLthr(lf, 'ride', 'seed') as Record<string, any>;
  assert(next.ride_threshold_hr_accepted?.value === 153 && next.ride_threshold_hr_accepted.accepted_via === 'seed');
  assertEquals(resolveCurrentLthr({ learned_fitness: next } as never, { sport: 'ride' }).bpm, 153);
  assertEquals(resolveCurrentLthr({ learned_fitness: next } as never, { sport: 'run' }).bpm, null);
});

Deno.test('BIKE: the sample-count gate applies to the bike too', () => {
  const formula = { learned_fitness: { ride_threshold_hr: { value: 150, confidence: 'high', sample_count: 0 } } };
  assertEquals(measuredLthr(formula as never, { sport: 'ride' }).bpm, null);
  assertEquals(pendingLthrProposal(formula as never, { sport: 'ride' }), null);
});
