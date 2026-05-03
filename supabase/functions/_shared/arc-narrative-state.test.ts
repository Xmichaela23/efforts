/**
 * Temporal Arc narrative selection smoke tests (`deno test` when Deno installed).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calendarDaysBetween,
  pickTemporalPrimaryGoal,
  selectArcNarrativeMode,
} from './arc-narrative-state.ts';

Deno.test('calendarDaysBetween end-exclusive semantics', () => {
  assertEquals(calendarDaysBetween('2026-04-02', '2026-04-19'), 17);
});

Deno.test('temporal primary — upcoming marathon beats later tri goal on historical date', () => {
  const focus = '2026-04-02';
  const marathon = pickTemporalPrimaryGoal(
    [
      {
        id: 'm',
        name: 'Mountains to the Sea',
        goal_type: 'event',
        target_date: '2026-04-19',
        sport: 'running',
        distance: 'marathon',
        priority: 'A',
        status: 'active',
        created_at: '2025-06-01T00:00:00.000Z',
      },
      {
        id: 't',
        name: 'Ironman 70.3 Redding',
        goal_type: 'event',
        target_date: '2026-08-16',
        sport: 'triathlon',
        distance: '70.3',
        priority: 'A',
        status: 'active',
        created_at: '2026-01-15T00:00:00.000Z',
      },
    ],
    focus,
  );
  assertEquals(marathon?.id, 'm');
});

Deno.test('recovery_read when recent race + structured block horizon ahead', () => {
  const mode = selectArcNarrativeMode({
    focusYmd: '2026-05-03',
    daysSinceLastGoalRace: 14,
    daysUntilNextBlockStart: 10,
    daysUntilNextGoalRace: 120,
    nextGoalPriority: 'A',
    phaseBucket: 'unspecified',
    hasActiveTemporalPlan: true,
  });
  assertEquals(mode, 'recovery_read');
});

Deno.test('taper_read near next A race when recovery branch does not win', () => {
  const mode = selectArcNarrativeMode({
    focusYmd: '2026-04-10',
    daysSinceLastGoalRace: null,
    daysUntilNextBlockStart: -5,
    daysUntilNextGoalRace: 9,
    nextGoalPriority: 'A',
    phaseBucket: 'taper',
    hasActiveTemporalPlan: true,
  });
  assertEquals(mode, 'taper_read');
});
