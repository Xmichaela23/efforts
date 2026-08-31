// ============================================================================
// THE FRAMES — one Viada program whole, per dial position. This slice ships ONE.
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part E1 (pp.246-247, both read directly 2026-08-23).
// Design: `DECISIONS-2026-08-22-standing-plan-pivot.md` §1.
//
// ⛔ THE FRAME TABLE IS THE LAW. The program owns every count — lifting days, endurance slots, which
// day carries what. The athlete owns sport, level, equipment and exercise choice. **Convert, never
// add** (pivot §2): an intensity choice tags a session the frame already has; it never creates one.
//
// ⛔ AND NO WEEK MIXES TWO AUTHORS' STRUCTURES (pivot §1). This is Viada's week end to end.
// ============================================================================

import type { ViadaCategory, ViadaIntent, ViadaPattern } from '../strength-grid/index.ts';
import type { FamilyId, Level } from '../endurance-library/index.ts';

/**
 * ⛔ TWO FRAMES ON A DIAL, NOT A REPLACEMENT (DESIGN-standard-focus-all-rounder-2026-08-30 §2).
 * `strength_5k` is FROZEN AS A DESIGN — stop shaping new work around its quirks — and still fully
 * guarded by its tests, because both frames share the composer, the materializer and the progression.
 */
export type FrameId = 'strength_5k' | 'all_rounder';

export type ColumnKind = 'standard' | 'taper';

/**
 * ⛔ "ACCESSORY:" IS A ROLE PREFIX, NOT A CATEGORY — p247, and nothing else in the corpus records it:
 *
 * > *"The 'accessory' notation refers to movements that specifically focus on **noncompetition lifts
 * > with similar gross movement patterns** — for example, paused deadlifts, box squats, Larsen
 * > presses."*
 *
 * His three examples straddle two of his own categories (paused deadlift and box squat are PRIMARY,
 * p219; Larsen press is SECONDARY, p220), which is the proof that the prefix is a ROLE and the words
 * after it name the pattern.
 *
 * ⛔ **A composer that reads `Accessory: primary pull` as "the primary-pull category" puts the
 * competition lift into a slot that exists precisely to avoid it.** So this is a filter applied on
 * top of stage 2's grid, never a change to it: exclude the athlete's named competition movements,
 * then take the grid's answer.
 */
export type SlotRole =
  /** The competition lift itself. Day-opening slots are always this — *"All first lifts of the day
   *  should be a competition movement"* (p247). */
  | 'competition'
  /** A noncompetition variant in the same gross pattern. */
  | 'accessory';

export type StrengthSlot = {
  intent: ViadaIntent;
  role: SlotRole;
  category: ViadaCategory;
  pattern: ViadaPattern;
  /**
   * ⛔ THE WEEKLY ME/DE ROTATION, AND HE STATES THE CADENCE — p247:
   *
   * > *"the ME lift will rotate week to week, with one week consisting of **ME squat and DE
   * > deadlift**, and the next week the reverse."*
   *
   * This is what the table's *"(rotate with primary push)"* means. On an odd week the slot takes its
   * own pattern; on an even week it swaps with its partner. ⚠️ **`pivot §8` listed rotation cadence
   * as a gap to fill from field practice. It is not a gap — he wrote it, and nothing here is ours.**
   *
   * ⛔ **AND p80 IS THE WHY, ADDED 2026-08-27** — p247 gives this program's cadence, p80 gives the
   * principle it is an instance of, and until now we cited only the former:
   *
   * > *"I recommend that every strength movement be ideally trained at least twice per week, or
   * > once every three to four days, with at least one day focused on heavy/near-maximum lifting
   * > (lower repetitions over 90 percent) and one day focused on velocity."*
   *
   * ⚠️ **THE SAME PAGE CAPS THE HEAVY DOSE**, and we have never encoded that: *"For a given movement
   * pattern, 4 to 6 repetitions over 90 percent and 15 to 20 velocity-focused repetitions per week
   * (between 70 percent and 85 percent) may be sufficient…"* Recorded in
   * `SOURCE-viada-hybrid-athlete.md` §B4d; **the ME set band is deliberately unchanged pending a
   * ruling, so do not read this comment as sanctioning the ramp's top end.**
   */
  rotatesWith?: ViadaPattern;
  /**
   * ⚠️ AMBIGUOUS IN THE SOURCE, RESOLVED CONSERVATIVELY AND LABELLED (Michael, 2026-08-23).
   * `1 x HYP: Accessory: accessory lower` on days 2 and 5 names *"accessory lower"*, which is not a
   * category anywhere in pp.218-223. Read as: a lower-body noncompetition movement, category left to
   * stage 2's substitution ladder. Recorded in Part E1b as ambiguous rather than resolved.
   */
  ambiguousNotation?: string;
  /**
   * ⛔ THE MODIFIER, NOT A CATEGORY — `grid.ts` `SlotRequest.asymmetrical`, and its own comment says
   * it: *"Braced push (asymmetrical) is a braced push done one limb at a time — there is no
   * asymmetrical list to draw from."* p274 prints it three times in the All Rounder and it is
   * resolved in `SOURCE-viada-hybrid-athlete.md` Part A2 as a braced LOWER push done single-leg.
   *
   * ⚠️ p275 SANCTIONS THE ROTATION OUT OF IT: *"You can rotate the braced asymmetrical movements
   * with secondary asymmetrical."* `resolveSlot` already implements exactly that fallback, so a slot
   * the athlete's kit cannot reach becomes a split squat rather than losing the asymmetry.
   */
  asymmetrical?: boolean;
  /** What the page prints, kept verbatim so a reader can find the row. */
  sourceText: string;
};

