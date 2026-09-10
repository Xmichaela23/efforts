/**
 * My Record's personal-records card (2026-09-10, audit H-B11).
 *
 * `oldMarathon` is the phone's pick from `AthleticRecordPage.tsx` at ab40b9d2, copied before it was deleted:
 * the first goal in a newest-first list whose distance (or name) matched /marathon|26\.2|42/. The fixtures
 * show the two ways it was wrong, and what the server sends instead.
 *
 * Run: deno test --no-check supabase/functions/athletic-record/record.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildAthleticRecord, type RecordGoalRow } from './record.ts';

const AS_OF = '2026-09-10';

function oldMarathon(goals: RecordGoalRow[]): number | null {
  const newestFirst = [...goals].sort((a, b) => String(b.target_date).localeCompare(String(a.target_date)));
  const r = newestFirst.find((x) => /marathon|26\.2|42/i.test(String(x.distance || x.name || '')) && x.current_value != null);
  return r?.current_value != null ? Math.round(r.current_value) : null;
}

const GOALS: RecordGoalRow[] = [
  { id: 'm-fast', name: 'Spring Marathon', target_date: '2025-04-12', distance: 'marathon', sport: 'run', current_value: 12600 },
  { id: 'm-slow', name: 'City Marathon', target_date: '2026-03-01', distance: 'Marathon', sport: 'run', current_value: 13500 },
  { id: 'half', name: 'Harbour Half', target_date: '2026-06-01', distance: 'Half Marathon', sport: 'run', current_value: 6010 },
  { id: 'half-2', name: 'Park Half', target_date: '2025-10-01', distance: 'half', sport: 'run', current_value: 5900 },
  { id: '10k', name: 'Turkey Trot', target_date: '2025-11-27', distance: '10K', sport: 'run', current_value: 2731.4 },
  { id: 'gran-fondo', name: 'Gran Fondo', target_date: '2024-07-01', distance: 'marathon', sport: 'ride', current_value: 20000 },
  { id: 'ultra', name: 'Trail 50', target_date: '2026-05-01', distance: 'ultra', sport: 'run', current_value: 30000 },
];

const RIDES = [
  { date: '2026-06-01', elapsed_time: 190, moving_time: 170 },
  { date: '2026-07-01', computed: { overall: { duration_s_elapsed: 15000 } } },
  { date: '2026-08-01', elapsed_time: 250 },
];

const FTP = [
  { value: 200, source_date: '2026-07-20' },
  { value: 214.6, source_date: '2026-08-10' },
  { value: 215, source_date: '2026-08-20' },
  { value: 212, source_date: '2026-08-31' },
  { value: 0, source_date: '2026-09-01' },
  { value: 230, source_date: null, created_at: null },
];

const BASELINES = {
  performance_numbers: { fiveK_pace: '7:10', squat: 200, swimPace100: '1:40' },
  learned_fitness: { ride_ftp_estimated: { value: 212, confidence: 'high' } },
  locked_baselines: null,
  updated_at: '2026-09-09T10:00:00Z',
};

Deno.test('each distance gets its fastest finish; a half marathon is not a marathon', () => {
  // The phone printed the most recent race matching the pattern — here the half marathon, 1:40:10.
  assertEquals(oldMarathon(GOALS), 6010);
  const rec = buildAthleticRecord({ goals: GOALS, ftpRows: FTP, rides: RIDES, baselines: BASELINES, asOf: AS_OF });
  assertEquals(rec.run_bests.marathon, { seconds: 12600, display: '3:30:00', date: '2025-04-12', goal_id: 'm-fast', name: 'Spring Marathon' });
  assertEquals(rec.run_bests.half?.goal_id, 'half-2');
  assertEquals(rec.run_bests.half?.display, '1:38:20');
  assertEquals(rec.run_bests['10k'], { seconds: 2731, display: '45:31', date: '2025-11-27', goal_id: '10k', name: 'Turkey Trot' });
});

Deno.test('FTP (best) is the highest on the dated trail, with its date — not the current FTP', () => {
  const rec = buildAthleticRecord({ goals: GOALS, ftpRows: FTP, rides: RIDES, baselines: BASELINES, asOf: AS_OF });
  assertEquals(rec.ftp_best, { watts: 215, date: '2026-08-10' });
  assertEquals(buildAthleticRecord({ goals: [], ftpRows: [], rides: [], baselines: BASELINES, asOf: AS_OF }).ftp_best, null);
});

Deno.test('longest ride, the typed 5K, the updated date and the empty card', () => {
  const rec = buildAthleticRecord({ goals: GOALS, ftpRows: FTP, rides: RIDES, baselines: BASELINES, asOf: AS_OF });
  assertEquals(rec.longest_ride, { seconds: 15000, display: '4:10:00', date: '2026-07-01' });
  assertEquals(rec.five_k_baseline, '7:10');
  assertEquals(rec.swim_pace_100.value, '1:40');
  assertEquals(rec.baselines_updated_at, '2026-09-09T10:00:00Z');
  assertEquals(rec.has_content, true);
  const empty = buildAthleticRecord({ goals: [], ftpRows: [], rides: [], baselines: null, asOf: AS_OF });
  assertEquals(empty.has_content, false);
  assertEquals(empty.lifts.every((l) => l.value == null && l.suggestion == null), true);
  // The current FTP alone still counts as content, as it did on the phone.
  assertEquals(buildAthleticRecord({ goals: [], ftpRows: [], rides: [], baselines: { learned_fitness: BASELINES.learned_fitness }, asOf: AS_OF }).has_content, true);
});
