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
  buildArcNarrativeContextV1,
} from './arc-narrative-state.ts';

// ── is_first_post_race_run derivation ─────────────────────────────────────

/**
 * Helper: builds an arc narrative context with a configurable last-race date
 * and runs_since_last_race count. Goal-row picker / mode-picker behavior is
 * incidental for these tests; the derivation only depends on the two raw
 * fields the helper feeds.
 */
function arcCtxFor({ daysSince, runsSince }: { daysSince: number | null; runsSince: number | null }) {
  const focusYmd = '2026-05-23';
  const lastRaceDate = daysSince == null
    ? null
    : (() => {
        const d = new Date(focusYmd + 'T12:00:00.000Z');
        d.setUTCDate(d.getUTCDate() - daysSince);
        return d.toISOString().slice(0, 10);
      })();
  const completedGoalRows = lastRaceDate
    ? [{
        id: 'race1',
        name: 'Test Marathon',
        goal_type: 'event',
        target_date: lastRaceDate,
        sport: 'running',
        distance: 'marathon',
        priority: 'A',
        status: 'completed',
        created_at: '2025-01-01T00:00:00.000Z',
      }]
    : [];
  return buildArcNarrativeContextV1({
    focusYmd,
    goalRowsForPrimary: [],
    completedGoalRowsForLastRace: completedGoalRows as any,
    activePlanPhase: null,
    hasActiveTemporalPlan: false,
    runsSinceLastRace: runsSince,
  });
}

Deno.test('is_first_post_race_run: 1 run back, 32 days since race → true', () => {
  const nc = arcCtxFor({ daysSince: 32, runsSince: 1 });
  assertEquals(nc.is_first_post_race_run, true);
  assertEquals(nc.runs_since_last_race, 1);
  assertEquals(nc.days_since_last_goal_race, 32);
});

Deno.test('is_first_post_race_run: 5 runs back, 32 days since race → false (already past first run)', () => {
  const nc = arcCtxFor({ daysSince: 32, runsSince: 5 });
  assertEquals(nc.is_first_post_race_run, false);
});

Deno.test('is_first_post_race_run: 1 run back, 90 days since race → false (outside 60-day window)', () => {
  const nc = arcCtxFor({ daysSince: 90, runsSince: 1 });
  assertEquals(nc.is_first_post_race_run, false);
});

Deno.test('is_first_post_race_run: no race on record (runs_since_last_race null) → false', () => {
  const nc = arcCtxFor({ daysSince: null, runsSince: null });
  assertEquals(nc.is_first_post_race_run, false);
  assertEquals(nc.runs_since_last_race, null);
  assertEquals(nc.days_since_last_goal_race, null);
});

Deno.test('is_first_post_race_run: 0 runs back, 1 day since race → true (one day after race, no runs yet)', () => {
  // pickLastCompletedGoalRaceBefore requires target_date strictly < focusYmd,
  // so a race ON focus date doesn't surface as last_goal_race — only races
  // before it count. One-day-after is the earliest "post-race" can fire.
  const nc = arcCtxFor({ daysSince: 1, runsSince: 0 });
  assertEquals(nc.is_first_post_race_run, true);
});

Deno.test('is_first_post_race_run: 1 run back, exactly 60 days → true (boundary inclusive)', () => {
  const nc = arcCtxFor({ daysSince: 60, runsSince: 1 });
  assertEquals(nc.is_first_post_race_run, true);
});

Deno.test('is_first_post_race_run: 1 run back, 61 days → false (just outside window)', () => {
  const nc = arcCtxFor({ daysSince: 61, runsSince: 1 });
  assertEquals(nc.is_first_post_race_run, false);
});


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
