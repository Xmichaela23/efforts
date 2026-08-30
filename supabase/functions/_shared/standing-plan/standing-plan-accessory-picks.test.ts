// ============================================================================
// THE GATE — the Viada-native accessory screen (Michael, 2026-08-24).
//
// ⚠️ EVERY ASSERTION HERE EXISTS BECAUSE SOMETHING WAS WRONG, and the two marked REGRESSION were
// found by running a live compose during the build rather than by reading the code:
//
//   · the engine's own choice took a movement the athlete had picked for a LATER day, so one lift
//     appeared twice in a week — once as the app's pick, once as the athlete's;
//   · the Dial pull-back for an advanced runner held added rows to the source's six-to-eight
//     "recovers" line, and this frame's lifting days already sit above it — so the chip silently
//     bought ZERO sets for exactly the athlete it was meant to protect.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { athleteEquipmentToKeys } from '../../../../src/lib/strength-gear.ts';
import {
  DIAL_CAP,
  DIAL_CHIPS,
  dialDose,
  dialRowOptions,
  chipHasFrameSlot,
  dayLabelForPick,
  daysForPick,
  frameDaysForPick,
  pickKeysInDayOrder,
  defaultViadaPicks,
  flattenViadaPicks,
  normalizeViadaPrefs,
  pickKeyForSlot,
  pickOptions,
  VIADA_PICK_KEYS,
  VIADA_PICKS,
  type DialChip,
  type ViadaPickKey,
} from './accessory-picks.ts';
import { composeBlock, composeWeek, type ComposeArgs } from './compose.ts';
import { buildStandingPlanRow } from './plan-row.ts';
import { FRAMES } from './frames.ts';
import { canonicalize } from '../canonicalize.ts';
import { WEEKLY_SETS_SOLID, isRepPrescribable, musclesWorkedBy } from '../accessory-dosing/index.ts';
import { allGridMovements } from '../strength-grid/index.ts';

/** A commercial-gym athlete. ⚠️ Declared equipment is the case the grid gates on. */
const EQUIPMENT = ['barbell', 'rack', 'bench', 'dumbbells', 'pullup_bar'];

const BASE: Omit<ComposeArgs, 'week' | 'column'> = {
  frame: 'strength_5k',
  competitionLifts: { push_upper: 'bench press', press_lower: 'back squat', hinge_lower: 'deadlift' },
  equipment: EQUIPMENT,
};

function week(extra: Partial<ComposeArgs> = {}) {
  return composeWeek({ ...BASE, week: 3, column: 'standard', ...extra } as ComposeArgs);
}

function rowsOf(w: ReturnType<typeof composeWeek>) {
  return w.sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => ({ day: s.day, ...e })));
}

function setsForMuscle(w: ReturnType<typeof composeWeek>, muscle: string): number {
  return w.ledger.perMuscle.find((l) => l.muscle === muscle)?.sets ?? 0;
}

// ── the table is the frame's, not a copy of it ───────────────────────────────────────────────────

Deno.test('every pick names a cell the frame actually carries', () => {
  const cells = new Set(
    FRAMES.strength_5k.columns.standard
      .flatMap((d) => d.strength)
      .filter((s) => s.intent === 'HYP' && s.role === 'accessory')
      .map((s) => `${s.category}/${s.pattern}`),
  );
  for (const key of VIADA_PICK_KEYS) {
    const slot = VIADA_PICKS[key].slot;
    if (!slot) continue;
    // ⛔ A pick pointing at a cell the frame does not hold is a control that silently does nothing,
    // which is the entire defect this screen replaces.
    assert(cells.has(`${slot.category}/${slot.pattern}`), `${key} names a cell the frame has not: ${slot.category}/${slot.pattern}`);
    // ⛔ AND A DAY-SCOPED PICK MUST NAME A DAY THE CELL IS ACTUALLY ON. `frameDay: 3` on a pull cell
    // is a control the composer would never consult — silent, and invisible without this line.
    if (slot.frameDay != null) {
      const day = FRAMES.strength_5k.columns.standard.find((d) => d.day === slot.frameDay);
      assert(
        (day?.strength ?? []).some((x) => x.intent === 'HYP' && x.role === 'accessory'
          && x.category === slot.category && x.pattern === slot.pattern),
        `${key} is scoped to frame day ${slot.frameDay}, which carries no ${slot.category}/${slot.pattern}`,
      );
    }
  }
  // ⛔ AND EVERY HYP ACCESSORY CELL IS CLAIMED — ON EVERY DAY IT OCCURS, which is stronger than the
  // per-cell version this replaced. A cell that occurs twice can be owned by one day-agnostic pick or
  // by one day-scoped pick per day; what it may NOT be is owned on Monday and orphaned on Thursday.
  // ⚠️ That is exactly what a half-done split would look like, and the per-cell check could not see it.
  for (const day of FRAMES.strength_5k.columns.standard) {
    for (const slot of day.strength ?? []) {
      if (slot.intent !== 'HYP' || slot.role !== 'accessory') continue;
      assert(
        pickKeyForSlot(slot.category as never, slot.pattern as never, day.day) != null,
        `no pick owns ${slot.category}/${slot.pattern} on frame day ${day.day}`,
      );
    }
  }
});

Deno.test('the day tags are the real days of p246, read off the frame', () => {
  assertEquals(daysForPick('db_press'), ['Thursday']);
  assertEquals(daysForPick('iso_push'), ['Monday']);
  // ⛔ TWO PICKS, ONE DAY EACH — not one pick tagged with both. `focused pull_upper` falls on days
  // 1 and 4 and each carries its own control.
  assertEquals(daysForPick('iso_pull_a'), ['Monday']);
  assertEquals(daysForPick('iso_pull_b'), ['Thursday']);
  // ⛔ AND THE SAME SPLIT ON THE LOWER DAYS (Michael, 2026-08-25). `secondary press_lower` falls on
  // days 2 and 5 and each now carries its own control, so neither row may claim both days.
  assertEquals(daysForPick('single_leg_a'), ['Tuesday']);
  assertEquals(daysForPick('single_leg_b'), ['Friday']);
  assertEquals(daysForPick('quad_iso'), ['Friday']);
  // ⛔ THE CORE PICK HAS NO DAY BECAUSE IT HAS NO SLOT. p246 carries none.
  assertEquals(daysForPick('core'), []);
});

Deno.test('every pick offers something, at every equipment subset', () => {
  for (const equipment of [null, [], EQUIPMENT, ['bodyweight'], ['barbell']]) {
    for (const key of VIADA_PICK_KEYS) {
      const opts = pickOptions(key, equipment);
      assert(opts.length > 0, `${key} offers nothing for ${JSON.stringify(equipment)}`);
      // ⚠️ AND NO TWO OPTIONS ARE THE SAME MOVEMENT UNDER TWO SPELLINGS — the picker asking an
      // athlete to choose between `Chest Fly` and `Chest Flyes` reads as a broken list.
      const canon = opts.map((o) => canonicalize(o.name));
      assertEquals(new Set(canon).size, canon.length, `${key} offers a duplicate`);
    }
  }
});

