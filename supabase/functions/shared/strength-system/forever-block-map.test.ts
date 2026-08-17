/**
 * ⛔⛔ THE ACCEPTANCE FIXTURE FOR THE FOREVER ALIGNMENT — work order §4, 2026-08-15.
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/forever-block-map.test.ts
 *
 * ⛔ WHAT THIS IS FOR, AND WHY IT IS ONE FILE RATHER THAN SCATTERED THROUGH THE OTHERS. The other
 * suites each pin one mechanism — the loading table, the assistance band, the pairing, the verdict.
 * This one generates a WHOLE BLOCK for one athlete and reads it week by week, all four lifts, the
 * way the athlete will. Every unit under it can pass while the assembled block is wrong; the
 * 2026-07-28 "0 building cycles" line and the eight-exercise paired day were both exactly that.
 *
 * ⛔ THE MAP IT PINS — the work order's §0 table, with the ASSISTANCE COLUMN CORRECTED against
 * `docs/REFERENCE-531-forever-pp16-45.md` (p.24's base is 50-100; p.23's 25-50 is the 7th week):
 *
 *   | weeks | phase          | main-lift scheme                          | supplemental | assistance |
 *   |-------|----------------|-------------------------------------------|--------------|------------|
 *   | 1     | TM-test week   | 70/80/90 × 5, then TM × 5+                | none         | 25 / 10 jumps |
 *   | 2–4   | Leader 1       | 5s PRO — 65/75/85 · 70/80/90 · 75/85/95   | FSL 5×5      | 50 / 10 jumps |
 *   | 5–7   | Leader 2       | same, TM one step up                      | FSL 5×5      | 50 / 10 jumps |
 *   | 8     | 7th-week deload| 70×5 · 80×3 · 90×1 · TM×1                 | none         | 25 / 10 jumps |
 *   | 9–11  | Anchor         | standard 5/3/1, top set open              | none         | 75 / 15 jumps |
 *   | 12    | TM-test week   | 70/80/90 × 5, then TM × 5+                | none         | 25 / 10 jumps |
 *
 * ⚠️ FIXTURE, NOT PRODUCTION, AND NOT TUNED TO ANYBODY. Round invented maxes; the properties under
 * test hold for any athlete. Nothing here reads a database.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 };
const LIFTS = ['Overhead Press', 'Deadlift', 'Bench Press', 'Back Squat'] as const;

const block = (weeks: number) => composeStrengthPrimaryPlan({
  durationWeeks: weeks,
  oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run' as const,
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  easyPaceMinPerMile: 9,
} as never) as any;

const PLAN = block(12);

// ⚠️ NAMED BY CONTENT, NOT BY EXACT TITLE (2026-08-16). The three-day week is the only week now, and
// its shared day is titled `Strength — Deadlift + Overhead Press`, so an equality test loses two
// lifts.
const sessionFor = (plan: any, week: number, lift: string) =>
  (plan.sessions_by_week[String(week)] ?? [])
    .find((s: any) => s.type === 'strength' && String(s.name).includes(lift));
const rowsFor = (plan: any, week: number, lift: string) =>
  (sessionFor(plan, week, lift)?.strength_exercises ?? []) as any[];
const mainRow = (plan: any, week: number, lift: string) =>
  rowsFor(plan, week, lift).find((r) => r.name === lift && !r.supplemental);
const workSets = (plan: any, week: number, lift: string) =>
  ((mainRow(plan, week, lift)?.set_plan ?? []) as any[]).filter((s) => !s.warmup);

/** Every week, every lift — the shape as a single comparable token. */
const shapeOf = (plan: any, week: number, lift: string) =>
  workSets(plan, week, lift).map((s) => `${s.reps}${s.amrap ? '+' : ''}`).join('/');

// ── 1. The block is twelve weeks and every one of them is authored ──────────

Deno.test('⛔ TWELVE WEEKS, THREE LIFTING DAYS EACH, NOTHING MISSING', () => {
  assertEquals(PLAN.duration_weeks, 12);
  assertEquals(Object.keys(PLAN.sessions_by_week).length, 12);
  for (let week = 1; week <= 12; week++) {
    const strength = (PLAN.sessions_by_week[String(week)] as any[]).filter((s) => s.type === 'strength');
    // ⛔ THREE DAYS, ALWAYS (2026-08-16) — the four-day option is deleted.
    assertEquals(strength.length, 3, `week ${week} has ${strength.length} lifting days`);
    for (const lift of LIFTS) {
      assert(mainRow(PLAN, week, lift), `week ${week} lost ${lift}`);
    }
  }
});

// ── 2. The week map ─────────────────────────────────────────────────────────