export type EnduranceSlot = {
  family: FamilyId;
  level: Level;
  /** ⚠️ p247's own refinement of the slot, where it gives one. */
  archetype?: string;
  /** Taper only — *"NT (race tempo)"*: race pace with recoveries 25% longer (p247). */
  raceTempo?: boolean;
  /**
   * ⛔⛔ WHAT THIS SLOT IS FOR, STATED BY THE FRAME (2026-08-30). `hard` is a quality session, `long`
   * is the week's long one, `easy` is base work.
   *
   * ⚠️ OPTIONAL, AND ABSENT MEANS "INFER IT" — every slot written before this reads exactly as it
   * did, through the family tables in `sport-slots.ts`. It exists because the All Rounder prescribes
   * CYCLING NATIVELY (p274: `Cyc AnA` on day 2, `Cyc endurance` on day 4) and a frame should not
   * have to name its sessions in run-family vocabulary to be understood. Inferring a role from a
   * family name is what made a natively-prescribed ride invisible as hard or long.
   */
  role?: 'hard' | 'long' | 'easy';
  /**
   * ⛔⛔ THIS SLOT CARRIES THE WEEK'S STRIDES — STATED BY THE FRAME (2026-08-30), for the same reason
   * `role` is: it was being inferred from a family name and the inference does not survive a second
   * frame.
   *
   * ⛔ WHY THE STRIDES EXIST AT ALL. p119 lists running economy FIRST of the three qualities that may
   * not lapse, and no frame slot is running speed work. p109 is why there is no fifth slot for it:
   * economy improves with *"as few as a handful of strides before, during, or after other running
   * sessions"*, so the economy work goes ON a session the frame already has.
   *
   * ⚠️ IT WAS `family === 'run_vt1'`, WHICH IS A DIFFERENT QUESTION. That test read "the easy run",
   * and the easy run was the chosen carrier because it is the lightest running session in the week —
   * a reason about the SESSION'S JOB, not about its family. **The All Rounder's easy slot is
   * prescribed as a RIDE (p274 day 4, `Cyc endurance`), so the family test finds nothing in its
   * standard column and the athlete gets no economy work for a whole block; in its taper column the
   * family lands on the PLYOMETRICS day and the strides go there. Nobody chose either outcome.**
   *
   * ⚠️ AND THE RUN GUARD STAYS. A slot marked here still carries strides only when its sport is
   * actually a run — there is no running economy to train on a session with no running in it. That
   * guard is `compose.ts`'s, not this field's.
   */
  carriesStrides?: boolean;
  sourceText: string;
};

export type FrameDay = {
  day: number;
  label: string | null;
  strength: StrengthSlot[];
  endurance: EnduranceSlot[];
  /** Day 3 only. p227 governs the dose; see `PLYO_DOSE`. */
  plyo?: boolean;
  rest?: boolean;
  /**
   * ⛔⛔ WHAT A LOWER-BODY DAY IS FOR, STATED BY THE FRAME (2026-08-30) — the SAME fix as
   * `EnduranceSlot.role`, applied to the strength side, and for the same reason.
   *
   * `label` was carrying two jobs: the athlete's name for the session AND the structural fact that
   * this is the week's heavy leg day. Five readers string-matched `'ME: Lower'` / `'DE: Lower'` to
   * recover it — `lowerDaysOf`, `typedSessionsOf`, `phraseFor`, the speed-day rule and the p247
   * haircut in `compose.ts`. **The All Rounder's lower days are named for their PATTERN on p274
   * (`Lower body: Hinge`, `Lower body: Push`), so every one of those tests would have missed, and
   * the frame's two heavy leg days would have carried no interference check at all.** Silent, like
   * every other defect in this family.
   *
   * ⚠️ ABSENT MEANS "READ THE LABEL", so `strength_5k` is byte-identical either way — its days 2 and
   * 5 are marked here with exactly what their labels already said.
   * ⚠️ A FRAME MAY HAVE TWO `me` DAYS AND NO `de` DAY. p274 opens both All Rounder lower days on an
   * ME slot; `lowerDaysOf` returns LISTS for that reason.
   */
  lowerRole?: 'me' | 'de';
  /**
   * ⛔⛔ WHAT THE ATHLETE CALLS THIS DAY'S LIFTING, STATED BY THE FRAME (2026-08-30) — the same fix
   * as `EnduranceSlot.role` and `FrameDay.lowerRole`, for the same reason, on the third reader.
   *
   * ⛔ IT IS NOT `label`, AND THE TWO MUST NOT BE CONFLATED. `label` is the frame's own transcription
   * of the page's row — `'Upper body: Push'`, `'ME: Lower'` — and on `strength_5k` it is INTENT
   * vocabulary (maximal effort / dynamic effort) that means nothing to a lifter reading a wizard.
   * This is the short lifter-familiar word for the day's THEME, and it exists so the endurance screen
   * can say what a day is for without string-matching or re-deriving anything.
   *
   * ⚠️ OPTIONAL, AND ABSENT MEANS THE FRAME HAS NO ATHLETE-FACING WORD FOR THIS DAY — the screen
   * renders no tag rather than a guessed one. `strength_5k` is deliberately left without any: Michael
   * ruled on 2026-08-30 that the day-ordered layout and its tags are **Standard Focus only** and the
   * 5K screen must render exactly as it does today. p246 speaks in ME/DE intent rather than p274's
   * movement patterns, so its five words are a separate call he has not made. **Do not fill them in
   * as tidiness.**
   *
   * ⚠️ ONE SHORT TAG AND NEVER A SECOND SENTENCE. It sits greyed beside a day number on a phone.
   */
  themeTag?: string;
};

