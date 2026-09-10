/**
 * The race intake's numbers and the club-night note (audit H-P07, H-W06).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { raceIntakeReadout, raceWeekNote } from './race-readout.ts';
import {
  longRunCeiling,
  tierMismatchNote,
  validateWeeklyMiles,
} from '../../../src/lib/run-volume-tables.ts';

Deno.test('the floor, the long run and the tier note are the tables on the inputs the generator gets, in both units', () => {
  const a = {
    distanceApi: 'marathon', fitness: 'beginner', durationWeeks: 19,
    typedWeeklyMi: 14, typedLongRunMi: 4, entryLongRunMi: 4,
    startISO: '2026-09-14', raceISO: '2027-01-24',
  };
  const r = raceIntakeReadout(a);
  const v = validateWeeklyMiles('marathon', 'beginner', 14)!;
  assertEquals(r.weekly!.ok, false);
  assertEquals(r.weekly!.bound, v.ok ? null : v.bound);
  assertEquals(r.weekly!.floor, { mi: Math.ceil(v.requiredMi), km: Math.ceil(v.requiredMi * 1.609344) });
  assertEquals(r.tier_note, tierMismatchNote('beginner', { weeklyMi: 14, longRunMi: 4 }));
  const reach = longRunCeiling('marathon', 'beginner', 19, 4, { startDateISO: a.startISO, raceDateISO: a.raceISO })!;
  assertEquals(r.long_run!.peak.mi, Math.round(reach.peakLongRunMi));
  assertEquals(r.long_run!.short_of_table, reach.shortOfTable);
  assertEquals([r.weeks, r.weeks_at_cap], [19, false]);
  assertEquals(raceIntakeReadout({ ...a, durationWeeks: 20 }).weeks_at_cap, true);
});

Deno.test('the club-night note is said only when the week the server built does what it says', () => {
  const adjacent = { quality_run: 'saturday', long_run: 'sunday' };
  assertEquals(raceWeekNote(adjacent, {
    '1': [{ day: 'Sunday', tags: ['long_run'] }, { day: 'Saturday', tags: ['easy_run'] }],
  }), null);
  assert(raceWeekNote(adjacent, {
    '1': [{ day: 'Sunday', tags: ['long_run'] }, { day: 'Monday', tags: ['easy_run'] }],
    '3': [{ day: 'Sunday', tags: ['long_run'] }, { day: 'Saturday', tags: ['intervals'] }],
  })!.startsWith('That sits next to your long run — two hard days back to back'));
  const sameDay = { quality_run: 'sunday', long_run: 'sunday' };
  assert(raceWeekNote(sameDay, {
    '1': [{ day: 'Sunday', tags: ['long_run'] }, { day: 'Wednesday', tags: ['tempo'] }],
  })!.startsWith('That is your long run day.'));
  assertEquals(raceWeekNote({ quality_run: 'wednesday', long_run: 'sunday' }, {
    '1': [{ day: 'Sunday', tags: ['long_run'] }, { day: 'Wednesday', tags: ['tempo'] }],
  }), null);
});
