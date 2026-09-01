// ============================================================================
// THE PROTOCOL — the book's own rules, asserted against every built week, each one citing its page.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/protocol.test.ts
//
// ⛔⛔ WHY THE PAGE IS IN EVERY TEST NAME. Michael, 2026-09-01: *"it's never my decision, it's the
// book's protocol."* He is right, and the distinction is load-bearing for a repo read by sessions
// that were not here: **a rule labelled as somebody's decision can be argued with. A rule labelled
// `p218` cannot.** Anything below that is OURS says so in as many words, and says why.
//
// ⛔ AND IT EXISTS BECAUSE A WRITTEN RULE IS NOT AN ENFORCED ONE. p142's core-placement rule was
// implemented, explained in a paragraph, and asserted by nothing — 2541 tests passed while the row
// sat in the wrong place, and the athlete found it on his phone. Every rule in this file is one that
// used to live only in a comment.
//
// ⚠️ WHAT IS NOT YET PINNED, so the gaps are visible rather than forgotten:
//   · p140 rule 2a "skill work first" — the frame prints SKILL last on its leg day, so asserting it
//     here would contradict the page the frame is transcribed from. It needs a ruling, not a test.
//   · p148's 10%-per-week change rule and p146's five buckets — endurance, a different subsystem.
//   · p89's plyometric progression ladder — recorded in the source as NOT IMPLEMENTED.
//   · p78's rest periods.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, type StrengthExercise } from './compose.ts';
import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
import { prescribe } from '../strength-grid/index.ts';
import { WORKING_MAX_FRACTION, PRETEST_WARMUP_FRACTION, PRETEST_STEPS } from './working-number.ts';

const KITS: Record<string, string[]> = {
  'commercial gym': ['Commercial gym'],
  'home gym': ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Pull-up bar', 'Resistance bands', 'Ab wheel', 'Incline bench'],
  'barbell only': ['Barbell + plates', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'],
};

const tested = (lift: string, oneRm: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * WORKING_MAX_FRACTION,
  measured: { weight: Math.round(oneRm * 0.85), reps: 5 }, cite: 'protocol fixture',
});

const weekOf = (frame: FrameId, column: ColumnKind, equipment: string[], week = 2) =>
  composeWeek({
    frame, column, week, roundTo: 5, equipment,
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    seed1RMs: { bench: 155, squat: 190, deadlift: 230, overheadPress: 105 },
    workingNumbers: week === 1 ? undefined : {
      bench: tested('bench', 155), squat: tested('squat', 190),
      deadlift: tested('deadlift', 230), overheadPress: tested('overheadPress', 105),
    },
  } as never);

const slotRows = (frame: FrameId, column: ColumnKind, kit: string[]): StrengthExercise[] =>
  weekOf(frame, column, kit).sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => s.strength_exercises ?? [])
    // ⚠️ SLOT ROWS ONLY. Floor, dial and core rows are dosed off p86, not off p218's intent table,
    // and holding them to a band the page never gave them would fail for the wrong reason.
    .filter((e) => e.slot_intent != null);

const FRAME_IDS = Object.keys(FRAMES) as FrameId[];
const COLUMNS: ColumnKind[] = ['standard', 'taper'];
const each = (fn: (frame: FrameId, column: ColumnKind, kitName: string, kit: string[]) => void) => {
  for (const frame of FRAME_IDS) {
    for (const column of COLUMNS) {
      for (const [kitName, kit] of Object.entries(KITS)) fn(frame, column, kitName, kit);
    }
  }
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// p218 — THE REPETITION/SET GUIDELINES. The table every prescribed row answers to.
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('p218 — every row\'s REPS sit inside its intent\'s band', () => {
  each((frame, column, kitName, kit) => {
    for (const e of slotRows(frame, column, kit)) {
      const p = prescribe(e.slot_intent!, 'barbell');
      if (p.kind !== 'barbell') continue;
      const m = String(e.reps).match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) continue; // a test row prescribes "6, 5, max" — p215's protocol, asserted separately
      const [lo, hi] = [Number(m[1]), Number(m[2])];
      assert(lo >= p.reps.lo && hi <= p.reps.hi,
        `${frame} ${column} @ ${kitName}: "${e.name}" (${e.slot_intent}) prescribes ${lo}-${hi}, `
        + `outside p218's ${p.reps.lo}-${p.reps.hi}`);
    }
  });
});

Deno.test('p218 — every row\'s SET COUNT sits inside its intent\'s band', () => {
  each((frame, column, kitName, kit) => {
    for (const e of slotRows(frame, column, kit)) {
      const p = prescribe(e.slot_intent!, 'barbell');
      if (p.kind !== 'barbell' || typeof e.sets !== 'number') continue;
      assert(e.sets >= p.setsBand.lo && e.sets <= p.setsBand.hi,
        `${frame} ${column} @ ${kitName}: "${e.name}" (${e.slot_intent}) prescribes ${e.sets} sets, `
        + `outside p218's ${p.setsBand.lo}-${p.setsBand.hi}`);
    }
  });
});