export type Frame = {
  id: FrameId;
  /** ⛔ NEVER SHOWN TO AN ATHLETE (pivot §1). Internal only. */
  sourceName: string;
  /**
   * ⛔⛔ WHAT THE ATHLETE CALLS THIS, WHICH IS NEVER WHAT THE BOOK CALLS IT (Michael, 2026-08-30).
   * The naming is Focus-branded, so the All Rounder is **Standard Focus** on every screen. This is
   * the same id-versus-display split `non-race-goal-seeds.ts` already uses, where the goal id
   * `get_stronger` displays as "Strong Focus" — and the comment there records what happens when the
   * two are conflated: the athlete picked one name and was handed a plan called another.
   *
   * ⚠️ ABSENT MEANS THE FRAME HAS NO ATHLETE-FACING NAME YET, and `strength_5k` is deliberately left
   * that way. Michael has ruled it becomes **5K + Strength** inside a Run Focus grouping, and that
   * grouping does not exist — naming it here before the screen that houses it would put a third name
   * on a plan that already has two. **That is a separate change; do not fill it in as tidiness.**
   */
  displayName?: string;
  cite: string;
  /** ⛔ THE PROGRAM OWNS THIS (pivot §6). Not an athlete dial. */
  liftingDays: number;
  columns: Record<ColumnKind, FrameDay[]>;
  /** His rate anchor for THIS frame — see `RATE_ANCHOR`. */
  workingNumberRatePerWeek: number;
};

// ── the slot vocabulary, spelled once ───────────────────────────────────────────────────────────

const S = (
  intent: ViadaIntent,
  role: SlotRole,
  category: ViadaCategory,
  pattern: ViadaPattern,
  sourceText: string,
  extra?: Partial<StrengthSlot>,
): StrengthSlot => ({ intent, role, category, pattern, sourceText, ...extra });

const E = (family: FamilyId, level: Level, sourceText: string, extra?: Partial<EnduranceSlot>): EnduranceSlot =>
  ({ family, level, sourceText, ...extra });

/**
 * ⛔ STRENGTH + 5K (p246), TRANSCRIBED FROM THE PAGE.
 *
 * Four lifting days — two ME, two DE — a plyo-only day 3, an endurance-only day 6, one rest day.
 * Four endurance sessions in standard, three in taper.
 *
 * ⚠️ p247 says the lifting days *"focus on the big three if powerlifting is the goal: training bench
 * twice a week and the squat and deadlift each once a week."* That falls out of the table: bench is
 * the primary push on days 1 and 4, and days 2 and 5 carry squat and deadlift with the ME/DE roles
 * swapping weekly.
 */
const STRENGTH_5K_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('ME', 'accessory', 'primary', 'pull_upper', '1 x ME: Accessory: primary pull'),
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: Accessory: secondary push'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [E('run_mlss', 2, '1 x MLSS+ (level 2)')],
  },
  {
    day: 2,
    label: 'ME: Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate with primary push)', { rotatesWith: 'press_lower' }),
      S('ME', 'accessory', 'primary', 'press_lower', '1 x ME: Accessory: primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'secondary', 'hinge_lower', '1 x DE: Accessory: secondary hinge lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 X HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 3, 'NT (level 3)', { archetype: 'below_threshold' })], plyo: true },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'secondary', 'push_upper', '1 x HYP: Accessory: secondary push'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    // ⛔ THE WEEK'S ECONOMY WORK RIDES ON THIS SLOT — see `EnduranceSlot.carriesStrides`. It is the
    // lightest running session in the week and it sits after the hardest day and before the long one.
    endurance: [E('run_vt1', 1, 'VT1 (level 1)', { carriesStrides: true })],
  },
  {
    day: 5,
    label: 'DE: Lower',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)', { rotatesWith: 'press_lower' }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: secondary push lower'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Accessory: focused push lower'),
    ],
    endurance: [],
  },
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 2, 'LSD (level 2)', { archetype: 'long_with_inserts' })] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ THE TAPER/DELOAD COLUMN, AND IT IS A SUBSTITUTION AS MUCH AS A CUT. Days 1 and 2 turn their
 * SECOND ME slot into a DE slot; every endurance level drops to 1; day 4 loses its endurance
 * entirely; the LSD is gone and a VT1 takes day 6.
 *
 * ⛔ IT IS ALSO THE FRAME'S HOLD VARIANT (pivot §1: *"Holding — the taper/deload column of the
 * current frame. Not a separate plan."*) and its race handling: p247 says to switch to the deload
 * version **two weeks out from a powerlifting meet or a 5K**.
 */
