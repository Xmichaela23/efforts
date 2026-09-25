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
import type { TestedLift } from './working-number.ts';

/**
 * ⛔ TWO FRAMES ON A DIAL, NOT A REPLACEMENT (DESIGN-standard-focus-all-rounder-2026-08-30 §2).
 * `strength_5k` is FROZEN AS A DESIGN — stop shaping new work around its quirks — and still fully
 * guarded by its tests, because both frames share the composer, the materializer and the progression.
 */
export type FrameId = 'strength_5k' | 'strength_half' | 'hyp_5k' | 'hyp_half' | 'all_rounder' | 'cycling_base';

/**
 * ⛔⛔⛔ WHETHER THIS FRAME ASKS FOR A WEEKLY HOURS TOTAL AT ALL — Michael, 2026-08-31:
 * *"you get prescribed the time for your hard sessions."*
 *
 * ⛔ THE ALL ROUNDER STOPPED ASKING. Its screen takes a length PER SESSION on the easy and long rows
 * and prescribes the quality doses; there is no weekly hours box on it any more. The wizard already
 * declines to send `target_run_hours` for it — but the composer will still act on the field if it
 * arrives from anywhere else, and it does: a draft saved before the hours box came off, an older
 * client, or a restate re-composing from a plan row that stored one.
 *
 * ⛔⛔ AND WHAT IT DOES THEN IS ADD SESSIONS THE ATHLETE NEVER PICKED. Measured: with a five-hour run
 * ask, this frame's week gains **two easy runs — one on the legs day and one on the REST day.**
 * Those are the exact two days p274 leaves clear, and a filler landing on them is a defect this
 * codebase has already fixed once from a different direction.
 *
 * ⚠️ IT IS THE SAME RULING AS `weekIsDayOrdered` ON THE SCREEN, seen from the engine side: a frame
 * that lays its week out day by day is a frame that asks per session. The literal lives in two
 * places because the two modules do not share one — **if a third frame arrives, both need editing,
 * and this note is the pointer between them.**
 */
export function frameAsksWeeklyHours(frame: FrameId): boolean {
  // ⚠️ READ OFF THE FRAME'S DECLARATION (2026-09-13, the third frame) — see `Frame.laysOutWeekByDay`.
  return !FRAMES[frame].laysOutWeekByDay;
}

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
  /**
   * ⛔⛔⛔ THE MUSCLE THE PAGE NAMES FOR THIS CELL, WHERE IT NAMES ONE (2026-08-30). The catalogue's
   * own prime-mover word, so the picker and the composer can both narrow to it without either of
   * them re-deriving what the page said.
   *
   * ⛔ THE DEFECT IT CLOSES, AND IT REACHED MICHAEL'S SCREEN. **p274 names a MUSCLE on its two
   * lower-day focused rows — `1 × HYP: focused quadriceps` and `1 × HYP: focused hamstring` — where
   * p246 names only the CATEGORY (`focused push lower`).** p223's list for that category is *"leg
   * extensions · hip adduction machine · weighted knee raises (hip flexors) · seated calf raises"*,
   * and only the first is quadriceps — Viada annotates the hip-flexor one himself. With a leg
   * extension machine on file the cell defaults to it and nobody notices; **without one, p274's
   * quadriceps row fell through to a seated calf raise**, which is what the live screen showed. The
   * handoff had already recorded the composer's own version of it: *"Day 5's Leg isolation slot
   * filled with a Weighted Knee Raise, a core movement in a leg slot."*
   *
   * ⚠️ THE SAME CELL BIT THE HAMSTRING ROW TOO, one movement further: `cable kickback` is filed in
   * the catalogue as a TRICEPS movement, so p274's `focused hamstring` cell could be filled by an
   * arm exercise. p223's *"cable or machine kickbacks"* on that row plainly means the glute/ham one.
   *
   * ⛔ IT IS READ BY BOTH SIDES, AND THAT IS THE POINT. Narrowing only the dropdown would leave the
   * composer free to put a calf raise in a quad row with no athlete involved — which is how it got
   * there in the first place. `exerciseForSlot` filters on it and drops the slot when nothing
   * matches, so the week says *"N exercises short"* rather than quietly filling it wrong.
   *
   * ⚠️ ABSENT MEANS THE PAGE NAMED NO MUSCLE, and every slot written before this reads exactly as it
   * did. **p246 is untouched** — its rows name categories, so none of them carry this.
   *
   * ⛔⛔ AND THE ARMS SUPERSET CARRIES NONE, BY RULING — MICHAEL, 2026-08-30: ***"follow the book."***
   *
   * p274 prints `2 × HYP: focused push/pull (arms) superset` on days 1 and 4, and the parenthetical
   * says ARMS. **But p223's own lists for those two categories are mixed in his printing**: focused
   * push/arms holds triceps pushdowns, Tate press and skull crushers AND pec deck AND lateral
   * raises; focused pull/arms holds preacher, spider and drag curls AND rear delt machine AND
   * pullover machine. The parenthetical and the category list disagree **on the page**.
   *
   * ⛔ THE RULING IS THAT THE LISTS WIN. *"The '(arms)' parenthetical does not override his own
   * category lists."* So those four cells are left exactly as they are — they build chest flyes and
   * rear-delt work today and that is correct, not a crossing to fix. **Narrowing them to biceps and
   * triceps would delete pec deck and lateral raises, movements he prints in that very list**, which
   * is the app editing the book rather than following it.
   *
   * ⚠️ THIS IS THE LINE BETWEEN THE TWO CASES, AND IT IS WORTH HOLDING: a `muscle` is stated where
   * the page names one AND his list for that cell agrees with it (focused quadriceps → p223's quad
   * row; braced push upper → p221's three chest presses). It is NOT stated where the page's word and
   * his own list pull apart. **The field records what the source settles, never what it leaves
   * open.**
   */
  muscle?: string;
  /**
   * ⛔⛔⛔ MOVEMENTS THE PAGE NAMES ON THIS ROW WHOSE PRIME MOVER DISAGREES WITH `muscle` — an
   * explicit, per-cell exception to the muscle law (Michael, 2026-08-30, on his standing
   * *"follow the book"* precedent).
   *
   * ⛔ THE CASE IT EXISTS FOR. p223's row is headed *"Focused hinge lower/hamstrings"* and the FIRST
   * movement it names is the hip thrust — which the catalogue tags `glutes`, correctly by field
   * standard. So p274's `1 × HYP: focused hamstring` cell and the movement's own tag disagree, and
   * the muscle law removed a movement Viada prints first in that very row.
   * ⛔ THE RULING IS THE SAME ONE HE GAVE ON THE ARMS SUPERSET: **where the page's own list and a tag
   * pull apart, the list wins.** The muscle law still governs everything the page does not name.
   *
   * ⚠️ IT IS A NAMED LIST, NEVER A SECOND MUSCLE. Admitting `glutes` wholesale would let clamshells
   * and glute bridges into a hamstring row; naming his movements admits exactly what he printed and
   * nothing else. Every entry has to be traceable to the page.
   * ⚠️ AND IT ADMITS THE EXECUTIONS OF THOSE MOVEMENTS TOO — p223 prints the machine and Smith
   * versions, and a barbell hip thrust is the same movement at a kit with no machine, so it is named
   * here rather than being left to a muscle filter that would reject it.
   */
  alsoAdmits?: string[];
  /**
   * ⛔ THE MOVEMENT THIS SLOT OPENS ON, IN ORDER, WHERE THE PAGE'S OWN LIST GIVES ONE (2026-09-11
   * audit). Read by the composer's grid path before its equipment ranking: the first the kit reaches
   * and the day has not used. It never widens the cell — a name not in the slot's own pool is
   * skipped — so the preference is a choice among the page's movements, not an addition to them.
   * Absent leaves the ranking exactly as it was.
   */
  prefer?: string[];
  /**
   * ⛔ THE SWAP SHEET ON THIS ROW OFFERS THE PAGE'S SECONDARY LIFTS (Michael, 2026-09-11: "keep the
   * compounds for now, add the secondaries in swap in the logger"). p274 prints the ME rows as
   * `secondary push / hinge / pull / push`; the row opens on the competition lift (p275 allows it)
   * and the logger's swap lists p220's own movements for the pattern, kit-gated, with the competition
   * lift kept so the athlete can come back. Set on the All Rounder's ME rows only — p246's ME rows
   * print "Primary", and a swap list there would be adding to that page.
   */
  swapSecondaries?: boolean;
  /** What the page prints, kept verbatim so a reader can find the row. */
  sourceText: string;
};

/**
 * ⛔ p220 SECONDARY, BY PATTERN, IN HIS PRINTED ORDER — the swap list for a `swapSecondaries` row.
 * "Bench reverse hyper" is the catalogue's `weighted reverse hyper`; "forward or reverse lunge" is
 * the two lunges; "DB pullovers" is `dumbbell pullover`.
 */
export const SECONDARY_BY_PATTERN: Record<ViadaPattern, string[]> = {
  push_upper: ['larsen press', 'incline bench press', 'close grip bench press', 'jm press', 'seated db press', 'arnold press'],
  pull_upper: ['kroc row', 't bar row', 'meadows row', 'gorilla row', 'dumbbell pullover'],
  hinge_lower: ['romanian deadlift', 'stiff-legged deadlift', 'weighted reverse hyper', 'good morning', 'kb swing', 'sandbag throw'],
  press_lower: ['split squat', 'zercher squat', 'freestanding barbell calf raise', 'walking lunge', 'reverse lunge'],
};

