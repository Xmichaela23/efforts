// ============================================================================
// THE ACCESSORY PICKS — the seven things this frame actually leaves open, and the Dial.
//
// Decided by Michael 2026-08-24 (D-450 in `docs/DECISIONS-LOG-3.md` — the handoff spec it was built from is deleted, per the spec lifecycle).
//
// ⛔ WHY THIS FILE EXISTS AT ALL. The picker the Standing Plan was borrowing is THE PREVIOUS PROGRAM'S taxonomy —
// push / pull / single-leg-core across three lifting days — and this frame does not share it. Read
// off `frames.ts` (p246): the week carries SEVEN HYP accessory slots, no core slot and no open
// compound-pull slot, so three of the nine picks could essentially never place, every ab pick could
// only ride the muscle floor, and two of the focus chips named muscles no grid cell offers.
//
// ⛔ SO THE PICKS ARE NAMED AFTER THE FRAME'S OWN SLOTS, AND THE TABLE BELOW IS DERIVED FROM
// `FRAMES`, NOT TRANSCRIBED BESIDE IT. A pick declares a `category × pattern`; which DAYS it lands
// on is read out of the frame at call time. A second hand-written day list is exactly how the
// picker and the week came apart the first time.
//
// ⛔ CLIENT-REACHABLE. `@shared/standing-plan/accessory-picks.ts` from React,
// `./accessory-picks.ts` from the composer. One table, read by both — the wizard cannot offer a
// movement the composer will not place, because both ends call `pickOptions`.
// ============================================================================

import {
  isRepPrescribable,
  movementsForMuscle,
  muscleFloorSets,
  musclesWorkedBy,
  WEEKLY_SETS_SOLID,
  type MuscleGroup,
} from '../accessory-dosing/index.ts';
import {
  isBodyweightLoad,
  resolveSlot,
  executionName,
  type GridMovement,
  type ViadaCategory,
  type ViadaPattern,
} from '../strength-grid/index.ts';
import { ownsLoadingImplement } from '../../../../src/lib/strength-gear.ts';
import { canonicalize } from '../canonicalize.ts';
import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
// ⚠️ `WEEKDAYS` left with `dialSentence` (the week-order sort went to `src/lib/dial-copy.ts`).
import { weekdayForFrameDay, type Weekday } from './day-map.ts';

// ── THE SEVEN ────────────────────────────────────────────────────────────────────────────────────

export type ViadaPickKey =
  | 'db_press'
  | 'iso_push'
  | 'iso_pull_a'
  | 'iso_pull_b'
  | 'single_leg_a'
  | 'single_leg_b'
  | 'hinge_lower'
  | 'quad_iso'
  /**
   * ⛔⛔⛔ p274's OWN CELLS — the second frame's pick vocabulary (Michael, 2026-08-30: *"Standard
   * Focus gets its own accessory pickers over the cells p274 actually has"*).
   *
   * ⛔ WHY THEY ARE NEW KEYS AND NOT A WIDENING. **p246 is built on `secondary` accessory cells and
   * p274 has none** — its accessory work is `braced` and `focused` (p274, transcribed in
   * `SOURCE-viada-hybrid-athlete.md` Part E1). Four of the 5K table's picks aim at cells this frame
   * does not contain, which is exactly why they were dead controls on it.
   * ⚠️ THE FOUR SURVIVORS KEEP THEIR OLD KEYS. `iso_push`, `iso_pull_a`, `iso_pull_b` and `quad_iso`
   * point at cells BOTH frames carry, so re-keying them would have dropped every pick already stored
   * on a block for no gain. **The table is per-frame; the key vocabulary is shared where the cell is
   * the same.** See `PICK_KEYS_BY_FRAME`.
   */
  | 'braced_push'
  | 'braced_pull'
  | 'braced_hinge'
  | 'braced_leg'
  | 'ham_iso'
  | 'core';

/** ⛔ p246's TABLE, FROZEN. `strength_5k`'s membership and nothing else — see `PICK_KEYS_BY_FRAME`. */
export const VIADA_PICK_KEYS: ViadaPickKey[] = [
  'db_press', 'iso_push', 'iso_pull_a', 'iso_pull_b', 'hinge_lower', 'single_leg_a', 'single_leg_b', 'quad_iso', 'core',
];

/**
 * ⛔⛔⛔ p274's TABLE — the athlete's say over the All Rounder's four lifting days.
 *
 * ⛔ EVERY HYP ACCESSORY CELL p274 CARRIES, AND NOTHING ELSE. The week has 22 strength slots; 14 of
 * them are HYP accessory, which is the only intent the composer consults a pick for. The other eight
 * are the four day-opening ME slots, two DE and one SKILL — see `MOVEMENT_CHOICE_ON_ME_IS_OURS`.
 *
 * | day | cell (p274) | pick |
 * |---|---|---|
 * | 1 | 1 × HYP braced push | `braced_push` |
 * | 1 · 4 | 2 × HYP focused push/pull (arms) superset + 1 × HYP focused push/pull | `iso_push`, `iso_pull_a`, `iso_pull_b` |
 * | 4 | 1 × HYP braced pull | `braced_pull` |
 * | 2 · 5 | 2 × HYP braced hinge / braced lower push superset | `braced_hinge`, `braced_leg` |
 * | 2 | 1 × HYP focused hamstring | `ham_iso` |
 * | 5 | 1 × HYP focused quadriceps | `quad_iso` |
 *
 * ⚠️ THE TWO BRACED PICKS ARE DAY-AGNOSTIC, AND THAT IS A DIFFERENT CALL FROM p246's. That table
 * splits `focused pull_upper` and `secondary press_lower` per day because the two occurrences do
 * different jobs. **p274 prints the SAME pairing on both lower days** — *"2 × HYP: braced hinge /
 * braced lower push superset"*, verbatim on day 2 and day 5 — so one answer for each half is the
 * faithful reading, and four controls for two printed rows would be the screen inventing a
 * distinction the page does not make.
 */
export const ALL_ROUNDER_PICK_KEYS: ViadaPickKey[] = [
  'braced_push', 'iso_push', 'iso_pull_a', 'braced_hinge', 'braced_leg', 'ham_iso',
  'braced_pull', 'iso_pull_b', 'quad_iso',
];

/**
 * ⛔⛔⛔ D-457 — THE PICK TABLE IS THE FRAME'S, AND THERE IS NO SHARED DEFAULT. Michael, 2026-08-30:
 * *"this is a second frame-owned pick table, no shared defaults."* A caller that does not name a
 * frame cannot get a list out of this module at all.
 */
export const PICK_KEYS_BY_FRAME: Record<FrameId, ViadaPickKey[]> = {
  strength_5k: VIADA_PICK_KEYS,
  all_rounder: ALL_ROUNDER_PICK_KEYS,
};

/**
 * ⚠️⚠️ WHY THE ME, DE AND SKILL SLOTS TAKE NO PICK, AND IT IS **OURS RATHER THAN HIS** — verified
 * against the source rather than assumed (Michael asked for exactly that check, 2026-08-30).
 *
 * ⛔ THE BOOK DOES NOT RESERVE THEM. p275 invites the athlete into the day-opening slot in terms:
 * *"if you want to incorporate more asymmetrical movements, I encourage you to select those for the
 * secondary movement that begins each day. You might not consider split squats or similar for ME
 * lifting, but there is certainly no rule that says you can't."* **That is his permission for an
 * athlete choice on the ME slot, and we are not offering it.**
 *
 * ⛔ WHAT ACTUALLY RESERVES THEM IS OUR MACHINERY. `exerciseForSlot` puts a WEIGHT on a row only
 * when the movement is the athlete's named competition lift for that pattern, and Michael ruled on
 * 2026-08-30 that the day-opening lift is a competition primary for that reason — a day with no
 * tested lift prescribes no weight. And `compose.ts` consults a pick only for a cell that is
 * `intent === 'HYP' && role === 'accessory'`, so a pick on a DE or SKILL cell would be stored and
 * silently ignored — the defect class this whole pass exists to close.
 *
 * ⚠️ SO IT IS A LIMIT OF THE APP, NOT OF THE PROGRAMME, and it is recorded here so nobody later
 * writes "the book reserves the ME slot". Opening it needs the weight path to handle a
 * non-competition movement first.
 */
export const MOVEMENT_CHOICE_ON_ME_IS_OURS =
  'p275 permits the athlete to choose the day-opening secondary movement, including asymmetrical '
  + 'work; the app reserves it because only a named competition lift resolves to a prescribed '
  + 'weight. The restriction is ours, not his.';

/**
 * ⛔⛔ SUPERSEDED 2026-08-29 — MICHAEL RULED THE OTHER WAY AND THE `hinge_lower` PICK NOW EXISTS.
 * Everything below is history and is kept because two of its three reasons were sound and one was
 * simply wrong, and the next person to look at this cell should know which.
 *
 * ⛔ REASON 1 WAS WRONG. It says "not one of them is `hinge_lower` — not secondary, not focused, in
 * either column." That is true of the seven HYP cells it was counting, and frame day 2 carries
 * `DE accessory secondary hinge_lower` all the same (`frames.ts`, day 2, third slot). The pick has a
 * cell to point at; the count had excluded DE cells without saying so.
 *
 * ⚠️ REASON 2 IS STILL TRUE AND NO LONGER DECIDES IT. The slot IS the programme's DE prescription
 * rather than a free accessory — but `db_press` has always answered a DE cell too (day 1's
 * `DE accessory secondary push_upper`), so "DE is not the athlete's to own" was already not the rule
 * this file follows. Michael has now ruled it explicitly.
 *
 * ⚠️ REASON 3 STANDS AS AN OBSERVATION, not an objection: the absence of a FOCUSED hamstring slot
 * here, when p274 gives the All Rounder one, still reads deliberate. This pick does not add a slot -
 * it hands the athlete the choice inside a slot the frame already prescribes.
 *
 * ⛔ AND THE NORDIC-CURL NOTE AT THE BOTTOM SURVIVES INTACT. It is about a movement, not about the
 * pick, and nothing here reopens it.
 *
 * ── history ──────────────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ THERE IS NO EIGHTH PICK FOR THE LOWER POSTERIOR, AND IT WAS CONSIDERED AND REJECTED
 * (Michael, 2026-08-26). This is the note for whoever notices the gap next — because it IS a real
 * gap in the picker, and the obvious fix is wrong for three separate reasons.
 *
 * ⛔ 1. THERE IS NO CELL. `strength_5k` carries seven HYP accessory cells across both columns, all
 * seven already claimed by the rows below, and **not one of them is `hinge_lower`** — not secondary,
 * not focused, in either column. An eighth pick has nothing to point at, and the gate in
 * `standing-plan-accessory-picks.test.ts` would fail by construction.
 *
 * ⛔ 2. THE POSTERIOR IS ALREADY TRAINED. Frame day 2 carries `DE accessory secondary hinge_lower`,
 * and that cell resolves to **hip thrust** for every equipment case tested — none declared, barbell
 * and bench, full gym — with romanian deadlift and RDL behind it. What is missing is the athlete's
 * CHOICE, not the work. And that slot is DE: the programme's own prescription (pivot §6), not the
 * athlete's to own. Handing it over is a different decision and needs its own ruling.
 *
 * ⚠️ 3. AND THE ABSENCE READS DELIBERATE. §E1b records "accessory lower" as genuinely ambiguous —
 * the phrase is in no category on pp.218-223 — but he DOES name a focused hamstring slot in the All
 * Rounder (p274) and did not put one here.
 *
 * ⚠️ AND WHY NORDIC CURL IS NOT THE HOME SUBSTITUTE, since it is the first thing anyone reaches for
 * when the machine leg curl is out of range: nordics are heavily ECCENTRIC, eccentric hamstring work
 * is among the most soreness-producing things available, and this athlete runs five days a week.
 * Sore hamstrings cost the week's hardest run. Hip thrust is concentric-dominant and leaves almost
 * nothing behind — benefit without a recovery cost to the endurance work, which is the whole test a
 * movement has to pass in a hybrid programme.
 */
export const LOWER_POSTERIOR_NEEDS_NO_PICK =
  'The heavy leg day already prescribes a hip thrust. The frame leaves no accessory slot for '
  + 'hamstring or glute work, and the slot that trains them is the programme\'s own.';

/**
 * ⛔ THE DEFAULT LAYOUT IS BALANCED BY ITSELF; THE DIAL IS FINE-TUNING ON TOP OF A BALANCED WEEK,
 * NEVER THE SOURCE OF BALANCE (Michael, 2026-08-24).
 *
 * This is the rule that made `focused pull_upper` TWO picks instead of one asked twice. The cell
 * occurs on day 1 and day 4, and one pick answering both put the same movement on both days — a week
 * that trains rear delts twice and biceps not at all, or the reverse, depending on one dropdown. The
 * athlete who touches nothing must still get a week that covers what the frame's slots are for.
 *
 * ⚠️ THE PRACTICAL TEST, AND IT IS THE ONE TO RUN ON ANY FUTURE PICK: build a week with a zero-touch
 * Continue and no chips. If a muscle the slots exist to train is missing from it, the LAYOUT is
 * wrong — do not reach for a chip default to cover the gap. A dial that is load-bearing for balance
 * is a dial the athlete can turn OFF and break their own week with.
 */
export const LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT =
  'The default week is balanced on its own. The Dial adjusts a balanced week; it never creates the '
  + 'balance.';

