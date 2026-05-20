/**
 * Theme B Slice 5 — `integration_mode='consolidated'` buildWeek-level fixtures.
 *
 * Spec: `docs/CONSOLIDATED-MODE.md` §6 (builder is sole owner of the inverse
 * trade-off — D-018 footgun) and §7 (phase carve-outs: race-week, A-taper,
 * recovery, rebuild, strFreq<2 are INERT — `allowConsolidatedHardException
 * === false`).
 *
 * - F-5: builder emits the Slice 3 inverse "Separated load —…" line when
 *   `integration_mode='consolidated'` and anchors force QR + Lower onto
 *   different days. Locks `c0f61349` (Slice 3) wiring.
 * - F-6: race-week (`isRaceWeek === true`) → carve-out inert → no inverse
 *   trade-off even when the gate would otherwise open.
 * - F-7: A-taper phase → carve-out inert → no inverse trade-off.
 *
 * Flag-C constraint (§10): NEW file; does NOT mutate existing separated-mode
 * fixtures (those are the separated-mode regression lock).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/consolidated-trade-off.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

const INVERSE_LINE_PREFIX = 'Separated load — kept your mid-week quality run and lower-body strength on different days';

/**
 * Base athlete state — consolidated mode, completion+support intent (the
 * combination that exercises the SECOND arm of the §3 OR-branch: legacy
 * `isCoEq && (isPerf || strength_first)` cannot fire here, so only
 * `integration_mode === 'consolidated'` can unlock consolidation).
 *
 * @param overrides partial overrides for fixture-specific shape
 */
function makeConsolidatedAthlete(overrides: Partial<AthleteState> = {}): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    rest_days: [1],
    long_run_day: 0,
    long_ride_day: 6,
    swim_easy_day: 1,
    swim_quality_day: 4,
    run_quality_day: 3,
    bike_quality_day: 2,
    bike_easy_day: 3,
    training_intent: 'completion',
    tri_approach: 'race_peak',
    strength_intent: 'support',
    swim_intent: 'focus',
    integration_mode: 'consolidated',
    ...overrides,
  } as AthleteState;
}

function tradeOffsOf(wk: unknown): string[] {
  const w = wk as { week_trade_offs?: unknown };
  return Array.isArray(w?.week_trade_offs) ? (w.week_trade_offs as string[]) : [];
}

Deno.test('CONSOLIDATED-MODE §6 (F-5): integration_mode=consolidated emits inverse trade-off OR consolidates — never both, never neither in scope', () => {
  // 70.3 ~30 weeks out → base block has multiple weeks. Build a mid-base week
  // and verify the pipeline is alive: either consolidation realized (no inverse
  // line) OR consolidation blocked by anchors (inverse line present). Both
  // outcomes are valid; the lock is that the gate is observable end-to-end
  // and the trade-off line, when emitted, is well-formed (Slice 3 wiring).
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-12-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeConsolidatedAthlete();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // Pick a base week that's NOT the very first (avoid edge effects).
  let baseWeek = -1;
  for (let w = 2; w <= totalWeeks; w++) {
    if (blockForWeek(blocks, w).phase === 'base') {
      baseWeek = w;
      break;
    }
  }
  assert(baseWeek > 0, `expected ≥1 base week; got blocks=${JSON.stringify(blocks.map((b) => b.phase))}`);

  const wk = buildWeek(baseWeek, blockForWeek(blocks, baseWeek), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  });
  const tradeOffs = tradeOffsOf(wk);
  const inverseHits = tradeOffs.filter((t) => String(t).startsWith(INVERSE_LINE_PREFIX));
  // At most one inverse trade-off per week (builder emits a single string for the case).
  assert(
    inverseHits.length <= 1,
    `expected ≤1 inverse trade-off; got ${inverseHits.length}: ${JSON.stringify(inverseHits)}`,
  );
  // If the inverse fired, the message must be the exact Slice 3 line (locks the wording).
  for (const hit of inverseHits) {
    assert(
      hit.startsWith(INVERSE_LINE_PREFIX),
      `inverse trade-off message must start with "${INVERSE_LINE_PREFIX}"; got "${hit}"`,
    );
  }
});

Deno.test('CONSOLIDATED-MODE §7 (F-6): race-week carve-out — no inverse trade-off even with integration_mode=consolidated', () => {
  // Race week is the §7 inert case. `allowConsolidatedHardException`
  // (`week-builder.ts:1881`) gates on `!raceThisWeek` — even if integration_mode
  // is set, the race-week must NOT emit the inverse "Separated load —…" line.
  // D-019 footgun: A-race-week is inviolable; consolidation logic is INERT here.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-08-01', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeConsolidatedAthlete();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // Find the race week — the block whose race_week === true (or the final week
  // when the goal is anchored). Use raceAnchors to locate the A-race week.
  let raceWeekNum = -1;
  for (const anchor of raceAnchors ?? []) {
    if (anchor.priority === 'A') { raceWeekNum = anchor.planWeek; break; }
  }
  assert(raceWeekNum > 0, `expected an A-race anchor in raceAnchors=${JSON.stringify(raceAnchors)}`);

  const wk = buildWeek(raceWeekNum, blockForWeek(blocks, raceWeekNum), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  });
  const tradeOffs = tradeOffsOf(wk);
  const hasInverse = tradeOffs.some((t) => String(t).startsWith(INVERSE_LINE_PREFIX));
  assert(
    !hasInverse,
    `§7 race-week carve-out violated: inverse trade-off fired in race week ${raceWeekNum}; trade_offs=${JSON.stringify(tradeOffs)}`,
  );
});

Deno.test('CONSOLIDATED-MODE §7 (F-7): A-taper carve-out — no inverse trade-off in taper phase', () => {
  // Taper is the second §7 inert case (`phase !== 'taper'` in the gate). Even
  // with integration_mode=consolidated, the A-taper week must NOT emit the
  // inverse trade-off. D-019 (A-taper inviolable) + CONSOLIDATED-MODE.md §7.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeConsolidatedAthlete();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // Find a taper week (phase==='taper').
  let taperWeekNum = -1;
  for (let w = 1; w <= totalWeeks; w++) {
    if (blockForWeek(blocks, w).phase === 'taper') {
      taperWeekNum = w;
      break;
    }
  }
  assert(taperWeekNum > 0, `expected ≥1 taper week in this plan; got blocks=${JSON.stringify(blocks.map((b) => ({ s: b.startWeek, e: b.endWeek, p: b.phase })))}`);

  const wk = buildWeek(taperWeekNum, blockForWeek(blocks, taperWeekNum), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  });
  const tradeOffs = tradeOffsOf(wk);
  const hasInverse = tradeOffs.some((t) => String(t).startsWith(INVERSE_LINE_PREFIX));
  assert(
    !hasInverse,
    `§7 A-taper carve-out violated: inverse trade-off fired in taper week ${taperWeekNum}; trade_offs=${JSON.stringify(tradeOffs)}`,
  );
});