const STRENGTH_5K_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [E('run_mlss', 1, '1 x MLSS+ (level 1)')],
  },
  {
    day: 2,
    label: 'ME: Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate)', { rotatesWith: 'press_lower' }),
      S('DE', 'accessory', 'primary', 'press_lower', '1 x DE: Accessory: primary push lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  {
    day: 3,
    label: null,
    strength: [],
    endurance: [E('run_near_threshold', 1, 'NT (race tempo) (level 1)', { archetype: 'below_threshold', raceTempo: true })],
    plyo: true,
  },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [],
  },
  {
    day: 5,
    label: 'DE: Lower',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  { day: 6, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1)')] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔⛔ THE ALL ROUNDER (p274), TRANSCRIBED FROM THE PAGE IMAGE — `SOURCE-viada-hybrid-athlete.md`
 * Part E1, verified against `p274.jpg` 2026-08-21. Design: `DESIGN-standard-focus-all-rounder-2026-08-30.md`.
 *
 * Four strength days organised by MOVEMENT PATTERN (1, 2, 4, 5), a plyo-only day 3, an
 * endurance-only day 6, one full rest day. **Five endurance sessions in standard, three in taper** —
 * more than Strength + 5K, not fewer.
 *
 * ⛔⛔ ITS CYCLING IS PRESCRIBED NATIVELY, and that is the whole reason `EnduranceSlot.role` exists.
 * p274 puts `Cyc AnA (level 1)` on day 2 and `Cyc endurance (level 1)` on day 4. Every other frame
 * slot in this file is a run family that `RIDE_EQUIVALENT` converts afterwards, so a run-only reader
 * returned nothing for these two: not hard, not long, not easy — invisible, silently.
 * **EVERY ENDURANCE SLOT BELOW STATES ITS ROLE.** If a future reader has to be taught a family name
 * to understand this week, the frame should be stating the fact instead.
 *
 * ⛔ THE DAY-OPENING LIFT IS A COMPETITION PRIMARY, AND THAT IS MICHAEL'S RULING, NOT THE PAGE.
 * p274 prints every ME slot as a SECONDARY lift, and p275 gives his two reasons: (1) variety of
 * implements and planes keeps progress coming, and (2) it *"breaks the attachment to the big
 * three."* **Reason 2 is about HIS reader — a lifter moving into endurance. Ours is an endurance
 * athlete moving into lifting and has no such attachment** (DESIGN §3). Reason 1 survives, which is
 * why the braced and focused slots below are untouched.
 * ⚠️ AND p275 PERMITS IT OUTRIGHT: *"primary lifts CAN be substituted in, you're encouraged to keep
 * your options open."* The mechanical reason it matters: `exerciseForSlot` only puts a WEIGHT on a
 * row when the movement is the athlete's named competition lift for that pattern, so without a
 * primary opening each day this frame prescribes nothing and every weight rides the ratio table
 * outside its stated range. `sourceText` keeps the page's own words on every row regardless.
 *
 * ⚠️ THE SUPERSETS ARE NOT STRUCTURAL YET (DESIGN §5). p274 pairs four HYP slots — arms on the upper
 * days, braced hinge with braced lower push on the lower days. They are transcribed here as ordinary
 * adjacent slots because the build order is display-first: two rows marked as a pair, and structure
 * only if rest, dosing or the ledger genuinely need it. **Nothing in the app pairs exercises today.**
 *
 * ⚠️ NO `archetype` ANYWHERE. That field is *"p247's own refinement of the slot, where it gives
 * one"*, and p275 gives none — not even on the LSD, where p246's frame carries an insert refinement.
 * Adding one here would be inventing a refinement and attributing it to the page.
 */
const ALL_ROUNDER_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'Upper body: Push',
    themeTag: 'push day (upper)',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: secondary push'),
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: secondary push'),
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: braced push'),
      // ⚠️ THE ARMS SUPERSET — p274 prints these two as one paired entry. Display-first (DESIGN §5).
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: focused push'),
    ],
    endurance: [E('run_mlss', 2, 'MLSS+ (level 2)', { role: 'hard' })],
  },
  {
    day: 2,
    label: 'Lower body: Hinge',
    themeTag: 'hinge',
    // ⛔ BOTH LOWER DAYS OPEN HEAVY IN THIS FRAME — see `FrameDay.lowerRole`. p274 gives it no speed
    // leg day at all, which is why `lowerDaysOf` had to return lists.
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: secondary hinge'),
      // ⚠️ THE BRACED SUPERSET — same region, opposite patterns, which is p275's own rule 2b for what
      // may be paired: *"similar muscle groups but dramatically different specific patterns and loads."*
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: braced hinge / braced lower push superset'),
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: braced hinge / braced lower push superset'),
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: focused hamstring'),
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: braced push (asymmetrical)', { asymmetrical: true }),
    ],
    endurance: [E('ride_anaerobic', 1, 'Cyc AnA (level 1)', { role: 'hard' })],
  },
  {
    day: 3,
    label: null,
    themeTag: 'jumps',
    strength: [],
    endurance: [E('run_near_threshold', 2, 'NT (level 2)', { role: 'hard' })],
    plyo: true,
  },
  {
    day: 4,
    label: 'Upper body: Pull',
    themeTag: 'pull day (upper)',
    strength: [
      S('ME', 'competition', 'primary', 'pull_upper', '1 x ME: secondary pull'),
      S('DE', 'accessory', 'secondary', 'pull_upper', '1 x DE: secondary pull'),
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: braced pull'),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: focused pull'),
    ],
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  {
    day: 5,
    label: 'Lower body: Push',
    themeTag: 'legs',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'press_lower', '1 x ME: secondary push'),
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: braced hinge / braced lower push superset'),
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: braced hinge / braced lower push superset'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: focused quadriceps'),
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: braced push (asymmetrical)', { asymmetrical: true }),
    ],
    endurance: [],
  },
  {
    day: 6,
    label: null,
    strength: [],
    // ⚠️ p275 OPENS THIS SESSION UP AND THE FRAME DOES NOT NARROW IT: *"the weekend LSR can be a
    // hike, a long ride, a team sport day, or whatever else is of interest."* The sport is
    // `sport-slots.ts`'s question; what the frame states is that this is the week's LONG session.
    endurance: [E('run_lsd', 2, 'LSD (level 2)', { role: 'long' })],
  },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ THE TAPER/DELOAD COLUMN (p274, right-hand pair), AND IT IS A SUBSTITUTION AS MUCH AS A CUT:
 * every ME becomes SKILL on the upper days and DE on the lower ones, the braced and superset volume
 * comes off BOTH lower days, every endurance level drops from 2 to 1, day 3 drops from NT to VT1,
 * and days 2 and 5 lose their endurance entirely. Three endurance sessions instead of five.
 *
 * ⚠️ THE DAY-OPENING LIFT STAYS A COMPETITION PRIMARY, for the same reason as the standard column —
 * a day with no tested lift prescribes no weight. The page's INTENT is kept exactly as printed.
 */
