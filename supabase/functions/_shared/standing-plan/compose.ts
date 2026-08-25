// ============================================================================
// THE COMPOSER — a frame, an athlete, and the three libraries, into one week.
//
// ⛔ IT IS NOT A FIFTH `generate-*` SIBLING. It composes; it does not fetch, persist or route. The
// edge function hands it resolved inputs and takes back plan rows.
//
//   strength slots  → stage 2 `_shared/strength-grid`      (pattern × category × intent)
//   endurance slots → stage 1 `_shared/endurance-library`   (family × level × the athlete's anchors)
//   accessories     → stage 3 `_shared/accessory-dosing`    (per-muscle floor, per-session ceiling)
//   the shape       → `frames.ts`                           (p246, the law)
//   the load        → `working-number.ts` + `progression.ts` (p215, p247)
//   the words       → `session-vocabulary.ts`               (ONE edge, no new vocabulary)
//
// ⛔ THE PROGRAM OWNS EVERY COUNT. The athlete owns sport, level, equipment and which movement fills
// a slot. Convert, never add.
// ============================================================================

import {
  buildEnduranceSession,
  resolveEnduranceAnchors,
  type EnduranceBaselines,
  type Level,
} from '../endurance-library/index.ts';
import { bandRouteName, prescribe, resolveSlot, type ViadaPattern } from '../strength-grid/index.ts';
import {
  HOLD_PRESCRIPTION,
  fillMuscleFloor,
  ledgerFor,
  type DoseLedger,
  type MuscleGroup,
  type PlannedSession as DosingSession,
} from '../accessory-dosing/index.ts';
import {
  DIAL_CAP,
  DIAL_OWNERSHIP,
  DIAL_IS_OURS,
  DIAL_PULLBACK_IS_OURS,
  dialDose,
  chipForMuscle,
  isDialChip,
  musclesForChips,
  pickKeyForSlot,
  type ViadaPickKey,
} from './accessory-picks.ts';
import {
  advancedTierSessions,
  FRAMES,
  PLYO_DOSE,
  type ColumnKind,
  type FrameDay,
  type FrameId,
  type StrengthSlot,
} from './frames.ts';
import {
  WEEKDAYS, frameFixedDaysFor, titleCaseDay, weekdayForFrameDay, type Weekday,
} from './day-map.ts';
import { assignSports, assignedSlot, SWIM_SLOT, SWIM_IS_EASY_ONLY, type SportMix } from './sport-slots.ts';
import {
  HAIRCUT_CAUSE_IS_OURS,
  INTENSITY_STARTS_LOW_IS_OURS,
  ME_SET_LADDER_IS_OURS,
  prescribedLoad,
  setPositionForCount,
} from './progression.ts';
import {
  drillForWeek,
  PLYO_FAMILIES,
  PLYO_FAMILIES_PER_DAY,
  PLYO_FAMILY_MIX_IS_OURS,
} from './plyo.ts';
/**
 * ⛔ THE SERVER'S CANONICALIZER, NOT THE CLIENT MIRROR, AND THE DIFFERENCE IS THE BUG.
 * `src/lib/canonicalize.ts` is a simplified copy for UI trend lookups; only THIS one carries the
 * Q-197 plural fallback and the Q-210 parenthetical/hyphen ladder — the two rules that make
 * `Bulgarian Split Squats` and `bulgarian split squat` one movement instead of two.
 */
import { canonicalize } from '../canonicalize.ts';
import { musclesWorkedBy } from '../accessory-dosing/index.ts';
import { FAMILIES } from '../endurance-library/index.ts';

/** The default rotation: the family's offered archetypes at this level, alternated by week. OURS. */
function rotatedArchetype(family: string, level: number, week: number): string | undefined {
  const rules = (FAMILIES as Record<string, { archetypes: Array<{ id: string; levels?: number[] }> }>)[family];
  if (!rules) return undefined;
  const offered = rules.archetypes.filter((a) => !a.levels || a.levels.includes(level));
  if (offered.length < 2) return undefined;
  return offered[(Math.max(1, week) - 1) % offered.length].id;
}
import { translateEnduranceSession } from './session-vocabulary.ts';
import {
  isTestWeek,
  pretestSession,
  TEST_DAY_LIFTS,
  TESTED_LIFTS,
  testedLiftName,
  type TestedLift,
  type WorkingNumber,
} from './working-number.ts';

// ── the app's existing plan-row shape. Nothing new. ─────────────────────────────────────────────

export type PlannedSet = { weight: number; reps: number; amrap?: boolean; warmup?: boolean };

export type StrengthExercise = {
  name: string;
  sets?: number;
  reps: number | string;
  weight: string | number;
  percent_1rm?: number;
  load_prescribed?: boolean;
  notes?: string;
  /** ⛔ HIS reps-in-reserve for this slot's intent. Absent on ME — see `targetRirForIntent`. */
  target_rir?: number;
  set_plan?: PlannedSet[];
};

export type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: StrengthExercise[];
  steps_preset?: string[];
  tags: string[];
};

/**
 * ⛔ THE FRAME'S DAY NUMBER → A CALENDAR WEEKDAY, AND IT IS NO LONGER HARD-WIRED.
 *
 * This was `DAY_NAMES[day.day - 1]` — frame day 1 always Monday, so the long run was Saturday for
 * every athlete alive. **That was itself a rotation, offset zero, that nobody chose.** The work
 * order: *"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE"* — p246 numbers its days and names no
 * weekday anywhere. A rotation moves every day by the same amount, so the pairings, the gaps and the
 * rest day's position all survive exactly; only the calendar day the block opens on changes.
 *
 * ⚠️ ABSENT `dayOffset` IS OFFSET ZERO, so an athlete who pinned nothing gets the identical week.
 */
function dayNameFor(args: ComposeArgs, frameDay: number): Weekday {
  return weekdayForFrameDay(frameDay, args.dayOffset ?? 0);
}

/**
 * ⛔ WHICH ANCHOR A SLOT IS — the same test `anchorDaysFor` uses, applied per slot rather than per
 * day. ⚠️ ONE OWNER: if a family is ever added to the long or hard set there, it must be added
 * here, or a slot the day map treats as an anchor stops being pinnable and nothing says why.
 */
function anchorRoleOf(family: string): 'long' | 'hard' | null {
  if (family === 'run_lsd') return 'long';
  if (family === 'run_mlss' || family === 'run_near_threshold') return 'hard';
  return null;
}

/**
 * ⛔ THE WEEKDAY THIS ENDURANCE SLOT LANDS ON — the athlete's pin if they set one, the frame's
 * rotation otherwise. See `endurancePins`.
 *
 * ⚠️ HARD SLOTS ARE MATCHED BY POSITION IN THE FRAME'S OWN ORDER, which is the order the wizard
 * lists them in and the order `anchorDaysFor` returns them in. Matching by weekday instead would
 * be circular — the weekday is the thing being decided.
 */
function enduranceDayFor(
  args: ComposeArgs,
  frameDay: number,
  family: string,
  hardIndex: number,
): Weekday {
  const role = anchorRoleOf(family);
  const pins = args.endurancePins;
  if (pins) {
    if (role === 'long' && pins.long) return pins.long;
    if (role === 'hard') {
      const pinned = pins.hard?.[hardIndex];
      if (pinned) return pinned;
    }
  }
  return dayNameFor(args, frameDay);
}


/**
 * ⛔ WHAT TO CALL AN ENDURANCE SLOT IN A SENTENCE — the athlete's words, not the frame's. The note
 * reads *"the long ride moved to Mon"*, and `run_lsd` / `run_mlss` are not words anybody says.
 * ⚠️ THE SPORT IS DELIBERATELY ABSENT: the mix decides it per slot and this file's own long slot can
 * be a run or a ride. "The long session" is true either way; naming the wrong sport is not.
 */
function enduranceLabelFor(role: 'long' | 'hard' | null): string {
  if (role === 'long') return 'the long session';
  if (role === 'hard') return 'the hard session';
  return 'an easy session';
}

/** A session a blocked day moved: what it is, the day it was on, the day it went to. */
export type EnduranceRelocation = { session: string; from: Weekday; to: Weekday };

/**
 * ⛔⛔ STEP THE ENDURANCE OFF A DAY THE ATHLETE CANNOT TRAIN — see `ComposeArgs.unavailableDays`.
 *
 * ⛔ INCLUDING A DAY THEY TAPPED (Michael, 2026-08-25 afternoon). The blocked day always wins, so a
 * pinned session is relocated exactly like a rotated one. What a pin still buys is PRIORITY: the
 * athlete's own days are relocated FIRST, so they get first choice and an engine-placed session
 * takes what is left rather than the other way round.
 *
 * ⛔⛔ AND IT LANDS ON A DAY THAT IS ALREADY TRAINING (Michael, 2026-08-25 evening). *"Stacking is
 * the release valve — lifts may share a day with club or other endurance sessions to make the
 * schedule work… prefer landing on a day that already has training over eating the rest day."*
 *
 * So the search runs in two tiers: every occupied day first, nearest outwards, and only then the
 * clear ones. It is a REVERSAL of what this function did an hour ago, which walked to the nearest
 * day of any kind and therefore spent a rest day the moment one was closer than a training day.
 * A doubled-up day is a note; a week with no day off is a week the athlete did not ask for.
 *
 * ⚠️ NEAREST WITHIN EACH TIER, FORWARD FIRST. The frame's gaps carry its meaning, so the closest
 * day preserves the most of them; forward before back breaks the tie the same way every time,
 * which is what keeps two builds of one answer identical.
 * ⚠️ EVERY DAY BLOCKED IS NOT AN ERROR HERE. The session keeps its day and the week is still built —
 * `structuralConflicts` `no_day_left` is where that is reported, and this file never refuses.
 */
