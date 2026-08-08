/**
 * Placement-unification regression lock (2026-08-07).
 *
 * THE BUG THIS EXISTS FOR: `week-builder.ts` placed the second easy run of a run-only plan on a
 * literal `grid.get('Thursday')` — no optimizer, no dispersion, no check of what was already on
 * the day. On every run-only combined plan whose quality run the optimizer put on Thursday (the
 * common case) the athlete got intervals AND an easy run on the same day; when `run_easy_day`
 * also resolved to Thursday they got two easy runs stacked on it. A 640-config sweep over full
 * plan length hit one or both in 13,440 of 30,720 generated weeks.
 *
 * The fix moved the day-choice into `_shared/week-optimizer.ts` (`easy_run_count` /
 * `preferred_days.easy_run_extra`), which is the sole day-authority per CLAUDE.md. The COUNT
 * stayed with the builder, so run volume did not move: of the weeks whose run count fell, every
 * single one was explained by deleting a stacked session — zero unexplained losses.
 *
 * ⛔ THIS TEST IS DISCIPLINE-GENERIC ON PURPOSE. The dispersion rule was run-only when the bug was
 * found (`easyRunAnchorAdjacencyPenalty` had no bike or swim equivalent), so bike and swim easy
 * work was placed first-available. Asserting all three keeps the next change from re-forking them.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/easy-session-placement.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import { reconcileAthleteStateWithWeekOptimizer } from './reconcile-athlete-state-week-optimizer.ts';
import type { AthleteState, GoalInput } from './types.ts';

const MARATHON: GoalInput[] = [
  { id: 'a', event_name: 'Marathon', event_date: '2026-11-01', distance: 'marathon', sport: 'run', priority: 'A' } as unknown as GoalInput,
];
const TRI: GoalInput[] = [
  { id: 'a', event_name: 'A 70.3', event_date: '2026-11-01', distance: '70.3', sport: 'triathlon', priority: 'A' } as unknown as GoalInput,
];

type Session = { day: string; type: string; tags?: string[] };

/** Every easy-session placement defect in one built week, as `DEFECT day` strings. */
function defectsInWeek(sessions: Session[]): string[] {
  const out: string[] = [];
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const d = String(s.day);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  for (const [day, list] of byDay) {
    const tags = (s: Session) => s.tags ?? [];
    // Hickson-grounded: heavy lower work may not share the long-run day (§8.2).
    if (
      list.some((s) => tags(s).includes('long_run')) &&
      list.some((s) => s.type === 'strength' && tags(s).includes('lower_body'))
    ) out.push(`LOWER_ON_LONG_RUN ${day}`);

    for (const sport of ['run', 'bike', 'swim'] as const) {
      const ofSport = list.filter((s) => s.type === sport);
      const easy = ofSport.filter((s) => tags(s).includes('easy'));
      const hard = ofSport.filter((s) =>
        tags(s).includes('quality') || tags(s).includes('long_run') || tags(s).includes('long_ride'),
      );
      // Seiler: easy days stay easy and spread out; stacking one onto the hard day of the same
      // discipline is the opposite of polarized, and it is what the hardcoded Thursday produced.
      if (easy.length > 1) out.push(`DOUBLE_EASY_${sport.toUpperCase()} ${day}`);
      if (easy.length && hard.length) out.push(`EASY_ON_HARD_${sport.toUpperCase()} ${day}`);
    }
  }
  return out;
}

function defectsForConfig(goals: GoalInput[], over: Record<string, unknown>): string[] {
  const raw = {
    current_ctl: 55,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    long_run_day: 0,
    training_intent: 'completion',
    strength_protocol: 'durability',
    ...over,
  } as unknown as AthleteState;
  const hasTriGoal = goals.some((g) =>
    ['triathlon', 'tri'].includes(String(g.sport ?? '').toLowerCase()),
  );
  const state = reconcileAthleteStateWithWeekOptimizer(raw, { hasTriGoal });
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(
    goals, new Date('2026-08-10T12:00:00Z'), state,
  );
  const found: string[] = [];
  let prev = 300;
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, state, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: Session[]; total_weighted_tss: number };
    for (const d of defectsInWeek(wk.sessions)) found.push(`w${w}: ${d}`);
    prev = wk.total_weighted_tss;
  }
  return found;
}