// ── the picks reach the slots ────────────────────────────────────────────────────────────────────

Deno.test('a day-scoped lower pick fills its OWN day and leaves the other alone', () => {
  // ⛔ WAS "fills its cell on EVERY day the frame carries it" — the day-agnostic case, which no row
  // uses any more since the 2026-08-25 split. `secondary press_lower` sits on days 2 and 5 and each
  // has its own control, so a movement named for Friday must not appear on Tuesday.
  const picks: Partial<Record<ViadaPickKey, string>> = {
    ...defaultViadaPicks(EQUIPMENT, []),
    single_leg_a: 'step up',
    single_leg_b: 'walking lunge',
  };
  const rows = rowsOf(week({ slotPicks: picks }));
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize('step up')).map((r) => r.day),
    ['Tuesday'], 'the day-2 single-leg pick left its day');
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize('walking lunge')).map((r) => r.day),
    ['Friday'], 'the day-5 single-leg pick left its day');
});

Deno.test('⛔ THE PIN: both single-leg rows hold DIFFERENT movements, and the mix is unchanged', () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-25 — the pin he asked for, in two halves.
   *
   * ⛔ HALF ONE: the zero-touch week opens on two different single-leg movements. This is the same
   * assertion `iso_pull_a` / `iso_pull_b` carry, for the same reason — the athlete who taps nothing
   * gets the balanced week, and the Dial never has to create the balance
   * (`LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`). ⚠️ Neither of these picks serves a chip, so unlike the
   * pull pair there is no dial half to keep in step.
   *
   * ⛔ HALF TWO: SAME MIX. The split must not change WHAT the week is made of — same number of
   * strength rows, same per-muscle set ledger, same patterns on the same days. Only the two names
   * differ. A split that quietly added a row or moved a set would be a different week wearing this
   * ruling's name.
   */
  const picks = defaultViadaPicks(EQUIPMENT, []);
  assert(canonicalize(picks.single_leg_a) !== canonicalize(picks.single_leg_b),
    `both lower days default to "${picks.single_leg_a}" — the default week is not balanced on its own`);

  const w = week({ slotPicks: picks });
  const rows = rowsOf(w);

  // Each lands on its own day, once.
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize(picks.single_leg_a)).map((r) => r.day),
    ['Tuesday']);
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize(picks.single_leg_b)).map((r) => r.day),
    ['Friday']);

  // ⛔ SAME MIX — measured against the week the OLD single pick produced, which is what one movement
  // on both lower days looks like. Row count, per-muscle sets and the pattern-per-day shape all hold;
  // the only difference is the Friday movement's name.
  const before = rowsOf(week({
    slotPicks: { ...picks, single_leg_a: picks.single_leg_a, single_leg_b: picks.single_leg_a },
  }));
  assertEquals(rows.length, before.length, 'the split changed the number of strength rows');
  assertEquals(
    rows.map((r) => `${r.day}/${r.pattern ?? ''}`).sort(),
    before.map((r) => `${r.day}/${r.pattern ?? ''}`).sort(),
    'the split moved a pattern off its day',
  );
  const ledgerOf = (x: ReturnType<typeof composeWeek>) =>
    x.ledger.perMuscle.map((l) => `${l.muscle}:${l.sets}`).sort().join(',');
  assertEquals(
    ledgerOf(w),
    ledgerOf(week({ slotPicks: { ...picks, single_leg_b: picks.single_leg_a } })),
    'the split changed the per-muscle set ledger',
  );
});

Deno.test('the two isolation-pull picks land on their own days, and open on DIFFERENT movements', () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-24: `focused pull_upper` is TWO picks, one per day, not one asked
   * twice. The first build had a single pick, and its answer went on both day 1 and day 4 — a week
   * that trained rear delts twice and biceps not at all, or the reverse, off one dropdown.
   *
   * ⛔ THE ZERO-TOUCH DEFAULT IS WHAT THIS ASSERTS, and that is the point: the athlete who taps
   * nothing must still get a balanced week. See `LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`.
   */
  const picks = defaultViadaPicks(EQUIPMENT, []);
  assert(canonicalize(picks.iso_pull_a) !== canonicalize(picks.iso_pull_b),
    `both pull picks default to "${picks.iso_pull_a}" — the default week is not balanced on its own`);

  const rows = rowsOf(week({ slotPicks: picks }));
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize(picks.iso_pull_a)).map((r) => r.day),
    ['Monday'], 'the day-1 pull pick left its day');
  assertEquals(rows.filter((r) => canonicalize(r.name) === canonicalize(picks.iso_pull_b)).map((r) => r.day),
    ['Thursday'], 'the day-4 pull pick left its day');
});

Deno.test('a chip re-points ONE of the two pull picks, never both', () => {
  // ⛔ THE DIAL IS FINE-TUNING ON TOP OF A BALANCED WEEK, NEVER THE SOURCE OF BALANCE. If both picks
  // served both chips, tapping Arms would open curls on Monday AND Thursday and hand the balance
  // problem straight back through the dial.
  for (const [chip, moved, held] of [
    ['arms', 'iso_pull_b', 'iso_pull_a'],
    ['shoulders', 'iso_pull_a', 'iso_pull_b'],
  ] as const) {
    const plain = defaultViadaPicks(EQUIPMENT, []);
    const dialled = defaultViadaPicks(EQUIPMENT, [chip]);
    assertEquals(canonicalize(dialled[held]), canonicalize(plain[held]),
      `${chip} moved ${held}, which it does not serve`);
    assert(canonicalize(dialled[moved]) !== canonicalize(dialled[held]),
      `${chip} collapsed both pull days onto one movement`);
  }
});

Deno.test('REGRESSION: the engine never spends a movement the athlete picked for another day', () => {
  /**
   * ⛔ THE BUG: `PickPool.placed` could only hold picks placed EARLIER in the week, so day 1's DE
   * secondary-push slot took `dumbbell bench press` off the grid and day 4's HYP secondary-push slot
   * then placed the athlete's identical pick. One movement, two days, one of them the engine's.
   */
  const picks = defaultViadaPicks(EQUIPMENT, []);
  const rows = rowsOf(week({ slotPicks: picks }));
  for (const name of Object.values(picks)) {
    const hits = rows.filter((r) => canonicalize(r.name) === canonicalize(name));
    const expected = Math.max(1, daysForPick(
      VIADA_PICK_KEYS.find((k) => picks[k] === name) as ViadaPickKey,
    ).length);
    assert(hits.length <= expected,
      `${name} appears ${hits.length} times, expected at most ${expected} (${hits.map((h) => h.day).join(', ')})`);
  }
});

