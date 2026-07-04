/**
 * Axis 1 — cross-domain carryover evidence gate. §1's cases are the acceptance set; the gate must be
 * bulletproof (silence-on-uncertain is the default; a suppressed claim logs its reason).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cross-domain-carryover.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectCrossDomainCarryover, buildCarryoverClause, classifyStrengthFocus, resolveCarriedInSoreness, rescaleSoreness10to7, type CarryoverInput } from './cross-domain-carryover.ts';

// A lower-body lift Tue 06-23, target ride Thu 06-25 (2 days out — in the ≤3d window). RPE signal, bar 1.0.
function base(over: Partial<CarryoverInput> = {}): CarryoverInput {
  return {
    targetDate: '2026-06-25',
    targetDiscipline: 'ride',
    effortSignal: 'rpe',
    rawElevation: 1.5,
    adjustedElevation: 1.5,
    threshold: 1.0,
    confounds: { grade: false, heat: false, prescribedHard: false },
    recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'lower', workload: 100, isNovel: false }],
    nonLegElevated: null,
    ...over,
  };
}

Deno.test('TRUE POSITIVE: lift + elevated RPE + clean conditions → claim', () => {
  const r = detectCrossDomainCarryover(base());
  assertEquals(r?.claimable, true);
  assertEquals(r?.suppressedBy, null);
  assertEquals(r?.antecedent?.dayName, 'Tuesday');
});

Deno.test('terrain subtracted: raw pace elevated but grade-adjusted AT baseline → silent (terrain)', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 1.5, adjustedElevation: 0.3, confounds: { grade: true, heat: false, prescribedHard: false } }));
  assertEquals(r?.claimable, false);
  assertEquals(r?.suppressedBy, 'terrain');
});

Deno.test('DISCRIMINATOR: hilly day but grade-adjusted STILL elevated → claim survives', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 2.5, adjustedElevation: 1.2, confounds: { grade: true, heat: false, prescribedHard: false } }));
  assertEquals(r?.claimable, true, JSON.stringify(r));
  assertEquals(r?.suppressedBy, null);
});

Deno.test('heat subtracted: raw HR elevated but heat-adjusted at baseline → silent (heat)', () => {
  const r = detectCrossDomainCarryover(base({ effortSignal: 'hr_at_pace', rawElevation: 1.6, adjustedElevation: 0.4, confounds: { grade: false, heat: true, prescribedHard: false } }));
  assertEquals(r?.suppressedBy, 'heat');
});

Deno.test('no elevation: raw effort at baseline → silent (no_elevation)', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 0.3, adjustedElevation: 0.3 }));
  assertEquals(r?.suppressedBy, 'no_elevation');
});

Deno.test('systemic: elevation survives but non-leg efforts also elevated → silent (systemic)', () => {
  const r = detectCrossDomainCarryover(base({ nonLegElevated: true }));
  assertEquals(r?.suppressedBy, 'systemic');
});

Deno.test('no antecedent: no relevant strength in window → silent (no_antecedent)', () => {
  const r = detectCrossDomainCarryover(base({ recentSessions: [] }));
  assertEquals(r?.suppressedBy, 'no_antecedent');
});

Deno.test('no data: no usable effort signal → silent (no_data)', () => {
  const r = detectCrossDomainCarryover(base({ effortSignal: null, rawElevation: null, adjustedElevation: null }));
  assertEquals(r?.suppressedBy, 'no_data');
});

// ── cadence-primary (research-grounded leg-mechanical signal — heat-immune, the DOMS stride signature) ─
Deno.test('cadence-primary: cadence dropped ≥ bar after a lower lift, not declared easy → claim', () => {
  const r = detectCrossDomainCarryover(base({ effortSignal: 'cadence', rawElevation: 4, adjustedElevation: 4, threshold: 3, declaredEasy: false }));
  assertEquals(r?.claimable, true);
});
Deno.test('cadence corroborated by decoupling/declared-leg-feel → strong confidence', () => {
  const r = detectCrossDomainCarryover(base({ effortSignal: 'cadence', rawElevation: 4, adjustedElevation: 4, threshold: 3, corroborated: true }));
  assertEquals(r?.claimable, true);
  assertEquals(r?.confidence, 'strong');
});
Deno.test('June 14 restructured: cadence NORMAL on a warm run (legs were fine) → no_elevation', () => {
  // Cadence is heat-immune — a warm day doesn't drop it; June 14 legs turned over normally → silent.
  const r = detectCrossDomainCarryover(base({ effortSignal: 'cadence', rawElevation: 0.5, adjustedElevation: 0.5, threshold: 3, declaredEasy: true }));
  assertEquals(r?.suppressedBy, 'no_elevation'); // primary reason: cadence didn't drop, not the RPE veto
});

// ── generic confound-subtraction PRIMARY, declared-RPE veto SECONDARY (order matters) ─────────────────
Deno.test('June 14 (warm+hilly, raw drift +5, conditions explain → adjusted 0, RPE 3) → no_elevation, NOT declared_easy', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 5, adjustedElevation: 0, declaredEasy: true }));
  assertEquals(r?.claimable, false);
  assertEquals(r?.suppressedBy, 'no_elevation'); // confound-subtraction is primary; the honest reason
});
Deno.test('declared_easy is the BACKSTOP: residual SURVIVES confounds but athlete declared easy → declared_easy', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 5, adjustedElevation: 5, declaredEasy: true }));
  assertEquals(r?.suppressedBy, 'declared_easy'); // only reached because the residual survived
});
Deno.test('residual survives + not declared easy → claim (the true positive)', () => {
  const r = detectCrossDomainCarryover(base({ rawElevation: 5, adjustedElevation: 5, declaredEasy: false }));
  assertEquals(r?.claimable, true);
});

// ── THE TWO-WAY RPE GAUGE — Michael's two real cases as the acceptance set ───────────────────────────
Deno.test('YESTERDAY bike: objective quiet (easy, negative drift) but RPE ABOVE output + solid baseline → CLAIM, recovery-positive', () => {
  const r = detectCrossDomainCarryover(base({
    targetDiscipline: 'ride',
    effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3, // decoupling negative → objective quiet
    declaredRpeGap: 1.5, declaredBaselineOk: true, // RPE 4 vs expected ~2.5 on a well-known easy route
  }));
  assertEquals(r?.claimable, true);
  assertEquals(r?.source, 'declared');
  assertEquals(r?.recoveryPositive, true);
});
Deno.test('JUNE 14 run: objective quiet (cadence normal) + RPE at/below expected → silent', () => {
  const r = detectCrossDomainCarryover(base({
    targetDiscipline: 'run',
    effortSignal: 'cadence', rawElevation: 0.5, adjustedElevation: 0.5, threshold: 3,
    declaredRpeGap: -0.5, declaredBaselineOk: true, // RPE ≈ expected → no trigger, no veto
  }));
  assertEquals(r?.claimable, false);
  assertEquals(r?.suppressedBy, 'no_elevation');
});
Deno.test('gauge low side: objective residual SURVIVES but RPE below output → declared_easy veto', () => {
  const r = detectCrossDomainCarryover(base({
    effortSignal: 'hr_at_pace', rawElevation: 5, adjustedElevation: 5, threshold: 3,
    declaredRpeGap: -1.5, declaredBaselineOk: true, // felt easier than the objective difficulty
  }));
  assertEquals(r?.suppressedBy, 'declared_easy');
});
Deno.test('SAFEGUARD — thin baseline: RPE gap is noise, gauge disabled → does NOT fire', () => {
  const r = detectCrossDomainCarryover(base({
    targetDiscipline: 'ride',
    effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3,
    declaredRpeGap: 1.5, declaredBaselineOk: false, // baseline thin → gap ignored
  }));
  assertEquals(r?.claimable, false);
  assertEquals(r?.suppressedBy, 'no_elevation');
});
Deno.test('SAFEGUARD — RPE trigger still needs the antecedent: no lift → no_antecedent', () => {
  const r = detectCrossDomainCarryover(base({
    recentSessions: [], effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3,
    declaredRpeGap: 2, declaredBaselineOk: true,
  }));
  assertEquals(r?.suppressedBy, 'no_antecedent');
});
Deno.test('objective survives AND RPE above → source both, strong, NOT recovery-positive', () => {
  const r = detectCrossDomainCarryover(base({
    effortSignal: 'cadence', rawElevation: 5, adjustedElevation: 5, threshold: 3,
    declaredRpeGap: 1.5, declaredBaselineOk: true,
  }));
  assertEquals(r?.source, 'both');
  assertEquals(r?.confidence, 'strong');
  assertEquals(r?.recoveryPositive, false);
});

// ── Declared soreness (Q-049) — the strongest leg-feel trigger; the sore-legs-easy-ride fix ──────────
Deno.test('SORE-LEGS-EASY-RIDE: objective quiet + RPE gauge dormant (0 baseline) + soreness elevated → CLAIM, strong, recovery-positive', () => {
  const r = detectCrossDomainCarryover(base({
    targetDiscipline: 'ride',
    effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3, // objective quiet
    declaredRpeGap: null, declaredBaselineOk: false, // RPE gauge dormant (the 0-comparable-rides case)
    declaredSorenessElevated: true,
  }));
  assertEquals(r?.claimable, true);
  assertEquals(r?.source, 'declared');
  assertEquals(r?.recoveryPositive, true);
  assertEquals(r?.confidence, 'strong');
});
Deno.test('soreness OVERRIDES the easy-RPE veto: sore + rated the ride easy → CLAIM, not declared_easy', () => {
  const r = detectCrossDomainCarryover(base({
    effortSignal: 'hr_at_pace', rawElevation: 5, adjustedElevation: 5, threshold: 3, // objective elevated
    declaredRpeGap: -1.5, declaredBaselineOk: true, // felt easier than output
    declaredSorenessElevated: true, // but the legs are sore
  }));
  assertEquals(r?.claimable, true);
  assertEquals(r?.source, 'both');
});
Deno.test('soreness is one-way: NOT elevated (un-sore) + objective quiet → silent', () => {
  const r = detectCrossDomainCarryover(base({
    effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3,
    declaredSorenessElevated: false,
  }));
  assertEquals(r?.claimable, false);
  assertEquals(r?.suppressedBy, 'no_elevation');
});

// ── Soreness scale (Hooper 1–7) + provenance/scale guards (D-234) ────────────────────────────────────
Deno.test('rescale 1–10 → 1–7: 7→5 (the coach-threshold equivalence), endpoints preserved', () => {
  assertEquals(rescaleSoreness10to7(7), 5);
  assertEquals(rescaleSoreness10to7(1), 1);
  assertEquals(rescaleSoreness10to7(10), 7);
});
Deno.test("soreness PROVENANCE GUARD: the target workout's OWN entry never triggers its own carryover", () => {
  const entries = [
    { workoutId: 'TARGET', startTime: '2026-06-25T17:00:00Z', soreness: 7 }, // reported AFTER the ride — must be ignored
    { workoutId: 'mon-lift', startTime: '2026-06-23T18:00:00Z', soreness: 6 },
    ...Array.from({ length: 5 }, (_, i) => ({ workoutId: `b${i}`, startTime: `2026-06-1${i}T12:00:00Z`, soreness: 1 })),
  ];
  const r = resolveCarriedInSoreness(entries, { workoutId: 'TARGET', startTime: '2026-06-25T16:00:00Z' });
  assertEquals(r.recent, 6);      // Monday's carried-in 6, NOT the target's own post-ride 7
  assertEquals(r.elevated, true);
});
Deno.test('soreness 1–7 FIRES: recent ≥ mean+1 and Z ≥ 1 with a solid baseline', () => {
  const entries = [
    { workoutId: 'mon', startTime: '2026-06-23T18:00:00Z', soreness: 5 },
    ...Array.from({ length: 5 }, (_, i) => ({ workoutId: `b${i}`, startTime: `2026-06-1${i}T12:00:00Z`, soreness: 2 })),
  ];
  const r = resolveCarriedInSoreness(entries, { workoutId: 'TARGET', startTime: '2026-06-25T16:00:00Z' });
  assertEquals(r.elevated, true);
  assertEquals(r.baselineOk, true);
});
Deno.test('soreness MIXED-SCALE never blends: an un-migrated 1–10 value (9) is dropped from the baseline', () => {
  const entries = [
    { workoutId: 'mon', startTime: '2026-06-23T18:00:00Z', soreness: 5 },
    { workoutId: 'leak', startTime: '2026-06-05T12:00:00Z', soreness: 9 }, // 1–10 leak — out of range, must be excluded
    ...Array.from({ length: 5 }, (_, i) => ({ workoutId: `b${i}`, startTime: `2026-06-1${i}T12:00:00Z`, soreness: 2 })),
  ];
  const r = resolveCarriedInSoreness(entries, { workoutId: 'TARGET', startTime: '2026-06-25T16:00:00Z' });
  assertEquals(r.mean != null && r.mean < 3, true, `mean must exclude the 9: ${r.mean}`);
});
Deno.test('soreness STORED-0 edge: a legacy 0 (old 0–10 slider) is dropped by the ≥1 guard, never blended', () => {
  const entries = [
    { workoutId: 'mon', startTime: '2026-06-23T18:00:00Z', soreness: 5 },
    { workoutId: 'zero', startTime: '2026-06-08T12:00:00Z', soreness: 0 }, // legacy 0 — out of 1–7, must drop
    ...Array.from({ length: 5 }, (_, i) => ({ workoutId: `b${i}`, startTime: `2026-06-1${i}T12:00:00Z`, soreness: 2 })),
  ];
  const r = resolveCarriedInSoreness(entries, { workoutId: 'TARGET', startTime: '2026-06-25T16:00:00Z' });
  // the 0 is excluded → baseline is the five 2s (mean 2), not pulled down by a 0
  assertEquals(r.mean, 2);
});
Deno.test('soreness baseline thin: fewer than 5 comparable entries → not elevated (silence-on-uncertain)', () => {
  const entries = [
    { workoutId: 'mon', startTime: '2026-06-23T18:00:00Z', soreness: 6 },
    { workoutId: 'b0', startTime: '2026-06-20T12:00:00Z', soreness: 2 },
  ];
  const r = resolveCarriedInSoreness(entries, { workoutId: 'TARGET', startTime: '2026-06-25T16:00:00Z' });
  assertEquals(r.elevated, false);
  assertEquals(r.baselineOk, false);
});

// ── the pins ──────────────────────────────────────────────────────────────────────────────────────
Deno.test('novelty does NOT widen the window: a novel lift 4 days out is still out of window', () => {
  const r = detectCrossDomainCarryover(base({
    recentSessions: [{ date: '2026-06-21', type: 'strength', strengthFocus: 'lower', workload: 100, isNovel: true }], // 4d
  }));
  assertEquals(r?.suppressedBy, 'no_antecedent');
});

Deno.test('novelty weights CONFIDENCE: novel in-window antecedent + claim → strong', () => {
  const r = detectCrossDomainCarryover(base({
    recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'lower', workload: 100, isNovel: true }],
  }));
  assertEquals(r?.claimable, true);
  assertEquals(r?.confidence, 'strong');
});

Deno.test('directionality: upper lift → ride is NOT a relevant antecedent', () => {
  const r = detectCrossDomainCarryover(base({
    recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'upper', workload: 100, isNovel: false }],
  }));
  assertEquals(r?.suppressedBy, 'no_antecedent');
});

Deno.test('directionality: upper lift → SWIM is relevant → claim', () => {
  const r = detectCrossDomainCarryover(base({
    targetDiscipline: 'swim',
    recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'upper', workload: 100, isNovel: false }],
  }));
  assertEquals(r?.claimable, true);
});

Deno.test('trivial antecedent load (workload 0) does not qualify', () => {
  const r = detectCrossDomainCarryover(base({
    recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'lower', workload: 0, isNovel: false }],
  }));
  assertEquals(r?.suppressedBy, 'no_antecedent');
});

// ── strength focus classification (the antecedent's directional key) ──
Deno.test('classifyStrengthFocus: Michael\'s Monday session (squats + lunges) → lower', () => {
  assertEquals(classifyStrengthFocus(['Back Squat', 'Bulgarian Split Squats', 'Reverse Lunge']), 'lower');
});
Deno.test('classifyStrengthFocus: bench + row → upper; mixed → full; nothing → unknown', () => {
  assertEquals(classifyStrengthFocus(['Bench Press', 'Barbell Row']), 'upper');
  assertEquals(classifyStrengthFocus(['Back Squat', 'Bench Press']), 'full');
  assertEquals(classifyStrengthFocus(['Plank', 'Farmer Carry']), 'unknown');
});
Deno.test('coexist hardening: mostly-upper + ONE leg movement → full (presence, not ratio — the fork we closed)', () => {
  // The coach's old ratio rule (1/3 lower < 0.5) called this "upper"; presence-based says "full" because
  // a heavy squat DID load the legs. One shared derivation → State + cards can't disagree.
  assertEquals(classifyStrengthFocus(['Bench Press', 'Bicep Curl', 'Back Squat']), 'full');
});

// ── narration: the ONE clause both surfaces speak (possibility, load language, cite the antecedent) ──
Deno.test('clause: claimable non-novel ride → possibility + load language + the day', () => {
  const r = detectCrossDomainCarryover(base());
  assertEquals(buildCarryoverClause(r, 'ride'), "Your legs may still be carrying Tuesday's lower-body session — this ride's effort ran a bit above your usual.");
});
Deno.test('clause: novel antecedent → stronger "paying it off" framing', () => {
  const r = detectCrossDomainCarryover(base({ recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'lower', workload: 100, isNovel: true }] }));
  assertEquals(buildCarryoverClause(r, 'run'), "Tuesday's session brought novel lower-body work, and this run's effort sat above your usual — the legs may still be paying it off.");
});
Deno.test('clause: swim → upper-body framing', () => {
  const r = detectCrossDomainCarryover(base({ targetDiscipline: 'swim', recentSessions: [{ date: '2026-06-23', type: 'strength', strengthFocus: 'upper', workload: 100, isNovel: false }] }));
  assertEquals(buildCarryoverClause(r, 'swim'), "Tuesday's upper-body work may still be in your arms here — the effort sat a touch above your usual.");
});
Deno.test('clause PROVENANCE: LOGGED soreness → may state the sensation ("you reported sore legs")', () => {
  const r = detectCrossDomainCarryover(base({ targetDiscipline: 'ride', effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3, declaredSorenessElevated: true }));
  const c = buildCarryoverClause(r, 'ride') || '';
  assertEquals(c.includes('You reported sore legs') && c.includes('right call'), true, c);
});
Deno.test('clause PROVENANCE: INFERRED (RPE, no logged soreness) → LOAD language, NEVER asserts "sore"', () => {
  const r = detectCrossDomainCarryover(base({ targetDiscipline: 'ride', effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3, declaredRpeGap: 1.5, declaredBaselineOk: true }));
  const c = buildCarryoverClause(r, 'ride') || '';
  assertEquals(/sore/i.test(c), false, `inferred path must never claim the sensation: ${c}`);
  assertEquals(c.includes('carrying'), true, c);
});
Deno.test('clause: recovery-positive (ride) → managed-well framing (Q-115), not fatigue-cost', () => {
  const r = detectCrossDomainCarryover(base({ targetDiscipline: 'ride', effortSignal: 'hr_at_pace', rawElevation: -9, adjustedElevation: -9, threshold: 3, declaredRpeGap: 1.5, declaredBaselineOk: true }));
  const c = buildCarryoverClause(r, 'ride') || '';
  assertEquals(c.includes('keeping it easy was the right call') && c.includes('recover') && !c.includes('cost'), true, c);
});
Deno.test('clause: suppressed → null (say nothing)', () => {
  const r = detectCrossDomainCarryover(base({ confounds: { grade: true, heat: false, prescribedHard: false }, adjustedElevation: 0.3 }));
  assertEquals(buildCarryoverClause(r, 'ride'), null);
});
