/**
 * Q-113 — the race anchor earns its place in the narrator's facts only inside the recovery window.
 * Beyond it, the day-count never leaves the data, so the LLM can't recite "71 days post-marathon"
 * (the prompt rule alone didn't hold). Fix lives in the FACT, not the prompt.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/arc-narrative-ai-appendix.test.ts --no-check
 */

import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { arcNarrativeFactBlock, raceAnchorStillRelevant, RACE_ANCHOR_RELEVANCE_DAYS } from './arc-narrative-ai-appendix.ts';

function nc(daysSince: number | null, hasRace = true): any {
  return {
    focus_date: '2026-07-03',
    mode: 'maintenance', // NOT recovery_read (that's ~14d; irrelevant here — the gate is day-based)
    plan_phase_normalized: 'base',
    last_goal_race: hasRace ? { name: 'Marathon', distance: 'marathon', target_date: '2026-04-23' } : null,
    days_since_last_goal_race: daysSince,
    runs_since_last_race: 12,
    next_primary_goal: null,
  };
}

Deno.test('Michael: race DROPPED at 71 days — no day-count reaches the model', () => {
  const block = arcNarrativeFactBlock(nc(71));
  assertStringIncludes(block, 'LAST_GOAL_RACE=null');
  assert(!block.includes('days_since'), 'no day-count should leak: ' + block);
});

Deno.test('race KEPT inside the recovery window (20 days)', () => {
  const block = arcNarrativeFactBlock(nc(20));
  assertStringIncludes(block, 'days_since=20');
  assertStringIncludes(block, 'LAST_GOAL_RACE=Marathon');
});

Deno.test(`boundary: ${RACE_ANCHOR_RELEVANCE_DAYS} days kept, +1 dropped`, () => {
  assert(raceAnchorStillRelevant(nc(RACE_ANCHOR_RELEVANCE_DAYS)));
  assert(!raceAnchorStillRelevant(nc(RACE_ANCHOR_RELEVANCE_DAYS + 1)));
});

Deno.test('no race → null (unchanged)', () => {
  assertStringIncludes(arcNarrativeFactBlock(nc(null, false)), 'LAST_GOAL_RACE=null');
});

Deno.test('null day-count with a race → treated as not-relevant (no crash)', () => {
  assert(!raceAnchorStillRelevant(nc(null, true)));
});
