// @ts-nocheck
/**
 * D-032 / Phase 0 — Arc channel behavior-neutral contract test.
 *
 * The contract: every existing plan-generation fixture must produce
 * **byte-identical** session output whether `arc` is undefined OR
 * fully populated. If a Phase 0 implementation accidentally reads any
 * Arc field during plan generation, the output will diverge between
 * the two modes and the hash check fails.
 *
 * Fixtures mirror the existing e2e test shapes (run-volume-ramp,
 * bike-volume-ramp, swim-volume-ramp, d031-convergence, swim-css-rest-lerp)
 * so this test exercises the same plan-generation paths the rest of the
 * suite covers — any accidental consumption shows up here even if the
 * other tests happen to use null Arc values.
 *
 * Phase 1+ consumers MUST update this test to reflect that
 * `arc: populated` and `arc: undefined` now produce different outputs
 * for the consumed field(s). The Phase 0 hash test is the contract;
 * consumers are explicit additions to it.
 *
 * D-033 / Phase 1 (2026-05-22) — `run_observed_fitness` is now a Phase 1
 * consumer. This test exercises `buildWeek` directly (not the full engine
 * `index.ts` handler), and the run-pace reconciler runs in `index.ts`
 * BEFORE `buildWeek`. So the byte-identical contract still holds at the
 * buildWeek level even when `run_observed_fitness` is set, because
 * buildWeek itself does not read that field. To make the contract explicit,
 * `makePopulatedArc` sets `run_observed_fitness: null` — the Phase 1
 * reconciler-level contract test lives in `run-pace-feedback.test.ts`.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/arc-channel.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, ArcChannelPayload, GeneratedWeek, GoalInput, PhaseBlock } from './types.ts';

// ── Stable serialization + SHA-256 ──────────────────────────────────────────

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) =>
    JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])
  ).join(',') + '}';
}

async function stableHash(obj: unknown): Promise<string> {
  const json = stableStringify(obj);
  const data = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Plan generation harness ─────────────────────────────────────────────────

function generateWeeks(
  goals: GoalInput[],
  athlete: AthleteState,
  startDate: Date,
  arc: ArcChannelPayload | undefined,
): GeneratedWeek[] {
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);
  const out: GeneratedWeek[] = [];
  let prevTSS = athlete.current_ctl * 7;
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    const week = buildWeek(w, blk, prevTSS, goals, athlete, undefined, {
      totalWeeks,
      raceAnchors,
      phaseBlocks: blocks,
      arc,
    }) as unknown as GeneratedWeek;
    out.push(week);
    prevTSS = week.total_weighted_tss;
  }
  return out;
}

// ── Fully-populated Arc payload (plausible values; engine must ignore) ─────

function makePopulatedArc(): ArcChannelPayload {
  // The whole point of Phase 0: these values are real-shaped but irrelevant.
  // The engine MUST produce identical output whether arc=undefined or arc=this.
  return {
    latest_snapshot: {
      week_start: '2026-05-18',
      ctl: 62.5,
      atl: 70.0,
      tsb: -7.5,
      run_threshold_pace_sec_per_km: 250,
      run_easy_pace_sec_per_km: 320,
      run_interval_adherence: 0.92,
      ride_avg_power: 245,
      ride_efficiency: 1.45,
      swim_session_count_28d: 8,
      strength_volume: 18000,
      longestRunDur: 6300,
    } as Record<string, unknown>,
    cycling_fitness: {
      ctl: 62.5,
      atl: 70.0,
      tsb: -7.5,
      form: 'fatigued' as const,
    },
    swim_training_from_workouts: {
      count_28d: 8,
      count_90d: 24,
      last_swim_date: '2026-05-20',
    } as unknown as ArcChannelPayload['swim_training_from_workouts'],
    longitudinal_signals: {
      asOfYmd: '2026-05-22',
      signals: [],
    } as unknown as ArcChannelPayload['longitudinal_signals'],
    // D-033 / Phase 1 — set to null so the contract assertion is unambiguous:
    // `buildWeek` does not read `run_observed_fitness`. The reconciler-level
    // test lives in `run-pace-feedback.test.ts`.
    run_observed_fitness: null,
  };
}

// ── Fixture definitions (mirror existing e2e shapes) ────────────────────────

const startDate = new Date('2026-05-18T12:00:00Z');

const FIXTURES: Array<{ name: string; athlete: AthleteState; goals: GoalInput[] }> = [
  {
    name: 'fx-1: Plan #78 (70.3, CTL=60, 11hr/wk, intermediate, race_peak)',
    athlete: {
      current_ctl: 60, weekly_hours_available: 11, loading_pattern: '3:1', limiter_sport: 'run',
      rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
      run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
      training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
      swim_intent: 'focus', training_fitness: 'intermediate',
    } as AthleteState,
    goals: [{ id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' }],
  },
  {
    name: 'fx-2: 70.3 base_first advanced (CTL=70, 13hr/wk)',
    athlete: {
      current_ctl: 70, weekly_hours_available: 13, loading_pattern: '3:1', limiter_sport: 'run',
      rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
      run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
      training_intent: 'performance', tri_approach: 'base_first', strength_intent: 'performance',
      swim_intent: 'focus', training_fitness: 'advanced',
    } as AthleteState,
    goals: [{ id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' }],
  },
  {
    name: 'fx-3: Full IM (CTL=70, 15hr/wk, race_peak, advanced)',
    athlete: {
      current_ctl: 70, weekly_hours_available: 15, loading_pattern: '3:1', limiter_sport: 'run',
      rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
      run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
      training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
      swim_intent: 'focus', training_fitness: 'advanced',
    } as AthleteState,
    goals: [{ id: 'a', event_name: 'A IM', event_date: '2026-10-25', distance: 'full', sport: 'triathlon', priority: 'A' }],
  },
  {
    name: 'fx-4: D-031 spike reproducer (Olympic 13-wk close, CTL=65, advanced race_peak)',
    athlete: {
      current_ctl: 65, weekly_hours_available: 11, loading_pattern: '3:1', limiter_sport: 'run',
      rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
      run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
      training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
      swim_intent: 'focus', training_fitness: 'advanced',
    } as AthleteState,
    goals: [{ id: 'a', event_name: 'A Oly', event_date: '2026-08-16', distance: 'olympic', sport: 'triathlon', priority: 'A' }],
  },
  {
    name: 'fx-5: Sprint short plan (CTL=50, 8hr/wk, intermediate race_peak)',
    athlete: {
      current_ctl: 50, weekly_hours_available: 8, loading_pattern: '3:1', limiter_sport: 'run',
      rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
      run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
      training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
      swim_intent: 'focus', training_fitness: 'intermediate',
    } as AthleteState,
    goals: [{ id: 'a', event_name: 'A Sprint', event_date: '2026-08-23', distance: 'sprint', sport: 'triathlon', priority: 'A' }],
  },
];

// ── The contract test — 5 fixtures × byte-identical assertion ──────────────

for (const fx of FIXTURES) {
  Deno.test(`D-032 Phase 0 byte-identical: ${fx.name}`, async () => {
    const undefinedWeeks = generateWeeks(fx.goals, fx.athlete, startDate, undefined);
    const populatedWeeks = generateWeeks(fx.goals, fx.athlete, startDate, makePopulatedArc());

    const h0 = await stableHash(undefinedWeeks);
    const h1 = await stableHash(populatedWeeks);

    // The diff message is intentionally verbose so a regression test failure tells
    // the maintainer exactly which fixture, which mode, and a session-count summary.
    // If a Phase 1+ consumer is added, this test needs to be updated to reflect the
    // new expected divergence on the consumed field.
    if (h0 !== h1) {
      const w0Counts = undefinedWeeks.map((w) => (w.sessions ?? []).length);
      const w1Counts = populatedWeeks.map((w) => (w.sessions ?? []).length);
      throw new Error(
        `Phase 0 byte-identical contract violated for ${fx.name}.\n` +
          `  arc=undefined: hash=${h0}\n` +
          `  arc=populated: hash=${h1}\n` +
          `  undefined session counts per week: ${JSON.stringify(w0Counts)}\n` +
          `  populated session counts per week: ${JSON.stringify(w1Counts)}\n` +
          `  Engine read an Arc field during plan generation. Phase 0 is behavior-neutral; ` +
          `consumers belong to Phase 1+.`,
      );
    }
    assertEquals(h0, h1);
  });
}

// ── Sanity: hash function is deterministic ──────────────────────────────────

Deno.test('Phase 0 hash function: stableHash is deterministic', async () => {
  const a = { x: 1, y: [2, 3], z: { nested: 'value' } };
  const b = { z: { nested: 'value' }, y: [2, 3], x: 1 }; // same content, different key order
  const ha = await stableHash(a);
  const hb = await stableHash(b);
  assertEquals(ha, hb, 'stableHash must be insensitive to key order');
});

Deno.test('Phase 0 hash function: stableHash detects content change', async () => {
  const a = { x: 1, y: 2 };
  const b = { x: 1, y: 3 };
  const ha = await stableHash(a);
  const hb = await stableHash(b);
  if (ha === hb) throw new Error('stableHash must detect content changes');
});