export type ViadaPickSpec = {
  key: ViadaPickKey;
  /** What the athlete reads. Plain movement language, never the grid's vocabulary. */
  label: string;
  /**
   * ⛔ THE FRAME SLOT THIS PICK FILLS. `null` on `core` — see the note above `VIADA_PICKS`.
   * Every one of these is a HYP accessory slot: those are the exercises p246 leaves to the athlete,
   * and the ME/DE slots carry the programme's own prescriptions (pivot §6).
   *
   * ⛔ `frameDay` NARROWS A PICK TO ONE OCCURRENCE OF A CELL THAT HAPPENS TWICE. Omitted, the pick
   * owns every day the cell falls on. BOTH cells that occur twice are now day-scoped — `focused
   * pull_upper` (days 1/4) and `secondary press_lower` (days 2/5) — so nothing in the table uses the
   * day-agnostic form today. The fallback stays because it is the right shape for a cell that
   * genuinely wants one answer, and `pickKeyForSlot` still resolves it.
   * ⚠️ THE TWO SPLITS ARE NOT THE SAME ARGUMENT. Pull splits on MUSCLE — p222-223 files rear-delt
   * work and arm work separately, so one dropdown trained one twice and the other never. Single-leg
   * splits on MOVEMENT: every option in that cell is quadriceps, so the split changes what the week
   * looks like, not which muscles it covers (see the rows themselves).
   * ⚠️ It is a FRAME day number (`FrameDay.day`), never a weekday: the weekday rotates with the
   * athlete's pinned days and the frame day does not.
   */
  slot: { category: ViadaCategory; pattern: ViadaPattern | null; frameDay?: number } | null;
  /**
   * ⛔ THE OTHER HALF OF A SUPERSET THE PAGE PRINTS AS ONE ROW. p274 pairs `braced hinge` with
   * `braced lower push` on both lower days: *"2 × HYP: braced hinge / braced lower push superset"*.
   * ⚠️ IT IS DISPLAY, NOT STRUCTURE — nothing in the app pairs exercises yet (`frames.ts`, DESIGN
   * §5), so this exists so the two dropdowns read as the one row they came from rather than as two
   * unrelated controls. **Two answers, one printed row.**
   */
  pairedWith?: ViadaPickKey;
  /** What the screen says beside a paired pick, in lifter words. Absent on an unpaired cell. */
  superset?: string;
  /**
   * HIS PRINTED LIST FOR THIS CELL, AND THE ONLY THING THE PICKER OFFERS (Michael, 2026-08-29:
   * "I don't want extraneous exercises that aren't in his book").
   *
   * It is a product decision about fidelity, not a legal one - exercise names are generic and
   * unprotectable. This is Michael choosing that the app offers his programme rather than a library
   * wearing his category names.
   *
   * THE EQUIPMENT BASELINE IT RESTS ON (Michael, 2026-08-29): "everyone has a barbell, and
   * dumbbells, and a bench." Against that floor every cell keeps two or more options. It does NOT
   * survive a bodyweight-only athlete - four cells go to zero - and that case is ruled out by the
   * baseline rather than solved. If the equipment picker still offers setups below that floor, this
   * cut breaks them. Raised, not chased.
   */
  hisList: string[];
  /**
   * MOVEMENTS THAT ARE OURS, OFFERED ALONGSIDE HIS AND MARKED AS SUCH (Michael, 2026-08-29:
   * "allow the dumbbell fly as ours, labelled as an addition, not as his").
   *
   * The strict cut removes everything he never printed. This is the one deliberate exception to it,
   * and the exception has to be VISIBLE or the cut means nothing - an unmarked addition is exactly
   * the thing the cut exists to stop. Every entry here carries `ours: true` to the surface.
   *
   * It is not a back door for the wider library. A movement belongs here only when Michael has named
   * it and said why, and the reason lives on the entry.
   */
  oursList?: { name: string; because: string }[];
  /**
   * OPT-IN: the row opens EMPTY and the athlete adds it, rather than opening on a pre-filled
   * choice (Michael, 2026-08-29: "don't default to a core exercise, it's 'add core'").
   * ⚠️ Only `core` carries this. Every other pick is a slot the FRAME named, so it must open on
   * something — a zero-touch Continue has to build a complete week.
   */
  optIn?: boolean;
  /**
   * ⛔ HIS OWN LIST FOR THIS CELL, IN HIS ORDER, AS AN ORDERING HINT — never a filter.
   *
   * The grid ranks by equipment fit, which is right and is blind to what the slot is FOR: a
   * `focused press_lower` cell holds leg extensions and five calf variants, and an athlete opening
   * a pick called "Quad isolation" should not scroll past four calf raises to reach the one
   * movement it is named after. These names lead; everything else the cell holds follows, in the
   * grid's own order. ⚠️ Nothing is removed, so no equipment case can empty a pick.
   */
  leadWith: string[];
  leadCite: string;
  /** Which Dial chips this pick can be re-pointed by. Empty = the chip cannot reach it. */
  servesChips: DialChip[];
  /**
   * ⛔⛔ THIS CELL'S JOB NEEDS EXTERNAL LOAD (Michael, 2026-08-26, off the dropdown's own screenshot).
   *
   * Bodyweight Squat, Air Squat and Bodyweight Lunges were being offered to an athlete who squats
   * 200 lb, in a SECONDARY slot on the heavy lower day. They provide no stimulus there. ⚠️ NONE OF
   * THE THREE IS IN p220'S LIST for this cell — his own is split squat, Zercher squat, freestanding
   * barbell calf raises, forward or reverse lunge. They are catalogue members, not his.
   *
   * ⛔ GATED, NOT DELETED. An athlete with nothing to load with still sees them, because for that
   * athlete they are the real options and an empty cell is worse than a light one. `resolveSlot`
   * never returns an empty list and this must not be the thing that makes it.
   *
   * ⚠️ AND IT IS A GATE HERE RATHER THAN IN `rank`, DELIBERATELY. The grid already DEMOTES bodyweight
   * work for a loaded athlete, and its own docblock says that is *"a tiebreak, NEVER a gate"* —
   * turning it into one there would exclude bodyweight options from every cell in the app on one
   * cell's evidence. So the rule is declared per pick, and today only these two rows carry it.
   *
   * ⛔⛔ AND THE OPEN QUESTION ON IT IS CLOSED — BY THE BOOK, NOT BY A PREFERENCE (2026-08-26).
   * The rule also drops **Pistol Squat and Single Leg Squat**, which Michael had not named, and the
   * obvious next move was an exception for them: a pistol squat is genuinely hard for a strong
   * athlete. It is not needed. **p220's own list for `secondary press_lower` is split squat, Zercher
   * squat, freestanding barbell calf raises, forward or reverse lunge** — four movements, all
   * loaded. Neither pistols nor single-leg squats are in his vocabulary for this cell at all, so
   * gating them is not an over-reach of the rule; it is the rule agreeing with the source. ⚠️ Do not
   * re-open this without new evidence from the page.
   */
  requiresLoad?: boolean;
  /**
   * ⛔ MOVEMENTS THIS CELL EXCLUDES BY INTENT — not by equipment, and not from the catalogue.
   *
   * ⚠️ THE GENERAL DEFECT BEHIND IT: the grid ranks by EQUIPMENT FIT and is blind to whether an
   * option can do the job the slot exists for. Everything in the cell is reachable and correctly
   * patterned; some of it is still the wrong intent.
   */
  excludes?: string[];
};

/**
 * ⛔ THE CORE PICK HAS NO SLOT, AND THAT IS THE HONEST VERSION OF WHAT IT DOES.
 *
 * `strength_5k` names no core slot in either column — p246 simply does not carry one, and p223 files
 * core as its own heading outside the four patterns. So an ab movement cannot be "placed" the way
 * the other five are. What it CAN do is name the movement the week's core minimum is filled with,
 * which is a real answer the athlete was already giving through a the previous program slot that mapped nowhere.
 *
 * ⚠️ THE ATHLETE-FACING SENTENCE FOR THIS LIVES IN `src/lib/dial-copy.ts` (`CORE_PICK_NOTE`), not
 * here. The string that stood in this spot named the source, the missing slot and "the four movement
 * patterns" — engine vocabulary under a dropdown. This note is for whoever edits the table.

/**
 * ⛔ EXPLOSIVE STEP UP COMES OUT OF THE LEG-ACCESSORY CELL (Michael, 2026-08-26) — AND IS NOT
 * DELETED FROM THE CATALOGUE.
 *
 * ⚠️ PLYO DOES NOT OWN IT, AND I CHECKED BEFORE REMOVING IT. `standing-plan/plyo.ts` carries no
 * step-up of any kind, and the app's own files classify this one as ordinary loaded work:
 * `exercise-role.ts` files it `secondary` / `loaded_accessory`, and `exercise-config.ts` gives it a
 * load basis (squat × 0.4, per hand) with the comment *"'Explosive' is a speed cue, not a load
 * basis."* So dropping it outright would have removed it from the app with nowhere else to live.
 *
 * ⛔ THE REASON IT LEAVES THIS CELL IS NEARER THAN THE PLYO ARGUMENT ANYWAY: `step up` is already in
 * the list, and these two are the same movement differing only by a cue that tells the athlete to
 * move fast — which is the DE slot's instruction, not this one's. A HYP secondary slot asking for
 * controlled work should not offer a near-duplicate whose only distinguishing feature contradicts it.
 */
export const EXPLOSIVE_STEP_UP_IS_THE_WRONG_INTENT = ['explosive step up'];

/**
 * ⛔ THE TABLE. Seven rows, six of them a `category × pattern` that exists in `frames.ts` today —
 * asserted by the gate, because a pick pointing at a cell the frame does not carry is a control
 * that silently does nothing, which is the whole defect this file replaces.
 */
