/**
 * Fixtures for the single plan-phase resolver (D-261, Q-136 Drop A / Q-138).
 *
 * Covers the four cases Michael specified + the name→intent mapping:
 *   - combined plan (config.phases present, phase_by_week ABSENT) → resolves;
 *   - phase_by_week present → takes precedence over config.phases;
 *   - both absent → null / 'unknown' (fail-safe preserved);
 *   - weekIndex beyond the last phase → the last phase's intent.
 *
 * The "LIVE combined plan" case is pinned to the real config shape once Michael
 * pastes it; until then it uses a representative combined config (base→build→taper).
 *
 * Run: deno test supabase/functions/_shared/plan-phase.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolvePlanPhase, resolvePlanPhaseDetailed, phaseNameToWeekIntent, resolveWeekIntent } from './plan-phase.ts';

// A combined-plan config as generate-combined-plan writes it: phase structure in
// config.phases (start-week ranges), NO plan_contract_v1.phase_by_week.
const COMBINED_CONFIG = {
  plan_contract_v1: { plan_type: 'multi_sport' /* no phase_by_week */ },
  phases: [
    { name: 'base', start_week: 1, primary_goal_id: 'g1' },
    { name: 'build', start_week: 3, primary_goal_id: 'g1' },
    { name: 'taper', start_week: 7, primary_goal_id: 'g1' },
  ],
};

// A standalone run/tri config: phase_by_week present.
const STANDALONE_CONFIG = {
  plan_contract_v1: { version: 1, phase_by_week: ['base', 'build', 'build', 'taper'] },
};

// The REAL "Get stronger" (strength_primary_v1) config — no plan_contract_v1, no
// config.phases; block structure under config.phase_structure.phases. Pinned from
// user 45d122e7's active plan b3173487 (2026-07-08).
const GET_STRONGER_CONFIG = {
  program: 'get_strong',
  plan_version: 'strength_primary_v1',
  phase_structure: {
    phases: [
      { name: 'Base',   start_week: 1,  end_week: 4,  weeks_in_phase: 4 },
      { name: 'Power',  start_week: 5,  end_week: 6,  weeks_in_phase: 2 },
      { name: 'Deload', start_week: 7,  end_week: 7,  weeks_in_phase: 1 },
      { name: 'Peak',   start_week: 8,  end_week: 11, weeks_in_phase: 4 },
      { name: 'Retest', start_week: 12, end_week: 12, weeks_in_phase: 1 },
    ],
    recovery_weeks: [7],
  },
};

// ── Case 1: combined plan, config.phases present, phase_by_week absent ──────
Deno.test('combined config, week 1 → base → baseline (Gate 2 eligible)', () => {
  assertEquals(resolvePlanPhase(COMBINED_CONFIG, 1), 'base');
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, 1), 'baseline');
});
Deno.test('combined config, week 4 → build (last start_week ≤ 4)', () => {
  assertEquals(resolvePlanPhase(COMBINED_CONFIG, 4), 'build');
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, 4), 'build');
});

// ── Case 2: phase_by_week present → takes precedence ───────────────────────
Deno.test('phase_by_week present wins over config.phases', () => {
  const both = { plan_contract_v1: { phase_by_week: ['build', 'build'] }, phases: COMBINED_CONFIG.phases };
  assertEquals(resolvePlanPhase(both, 1), 'build'); // contract wins, not 'base'
  assertEquals(resolveWeekIntent(STANDALONE_CONFIG, 4), 'taper');
});

// ── Case 3: both absent → null / 'unknown' (fail-safe preserved) ───────────
Deno.test('no phase source → null / unknown (fail-safe)', () => {
  assertEquals(resolvePlanPhase({ plan_contract_v1: {} }, 1), null);
  assertEquals(resolveWeekIntent({ plan_contract_v1: {} }, 1), 'unknown');
  assertEquals(resolveWeekIntent(null, 1), 'unknown');
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, null), 'unknown'); // pre-start / no week
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, 0), 'unknown');
});

// ── Case 4: weekIndex beyond the last phase → last phase's intent ──────────
Deno.test('week beyond last phase → last phase (taper)', () => {
  assertEquals(resolvePlanPhase(COMBINED_CONFIG, 12), 'taper');
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, 12), 'taper');
});

