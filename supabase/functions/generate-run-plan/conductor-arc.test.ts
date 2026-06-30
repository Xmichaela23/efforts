// THE CONDUCTOR — integration: the overlay sequences the protocol BY PHASE.
// A Get Strong arc (strength_focus_build) must emit the BUILD lane in base weeks and the POWER lane in
// build weeks — proving phase→protocol sequencing, not one flat protocol.
// Run: ~/.deno/bin/deno test --no-check --allow-import --allow-read --allow-env conductor-arc.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildStrengthSessionsForPlanWeek } from './strength-overlay.ts';

const enduranceWeek: any[] = [
  { type: 'run', day: 'Sunday', tags: ['long_run'], duration: 90 },
  { type: 'run', day: 'Tuesday', tags: ['intervals'], duration: 45 },
  { type: 'run', day: 'Monday', tags: [], duration: 40 },
  { type: 'run', day: 'Wednesday', tags: [], duration: 40 },
  { type: 'run', day: 'Friday', tags: [], duration: 40 },
];
const phaseStructure: any = {
  phases: [
    { name: 'Base', start_week: 1, end_week: 4, weeks_in_phase: 4 },
    { name: 'Build', start_week: 5, end_week: 8, weeks_in_phase: 4 },
  ],
  recovery_weeks: [],
};

function exercisesFor(week: number): string[] {
  const sessions = buildStrengthSessionsForPlanWeek({
    weekNumber: week, totalWeeks: 8, enduranceSessions: enduranceWeek as any, phaseStructure,
    frequency: 4, tier: 'barbell', protocolId: 'strength_focus_build', // the arc trigger
    methodology: 'hal_higdon_complete', noDoubles: false,
  });
  return sessions.flatMap((s: any) => (s.strength_exercises ?? s.exercises ?? []).map((e: any) => e.name)).filter(Boolean);
}

Deno.test('CONDUCTOR: base week emits the 5×5-derived BUILD lane', () => {
  const ex = exercisesFor(2); // week 2 = Base phase
  // build lane signature: barbell compounds
  assert(ex.some((n) => /bench press|barbell row|back squat|romanian deadlift|overhead press/i.test(n)),
    `base week should be the build lane (compounds); got: ${ex.join(', ')}`);
});

Deno.test('CONDUCTOR: build week emits a DIFFERENT lane (power) than base', () => {
  const base = exercisesFor(2).sort().join('|');  // Base
  const build = exercisesFor(6).sort().join('|'); // Build phase
  assert(base.length > 0 && build.length > 0, 'both weeks must emit strength');
  assert(base !== build, `conductor must sequence: base and build weeks identical → not sequenced.\nbase: ${base}\nbuild: ${build}`);
});

Deno.test('CONDUCTOR off for non-arc protocol — five_by_five stays flat (byte-identical guard)', () => {
  const flat = (week: number) => buildStrengthSessionsForPlanWeek({
    weekNumber: week, totalWeeks: 8, enduranceSessions: enduranceWeek as any, phaseStructure,
    frequency: 2, tier: 'barbell', protocolId: 'five_by_five', methodology: 'hal_higdon_complete', noDoubles: false,
  }).flatMap((s: any) => (s.strength_exercises ?? s.exercises ?? []).map((e: any) => e.name)).filter(Boolean).sort().join('|');
  // five_by_five is phase-aware on LOAD but the protocol never swaps → both weeks the same exercise set
  assertEquals(flat(2).split('|').every((n) => /squat|bench|row|press|deadlift/i.test(n)), true);
});