Deno.test('p218 — ME carries NO reps-in-reserve, and the others carry his', () => {
  /**
   * ⛔ HIS ABSENCE IS A PRESCRIPTION. p218 gives ME no RIR target in as many words, and a surface
   * that invents one contradicts the page — which happened, visibly: an ME pull-up card read
   * *"1-5 reps, stopped short of failure"* above a row saying *"2 in reserve"*.
   */
  each((frame, column, kitName, kit) => {
    for (const e of slotRows(frame, column, kit)) {
      const p = prescribe(e.slot_intent!, 'barbell');
      if (p.kind !== 'barbell') continue;
      if (e.slot_intent === 'ME') {
        assertEquals(e.target_rir, undefined,
          `${frame} ${column} @ ${kitName}: "${e.name}" is ME and carries a reserve target`);
        continue;
      }
      if (!p.rir || e.target_rir == null) continue;
      assert(e.target_rir >= p.rir.lo && e.target_rir <= p.rir.hi,
        `${frame} ${column} @ ${kitName}: "${e.name}" (${e.slot_intent}) targets ${e.target_rir} in `
        + `reserve, outside p218's ${p.rir.lo}-${p.rir.hi}`);
    }
  });
});

Deno.test('p218 — a HYP row prescribes NO load, because the page gives it none', () => {
  /**
   * ⛔ p218 gives hypertrophy reps, a tempo and a reserve, and no percentage. The weight is an
   * OUTPUT of the reserve rule — the athlete picks what leaves them one or two — so a computed
   * number there is false precision on work where their judgement is the better input.
   */
  each((frame, column, kitName, kit) => {
    for (const e of slotRows(frame, column, kit)) {
      if (e.slot_intent !== 'HYP') continue;
      assertEquals(typeof e.weight === 'number', false,
        `${frame} ${column} @ ${kitName}: "${e.name}" is a HYP row carrying a weight`);
      assertEquals(e.percent_1rm, undefined,
        `${frame} ${column} @ ${kitName}: "${e.name}" is a HYP row carrying a percentage`);
    }
  });
});