export type EnduranceSlot = {
  family: FamilyId;
  level: Level;
  /** ⚠️ p247's own refinement of the slot, where it gives one. */
  archetype?: string;
  /**
   * ⛔⛔⛔ THE SHAPES THIS SLOT ROTATES THROUGH, WHERE THE PROGRAMME NAMES MORE THAN ONE (2026-09-08).
   *
   * ⛔ WHY IT IS ON THE FRAME AND NOT ON THE FAMILY. p247 asks Wednesday's near-threshold session for
   * **5- to 8-minute work intervals**, and that filter picks exactly three of p234's level-3 lines.
   * It is a statement about THIS PROGRAMME'S Wednesday, not about the near-threshold family — the
   * All Rounder's day 3 is the same family at level 2 and is governed by nothing of the sort. A
   * filter living on the family would change both weeks; living here it changes one.
   *
   * ⛔ AND THE ROTATION IS p112: hold the load and vary *"across slightly different set durations
   * and intensities"* session to session. `composeWeek` walks this list by week, the same rule
   * `rotatedArchetype` applies to a slot the frame leaves open — which is what day 1 does.
   *
   * ⚠️ IT REPLACES `archetype`, NEVER JOINS IT. A slot states one shape or a rotation, and carrying
   * both would leave two answers to one question. ⚠️ A sport substitution drops it: these are run
   * sessions and a slot ridden instead takes its own family's shapes.
   */
  archetypes?: string[];
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
  /**
   * ⛔ THIS SLOT IS THE SECOND HALF OF THE SLOT BEFORE IT — ONE RUN, NOT TWO (2026-09-23).
   * p245 (Hypertrophy + 5K): *"Monday's session is a single run with two components. A sprint workout should be chosen
   * (level 1), and the cooldown removed. The second section of the run should be chosen from the MLSS+ workouts, with
   * the warm-up removed."* p253 (Hypertrophy + Half-Marathon): *"The MLSS+ session should flow directly into the VT1
   * work, with the latter serving as an extended 'cooldown' for the former."*
   * ⚠️ BUILT AS TWO ROWS ON ONE DAY, TAGGED AS ONE (`JOINED_TAG`): the first loses its cooldown, this one its warm-up;
   * this one always lands on the first one's day, takes no hard pick of its own, is not a row on the runs screen, and
   * is not counted as a second session by the week's warnings. No existing slot builds two families as one row.
   */
  joinsPrevious?: boolean;
  sourceText: string;
};

/** ⛔ The tag on both rows of a joined run (`EnduranceSlot.joinsPrevious`), and the one on its second half. */
export const JOINED_TAG = 'one_run';
export const JOINED_PART_TAG = 'one_run_part2';
/** The slot key's second half, where the frame joins it to the slot before (`${day}:${i}`). */
export const isJoinedSlot = (slot: { joinsPrevious?: boolean } | null | undefined): boolean => slot?.joinsPrevious === true;