Deno.test('the picks-are-placed-by-what-they-train apology goes quiet on the slot path', () => {
  const picks = defaultViadaPicks(EQUIPMENT, []);
  const w = week({ slotPicks: picks, accessoryPicks: flattenViadaPicks({ version: 1, picks, dial: [], dial_rows: {} }) });
  assert(!w.notes.some((n) => n.text.includes('placed by what they train')),
    'the week still explains an inference it no longer performs');
  // ⛔ AND NOTHING IS REPORTED UNPLACED. Every slot pick fits by construction.
  assert(!w.notes.some((n) => n.kind === 'warning' && n.text.startsWith('Not placed this week')),
    'a slot pick was reported unplaced');
});

Deno.test('the core pick reaches the week through the floor, and the row says whose it is', () => {
  const picks = { ...defaultViadaPicks(EQUIPMENT, []), core: 'v up' };
  const rows = rowsOf(week({
    slotPicks: picks,
    accessoryPicks: flattenViadaPicks({ version: 1, picks, dial: [], dial_rows: {} }),
  }));
  const hit = rows.find((r) => canonicalize(r.name) === canonicalize('v up'));
  assert(hit, 'the core pick never reached the week');
  assertEquals(hit?.notes, 'Your pick for core.');
});

// ── the Dial ──────────────────────────────────────────────────────────────────────────

Deno.test('a chip re-points the picks it can reach and leaves the rest alone', () => {
  const plain = defaultViadaPicks(EQUIPMENT, []);
  const shoulders = defaultViadaPicks(EQUIPMENT, ['shoulders']);
  assert(shoulders.db_press !== plain.db_press, 'the dumbbell press did not follow the shoulders chip');
  assert(shoulders.iso_push !== plain.iso_push, 'the isolation push did not follow the shoulders chip');
  // ⛔ AND A CHIP NEVER REACHES A PICK IT DOES NOT SERVE. Both single-leg rows and `quad_iso` serve
  // none — the lower split is a layout decision, so no chip may move either half of it.
  assertEquals(shoulders.single_leg_a, plain.single_leg_a);
  assertEquals(shoulders.single_leg_b, plain.single_leg_b);
  assertEquals(shoulders.quad_iso, plain.quad_iso);
});

Deno.test('a named muscle takes four sets on its own slots — the top of his 3-4 band', () => {
  const picks = defaultViadaPicks(EQUIPMENT, ['chest']);
  const rows = rowsOf(week({ slotPicks: picks, dial: ['chest'] }));
  const hyp = rows.filter((r) => String(r.reps) === '6-12'
    && canonicalize(r.name) === canonicalize(picks.iso_push));
  assert(hyp.length > 0, 'the chest slot was not built');
  for (const r of hyp) assertEquals(r.sets, 4, 'a named muscle stayed at the low end of the band');
  // ⛔ AND A MUSCLE NOBODY NAMED STAYS AT THREE. His own "start at the low end" instruction.
  const plainRows = rowsOf(week({ slotPicks: defaultViadaPicks(EQUIPMENT, []) }));
  const plainHyp = plainRows.filter((r) => String(r.reps) === '6-12');
  assert(plainHyp.every((r) => r.sets === 3), 'an unnamed slot moved off the low end');
});

Deno.test('Glutes and Core are real chips — they reach no cell, so they arrive as rows', () => {
  for (const chip of ['glutes', 'core'] as DialChip[]) {
    assertEquals(chipHasFrameSlot(chip), false, `${chip} unexpectedly has a frame slot`);
  }
  for (const chip of ['chest', 'shoulders', 'arms'] as DialChip[]) {
    assertEquals(chipHasFrameSlot(chip), true, `${chip} lost its frame slot`);
  }
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const before = setsForMuscle(week({ slotPicks: picks }), 'glutes');
  const after = week({ slotPicks: picks, dial: ['glutes'] });
  assert(setsForMuscle(after, 'glutes') > before, 'the glutes chip bought nothing');
  assert(setsForMuscle(after, 'glutes') >= WEEKLY_SETS_SOLID.lo,
    'the glutes chip did not reach the source\'s solid range');
  // ⛔ THE ROW SAYS WHOSE IT IS. "Floor: glutes had nothing else this week" under a movement the
  // athlete asked for by name is the A1 defect wearing a new face.
  const owned = rowsOf(after).filter((r) => r.notes === 'Your glute focus.');
  assert(owned.length > 0, 'no row claimed the glute focus');
});

Deno.test('REGRESSION: the advanced running tier pulls the dial back without switching it off', () => {
  /**
   * ⛔ THE BUG: the pull-back held added rows to p086's six-to-eight "recovers" line. This frame's
   * lifting days already carry eight to eleven counted sets, so no session could take a three-set
   * row and stay under it — and the chip did NOTHING for the one athlete it was written for.
   */
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const base = week({ slotPicks: picks, dial: ['glutes'] });
  const advanced = week({ slotPicks: picks, dial: ['glutes'], demonstratedWeeklyMiles: 60 });
  const plain = week({ slotPicks: picks });
  assert(setsForMuscle(advanced, 'glutes') > setsForMuscle(plain, 'glutes'),
    'the chip bought nothing at all for an advanced runner');
  assert(setsForMuscle(advanced, 'glutes') < setsForMuscle(base, 'glutes'),
    'the advanced tier bought exactly what the base tier did — the pull-back never fired');
  // ⛔ AND THE BLOCK SAYS SO. A thin week that never explains itself reads as broken.
  assert(advanced.notes.some((n) => n.text.includes('extra easy session')),
    'the pull-back was applied silently');
});

Deno.test('the taper column adds no rows, and says that too', () => {
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const taper = composeWeek({ ...BASE, week: 11, column: 'taper', slotPicks: picks, dial: ['glutes'] } as ComposeArgs);
  assertEquals(rowsOf(taper).filter((r) => r.notes === 'Your glute focus.').length, 0);
  assert(taper.notes.some((n) => n.text.includes('deload weeks the extra sets come out')));
  assertEquals(dialDose({ column: 'taper' }).targetSets, null);
});

Deno.test('no chip can push a muscle past his solid range, and no week takes more than two', () => {
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes', 'core']);
  const w = week({ slotPicks: picks, dial: ['glutes', 'core', 'arms', 'chest'] });
  for (const muscle of ['glutes', 'core']) {
    assert(setsForMuscle(w, muscle) <= WEEKLY_SETS_SOLID.hi,
      `${muscle} ran past the top of the solid range`);
  }
  // ⛔ THE CAP IS TWO. Four chips reaching the composer must not buy four muscles' worth of volume.
  assertEquals(DIAL_CAP, 2);
  const owners = new Set(rowsOf(w).filter((r) => r.notes?.endsWith(' focus.')).map((r) => r.notes));
  assert(owners.size <= DIAL_CAP, `${owners.size} muscles claimed rows past the cap`);
});

