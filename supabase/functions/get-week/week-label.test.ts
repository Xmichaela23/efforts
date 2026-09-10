/**
 * Today's date line after "Week N · " — standing plans by name, test and light weeks by kind, race
 * plans by phase (Michael, 2026-09-10).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/get-week/week-label.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekLabelFor } from './week-label.ts';

const standing = { standing_plan: { frame: 'all_rounder', test_week: 1, taper_weeks: [6, 7] } };

Deno.test('standing plan: week 1 is "Test", whatever the phase word', () => {
  assertEquals(weekLabelFor({ config: standing, planName: 'Standard Focus', week: 1, phaseFocus: 'Test' }), { label: 'Test', standingPlan: true });
});

Deno.test('standing plan: an ordinary week is the plan\'s own name, never the phase word', () => {
  assertEquals(weekLabelFor({ config: standing, planName: 'Standard Focus', week: 2, phaseFocus: 'Base' }), { label: 'Standard Focus', standingPlan: true });
});

Deno.test('standing plan: a taper-column week is "Light week"', () => {
  assertEquals(weekLabelFor({ config: standing, planName: 'Standard Focus', week: 6, phaseFocus: 'Taper' }), { label: 'Light week', standingPlan: true });
  // No taper weeks stored → never a light week.
  assertEquals(weekLabelFor({ config: { standing_plan: {} }, planName: 'Run Focus', week: 6, phaseFocus: 'Base' }), { label: 'Run Focus', standingPlan: true });
});

Deno.test('race plan: keeps its phase word', () => {
  assertEquals(weekLabelFor({ config: { race_date: '2026-11-01' }, planName: 'Marathon', week: 9, phaseFocus: 'Build' }), { label: 'Build', standingPlan: false });
  assertEquals(weekLabelFor({ config: {}, planName: 'Marathon', week: 1, phaseFocus: null }), { label: null, standingPlan: false });
});
