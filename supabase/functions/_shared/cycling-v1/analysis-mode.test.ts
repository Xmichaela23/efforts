/**
 * Tests for cycling analysis-mode detection (Build Order #2,
 * docs/CYCLING-ANALYSIS-DESIGN.md).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-v1/analysis-mode.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyCyclingAnalysisMode, segmentEffortCount } from './analysis-mode.ts';

Deno.test('plan_intent (real prescription) → plan_linked, regardless of segments', () => {
  assertEquals(classifyCyclingAnalysisMode({ planIntent: 'threshold' }), 'plan_linked');
  assertEquals(
    classifyCyclingAnalysisMode({ planIntent: 'sweet_spot', segmentEffortCount: 5 }),
    'plan_linked',
  );
});

Deno.test("'unknown' / null / empty plan_intent is NOT plan-linked", () => {
  assertEquals(classifyCyclingAnalysisMode({ planIntent: 'unknown' }), 'unplanned_no_segments');
  assertEquals(classifyCyclingAnalysisMode({ planIntent: null }), 'unplanned_no_segments');
  assertEquals(classifyCyclingAnalysisMode({ planIntent: '' }), 'unplanned_no_segments');
  assertEquals(classifyCyclingAnalysisMode({}), 'unplanned_no_segments');
});

Deno.test('no prescription + ≥1 segment effort → unplanned_with_segments (Mode 3; Mode 4 folds in)', () => {
  assertEquals(
    classifyCyclingAnalysisMode({ planIntent: null, segmentEffortCount: 1 }),
    'unplanned_with_segments',
  );
  assertEquals(
    classifyCyclingAnalysisMode({ segmentEffortCount: 12 }),
    'unplanned_with_segments',
  );
});

Deno.test('no prescription + 0/negative/non-finite segments → unplanned_no_segments', () => {
  assertEquals(classifyCyclingAnalysisMode({ segmentEffortCount: 0 }), 'unplanned_no_segments');
  assertEquals(classifyCyclingAnalysisMode({ segmentEffortCount: -3 }), 'unplanned_no_segments');
  assertEquals(classifyCyclingAnalysisMode({ segmentEffortCount: NaN }), 'unplanned_no_segments');
});

Deno.test('segmentEffortCount: parses stringified achievements (Strava), tolerant of junk', () => {
  assertEquals(
    segmentEffortCount(JSON.stringify({ segment_efforts: [{ name: 'Climb' }, { name: 'Sprint' }] })),
    2,
  );
  assertEquals(segmentEffortCount({ segment_efforts: [{}, {}, {}] }), 3); // already parsed
  assertEquals(segmentEffortCount(null), 0); // Garmin: no segments
  assertEquals(segmentEffortCount(undefined), 0);
  assertEquals(segmentEffortCount('not json'), 0);
  assertEquals(segmentEffortCount(JSON.stringify({ best_efforts: [{}] })), 0); // no segment_efforts key
});

Deno.test('end-to-end: stringified Strava achievements drives Mode 3', () => {
  const achievements = JSON.stringify({ segment_efforts: [{ name: 'A' }] });
  assertEquals(
    classifyCyclingAnalysisMode({
      planIntent: null,
      segmentEffortCount: segmentEffortCount(achievements),
    }),
    'unplanned_with_segments',
  );
});