Deno.test('no session crosses the source\'s costly line, chips or not', () => {
  for (const chips of [[], ['glutes'], ['core'], ['glutes', 'core'], ['chest', 'arms']]) {
    const picks = defaultViadaPicks(EQUIPMENT, chips as DialChip[]);
    const w = week({ slotPicks: picks, dial: chips });
    for (const s of w.ledger.perSession) {
      assert(s.countedSets < 14,
        `${s.label} reached ${s.countedSets} work sets with chips ${JSON.stringify(chips)}`);
    }
  }
});

// ── the screen and the week agree ────────────────────────────────────────────────────────────────

Deno.test('a named Dial movement is the one the week uses', () => {
  /**
   * ⛔ THE SCREEN OFFERS ONE PICKER PER SLOTLESS CHIP AND THE ENGINE MUST HONOUR IT. There is no
   * day tag — see `DIAL_ROW_DAY_IS_THE_COMPOSERS` for why two projections of one were built
   * and both were wrong — so the ONE thing the athlete controls here is the movement.
   */
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const rows = rowsOf(week({
    slotPicks: picks,
    dial: ['glutes'],
    accessoryPicks: flattenViadaPicks({
      version: 1, picks, dial: ['glutes'], dial_rows: { 'glutes:0': 'barbell hip thrust' },
    }),
  }));
  const named = rows.find((r) => canonicalize(r.name) === canonicalize('barbell hip thrust'));
  assert(named, 'the named glute movement never reached the week');
  assert(named?.notes?.endsWith(' focus.') || named?.notes?.startsWith('Your pick for'),
    `the named movement's row claims the wrong owner: ${named?.notes}`);
});

Deno.test('the extra rows carry his accessory dose — 3 x 8-10, by feel', () => {
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const owned = rowsOf(week({ slotPicks: picks, dial: ['glutes'] }))
    .filter((r) => r.notes === 'Your glute focus.');
  assert(owned.length > 0);
  for (const r of owned) {
    assertEquals(r.sets, 3);
    assertEquals(r.reps, '8-10');
    assertEquals(r.load_prescribed, false, 'an extra row prescribed a weight it has no basis for');
    // ⛔ THE RESERVE COMES FROM THE SAME SENTENCE AS THE REPS (2026-08-27). p86 doses accessory work
    // at 3 x 8-10 at 1-2 RIR; the row carried the sets and the reps and NOT the reserve, so
    // `materialize-plan` fell through to the protocol's generic chart and Michael's screen showed
    // two accessories on one day disagreeing — "1 in reserve" on a slot row, "2 in reserve" on this
    // one. 1.5 is the midpoint of his band and renders as "1-2".
    assertEquals(r.target_rir, 1.5, 'a floor/dial row left its reserve to the generic default chart');
  }
});

Deno.test('⛔ NO ADDED ROW LETS THE GENERIC CHART ANSWER FOR IT, AND A HOLD CARRIES NO RESERVE', () => {
  // ⚠️ THE CLASS, NOT THE INSTANCE — every floor and Dial row in a real week, over the chips and
  // several equipment cases, because the screenshot caught one row and the defect is shared by all
  // of them.
  let checkedReps = 0;
  let checkedHolds = 0;
  for (const equipment of [EQ_LABELS, ['Bodyweight'], []] as string[][]) {
    for (const dial of [[], ['core'], ['glutes'], ['glutes', 'core']] as never[]) {
      const picks = defaultViadaPicks(equipment, dial);
      const added = rowsOf(week({ slotPicks: picks, dial, equipment }))
        .filter((r) => r.load_prescribed === false && typeof r.notes === 'string'
          && (r.notes.startsWith('Floor:') || r.notes.startsWith('Your ')));
      for (const r of added) {
        if (r.reps === '8-10') {
          checkedReps += 1;
          assertEquals(r.target_rir, 1.5, `${r.name}: a rep-dosed accessory lost its reserve`);
        } else {
          checkedHolds += 1;
          // A plank has no reps and therefore no reps in reserve. ⛔ Absent, never zero — 0 RIR is a
          // real and specific instruction (p219), not "we did not say".
          assertEquals(r.target_rir, undefined, `${r.name}: a hold was given a reps-in-reserve target`);
        }
      }
    }
  }
  // ⛔ NOT VACUOUS. If the floor stops adding rows this gate must fail loudly rather than pass by
  // iterating over nothing — the same way it would have passed before the fix.
  assert(checkedReps > 0, 'no rep-dosed accessory row was produced — this gate asserted nothing');
  // ⚠️ AND THE HOLD HALF IS CURRENTLY UNREACHED, DELIBERATELY SAID OUT LOUD RATHER THAN ASSERTED.
  // `checkedHolds` is 0 today because every Dial option is rep-prescribable by its own gate above
  // and the floor placed no hold in these cases. The branch stays as a guard for the day one
  // appears; it is not evidence of anything until it does.
  assertEquals(checkedHolds, 0,
    'a hold reached the floor — good, this branch is now live: delete this note and assert it instead');
});

/**
 * ⛔ THE CHIP SENTENCE MOVED TO THE CLIENT (2026-08-24, second copy round). `dialSentence` was cut to
 * one line per chip and now lives as `dialChipLine` in `src/lib/dial-copy.ts` — no edge function
 * ever read it. Its assertions moved with it, to `src/lib/dial-copy.test.ts`, which also runs the
 * whole screen through `voiceViolation`.
 *
 * ⚠️ WHAT STAYS ASSERTED HERE IS THE ENGINE'S HALF: `dialDose` still owns the target and the
 * indicative pull-back sentence the BUILT BLOCK prints, and it is covered by the pull-back
 * regressions above.
 */

// ── ⛔ NO ROW PRESCRIBES A DOSE ITS MOVEMENT CANNOT EXPRESS ─────────────────────────────────────

/**
 * ⛔ THE DEVICE DEFECT, AS A FIXTURE (Michael, 2026-08-24): the Core focus rows opened on **Plank**
 * and the plan printed **"3 x 8-10"** under it. A static hold has no reps — the row asked for
 * something the movement cannot express.
 *
 * ⚠️ THIS IS THE WHOLE CLASS, NOT THE ONE INSTANCE. Michael asked for every chip to be checked, so
 * these run over every chip, every default, and several equipment cases rather than pinning plank.
 */

const EQ_LABELS = ['Barbell', 'Dumbbells', 'Bench', 'Squat Rack', 'Cable Machine', 'Pull-up Bar'];
const EQ_CASES: Array<string[] | null> = [
  EQ_LABELS,
  ['Barbell', 'Dumbbells', 'Bench', 'Squat Rack', 'Cable Machine'], // no bar — no hanging work
  ['Bodyweight'],
  [],
  null,
];

