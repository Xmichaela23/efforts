/**
 * ═══ THE THREE PLANNED SURFACES MUST GIVE THE SAME ANSWER FOR THE SAME SESSION. ═══════════════
 *
 * ⛔ THE BUG THIS PINS, and it was invisible for as long as it existed. The full planned screen
 * (`UnifiedWorkoutView` → `StructuredPlannedView`, the one with Reschedule/Delete) mapped the week
 * as `it.planned ?? it.planned_workout ?? it`. `get-week`'s internal `planned` object carries
 * `{ id, name, steps, total_duration_seconds, description, tags, … }` and **no `type`** — the sport
 * lives on the ITEM. So `availableDisciplines` asked `disciplineOf(undefined)` for every session in
 * the week, answered `[]`, and `getDisciplineSwaps` returned `[]` for EVERY planned session, for
 * every athlete, on that screen alone.
 *
 * ⚠️ AND THE FALLBACK THAT WOULD HAVE WORKED NEVER RAN. `it.planned` is truthy for every planned
 * item, so `?? it.planned_workout` was unreachable. The bug hid behind a correct-looking coalesce,
 * which is why reading the line did not reveal it — only running it did.
 *
 * ⛔ THE GATE WAS NEVER THE PROBLEM ON THE TODAY'S SURFACES. Their inputs are identical and they
 * agree under every posture — pinned below, because "the card and the drawer disagree" was the
 * reported symptom and the actual cause there was a LAYOUT collision, not the gate.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read src/lib/planned-session/surface-agreement.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  availableDisciplines,
  getDisciplineSwaps,
} from '../session-discipline-swap.ts';

/** A `planned_workout` as `get-week`'s `toPlannedWorkout` emits it (D-403). */
const plannedWorkout = (o: Record<string, unknown>) => ({
  workout_status: 'planned', tags: [], computed: null, ...o,
});

/**
 * A unified item as `get-week` returns it. ⚠️ NOTE `planned` HAS NO `type` — that is the whole
 * fixture. If a future change adds `type` to the server's internal `planned` object, this file is
 * where you will find out that the shapes moved.
 */
const item = (id: string, type: string, date: string, secs: number, tags: string[] = []) => ({
  id, date, type, status: 'planned',
  planned: { id, name: `${type} session`, steps: null, total_duration_seconds: secs, tags },
  planned_workout: plannedWorkout({ id, type, name: `${type} session`, date, total_duration_seconds: secs, tags }),
});

const WEEK = [
  item('p1', 'run', '2026-08-18', 3780, ['easy_run']),
  item('b1', 'ride', '2026-08-17', 4320, ['easy']),
  item('s1', 'strength', '2026-08-18', 3600),
];
const RUN = WEEK[0].planned_workout;

Deno.test('⛔ the full planned screen maps the week so it can SEE the athlete\'s sports', () => {
  // What the screen did before — `it.planned` first.
  const broken = WEEK.map((it: Record<string, any>) => it?.planned ?? it?.planned_workout ?? it);
  assertEquals(
    availableDisciplines(broken as never), [],
    'this is the BUG, preserved: mapping through `planned` sees no sports at all',
  );

  // What it does now — the server contract first, raw item as the fallback.
  const fixed = WEEK.map((it: Record<string, any>) => it?.planned_workout ?? it);
  assertEquals(availableDisciplines(fixed as never), ['run', 'ride']);
});

Deno.test('⛔ ALL THREE SURFACES AGREE — same session, same posture, same answer', () => {
  /**
   * The three call sites, with the inputs each actually passes:
   *   top card    — week = raw unified items,      sameDay = []
   *   drawer      — week = raw unified items,      sameDay = the day's other sessions
   *   full screen — week = `planned_workout ?? it` (after the fix)
   *
   * ⚠️ `sameDayOthers` PRODUCES WARNINGS, NEVER A GATE ("warn, never gate"), so passing it or not
   * must not change WHICH sports are offered. That is asserted here rather than assumed.
   */
  const sameDay = [{ kind: 'upper_body_strength' as const, label: 'Bench' }];
  for (const [label, posture, expected] of [
    ['undeclared', null, ['ride']],
    ['run maintain', { run: 'maintain', bike: 'maintain' }, ['ride']],
    ['run develop', { run: 'develop', bike: 'maintain' }, []],
  ] as const) {
    const topCard = getDisciplineSwaps(RUN as never, availableDisciplines(WEEK as never), [], posture as never);
    const drawer = getDisciplineSwaps(RUN as never, availableDisciplines(WEEK as never), sameDay, posture as never);
    const fullScreen = getDisciplineSwaps(
      RUN as never,
      availableDisciplines(WEEK.map((it: Record<string, any>) => it?.planned_workout ?? it) as never),
      sameDay,
      posture as never,
    );
    assertEquals(topCard.map((o) => o.to), expected as unknown as string[], `${label}: top card`);
    assertEquals(drawer.map((o) => o.to), expected as unknown as string[], `${label}: drawer`);
    assertEquals(fullScreen.map((o) => o.to), expected as unknown as string[], `${label}: full screen`);
  }
});

Deno.test('⛔ a DEVELOP discipline is offered nothing, on every surface', () => {
  /**
   * The rule that decides the answer for a given session (D-403 / the swap lib): you may swap what
   * is HELD, never what is being TRAINED. So the correct answer is a property of the athlete's
   * `per_discipline_posture`, not of which screen they happen to be looking at — and a surface that
   * shows the control while another hides it is always the bug, whichever way round it is.
   */
  const develop = { run: 'develop', bike: 'maintain' };
  const week = availableDisciplines(WEEK as never);
  assertEquals(getDisciplineSwaps(RUN as never, week, [], develop as never), []);
  // ...while the RIDE in the same plan is held, so it still swaps.
  const ride = WEEK[1].planned_workout;
  assertEquals(
    getDisciplineSwaps(ride as never, week, [], develop as never).map((o) => o.to),
    ['run'],
  );
});