function enduranceRelocator(args: ComposeArgs): {
  place: (proposed: Weekday, label: string) => Weekday;
  moves: EnduranceRelocation[];
} {
  const blocked = new Set<Weekday>(
    (args.unavailableDays ?? [])
      .map((d) => titleCaseDay(d))
      .filter((d): d is Weekday => d !== '') as Weekday[],
  );
  /**
   * ⛔ THE DAYS THAT ALREADY CARRY WORK THE ROTATION PUT THERE — the lifting days and the plyo day,
   * read off the frame at this block's own offset. A relocated session prefers these, because
   * landing on one costs the week nothing it had not already spent.
   * ⚠️ `used` GROWS AS SESSIONS ARE PLACED, so a day this pass has already filled counts as
   * occupied for the next one — the tiers see the week being built, not the frame alone.
   */
  const occupied = new Set<Weekday>(
    frameFixedDaysFor(args.frame, args.column).fixed
      .map((d) => weekdayForFrameDay(d, args.dayOffset ?? 0)),
  );
  const used = new Set<Weekday>();
  const moves: EnduranceRelocation[] = [];
  // ⚠️ Forward, then back, widening — `[1,-1,2,-2,…]`, so "nearest" is a real answer and not a
  // one-directional walk that always drifts a session to the end of the week.
  const walk: number[] = [];
  for (let n = 1; n <= 6; n++) { walk.push(n); walk.push(-n); }

  const place = (proposed: Weekday, label: string): Weekday => {
    if (!blocked.has(proposed)) { used.add(proposed); return proposed; }
    const from = WEEKDAYS.indexOf(proposed);
    /** `training` = only days already carrying something; otherwise the first unblocked day. */
    const pick = (training: boolean): Weekday | null => {
      for (const step of walk) {
        const cand = WEEKDAYS[(from + step + 7) % 7];
        if (blocked.has(cand)) continue;
        if (training && !occupied.has(cand) && !used.has(cand)) continue;
        return cand;
      }
      return null;
    };
    const to = pick(true) ?? pick(false);
    // ⚠️ NOWHERE TO GO — every day blocked. It keeps its day and reports no move, because a note
    // saying it moved to the day it is still on would be the screen lying quietly.
    if (to == null) { used.add(proposed); return proposed; }
    used.add(to);
    moves.push({ session: label, from: proposed, to });
    return to;
  };
  return { place, moves };
}

export type ComposeArgs = {
  frame: FrameId;
  week: number;
  column: ColumnKind;
  /** ⛔ THE COMPETITION LIFTS. His p275 permission, pivot §6: the lift the athlete wants a number on
   *  enters the ME slot. These are also what the `Accessory:` role EXCLUDES. */
  competitionLifts: Partial<Record<ViadaPattern, string>>;
  /** Working numbers from week one's test. Absent in the test week itself. */
  workingNumbers?: Partial<Record<TestedLift, WorkingNumber>>;
  /** Stored 1RMs — the SEED for the test's warm-up weights, never the working number. */
  seed1RMs?: Partial<Record<TestedLift, number>>;
  baselines?: EnduranceBaselines;
  equipment?: string[] | null;
  /** Endurance levels the athlete chose, per family. Absent → the frame's own level. */
  levelOverrides?: Partial<Record<string, Level>>;
  /** ⛔ DEMONSTRATED, not intended. Gates the advanced tier — see `advancedTierSessions`. */
  demonstratedWeeklyMiles?: number | null;
  roundTo?: number;
  smallestPlatePairLb?: number | null;
  /**
   * ⛔ WHICH CALENDAR DAY THE FRAME OPENS ON — `chooseDayMap` decides it from the athlete's pins.
   * Frame day 1 lands this many days after Monday. Absent = 0 = the Monday-start week.
   */
  dayOffset?: number;
  /**
   * ⛔⛔ THE ATHLETE'S PINNED ENDURANCE DAYS — AND THEY BEAT THE FRAME (Michael, 2026-08-25:
   * *"user choice always wins, it's just informed."* Fork answered 2026-08-25: option 1.)
   *
   * ⛔ WHAT THIS BREAKS, SAID PLAINLY. This file's own law is that the frame owns the ORDER and the
   * SPACING and the athlete owns only which weekday the block opens on — a whole-week ROTATION,
   * which costs the frame nothing because every pairing and gap survives it. A pin here does NOT
   * survive it: one endurance session steps out of the frame order onto the day the athlete chose,
   * and the pairing it was part of can come apart. That is the ruling, not an oversight.
   *
   * ⛔ ENDURANCE ONLY. The lifts keep the frame's order, its spacing and its rest slot, and they are
   * still placed by the rotation `chooseDayMap` picked — which still scores the pins first, so the
   * rotation is chosen to REACH as many of them as it can. A pin only overrides the sessions the
   * rotation could not reach. ⚠️ Do not extend this to `day.strength`: the ME/DE ordering and the
   * gaps between lifting days are the half of the frame that is load-bearing on its own.
   *
   * ⚠️ THE COST IS NOT SILENT. A pin that breaks the squat + hard-run pairing is a BREACH-tier note
   * on the screen (`week-model/resolve.ts` `violationsOf`), never a refusal and never a quiet move.
   *
   * ⚠️ ABSENT IS THE ROTATION, EXACTLY. An athlete who pinned nothing gets the week this file built
   * before the field existed, byte for byte.
   */
  endurancePins?: {
    /** Weekday for the frame's long slot, whichever sport the mix put on it. */
    long?: Weekday | null;
    /** Weekdays for the frame's hard slots, in the frame's own order. */
    hard?: Array<Weekday | null | undefined>;
  };
  /**
   * ⛔⛔ DAYS THE ATHLETE CANNOT TRAIN — AND NO ENDURANCE SESSION LANDS ON ONE (Michael, 2026-08-25:
   * *"Endurance sessions must never be placed on an unavailable day — they are movable by
   * definition."*).
   *
   * ⛔ THE ROTATION HAS ALREADY TRIED. `chooseDayMap` scores the seven rotations to keep the LIFTS
   * off these days, because a lift can only be moved by rotating the whole frame. This field is the
   * other half: whatever the rotation could not clear, the endurance steps off by itself — the same
   * freedom `endurancePins` already gives it.
   *
   * ⛔⛔ AND A PIN ONTO A BLOCKED DAY MOVES TOO (Michael, 2026-08-25 afternoon — SUPERSEDES this
   * file's own note from the same morning, which kept it). *"A blocked day always wins. If a day is
   * both tapped for a session and marked can't-train, the session is rescheduled off it."* So a
   * tapped day is absolute against the FRAME and not against a day off; the move is reported, never
   * silent. ⚠️ The re-arranged week may break a clearance — it still builds, and the tiered notes
   * carry it (`week-model/resolve.ts` `violationsOf`).
   * ⚠️ ABSENT OR EMPTY IS THE WEEK THIS FILE BUILT BEFORE THE FIELD EXISTED, day for day.
   */
  unavailableDays?: Array<Weekday | string | null | undefined>;
  /**
   * ⛔ THE ATHLETE'S SPORT MIX (slice 4) — how many runs, how many rides, swim kept or not. It sets a
   * RATIO over the frame's own slot count and never changes how many sessions the week holds.
   * Absent = all runs, which is the week slices 1-3 built.
   */
  sportMix?: SportMix;
  /**
   * ⛔ THE EASY-SWIM ADD-ON (Michael, 2026-08-24): 1–2 easy/technique swims appended OUTSIDE the
   * frame's four endurance slots — "doesn't take a session spot, costs your lifting nothing." This
   * supersedes slice 4's swim-takes-the-easy-slot substitution. Cap 2; 0/absent = none.
   */
  swimEasySessions?: number | null;
  /**
   * ⛔ SKIP WEEK ONE'S TEST — offered ONLY when logged history already carries a trustworthy max
   * (Michael, 2026-08-23). ⚠️ Never a bare athlete preference: the caller must have derived
   * `workingNumbers` from evidence (`evidenceWorkingNumbers`) before setting this, and a block with
   * this true and no working numbers would prescribe nothing at all. Default is the test.
   */
  skipTestWeek?: boolean;
  /**
   * ⛔ THE ATHLETE'S ACCESSORY PICKS, FLATTENED TO MOVEMENT NAMES (device finding A1, 2026-08-24).
   *
   * The picker survives whole (pivot §6) and until now it wrote to a shape only Get Stronger read.
   * Michael added ab and single-leg work and the built week came back with `plank — "Floor: core had
   * nothing else this week"`: the engine recording that it had seen no core from the athlete, on a
   * week where the athlete had named one.
   *
   * ⛔ FLAT, AND THE DAY IS DELIBERATELY DROPPED — that is OURS and it is stated rather than assumed.
   * The picker's keys are Wendler's three lifting days (`squat` / `bench` / `deadlift`); this frame's
   * days are ME:Upper, ME:Lower, DE:Upper and DE:Lower. There is no honest mapping between the two,
   * so a pick is placed by what it TRAINS — its pattern for a HYP slot, its prime mover for a floor —
   * and never by which of another programme's days it was chosen on.
   *
   * ⚠️ A PICK IS A PREFERENCE, NEVER A NEW SLOT. Convert, never add: it fills a slot the frame
   * already has, or a floor the week already needs. One that fits neither is REPORTED — see
   * `unplacedPickNote`.
   */
  accessoryPicks?: string[] | null;
  /**
   * ⛔ THE FOCUS CHIPS (B2, 2026-08-24). A chip never re-points a slot — the slots are p246's — it
   * biases WHICH movement fills a HYP accessory slot: among the cell's own options, one whose prime
   * mover the athlete asked for wins over the default. `core` reaches only this engine; Get
   * Stronger's `isFocusChip` filters it out, which is that path's stated migration.
   */
  focus?: string[] | null;
  /**
   * ⛔ THE ATHLETE'S PICK FOR EACH OF THE FRAME'S OWN OPEN SLOTS (2026-08-24, Michael's ruling —
   * D-450 in `docs/DECISIONS-LOG-3.md`).
   *
   * ⚠️ THIS IS THE HONEST VERSION OF `accessoryPicks`, NOT A SECOND ONE. The flat list exists
   * because the picker was Wendler's and its day keys mapped onto nothing here, so a pick had to be
   * placed by what it TRAINS. The Standing Plan's own picker asks per FRAME SLOT — `secondary
   * push_upper`, `focused pull_upper` — so the placement is no longer an inference: the athlete
   * named the movement for that cell and it goes in that cell, on every day the frame carries it.
   *
   * ⛔ THE FLAT LIST STILL TRAVELS ALONGSIDE, and it is what carries the core pick and any extra
   * Dial rows down to the muscle floor. Neither shape is authoritative over the other: this
   * one owns slots, that one owns the floor.
   */
  slotPicks?: Partial<Record<ViadaPickKey, string>> | null;
  /**
   * ⛔ THE DIAL — at most two muscles run toward the source's solid weekly band instead
   * of their three-set minimum. See `accessory-picks.ts` for what is his and what is ours.
   *
   * ⚠️ IT SUPERSEDES `focus` ON THIS PATH. A focus chip biased which movement filled a cell and
   * could not reach glutes or core at all, because no cell in this frame offers a glute- or
   * core-prime movement. When `dial` is present the cell bias stands down and this runs
   * instead; `focus` is untouched for every caller that still sends it.
   */
  dial?: string[] | null;
  /**
   * ⛔ HOW MANY SETS EACH PATTERN'S ME SLOT HAS EARNED — 1, 2 or 3 (device finding A2, 2026-08-24).
   *
   * Absent is one set, which is his own "start at the low end" default and the block every athlete
   * opens on. The count is derived from logged history by `earnedMeSets` and reaches a built block
   * only through the restater, so a block is never authored on a number the athlete has not yet
   * earned. See `ME_SET_LADDER_IS_OURS`.
   */
  meSetsByPattern?: Partial<Record<ViadaPattern, number>> | null;
};

