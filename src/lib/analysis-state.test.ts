import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  analysisState,
  analysisFailureLine,
  analysisNeedsAttention,
  describeRecomputeError,
  splitStepError,
  STALLED_AFTER_MS,
} from './analysis-state.ts';

const now = Date.parse('2026-09-07T12:00:00Z');

Deno.test('failed reads as failed; complete as complete; a planned row is nothing', () => {
  assertEquals(analysisState({ analysis_status: 'failed' }, now), 'failed');
  assertEquals(analysisState({ analysis_status: 'complete' }, now), 'complete');
  assertEquals(analysisState({ analysis_status: 'failed', workout_status: 'planned' }, now), null);
  assertEquals(analysisState({}, now), null);
});

Deno.test('analyzing / pending inside 10 minutes is live; older, or unstamped, is stalled', () => {
  assertEquals(STALLED_AFTER_MS, 10 * 60 * 1000);
  assertEquals(analysisState({ analysis_status: 'analyzing', analysis_updated_at: '2026-09-07T11:55:00Z' }, now), 'analyzing');
  assertEquals(analysisState({ analysis_status: 'pending', analysis_updated_at: '2026-09-07T11:51:00Z' }, now), 'pending');
  assertEquals(analysisState({ analysis_status: 'analyzing', analysis_updated_at: '2026-09-07T11:50:00Z' }, now), 'stalled');
  assertEquals(analysisState({ analysis_status: 'analyzing', analysis_updated_at: '2026-09-01T00:00:00Z' }, now), 'stalled');
  assertEquals(analysisState({ analysis_status: 'analyzing' }, now), 'stalled');
});

Deno.test('the card line: step + reason in plain words; stalled says did not finish', () => {
  assertEquals(analysisFailureLine({ analysis_status: 'failed', analysis_error: 'summary: compute-workout-summary timed out' }, now), 'Analysis failed at the summary: compute-workout-summary timed out.');
  assertEquals(analysisFailureLine({ analysis_status: 'failed', analysis_error: 'analyze: HTTP 546: WORKER_LIMIT' }, now), 'Analysis failed at the sport read: WORKER_LIMIT.');
  assertEquals(analysisFailureLine({ analysis_status: 'failed', analysis_error: 'Workout not found' }, now), 'Analysis failed: Workout not found.');
  assertEquals(analysisFailureLine({ analysis_status: 'failed' }, now), 'Analysis failed.');
  assertEquals(analysisFailureLine({ analysis_status: 'analyzing', analysis_updated_at: '2026-09-07T11:00:00Z' }, now), 'Analysis did not finish.');
  assertEquals(analysisFailureLine({ analysis_status: 'complete' }, now), null);
});

Deno.test('the dot: failed or stalled only', () => {
  assertEquals(analysisNeedsAttention({ analysis_status: 'failed' }, now), true);
  assertEquals(analysisNeedsAttention({ analysis_status: 'analyzing' }, now), true);
  assertEquals(analysisNeedsAttention({ analysis_status: 'analyzing', analysis_updated_at: '2026-09-07T11:59:00Z' }, now), false);
  assertEquals(analysisNeedsAttention({ analysis_status: 'complete' }, now), false);
});

Deno.test('splitStepError only trusts known steps', () => {
  assertEquals(splitStepError('facts: boom'), { step: 'facts', reason: 'boom' });
  assertEquals(splitStepError('Error: boom'), { step: null, reason: 'Error: boom' });
});

Deno.test('the tap error uses the same words', () => {
  assertEquals(describeRecomputeError(JSON.stringify({ ok: false, error: 'facts: compute-facts 500' }), 'x'), 'Analysis failed at the facts: compute-facts 500.');
  assertEquals(describeRecomputeError('', 'Edge Function returned a non-2xx status code'), 'Analysis failed: the server did not answer.');
  assertEquals(describeRecomputeError(JSON.stringify({ error: 'Workout not found' }), 'x'), 'Analysis failed: Workout not found.');
});
