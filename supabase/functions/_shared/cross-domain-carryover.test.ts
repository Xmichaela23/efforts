/**
 * Axis 1 — cross-domain carryover evidence gate. §1's cases are the acceptance set; the gate must be
 * bulletproof (silence-on-uncertain is the default; a suppressed claim logs its reason).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cross-domain-carryover.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectCrossDomainCarryover, buildCarryoverClause, type CarryoverInput } from './cross-domain-carryover.ts';

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
Deno.test('clause: suppressed → null (say nothing)', () => {
  const r = detectCrossDomainCarryover(base({ confounds: { grade: true, heat: false, prescribedHard: false }, adjustedElevation: 0.3 }));
  assertEquals(buildCarryoverClause(r, 'ride'), null);
});
