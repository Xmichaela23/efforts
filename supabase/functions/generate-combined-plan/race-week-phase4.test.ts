/**
 * Race-week Phase 4 — Gap 6 contract tests (activation-swim scoped to race week only).
 *
 * RACE-WEEK-PROTOCOL §8.6 / Gap 6 (decision 2026-05-18): the threshold→activation
 * swim substitution must fire ONLY in the actual race week, not every taper week.
 * After Phase 3 the A-taper is genuinely 2 weeks; its earlier (non-race) week
 * must keep SWIM §4.4 Race-Spec Light / threshold — not be de-loaded a week early.
 * The substitution is now gated on `opts.isRaceWeek` (week-builder threads
 * Boolean(raceThisWeek) via swimFromTplOpts to all 4 swimSessionFromTemplate sites).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/race-week-phase4.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swimSessionFromTemplate } from './session-factory.ts';
import {
  checkRaceWeekNoBrick,
  checkRaceWeekLongDayCaps,
  checkRaceWeekBlockOrdering,
  findMissingRaceDaySessions,
} from './validator.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

// Minimal threshold template — swimSessionFromTemplate reads session_type +
// target_yards; --no-check tolerates the loose cast (matches sibling tests).
const thresholdTpl = { session_type: 'threshold', target_yards: 2000 } as any;

Deno.test('Gap 6 — race week (taper + isRaceWeek): threshold → Race-Week Activation Swim', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 17, 'taper', 'g', 0, undefined, { isRaceWeek: true },
  );
  assertEquals(s.type, 'swim');
  assert(
    s.name.includes('Race-Week Activation Swim'),
    `expected activation swim in the race week; got "${s.name}"`,
  );
  // yards clamped to 600-800 → "… — 800 yd"
  assert(s.name.includes('800 yd'), `expected 800yd clamp; got "${s.name}"`);
});

Deno.test('Gap 6 REGRESSION GUARD — non-race A-taper week (taper, isRaceWeek:false): NOT activation', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 16, 'taper', 'g', 0, undefined, { isRaceWeek: false },
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `Phase-3 regression: week-16 A-taper-wk1 must keep Race-Spec Light/threshold, ` +
      `NOT be de-loaded to activation; got "${s.name}"`,
  );
});

Deno.test('Gap 6 — opts omitted in a taper week: substitution does NOT fire (opt-in only)', () => {
  // Back-compat: the substitution is now opt-in via opts.isRaceWeek. With no
  // opts the old `phase==='taper'` blanket trigger must no longer activate.
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 16, 'taper', 'g', 0, undefined,
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `substitution must be gated on opts.isRaceWeek; got "${s.name}"`,
  );
});

Deno.test('Gap 6 — non-taper phase ignores isRaceWeek (phase guard intact)', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 8, 'build', 'g', 0, undefined, { isRaceWeek: true },
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `activation is taper-phase-only; a build-week threshold must stay threshold; got "${s.name}"`,
  );
});

// ── Gap 9 (b/c/d): soft race-week validator regression guards ───────────────

const sess = (tags: string[], duration = 30) => ({ tags, duration, type: 'run', day: 'Sunday' });
const wk = (race_week: 'A' | 'B' | null, phase: string, sessions: unknown[] = []) =>
  ({ weekNum: 1, race_week, phase, sessions } as any);

Deno.test('Gap 9b — race-week no-brick: pass when clean / non-race brick ignored; fail on race-week brick', () => {
  assertEquals(checkRaceWeekNoBrick([wk('A', 'taper', [sess(['race'])]), wk(null, 'build', [sess(['brick'])])]), true);
  assertEquals(checkRaceWeekNoBrick([wk('B', 'taper', [sess(['brick'])])]), false);
});

Deno.test('Gap 9c — race-week long-day caps: absence=PASS, at-cap=PASS, over-cap=FAIL, non-race ignored', () => {
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['race'])])]), true, 'no long day = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_run'], 45)])]), true, 'long_run 45 = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_ride'], 60)])]), true, 'long_ride 60 = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('B', 'taper', [sess(['long_run'], 60)])]), false, 'long_run 60 = fail');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_ride'], 90)])]), false, 'long_ride 90 = fail');
  assertEquals(checkRaceWeekLongDayCaps([wk(null, 'build', [sess(['long_run'], 180)])]), true, 'non-race ignored');
});

Deno.test('Gap 9d — block ordering: B→recovery→rebuild→A pass; missing rebuild / wrong order fail; no-B vacuous pass', () => {
  const ok = [wk('B', 'taper'), wk(null, 'recovery'), wk(null, 'rebuild'), wk('A', 'taper')];
  assertEquals(checkRaceWeekBlockOrdering(ok), true);
  assertEquals(checkRaceWeekBlockOrdering([wk('B', 'taper'), wk(null, 'recovery'), wk('A', 'taper')]), false, 'no rebuild between');
  assertEquals(checkRaceWeekBlockOrdering([wk('B', 'taper'), wk(null, 'rebuild'), wk(null, 'recovery'), wk('A', 'taper')]), false, 'rebuild before recovery');
  assertEquals(checkRaceWeekBlockOrdering([wk('A', 'taper'), wk(null, 'base')]), true, 'single-race / no B = vacuous pass');
});

// ── Gap 8 / T6 — end-to-end realized two-70.3 (B=13 / A=17) session content ──
// The genuinely-additive E2E: existing phase3 tests use the SYNTHETIC B=14/A=18
// fixture; none assert the REALIZED B=13/A=17 plan's per-week session content.
// Geometry = the user's verified live plan (NorCal B 2026-08-16, Santa Cruz A
// 2026-09-13, start 2026-05-18 → w1=13, w2=17, totalWeeks=17).

function makeAthleteStateE2E(): AthleteState {
  return {
    current_ctl: 60, weekly_hours_available: 10, loading_pattern: '3:1',
    limiter_sport: 'run', rest_days: [0, 1, 2, 3, 4, 5, 6],
    long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
    run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
    training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
  } as AthleteState;
}

Deno.test('Gap 8 / T6 — realized two-70.3 B=13/A=17: phases, race sessions, brick=0, validators', () => {
  const goals: GoalInput[] = [
    { id: 'b', event_name: 'IRONMAN 70.3 Northern California', event_date: '2026-08-16', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'a', event_name: 'IRONMAN 70.3 Santa Cruz', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, makeAthleteStateE2E());

  // Realized geometry contract (regression lock; distinct from the synthetic 14/18 fixture).
  assertEquals(totalWeeks, 17);
  assertEquals(raceAnchors.find((x) => x.goalId === 'b')!.planWeek, 13, 'B-race = wk13');
  assertEquals(raceAnchors.find((x) => x.goalId === 'a')!.planWeek, 17, 'A-race = wk17');

  const expectedPhase: Record<number, string> = { 13: 'taper', 14: 'recovery', 15: 'rebuild', 16: 'taper', 17: 'taper' };
  const built: any[] = [];
  let prev = 300;
  for (let w = 13; w <= 17; w++) {
    assertEquals(blockForWeek(blocks, w).phase, expectedPhase[w], `wk${w} phase`);
    const week = buildWeek(w, blockForWeek(blocks, w), prev, goals, makeAthleteStateE2E(), undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    });
    prev = week.total_weighted_tss;
    built.push(week);
  }
  const [w13, w14, w15, w16, w17] = built;

  // race_week carriage (Phase-1) on the REALIZED weeks
  assertEquals(w13.race_week, 'B');
  assertEquals(w17.race_week, 'A');
  assert(!w14.race_week && !w15.race_week && !w16.race_week, 'wk14-16 are not race weeks');

  // Exactly one race session in 13 & 17 with the §4 tag set, none elsewhere
  const RACE_TAGS = ['tri_race', 'race_day', 'event', 'no_extra_training'];
  for (const [wk_, goalId, lbl] of [[w13, 'b', 'B'], [w17, 'a', 'A']] as const) {
    const races = wk_.sessions.filter((s: any) => s.type === 'race');
    assertEquals(races.length, 1, `${lbl}-race week: exactly one race session`);
    assertEquals(races[0].serves_goal, goalId);
    for (const t of RACE_TAGS) assert((races[0].tags || []).includes(t), `${lbl}-race tag ${t}`);
  }
  for (const [wk_, lbl] of [[w14, '14'], [w15, '15'], [w16, '16']] as const) {
    assertEquals(wk_.sessions.filter((s: any) => s.type === 'race').length, 0, `wk${lbl} has no race session`);
  }

  // brick=0 in both race weeks; Phase-2 hard guarantee holds; Slice-2 soft guards pass
  for (const wk_ of [w13, w17]) {
    assertEquals(wk_.sessions.filter((s: any) => (s.tags || []).includes('brick')).length, 0);
  }
  assertEquals(findMissingRaceDaySessions(built, raceAnchors), []);
  assertEquals(checkRaceWeekNoBrick(built), true);
  assertEquals(checkRaceWeekLongDayCaps(built), true);
  assertEquals(checkRaceWeekBlockOrdering(built), true);
});