export const VIADA_PICKS: Record<ViadaPickKey, ViadaPickSpec> = {
  /**
   * ⚠️ THE SAME DEFECT LIVES HERE AND IS DELIBERATELY UNFIXED — recorded 2026-08-26 so it is not
   * re-discovered as news.
   *
   * A full-gym athlete is offered **Push Up, Diamond, Decline, Archer, Pike and Handstand Push Ups**
   * in this cell, for the same reason the leg cell offered bodyweight squats: `resolveSlot` ranks by
   * EQUIPMENT FIT and is blind to whether a movement can do the slot's job.
   *
   * ⛔ AND THE BOOK AGREES IT IS WRONG. p220's list for `secondary push_upper` is Larsen press,
   * incline bench, close-grip bench, JM press, seated dumbbell press, Arnold press — six movements,
   * every one of them loaded, and no push-up among them.
   *
   * ⛔ IT STILL DOES NOT CARRY `requiresLoad`, BECAUSE MICHAEL HAS NOT RULED ON IT. Widening the
   * rule on the leg cell's evidence is exactly how one screenshot becomes an app-wide behaviour
   * change nobody asked for. Adding it here is one line the day he says so.
   */
  db_press: {
    key: 'db_press',
    label: 'Press variation',
    slot: { category: 'secondary', pattern: 'push_upper' },
    // ⛔ HIS SIX, IN HIS PRINTED ORDER (p220). The head was four movements of which one — incline
    // bench press — was his; the rest named the cell by its implement. Naming a whole category after
    // a dumbbell is why single-joint work read as belonging here.
    // p220 SECONDARY PUSH UPPER, his six. `dumbbell bench press` was the day-1/day-4 DEFAULT and is
    // NOT in his book anywhere - cut on Michael's call. His nearest are the seated DB press and the
    // Arnold press, both shoulder movements, so the flat dumbbell press simply goes.
    hisList: ['larsen press', 'incline bench press', 'close grip bench press', 'jm press', 'seated db press', 'arnold press'],
    leadWith: ['larsen press', 'incline bench press', 'close grip bench press', 'jm press', 'seated db press', 'arnold press'],
    leadCite: 'Viada p220 — secondary push upper',
    servesChips: ['chest', 'shoulders'],
  },
  iso_push: {
    key: 'iso_push',
    label: 'Push isolation',
    slot: { category: 'focused', pattern: 'push_upper' },
    // ⛔ HIS SIX, IN HIS PRINTED ORDER (p222). `chest fly` and `tricep extensions` were our words for
    // two of his — pec deck and behind-the-neck DB triceps extensions — and skull crushers and the
    // Tate press were absent from the head entirely.
    // p222 FOCUSED PUSH/ARMS, his six. Skull crushers and the Tate press are FOCUSED and belong here
    // rather than in the press slot. `chest fly` and every push-up variant are not his.
    hisList: ['triceps pushdown', 'tate press', 'behind the neck db triceps extension', 'skull crusher', 'pec deck', 'lateral raise'],
    /**
     * THE ONE ADDITION IN THE APP, AND IT FILLS A REAL HOLE. Of his six focused push/arms movements
     * the pec deck is the only chest mover, and it needs the station - so at Michael's equipment
     * baseline a home athlete gets NO chest isolation from his list at all, and the chest dial chip
     * has nothing to point at.
     *
     * IT IS NOT HIS PEC DECK UNDER ANOTHER NAME, and that was considered and refused. The swap rule
     * allows an implement change only when the joint action AND the body position are unchanged; his
     * pec deck is seated upright and a dumbbell fly is supine, so it fails the boundary. The rear
     * delt swap passes it because both versions are seated and chest-supported - nothing about the
     * body changes there. A pec deck also loads the top of the range where a fly loses tension.
     *
     * So it is offered as OURS, marked, rather than smuggled in as his.
     */
    oursList: [{
      name: 'chest fly',
      because: 'His only chest isolation is the pec deck (p222) and it needs the station, so a home '
        + 'gym gets none of his. Ours, not a substitute for his movement.',
    }],
    leadWith: ['triceps pushdown', 'tate press', 'behind the neck db triceps extension', 'skull crusher', 'pec deck', 'lateral raise'],
    leadCite: 'Viada pp222-223 — focused push / arms',
    servesChips: ['chest', 'shoulders', 'arms'],
  },
  // ⛔ TWO PICKS, ONE PER DAY — NOT ONE PICK ASKED TWICE (Michael's ruling, 2026-08-24). The frame
  // puts `focused pull_upper` on day 1 and day 4, and p222-223 files two different things under it:
  // the rear-delt / upper-back work and the arm work. One pick answering both days trained one of
  // them twice and the other never. The default layout has to be balanced with nothing touched —
  // see `LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`.
  //
  // ⚠️ AND THE CHIPS ARE SPLIT WITH THEM. `shoulders` reaches the day-1 pick and `arms` the day-4
  // one, so a chip re-points ONE of the two. If both served both chips, tapping Arms would open
  // curls on both days and hand the balance problem straight back through the dial.
  iso_pull_a: {
    key: 'iso_pull_a',
    label: 'Pull isolation',
    slot: { category: 'focused', pattern: 'pull_upper', frameDay: 1 },
    // ⛔ HIS ONE REAR-DELT MOVEMENT FIRST (p222 — "rear delt machine"), then the catalogue's
    // equipment-reachable versions of the same thing. ⚠️ Face pulls and band pull-aparts are NOT his
    // and stay BELOW his own movement rather than above it.
    // p222 FOCUSED PULL/ARMS. `rear delt fly`, `face pull` and `band pull apart` are NOT his and are
    // cut; his rear-delt movement is the MACHINE. Mapping it to a dumbbell reverse fly was considered
    // and refused - different body position, and `reverse fly` is one of the names this cut removes.
    hisList: ['preacher curl', 'spider curl', 'rear delt machine', 'drag curl', 'pullover machine'],
    leadWith: ['rear delt machine', 'preacher curl', 'spider curl', 'drag curl', 'pullover machine'],
    leadCite: 'Viada pp222-223 — focused pull, rear delt / upper back',
    servesChips: ['shoulders'],
  },
  iso_pull_b: {
    key: 'iso_pull_b',
    label: 'Pull isolation',
    slot: { category: 'focused', pattern: 'pull_upper', frameDay: 4 },
    // ⛔ HIS ARM WORK, IN HIS PRINTED ORDER (p222): preacher curls, spider curls, drag curls,
    // pullover machine. ⚠️ `barbell curl` LED THIS CELL AND IS NOT IN HIS KEY AT ALL — it is what the
    // athlete was being offered first on day 4.
    // p222 FOCUSED PULL/ARMS. `barbell curl` LED THIS CELL and is not in his key; hammer and cable
    // curls are not either.
    hisList: ['preacher curl', 'spider curl', 'rear delt machine', 'drag curl', 'pullover machine'],
    // THE DAY-4 HEAD STARTS ON A DIFFERENT ARM MOVEMENT FROM DAY 1's, so the two can never collide
    // (2026-08-25's balance ruling). Day 1 opens on his rear delt work where it is reachable and
    // falls to the preacher curl where it is not - so day 4 must not also open on the preacher curl,
    // or a kit without an incline bench collapses both pull days onto one movement.
    leadWith: ['drag curl', 'spider curl', 'pullover machine', 'preacher curl'],
    leadCite: 'Viada pp222-223 — focused pull, arms',
    servesChips: ['arms'],
  },
  // ⛔ TWO PICKS, ONE PER LOWER DAY (Michael's ruling, 2026-08-25) — the same shape as the
  // isolation-pull split above, and reached the same way: one `frameDay` field per row plus its own
  // `leadWith` head. `secondary press_lower` falls on day 2 and day 5 and one pick answered both, so
  // the zero-touch week ran the identical single-leg movement twice.
  //
  // ⛔ THE GROUNDING IS THE DAY, NOT THE MUSCLE, AND THAT IS THE HONEST DIFFERENCE FROM THE PULL
  // SPLIT. Both cells are the same `secondary press_lower`; what differs is what they sit under.
  // Day 2 is the ME lower day — the cell follows a competition deadlift and a heavy primary
  // press_lower. Day 5 is the DE lower day — it follows a dynamic squat and a primary hinge, and it
  // ALSO carries `quad_iso` on the same day. So the two slots are the same cell on two very
  // different days, and the default week should not spend both of them on one movement.
  //
  // ⚠️ EVERY OPTION IN THIS CELL IS `quadriceps` — checked against the grid, not assumed. The split
  // therefore buys MOVEMENT VARIETY, not muscle coverage: unlike the pull pair, no muscle was being
  // missed before and none is newly covered now. Recorded so nobody later "fixes" this by reaching
  // for the balance argument that belongs to `iso_pull_a` / `iso_pull_b`.
  //
  // ⚠️ NEITHER SERVES A CHIP, so unlike the pull pair there is no dial split to keep in step.
  //
  // ⛔⛔ "LEG ACCESSORY", NOT "SINGLE-LEG" (Michael, 2026-08-26, off the dropdown's screenshot:
  // *"might be the previous program legacy make it right"*). It was — and it was the WORDING, not the code.
  //
  // ⚠️ TRACED, NOT ASSERTED: `src/lib/assistance-catalog.ts` carries `single_leg_core` as one of
  // THE PREVIOUS PROGRAM'S three assistance categories, display name *"Single-leg / core"*. This file does not
  // import it and never has — the `label` strings are hardcoded here — so it was never a live
  // dependency. The phrase walked across; the wiring did not.
  //
  // ⛔ AND IT MISDESCRIBED THE CELL. p220's own list for `secondary press_lower` is **split squat ·
  // Zercher squat · freestanding barbell calf raises · forward or reverse lunge** — a bilateral
  // squat and a calf raise sit in it. "Single-leg" named a subset of his own list and told the
  // athlete the cell was narrower than it is. "Leg accessory" is true of the whole cell, and it sits
  // beside `quad_iso`'s "Lower isolation" (the single-JOINT cell) without the two colliding.
  //
  // ⚠️ THE LABEL IS THE ONLY THING THAT CHANGED. The cell, the day split, both `leadWith` heads and
  // the two-picks-one-per-day ruling of 2026-08-25 all stand exactly as they were.
  /**
   * DAY 2's HINGE ROW - `1 x DE: Accessory: secondary hinge lower` (p246). Added 2026-08-29 on
   * Michael's ruling; see the superseded note above for what it reverses.
   *
   * IT IS THE SECOND LOWER ROW ON DAY 2, beside `single_leg_a`, and the two answer different cells:
   * this one is his HINGE, that one is the press-lower reading of his ambiguous "accessory lower"
   * line. They cannot collide - no movement in p220's hinge list appears in his press-lower list,
   * and the freestanding barbell calf raise that sits in the press-lower cell is not hinge-shaped.
   * Asserted rather than assumed, after the pull days collided on a shared head.
   */
  hinge_lower: {
    key: 'hinge_lower',
    label: 'Hinge variation',
    slot: { category: 'secondary', pattern: 'hinge_lower', frameDay: 2 },
    // p220 SECONDARY HINGE LOWER, his six, in his printed order.
    hisList: ['romanian deadlift', 'stiff-legged deadlift', 'reverse hyper', 'good morning', 'kb swing', 'sandbag throw'],
    leadWith: ['romanian deadlift', 'stiff-legged deadlift', 'reverse hyper', 'good morning', 'kb swing', 'sandbag throw'],
    leadCite: 'Viada p220 - secondary hinge lower',
    servesChips: [],
  },
  single_leg_a: {
    key: 'single_leg_a',
    label: 'Leg variation',
    slot: { category: 'secondary', pattern: 'press_lower', frameDay: 2 },
    // ⛔ HIS FOUR FIRST (p220): split squat, Zercher squat, freestanding barbell calf raises,
    // forward or reverse lunge. Step-ups and lateral lunges are not his words; they fit his
    // definition and stay available BELOW his own list.
    // p220 SECONDARY PRESS LOWER. The Bulgarian split squat and the walking lunge are kept as HIS,
    // not as extras: p218's Primary definition allows a movement "with or without minor modifications
    // to setup", so elevating the rear foot is a setup change and a walking lunge is his forward lunge
    // performed travelling. The two lunge entries are his two DIRECTIONS, not two variants.
    // Step-ups, goblet squats and lateral lunges are not his and are cut.
    hisList: ['split squat', 'zercher squat', 'freestanding barbell calf raise', 'walking lunge', 'reverse lunge'],
    leadWith: ['split squat', 'zercher squat', 'reverse lunge', 'walking lunge'],
    leadCite: 'Viada p220 — secondary press lower (ME lower day)',
    servesChips: [],
    requiresLoad: true,
    excludes: EXPLOSIVE_STEP_UP_IS_THE_WRONG_INTENT,
  },
  single_leg_b: {
    key: 'single_leg_b',
    label: 'Leg variation',
    slot: { category: 'secondary', pattern: 'press_lower', frameDay: 5 },
    // ⛔ SAME CELL, DIFFERENT HEAD — the day-5 split of 2026-08-25 stands. His forward/reverse lunge
    // leads here; the walking lunge is the catalogue's name for the forward one.
    // p220 SECONDARY PRESS LOWER - same cell, day-5 head. See day 2 for the split-squat reasoning.
    hisList: ['split squat', 'zercher squat', 'freestanding barbell calf raise', 'walking lunge', 'reverse lunge'],
    leadWith: ['walking lunge', 'reverse lunge', 'zercher squat', 'split squat'],
    leadCite: 'Viada p220 — secondary press lower (DE lower day)',
    servesChips: [],
    requiresLoad: true,
    excludes: EXPLOSIVE_STEP_UP_IS_THE_WRONG_INTENT,
  },
  quad_iso: {
    key: 'quad_iso',
    // ⛔ "LOWER ISOLATION", NOT "QUAD ISOLATION" (Michael, 2026-08-25). Leg extension is now gated
    // on `machine` (commercial gym only) — it was untagged, the composer placed it for home
    // athletes, and materialize-plan's week-blind swap turned it into a duplicate of their own
    // single-leg pick on a device-verified block. True single-joint quad work does not exist
    // without a machine, and the cell's own p222-223 members include calves — so the label says
    // what the row can honestly offer everyone. Gym athletes still open on leg extension.
    label: 'Leg isolation',
    slot: { category: 'focused', pattern: 'press_lower' },
    /**
     * ⛔⛔ THE CALF VARIANT MATTERS AND IT WAS THE WRONG ONE. p223's focused list names **seated**
     * calf raises; p220's SECONDARY press lower names **freestanding barbell** calf raises. Two
     * variants, two categories, two pages — so a head reading plain `calf raise` put the secondary
     * movement at the top of the focused cell.
     * ⚠️ Any rule that files every calf variant in one tier contradicts one of the two pages.
     */
    /**
     * ⛔ HIS FOUR FIRST, THEN THE PERFORMABLE FALLBACK. Every one of his focused-quad movements needs
     * a station — leg extension, hip adduction, seated calf raise are all `machine`-gated — so a
     * home athlete's pool contains none of them and the cell would open on whatever the grid happened
     * to rank first. `calf raise` is kept at the TAIL, not the head: a gym athlete still opens on leg
     * extension, a home athlete still opens on something they can do. That split is 2026-08-25's
     * ruling and it survives his ordering.
     */
    // p223 FOCUSED PUSH LOWER/QUADS, his four. Every other calf variant is cut - the plain,
    // single-leg, soleus and tibialis raises are not his, and the FREESTANDING BARBELL one is p220's
    // SECONDARY entry that belongs in the leg-variation cell instead.
    hisList: ['leg extension', 'hip adduction machine', 'weighted knee raise', 'seated calf raise'],
    leadWith: ['leg extension', 'hip adduction machine', 'seated calf raise', 'weighted knee raise'],
    leadCite: 'Viada p223 — focused push lower / quads',
    servesChips: [],
  },
  /**
   * ⛔ p274 DAY 1 — `1 × HYP: braced push`. p221 BRACED PUSH UPPER: *Smith machine press · machine
   * chest press · dip machine/pressdown*.
   * ⚠️ MACHINES OR NOTHING, AND THAT IS A REAL LIMIT ON THIS PICK — see `BRACED_NEEDS_MACHINES`.
   */
  braced_push: {
    key: 'braced_push',
    label: 'Machine press',
    slot: { category: 'braced', pattern: 'push_upper' },
    hisList: ['smith machine press', 'machine chest press', 'dip machine'],
    // ⛔ HIS ORDER, so the zero-touch default is the movement he prints first.
    leadWith: ['smith machine press', 'machine chest press', 'dip machine'],
    leadCite: 'Viada p221 — braced push upper',
    // ⛔ p274 PAIRS NOTHING HERE. The braced push stands alone on day 1; only the arms and the lower
    // braced rows are printed as supersets.
    servesChips: ['chest'],
  },
  /** ⛔ p274 DAY 4 — `1 × HYP: braced pull`. p221 BRACED PULL UPPER: *chest-supported row (high or
   *  low) · lat pulldowns (single or double, any grip) · cable upright row*. */
  braced_pull: {
    key: 'braced_pull',
    label: 'Machine pull',
    slot: { category: 'braced', pattern: 'pull_upper' },
    hisList: ['chest supported row', 'lat pulldown', 'cable upright row'],
    // ⛔ HIS ORDER, so the zero-touch default is the movement he prints first.
    leadWith: ['chest supported row', 'lat pulldown', 'cable upright row'],
    leadCite: 'Viada p221 — braced pull upper',
    servesChips: ['shoulders'],
  },
  /**
   * ⛔⛔ p274 DAYS 2 AND 5 — the first half of `2 × HYP: braced hinge / braced lower push superset`.
   * p221 BRACED HINGE LOWER: *reverse hyperextension (machine) · GHD back extension · ground-based
   * deadlift machine · machine back extension*.
   * ⚠️ DAY-AGNOSTIC. The page prints the identical pairing on both lower days, so one answer covers
   * both — see `ALL_ROUNDER_PICK_KEYS` for why that differs from p246's per-day splits.
   */
  braced_hinge: {
    key: 'braced_hinge',
    label: 'Back extension',
    slot: { category: 'braced', pattern: 'hinge_lower' },
    /**
     * ⛔⛔ p221's FOUR, AND ALL FOUR ARE MACHINES: *reverse hyperextension (MACHINE) · GHD back
     * extension · ground-based deadlift machine · machine back extension.* The list carried his four
     * **plus** `back extension` and `reverse hyper`, which are the non-machine executions — so a
     * barbell athlete met them as though they were his printed movements, unmarked.
     *
     * ⚠️ THIS NARROWING WAS BLOCKED FOR ONE COMMIT AND THE REASON IS WORTH KEEPING: while
     * `reverse hyperextension` was routed on `bench`, cutting the list to his four left a barbell
     * athlete with **exactly one option** — his list was not empty, so the substitution branch never
     * fired and the free-weight versions were removed with nothing marked in their place. Measured,
     * not predicted. **Splitting the machine and bench executions is what unblocked it**; with the
     * machine gated, his list genuinely empties at a home kit and the substitutes come back carrying
     * "- for your gear".
     * ⚠️ THE COMPOSER IS UNAFFECTED — it builds from the grid pool and the frame's muscle, never from
     * this list. Only the dropdown changes.
     */
    hisList: ['reverse hyperextension', 'ghd back extension', 'machine back extension', 'ground-based deadlift machine'],
    leadWith: ['reverse hyperextension', 'ghd back extension', 'machine back extension'],
    /**
     * ⚠️⚠️ THE `excludes: ['reverse hyper']` THAT STOOD HERE IS GONE, AND ITS PREMISE WAS WRONG.
     * It read *"one movement, one option — two `EXERCISE_CONFIG` entries for the same exercise"*, and
     * they are NOT the same exercise: p221's is the machine and the other is the bench execution
     * (torso on the bench, hips at the edge, legs swinging, a dumbbell between the feet — a coached
     * home alternative, resolved from field sources 2026-08-30). **They looked like twins because
     * both carried the same bench route and neither name said which.** Split routes and a name that
     * says "Bench" fix the reading; excluding one would have deleted a real movement.
     */
    leadCite: 'Viada p221 — braced hinge lower',
    // ⛔ THE SUPERSET IS HIS, AND THE SCREEN SAYS SO. Nothing in the app pairs exercises yet
    // (`frames.ts`, DESIGN §5) — this names the pairing the page prints so the two dropdowns read as
    // the one row they came from.
    pairedWith: 'braced_leg',
    superset: 'superset with the leg press',
    servesChips: ['glutes'],
  },
  /**
   * ⛔⛔ p274 DAYS 2 AND 5 — the second half of that superset. p221 BRACED PUSH LOWER: *hack squat ·
   * leg press · lever squat*.
   */
  braced_leg: {
    key: 'braced_leg',
    label: 'Leg press',
    slot: { category: 'braced', pattern: 'press_lower' },
    hisList: ['hack squat', 'leg press', 'lever squat'],
    // ⛔ HIS ORDER, so the zero-touch default is the movement he prints first.
    leadWith: ['leg press', 'hack squat', 'lever squat'],
    leadCite: 'Viada p221 — braced push lower',
    pairedWith: 'braced_hinge',
    superset: 'superset with the back extension',
    servesChips: ['glutes'],
  },
  /**
   * ⛔ p274 DAY 2 — `1 × HYP: focused hamstring`. p223 FOCUSED HINGE LOWER / HAMSTRINGS:
   * *machine/Smith machine hip thrust · hamstring curls (seated or prone) · cable or machine
   * kickbacks*.
   * ⚠️⚠️ THE NOTE THAT STOOD HERE WAS WRONG, and it is replaced rather than deleted because the
   * mistake is instructive. It read: *"the hip thrust is not in this cell's pool — the catalogue
   * files `machine hip thrust` under BRACED hinge, so it reaches the athlete through `braced_hinge`
   * and is not repeated here."* **It reaches them through neither.** `braced_hinge`'s muscle is
   * hamstrings too, so the hip thrust was filtered out of that cell as well; the movement reached
   * them from nowhere. The exclusion was real, my stated reason for it was invented.
   *
   * ⛔ AND IT IS IN NOW (Michael, 2026-08-30). p223 names it FIRST in this row — *"machine/Smith
   * machine hip thrust · hamstring curls (seated or prone) · cable or machine kickbacks"* — under a
   * heading that says hamstrings, while its prime mover is glutes. His standing precedent applies:
   * where the page's own list and a tag pull apart, the list wins. The exception is stated on the
   * FRAME (`StrengthSlot.alsoAdmits`) so the composer honours it too.
   * ⚠️ HIS TWO SPELLINGS ARE THE MACHINE ONES; the barbell hip thrust is the same movement at a kit
   * with no machine and reaches the athlete as a marked substitute.
   */
  ham_iso: {
    key: 'ham_iso',
    label: 'Hamstring isolation',
    slot: { category: 'focused', pattern: 'hinge_lower' },
    hisList: ['machine hip thrust', 'smith machine hip thrust', 'leg curl', 'hamstring curl', 'seated leg curl', 'lying leg curl', 'cable kickback'],
    /**
     * ⛔ ONE MOVEMENT, THREE SPELLINGS — merged on evidence, 2026-08-30. `nordic curl`,
     * `nordic curls` and `nordic hamstring curl` carry **identical `EXERCISE_CONFIG` entries and the
     * identical gear route**, and in the field they are one exercise under three names; the plural is
     * a plural. Two of them were surfacing side by side in this row's substitutes, so a dropdown of
     * two options held one real choice.
     * ⚠️ THIS IS THE OPPOSITE CALL FROM THE REVERSE HYPERS, and deliberately so. Those looked like
     * twins and were two executions on different apparatus — checked before splitting. These looked
     * like twins and are twins — checked before merging. **The check is the same either way; the
     * answer is not.** `nordic hamstring curl` survives as the most specific name.
     */
    excludes: ['nordic curl', 'nordic curls'],
    /**
     * ⛔ THE HAMSTRING MOVEMENTS LEAD, and the hip thrust is an option rather than the opening
     * answer. p223 prints it first in the row, which is why it is admitted at all — but p274's cell
     * says `1 × HYP: focused hamstring`, and the zero-touch default is what most athletes will
     * actually train. **His list governs membership; the row's own muscle governs the default.**
     * ⚠️ ON A KIT WITH NO CURL MACHINE THE DEFAULT IS THE HIP THRUST ANYWAY, because none of the
     * curls are reachable there. Ordering cannot fix that — it is the consequence of admitting a
     * glutes movement to a hamstring row, it is flagged to Michael, and it is his call.
     */
    leadWith: ['leg curl', 'hamstring curl', 'seated leg curl', 'lying leg curl', 'machine hip thrust', 'cable kickback'],
    leadCite: 'Viada p223 — focused hamstrings',
    servesChips: ['glutes'],
  },
  core: {
    key: 'core',
    /**
     * ⚠️ "Add core" AND `optIn` WERE BUILT AND BACKED OUT, 2026-08-29 — recorded so the next attempt
     * starts from the finding rather than from the idea.
     *
     * ⛔ MICHAEL ASKED FOR IT and the reasoning holds: `strength_5k` names no core slot in either
     * column (p246), so nothing in the frame is waiting to be filled and the athlete is ADDING work.
     *
     * ⛔⛔ WHAT STOPPED IT: the core pick reaches the week through `fillMuscleFloor`, which fills a
     * muscle only when it is BELOW its floor. `weighted knee raises` are p223's focused-quad movement
     * and their prime mover is `core`, so a week carrying them already satisfies core — the floor
     * stays quiet and an explicitly chosen V-up is silently dropped. The default was hiding it.
     * ⚠️ Raising the core `target` to force the placement was tried and DOUBLE-PLACED the row.
     *
     * ⛔ THE REAL FIX IS THAT AN ADDED ROW SHOULD NOT GO THROUGH THE FLOOR AT ALL — the floor is a
     * backstop for a week that is missing something, and a row the athlete asked for is not that.
     * That is a change to how the pick reaches the week, not a flag on this spec.
     */
    label: 'Core',
    slot: null,
    // ⛔ HIS OWN CORE LIST, p223, IN HIS ORDER: hanging leg raises, crunches, V-ups, dynamic plank
    // variants, ab wheel rollouts. The catalogue's spellings for each.
    // p223 CORE, his five. "Dynamic plank variants" is HIS OWN catch-all, so the MOVING planks are
    // kept inside it - shoulder taps, hip dips, stir-the-pot, TRX fallouts - and the STATIC holds are
    // not, because a plank hold is not a dynamic variant. Side bends, sit-ups, dead bugs, bird dogs,
    // flutter kicks, scissor kicks and toe touches are cut, along with the four `core work`
    // placeholder entries that were never movements.
    hisList: ['hanging leg raise', 'crunch', 'v up', 'plank with shoulder tap', 'side plank with hip dip', 'stir the pot', 'trx fallout', 'ab wheel rollout', 'ab rollout'],
    leadWith: ['hanging leg raise', 'crunch', 'v up', 'plank with shoulder tap', 'ab rollout'],
    leadCite: 'Viada p223 — core',
    servesChips: ['core'],
  },
};