Deno.test('no easy session is stacked on its own hard day — the Thursday-hardcode bug case', () => {
  // The exact shape from the 2026-08-07 report: marathon, Auto days, 5 days/week, long run Sunday.
  const found = defectsForConfig(MARATHON, {
    days_per_week: 5,
    weekly_hours_available: 9,
    strength_intent: 'support',
  });
  assertEquals(found, [], `easy-session placement defects: ${found.join('; ')}`);
});

Deno.test('no easy session is stacked on its own hard day — config sweep, run + tri', () => {
  const strengthPins: (string[] | undefined)[] = [
    undefined,
    ['Sunday', 'Wednesday'],   // pins ON the long-run day — must not be honored for lower
    ['Saturday', 'Sunday'],
    ['Monday', 'Saturday'],
  ];
  const found: string[] = [];
  for (const days_per_week of [4, 5, 6, 7]) {
    for (const weekly_hours_available of [6, 9, 11, 13]) {
      for (const strength_intent of ['support', 'performance']) {
        for (const long_run_day of [0, 6]) {
          for (const strength_preferred_days of strengthPins) {
            for (const integration_mode of ['separated', 'consolidated']) {
              const base = {
                days_per_week, weekly_hours_available, strength_intent, long_run_day,
                integration_mode,
                ...(strength_preferred_days ? { strength_preferred_days } : {}),
              };
              const tag = `dpw=${days_per_week} hr=${weekly_hours_available} str=${strength_intent} lrd=${long_run_day} pin=${strength_preferred_days?.join('/') ?? 'none'} mode=${integration_mode}`;
              for (const d of defectsForConfig(MARATHON, base)) found.push(`MAR ${tag} ${d}`);
              for (const d of defectsForConfig(TRI, { ...base, long_ride_day: long_run_day === 0 ? 6 : 0 })) {
                found.push(`TRI ${tag} ${d}`);
              }
            }
          }
        }
      }
    }
  }
  assertEquals(
    found.length, 0,
    `${found.length} easy-session placement defect(s); first 10:\n${found.slice(0, 10).join('\n')}`,
  );
});

Deno.test('the builder names no run day of its own — extra easy runs come from the optimizer', () => {
  // Regression guard for the literal that caused this: if someone re-adds a hardcoded weekday,
  // the extra easy run will appear on a day the reconciler never exported.
  const raw = {
    current_ctl: 55, loading_pattern: '3:1', limiter_sport: 'run', long_run_day: 0,
    training_intent: 'completion', strength_protocol: 'durability',
    days_per_week: 6, weekly_hours_available: 11, strength_intent: 'performance',
  } as unknown as AthleteState;
  const state = reconcileAthleteStateWithWeekOptimizer(raw, { hasTriGoal: false });

  const SUN_FIRST = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const allowed = new Set<string>();
  if (state.run_easy_day != null) allowed.add(SUN_FIRST[state.run_easy_day]!);
  for (const i of state.run_easy_extra_days ?? []) allowed.add(SUN_FIRST[i]!);
  // The QUALITY-run day is also legal for an easy run, and that is not a hardcode: taper and
  // recovery weeks downgrade the quality slot in place (`week-builder.ts` easyRun-on-
  // `runQualityDay` branch) rather than moving it. The day still came from the optimizer — only
  // the session's intensity changed. The `EASY_ON_HARD_RUN` assertion above is what proves the
  // downgrade replaced the hard session instead of stacking beside it.
  if (state.run_quality_day != null) allowed.add(SUN_FIRST[state.run_quality_day]!);

  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(
    MARATHON, new Date('2026-08-10T12:00:00Z'), state,
  );
  const strays: string[] = [];
  let prev = 300;
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, MARATHON, state, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: Session[]; total_weighted_tss: number };
    for (const s of wk.sessions) {
      if (s.type !== 'run' || !(s.tags ?? []).includes('easy')) continue;
      if (!allowed.has(String(s.day))) strays.push(`w${w}: easy run on ${s.day} (optimizer named ${[...allowed].join('/') || 'none'})`);
    }
    prev = wk.total_weighted_tss;
  }
  assertEquals(strays, [], `easy run(s) on a weekday the optimizer never chose: ${strays.join('; ')}`);
});