export type FrameDay = {
  day: number;
  label: string | null;
  strength: StrengthSlot[];
  endurance: EnduranceSlot[];
  /** Day 3 only. p227 governs the dose; see `PLYO_DOSE`. */
  plyo?: boolean;
  /** ⛔ HOW MANY PLYO DRILLS THE PAGE PRINTS FOR THE DAY ("Plyo x 2", p250). Absent = the full day's drills. */
  plyoCount?: number;
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

/**
 * ⛔ THE RUN + STRENGTH WEEK'S RUN LENGTHS (WORKORDER-run-strength-rotate-2026-09-07), moved here from
 * the phone (2026-09-10, audit H-P06). The screen asks one thing — how long the long run is — and
 * states the easy run. The long run's chips are the lengths `slotLengthOptions` says the `run_lsd`
 * ladder builds exactly, up to the ceiling below; the server works them out and the phone prints them.
 */
export type RunStrengthWeek = {
  /**
   * p246's VT1 slot at level 1, whose ladder is 25 to 30 minutes (p235: *"the level refers almost
   * strictly to duration"*). 30 is the top of that rung and builds exactly.
   */
  easyRunMinutes: number;
  /**
   * OURS — Michael, 2026-09-07: the chips stop one rung short of p247's 100-minute long-run cap, so a
   * default never touches the cap.
   */
  longRunChipCeilingMinutes: number;
  /** OURS — Michael, 2026-09-07: the middle chip opens selected. */
  longRunDefaultMinutes: number;
  /**
   * ⛔ THE LONG RUN'S LENGTH CAP WHEN THIS PLAN STATES ITS OWN (2026-09-22). Absent = the family cap (`run_lsd: 100`,
   * p247's Strength + 5K). Strength + Half-Marathon's long run is level 3, 1.5h to 2–2.5h (p235).
   */
  longRunCeilingMinutes?: number;
  /**
   * ⛔ THE LONG RUN'S THREE CHIPS (Michael, 2026-09-23: three tiers, not five-minute steps; the first is selected).
   * Each is inside the level's buildable band, so the week builds the minutes on the chip.
   */
  longRunChips: number[];
  /** Chips for an easy run printed above level 1 (Run Lead's day 4, VT1 level 2 = 45–60 min, p235). First selected. */
  easyRunChipsByLevel?: Partial<Record<number, number[]>>;
  /** An easy run printed above level 1 shows its level's range (Viada p235: VT1 level 2 is 45–60 min). */
  easyRunRangeByLevel?: Partial<Record<number, [number, number]>>;
  /** ⛔ p247's "one or two VT1 sessions" for more advanced runners — Strength + 5K's own advice; other plans do not offer it. */
  offersExtraEasyRuns?: boolean;
};

export type Frame = {
  id: FrameId;
  /** ⛔ NEVER SHOWN TO AN ATHLETE (pivot §1). Internal only. */
  sourceName: string;
  // ⛔ THE ATHLETE-FACING NAME MOVED TO THE SERVER'S SETUP WORDING (2026-09-13): `setup-copy.ts`, `PLAN_COPY`.
  cite: string;
  /** ⛔ THE PROGRAM OWNS THIS (pivot §6). Not an athlete dial. */
  liftingDays: number;
  /**
   * The Run + Strength week's run lengths (2026-09-10, audit H-P06) — the numbers its one screen
   * states and sends. Only `strength_5k` carries them; see `RunStrengthWeek`.
   */
  runStrengthWeek?: RunStrengthWeek;
  columns: Record<ColumnKind, FrameDay[]>;
  /** His rate anchor for THIS frame — see `RATE_ANCHOR`. */
  workingNumberRatePerWeek: number;
  /**
   * ⛔⛔ THE BARBELL LIFTS THIS FRAME'S WEEK LOADS (Michael, 2026-09-13: *"you're using what the app
   * tests against what the plan requires and creating an unnecessary gate"*). The 65 lb entry check
   * and the week-one test ask about THESE lifts and no others. Read the declaration, never the id.
   * ⚠️ `strength_5k` and `all_rounder` declare all four, so both behave exactly as before.
   */
  testedLifts: TestedLift[];
  /**
   * ⛔ THE FRAME LAYS ITS WEEK OUT DAY BY DAY AND ASKS PER SESSION, NOT FOR A WEEKLY HOURS TOTAL —
   * the declaration behind `frameAsksWeeklyHours` (engine) and `weekIsDayOrdered` (screen), which
   * both tested `=== 'all_rounder'` until a third frame arrived.
   */
  laysOutWeekByDay: boolean;
  /**
   * ⛔ THE ENDURANCE SPORTS THIS FRAME'S WEEK MAY CARRY. A sport not listed here is fenced off the mix
   * and the day counts (`fenceMixToFrame`), so a rides-only week can never gain filler runs. `swim`
   * means the easy-swim add-on is allowed.
   * ⚠️ Whether a RUN row may be ridden is a separate question — `RIDE_SUBSTITUTION_FRAMES`.
   */
  enduranceSports: Array<'run' | 'ride' | 'swim'>;
  /**
   * ⛔ THE FRAME'S HARD SESSIONS ARE NOT OPT-IN. Absent, a hard slot answered `'none'` converts to the
   * easy session (`declineHardSlot`, the Run + Strength and All Rounder ruling). p278's quality rides
   * are the week (p109: at least one speed and one sub-threshold session; p119: no kind of session
   * disappears), so on that frame a `'none'` answer is fenced off.
   */
  hardSessionsFixed?: boolean;
  /**
   * ⛔ THE WEEK IS THE PAGE'S SESSIONS AT THE PAGE'S LEVELS, AND NOTHING THE ATHLETE TYPES ADDS OR
   * CLIMBS ONE (p278, Michael 2026-09-13: nothing is added to a week that p278 does not print; rides do
   * not get longer week to week). Read once at the top of `composeWeek`.
   */
  printedWeekOnly?: boolean;
  /**
   * ⛔ THE ONE RIDE A SHORTER WEEK LEAVES OUT, AND HOW MANY RIDES TRIGGER IT (p278, Michael
   * 2026-09-13: the Day 2 easy ride comes out of the 4-ride week). p119: no kind of session
   * disappears; p109: at least one speed and one sub-threshold session stay; p134: easy volume is cut
   * before quality. Read by `composeWeek` against `SportMix.rideCount`, in both columns.
   */
  fewerRidesDropsSlot?: { rideCount: number; day: number; index: number };
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
      // p246 day 1, standard column: row text verbatim (SOURCE-viada Part E1a)
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('ME', 'accessory', 'primary', 'pull_upper', '1 x ME: Accessory: primary pull'),
      /**
       * ⛔ THE SAME RULE AS THE OTHER FRAME'S DAY-1 SPEED CELL, applied here so the rule is the
       * TEMPLATE'S and not one programme's (2026-09-01). `frame-rules.test.ts` asserts every frame's
       * standard week presses overhead and trains every lift it tests; this frame failed both for
       * the identical reason — ranking on equipment fit alone lands on a bench variant, and half of
       * p220's own secondary push list was never reached.
       * ⚠️ Same mechanism, same labelling: the muscle is ours, the pairing and the movement list are
       * his, and `alsoAdmits` names the barbell press for the athlete whose kit reaches nothing else.
       */
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: Accessory: secondary push', {
        muscle: 'deltoids',
        // ⚠️ HIS SECONDARIES FIRST, HIS PRIMARIES BEHIND THEM — see the other frame's day-1 cell.
        alsoAdmits: [
          'seated db press', 'arnold press',
          'overhead press', 'military press', 'standing barbell overhead press', 'push press',
        ],
      }),
      // p246 day 1 (cont.) and its endurance cell MLSS+ (level 2), verbatim
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
      S('DE', 'accessory', 'secondary', 'hinge_lower', '1 x DE: Accessory: secondary hinge lower', {
        /**
         * ⛔ p220's SECONDARY HINGE LOWER LIST, WHOLE (Michael, 2026-09-13, off the page photo): Romanian
         * deadlift · stiff-legged deadlift · bench reverse hyper · good morning · KB swing · sandbag throw.
         * The swing and the bench reverse hyper are filed in other categories of the catalogue, so they
         * are named here to be fetched. This row built a hip thrust, which p220 does not print for it.
         */
        alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'],
      }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 X HYP: Accessory: accessory lower', {
        /**
         * ⛔ THE HIP THRUST IS THIS ROW'S DEFAULT (Michael, 2026-09-13, off the page photos). The page prints
         * no list for "accessory lower"; p247 defines an accessory as a non-competition lift in a similar
         * movement pattern. The catalogue files the hip thrust under the hinge pattern, so it is named here.
         */
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  /**
   * ⛔⛔ WEDNESDAY ROTATES p234'S THREE QUALIFYING LEVEL-3 SESSIONS (2026-09-08) — see
   * `EnduranceSlot.archetypes` for the ruling and `source-rules.ts` for the filter's own working.
   *
   * ⛔ IT WAS PINNED TO `below_threshold`, AND THAT PIN WAS WRONG ON THE PAGE. That shape's
   * four-minute repeat is p234's LEVEL 2 line (*"6 rounds of: 4 min @ 90%"*); at level 3 the count
   * climbed to eight and the length did not, producing *"8 × 4 min @ 90%"* — a session p234 does not
   * print at any level. p247 asks this slot for 5- to 8-minute work intervals, and the three lines
   * below are the level-3 sessions that satisfy it.
   */
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 3, 'NT (level 3)', { archetypes: ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85'] })], plyo: true },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      // p246 day 4, standard column: row text verbatim
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'secondary', 'push_upper', '1 x HYP: Accessory: secondary push'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    // p246 day 4 endurance cell: VT1 (level 1)
    // ⛔ THE WEEK'S ECONOMY WORK RIDES ON THIS SLOT — see `EnduranceSlot.carriesStrides`. It is the
    // lightest running session in the week and it sits after the hardest day and before the long one.
    endurance: [E('run_vt1', 1, 'VT1 (level 1)', { carriesStrides: true })],
  },
  {
    day: 5,
    label: 'DE: Lower',
    lowerRole: 'de',
    strength: [
      // p246 day 5, standard column: row text verbatim
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)', { rotatesWith: 'press_lower' }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: secondary push lower'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Accessory: focused push lower'),
    ],
    endurance: [],
  },
  // p246 day 6 endurance cell: LSD (level 2)
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
      // p246 day 1, taper column: row text verbatim, endurance MLSS+ (level 1)
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
        /**
         * ⛔ THE HIP THRUST IS THIS ROW'S DEFAULT (Michael, 2026-09-13, off the page photos). The page prints
         * no list for "accessory lower"; p247 defines an accessory as a non-competition lift in a similar
         * movement pattern. The catalogue files the hip thrust under the hinge pattern, so it is named here.
         */
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  {
    day: 3,
    label: null,
    strength: [],
    // p246 day 3, taper column: NT (race tempo) (level 1)
    endurance: [E('run_near_threshold', 1, 'NT (race tempo) (level 1)', { archetype: 'below_threshold', raceTempo: true })],
    plyo: true,
  },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      // p246 day 4, taper column: row text verbatim
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
      // p246 day 5, taper column: row text verbatim
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
 * ⛔⛔ STRENGTH + HALF-MARATHON (p250), "5HR + Strength" — transcribed from `p250.jpg` 2026-09-22 (Michael: "let's build
 * it … more running, slower weight progression, geared for 1/2 marathon performance"). Notes: p251.
 *
 * The lifting is p246's four days with the page's own substitutions: a SKILL accessory where p246 has DE, BRACED
 * accessories (p221–222), and plyo on days 1, 3 and 6. The running is five runs: MLSS+ (2), NT (2), VT1 (2), LSD (3) and
 * a VT1 (1) on day 7 — so the STANDARD WEEK HAS NO REST DAY (the taper column's day 7 is REST). p251: "more advanced
 * hybrid athletes", "not recommended as a first program", "not for novices"; 1RM "1% every four weeks or so".
 * ⚠️ READING OF THE PAGE: "LSD (level 3)" is set between the day 6 and day 7 rows; p251's "the occasional longer LSD run on
 * Saturday" and "fatigue … after the weekend" put it on day 6 (Saturday) and the VT1 (level 1) on day 7.
 * ⚠️ "Plyo x N" is read as N plyometric drills (`plyoCount`); the page gives no other meaning for the count.
 */
const STRENGTH_HALF_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      // p250 day 1, standard column: row text verbatim
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'pull_upper', '1 x SKILL: Accessory: primary pull'),  // Viada p250
      // ⛔ THE DUMBBELL BENCH PRESS OPENS THE ROW WHERE NO MACHINE IS REACHABLE (Michael, 2026-09-16 — the ruling on
      // p274's braced push row, `VIADA_PICKS.braced_push.subLeadWith`, carried to this frame's row 2026-09-24 so the
      // two frames agree; this row has no pick key, so the frame says it). Inert where p221's machines are reachable.
      S('DE', 'accessory', 'braced', 'push_upper', '1 x DE: Accessory: braced push', { prefer: ['dumbbell bench press'] }),  // Viada p250
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),  // Viada p250
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Accessory: focused pull, focused push'),  // Viada p250
    ],
    endurance: [E('run_mlss', 2, 'MLSS+ (level 2)')],
    plyo: true,
    plyoCount: 1,
  },
  {
    day: 2,
    label: 'ME: Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate with primary push)', { rotatesWith: 'press_lower' }),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'press_lower', '1 x SKILL: Accessory: primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),  // Viada p250
      // ⛔ THE BENCH REVERSE HYPER FIRST WHERE NO STATION IS (2026-09-24, minimum-kit work order B1/B2): p222's four
      // braced hinge movements are machines, and the floor back extension that filled this row on a home kit is
      // deleted. p220 prints the bench reverse hyper (`weighted reverse hyper`), a torso-supported hinge on the
      // minimum kit's bench, as the same frames admit it on p244/p252/p274's braced hinge row. `prefer` is inert
      // where his machines are reachable. OURS — the choice among the reachable p220 movements.
      S('DE', 'accessory', 'braced', 'hinge_lower', '1 x DE: Accessory: braced hinge lower', { prefer: ['weighted reverse hyper'] }),  // Viada p250
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory lower', {  // Viada p250
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  // p250 day 3: Plyo x 2, NT (level 2). p251: half-marathoners may choose NT workouts at 92 to 97 percent.
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 2, 'NT (level 2)')], plyo: true, plyoCount: 2 },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),  // Viada p250
      S('DE', 'accessory', 'braced', 'pull_upper', '1 x DE: Accessory: braced pull'),  // Viada p250
      /**
       * ⛔ THE WEEK'S OVERHEAD PRESS, THE SAME WAY 4HR GETS ONE (frame-rules RULE 1 / RULE 4). p220's secondary push list
       * holds two overhead presses (seated DB press, Arnold press); the muscle is ours, the list is his, and the barbell
       * presses are admitted behind them for a kit that reaches nothing else — see STRENGTH_5K_STANDARD day 1.
       */
      S('HYP', 'accessory', 'secondary', 'push_upper', '1 x HYP: Accessory: secondary push', {  // Viada p250
        muscle: 'deltoids',
        alsoAdmits: [
          'seated db press', 'arnold press',
          'overhead press', 'military press', 'standing barbell overhead press', 'push press',
        ],
      }),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),  // Viada p250
    ],
    // p250 day 4 endurance cell: VT1 (level 2)
    endurance: [E('run_vt1', 2, 'VT1 (level 2)', { carriesStrides: true })],
  },
  {
    day: 5,
    label: 'DE: Lower',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),  // Viada p250
      // The bench reverse hyper first where no station is (2026-09-24) — see day 2's braced hinge row.
      // ⚠️ `prefer` only, no `alsoAdmits`: the row rotates to press lower on even weeks, and an admitted hinge movement
      // is fetched across patterns — it would have filled the leg-press weeks too. The ladder already reaches the
      // bench reverse hyper on the hinge weeks; on the press weeks the name is not in the cell and `prefer` is inert.
      S('SKILL', 'accessory', 'braced', 'hinge_lower', '1 x SKILL: Accessory: braced hinge lower (rotate with braced push lower)', { rotatesWith: 'press_lower', prefer: ['weighted reverse hyper'] }),  // Viada p250
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: secondary push lower'),  // Viada p250
      // ⚠️ p250 prints "focused push" on the lower day; read as the lower-body focused push, as p246 day 5 prints it.
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Accessory: focused push'),  // Viada p250
    ],
    endurance: [],
  },
  // p250 day 6: Plyo x 1, LSD (level 3) — see the reading note above.
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 3, 'LSD (level 3)', { archetype: 'long_with_inserts' })], plyo: true, plyoCount: 1 },
  // p250 day 7: VT1 (level 1). No rest day in the standard column.
  { day: 7, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1)')] },
];

