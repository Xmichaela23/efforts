/**
 * The zone tables Profile / Baselines print, one copy each (2026-09-10, audit H-B05, H-B06), and the one rule a
 * session's time in zone is counted by (2026-09-26).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/endurance/display-zones.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { frielRunZones, easyCeilingBpm } from '../../../../src/lib/friel-zones.ts';
import {
  frielHrZoneRows,
  hrZoneBinText,
  hrZoneSetFromAnchor,
  hrZoneSport,
  maxHrZoneRows,
  parsePaceClock,
  powerZoneBinText,
  powerZoneRows,
  powerZoneTopsW,
  swimPaceBandRows,
  timeInZones,
} from './display-zones.ts';

/** Ten seconds at one reading, the way a ride's 1 Hz series reaches `timeInZones`. */
const tenSecondsAt = (v: number) => ({ values: Array.from({ length: 11 }, () => v), times: Array.from({ length: 11 }, (_, i) => i) });
const zoneOf = (v: number, tops: number[]): number => {
  const { values, times } = tenSecondsAt(v);
  return timeInZones(values, times, tops)!.findIndex((s) => s > 0);
};

// ── counting ────────────────────────────────────────────────────────────────────────────────────

Deno.test('counting: a top is in its zone, the last zone is open, a gap counts nowhere, ten readings or none', () => {
  const tops = [100, 150];
  assertEquals([zoneOf(0, tops), zoneOf(100, tops), zoneOf(100.4, tops), zoneOf(150, tops), zoneOf(151, tops), zoneOf(900, tops)], [0, 0, 1, 1, 2, 2]);
  // Each reading takes the seconds since the one before it; a missing or negative reading counts nowhere.
  assertEquals(timeInZones([90, 90, null, 120, -5, 160, 160, 160, 160, 160, 160], [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 12], tops), [1, 2, 7]);
  assertEquals(timeInZones([90, 90, 90], [0, 1, 2], tops), null);
});

// ── power ───────────────────────────────────────────────────────────────────────────────────────

Deno.test('power: Coggan\'s seven levels at FTP 250 — each top included, the next level from the next whole watt', () => {
  assertEquals(powerZoneRows(250).map((r) => [r.name, r.range]), [
    ['Z1 Recovery', '0-137W'],
    ['Z2 Endurance', '138-187W'],
    ['Z3 Tempo', '188-225W'],
    ['Z4 Threshold', '226-262W'],
    ['Z5 VO2max', '263-300W'],
    ['Z6 Anaerobic', '301-375W'],
    ['Z7 Neuromuscular', '> 375W'],
  ]);
  assertEquals(powerZoneRows(0), []);
  assertEquals(powerZoneRows(Number.NaN), []);
});

Deno.test('power: the audited ride\'s FTP 168 — Z2 is 93-126W on Profile and on the ride', () => {
  assertEquals(powerZoneRows(168).map((r) => r.range), ['0-92W', '93-126W', '127-151W', '152-176W', '177-201W', '202-252W', '> 252W']);
  const ftp = 263;
  assertEquals(powerZoneTopsW(ftp), [144.65, 197.25, 236.7, 276.15, 315.6, 394.5]);
  assertEquals(powerZoneTopsW(120), [66, 90, 108, 126, 144, 180]);
});

Deno.test('power: every whole watt is counted in the level Profile prints it in, and in the level its share of FTP names', () => {
  const pctTops = [55, 75, 90, 105, 120, 150];
  for (const ftp of [97, 120, 168, 200, 237.5, 250, 263, 301, 350]) {
    const rows = powerZoneRows(ftp);
    const tops = powerZoneTopsW(ftp);
    for (let w = 0; w <= Math.ceil(ftp * 1.8); w++) {
      const z = zoneOf(w, tops);
      const r = rows[z];
      assertEquals(w >= (r.low_w as number) && (r.high_w == null || w <= r.high_w), true, `FTP ${ftp}, ${w} W counted in ${r.name} (${r.range})`);
      // Its level by the printed table, compared in whole numbers (w × 100 against pct × FTP), no division.
      let byTable = 0;
      while (byTable < pctTops.length && w * 100 > pctTops[byTable] * ftp) byTable++;
      assertEquals(z, byTable, `FTP ${ftp}, ${w} W is ${((w / ftp) * 100).toFixed(2)}% of FTP`);
    }
  }
});