/**
 * ⛔ WHICH PICK OWNS A GIVEN FRAME SLOT — the composer's half of the table, so a slot and a pick can
 * never be matched by two different rules. Returns `null` for every slot the athlete does not own:
 * ME, DE, and any HYP cell no pick names.
 */
export function pickKeyForSlot(
  category: ViadaCategory,
  pattern: ViadaPattern | null,
  /**
   * ⛔ THE FRAME DAY THIS CELL IS BEING FILLED ON. A day-scoped pick (`slot.frameDay`) only answers
   * its own day; a day-agnostic one answers any. ⚠️ OMITTING IT IS NOT NEUTRAL — with no day, a
   * day-scoped cell falls through to the day-agnostic pick and finds none, so the slot silently
   * loses its pick. Every caller that HAS a day must pass it.
   */
  frameDay?: number,
  /**
   * ⛔⛔⛔ WHICH FRAME'S TABLE (D-457, 2026-08-30). p246 and p274 own different pick vocabularies —
   * p246 is built on `secondary` accessory cells and p274 has none — so a cell must be matched
   * against the membership of the frame being built. **Without this a p274 braced cell would be
   * offered p246's picks and find none, which is the silence this whole pass closed.**
   * ⚠️ Absent keeps `strength_5k`, which is every caller that predates the second table.
   */
  frame: FrameId = 'strength_5k',
): ViadaPickKey | null {
  let fallback: ViadaPickKey | null = null;
  for (const key of (PICK_KEYS_BY_FRAME[frame] ?? VIADA_PICK_KEYS)) {
    const slot = VIADA_PICKS[key].slot;
    if (!slot || slot.category !== category || slot.pattern !== pattern) continue;
    if (slot.frameDay == null) {
      // Day-agnostic: one movement across every day the cell falls on. Kept as the fallback so a
      // day-scoped sibling always wins on its own day.
      if (fallback == null) fallback = key;
      continue;
    }
    if (frameDay != null && slot.frameDay === frameDay) return key;
  }
  return fallback;
}

/**
 * ⛔ WHICH REAL DAYS THIS PICK LANDS ON — read off the frame, at offset zero.
 *
 * ⚠️ OFFSET ZERO IS NOT A GUESS, IT IS `chooseDayMap`'S OWN ANSWER WHEN NOTHING IS PINNED: the
 * scoring loop keeps the FIRST offset that reaches a score, so an athlete with no pinned days gets
 * offset 0. The wizard asks for the accessories BEFORE it asks for the calendar, so at pick time
 * nothing is pinned and these are the days the week will actually have. ⚠️ An athlete who later
 * pins a long-run day rotates the whole week, and these tags move with it — see the day map's own
 * header: a rotation moves every day by the same amount.
 */
export function frameDaysForPick(
  key: ViadaPickKey,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): number[] {
  const spec = VIADA_PICKS[key];
  if (!spec.slot) return [];
  const days = FRAMES[frame]?.columns[column] ?? [];
  const out: number[] = [];
  for (const day of days) {
    // ⛔ A DAY-SCOPED PICK CLAIMS ONE DAY, NOT EVERY DAY ITS CELL FALLS ON. Without this the two
    // isolation-pull picks would both tag days 1 and 4 and the screen would print the same pair
    // twice for two controls that do different things.
    if (spec.slot.frameDay != null && day.day !== spec.slot.frameDay) continue;
    const hit = day.strength.some((s) =>
      s.intent === 'HYP' && s.role === 'accessory'
      && s.category === spec.slot!.category && s.pattern === spec.slot!.pattern);
    if (hit) out.push(day.day);
  }
  /**
   * A DE CELL RESOLVES ITS DAY FROM THE SPEC, and only when the HYP search finds nothing
   * (2026-08-29). Day 2's hinge row is `DE accessory secondary hinge_lower`, so the search above
   * returns no day for it and it sorted to the end of the screen instead of beside the other day-2
   * row.
   *
   * WIDENING THE SEARCH ITSELF WAS TRIED AND REVERTED: it also matched day 1's DE secondary push
   * cell, which moved `db_press` from day 4 to day 1 and changed the day tag on a row nobody had
   * asked to move. This fallback touches only picks the search cannot place.
   *
   * IT IS NOT THE TRAP THE ORDER TEST NAMES. That trap is sorting EVERY pick on `spec.slot.frameDay`,
   * which leaves the three picks without one unsorted at the front. Here the frame is still the
   * authority and the spec answers only where the frame's HYP cells are silent.
   */
  if (out.length === 0 && spec.slot?.frameDay != null) return [spec.slot.frameDay];
  return out;
}

/**
 * ⛔ THE SAME ANSWER AS A WEEKDAY. It DELEGATES rather than walking the frame a second time, so
 * "which days does this pick fall on" has one owner and the two answers cannot drift apart.
 */
export function daysForPick(
  key: ViadaPickKey,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
  offset = 0,
): Weekday[] {
  return frameDaysForPick(key, frame, column).map((d) => weekdayForFrameDay(d, offset));
}

/**
 * ⛔⛔ THE PICKS IN THE ORDER THE WEEK RUNS THEM (Michael, 2026-08-26: *"1-2 4 and 5 and put them in
 * order"*).
 *
 * `VIADA_PICK_KEYS` is TABLE order — it groups the two isolation-pull rows together and the two leg
 * rows together, which interleaves the days on screen: day 4, day 1, day 1, day 4, day 2, day 5,
 * day 5. An athlete reading down the list cannot see their week in it.
 *
 * ⚠️ SORTED ON THE **RESOLVED** DAY, NOT ON `spec.slot.frameDay`. Only four of the seven declare a
 * `frameDay`; `db_press`, `iso_push` and `quad_iso` have none and take whatever day their cell falls
 * on, which the frame answers. Sorting on the spec field would leave those three unsorted at the
 * front — the exact trap, and it is why this reads the frame instead.
 *
 * ⚠️ `core` HAS NO SLOT AND NO DAY, AND SORTS LAST. It fills the week's core minimum rather than
 * landing on a day, so there is nothing to place it among the others by.
 */
export function pickKeysInDayOrder(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): ViadaPickKey[] {
  const dayOf = (k: ViadaPickKey): number => {
    const days = frameDaysForPick(k, frame, column);
    return days.length > 0 ? Math.min(...days) : Number.MAX_SAFE_INTEGER;
  };
  // ⛔ THE FRAME'S OWN TABLE — see `PICK_KEYS_BY_FRAME`. This read `VIADA_PICK_KEYS`, which is
  // p246's membership, and that is how p246's nine controls came to render over a p274 week.
  return [...(PICK_KEYS_BY_FRAME[frame] ?? VIADA_PICK_KEYS)]
    .map((k, i) => ({ k, i, d: dayOf(k) }))
    // ⚠️ THE TABLE ORDER IS THE TIEBREAK, so two rows on one day keep the order the table gives them
    // rather than being reordered by an accident of the sort.
    .sort((a, b) => (a.d === b.d ? a.i - b.i : a.d - b.d))
    .map(({ k }) => k);
}

