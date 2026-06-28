// (b)-run retest head — phase-tail transform. Run:
//   ~/.deno/bin/deno test --no-check supabase/functions/generate-run-plan/retest-tail.test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

const baseParams = {
  distance: 'half', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 12, days_per_week: '4-5', user_id: 'test',
} as const;

function phaseNames(params: Record<string, unknown>): string[] {
  const g = new SustainableGenerator(params as never);
  // determinePhaseStructure is protected; index.ts accesses it the same way.
  const ps = (g as unknown as { determinePhaseStructure(): { phases: { name: string }[] } })
    ['determinePhaseStructure']();
  return ps.phases.map((p) => p.name);
}

Deno.test('race head (default terminalShape) keeps Taper, no Retest — byte-identical', () => {
  const names = phaseNames({ ...baseParams });
  assert(names.includes('Taper'), `expected a Taper phase; got ${names.join(' → ')}`);
  assert(!names.includes('Retest'), `race plan must not have Retest; got ${names.join(' → ')}`);
});

Deno.test('non-race head (terminalShape=retest) → Retest terminal, no Taper, no Race Prep', () => {
  const names = phaseNames({ ...baseParams, terminalShape: 'retest' });
  assert(names.includes('Retest'), `expected a Retest terminal; got ${names.join(' → ')}`);
  assert(!names.includes('Taper'), `retest plan must not taper; got ${names.join(' → ')}`);
  assert(!names.includes('Race Prep'), `retest plan must not race-prep; got ${names.join(' → ')}`);
  // Retest is the terminal phase
  assert(names[names.length - 1] === 'Retest', `Retest must be terminal; got ${names.join(' → ')}`);
});
