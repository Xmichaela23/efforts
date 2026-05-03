/**
 * Temporal Arc narrative selection smoke tests (`deno test` when Deno installed).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calendarDaysBetween,
  pickTemporalPrimaryGoal,
  pickLastCompletedGoalRaceBefore,
  selectArcNarrativeMode,
  sanitizeUserFacingPhaseLabel,
} from './arc-narrative-state.ts';

Deno.test('sanitizeUserFacingPhaseLabel removes (generated) suffix', () => {
  assertEquals(sanitizeUserFacingPhaseLabel('taper (generated)'), 'taper');
  assertEquals(sanitizeUserFacingPhaseLabel('Peak (Generated)'), 'Peak');
});

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

Deno.test('recovery_read shortly after goal race — no structured-block gate', () => {
  const mode = selectArcNarrativeMode({
    focusYmd: '2026-05-03',
    daysSinceLastGoalRace: 14,
    daysUntilNextBlockStart: null,
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

Deno.test('race_debrief overrides taper_read when freshly post-goal despite imminent A race', () => {
  const mode = selectArcNarrativeMode({
    focusYmd: '2026-04-21',
    daysSinceLastGoalRace: 2,
    daysUntilNextBlockStart: 100,
    daysUntilNextGoalRace: 12,
    nextGoalPriority: 'A',
    phaseBucket: 'taper',
    hasActiveTemporalPlan: true,
  });
  assertEquals(mode, 'race_debrief');
});

Deno.test('recovery_read overrides taper_read when comeback window overlaps near-term A race', () => {
  const mode = selectArcNarrativeMode({
    focusYmd: '2026-04-29',
    daysSinceLastGoalRace: 10,
    daysUntilNextBlockStart: null,
    daysUntilNextGoalRace: 11,
    nextGoalPriority: 'A',
    phaseBucket: 'taper',
    hasActiveTemporalPlan: true,
  });
  assertEquals(mode, 'recovery_read');
});

Deno.test('pickLastGoalRace picks past dated event goals even while status active', () => {
  const lr = pickLastCompletedGoalRaceBefore(
    [
      {
        name: 'Ojai',
        distance: 'marathon',
        target_date: '2026-04-19',
        status: 'active',
        goal_type: 'event',
      },
    ],
    '2026-04-29',
  );
  assertEquals(lr?.target_date, '2026-04-19');
  assertEquals(lr?.name, 'Ojai');
});
