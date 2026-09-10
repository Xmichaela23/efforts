/**
 * The season wizard's history readout (audit H-W10).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildHistoryReadout } from './history-readout.ts';

Deno.test('counts the last 28 days, spots a marathon-length run in 90, writes the sentences and conflict rows', () => {
  const h = buildHistoryReadout({
    rows: [
      { date: '2026-09-01', type: 'run', distance: 10, name: 'Easy' },
      { date: '2026-08-20', type: 'run', distance: 26, name: 'Long' },
      { date: '2026-07-01', type: 'run', distance: 12, name: 'City Marathon' },
      { date: '2026-05-01', type: 'run', distance: 42.2, name: 'Old' },
      { date: '2026-09-05', type: 'swim', distance: 2, name: 'Pool' },
      { date: '2026-09-06', type: 'ride', distance: 40, name: 'Ride' },
    ],
    today: '2026-09-10',
    performanceNumbers: { swimPace100: 95 },
    ask: {
      race_date: null,
      schedule: {
        tri: true, has_group_ride: true, group_ride_day: 'saturday',
        has_group_run: true, group_run_day: 'saturday', long_ride_day: 'saturday', long_run_day: 'sunday',
      },
    },
  });
  assertEquals([h.swim_sessions_28, h.run_sessions_28, h.bike_sessions_28], [1, 2, 1]);
  assert(h.run_quality_hint.startsWith('A recent marathon-length run shows in your history'));
  assert(h.run_quality_hint.endsWith('2 runs in the last 4 weeks — folding harder running into the long run often fits while run consistency builds.'));
  assertEquals(h.swim_note, 'Last 4 weeks: 1 swim on your log. Pace on file: 1:35/100yd.');
  assertEquals(h.history_lines, [
    'Swim: 1 sessions in last 4 weeks', 'Run: 2 sessions in last 4 weeks', 'Bike: 1 sessions in last 4 weeks',
  ]);
  assertEquals(h.schedule_conflicts!.group_run, 'Same day as group ride — planner will flag this');
  assertEquals(h.schedule_conflicts!.long_ride, 'Same day as group ride — planner will flag this');
  assertEquals(h.schedule_conflicts!.none_line, null);
  assertEquals(h.suggested, { swim_intent: null, swim_experience: null });
  assertEquals(h.weeks_to_race, null);
});

Deno.test('weeks to race round up, and a quiet schedule says so', () => {
  const race = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const h = buildHistoryReadout({
    rows: [], today: '2026-09-10', performanceNumbers: null,
    ask: {
      race_date: race,
      schedule: { tri: false, has_group_ride: false, has_group_run: false, long_run_day: 'sunday' },
    },
  });
  assertEquals(h.weeks_to_race, 2);
  assertEquals(h.schedule_conflicts!.none_line, 'No conflicts detected. Planner will optimize spacing.');
  assertEquals(h.suggested, { swim_intent: null, swim_experience: 'learning' });
  assert(h.bike_quality_hint.startsWith('No rides logged in the last 4 weeks'));
});
