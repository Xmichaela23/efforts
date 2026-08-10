/**
 * ANCHORS ARE HELD WHERE THE ATHLETE PINS THEM — the property, pinned.
 *
 * ⛔ THIS FILE EXISTS BECAUSE THE PROPERTY WAS TRUE BY CONVENTION AND UNTESTED. `week-solver` treats
 * anchors as hard (§2.3, *"Scored, never corrected"*) and every reader of that code agreed — but
 * nothing failed if a future change started moving them, and the composer was in fact DROPPING one
 * of two colliding anchors before the solver ever saw it (fixed 2026-08-09, see `strength-primary-plan`).
 *
 * The contract, in three parts:
 *   1. A pinned anchor lands on its day, always. Lifts move; anchors do not.
 *
 * ⛔ AND THE STRONGEST FORM OF (1) IS STRUCTURAL, WHICH THE FIRST DRAFT OF THIS FILE MISSED. It
 * asserted `week.anchors[i].day === pinned` — and `week` HAS NO `anchors` KEY. The solver returns
 * `{ flexible, lifts, activeDays, restDays }`: anchors go in and never come back out, so there is no
 * channel through which one could be relocated. The property is guaranteed by the shape of the
 * contract, not by a scoring term behaving. What IS assertable — and is what these tests do — is
 * that every anchor day is accounted for in `activeDays`, and that the lifts respect it.
 *   2. Two anchors on one day REFUSE, with a typed code and both anchors named. Never a silent pick.
 *   3. A refusal is a real answer — it carries what the athlete can do about it.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { solve } from '../../_shared/week-solver.ts';

const LIFTS = [
  { name: 'Back Squat', isLower: true }, { name: 'Deadlift', isLower: true },
  { name: 'Bench Press', isLower: false }, { name: 'Overhead Press', isLower: false },
] as never;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

Deno.test('an anchor lands on the day it was pinned to — every legal combination', () => {
  // ⛔ EXHAUSTIVE, NOT SAMPLED. The failure this guards against is a scoring term deciding it can buy
  // a better week by nudging an anchor, and that would show up on SOME day combination, not all of
  // them. A spot check would pass while the property was broken.
  let solved = 0;
  for (const lr of DAYS) for (const ld of DAYS) for (const hd of DAYS) {
    if (new Set([lr, ld, hd]).size < 3) continue;
    const anchors = [
      { day: lr, kind: 'long_run', label: 'your long run' },
      { day: ld, kind: 'long_ride', label: 'your long ride' },
      { day: hd, kind: 'quality_run', label: 'your hard run' },
    ];
    const r = solve({ anchors: anchors as never, lifts: LIFTS });
    if (r.status === 'unsolvable') continue;
    solved++;
    for (const a of anchors) {
      // The anchor day is ACTIVE — the solver planned a week that includes it rather than one that
      // quietly assumes the athlete skips it.
      assertEquals(r.week.activeDays.includes(a.day), true,
        `${a.label} on ${a.day} is not an active day (${lr}/${ld}/${hd})`);
      // ⛔ AND IT IS NEVER A REST DAY. A week that "rests" on the day the athlete does their long run
      // is the same defect as moving the anchor, one field over.
      assertEquals(r.week.restDays.includes(a.day), false,
        `${a.label} on ${a.day} was scheduled as a rest day (${lr}/${ld}/${hd})`);
    }
  }
  // ⚠️ A GUARD ON THE GUARD. If a future change made everything unsolvable this test would pass
  // vacuously, having asserted nothing at all.
  assertEquals(solved > 100, true, `only ${solved} weeks solved — the sweep is not exercising anything`);
});

Deno.test('two anchors on one day REFUSE — typed, both named, never silently resolved', () => {
  const r = solve({
    anchors: [
      { day: 'sunday', kind: 'long_run', label: 'your long run' },
      { day: 'sunday', kind: 'quality_run', label: 'your hard run' },
    ] as never,
    lifts: LIFTS,
  });
  assertEquals(r.status, 'unsolvable', 'the solver picked a winner between two fixed anchors');
  if (r.status !== 'unsolvable') return;
  assertEquals(r.code, 'SOLVER_GRIDLOCK_ANCHOR_COLLISION');
  // ⛔ BOTH ANCHORS NAMED. "Your week does not fit" is not an answer the athlete can act on; the
  // whole value of a typed refusal is that it says WHICH two things collided.
  const labels = (r.bindingAnchors ?? []).map((a: { label: string }) => a.label).sort();
  assertEquals(labels, ['your hard run', 'your long run']);
  // ⚠️ AND IT HANDS BACK OPTIONS, NOT A VERDICT. Both are the athlete's own picks, so the engine
  // states the conflict and stops — it does not choose for them.
  assertEquals((r.options ?? []).length >= 2, true, 'a refusal must say what can be done about it');
});

Deno.test('a same-day pair the MATRIX permits is not refused', () => {
  // ⛔ THE OTHER HALF OF THE COMPOSER'S OLD DEDUPE, AND THE HALF NOBODY WOULD HAVE MISSED. The guard
  // that dropped colliding pins dropped LEGAL pairs too — `SAME_DAY_COMPATIBLE` permits some anchors
  // to share a day, and the athlete simply lost the second session. This pins that the law, not a
  // blanket rule, decides.
  const r = solve({
    anchors: [
      // ⚠️ `quality_run + easy_swim`, NOT a long day. Checked against the matrix rather than assumed:
      // NEITHER long_run NOR long_ride shares a day with anything at all — the nine legal same-day
      // pairs are all easy/quality combinations. The first draft of this test used
      // `long_ride + easy_swim` and failed, correctly.
      { day: 'saturday', kind: 'quality_run', label: 'your hard run' },
      { day: 'saturday', kind: 'easy_swim', label: 'your swim' },
    ] as never,
    lifts: LIFTS,
  });
  if (r.status === 'unsolvable') {
    assertEquals(r.code !== 'SOLVER_GRIDLOCK_ANCHOR_COLLISION', true,
      'a matrix-legal same-day pair was refused as a collision');
    return;
  }
  assertEquals(r.week.activeDays.includes('saturday'), true, 'the shared day was not planned at all');
});

Deno.test('lifts move around anchors — the bar fills the gaps, the pins do not shift', () => {
  // The contract stated positively: same anchors, different lift counts, anchors identical.
  const anchors = [
    { day: 'sunday', kind: 'long_run', label: 'your long run' },
    { day: 'thursday', kind: 'quality_run', label: 'your hard run' },
  ] as never;
  const four = solve({ anchors, lifts: LIFTS });
  const two = solve({
    anchors,
    lifts: [{ name: 'Back Squat', isLower: true }, { name: 'Bench Press', isLower: false }] as never,
  });
  for (const [n, r] of [['4 lifts', four], ['2 lifts', two]] as const) {
    assertEquals(r.status === 'unsolvable', false, n);
    if (r.status === 'unsolvable') continue;
    // Both anchor days stay active and unrested however many lifts are asked for — the bar fills the
    // gaps around them rather than the anchors yielding to make room.
    for (const d of ['sunday', 'thursday']) {
      assertEquals(r.week.activeDays.includes(d), true, `${n}: ${d} lost`);
      assertEquals(r.week.restDays.includes(d), false, `${n}: ${d} became a rest day`);
    }
    // ⛔ AND NO HEAVY LEG DAY LANDS ON THE LONG RUN. That is the clearance the anchors exist to buy.
    assertEquals(r.week.lifts.some((l: { isLower: boolean; day: string }) => l.isLower && l.day === 'sunday'),
      false, `${n}: heavy legs on the long-run day`);
  }
});
