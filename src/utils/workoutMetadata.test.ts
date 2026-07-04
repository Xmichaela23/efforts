import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readinessSorenessPatch } from './workoutMetadata.ts';

// The assertion Michael asked for: an unanswered popup produces NO soreness entry.
Deno.test('unanswered / skipped popup writes NOTHING (no default, no zero)', () => {
  assertEquals(readinessSorenessPatch({}, null), null);
  assertEquals(readinessSorenessPatch({ session_rpe: 5 }, null), null);
  assertEquals(readinessSorenessPatch(undefined, null), null);
});
Deno.test('explicit 1–7 tap writes soreness, merges without clobbering other keys', () => {
  const p = readinessSorenessPatch({ session_rpe: 5, readiness: { sleep: 7 } }, 4);
  assertEquals(p?.readiness?.soreness, 4);
  assertEquals(p?.readiness?.sleep, 7);   // preserved
  assertEquals(p?.session_rpe, 5);        // preserved
});
Deno.test('zero is never synthesized — only an explicit value flows through', () => {
  // a real tap of 1 (valid Hooper min) writes 1; null still writes nothing
  assertEquals(readinessSorenessPatch({}, 1)?.readiness?.soreness, 1);
  assertEquals(readinessSorenessPatch({}, null), null);
});