const STRENGTH_HALF_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      // p250 day 1, taper column: row text verbatim
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'pull_upper', '1 x SKILL: Accessory: primary pull'),  // Viada p250
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),  // Viada p250
    ],
    // p250 prints "1 x NT (level 1–2)"; OURS — the lower of the page's two levels.
    endurance: [E('run_near_threshold', 1, '1 x NT (level 1-2)')],
  },
  {
    day: 2,
    label: 'ME: Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate)', { rotatesWith: 'press_lower' }),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'press_lower', '1 x SKILL: Accessory: primary push lower'),  // Viada p250
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {  // Viada p250
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  // p250 day 3, taper: Plyo x 2, VT1 (level 1–2); OURS — the lower of the page's two levels.
  { day: 3, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1-2)')], plyo: true, plyoCount: 2 },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'pull_upper', '1 x SKILL: Accessory: primary pull'),  // Viada p250
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),  // Viada p250
    ],
    endurance: [],
  },
  {
    day: 5,
    label: 'DE: Lower',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate)', { rotatesWith: 'hinge_lower' }),  // Viada p250
      S('SKILL', 'accessory', 'primary', 'hinge_lower', '1 x SKILL: Accessory: primary hinge lower'),  // Viada p250
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {  // Viada p250
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  // p250 day 6, taper: Plyo x 1, VT1 (level 2).
  { day: 6, label: null, strength: [], endurance: [E('run_vt1', 2, 'VT1 (level 2)')], plyo: true, plyoCount: 1 },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔⛔ HYPERTROPHY + 5K (p244, notes p245) — "Strength Lead + Muscle". Transcribed from `p244.jpg` 2026-09-23,
 * `SOURCE-viada-hybrid-athlete.md` Part E4. Work order: `WORKORDER-run-programs-2026-09-23.md` Stage 1.
 *
 * Four lifting days named for their pattern (upper push, lower hinge, upper pull, lower push), five or six rows each,
 * a plyo warm-up on day 3, an LSD on day 6, day 7 REST. Running: day 1 is ONE run of two parts (sprint/power level 1
 * then MLSS+ level 1, p245 — `joinsPrevious`), NT (3) on day 3, VT1 (1) on day 4, LSD (2) on day 6.
 * p245: "hybrid training at its most basic", "can be used by athletes of most levels", "If you're interested in a first
 * program to start with in this book, this is the one." 1RM: "assume 1 percent every 3 weeks as a starting point".
 *
 * ⛔ THE DAY-OPENING ROWS ARE PRINTED "Secondary" AND OPEN ON THE COMPETITION LIFT — the All Rounder's ruling (Michael,
 * 2026-09-11) on the same notation (p274 prints `ME: secondary push`), and p245's own strength note: *"The lifting days
 * usually begin with a max effort or dynamic effort lift. These are lifter preference but will typically be a compound
 * barbell movement."* The page's secondaries are the row's swap (`swapSecondaries`). OURS — see the ledger.
 * ⚠️ THE SUPERSETS ARE ADJACENT ROWS, as on p274 (`ALL_ROUNDER_STANDARD`'s note): "2 x HYP: X/Y superset" is one X row
 * and one Y row. Nothing in the app pairs exercises today.
 * ⚠️ NO OVERHEAD PRESS IS PRINTED, SO NONE IS BUILT. The page's one row whose list holds one (p220 secondary push: seated
 * DB press, Arnold press) is day 1's opener, which opens on the bench under the ruling above; the overhead presses are its
 * swap. The All Rounder's built press sits in a separate DE secondary push cell that p244 does not print.
 * `frame-rules.test.ts` skips its press check here (`PRINTS_NO_OVERHEAD_PRESS`).
 */
/** Viada p229-231: the five sprint/power shapes the library builds, rotated week to week ("alternate", p229). */
const SPRINT_ROTATION = ['short_max', 'speed_endurance', 'flying_short', 'flying_long', 'mixed_150'];

const HYP_5K_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'Upper body hypertrophy: Push primary',
    strength: [
      // p244 day 1, standard column: row text verbatim
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Secondary push', { swapSecondaries: true }),  // Viada p244
      // p221 braced push upper is three chest presses, and braced pull upper is rows and the pulldown — see ALL_ROUNDER_STANDARD.
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p244
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Focused push'),  // Viada p244
    ],
    // p244 day 1: "1 x Sprint/power (level 1)" and "1 x MLSS+ (level 1)"; p245: one run, the sprint's cooldown and the
    // MLSS+'s warm-up removed, "around 45 to 50 minutes of total training time".
    endurance: [
      // p229: "I encourage you to try each type of workout in each segment… alternate" — all five of the library's
      // p230-231 shapes, rotated week to week. The watch gets no pace target on three of them (session-vocabulary.ts).
      E('run_sprint_power', 1, '1 x Sprint/power (level 1)', { role: 'hard', archetypes: SPRINT_ROTATION }),
      E('run_mlss', 1, '1 x MLSS+ (level 1)', { role: 'hard', joinsPrevious: true }),
    ],
  },
  {
    day: 2,
    label: 'Lower body hypertrophy: Hinge primary',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'hinge_lower', '1 x DE: Secondary hinge', { swapSecondaries: true }),  // Viada p244
      // p220 secondary hinge lower, whole: the swing and the bench reverse hyper are filed elsewhere in the catalogue.
      S('HYP', 'accessory', 'secondary', 'hinge_lower', '1 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'quadriceps' }),  // Viada p244
      // p223 names the hip thrust first in the hamstrings row — see ALL_ROUNDER_STANDARD day 2.
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: Focused hamstring', {  // Viada p244
        muscle: 'hamstrings',
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
      }),
      // p245: "Each lower body day finishes with a braced DE or skill asymmetrical push movement" — split squats among them.
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: Braced push (asymmetrical)', { asymmetrical: true, prefer: ['bulgarian split squat', 'reverse lunge'] }),  // Viada p244
    ],
    endurance: [],
  },
  // p244 day 3: "Plyo warmup", NT (level 3). p245: "NT workouts with 5- to 8-minute work intervals" — p247's words, so the
  // same three level-3 sessions as STRENGTH_5K_STANDARD day 3.
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 3, 'NT (level 3)', { archetypes: ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85'] })], plyo: true },
  {
    day: 4,
    label: 'Upper body hypertrophy: Pull primary',
    strength: [
      S('ME', 'competition', 'primary', 'pull_upper', '1 x ME: Secondary pull', { swapSecondaries: true }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p244
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Focused pull'),  // Viada p244
    ],
    // p244 day 4: VT1 (level 1). The week's strides ride here, as on p246's day 4 (STRENGTH_5K_STANDARD).
    endurance: [E('run_vt1', 1, 'VT1 (level 1)', { carriesStrides: true })],
  },
  {
    day: 5,
    label: 'Lower body hypertrophy: Push primary',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Secondary push', { swapSecondaries: true }),  // Viada p244
      S('HYP', 'accessory', 'secondary', 'hinge_lower', '1 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'quadriceps' }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Focused quadriceps', { muscle: 'quadriceps' }),  // Viada p244
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: Braced push (asymmetrical)', { asymmetrical: true, prefer: ['reverse lunge', 'walking lunge', 'bulgarian split squat'] }),  // Viada p244
    ],
    endurance: [],
  },
  // p244 day 6: LSD (level 2). p245's Saturday LSD words are p247's ("up to 90 to 100 minutes… LT intervals… fartlek").
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 2, 'LSD (level 2)', { archetype: 'long_with_inserts' })] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ p244's TAPER/DELOAD COLUMN, BOTH SIDES. Day 1's ME opener becomes DE and the single focused push comes off; day 2
 * loses the braced superset; day 4 loses the single focused pull; day 5's DE opener and asymmetrical row become SKILL.
 * Running: sprint/power (level 1) alone on day 1, NT (race tempo) (level 1) on day 3, VT1 (level 1) on day 6.
 */
