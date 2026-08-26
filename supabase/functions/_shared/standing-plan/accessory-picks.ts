// ============================================================================
// THE ACCESSORY PICKS — the seven things this frame actually leaves open, and the Dial.
//
// Decided by Michael 2026-08-24 (D-450 in `docs/DECISIONS-LOG-3.md` — the handoff spec it was built from is deleted, per the spec lifecycle).
//
// ⛔ WHY THIS FILE EXISTS AT ALL. The picker the Standing Plan was borrowing is WENDLER'S taxonomy —
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
  | 'quad_iso'
  | 'core';

export const VIADA_PICK_KEYS: ViadaPickKey[] = [
  'db_press', 'iso_push', 'iso_pull_a', 'iso_pull_b', 'single_leg_a', 'single_leg_b', 'quad_iso', 'core',
];

/**
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
 * which is a real answer the athlete was already giving through a Wendler slot that mapped nowhere.
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
  db_press: {
    key: 'db_press',
    label: 'Dumbbell press',
    slot: { category: 'secondary', pattern: 'push_upper' },
    leadWith: ['dumbbell bench press', 'dumbbell incline press', 'incline bench press', 'dumbbell shoulder press'],
    leadCite: 'Viada p220 — secondary push upper',
    servesChips: ['chest', 'shoulders'],
  },
  iso_push: {
    key: 'iso_push',
    label: 'Isolation push',
    slot: { category: 'focused', pattern: 'push_upper' },
    leadWith: ['chest fly', 'lateral raise', 'tricep pushdown', 'tricep extensions'],
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
    label: 'Isolation pull',
    slot: { category: 'focused', pattern: 'pull_upper', frameDay: 1 },
    leadWith: ['rear delt fly', 'face pull', 'reverse fly', 'band pull apart'],
    leadCite: 'Viada pp222-223 — focused pull, rear delt / upper back',
    servesChips: ['shoulders'],
  },
  iso_pull_b: {
    key: 'iso_pull_b',
    label: 'Isolation pull',
    slot: { category: 'focused', pattern: 'pull_upper', frameDay: 4 },
    leadWith: ['barbell curl', 'dumbbell curls', 'hammer curls', 'preacher curl'],
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
  // *"might be wendler legacy make it right"*). It was — and it was the WORDING, not the code.
  //
  // ⚠️ TRACED, NOT ASSERTED: `src/lib/assistance-catalog.ts` carries `single_leg_core` as one of
  // WENDLER'S three assistance categories, display name *"Single-leg / core"*. This file does not
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
  single_leg_a: {
    key: 'single_leg_a',
    label: 'Leg accessory',
    slot: { category: 'secondary', pattern: 'press_lower', frameDay: 2 },
    leadWith: ['bulgarian split squat', 'reverse lunge', 'step up', 'lateral lunge'],
    leadCite: 'Viada p220 — secondary press lower (ME lower day)',
    servesChips: [],
    requiresLoad: true,
    excludes: EXPLOSIVE_STEP_UP_IS_THE_WRONG_INTENT,
  },
  single_leg_b: {
    key: 'single_leg_b',
    label: 'Leg accessory',
    slot: { category: 'secondary', pattern: 'press_lower', frameDay: 5 },
    leadWith: ['walking lunge', 'step up', 'reverse lunge', 'lateral lunge'],
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
    label: 'Lower isolation',
    slot: { category: 'focused', pattern: 'press_lower' },
    leadWith: ['leg extension', 'calf raise'],
    leadCite: 'Viada pp222-223 — focused push lower: quads, calves',
    servesChips: [],
  },
  core: {
    key: 'core',
    label: 'Core movement',
    slot: null,
    // ⛔ HIS OWN CORE LIST, p223, IN HIS ORDER: hanging leg raises, crunches, V-ups, dynamic plank
    // variants, ab wheel rollouts. The catalogue's spellings for each.
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
): ViadaPickKey | null {
  let fallback: ViadaPickKey | null = null;
  for (const key of VIADA_PICK_KEYS) {
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
export function daysForPick(
  key: ViadaPickKey,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
  offset = 0,
): Weekday[] {
  const spec = VIADA_PICKS[key];
  if (!spec.slot) return [];
  const days = FRAMES[frame]?.columns[column] ?? [];
  const out: Weekday[] = [];
  for (const day of days) {
    // ⛔ A DAY-SCOPED PICK CLAIMS ONE DAY, NOT EVERY DAY ITS CELL FALLS ON. Without this the two
    // isolation-pull picks would both tag "monday and thursday" and the screen would print the same
    // pair of days twice for two controls that do different things.
    if (spec.slot.frameDay != null && day.day !== spec.slot.frameDay) continue;
    const hit = day.strength.some((s) =>
      s.intent === 'HYP' && s.role === 'accessory'
      && s.category === spec.slot!.category && s.pattern === spec.slot!.pattern);
    if (hit) out.push(weekdayForFrameDay(day.day, offset));
  }
  return out;
}

// ── WHAT EACH PICK OFFERS ────────────────────────────────────────────────────────────────────────

export type PickOption = {
  /** ⛔ THE STORED NAME — the catalogue's own spelling, so `EXERCISE_CONFIG` resolves it exactly. */
  name: string;
  /** What the athlete reads. */
  display: string;
  /** The muscle a set on it counts to. `null` when the catalogue cannot attribute it. */
  muscle: MuscleGroup | null;
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
    return !(dropBodyweight && isBodyweightLoad(m.name));
  });
  const leadKeys = spec.leadWith.map((n) => canonicalize(n));
  const rank = (m: GridMovement): number => {
    const i = leadKeys.indexOf(canonicalize(m.name));
    return i === -1 ? leadKeys.length : i;
  };
  return pool
    .map((m, i) => ({ m, i, r: rank(m) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map(({ m }) => ({
      name: m.name,
      display: movementLabel(m.name),
      muscle: musclesWorkedBy(m.name)?.primary ?? null,
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
): string {
  const opts = pickOptions(key, equipment);
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
): Record<ViadaPickKey, string> {
  const out = {} as Record<ViadaPickKey, string>;
  for (const key of VIADA_PICK_KEYS) out[key] = defaultPickFor(key, equipment, dial);
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
  picks: Record<ViadaPickKey, string>;
  dial: DialChip[];
  /**
   * The named movement for each extra row a chip adds, keyed `<chip>:<n>`. Absent = the engine
   * chooses, which is what an athlete who never opened the row gets.
   */
  dial_rows: Record<string, string>;
};

/** ⛔ READ ANY STORED SHAPE, RETURN THE CURRENT ONE. Never throws; a bad key falls back per slot. */
export function normalizeViadaPrefs(
  raw: unknown,
  equipment?: string[] | null,
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
  for (const key of VIADA_PICK_KEYS) {
    const stored = String(picksRaw[key] ?? '').trim();
    /**
     * ⚠️ VALIDATED AGAINST THE PICK'S OWN POOL, not merely non-empty. A stale name from an older
     * catalogue would otherwise reach a plan row and resolve to nothing — D-322's disease. The
     * fallback is this pick's default, which is a movement rather than a hole.
     */
    const ok = stored !== ''
      && pickOptions(key, equipment ?? null).some((o) => canonicalize(o.name) === canonicalize(stored));
    picks[key] = ok ? stored : defaultPickFor(key, equipment ?? null, dial);
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
