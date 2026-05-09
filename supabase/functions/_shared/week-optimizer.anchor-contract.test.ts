/**
 * Anchor / sparse-input contract tests for `deriveOptimalWeek`.
 *
 * Run: `deno test supabase/functions/_shared/week-optimizer.anchor-contract.test.ts`
 *
 * ## Product note (fixture "Saturday hammer + Saturday long")
 * The in-app wizard **surfaces** long-ride vs group-ride same-day conflicts in confirm copy
 * but still allows continue — so optimizer **may** receive this shape. These tests assert:
 * - a **visible** long-day collision signal in `conflicts`, and
 * - **internal graph == exported preferred_days** for `quality_bike` (no phantom `qualityBikeDay`).
 * If product later **hard-blocks** that wizard state, flip fixture 02 to a negative test
 * (expect throw or early reject) instead of expecting algorithmic relocation.
 *
 * ## Fragile heuristic warning
 * Session **titles** in `anchors_honored` (create-goal) are display-driven. Scheduler
 * contract tests in `generate-combined-plan/scheduler-anchor.contract.test.ts` assert on
 * `type` + `intensity_class`, not copy.
 */
import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  deriveOptimalWeek,
  deriveOptimalWeekWithCoEqualRecovery,
  validatePreferredDays,
  type DayName,
  type PreferredDaysOut,
  type WeekOptimizerInputs,
} from './week-optimizer.ts';

const MIDWEEK: DayName[] = ['tuesday', 'wednesday', 'thursday'];

function dayHasKind(
  week: ReturnType<typeof deriveOptimalWeek>,
  day: DayName | undefined,
  kind: string,
): boolean {
  if (!day) return false;
  return week.days[day].some((s) => s.kind === kind);
}

/** Internal week graph matches exported preferred_days (phantom-day guard). */
function assertPreferredDaysMatchGraph(week: ReturnType<typeof deriveOptimalWeek>): void {
  const pd = week.preferred_days;
  for (const k of ['quality_bike', 'easy_bike', 'quality_run', 'easy_run'] as const) {
    const d = pd[k];
    if (d != null) {
      assert(
        dayHasKind(week, d, k),
        `preferred_days.${k}=${d} but days[${d}] has no placed ${k}`,
      );
    }
  }
  const str = pd.strength;
  if (Array.isArray(str)) {
    for (const entry of str) {
      if (typeof entry === 'object' && entry != null && 'day' in entry && 'kind' in entry) {
        assert(
          dayHasKind(week, entry.day, entry.kind),
          `preferred_days.strength ${entry.kind} on ${entry.day} absent from graph`,
        );
      }
    }
  }
}

function basePreferences(
  overrides: Partial<WeekOptimizerInputs['preferences']> = {},
): WeekOptimizerInputs['preferences'] {
  return {
    swims_per_week: 2,
    strength_frequency: 2,
    training_days: 6,
    ...overrides,
  };
}

function baseAthlete(
  overrides: Partial<WeekOptimizerInputs['athlete']> = {},
): WeekOptimizerInputs['athlete'] {
  return {
    training_intent: 'performance',
    strength_intent: 'performance',
    weeks_into_plan: 8,
    ...overrides,
  };
}

// ── Fixture 06 first: sparse / minimal anchors (regression class: May 6) ─────────────

