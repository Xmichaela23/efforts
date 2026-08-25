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
import {
  DIAL_CAP,
  DIAL_CHIPS,
  dialDose,
  dialRowOptions,
  chipHasFrameSlot,
  daysForPick,
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
  }
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
  // ⚠️ AN EMPTY OBJECT IS A REAL BLOCK — an athlete who opened the screen and touched nothing. It
  // comes back fully pre-filled, which is what makes a zero-touch Continue build a whole week.
  const empty = normalizeViadaPrefs({}, EQUIPMENT);
  assert(empty);
  assertEquals(Object.keys(empty!.picks).length, VIADA_PICK_KEYS.length);
  for (const key of VIADA_PICK_KEYS) assert(empty!.picks[key].length > 0, `${key} came back empty`);
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