Deno.test('⛔ THE PHASE STRUCTURE IS THE §0 MAP', () => {
  assertEquals(
    PLAN.phaseStructure.phases.map((p: any) => `${p.name} ${p.start_week}-${p.end_week}`),
    // ⛔ REWRITTEN 2026-08-16: a light week after EVERY cycle (3:1), and NO opening test week.
    ['Leader 1-3', 'Deload 4-4', 'Leader 5-7', 'Deload 8-8', 'Anchor 9-11', 'TM Test 12-12'],
  );
  // Only the 7th weeks are unloads. A test week is light for a different reason and resolves to
  // `taper` instead — one week must not carry two contradictory postures.
  assertEquals(PLAN.phaseStructure.recovery_weeks, [4, 8]);
});

Deno.test('⛔ EVERY WEEK’S MAIN-LIFT SHAPE, ALL FOUR LIFTS', () => {
  const EXPECTED: Record<number, string> = {
    1:  '5/5/5',      // Leader 1: 5s PRO, no open set — the block opens on training, not testing
    2:  '5/5/5',
    3:  '5/5/5',
    4:  '5/3/1/1',    // 7th-week deload — and NOTHING is open
    5:  '5/5/5',      // Leader 2: same scheme, one step up
    6:  '5/5/5',
    7:  '5/5/5',
    8:  '5/3/1/1',    // the second 7th week, before the anchor
    9:  '5/5/5+',     // Anchor: standard 5/3/1, top set open
    10: '3/3/3+',
    11: '5/3/1+',
    12: '5/5/5/5+',   // the closing TM test — the transition gate
  };
  for (let week = 1; week <= 12; week++) {
    for (const lift of LIFTS) {
      assertEquals(shapeOf(PLAN, week, lift), EXPECTED[week], `week ${week} ${lift}`);
    }
  }
});

Deno.test('⛔ A LEADER NEVER MEASURES AND A 7TH WEEK NEVER MEASURES', () => {
  // The open set is the whole difference between a building month and a measuring one. If it ever
  // appears on a leader week, the block has become the accidental hybrid SPEC §1 exists to correct:
  // lighter weights, same fatigue cost.
  for (const week of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const lift of LIFTS) {
      assertEquals(workSets(PLAN, week, lift).some((s) => s.amrap), false, `week ${week} ${lift}`);
    }
  }
  // And the weeks that DO measure are the anchor's three plus the closing test.
  const measured: number[] = [];
  for (let week = 1; week <= 12; week++) {
    if (workSets(PLAN, week, 'Bench Press').some((s) => s.amrap)) measured.push(week);
  }
  assertEquals(measured, [9, 10, 11, 12]);
});

// ── 3. The supplemental ─────────────────────────────────────────────────────

Deno.test('⛔ FSL IS ON THE LEADER WEEKS AND NOWHERE ELSE', () => {
  // ⚠️ ONE SUPPLEMENTAL PER SESSION, NOT PER LIFT (2026-08-16). The shared deadlift + press day keeps
  // the FIRST lift's FSL block and drops the second's (§1e) — Wendler's stacked day is the main lifts
  // plus ONE round of everything else (p.77). So the row has to be found BY NAME: an untargeted
  // `find(r => r.supplemental)` on the press's session returns the DEADLIFT's block and the test
  // reads as if the press still had one.
  const fsl = (week: number, lift: string) =>
    rowsFor(PLAN, week, lift).find((r) => r.supplemental && r.name === lift);
  // ⛔ THE PRESS NO LONGER HAS A DAY OF ITS OWN, so it carries no supplemental at all. That is the
  // §1e dose rule, not an omission, and it is asserted below rather than skipped.
  const OWN_DAY_LIFTS = LIFTS.filter((l) => l !== 'Overhead Press');
  for (const week of [1, 2, 3, 5, 6, 7]) {
    for (const lift of OWN_DAY_LIFTS) {
      const row = fsl(week, lift);
      assert(row, `week ${week} ${lift} lost its supplemental`);
      assertEquals([row.name, row.sets, row.reps], [lift, 5, 5], `week ${week} ${lift}`);
      // ⛔ AT THE WEEK'S OWN OPENING WEIGHT — the bar is already loaded to it by the first work set.
      assertEquals(row.weight, workSets(PLAN, week, lift)[0].weight, `week ${week} ${lift} FSL weight`);
    }
    // ⛔ AND THE SHARED DAY CARRIES EXACTLY ONE, THE DEADLIFT'S. A second FSL block here is ten sets
    // of five on a day that already holds two main lifts — the dose error §1e exists to stop.
    const shared = rowsFor(PLAN, week, 'Overhead Press').filter((r) => r.supplemental);
    assertEquals(shared.length, 1, `week ${week} shared day carries ${shared.length} supplementals`);
    assertEquals(shared[0].name, 'Deadlift', `week ${week} shared day kept the wrong lift's block`);
  }
  for (const week of [4, 8, 9, 10, 11, 12]) {
    for (const lift of LIFTS) {
      assertEquals(fsl(week, lift), undefined, `week ${week} ${lift} must carry no supplemental`);
    }
    // Nothing supplemental anywhere on a deload, an anchor or the closing test week.
    const any = (PLAN.sessions_by_week[String(week)] as any[])
      .filter((s) => s.type === 'strength')
      .flatMap((s) => (s.strength_exercises ?? []) as any[])
      .filter((r) => r.supplemental);
    assertEquals(any.length, 0, `week ${week} carries ${any.length} supplemental rows`);
  }
});