export type ComposeNote = { kind: 'source' | 'ours' | 'inferred' | 'gap' | 'warning'; text: string; cite?: string };

/**
 * ⛔ ONE ME ROW, AND WHOSE PATTERN IT BELONGS TO — the earn rule's index (A2, 2026-08-24).
 *
 * ⚠️ IT IS IN MEMORY AND IT IS NOT A STORED FIELD, deliberately. The alternative was stamping
 * `viada_pattern` onto `StrengthExercise`, which travels into `plans.sessions_by_week` and then into
 * `planned_workouts.strength_exercises` — a persisted shape change for a fact the composer can hand
 * back for free, on a path (`materialize-plan`) that rebuilds each exercise object field by field and
 * would drop it anyway. `earnedMeSets` reads this off a fresh compose; nothing on disk changes.
 */
export type MeRowIndex = {
  week: number;
  day: string;
  movement: string;
  pattern: ViadaPattern;
  /** How many sets the row asked for. A short session is measured against this. */
  sets: number;
  /** The prescribed weight, or `null` on the "by feel" weeks before the test is read. */
  weight: number | null;
};

export type ComposedWeek = {
  frame: FrameId;
  week: number;
  column: ColumnKind;
  isTestWeek: boolean;
  sessions: PlanSession[];
  /** ⛔ THE DOSING LEDGER FOR THE WHOLE WEEK, strength sets included — p147's bucket. */
  ledger: DoseLedger;
  /** ⛔ THE ME ROWS THIS WEEK PRESCRIBED — see {@link MeRowIndex}. Empty in the test week. */
  meRows: MeRowIndex[];
  notes: ComposeNote[];
};

/**
 * ⛔ THE WEEKLY ME/DE ROTATION (p247). Odd weeks take the slot's own pattern; even weeks swap it
 * with its partner. His cadence, not ours — see `StrengthSlot.rotatesWith`.
 */
function patternForWeek(slot: StrengthSlot, week: number): ViadaPattern {
  if (!slot.rotatesWith) return slot.pattern;
  return week % 2 === 1 ? slot.pattern : slot.rotatesWith;
}


/**
 * ⛔ HIS REPS-IN-RESERVE, STAMPED ON THE ROW — and NOT stamped where he says there is none.
 *
 * p218 gives a reserve for three of the four intents (DE and SKILL 3-4, HYP 0-2) and says of ME, in
 * as many words, that there is **no RIR target**. `materialize-plan:2335` honours a row's own
 * `target_rir` above everything else (`getTargetRir` precedence 1), so stamping it here is how his
 * number reaches the logger instead of a protocol-wide average standing in for four different ones.
 *
 * ⚠️ MIDPOINT OF HIS BAND, rounded to the half. The band is his; picking a single number out of it
 * is ours, and it is the only choice in this function.
 *
 * ⚠️ AND AN ME ROW STILL RECEIVES A DERIVED TARGET DOWNSTREAM. `protocolUsesRir` is a
 * protocol-wide flag, not a per-slot one, so `materialize-plan` reads a target off the RPE chart for
 * any row that carries none. On an ME row (90-100%, 1-5 reps) that lands at essentially zero
 * reserve, which restates the prescription rather than contradicting it — but it is not the same as
 * p218's "no target". ⛔ RECORDED AS A GAP for the slice that touches the RIR seam; it is not fixed
 * by widening a shared flag on this stage's account.
 */
function targetRirForIntent(intent: 'ME' | 'DE' | 'SKILL' | 'HYP'): number | null {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell' || !p.rir) return null;
  return Math.round(((p.rir.lo + p.rir.hi) / 2) * 2) / 2;
}

/**
 * ⛔ HIS ME SET BAND — 1 to 3, p218 — READ OFF STAGE 2 RATHER THAN RESTATED HERE.
 *
 * The ladder in `progression.ts` clamps to it and `exerciseForSlot` interpolates inside it. Writing
 * `{ lo: 1, hi: 3 }` in either place would be a second owner of a number `strength-grid/intents.ts`
 * already holds, and the two would part company the first time the band moved.
 */
export const ME_SETS_BAND: { lo: number; hi: number } = (() => {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.setsBand : { lo: 1, hi: 1 };
})();

/**
 * ⛔ PERCENT OF THE WORKING NUMBER, PER INTENT — AND IT IS THE BOTTOM OF THE BAND, NOT THE TOP.
 *
 * ⚠️ THIS RETURNED `pctOf1RM.hi` UNTIL 2026-08-24 AND THAT WAS AN ARITHMETIC ERROR, not a policy
 * choice. Paired with the set plan's `reps.hi` it prescribed **five reps at 100% of the working
 * number** on every ME slot — and the working number is already 96% of a predicted max, so the row
 * asked for five reps at ninety-six per cent of a one-rep max. Stage 2 owns the bands; picking a
 * point inside one is this function's only decision, and it now takes the end the source's own
 * "start low" instruction points at. Full reasoning and Michael's ruling: `INTENSITY_STARTS_LOW_IS_OURS`.
 */
function pctForIntent(intent: 'ME' | 'DE' | 'SKILL' | 'HYP'): number | null {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell' || !p.pctOf1RM) return null;
  return p.pctOf1RM.lo;
}

const LIFT_FOR_PATTERN: Record<ViadaPattern, TestedLift> = {
  push_upper: 'bench',
  pull_upper: 'bench',
  hinge_lower: 'deadlift',
  press_lower: 'squat',
};

const LOWER_PATTERNS: ViadaPattern[] = ['hinge_lower', 'press_lower'];

/**
 * ⛔ WHICH PATTERN'S COMPETITION LIFT IS THIS TESTED LIFT — and the `null` is the load-bearing half.
 *
 * ⚠️ IT IS NOT THE INVERSE OF `LIFT_FOR_PATTERN`, deliberately. That map answers *"if this pattern
 * carried a number, whose would it be"*; `pull_upper` answers `bench` there because a pull slot
 * shares no tested lift of its own. Inverting it would seed a competition lift onto `pull_upper` and
 * hand a barbell row the bench press's working number — `pull up @ 205 lb`, the first defect the
 * composer's own smoke run found, re-entering through the name table.
 *
 * ⚠️ AND OVERHEAD PRESS RESOLVES TO `null`. Neither column of `strength_5k` carries a `push_upper`
 * competition slot the athlete would fill with a press rather than a bench, so the frame tests the
 * press and never spends its number. p246 is the law; inventing a slot for it would be authorship.
 */
export const PATTERN_FOR_TESTED_LIFT: Record<TestedLift, ViadaPattern | null> = {
  bench: 'push_upper',
  squat: 'press_lower',
  deadlift: 'hinge_lower',
  overheadPress: null,
};

/**
 * ⛔ THE ONE TABLE OF WHAT EACH TESTED LIFT IS CALLED IN THIS BLOCK — written by the test session,
 * read back by whatever reads the test.
 *
 * ⚠️ SLICE 2 FOUND THE ROUND TRIP BROKEN. The test session named its exercises by the raw key
 * (`overheadPress`), so the athlete saw a key on a card and the reader could not find the one set
 * every weight in the block depends on. The name is resolved once, here, and both ends use it.
 */
export function testWeekLiftNames(
  competitionLifts: Partial<Record<ViadaPattern, string>>,
): Record<TestedLift, string> {
  const out = {} as Record<TestedLift, string>;
  for (const lift of TESTED_LIFTS) {
    const pattern = PATTERN_FOR_TESTED_LIFT[lift];
    out[lift] = testedLiftName(lift, pattern ? competitionLifts[pattern] : null);
  }
  return out;
}

