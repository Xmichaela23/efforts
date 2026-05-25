/**
 * D-045 (2026-05-25) — integration pin test for the Q-015 drill-rotation
 * memory pipeline.
 *
 * Scenario: drill tokens emitted by week N's swim sessions must be visible
 * to week N+1's picker filter so the same drill does not appear two weeks
 * in a row. The original implementation (D-044 item 6) threaded
 * `prevWeekDrillTokens` end-to-end through every swim creator + the picker,
 * but the orchestrator harvest in `generate-combined-plan/index.ts` walked
 * the wrong property path (`week.days[].sessions[]` instead of the flat
 * `week.sessions[]` that `buildWeek` returns). The Set stayed empty every
 * week and the filter never fired.
 *
 * This file pins the full contract end-to-end:
 *   1. `harvestSwimDrillTokensFromWeek` captures `swim_drills?_*` tokens
 *      from `week.sessions[].steps_preset` (the actual buildWeek shape).
 *   2. Feeding the harvested Set into `pickSwimDrillInset` as
 *      `prevWeekDrillTokens` excludes the corresponding drill family from
 *      next week's pick.
 *
 * Run from repo root:
 *   deno test supabase/functions/generate-combined-plan/drill-token-harvest.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { harvestSwimDrillTokensFromWeek } from './drill-token-harvest.ts';
import { pickSwimDrillInset } from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';

/** Replicates the drillKey suffix-match used by the picker filter. */
function drillFamilyKey(token: string): string {
  const m = String(token).match(
    /^swim_drills?_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i,
  );
  return m ? m[1].toLowerCase() : String(token).toLowerCase();
}

Deno.test('D-045: harvest captures swim_drills tokens from flat week.sessions[].steps_preset', () => {
  const week = {
    sessions: [
      {
        type: 'swim',
        steps_preset: [
          'swim_warmup_300yd_easy',
          'swim_drills_4x50yd_catchup',
          'swim_aerobic_css_10x100yd_r20',
          'swim_cooldown_200yd',
        ],
      },
      {
        type: 'swim',
        steps_preset: [
          'swim_warmup_300yd_easy',
          'swim_drills_2x50yd_fingertipdrag',
          'swim_aerobic_4x150yd_easy_r20',
          'swim_cooldown_200yd',
        ],
      },
    ],
  };
  const harvested = harvestSwimDrillTokensFromWeek(week);
  assertEquals(harvested.size, 2);
  assert(harvested.has('swim_drills_4x50yd_catchup'));
  assert(harvested.has('swim_drills_2x50yd_fingertipdrag'));
});

Deno.test('D-045: harvest ignores non-swim sessions and non-drill tokens', () => {
  const week = {
    sessions: [
      {
        type: 'run',
        steps_preset: ['swim_drills_4x50yd_catchup'], // wrong sport — must NOT be captured
      },
      {
        type: 'swim',
        steps_preset: [
          'swim_warmup_300yd_easy',
          'swim_aerobic_css_8x100yd_r25',
          'swim_cooldown_200yd',
          // no drill tokens
        ],
      },
      {
        type: 'bike',
        steps_preset: ['bike_threshold_2x20min'],
      },
    ],
  };
  const harvested = harvestSwimDrillTokensFromWeek(week);
  assertEquals(harvested.size, 0);
});

Deno.test('D-045: harvest accepts both plural (swim_drills_*) and singular (swim_drill_*) prefix forms', () => {
  const week = {
    sessions: [
      {
        type: 'swim',
        steps_preset: [
          'swim_drill_4x50yd_kick',           // singular
          'swim_drills_4x50yd_singlearm',     // plural
        ],
      },
    ],
  };
  const harvested = harvestSwimDrillTokensFromWeek(week);
  assertEquals(harvested.size, 2);
  assert(harvested.has('swim_drill_4x50yd_kick'));
  assert(harvested.has('swim_drills_4x50yd_singlearm'));
});

