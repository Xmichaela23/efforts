// Swim VOLUME facts — the described-not-graded swim row. Run: deno test --no-check swim-volume.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { swimVolumeFacts } from './assemble.ts';

const rows = (pairs: Array<[string, number]>) => pairs.map(([date, distance_m]) => ({ date, distance_m }));

Deno.test('counts swims, sums distance, finds the longest — all in-window', () => {
  const v = swimVolumeFacts(
    rows([['2026-07-01', 1800], ['2026-07-08', 2000], ['2026-07-14', 1500]]),
    '2026-07-16',
    56,
  );
  assertEquals(v, { swims: 3, totalDistanceM: 5300, longestM: 2000, windowDays: 56 });
});

Deno.test('drops rows outside the window (older than asOf − windowDays and future rows)', () => {
  const v = swimVolumeFacts(
    rows([['2026-05-01', 9999], ['2026-07-10', 2000], ['2026-07-20', 3000]]), // May = >56d old; Jul 20 = future
    '2026-07-16',
    56,
  );
  assertEquals(v, { swims: 1, totalDistanceM: 2000, longestM: 2000, windowDays: 56 });
});

Deno.test('ignores rows with no/zero/negative distance', () => {
  const v = swimVolumeFacts(
    [{ date: '2026-07-10', distance_m: 2000 }, { date: '2026-07-11', distance_m: 0 }, { date: '2026-07-12', distance_m: null }, { date: '2026-07-13' } as { date: string; distance_m?: number }],
    '2026-07-16',
    56,
  );
  assertEquals(v, { swims: 1, totalDistanceM: 2000, longestM: 2000, windowDays: 56 });
});

Deno.test('no swims → zeroes, never a crash on empty/null', () => {
  assertEquals(swimVolumeFacts([], '2026-07-16', 56), { swims: 0, totalDistanceM: 0, longestM: 0, windowDays: 56 });
  assertEquals(swimVolumeFacts(null, '2026-07-16', 56), { swims: 0, totalDistanceM: 0, longestM: 0, windowDays: 56 });
});