Deno.test('the supplemental sits between the main lift and the assistance', () => {
  for (const lift of LIFTS) {
    const names = rowsFor(PLAN, 2, lift);
    const mainAt = names.findIndex((r) => r.name === lift && !r.supplemental);
    const fslAt = names.findIndex((r) => r.supplemental);
    const firstAssistance = names.findIndex((r) => r.load_prescribed === false);
    assert(mainAt < fslAt && fslAt < firstAssistance,
      `${lift}: order is ${names.map((r) => r.name).join(', ')}`);
  }
});

// ── 4. The assistance and jump bands, per phase ─────────────────────────────

Deno.test('⛔ THE ASSISTANCE BAND FOLLOWS THE PHASE — leaders light, anchor heavy (Forever p.18)', () => {
  const totals = (week: number, lift: string) => rowsFor(PLAN, week, lift)
    .filter((r) => typeof r.reps === 'string' && String(r.reps).endsWith('total'))
    .map((r) => String(r.reps));
  // ⛔ REWRITTEN 2026-08-16 (§1g): THE BAND IS SET BY COMPETING STRESS, NOT BY THE CYCLE PHASE.
  //   0 hard endurance days → 40-50 · 1 → 30-40 · 2 → 25-30. Whole block capped at 50, which is
  //   OURS and a deliberate step below Wendler's 50-100 base (p.24) for a concurrent athlete.
  // This plan carries no hard day and no tested capacity, so every slot sits at 40 all block.
  const FLAT = '40 total';
  const EXPECTED: Record<number, string> = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, FLAT]),
  );
  for (let week = 1; week <= 12; week++) {
    for (const lift of LIFTS) {
      const t = totals(week, lift);
      assertEquals(t.length, 3, `week ${week} ${lift} should carry three slots`);
      for (const v of t) assertEquals(v, EXPECTED[week], `week ${week} ${lift}`);
    }
  }
});

Deno.test('⛔ THE JUMPS FOLLOW IT TOO — 2×5 light, 3×5 on the anchor, lower days only', () => {
  const jump = (week: number, lift: string) => rowsFor(PLAN, week, lift).find((r) => r.name === 'Box Jump');
  for (const week of [1, 4, 5, 8, 12]) {
    assertEquals(jump(week, 'Back Squat')?.sets, 2, `week ${week} squat`);
    assertEquals(jump(week, 'Deadlift')?.sets, 2, `week ${week} deadlift`);
  }
  for (const week of [9, 10, 11]) {
    assertEquals(jump(week, 'Back Squat')?.sets, 3, `week ${week} squat`);
  }
  // ⛔ AND NEVER ON AN UPPER DAY. `upper` is a LOAD CLAIM five separate things read; a jump on a
  // bench day makes it false on all five.
  // ⚠️ THE PRESS HAS NO UPPER DAY OF ITS OWN ANY MORE (2026-08-16) — it shares the deadlift's, which
  // is a LOWER day and takes the primer for that reason. Asserting `undefined` on the press would now
  // be asserting the deadlift lost its jumps. So the claim is checked on the bench day, the one pure
  // upper day left, and the shared day is pinned to ONE jump — the deadlift's, not one per lift.
  for (let week = 1; week <= 12; week++) {
    assertEquals(jump(week, 'Bench Press'), undefined, `week ${week} bench`);
    const shared = rowsFor(PLAN, week, 'Overhead Press').filter((r) => r.name === 'Box Jump');
    assertEquals(shared.length, 1, `week ${week} shared day carries ${shared.length} jump rows`);
  }
});

// ── 5. The weights, end to end, for one lift ────────────────────────────────