Deno.test('D-045: harvest of the OLD wrong-shape input returns empty (regression sentinel)', () => {
  // Sanity: the prior buggy harvest walked `week.days[].sessions[]`. Feeding
  // the helper that exact shape (with no top-level `sessions`) must produce
  // an empty Set — confirming that any future regression that hands the
  // helper a `days`-shaped object will be caught by visible behavior, not
  // pass silently.
  const oldShape = {
    days: [
      {
        sessions: [
          {
            type: 'swim',
            steps_preset: ['swim_drills_4x50yd_catchup'],
          },
        ],
      },
    ],
  } as unknown as Parameters<typeof harvestSwimDrillTokensFromWeek>[0];
  const harvested = harvestSwimDrillTokensFromWeek(oldShape);
  assertEquals(harvested.size, 0);
});

Deno.test(
  'D-045: week N → N+1 integration — harvested catchup token excludes catchup family from week N+1 picker',
  () => {
    // Week N: a swim session emitted a catchup drill (the token format the
    // session-factory writes to PlannedSession.steps_preset).
    const weekN = {
      sessions: [
        {
          type: 'swim',
          steps_preset: [
            'swim_warmup_300yd_easy',
            'swim_drills_4x50yd_catchup',
            'swim_aerobic_css_10x100yd_r20',
            'swim_cooldown_200yd',
          ],
        },
      ],
    };
    const prevWeekDrillTokens = harvestSwimDrillTokensFromWeek(weekN);
    assert(prevWeekDrillTokens.has('swim_drills_4x50yd_catchup'), 'harvest precondition');

    // Week N+1 picker call — same posture as a base-phase css_aerobic session
    // (intermediate tier, Path B single-drill). Full gear so the eligible pool
    // is wide enough that catchup is NOT the only choice.
    const { drillTokens } = pickSwimDrillInset({
      totalYards: 2400,
      wuYd: 300,
      cdYd: 200,
      planWeek: 2,
      drillSlotSalt: 0,
      phase: 'base',
      sessionKind: 'css_aerobic',
      athleteFitness: 'intermediate',
      swimGearLabels: ['pull buoy', 'snorkel', 'fins', 'kickboard'],
      prevWeekDrillTokens,
    });

    assert(drillTokens.length > 0, 'picker should still emit a drill — pool is large enough');
    for (const tok of drillTokens) {
      assert(
        drillFamilyKey(tok) !== 'catchup',
        `week N+1 picked catchup-family token "${tok}" despite it being in prevWeekDrillTokens`,
      );
    }
  },
);

Deno.test(
  'D-045: integration baseline — empty prev Set leaves catchup eligible (proves the filter is doing the work)',
  () => {
    // Mirror of the integration test above but with an empty prev Set. The
    // picker must still emit something, and across all eligible drills
    // catchup must remain in the candidate pool (i.e. its absence in the
    // filtered case is genuinely the filter at work, not unrelated rotation).
    // We assert by running 12 distinct salts and confirming catchup appears
    // at least once with no filter — making the filtered-case assertion
    // meaningful regardless of the rotation start.
    let sawCatchupWithoutFilter = false;
    for (let salt = 0; salt < 12; salt++) {
      const { drillTokens } = pickSwimDrillInset({
        totalYards: 2400,
        wuYd: 300,
        cdYd: 200,
        planWeek: 2,
        drillSlotSalt: salt,
        phase: 'base',
        sessionKind: 'css_aerobic',
        athleteFitness: 'intermediate',
        swimGearLabels: ['pull buoy', 'snorkel', 'fins', 'kickboard'],
        prevWeekDrillTokens: new Set(),
      });
      if (drillTokens.some((t) => drillFamilyKey(t) === 'catchup')) {
        sawCatchupWithoutFilter = true;
        break;
      }
    }
    assert(
      sawCatchupWithoutFilter,
      'catchup must be reachable across some rotation when not filtered — otherwise the filter test is vacuous',
    );
  },
);
