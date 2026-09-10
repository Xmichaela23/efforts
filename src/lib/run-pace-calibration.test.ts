/**
 * The pace gate's pins moved with the rule to `supabase/functions/_shared/pace-benchmark.test.ts`
 * (2026-09-10, audit item 20). The calibration arithmetic's pins live in
 * `supabase/functions/save-baselines/derive.test.ts`.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/run-pace-calibration.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parsePaceInput } from './run-pace-calibration.ts';

Deno.test('an unparseable pace stays null rather than becoming zero', () => {
  assertEquals(parsePaceInput('0:00'), null);
  assertEquals(parsePaceInput('ten'), null);
  assertEquals(parsePaceInput('8:00'), 480);
});