Deno.test('⛔ EVERY focus-row default is rep-based and on the catalogue', () => {
  for (const equipment of EQ_CASES) {
    for (const chip of DIAL_CHIPS) {
      const opts = dialRowOptions(chip, equipment);
      /**
       * ⛔ ONE KNOWN EMPTY CELL, NAMED RATHER THAN WAIVED (2026-08-26). `arms` is empty for an
       * athlete whose declared kit maps to NO gear key at all, and the reason is the catalogue's:
       * every biceps and triceps prime-mover in it needs a barbell, dumbbells, a cable, bands, or
       * something to dip on. `movementsForMuscle('biceps', ['Pull-up bar'])` returns nothing.
       *
       * ⚠️ IT WAS INVISIBLE UNTIL THE CATALOGUE WAS TAGGED, and invisible in the worst way: the row
       * offered a BARBELL CURL to an athlete with no barbell, because an untagged movement passed
       * every gate. An empty row is the honest version of the same fact.
       *
       * ⛔ THE REAL-WORLD CASE IS `['Pull-up bar']`, NOT THIS SYNTHETIC LABEL. An athlete who ticks
       * nothing lands on `[]`, which is §0h — undeclared, ungated, everything offered. An athlete who
       * ticks only the pull-up bar hits this hole for real. Open with Michael, 2026-08-26: either the
       * catalogue gains a bodyweight arms movement (chin-ups and diamond push-ups reach those muscles
       * as SECONDARY engagement, which is not the same claim) or the chip is withheld from a kit that
       * cannot fill it. It is not fixable by loosening a gear tag.
       */
      const noLoadableKit = Array.isArray(equipment) && equipment.length > 0
        && athleteEquipmentToKeys(equipment).size === 0;
      if (chip === 'arms' && noLoadableKit) {
        assertEquals(opts.length, 0,
          'arms gained an option for a kit with no gear keys — the catalogue gap closed, update this note');
        continue;
      }
      assert(opts.length > 0, `${chip} offers nothing for ${JSON.stringify(equipment)}`);
      const first = opts[0];
      // ⛔ REP-BASED. The row is dosed 3 x 8-10 by feel; a hold cannot carry that.
      assert(isRepPrescribable(first.name),
        `${chip} defaults to "${first.name}", which is measured in time, for ${JSON.stringify(equipment)}`);
      // ⛔ ON THE CATALOGUE. A name the grid does not hold is D-322's disease — it resolves to
      // nothing downstream and the control silently does nothing.
      assert(allGridMovements().some((m) => canonicalize(m.name) === canonicalize(first.name)),
        `${chip} defaults to "${first.name}", which is not in the grid catalogue`);
    }
  }
});

Deno.test('⛔ NO OFFERED focus-row option is a static hold', () => {
  // Not just the default — an athlete scrolling the list must not be able to choose a plank for a
  // row that will print reps at them.
  for (const equipment of EQ_CASES) {
    for (const chip of DIAL_CHIPS) {
      for (const o of dialRowOptions(chip, equipment)) {
        assert(isRepPrescribable(o.name),
          `${chip} offers "${o.name}" (time-based) for ${JSON.stringify(equipment)}`);
      }
    }
  }
});

Deno.test('⛔ NO ROW IN A BUILT WEEK PRINTS REPS ON A HOLD', () => {
  // The end-to-end version: whatever the floor and the Dial place, a time-based movement never
  // carries a rep range. This is what was on the screen.
  const picks = defaultViadaPicks(EQ_LABELS, []);
  for (const dial of [[], ['core'], ['glutes'], ['glutes', 'core']] as never[]) {
    const w = week({ slotPicks: picks, dial, equipment: EQ_LABELS });
    for (const s of w.sessions.filter((x) => x.type === 'strength')) {
      for (const e of (s.strength_exercises ?? [])) {
        if (isRepPrescribable(e.name)) continue;
        assert(!/^\d+\s*-\s*\d+$/.test(String(e.reps ?? '')),
          `"${e.name}" is measured in time and the row says reps "${e.reps}"`);
      }
    }
  }
});

Deno.test('⛔ THE CORE CHIP NEVER INTRODUCES A THIRD MOVEMENT', () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-24. The screen had TWO core controls — the "Core movement" pick and
   * a Dial row picker — and the built week carried both answers. The chip must extend the pick, or
   * add a complement, never announce a movement the athlete never chose.
   */
  // ⚠️ BOTH PIPES, BECAUSE THE REAL PATH SENDS BOTH. `slotPicks` fills the frame's cells;
  // `accessoryPicks` is what carries the core pick into `fillMuscleFloor`'s `prefer`, and without it
  // this test would assert on a week the app never builds.
  const picks = { ...defaultViadaPicks(EQ_LABELS, []), core: 'v up' };
  const w = week({
    slotPicks: picks,
    dial: ['core'],
    equipment: EQ_LABELS,
    accessoryPicks: flattenViadaPicks({ version: 1, picks, dial: ['core'], dial_rows: {} }),
  });
  const coreRows = w.sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => musclesWorkedBy(e.name)?.primary === 'core');
  assert(coreRows.length > 0, 'the core chip bought nothing');
  // ⛔ THE ATHLETE'S OWN PICK IS AMONG THEM — the chip extended what they chose.
  assert(coreRows.some((e) => canonicalize(e.name) === canonicalize('v up')),
    `the core pick never reached the week: ${coreRows.map((e) => e.name).join(', ')}`);
  // ⛔ AND THE WEEK HOLDS AT MOST TWO DISTINCT CORE MOVEMENTS: the pick, plus at most one complement.
  const distinct = new Set(coreRows.map((e) => canonicalize(e.name)));
  assert(distinct.size <= 2,
    `${distinct.size} distinct core movements in one week: ${[...distinct].join(', ')}`);
});

Deno.test('a stored core row from an older bundle is dropped, not honoured', () => {
  // ⚠️ Nothing has persisted a `viada` block yet, so this guards a bundle skew rather than real
  // data: an older client writing `dial_rows['core:0']` must not resurrect the third movement.
  const prefs = normalizeViadaPrefs({
    picks: defaultViadaPicks(EQ_LABELS, []),
    dial: ['core'],
    dial_rows: { 'core:0': 'plank', 'glutes:0': 'hip thrust' },
  }, EQ_LABELS);
  assertEquals(prefs!.dial_rows['core:0'], undefined, 'the core row survived');
  assertEquals(prefs!.dial_rows['glutes:0'], 'hip thrust', 'the glutes row was dropped with it');
});

// ── the persisted shape ──────────────────────────────────────────────────────────────────────────

Deno.test('a stale pick falls back per slot, never per screen', () => {
  const prefs = normalizeViadaPrefs({
    picks: { iso_pull_b: 'a movement that does not exist', single_leg_b: 'walking lunge' },
    dial: ['glutes', 'core', 'arms'],
    dial_rows: { 'glutes:0': 'hip thrust', 'glutes:1': '' },
  }, EQUIPMENT);
  assert(prefs);
  assertEquals(prefs!.picks.single_leg_b, 'walking lunge', 'a good pick was discarded with a bad one');
  assert(pickOptions('iso_pull_b', EQUIPMENT).some((o) => o.name === prefs!.picks.iso_pull_b),
    'the stale pick did not fall back to a real movement');
  // ⛔ CAPPED ON READ. A hand-edited third chip must not reach the composer.
  assertEquals(prefs!.dial.length, DIAL_CAP);
  assertEquals(prefs!.dial_rows, { 'glutes:0': 'hip thrust' });
});

