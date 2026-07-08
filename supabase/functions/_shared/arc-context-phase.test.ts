/**
 * Consumer-level fixture for the D-261 arc-context fold-in.
 *
 * The plan-phase.test.ts suite exercises the resolver in ISOLATION. This one
 * drives arc-context's OWN function (`buildActivePlanSummary`) so the fold-in is
 * verified where it actually runs — and it pins the TWO behavior changes the
 * one-lineage move introduced for arc specifically:
 *   1. phase_structure now resolves (strength plans were phase=null before);
 *   2. a version-less plan_contract_v1.phase_by_week now resolves (arc previously
 *      gated the contract read on `version === 1`, so it silently fell through).
 *
 * weekIndex is pinned via `current_week` so the assertion isolates phase
 * resolution from the date-based week math.
 *
 * Run: deno test supabase/functions/_shared/arc-context-phase.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildActivePlanSummary } from './arc-context.ts';

const FOCUS = '2026-07-08';

// The real Get stronger (strength_primary_v1) config — phase under phase_structure.
const GET_STRONGER_CONFIG = {
  program: 'get_strong',
  plan_version: 'strength_primary_v1',
  phase_structure: {
    phases: [
      { name: 'Base',   start_week: 1,  end_week: 4 },
      { name: 'Power',  start_week: 5,  end_week: 6 },
      { name: 'Deload', start_week: 7,  end_week: 7 },
      { name: 'Peak',   start_week: 8,  end_week: 11 },
      { name: 'Retest', start_week: 12, end_week: 12 },
    ],
  },
};

Deno.test('arc consumer: Get stronger WK1 resolves phase "Base" via phase_structure (was null pre-D-261)', () => {
  const s = buildActivePlanSummary(
    { id: 'p1', config: GET_STRONGER_CONFIG, current_week: 1, duration_weeks: 12 },
    FOCUS,
  );
  assertEquals(s?.week_number, 1);
  assertEquals(s?.phase, 'Base'); // arc now resolves strength phase_structure
});

Deno.test('arc consumer: Get stronger WK7 resolves "Deload" via phase_structure', () => {
  const s = buildActivePlanSummary(
    { id: 'p1', config: GET_STRONGER_CONFIG, current_week: 7, duration_weeks: 12 },
    FOCUS,
  );
  assertEquals(s?.phase, 'Deload');
});

Deno.test('arc consumer: version-less phase_by_week now resolves (was gated on version===1)', () => {
  const s = buildActivePlanSummary(
    { id: 'p2', config: { plan_contract_v1: { phase_by_week: ['base', 'build', 'build'] } }, current_week: 2, duration_weeks: 3 },
    FOCUS,
  );
  assertEquals(s?.phase, 'build'); // no `version` field, yet resolves via the shared resolver
});

Deno.test('arc consumer: no phase source → phase null (fail-safe intact)', () => {
  const s = buildActivePlanSummary(
    { id: 'p3', config: { plan_contract_v1: {} }, current_week: 1, duration_weeks: 4 },
    FOCUS,
  );
  assertEquals(s?.phase, null);
});
