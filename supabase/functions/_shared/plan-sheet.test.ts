// deno test --no-lock -A --no-check supabase/functions/_shared/plan-sheet.test.ts
import { assertEquals, assert } from 'jsr:@std/assert';
import { composePlanSheet, ME_WEIGHT_LINE, ENDURANCE_CHANGES_LINE, spellOut } from './plan-sheet.ts';
import { SETS_EARNED_PARAGRAPH } from './standing-plan/program-outline.ts';
import type { PlanSheetV1, SheetLiftRow } from './plan-sheet.ts';

const liftsOf = (s: PlanSheetV1): SheetLiftRow[] =>
  (s.training_days.flatMap((d) => d.blocks).find((b) => b.kind === 'lifts') as { rows: SheetLiftRow[] }).rows;

const ex = (o: Record<string, unknown>) => ({ kind: 'strength', strength: { unit: 'lb', ...o } });
const ROWS = [
  {
    id: 'a', date: '2026-09-28', type: 'strength', name: 'Upper body: Push', duration: 55, tags: ['standing_plan'],
    computed: { steps: [
      ex({ name: 'Bench Press', slot_intent: 'ME', sets: 1, reps: '1-5', weight_display: '175 lb', set_plan: [{ reps: 5, warmup: true }, { weight: 175 }] }),
      ex({ name: 'Bench Press', slot_intent: 'ME', sets: 1, reps: '1-5', weight_display: '180 lb', set_plan: [{ weight: 180, reps: 3 }] }),
      ex({ name: 'Seated DB Press', slot_intent: 'DE', sets: 4, reps: '2-4', reserve_text: '3 to 4', set_plan: [{ reps: 4 }] }),
      ex({ name: 'Tate Press', slot_intent: 'HYP', sets: 3, reps: '6-12', reserve_text: '0 to 2', superset_group: 'g1', weight_suggested: 25, weight_per: 'each' }),
      ex({ name: 'DB Curl', slot_intent: 'HYP', sets: 3, reps: '6-12', reserve_text: '0 to 2', superset_group: 'g1' }),
    ] },
  },
  {
    id: 'b', date: '2026-09-28', type: 'ride', name: 'One-to-One Repeats', duration: 33, tags: [],
    computed: { step_lines: ['12:30 warm-up · 10- to 15-minute easy spin', '10 × 1:00 @ 231–273 W'], narrative: '10 rounds: 1 minute at 231–273 W.' },
  },
  { id: 'c', date: '2026-09-30', type: 'strength', name: 'Plyo warm-up', duration: 20, tags: ['plyo'],
    strength_exercises: [{ name: 'Skater Hops', benefit_line: 'Benefit: general speed and explosiveness.' }],
    computed: { steps: [ex({ name: 'Skater Hops' })] } },
];

Deno.test('the approved "How it changes" lines, word for word (Michael, 2026-10-02)', () => {
  assertEquals(SETS_EARNED_PARAGRAPH, 'Each lift starts at the low end of its set range. Two sessions in a row at the top of the range, or one rep short of it, add a set, up to its cap. A session below the range takes a set off.');
  assertEquals(ME_WEIGHT_LINE, 'Two sessions in a row with 5 reps on every set at the same weight, and the weight goes up: 5 lb on upper-body lifts, 10 lb on lower-body lifts. A session at 0 reps, or three in a row with fewer reps each time, brings it back down.');
  assertEquals(ENDURANCE_CHANGES_LINE, 'Easy and long sessions change length from week to week. Hard sessions change workout from week to week. Paces and watts follow your threshold and FTP.');
  const s = composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS });
  assertEquals(s.changes, [SETS_EARNED_PARAGRAPH, ME_WEIGHT_LINE, ENDURANCE_CHANGES_LINE]);
});

Deno.test('rep goal, not range: ME after a jump shows the range, ME with a last time shows it, the rest show the band top', () => {
  const s = composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS });
  const rows = liftsOf(s);
  assertEquals(rows.map((r) => r.sets_reps), ['1 × 1–5', '1 × 3', '4 × 4', '3 × 12', '3 × 12']);
  assertEquals(rows.map((r) => r.intent), ['Maximum effort', 'Maximum effort', 'Dynamic effort', 'Hypertrophy', 'Hypertrophy']);
  assertEquals(rows.map((r) => r.weight), ['175 lb', '180 lb', '—', '25 lb each', '—']);
});

Deno.test('a superset pair is marked on both rows; the first says back to back', () => {
  const rows = liftsOf(composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS }));
  assertEquals(rows.map((r) => [r.pair, r.pair_first]), [[false, false], [false, false], [false, false], [true, true], [true, false]]);
  assertEquals(rows[3].effort, 'Back to back with the next lift.');
});

Deno.test('no abbreviations: DB is spelled Dumbbell', () => {
  const rows = liftsOf(composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS }));
  assertEquals(rows[2].name, 'Seated Dumbbell Press');
  assertEquals(spellOut('DBs and DB Row, not DBX'), 'Dumbbells and Dumbbell Row, not DBX');
});

Deno.test('rides print the server narrative, never step code; plyo prints its drill instruction once', () => {
  const s = composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS });
  const blocks = s.training_days.flatMap((d) => d.blocks);
  const ride = blocks.find((b) => b.kind === 'endurance') as { steps: unknown };
  assertEquals(ride.steps, [
    { label: 'Warm-up', text: '12:30 · 10- to 15-minute easy spin' },
    { label: 'Main', text: '10 rounds: 1 minute at 231–273 W.' },
  ]);
  const plyo = blocks.filter((b) => b.kind === 'plyo') as { rows: unknown; note: string | null }[];
  assertEquals(plyo.length, 1);
  assertEquals(plyo[0].rows, [{ drill: 'Skater Hops', for: 'General speed and explosiveness' }]);
  assert(plyo[0].note);
  assert(!JSON.stringify(s).includes('round_'), 'no step token on the sheet');
});

Deno.test('organized by day: a section per training day in the week table order; rest days only in the week table', () => {
  const s = composePlanSheet({ planName: 'P', totalWeeks: 12, week: 5, rows: ROWS });
  assertEquals(s.week.days.map((d) => d.day), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assertEquals(s.training_days.map((d) => d.day), ['Monday', 'Wednesday']);
  assertEquals(s.training_days[0].blocks.map((b) => b.kind), ['lifts', 'endurance']);
  assertEquals(s.week.days[0].sessions.map((x) => x.title), ['Upper body: Push', 'One-to-One Repeats']);
  // The plyo day carries no length, so Wednesday has no time.
  assertEquals(s.training_days[1].time, null);
  assertEquals(s.training_days[0].time?.low, (s.week.days[0].sessions[0].time?.low ?? 0) + 33);
});