/**
 * ⛔⛔⛔ WHICH PICKS THIS FRAME CAN ACTUALLY HONOUR — and it is the COMPOSER'S OWN RULE, read here
 * rather than restated (2026-08-30).
 *
 * ⛔ THE ONE LINE THAT DECIDES IT lives in `compose.ts`: a pick is consulted only for a cell that is
 * `slot.intent === 'HYP' && slot.role === 'accessory'`. So a pick reaches a frame exactly when that
 * frame carries an HYP accessory cell of its category and pattern — on its own day where the pick is
 * day-scoped. **Anything else is a control the athlete answers and the plan discards without a word.**
 *
 * ⛔⛔ THE DEFECT IT CLOSES, COMPOSED AND MEASURED. The Build focus screen called `pickKeysInDayOrder()`
 * and `dayLabelForPick()` with no frame, so both defaulted to `strength_5k` and p246's nine controls
 * rendered over a p274 week. **Five of them were dead** — every option swept, not one:
 *   Hinge variation · Leg variation (day 2) · Leg variation (day 5) · Press variation · Core.
 * The cause is one fact about the two pages: **p246 is built on `secondary` accessory cells and p274
 * has none.** p274's accessory work is `braced` and `focused`, so four picks aimed at cells the frame
 * does not contain; Core is an ADDED row and p274's 22 slots leave the set cap no room for it.
 *
 * ⚠️ NO FALLBACK HERE, DELIBERATELY — this is not `frameDaysForPick`. That one returns
 * `spec.slot.frameDay` when the search finds nothing, which is honest on p246's DE hinge cell and
 * MANUFACTURES a day on p274, where no such cell exists at all. Reachability must not inherit a
 * fallback whose job is to label.
 *
 * ⚠️⚠️ AND `strength_5k` IS EXEMPT BY RULING, NOT BY DERIVATION — Michael, 2026-08-30: *"strength_5k
 * renders exactly as today."* **The derivation would drop Hinge variation from that frame too, and it
 * would be RIGHT to**: p246's day-2 hinge cell is `DE accessory secondary hinge_lower`, the composer
 * only consults picks on HYP cells, and all four of that pick's options were measured not to land on
 * either frame. That is a real, pre-existing defect on the shipped path and it is reported
 * separately. It is not fixed by hiding the control, and it is not this change's to fix.
 */
export function pickReachesFrame(
  key: ViadaPickKey,
  frame: FrameId,
  column: ColumnKind = 'standard',
): boolean {
  const spec = VIADA_PICKS[key];
  if (!spec.slot) return false;
  const days = FRAMES[frame]?.columns[column] ?? [];
  return days.some((day) => {
    if (spec.slot!.frameDay != null && day.day !== spec.slot!.frameDay) return false;
    return day.strength.some((sl) =>
      sl.intent === 'HYP' && sl.role === 'accessory'
      && sl.category === spec.slot!.category && sl.pattern === spec.slot!.pattern);
  });
}

/**
 * ⛔ THE MUSCLE THIS FRAME NAMES FOR A PICK'S CELL, or null where the page names only a category —
 * **or where the page's word and his own list for that cell disagree.** The arms superset is the
 * second case and it is deliberate: Michael, 2026-08-30, *"follow the book"* — p274 says `(arms)`
 * and p223's lists for those categories include pec deck, lateral raises, rear delt machine and the
 * pullover machine, so `iso_push`, `iso_pull_a` and `iso_pull_b` narrow to nothing and keep his
 * printed lists whole. See `StrengthSlot.muscle` for the ruling in full.
 * One reader for the fact the frame states, so the dropdown and the built week narrow identically —
 * see `StrengthSlot.muscle`.
 * ⚠️ THE FIRST MATCHING CELL'S ANSWER. Every occurrence of a pick's cell within one frame carries
 * the same wording on p274 (both `focused quadriceps` rows say quadriceps), so there is nothing to
 * reconcile; a frame that ever printed two different muscles for one cell would need a per-day
 * answer and this is where that would go.
 */
export function frameAdmitsForPick(
  key: ViadaPickKey,
  frame: FrameId,
  column: ColumnKind = 'standard',
): string[] {
  const spec = VIADA_PICKS[key];
  if (!spec.slot) return [];
  for (const day of FRAMES[frame]?.columns[column] ?? []) {
    if (spec.slot.frameDay != null && day.day !== spec.slot.frameDay) continue;
    for (const sl of day.strength) {
      if (sl.intent !== 'HYP' || sl.role !== 'accessory') continue;
      if (sl.category !== spec.slot.category || sl.pattern !== spec.slot.pattern) continue;
      if (sl.alsoAdmits) return sl.alsoAdmits;
    }
  }
  return [];
}

export function frameMuscleForPick(
  key: ViadaPickKey,
  frame: FrameId,
  column: ColumnKind = 'standard',
): string | null {
  const spec = VIADA_PICKS[key];
  if (!spec.slot) return null;
  for (const day of FRAMES[frame]?.columns[column] ?? []) {
    if (spec.slot.frameDay != null && day.day !== spec.slot.frameDay) continue;
    for (const sl of day.strength) {
      if (sl.intent !== 'HYP' || sl.role !== 'accessory') continue;
      if (sl.category !== spec.slot.category || sl.pattern !== spec.slot.pattern) continue;
      if (sl.muscle) return String(sl.muscle);
    }
  }
  return null;
}

/**
 * ⛔ THE PICK LIST A SCREEN MAY DRAW, for a frame that is named rather than assumed. Day order, then
 * reachability — so a control that appears is one the built week will honour.
 * ⚠️ THE FRAME IS REQUIRED. This function exists because its predecessors defaulted to `strength_5k`
 * and a screen that forgot to pass one rendered the wrong programme in silence. See D-457.
 */
export function picksForFrame(
  frame: FrameId,
  /**
   * ⛔⛔ THE ATHLETE'S KIT, AND IT DECIDES WHETHER A CELL IS A CHOICE AT ALL — added with p274's own
   * table (2026-08-30). **p274's accessory work is BRACED, and braced means machines** (p221: Smith
   * machine press, hack squat, leg press, reverse hyperextension machine). Standard Focus's own
   * entry gate asks for a barbell, plates, a rack and a bench — it does not ask for machines — so an
   * athlete can legitimately arrive with none of his braced movements reachable.
   *
   * ⛔ MEASURED, at barbell + dumbbells + bench: `braced push_upper` resolves to dumbbell and
   * push-up variants, `braced pull_upper` to barbell and dumbbell rows, `braced press_lower` to
   * split squats and lunges. **Every one of them is a substitute the grid found, and NOT ONE is a
   * movement he printed for that cell** — the strict cut (Michael, 2026-08-29: *"I don't want
   * extraneous exercises that aren't in his book"*) removes them all and the cell empties.
   *
   * ⛔ SO THE CONTROL IS NOT DRAWN, AND THE COMPOSER STILL FILLS THE CELL. The week is unchanged —
   * the substitution ladder puts a real movement there — what the athlete does not get is a SAY over
   * a cell where his list is out of reach. An empty dropdown, or one holding a movement he never
   * printed, would be worse than no control.
   * ⚠️ AND A ONE-OPTION PICK IS NOT A CHOICE EITHER. Two is the floor for drawing a control.
   * ⚠️ ABSENT EQUIPMENT SKIPS THE TEST rather than hiding everything: an athlete nobody asked is the
   * conservative arm, the same rule `pickOptions` follows for bodyweight gating.
   */
  equipment?: string[] | null,
  column: ColumnKind = 'standard',
): ViadaPickKey[] {
  const ordered = pickKeysInDayOrder(frame, column);
  // ⚠️ SEE `pickReachesFrame` — the exemption is Michael's ruling and its cost is recorded there.
  const reachable = frame === 'strength_5k'
    ? ordered
    : ordered.filter((k) => pickReachesFrame(k, frame, column));
  if (equipment == null) return reachable;
  /**
   * ⚠️⚠️ ONE OPTION STILL DRAWS THE CONTROL — changed 2026-08-30 with Michael's substitution
   * amendment, and the earlier rule is recorded because it was right for the design it belonged to.
   * It was `>= 2`, on the reasoning that a single-option dropdown is not a choice. **That held while
   * an unreachable cell simply emptied.** With same-muscle substitution the empty case is rare and
   * the single-option case is common and INFORMATIVE — after the muscle narrowing a commercial gym
   * leaves exactly one honest movement in the quadriceps and hamstring rows, and hiding those
   * controls would tell the athlete less about their own week, not more. Michael: *"Picker shows the
   * substitute options too, so the athlete keeps their say."*
   * ⛔ EMPTY IS STILL NOT DRAWN — there is nothing to show and nothing to answer.
   */
  return reachable.filter((k) => VIADA_PICKS[k].slot == null
    || pickOptions(k, equipment, frameMuscleForPick(k, frame, column),
      frameAdmitsForPick(k, frame, column)).length >= 1);
}

/**
 * ⛔ WHAT p274 ASKS FOR THAT A BARBELL-ONLY GYM CANNOT GIVE — stated as a finding rather than
 * improvised around (Michael, 2026-08-30: *"if the book genuinely blocks something, state it as a
 * finding with the page, don't improvise"*).
 *
 * It is not the book that blocks it, it is the kit. p274 spends four of its fourteen accessory cells
 * on BRACED work and p221 defines braced as machine work — Smith machine press, machine chest press,
 * dip machine · chest-supported row, lat pulldown, cable upright row · hack squat, leg press, lever
 * squat · reverse hyperextension, GHD, machine back extension. An athlete with a barbell, plates,
 * a rack and a bench — which is all Standard Focus's entry gate asks for — reaches few of them.
 *
 * ⚠️⚠️ AND THE TEST IS PER CELL, NOT ALL-OR-NOTHING — corrected 2026-08-30, off Michael's own live
 * screen. This note first read as though braced work were reachable or not as a block, and his
 * screenshot disproved it in one glance: **Machine pull was drawn while Machine press and Leg press
 * were not.** That is correct behaviour — p221's braced PULL list (chest-supported row, lat
 * pulldown, cable upright row) is reachable in a garage gym with a pulldown station, while its
 * braced PUSH list (Smith machine, machine chest press, dip machine) and braced LOWER list (hack
 * squat, leg press, lever squat) are not. **Nothing was inconsistent; this sentence was.**
 *
 * ⛔ AND THE CELL IS NO LONGER LEFT WITHOUT A CONTROL WHERE A SUBSTITUTE EXISTS (Michael's
 * amendment, same day): the muscle is the law, and a kit that blocks his printed movement is
 * offered a free-weight movement for the same muscle, marked `ours`. What survives of the original
 * finding is narrower and still true: **where neither his list nor a same-muscle substitute is
 * reachable, the athlete gets no say over that cell.**
 * ⚠️ p275 offers a rotation out of braced work for the ASYMMETRICAL slots only (*"you can rotate the
 * braced asymmetrical movements with secondary asymmetrical"*) — those are the DE and SKILL cells,
 * which take no pick. **He offers no such rotation for the HYP braced superset**, so there is no
 * sourced substitute to offer and inventing one would be ours.
 */
export const BRACED_NEEDS_MACHINES =
  'p274 spends four accessory cells on braced work and p221 defines braced as machine work. The '
  + 'test is PER CELL, not per athlete: a kit reaches his movements for one braced cell and not '
  + 'another. A picker is drawn where two of his movements for that cell are reachable, or where a '
  + 'same-muscle substitute is; otherwise the composer fills the cell and the athlete has no say.';

/**
 * ⛔⛔ HIS DAY NUMBER, NOT A WEEKDAY AND NOT A RENUMBER (Michael, 2026-08-26).
 *
 * The wizard asks for the accessories BEFORE it asks for the calendar, so the athlete has not chosen
 * days yet and the plan places them later. Printing "monday · thursday" there stated something the
 * screen does not know. ⛔ `daysForPick` above still exists and is still right for a surface that
 * HAS the calendar; this is the day-agnostic one.
 *
 * ⚠️ AND THE NUMBERS ARE HIS, OFF p246: the lifting days sit at 1, 2, 4 and 5 of a seven-day week,
 * with day 3 and the weekend endurance-only. Renumbering them 1 through 4 would be OURS and would
 * break the correspondence with his own table — the thing this whole file exists to preserve.
 */
export function dayLabelForPick(
  key: ViadaPickKey,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): string | null {
  const days = frameDaysForPick(key, frame, column);
  if (days.length === 0) return null;
  return days.map((d) => `day ${d}`).join(' · ');
}

// ── WHAT EACH PICK OFFERS ────────────────────────────────────────────────────────────────────────

export type PickOption = {
  /** ⛔ THE STORED NAME — the catalogue's own spelling, so `EXERCISE_CONFIG` resolves it exactly. */
  name: string;
  /** What the athlete reads. */
  display: string;
  /** The muscle a set on it counts to. `null` when the catalogue cannot attribute it. */
  muscle: MuscleGroup | null;
  /**
   * ⛔ A STAND-IN FOR HIS MOVEMENT, because the athlete's kit reaches none of the ones he printed for
   * this cell — see the substitution in `pickOptions`. **Not the same fact as `ours` below**, which
   * is a movement offered as an ADDITION to his list; this one replaces a movement that is his.
   * ⚠️ THE MUSCLE IS ALWAYS HIS EVEN WHEN THE MOVEMENT IS NOT — that is the rule the substitute is
   * chosen by, and it is why a substitution is honest rather than a widening.
   */
  substituted?: true;
  /**
   * OURS, NOT HIS - present only on a movement Viada never printed that Michael has deliberately
   * added. Absent on everything else, so a surface can mark it without a second lookup.
   */
  ours?: true;
};

/**
 * `dumbbell bench press` → `Dumbbell Bench Press`. The catalogue stores lowercase keys and the
 * picker is the first surface to print them at an athlete.
 *
 * ⚠️ THE ACRONYMS ARE LISTED BECAUSE TITLE CASE GETS THEM WRONG. `db side bend` title-cases to
 * `Db Side Bend`, which reads as a typo rather than as a dumbbell.
 */