Deno.test('power bins: a ride counted now prints Profile\'s rows at its FTP; one counted before prints its own watts', () => {
  // As compute-workout-analysis stores a ride now: each bin carries the level's whole watts, and the FTP.
  const rows = powerZoneRows(168);
  const bins = rows.map((r, i) => ({ i, t_s: 60 * (i + 1), min: r.low_w, max: r.high_w }));
  assertEquals(powerZoneBinText({ schema: 'ftp-based', bins, ftp_w: 168 }), rows.map((r) => ({ name: r.name, range: r.range })));
  // As a ride counted before 2026-09-26 is stored: each level opened AT the level below's top, rounded, top max null.
  const old = [0, 92, 126, 151, 176, 202, 252, null];
  const oldBins = old.slice(0, -1).map((min, i) => ({ i, t_s: 60, min, max: old[i + 1] }));
  assertEquals(powerZoneBinText({ schema: 'ftp-based', bins: oldBins }).map((t) => t.range), ['< 92W', '92-126W', '126-151W', '151-176W', '176-202W', '202-252W', '> 252W']);
  // Not the seven levels: no words.
  assertEquals(powerZoneBinText({ schema: 'auto-range', bins }), []);
  assertEquals(powerZoneBinText({ schema: 'ftp-based', bins: oldBins.slice(0, 6) }), []);
  assertEquals(powerZoneBinText({ schema: 'ftp-based', bins: oldBins.map((b, i) => (i === 3 ? { ...b, min: null } : b)) }), []);
  assertEquals(powerZoneBinText(null), []);
});

// ── heart rate ──────────────────────────────────────────────────────────────────────────────────

Deno.test('heart rate: Friel\'s cycling zones at the audited ride\'s threshold, 153 bpm', () => {
  assertEquals(frielHrZoneRows(153, 'ride').map((r) => [r.name, r.range]), [
    ['Zone 1', '123 bpm and under'],
    ['Zone 2', '124–136 bpm'],
    ['Zone 3', '137–143 bpm'],
    ['Zone 4', '144–152 bpm'],
    ['Zone 5a', '153–157 bpm'],
    ['Zone 5b', '158–163 bpm'],
    ['Zone 5c', '164 bpm and up'],
  ]);
});

Deno.test('heart rate: Friel\'s running zones at 151 bpm — zones 1–4 are the five-zone table the easy band uses', () => {
  assertEquals(frielHrZoneRows(151, 'run').map((r) => [r.min, r.max]), [[0, 127], [128, 134], [135, 142], [143, 150], [151, 155], [156, 161], [162, null]]);
  for (let lthr = 101; lthr <= 210; lthr++) {
    const seven = frielHrZoneRows(lthr, 'run');
    const five = frielRunZones(lthr);
    for (let i = 0; i < 4; i++) assertEquals([seven[i].min, seven[i].max], [five[i].min, five[i].max], `LTHR ${lthr} zone ${i + 1}`);
    assertEquals(seven[4].min, five[4].min, `LTHR ${lthr}: zone 5a opens where zone 5 did`);
  }
});