// ── name→intent mapping (D-261: deload→recovery, default flipped to 'unknown') ─
Deno.test('phaseNameToWeekIntent — known phases map, unknown is the fail-safe default', () => {
  assertEquals(phaseNameToWeekIntent('recovery'), 'recovery');
  assertEquals(phaseNameToWeekIntent('deload'), 'recovery');    // D-261: easy week, not build
  assertEquals(phaseNameToWeekIntent('taper'), 'taper');
  assertEquals(phaseNameToWeekIntent('peak'), 'peak');
  assertEquals(phaseNameToWeekIntent('base'), 'baseline');
  assertEquals(phaseNameToWeekIntent('baseline'), 'baseline');
  assertEquals(phaseNameToWeekIntent('build'), 'build');        // explicit now default isn't build
  // D-261/D-242 fail-safe: any UNRECOGNISED phase → 'unknown' (strict), never 'build' (lenient)
  assertEquals(phaseNameToWeekIntent('power'), 'unknown');      // strength block, deferred
  assertEquals(phaseNameToWeekIntent('retest'), 'unknown');
  assertEquals(phaseNameToWeekIntent('race_specific'), 'unknown');
  assertEquals(phaseNameToWeekIntent('rebuild'), 'unknown');
  // real block-periodization vocab a future generator could invent — must be strict, not lenient
  assertEquals(phaseNameToWeekIntent('accumulation'), 'unknown');
  assertEquals(phaseNameToWeekIntent('realization'), 'unknown');
  assertEquals(phaseNameToWeekIntent('intensification'), 'unknown');
  assertEquals(phaseNameToWeekIntent(''), 'unknown');
  assertEquals(phaseNameToWeekIntent(null), 'unknown');
});

// ── Third source: config.phase_structure.phases (strength_primary_v1) ───────
// The REAL Get stronger plan, pinned. This is Item 0's live acceptance case.
Deno.test('Get stronger WK1 → Base via phase_structure → intent baseline (the deploy receipt)', () => {
  assertEquals(resolvePlanPhaseDetailed(GET_STRONGER_CONFIG, 1), { phase: 'Base', phase_source: 'phase_structure' });
  assertEquals(resolveWeekIntent(GET_STRONGER_CONFIG, 1), 'baseline'); // → Gate 2 eligible
});
Deno.test('Get stronger phases resolve correctly across the block, with the fail-safe default', () => {
  assertEquals(resolveWeekIntent(GET_STRONGER_CONFIG, 5), 'unknown');  // Power → deferred (strict)
  assertEquals(resolveWeekIntent(GET_STRONGER_CONFIG, 7), 'recovery'); // Deload → easy week (D-261)
  assertEquals(resolveWeekIntent(GET_STRONGER_CONFIG, 8), 'peak');     // Peak → peak
  assertEquals(resolveWeekIntent(GET_STRONGER_CONFIG, 12), 'unknown'); // Retest → deferred (strict)
  assertEquals(resolvePlanPhaseDetailed(GET_STRONGER_CONFIG, 7).phase_source, 'phase_structure');
});

// ── Provenance (phase_source enum) — locked into the suite alongside intent, so
//    it can't silently regress. Each case asserts BOTH the intent AND the tag. ──
Deno.test('phase_by_week path → intent build AND phase_source phase_by_week', () => {
  assertEquals(resolveWeekIntent(STANDALONE_CONFIG, 2), 'build');
  assertEquals(resolvePlanPhaseDetailed(STANDALONE_CONFIG, 2).phase_source, 'phase_by_week');
});
Deno.test('config.phases fallback path → intent build AND phase_source config_phases_fallback', () => {
  assertEquals(resolveWeekIntent(COMBINED_CONFIG, 4), 'build');
  assertEquals(resolvePlanPhaseDetailed(COMBINED_CONFIG, 4).phase_source, 'config_phases_fallback');
});
Deno.test('both absent → intent unknown AND phase_source unknown', () => {
  assertEquals(resolveWeekIntent({ plan_contract_v1: {} }, 1), 'unknown');
  assertEquals(resolvePlanPhaseDetailed({ plan_contract_v1: {} }, 1).phase_source, 'unknown');
});
// The Q-136-fix receipt in miniature: base WK1 resolves via the fallback tag.
Deno.test('combined WK1 → baseline via config_phases_fallback (the deploy receipt)', () => {
  assertEquals(resolvePlanPhaseDetailed(COMBINED_CONFIG, 1), { phase: 'base', phase_source: 'config_phases_fallback' });
});

// ── Malformed config.phases entries don't throw ────────────────────────────
Deno.test('malformed phases entries are skipped, not thrown', () => {
  const messy = { phases: [{ name: 'base' /* no start_week */ }, { name: 'build', start_week: 2 }] };
  assertEquals(resolvePlanPhase(messy, 1), null);  // no placeable entry ≤ 1
  assertEquals(resolvePlanPhase(messy, 3), 'build');
});