Deno.test('an absent block is absent, not an empty one', () => {
  assertEquals(normalizeViadaPrefs(null, EQUIPMENT), null);
  assertEquals(normalizeViadaPrefs(undefined, EQUIPMENT), null);
  assertEquals(normalizeViadaPrefs('picks', EQUIPMENT), null);
  // ⚠️ AN EMPTY OBJECT IS A REAL BLOCK — an athlete who opened the screen and touched nothing. Every
  // pick that answers a FRAME SLOT comes back pre-filled, which is what makes a zero-touch Continue
  // build a whole week.
  const empty = normalizeViadaPrefs({}, EQUIPMENT);
  assert(empty);
  assertEquals(Object.keys(empty!.picks).length, VIADA_PICK_KEYS.length);
  for (const key of VIADA_PICK_KEYS) {
    // ⛔ EXCEPT THE OPT-IN ROW (Michael, 2026-08-29: *"don't default to a core exercise, it's 'add
    // core'"*). `strength_5k` names no core slot in either column, so nothing is waiting to be
    // filled there — the athlete is ADDING work, and an untouched screen adds none.
    if (VIADA_PICKS[key].optIn === true) {
      assertEquals(empty!.picks[key], '', `${key} is opt-in and came back pre-filled`);
      continue;
    }
    assert(empty!.picks[key].length > 0, `${key} came back empty`);
  }
});

Deno.test('the flat pipe carries every named movement exactly once', () => {
  const picks = defaultViadaPicks(EQUIPMENT, []);
  const flat = flattenViadaPicks({
    version: 1,
    picks: { ...picks, iso_pull_b: picks.core },
    dial: [],
    dial_rows: { 'glutes:0': 'hip thrust' },
  });
  assertEquals(new Set(flat.map(canonicalize)).size, flat.length, 'the flat pipe carries a duplicate');
  assert(flat.includes('hip thrust'), 'an Dial row never reached the floor');
});

// ── the restate contract ─────────────────────────────────────────────────────────────────────────

Deno.test('the block stores everything a restate needs to re-compose the SAME week', () => {
  /**
   * ⛔ THE SILENT NO-OP, AND IT IS THE THIRD TIME THIS EXACT FAILURE HAS BEEN CAUGHT ON THIS PATH —
   * `sport_mix`, `day_offset` and `athlete_equipment` each shipped read-but-never-written first.
   *
   * `rematerialize-standing-block` RE-COMPOSES the block to write the test's numbers into it, and
   * `restateFromTest` matches a composed row to a calendar row on week + weekday + MOVEMENT NAME. An
   * input the row does not store is an input the restate composes without — a different movement in
   * the same slot, matching nothing, reporting the whole block as unmatched. The athlete sees a test
   * that "produced nothing".
   */
  const picks = defaultViadaPicks(EQUIPMENT, ['glutes']);
  const compose = { ...BASE, slotPicks: picks, dial: ['glutes'] } as Omit<ComposeArgs, 'week' | 'column'>;
  const row = buildStandingPlanRow({ compose, weeks: 4 });
  // ⚠️ `row.config` IS the standing-plan config — `buildStandingPlanRow` returns it flat and the
  // edge function writes it to `plans.config.standing_plan`.
  const sp = row.config as unknown as Record<string, unknown>;
  assertEquals(sp.slot_picks, picks, 'the block did not store the per-slot picks');
  assertEquals(sp.dial, ['glutes'], 'the block did not store the Dial chips');

  // ⛔ AND RE-COMPOSING FROM WHAT WAS STORED REPRODUCES THE WEEK EXACTLY. Anything else is the
  // silent no-op: `restateFromTest` matches on the movement NAME and would find none of them.
  const fromStore = composeBlock({
    ...BASE,
    slotPicks: sp.slot_picks as typeof picks,
    dial: sp.dial as string[],
    weeks: 4,
  } as never);
  const asBuilt = composeBlock({ ...compose, weeks: 4 } as never);
  assertEquals(
    JSON.stringify(fromStore.map((w) => w.sessions)),
    JSON.stringify(asBuilt.map((w) => w.sessions)),
    'a restate from the stored config builds a different week',
  );
});

Deno.test('a block with no Standing Plan answers stores nothing, and composes as it always did', () => {
  // ⚠️ ABSENT IS THE OLD BEHAVIOUR BY CONSTRUCTION — every Get Stronger block and every block built
  // before this shipped.
  const row = buildStandingPlanRow({ compose: BASE, weeks: 2 });
  const sp = row.config as unknown as Record<string, unknown>;
  assertEquals(sp.slot_picks, null);
  assertEquals(sp.dial, null);
});

/**
 * ⛔ THE LEG-EXTENSION DUPLICATE, PINNED (Michael's device find, 2026-08-25, strong-focus (21).md).
 *
 * `leg extension` was untagged in `strength-gear.ts`, so the composer placed it for a home athlete
 * and `materialize-plan`'s week-blind equipment swap turned it into "Bulgarian Split Squats" — a
 * plural-spelling duplicate of the athlete's own Tuesday single-leg pick, every week, on a
 * device-verified block. The fix is upstream: `leg extension` is gated on `machine` (commercial gym
 * only), so a home athlete's week never contains it and the swap never fires.
 */
Deno.test('a home athlete never composes leg extension, and the single-leg pick is not duplicated', () => {
  const picks = defaultViadaPicks(EQUIPMENT, []);
  const rows = rowsOf(week({
    slotPicks: picks,
    accessoryPicks: flattenViadaPicks({ version: 1, picks, dial: [], dial_rows: {} }),
  }));

  // ⛔ No machine movement for an athlete who declared no machine.
  assert(!rows.some((r) => canonicalize(r.name) === canonicalize('leg extension')),
    'a home athlete was prescribed a machine movement');

  // ⛔ The original defect's shape: the athlete's single-leg pick appearing a second time under the
  // engine's own spelling. One pick, one day, one row.
  const single = String(picks.single_leg_a ?? 'bulgarian split squat');
  const hits = rows.filter((r) => canonicalize(r.name) === canonicalize(single));
  assertEquals(hits.length, 1,
    `the single-leg pick "${single}" appears ${hits.length} times: ${hits.map((h) => h.day).join(', ')}`);
});