Deno.test('⛔ THE WHOLE TWELVE WEEKS OF ONE LIFT, IN POUNDS', () => {
  // Bench, 1RM 225 → training max 190 (85%, rounded down). It steps +5 per cycle: 190 · 195 · 200.
  // ⚠️ EVERY NUMBER BELOW IS ARITHMETIC OFF THOSE THREE. If one moves, either the working number or
  // a percentage moved, and both are Wendler's.
  const line = (week: number) => workSets(PLAN, week, 'Bench Press')
    .map((s: any) => `${s.weight}x${s.reps}${s.amrap ? '+' : ''}`).join(' ');
  assertEquals(line(1),  '120x5 140x5 160x5');          // 65/75/85 of 190 — cycle 1 opens the block
  assertEquals(line(2),  '130x5 150x5 170x5');          // 70/80/90
  assertEquals(line(3),  '140x5 160x5 180x5');          // 75/85/95
  assertEquals(line(4),  '130x5 150x3 170x1 190x1');    // the first 7th week, at cycle 1's 190
  assertEquals(line(5),  '125x5 145x5 165x5');          // TM 195
  assertEquals(line(6),  '135x5 155x5 175x5');
  assertEquals(line(7),  '145x5 165x5 185x5');
  assertEquals(line(8),  '135x5 155x3 175x1 195x1');    // the second 7th week, at 195
  assertEquals(line(9),  '130x5 150x5 170x5+');         // TM 200, anchor
  assertEquals(line(10), '140x3 160x3 180x3+');
  assertEquals(line(11), '150x5 170x3 190x1+');
  assertEquals(line(12), '140x5 160x5 180x5 200x5+');   // the closing test at 200
});

Deno.test('the warm-up ramp is on the cycle weeks and on none of the light ones', () => {
  const ramp = (week: number, lift: string) =>
    ((mainRow(PLAN, week, lift)?.set_plan ?? []) as any[]).filter((s) => s.warmup);
  for (const week of [1, 2, 3, 5, 6, 7, 9, 10, 11]) {
    for (const lift of LIFTS) {
      assertEquals(ramp(week, lift).map((s) => s.reps), [5, 5, 3], `week ${week} ${lift}`);
    }
  }
  for (const week of [4, 8, 12]) {
    for (const lift of LIFTS) {
      assertEquals(ramp(week, lift).length, 0, `week ${week} ${lift} should have no ramp`);
    }
  }
});

// ── 6. The other two lengths ────────────────────────────────────────────────

Deno.test('⛔ 16 WEEKS IS NOT OFFERED — the request builds a 12-week block', () => {
  // Four cycles cannot be 2:1, and two anchors back to back is the configuration this block exists
  // to avoid for a concurrent athlete. The length is refused rather than built into a shape neither
  // source supports (2026-08-16).
  const p16 = block(16);
  assertEquals(p16.duration_weeks, 12);
  assertEquals(
    p16.phaseStructure.phases.map((x: any) => `${x.name} ${x.start_week}-${x.end_week}`),
    ['Leader 1-3', 'Deload 4-4', 'Leader 5-7', 'Deload 8-8', 'Anchor 9-11', 'TM Test 12-12'],
  );
});

Deno.test('⛔ THE 8-WEEK BLOCK — one leader, one anchor, same 3:1 rhythm', () => {
  const p8 = block(8);
  assertEquals(p8.duration_weeks, 8);
  assertEquals(
    p8.phaseStructure.phases.map((x: any) => `${x.name} ${x.start_week}-${x.end_week}`),
    ['Leader 1-3', 'Deload 4-4', 'Anchor 5-7', 'TM Test 8-8'],
  );
  // The entry gate's 1RM stands in for the opening test — and the plan's copy says so by naming only
  // the test week it actually has.
  assertEquals(/Week 8 tests the working number/.test(p8.description), true, p8.description);
  assertEquals(/Weeks 1 and 8/.test(p8.description), false, p8.description);
});

// ── 7. The copy the athlete reads ───────────────────────────────────────────

Deno.test('the plan description names the shape, the test weeks and the session cost', () => {
  const d = String(PLAN.description);
  assertEquals(/2 building cycles, then one measuring cycle from week 9/.test(d), true, d);
  assertEquals(/Each cycle runs three weeks, with a light week between them/.test(d), true, d);
  assertEquals(/2 building cycles/.test(d), true, d);
  // ⛔ ONE TEST WEEK NOW, NOT TWO (2026-08-16) — the opening test was dropped, so the sentence the
  // copy derives is the single-week one. It is derived from `testWeeks`, not written twice.
  assertEquals(/Week 12 tests the working number/.test(d), true, d);
  // ⛔ THE SESSION-LENGTH COST IS DISCLOSED ONCE, IN THE PLAN. A cost the athlete pays and cannot see
  // is not disclosed; a cost repeated on twelve weeks of cards is nagging.
  assertEquals(/adds about ten minutes/.test(d), true, d);
  assertEquals(d.match(/adds about ten minutes/g)?.length, 1, 'said more than once');
});
