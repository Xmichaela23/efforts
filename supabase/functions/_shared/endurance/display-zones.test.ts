/**
 * The zone tables Profile prints, one copy each (2026-09-10, audit H-B05, H-B06).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/endurance/display-zones.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parsePaceClock, powerZoneBoundaries, powerZoneRows, swimPaceBandRows } from './display-zones.ts';

Deno.test('power: Coggan\'s seven levels at FTP 250', () => {
  assertEquals(powerZoneRows(250).map((r) => [r.name, r.range]), [
    ['Z1 Recovery', '< 138W'],
    ['Z2 Endurance', '140-188W'],
    ['Z3 Tempo', '190-225W'],
    ['Z4 Threshold', '228-263W'],
    ['Z5 VO2max', '265-300W'],
    ['Z6 Anaerobic', '303-375W'],
    ['Z7 Neuromuscular', '> 375W'],
  ]);
  assertEquals(powerZoneRows(0), []);
  assertEquals(powerZoneRows(Number.NaN), []);
});

Deno.test('power: the bin edges are the ones compute-workout-analysis used', () => {
  const ftp = 263;
  assertEquals(powerZoneBoundaries(ftp), [0, ftp * 0.55, ftp * 0.75, ftp * 0.90, ftp * 1.05, ftp * 1.20, ftp * 1.50, Infinity]);
});

Deno.test('swim: the five bands Profile printed, from a 1:45 threshold 100', () => {
  assertEquals(swimPaceBandRows(parsePaceClock('1:45')!), [
    { label: 'Recovery', range: '1:57 and slower', anchor: false },
    { label: 'Easy', range: '1:53–1:57', anchor: false },
    { label: 'Moderate', range: '1:48–1:53', anchor: false },
    { label: 'Threshold', range: '1:43–1:48', anchor: true },
    { label: 'Hard', range: '1:43 and faster', anchor: false },
  ]);
  assertEquals(parsePaceClock('abc'), null);
  assertEquals(parsePaceClock(null), null);
  assertEquals(swimPaceBandRows(0), []);
});
