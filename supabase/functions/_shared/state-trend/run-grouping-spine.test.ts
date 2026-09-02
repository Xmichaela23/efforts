/**
 * ⛔⛔ ITEM 2 + ITEM 3, PINNED THROUGH THE REAL ASSEMBLY (2026-08-28).
 *
 * Not through the helpers — through `assembleStateTrends` and `toStateTrendsV1`, because this row's
 * signature failure is a fix landing where nothing reads. `StatePerformanceSection` renders
 * `efficiency.verdict`, and the per-lift map / display map in this file has silently dropped an
 * upstream field three separate times. A helper test would not have caught any of them.
 *
 * Run: deno test --no-check --allow-read --allow-env \
 *        supabase/functions/_shared/state-trend/run-grouping-spine.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type EnduranceSpineSeries } from './assemble.ts';

const AS_OF = '2026-09-20';

/** A run for the ROUTE pool — the population that actually decides the screen. */
const effRow = (date: string, pace: number, hr: number, workout_type: string | null) =>
  ({ date, pace_s_per_km: pace, hr, temp_f: 70, intent: null, workout_type });

const base = (extra: Record<string, unknown>) => ({
  asOf: AS_OF,
  exerciseRows: [], bikeRows: [], runJoined: [], swimRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: { run: 30 },
  ...extra,
} as never);

Deno.test('⛔⛔ THE HEADLINE VERDICT IS FITTED ON THE EASY GROUP ALONE', () => {
  /**
   * ⛔ THE POOLING THIS CLOSES. The route engine read EVERY run with no session-type gate, so a set
   * of hard sessions sat on the same regression as easy running. The work order located the defect
   * at the two duration-windowed helpers; those feed the FALLBACK verdict. **On an athlete with
   * enough runs to fit, the route engine overrides them, and the pooling lived there.**
   *
   * Easy runs improve steadily. The quality runs move the OTHER way and are far faster in absolute
   * terms — pooled, they distort the fit; grouped, they cannot touch it.
   */
  const easy = Array.from({ length: 12 }, (_, i) =>
    effRow(`2026-08-${String(i + 1).padStart(2, '0')}`, 330 - i * 2, 140, 'easy'));
  const quality = Array.from({ length: 10 }, (_, i) =>
    effRow(`2026-08-${String(i + 1).padStart(2, '0')}`, 250 + i * 6, 168, 'intervals'));

  const grouped = assembleStateTrends(base({ runEffHistory: [...easy, ...quality] })) as any;
  const easyOnly = assembleStateTrends(base({ runEffHistory: easy })) as any;

  // ⛔ THE VERDICT IS UNCHANGED BY THE PRESENCE OF THE QUALITY SESSIONS. That is the whole claim.
  assertEquals(grouped.runFitness.efficiency.verdict, easyOnly.runFitness.efficiency.verdict);
  assertEquals(grouped.runFitness.efficiency.pctChange, easyOnly.runFitness.efficiency.pctChange);
  // ⚠️ And the chart plots the verdict's own pool, never all runs — chart and verdict on different
  // data is how this row has contradicted itself for months.
  assertEquals(grouped.runFitness.efficiency.route.series.length, easy.length);
});

Deno.test('⛔ HEAT IN STEP WITH THE CALENDAR → the headline is WITHHELD AND NAMED, never sliding (2026-09-02)', () => {
  /**
   * The live −22%: eighteen easy runs, all between 69 and 89°F, the hottest ones the latest. Heat
   * and time were one axis, the joint fit split the heat cost between them, and the row read
   * "declining". Here the decline is PURELY heat (fitness flat) on a monotone summer ramp. The screen
   * must show a withheld verdict with the reason attached — not a direction, not a percent.
   */
  const temps = Array.from({ length: 14 }, (_, i) => 64 + i * 2);            // 64 → 90°F, with the calendar
  const rows = temps.map((t, i) => ({
    date: `2026-${i < 9 ? '06' : '07'}-${String((i % 9) * 3 + 1).padStart(2, '0')}`,
    pace_s_per_km: 330,
    hr: Math.round(140 * (1 + 0.005 * Math.max(0, t - 60))),                  // heat-inflated HR only
    temp_f: t, intent: null, workout_type: 'easy',
  }));
  const out = assembleStateTrends(base({ runEffHistory: rows })) as any;
  assertEquals(out.runFitness.efficiency.verdict, 'withheld');
  assertEquals(out.runFitness.efficiency.pctChange, null);
  assertEquals(out.runFitness.efficiency.route.withheld, 'heat_confounded_with_time');
  assertEquals(out.runFitness.efficiency.route.direction, 'still_learning');
  // ⚠️ The receipt keeps the count so the card can say "18 easy runs, all hot" rather than "too few".
  assertEquals(out.runFitness.efficiency.route.points, rows.length);
  const easyGroup = out.runFitness.efficiency.groups.find((g: any) => g.group === 'easy');
  assertEquals(easyGroup.withheld, 'heat_confounded_with_time');
  // The display map must carry it through to the payload the client renders.
  const v1 = toStateTrendsV1(out) as any;
  assertEquals(v1.run.efficiency.route.withheld, 'heat_confounded_with_time');
  assertEquals(v1.display.runFitness.efficiency.route.withheld, 'heat_confounded_with_time');
});