/**
 * ⛔ THE ATHLETE'S PICKS, HELD FOR THE WHOLE WEEK — because "was this one used yet" is a question
 * about the WEEK and a day loop cannot see it.
 *
 * ⚠️ FOLDED KEYS, NOT RAW ONES. The picker stores display names (`Chin-Up`, `Weighted Sit-Up`) and
 * both the grid and the muscle classifier are keyed off the catalogue's own spellings (`chin up`).
 * An exact-string comparison matches almost nothing and is indistinguishable from an athlete who
 * picked nothing at all — which is the shape of the defect this whole path exists to close.
 */
export const PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN =
  'Your accessory choices are placed by what they train, not by the day you chose them on. The '
  + 'picker asks per lifting day for a three-day programme; this week has four differently shaped '
  + 'ones, so a choice goes wherever the week has a slot for that movement pattern, or fills the gap '
  + 'for the muscle it works.';

type PickPool = {
  /**
   * canonical name → the athlete's own spelling, for the row and for the compromise line.
   *
   * ⛔ CANONICAL, NOT FOLDED, SINCE 2026-08-24, AND THE PLURAL IS WHY. `foldExerciseName` strips
   * punctuation and nothing else, so the picker's `Bulgarian Split Squats` folded to
   * `bulgarian split squats` and the catalogue's entry folds to `bulgarian split squat` — **two
   * keys for one movement.** The pick therefore matched no option, stayed unplaced, and the week
   * printed the athlete's spelling BESIDE the engine's in the same session. `canonicalize` is the
   * app's one owner of "are these two names the same lift" and carries the plural rule (Q-197).
   */
  byFold: Map<string, string>;
  /** Canonical names not yet placed anywhere in the week. */
  unplaced: Set<string>;
  /**
   * ⛔ CANONICAL NAMES ALREADY PLACED THIS WEEK — the A1 ruling's *"dedupe against the week"*.
   *
   * ⚠️ IT GUARDS THE **GRID'S** PATH, NOT THE PICK'S. Two slots can resolve to the same movement on
   * different days: `strength_5k` day 2's ambiguous lower slot and day 5's focused lower slot both
   * land on the split squat for a barbell athlete, and they did so before picks existed. That is
   * tolerable when the engine chose both — it is not when one of them is the athlete's stated choice,
   * because the week then reads as *"we heard you, and we also did it again"*. The later slot takes
   * the next option instead.
   *
   * ⛔ IT IS DELIBERATELY NARROW. A general week-wide dedupe would change every week this composer
   * has ever built, for a defect nobody has reported. This changes only weeks that carry picks.
   */
  placed: Set<string>;
};

function pickPool(names: string[] | null | undefined): PickPool {
  const byFold = new Map<string, string>();
  for (const raw of names ?? []) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    const key = canonicalize(name);
    if (key && key !== 'unknown' && !byFold.has(key)) byFold.set(key, name);
  }
  return { byFold, unplaced: new Set(byFold.keys()), placed: new Set() };
}

/**
 * ⛔ ONE STRENGTH SLOT → ONE EXERCISE ROW.
 *
 * The `Accessory:` role is a FILTER on top of stage 2, exactly as p247 defines it: exclude the
 * athlete's competition movement for that pattern, then take the grid's answer.
 */
/** Chip → the muscles it names, in the accessory-dosing vocabulary. OURS, one place. */
const FOCUS_MUSCLES: Record<string, string[]> = {
  arms: ['biceps', 'triceps'],
  chest: ['chest'],
  shoulders: ['deltoids'],
  glutes: ['glutes'],
  core: ['core'],
};
function focusMuscleSet(focus: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const chip of focus ?? []) for (const m of FOCUS_MUSCLES[chip] ?? []) out.add(m);
  return out;
}