const ALL_ROUNDER_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'Upper body: Push',
    themeTag: 'push day (upper)',
    strength: [
      S('SKILL', 'competition', 'primary', 'push_upper', '1 x SKILL: secondary push'),
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: braced push'),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: focused push'),
    ],
    endurance: [E('run_mlss', 1, 'MLSS+ (level 1)', { role: 'hard' })],
  },
  {
    day: 2,
    label: 'Lower body: Hinge',
    themeTag: 'hinge',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'hinge_lower', '1 x DE: secondary hinge'),
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: focused hamstring'),
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: braced push (asymmetrical)', { asymmetrical: true }),
    ],
    endurance: [],
  },
  {
    day: 3,
    label: null,
    themeTag: 'jumps',
    strength: [],
    endurance: [E('run_vt1', 1, 'VT1 (level 1)', { role: 'easy' })],
    plyo: true,
  },
  {
    day: 4,
    label: 'Upper body: Pull',
    themeTag: 'pull day (upper)',
    strength: [
      S('SKILL', 'competition', 'primary', 'pull_upper', '1 x SKILL: secondary pull'),
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: braced pull'),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: focused pull'),
    ],
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  {
    day: 5,
    label: 'Lower body: Push',
    themeTag: 'legs',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: secondary push'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: focused quadriceps'),
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: braced push (asymmetrical)', { asymmetrical: true }),
    ],
    endurance: [],
  },
  {
    day: 6,
    label: null,
    strength: [],
    // ⚠️ p274's TAPER CELL PRINTS A CHOICE — *"LSD (level 1) or Cyc endurance (level 1)"*. The frame
    // states the ROLE and leaves the modality to `sport-slots.ts`, which is the same answer the
    // choice gives; spelling it as two slots would double the session.
    endurance: [E('run_lsd', 1, 'LSD (level 1) or Cyc endurance (level 1)', { role: 'long' })],
  },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ HIS RATE ANCHOR, AND IT IS PER-FRAME RATHER THAN PER-ATHLETE (corrected 2026-08-23).
 *
 * p247, for Strength + 5K: *"slow gradual increases in the calculated 1RM taking place every 3 to 4
 * weeks (**assume 1 percent every 3 weeks as a starting point**)."*
 *
 * ⚠️ `DECISIONS-2026-08-22-standing-plan-pivot.md` §4 read this as "~1%/3wk general, ~1%/4wk when
 * running is real" — a global switch on running. **It is not.** Strength + 5K carries four endurance
 * sessions including two hard ones and still runs at 1%/3wk; the 1%/4wk figure is p251's, for
 * Strength + Half-Marathon. More running, slower rate — **per frame**. Michael ruled the page wins,
 * 2026-08-23.
 */
export const RATE_ANCHOR: Record<FrameId, { perWeek: number; cite: string }> = {
  strength_5k: { perWeek: 0.01 / 3, cite: 'Viada p247 — 1% every 3 weeks' },
  /**
   * ⛔⛔ ZERO, AND ZERO IS A RULING RATHER THAN A MISSING NUMBER (Michael, 2026-08-30).
   * **Progression is EARNED or it does not happen.** Read the whole chain before restoring a rate
   * here; the zero alone is not checkable, and it will look like an oversight to anybody who finds
   * `strength_5k` carrying a number one line above it.
   *
   * ⛔ HIS RATE AND HIS BAND ARE REAL AND ARE NOT BEING DISPUTED.
   * `SOURCE-viada-hybrid-athlete.md` §J1: p245 and p247 print the identical sentence — *"slow
   * gradual increases in the calculated 1RM taking place every 3 to 4 weeks (assume 1 percent every
   * 3 weeks as a starting point)"* — and p251's *"1% every four weeks or so"* sits inside that band.
   * The band is his. **p275 states no rate at all for this program**, so ANY number here is a
   * position we chose, and reusing p247's would be an unlabelled inference off a different page.
   *
   * ⚠️ A POSITION WAS CHOSEN AND THEN OVERRULED, AND IT IS RECORDED SO IT IS NOT RE-DERIVED. The
   * slow end of his band — 1% every four weeks — was reasoned from p275's *"resist the urge to add
   * difficulty or length"* and from this frame carrying five endurance sessions to Strength + 5K's
   * four. **That reasoning was sound and is not why it was rejected.**
   *
   * ⛔⛔ WHY IT IS ZERO. A scheduled rise is a drift on the CALENDAR, and this app is never short of
   * evidence: the logger lays the session out, so a completed heavy set is recorded every time one
   * happens. A calendar drift is therefore a guess stacked on top of evidence the app already holds,
   * and it can only ever fire for an athlete who is NOT earning it. `progression.ts` already states
   * the rule it contradicts — the bar moves when it is earned, which is why there is no percentage
   * back-off either. **The double progression owns the number: finish the top of the rep range twice
   * running and the bar moves; miss the bottom and it returns to the last weight held; log nothing
   * and nothing changes.**
   *
   * ⚠️ AND IT REMOVES ALMOST NOTHING IN PRACTICE, WHICH IS THE SENTENCE THAT SHOULD STOP ANYONE
   * REINSTATING IT AS HARMLESS. One per cent cannot be expressed on a bar under roughly 250 lb once
   * it is rounded to real plates (see `REPS_CARRY_THE_PROGRESSION_IS_OURS`) — on a 145 lb bench the
   * drift moved the weight ONCE in twelve weeks, in a week decided by where the unrounded number
   * happened to fall against the rounding line. **What zeroing it removes is the single case that
   * contradicted the rule: a bar that rose for somebody who logged nothing.**
   *
   * ⛔ IT IS ONE CONSTANT AND NOT A BRANCH. `scheduledRise` multiplies into `prescribedLoad` and
   * nothing else reads it; at zero the multiplier is 1 and drops out of the arithmetic. The earned
   * increment is a POUNDS offset added AFTER the rounding and never compounded with this multiplier,
   * so removing the drift cannot weaken the mechanism that actually moves the bar. **There is no
   * "what if nobody logs" branch here, no decay and no default drift, and none may be added.**
   * ⚠️ `strength_5k` IS UNTOUCHED — its own entry above, its own page, and measured byte-identical
   * across every kit, week, column and pick set.
   */
  all_rounder: {
    perWeek: 0,
    cite: 'OURS — Michael, 2026-08-30: progression is earned or it does not happen. p275 states no '
      + 'rate for this program, and the double progression owns the number.',
  },
};

