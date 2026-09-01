/**
 * THE CHANGE-RULE LINE — what prints, and the two cases that print NOTHING. [2026-09-01]
 *
 *   deno test --allow-read src/lib/week-change-line.test.ts --no-check
 *
 * ⛔ THE SILENCE IS THE FIXTURE. "Nothing printed when nothing moved" was the approved contract; a
 * line that appears with no buckets in it, or appears over a window with no base, is the defect.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekChangeParts, type ViadaWeekChange } from './week-change-line.ts';

const label = (kind: string, key: string) => (key ? `${key} ${kind}` : kind);
const base = { priorSince: '2026-08-19', priorUntil: '2026-08-25' };

Deno.test('a bucket over the line prints, signed, with a real minus', () => {
  const change: ViadaWeekChange = {
    ...base, comparable: true,
    moved: [
      { kind: 'muscle_sets', key: 'chest', from: 11, to: 13, pctChange: 18 },
      { kind: 'pattern_speed', key: 'hip_dominant', from: 17, to: 15, pctChange: -12 },
    ],
  };
  assertEquals(weekChangeParts(change, label), ['chest muscle_sets +18%', 'hip_dominant pattern_speed −12%']);
});

Deno.test('⛔ NOTHING MOVED → NOTHING PRINTS (comparable, empty list)', () => {
  assertEquals(weekChangeParts({ ...base, comparable: true, moved: [] }, label), null);
});

Deno.test('⛔ NO PRIOR WORK → NOTHING PRINTS — "nothing moved" would be the wrong sentence', () => {
  assertEquals(weekChangeParts({ ...base, comparable: false, moved: [] }, label), null);
});

Deno.test('an old payload with no field → nothing prints', () => {
  assertEquals(weekChangeParts(undefined, label), null);
  assertEquals(weekChangeParts(null, label), null);
});

Deno.test('a −100 (bucket dropped to nothing) prints as −100%', () => {
  const change: ViadaWeekChange = {
    ...base, comparable: true,
    moved: [{ kind: 'muscle_sets', key: 'triceps', from: 6, to: 0, pctChange: -100 }],
  };
  assertEquals(weekChangeParts(change, label), ['triceps muscle_sets −100%']);
});