function exerciseForSlot(
  slot: StrengthSlot,
  args: ComposeArgs,
  notes: ComposeNote[],
  /** ⛔ IS THE HAIRCUT'S STATED CAUSE PRESENT — a hard RUN on day 1. See `prescribedLoad`. */
  hardRunBeforeLower: boolean,
  /** ⛔ ALREADY ON THIS DAY. Two slots resolving to the same movement is a real outcome of the grid
   *  — a hip thrust satisfies both `primary press_lower` and `secondary hinge_lower` — and it reads
   *  as an engine that lost its place. The later slot takes the next option instead. */
  takenToday: Set<string>,
  /** ⛔ THE ATHLETE'S UNPLACED PICKS. A HYP slot offers itself to them before the grid answers. */
  picks: PickPool,
  /** The focus chips, as muscles — see `focusMuscleSet`. Empty = no bias. */
  focusMuscles: Set<string> = new Set(),
  /**
   * ⛔ THE DIAL MUSCLES — the ones the athlete asked to run toward the solid band. A HYP slot
   * whose movement's prime mover is one of these takes FOUR sets instead of three: the top of his
   * 3-4 band (p218) rather than the bottom his "start low" instruction otherwise picks.
   */
  dialMuscles: Set<MuscleGroup> = new Set(),
  /**
   * ⛔ THE FRAME DAY THIS SLOT SITS ON — required for the day-scoped picks. `focused pull_upper`
   * falls on day 1 and day 4 and each day has its OWN pick, so resolving by cell alone would hand
   * both days the same answer. ⚠️ Frame day, not weekday: it does not rotate.
   */
  frameDay: number | null = null,
): { exercise: StrengthExercise; movement: string; sets: number; pattern: ViadaPattern } {
  const pattern = patternForWeek(slot, args.week);
  const competition = args.competitionLifts[pattern] ?? null;

  const resolved = resolveSlot({
    category: slot.category,
    pattern,
    intent: slot.intent,
    equipment: args.equipment ?? null,
  });

  let movement: string;
  /**
   * ⛔ A HYP ACCESSORY SLOT GOES TO THE ATHLETE'S PICK WHEN THE PICK FITS IT (A1, 2026-08-24).
   *
   * ⚠️ **FITS** IS `resolveSlot`'s OWN ANSWER, NOT A SECOND TEST. The pick must already be one of the
   * options this cell offers — same pattern, same category, same equipment gate — so honouring it
   * can never put a movement in a slot the frame did not ask for, and it can never widen the gear
   * gate. A pick that fits nowhere in the frame falls through to the muscle floor, and one that fits
   * neither is reported through `placement_compromises`.
   *
   * ⛔ HYP ONLY. ME and DE slots carry the frame's competition and accessory prescriptions; those
   * are the programme's, not the athlete's, and pivot §6 puts the athlete's choice in the exercises
   * the frame leaves open — which is what the hypertrophy slots are.
   */
  /**
   * ⛔ THE SLOT'S OWN PICK, AND IT IS TRIED BEFORE THE FLAT POOL (2026-08-24). The Standing Plan's
   * picker asks per frame slot, so there is nothing to infer: this cell has a name on it.
   *
   * ⛔ IT IS NOT CONSUMED. A pick can fill its cell on every day that cell falls on; the flat pool's
   * `unplaced` set is single-use by construction and could not express that, which is why routing by
   * slot is a different mechanism rather than a tidier spelling of the same one. ⚠️ `takenToday`
   * still applies, so one movement can never print twice in a single session.
   *
   * ⚠️ BOTH TWICE-OCCURRING CELLS ARE DAY-SCOPED NOW. `focused pull_upper` (days 1 and 4) carries
   * `iso_pull_a` / `iso_pull_b` because rear-delt work and arm work are different answers;
   * `secondary press_lower` (days 2 and 5) carries `single_leg_a` / `single_leg_b` because the ME
   * lower day and the DE lower day are different days and the zero-touch week should not spend both
   * on one movement (Michael, 2026-08-25). `pickKeyForSlot` is given `frameDay` so the right one
   * answers — see `LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`. The day-agnostic fallback in
   * `pickKeyForSlot` is unused by the table today and kept for the cell that genuinely wants one
   * answer.
   *
   * ⚠️ AND IT STILL HAS TO FIT. The name is matched against `resolveSlot`'s own options for this
   * cell — the picker built its dropdown from that same call — so honouring it can never widen the
   * equipment gate or put a movement in a slot the frame did not ask for.
   */
  const slotKey = slot.intent === 'HYP' && slot.role === 'accessory'
    ? pickKeyForSlot(slot.category, pattern, frameDay ?? undefined)
    : null;
  const named = slotKey ? String(args.slotPicks?.[slotKey] ?? '').trim() : '';
  const fromSlotPick = named !== ''
    ? resolved.options.find((o) => canonicalize(o.name) === canonicalize(named)
      && !takenToday.has(canonicalize(o.name))
      && (!competition || canonicalize(o.name) !== canonicalize(competition)))
    : undefined;

  const fromPick = fromSlotPick ?? (slot.intent === 'HYP' && slot.role === 'accessory'
    ? resolved.options.find((o) => {
      const key = canonicalize(o.name);
      return picks.unplaced.has(key)
        && !takenToday.has(key)
        && (!competition || key !== canonicalize(competition));
    })
    : undefined);

  if (fromPick) {
    // ⚠️ THE ATHLETE'S OWN SPELLING IS WHAT THE ROW SHOWS. They typed `Chin-Up`; printing the
    // catalogue's `chin up` back at them reads as the app having ignored the choice and picked
    // something similar.
    movement = picks.byFold.get(canonicalize(fromPick.name)) ?? fromPick.name;
    picks.unplaced.delete(canonicalize(fromPick.name));
    picks.placed.add(canonicalize(fromPick.name));
    /**
     * ⚠️ AND A SLOT PICK IS NOT REPORTED AS UNPLACED WHEN A LATER DAY RE-USES IT. `unplaced` is the
     * flat pool's bookkeeping; deleting the key here is what keeps the compromise line honest for a
     * pick that travelled down both pipes.
     */
  } else if (slot.role === 'competition' && competition) {
    // ⛔ *"All first lifts of the day should be a competition movement"* (p247). The athlete named it,
    // and it is never deduped away — the frame asks for it by name.
    movement = competition;
  } else {
    // ⛔ THE ROLE FILTER. A noncompetition variant in the same gross pattern.
    const options = (slot.role === 'accessory' && competition
      ? resolved.options.filter((o) => canonicalize(o.name) !== canonicalize(competition))
      : resolved.options)
      // ⛔ AND NOT A MOVEMENT THE ATHLETE'S OWN PICK ALREADY HOLDS — see `PickPool.placed`.
      .filter((o) => !picks.placed.has(canonicalize(o.name)));
    /**
     * ⛔ THE FOCUS BIAS (B2, 2026-08-24), HYP accessory slots only: among THIS CELL'S OWN options,
     * one whose prime mover the athlete's chips name wins over the default. It can never widen the
     * cell, change the pattern, or touch ME/DE — a chip is a preference inside the frame's choice,
     * exactly like a pick, one step weaker.
     */
    /**
     * ⚠️ AND IT STANDS DOWN WHERE THE DIAL IS RUNNING (2026-08-24). The two answer the
     * same question with different force — a chip that MOVES VOLUME does not also need to nudge a
     * cell's choice, and the pick defaults are already re-pointed by the picker itself.
     */
    const focused = dialMuscles.size === 0
      && slot.intent === 'HYP' && slot.role === 'accessory' && focusMuscles.size > 0
      ? options.find((o) => !takenToday.has(canonicalize(o.name))
        && focusMuscles.has(musclesWorkedBy(o.name)?.primary ?? ''))
      : undefined;
    let fresh = focused ?? options.find((o) => !takenToday.has(canonicalize(o.name)));

    /**
     * ⛔ IF THE CELL IS EXHAUSTED, WIDEN THE CATEGORY — NOT THE PATTERN.
     *
     * A bodyweight-only athlete has two or three movements in a lower-body cell, and two slots on
     * one day can empty it. p247 defines an accessory as *"a noncompetition lift with a similar
     * gross movement PATTERN"* — the pattern is the part that must hold, so the category is what
     * gives. ⚠️ This is the same widening stage 2's own ladder does for equipment, asked here for a
     * different reason, and it goes through `resolveSlot` rather than reimplementing it.
     */
    if (!fresh) {
      for (const alt of ['secondary', 'braced', 'focused', 'primary'] as const) {
        if (alt === slot.category) continue;
        const wider = resolveSlot({ category: alt, pattern, intent: slot.intent, equipment: args.equipment ?? null });
        fresh = wider.options.find((o) =>
          !takenToday.has(canonicalize(o.name))
          && !picks.placed.has(canonicalize(o.name))
          && (!competition || canonicalize(o.name) !== canonicalize(competition)));
        if (fresh) break;
      }
    }
    // ⚠️ AND ONLY THEN A REPEAT. A duplicated movement is worse than nothing only until it is the
    // difference between a slot and a hole.
    movement = (fresh ?? options[0] ?? resolved.chosen).name;
    /**
     * ⛔ AND IF THE ONLY ROUTE LEFT IS A BAND, THE ROW SAYS BAND (2026-08-24). `lat pulldown` on a
     * home gym with no cable stack reads as an engine that ignored the declared equipment; `band
     * pull down` reads as the movement it actually is. {@link bandRouteName} owns the rule and
     * renames only when the new string resolves exactly in `EXERCISE_CONFIG` (D-322).
     *
     * ⚠️ THE ENGINE'S OWN PICKS ONLY. The athlete's pick keeps THEIR spelling (see `fromPick`) and a
     * competition lift is named by the athlete — neither is ours to relabel.
     */
    movement = bandRouteName(movement, args.equipment ?? null);
  }
  /**
   * ⛔ CANONICAL, NOT LOWERCASED, AND THAT IS THE SESSION-DUPLICATE FIX (2026-08-24). A raw
   * `.toLowerCase()` makes `pull up` and `pullup`, `overhead press` and `military press`,
   * `bulgarian split squat` and `Bulgarian Split Squats` **different movements to this Set** — 17
   * such collision groups exist in the grid's own index — so two slots on one day could print the
   * same lift twice under two spellings. `canonicalize` is the app's owner of that comparison.
   */
  takenToday.add(canonicalize(movement));

  if (slot.ambiguousNotation && !notes.some((n) => n.text === slot.ambiguousNotation)) {
    notes.push({ kind: 'gap', text: slot.ambiguousNotation, cite: 'Viada p246' });
  }

  /**
   * ⛔ THE ME SLOT'S SET COUNT IS EARNED (A2, 2026-08-24) — and it still comes out of stage 2's band.
   *
   * Every ME slot prescribed ONE set of 1-5 for twelve weeks, because `setsFor` returns the low end
   * of a band unless a caller says otherwise and no caller ever did. p084 asks for **4 to 6 reps
   * above 90% per movement pattern per week**, and a single set of one to five sits at or below that
   * floor permanently — the thing that was short was the set COUNT, and nothing in the engine could
   * move it. `meSetsByPattern` carries what the pattern has earned; the band, and the interpolation
   * inside it, stay owned by `strength-grid/intents.ts`.
   *
   * ⚠️ ABSENT IS ONE SET, which is his own default and the block every athlete opens on. A block is
   * never AUTHORED on an earned count — the count arrives through the restater, after the sessions
   * that earned it were logged.
   */
  const earnedMe = slot.intent === 'ME' ? Number(args.meSetsByPattern?.[pattern]) : NaN;
  /**
   * ⛔ THE DIAL FOURTH SET (2026-08-24) — the second of the dial's three mechanisms, and it is
   * the only one that touches a slot the frame already owns.
   *
   * p218 gives HYP a 3-to-4 set band and his own instruction is to open at the low end. A muscle the
   * athlete named runs at the TOP of that band instead. ⛔ It is a position inside HIS band, never a
   * fifth set: `setsFor` clamps, and nothing here can leave the page.
   *
   * ⚠️ HYP ACCESSORY ONLY. An ME or DE slot is the programme's prescription, and a chip about how a
   * muscle looks has no business moving the load on a competition lift.
   */
  const dialSlot = slot.intent === 'HYP' && slot.role === 'accessory'
    && dialMuscles.has((musclesWorkedBy(movement)?.primary ?? '') as MuscleGroup);
  const setPosition = Number.isFinite(earnedMe)
    ? setPositionForCount(earnedMe, ME_SETS_BAND)
    : (dialSlot ? 1 : undefined);
  const p = prescribe(slot.intent, 'barbell', setPosition);
  const sets = p.kind === 'barbell' ? p.sets : 1;
  const reps = p.kind === 'barbell' ? `${p.reps.lo}-${p.reps.hi}` : '';
  const isLower = LOWER_PATTERNS.includes(pattern);
  const pct = pctForIntent(slot.intent);

  /**
   * ⛔ A WORKING NUMBER BELONGS TO A TESTED LIFT, NOT TO A PATTERN — and getting this wrong is
   * D-322's disease with a new face. The pretest measures four lifts. A pull-up shares the
   * `pull_upper` pattern with nothing that was tested, and a hip thrust shares `hinge_lower` with the
   * deadlift; prescribing either off the neighbouring lift's number produces "Pull Up @ 205 lb" —
   * a real weight, for a movement that has none.
   *
   * ⚠️ SO THE LOAD IS PRESCRIBED ONLY WHERE THE MOVEMENT **IS** THE LIFT THAT WAS TESTED. Everything
   * else takes the app's existing auto-regulated contract: the plan states the movement and the reps
   * and nothing about the weight.
   */
  const testedLift = LIFT_FOR_PATTERN[pattern];
  const movementIsTested = testedLift != null
    && args.competitionLifts[pattern] != null
    && movement.toLowerCase() === String(args.competitionLifts[pattern]).toLowerCase();
  const working = movementIsTested ? args.workingNumbers?.[testedLift] : undefined;

  // ⛔ HYP CARRIES NO PERCENTAGE (p218 gives it reps, tempo and RIR and no load), so a HYP row states
  // the movement and the reps and NOTHING about the weight — the same `load_prescribed: false`
  // contract the app already has for auto-regulated work.
  const targetRir = targetRirForIntent(slot.intent);

  if (!working || pct == null) {
    return {
      exercise: {
        name: movement,
        sets,
        reps,
        weight: 'By feel',
        load_prescribed: false,
        ...(targetRir != null ? { target_rir: targetRir } : {}),
        notes: slot.sourceText,
      },
      movement,
      sets,
      pattern,
    };
  }

  const { weight, haircut } = prescribedLoad({
    working,
    frame: args.frame,
    week: args.week,
    isLower,
    hardRunBeforeLower,
    pctOfWorkingNumber: pct,
    roundTo: args.roundTo ?? 5,
  });

  if (isLower && !hardRunBeforeLower && !notes.some((n) => n.text === HAIRCUT_CAUSE_IS_OURS)) {
    // ⛔ SAID OUT LOUD, BECAUSE IT IS OUR READING. The lower-body weights are NOT reduced this block,
    // and the reason is that the hard session moved to the bike.
    notes.push({ kind: 'ours', text: HAIRCUT_CAUSE_IS_OURS });
  }
  if (isLower && haircut < 1 && !notes.some((n) => n.cite === 'Viada p247' && n.text.includes('lower-body'))) {
    notes.push({
      kind: 'source',
      text: 'The lower-body weights start about three and a half per cent under where the test put '
        + 'them, because the run the day before is still in the legs. That comes back over the first '
        + 'nine weeks.',
      cite: 'Viada p247',
    });
  }

  return {
    exercise: {
      name: movement,
      sets,
      reps,
      weight,
      percent_1rm: pct,
      ...(targetRir != null ? { target_rir: targetRir } : {}),
      set_plan: Array.from({ length: sets }, () => ({
        weight,
        reps: p.kind === 'barbell' ? p.reps.hi : 1,
      })),
      notes: slot.sourceText,
    },
    movement,
    sets,
    pattern,
  };
}

