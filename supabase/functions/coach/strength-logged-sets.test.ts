/**
 * "from your logged sets" + "your best sets", split by the coach (audit 2026-09-10, H-S20).
 *
 *   ~/.deno/bin/deno test -A --no-check supabase/functions/coach/strength-logged-sets.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildStrengthLoggedSets } from './strength-logged-sets.ts';
import type { LoggedLift } from '../_shared/state-trend/logged-sets.ts';

const logged = (canonical: string, sessions: number, weight: number | null): LoggedLift => ({
  canonical, displayName: canonical, sessions,
  recent: [{ date: '2026-09-01', weight: weight ?? 0, reps: 5, e1rm: 100, best: true }],
  heaviest: weight ? { date: '2026-09-01', weight, reps: 5 } : null,
});

Deno.test('no history on the snapshot → nothing to print', () => {
  assertEquals(buildStrengthLoggedSets(undefined, [{ canonical_name: 'squat', sufficient: true }]), null);
});

Deno.test('main: sufficient AND coached, in the per-lift order; a main lift with no logged row keeps an empty list', () => {
  const out = buildStrengthLoggedSets(
    [logged('squat', 6, 205), logged('dumbbell_curl', 4, 35)],
    [
      { canonical_name: 'bench_press', sufficient: false },
      { canonical_name: 'deadlift', sufficient: true },
      { canonical_name: 'dumbbell_curl', sufficient: true },
      { canonical_name: 'squat', sufficient: true },
    ],
  )!;
  assertEquals(out.main.map((m) => [m.canonical, m.display_name, m.sets.length]), [['deadlift', 'Deadlift', 0], ['squat', 'Back Squat', 1]]);
  assertEquals(out.others.map((o) => o.canonical), ['dumbbell_curl']);
});

Deno.test('others: not main, a weight logged, most-logged first, at most eight', () => {
  const lifts = Array.from({ length: 11 }, (_, i) => logged(`accessory_${i}`, i + 2, i === 3 ? null : 20 + i));
  const out = buildStrengthLoggedSets(lifts, [])!;
  assertEquals(out.main, []);
  assertEquals(out.others.length, 8);
  assertEquals(out.others.map((o) => o.sessions), [12, 11, 10, 9, 8, 7, 6, 4]);
  assertEquals(out.others[0], { canonical: 'accessory_10', display_name: out.others[0].display_name, weight: 30, reps: 5, sessions: 12 });
});