Deno.test('heart rate: Friel by sport — the bike opens zone 2 at 81% and zone 4 at 94%, the run at 85% and 95%', () => {
  for (let lthr = 101; lthr <= 210; lthr++) {
    for (const sport of ['run', 'ride'] as const) {
      const rows = frielHrZoneRows(lthr, sport);
      const pct = sport === 'ride' ? { z2: 0.81, z4: 0.94 } : { z2: 0.85, z4: 0.95 };
      assertEquals(rows.map((r) => r.name), ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5a', 'Zone 5b', 'Zone 5c']);
      assertEquals(rows[1].min, Math.round(lthr * pct.z2), `${sport} ${lthr} zone 2`);
      // Zone 3 opens one beat above the easy ceiling (89%, D-286) in both sports.
      assertEquals(rows[2].min, easyCeilingBpm(lthr) + 1, `${sport} ${lthr} zone 3`);
      assertEquals(rows[3].min, Math.round(lthr * pct.z4), `${sport} ${lthr} zone 4`);
      assertEquals([rows[4].min, rows[5].min, rows[6].min], [lthr, Math.round(lthr * 1.03), Math.round(lthr * 1.07)]);
      // One beat after another, no gap and no overlap; zone 1 from 0, zone 5c open.
      assertEquals(rows[0].min, 0);
      assertEquals(rows[6].max, null);
      for (let i = 1; i < rows.length; i++) assertEquals(rows[i].min, (rows[i - 1].max as number) + 1, `${sport} ${lthr} ${rows[i].name}`);
    }
  }
});

Deno.test('heart rate: % of max heart rate — Garmin\'s 60 / 70 / 80 / 90% seams, five zones', () => {
  assertEquals(maxHrZoneRows(176).map((r) => [r.name, r.range]), [
    ['Zone 1', '105 bpm and under'],
    ['Zone 2', '106–122 bpm'],
    ['Zone 3', '123–140 bpm'],
    ['Zone 4', '141–157 bpm'],
    ['Zone 5', '158 bpm and up'],
  ]);
});

Deno.test('heart rate: every beat is counted in the zone the table prints it in', () => {
  for (const set of [hrZoneSetFromAnchor('friel-ride', 153, 'ride'), hrZoneSetFromAnchor('friel-run', 172, 'run'), hrZoneSetFromAnchor('max-hr', 181, 'run')]) {
    for (let bpm = 40; bpm <= 230; bpm++) {
      const r = set.rows[zoneOf(bpm, set.tops)];
      assertEquals(bpm >= r.min && (r.max == null || bpm <= r.max), true, `${set.schema}: ${bpm} bpm counted in ${r.name} (${r.range})`);
    }
  }
});

Deno.test('heart-rate bins: a session counted now prints its set\'s rows; one counted before prints its own beats', () => {
  const set = hrZoneSetFromAnchor('friel-ride', 153, 'ride');
  const bins = set.rows.map((r, i) => ({ i, t_s: 60, min: r.min, max: r.max }));
  assertEquals(hrZoneBinText({ schema: set.schema, anchor_bpm: 153, bins }), set.rows.map((r) => ({ name: r.name, range: r.range })));
  // The audited ride as it was stored: Strava's automatic table, each bin from its first beat to the next bin's.
  const strava = [0, 110, 137, 150, 164, 220];
  const oldBins = strava.slice(0, -1).map((min, i) => ({ i, t_s: 60, min, max: strava[i + 1] }));
  assertEquals(hrZoneBinText({ schema: 'configured:strava:zones', bins: oldBins }), [
    { name: 'Zone 1', range: '109 bpm and under' },
    { name: 'Zone 2', range: '110–136 bpm' },
    { name: 'Zone 3', range: '137–149 bpm' },
    { name: 'Zone 4', range: '150–163 bpm' },
    { name: 'Zone 5', range: '164 bpm and up' },
  ]);
  assertEquals(hrZoneBinText(null), []);
  assertEquals(hrZoneBinText({ bins: [] }), []);
});

Deno.test('heart rate: a ride uses the bike\'s numbers, every other session the run\'s', () => {
  assertEquals(['ride', 'Ride', 'virtual_ride', 'bike', 'cycling', 'run', 'walk', 'swim', null].map(hrZoneSport),
    ['ride', 'ride', 'ride', 'ride', 'ride', 'run', 'run', 'run', 'run']);
});

// ── swim ────────────────────────────────────────────────────────────────────────────────────────

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
