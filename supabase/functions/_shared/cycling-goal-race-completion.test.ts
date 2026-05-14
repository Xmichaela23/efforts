/**
 * Tests for cycling-specific goal-race completion detection — Tier 3 item 9 of the
 * running→cycling delta map (structural ship).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-goal-race-completion.test.ts --no-check --allow-read
 *
 * Two layers of coverage:
 *   §1 Pure distance classifiers — no DB mocking needed.
 *   §2 fetchCyclingGoalRaceCompletion — light Supabase stub covering the gate paths
 *      (sport mismatch, distance mismatch, no matching goal, matched + zones, matched
 *      without race_courses row).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fetchCyclingGoalRaceCompletion,
  isFullIronmanBikeDistance,
  isHalfIronmanBikeDistance,
} from './cycling-goal-race-completion.ts';

// ── §1 distance classifiers ────────────────────────────────────────────────

Deno.test('isHalfIronmanBikeDistance: accepts 80-100km window', () => {
  assertEquals(isHalfIronmanBikeDistance(90_000), true, '90km nominal');
  assertEquals(isHalfIronmanBikeDistance(80_000), true, '80km lower bound');
  assertEquals(isHalfIronmanBikeDistance(100_000), true, '100km upper bound');
  assertEquals(isHalfIronmanBikeDistance(85_500), true, '85.5km Lake Stevens-ish');
  assertEquals(isHalfIronmanBikeDistance(79_999), false, 'just below window');
  assertEquals(isHalfIronmanBikeDistance(100_001), false, 'just above window');
});

Deno.test('isHalfIronmanBikeDistance: handles invalid inputs', () => {
  assertEquals(isHalfIronmanBikeDistance(null), false);
  assertEquals(isHalfIronmanBikeDistance(0), false);
  assertEquals(isHalfIronmanBikeDistance(NaN), false);
  assertEquals(isHalfIronmanBikeDistance(-1000), false);
});

Deno.test('isFullIronmanBikeDistance: accepts 165-195km window', () => {
  assertEquals(isFullIronmanBikeDistance(180_000), true, '180km nominal');
  assertEquals(isFullIronmanBikeDistance(165_000), true, '165km lower bound');
  assertEquals(isFullIronmanBikeDistance(195_000), true, '195km upper bound');
  assertEquals(isFullIronmanBikeDistance(178_000), true, 'Lake Placid 2024 re-route');
  assertEquals(isFullIronmanBikeDistance(164_999), false, 'just below window');
  assertEquals(isFullIronmanBikeDistance(195_001), false, 'just above window');
});

Deno.test('isFullIronmanBikeDistance: 90km does NOT match (would be 70.3 not full)', () => {
  assertEquals(isFullIronmanBikeDistance(90_000), false, '90km is half-IM, not full');
});

// ── §2 fetchCyclingGoalRaceCompletion — gate path coverage ────────────────

/**
 * Minimal Supabase chain stub. Captures table+filter args; returns whatever data the
 * test scripts. Mirrors the shape `fetchCyclingGoalRaceCompletion` actually exercises.
 */
function makeSupabaseStub(scripted: { goals?: any[]; raceCourses?: any | null }) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: any = {
      select: (_cols: string) => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      maybeSingle: async () => {
        calls.push({ table, filters });
        if (table === 'race_courses') return { data: scripted.raceCourses ?? null, error: null };
        return { data: null, error: null };
      },
      // `goals` query in this helper does NOT call .maybeSingle — it awaits the chain
      // directly, returning all rows. Implement `then` so `await chain` resolves.
      then: (resolve: (v: any) => void) => {
        calls.push({ table, filters });
        if (table === 'goals') {
          resolve({ data: scripted.goals ?? [], error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return {
    from: (table: string) => builder(table),
    __calls: calls,
  };
}

Deno.test('fetchCyclingGoalRaceCompletion: returns no-match for non-ride sport', async () => {
  const supabase = makeSupabaseStub({});
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-13',
    type: 'run',
    distance: 90,
    computed: { overall: { distance_m: 90_000 } },
  });
  assertEquals(r.matched, false);
});

Deno.test('fetchCyclingGoalRaceCompletion: returns no-match when distance outside windows', async () => {
  const supabase = makeSupabaseStub({});
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-13',
    type: 'ride',
    distance: 50, // 50km, neither 70.3 nor full
    computed: { overall: { distance_m: 50_000 } },
  });
  assertEquals(r.matched, false);
});