Deno.test({
  name: '06 sparse: only long days — still emits full pillar skeleton (no silent strip)',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: { long_ride: 'saturday', long_run: 'sunday' },
      preferences: basePreferences(),
      athlete: baseAthlete({ training_intent: 'completion', strength_intent: 'support' }),
    };
    const week = deriveOptimalWeek(inputs);
    const pd = week.preferred_days;

    assertExists(pd.quality_bike, 'expected quality_bike in preferred_days');
    assertExists(pd.quality_run, 'expected quality_run');
    assertExists(pd.easy_bike);
    const daysList = Object.keys(week.days) as DayName[];
    const hasStructuredRun = daysList.some(
      (d) => dayHasKind(week, d, 'easy_run') || dayHasKind(week, d, 'quality_run'),
    );
    assert(
      hasStructuredRun,
      'expected at least one easy_run or quality_run in week graph (run pillar; no silent strip)',
    );
    assertEquals(Array.isArray(pd.swim), true);
    assert(
      (pd.swim?.length ?? 0) >= 1,
      `expected ≥1 swim day in preferred_days (requested ${inputs.preferences.swims_per_week}/wk); got ${JSON.stringify(pd.swim)}`,
    );
    const swimSessionsOnGraph = daysList.filter(
      (d) => dayHasKind(week, d, 'easy_swim') || dayHasKind(week, d, 'quality_swim'),
    ).length;
    assert(
      swimSessionsOnGraph >= 1,
      'expected at least one swim session on week graph (swim pillar present)',
    );
    assertEquals(Array.isArray(pd.strength), true);
    assertEquals(pd.strength!.length >= 1, true);

    assertPreferredDaysMatchGraph(week);
    assertEquals(validatePreferredDays(pd, inputs.athlete, inputs.preferences).length, 0);
  },
});

// ── Fixture 01: Wednesday hard group anchor ────────────────────────────────────────

Deno.test({
  name: '01 Wednesday quality_bike anchor honored on graph and JSON',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        quality_bike: { day: 'wednesday', intensity: 'quality' },
      },
      preferences: basePreferences(),
      athlete: baseAthlete(),
    };
    const week = deriveOptimalWeek(inputs);
    assertEquals(week.preferred_days.quality_bike, 'wednesday');
    assertEquals(dayHasKind(week, 'wednesday', 'quality_bike'), true);
    assertPreferredDaysMatchGraph(week);
    assertEquals(validatePreferredDays(week.preferred_days, inputs.athlete, inputs.preferences).length, 0);
  },
});

// ── Fixture 02: Saturday long + Saturday hard group (wizard-allowed ambiguous case) ─

Deno.test({
  name: '02 Saturday long + Saturday quality_bike anchor: collision visible, QB relocated mid-week',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        quality_bike: { day: 'saturday', intensity: 'quality' },
      },
      preferences: basePreferences(),
      athlete: baseAthlete(),
    };
    const week = deriveOptimalWeek(inputs);

    const collision = week.conflicts.some((c) =>
      /quality_bike anchor on saturday collides with long-day anchor/i.test(c)
    );
    assert(collision, `expected long-day collision conflict, got: ${JSON.stringify(week.conflicts)}`);

    const qb = week.preferred_days.quality_bike;
    assertExists(qb);
    assert(
      MIDWEEK.includes(qb),
      `expected algorithmic quality_bike on Tue–Thu, got ${qb}`,
    );
    assert(qb !== 'saturday', 'quality_bike must not stay on Saturday when long_ride is Saturday');
    assertEquals(dayHasKind(week, qb, 'quality_bike'), true);
    assertPreferredDaysMatchGraph(week);
  },
});

// ── Fixture 03: Masters swim anchor + 2 swims ─────────────────────────────────────────

Deno.test({
  name: '03 masters easy swim anchor + 2 swims/week preserves swim pillar',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        masters_swim: { day: 'tuesday', intensity: 'easy' },
      },
      preferences: basePreferences({ swims_per_week: 2 }),
      athlete: baseAthlete({ training_intent: 'completion', strength_intent: 'support' }),
    };
    const week = deriveOptimalWeek(inputs);
    assertEquals(week.preferred_days.swim?.length, 2);
    assertEquals(
      dayHasKind(week, 'tuesday', 'easy_swim'),
      true,
      'masters anchor should place easy_swim on Tuesday',
    );
    assertPreferredDaysMatchGraph(week);
    assertEquals(validatePreferredDays(week.preferred_days, inputs.athlete, inputs.preferences).length, 0);
  },
});

// ── Fixture 04: §4.4 conservative 48h gap reduces 2× co-equal to 1× via recovery wrapper ─────