Deno.test('the lower-isolation default sits on each side of the machine gate', () => {
  /**
   * ⛔ UPDATED 2026-08-29 — the default moved from `calf raise` to `seated calf raise`, and that is a
   * fix landing rather than a regression. His p223 focused-quad list names *"seated calf raises"* with
   * no equipment qualifier — while p220's SECONDARY entry is explicitly *"freestanding BARBELL calf
   * raises"* — so gating the seated one to a station was ours and too strict. A dumbbell across the
   * knee on a bench is a seated calf raise, and a home athlete now opens on his movement.
   * ⚠️ THE ASSERTION THAT MATTERS IS UNCHANGED: a home athlete opens on something they can perform.
   */
  const home = defaultViadaPicks(EQUIPMENT, []);
  assertEquals(canonicalize(String(home.quad_iso)), canonicalize('seated calf raise'),
    'a home athlete\'s leg-isolation default is not performable-first');
  // Commercial gym: the machine exists, leg extension still leads.
  const gym = defaultViadaPicks(['Commercial gym'], []);
  assertEquals(canonicalize(String(gym.quad_iso)), canonicalize('leg extension'),
    'a gym athlete lost leg extension');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE LEG-ACCESSORY CELL — the label, and the two things the grid cannot filter (2026-08-26)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const GYM = ['Full commercial gym access'];
const HOME_BARBELL = ['Full barbell + plates', 'Bench (flat/adjustable)'];
const NOTHING = ['Bodyweight only'];

Deno.test('⛔⛔ EVERY LABEL IS HIS PRINTED HEADING — no invented tier names', () => {
  /**
   * ⛔⛔ MICHAEL, 2026-08-29: *"it should be viada verbatim and the proper exercises in there."*
   * The labels are now his own printed category headings from pp.218-223, so the word on the screen,
   * the `slot.category` under it and the page it cites are the same word.
   *
   * ⚠️ THIS SUPERSEDES TWO OF HIS OWN EARLIER WORDING RULINGS, and neither was wrong when it was
   * made — both were the best plain-English name available before the labels were tied to his key:
   *   · 2026-08-26 "single-leg" → "Leg accessory" (off a screenshot: *"might be wendler legacy make
   *     it right"*). It WAS Wendler legacy — `assistance-catalog.ts` carries `single_leg_core`, one
   *     of Wendler's three assistance categories, and the phrase walked across without the wiring.
   *     ⛔ But "Leg accessory" had its own defect: the cell holds split squats and lunges, which are
   *     COMPOUNDS. Calling a compound an accessory is backwards, and it is what this fixes.
   *   · 2026-08-25 "quad isolation" → "Lower isolation", because the cell's p223 members include
   *     calves and true single-joint quad work needs a machine.
   *
   * ⛔ THE p220 POINT THAT KILLED "SINGLE-LEG" STILL STANDS and is why the heading is right: his
   * `secondary press lower` is split squat, Zercher squat, freestanding barbell calf raises, forward
   * or reverse lunge — a bilateral squat and a calf raise sit in it.
   */
  for (const key of ['single_leg_a', 'single_leg_b'] as const) {
    assertEquals(VIADA_PICKS[key].label, 'Leg variation');
    assert(!/single.?leg/i.test(VIADA_PICKS[key].label), `${key} still says single-leg`);
    assert(!/accessory/i.test(VIADA_PICKS[key].label), `${key} still calls a compound an accessory`);
  }
  // ⛔ EVERY LABEL NAMES ITS OWN SLOT. A label that drifts from the category beneath it is the whole
  // defect this test now guards — the screen said "Dumbbell press" over a cell that is the entire
  // secondary push upper category, which is why single-joint work read as belonging there.
  assertEquals(VIADA_PICKS.quad_iso.label, 'Leg isolation');
  assertEquals(VIADA_PICKS.db_press.label, 'Press variation');
  assertEquals(VIADA_PICKS.iso_push.label, 'Push isolation');
  assertEquals(VIADA_PICKS.iso_pull_a.label, 'Pull isolation');
  assertEquals(VIADA_PICKS.iso_pull_b.label, 'Pull isolation');
  assertEquals(VIADA_PICKS.core.label, 'Core');
  // ⛔ THE LABEL WAS THE ONLY CHANGE. The 2026-08-25 day split and both lead heads still stand.
  assertEquals(VIADA_PICKS.single_leg_a.slot?.frameDay, 2);
  assertEquals(VIADA_PICKS.single_leg_b.slot?.frameDay, 5);
  assertEquals(VIADA_PICKS.single_leg_a.leadWith[0], 'bulgarian split squat');
  assertEquals(VIADA_PICKS.single_leg_b.leadWith[0], 'walking lunge');
});

Deno.test('⛔⛔ UNLOADED WORK IS GATED, NOT DELETED — it surfaces only with nothing to load with', () => {
  /**
   * ⛔ THE DEFECT: Bodyweight Squat and Air Squat were offered to an athlete who squats 200 lb, in a
   * SECONDARY slot on the heavy lower day, where they provide no stimulus. ⚠️ None of them is in
   * p220's list for this cell — they are catalogue members, not his.
   */
  for (const eq of [GYM, HOME_BARBELL]) {
    const names = pickOptions('single_leg_a', eq).map((o) => o.name);
    for (const bw of ['bodyweight squat', 'air squat', 'bodyweight lunges']) {
      assertEquals(names.includes(bw), false, `${bw} was offered to a loaded athlete: ${names.join(', ')}`);
    }
    assert(names.length >= 4, `the cell was gutted for a loaded athlete: ${names.join(', ')}`);
  }

  /**
   * ⛔ AND THE ATHLETE WITH NOTHING TO LOAD WITH STILL GETS THEM. For that athlete these ARE the real
   * options, and `resolveSlot`'s contract is that a cell is never empty — this must not be the thing
   * that empties one. ⚠️ MUTATION-TESTED: drop `ownsLoadingImplement` from the gate and this fails.
   */
  const bodyweight = pickOptions('single_leg_a', NOTHING).map((o) => o.name);
  assert(bodyweight.some((n) => ['bodyweight squat', 'air squat', 'bodyweight lunges'].includes(n)),
    `the bodyweight athlete lost their own options: ${bodyweight.join(', ')}`);

  // ⚠️ AN ATHLETE NOBODY ASKED IS UNTOUCHED — the conservative arm, and the app's existing §0h rule.
  const undeclared = pickOptions('single_leg_a', null).map((o) => o.name);
  assert(undeclared.includes('bodyweight squat'), 'an unasked athlete was gated on equipment they never declared');
});

Deno.test('⛔ EXPLOSIVE STEP UP IS OUT OF THIS CELL, AND STILL IN THE APP', () => {
  /**
   * ⛔ IT IS A SPEED-CUED COPY OF `step up`, WHICH IS ALREADY IN THE LIST — and the cue it adds is
   * the DE slot's instruction, not this one's. A HYP secondary slot asking for controlled work
   * should not offer a near-duplicate whose only distinguishing feature contradicts it.
   *
   * ⚠️ PLYO DOES NOT OWN IT, CHECKED BEFORE REMOVING: `plyo.ts` carries no step-up, and the app
   * files this one as ordinary loaded work (`exercise-role.ts` → `loaded_accessory`,
   * `exercise-config.ts` → squat × 0.4 per hand, *"'Explosive' is a speed cue, not a load basis"*).
   * So it is excluded from the CELL, never dropped from the catalogue.
   */
  for (const eq of [GYM, HOME_BARBELL, NOTHING, null]) {
    for (const key of ['single_leg_a', 'single_leg_b'] as const) {
      const names = pickOptions(key, eq).map((o) => o.name);
      assertEquals(names.includes('explosive step up'), false, `${key} still offers the speed-cued copy`);
      // ⛔ AND THE MOVEMENT IT DUPLICATES IS STILL THERE — the exclusion must not take the real one.
      assert(names.includes('step up'), `${key} lost the plain step up too: ${names.join(', ')}`);
    }
  }
});

Deno.test('⛔ THE RULES ARE DECLARED PER PICK, NEVER GLOBAL', () => {
  /**
   * ⚠️ THE GENERAL DEFECT IS REAL AND IS NOT BEING FIXED GLOBALLY HERE. `resolveSlot` ranks by
   * EQUIPMENT FIT and is blind to whether an option can do the job the slot exists FOR — that is
   * true of every cell. Whether it MATTERS is a per-cell judgement, and widening either rule on one
   * cell's evidence is how a screenshot becomes an app-wide change nobody ruled on.
   */
  const loaded = VIADA_PICK_KEYS.filter((k) => VIADA_PICKS[k].requiresLoad === true);
  assertEquals(loaded, ['single_leg_a', 'single_leg_b']);
  const excluding = VIADA_PICK_KEYS.filter((k) => (VIADA_PICKS[k].excludes ?? []).length > 0);
  assertEquals(excluding, ['single_leg_a', 'single_leg_b']);
  // ⛔ AND THE OTHER CELLS ARE UNCHANGED — a gym athlete's core pick still holds its bodyweight work,
  // which is what core work IS. Proof the rule did not leak.
  const core = pickOptions('core', GYM).map((o) => o.name);
  assert(core.length >= 3, `the core pick was gated by a rule it does not carry: ${core.join(', ')}`);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE ROWS READ IN WEEK ORDER, TAGGED WITH HIS DAY NUMBERS (2026-08-26)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ THE TAG IS HIS DAY NUMBER — not a weekday, and not a 1-through-4 renumber', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26: *"1-2 4 and 5 and put them in order."* The screen printed monday /
   * tuesday / thursday / friday, which is something it does not know: the wizard asks for the
   * accessories BEFORE it asks for the calendar, and the plan places the days one screen later.
   *
   * ⛔ AND THE NUMBERS ARE HIS, OFF p246. The lifting days sit at 1, 2, 4 and 5 of a SEVEN-day week
   * — day 3 and the weekend are endurance-only. A 1-through-4 renumber would be OURS and would break
   * the correspondence with his own table, which is the thing this file exists to preserve. ⚠️ THAT
   * IS WHY 3 MUST NEVER APPEAR AND 5 MUST.
   */
  assertEquals(dayLabelForPick('iso_push'), 'day 1');
  assertEquals(dayLabelForPick('iso_pull_a'), 'day 1');
  assertEquals(dayLabelForPick('single_leg_a'), 'day 2');
  assertEquals(dayLabelForPick('db_press'), 'day 4');
  assertEquals(dayLabelForPick('iso_pull_b'), 'day 4');
  assertEquals(dayLabelForPick('single_leg_b'), 'day 5');
  assertEquals(dayLabelForPick('quad_iso'), 'day 5');
  // ⛔ CORE HAS NO SLOT AND NO DAY. The screen prints its own line instead; this must not invent one.
  assertEquals(dayLabelForPick('core'), null);

  const all = VIADA_PICK_KEYS.map((k) => dayLabelForPick(k)).filter(Boolean).join(' ');
  assertEquals(/day 3/.test(all), false, 'a lifting day appeared on the endurance-only day 3');
  assert(/day 5/.test(all), 'the days were renumbered 1-4 — the correspondence with p246 is broken');
  // ⚠️ AND NO WEEKDAY SURVIVES ANYWHERE IN THE TAG.
  assertEquals(/monday|tuesday|wednesday|thursday|friday/i.test(all), false, all);
});

Deno.test('⛔⛔ THE ROWS SORT INTO WEEK ORDER, ON THE RESOLVED DAY', () => {
  /**
   * ⛔ THE DEFECT: `VIADA_PICK_KEYS` is TABLE order. It groups the two isolation-pull rows and the
   * two leg rows together, so the days interleave on screen — 4, 1, 1, 4, 2, 5, 5 — and an athlete
   * reading down the list cannot see their week in it.
   *
   * ⚠️ AND THE SORT READS THE **FRAME**, NOT `spec.slot.frameDay`. Only four of the seven declare a
   * `frameDay`; `db_press`, `iso_push` and `quad_iso` have none and take whatever day their cell
   * falls on. Sorting on the spec field would leave those three unsorted at the front — pinned here
   * because it is the exact trap, and it is invisible without this assertion.
   */
  assertEquals(pickKeysInDayOrder(), [
    'iso_push', 'iso_pull_a',      // day 1
    'single_leg_a',                // day 2
    'db_press', 'iso_pull_b',      // day 4
    'single_leg_b', 'quad_iso',    // day 5
    'core',                        // no day — last
  ]);

  // ⛔ THE DAYS THEMSELVES ARE NON-DECREASING, which is the property the athlete actually reads.
  const days = pickKeysInDayOrder()
    .map((k) => frameDaysForPick(k))
    .filter((d) => d.length > 0)
    .map((d) => Math.min(...d));
  for (let i = 1; i < days.length; i += 1) {
    assert(days[i] >= days[i - 1], `the rows went backwards: ${days.join(', ')}`);
  }

  // ⛔ NOTHING IS LOST OR DUPLICATED BY THE SORT — the same seven picks plus core, every time.
  assertEquals([...pickKeysInDayOrder()].sort(), [...VIADA_PICK_KEYS].sort());

  // ⚠️ THE THREE WITH NO `frameDay` ARE THE ONES THIS PROTECTS. If any of them ever gains one, this
  // says so — the sort would still be right, but the trap it guards would have quietly gone away.
  for (const k of ['db_press', 'iso_push', 'quad_iso'] as const) {
    assertEquals(VIADA_PICKS[k].slot?.frameDay, undefined,
      `${k} now declares a frameDay — the resolved-day sort is no longer load-bearing for it`);
    assertEquals(frameDaysForPick(k).length, 1, `${k} resolves to more than one day`);
  }
});

Deno.test('⛔ THE WEEKDAY ANSWER STILL EXISTS, AND THE TWO CANNOT DRIFT', () => {
  // ⚠️ `daysForPick` is still right for a surface that HAS the calendar; it was the WIZARD that
  // could not know. It now delegates to `frameDaysForPick`, so one owner answers both questions.
  assertEquals(daysForPick('single_leg_a'), ['Tuesday']);
  assertEquals(frameDaysForPick('single_leg_a'), [2]);
  for (const k of VIADA_PICK_KEYS) {
    assertEquals(daysForPick(k).length, frameDaysForPick(k).length, `${k}: the two answers disagree`);
  }
});
