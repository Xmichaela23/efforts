/**
 * Tests for cycling segment ingestion helpers (design Build Order #6).
 *
 * Run: deno test supabase/functions/_shared/cycling-v1/segments.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectClimbSegments, parseStravaSegmentEfforts, segmentKey } from './segments.ts';

Deno.test('segmentKey: normalized name + 50 m distance bucket', () => {
  assertEquals(segmentKey('Old La Honda', 5300), 'old-la-honda|5300');
  assertEquals(segmentKey('Old  La,Honda!', 5310), 'old-la-honda|5300'); // punctuation + bucket
  assertEquals(segmentKey('', 0), 'segment|0');
  assertEquals(segmentKey(null, null), 'segment|0');
});

Deno.test('parseStravaSegmentEfforts: stringified achievements → records; tolerant', () => {
  const ach = JSON.stringify({
    segment_efforts: [
      { name: 'Climb', distance: 3200, elapsed_time: 600, moving_time: 590, average_watts: 250, average_heartrate: 162, segment: { id: 12345 } },
      { name: 'Sprint', distance: 200, elapsed_time: 20 },
    ],
  });
  const r = parseStravaSegmentEfforts(ach);
  assertEquals(r.length, 2);
  assertEquals(r[0].source, 'strava');
  assertEquals(r[0].segment_key, 'climb|3200');
  assertEquals(r[0].segment_id, '12345'); // captured from e.segment.id
  assertEquals(r[0].avg_power_w, 250);
  assertEquals(r[0].avg_hr_bpm, 162);
  assertEquals(r[1].segment_id, null); // absent → null (fingerprint-only match)
  assertEquals(r[1].avg_power_w, null);
});

Deno.test('parseStravaSegmentEfforts: prefers explicit segment_id; null/junk → []', () => {
  assertEquals(
    parseStravaSegmentEfforts(JSON.stringify({ segment_efforts: [{ name: 'X', distance: 100, segment_id: 999 }] }))[0].segment_id,
    '999',
  );
  assertEquals(parseStravaSegmentEfforts(null), []);
  assertEquals(parseStravaSegmentEfforts('not json'), []);
  assertEquals(parseStravaSegmentEfforts(JSON.stringify({ best_efforts: [{}] })), []); // no segment_efforts
});

Deno.test('detectClimbSegments: one sustained climb → one record (gain + VAM)', () => {
  // 600 s at 6% grade, +300 m.
  const t = Array.from({ length: 601 }, (_, i) => i);
  const elev = t.map((_, i) => 100 + i * 0.5);
  const grade = t.map(() => 6);
  const r = detectClimbSegments(t, elev, grade);
  assertEquals(r.length, 1);
  assertEquals(r[0].source, 'garmin_climb');
  assertEquals(r[0].climb_gain_m, 300);
  assertEquals(r[0].climb_vam_m_per_h, 1800); // 300/600*3600
  assertEquals(r[0].elapsed_time_s, 600);
  assert(r[0].segment_key.startsWith('climb|'));
  assert((r[0].segment_name ?? '').includes('300'));
});

Deno.test('detectClimbSegments: flat / below-threshold → none', () => {
  const t = Array.from({ length: 400 }, (_, i) => i);
  assertEquals(detectClimbSegments(t, t.map(() => 100), t.map(() => 0)), []); // flat
  // steep but short (59 s) and small gain → below 30 m / 120 s
  const st = Array.from({ length: 60 }, (_, i) => i);
  assertEquals(detectClimbSegments(st, st.map((_, i) => 100 + i * 0.3), st.map(() => 8)), []);
});

Deno.test('detectClimbSegments: two separated climbs → two records', () => {
  // climb A (0-600s, +300m @6%), flat (600-900s), climb B (900-1400s, +250m @5%)
  const t = Array.from({ length: 1401 }, (_, i) => i);
  const elev: number[] = [];
  const grade: number[] = [];
  for (let i = 0; i <= 1400; i++) {
    if (i <= 600) { elev.push(100 + i * 0.5); grade.push(6); }
    else if (i <= 900) { elev.push(400); grade.push(0); }
    else { elev.push(400 + (i - 900) * 0.5); grade.push(5); }
  }
  const r = detectClimbSegments(t, elev, grade);
  assertEquals(r.length, 2);
  assertEquals(r[0].climb_gain_m, 300);
  assertEquals(r[1].climb_gain_m, 250);
});