const LABEL_ACRONYMS: Record<string, string> = {
  db: 'DB', kb: 'KB', ghd: 'GHD', rdl: 'RDL', trx: 'TRX', ytw: 'YTW', y: 'Y', t: 'T', w: 'W',
  v: 'V', l: 'L', ohp: 'OHP',
};

/**
 * WHAT A PICKER ROW READS, INCLUDING THE MARK ON AN ADDITION.
 *
 * The `oursList` exception was allowed on one condition: the movement must not be able to pass as
 * his. `pickOptions` was already returning `ours: true` and NOTHING RENDERED IT - the flag existed
 * in the data and the athlete could not see it, which is the condition unmet.
 *
 * ONE HELPER, THREE RENDER SITES, AND ANY FUTURE ADDITION IS MARKED WITHOUT TOUCHING THE UI. That is
 * the point of it - the mechanism, not the one movement.
 *
 * THE WORDING IS "added" AND IT IS DELIBERATELY FLAT. It states that the movement was put there
 * rather than found in the source. No emoji, no apology, no explanation of a sourcing policy under a
 * dropdown - an athlete choosing an exercise does not need the provenance argument, only the fact.
 */
export function pickOptionLabel(o: PickOption): string {
  /**
   * ⛔ THREE STATES, NOT TWO (2026-08-30). "- added" is Michael's own word for a movement offered
   * ALONGSIDE his (the dumbbell fly ruling, 2026-08-29) and it was being printed on equipment
   * SUBSTITUTES too — *"Bulgarian Split Squat - added"* on his own screen, which says the opposite
   * of what happened: nothing was added, his movement was out of reach and this took its place.
   * ⚠️ THE SUBSTITUTE'S MARK NAMES THE REASON, because the reason is the useful part — the athlete
   * can see it is about their kit rather than about the programme, and the muscle is unchanged.
   */
  if (o.substituted === true) return `${o.display} - for your gear`;
  return o.ours === true ? `${o.display} - added` : o.display;
}