/**
 * ⛔ THE TEST WEEK (Michael, 2026-08-23). Week one's ME days run the p215 pretest as guided
 * sessions — upper on day 1, lower on day 2 — and the stored 1RM only aims the warm-ups.
 */
function testDaySession(day: FrameDay, args: ComposeArgs, notes: ComposeNote[]): PlanSession | null {
  const lifts = TEST_DAY_LIFTS[day.day];
  if (!lifts) return null;
  // ⛔ THE TEST TESTS THE MOVEMENT THE BLOCK WILL PRESCRIBE — see `testWeekLiftNames`.
  const names = testWeekLiftNames(args.competitionLifts);
  const exercises: StrengthExercise[] = [];
  for (const lift of lifts) {
    const seed = args.seed1RMs?.[lift];
    const steps = seed ? pretestSession(lift, seed, args.roundTo ?? 5) : null;
    if (!steps) {
      // ⛔ NO SEED IS NOT A REASON TO SKIP THE TEST. It is a reason to run it by feel and say so.
      exercises.push({
        name: names[lift],
        reps: '6, 5, max',
        weight: 'By feel',
        load_prescribed: false,
        notes: 'No max on file to aim the warm-ups — work up until the last set is genuinely hard.',
      });
      continue;
    }
    exercises.push({
      name: names[lift],
      sets: steps.length,
      reps: steps.map((s) => s.reps).join(', '),
      weight: steps[steps.length - 1].weight,
      load_prescribed: true,
      notes: 'Test set — the last set is taken for max clean reps, and it sets the block\'s numbers.',
      set_plan: steps.map((s) => ({
        weight: s.weight,
        reps: s.reps === 'max' ? 1 : s.reps,
        amrap: s.reps === 'max',
      })),
    });
  }
  if (exercises.length === 0) return null;
  if (!notes.some((n) => n.text.includes('first week is the test'))) {
    notes.push({
      kind: 'source',
      text: 'The first week is the test. Two guided sessions set the numbers the rest of the block '
        + 'is built on, and fully prescribed weights start in week two. Testing before a programme '
        + 'is the source\'s own advice.',
      cite: 'Viada p215, p247',
    });
  }
  return {
    day: dayNameFor(args, day.day),
    type: 'strength',
    name: day.day === 1 ? 'Test: Upper' : 'Test: Lower',
    description: 'Work up in three steps. The last set is max clean reps and it is what the block reads.',
    duration: 45,
    strength_exercises: exercises,
    tags: ['standing_plan', 'test_week'],
  };
}

/**
 * ⛔ THE PLYO DAY'S ROWS — NAMED DRILLS, ONE ROW EACH (A3, 2026-08-24).
 *
 * ⚠️ WHAT THIS REPLACES: a single row reading `Plyometric drills 3×4`. That is the name of a category
 * with a set count attached, and p227's very first instruction is that **all drills are done
 * SEPARATELY** — a claim one row cannot express and an athlete cannot follow.
 *
 * ⛔ THE DRILLS, THE FAMILIES, THE PER-DAY CAP AND THE STOP RULE ARE ALL HIS. What is ours is the
 * efforts-per-drill figure (`PLYO_DOSE.effortCountIsOurs`) and taking one drill from each family
 * (`PLYO_FAMILY_MIX_IS_OURS`); both say so on the block.
 */
function plyoRows(args: ComposeArgs, notes: ComposeNote[]): StrengthExercise[] {
  if (!notes.some((n) => n.text === PLYO_DOSE.effortCountIsOurs)) {
    notes.push({ kind: 'ours', text: PLYO_DOSE.effortCountIsOurs });
    notes.push({ kind: 'source', text: PLYO_DOSE.stopRule, cite: PLYO_DOSE.stopRuleIsHis });
    notes.push({ kind: 'ours', text: PLYO_FAMILY_MIX_IS_OURS });
  }
  return PLYO_FAMILIES_PER_DAY.map((family) => ({
    name: drillForWeek(family, args.week),
    // ⛔ ONE ROW, ONE DRILL, and the efforts sit in `reps` because a plyometric row shows reps and
    // nothing else (D-3452) — there is no load to record and no plate calculator to draw.
    sets: 1,
    reps: PLYO_DOSE.effortsPerDrill,
    weight: 'Bodyweight',
    load_prescribed: false,
    notes: `About ${PLYO_DOSE.effortsPerDrill} efforts, full rest between. `
      + `${PLYO_FAMILIES[family].benefit}. Stop when the movement stops being crisp.`,
  }));
}

/**
 * ⛔ THE FRAME'S PLYO DAY — ITS OWN SESSION, ON THE DAY p246 MARKS AND ON NO OTHER.
 *
 * ⚠️ THE WEEK'S SESSION COUNT IS UNCHANGED BY THE DRILL WORK. What changed on 2026-08-24 is that the
 * session names its drills instead of carrying one row called *"Plyometric drills"*; where it sits
 * and how long it takes are exactly what they were.
 *
 * ⛔ AND THE DRILLS NEVER ENTER `dosing`. They are not barbell work sets: counting them would inflate
 * the day against p086's fourteen-set ceiling and push the muscle floor onto a different session.
 */
function plyoSession(day: FrameDay, args: ComposeArgs, rows: StrengthExercise[]): PlanSession {
  return {
    day: dayNameFor(args, day.day),
    type: 'strength',
    name: 'Plyometrics',
    description: PLYO_DOSE.stopRule,
    duration: 20,
    strength_exercises: rows,
    tags: ['standing_plan', 'plyo'],
  };
}