export const FRAMES: Record<FrameId, Frame> = {
  strength_5k: {
    id: 'strength_5k',
    sourceName: 'Strength + 5K',
    cite: 'Viada pp246-247',
    liftingDays: 4,
    columns: { standard: STRENGTH_5K_STANDARD, taper: STRENGTH_5K_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.strength_5k.perWeek,
  },
  all_rounder: {
    id: 'all_rounder',
    sourceName: 'The All Rounder',
    displayName: 'Standard Focus',
    cite: 'Viada pp274-275',
    liftingDays: 4,
    columns: { standard: ALL_ROUNDER_STANDARD, taper: ALL_ROUNDER_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.all_rounder.perWeek,
  },
};

/**
 * ⛔ THE ADVANCED-RUNNER TIER — A PROGRAM TIER, NOT AN ATHLETE DIAL (Michael, 2026-08-23).
 *
 * p247: *"More advanced runners may see a benefit to additional running volume, and I recommend
 * adding one or two VT1 sessions initially to test recovery."*
 *
 * ⚠️ THIS SAT AGAINST PIVOT §2's *"convert, never add"* and was raised rather than reconciled. The
 * ruling: §2 stands, and this is not a violation of it, because **the athlete never self-selects
 * into volume they do not already hold.** The frame has a base count; the engine gates the tier on
 * DEMONSTRATED running history and then the count is fixed again. Within either tier, intensity
 * still converts and never adds.
 *
 * ⛔ THE ADDED SESSIONS ARE EASY ONLY. His words are VT1 sessions, and the tier exists *"to test
 * recovery"* — adding a hard session would test something else.
 */
export const ADVANCED_TIER_VT1_SESSIONS = { min: 1, max: 2, cite: 'Viada p247' };

/**
 * ⛔ THE GATE IS DEMONSTRATED HISTORY, AND THE THRESHOLD IS OURS.
 *
 * He says "more advanced runners" and defines nothing. The gate therefore cannot be his, and it is
 * labelled: **an athlete qualifies when their own recent running already carries the volume** — the
 * tier adds sessions they are shown to be doing, never sessions they hope to do.
 *
 * ⚠️ 25 MILES A WEEK IS OURS, from the customer definition rather than from the book: the Standing
 * Plan's stated audience is 10-30 miles a week (`DECISIONS-2026-08-21-standing-plan.md` §1), so the
 * top third of that band is where "more advanced" begins for this product. **Fixed number, labelled,
 * one line — the pivot §8 discipline.**
 */
export const ADVANCED_TIER_MIN_WEEKLY_MILES = 25;
export const ADVANCED_TIER_GATE_IS_OURS =
  'The source says "more advanced runners" and defines nothing. Twenty-five miles a week is ours — '
  + 'the top third of this plan\'s stated 10-to-30-mile audience — and it gates on running the '
  + 'athlete already does, never on running they intend to do.';

export function advancedTierSessions(demonstratedWeeklyMiles: number | null | undefined): number {
  const miles = Number(demonstratedWeeklyMiles);
  if (!Number.isFinite(miles) || miles < ADVANCED_TIER_MIN_WEEKLY_MILES) return 0;
  // ⚠️ One session at the gate, two once the athlete is clear of it by the same margin again.
  return miles >= ADVANCED_TIER_MIN_WEEKLY_MILES * 2
    ? ADVANCED_TIER_VT1_SESSIONS.max
    : ADVANCED_TIER_VT1_SESSIONS.min;
}

/**
 * ⛔⛔ THE LOW-VOLUME TIER — THE SAME SESSIONS AT HIS SMALLER SIZES (2026-08-26 evening).
 *
 * ⛔ THE DEFECT IT ANSWERS, MEASURED. With all four endurance slots on foot, the frame's standard
 * column has a FLOOR of three hours twenty: MLSS level 2 (32 min), NT level 3 (75), VT1 level 1 (25)
 * and LSD level 2 (68) at their shortest. Ask for two hours of running and the week still built
 * 3h20 — about seventy per cent more than the athlete said they run, in week one.
 *
 * ⛔ AND THAT IS THE FAILURE HE NAMES BY NAME. p148: change each bucket by *"less than 10 percent"*
 * a week, *"though ideally 5 percent is as high as I will usually go."* p149 calls too-rapid
 * increases *"the greatest source of program failure that I observe in hybrid programs."* It lands
 * hardest on this plan's own stated customer — ten to thirty miles a week, which at the bottom is
 * about an hour forty.
 *
 * ⛔⛔ THE LEVELS ARE HIS. p246's TAPER column prescribes these same two quality sessions at LEVEL 1
 * — MLSS level 1 on day 1, near-threshold level 1 on day 3 — so the smaller dose is his own number
 * for his own session, already transcribed in `STRENGTH_5K_TAPER` above.
 *
 * ⛔ AND THE LONG SESSION SCALES WITH THEM, ON p247's OWN SENTENCE: *"Mileage will be dictated by
 * experience level, with more proficient runners looking at runs up to 90 to 100 minutes here with
 * an emphasis on LT intervals, and less experienced runners opting for shorter fartlek variations."*
 * The 90-to-100-minute long session — the ceiling this engine adopted — is stated as the PROFICIENT
 * runner's figure. `run_lsd` level 1 is p235's own band for the same session (35-90 min), so the
 * shorter long run is his dose too.
 *
 * ⚠️ THE LEVEL MOVES, THE BAND NEVER DOES. p275 forbids stretching a session past its band and the
 * same logic binds the other end: nothing here shortens a session below what the page prints for it.
 * ⚠️ AND NO SESSION IS DROPPED. All four slots are the frame's (p119, 2026-08-26) — the tier changes
 * how big they are, never how many there are.
 * ⚠️ IT ONLY TOUCHES RUN FAMILIES, so a mixed athlete whose hard slots are rides is unaffected by
 * construction rather than by a special case. The defect only ever bit the run slots.
 * ⚠️ AND IT BARELY MOVES THE TOP. A low-tier athlete asking for five hours still gets four and a
 * half, because the easy and long sessions are base families and climb. What the tier changes is the
 * FLOOR — three hours twenty becomes about two.
 */
export const LOW_VOLUME_TIER_LEVELS: Record<string, Level> = {
  run_mlss: 1,
  run_near_threshold: 1,
  run_lsd: 1,
  /**
   * ⛔ THE RIDE FAMILIES, AND DROPPING **THEIR** LEVEL IS OURS (2026-08-27). `RIDE_EQUIVALENT` maps
   * the frame's four slots onto `ride_anaerobic` (day 1), `ride_sweet_spot` (day 3) and
   * `ride_endurance` (easy and long), and p246's taper column — the source for *"the same session, smaller"* on the run side —
   * has no cycling counterpart. **There is no ride taper column, so there is no page under this.**
   * See `LOW_VOLUME_RIDE_LEVELS_ARE_OURS`.
   *
   * ⚠️ THE LEVELS THEMSELVES ARE STILL HIS: p239 prints cycling endurance at three levels and p238's
   * sweet-spot the same way, so level 1 is a dose he states for the session. What is ours is the
   * decision to use it for a lower-volume rider.
   */
  /**
   * ⛔⛔ ADDED 2026-08-30, AND ITS ABSENCE WAS A REAL DEFECT. This table listed only the two families
   * that were reachable when it was written, and the comment above named them; when day 1 became
   * `ride_anaerobic` the family fell through and the slot stayed at the frame's level for BOTH
   * experience answers. The two ride chips then printed the SAME duration — a control that changed
   * nothing — and the cause was this omission, not the control.
   *
   * ⚠️ THE THREE LEVELS ARE HIS: p237 prints the anaerobic session at 6-10 x 45s (L1), x 1 min (L2)
   * and x 1:30 (L3), all at 110-115%+ with 4-6 min recovery. The work interval ladders and the
   * intensity does not, which is exactly the variation the experience answer is for.
   * ⚠️ USING LEVEL 1 FOR A LOWER-VOLUME RIDER IS OURS, the same call as the two families below and
   * carrying the same label — see `LOW_VOLUME_RIDE_LEVELS_ARE_OURS`.
   */
  ride_anaerobic: 1,
  ride_sweet_spot: 1,
  ride_endurance: 1,
};

/**
 * ⛔⛔ NO RIDE IS EVER BUILT ABOVE HIS LEVEL 2 (Michael, 2026-08-27, off p278).
 *
 * ⛔ THE DEFECT IT CLOSES, MEASURED. A ride inherits the SLOT's difficulty through
 * `RIDE_EQUIVALENT`, and the frame's second hard slot is `run_near_threshold` at LEVEL 3 (p246). So
 * an athlete who put a ride on that slot was handed `ride_sweet_spot` level 3 — a dose the book
 * prescribes to nobody.
 *
 * ⛔ p278, HIS OWN CYCLING BASE STANDARD WEEK, read off the page image: day 1 `Cyc sweet spot
 * (level 1-2)`, day 3 `Cyc VO2 (level 1)` + `Cyc sweet spot (level 1)`, day 5 `Cyc sprint
 * (level 1)`, day 7 `Cyc endurance (level 2)`. **Level 2 is the ceiling anywhere in his cycling
 * programs, and it appears on one session.** Level 3 sweet spot exists in the session library
 * (p239) and he prescribes it in no program — so offering it on a Wednesday ride hands a hybrid
 * athlete a harder dose than the book gives a dedicated cyclist.
 *
 * ⚠️ THE RUN SIDE IS UNTOUCHED. The Wednesday RUN stays at level 3, which is exactly what p246
 * prints for it and what p247 calls *"the hardest session of the week."*
 * ⚠️ IT IS A CLAMP, NOT A TIER. It binds whatever the level came from — the frame, the experience
 * answer, or an explicit caller override — because the argument is about the bike, not about who
 * asked.
 */
export const RIDE_LEVEL_CEILING: Level = 2;

export const RIDE_LEVEL_CEILING_CITE =
  'No ride is built above level 2. p278\'s Cycling Base standard week tops out at level 2 and uses '
  + 'it on one session; level 3 sweet spot is in the p239 library and is prescribed in none of his '
  + 'cycling programs.';

/** The level a slot is actually built at, with the bike's own ceiling applied. */
export function clampRideLevel(family: string, level: Level): Level {
  if (!family.startsWith('ride_')) return level;
  return (level > RIDE_LEVEL_CEILING ? RIDE_LEVEL_CEILING : level) as Level;
}

export const LOW_VOLUME_RIDE_LEVELS_ARE_OURS =
  'Building the ride slots at level 1 for a lower-volume rider is ours. The levels are his — p238 '
  + 'and p239 print each session at three — but the taper column that justifies the smaller dose on '
  + 'the run side has no cycling counterpart, so nothing on the page says to do this for a bike.';

/**
 * ⛔⛔ THE GATE IS DERIVED, NOT PICKED (rewritten 2026-08-27) — see `lowVolumeSports` in
 * `volume-bounds.ts`, which owns the comparison.
 *
 * ⛔ WHAT IT REPLACES, AND WHY THE REPLACEMENT IS THE SAME ANSWER. The first version was twenty
 * miles a week, reasoned as *"the standard column's four run sessions total about three hours twenty
 * at their shortest, which is twenty miles at an easy ten-minute mile."* That reasoning is an
 * arithmetic, and the arithmetic is now the gate: **the tier applies to a sport when the athlete's
 * logged minutes are under what the frame's own slots of that sport would build at their shortest.**
 * The invented number is gone, the pace conversion inside it is gone, and the bike needed no second
 * threshold to be pressed out of thin air.
 *
 * ⚠️ NOTHING IN THE CORPUS TIERS CYCLING BY VOLUME, which is exactly why a derived gate was worth
 * the change. p137's *"two hours of cycling"* is a supplement figure for a RUNNER and is not a tier
 * gate; pressing it into service as one would have been an invented rule wearing a citation.
 */
export const LOW_VOLUME_TIER_GATE_IS_OURS =
  'The smaller sizes are his — the taper column prescribes the run sessions at level 1, and p247 '
  + 'states the 90-to-100-minute long run as the more proficient runner\'s figure. Deciding WHEN to '
  + 'use them is ours: the sessions drop a level for a sport when the athlete\'s logged minutes over '
  + 'the last four weeks are under what this week\'s own slots of that sport would build at their '
  + 'shortest. The source names "less experienced runners" and defines nothing.';

/**
 * The endurance levels this athlete's history earns, per family.
 *
 * @param lowSports the sports the athlete is under the frame's own floor in — `lowVolumeSports`.
 * ⚠️ EMPTY IS THE FRAME AS PRINTED. A sport at or above its floor gets p246 exactly.
 */
export function lowVolumeLevels(lowSports: Array<'run' | 'ride'>): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const [family, level] of Object.entries(LOW_VOLUME_TIER_LEVELS)) {
    const sport = family.startsWith('ride_') ? 'ride' : 'run';
    if (lowSports.includes(sport)) out[family] = level;
  }
  return out;
}