export function movementLabel(name: string): string {
  return String(name ?? '')
    .split(/\s+/)
    .map((w) => {
      if (w.length === 0) return w;
      const bare = w.replace(/[^a-z]/gi, '').toLowerCase();
      if (LABEL_ACRONYMS[bare]) return w.replace(/[a-z]+/i, LABEL_ACRONYMS[bare]);
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(' ')
    .trim();
}

/**
 * ⛔ THE PICKER'S OWN "SAME MOVEMENT" TEST, ONE STEP WIDER THAN `canonicalize` — and the extra step
 * is spelling, not meaning.
 *
 * `canonicalize` is the app's owner of the question and it is right for the logger, where two
 * catalogue keys with different ratios must stay apart. A DROPDOWN has a different failure: offering
 * `Chest Fly` above `Chest Flyes`, or `DB Shoulder Press` above `Dumbbell Shoulder Press`, asks the
 * athlete to choose between two spellings of one lift and reads as a broken list.
 *
 * ⚠️ IT IS USED FOR THE OFFERED LIST ONLY. What gets STORED is the catalogue's own name, and every
 * comparison downstream is still `canonicalize`.
 */
function pickDedupeKey(name: string): string {
  return canonicalize(name)
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/fly(e|es|ies)?\b/g, 'fly')
    .replace(/(\w)s\b/g, '$1');
}

function dedupeByCanonical(movements: GridMovement[]): GridMovement[] {
  const seen = new Set<string>();
  const out: GridMovement[] = [];
  for (const m of movements) {
    const key = pickDedupeKey(m.name);
    if (!key || key === 'unknown' || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * ⛔ THE OPTIONS FOR ONE PICK — through `resolveSlot`, so the equipment gate, the substitution ladder
 * and the ranking are the composer's, not a second copy. The only thing added here is his own list
 * for the cell, floated to the top (see {@link ViadaPickSpec.leadWith}).
 *
 * ⚠️ DEDUPED CANONICALLY. `EXERCISE_CONFIG` holds `dumbbell bench press` and `db bench press` as
 * separate keys; offering both is the picker asking the athlete to choose between two spellings of
 * one lift. `canonicalize` is the app's one owner of "are these the same movement".
 */
export function pickOptions(
  key: ViadaPickKey,
  equipment: string[] | null | undefined,
  /**
   * ⛔⛔⛔ THE MUSCLE THE PAGE NAMES FOR THIS CELL — see `StrengthSlot.muscle` (2026-08-30).
   * **The muscle is the law; the movement may leave his printed list when the kit demands it**
   * (Michael, 2026-08-30). p274 asks for `focused quadriceps`; p223's list for that CATEGORY spans
   * quads, glutes, calves and hip flexors, so without this the quadriceps row offered — and built —
   * a seated calf raise on any kit without a leg-extension machine.
   * ⚠️ ON THE OPTION'S OWN PRIME MOVER, which the catalogue already carries. No second table.
   * ⚠️ ABSENT LEAVES THE CELL EXACTLY AS IT WAS, so p246 — whose rows name categories rather than
   * muscles — is unchanged on every one of its cells.
   */
  muscle?: string | null,
  /**
   * ⛔ THE MOVEMENTS THIS ROW ADMITS DESPITE THE MUSCLE — see `StrengthSlot.alsoAdmits` and
   * `frameAdmitsForPick`. The composer applies the same list, so the dropdown and the built week
   * cannot disagree about whether p223's hip thrust belongs in his hamstring row.
   */
  alsoAdmits?: string[] | null,
): PickOption[] {
  const spec = VIADA_PICKS[key];
  const resolved = resolveSlot({
    category: spec.slot?.category ?? 'core',
    pattern: spec.slot?.pattern ?? null,
    intent: 'HYP',
    equipment: equipment ?? null,
  });
  /**
   * ⛔⛔ TWO FILTERS THE GRID CANNOT APPLY, AND ONE REASON BEHIND BOTH (2026-08-26).
   *
   * `resolveSlot` ranks by EQUIPMENT FIT. It answers "can this athlete reach it" and "is it the
   * right pattern", and it is blind to whether the movement can do the job the slot exists FOR. So a
   * secondary slot on the heavy lower day offered Bodyweight Squat to someone who squats 200 lb, and
   * offered Explosive Step Up next to the Step Up it is a speed-cued copy of.
   *
   * ⚠️ BOTH ARE DECLARED PER PICK, NEVER GLOBAL. The same blindness exists in every cell; whether it
   * MATTERS is a per-cell judgement, and widening either rule on this cell's evidence is how one
   * screenshot becomes an app-wide behaviour change nobody ruled on.
   */
  /**
   * THE STRICT CUT (Michael, 2026-08-29): "I don't want extraneous exercises that aren't in his
   * book." The pool is intersected with the cell's own printed list, so a slot offers his movements
   * and nothing else.
   *
   * IT SITS AFTER `resolveSlot`, NOT INSTEAD OF IT. The equipment gate and the substitution ladder
   * still run first, so an athlete is never offered a movement they cannot perform - this only
   * removes movements HE never printed.
   *
   * IT CAN EMPTY A CELL, and that is why the equipment baseline is load-bearing. At barbell +
   * dumbbells + bench every cell keeps two or more. Below that floor four cells go to zero, and the
   * baseline rules that case out rather than solving it.
   */
  const his = new Set((spec.hisList ?? []).map((n) => canonicalize(n)));
  const ours = new Set((spec.oursList ?? []).map((o) => canonicalize(o.name)));
  const excluded = new Set((spec.excludes ?? []).map((n) => canonicalize(n)));
  /**
   * ⛔ ONLY FOR AN ATHLETE WHO OWNS SOMETHING TO LOAD WITH. A bodyweight athlete's whole catalogue is
   * bodyweight; gating them would empty the cell, and `resolveSlot`'s own contract is that it never
   * returns nothing. ⚠️ An athlete nobody asked about equipment is untouched — `ownsLoadingImplement`
   * is false on absent, which is the conservative arm and the app's existing §0h rule.
   */
  const dropBodyweight = spec.requiresLoad === true && ownsLoadingImplement(equipment);
  const pool = dedupeByCanonical(resolved.options).filter((m) => {
    if (excluded.has(canonicalize(m.name))) return false;
    // HIS LIST ONLY. An empty `hisList` would offer nothing, so a spec without one is a bug rather
    // than an opt-out - every pick carries one.
    if (his.size > 0 && !his.has(canonicalize(m.name)) && !ours.has(canonicalize(m.name))) return false;
    return !(dropBodyweight && isBodyweightLoad(m.name));
  });
  const leadKeys = spec.leadWith.map((n) => canonicalize(n));
  const rank = (m: GridMovement): number => {
    const i = leadKeys.indexOf(canonicalize(m.name));
    return i === -1 ? leadKeys.length : i;
  };
  /**
   * ⛔⛔⛔ THE MUSCLE NARROWING, AND ITS EQUIPMENT SUBSTITUTION (Michael, 2026-08-30).
   *
   * ⛔ HIS MOVEMENTS FIRST. Where the page names a muscle, the cell offers the movements from HIS
   * printed list whose prime mover is that muscle — leg extension for `focused quadriceps`, and not
   * the calves and hip flexors that share p223's category row.
   *
   * ⛔⛔ AND WHEN THE KIT REACHES NONE OF THEM, IT SUBSTITUTES RATHER THAN EMPTYING. Michael amended
   * the strict ruling for exactly this: *"don't leave equipment-blocked cells empty — substitute
   * known barbell/dumbbell versions that hit the SAME muscle… the movement may leave the printed
   * list when kit demands it, labeled OURS."* So a quadriceps row on a barbell-and-bench kit offers
   * split squats and lunges — quadriceps, free weights, **marked `ours`** — never the calf raise
   * that shares its category.
   * ⚠️ THE SUBSTITUTES COME FROM THE CELL'S OWN GRID POOL, not from a new list: same pattern, same
   * category, same equipment gate. Widening the MUSCLE would be the one thing this must never do.
   * ⚠️ AND THEY ARE MARKED, because the strict cut means nothing if an addition is invisible — the
   * same rule `oursList` already follows.
   */
  const primaryOf = (name: string) => musclesWorkedBy(name)?.primary ?? null;
  const admitted = new Set((alsoAdmits ?? []).map((n) => canonicalize(n)));
  /**
   * ⛔⛔ AN ADMITTED MOVEMENT HAS TO BE FETCHED, NOT JUST PERMITTED — measured, 2026-08-30. The
   * first cut filtered on `alsoAdmits` and the hip thrust still did not appear, because **it is not
   * in this cell's pool at all**: the catalogue files every hip thrust under BRACED hinge and p274's
   * cell is FOCUSED hinge. A filter can only remove.
   * ⛔ SO THE SAME PATTERN IS ASKED ACROSS HIS OTHER CATEGORIES and only the NAMED movements are
   * taken — never a muscle, never a category. p223 named these on this row; nothing else comes with
   * them. ⚠️ The pattern never widens, so an admitted movement is always the frame's own plane.
   */
  const admittedPool: GridMovement[] = admitted.size === 0 ? [] : (() => {
    const found: GridMovement[] = [];
    for (const cat of ['secondary', 'braced', 'focused'] as ViadaCategory[]) {
      if (cat === spec.slot?.category) continue;
      for (const m of resolveSlot({
        category: cat,
        pattern: spec.slot?.pattern ?? null,
        intent: 'HYP',
        equipment: equipment ?? null,
      }).options) {
        if (admitted.has(canonicalize(m.name))) found.push(m);
      }
    }
    return found;
  })();
  // ⚠️ THE MUSCLE, OR A MOVEMENT THE PAGE NAMES ON THIS ROW. Never a second muscle — see
  // `StrengthSlot.alsoAdmits` for why the exception is a named list.
  const onMuscle = (name: string) => primaryOf(name) === muscle || admitted.has(canonicalize(name));
  const narrowed = muscle
    ? (() => {
      const his = dedupeByCanonical([...pool, ...admittedPool]).filter((m) => onMuscle(m.name));
      if (his.length > 0) return { list: his, substituted: false };
      /**
       * ⛔⛔ THE SUBSTITUTE POOL WIDENS BY CATEGORY, NEVER BY MUSCLE OR PATTERN (Michael's amendment,
       * 2026-08-30: *"substitute known barbell/dumbbell versions that hit the SAME muscle… split
       * squat class"*).
       *
       * ⛔ THE CELL'S OWN POOL IS NOT ENOUGH, and the measurement is why: `focused press_lower` at a
       * barbell-and-bench kit holds a seated calf raise and a weighted knee raise and **no quadriceps
       * movement at all**, so a same-cell substitution left the row empty. The split squats and
       * lunges that would serve it are filed one category over (p220 secondary press lower, p221
       * braced push lower).
       *
       * ⛔ SO IT ASKS THE SAME PATTERN ACROSS HIS OTHER CATEGORIES and keeps only the same muscle.
       * The plane of movement is the frame's and does not move; the category does, which is the
       * looser of the two and the one p275 already treats as rotatable — *"you can rotate the braced
       * asymmetrical movements with secondary asymmetrical."*
       * ⚠️ EVERY RESULT IS MARKED `ours`. It is a movement he did not print for this cell, offered
       * because the kit reaches none that he did.
       */
      /**
       * ⛔ NO `primary`. Those are the competition lifts the frame puts in its ME slots — offering
       * Back Squat as an accessory beside the day that already opens on it is the engine losing its
       * place, not a substitution. The three noncompetition categories are the whole pool.
       */
      /**
       * ⛔⛔ THE CELL'S OWN CATEGORY FIRST, AND ONLY THEN THE OTHERS — measured, 2026-08-30. Widening
       * all three at once offered **Romanian Deadlift, Sumo Deadlift and Paused Deadlift** as
       * substitutes for p274's braced hinge row, and the default landed on the RDL. Every one of
       * them is the right pattern and the right muscle and the wrong ROW: a braced hinge is a
       * supported, anchored back-extension movement, a free-standing hinge is a different training
       * effect, **and day 2 already opens on a deadlift.**
       * ⛔ SO THE WIDENING IS STEPPED. His movements, then the same category, then the other
       * categories — each step the smallest one that can still answer. `back extension`, `glute ham
       * raise` and the bench reverse hyper all live in the cell's own category, so the braced hinge
       * row never reaches past it.
       * ⚠️ NO `primary`. Those are the competition lifts the ME slots already carry.
       */
      const ownCategory = spec.slot?.category;
      const stepped: ViadaCategory[][] = [
        ownCategory ? [ownCategory] : [],
        (['secondary', 'braced', 'focused'] as ViadaCategory[]).filter((c) => c !== ownCategory),
      ];
      for (const step of stepped) {
        if (step.length === 0) continue;
        const pooled: GridMovement[] = [];
        for (const cat of step) {
          pooled.push(...resolveSlot({
            category: cat,
            pattern: spec.slot?.pattern ?? null,
            intent: 'HYP',
            equipment: equipment ?? null,
          }).options);
        }
        const subs = dedupeByCanonical([...pooled, ...admittedPool])
          .filter((m) => !excluded.has(canonicalize(m.name)))
          .filter((m) => onMuscle(m.name));
        if (subs.length > 0) return { list: subs, substituted: true };
      }
      return { list: [], substituted: true };
    })()
    : { list: pool, substituted: false };

  return narrowed.list
    .map((m, i) => ({ m, i, r: rank(m) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map(({ m }) => ({
      name: m.name,
      // THE NAME THEY WILL READ, which is his unless the free-weight route is the one their kit
      // resolved on. `name` above stays canonical - it is what the picker stores and what every
      // matcher reads.
      // The execution name is already written for reading; only the canonical name needs the
      // title-caser. Passing it through `movementLabel` produced "(dumbbell Across Knees)".
      display: (() => {
        const exec = executionName(m.name, equipment);
        return exec === m.name ? movementLabel(m.name) : exec;
      })(),
      muscle: musclesWorkedBy(m.name)?.primary ?? null,
      // MARKED AT THE SURFACE, not just in the table. An addition the athlete cannot tell from his
      // own movements is an addition the strict cut did not really make.
      // ⛔⛔ TWO DIFFERENT FACTS, TWO DIFFERENT MARKS (2026-08-30, off Michael's screen). `ours` means
      // *"a movement he never printed, offered as an ADDITION"* — his own word for the dumbbell fly
      // ruling. An equipment substitution is not an addition: his movement for this cell is out of
      // reach and this stands in for it. Labelling it "- added" told the athlete the opposite of
      // what happened, and **"Bulgarian Split Squat - added" is what he saw.**
      ...(ours.has(canonicalize(m.name)) ? { ours: true as const } : {}),
      /**
       * ⚠️ AND AN ADMITTED MOVEMENT HE DID NOT PRINT IS A SUBSTITUTE TOO, per movement rather than
       * per list. p223 prints the MACHINE and Smith hip thrusts; the plain and barbell versions are
       * the same movement at a kit without one, so at a commercial gym `machine hip thrust` reads as
       * his and `barbell hip thrust` reads as the stand-in. **Marking the whole list would have
       * called his own printed movement a substitute.**
       */
      ...((narrowed.substituted || (admitted.has(canonicalize(m.name)) && !his.has(canonicalize(m.name))))
        ? { substituted: true as const } : {}),
    }));
}

/**
 * ⛔ WHAT A PICK OPENS ON. The cell's own first option, re-pointed when a Dial chip names a
 * muscle this pick can reach — the chip's first job of three (see {@link DIAL_IS_OURS}).
 *
 * ⚠️ NEVER EMPTY. `resolveSlot` never returns an empty option list, so this always answers, and a
 * zero-touch Continue therefore always builds a complete week.
 */
export function defaultPickFor(
  key: ViadaPickKey,
  equipment: string[] | null | undefined,
  dial: DialChip[] = [],
  /**
   * ⛔⛔ THE FRAME, SO THE SEED NARROWS ON THE SAME MUSCLE THE DROPDOWN DOES (2026-08-30). Without
   * it the pre-filled answer was chosen from the unnarrowed list — **which is exactly what put
   * `seated calf raise` in the quadriceps row on Michael's screen**, since the seed is what the
   * screen opens on and what a zero-touch Continue sends.
   * ⚠️ Absent keeps `strength_5k`, whose cells name no muscle, so its seeds are unchanged.
   */
  frame: FrameId = 'strength_5k',
): string {
  // ⛔ AN OPT-IN ROW HAS NO DEFAULT. Empty is the answer, and a caller must treat it as "nothing
  // added" rather than as a missing value to fill in.
  if (VIADA_PICKS[key].optIn === true) return '';
  const opts = pickOptions(key, equipment, frameMuscleForPick(key, frame), frameAdmitsForPick(key, frame));
  if (opts.length === 0) return '';
  const wanted = musclesForChips(dial.filter((c) => VIADA_PICKS[key].servesChips.includes(c)));
  if (wanted.size > 0) {
    const hit = opts.find((o) => o.muscle != null && wanted.has(o.muscle));
    if (hit) return hit.name;
  }
  return opts[0].name;
}

/** The whole pre-filled set — what the screen opens on and what a zero-touch Continue sends. */
export function defaultViadaPicks(
  equipment: string[] | null | undefined,
  dial: DialChip[] = [],
  /**
   * ⛔⛔ THE FRAME'S OWN KEYS (D-457, 2026-08-30). Seeded from `VIADA_PICK_KEYS` this wrote p246's
   * nine answers onto every block — so a Standard Focus plan row carried picks for four cells its
   * frame does not have and none for the five it does. **Inert in the composer, which only consults
   * the frame's own table, but it is an answer on the row the athlete never gave for a control they
   * never saw.** ⚠️ Absent keeps p246's, which is every caller that predates the second table.
   */
  frame: FrameId = 'strength_5k',
): Partial<Record<ViadaPickKey, string>> {
  const out: Partial<Record<ViadaPickKey, string>> = {};
  for (const key of (PICK_KEYS_BY_FRAME[frame] ?? VIADA_PICK_KEYS)) {
    out[key] = defaultPickFor(key, equipment, dial, frame);
  }
  return out;
}

// ── THE DIAL ──────────────────────────────────────────────────────────────────────────

/**
 * ⛔ "DIAL", AND THE WORD IS THE DECISION (Michael, 2026-08-24).
 *
 * ⚠️ IT WAS BUILT AS "AESTHETICS" AND RENAMED BEFORE THE FIRST COMMIT. "Aesthetics" was the working
 * title only — it never persisted a row, so the storage keys say `dial` and there is no legacy
 * spelling to read. If you find "aesthetic" anywhere on this path, it is a miss, not a compat shim.
 * (The `Upper Aesthetics` PROTOCOL in `strength-system/protocols/` is a different, older thing and
 * keeps its name.)
 *
 * It replaces "focus" as the CHIP-ROW NAME on this path because what these chips do is not what a
 * focus chip did: a focus chip re-pointed which movement filled a category, a chip here moves
 * VOLUME. ⚠️ The supporting line still reads "Dial in the areas you want to focus on." — Michael's
 * wording, verbatim, ruled after the rename. The collision the rename was worried about is with the
 * endurance screens' Speed/VO2 focus CONTROL, and a verb in a supporting line is not that control.
 *
 * ⛔ NO QUADS AND NO BACK CHIP. The frame trains both hard already — two lower days with a
 * competition squat pattern, and pull slots on both upper days — so a chip for either would be a
 * control that buys nothing measurable.
 */
export type DialChip = 'chest' | 'shoulders' | 'arms' | 'glutes' | 'core';

export const DIAL_CHIPS: DialChip[] = ['chest', 'shoulders', 'arms', 'glutes', 'core'];

export const DIAL_LABEL: Record<DialChip, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  arms: 'Arms',
  glutes: 'Glutes',
  core: 'Core',
};

/**
 * ⛔ TWO, AND THE CAP IS ARITHMETIC RATHER THAN TASTE.
 *
 * p086's session ceiling is the binding constraint: 6 to 8 work sets a session leaves the next day
 * in another discipline productive, 14 costs up to three days of it. This frame's upper days already
 * carry seven to nine counted sets before anything is added. Two muscles running toward the solid
 * band is roughly what the week's remaining room holds; three is how the ceiling gets crossed.
 */
export const DIAL_CAP = 2;

export function isDialChip(v: unknown): v is DialChip {
  return typeof v === 'string' && (DIAL_CHIPS as string[]).includes(v);
}

/** Chip → the muscles it names, in the accessory-dosing vocabulary. */
export const DIAL_MUSCLES: Record<DialChip, MuscleGroup[]> = {
  chest: ['chest'],
  shoulders: ['deltoids'],
  arms: ['biceps', 'triceps'],
  glutes: ['glutes'],
  core: ['core'],
};

/**
 * ⛔ THE WORD A ROW USES TO SAY WHOSE IT IS. Singular, because it sits under one movement — *"Your
 * glute focus."*, the same shape as the floor's existing *"Your pick for core."*
 */
export const DIAL_OWNERSHIP: Record<DialChip, string> = {
  chest: 'chest',
  shoulders: 'shoulder',
  arms: 'arm',
  glutes: 'glute',
  core: 'core',
};

/** Which chip claims this muscle. `null` for the muscles no chip names — quads, lats, hamstrings. */
export function chipForMuscle(muscle: MuscleGroup): DialChip | null {
  for (const chip of DIAL_CHIPS) {
    if (DIAL_MUSCLES[chip].includes(muscle)) return chip;
  }
  return null;
}

export function musclesForChips(chips: (DialChip | string)[] | null | undefined): Set<MuscleGroup> {
  const out = new Set<MuscleGroup>();
  for (const c of chips ?? []) {
    if (!isDialChip(c)) continue;
    for (const m of DIAL_MUSCLES[c]) out.add(m);
  }
  return out;
}

/**
 * ⛔ WHAT IS HIS AND WHAT IS OURS, IN ONE PLACE, BECAUSE THE FEATURE ITSELF IS OURS.
 *
 * HIS: the 3-to-4 set band a hypertrophy slot sits in (p218); the 8-to-12 solid / 18-to-20
 * overreaching weekly band and the 6-to-8 / 14-plus session ceiling (p086); the 3 x 8-10 at 1-2 RIR
 * accessory dose (p086); the core movement list (p223).
 *
 * OURS: **using those bands as a steerable dial at all.** Viada defines no focus feature — his bands
 * describe where volume sits, not a control an athlete turns. Also ours: the glutes as a muscle
 * group of their own (`GLUTES_IS_OURS`), and the floor this dial is built on top of.
 */
export const DIAL_IS_OURS =
  'The source gives the set bands and the session ceiling; it defines no focus feature. Turning those '
  + 'bands into a control you set is ours, and every number it moves between is his.';

/**
 * ⛔ THE THREE THINGS A TAPPED CHIP DOES. Written once, here, so the screen and the composer describe
 * the same mechanism.
 *
 *   1. the picks that can reach the muscle open on a movement that trains it;
 *   2. that muscle's HYP slots go to 4 sets — the top of his 3-4 band (p218);
 *   3. extra 3 x 8-10 rows, by feel, where the week has room — the muscle floor's machinery aimed
 *      at a target instead of at zero.
 */
export const DIAL_MECHANISM_IS = [
  'The picks that can reach it open on a movement that trains it.',
  'Its hypertrophy slots go to four sets instead of three.',
  'Extra sets of 8 to 10, by feel, go on the lifting days with the most room.',
];

/**
 * ⛔ THE WEEKLY SET TARGET A CHIP AIMS AT, AND THE PULL-BACK — and the pull-back is the honest half.
 *
 * The target is {@link WEEKLY_SETS_SOLID}'s floor: eight sets, the bottom of his solid range. It is
 * never his overreaching figure, and `fillMuscleFloor` clamps it to the top of the solid range
 * regardless of what is asked for.
 *
 * ⛔ AND IT IS TAKEN BACK WHERE THE WEEK IS ALREADY EXPENSIVE, which is OURS:
 *   · **the taper/deload column** gets no extra rows at all. That column exists to remove load; a
 *     dial that kept adding through it would be the athlete's two decisions cancelling out.
 *   · **the advanced running tier** — an athlete whose own history earns the extra easy sessions
 *     (`advancedTierSessions`) — aims at TWO accessory slots for the muscle rather than at the solid
 *     band. p086's whole point about the session ceiling is the cost to the OTHER modality, and that
 *     athlete is running six sessions a week.
 *
 * ⚠️ THE PULL-BACK MOVES THE TARGET, NOT THE SESSION CEILING, AND THAT WAS MEASURED RATHER THAN
 * CHOSEN. Holding the added rows to his six-to-eight "recovers" line instead made the chip do
 * NOTHING for that athlete: this frame's lifting days already carry eight to eleven counted sets
 * before anything is added, so no session could take a three-set row and stay under it. A control
 * that silently buys zero is the exact failure the whole screen replaces. **Two slots** is the
 * floor's own unit spent twice — three sets is the low end of his HYP band (p218) and the floor is
 * already labelled ours — so the reduced target introduces no new scalar.
 */
export const DIAL_PULLBACK_IS_OURS =
  'Which weeks the extra sets come out of is ours. The source says a six-to-eight-set session leaves '
  + 'the next day in another discipline productive and a fourteen-set one costs up to three days of '
  + 'it; holding the added work to the first line on a heavy running week, and to none at all on a '
  + 'deload, is our reading of that, not something he wrote.';

/**
 * ⛔ THE SCREEN'S PULL-BACK LINE IS GONE FROM HERE, AND ITS REASONING IS WHY (2026-08-24, second
 * copy round). It read: *"On the deload weeks the extra sets come out, and if your logged running
 * already earns the extra easy session the plan holds this to two extra slots."*
 *
 * ⚠️ THE SECOND HALF NAMED A BRANCH THE WIZARD CANNOT KNOW IT IS ON. The advanced tier gates on
 * DEMONSTRATED running, which the server reads out of logged history (`demonstratedRunVolume`); the
 * wizard has only what the athlete typed, and typing thirty miles is not the same fact. So the
 * screen now says "Light weeks carry less" (`dialChipLine` in `src/lib/dial-copy.ts`) and the BUILT
 * PLAN states which way it actually went — `dialDose().pullBack`, in the indicative, on the block
 * itself, where the branch is known. That split is the honest one.
 */

export type DialDose = {
  /** Sets per muscle per week to aim at, or `null` when no extra rows are added this week. */
  targetSets: number | null;
  /**
   * ⛔ WHY, in the athlete's words. Empty when nothing was taken back.
   *
   * ⚠️ THERE IS NO `sessionCeiling` HERE AND THERE WAS FOR ONE BUILD. The pull-back moves the
   * TARGET and nothing else: the per-session line is p086's fourteen, it is `fillMuscleFloor`'s
   * already, and a second owner of it that always held the same value was scaffolding.
   */
  pullBack: string | null;
};

export function dialDose(opts: {
  column: ColumnKind;
  /** ⛔ FROM `advancedTierSessions` — demonstrated running, never intended. 0 = base tier. */
  advancedTierSessions?: number | null;
}): DialDose {
  if (opts.column === 'taper') {
    return {
      targetSets: null,
      pullBack: 'On the deload weeks the extra sets come out. The fourth set on your own slots stays.',
    };
  }
  const advanced = Math.max(0, Math.round(Number(opts.advancedTierSessions) || 0));
  if (advanced > 0) {
    return {
      targetSets: muscleFloorSets() * 2,
      pullBack: 'Your running already earns an extra easy session, so this stops at two extra slots '
        + 'for the muscle rather than filling the week out.',
    };
  }
  return { targetSets: WEEKLY_SETS_SOLID.lo, pullBack: null };
}

/**
 * ⛔ `dialSentence` IS GONE FROM HERE (2026-08-24, second copy round). It assembled a paragraph out
 * of three clauses — which days carry the slots, how the extra rows are dosed, and the pull-back —
 * and with two chips tapped the screen printed two paragraphs. Michael cut it to ONE LINE PER CHIP.
 *
 * ⛔ ITS REPLACEMENT IS `dialChipLine` IN `src/lib/dial-copy.ts`, and it is CLIENT-SIDE ON PURPOSE:
 * no edge function ever read this string, so a copy tweak was changing a file four functions
 * bundle. The table stays shared because the composer needs it; the prose does not.
 *
 * ⚠️ `dialDose` STAYS HERE — it is the ENGINE's answer (target sets, and the indicative pull-back
 * sentence the built block prints), read by `compose.ts`. Do not follow the copy out of this file.
 */

/**
 * ⛔ WHY THERE IS NO DAY TAG ON AN DIAL ROW, AND IT IS A DECISION RATHER THAN AN OMISSION.
 *
 * The handoff asked for one — *"glute focus · tuesday"* — and two projections of it were built and
 * both were WRONG in the ordinary two-chip case. The composer places an added row on the lightest
 * session at the moment it places it, AFTER the muscle floor has run; how many floor rows there are
 * and which days take them depends on the athlete's picks, their equipment and the chips themselves.
 * Reproducing that outside the composer means running the composer.
 *
 * ⛔ AND RUNNING IT IN THE WIZARD IS ALREADY RULED OUT IN THIS APP: `NonRaceBuilder.tsx`'s own
 * `hardRoleOf` records the ruling in as many words — *"importing an edge-function constant into the
 * wizard would pull the whole composer into the client bundle"*.
 *
 * ⚠️ SO THE SCREEN NAMES THE RULE INSTEAD OF THE DAY: *"on the lifting days with the most room"*,
 * which is true of every week the composer can build. The day itself is on the plan, one screen
 * later, where it is the composer's own answer rather than a guess about it. ⛔ Do not re-add a
 * predicted day without moving the composer — a tag that is right four weeks out of five is worse
 * than no tag, because nobody can tell which week they are in.
 */
export const DIAL_ROW_DAY_IS_THE_COMPOSERS =
  'Which lifting days these land on is worked out when the plan is built.';

/**
 * ⛔ DOES THIS CHIP REACH A SLOT THE FRAME ALREADY HAS.
 *
 * ⚠️ IT IS WHAT SPLITS THE FIVE CHIPS INTO TWO KINDS, AND THE SCREEN SHOWS THEM DIFFERENTLY.
 * Chest, Shoulders and Arms all land on cells this week already carries: the pick opens on a
 * movement that trains them and the slot goes to four sets, which is visible in the picks above.
 * **Glutes and Core reach nothing** — no cell in `strength_5k` offers a glute- or core-prime
 * movement, which is why the old focus chips for them could never fire at all. For those two the
 * extra rows are not a bonus, they ARE the mechanism, so they get a picker of their own.
 */
export function chipHasFrameSlot(chip: DialChip): boolean {
  return VIADA_PICK_KEYS.some((k) => VIADA_PICKS[k].slot != null && VIADA_PICKS[k].servesChips.includes(chip));
}

/** The storage key for one extra row — `<chip>:<n>`. One owner, so the screen and the wire agree. */
export function dialRowKey(chip: DialChip, index: number): string {
  return `${chip}:${index}`;
}

/**
 * ⛔ THE EXTRA ROWS THE ATHLETE CAN STILL NAME. A chip that reaches no frame slot — Glutes, Core —
 * buys nothing the picks above can express, so the movement it adds gets a picker of its own rather
 * than being chosen silently. Same candidate list `fillMuscleFloor` searches, so a name chosen here
 * is one the floor can actually use.
 */
export function dialRowOptions(
  chip: DialChip,
  equipment: string[] | null | undefined,
): PickOption[] {
  const out: PickOption[] = [];
  const seen = new Set<string>();
  for (const muscle of DIAL_MUSCLES[chip]) {
    for (const m of movementsForMuscle(muscle, equipment ?? null)) {
      const key = canonicalize(m.name);
      if (!key || key === 'unknown' || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: m.name, display: movementLabel(m.name), muscle });
    }
  }

  // ⛔ A STATIC HOLD CANNOT CARRY THIS ROW'S PRESCRIPTION, SO IT IS NOT OFFERED FOR IT (2026-08-24,
  // Michael, from a device screenshot). Every row this picker feeds is dosed 3 x 8-10 by feel, and
  // the core pool's own ranking leads with plank, side plank, copenhagen plank and two entries
  // literally named "core work" — so the control opened on a movement that cannot express its own
  // prescription. `isRepPrescribable` reads `exercise-role.ts`, which has answered this since the
  // strength language spec; nothing new is being classified here.
  //
  // ⚠️ FALLS BACK TO THE UNFILTERED POOL RATHER THAN OFFERING NOTHING. No equipment case reaches it
  // today; it exists so a future catalogue edit degrades to a bad option instead of an empty select.
  const repBased = out.filter((o) => isRepPrescribable(o.name));
  const pool = repBased.length > 0 ? repBased : out;

  // ⛔ HIS OWN LIST LEADS, IN HIS ORDER — the same `leadWith` device the seven picks use, and for the
  // same reason: the grid ranks by equipment fit, which is right and is blind to what the row is FOR.
  const lead = DIAL_ROW_LEAD[chip] ?? [];
  const leadKeys = lead.map((n) => canonicalize(n));
  const rank = (o: PickOption): number => {
    const i = leadKeys.indexOf(canonicalize(o.name));
    return i === -1 ? leadKeys.length : i;
  };
  return pool
    .map((o, i) => ({ o, i, r: rank(o) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map(({ o }) => o);
}

/**
 * ⛔ WHAT AN ADDED ROW OPENS ON, IN THE SOURCE'S OWN ORDER — an ordering hint, never a filter.
 *
 * ⛔ CORE IS p223 VERBATIM: hanging leg raises, crunches, V-ups, dynamic plank variants, ab wheel
 * rollouts. **Hanging Leg Raise leads because Michael ruled it** (2026-08-24) — rep-based,
 * progressive, and first on the source's own list. ⚠️ "Dynamic plank variants" is the only entry of
 * his that could resolve to a hold, and `isRepPrescribable` already keeps the static ones out; the
 * shoulder-tap variant survives because it is counted in reps.
 *
 * ⛔ GLUTES IS OURS, like the muscle group itself (`GLUTES_IS_OURS`) — he names no glute list. The
 * order is the ordinary loaded-first one the grid would give anyway; it is written down so the
 * default is stable rather than a side effect of catalogue insertion order.
 */
const DIAL_ROW_LEAD: Partial<Record<DialChip, string[]>> = {
  core: ['hanging leg raise', 'crunch', 'v up', 'plank with shoulder tap', 'ab rollout'],
  glutes: ['hip thrust', 'glute bridge', 'cable pull through', 'hip abduction'],
};

// ── THE PERSISTED SHAPE ──────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE STANDING PLAN'S OWN CORNER OF `goals.training_prefs.assistance_picks` (2026-08-24).
 *
 * ⚠️ IT SITS BESIDE `by_day`, IT DOES NOT REPLACE IT. Get Stronger's nine per-day keys are still the
 * shape that path reads and every existing goal carries them; a migration would strand those for a
 * screen they never see. The two paths write two blocks in one envelope, and each reads its own —
 * which is also why the composer knows which screen a goal came from without being told.
 */
export type ViadaAccessoryPrefs = {
  version: 1;
  /**
   * ⚠️ PARTIAL SINCE 2026-08-30 (D-457). It was a total record because one frame's table was the only
   * table; with a second, a block carries answers for ITS frame's cells and nothing for the other's.
   * A total type would have forced every screen to invent answers for cells its week does not have.
   */
  picks: Partial<Record<ViadaPickKey, string>>;
  dial: DialChip[];
  /**
   * The named movement for each extra row a chip adds, keyed `<chip>:<n>`. Absent = the engine
   * chooses, which is what an athlete who never opened the row gets.
   */
  dial_rows: Record<string, string>;
};

/** ⛔ READ ANY STORED SHAPE, RETURN THE CURRENT ONE. Never throws; a bad key falls back per slot. */
/**
 * ⛔⛔⛔ IT TAKES THE FRAME NOW, AND WITHOUT IT THIS FUNCTION SILENTLY REPLACED ONE PROGRAMME'S
 * ANSWERS WITH ANOTHER'S — found on Michael's own live plan row, 2026-08-31.
 *
 * ⛔ WHAT IT DID. The loop read `VIADA_PICK_KEYS` — **p246's nine cells, hardcoded** — whatever
 * programme the athlete was building. On an All Rounder every key the screen wrote (`ham_iso`,
 * `braced_hinge`, `braced_push`, `braced_leg`, `braced_pull`) was never visited, so `stored` came
 * back empty for all nine of the OTHER table's keys and each one fell to `defaultPickFor`. **The
 * function returned a complete, plausible set of answers to questions the athlete was never asked,
 * and discarded every answer they gave.** His plan row holds `core`, `db_press`, `hinge_lower`,
 * `single_leg_a`, `single_leg_b` on an `all_rounder` plan, and no `ham_iso` at all — he had changed
 * that row to Barbell Hip Thrust and the build gave him a nordic curl.
 *
 * ⛔⛔ AND THE VALIDATION HAD THE SAME HOLE, INDEPENDENTLY. `pickOptions(key, equipment)` omitted the
 * cell's MUSCLE and its ADMITTED movements, and measured at his kit that call returns an **empty
 * list** for `ham_iso` — so even once the key is visited, every stored value fails validation and
 * falls back. Two faults, either one sufficient to lose the pick, on the same three lines.
 *
 * ⚠️ THE FRAME IS OPTIONAL AND DEFAULTS TO `strength_5k`, which is what every caller written before
 * a second programme existed meant — so nothing that does not pass it changes behaviour.
 * ⚠️ THIS IS THE §7 SHAPE AGAIN: one programme's key list indexing another's answers. It is the
 * seventh time, and it is the first time it reached a real athlete's built plan.
 */
export function normalizeViadaPrefs(
  raw: unknown,
  equipment?: string[] | null,
  frame: FrameId = 'strength_5k',
): ViadaAccessoryPrefs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const dial = (Array.isArray(obj.dial) ? obj.dial : [])
    .filter(isDialChip)
    .slice(0, DIAL_CAP);
  const picksRaw = obj.picks && typeof obj.picks === 'object'
    ? obj.picks as Record<string, unknown>
    : {};
  const picks = {} as Record<ViadaPickKey, string>;
  // ⛔ THE FRAME'S OWN CELLS — see this function's note. It was `VIADA_PICK_KEYS`, unconditionally.
  for (const key of (PICK_KEYS_BY_FRAME[frame] ?? VIADA_PICK_KEYS)) {
    const stored = String(picksRaw[key] ?? '').trim();
    /**
     * ⚠️ VALIDATED AGAINST THE PICK'S OWN POOL, not merely non-empty. A stale name from an older
     * catalogue would otherwise reach a plan row and resolve to nothing — D-322's disease. The
     * fallback is this pick's default, which is a movement rather than a hole.
     * ⛔ AND THE POOL IS THE ONE THE SCREEN DREW — narrowed by the cell's muscle, widened by the
     * movements the source admits into it. Asked with two arguments this returns an empty list for
     * p274's hamstring cell at a home kit, so every answer to that row failed and was overwritten.
     */
    const ok = stored !== ''
      && pickOptions(key, equipment ?? null, frameMuscleForPick(key, frame), frameAdmitsForPick(key, frame))
        .some((o) => canonicalize(o.name) === canonicalize(stored));
    picks[key] = ok
      ? stored
      : defaultPickFor(key, equipment ?? null, dial, frame);
  }
  const rowsRaw = obj.dial_rows && typeof obj.dial_rows === 'object'
    ? obj.dial_rows as Record<string, unknown>
    : {};
  const dial_rows: Record<string, string> = {};
  for (const [k, v] of Object.entries(rowsRaw)) {
    const name = String(v ?? '').trim();
    if (!name) continue;
    // ⛔ THE CORE CHIP HAS NO ROW OF ITS OWN, AND A STORED ONE IS DROPPED (2026-08-24). The "Core
    // movement" pick is the athlete's one core control; a second core name here is how the built
    // week ended up carrying a movement nobody chose. ⚠️ Dropped on READ rather than migrated —
    // nothing has persisted a `viada` block yet, so there is no stored row to preserve, and this
    // exists so a block written by an older bundle cannot resurrect the defect.
    if (k.startsWith('core')) continue;
    dial_rows[k] = name;
  }
  return { version: 1, picks, dial, dial_rows };
}

/** Every movement the athlete named, flattened — the composer's existing `accessoryPicks` pipe. */
export function flattenViadaPicks(prefs: ViadaAccessoryPrefs | null | undefined): string[] {
  if (!prefs) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...Object.values(prefs.picks), ...Object.values(prefs.dial_rows)]) {
    const key = canonicalize(String(name ?? '').trim());
    if (!key || key === 'unknown' || seen.has(key)) continue;
    seen.add(key);
    out.push(String(name).trim());
  }
  return out;
}