Deno.test('p218 — a priced row opens at the BOTTOM of its percentage band', () => {
  /**
   * ⛔ *"Sets should always remain on the lower end when starting a program, increasing only if the
   * athlete is progressing well and seems to have recovery to spare."* He writes it about sets;
   * reading it across to intensity is OURS and is labelled at the site (`INTENSITY_STARTS_LOW_IS_OURS`).
   * ⛔ WHAT IT PREVENTS, and it shipped once: taking the top of BOTH bands prescribed five reps at
   * 100% of a working number that is itself 96% of a predicted max — five reps at ninety-six per
   * cent of a one-rep max, on every heavy slot, for twelve weeks.
   */
  each((frame, column, kitName, kit) => {
    for (const e of slotRows(frame, column, kit)) {
      if (e.percent_1rm == null) continue;
      const p = prescribe(e.slot_intent!, 'barbell');
      if (p.kind !== 'barbell' || !p.pctOf1RM) continue;
      assertEquals(e.percent_1rm, p.pctOf1RM.lo,
        `${frame} ${column} @ ${kitName}: "${e.name}" (${e.slot_intent}) is at `
        + `${e.percent_1rm} of the working number, not p218's band floor ${p.pctOf1RM.lo}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// p215 — THE PRETEST, AND THE NUMBER THE BLOCK PRESCRIBES FROM
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('p215 — week one is the test, and its ramp is his three steps', () => {
  /**
   * ⛔ *"Work up to roughly 75% of the predicted max"*, then his multiples, and the last step is
   * taken for max clean reps. ⚠️ A rung that ROUNDS onto the measured step is dropped rather than
   * nudged — ours, labelled in `working-number.ts`, because prescribing five reps at the test weight
   * immediately before the test would under-read the max every block.
   */
  assertEquals(PRETEST_WARMUP_FRACTION, 0.75, 'the pretest no longer opens at p215\'s 75%');
  assertEquals(PRETEST_STEPS.map((s) => s.multipleOfWarmup), [1, 1.1, 1.15],
    'the pretest ramp is no longer p215\'s 1.00A / 1.10A / 1.15A');
  assertEquals(PRETEST_STEPS[PRETEST_STEPS.length - 1].reps, 'max',
    'the last pretest step is no longer taken for max reps');

  for (const frame of FRAME_IDS) {
    const wk = weekOf(frame, 'standard', KITS['home gym'], 1);
    const tests = wk.sessions.filter((s) => s.type === 'strength' && (s.tags ?? []).includes('1rm_test'));
    assert(tests.length === 2, `${frame}: week one does not hold two test sessions`);
    for (const s of tests) {
      for (const e of s.strength_exercises ?? []) {
        const plan = e.set_plan ?? [];
        assert(plan.some((st) => st.amrap === true),
          `${frame}: "${e.name}" is a test row with no set taken for max reps`);
      }
    }
  }
});

Deno.test('p215 — the working number is 96% of the predicted max, and a stored max is only a SEED', () => {
  /**
   * ⛔ NOT 85%, not a training max, and not the previous programme's number. ⚠️ And the seed never
   * becomes the working number: a stale stored max is exactly what the test exists to correct.
   */
  assertEquals(WORKING_MAX_FRACTION, 0.96);
  for (const frame of FRAME_IDS) {
    const wk = composeWeek({
      frame, column: 'standard', week: 2, roundTo: 5, equipment: KITS['home gym'],
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      seed1RMs: { bench: 155, squat: 190, deadlift: 230, overheadPress: 105 },
    } as never);
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      for (const e of s.strength_exercises ?? []) {
        assertEquals(typeof e.weight === 'number', false,
          `${frame}: "${e.name}" was priced from a stored max with no test logged`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// p227 — PLYOMETRICS
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('p227 — the drills are separate rows, and the frame owns the day', () => {
  /**
   * ⛔ His first instruction is that all drills are performed SEPARATELY, which one row reading
   * *"Plyometric drills 3×4"* cannot express and an athlete cannot follow. ⚠️ One to three skills is
   * his own range (p275); the day is the frame's.
   */
  each((frame, column, kitName, kit) => {
    const plyo = weekOf(frame, column, kit).sessions
      .filter((s) => s.type === 'strength' && (s.tags ?? []).includes('plyo'));
    for (const s of plyo) {
      const rows = s.strength_exercises ?? [];
      assert(rows.length >= 1 && rows.length <= 4,
        `${frame} ${column} @ ${kitName}: the plyo day holds ${rows.length} rows, outside his 1-3 (+1)`);
      for (const e of rows) {
        assert(!/drills?$/i.test(String(e.name)) || rows.length > 1,
          `${frame} ${column} @ ${kitName}: "${e.name}" reads as a category, not a named drill`);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// p274 / p275 — THE PROGRAMME AS WRITTEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('p274 — the frame\'s printed rows are the week; nothing adds or reorders a slot', () => {
  /**
   * ⛔ THE PAGE OWNS THE SLOTS. Every row carrying a `slot_intent` came from a printed cell, in the
   * page's order. Floor, dial and core rows are the only additions and they are marked by carrying
   * no `slot_intent` at all — which is what makes this checkable.
   */
  each((frame, column, kitName, kit) => {
    const days = FRAMES[frame].columns[column];
    const sessions = weekOf(frame, column, kit).sessions.filter((s) => s.type === 'strength');
    const printed = days.filter((d) => d.strength.length > 0).length;
    const built = sessions.filter((s) => !(s.tags ?? []).includes('plyo')).length;
    assertEquals(built, printed,
      `${frame} ${column} @ ${kitName}: the page prints ${printed} lifting days and the week built ${built}`);
    for (const s of sessions) {
      if ((s.tags ?? []).includes('plyo') || (s.tags ?? []).includes('1rm_test')) continue;
      const day = days.find((d) => d.label === s.name);
      if (!day) continue;
      const slotted = (s.strength_exercises ?? []).filter((e) => e.slot_intent != null);
      assertEquals(slotted.length, day.strength.length,
        `${frame} ${column} @ ${kitName}: "${s.name}" built ${slotted.length} slot rows for `
        + `${day.strength.length} printed cells`);
      assertEquals(slotted.map((e) => e.slot_intent), day.strength.map((sl) => sl.intent),
        `${frame} ${column} @ ${kitName}: "${s.name}" reordered the page's own rows`);
    }
  });
});

Deno.test('p275 — every day opens on a competition lift, and primaries may be substituted in', () => {
  /**
   * ⛔ *"The emphasis on secondary lifts over primary lifts is deliberate… primary lifts CAN be
   * substituted in, you're encouraged to keep your options open."* Both halves are his. The day
   * OPENING on the athlete's competition lift is ours and is why: `exerciseForSlot` prices a row
   * only where the movement is the lift that was tested, so a day with no tested lift prescribes no
   * weight at all.
   */
  each((frame, column, kitName, kit) => {
    for (const s of weekOf(frame, column, kit).sessions) {
      if (s.type !== 'strength') continue;
      if ((s.tags ?? []).includes('plyo') || (s.tags ?? []).includes('1rm_test')) continue;
      const rows = (s.strength_exercises ?? []).filter((e) => e.slot_intent != null);
      if (rows.length === 0) continue;
      assert(['ME', 'DE', 'SKILL'].includes(String(rows[0].slot_intent)),
        `${frame} ${column} @ ${kitName}: "${s.name}" opens on a ${rows[0].slot_intent} row`);
    }
  });
});