/**
 * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — AND IT IS THE SOLE INPUT TO THE LEVEL
 * (Michael, 2026-08-27). Two answers, no third.
 *
 * ⛔ WHAT IT REPLACES, AND WHY. Until today the level was decided from the athlete's LAST 28 DAYS of
 * logged running and riding (`lowVolumeSports`, gated on `demonstratedWeeklyMinutes`). Michael's own
 * case is the whole argument: *"im coming off a marathon a few months ago I was training less, this
 * is the wrong thing."* A 28-day window measures the last month, not training age — post-race,
 * injured, off-season, on holiday, or simply not syncing a watch all read as beginner.
 *
 * ⛔ AND THE SOURCE NAMES THE RIGHT QUANTITY. p247 says *"experience level"* and gives no mileage
 * qualifier anywhere. Every number in the gate this replaces was ours.
 *
 * ⛔ NO FALLBACK AND NO CORRECTION. History does not decide it, does not break a tie, and does not
 * revise it later. The athlete answers and that is the level.
 */
export type ExperienceTier = 'newer' | 'experienced';

/** The answer per sport. ⚠️ A sport with no answer takes the frame's own printed levels — the same
 *  thing "Experienced" applies — because absent is not a claim that they are new to it. */
export type EnduranceExperience = { run?: ExperienceTier | null; ride?: ExperienceTier | null };

