// ============================================================================
// THE PROGRAM OUTLINE (2026-09-25) — the sheet the plan name on Today and Info on the planner open.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/program-outline.test.ts
//
// The words are Michael's, approved 2026-09-25; these tests pin the order, which sections appear for which plan, and
// that the set-type numbers are the p218 bands the engine prescribes from.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALL_ROUNDER_ENDURANCE_LINE,
  composeProgramOutline,
  DELOAD_LINE,
  OUTLINE_HEADINGS,
  RETEST_LINE,
  SET_TYPE_SECTIONS,
  setIntentsOf,
  type OutlineWeekRow,
} from './program-outline.ts';
import {
  buildStandingPlanRow,
  composeBlock,
  defaultCompetitionLifts,
  PAIN_TOLERANCE_NOTE,
  SETS_EARNED_PARAGRAPH,
  TEST_WEEK_SENTENCE,
  type PlanSession,
} from './index.ts';
import { prescribe, type ViadaIntent } from '../strength-grid/index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};
const COMPOSE = {
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

/** 2026-09-21 is a Monday. */
const DATE_OF: Record<string, string> = {
  monday: '2026-09-21', tuesday: '2026-09-22', wednesday: '2026-09-23', thursday: '2026-09-24',
  friday: '2026-09-25', saturday: '2026-09-26', sunday: '2026-09-27',
};
const rowsFor = (sessions: PlanSession[]): OutlineWeekRow[] =>
  sessions.map((s) => ({ ...s, date: DATE_OF[s.day.toLowerCase()] }));

const built = (frame: 'all_rounder' | 'strength_5k') =>
  buildStandingPlanRow({ compose: { ...COMPOSE, frame } as never, weeks: 4, taperWeeks: [] });

const outlineOf = (row: ReturnType<typeof built>, week: number, standingPlan: unknown = row.config) =>
  composeProgramOutline({
    planName: row.name,
    standingPlan,
    sessionsByWeek: row.sessions_by_week,
    week,
    weekRows: rowsFor(row.sessions_by_week[String(week)] ?? []),
  })!;

const headings = (o: ReturnType<typeof outlineOf>) => o.sections.map((s) => s.heading);

// ── ORDER ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('the sections come in the approved order, and the foot is last and unheaded', () => {
  const row = built('all_rounder');
  const o = outlineOf(row, 2);
  const setHeadings = setIntentsOf(row.sessions_by_week, 1).map((i) => SET_TYPE_SECTIONS[i].heading);
  assertEquals(headings(o), [
    OUTLINE_HEADINGS.thisWeek,
    ...setHeadings,
    OUTLINE_HEADINGS.sets,
    OUTLINE_HEADINGS.deload,
    OUTLINE_HEADINGS.retest,
    OUTLINE_HEADINGS.endurance,
    null,
  ]);
  assertEquals(o.title, row.name);
  const byHeading = new Map(o.sections.map((s) => [s.heading, s.lines]));
  assertEquals(byHeading.get(OUTLINE_HEADINGS.sets), [SETS_EARNED_PARAGRAPH]);
  assertEquals(byHeading.get(OUTLINE_HEADINGS.deload), [DELOAD_LINE]);
  assertEquals(byHeading.get(OUTLINE_HEADINGS.retest), [RETEST_LINE]);
  assertEquals(byHeading.get(OUTLINE_HEADINGS.endurance), [ALL_ROUNDER_ENDURANCE_LINE]);
});

