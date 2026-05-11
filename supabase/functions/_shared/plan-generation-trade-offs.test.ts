/**
 * Tests for athlete-facing vs internal-telemetry tradeoff classification.
 *
 * Architectural fix: filter at source (the boundary aggregators in
 * plan-generation-trade-offs.ts) so frontend doesn't re-derive what counts as athlete-facing.
 * Per `docs/POLISH-PUNCH-LIST.md` background item: internal scheduler decisions like "Weekly
 * layout: moved easy_bike from Monday to Wednesday" should NOT clutter the athlete's
 * "Schedule adjustments" panel.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/_shared/plan-generation-trade-offs.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  aggregateOptimizerScheduleSignals,
  enrichScheduleSignalsWithCombinedPlanTradeOffs,
  filterAthleteFacingTradeOffs,
  hasAthletePinsFromPrefs,
  isInternalOptimizerTelemetry,
  referencesAthletePins,
} from './plan-generation-trade-offs.ts';

// ── §1 classifier: internal telemetry patterns ──────────────────────────────

Deno.test('isInternalOptimizerTelemetry: Weekly layout reorganization is internal', () => {
  assert(isInternalOptimizerTelemetry('Weekly layout: moved easy_bike from Monday to Wednesday — fewer same-sport days back-to-back.'));
  assert(isInternalOptimizerTelemetry('Weekly load balance: moved quality_bike from Tuesday to Wednesday — spread fatigue across the week.'));
});

Deno.test('isInternalOptimizerTelemetry: load balancer move (easy_run after long_run) is internal', () => {
  assert(isInternalOptimizerTelemetry(
    'easy_run on Monday immediately follows long_run (Sunday) — load balancer move; prefer swim or rest that day when possible.',
  ));
});

Deno.test('isInternalOptimizerTelemetry: "Strength: default Monday upper moved" is internal', () => {
  assert(isInternalOptimizerTelemetry('Strength: default Monday upper moved to Thursday — spacing vs lower on Friday.'));
  assert(isInternalOptimizerTelemetry('Strength: default Monday upper moved to Wednesday (support / 1×–2× template).'));
});

Deno.test('isInternalOptimizerTelemetry: legacy swim-budget bookkeeping is internal', () => {
  assert(isInternalOptimizerTelemetry('Swim budget raised by 500 yd total to honor 3 pinned swim days.'));
  assert(isInternalOptimizerTelemetry('Swim budget raised by 1200 yd total to honor 2 pinned swim days'));
});

Deno.test('isInternalOptimizerTelemetry: athlete-facing constraint messages stay surfaced', () => {
  // Frequency reductions, dropped sessions, spacing compromises — all athlete-facing.
  assert(!isInternalOptimizerTelemetry('Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.'));
  assert(!isInternalOptimizerTelemetry('Swim frequency reduced from 3× to 2× — week too dense for 3× without conflict.'));
  assert(!isInternalOptimizerTelemetry('Mid-week easy bike dropped — schedule too dense.'));
  assert(!isInternalOptimizerTelemetry('easy_bike skipped — frequency budget is 2 bike sessions/week (long_ride + quality_bike only).'));
  assert(!isInternalOptimizerTelemetry('Quality run not placed — tighten anchors or confirm a schedule change with the athlete.'));
  assert(!isInternalOptimizerTelemetry(
    'Strength: upper on Tuesday sits 2 days from lower on Friday (preferred 3) — densest gap that fits the long-day anchors and recovery rules.',
  ));
  assert(!isInternalOptimizerTelemetry(
    'Strength: usual Mon upper / Thu lower could not stay — upper on Wednesday, lower on Saturday (heavy lower day stacks with your quality run).',
  ));
});

Deno.test('isInternalOptimizerTelemetry: empty / non-string input is safe', () => {
  assert(!isInternalOptimizerTelemetry(''));
  assert(!isInternalOptimizerTelemetry('   '));
  assert(!isInternalOptimizerTelemetry(undefined as unknown as string));
});

// ── §2 filterAthleteFacingTradeOffs helper ──────────────────────────────────

Deno.test('filterAthleteFacingTradeOffs: strips internal, keeps athlete-facing, preserves order', () => {
  const input = [
    'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
    'Weekly layout: moved easy_bike from Monday to Wednesday',
    'Quality run not placed — tighten anchors or confirm a schedule change with the athlete.',
    'Swim budget raised by 500 yd total to honor 3 pinned swim days.',
    'Mid-week easy bike dropped — schedule too dense.',
  ];
  const out = filterAthleteFacingTradeOffs(input);
  assertEquals(out, [
    'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
    'Quality run not placed — tighten anchors or confirm a schedule change with the athlete.',
    'Mid-week easy bike dropped — schedule too dense.',
  ]);
});

Deno.test('filterAthleteFacingTradeOffs: empty/null/undefined input → empty array', () => {
  assertEquals(filterAthleteFacingTradeOffs([]), []);
  assertEquals(filterAthleteFacingTradeOffs(null), []);
  assertEquals(filterAthleteFacingTradeOffs(undefined), []);
});

// ── §3 boundary aggregators apply the filter at source ──────────────────────

Deno.test('aggregateOptimizerScheduleSignals: filters internal telemetry from optimizer snapshots', () => {
  const out = aggregateOptimizerScheduleSignals([
    {
      goal_id: 'g1',
      trade_offs: [
        'Weekly layout: moved easy_bike from Monday to Wednesday — fewer same-sport days back-to-back.',
        'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
        'Strength: default Monday upper moved to Thursday — spacing vs lower on Friday.',
      ],
      conflicts: [],
      used_co_equal_1x_fallback: false,
      pin_restore_skipped: [],
    },
  ]);
  assertEquals(out.trade_offs.length, 1);
  assert(out.trade_offs[0].includes('Strength frequency reduced'));
  // Internal messages must not leak through the boundary.
  assert(!out.trade_offs.some((t) => t.includes('Weekly layout:')));
  assert(!out.trade_offs.some((t) => /Strength: default Monday upper moved/i.test(t)));
});

Deno.test('enrichScheduleSignalsWithCombinedPlanTradeOffs: filters internal telemetry from week_trade_offs', () => {
  const enriched = enrichScheduleSignalsWithCombinedPlanTradeOffs(
    {
      conflicts: [],
      trade_offs: ['Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.'],
      used_co_equal_1x_fallback: false,
      pin_restore_skipped: [],
    },
    {
      week_trade_offs: {
        '5': [
          'Weekly layout: moved easy_run from Tuesday to Friday — fewer same-sport days back-to-back.',
          'Mid-week easy bike dropped — schedule too dense.',
        ],
      },
      sessions_by_week: null,
    },
  );
  // Internal "Weekly layout: moved …" stripped; athlete-facing "Mid-week easy bike dropped" kept.
  assert(!enriched.trade_offs.some((t) => /Weekly layout:/i.test(t)));
  assert(enriched.trade_offs.some((t) => /Mid-week easy bike dropped/i.test(t)));
  assert(enriched.trade_offs.some((t) => /Strength frequency reduced/i.test(t)));
});

Deno.test('boundary filter: end-to-end — internal-only optimizer snapshot produces empty athlete-facing list', () => {
  // The pure-internal scenario: every optimizer message is a layout decision. After filtering,
  // the trade_offs array is empty — which is what the frontend uses to hide the "Schedule
  // adjustments" panel entirely (see GoalsScreen.tsx + scheduleSignalsNonEmpty).
  const out = aggregateOptimizerScheduleSignals([
    {
      goal_id: 'g1',
      trade_offs: [
        'Weekly layout: moved easy_bike from Monday to Wednesday — fewer same-sport days back-to-back.',
        'Weekly load balance: moved quality_bike from Tuesday to Wednesday — spread fatigue across the week.',
        'Strength: default Monday upper moved to Thursday — spacing vs lower on Friday.',
        'Swim budget raised by 500 yd total to honor 3 pinned swim days.',
      ],
      conflicts: [],
      used_co_equal_1x_fallback: false,
      pin_restore_skipped: [],
    },
  ]);
  assertEquals(out.trade_offs, []);
});

// ── §4 anchor-reference filter (Bug D) ─────────────────────────────────────

Deno.test('referencesAthletePins: catches "pinned long or group-ride days" suffix', () => {
  assert(referencesAthletePins('If you need two strength days, adjust pinned long or group-ride days first.'));
});

Deno.test('referencesAthletePins: catches "move a fixed ride / long run / long ride"', () => {
  assert(referencesAthletePins('To add a second day, move a fixed ride, long run, or swim block.'));
  assert(referencesAthletePins('move a fixed workout (group ride, long run, or long ride).'));
});

Deno.test('referencesAthletePins: catches "your pins" / "your pinned anchors"', () => {
  assert(referencesAthletePins('anchored group ride and run intervals share the same day — deliberate pairing around your pins.'));
  assert(referencesAthletePins('week-builder resolved it on its micro-grid (your pinned anchors).'));
});

Deno.test('referencesAthletePins: athlete-facing constraint messages without anchor refs are NOT matched', () => {
  assert(!referencesAthletePins('Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.'));
  assert(!referencesAthletePins('Mid-week easy bike dropped — schedule too dense.'));
  assert(!referencesAthletePins('Quality run not placed — tighten anchors or confirm a schedule change with the athlete.'));
});

Deno.test('filterAthleteFacingTradeOffs: drops anchor-referring messages when hasAthletePins=false', () => {
  const input = [
    'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
    'If you need two strength days, adjust pinned long or group-ride days first.',
    'Mid-week easy bike dropped — schedule too dense.',
    'To add a second day, move a fixed ride, long run, or swim block.',
  ];
  const out = filterAthleteFacingTradeOffs(input, { hasAthletePins: false });
  assertEquals(out, [
    'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
    'Mid-week easy bike dropped — schedule too dense.',
  ]);
});

Deno.test('filterAthleteFacingTradeOffs: keeps anchor-referring messages when hasAthletePins=true', () => {
  const input = [
    'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
    'If you need two strength days, adjust pinned long or group-ride days first.',
    'Mid-week easy bike dropped — schedule too dense.',
  ];
  const out = filterAthleteFacingTradeOffs(input, { hasAthletePins: true });
  // All three pass — athlete actually has pins, so the anchor-referring guidance is actionable.
  assertEquals(out.length, 3);
});

Deno.test('filterAthleteFacingTradeOffs: omitted option keeps anchor refs (conservative default)', () => {
  const input = ['If you need two strength days, adjust pinned long or group-ride days first.'];
  const out = filterAthleteFacingTradeOffs(input);
  assertEquals(out.length, 1);
});

Deno.test('hasAthletePinsFromPrefs: any non-empty day field is enough', () => {
  assert(hasAthletePinsFromPrefs({ long_run_day: 0 }));
  assert(hasAthletePinsFromPrefs({ long_ride_day: 6 }));
  assert(hasAthletePinsFromPrefs({ bike_quality_day: 'tuesday' }));
  assert(hasAthletePinsFromPrefs({ strength_preferred_days: ['Monday'] }));
});

Deno.test('hasAthletePinsFromPrefs: empty / null / undefined → false', () => {
  assertEquals(hasAthletePinsFromPrefs(null), false);
  assertEquals(hasAthletePinsFromPrefs(undefined), false);
  assertEquals(hasAthletePinsFromPrefs({}), false);
  assertEquals(hasAthletePinsFromPrefs({ strength_preferred_days: [] }), false);
});

Deno.test('Bug D end-to-end: aggregator drops anchor refs when hasAthletePins=false', () => {
  const out = aggregateOptimizerScheduleSignals(
    [
      {
        goal_id: 'g1',
        trade_offs: [
          'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
          'CO_EQUAL_STRENGTH (recovery): co-equal strength provisional fallback',
        ],
        conflicts: [],
        used_co_equal_1x_fallback: false,
        pin_restore_skipped: [],
      },
    ],
    { hasAthletePins: false },
  );
  // The CO_EQUAL_STRENGTH humanization rewrites to "move a fixed ride …", which is
  // an anchor-referring message — must be dropped when athlete has no pins.
  assert(
    !out.trade_offs.some((t) => /fixed ride/i.test(t)),
    `expected anchor-ref message dropped — got ${JSON.stringify(out.trade_offs)}`,
  );
  // Athlete-facing constraint message stays surfaced.
  assert(out.trade_offs.some((t) => /Strength frequency reduced/i.test(t)));
});

Deno.test('Bug D: enrich aggregator honors hasAthletePins', () => {
  const enriched = enrichScheduleSignalsWithCombinedPlanTradeOffs(
    {
      conflicts: [],
      trade_offs: [
        'Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.',
        'If you need two strength days, adjust pinned long or group-ride days first.',
      ],
      used_co_equal_1x_fallback: false,
      pin_restore_skipped: [],
    },
    {
      week_trade_offs: null,
      sessions_by_week: null,
      hasAthletePins: false,
    },
  );
  assert(!enriched.trade_offs.some((t) => /pinned long or group-ride/i.test(t)));
  assert(enriched.trade_offs.some((t) => /Strength frequency reduced/i.test(t)));
});