export const EXPERIENCE_IS_THE_ATHLETES_ANSWER =
  'The two sizes are his — p246\'s taper column prescribes the quality sessions at level 1, and '
  + 'p247 states the 90-to-100-minute long run as the more proficient runner\'s figure. WHICH of '
  + 'the two an athlete gets is now their own answer, asked once in the wizard. It was inferred '
  + 'from the last four weeks of logged training until 2026-08-27; the source names "experience '
  + 'level" and never recent mileage.';

/**
 * The endurance levels the athlete's own answer sets, per family.
 *
 * ⛔ "Newer" APPLIES `LOW_VOLUME_TIER_LEVELS` FOR THAT SPORT. "Experienced" APPLIES NOTHING — the
 * frame's own printed levels, p246 as transcribed. ⚠️ So this is a swap of the gate's INPUT, not a
 * new level system: the mapping is unchanged and `lowVolumeLevels` still owns it.
 */
export function experienceLevels(
  experience: EnduranceExperience | null | undefined,
): Record<string, Level> {
  const newer = (['run', 'ride'] as const).filter((sp) => experience?.[sp] === 'newer');
  return lowVolumeLevels(newer);
}

/**
 * ⛔ PLYO DOSE — the drill count and the stop rule are HIS; the effort count is OURS (pivot §8).
 *
 * p227: *"Throwing more than three or four plyometric movements together on a given day is likely a
 * waste of time. Each drill should be performed multiple times with ample rest… until the movement
 * is optimized for the day and the athlete develops confidence in it; then they move on. Fatigue,
 * poor form, and imprecise movements are all absolute no-no's."*
 *
 * So: **3 drills** (the low end of his own 3-4, because sets start low everywhere else in his
 * system), and the stop rule is his — quality, not a rep count. ⚠️ **The number of efforts per drill
 * is OURS**: he says "multiple times" and gives no figure. Three to five efforts is the field
 * standard for low-amplitude plyometrics and it is written here as a fixed, labelled number rather
 * than a range the engine picks from.
 */
export const PLYO_DOSE = {
  drillsPerDay: 3,
  effortsPerDrill: 4,
  drillCountIsHis: 'Viada p227 — more than three or four is likely a waste of time',
  effortCountIsOurs:
    'The source says each drill is performed "multiple times with ample rest" and gives no number. '
    + 'Four efforts is ours, from field practice for low-amplitude plyometrics.',
  stopRule:
    'Stop each drill when the movement is optimised for the day and it feels confident — not on a '
    + 'rep count. Fatigue, poor form and imprecise movements are the signal to move on.',
  stopRuleIsHis: 'Viada p227',
};