const HYP_5K_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'Upper body hypertrophy: Push primary',
    strength: [
      // p244 day 1, taper column: row text verbatim
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Secondary push'),  // Viada p244
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p244
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p244
    ],
    endurance: [E('run_sprint_power', 1, '1 x Sprint/power (level 1)', { role: 'hard', archetypes: SPRINT_ROTATION })],
  },
  {
    day: 2,
    label: 'Lower body hypertrophy: Hinge primary',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'hinge_lower', '1 x DE: Secondary hinge'),  // Viada p244
      S('HYP', 'accessory', 'secondary', 'hinge_lower', '1 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: Focused hamstring', {  // Viada p244
        muscle: 'hamstrings',
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
      }),
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: Braced push (asymmetrical)', { asymmetrical: true, prefer: ['bulgarian split squat', 'reverse lunge'] }),  // Viada p244
    ],
    endurance: [],
  },
  // p244 day 3, taper: Plyo warmup, NT (race tempo) (level 1) — the same cell as p246's taper day 3.
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 1, 'NT (race tempo) (level 1)', { archetype: 'below_threshold', raceTempo: true })], plyo: true },
  {
    day: 4,
    label: 'Upper body hypertrophy: Pull primary',
    strength: [
      S('ME', 'competition', 'primary', 'pull_upper', '1 x ME: Secondary pull'),  // Viada p244
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p244
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p244
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p244
    ],
    endurance: [],
  },
  {
    day: 5,
    label: 'Lower body hypertrophy: Push primary',
    // OURS — a SKILL opener is not the heavy leg day, so the day is marked as the lighter kind ('de').
    lowerRole: 'de',
    strength: [
      S('SKILL', 'competition', 'primary', 'press_lower', '1 x SKILL: Secondary push'),  // Viada p244
      S('HYP', 'accessory', 'secondary', 'hinge_lower', '1 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p244
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Focused quadriceps', { muscle: 'quadriceps' }),  // Viada p244
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: Braced push (asymmetrical)', { asymmetrical: true, prefer: ['reverse lunge', 'walking lunge', 'bulgarian split squat'] }),  // Viada p244
    ],
    endurance: [],
  },
  { day: 6, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1)')] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔⛔ HYPERTROPHY + HALF-MARATHON (p252, notes p253) — "Run Lead + Muscle". Transcribed from `p252.jpg` 2026-09-23,
 * `SOURCE-viada-hybrid-athlete.md` Part E5.
 *
 * The same four hypertrophy days as p244 in a different order — lower hinge, upper push, upper pull, lower push —
 * p253: *"the slight change in order, with the two upper body days only having one day between them, and the more
 * intense running sessions falling after the first leg day and between the two upper lifts."* Plyo x 2 on day 3.
 * Running: day 1 is ONE run (MLSS+ level 1 flowing into VT1 level 2, p253 — `joinsPrevious`), NT (2) on day 3, VT1 (2)
 * on day 4, LSD (3) on day 6 and VT1 (1) on day 7 — so the STANDARD WEEK HAS NO REST DAY (the taper's day 7 is REST).
 * ⚠️ READING OF THE PAGE: "LSD (level 3)" sits between the day 6 and day 7 rows, as on p250; read the same way
 * (Part E3's note): the LSD on day 6, the VT1 (level 1) on day 7.
 * p253: "intended for athletes with a solid strength background"; "can, like many others, be run almost indefinitely".
 * ⚠️ p253 PRINTS NO RATE for the 1RM — see RATE_ANCHOR.hyp_half.
 */
const HYP_HALF_LOWER_HINGE: FrameDay['strength'] = [
  // p252 day 1, standard and taper columns: row text verbatim
  S('DE', 'competition', 'primary', 'hinge_lower', '1 x DE: Secondary hinge', { swapSecondaries: true }),  // Viada p252
  S('HYP', 'accessory', 'secondary', 'hinge_lower', '2 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p252
  S('HYP', 'accessory', 'secondary', 'hinge_lower', '2 x HYP: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'quadriceps' }),  // Viada p252
  S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: Braced push (asymmetrical)', { asymmetrical: true, prefer: ['bulgarian split squat', 'reverse lunge'] }),  // Viada p252
];
const HYP_HALF_UPPER_PUSH: FrameDay['strength'] = [
  // p252 day 2: row text verbatim
  S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Secondary push', { swapSecondaries: true }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p252
  S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Focused push'),  // Viada p252
];
const HYP_HALF_UPPER_PULL: FrameDay['strength'] = [
  // p252 day 4: row text verbatim
  S('ME', 'competition', 'primary', 'pull_upper', '1 x ME: Secondary pull', { swapSecondaries: true }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: Braced pull', { muscle: 'lats' }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: Braced push', { muscle: 'chest' }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: Focused push/pull (arms) superset'),  // Viada p252
  S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: Focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Focused pull'),  // Viada p252
];
const HYP_HALF_LOWER_PUSH: FrameDay['strength'] = [
  // p252 day 5: row text verbatim
  S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Secondary push', { swapSecondaries: true }),  // Viada p252
  S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Secondary push'),  // Viada p252
  S('SKILL', 'accessory', 'secondary', 'hinge_lower', '1 x SKILL: Secondary hinge', { alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'] }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),  // Viada p252
  S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: Braced hinge/braced lower push superset', { muscle: 'quadriceps' }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'press_lower', '2 x HYP: Focused quadriceps/focused hamstring superset', { muscle: 'quadriceps' }),  // Viada p252
  S('HYP', 'accessory', 'focused', 'hinge_lower', '2 x HYP: Focused quadriceps/focused hamstring superset', {  // Viada p252
    muscle: 'hamstrings',
    alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
  }),
];

const HYP_HALF_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'Lower body hypertrophy: Hinge',
    lowerRole: 'de',
    strength: HYP_HALF_LOWER_HINGE,
    // p252 day 1: MLSS+ (level 1), VT1 (level 2); p253: the MLSS+ flows directly into the VT1, its extended cooldown.
    endurance: [
      E('run_mlss', 1, 'MLSS+ (level 1)', { role: 'hard' }),
      E('run_vt1', 2, 'VT1 (level 2)', { role: 'easy', joinsPrevious: true }),
    ],
  },
  { day: 2, label: 'Upper body hypertrophy: Push', strength: HYP_HALF_UPPER_PUSH, endurance: [] },
  // p252 day 3: Plyo x 2, NT (level 2). p253: half-marathoners may choose NT workouts at 92 to 97 percent.
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 2, 'NT (level 2)')], plyo: true, plyoCount: 2 },
  {
    day: 4,
    label: 'Upper body hypertrophy: Pull',
    strength: HYP_HALF_UPPER_PULL,
    // p252 day 4: VT1 (level 2). The week's strides ride here, as on p250's day 4.
    endurance: [E('run_vt1', 2, 'VT1 (level 2)', { carriesStrides: true })],
  },
  { day: 5, label: 'Lower body hypertrophy: Push', lowerRole: 'de', strength: HYP_HALF_LOWER_PUSH, endurance: [] },
  // p252 day 6: LSD (level 3) — see the reading note above.
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 3, 'LSD (level 3)', { archetype: 'long_with_inserts' })] },
  // p252 day 7: VT1 (level 1). No rest day in the standard column.
  { day: 7, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1)')] },
];

/**
 * ⛔ p252's TAPER/DELOAD COLUMN. The lifting is the standard column's, row for row (the page prints it again); only the
 * running comes down: sprint/power (level 1) on day 1, Plyo x 1 with NT (level 1) and VT1 (level 1) on day 3, VT1
 * (level 1) on day 4, LSD (level 1) on day 6, day 7 REST.
 * ⚠️ READING OF THE PAGE: the taper's endurance column sits lower than its strength column on the photo; NT (level 1) and
 * the first VT1 (level 1) fall inside day 3's band, the second VT1 (level 1) inside day 4's, and LSD (level 1) above REST.
 * ⚠️ Day 3's NT and VT1 are printed as two sessions; p253's "flow directly" is written of day 1 and is not applied here.
 */