/** ⛔ COMPOSE ONE WEEK. */
export function composeWeek(args: ComposeArgs): ComposedWeek {
  const frame = FRAMES[args.frame];
  if (!frame) throw new Error(`unknown frame: ${args.frame}`);
  const days = frame.columns[args.column];
  /**
   * ⛔ EACH HARD SLOT'S POSITION IN THE FRAME'S ORDER, so a pin can be matched to the slot it was
   * made for. Built once over the whole column rather than counted inside the day loop, because the
   * loop also runs for days with no endurance at all and an inline counter would drift.
   */
  const hardSlotIndex = new Map<string, number>();
  {
    let n = 0;
    for (const d of days) {
      d.endurance.forEach((slot, i) => {
        if (anchorRoleOf(slot.family) === 'hard') hardSlotIndex.set(`${d.day}:${i}`, n++);
      });
    }
  }
  if (!days) throw new Error(`unknown column: ${args.column}`);

  const notes: ComposeNote[] = [];
  const sessions: PlanSession[] = [];
  const dosing: DosingSession[] = [];
  /** ⛔ THE EARN RULE'S INDEX — see {@link MeRowIndex}. Never persisted. */
  const meRows: MeRowIndex[] = [];
  /**
   * ⛔ WEEK ONE IS THE TEST WEEK — UNLESS THE ATHLETE TOOK THE SKIP (Michael, 2026-08-23), and the
   * skip is only offerable when logged history already carries a trustworthy max for every lift the
   * block prescribes from. `skipTestWeek` is not a preference the composer honours on its own: the
   * caller must have derived the working numbers from that evidence first.
   *
   * ⚠️ A SKIP WITH NO WORKING NUMBERS IS REFUSED HERE rather than obeyed. That combination would
   * drop the test AND prescribe nothing — twelve weeks of "By feel" with no way to fix it — which is
   * a worse outcome than either branch alone. Falling back to the test is the safe direction.
   */
  const skipping = args.skipTestWeek === true
    && Object.keys(args.workingNumbers ?? {}).length > 0;
  const testWeek = isTestWeek(args.week) && !skipping;
  const anchors = resolveEnduranceAnchors(args.baselines);

  /**
   * ⛔ THE SPORT PER SLOT, DECIDED ONCE FOR THE WHOLE COLUMN (slice 4). It has to be column-wide:
   * "the hard sessions go on the bike" and "the running keeps its long session" are statements about
   * the WEEK, and deciding them slot by slot inside the day loop could not see either.
   */
  /**
   * ⛔ THE ATHLETE'S PICKS, POOLED FOR THE WHOLE WEEK (A1). Consumed by the HYP slots first, then
   * offered to the muscle floor, and whatever is left goes down the compromise channel.
   */
  const picks = pickPool(args.accessoryPicks);
  const focusMuscles = focusMuscleSet(args.focus);
  /**
   * ⛔ THE DIAL CHIPS, AS MUSCLES. Capped and validated by `musclesForChips`, so an unknown
   * string reaches nothing rather than aiming volume at a muscle group that does not exist.
   */
  const dialChips = (args.dial ?? []).filter(isDialChip).slice(0, DIAL_CAP);
  const dialMuscles = musclesForChips(dialChips);
  /**
   * ⛔ THE PICKS ARE PLACED BY SLOT ON THIS PATH, SO THE EXPLANATION GOES QUIET (2026-08-24).
   *
   * `PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN` exists to explain an inference — *"the picker asks per
   * lifting day for a three-day programme; this week has four differently shaped ones"*. When
   * `slotPicks` is present there is no inference: the athlete answered the frame's own slots. A
   * plan that keeps apologising for a mapping it no longer performs is worse than silence.
   */
  const picksAreBySlot = Object.values(args.slotPicks ?? {}).some((v) => String(v ?? '').trim() !== '');
  /**
   * ⛔ A SLOT PICK IS OFF THE ENGINE'S OWN MENU FROM THE START (2026-08-24), and this line is a
   * measured fix rather than tidiness.
   *
   * `PickPool.placed` filters the grid's choices so the engine never re-uses a movement the athlete
   * already has. It could only ever hold picks placed EARLIER IN THE WEEK, and a slot pick is known
   * before the loop runs — so day 1's DE secondary-push slot took `dumbbell bench press` off the
   * grid, and day 4's HYP secondary-push slot then placed the athlete's identical pick. One
   * movement, twice, on two days, one of them the engine's own choice.
   *
   * ⚠️ IT DOES NOT BLOCK THE PICK ITSELF. The slot-routed branch reads `resolveSlot`'s unfiltered
   * options, so seeding this set steers the ENGINE away and leaves the ATHLETE's cell untouched.
   */
  for (const name of Object.values(args.slotPicks ?? {})) {
    const key = canonicalize(String(name ?? '').trim());
    if (key && key !== 'unknown') picks.placed.add(key);
  }
  if (!picksAreBySlot && picks.byFold.size > 0
    && !notes.some((n) => n.text === PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN)) {
    notes.push({ kind: 'ours', text: PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN });
  }

  const sportAssignment = assignSports(days, args.sportMix ?? {});
  /**
   * ⛔ ONE RELOCATOR FOR THE WHOLE WEEK — see `enduranceRelocator`. Built here rather than per slot
   * so the sessions it moves can see each other and never stack onto one free day.
   *
   * ⛔⛔ AND THE ATHLETE'S OWN DAYS GO THROUGH IT FIRST (Michael, 2026-08-25 afternoon). A blocked day
   * beats a pin, but a pin still outranks the frame's rotation for WHICH free day it gets: run in
   * frame order alone, a rotated easy run could take the day nearest the athlete's blocked long ride
   * and push their session further out. So the pinned slots are placed in a pre-pass and the loop
   * below reads their answer rather than asking again.
   */
  const { place: relocate, moves: enduranceMoves } = enduranceRelocator(args);
  /** `${frameDay}:${slotIndex}` → the weekday it ends on. Filled for pinned slots here, the rest below. */
  const enduranceDays = new Map<string, Weekday>();
  for (const d of days) {
    d.endurance.forEach((slot, i) => {
      const key = `${d.day}:${i}`;
      const assigned = assignedSlot(sportAssignment, d.day, i, slot);
      const hardIndex = hardSlotIndex.get(key) ?? 0;
      const role = anchorRoleOf(assigned.family);
      const pinned = role === 'long'
        ? !!args.endurancePins?.long
        : role === 'hard' ? !!args.endurancePins?.hard?.[hardIndex] : false;
      if (!pinned) return;
      const proposed = enduranceDayFor(args, d.day, assigned.family, hardIndex);
      enduranceDays.set(key, relocate(proposed, enduranceLabelFor(role)));
    });
  }
  for (const n of sportAssignment.notes) {
    if (!notes.some((x) => x.text === n.text)) {
      notes.push({ kind: n.kind === 'source' ? 'source' : n.kind === 'warning' ? 'warning' : 'ours', text: n.text, cite: n.cite });
    }
  }

  for (const day of days) {
    if (day.rest) continue;

    // ── plyometrics ───────────────────────────────────────────────────────────────────────────
    //
    // ⛔ THE FRAME OWNS THE DAY. `FrameDay.plyo` marks it in both columns and `plyo.ts` holds no day
    // number of its own, so the two cannot disagree. ⚠️ A three-day spread stood here for one
    // afternoon on 2026-08-24 and was reverted — that layout is the half-marathon frame's (p250), not
    // this one's, and p246 prints "Plyo warm-up" on day 3 alone.
    //
    // ⚠️ IT IS ITS OWN SESSION RATHER THAN ROWS APPENDED TO A LIFT, which matters if a future frame
    // ever marks a lifting day: the drills must not enter `dosing`, and p247's *"all first lifts of
    // the day should be a competition movement"* would not survive a skip at the top of the list.
    const drills = day.plyo ? plyoRows(args, notes) : [];

    // ── strength ──────────────────────────────────────────────────────────────────────────────
    if (day.strength.length > 0) {
      const test = testWeek ? testDaySession(day, args, notes) : null;
      if (test) {
        sessions.push(test);
        {
          // ⛔ THE TEST'S SETS STILL COST THE WEEK. p147 counts a heavy set as a work set whatever
          // its purpose, so the ledger sees them.
          dosing.push({
            label: test.name,
            sets: (test.strength_exercises ?? []).map((e) => ({
              movement: e.name,
              intent: 'ME' as const,
              sets: e.sets ?? 1,
            })),
          });
        }
      } else {
        // ⛔ THE TEST WEEK IS STILL A WEEK. Days 1 and 2 are the pretest; days 4 and 5 run their own
        // slots as normal — by feel, because there is no working number until the test is done. A
        // week that simply drops half its lifting days is not what "the first week is the test"
        // means, and the athlete would find two empty days with no explanation.
        const exercises: StrengthExercise[] = [];
        const dosed: DosingSession['sets'] = [];
        const takenToday = new Set<string>();
        for (const slot of day.strength) {
          const { exercise, movement, sets, pattern } = exerciseForSlot(
            slot, args, notes, sportAssignment.hardRunBeforeMeLower, takenToday, picks, focusMuscles,
            dialMuscles, day.day);
          exercises.push(exercise);
          dosed.push({ movement, intent: slot.intent, sets });
          if (slot.intent === 'ME') {
            const top = Array.isArray(exercise.set_plan) && exercise.set_plan.length > 0
              ? Number(exercise.set_plan[exercise.set_plan.length - 1].weight)
              : NaN;
            meRows.push({
              week: args.week,
              day: dayNameFor(args, day.day),
              movement,
              pattern,
              sets,
              // ⚠️ `null` ON THE "BY FEEL" WEEKS. A row with no prescribed weight has no number for a
              // logged set to fall short of, and the outcome test must not invent one.
              weight: Number.isFinite(top) && top > 0 ? top : null,
            });
          }
        }
        if (testWeek && !notes.some((n) => n.text.includes('by feel this week'))) {
          notes.push({
            kind: 'source',
            text: 'The other lifting days run by feel this week — the numbers arrive once the test is done.',
            cite: 'Viada p215',
          });
        }
        sessions.push({
          day: dayNameFor(args, day.day),
          type: 'strength',
          name: day.label ?? 'Strength',
          description: '',
          duration: 55,
          strength_exercises: exercises,
          tags: ['standing_plan', `frame:${frame.id}`, `column:${args.column}`],
        });
        dosing.push({ label: day.label ?? `day ${day.day}`, sets: dosed });
      }
    }

    // ⚠️ AFTER THE STRENGTH BRANCH, so a day that ever does lift still LEADS on its lift. Order
    // inside a day is what the calendar renders.
    if (drills.length > 0) sessions.push(plyoSession(day, args, drills));

    // ── endurance ─────────────────────────────────────────────────────────────────────────────
    //
    // ⛔ THE SLOT IS A SESSION TYPE; THE SPORT IS ASSIGNED (slice 4, pivot §2). `assignSports` has
    // already decided the whole column — hard slots to the bike when a bike is in the mix, the long
    // slot kept by the running athlete, one easy slot to a kept swim. This loop builds what it was
    // told to and decides nothing.
    day.endurance.forEach((slot, i) => {
      const assigned = assignedSlot(sportAssignment, day.day, i, slot);
      const level = (args.levelOverrides?.[assigned.family] as Level | undefined) ?? assigned.level;
      /**
       * ⛔ "ENGINE'S PICK — ROTATES WEEK TO WEEK" MUST BE TRUE (Michael, 2026-08-24). With no
       * athlete pick, the library took its first archetype every week — twelve identical
       * workouts wearing a rotation's label. OURS: alternate the family's own offered shapes by
       * week; his variety principle, applied inside his own option set.
       */
      const built = buildEnduranceSession({
        family: assigned.family,
        level,
        archetype: assigned.archetype ?? rotatedArchetype(assigned.family, level, args.week),
        anchors,
      });
      const row = translateEnduranceSession(built, { raceTempo: assigned.raceTempo });
      sessions.push({
        // ⛔ THE PIN WINS HERE AND ONLY HERE. Every other `dayNameFor` call in this file is a lift,
        // a plyo block or an add-on, and those keep the frame's rotation — see `endurancePins`.
        // ⛔ AND THEN OFF A DAY THE ATHLETE CANNOT TRAIN — the pinned slots already went through the
        // relocator in the pre-pass above, so this reads their answer rather than re-asking.
        day: enduranceDays.get(`${day.day}:${i}`) ?? relocate(
          enduranceDayFor(args, day.day, assigned.family, hardSlotIndex.get(`${day.day}:${i}`) ?? 0),
          enduranceLabelFor(anchorRoleOf(assigned.family)),
        ),
        ...row,
        // ⚠️ A SUBSTITUTED SLOT SAYS SO ON THE ROW. The frame's own line is kept verbatim so a reader
        // can still find the row on the page it came from.
        ...(assigned.substituted ? { tags: [...row.tags, 'sport_assigned'] } : {}),
      });
    });
  }

  // ── the easy-swim add-on: OUTSIDE the four slots, never displacing one ────────────────────────
  //
  // ⛔ RULED 2026-08-24 (Michael): swims are an ADD-ON — easy laps and technique for feel, 1 or 2 a
  // week, appended to the lift-only days (the frame's no-endurance days, where easy swimming is the
  // one endurance that taxes neither the legs nor the pressing). The hard swim families are never
  // prescribed by this plan. Supersedes slice 4's easy-slot substitution.
  const swimAddOns = Math.min(2, Math.max(0, Math.round(Number(args.swimEasySessions) || 0)));
  if (swimAddOns > 0 && args.column === 'standard') {
    const liftOnlyDays = days.filter((d) => !d.rest && d.endurance.length === 0 && d.strength.length > 0);
    const swimTargets = liftOnlyDays.length > 0 ? liftOnlyDays : days.filter((d) => !d.rest);
    for (let i = 0; i < swimAddOns && i < swimTargets.length; i++) {
      const built = buildEnduranceSession({ family: SWIM_SLOT.family, level: SWIM_SLOT.level, anchors });
      const row = translateEnduranceSession(built);
      // ⚠️ THE ADD-ON IS ENDURANCE TOO, so it obeys the same blocked-day rule as the slots above.
      sessions.push({
        day: relocate(dayNameFor(args, swimTargets[i].day), 'the easy swim'),
        ...row,
        tags: [...row.tags, 'swim_addon'],
      });
    }
    notes.push({ kind: 'ours', text: SWIM_IS_EASY_ONLY });
  }

  // ── the advanced tier: a PROGRAM tier, gated on demonstrated history ──────────────────────────
  const extraVt1 = advancedTierSessions(args.demonstratedWeeklyMiles);
  if (extraVt1 > 0 && args.column === 'standard') {
    const openDays = days.filter((d) => !d.rest && d.endurance.length === 0 && d.strength.length === 0);
    const targets = openDays.length > 0 ? openDays : days.filter((d) => !d.rest && d.endurance.length === 0);
    for (let i = 0; i < extraVt1 && i < targets.length; i++) {
      const built = buildEnduranceSession({ family: 'run_vt1', level: 1, anchors });
      const row = translateEnduranceSession(built);
      sessions.push({
        day: relocate(dayNameFor(args, targets[i].day), 'the extra easy run'),
        ...row,
        tags: [...row.tags, 'advanced_tier'],
      });
    }
    notes.push({
      kind: 'source',
      text: 'An extra easy run, because the running already on file supports it. The source '
        + 'recommends one or two for more advanced runners, to test recovery.',
      cite: 'Viada p247',
    });
  }

  // ── accessories: stage 3's floor, over the WHOLE week ─────────────────────────────────────────
  //
  // ⛔ THE LEDGER SEES THE STRENGTH SETS TOO. p147 puts high-intensity work sets from strength work
  // in the same bucket as accessory sets; a ledger fed only accessories under-reports every session.
  //
  // ⛔ AND THE FLOOR IS OFFERED THE ATHLETE'S UNPLACED PICKS FIRST (A1). A pick that fits no HYP slot
  // in the frame — every ab movement, for one, since no slot in `strength_5k` carries a core pattern
  // — still reaches the week here, filling the very gap the engine was about to fill for it.
  /**
   * ⛔ THE DIAL'S THIRD MECHANISM — the floor's own machinery, aimed at a target instead
   * of at zero. This is what makes GLUTES and CORE real chips: neither has a cell in this frame, so
   * re-pointing a pick and adding a fourth set both buy them nothing, and an extra row is the only
   * honest way to train them at all.
   *
   * ⛔ AND THE PULL-BACK IS APPLIED HERE, NOT DESCRIBED HERE. `dialDose` owns both halves: no
   * added rows at all on the taper column, and the near session ceiling rather than the far one for
   * an athlete whose own running earns the advanced tier's extra easy sessions.
   */
  const dose = dialDose({
    column: args.column,
    advancedTierSessions: advancedTierSessions(args.demonstratedWeeklyMiles),
  });
  const dialTarget: Partial<Record<MuscleGroup, number>> = {};
  if (dose.targetSets != null) {
    for (const m of dialMuscles) dialTarget[m] = dose.targetSets;
  }
  const filled = fillMuscleFloor(dosing, {
    equipment: args.equipment ?? null,
    prefer: [...picks.unplaced].map((f) => picks.byFold.get(f) ?? f),
    ...(Object.keys(dialTarget).length > 0 ? { target: dialTarget } : {}),
  });
  if (dialChips.length > 0) {
    notes.push({ kind: 'ours', text: DIAL_IS_OURS, cite: 'Viada p86, p218 — the bands are his' });
    notes.push({ kind: 'ours', text: DIAL_PULLBACK_IS_OURS, cite: 'Viada p86' });
    if (dose.pullBack) notes.push({ kind: 'ours', text: dose.pullBack });
  }
  const ledger = ledgerFor(filled.sessions);
  for (const add of filled.added) {
    const target = sessions.find((s) => s.type === 'strength' && (s.name === add.session || s.day === add.session));
    if (!target) continue;
    if (add.fromAthletePick) {
      picks.unplaced.delete(canonicalize(add.movement));
      picks.placed.add(canonicalize(add.movement));
    }
    target.strength_exercises = [
      ...(target.strength_exercises ?? []),
      {
        // ⛔ THE FLOOR'S OWN PICKS GET THE SAME BAND LABEL as a slot's — see `bandRouteName`. The
        // athlete's own pick keeps their spelling.
        name: add.fromAthletePick
          ? (picks.byFold.get(canonicalize(add.movement)) ?? add.movement)
          : bandRouteName(add.movement, args.equipment ?? null),
        sets: add.sets,
        // ⛔ A HOLD DOES NOT GET REPS (2026-08-24, seen on a device as "Plank — 3 x 8-10"). The row
        // is dosed in sets either way; what changes is the unit of the second number, and
        // `repPrescribable` was resolved where the movement was chosen so this never re-derives it.
        reps: add.repPrescribable ? '8-10' : HOLD_PRESCRIPTION,
        weight: 'By feel',
        load_prescribed: false,
        // ⛔ THE ROW SAYS WHOSE MOVEMENT IT IS, AND THAT IS THE WHOLE DEVICE FINDING. `Floor: core had
        // nothing else this week` printed under a movement the athlete had asked for by name is the
        // engine stating, on the plan, that it never saw the choice.
        /**
         * ⛔ THREE DIFFERENT ROWS, THREE DIFFERENT SENTENCES, AND MIXING THEM IS THE A1 DEFECT.
         * `Floor: core had nothing else this week` under a movement the athlete asked for is the
         * engine stating on the plan that it never saw the choice — and the same sentence under an
         * Dial row says the opposite of what happened.
         */
        notes: add.reason === 'target'
          ? `Your ${DIAL_OWNERSHIP[chipForMuscle(add.muscle) ?? 'core']} focus.`
          : add.fromAthletePick
            ? `Your pick for ${add.muscle}.`
            : `Floor: ${add.muscle} had nothing else this week.`,
      },
    ];
  }
  for (const n of filled.notes) notes.push({ kind: n.kind === 'source' ? 'source' : 'ours', text: n.text, cite: n.cite });
  for (const u of filled.unfilled) {
    notes.push({ kind: 'warning', text: `${u.muscle}: ${u.reason}` });
  }

  /**
   * ⛔ A PICK THAT COULD NOT BE HONOURED SAYS SO — the A1 ruling's second half, and it is a `warning`
   * because `buildStandingPlanRow` turns every warning into a `placement_compromises` entry, which
   * is the channel the athlete already reads (`NonRaceBuilder.tsx:2716`).
   *
   * ⚠️ NAMED, NOT COUNTED. *"One of your choices did not fit"* is a sentence nobody can act on; the
   * movement's own name is what lets them pick something else or declare the kit for it.
   */
  /**
   * ⚠️ AND IT GOES QUIET WHERE THE PICKS ARE PLACED BY SLOT (2026-08-24). Every one of those fits by
   * construction — the picker built its dropdown from the same `resolveSlot` call the composer
   * fills the cell with — so the only thing this line could report there is the core pick and the
   * Dial rows, which reach the week through the floor rather than through a slot and are not
   * "unplaced" in any sense the athlete can act on.
   */
  if (!picksAreBySlot && picks.unplaced.size > 0) {
    const names = [...picks.unplaced].map((f) => picks.byFold.get(f) ?? f).sort();
    notes.push({
      kind: 'warning',
      text: `Not placed this week: ${names.join(', ')}. The programme owns how many slots the week `
        + 'holds, and every slot that suits these was already filled — by another of your choices, or '
        + 'by the movement the week was short of.',
    });
  }

  /**
   * ⛔⛔ WHAT A DAY OFF MOVED, AND WHERE TO (Michael, 2026-08-25 afternoon). *"The note says what
   * moved and why."* So this is not a cost the athlete has to infer from two chips disagreeing — it
   * is one sentence naming the day, the session and the day it went to.
   *
   * ⚠️ DEDUPED, because a twelve-week block relocates the same session in every week and twelve
   * identical sentences is not more honest than one. `plan-row.ts` dedupes by text across the block;
   * this keeps one per session within the week.
   * ⚠️ NOT A WARNING. `kind: 'ours'` — the engine did this and says so. The question of whether the
   * REARRANGED week is sound is a different one, answered by the tiered violation notes.
   */
  {
    const said = new Set<string>();
    for (const m of enduranceMoves) {
      const text = `${m.from} is a day off — ${m.session} moved to ${m.to}.`;
      if (said.has(text)) continue;
      said.add(text);
      notes.push({ kind: 'ours', text });
    }
  }

  return {
    frame: args.frame, week: args.week, column: args.column, isTestWeek: testWeek,
    sessions, ledger, meRows, notes,
  };
}

/** Every week of a block. ⛔ Week one is the test week; the taper column is the hold variant. */
export function composeBlock(
  args: Omit<ComposeArgs, 'week' | 'column'> & { weeks: number; taperWeeks?: number[] },
): ComposedWeek[] {
  const out: ComposedWeek[] = [];
  const taper = new Set(args.taperWeeks ?? []);
  for (let week = 1; week <= args.weeks; week++) {
    out.push(composeWeek({ ...args, week, column: taper.has(week) ? 'taper' : 'standard' }));
  }
  return out;
}
