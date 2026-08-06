/**
 * ⛔ THE LONG-RUN ARC — the shape, pinned. These are the two bugs that caused it, kept as
 * permanent cases, plus the properties that must hold for EVERY row in the table.
 *
 * The bug (2026-08-06): the arc was read forward from week 1, so a plan shorter than its row never
 * reached the row's tail. A 9-week beginner marathon climbed to a 10-mile long run and raced on it
 * — the block's biggest long run in race week, no taper anywhere.
 *
 * The bug the fix nearly shipped: the marathon rows end `peak, taper, race week`; the half, 10K and
 * 5K rows end `peak, race week`. Reading a fixed three-deep tail off a half row made its "taper" a
 * 9% RISE into race week.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --no-check src/lib/long-run-arc.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  LONG_RUN_PROGRESSION,
  buildLongRunArc,
  longRunPeakWeek,
  longRunCeiling,
} from './run-volume-tables.ts';

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const DISTANCES = ['marathon', 'half', '10k', '5k'] as const;

Deno.test('⛔ THE BUG: a 9-week beginner marathon tapers instead of racing on its biggest week', () => {
  const arc = buildLongRunArc({ distance: 'marathon', fitness: 'beginner', durationWeeks: 9, entryLongRunMi: 6 })!;
  assertEquals(arc.weeks.length, 9);
  // The peak is two weeks out, not on race week — the whole point.
  assertEquals(arc.peakWeek, 7);
  // Everything after the peak descends. Before the fix week 9 held the block's biggest run.
  assert(arc.weeks[7] < arc.weeks[6], `week 8 (${arc.weeks[7]}) must be under the peak (${arc.weeks[6]})`);
  assert(arc.weeks[8] < arc.weeks[7], `race week (${arc.weeks[8]}) must be under week 8 (${arc.weeks[7]})`);
  // And the block is honest about its ceiling: nowhere near the row's 18.
  assertEquals(arc.reachesTableMax, false);
  assert(arc.maxMi <= 12, `a 9-week block off a 6-mile long run reached ${arc.maxMi} mi`);
});

Deno.test('⛔ AT FULL LENGTH IT IS A NO-OP — a 20-week marathon still walks the row', () => {
  // The row is 20 long, so the anchor lands on rung 0 and the arc IS the table, taper included.
  for (const level of LEVELS) {
    const row = LONG_RUN_PROGRESSION.marathon[level];
    const arc = buildLongRunArc({ distance: 'marathon', fitness: level, durationWeeks: 20 })!;
    assertEquals(arc.weeks, row, `${level}: a full-length plan must be the row, unchanged`);
    assertEquals(arc.reachesTableMax, true);
  }
});

Deno.test('⛔ THE HALF ROWS DO NOT RISE INTO RACE WEEK (the fixed-tail bug)', () => {
  // half/intermediate ends [.., 10, 11, 12, 8]: a fixed three-deep tail read 12/11 as the "taper".
  for (const distance of DISTANCES) {
    for (const level of LEVELS) {
      const arc = buildLongRunArc({ distance, fitness: level, durationWeeks: 12 })!;
      for (let w = arc.peakWeek + 1; w < arc.weeks.length; w++) {
        assert(
          arc.weeks[w] <= arc.weeks[w - 1],
          `${distance}/${level}: week ${w + 1} (${arc.weeks[w]}) rose over week ${w} (${arc.weeks[w - 1]}) inside the taper`,
        );
      }
      assert(
        arc.weeks[arc.weeks.length - 1] < arc.peakMi,
        `${distance}/${level}: race week (${arc.weeks[arc.weeks.length - 1]}) is not under the peak (${arc.peakMi})`,
      );
    }
  }
});

Deno.test('the peak week is never a recovery cutback, at any plan length', () => {
  // Every 4th rung is a dip. Finishing the build on one would taper off a deloaded number.
  for (const distance of DISTANCES) {
    for (const level of LEVELS) {
      for (let weeks = 5; weeks <= 24; weeks++) {
        for (const entry of [null, 6, 10, 18]) {
          const arc = buildLongRunArc({ distance, fitness: level, durationWeeks: weeks, entryLongRunMi: entry })!;
          const peak = arc.weeks[arc.peakWeek - 1];
          const before = arc.weeks[arc.peakWeek - 2];
          if (before != null) {
            assert(
              peak >= before,
              `${distance}/${level} ${weeks}wk entry ${entry}: build ended on a cutback (${before} → ${peak})`,
            );
          }
        }
      }
    }
  }
});

Deno.test('a plan LONGER than its row repeats the opening rung, it does not run off the end', () => {
  const arc = buildLongRunArc({ distance: 'marathon', fitness: 'beginner', durationWeeks: 24 })!;
  assertEquals(arc.weeks.length, 24);
  assertEquals(arc.weeks[0], LONG_RUN_PROGRESSION.marathon.beginner[0]);
  assertEquals(arc.reachesTableMax, true);
  assert(arc.weeks[23] < arc.peakMi, 'race week must still taper on a long plan');
});

Deno.test('a fitter athlete enters the row higher, and still peaks before race day', () => {
  const green = buildLongRunArc({ distance: 'marathon', fitness: 'beginner', durationWeeks: 12, entryLongRunMi: 6 })!;
  const seasoned = buildLongRunArc({ distance: 'marathon', fitness: 'beginner', durationWeeks: 12, entryLongRunMi: 12 })!;
  assert(seasoned.weeks[0] >= green.weeks[0], 'a 12-mile long run must not open below a 6-mile one');
  assert(seasoned.maxMi > green.maxMi, 'the same 12 weeks must reach further from a higher base');
  assertEquals(seasoned.peakWeek, green.peakWeek);
});

Deno.test('⛔ the peak week is read off the RACE DATE — 15 days out or more, never inside the clamp', () => {
  // Michael's case: plan opens Monday 2026-08-10, race Sunday 2026-10-11.
  const peakWeek = longRunPeakWeek({ durationWeeks: 10, startDateISO: '2026-08-10', raceDateISO: '2026-10-11' });
  const DAY = 24 * 60 * 60 * 1000;
  const longRun = new Date('2026-08-10T00:00:00').getTime() + ((peakWeek - 1) * 7 + 6) * DAY;
  const daysOut = Math.floor((new Date('2026-10-11T00:00:00').getTime() - longRun) / DAY);
  assert(daysOut > 14 && daysOut <= 21, `peak long run landed ${daysOut} days out, wanted 15-21`);
});

Deno.test('no dates → a two-week taper; no table → silence, not a guess', () => {
  assertEquals(longRunPeakWeek({ durationWeeks: 12 }), 10);
  assertEquals(buildLongRunArc({ distance: 'ultra', fitness: 'beginner', durationWeeks: 12 }), null);
  assertEquals(longRunCeiling('marathon', 'elite', 12), null);
});

Deno.test('⛔ the intake quotes the peak the ENGINE builds — same rule, same week, same rung', () => {
  // The screen calls `longRunCeiling`, the generator calls `buildLongRunArc` with `longRunPeakWeek`.
  // If these two ever disagree, the athlete is told a plan we did not build.
  const dates = { startDateISO: '2026-08-10', raceDateISO: '2026-10-11' };
  const quoted = longRunCeiling('marathon', 'beginner', 10, 6, dates)!;
  const built = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 10, entryLongRunMi: 6,
    peakWeek: longRunPeakWeek({ durationWeeks: 10, ...dates }),
  })!;
  assertEquals(quoted.peakLongRunMi, built.maxMi);
  assertEquals(quoted.peakWeek, built.peakWeek);
  assertEquals(quoted.shortOfTable, !built.reachesTableMax);
});