const HYP_HALF_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'Lower body hypertrophy: Hinge',
    lowerRole: 'de',
    strength: HYP_HALF_LOWER_HINGE.map((s) => ({ ...s, swapSecondaries: undefined })),
    // p252 day 1, taper: 1 x Sprint/power (level 1) — the five shapes rotated, as on p244 (HYP_5K_STANDARD).
    endurance: [E('run_sprint_power', 1, '1 x Sprint/power (level 1)', { role: 'hard', archetypes: SPRINT_ROTATION })],
  },
  { day: 2, label: 'Upper body hypertrophy: Push', strength: HYP_HALF_UPPER_PUSH.map((s) => ({ ...s, swapSecondaries: undefined })), endurance: [] },
  {
    // p252 day 3, taper: Plyo x 1; NT (level 1), VT1 (level 1).
    day: 3, label: null, strength: [], plyo: true, plyoCount: 1,
    endurance: [E('run_near_threshold', 1, 'NT (level 1)'), E('run_vt1', 1, 'VT1 (level 1)')],
  },
  {
    day: 4,
    label: 'Upper body hypertrophy: Pull',
    strength: HYP_HALF_UPPER_PULL.map((s) => ({ ...s, swapSecondaries: undefined })),
    // p252 day 4, taper: VT1 (level 1).
    endurance: [E('run_vt1', 1, 'VT1 (level 1)')],
  },
  { day: 5, label: 'Lower body hypertrophy: Push', lowerRole: 'de', strength: HYP_HALF_LOWER_PUSH.map((s) => ({ ...s, swapSecondaries: undefined })), endurance: [] },
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 1, 'LSD (level 1)')] },
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
      /**
       * ⛔⛔ THE ME ROWS KEEP THE COMPETITION LIFTS (Michael, 2026-09-11, after the audit). p274
       * prints `1 × ME: secondary push / hinge / pull / push` and p275's reason — "break the
       * attachment you may have to the big three" — is written to a lifter who has plateaued on
       * them. Our customer is a runner or rider new to the bar, for whom the tested, priced
       * competition lift is the fastest strength; p275 allows it in as many words. The page's
       * secondaries (Larsen press, Romanian deadlift, Kroc row, split squat) are offered as the
       * SWAP on the row in the logger, not as the default. Considered and reverted the same day:
       * opening on the secondaries, by feel.
       */
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: secondary push', { swapSecondaries: true }),
      /**
       * ⛔⛔ THIS CELL IS THE DAY'S OVERHEAD PRESS, AND THE MUSCLE IS WHAT MAKES IT ONE (Michael,
       * 2026-09-01: *"there's really no overhead press work in that plan"*).
       *
       * ⛔ MEASURED, ON A COMPOSED WEEK. Nine movement patterns, and the built week covered eight:
       * horizontal push, both pulls, hinge, knee, calf, plyo — and **vertical pressing appeared only
       * as a lateral raise**, which is a raise and not a press. The athlete tests an overhead press
       * in week one and then never presses overhead again for twelve weeks.
       *
       * ⛔ THE MUSCLE FLOOR CANNOT CATCH IT AND THAT IS STRUCTURAL, not a bug in the floor. It counts
       * MUSCLES, and deltoids are already covered twice by the bench and the lateral raises — every
       * floor passes. A pattern is not a muscle.
       *
       * ⛔ AND HIS OWN LIST FOR THIS CELL CONTAINS THE ANSWER. p220's secondary push upper is
       * *Larsen press · incline bench press · close-grip bench press · JM press · **seated DB press**
       * · **Arnold press*** — two of the six are overhead presses. Nothing is being added to his
       * page; the cell is being pointed at the half of his own list that was never reached, because
       * ranking on equipment fit alone lands on a bench variant every time.
       *
       * ⚠️ **THE CHOICE OF DELTOIDS IS OURS AND THE PAIRING IS HIS.** p275 rule 2b pairs *"similar
       * muscle groups but dramatically different specific patterns and loads"* — a heavy bench then
       * a fast overhead press is exactly that, and the day still covers chest twice over (the ME
       * bench and the braced push cell, which states `chest`).
       *
       * ⛔ WHICH MOVEMENT, AND THE ORDER, IS SETTLED ON p275 — see `alsoAdmits` below. His
       * secondaries lead because his emphasis is deliberate; his primaries are admitted behind them
       * because he permits them in as many words.
       *
       * ⚠️ p220 FILES SECONDARY AS *"compound noncontested movements, dumbbell variants"* and his
       * two overhead entries there are the seated DB press and the Arnold press — which is why they
       * lead. A barbell-and-bench athlete cannot reach either, and p275's permission is what keeps
       * them from getting no overhead work at all.
       */
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: secondary push', {
        muscle: 'deltoids',
        /**
         * ⛔⛔ HIS TWO SECONDARIES FIRST, AND HIS PRIMARIES BEHIND THEM — and BOTH halves are his
         * own note (p275, corrected 2026-09-01 after Michael sent me back to the page).
         *
         * ⛔ p275, verbatim in substance: *"the emphasis on secondary lifts over primary lifts is
         * deliberate — the primary lifts are not the only way to build limit strength… **primary
         * lifts CAN be substituted in**, you're encouraged to keep your options open."* So the
         * emphasis is real AND the permission is explicit. Verified alongside it: every ME slot in
         * the All Rounder is a secondary lift — **the programme as written contains no primary at
         * all**, which is why the emphasis leads here and the permission follows.
         *
         * ⚠️ THE ORDER IS THE RULING. A kit with dumbbells lands on `seated db press` — his own
         * secondary, his own spelling, his stated emphasis. A kit without them reaches the barbell
         * press, which he permits in as many words, rather than being handed a pike push-up or left
         * with no overhead work at all.
         * ⚠️ AND ONLY THE BARBELL ROUTE CARRIES A NUMBER. A dumbbell press is held in two hands and
         * one figure cannot describe it; the barbell press prices off the tested press directly.
         */
        alsoAdmits: [
          'seated db press', 'arnold press',
          'overhead press', 'military press', 'standing barbell overhead press', 'push press',
        ],
      }),
      /**
       * ⚠️ THE MUSCLE IS STATED HERE TOO, and the audit is why (2026-08-30). p221's braced push upper
       * is *Smith machine press · machine chest press · dip machine/pressdown* — three chest presses.
       * At a barbell-and-dumbbell kit the substitution ladder reached a **dumbbell shoulder press**,
       * which is deltoids: right pattern, wrong muscle, and nothing said. Michael's rule — the muscle
       * is the law, the movement may leave his list when the kit demands it.
       */
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: braced push', { muscle: 'chest' }),
      // ⚠️ THE ARMS SUPERSET — p274 prints these two as one paired entry. Display-first (DESIGN §5).
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      // ⛔ THE DUMBBELL CURL IS ADMITTED BY NAME (2026-09-24, minimum-kit work order B5): p222's biceps movements are the
      // preacher curl (a station), the spider curl (an incline bench) and the drag curl (a bar the pair must not share),
      // so on any kit with dumbbells the pair's biceps half is the dumbbell curl (p222 variant, single-joint biceps).
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),
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
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: secondary hinge', { swapSecondaries: true }),
      // ⚠️ THE BRACED SUPERSET — same region, opposite patterns, which is p275's own rule 2b for what
      // may be paired: *"similar muscle groups but dramatically different specific patterns and loads."*
      // ⚠️ p221 braced hinge lower — reverse hyper, GHD, machine back extension — is posterior chain.
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: braced hinge / braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),
      // ⚠️ p221 braced push lower — hack squat, leg press, lever squat — is quadriceps.
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: braced hinge / braced lower push superset', { muscle: 'quadriceps' }),
      // ⛔ p223 NAMES THE HIP THRUST FIRST IN THIS ROW — *"machine/Smith machine hip thrust ·
      // hamstring curls (seated or prone) · cable or machine kickbacks"* — under a heading that says
      // hamstrings, while the movement's prime mover is glutes. Michael's ruling: the page's list
      // wins. See `StrengthSlot.alsoAdmits`. The barbell version is the same movement at bar+bench.
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: focused hamstring', {
        muscle: 'hamstrings',
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
      }),
      // ⛔ p275: the braced asymmetrical rotates with a secondary asymmetrical. Day 2 opens on the
      // Bulgarian split squat, day 5 on the reverse lunge, so a home kit's week is not three lunges.
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: braced push (asymmetrical)', { asymmetrical: true, prefer: ['bulgarian split squat', 'reverse lunge'] }),
    ],
    endurance: [E('ride_anaerobic', 1, 'Cyc AnA (level 1)', { role: 'hard' })],
  },
  {
    day: 3,
    label: null,
    themeTag: 'jumps',
    strength: [],
    // p274 day 3 endurance cell: NT (level 2)
    endurance: [E('run_near_threshold', 2, 'NT (level 2)', { role: 'hard' })],
    plyo: true,
  },
  {
    day: 4,
    label: 'Upper body: Pull',
    themeTag: 'pull day (upper)',
    strength: [
      S('ME', 'competition', 'primary', 'pull_upper', '1 x ME: secondary pull', { swapSecondaries: true }),
      /**
       * ⛔ THE DE PULL IS ONE OF p220's TOO (2026-09-11 audit). The grid ranked the barbell row first,
       * and the barbell row is p219's PRIMARY pull; p220's secondary pulls are the Kroc, T-bar,
       * Meadows and gorilla rows and the dumbbell pullover. Ordered so the day's two pulls differ.
       */
      // ⛔ THE BARBELL ROW TAKES THIS ROW (2026-09-25, minimum-kit follow-up 3, owner's ruling): p218 prints it, every
      // declared kit has a bar, and with the pull-up on the ME row it appeared nowhere in the week. Admitted by name
      // from p218's primary list and preferred; the Kroc row stays the braced pull's, p220's others follow.
      S('DE', 'accessory', 'secondary', 'pull_upper', '1 x DE: secondary pull', {
        alsoAdmits: ['barbell row'],
        prefer: ['barbell row', 'kroc row', 'gorilla row', 'meadows row', 't bar row', 'dumbbell pullover'],
      }),
      // ⚠️ p221 braced pull upper is *chest-supported row · lat pulldown · cable upright row* — the
      // rows and the pulldown are lats and they are what the row is for. See `StrengthSlot.muscle`.
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: braced pull', { muscle: 'lats' }),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: focused pull'),
    ],
    // p274 day 4 endurance cell: Cyc endurance (level 1)
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  {
    day: 5,
    label: 'Lower body: Push',
    themeTag: 'legs',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'press_lower', '1 x ME: secondary push', { swapSecondaries: true }),
      // ⚠️ p221 braced hinge lower — reverse hyper, GHD, machine back extension — is posterior chain.
      S('HYP', 'accessory', 'braced', 'hinge_lower', '2 x HYP: braced hinge / braced lower push superset', { muscle: 'hamstrings', alsoAdmits: ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper'] }),
      // ⚠️ p221 braced push lower — hack squat, leg press, lever squat — is quadriceps.
      S('HYP', 'accessory', 'braced', 'press_lower', '2 x HYP: braced hinge / braced lower push superset', { muscle: 'quadriceps' }),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: focused quadriceps', { muscle: 'quadriceps' }),
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: braced push (asymmetrical)', { asymmetrical: true, prefer: ['reverse lunge', 'walking lunge', 'bulgarian split squat'] }),
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
      /**
       * ⚠️ THE MUSCLE IS STATED HERE TOO, and the audit is why (2026-08-30). p221's braced push upper
       * is *Smith machine press · machine chest press · dip machine/pressdown* — three chest presses.
       * At a barbell-and-dumbbell kit the substitution ladder reached a **dumbbell shoulder press**,
       * which is deltoids: right pattern, wrong muscle, and nothing said. Michael's rule — the muscle
       * is the law, the movement may leave his list when the kit demands it.
       */
      // p274 day 1, taper column: row text verbatim
      S('HYP', 'accessory', 'braced', 'push_upper', '1 x HYP: braced push', { muscle: 'chest' }),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: focused push'),
    ],
    // p274 day 1 taper endurance cell: MLSS+ (level 1)
    endurance: [E('run_mlss', 1, 'MLSS+ (level 1)', { role: 'hard' })],
  },
  {
    day: 2,
    label: 'Lower body: Hinge',
    themeTag: 'hinge',
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'hinge_lower', '1 x DE: secondary hinge'),
      // ⛔ p223 NAMES THE HIP THRUST FIRST IN THIS ROW — *"machine/Smith machine hip thrust ·
      // hamstring curls (seated or prone) · cable or machine kickbacks"* — under a heading that says
      // hamstrings, while the movement's prime mover is glutes. Michael's ruling: the page's list
      // wins. See `StrengthSlot.alsoAdmits`. The barbell version is the same movement at bar+bench.
      S('HYP', 'accessory', 'focused', 'hinge_lower', '1 x HYP: focused hamstring', {
        muscle: 'hamstrings',
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
      }),
      // ⛔ p275: the braced asymmetrical rotates with a secondary asymmetrical. Day 2 opens on the
      // Bulgarian split squat, day 5 on the reverse lunge, so a home kit's week is not three lunges.
      S('DE', 'accessory', 'braced', 'press_lower', '1 x DE: braced push (asymmetrical)', { asymmetrical: true, prefer: ['bulgarian split squat', 'reverse lunge'] }),
    ],
    endurance: [],
  },
  {
    day: 3,
    label: null,
    themeTag: 'jumps',
    strength: [],
    // p274 day 3 taper endurance cell: VT1 (level 1)
    endurance: [E('run_vt1', 1, 'VT1 (level 1)', { role: 'easy' })],
    plyo: true,
  },
  {
    day: 4,
    label: 'Upper body: Pull',
    themeTag: 'pull day (upper)',
    strength: [
      S('SKILL', 'competition', 'primary', 'pull_upper', '1 x SKILL: secondary pull'),
      // ⚠️ p221 braced pull upper is *chest-supported row · lat pulldown · cable upright row* — the
      // rows and the pulldown are lats and they are what the row is for. See `StrengthSlot.muscle`.
      S('HYP', 'accessory', 'braced', 'pull_upper', '1 x HYP: braced pull', { muscle: 'lats' }),
      S('HYP', 'accessory', 'focused', 'push_upper', '2 x HYP: focused push/pull (arms) superset'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '2 x HYP: focused push/pull (arms) superset', { alsoAdmits: ['dumbbell curl'] }),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: focused pull'),
    ],
    // p274 day 4 taper endurance cell: Cyc endurance (level 1)
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  {
    day: 5,
    label: 'Lower body: Push',
    themeTag: 'legs',
    lowerRole: 'de',
    strength: [
      // p274 day 5, taper column: row text verbatim
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: secondary push'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: focused quadriceps', { muscle: 'quadriceps' }),
      S('SKILL', 'accessory', 'braced', 'press_lower', '1 x SKILL: braced push (asymmetrical)', { asymmetrical: true, prefer: ['reverse lunge', 'walking lunge', 'bulgarian split squat'] }),
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
 * ⛔⛔ CYCLING: BASE (p278, notes p280 and p281) — the Ride + Strength week. Transcribed from the page
 * image, `SOURCE-viada-hybrid-athlete.md` Part E2 (2026-09-13). Work order:
 * `WORKORDER-ride-strength-2026-09-13.md` §3.
 *
 * Three lifting days (1 heavy upper, 2 heavy lower, 4 full-body speed), a plyo warm-up on day 3, rides
 * on days 1, 2, 3, 5 and 6, day 7 full rest. **Every lifting row p278 prints and nothing else.**
 *
 * ⛔⛔ THE STANDARD WEEK IS p278's STANDARD COLUMN, RIDES INCLUDED (2026-09-18, book-language pass 4, audit §3).
 * It took p278's DELOAD rides (five, all level 1) under the STANDARD lifting, on a work-order choice of 2026-09-13.
 * The page means the Standard column for the ordinary week and the Deload column for a deload week: p281's own Base
 * notes speak of "the Tuesday and Friday endurance rides" and "the Saturday long ride" — days 2, 5 and 6 — and only
 * the Standard column has an endurance ride on day 5 (SOURCE Part E2a, read off p278 by row shading; E2d, p281).
 * So the standard week is seven rides: sweet spot (level 1-2), endurance (1), VO2 (1) + sweet spot (1), endurance (1)
 * + sprint (1), endurance (2). `taper` is p278's Deload column on both sides — five rides at level 1.
 * ⚠️ p281 has the endurance rides lengthen ("gradually increase volume over two to three by 1-month cycles"; the long
 * ride "every 1 to 2 weeks") and prints no amount, so the rides are built at their printed level and the rides
 * screen prints p281's sentence; no step is invented.
 *
 * ⚠️ NO RUN SLOT AND NO SWIM (`enduranceSports: ['ride']`).
 * ⚠️ NO OVERHEAD PRESS IS NAMED — p278's push rows are categories. `testedLifts` is bench, squat and
 * deadlift, so the entry check and the week-one test never ask for a press.
 */
const CYCLING_BASE_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'ME Upper',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('ME', 'accessory', 'primary', 'pull_upper', '1 x ME: Accessory: primary pull'),
      /**
       * ⚠️ THE SAME CELL AS p246's DAY 1, and the same pick inside it: the muscle is ours, the movement
       * list is his (p220's seated DB press and Arnold press first, the barbell presses p275 permits
       * behind them). See `STRENGTH_5K_STANDARD` day 1. It is a choice among the row's own movements,
       * not a row added.
       */
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: Accessory: secondary push', {
        muscle: 'deltoids',
        alsoAdmits: [
          'seated db press', 'arnold press',
          'overhead press', 'military press', 'standing barbell overhead press', 'push press',
        ],
      }),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    // p278 Standard column, day 1: "Cyc sweet spot (level 1-2)". OURS — level 1, the low end of the page's range.
    endurance: [E('ride_sweet_spot', 1, 'Cyc sweet spot (level 1-2)', { role: 'hard' })],
  },
  {
    day: 2,
    label: 'ME Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate with primary push)', { rotatesWith: 'press_lower' }),
      S('ME', 'accessory', 'primary', 'press_lower', '1 x ME: Accessory: primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'secondary', 'hinge_lower', '1 x DE: Accessory: secondary hinge lower', {
        /**
         * ⛔ p220's SECONDARY HINGE LOWER LIST, WHOLE (Michael, 2026-09-13, off the page photo): Romanian
         * deadlift · stiff-legged deadlift · bench reverse hyper · good morning · KB swing · sandbag throw.
         * The swing and the bench reverse hyper are filed in other categories of the catalogue, so they
         * are named here to be fetched. This row built a hip thrust, which p220 does not print for it.
         */
        alsoAdmits: ['kettlebell swing', 'kb swing', 'weighted reverse hyper'],
      }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        /**
         * ⛔ THE HIP THRUST IS THIS ROW'S DEFAULT (Michael, 2026-09-13, off the page photos). The page prints
         * no list for "accessory lower"; p247 defines an accessory as a non-competition lift in a similar
         * movement pattern. The catalogue files the hip thrust under the hinge pattern, so it is named here.
         */
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    // p278 Standard column, day 2: "Cyc endurance (level 1)"
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  // p278 Standard column, day 3: "Cyc VO2 (level 1) · Cyc sweet spot (level 1)" — two rides.
  {
    day: 3, label: null, strength: [], plyo: true,
    endurance: [
      E('ride_vo2', 1, 'Cyc VO2 (level 1)', { role: 'hard' }),
      E('ride_sweet_spot', 1, 'Cyc sweet spot (level 1)', { role: 'hard' }),
    ],
  },
  {
    day: 4,
    label: 'DE: Full',
    // ⚠️ THE WEEK'S SPEED LEG DAY — its lower rows are DE (`FrameDay.lowerRole`).
    lowerRole: 'de',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)', { rotatesWith: 'press_lower' }),
      /**
       * ⚠️ A CARRY HAS NO PATTERN IN HIS KEY (p226; `resolveSlot` ignores the pattern for `carry`). The
       * field is required by the slot type, so it carries `hinge_lower` — p226: carries *"also qualify
       * as a hinge, pull or press during the pick"*. Nothing prices off it: a carry is never a
       * competition lift.
       */
      S('SKILL', 'accessory', 'carry', 'hinge_lower', '1 x SKILL: Carry'),
    ],
    endurance: [],
  },
  /**
   * ⚠️ TWO OF p236's THREE LEVEL 1 SPRINT SESSIONS, ROTATED BY WEEK. The standing start is left out
   * (2026-09-13): its effort has no printed length — an acceleration up to speed — and no step on a
   * watch file can carry a work step with no clock. Open for Michael.
   */
  // p278 Standard column, day 5: "Cyc endurance (level 1) · Cyc sprint (level 1)" — two rides.
  {
    day: 5, label: null, strength: [],
    endurance: [
      E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' }),
      E('ride_sprints', 1, 'Cyc sprint (level 1)', { role: 'hard', archetypes: ['max_effort', 'flying_surge'] }),
    ],
  },
  /**
   * ⚠️ p281 CALLS THIS "THE SATURDAY LONG RIDE", so the frame states `long`. p278 Standard column, day 6:
   * "Cyc endurance (level 2)".
   */
  { day: 6, label: null, strength: [], endurance: [E('ride_endurance', 2, 'Cyc endurance (level 2)', { role: 'long' })] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ p278's DELOAD COLUMN, BOTH SIDES. The lifting is a CUT, not a substitution: day 1 is unchanged,
 * day 2 loses the DE secondary hinge, day 4 loses the DE primary hinge and the carry. The rides are the
 * Deload column's five, one a day, all level 1: day 3 drops its sweet spot, day 5 its endurance ride.
 */
const CYCLING_BASE_TAPER: FrameDay[] = [
  // p278 Deload column, day 1: the same lifting; "Cyc sweet spot (level 1)".
  { ...CYCLING_BASE_STANDARD[0], endurance: [E('ride_sweet_spot', 1, 'Cyc sweet spot (level 1)', { role: 'hard' })] },
  {
    day: 2,
    label: 'ME Lower',
    lowerRole: 'me',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate with primary push)', { rotatesWith: 'press_lower' }),
      S('ME', 'accessory', 'primary', 'press_lower', '1 x ME: Accessory: primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        /**
         * ⛔ THE HIP THRUST IS THIS ROW'S DEFAULT (Michael, 2026-09-13, off the page photos). The page prints
         * no list for "accessory lower"; p247 defines an accessory as a non-competition lift in a similar
         * movement pattern. The catalogue files the hip thrust under the hinge pattern, so it is named here.
         */
        alsoAdmits: ['machine hip thrust', 'smith machine hip thrust', 'barbell hip thrust'],
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    // p278 Deload column, day 2 endurance cell: Cyc endurance (level 1)
    endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'easy' })],
  },
  // p278 Deload column, day 3: "Cyc VO2 (level 1)".
  { day: 3, label: null, strength: [], plyo: true, endurance: [E('ride_vo2', 1, 'Cyc VO2 (level 1)', { role: 'hard' })] },
  {
    day: 4,
    label: 'DE: Full',
    lowerRole: 'de',
    strength: [
      // p278 Deload column, day 4: row text verbatim
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
    ],
    endurance: [],
  },
  // p278 Deload column, day 5: "Cyc sprint (level 1)".
  { day: 5, label: null, strength: [], endurance: [E('ride_sprints', 1, 'Cyc sprint (level 1)', { role: 'hard', archetypes: ['max_effort', 'flying_surge'] })] },
  // p278 Deload column, day 6: "Cyc endurance (level 1)".
  { day: 6, label: null, strength: [], endurance: [E('ride_endurance', 1, 'Cyc endurance (level 1)', { role: 'long' })] },
  { ...CYCLING_BASE_STANDARD[6] },
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
  strength_half: { perWeek: 0.01 / 4, cite: 'Viada p251 — "1% every four weeks or so as a solid starting point"' },
  hyp_5k: { perWeek: 0.01 / 3, cite: 'Viada p245 — "assume 1 percent every 3 weeks as a starting point"' },
  /**
   * ⛔ p253 PRINTS NO RATE, SO p112's GENERAL RULE GOVERNS, AND IT IS THE EARNED PROGRESSION (2026-09-23, PM review):
   * *"If you're meeting or exceeding expectations at this load… you can increase the load incrementally… and decrease
   * load if you fail to achieve targets at any point."* No calendar rise: the bar moves when targets are hit
   * (`progressionVerdict` / `advanceStep`, the ME and bar ladders in `progression.ts`) and comes back when they are
   * missed (`undoLastStep`). ⚠️ p112's 75/80/85% week-to-week wave is NOT built anywhere in the engine — reported, not
   * invented here.
   */
  hyp_half: {
    perWeek: 0,
    cite: 'Viada p112 — raise the load when targets are met, lower it when they are missed (p253 prints no rate); '
      + 'the earned progression owns the number, no calendar rise.',
  },
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
  /** ⚠️ THE SAME RULING AS `all_rounder`: p280 states no rate for Base, and lifts move when earned. */
  cycling_base: {
    perWeek: 0,
    cite: 'OURS — the all_rounder ruling (2026-08-30) applied: p280 states no rate for Cycling: Base, '
      + 'and the double progression owns the number.',
  },
};