Deno.test('this week: one line per day that has sessions, Monday to Sunday, titles joined with " · "', () => {
  const o = composeProgramOutline({
    planName: 'Run + Strength',
    standingPlan: { frame: 'strength_5k' },
    sessionsByWeek: {},
    week: 3,
    weekRows: [
      { date: '2026-09-23', type: 'run', name: 'Easy Run' },
      { date: '2026-09-21', type: 'run', name: 'Easy Run', day_order: 2 },
      { date: '2026-09-21', type: 'strength', name: 'Lower body: Push', day_order: 1 },
      { date: '2026-09-24', type: 'strength', name: 'ME: Upper' },
    ],
  })!;
  assertEquals(o.sections[0], {
    heading: OUTLINE_HEADINGS.thisWeek,
    lines: [
      'Monday: Lower body: Push · Easy Run',
      'Wednesday: Easy Run',
      // The book's spelling, as Today's card prints it (`intent-title.ts`).
      'Thursday: Maximum Effort: Upper',
    ],
  });
});

Deno.test('this week, on a built block: every busy day once, in weekday order, no rest line', () => {
  const row = built('strength_5k');
  const o = outlineOf(row, 2);
  const lines = o.sections[0].lines;
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const days = lines.map((l) => l.split(':')[0]);
  const busy = new Set((row.sessions_by_week['2'] ?? []).map((s) => s.day.toLowerCase()));
  assertEquals(days, order.filter((d) => busy.has(d.toLowerCase())));
  assert(lines.every((l) => !/\brest\b/i.test(l)), lines.join('\n'));
});

// ── SET TYPES ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test('set types: only the intents the lifting uses; a carry and the test week do not count', () => {
  const sessionsByWeek = {
    '1': [{ day: 'Monday', type: 'strength', name: 'Test: Upper', description: '', duration: 60, tags: [],
      strength_exercises: [{ name: 'Bench Press', reps: '1-5', slot_intent: 'ME' }] }],
    '2': [{ day: 'Monday', type: 'strength', name: 'Upper body: Push', description: '', duration: 60, tags: [],
      strength_exercises: [
        { name: 'Lateral Raise', reps: '6-12', slot_intent: 'HYP' },
        { name: 'Farmers Carry', reps: '', slot_intent: 'SKILL', slot_category: 'carry', prescription_words: 'medium weight' },
      ] }],
  };
  assertEquals(setIntentsOf(sessionsByWeek, 1), ['HYP']);
  const o = composeProgramOutline({ planName: 'x', standingPlan: { frame: 'hyp_5k' }, sessionsByWeek, week: 2, weekRows: [] })!;
  assertEquals(headings(o), [
    SET_TYPE_SECTIONS.HYP.heading, OUTLINE_HEADINGS.sets, OUTLINE_HEADINGS.deload, OUTLINE_HEADINGS.retest, null,
  ]);
  // ⚠️ With the skip taken, week one is an ordinary week and is read like the rest.
  assertEquals(setIntentsOf(sessionsByWeek, null), ['ME', 'HYP']);
});

Deno.test('set types on a built block are the composer\'s own index of its rows (ME rows + DE/SKILL/HYP rows)', () => {
  for (const frame of ['all_rounder', 'strength_5k'] as const) {
    const blocks = composeBlock({ ...COMPOSE, frame, weeks: 4, taperWeeks: [] } as never);
    const want = new Set<ViadaIntent>();
    for (const b of blocks.filter((w) => !w.isTestWeek)) {
      if (b.meRows.length > 0) want.add('ME');
      for (const r of b.setRows) want.add(r.intent as ViadaIntent);
    }
    const sbw: Record<string, PlanSession[]> = {};
    for (const b of blocks) sbw[String(b.week)] = b.sessions;
    assertEquals(setIntentsOf(sbw, 1), (['ME', 'DE', 'SKILL', 'HYP'] as ViadaIntent[]).filter((i) => want.has(i)), frame);
  }
});

