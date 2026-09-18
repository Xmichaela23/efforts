/**
 * Today's block label and season link — the same words the phone printed before the move (2026-09-18).
 *
 * Run: ~/.deno/bin/deno test --no-check --no-lock supabase/functions/get-arc-context/home-line.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildHomeLine } from './home-line.ts';

const T = '2026-09-18';
const goal = (target_date: string | null, name = 'Marathon') => ({ name, target_date });

Deno.test('no goal: the season link, no label', () => {
  assertEquals(buildHomeLine({ active_goals: [] }, T), { block_label: null, season_cta: 'Set up your season →' });
  assertEquals(buildHomeLine(null, T), { block_label: null, season_cta: 'Set up your season →' });
});

Deno.test('build with a dated goal ahead reads "Build"; without one, "Build block"', () => {
  const id = { current_phase: 'build' };
  assertEquals(buildHomeLine({ athlete_identity: id, active_goals: [goal('2026-12-01')] }, T).block_label, 'Build');
  assertEquals(buildHomeLine({ athlete_identity: id, active_goals: [goal(T)] }, T).block_label, 'Build');
  assertEquals(buildHomeLine({ athlete_identity: id, active_goals: [goal('2026-09-17')] }, T).block_label, 'Build block');
  assertEquals(buildHomeLine({ athlete_identity: id, active_goals: [goal(null)] }, T).block_label, 'Build block');
  assertEquals(buildHomeLine({ athlete_identity: id, active_goals: [goal('2026-12-01', ' ')] }, T).block_label, 'Build block');
});

Deno.test('recovery, other phases capitalised, missing phase reads "Training"', () => {
  assertEquals(buildHomeLine({ athlete_identity: { current_phase: 'Recovery' }, active_goals: [goal(null)] }, T).block_label, 'Recovery');
  assertEquals(buildHomeLine({ athlete_identity: { current_phase: 'base' }, active_goals: [goal(null)] }, T).block_label, 'Base');
  assertEquals(buildHomeLine({ athlete_identity: {}, active_goals: [goal(null)] }, T).block_label, 'Training');
  assertEquals(buildHomeLine({ athlete_identity: { current_phase: 3 }, active_goals: [goal(null)] }, T).block_label, 'Training');
  assertEquals(buildHomeLine({ athlete_identity: { current_phase: '' }, active_goals: [goal(null)] }, T).block_label, 'Training');
});