/**
 * §4.4 says heavy lower must precede AND follow `quality_bike` by ≥48h. With Sat long_ride
 * + Sun long_run + Wed quality_bike, every weekday is blocked for lower-body:
 *   - Mon (2d before Wed QB) ✗   - Tue (1d before Wed QB) ✗
 *   - Wed (matrix lower×QB ✗)    - Thu (1d after Wed QB) ✗   - Fri (2d after Wed QB) ✗
 *
 * Raw `deriveOptimalWeek` correctly surfaces a `CO_EQUAL_STRENGTH` conflict for 2×.
 * Production calls `deriveOptimalWeekWithCoEqualRecovery`, which retries at 1× and ships a
 * workable week with a non-vague recovery trade-off explaining the constraint.
 *
 * Override 5.1 (≥24h for trained cyclists) is the explicit escape hatch and is out of scope
 * for this pass — when added, this test should split: a 5.1-eligible profile keeps 2×;
 * everyone else continues to reduce to 1× per the conservative §4.4 default.
 */
Deno.test({
  name: '04 §4.4: 2× co-equal + mid-week QB reduces to 1× via co-equal recovery wrapper',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        quality_bike: { day: 'wednesday', intensity: 'quality' },
      },
      // `quality_run: thursday` is athlete-declared so the optimizer honors it via
      // canPlace-only — keeps QR placement out of the failure path and isolates this fixture
      // to the §4.4 strength-reduction behavior we're asserting.
      preferences: basePreferences({ strength_frequency: 2, quality_run: 'thursday' }),
      athlete: baseAthlete({
        training_intent: 'performance',
        strength_intent: 'performance',
      }),
    };

    // Production path: recovery wrapper produces a 1× plan rather than a hard failure.
    const { week, used_co_equal_1x_fallback } = deriveOptimalWeekWithCoEqualRecovery(inputs);

    assertEquals(used_co_equal_1x_fallback, true, '2× co-equal should fall back to 1× under §4.4');
    assertEquals(week.preferred_days.quality_bike, 'wednesday');

    // Strength frequency reduced from requested 2× to 1×.
    assertEquals(Array.isArray(week.preferred_days.strength), true);
    assertEquals(
      week.preferred_days.strength!.length,
      1,
      `expected 1× strength under §4.4 reduction; got ${week.preferred_days.strength!.length}`,
    );

    // §6.3: trade_offs must name the constraint and the reduction.
    const recoveryHit = week.trade_offs.some((t) =>
      /CO_EQUAL_STRENGTH \(recovery\)/i.test(t) &&
      /1× strength/i.test(t),
    );
    assert(
      recoveryHit,
      `expected recovery trade-off naming reduction to 1× strength; got: ${JSON.stringify(week.trade_offs)}`,
    );

    assertPreferredDaysMatchGraph(week);
    // After reduction, the 1× week itself validates cleanly — anchors compatible with 1× strength.
    assertEquals(week.conflicts.length, 0, `1× retry should clear conflicts; got: ${JSON.stringify(week.conflicts)}`);
    assertEquals(
      validatePreferredDays(week.preferred_days, inputs.athlete, {
        ...inputs.preferences,
        strength_frequency: 1,
      }).length,
      0,
    );
  },
});

// ── Fixture 05: stated quality_run preference with Wed QB (declared adjacent OK) ─────

Deno.test({
  name: '05 quality_run preference Thu with Wed QB — places without phantom QB',
  fn() {
    const inputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        quality_bike: { day: 'wednesday', intensity: 'quality' },
      },
      preferences: basePreferences({ quality_run: 'thursday' }),
      athlete: baseAthlete(),
    };
    const week = deriveOptimalWeek(inputs);
    assertEquals(week.preferred_days.quality_bike, 'wednesday');
    assertEquals(week.preferred_days.quality_run, 'thursday');
    assertPreferredDaysMatchGraph(week);
    assertEquals(validatePreferredDays(week.preferred_days, inputs.athlete, inputs.preferences).length, 0);
  },
});