Deno.test('the set-type numbers are the p218 bands the engine prescribes from (reps, sets, reserve)', () => {
  for (const intent of ['ME', 'DE', 'SKILL', 'HYP'] as ViadaIntent[]) {
    const p = prescribe(intent, 'barbell');
    if (p.kind !== 'barbell') throw new Error(intent);
    const line = SET_TYPE_SECTIONS[intent].line;
    const reps = /(\d+) to (\d+) reps\./.exec(line);
    assertEquals([Number(reps?.[1]), Number(reps?.[2])], [p.reps.lo, p.reps.hi], `${intent} reps: ${line}`);
    const sets = /Starts at (\d+) sets? and can reach (\d+)\./.exec(line);
    assertEquals([Number(sets?.[1]), Number(sets?.[2])], [p.setsBand.lo, p.setsBand.hi], `${intent} sets: ${line}`);
    const rir = /(\d+) to (\d+) reps in reserve\./.exec(line);
    if (p.rir == null) assertEquals(rir, null, `${intent} has no reserve target on p218`);
    else assertEquals([Number(rir?.[1]), Number(rir?.[2])], [p.rir.lo, p.rir.hi], `${intent} reserve: ${line}`);
  }
});

// ── ENDURANCE ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test('endurance: the All Rounder frame only, by frame id', () => {
  assert(headings(outlineOf(built('all_rounder'), 2)).includes(OUTLINE_HEADINGS.endurance));
  assert(!headings(outlineOf(built('strength_5k'), 2)).includes(OUTLINE_HEADINGS.endurance));
  // The display name is not read: a Run + Strength block renamed "The All Rounder" is still not one.
  const row = built('strength_5k');
  const renamed = composeProgramOutline({
    planName: 'The All Rounder', standingPlan: row.config, sessionsByWeek: row.sessions_by_week, week: 2, weekRows: [],
  })!;
  assert(!headings(renamed).includes(OUTLINE_HEADINGS.endurance));
});

// ── THE FOOT ──────────────────────────────────────────────────────────────────────────────────────────

Deno.test('the foot: p125, the description\'s sourced notes, and the test-week sentence in week one only', () => {
  const row = built('strength_5k');
  const sourced = row.config.sourced_notes ?? [];
  for (const n of sourced) assert(row.description.includes(n), `stored note not in the description: ${n}`);
  assert(row.description.endsWith([PAIN_TOLERANCE_NOTE, ...sourced].join(' ')), 'the description\'s tail is not p125 + the stored notes');

  const w1 = outlineOf(row, 1);
  assertEquals(w1.sections[w1.sections.length - 1], { heading: null, lines: [PAIN_TOLERANCE_NOTE, ...sourced, TEST_WEEK_SENTENCE] });
  assert(row.description.includes(TEST_WEEK_SENTENCE));

  const w2 = outlineOf(row, 2);
  assertEquals(w2.sections[w2.sections.length - 1], { heading: null, lines: [PAIN_TOLERANCE_NOTE, ...sourced] });

  // Week one still ahead (the plan has not started) reads as week one.
  const ahead = outlineOf(row, 0);
  assert(ahead.sections[ahead.sections.length - 1].lines.includes(TEST_WEEK_SENTENCE));

  // A block that took the skip has no test week, so no sentence even in week one.
  const skipped = outlineOf(row, 1, { ...row.config, test_skipped: true });
  assert(!skipped.sections[skipped.sections.length - 1].lines.includes(TEST_WEEK_SENTENCE));

  // A block not yet refreshed since this shipped prints no notes rather than the build-time list.
  const { sourced_notes: _gone, ...oldConfig } = row.config;
  const old = outlineOf(row, 2, oldConfig);
  assertEquals(old.sections[old.sections.length - 1].lines, [PAIN_TOLERANCE_NOTE]);
});

Deno.test('not a standing plan: no outline (a race plan keeps its old Info)', () => {
  assertEquals(composeProgramOutline({ planName: 'Marathon', standingPlan: null, sessionsByWeek: {}, week: 3, weekRows: [] }), null);
  assertEquals(composeProgramOutline({ planName: 'Marathon', standingPlan: undefined, sessionsByWeek: {}, week: 3, weekRows: [] }), null);
});
