import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { capRollupTone, severityOfVerdict } from './severity.ts';

Deno.test('a decline is a direction, not an alarm', () => {
  assertEquals(severityOfVerdict('sliding'), 'neutral');
  assertEquals(severityOfVerdict('holding'), 'neutral');
  assertEquals(severityOfVerdict('improving'), 'positive');
});

Deno.test('THE BUG: rollup cannot out-alarm neutral contributors', () => {
  // run sliding + bike holding -> both render neutral -> rollup capped to neutral
  assertEquals(capRollupTone('warning', ['sliding', 'holding']), 'neutral');
  assertEquals(capRollupTone('danger', ['sliding', 'holding']), 'neutral');
});

Deno.test('a rollup may be LESS severe than its contributors', () => {
  assertEquals(capRollupTone('neutral', ['sliding']), 'neutral');
});

Deno.test('positive is a valence, not a severity — never flattened', () => {
  assertEquals(capRollupTone('positive', ['improving', 'holding']), 'positive');
  assertEquals(capRollupTone('positive', ['sliding']), 'positive');
});

Deno.test('no contributors = no evidence for alarm', () => {
  assertEquals(capRollupTone('warning', []), 'neutral');
});