Deno.test('fetchCyclingGoalRaceCompletion: returns no-match when no matching tri goal', async () => {
  const supabase = makeSupabaseStub({
    goals: [
      { id: 'g1', name: 'NYC Marathon', target_date: '2026-09-13', sport: 'run' },
    ],
  });
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-13',
    type: 'ride',
    distance: 90,
    computed: { overall: { distance_m: 90_000 } },
  });
  assertEquals(r.matched, false, 'run goal does not match a ride workout');
});

Deno.test('fetchCyclingGoalRaceCompletion: matches 70.3 bike on tri goal target_date', async () => {
  const supabase = makeSupabaseStub({
    goals: [
      { id: 'goal-tri', name: 'IRONMAN 70.3 Santa Cruz', target_date: '2026-09-13', sport: 'triathlon' },
    ],
    raceCourses: null, // no course segments
  });
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-13',
    type: 'ride',
    distance: 90,
    computed: { overall: { distance_m: 90_000 } },
  });
  assertEquals(r.matched, true);
  assertEquals(r.eventName, 'IRONMAN 70.3 Santa Cruz');
  assertEquals(r.distanceKey, '70.3');
  assertEquals(r.goalId, 'goal-tri');
  assertEquals(r.targetDate, '2026-09-13');
  assertEquals(r.courseStrategyZones, null, 'no race_courses row → null zones');
});

Deno.test('fetchCyclingGoalRaceCompletion: matches full IM bike + collapses course segments to zones', async () => {
  const supabase = makeSupabaseStub({
    goals: [
      { id: 'goal-full', name: 'IRONMAN Lake Placid', target_date: '2026-07-26', sport: 'tri' },
    ],
    raceCourses: {
      course_segments: [
        {
          segment_order: 1,
          start_distance_m: 0,
          end_distance_m: 90_000,
          display_group_id: 1,
          effort_zone: 'conservative',
          display_label: 'Loop 1',
          coaching_cue: 'Save it for the second loop',
          target_hr_low: 130,
          target_hr_high: 142,
        },
        {
          segment_order: 2,
          start_distance_m: 90_000,
          end_distance_m: 180_000,
          display_group_id: 2,
          effort_zone: 'cruise',
          display_label: 'Loop 2',
          coaching_cue: 'Open it up if HR allows',
          target_hr_low: 138,
          target_hr_high: 150,
        },
      ],
    },
  });
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-07-26',
    type: 'ride',
    distance: 180,
    computed: { overall: { distance_m: 180_000 } },
  });
  assertEquals(r.matched, true);
  assertEquals(r.distanceKey, 'full');
  assertEquals(r.goalId, 'goal-full');
  assert(Array.isArray(r.courseStrategyZones));
  assertEquals(r.courseStrategyZones?.length, 2);
  assertEquals(r.courseStrategyZones?.[0].effortZone, 'conservative');
  assertEquals(r.courseStrategyZones?.[1].effortZone, 'cruise');
});

Deno.test('fetchCyclingGoalRaceCompletion: 24h tolerance on date — workout day after race date still matches', async () => {
  // ±86_400_000 ms tolerance on each side.
  const supabase = makeSupabaseStub({
    goals: [
      { id: 'goal-tri', name: 'Tri', target_date: '2026-09-13', sport: 'triathlon' },
    ],
  });
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-14', // one day after target_date
    type: 'ride',
    distance: 90,
    computed: { overall: { distance_m: 90_000 } },
  });
  assertEquals(r.matched, true, 'within 24h tolerance — still counts');
});

Deno.test('fetchCyclingGoalRaceCompletion: rejects non-tri sport even on matching date', async () => {
  const supabase = makeSupabaseStub({
    goals: [
      // Hypothetical standalone cycling event — gran fondo, not a tri
      { id: 'goal-gf', name: 'Gran Fondo CA', target_date: '2026-09-13', sport: 'cycling' },
    ],
  });
  const r = await fetchCyclingGoalRaceCompletion(supabase, 'user1', {
    date: '2026-09-13',
    type: 'ride',
    distance: 90,
    computed: { overall: { distance_m: 90_000 } },
  });
  assertEquals(r.matched, false, 'standalone cycling events out of scope this ship');
});