export const FRAMES: Record<FrameId, Frame> = {
  strength_5k: {
    id: 'strength_5k',
    sourceName: 'Strength + 5K',
    cite: 'Viada pp246-247',
    liftingDays: 4,
    // 30 min = p246's VT1 level 1 rung top (p235: 25-30 min). OURS — `longRunChipCeilingMinutes` 90 and `longRunDefaultMinutes` 75, see `RunStrengthWeek`
    // Chips (Michael, 2026-09-23): 1h10 / 1h15 / 1h30 inside p235's level-2 band (68–100 min), the first selected.
    runStrengthWeek: { easyRunMinutes: 30, longRunChipCeilingMinutes: 90, longRunDefaultMinutes: 70, longRunChips: [70, 75, 90], offersExtraEasyRuns: true },
    columns: { standard: STRENGTH_5K_STANDARD, taper: STRENGTH_5K_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.strength_5k.perWeek,
    testedLifts: ['bench', 'squat', 'deadlift', 'overheadPress'],
    laysOutWeekByDay: false,
    enduranceSports: ['run', 'swim'],
  },
  strength_half: {
    id: 'strength_half',
    sourceName: 'Strength + Half-Marathon',
    cite: 'Viada pp250-251',
    liftingDays: 4,
    // Viada p235: VT1 level 1 is 25–30 min; LSD level 3 is 1.5h up to 2–2.5h.
    // Chips (Michael, 2026-09-23: three tiers, the first selected). The level-3 long run builds every minute from 104 to
    // 133 and tops out at 134 (p107's two hours of easy running plus the three sets), so 135 cannot build and the top
    // chip is 134. ⚠️ It built only 104/111/117/124/131/134 until `sizeWhereBuildTops` (volume-bounds.ts, 2026-09-23).
    // Easy day 4 at 45 / 50 / 60 (p235 level 2, builds to the minute).
    runStrengthWeek: {
      easyRunMinutes: 30, longRunChipCeilingMinutes: 150, longRunCeilingMinutes: 150, longRunDefaultMinutes: 105,
      longRunChips: [105, 120, 134], easyRunChipsByLevel: { 2: [45, 50, 60] }, easyRunRangeByLevel: { 2: [45, 60] },
    },
    columns: { standard: STRENGTH_HALF_STANDARD, taper: STRENGTH_HALF_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.strength_half.perWeek,
    testedLifts: ['bench', 'squat', 'deadlift', 'overheadPress'],
    laysOutWeekByDay: false,
    enduranceSports: ['run', 'swim'],
  },
  hyp_5k: {
    id: 'hyp_5k',
    sourceName: 'Hypertrophy + 5K',
    cite: 'Viada pp244-245',
    liftingDays: 4,
    // Viada p235: VT1 level 1 is 25–30 min; LSD level 2 is 68–100 min. p245: "runs up to 90 to 100 minutes" — Strength
    // Lead's chips (p247 prints the same words).
    // p245: "can add one or two short VT1 sessions (running or cross-training)" — the extra easy runs, with p245's own line
    // (`RUNS_COPY.extra_line_by_frame`, Michael approved 2026-09-24).
    runStrengthWeek: { easyRunMinutes: 30, longRunChipCeilingMinutes: 90, longRunDefaultMinutes: 70, longRunChips: [70, 75, 90], offersExtraEasyRuns: true },
    columns: { standard: HYP_5K_STANDARD, taper: HYP_5K_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.hyp_5k.perWeek,
    // ⚠️ NO OVERHEAD PRESS IS NAMED (see HYP_5K_STANDARD), so week one does not test one — CYCLING_BASE's precedent.
    testedLifts: ['bench', 'squat', 'deadlift'],
    laysOutWeekByDay: false,
    enduranceSports: ['run', 'swim'],
  },
  hyp_half: {
    id: 'hyp_half',
    sourceName: 'Hypertrophy + Half-Marathon',
    cite: 'Viada pp252-253',
    liftingDays: 4,
    // Viada p235: LSD level 3 is 1.5h up to 2–2.5h; VT1 level 2 is 45–60 min. Run Lead's lengths (same levels, p250).
    runStrengthWeek: {
      easyRunMinutes: 30, longRunChipCeilingMinutes: 150, longRunCeilingMinutes: 150, longRunDefaultMinutes: 105,
      longRunChips: [105, 120, 134], easyRunChipsByLevel: { 2: [45, 50, 60] }, easyRunRangeByLevel: { 2: [45, 60] },
    },
    columns: { standard: HYP_HALF_STANDARD, taper: HYP_HALF_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.hyp_half.perWeek,
    // ⚠️ NO OVERHEAD PRESS IS NAMED (see HYP_HALF_STANDARD), so week one does not test one — CYCLING_BASE's precedent.
    testedLifts: ['bench', 'squat', 'deadlift'],
    laysOutWeekByDay: false,
    enduranceSports: ['run', 'swim'],
  },
  all_rounder: {
    id: 'all_rounder',
    sourceName: 'The All Rounder',
    cite: 'Viada pp274-275',
    liftingDays: 4,
    columns: { standard: ALL_ROUNDER_STANDARD, taper: ALL_ROUNDER_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.all_rounder.perWeek,
    testedLifts: ['bench', 'squat', 'deadlift', 'overheadPress'],
    laysOutWeekByDay: true,
    enduranceSports: ['run', 'ride', 'swim'],
  },
  cycling_base: {
    id: 'cycling_base',
    sourceName: 'Cycling: Base',
    // ⚠️ THE CARD'S EXISTING LABEL. §0.1 of the work order: the card copy is not approved yet.
    cite: 'Viada pp278, 280-281',
    liftingDays: 3,
    columns: { standard: CYCLING_BASE_STANDARD, taper: CYCLING_BASE_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.cycling_base.perWeek,
    testedLifts: ['bench', 'squat', 'deadlift'],
    laysOutWeekByDay: true,
    enduranceSports: ['ride'],
    hardSessionsFixed: true,
    printedWeekOnly: true,
    // OURS — `fewerRidesDropsSlot` the one-fewer-ride week (Michael, 2026-09-13, as four of five rides; one fewer than
    // p278's Standard seven since 2026-09-18); day 2's easy ride is the one that comes out
    fewerRidesDropsSlot: { rideCount: 6, day: 2, index: 0 },
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
// OURS — `ADVANCED_TIER_MIN_WEEKLY_MILES` 25 mi a week, the top third of the 10-30 mi audience; p247 gives the one or two sessions, not the gate
export const ADVANCED_TIER_GATE_IS_OURS =
  'The source says "more advanced runners" and defines nothing. Twenty-five miles a week is ours — '
  + 'the top third of this plan\'s stated 10-to-30-mile audience — and it gates on running the '
  + 'athlete already does, never on running they intend to do.';

export function advancedTierSessions(demonstratedWeeklyMiles: number | null | undefined): number {
  const miles = Number(demonstratedWeeklyMiles);
  if (!Number.isFinite(miles) || miles < ADVANCED_TIER_MIN_WEEKLY_MILES) return 0;
  // OURS — `advancedTierSessions` the second session at twice the gate (50 mi); p247 says "one or two" and names no mileage
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
  // Viada p246 taper column prints MLSS+ and NT at level 1; run_lsd level 1 is p235's own LSD level
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
  // OURS — `LOW_VOLUME_TIER_LEVELS` ride families at level 1 for a newer rider; the levels are p237-p239's, using them here is ours
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
 * ⛔ p278, HIS OWN CYCLING BASE STANDARD WEEK, read off the page image (full table: SOURCE Part E2):
 * day 1 `Cyc sweet spot (level 1-2)`, day 2 `Cyc endurance (level 1)`, day 3 `Cyc VO2 (level 1)` +
 * `Cyc sweet spot (level 1)`, day 5 `Cyc endurance (level 1)` + `Cyc sprint (level 1)`, day 6
 * `Cyc endurance (level 2)`, day 7 rest. ⚠️ Corrected 2026-09-13: this listed the level 2 ride on
 * day 7 and left out both day 2 and day 5 endurance rides. **Level 2 is the ceiling on p278, and it
 * appears on two sessions.** ⚠️ p279 prints `Cyc sweet spot (level 2 to 3)` and `Cyc endurance
 * (level 3)/LSR`, so "level 2 anywhere in his cycling programs" does not hold past p278.
 * Level 3 sweet spot exists in the session library
 * (p239); of the three cycling tables (p278, p279, p281) only p279 prints it, on day 1, so offering it on a
 * Wednesday ride in these frames hands a hybrid athlete a harder dose than p278 gives a cyclist.
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
  /** ⛔ REVISED 2026-09-02 (Michael, WORKORDER-plyo-screen §2) — a RANGE, not the fixed 4 this was
   *  written as. He is revising a deliberate OURS decision knowing it is one: the page gives no figure,
   *  three to five is the field standard, and a range states the honest shape of the guidance rather
   *  than implying a target. `hi` is what a row carries as its recorded-efforts capacity. */
  // ⛔ 2026-09-18: `effortsPerDrill` (3-4, OURS) is deleted; a drill row carries no count.
  drillCountIsHis: 'Viada p227 — more than three or four is likely a waste of time',
  effortCountIsOurs:
    'The source says each drill is performed "multiple times with ample rest" and gives no number, '
    + 'so a drill row carries none; the efforts are recorded after.',
  // ⛔ 2026-09-18: `stopRule` is deleted — the drill words are p227's own, owned by `plyo.ts` P227_DRILL_LINE.
  stopRuleIsHis: 'Viada p227',
};