Deno.test('⛔ EVERY GROUP IS CARRIED — nothing is deleted for what kind of session it was', () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => effRow(`2026-08-0${(i % 9) + 1}`, 330 - i, 140, 'easy')),
    ...Array.from({ length: 4 }, (_, i) => effRow(`2026-08-1${i}`, 360 - i, 145, 'long')),
    ...Array.from({ length: 3 }, (_, i) => effRow(`2026-08-2${i}`, 250 - i, 168, 'tempo')),
  ];
  const out = assembleStateTrends(base({ runEffHistory: rows })) as any;
  const groups = out.runFitness.efficiency.groups as Array<{ group: string; runs: number; direction: string | null }>;
  assertEquals(groups.map((g) => g.group).sort(), ['easy', 'long', 'quality']);
  assertEquals(groups.find((g) => g.group === 'long')!.runs, 4);
  assertEquals(groups.find((g) => g.group === 'quality')!.runs, 3);
  // ⚠️ A group too thin to fit still APPEARS with a real count and no direction — the honest state.
  // A hidden group is what let the athlete believe his long runs were being read when they were not.
  assertEquals(groups.find((g) => g.group === 'long')!.direction, null);
  assertEquals(rows.length, groups.reduce((n, g) => n + g.runs, 0));
});

Deno.test('⛔⛔ THE SPINE SURVIVES THE DISPLAY MAP — the narrow point, pinned', () => {
  /**
   * `toStateTrendsV1` rebuilds the display object field by field. A field resolved upstream and not
   * named there reaches the client as NOTHING — no error, no warning. That exact failure has
   * happened three times in this file (the lift line's week, the expected curve, `slot_intent`).
   */
  const spine: EnduranceSpineSeries[] = [
    { sport: 'run', group: 'easy', points: [
      { date: '2026-09-02', hrAvg: 138, durationMin: 27, efficiency: 1.71, driftPct: 3.1, fadeWithheld: false, keySessionWithin24h: false },
    ] },
    { sport: 'run', group: 'long', points: [
      // ⛔ A VIADA LONG RUN: surges and a race-pace finish by prescription, so NO fade number — but
      // it still carries its efficiency and still feeds the trend. Withheld, never dropped.
      { date: '2026-09-06', hrAvg: 145, durationMin: 132, efficiency: 1.66, driftPct: null, fadeWithheld: true, keySessionWithin24h: true },
    ] },
  ];
  const out = assembleStateTrends(base({ enduranceSpine: spine })) as any;
  assertEquals(out.enduranceSpine, spine, 'the assembly altered a series it does not own');
  const v1 = toStateTrendsV1(out, AS_OF) as any;
  assert(v1.display.enduranceSpine, 'the spine never reached the cached contract');
  assertEquals(v1.display.enduranceSpine, spine);
  const long = v1.display.enduranceSpine.find((s: any) => s.group === 'long');
  assertEquals(long.points[0].fadeWithheld, true);
  assertEquals(long.points[0].driftPct, null);
  // ⛔ WITHHELD IS NOT MISSING. The efficiency is still there, which is what makes the two states
  // distinguishable on the screen — a gap alone reads as broken data.
  assertEquals(long.points[0].efficiency, 1.66);
});

Deno.test('⛔ NO PLAN, NO WEEK MAP, AND THE ENDURANCE READ STILL RENDERS', () => {
  /**
   * ⛔ Q-294, Michael's ruling: *a lift is prescribed so the plan is the right frame; a run is yours
   * whether a plan exists or not.* The overlay (`namedSessions`) needs a block; the spine must not.
   * A point here carries a DATE and no week, so a rebuilt block cannot empty it.
   */
  const out = assembleStateTrends(base({
    enduranceSpine: [{ sport: 'run', group: 'easy', points: [
      { date: '2026-09-02', hrAvg: 138, durationMin: 27, efficiency: 1.71, driftPct: 3.1, fadeWithheld: false, keySessionWithin24h: false },
    ] }],
    // no namedSessions, no weekByDate, no plan of any kind
  })) as any;
  const v1 = toStateTrendsV1(out, AS_OF) as any;
  assertEquals(v1.display.namedSessions, undefined, 'the overlay rendered without a block');
  assertEquals(v1.display.enduranceSpine.length, 1, 'the spine needed a plan');
  assert(!('week' in v1.display.enduranceSpine[0].points[0]), 'a spine point grew a block-week axis');
});
