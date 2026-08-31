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
import { bandRouteName, prescribe, resolveSlot, viadaCategoryOf, type ViadaPattern
} from '../strength-grid/index.ts';
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
  VIADA_PICKS,
  type ViadaPickKey,
} from './accessory-picks.ts';
import {
  advancedTierSessions,
  FRAMES,
  EXPERIENCE_IS_THE_ATHLETES_ANSWER,
  frameAsksWeeklyHours,
  experienceLevels,
  LOW_VOLUME_RIDE_LEVELS_ARE_OURS,
  PLYO_DOSE,
  type ColumnKind,
  type EnduranceExperience,
  type FrameDay,
  type FrameId,
  type StrengthSlot,
} from './frames.ts';
import {
  WEEKDAYS, frameFixedDaysFor, titleCaseDay, weekdayForFrameDay, type Weekday,
} from './day-map.ts';
import {
  assignSports, assignedSlot, isHardSlot, isLongSlot, SWIM_SLOT, SWIM_IS_EASY_ONLY, type SportMix,
} from './sport-slots.ts';
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
/**
 * ⛔ THE APP'S OWN RATIO TABLE, READ RATHER THAN RESTATED. `primaryRef` + `ratio` already sit on
 * every movement in the catalogue; a second table here is how two answers to "what does a front
 * squat load at" start disagreeing.
 */
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { FAMILIES } from '../endurance-library/index.ts';

/**
 * ⛔⛔ THE DEFAULT ROTATION — the family's offered archetypes at this level, alternated by week.
 * **HIS, not ours** (relabelled 2026-08-27 off p229): *"I encourage you to try each type of workout
 * in each segment; some may be subjectively 'easier' than others, and each one has a slightly
 * different intent/emphasis. When in doubt, alternate between the one you like the most and hate the
 * most."*
 *
 * ⚠️ WHAT IS OURS IS THE ORDER. He alternates between the one the athlete likes most and hates most;
 * this alternates by week number, because that preference cannot be answered before they have done
 * both and the wizard does not ask it. ⚠️ An explicit pick still wins — see the call site.
 */
function rotatedArchetype(family: string, level: number, week: number): string | undefined {
  const rules = (FAMILIES as Record<string, { archetypes: Array<{ id: string; levels?: number[] }> }>)[family];
  if (!rules) return undefined;
  const offered = rules.archetypes.filter((a) => !a.levels || a.levels.includes(level));
  if (offered.length < 2) return undefined;
  return offered[(Math.max(1, week) - 1) % offered.length].id;
}
import { translateEnduranceSession } from './session-vocabulary.ts';
import { enduranceLedgerFor, type EnduranceLedger } from './endurance-ledger.ts';
import type { EnduranceSession } from '../endurance-library/index.ts';
import { weekConflicts, type WeekConflict } from './week-conflicts.ts';
import {
  DEFAULT_SIZE, easyFillHours, EASY_FILL_SPEC, FREE_ENDURANCE_DAYS, ladderOf,
  REST_DAY_RUNG, rungAt, rungForMinutes, sayHours, sizeFor, slotSpans, weekVolumeBounds,
  type SizeSolve, type SlotSpec, type WeekVolumeBounds,
} from './volume-bounds.ts';
import {
  isTestWeek,
  pretestSession,
  TEST_DAY_LIFTS,
  TESTED_LIFTS,
  testedLiftName,
  type TestedLift,
  type WorkingNumber,
} from './working-number.ts';
import { rampFor, RAMP_NOTE, slotTakesRamp } from './warmup.ts';

// ── the app's existing plan-row shape. Nothing new. ─────────────────────────────────────────────

/**
 * ⚠️ `reps` IS OPTIONAL (2026-08-26). An auto-regulated heavy set with no last-time result at
 * this weight carries a weight and NO rep count — the cell opens blank and the row's own band
 * is the target. Every other slot still states one.
 */
export type PlannedSet = { weight: number; reps?: number; amrap?: boolean; warmup?: boolean };

export type StrengthExercise = {
  name: string;
  sets?: number;
  reps: number | string;
  weight: string | number;
  percent_1rm?: number;
  load_prescribed?: boolean;
  notes?: string;
  /**
   * ⛔ THE SLOT'S INTENT AS A FIELD, NOT PROSE (2026-08-26, Michael: "these take up a lot of
   * space dont use the abbreviations"). The book's slot notation ("1 x ME: Accessory: primary
   * pull") used to travel in `notes` — jargon in the athlete-notes box, and the logger's ME/DE
   * cue detection had to regex it back out. The intent now travels as data; the verbatim p246
   * row moves to `source_row` (provenance, never rendered).
   */
  slot_intent?: 'ME' | 'DE' | 'SKILL' | 'HYP';
  /** The p246 table row verbatim (pattern-swapped on even weeks) — the deterministic record of
   *  which book cell authored this row. Display surfaces must not render it. */
  source_row?: string;
  /** ⛔ HIS reps-in-reserve for this slot's intent. Absent on ME — see `targetRirForIntent`. */
  target_rir?: number;
  /**
   * ⛔ HOW THIS ROW'S WEIGHT WAS ARRIVED AT, when it was not the athlete's own tested lift.
   * `derived_ratio` = the working number of this pattern's tested lift × the movement's catalogue
   * ratio. Absent means the weight is the tested lift's own, or there is no weight.
   * ⚠️ A DISPLAY SURFACE SHOULD NOT RENDER THE TWO IDENTICALLY. Nothing branches on it yet — the
   * `notes` line carries the same fact in words so the athlete sees it either way.
   */
  load_basis?: 'derived_ratio';
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
 *
 * ⛔⛔ IT TAKES THE **FRAME** SLOT'S FAMILY, NEVER THE SPORT-ASSIGNED ONE (Michael, 2026-08-25, after
 * the fuzz sweep). **The frame slot owns anchor identity and sport assignment never re-points an
 * anchor.**
 *
 * ⚠️ THIS WAS THE BUG, AND IT WAS SILENT ON EVERY BLOCK WITH A BIKE IN IT. The names below are
 * run-only, and `assignSports` rewrites a substituted slot's family to `ride_sweet_spot` /
 * `ride_endurance`. Callers were passing the ASSIGNED family, so on a run+ride mix both hard slots
 * matched nothing, `enduranceDayFor` never applied the pin, and the athlete's tapped hard days —
 * their CLUB NIGHTS — were dropped by the composer with nothing said. On a ride-only mix the long
 * pin went the same way. The wizard never showed it: `buildWizardWeek` pins by SESSION ID, which is
 * the correct model, so the preview honoured pins the built block quietly ignored.
 * ⛔ Do not "fix" a future sport-assignment need by widening this list to ride families. The frame
 * slot is the anchor; the sport riding on it is a different question.
 */
/**
 * ⛔⛔ ONE OWNER FOR "WHAT IS THIS SLOT FOR" (2026-08-30). This was a THIRD copy of the run-family
 * list — beside `HARDNESS`/`isLongSlot` in `sport-slots.ts` and `HARD_FAMILIES` in
 * `week-conflicts.ts` — and the three had already drifted: `HARD_FAMILIES` was missing
 * `ride_sweet_spot`'s successor and the hardest session in a rider's week did not count as hard.
 *
 * ⛔ IT DELEGATES NOW. `isLongSlot` and `isHardSlot` read the slot's own `role` when the frame states
 * one and fall back to the family tables when it does not, so a natively-prescribed ride — the All
 * Rounder's `Cyc AnA` and `Cyc endurance` — is classified rather than invisible.
 * ⚠️ THE SIGNATURE STILL TAKES A FAMILY STRING for its many callers; a slot-shaped caller can pass
 * the role through the second argument and it wins.
 */
function anchorRoleOf(family: string, role?: 'hard' | 'long' | 'easy' | null): 'long' | 'hard' | null {
  const slot = { family: family as never, role: role ?? null };
  if (isLongSlot(slot)) return 'long';
  if (isHardSlot(slot)) return 'hard';
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
  /**
   * ⛔ THE ROLE, PASSED IN — not re-derived from a family name (2026-08-30). This function used to
   * ask `anchorRoleOf` a second time off the family alone, so a frame that STATED its slot's role
   * had that answer thrown away here and a natively-prescribed ride got no pin.
   */
  role: 'long' | 'hard' | null,
  hardIndex: number,
): Weekday {
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
  /**
   * ⛔⛔ HOW MANY DAYS A WEEK THE ATHLETE ACTUALLY DOES EACH SPORT — their own answer, and a FLOOR on
   * the number of sessions of that sport (Michael, 2026-08-27: *"I run for three hours a week over
   * the course of three days. I ride for four hours a week over the course of two days and then we
   * chop it up according to the plans numbers"*).
   *
   * ⛔ A FLOOR, NOT A CAP, AND THE FRAME IS WHY. p246 owns the four endurance slots and none of them
   * can be declined, so an athlete asking for FEWER days than their slots already carry cannot have
   * that — the slots stay. Asking for MORE adds easy sessions until the count is met.
   *
   * ⚠️ IT DOES NOT COLLIDE WITH THE LIFTS. The frame already stacks endurance onto lifting days and
   * leaves two clear days plus the rest day, so five endurance days sit inside a four-lift week
   * without touching it.
   * ⚠️ THE EXTRA DAYS ARE IN THE SOLVE, NOT BOLTED ON AFTER IT. They join `enduranceSpecs` before
   * `sizeFor` runs, so the athlete's hours are divided across every session they asked for rather
   * than across four and then topped up.
   */
  enduranceDaysBySport?: { run?: number | null; ride?: number | null } | null;
  /**
   * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — AND IT IS THE SOLE INPUT TO THE ENDURANCE
   * LEVEL (Michael, 2026-08-27). See `experienceLevels` for the ruling and the reason.
   *
   * ⛔ "Newer" builds that sport's quality sessions and its long session at the taper column's own
   * level 1; "Experienced" builds the frame's printed levels. ⚠️ A SPORT WITH NO ANSWER TAKES THE
   * FRAME'S OWN LEVELS — absent is not a claim that the athlete is new to it, and the wizard gates
   * Continue on the answer so a block built through it always carries one.
   */
  enduranceExperience?: EnduranceExperience | null;
  /**
   * ⛔⛔ DEMONSTRATED MINUTES PER SPORT over the last four weeks. **IT NO LONGER DECIDES THE LEVEL**
   * (Michael, 2026-08-27) — `enduranceExperience` above does, with no fallback to this.
   *
   * ⚠️ THE FIELD STAYS BECAUSE ITS CALLERS DO. `generate-strength-plan` still measures and sends it,
   * and removing it was ruled out of scope on the same day this gate moved. ⛔ NOTHING IN THIS
   * COMPOSER READS IT — the advanced tier is gated on `demonstratedWeeklyMiles`, a different field
   * in a different unit. If a future reader wants it, it is measured and it is here; what it must
   * never do again is decide how long a hard session is.
   */
  demonstratedWeeklyMinutes?: { run?: number | null; ride?: number | null } | null;
  /**
   * ⛔⛔ THE NUMBERS THE ATHLETE TYPED, AND THEY ARE INPUTS NOW (§3c, 2026-08-26). Until today they
   * reached `composeStrengthPrimaryPlan` and nothing else, so a Standing Plan block never saw them
   * and the wizard's two fields died in silence — 15 miles asked, about 4 built, nothing said.
   *
   * ⛔ THEY SIZE, THEY NEVER CHOOSE. `volume-bounds.ts` sets every slot's dial so the week lands on
   * the number where the athlete's own picks can reach it, and reports `over_cap` / `under_floor`
   * where they cannot. The number never re-points a slot to another sport — Michael, 2026-08-26:
   * *"these picks hold up to 6 — put the long day on the run."* The sentence names the lever.
   * ⚠️ ABSENT IS NOT ZERO. No answer means no opinion and the dial stays at the library's own
   * midpoint, which is what every block before this shipped at.
   */
  targetWeeklyMiles?: number | null;
  targetWeeklyRideHours?: number | null;
  /**
   * ⛔⛔ THE ACCUMULATIVE WEEKLY HOURS THE ATHLETE PICKED, PER SPORT (Michael, 2026-08-26): *"the
   * accumulative hours for the week… we can probably do 0-2 2-4 4-6 6-8 8-10 for runs, similar
   * stack for bike… and then we just have copy say hard hours cap at whatever, rest will be easy."*
   *
   * ⛔ HOURS ON BOTH SPORTS. The running ask was in MILES and that was our conversion at an assumed
   * pace, never the book's — Viada prescribes in time throughout. ⚠️ `targetWeeklyMiles` above is
   * NOT repurposed: it is load-bearing as MILES in the coach payload's upkeep comparison, the State
   * screen's accent, `create-goal`'s untouched-seed test, `athlete-weekly-intent` and the Get
   * Stronger generator. Two fields, two meanings, no silent unit change.
   * ⚠️ Absent is no opinion, and the dial keeps the library's own midpoint.
   */
  targetRunHours?: number | null;
  targetRideHours?: number | null;
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
   * The picker's keys are the previous program's three lifting days (`squat` / `bench` / `deadlift`); this frame's
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
   * because the picker was the previous program's and its day keys mapped onto nothing here, so a pick had to be
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
  /**
   * ⛔⛔ POUNDS THE HEAVY SLOT HAS EARNED, ON TOP OF THE SCHEDULED RISE (2026-08-26).
   *
   * ⚠️ IT IS AN OFFSET AND `scheduledRise` IS STILL THE FLOOR. p247's one per cent every three weeks
   * is the only progression rate the source states, and it is not replaced — but rounded to real
   * plates it cannot be expressed at all on a bar under roughly 250 lb, so a 145 lb bench moves ONCE
   * in twelve weeks. The reps carry the rest: finishing the rep range twice running adds one
   * increment, and this is where that increment arrives. See `REPS_CARRY_THE_PROGRESSION_IS_OURS`.
   *
   * ⛔ THE ME SLOT ONLY. It is earned on the heavy set's reps and it is spent there. A DE or SKILL
   * slot is a different intent at a different percentage and nobody logged anything against it.
   *
   * ⚠️ ABSENT IS ZERO, which is every block at the moment it is authored. Like `meSetsByPattern` this
   * reaches a block only through the restater, after the sessions that earned it were logged.
   */
  barOffsetsByPattern?: Partial<Record<ViadaPattern, number>> | null;
  /**
   * ⛔⛔ WHAT THE ATHLETE ACTUALLY GOT ON THIS PATTERN'S HEAVY SLOT, most recent last (stage 2).
   *
   * ⚠️ IT IS ONE FACT SERVING TWO SURFACES, which is why it arrives as one argument. The ROW prints
   * it (`last_reps`) so a block that is working correctly stops looking frozen for eight weeks, and
   * the LOGGER prefills the most recent number into the rep cell so the lazy path is the honest one.
   *
   * ⛔ NEVER THE TOP OF THE BAND. `set_plan` stamped `reps.hi` on every ME set — so the logger opened
   * at five, everybody tapped through at five, and the bar advanced on a session nobody performed.
   * That is the phantom the work order names.
   *
   * ⚠️ EMPTY OR ABSENT MEANS **NO LAST TIME AT THIS WEIGHT** AND THE CELL OPENS BLANK — not at the
   * band floor. Michael's ruling, 2026-08-25, on the unpriced ME row: prefilling the floor "read as
   * do 1 rep". ⛔ THIS IS NOT `repsToExpect`, AND THE TWO MUST NOT BE COLLAPSED: that function answers
   * the ENGINE's question (what baseline does the decline window measure against, which after a jump
   * is the bottom of the band by item 3). This answers the SCREEN's question, where "nothing yet" has
   * to render as nothing rather than as a prescription for one rep.
   */
  meLastRepsByPattern?: Partial<Record<ViadaPattern, number[]>> | null;
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
  /**
   * ⛔⛔ HIS BUCKETS 1-3, IN MINUTES, SUMMED ACROSS RUN AND RIDE (p146) — the unit he actually
   * balances in, which this app did not compute at all until now. Together with `ledger` above
   * (buckets 4 and 5) it is the whole of his weekly accounting.
   * ⚠️ NOTHING SURFACES IT YET, deliberately: it is arithmetic over the week just built, not a
   * control and not a question for the athlete.
   */
  enduranceLedger: EnduranceLedger;
  /** ⛔ THE ME ROWS THIS WEEK PRESCRIBED — see {@link MeRowIndex}. Empty in the test week. */
  meRows: MeRowIndex[];
  notes: ComposeNote[];
  /**
   * ⛔ WHAT THIS WEEK BREAKS AND WHAT IT COSTS — `week-conflicts.ts`, Q-288's wiring. Structured
   * rather than prose because a later slice attaches actions to them; the sentence also reaches the
   * athlete as a `warning` note, which is the channel `placement_compromises` already reads.
   */
  conflicts: WeekConflict[];
  /**
   * ⛔ WHAT THIS WEEK'S PICKS CAN HOLD, AND WHERE THE ASK LANDED IN IT (§3c). Surfacing and
   * provenance — the wizard computes its own live copy from the same module as the athlete changes
   * a sport, and the two must agree.
   */
  volume: { bounds: WeekVolumeBounds; run: SizeSolve; ride: SizeSolve };
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
 * ⛔ THE NOTE FOLLOWS THE LIFT, NOT THE SLOT (2026-08-25). `sourceText` is the table row verbatim,
 * but on an even week the slot carries its partner's pattern, so the verbatim row labels a back
 * squat *"Primary hinge lower"* — a reader (and one outside AI, same day) takes that as the
 * programme misclassifying the lift. Swapping the two pattern words makes the note describe the
 * lift actually in the slot; odd weeks stay verbatim, and the "(rotate with …)" tail survives the
 * swap, so the p246 row is still findable from either week's text.
 */
function noteForWeek(slot: StrengthSlot, week: number): string {
  if (!slot.rotatesWith || week % 2 === 1) return slot.sourceText;
  return slot.sourceText.replace(/hinge|push/g, (w) => (w === 'hinge' ? 'push' : 'hinge'));
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
 * ✅ **CLOSED 2026-08-28 — AND IT WAS WORSE ON A DEVICE THAN THIS NOTE PREDICTED.** This said a
 * derived ME target *"restates the prescription rather than contradicting it"*. On Michael's screen
 * the ME pull-up card's cue read *"1-5 reps, stopped short of failure"* while the row under it read
 * **"target 1-5 · 2 in reserve"** — two reps, not essentially zero, and the two halves of one card
 * disagreeing. ⛔ THE FIX IS THE PER-SLOT GATE THIS NOTE ASKED FOR, at `materialize-plan/index.ts`
 * (both seams): the row's own `slot_intent` suppresses the derived target, the shared
 * `protocolUsesRir` flag is untouched, and `StrengthLogger`'s Done handler no longer autofills a
 * fabricated 3 when a row carries no target. Everything above is history.
 */
function targetRirForIntent(intent: 'ME' | 'DE' | 'SKILL' | 'HYP'): number | null {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell' || !p.rir) return null;
  return Math.round(((p.rir.lo + p.rir.hi) / 2) * 2) / 2;
}

/**
 * ⛔ THE ACCESSORY DOSE'S OWN RESERVE — p86, *3 x 8-10 at 1-2 RIR*, midpoint of his band.
 *
 * ⚠️ IT IS NOT `targetRirForIntent('HYP')` AND MUST NOT BE COLLAPSED INTO IT. A floor or dial row is
 * not a slot the frame named: p218's HYP band (0-2, midpoint 1) is the reserve for a **prescribed
 * hypertrophy slot**, and p86's 1-2 is the reserve for **accessory work added on top**. Two pages,
 * two doses, and the rows that carry each are decided in different places.
 */
const ACCESSORY_TARGET_RIR = 1.5;

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

/** ⛔ WHICH PATTERNS THE LOWER-BODY HAIRCUT AND THE 10 lb STEP BELONG TO. One owner, read by
 * `me-history.ts` for the bar ladder's increment as well as by this file for the haircut. */
export const LOWER_PATTERNS: ViadaPattern[] = ['hinge_lower', 'press_lower'];

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
  /**
   * ⛔ NULL WHEN THE DAY HAS NO MOVEMENT LEFT FOR THIS SLOT — see the drop branch below. The caller
   * skips the slot and says so; it does not print the row above twice.
   */
): { exercise: StrengthExercise; movement: string; sets: number; pattern: ViadaPattern } | null {
  const pattern = patternForWeek(slot, args.week);
  const competition = args.competitionLifts[pattern] ?? null;

  const resolved = resolveSlot({
    category: slot.category,
    pattern,
    intent: slot.intent,
    equipment: args.equipment ?? null,
    /**
     * ⛔ THE FRAME'S OWN MODIFIER — `StrengthSlot.asymmetrical`. p274 prints `braced push
     * (asymmetrical)` three times and this is the only path that carries it, so without it those
     * three slots would resolve to an ordinary two-legged braced press and the frame would say
     * nothing about it.
     * ⚠️ ABSENT ON EVERY `strength_5k` SLOT, so that frame resolves exactly as before.
     */
    asymmetrical: slot.asymmetrical,
  });

  /**
   * ⛔⛔⛔ THE MUSCLE THE PAGE NAMES IS THE LAW — `StrengthSlot.muscle` (Michael, 2026-08-30).
   *
   * ⛔ AND IT IS ENFORCED HERE AS WELL AS IN THE PICKER, because narrowing only the dropdown would
   * leave THIS path free to do the very thing that was reported. Measured across three kits before
   * the fix: p274's `1 × HYP: focused quadriceps` built a **leg extension** at a commercial gym, a
   * **weighted single-leg calf raise** at barbell+dumbbells+bench and a **freestanding barbell calf
   * raise** at barbell+rack+bench — calves in a quadriceps row, with no athlete involved. Its
   * `1 × HYP: braced push` built a **dumbbell shoulder press** on the same kit: deltoids where p221
   * prints three chest presses.
   *
   * ⛔ HIS MOVEMENTS FIRST, THEN A SAME-MUSCLE SUBSTITUTE, NEVER ANOTHER MUSCLE. Michael's amendment
   * in his own words: *"substitute known barbell/dumbbell versions that hit the SAME muscle… the
   * movement may leave the printed list when kit demands it."* The pool here is already this cell's
   * own — same pattern, same category, same equipment gate — so narrowing it can only ever remove a
   * movement, never reach past the frame.
   * ⚠️ IF NOTHING IN THE CELL HITS THE MUSCLE the list empties and the slot DROPS through the branch
   * below, which is the mechanism that already says *"N exercises short"* and names the equipment as
   * the cause. An honest gap beats a calf raise in a quad row.
   * ⚠️ `strength_5k` CARRIES NO `muscle` ON ANY SLOT — its rows name categories, not muscles — so
   * this is a no-op on that frame and its output is byte-identical.
   */
  if (slot.muscle) {
    const want = String(slot.muscle);
    /**
     * ⛔ AND THE MOVEMENTS THE PAGE NAMES ON THIS ROW, whose prime mover disagrees — see
     * `StrengthSlot.alsoAdmits`. p223 names the hip thrust FIRST in a row headed "hamstrings" and
     * the catalogue tags it glutes, correctly. Michael's ruling, the same one he gave on the arms
     * superset: **where the page's own list and a tag pull apart, the list wins.**
     */
    const admitted = new Set((slot.alsoAdmits ?? []).map((n) => canonicalize(n)));
    const keep = (name: string) =>
      musclesWorkedBy(name)?.primary === want || admitted.has(canonicalize(name));
    /**
     * ⛔⛔ AN ADMITTED MOVEMENT IS FETCHED HERE TOO, AND THE PICKER PROVED WHY (2026-08-30). The
     * catalogue files every hip thrust under BRACED hinge and p274's cell is FOCUSED hinge, so it is
     * not in this cell's pool at all — a filter can only remove. Without this the dropdown offered
     * the athlete a movement the composer's own cell could not hold: the pick did not fit, fell
     * through to the flat pool, and **landed as a SIXTH row on a five-slot day** instead of filling
     * the row it was chosen for. Measured on the built week, not predicted.
     * ⚠️ ONLY THE NAMED MOVEMENTS, and only at this cell's own pattern — never a muscle, never a
     * category. `pickOptions` runs the identical union, which is what keeps the screen and the week
     * describing the same row.
     */
    if (admitted.size > 0) {
      for (const cat of ['secondary', 'braced', 'focused'] as typeof slot.category[]) {
        if (cat === slot.category) continue;
        for (const o of resolveSlot({
          category: cat, pattern, intent: slot.intent,
          equipment: args.equipment ?? null, asymmetrical: slot.asymmetrical,
        }).options) {
          if (admitted.has(canonicalize(o.name))
            && !resolved.options.some((x) => canonicalize(x.name) === canonicalize(o.name))) {
            resolved.options.push(o);
          }
        }
      }
    }
    const onMuscle = resolved.options.filter((o) => keep(o.name));
    if (onMuscle.length > 0) {
      resolved.options = onMuscle;
    } else {
      /**
       * ⛔⛔ THE SAME WIDENING THE PICKER DOES, AND IT HAS TO BE THE SAME OR THE TWO DISAGREE
       * (Michael's amendment, 2026-08-30). Measured: `focused press_lower` at a barbell-and-bench
       * kit holds a seated calf raise and a weighted knee raise and **no quadriceps movement at
       * all**, so narrowing alone emptied p274's quadriceps row. The split squats and lunges that
       * serve it are filed one category over.
       * ⛔ CATEGORY WIDENS, PATTERN AND MUSCLE DO NOT. The plane is the frame's; the category is the
       * looser of the two and p275 already treats it as rotatable. ⛔ NO `primary` — those are the
       * competition lifts the ME slots already carry.
       * ⚠️ STILL EMPTY MEANS THE SLOT DROPS, through the branch below that already says "N exercises
       * short" and names the equipment as the cause. An honest gap beats a calf raise in a quad row.
       */
      const pooled: typeof resolved.options = [];
      for (const cat of ['secondary', 'braced', 'focused'] as typeof slot.category[]) {
        pooled.push(...resolveSlot({
          category: cat,
          pattern,
          intent: slot.intent,
          equipment: args.equipment ?? null,
          asymmetrical: slot.asymmetrical,
        }).options);
      }
      const seen = new Set<string>();
      resolved.options = pooled.filter((o) => {
        if (!keep(o.name)) return false;
        const c = canonicalize(o.name);
        if (seen.has(c)) return false;
        seen.add(c);
        return true;
      });
    }
  }

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
    // ⛔⛔ THE FRAME'S OWN PICK TABLE (D-457, 2026-08-30). p274's accessory cells are BRACED and
    // FOCUSED; p246's are SECONDARY. Matched against the wrong table a cell finds no pick and the
    // athlete's answer is discarded in silence — which is what happened to five controls.
    ? pickKeyForSlot(slot.category, pattern, frameDay ?? undefined, args.frame)
    : null;
  /**
   * ⛔⛔ "ALREADY USED TODAY" HAS TO ASK THE NAME THE ATHLETE WILL READ (2026-08-30). `bandRouteName`
   * renames a movement on the way out, and **two different canonical movements can route to the same
   * band execution** — so a day could print one name twice while this Set held two different keys and
   * saw nothing wrong. Measured: p274's day 1 on a bands-only kit printed *"band lateral raise"*
   * beside itself, from two different source movements.
   * ⚠️ IT CHECKS BOTH, not just the rendered one: the stored name is what every other reader matches
   * on, and dropping that test would let two spellings of one movement back in.
   * ⚠️ LATENT BEFORE TODAY. The hole was always there; his-movements-first changed which movements
   * that day lands on and walked straight into it.
   */
  const isTaken = (name: string): boolean =>
    takenToday.has(canonicalize(name))
    || takenToday.has(canonicalize(bandRouteName(name, args.equipment ?? null)));

  /**
   * ⛔⛔⛔ HIS MOVEMENTS OUTRANK SUBSTITUTES, AT EVERY KIT (Michael, 2026-08-30). The page's own list
   * for THIS cell wins; anything else is a stand-in and sorts behind it.
   *
   * ⛔ THE DEFECT IT CLOSES, MEASURED. Adding `weighted reverse hyper` — a real, loadable movement
   * that belongs in p221's braced hinge row — made a commercial-gym week stop building
   * `ground-based deadlift machine`, one of the four movements p221 actually PRINTS for that cell.
   * Nothing was wrong with the new entry: **`resolveSlot` ranks on equipment fit, then loaded before
   * bodyweight, then CATALOGUE ORDER, and has no notion of "his"** — so a new loadable entry
   * outranked one of his machines by sitting earlier in the file.
   * ⛔ FILE ORDER WAS THE ALTERNATIVE FIX AND IS THE WRONG ONE. It would have worked, silently, until
   * the next entry landed in the wrong place. This makes catalogue order stop being load-bearing.
   *
   * ⚠️ IT IS A SORT, NOT A FILTER. Every movement the cell could reach is still reachable — a kit
   * that blocks his whole list still gets the substitutes, in the same order they had. What changes
   * is only that his own come first when both are available.
   * ⚠️ THE LIST IS THE ONE THE PICKER SHOWS. `VIADA_PICKS[key].hisList` is the page's printing for
   * this cell, and the screen already marks anything outside it "- for your gear" — so the composer
   * and the dropdown now agree about which movements are his.
   * ⚠️ STABLE: equal ranks keep their existing order, so a cell whose options are all his, or all
   * substitutes, is byte-identical to before.
   */
  /**
   * ⛔⛔ IT APPLIES TO EVERY FRAME NOW (Michael, 2026-08-31). It was held off one frame by a freeze
   * that has been lifted, and the measurement taken while it was gated is what makes lifting it a
   * fix rather than a risk: the gated frame stopped building `dumbbell bench press`, `drag curl`,
   * `bulgarian split squat` and `rear delt fly` and started building `incline bench press`,
   * `preacher curl`, `larsen press`, `seated calf raise` and `skull crusher` — **the source's own
   * printed movements for those cells, which it had been passing over in favour of substitutes at
   * every kit.** Every change the gate was suppressing was an improvement.
   * ⚠️ D-457 STILL HOLDS: the frame reaches this function explicitly. What is gone is the frame
   * TEST, not the frame ARGUMENT — a rule about which movements are the page's own has no business
   * asking which programme is being built.
   */
  if (slotKey) {
    const his = new Set((VIADA_PICKS[slotKey].hisList ?? []).map((n) => canonicalize(n)));
    if (his.size > 0) {
      /**
       * ⛔⛔ ALREADY-USED-TODAY SORTS LAST, AHEAD OF EVERYTHING ELSE — and a real regression is why
       * (2026-08-30). p274's day 1 carries TWO `focused push_upper` cells, so promoting his movements
       * put `lateral raise` at the front of both and the day printed it twice; on a bands-only kit
       * the duplicate reached the built week as **"band lateral raise" beside itself**, because the
       * `takenToday` guard downstream compares canonical names and the band rename happens after it.
       * ⚠️ SO THE SORT RESPECTS THE DAY, not just the page. A movement already spent today is behind
       * every fresh one, his or ours — which is the same rule the selection below applies, moved
       * early enough to matter.
       */
      const rank = (name: string) =>
        (isTaken(name) ? 2 : 0) + (his.has(canonicalize(name)) ? 0 : 1);
      resolved.options = resolved.options
        .map((o, i) => ({ o, i, r: rank(o.name) }))
        .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
        .map(({ o }) => o);
    }
  }

  const named = slotKey ? String(args.slotPicks?.[slotKey] ?? '').trim() : '';
  const fromSlotPick = named !== ''
    ? resolved.options.find((o) => canonicalize(o.name) === canonicalize(named)
      && !isTaken(o.name)
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
      ? options.find((o) => !isTaken(o.name)
        && focusMuscles.has(musclesWorkedBy(o.name)?.primary ?? ''))
      : undefined;
    let fresh = focused ?? options.find((o) => !isTaken(o.name));

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
          !isTaken(o.name)
          && !picks.placed.has(canonicalize(o.name))
          && (!competition || canonicalize(o.name) !== canonicalize(competition)));
        if (fresh) break;
      }
    }
    /**
     * ⛔⛔ AND IF NOTHING FRESH EXISTS, THE SLOT IS DROPPED AND SAID — IT IS NOT FILLED WITH A REPEAT
     * (2026-08-30). What stood here was *"a duplicated movement is worse than nothing only until it
     * is the difference between a slot and a hole"*, and that reasoning held while every frame's
     * upper days carried FOUR slots. p274's carry SIX — an ME, a DE, a braced and three focused —
     * and on a minimal kit the pull pool runs out at five: the sixth slot printed
     * `prone y t w raise` a second time on the same day, beside itself, with nothing said.
     *
     * ⛔ A ROW THAT REPEATS THE ROW ABOVE IT IS NOT A SLOT, IT IS THE ENGINE LOSING ITS PLACE, and
     * the athlete reads it as one. Dropping it and naming the drop is the same choice this file
     * already makes everywhere else: `placement_compromises` exists so a compromise is stated rather
     * than absorbed.
     *
     * ⚠️ MEASURED BYTE-IDENTICAL FOR `strength_5k` across every kit, week, column and pick set —
     * that frame never exhausts a cell, so this branch cannot fire on the frozen frame.
     */
    const lastResort = fresh ?? options[0] ?? resolved.chosen;
    if (!lastResort || isTaken(lastResort.name)) return null;
    movement = lastResort.name;
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
  /**
   * ⛔⛔ AND THE NAME THE ATHLETE WILL READ, WHICH IS NOT ALWAYS THE ONE STORED (2026-08-30). Two
   * different canonical movements can both route to the same band execution — `bandRouteName` renames
   * on the way out, and this Set was only ever given the pre-rename name. **On a bands-only kit
   * p274's day 1 printed "band lateral raise" beside itself**: two cells, two different movements,
   * one rendered name, and the duplicate guard could not see it.
   * ⚠️ LATENT UNTIL TODAY. It surfaced when his-movements-first changed which two movements that day
   * lands on; the hole was always there. Additive and idempotent — a movement with no band route adds
   * the same string twice, which a Set absorbs.
   */
  takenToday.add(canonicalize(bandRouteName(movement, args.equipment ?? null)));

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

  /**
   * ⛔⛔ A COMPOUND IN A TOP SET GETS A NUMBER TOO (Michael, off a seeded 12-week export, 2026-08-27:
   * *"they should all get numbers"*, then *"so lets supply the numbers"*).
   *
   * ⛔ THE DEFECT, IN HIS OWN WEEK: *"W2 Tue: Back Squat 1x1-5 @ 110 | trap bar deadlift 1x1-5 @ By
   * feel"*. **Two top sets on the same day, one prescribed and one by feel** — and nobody takes a
   * heavy top set by feel. Every non-competition movement fell through the test above, including the
   * ones sitting in the same pattern as a lift that WAS tested.
   *
   * ⛔ THE RATIO IS THE APP'S, NOT A NEW TABLE. `exercise-config.ts` already carries `primaryRef` and
   * `ratio` on every movement — front squat 0.85 of squat, trap bar deadlift 1.0 of deadlift, close
   * grip bench 0.9 of bench — and `strength-grid/taxonomy.ts` describes the scheme and names the
   * front squat's 0.85 outright. The composer simply was not reading it.
   *
   * ⛔⛔ THREE GATES, AND EACH ONE IS A DEFECT THIS REPO HAS ALREADY SHIPPED ONCE:
   *
   *   1. **TOP SETS ONLY.** ME and DE — the `1x1-5` and `4x2-4` rows. ⛔ The `3x6-12` growth work
   *      STAYS by feel and that is correct, not a gap: p83 makes reps-in-reserve the target, so the
   *      weight is an OUTPUT of the rule rather than an input — the athlete picks the dumbbell that
   *      leaves them one or two. It is also how Strong and Hevy behave. A computed number on a
   *      3x10 curl is false precision on work where their judgement is the better input.
   *   2. **THE MOVEMENT'S OWN `primaryRef` MUST BE THIS PATTERN'S TESTED LIFT.** Not merely present.
   *      A barbell row's `primaryRef` is `bench` because a row LOADS at ~80% of a bench — that map
   *      answers "which number do I derive from", not "which pattern is this".
   *   3. ⛔⛔ **AND A PATTERN WITH NO NAMED COMPETITION LIFT IS EXCLUDED ENTIRELY, WHICH IS WHAT
   *      KEEPS PULL-UPS OUT.** `LIFT_FOR_PATTERN` maps `pull_upper` to `bench` and that mapping is
   *      the acknowledged-wrong one — it is what produced *"pull up @ 205 lb"* in the composer's
   *      first smoke run. `defaultCompetitionLifts()` deliberately leaves `pull_upper` unset, so the
   *      `competitionLifts[pattern] != null` test below excludes the whole pattern by construction
   *      rather than by a name blocklist. ⚠️ A pull has no same-pattern tested lift and stays by
   *      feel. Its own tested field (`performance_numbers.pullupMaxReps`) is a REPS capacity, not a
   *      load, and does not solve this.
   *
   * ⚠️ NO `primaryRef`, NO RATIO, OR A RATIO OF ZERO → BY FEEL. Nothing is default-guessed; the
   * catalogue's own rule is that an unknown name is never treated as a category by default.
   * ⚠️ ONE CHAIN, AND IT IS THE EXISTING ONE: tested set → predicted 1RM → working number (96%) →
   * × the movement's ratio. ⛔ No second path off a stored 1RM — `working-number.ts`'s header exists
   * to keep those apart.
   */
  const derived = (() => {
    if (movementIsTested || testedLift == null) return null;
    if (slot.intent !== 'ME' && slot.intent !== 'DE') return null;
    if (args.competitionLifts[pattern] == null) return null;
    const cfg = resolveExerciseConfig(movement).config;
    if (!cfg || cfg.primaryRef !== testedLift) return null;
    /**
     * ⛔⛔ ONE NUMBER, ONE BAR — A PER-HAND OR UNILATERAL MOVEMENT STAYS BY FEEL. The catalogue marks
     * a dumbbell bench `displayFormat: 'perHand'` with `ratioIsTotal: true`, so its 0.8 is the TOTAL
     * across both hands and has to be halved before it means anything to the athlete. Emitting the
     * total on a row that says "90 lb" invites them to load 90s — a doubled prescription on a top
     * set, which is a worse failure than no number at all.
     *
     * ⚠️ THIS IS ALSO WHAT KEEPS MICHAEL'S OWN BY-FEEL LIST INTACT. Dumbbell bench and split squats
     * were named as staying by feel; they are exactly the `perHand` rows. What is left is the
     * whole-bar work he named — trap bar deadlift, front squat, close grip bench — where one weight
     * on the row is the weight on the bar.
     */
    if (cfg.displayFormat === 'perHand' || cfg.isUnilateral === true || cfg.ratioIsTotal === true) return null;
    const ratio = Number(cfg.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const w = args.workingNumbers?.[testedLift];
    return w ? { working: w, ratio, refLift: testedLift } : null;
  })();

  const working = movementIsTested ? args.workingNumbers?.[testedLift] : derived?.working;

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
        slot_intent: slot.intent,
        source_row: noteForWeek(slot, args.week),
      },
      movement,
      sets,
      pattern,
    };
  }

  const { weight: floorWeight, haircut } = prescribedLoad({
    working,
    frame: args.frame,
    week: args.week,
    isLower,
    hardRunBeforeLower,
    /**
     * ⛔⛔ THE RATIO IS NO LONGER IN HERE, AND THAT IS THE FIX FOR THE FROZEN LIFTS (2026-08-27).
     * See `weight` below: this call now always computes the PRIMARY's number for this slot, and the
     * ratio is applied to that already-rounded figure afterwards.
     */
    pctOfWorkingNumber: pct,
    roundTo: args.roundTo ?? 5,
  });

  /**
   * ⛔ THE EARNED INCREMENT LANDS ON TOP OF THE ROUNDED FLOOR, NOT INSIDE THE ARITHMETIC.
   *
   * ⚠️ THE OFFSET IS ALREADY A WHOLE NUMBER OF REAL PLATES — `advanceStep` gated it on the athlete's
   * kit — so it is added to the rounded figure and stays exactly loadable. ⛔ NOT AN ARITHMETIC
   * NO-OP IN GENERAL: while the increment is a multiple of `roundTo` the two orders agree, and the
   * moment those two numbers stop dividing each other (a 2.5 lb round against a 5 lb pair, say) only
   * this one keeps the earned jump whole. Adding it here also keeps the earned figure out of the
   * percentage arithmetic entirely, which is what stops it from compounding with the scheduled rise.
   *
   * ⛔ AND IT IS ADDITIVE TO HIS RATE, NOT A REPLACEMENT FOR IT. `scheduledRise` is inside
   * `prescribedLoad` above and stays there.
   *
   * ⚠️ `percent_1rm` BELOW IS NOT RECOMPUTED, DELIBERATELY. It is the percentage the INTENT asks for
   * — the bottom of p218's band for this slot — and it is what `standing-plan-me-sets.test.ts`
   * checks every row against. Restating it as "weight ÷ working number" would make it a derived
   * figure that drifts above the band's floor the moment anything is earned, and would break the
   * invariant that no row carries the top of both bands. The weight is the prescription; the
   * percentage is the label on the slot.
   */
  const earnedLb = slot.intent === 'ME' ? Number(args.barOffsetsByPattern?.[pattern]) : NaN;
  const primaryWeight = Number.isFinite(earnedLb) && earnedLb > 0 ? floorWeight + earnedLb : floorWeight;

  /**
   * ⛔⛔ A DERIVED LIFT TAKES ITS RATIO OF THE PRIMARY'S **PRESCRIBED** WEIGHT, NOT OF THE WORKING
   * NUMBER — and the difference is the whole bug (Michael's own 12-week export, 2026-08-27).
   *
   * ⛔ THREE LIFTS NEVER MOVED IN TWELVE WEEKS:
   *     front squat (ME)       W3 @ 90  →  W12 @ 90
   *     front squat (DE)       W2 @ 70  →  W12 @ 70
   *     close grip bench (DE)  W2 @ 95  →  W12 @ 95
   * while the lifts they derive from moved correctly at his rate — bench 135→140, squat 105→110,
   * deadlift 155→160. **The trap bar deadlift moved and the others did not, because its ratio is
   * exactly 1.0.** That is the tell.
   *
   * ⛔ THE CAUSE WAS ROUNDING, NOT THE LADDER. `me-history.ts` already keys the earned ladder by
   * PATTERN, so beating reps on a front squat does advance `press_lower` — that half worked. What
   * broke is that the derived weight was recomputed from scratch each week as
   * `working × rise × ratio`, rounded to the plate step. p247's rate is 1% every three weeks, so the
   * primary gains about 5 lb across a block; at a 0.85 ratio that is 4.25 lb on the front squat,
   * which rounds straight back to where it started. **The lift was frozen unless the primary jumped
   * a whole step at once, which at these numbers it never does.**
   *
   * ⛔⛔ SO THE RATIO IS APPLIED TO A NUMBER THAT HAS ALREADY BEEN QUANTIZED. The squat's 105 → 110
   * becomes 89.25 → 93.5, which rounds 90 → 95: the derived lift moves exactly when the lift it
   * comes from moves, in the same number of steps.
   *
   * ⚠️ AND THIS IS THE BOUND, RATHER THAN A CLAMP ON TOP OF ONE. The brief proposed carrying the
   * derived weight forward by its own increment and clamping it to within a step of `primary ×
   * ratio`. Recomputing from the primary's own prescribed weight reaches the same place with no
   * carried state and no clamp: the answer IS `round(primary × ratio)` every week, so it cannot
   * drift from the ratio at all — a front squat can never creep toward the squat's own number. The
   * only slack is the rounding step itself, which is the clamp the brief asked for, structurally.
   * ⚠️ IT ALSO INHERITS THE EARNED LADDER FOR FREE: `primaryWeight` already carries the pattern's
   * earned offset on an ME slot, so a front squat that earns a jump on `press_lower` gets its share.
   * ⚠️ THE STEP IS THE ATHLETE'S OWN — `roundTo` is their smallest plate pair, doubled, the same
   * figure `prescribedLoad` rounds to and `advanceStep` honours.
   */
  const plateStep = Number.isFinite(args.roundTo) && (args.roundTo ?? 0) > 0 ? (args.roundTo as number) : 5;
  /**
   * ⛔⛔ AND THE DERIVED LIFT CARRIES ITS OWN STEP, BECAUSE THE RATIO ALONE STILL FROZE IT
   * (2026-08-27, Michael's second export). Applying the ratio to the primary's PRESCRIBED weight
   * fixed the heavy rows — 105 → 110 becomes 90 → 95 — and left the fast ones stuck:
   *
   *     Back Squat (DE)   W2 @ 80  →  W5 @ 85     the primary moved
   *     front squat (DE)  W2 @ 70  →  W12 @ 70    0.85 x 80 = 68 and 0.85 x 85 = 72.25,
   *                                               and both round to 70
   *
   * One step of the primary is 4.25 lb on the derived lift, so whether it moves at all depends on
   * which side of a rounding boundary the multiplication lands. That is a coin toss, not a
   * progression.
   *
   * ⛔ SO THE DERIVED LIFT TAKES A WHOLE STEP WHEN THE PRIMARY TAKES ONE. The base is still the
   * ratio — `round(primary at week 1 x ratio)` — and every step the primary has gained since is
   * added as a full plate step rather than as its 85% shadow.
   *
   * ⚠️ AND IT IS CLAMPED, WHICH IS WHAT STOPS IT DRIFTING. A lift advancing on its own step forever
   * would wander toward the primary's own number; if the carried figure ever sits more than one step
   * from `primary x ratio`, the ratio wins and it re-derives. Over a block the primary gains one or
   * two steps, so the carry stays well inside that — but the guard is what makes the rule safe
   * rather than lucky.
   * ⚠️ WEEK 1 IS THE BASE WHATEVER THE BLOCK DOES, so the arithmetic is the same for a tested block
   * and a skipped one: `prescribedLoad` is pure, and asking it for week 1 costs nothing.
   */
  const weight = (() => {
    if (!derived) return primaryWeight;
    const round = (n: number) => Math.max(plateStep, Math.round(n / plateStep) * plateStep);
    const primaryBase = prescribedLoad({
      working, frame: args.frame, week: 1, isLower, hardRunBeforeLower,
      pctOfWorkingNumber: pct, roundTo: plateStep,
    }).weight;
    const steps = Math.round((primaryWeight - primaryBase) / plateStep);
    const carried = round(primaryBase * derived.ratio) + steps * plateStep;
    const byRatio = round(primaryWeight * derived.ratio);
    // ⛔ THE RATIO IS THE AUTHORITY WHEN THE CARRY HAS DRIFTED PAST ONE STEP OF IT.
    return Math.abs(carried - primaryWeight * derived.ratio) <= plateStep ? carried : byRatio;
  })();

  if (isLower && !hardRunBeforeLower && !notes.some((n) => n.text === HAIRCUT_CAUSE_IS_OURS)) {
    // ⛔ SAID OUT LOUD, BECAUSE IT IS OUR READING. The lower-body weights are NOT reduced this block,
    // and the reason is that the hard session moved to the bike.
    notes.push({ kind: 'ours', text: HAIRCUT_CAUSE_IS_OURS });
  }
  if (isLower && haircut < 1 && !notes.some((n) => n.cite === 'Viada p247' && n.text.includes('lower-body'))) {
    notes.push({
      kind: 'source',
      // ⛔ IT NAMES THE DAYS (Michael, 2026-08-26). His own wording for this class of sentence is
      // *"hard run lands the day before heavy legs — squat and deadlift weights reduced 3-4% to
      // absorb it"*, and the days are what make it checkable against the calendar rather than a
      // claim the athlete has to take on trust. This is the COMPENSATED break — p247's own layout —
      // so it is the one sentence here that reports a cost already paid.
      text: `The hard run lands the day before the heavy leg session, so the lower-body weights `
        + 'start about three and a half per cent under where the test put them. That comes back over '
        + 'the first nine weeks.',
      cite: 'Viada p247',
    });
  }

  /**
   * ⛔⛔ THE HEAVY SLOT NO LONGER OPENS THE LOGGER AT THE TOP OF THE BAND (stage 2, item 5).
   *
   * `set_plan` stamped `p.reps.hi` on every set of every intent, and on ME that is five — the top of
   * his 1-5. The logger prefills from `set_plan`, so every heavy set opened reading FIVE, the whole
   * point of an open rep target was gone, and an athlete who tapped Done without editing handed the
   * progression a five-rep session they never performed. Two of those in a row moves the bar.
   *
   * ⚠️ SO THE ME SLOT TAKES WHAT THEY ACTUALLY GOT LAST TIME, and NOTHING when there is no last time
   * at this weight — the cell opens blank and the row's own "1-5" carries the target. Michael's
   * ruling, 2026-08-25: the band floor is not a safe fallback, it reads as a prescription for one rep.
   *
   * ⚠️ THE OTHER THREE INTENTS ARE UNTOUCHED. DE, SKILL and HYP keep the band top in their set plan,
   * which is what they have always carried and what their own rep prescription means.
   */
  const lastReps = slot.intent === 'ME'
    ? (args.meLastRepsByPattern?.[pattern] ?? []).filter((n) => Number.isFinite(n))
    : [];
  const bandTop = p.kind === 'barbell' ? p.reps.hi : 1;
  const openAt = slot.intent === 'ME'
    ? (lastReps.length > 0 ? lastReps[lastReps.length - 1] : null)
    : bandTop;

  /**
   * ⛔⛔ A DERIVED WEIGHT MUST NOT READ LIKE A MEASURED ONE. It is two steps from anything the
   * athlete actually lifted — tested set → predicted max → working number → ratio — and p125 warns
   * that rep-max estimates already carry wider error bars for a hybrid athlete than for a
   * specialist. So the row says where the number came from, in the box the athlete already reads.
   * ⚠️ `load_prescribed` STAYS TRUE: it IS prescribed, and a false there would strip the weight
   * entirely. What marks it is `load_basis` for any surface that wants to branch, and the note for
   * the one that does not.
   */
  const derivedNote = derived
    // ⚠️ THE ATHLETE'S OWN NAME FOR THE LIFT, not the canonical one — `refLift` is this pattern's
    // tested lift, so `competitionLifts[pattern]` is that same lift as they named it.
    ? `About ${Math.round(derived.ratio * 100)}% of your `
      + `${testedLiftName(derived.refLift, args.competitionLifts[pattern]).toLowerCase()} — derived, not tested.`
    : null;

  return {
    exercise: {
      name: movement,
      sets,
      reps,
      weight,
      percent_1rm: pct,
      ...(derived ? { load_basis: 'derived_ratio' as const, notes: derivedNote! } : {}),
      ...(targetRir != null ? { target_rir: targetRir } : {}),
      // ⛔ WHAT THEY GOT, ON THE ROW (item 6). `reps` above is the BAND and stays "1-5" — every
      // reader that parses it (`isRepBandRow`, `hasRepTotal`, the leading-digit prefill) is anchored
      // on that shape, so the result travels as its own field rather than inside the string.
      ...(lastReps.length > 0 ? { last_reps: lastReps } : {}),
      /**
       * ⛔⛔ THE RAMP GOES IN FRONT OF THE WORK SETS — his Rule 2a, p140: *"your warm-up should begin
       * with unloaded, rapid concentric back squats, working up in weight"*, and *"the first set of
       * your skill work should also be the last set of your warm-up."*
       *
       * ⚠️ IT IS PREPENDED TO `set_plan`, TAGGED `warmup`, AND COUNTS AS NOTHING. `sets` above is
       * unchanged and still reports the WORK sets only — every reader that counts (the earned-set
       * ladder, the rep-band readers, the load ledger, p086's session ceiling) is anchored on that
       * number and on the tag, so a ramp that inflated either would feed the progression evidence it
       * is not.
       *
       * ⚠️ ONLY WHERE A WEIGHT IS PRESCRIBED AND THE SLOT EARNS ONE. A by-feel row has nothing to
       * converge on, and `slotTakesRamp` keeps it off the HYP rows — a twelve-rep set is its own ramp.
       */
      set_plan: [
        ...(slotTakesRamp(slot.intent) ? rampFor(weight, args.roundTo ?? 5) : []),
        ...Array.from({ length: sets }, () => ({
          weight,
          // ⚠️ THE KEY IS OMITTED, NOT ZEROED. `plannedSetsFor` reads a non-positive rep count as
          // absent already, but a stored 0 would render as a logged zero — which is now the FAILED
          // ATTEMPT signal, and inventing one on an unlogged set would undo a jump the athlete earned.
          ...(openAt != null ? { reps: openAt } : {}),
        })),
      ],
      slot_intent: slot.intent,
      source_row: noteForWeek(slot, args.week),
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
  /**
   * ⛔⛔ THE TEST'S OWN LIFTS ARE STAMPED `ME`, AND IT DESCRIBES THE ROW RATHER THAN CHANGING IT
   * (2026-08-28). The p215 pretest works up in three steps to a set taken *for max clean reps* — it
   * IS a maximal effort, and it is the set every working number in this block is derived from. ME
   * (90-100%) names the band the row already occupies; it prescribes nothing new.
   *
   * ⛔ WITHOUT IT THE GATE DEFEATS ITS OWN RULING. `state-trend/assemble.ts` fails CLOSED — only ME
   * mints an estimated max — so an unstamped test week means the athlete's most maximal sessions of
   * the whole block reach the strength line as nothing, and a block opened to "start the line fresh"
   * shows an empty card until week two. Caught by composing a block and printing the intents; it
   * would otherwise have been found by the athlete, on the Monday, looking at nothing.
   *
   * ⚠️ THE COMPETITION LIFTS ONLY, NEVER THE WHOLE SESSION. The test day's floor-filling accessory
   * rows are not maximal and stay unstamped — blanket-stamping the session would put a maximal claim
   * on a hip thrust.
   * ⚠️ AND THE BY-FEEL BRANCH IS STAMPED TOO: no seed means no warm-up weights, not a lighter
   * session. The instruction is still "work up until the last set is genuinely hard", which is the
   * same effort with a worse aim.
   */
  const TEST_LIFT_INTENT = 'ME' as const;
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
        slot_intent: TEST_LIFT_INTENT,
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
      slot_intent: TEST_LIFT_INTENT,
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
        + 'is built on, and the weights fill in as soon as those two are logged. Testing before a '
        + 'programme is the source\'s own advice.',
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

/**
 * ⛔⛔ WHERE A SET ENDS — MICHAEL'S OWN SENTENCE, VERBATIM AND FINAL (2026-08-27). Do not reword it.
 *
 * > *"End the set when your form goes or you still have 1 or 2 reps left. Beyond that could mean
 * > longer recovery and fewer gains."*
 *
 * ⛔ IT IS TWO PAGES IN ONE LINE. p82 separates MUSCULAR failure from TASK failure — *"the inability
 * to complete future reps without form breakdown — think excessive back rounding in a squat, ending
 * the set before your quads fail"* — and says both *"are more likely to occur in compound
 * movements"*, which is every prescribed row in this block. p83 prices going past it: *"muscular
 * damage, contrary to early belief, is neither necessary for nor conducive to muscular growth. In
 * fact, it can cause recovery to take longer and diminish your capacity to train hard in the near
 * term."* For this athlete the near term is tomorrow's run.
 *
 * ⚠️ AN EARLIER DRAFT SAID *"stop when you start to feel it"* AND WAS CORRECTED. A heavy set feels
 * hard from about rep two, so that version would end every set before it did anything. It is
 * recorded here because it is the obvious rewrite and it is wrong.
 *
 * ⚠️ IT IS ON THE SESSION, NOT ON EVERY ROW, and it is the LIFTING sessions only — the plyo day has
 * its own stop rule (p227) and the test day has its own instruction. ⛔ AND IT IS NOT THE BLOCK'S
 * reason: p125's *"why"* is stated once, not twelve times. Said weekly it becomes wallpaper.
 * ⚠️ PASSES `voiceViolation` UNAIDED — measured, not assumed.
 */
export const SET_END_CUE =
  'End the set when your form goes or you still have 1 or 2 reps left. Beyond that could mean '
  + 'longer recovery and fewer gains.';

/**
 * ⛔⛔ THE VERBATIM POLICY IS OFF, AND IT MATTERS MORE THAN ANY LINE BELOW (Michael, 2026-08-28).
 *
 * A draft of the speed line was assembled word-for-word from p219 and handed to him as "all the
 * book". He raised the problem himself and it is the right call, for two reasons:
 *
 *   1. ⛔ **HIS PROSE IN A PRODUCT INTENDED TO SELL IS REPRODUCTION, NOT CITATION.** Quoting him in
 *      `SOURCE-viada-hybrid-athlete.md` is reference. Shipping his sentences as app copy is a
 *      different act, and a policy of "verbatim" points squarely at it.
 *   2. ⚠️ **HIS SENTENCES ARE WRITTEN FOR A BOOK.** *"Fatigue is discouraged"* is flat and academic
 *      under a bar.
 *
 * ⛔ **THE RULE IS THE ONE {@link SET_END_CUE} ALREADY FOLLOWED: THE CLAIM IS HIS, THE WORDS ARE
 * OURS, THE CITATION LIVES IN THE CODE.** That constant is Michael's own sentence traced to
 * p82/p83 — nobody would mistake it for a quote and it reads like a person talking. Every line here
 * is built the same way. ⚠️ **Do not "improve" any of them back toward the source wording.** The
 * pull toward the page is real and it is the wrong direction.
 */

/**
 * ⛔⛔ THE SPEED DAY GETS ITS OWN LINE, BECAUSE {@link SET_END_CUE} IS WRONG ON IT (2026-08-28).
 *
 * ⚠️ THE DEFECT, FROM MICHAEL'S DEVICE: `SET_END_CUE` was stamped as the `description` of ALL FOUR
 * lifting sessions. On a DE day it told him to stop with *"1 or 2 reps left"* while the rows
 * directly underneath prescribed **3-4 in reserve** (p218). One screen, two answers, and the
 * session-level one was the wrong one.
 *
 * ⛔ `SET_END_CUE` IS NOT REWORDED AND MUST NOT BE. It is Michael's own sentence, its own comment
 * forbids it, and it is CORRECT on the heavy days. What changed is only that it stopped being the
 * only line. Four intents, four meanings (p219) — two are written today.
 *
 * **THE CLAIM, p219:** *"Bar speed and quality of movement. Velocity and a consistent bar path are
 * the objectives; treat every rep as though the bar were loaded to a maximum. Fatigue is
 * discouraged."* ⚠️ **SENTENCE ONE CARRIES BOTH HALVES OF HIS OBJECTIVE** — speed AND bar path. A
 * draft kept only speed; that is a loss of content, not a tightening. Do not drop it again.
 *
 * ⛔⛔ TWO DRAFTS WERE REJECTED, AND BOTH READ BETTER THAN WHAT SHIPPED. Recorded because the next
 * session will otherwise re-derive them:
 *
 *   · *"If the bar slows, the set is done."* — **OURS.** The field-standard speed regulator, and
 *     `strength-focus-copy.ts` says so itself, calling it *"the same claim as his
 *     fatigue-is-discouraged, stated as something an athlete can act on mid-set."* **He gives no
 *     in-set stop rule for DE, so this line gives none.** Michael cut it on sight.
 *   · *"Fatigue costs you what the day trains."* — **FUSES TWO PAGES.** p219 says only that fatigue
 *     is discouraged; the *why* is p77. It states a causal claim the page does not make. *"Fatigue
 *     is discouraged here"* is flatter and correct, and flatter-and-correct wins.
 *
 * ⚠️ AND A SOURCED FACT IS DELIBERATELY UNPLACED, NOT DROPPED: p77 — *"ensuring that you are
 * minimally fatigued prior to and during strength movement practice can be crucial because high
 * fatigue can impair proper motor unit recruitment"* — is about what precedes the session, not what
 * happens inside it. It belongs somewhere; it does not belong here.
 *
 * ⚠️ NO REST CONTENT, ON ANY OF THESE LINES. Rest renders under the countdown
 * (`strength-rest-timer.ts`, carrying p78's rule from `strength-grid/intents.ts`). One owner, one
 * place — and `SET_END_CUE`'s own comment is the precedent: said weekly it becomes wallpaper.
 *
 * ⚠️ PASSES `voiceViolation` UNAIDED — measured 2026-08-28, alone and joined to the accessory line.
 */
export const SPEED_SET_END_CUE =
  'This day trains bar speed and a clean bar path, not weight. Every rep gets the same intent as a '
  + 'max attempt. Fatigue is discouraged here.';

/**
 * ⛔⛔ THE FATIGUE RULE INVERTS ON THE ACCESSORIES, AND THE APP SAID SO TO NOBODY (2026-08-28).
 *
 * ⚠️ THE HOLE: every session line an athlete reads tells them to stop early. p84 says the OPPOSITE
 * for hypertrophy work — *"Strength and power training typically dictate that this point of reduced
 * capacity represents the end of a productive session, but in hypertrophy training, this may well
 * be a crucial part of the training session itself"* — and we stated that in code
 * (`strength-grid/intents.ts` `REST_BETWEEN_SETS_RULE_HYP`) and on no screen at all.
 *
 * ⛔⛔ **"MAY BE" IS LOAD-BEARING AND IS NOT A WEAK VERB TO TIGHTEN.** p84 is hedged in the source —
 * *"may well be"* — and a draft flattened it to *"is part of what makes them work"*. Michael was
 * shown both and took the hedge. **It reads weaker. That is the price of matching what he actually
 * claims, and it is the right price.** Leave it.
 *
 * ⛔ THE SECOND SENTENCE IS p82/p83 AND IT IS WHAT STOPS THIS LINE CONTRADICTING THE HEAVY ONE.
 * Without it, "slowing down is part of the point" reads as licence to grind an accessory to failure
 * — which is the one thing both pages agree is unproductive.
 *
 * ⚠️ EVERY LIFTING DAY, BOTH INTENTS. All four carry accessories, so this is appended to the heavy
 * line and the speed line alike. ⛔ ONE LINE AT THE SESSION LEVEL, NOT A PARAGRAPH PER CARD:
 * Michael's ruling, and adding one to every accessory card would multiply exactly the double-accent
 * legibility problem the same session was fixing.
 */
export const ACCESSORY_FATIGUE_CUE =
  'The accessories run the other way. Slowing down may be part of what makes them work, rather than '
  + 'a reason to stop. Still short of failure.';

/**
 * ⛔ WHAT THIS LIFTING DAY SAYS ABOUT ITS SETS — read off the FRAME'S OWN DATA, never the day label.
 *
 * ⚠️ THE COMPETITION SLOT IS THE DAY'S IDENTITY. Every lifting day in both columns carries exactly
 * one `role: 'competition'` slot and its intent is what the label announces (`ME: Upper` opens on an
 * ME competition slot, `DE: Lower` on a DE one) — but the day ALSO carries DE and HYP accessories,
 * so "does this day contain a DE slot" is not the question. The competition slot is.
 *
 * ⛔ AND NOT `day.label`. That string is display text — `plain-intent.ts` maps it to `Heavy:` /
 * `Speed:` before an athlete reads it — and keying engine behaviour off a display string is how the
 * two get renamed apart. The intent is data; use the data.
 *
 * ⚠️ FALLS BACK TO THE HEAVY LINE, which is the conservative direction: it is the stop rule, and a
 * day whose identity could not be read should not lose one.
 */
export function sessionCueFor(day: FrameDay): string {
  const competition = day.strength.find((s) => s.role === 'competition');
  /**
   * ⛔⛔ THE HEAVY DAY'S SESSION LINE CARRIES NO STOP RULE — MOVED, NOT DROPPED (Michael, 2026-08-28).
   *
   * ⚠️ IT WAS SAID TWICE ON ONE SCREEN. `SET_END_CUE` at the top of the day and *"stop short of
   * failure"* on every ME card are the same instruction, and he ruled that **the card owns it**: a
   * stop rule is about the set in front of you, and that is where you are looking when you need it.
   *
   * ⛔ SO A HEAVY DAY NOW CARRIES ONLY {@link ACCESSORY_FATIGUE_CUE}, AND THAT IS DELIBERATE, NOT AN
   * OVERSIGHT. `SET_END_CUE` is untouched as a constant — his own verbatim sentence, its comment
   * still forbids rewording, and `strength-focus-copy.ts`'s `STANDING_ME_SET_CUE` is where the same
   * instruction now reaches him. **It stopped being stamped here; it did not stop being said.**
   *
   * ⚠️ AND THE SPEED DAY IS UNCHANGED — DO NOT SYMMETRY-FIX THIS. `SPEED_SET_END_CUE` is not a stop
   * rule; it states what the day trains. It has no per-card counterpart at all now that the DE card
   * cue is retired (`strength-focus-copy.ts` `STANDING_DE_SET_CUE`), so removing it would leave the
   * speed day saying nothing about itself.
   */
  const dayLine = competition?.intent === 'DE' ? `${SPEED_SET_END_CUE} ` : '';
  return `${dayLine}${ACCESSORY_FATIGUE_CUE}`;
}

/** ⛔ COMPOSE ONE WEEK. */
/**
 * ⛔ WHICH HALF OF THE BODY A TEST SESSION TESTS. The test days are the ONE place the frame states no
 * `lowerRole` — they are generated rather than transcribed — so this reads the name `testDaySession`
 * itself writes. ⚠️ Deliberately narrow: it matches only those two generated names and answers null
 * for anything else, so it can never quietly classify a transcribed day.
 */
function testRegionOf(name: string): 'upper' | 'lower' | null {
  if (/^test:\s*upper$/i.test(name.trim())) return 'upper';
  if (/^test:\s*lower$/i.test(name.trim())) return 'lower';
  return null;
}

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
        if (anchorRoleOf(slot.family, slot.role) === 'hard') hardSlotIndex.set(`${d.day}:${i}`, n++);
      });
    }
  }
  if (!days) throw new Error(`unknown column: ${args.column}`);

  const notes: ComposeNote[] = [];
  const sessions: PlanSession[] = [];
  const dosing: DosingSession[] = [];
  /**
   * ⛔ EVERY ENDURANCE SESSION THIS WEEK BUILDS, kept as the LIBRARY built it — the plan row carries
   * a name, a clock and tokens, and none of those say what intensity each step is. `Step.intensity`
   * does, and it is the only thing p146's buckets can be counted from.
   * ⚠️ THE FILLS, THE SWIM ADD-ONS AND THE ADVANCED TIER'S EXTRA RUNS ARE IN HERE TOO. All minutes
   * count (p109); a ledger that saw only the frame's four slots would understate the week for
   * exactly the athletes closest to their ceiling.
   */
  const builtEndurance: EnduranceSession[] = [];
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
   * ⛔⛔ A STATED DAY COUNT SHRINKS THE WEEK AS WELL AS GROWING IT (2026-08-30, Michael: *"user says
   * hours and days and we make it work"*).
   *
   * `dayShortfall` already grew the week to a stated count — three runs against two run slots buys a
   * third. The other direction was never built: **two runs against four run slots built four**, and
   * the athlete's exact answer was honoured upward and ignored downward. `easyFillFor`'s own comment
   * already states the law this implements — *"A STATED DAY COUNT IS EXACT — IT IS A CAP AS WELL AS
   * A FLOOR"* — so this is the missing half of a rule the file already declared, not a new one.
   *
   * ⛔⛔ ZERO IS AN ANSWER AND ABSENT IS NOT, and they are DIFFERENT STATES — the same distinction
   * `sport-slots.ts` draws between `'none'` and a missing key, and for the same reason.
   *   - **absent** — nobody asked. The frame's own sports stand, and the 2026-08-23 default
   *     ("the program owns the count") is untouched. Every caller predating the day question lands
   *     here.
   *   - **`0`** — the athlete said they do not do this sport. Every slot of it goes.
   * ⚠️ Collapsing the two would make a bike-only athlete's "no running" unsayable, which is exactly
   * the bug this fixes: `0` was read as "did not answer" and the runs came back.
   *
   * ⛔ THE EASIEST GOES FIRST AND THE LONG SESSION GOES LAST. p275's rule for a held sport is that it
   * keeps its long session and loses its top end; trimming from the bottom is the same ordering read
   * from the other end. A sport dropped to zero loses all of them, long included.
   * ⚠️ STANDARD COLUMN ONLY, matching `dayShortfall`. The taper column is a prescription, not an ask.
   */
  const droppedSlots: Set<string> = (() => {
    const drop = new Set<string>();
    if (args.column !== 'standard') return drop;
    for (const sport of ['run', 'ride'] as const) {
      const raw = args.enduranceDaysBySport?.[sport];
      if (raw == null) continue; // ⛔ ABSENT IS NOT ZERO — see above.
      const asked = Math.max(0, Math.round(Number(raw) || 0));
      const mine: { key: string; rank: number }[] = [];
      for (const dd of days) {
        dd.endurance.forEach((slot, i) => {
          const a = assignedSlot(sportAssignment, dd.day, i, slot);
          if (a.sport !== sport) return;
          const role = anchorRoleOf(slot.family, slot.role);
          mine.push({ key: `${dd.day}:${i}`, rank: role === 'long' ? 2 : role === 'hard' ? 1 : 0 });
        });
      }
      const surplus = mine.length - asked;
      if (surplus <= 0) continue;
      // ⚠️ TIES BROKEN BY KEY so the same ask never yields two different weeks.
      mine.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
      for (let i = 0; i < surplus; i++) drop.add(mine[i].key);
    }
    return drop;
  })();
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
  /**
   * ⛔⛔ §3c — THE TYPED MILES AND HOURS BECOME THE DIAL. Computed here, before a single session is
   * built, because every one of them is built at the size this decides.
   *
   * ⛔ THE SPECS ARE THE WHOLE WEEK'S ENDURANCE, add-ons included. The easy swims and the advanced
   * tier's extra easy runs are real sessions in the built week, so a bound that ignored them would
   * understate the ceiling for exactly the athletes closest to it.
   * ⚠️ THE TIER'S GATE IS UNCHANGED — `advancedTierSessions` still decides how many, on demonstrated
   * history. This only counts what it decided.
   */
  /**
   * ⛔⛔ THE LEVEL A SLOT IS BUILT AT, WITH ONE OWNER (2026-08-26 evening). Three things can decide
   * it and they have a fixed precedence:
   *
   *   1. the ATHLETE's own answer (`levelOverrides`) — an explicit choice always wins;
   *   2. the LOW-VOLUME TIER, when their running history does not carry the frame's own floor;
   *   3. the FRAME's printed level (p246).
   *
   * ⛔ THE TIER IS NOT WRITTEN INTO `levelOverrides`, deliberately. That field means *"the level the
   * athlete chose"*, and folding a program tier into it would lose the difference between a decision
   * they made and one the engine made for them — which is the label this codebase exists to keep.
   */
  /**
   * ⛔⛔ THE TIER IS THE ATHLETE'S OWN ANSWER NOW, AND HISTORY IS OUT OF IT (Michael, 2026-08-27):
   * *"im coming off a marathon a few months ago I was training less, this is the wrong thing."*
   *
   * ⛔ WHAT STOOD HERE AND WHY IT IS NOT COMING BACK. A `frameSpecs` week was composed at p246's
   * printed levels purely so `lowVolumeSports` could measure the athlete's last 28 days of logged
   * running and riding against its floor. That comparison IS the thing that was ruled out: a 28-day
   * window measures the last month, not training age, and p247's word is *"experience level"* with
   * no mileage qualifier anywhere. **No fallback and no later correction** — the answer decides it.
   *
   * ⚠️ THE MAPPING IS UNCHANGED. `experienceLevels` still returns `LOW_VOLUME_TIER_LEVELS` for a
   * sport answered "Newer" and nothing for one answered "Experienced"; only the INPUT moved.
   * ⚠️ `lowVolumeSports` IS STILL EXPORTED AND STILL TESTED — it is the derivation of the frame's
   * own floor, which the screen's "needs Xh/wk" is computed from. It simply no longer gates a level.
   */
  const tierLevels = experienceLevels(args.enduranceExperience);
  const levelForFamily = (family: string, frameLevel: Level): Level =>
    (args.levelOverrides?.[family] as Level | undefined) ?? (tierLevels[family] as Level | undefined) ?? frameLevel;

  /**
   * ⛔ HOW MANY MORE SESSIONS OF A SPORT THE ATHLETE'S OWN DAY COUNT ASKS FOR — see
   * `enduranceDaysBySport`. ⚠️ ONE OWNER, read twice: once when the specs are built (so the hours
   * solve sees every session) and once when they are placed (so the same number of days is actually
   * emitted). Two derivations is how a solved week and a built week start disagreeing.
   */
  const dayShortfall = (specs: SlotSpec[], sport: 'run' | 'ride'): number => {
    const asked = Math.max(0, Math.round(Number(args.enduranceDaysBySport?.[sport]) || 0));
    if (asked === 0 || args.column !== 'standard') return 0;
    const have = specs.filter((sp) => sp.sport === sport).length;
    // ⚠️ THE WEEK'S OWN ROOM CAPS IT: the two days the frame leaves clear, then the rest day.
    return Math.max(0, Math.min(asked - have, FREE_ENDURANCE_DAYS + REST_DAY_RUNG));
  };

  const dayFills: Record<'run' | 'ride', number> = { run: 0, ride: 0 };
  const enduranceSpecs: SlotSpec[] = (() => {
    const out: SlotSpec[] = [];
    for (const d of days) {
      d.endurance.forEach((slot, i) => {
        if (droppedSlots.has(`${d.day}:${i}`)) return; // ⛔ the stated day count removed this slot
        const a = assignedSlot(sportAssignment, d.day, i, slot);
        // ⚠️ THE FRAME'S OWN LEVEL, not the dial's answer — `slotSpans` builds the ladder UP from
        // here, so handing it a climbed level would start the ladder half-spent.
        /**
         * ⛔⛔ AND THE SAME ARCHETYPE THE WEEK WILL ACTUALLY BUILD (2026-08-27). The frame names no
         * shape on most slots, so this passed `undefined` and the library measured its FIRST
         * archetype — while the build below rotates through them (p229). The bounds were describing
         * a different session from the one the athlete gets: on an all-run week the floor claimed
         * 133 minutes and the week built 128.
         * ⚠️ ONE RESOLUTION, READ TWICE. The rotation is deterministic in the week number, so calling
         * it here and at the build site gives the same answer — but it has to be CALLED in both,
         * not left to the library's default in one of them.
         */
        out.push({
          family: a.family,
          level: levelForFamily(a.family, a.level),
          archetype: a.archetype ?? rotatedArchetype(a.family, levelForFamily(a.family, a.level), args.week),
          sport: a.sport,
        });
      });
    }
    const swims = Math.min(2, Math.max(0, Math.round(Number(args.swimEasySessions) || 0)));
    if (args.column === 'standard') {
      for (let i = 0; i < swims; i++) {
        out.push({ family: SWIM_SLOT.family, level: SWIM_SLOT.level, sport: 'swim' });
      }
      for (let i = 0; i < advancedTierSessions(args.demonstratedWeeklyMiles); i++) {
        out.push({ family: 'run_vt1', level: 1, sport: 'run' });
      }
      /**
       * ⛔⛔ THE DAYS THE ATHLETE SAID THEY DO EACH SPORT — see `enduranceDaysBySport`. Three runs
       * against two run slots means one more easy run, and it joins the specs HERE, before the
       * solve, so their hours are divided across three runs rather than across two and topped up.
       * ⚠️ THE EXTRA IS ALWAYS EASY. The frame owns the quality (p246), so a day the athlete adds
       * can only be base work — the same rule the hours fill already follows (p134).
       * ⚠️ CAPPED BY THE WEEK'S OWN ROOM, not by the ask: two clear days plus the rest day.
       */
      for (const sport of ['run', 'ride'] as const) {
        // ⚠️ COUNTED ONCE AND REMEMBERED. The placement below reads the same figure rather than
        // recomputing it against a different basis — the advanced tier's extra easy runs are in
        // `out` by now and would otherwise be counted on one side and not the other.
        dayFills[sport] = dayShortfall(out, sport);
        for (let i = 0; i < dayFills[sport]; i++) out.push({ ...EASY_FILL_SPEC[sport] });
      }
    }
    return out;
  })();
  const volumeSpans = slotSpans(enduranceSpecs, anchors);
  /**
   * ⛔ THE HOURS ASK WINS OVER THE OLD MILES ASK where both arrive. `targetWeeklyMiles` still travels
   * for every other reader of that field, but this composer stopped measuring running in miles.
   */
  const volume = {
    bounds: weekVolumeBounds(enduranceSpecs, anchors),
    run: sizeFor(volumeSpans, 'run', args.targetRunHours),
    ride: sizeFor(volumeSpans, 'ride', args.targetRideHours ?? args.targetWeeklyRideHours),
  };
  /**
   * ⛔⛔ THE HOURS PAST THE FIXED SESSIONS BECOME EASY WORK (Michael, 2026-08-26): *"any additional
   * hour will be programmed easy."* The hard and long sessions are the book's doses and do not
   * stretch; when the ask is above what the four slots hold at their caps, the surplus is EASY
   * SESSIONS, appended the way the advanced tier and the easy swims already are.
   *
   * ⛔ MORE SESSIONS, NEVER LONGER ONES. Stretching a session past its band is what p275 forbids in
   * terms (*"resist the urge to add more difficulty or length/level"*) and what §3d caps. Every
   * appended session is a level-1 base session — a dose that is on the page.
   * ⚠️ THEY LAND ON THE TWO DAYS THE FRAME LEAVES CLEAR of endurance, which are the lower-body
   * lifting days, and then on the rest day. `easyFillFor` decides how many; the loop below places
   * them through the same relocator everything else uses.
   */
  const easyFillFor = (sport: 'run' | 'ride'): number => {
    /**
     * ⛔⛔ THE ATHLETE'S DAY COUNT IS A FLOOR ON THIS, not just an input to the solve. `dayFills` is
     * what the spec builder actually counted, so the same number of days is placed as was solved
     * for. Without it the hours would be divided across (say) three runs and only two ever built.
     * ⚠️ MAX, NOT SUM. If the hours already buy two extra easy sessions and the athlete asked for
     * one more day, they get two — not three.
     */
    const byDays = dayFills[sport];
    /**
     * ⛔⛔ A STATED DAY COUNT IS EXACT — IT IS A CAP AS WELL AS A FLOOR. If the athlete says they
     * ride two days, four hours of riding is divided across two rides; it does not buy a third day
     * they did not ask for. Their days are a fact about their week, not a starting point for the
     * hours to argue with.
     * ⚠️ AND WHEN THE HOURS DO NOT FIT IN THOSE DAYS, the week says so through the channel that
     * already exists — `sizeFor`'s `over_cap` verdict and `fixedHoursLine` — rather than quietly
     * adding a day. Michael's own framing: they tell us the days, and we chop the hours up.
     */
    /**
     * ⛔ A STATED ZERO BUYS NOTHING (2026-08-30). `0` reaching here used to fall past this guard into
     * the hours branch, which would append easy sessions of a sport the athlete said they do not do.
     * ⚠️ `!= null` rather than `> 0`, so absent still reaches the hours logic exactly as before.
     */
    const stated = args.enduranceDaysBySport?.[sport];
    if (stated != null && Math.round(Number(stated) || 0) === 0) return 0;
    if (Number(stated) > 0) return byDays;
    /**
     * ⛔⛔ A FRAME THAT DOES NOT ASK FOR WEEKLY HOURS NEVER BUYS A SESSION WITH THEM (Michael,
     * 2026-08-31). See `frameAsksWeeklyHours`. The hours field can still ARRIVE on such a frame —
     * from a draft written before its hours box came off, an older client, or a restate reading a
     * plan row that stored one — and acting on it put an easy run on that frame's legs day and its
     * REST day, neither of which the athlete picked and both of which its page leaves clear.
     * ⚠️ IT RETURNS `byDays`, NOT ZERO: an explicitly stated day count is a different answer and is
     * still honoured. What is refused is inventing sessions out of an hours total.
     */
    if (!frameAsksWeeklyHours(args.frame)) return byDays;
    const solve = sport === 'run' ? volume.run : volume.ride;
    const bound = sport === 'run' ? volume.bounds.run : volume.bounds.ride;
    if (solve.verdict !== 'over_cap' || bound.sessions === 0) return byDays;
    const want = Number(sport === 'run' ? args.targetRunHours : (args.targetRideHours ?? args.targetWeeklyRideHours));
    if (!Number.isFinite(want) || want <= bound.cap) return 0;
    const each = easyFillHours(sport, anchors);
    if (each <= 0) return 0;
    /**
     * ⛔⛔ ROUNDED TO THE NEAREST SESSION, NOT UP — and Michael's own worst case is what forced it.
     * His words: *"If someone runs an hour a week and they only pick one run, worst case they get
     * the cap on the hard session."* One hard run caps at about 50 minutes; ask for an hour and the
     * gap is eleven minutes. `Math.ceil` bought a whole 30-minute easy run for those eleven minutes
     * and built 1h19 against a 1h ask — overshooting the number in the name of honouring it.
     * ⚠️ SO A GAP SMALLER THAN HALF A SESSION BUYS NOTHING. The week lands nearest the ask, which is
     * the only reading of "the accumulative hours for the week" that does not routinely overshoot.
     *
     * ⚠️ CAPPED BY THE WEEK'S OWN ROOM, not by the ask. Past the free days and the rest day the only
     * answer left is stacking onto a lifting day, which is a different question (D-452) and not one
     * a volume number gets to decide on its own.
     */
    return Math.min(
      FREE_ENDURANCE_DAYS + REST_DAY_RUNG,
      Math.max(byDays, Math.round((want - bound.cap) / each)),
    );
  };
  /** ⛔ ONE DIAL POSITION PER SPORT — see `sizeFor`. A swim has no typed target and keeps the default. */
  const dialForSport = (sport: 'run' | 'ride' | 'swim'): number =>
    sport === 'run' ? volume.run.size : sport === 'ride' ? volume.ride.size : DEFAULT_SIZE;
  /**
   * ⛔⛔ WHERE ONE SLOT SITS ON THE DIAL — its LEVEL as well as its size (Michael, 2026-08-26).
   *
   * A base session grows through the book's own sizes before a new day is added: an easy run goes
   * 25-30 → 45-60 → 80-90 (p235, *"the level refers almost strictly to duration"*) rather than
   * spawning a second easy run at 30 minutes. ⛔ A QUALITY slot has one rung — the frame's level —
   * so this returns its assigned level unchanged and moves only the size, which is p246's
   * assignment left exactly where it is.
   * ⚠️ `levelOverrides` STILL WINS. An explicit caller answer is not a dial position.
   */
  const rungForSlot = (
    family: string, frameLevel: Level, archetype: string | undefined, sport: 'run' | 'ride' | 'swim',
    /**
     * ⛔⛔⛔ THE ATHLETE'S OWN LENGTH FOR THIS ONE SESSION, WHEN A SCREEN HAS ASKED FOR ONE — see
     * `SportMix.minutes` (Michael, 2026-08-30). It BEATS the per-sport dial, because it is a direct
     * answer about this session rather than a number divided across the sport's sessions.
     * ⚠️ IT IS RESOLVED INSIDE THIS SLOT'S OWN LADDER (`rungForMinutes`), so it cannot put a session
     * below its floor or above its ceiling however the caller was answered.
     * ⚠️ ABSENT ON EVERY CALL THAT PREDATES IT, and those take the dial exactly as they did.
     */
    minutesAsked?: number | null,
  ): { level: Level; size: number } => {
    const override = args.levelOverrides?.[family] as Level | undefined;
    if (override != null) return { level: override, size: dialForSport(sport) };
    // ⛔ THE LOW-VOLUME TIER SITS BETWEEN THE ATHLETE'S ANSWER AND THE FRAME'S — see `levelForFamily`.
    // ⚠️ Read here as well as in `enduranceSpecs`, because the ladder and the built session must
    // start from the same rung; two readings of "which level" is how the stated hours and the built
    // week come apart.
    const level = levelForFamily(family, frameLevel);
    /**
     * ⛔⛔ NO ANSWER MEANS THE FRAME'S OWN PRESCRIPTION, NOT THE MIDDLE OF THE LADDER.
     *
     * The dial defaults to 0.5, and once a base slot spans three levels that midpoint sits in LEVEL
     * TWO — so an athlete who typed nothing would have got a week half again as long as p246 writes,
     * climbed by a number they never gave. Absent is not a request for more.
     * ⚠️ CAUGHT BY THE SWEEP THAT PINS THE UNTARGETED WEEK: it read 7h55 where the frame builds 5h19.
     */
    const verdict = sport === 'run' ? volume.run.verdict : sport === 'ride' ? volume.ride.verdict : 'no_target';
    const rungs = ladderOf({ family: family as never, level, archetype, sport }, anchors);
    /**
     * ⛔⛔ THE ATHLETE'S OWN ANSWER FIRST, AND BEFORE THE `no_target` BRANCH. A screen that asks per
     * session sends no weekly hours at all, so the verdict there is always `no_target` — reading it
     * first would drop every minutes pick on the floor and build the frame's midpoint instead, with
     * nothing said. **The silent shape of every defect in this area.**
     */
    if (minutesAsked != null && Number.isFinite(Number(minutesAsked)) && rungs.length > 0) {
      const at = rungForMinutes(rungs, Number(minutesAsked));
      return { level: at.level, size: at.size };
    }
    if (verdict === 'no_target') return { level, size: DEFAULT_SIZE };
    if (rungs.length === 0) return { level, size: dialForSport(sport) };
    const at = rungAt(rungs, dialForSport(sport));
    return { level: at.level, size: at.size };
  };

  const { place: relocate, moves: enduranceMoves } = enduranceRelocator(args);
  /**
   * `${frameDay}:${slotIndex}` → the weekday it ends on. ⛔ EVERY SLOT, not only the pinned ones
   * (2026-08-26).
   *
   * ⚠️ THE FREE SLOTS USED TO BE RESOLVED LAZILY INSIDE THE DAY LOOP, and that made one fact
   * unknowable at the moment it was needed: the day loop emits frame day 2's LIFTS before it has
   * decided where frame day 3's, 4's or 6's endurance lands, so the lower-body slots were priced
   * against a week the composer had not finished placing. `hardRunBeforeLower` below is exactly
   * that fact, so it has to be answered before a single barbell row is written.
   *
   * ⛔⛔ THE ORDER IS UNCHANGED AND THE ORDER IS THE RULING. Pinned slots go through the relocator
   * FIRST — Michael, 2026-08-25 afternoon: *"the athlete's own days are relocated first, so they get
   * first choice and an engine-placed session takes what is left"* — then the free ones in frame
   * order, then (below, after the day loop) the swim add-ons and the advanced tier. That is the same
   * sequence this file ran before; only the point at which it runs moved.
   */
  const enduranceDays = new Map<string, Weekday>();
  for (const wantPinned of [true, false]) {
    for (const d of days) {
      d.endurance.forEach((slot, i) => {
        const key = `${d.day}:${i}`;
        if (droppedSlots.has(key)) return; // ⛔ the stated day count removed this slot
        if (enduranceDays.has(key)) return;
        const hardIndex = hardSlotIndex.get(key) ?? 0;
        // ⛔ THE FRAME'S OWN ANSWER, matching `hardSlotIndex` above — see `anchorRoleOf`. The slot's
        // stated role wins where it has one; the family decides where it does not.
        const role = anchorRoleOf(slot.family, slot.role);
        const pinned = role === 'long'
          ? !!args.endurancePins?.long
          : role === 'hard' ? !!args.endurancePins?.hard?.[hardIndex] : false;
        if (pinned !== wantPinned) return;
        const proposed = enduranceDayFor(args, d.day, role, hardIndex);
        enduranceDays.set(key, relocate(proposed, enduranceLabelFor(role)));
      });
    }
  }

  /**
   * ⛔⛔ THE HAIRCUT'S CAUSE IS A FACT ABOUT THE CALENDAR, AND IT WAS BEING ASKED OF THE FRAME
   * (2026-08-26, found by the fuzz harness's criterion 8 — 6,688 shapes with the reduction engaged
   * and no run in front of it, and 29 with a hard run in front of it and no reduction).
   *
   * p247, and the subject of the sentence is a DAY: *"**Monday's run** is fairly challenging, given
   * that there is an ME lower session **the next day**… a 3 to 4 percent reduction in working 1RM
   * should be assumed here."* The cause is an ADJACENCY. `sport-slots.ts` answered a different and
   * narrower question — *"is the frame's day-1 slot a hard run"* — and never looked at a weekday,
   * which was right while nothing could move a session off its frame day. `endurancePins` can put
   * that run anywhere in the week, and a pin on the OTHER hard slot can create the adjacency out of
   * a slot day 1 never held. ⛔ THAT READER IS DELETED, not out-shouted: two answers to one question
   * is how the plan and the sentence about the plan come to disagree.
   *
   * ⛔ SO BOTH DIRECTIONS WERE WRONG, AND BOTH ARE ATHLETE-VISIBLE. The reduction firing with the
   * run moved away printed *"the run the day before is still in the legs"* over a day with no run on
   * it — the plan asserting a reason the calendar disproves. The reduction NOT firing when a pinned
   * hard run did land the day before left p247's one compensated break uncompensated.
   *
   * ⚠️ IT IS THE **ASSIGNED** SLOT THAT IS ASKED, not the frame's — same reason `sport-slots.ts`
   * gives at its own `dayOne0`: a declined hard slot has its FAMILY rewritten to the column's easy
   * one, so the frame still calls day 1 hard after the week has converted it to easy running.
   * ⚠️ AND THE SPORT MUST BE `run`. p280 is why: hard riding does not land on the legs the way
   * running does, which is the whole reason the substituted case drops the reduction
   * (`HAIRCUT_CAUSE_IS_OURS`).
   */
  /**
   * ⛔ EVERY ME LOWER DAY THE FRAME HAS, ASKED OF THE FRAME (2026-08-30) — see `FrameDay.lowerRole`.
   * ⚠️ IT WAS A `find` ON THE LABEL `'ME: Lower'`, WHICH IS BOTH TOO NARROW AND TOO FEW. p274 names
   * the All Rounder's lower days for their pattern and opens BOTH on an ME slot, so the old test
   * returned nothing and the p247 reduction could never fire on this frame. `strength_5k` still
   * answers with its one day, in the same order, through the label fallback in `lowerRoleOf`.
   */
  const meLowerFrameDays = days
    .filter((d) => (d.lowerRole ?? (d.label === 'ME: Lower' ? 'me' : null)) === 'me')
    .map((d) => d.day);
  const daysBeforeMeLower = new Set(
    meLowerFrameDays.map((fd) => WEEKDAYS[(WEEKDAYS.indexOf(dayNameFor(args, fd)) + 6) % 7]),
  );
  const hardRunBeforeLower = daysBeforeMeLower.size > 0 && days.some((d) =>
    d.endurance.some((slot, i) => {
      const assigned = assignedSlot(sportAssignment, d.day, i, slot);
      const placed = enduranceDays.get(`${d.day}:${i}`);
      return assigned.sport === 'run'
        && isHardSlot({ family: assigned.family, role: assigned.role })
        && placed != null && daysBeforeMeLower.has(placed);
    }));
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
            /**
             * ⛔⛔ THE PLACEMENT FACTS TRAVEL WITH THE TEST SESSIONS — see `fillMuscleFloor`. A test
             * day is the LIGHTEST session of its week and the floor used to choose on weight alone,
             * which is how glute work landed on the upper test day the day before a squat and
             * deadlift max. ⚠️ `heavyLower` is true for the lower test specifically: it is the most
             * expensive session in the block to arrive at fatigued, because its numbers price every
             * week that follows.
             */
            day: day.day,
            ...(testRegionOf(test.name) ? { region: testRegionOf(test.name)! } : {}),
            ...(testRegionOf(test.name) === 'lower' ? { heavyLower: true } : {}),
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
        let droppedHere = 0;
        for (const slot of day.strength) {
          const built = exerciseForSlot(
            slot, args, notes, hardRunBeforeLower, takenToday, picks, focusMuscles,
            dialMuscles, day.day);
          // ⛔ THE DAY RAN OUT OF MOVEMENTS FOR THIS PATTERN — see `exerciseForSlot`'s drop branch.
          if (!built) { droppedHere += 1; continue; }
          const { exercise, movement, sets, pattern } = built;
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
        /**
         * ⛔ A DROPPED SLOT IS SAID, NOT ABSORBED (2026-08-30). `buildStandingPlanRow` turns a
         * `warning` note into a `placement_compromises` entry, which is the channel the builder
         * already reads — so the athlete is told their kit came up short on this pattern rather than
         * being handed a shorter day with no reason, or the same lift printed twice.
         * ⚠️ ONE SENTENCE PER DAY, not per slot; a bodyweight-only pull day can drop more than one.
         */
        if (droppedHere > 0) {
          notes.push({
            kind: 'warning',
            // ⛔ IT NAMES THE CAUSE AND THE FIX. "Came up short" on its own teaches the athlete
            // nothing — the cause is the equipment on file, and adding to it is the thing that
            // changes the answer.
            text: `${day.label ?? `Day ${day.day}`} is ${droppedHere} `
              + `${droppedHere === 1 ? 'exercise' : 'exercises'} short. The equipment on file does `
              + 'not cover enough different movements for this part of the body to fill the day '
              + 'without repeating one, and the same lift twice is not two exercises. Adding what '
              + 'you have to your equipment list is what fills these.',
          });
        }
        sessions.push({
          day: dayNameFor(args, day.day),
          type: 'strength',
          name: day.label ?? 'Strength',
          // ⛔ THE SESSION SAID NOTHING AT ALL UNTIL NOW, on a screen where every endurance session
          // states its own job. See `SET_END_CUE` — his words, and the two pages under them.
          // ⛔ AND IT SAID THE SAME THING ON ALL FOUR LIFTING DAYS UNTIL 2026-08-28, which was wrong
          // on the speed days — `SET_END_CUE` asks for 1-2 in reserve while a DE row prescribes 3-4.
          // `sessionCueFor` picks by the day's competition slot; see `SPEED_SET_END_CUE`.
          description: sessionCueFor(day),
          duration: 55,
          strength_exercises: exercises,
          // ⛔ THE DAY'S STRUCTURAL FACT TRAVELS WITH THE SESSION — see `FrameDay.lowerRole`. The
          // interference law used to recover "this is the heavy leg day" by string-matching the
          // session's NAME, which only worked while every frame named its days the same way.
          tags: [
            'standing_plan', `frame:${frame.id}`, `column:${args.column}`,
            ...(day.lowerRole ? [`lower:${day.lowerRole}`] : []),
          ],
        });
        /**
         * ⛔ AND THE SAME FACTS ON EVERY LIFTING DAY — read off the FRAME, never off the label.
         * `lowerRole` is the frame's own statement that this is a lower day and whether it is the
         * heavy one; a label test is what `FrameDay.lowerRole` exists to replace.
         */
        dosing.push({
          label: day.label ?? `day ${day.day}`,
          day: day.day,
          ...(day.lowerRole ? { region: 'lower' as const } : { region: 'upper' as const }),
          ...(day.lowerRole === 'me' ? { heavyLower: true } : {}),
          sets: dosed,
        });
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
      if (droppedSlots.has(`${day.day}:${i}`)) return; // ⛔ the stated day count removed this slot
      const assigned = assignedSlot(sportAssignment, day.day, i, slot);
      /**
       * ⛔⛔ ONE ARCHETYPE, RESOLVED ONCE, READ BY BOTH THE LADDER AND THE BUILD (2026-08-30).
       *
       * `rungForSlot` was handed `assigned.archetype` — often `undefined`, because the frame names no
       * shape on most slots — while `buildEnduranceSession` below fell back to `rotatedArchetype`.
       * **Two different sessions measured and built.** It was invisible while the ladder only had to
       * be roughly right for a dial position; a minutes pick is resolved INSIDE that ladder, so the
       * length the athlete chose would have been mapped through one session's rungs and delivered as
       * another's. ⚠️ It changes nothing for a slot whose shape is pinned — `RIDE_EQUIVALENT` pins
       * every ride slot, and p246's near-threshold slot names its own — and for the rest it makes the
       * measured session the built one, which is what the ladder always claimed to be.
       */
      const slotArchetype = assigned.archetype
        ?? rotatedArchetype(assigned.family, levelForFamily(assigned.family, assigned.level), args.week);
      /**
       * ⛔ THE ATHLETE'S OWN LENGTH FOR THIS SESSION, WHERE A SCREEN ASKED — see `SportMix.minutes`.
       * ⚠️ THE FRAME'S ROLE DECIDES WHETHER IT IS HONOURED, never a family name: quality doses are the
       * page's and a screen may not shorten them (`isHardSlot` reads the frame's own `role` first).
       */
      const askedMinutes = isHardSlot(slot)
        ? null
        : Number(args.sportMix?.minutes?.[`${day.day}:${i}`] ?? NaN);
      // ⛔ THE LEVEL IS THE DIAL'S ANSWER FOR A BASE SLOT — see `rungForSlot`. Quality is unmoved.
      const rung = rungForSlot(
        assigned.family, assigned.level, slotArchetype, assigned.sport,
        Number.isFinite(askedMinutes) ? askedMinutes : null,
      );
      const level = rung.level;
      /**
       * ⛔ "ENGINE'S PICK — ROTATES WEEK TO WEEK" MUST BE TRUE (Michael, 2026-08-24). With no
       * athlete pick, the library took its first archetype every week — twelve identical
       * workouts wearing a rotation's label. OURS: alternate the family's own offered shapes by
       * week; his variety principle, applied inside his own option set.
       */
      /**
       * ⛔⛔ THE STRIDES, AND THEY ARE THE FRAME'S ONLY SPEED WORK (Michael, 2026-08-26 evening).
       *
       * ⛔ THE GAP: p119 lists running economy FIRST of the three qualities that may not lapse, and
       * NOT ONE of the frame's four sessions is speed work — MLSS, near-threshold, VT1 and LSD are
       * all threshold-or-below. `run_sprint_power` is fully built and the frame never reaches for it.
       *
       * ⛔ AND p109 IS WHY THERE IS NO FIFTH SLOT: *"athletes can improve turnover/running economy
       * with as few as a handful of strides before, during, or after other running sessions, so
       * there's no need for a speed session to be a lengthy stand-alone!"* p246 prints four slots and
       * all four are the frame's, so the economy work goes ON one of them.
       *
       * ⛔⛔ THE FRAME NAMES THE CARRIER NOW — `EnduranceSlot.carriesStrides` (2026-08-30). It was
       * `family === 'run_vt1'`, which asked a different question: the easy run was chosen because it
       * is the lightest RUNNING SESSION in the week, and that is a fact about the slot's job rather
       * than about its family. A frame whose easy slot is prescribed as a ride — p274 day 4 — has no
       * session of that family at all, so the test silently found nothing.
       *
       * ⚠️ AND THE RUN GUARD STAYS. A marked slot carries strides only when its sport is actually a
       * run. An athlete who put the carrier on the bike gets none, which is the honest answer: there
       * is no running economy to train on a session with no running in it.
       * ⚠️ THE FRAME'S OWN SLOT ONLY. The volume-fill easy runs and the advanced tier's extra easy
       * runs are appended elsewhere in this file and carry none — one stride block a week.
       */
      const carriesStrides = slot.carriesStrides === true && assigned.sport === 'run';
      const built = buildEnduranceSession({
        family: assigned.family,
        level,
        // ⚠️ THE SAME SHAPE THE LADDER ABOVE WAS MEASURED ON — see `slotArchetype`.
        archetype: slotArchetype,
        anchors,
        // ⛔ §3c — the dial the athlete's typed number set. See `volume-bounds.ts`.
        size: rung.size,
        ...(carriesStrides ? { addOn: 'strides' as const } : {}),
      });
      builtEndurance.push(built);
      const row = translateEnduranceSession(built, { raceTempo: assigned.raceTempo });
      sessions.push({
        // ⛔ THE PIN WINS HERE AND ONLY HERE. Every other `dayNameFor` call in this file is a lift,
        // a plyo block or an add-on, and those keep the frame's rotation — see `endurancePins`.
        // ⛔ AND THEN OFF A DAY THE ATHLETE CANNOT TRAIN — the pinned slots already went through the
        // relocator in the pre-pass above, so this reads their answer rather than re-asking.
        // ⛔ READ, NEVER RE-ASKED. Every slot went through the relocator in the pre-pass above, so
        // calling `relocate` again here would count the same session twice in its `used` set and
        // push the NEXT relocated session a day further out. ⚠️ The fallback is the frame's own day
        // and takes no relocator turn — it is unreachable by construction and exists so a future
        // slot the pre-pass misses lands somewhere real instead of `undefined`.
        day: enduranceDays.get(`${day.day}:${i}`) ?? dayNameFor(args, day.day),
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
      const built = buildEnduranceSession({ family: SWIM_SLOT.family, level: SWIM_SLOT.level, anchors, size: dialForSport('swim') });
      builtEndurance.push(built);
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

  /**
   * ── the newer tier: the same four sessions at his smaller sizes ──────────────────────────────
   *
   * ⛔ THE BLOCK SAYS SO WHEN IT APPLIES. The sessions are the frame's and the levels are his taper
   * column's, and WHICH of the two an athlete gets is their own answer as of 2026-08-27 — so the
   * note names the answer rather than a gate we invented. Same discipline as the advanced tier's.
   * ⚠️ ONE NOTE PER BLOCK, not one per week: `composeWeek` runs per week and the note is deduped by
   * its text everywhere else in this file.
   */
  if (Object.keys(tierLevels).length > 0 && !notes.some((n) => n.text === EXPERIENCE_IS_THE_ATHLETES_ANSWER)) {
    notes.push({ kind: 'ours', text: EXPERIENCE_IS_THE_ATHLETES_ANSWER });
    // ⛔ AND THE RIDE SIDE CARRIES ITS OWN LABEL, because there is no cycling taper column under it.
    if (Object.keys(tierLevels).some((f) => f.startsWith('ride_'))) {
      notes.push({ kind: 'ours', text: LOW_VOLUME_RIDE_LEVELS_ARE_OURS });
    }
    notes.push({
      kind: 'source',
      text: 'The two quality runs and the long run are prescribed at the smaller of the source\'s own '
        + 'sizes, which is the answer given for running experience. The taper column prescribes these '
        + 'sessions at level 1, and the 90-to-100-minute long run is stated as the more proficient '
        + 'runner\'s figure.',
      cite: 'Viada pp246-247',
    });
  }

  // ── the advanced tier: a PROGRAM tier, gated on demonstrated history ──────────────────────────
  const extraVt1 = advancedTierSessions(args.demonstratedWeeklyMiles);
  if (extraVt1 > 0 && args.column === 'standard') {
    const openDays = days.filter((d) => !d.rest && d.endurance.length === 0 && d.strength.length === 0);
    const targets = openDays.length > 0 ? openDays : days.filter((d) => !d.rest && d.endurance.length === 0);
    for (let i = 0; i < extraVt1 && i < targets.length; i++) {
      // ⛔ THE TIER'S RUNS TAKE THE RUN DIAL TOO — they are miles in the same week.
      const built = buildEnduranceSession({ family: 'run_vt1', level: 1, anchors, size: dialForSport('run') });
      builtEndurance.push(built);
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

  /**
   * ⛔⛔ THE HOURS PAST THE FIXED SESSIONS, AS EASY SESSIONS (Michael, 2026-08-26). See `easyFillFor`
   * above for the count and `EASY_FILL_SPEC` for the dose.
   *
   * ⛔ THE DAYS THE FRAME LEAVES CLEAR, IN ORDER, AND THE REST DAY LAST. p246 puts no endurance on
   * the two lower-body lifting days and gives the week one full rest day; those are the only rooms
   * the week has. Filling the lifting days first is the cheaper of the two — a day that already
   * trains costs the athlete no additional day off, which is D-452's own stacking logic — and the
   * REST DAY IS SPENT ONLY WHEN THE ASK NEEDS IT, and says so when it is.
   * ⚠️ EVERY ONE GOES THROUGH THE SAME RELOCATOR as the rest of the week, so a day off still moves
   * it and still gets its sentence.
   */
  {
    const restFrameDay = days.find((d) => d.rest)?.day ?? null;
    /** ⛔ The weekday the frame's rest day actually lands on under this block's rotation. */
    const restWeekday = restFrameDay == null ? null : dayNameFor(args, restFrameDay);
    const clearDays = days
      .filter((d) => !d.rest && d.endurance.length === 0)
      .map((d) => d.day);
    for (const sport of ['run', 'ride'] as const) {
      const want = easyFillFor(sport);
      if (want <= 0) continue;
      const spec = EASY_FILL_SPEC[sport];
      const room = restFrameDay == null ? clearDays : [...clearDays, restFrameDay];
      let spentRestDay = false;
      let fillsPlaced = 0;
      for (let i = 0; i < want && i < room.length; i++) {
        const frameDay = room[i];
        /**
         * ⛔⛔ SIZED BY THE SAME DIAL AS EVERY OTHER SESSION (2026-08-27). This was pinned at `size:
         * 1` — the session at its cap — which was right while a fill existed only to soak up hours
         * the frame could not hold. It is wrong now that a fill can be a day the athlete ASKED for:
         * the solve divides their hours across every session including this one, and building it at
         * its cap regardless made the week miss the ask (three hours asked, 2h39 built).
         * ⚠️ `rungForSlot` IS THE ONE OWNER of "where does this sport's dial sit", so the appended
         * day climbs its levels on the same terms as the frame's own easy session.
         */
        /**
         * ⛔⛔ AND ONLY THE DAYS THE ATHLETE ASKED FOR ARE DIAL-SIZED. `dayFills` sessions are in
         * `enduranceSpecs`, so the solve divided the hours across them and the dial is their answer.
         * An HOURS-driven fill is not in the specs — `easyFillFor` buys it by dividing the leftover
         * by `easyFillHours`, which is the LEVEL-1 cap — so it stays at that dose. Dial-sizing one
         * of those climbed it to the family's ceiling and built five hours of riding against a
         * four-hour ask.
         */
        const askedDay = i < dayFills[sport];
        const rung = askedDay
          ? rungForSlot(spec.family, spec.level, spec.archetype, sport)
          : { level: spec.level, size: 1 };
        const built = buildEnduranceSession({
          family: spec.family, level: rung.level, archetype: spec.archetype, anchors, size: rung.size,
        });
        builtEndurance.push(built);
        const row = translateEnduranceSession(built);
        const day = relocate(
          dayNameFor(args, frameDay),
          sport === 'run' ? 'the extra easy run' : 'the extra easy ride',
        );
        fillsPlaced += 1;
        /**
         * ⛔ THE REST-DAY SESSION IS TAGGED AS ACTIVE RECOVERY (Michael, 2026-08-26), and the tag is
         * a claim the source makes rather than a softer word for the same thing. His rule 7: *"A
         * rest day is not always needed. An easier activity can be more rejuvenating than sitting at
         * home."* The day is not lost — it changes job.
         * ⚠️ THE TAG ONLY. Giving the session its own NAME and flavour is a display change across
         * every surface that renders a week, and it is flagged as follow-up rather than smuggled in
         * here; the tag is what a surface will read when that lands.
         */
        /**
         * ⛔⛔ THE REST DAY IS JUDGED ON THE PLACED WEEKDAY, NOT THE FRAME DAY (fixed 2026-08-26).
         * It read the frame day, so a fill aimed at the rest day and then RELOCATED off it — because
         * the athlete had blocked that day — still stamped the session and still fired the sentence.
         * The week kept its day off and the block said it had lost it: 702 shapes in the sweep.
         * ⚠️ The weekday the relocator returned is the only honest subject here.
         */
        const takesRestDay = restWeekday != null && day === restWeekday;
        if (takesRestDay) spentRestDay = true;
        sessions.push({
          day,
          ...row,
          tags: [...row.tags, 'volume_fill', ...(takesRestDay ? ['active_recovery'] : [])],
        });
      }
      /**
       * ⛔⛔ DAY-AGNOSTIC, AND THAT IS A FACT ABOUT THE SCREEN RATHER THAN A STYLE CHOICE (Michael,
       * 2026-08-26). A draft named the weekdays — *"added as easy rides on Tuesday and Friday"* —
       * and it cannot: **the endurance screen sits BEFORE the scheduler.** Days are not decided
       * when this line is read, and pins and blocked days move sessions afterwards. A weekday here
       * would be a promise the next screen breaks.
       *
       * ⛔ AND THE HOURS PICK IS NOT ONLY VOLUME — Michael, verbatim: *"remember they are
       * potentially building days."* An added easy session can land on a day that currently carries
       * no endurance, so choosing more hours can change how many days the week trains on. That is
       * the half a volume number does not obviously carry, and it is what this sentence is for.
       * ⚠️ "CAN", NOT "WILL": on a lifting-only day the athlete already trains, so the session adds
       * work rather than a day. Only the rest-day rung adds a day outright, and its own line below
       * says so.
       */
      if (fillsPlaced > 0) {
        notes.push({
          kind: 'ours',
          text: `The extra hours are added as easy ${sport === 'run' ? 'runs' : 'rides'}, which can `
            + 'add training days to the week.',
        });
      }

      /**
       * ⛔⛔ MICHAEL'S OWN SENTENCE, VERBATIM AND WITHOUT A DAY NAME: *"At this many hours, rest day
       * becomes active recovery."* Mine said the day *"stops being a rest day"* — a loss where his
       * states a change of job — and a later draft named the weekday, which this screen cannot know.
       *
       * ⛔ THE SOURCE IS ON HIS SIDE. Rule 7: *"A rest day is not always needed. An easier activity
       * can be more rejuvenating than sitting at home"*, with consolidation of stressors deciding
       * whether a full rest day is actually needed. p246 gives the week a rest day; it does not say
       * the day may only be spent lying down.
       */
      if (spentRestDay) {
        notes.push({
          kind: 'warning',
          text: 'At this many hours, rest day becomes active recovery.',
          cite: 'Viada p139-145',
        });
      }
    }
  }

  /**
   * ⛔⛔ WHEN THE HOURS DO NOT FIT THE STATED DAYS, THE WEEK SAYS SO (2026-08-30). The last hiding
   * place of the silent trim: fifteen ride hours across two stated ride days built about six and the
   * block said nothing about the missing nine.
   *
   * ⚠️ THE CHANNEL EXISTED AND WAS NEVER CALLED. `easyFillFor`'s comment promised this would surface
   * *"through the channel that already exists — `sizeFor`'s `over_cap` verdict and `fixedHoursLine`"*
   * — and `fixedHoursLine` is exported, tested, and invoked from NOWHERE in this file. A promise in a
   * comment is not a wire. This reads the verdict that comment named rather than adding a second path.
   *
   * ⛔⛔ AND IT SITS OUTSIDE THE FILL LOOP DELIBERATELY. It lived inside it for one draft, below that
   * loop's own `if (want <= 0) continue` — so it could only fire on a week that had ALREADY placed a
   * fill, which is exactly the case where the hours are NOT short. It never ran once. Do not move it
   * back in.
   *
   * ⛔ ONLY WHEN THE DAY COUNT IS THE ATHLETE'S OWN. Absent a stated count the hours buy extra easy
   * days above and there is no conflict — the week grew to meet them. A stated count is a hard cap,
   * so the hours are what has to give, and that is the fact the athlete is owed.
   * ⚠️ IT NAMES BOTH NUMBERS. "Some hours did not fit" is the same silence in a politer voice.
   */
  if (args.column === 'standard') {
    for (const sport of ['run', 'ride'] as const) {
      const statedDays = args.enduranceDaysBySport?.[sport];
      if (statedDays == null) continue;
      const statedCount = Math.round(Number(statedDays) || 0);
      if (statedCount <= 0) continue;
      const solved = sport === 'run' ? volume.run : volume.ride;
      const askedHours = Number(
        sport === 'run' ? args.targetRunHours : (args.targetRideHours ?? args.targetWeeklyRideHours),
      );
      if (!Number.isFinite(askedHours) || !Number.isFinite(solved.expected)) continue;
      if (solved.verdict !== 'over_cap') continue;
      if (askedHours - solved.expected <= 0.25) continue;
      const noun = sport === 'run' ? 'run' : 'ride';
      notes.push({
        kind: 'warning',
        text: `You asked for ${sayHours(askedHours)} of ${sport === 'run' ? 'running' : 'riding'} `
          + `across ${statedCount} ${noun}${statedCount === 1 ? '' : 's'}. That many ${noun}s hold `
          + `${sayHours(solved.expected)}, so the week builds that. `
          + `Add a ${noun} day to fit the rest.`,
      });
    }
  }

  /**
   * ⛔⛔ AND THE SAME SENTENCE FOR THE OTHER DIRECTION (Michael, 2026-08-30). `sizeSolve` has always
   * returned `under_floor` and **its only reader was a comment** — so an athlete asking for FEWER
   * hours than the week's own sessions hold was bumped up to the floor with nothing said. Measured
   * at four hours of riding on p274's week, which builds 4h15.
   *
   * ⛔ IT IS THE OVER-ASK'S TWIN AND READS AS ONE FEATURE: same shape, same voice, both numbers
   * named. What it does NOT carry is the over-ask's closing advice — there is no day to add, because
   * the sessions themselves are the floor and the only way under it is a shorter programme.
   *
   * ⚠️ AND IT IS NOT GATED ON A STATED DAY COUNT, unlike the over-ask above. The over-ask only
   * happens when a day count caps the week; the under-ask happens whenever the hours land below what
   * the frame's own sessions hold, which needs no day count at all.
   * ⚠️ THE HOURS CONTROL STAYS UNFILTERED (Michael's own ruling, recorded on the dropdown): an ask
   * under the week's fixed sessions simply builds those sessions. This makes that honest; it does
   * not prevent the ask.
   */
  if (args.column === 'standard') {
    for (const sport of ['run', 'ride'] as const) {
      const solved = sport === 'run' ? volume.run : volume.ride;
      if (solved.verdict !== 'under_floor') continue;
      const askedHours = Number(
        sport === 'run' ? args.targetRunHours : (args.targetRideHours ?? args.targetWeeklyRideHours),
      );
      if (!Number.isFinite(askedHours) || !Number.isFinite(solved.expected)) continue;
      // ⚠️ THE SAME QUARTER-HOUR DEAD BAND THE OVER-ASK USES — a rounding-sized gap is not news.
      if (solved.expected - askedHours <= 0.25) continue;
      notes.push({
        kind: 'warning',
        text: `You asked for ${sayHours(askedHours)} of ${sport === 'run' ? 'running' : 'riding'}. `
          + `This week's ${sport === 'run' ? 'runs' : 'rides'} hold ${sayHours(solved.expected)}, `
          + `so the week builds that.`,
      });
    }
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
    /**
     * ⛔⛔ RULE 4, p142 — "Core Work Before Isolation Work (but After the Main Work)".
     *
     * > *"Many athletes are tempted to perform any core/bracing work last in a routine, typically
     * > hitting isolation/externally braced work (for example, machine work) after their main lift
     * > and throwing in core work at the end. This tends to do the core a disservice — isolation work
     * > is rarely degraded by a tired core, and core work tends to have a higher skill component than
     * > most isolation work."*
     *
     * ⛔ EVERY ADDED ROW WAS APPENDED, so a core row landed dead last — behind the calf raise, which
     * is the exact routine he describes. Seen on a composed week 2026-08-29: `back squat → trap bar
     * deadlift → bulgarian split squat → weighted single leg calf raise → v up`.
     *
     * ⚠️ CORE ONLY. His rule is about core, and the other floor muscles have no stated position — a
     * general re-order would be inventing an ordering he does not give.
     *
     * ⚠️ THE ANCHOR IS THE CATEGORY, ASKED OF THE GRID rather than parsed off the row. `source_row`
     * carries the frame's slot text and "focused" appears in it, but reading a category out of a
     * display string is how two vocabularies start disagreeing.
     */
    const existing = target.strength_exercises ?? [];
    const beforeIsolation = add.muscle === 'core'
      ? existing.findIndex((e) => viadaCategoryOf(String((e as { name?: string })?.name ?? '')) === 'focused')
      : -1;
    const at = beforeIsolation >= 0 ? beforeIsolation : existing.length;

    target.strength_exercises = [
      ...existing.slice(0, at),
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
        /**
         * ⛔ THE RESERVE IS STAMPED HERE TOO, AND ITS ABSENCE WAS VISIBLE ON A DEVICE
         * (Michael's screenshots, 2026-08-27). One session showed dumbbell bench at
         * *"target 6-12 · 1 in reserve"* — a slot row, stamped by `targetRirForIntent` off p218's
         * HYP band — and the ab wheel directly under it at *"target 8-10 · 2 in reserve"*. Two
         * accessories, one day, two different numbers, because these floor and dial rows carried
         * **no** `target_rir` at all and `materialize-plan`'s `getTargetRir` fell through to the
         * protocol's generic default chart. The plan was answering the same question twice from two
         * different places.
         *
         * ⛔ AND THE NUMBER IS HIS, FOR EXACTLY THIS ROW. p86 doses accessory work at
         * **3 x 8-10 at 1-2 RIR** — already the stated basis for the `8-10` on the line above, and
         * cited in `accessory-picks.ts`'s `DIAL_IS_OURS`. Taking the reserve from the same sentence
         * that gave the reps is the only reading that keeps the row internally consistent.
         *
         * ⚠️ 1.5 IS THE MIDPOINT OF HIS BAND, the same convention `targetRirForIntent` uses, and it
         * renders as *"1-2 in reserve"* rather than a fake half rep — `formatRirTarget` expands a
         * half-step back into the band it came from.
         *
         * ⚠️ A HOLD GETS NONE. There is no reserve in a plank; `repPrescribable` already decided
         * whether this row is dosed in reps or in seconds, and the reserve follows the reps.
         */
        ...(add.repPrescribable ? { target_rir: ACCESSORY_TARGET_RIR } : {}),
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
      ...existing.slice(at),
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

  /**
   * ⛔⛔ THE WEEK IS SCORED BY THE LAW, AT LAST (Q-288, 2026-08-26). Until now `compose.ts` built no
   * Units and called no resolver, so **no standing-plan week had ever been checked against p131's
   * keystone rule** — the rule existed in `week-model/model.ts`'s `COST` table the whole time and
   * nothing on this path asked it. Q-288 recorded it as a missing rule; it was a missing wire.
   *
   * ⛔ IT RUNS LAST, ON THE FINISHED WEEK. Every session is placed by now — the pinned ones, the
   * rotated ones, the relocated ones, the swim add-ons and the advanced tier — and a conflict
   * computed on a half-built week would describe an arrangement nobody trains.
   *
   * ⚠️ `kind: 'warning'`, WHICH IS WHAT PUTS IT ON THE SCREEN. `plan-row.ts` turns every warning
   * note into a `placement_compromises` entry, and that is the channel `NonRaceBuilder` already
   * renders. A cost the athlete pays and cannot see is not disclosed.
   * ⛔ AND IT NEVER REFUSES — D-452, warn never block. Michael, 2026-08-26: *"we will not stop them
   * but they should know the cost."*
   */
  /**
   * ⛔⛔ THE VOLUME SENTENCES ARE SILENCED (Michael, 2026-08-26, hours after they shipped).
   *
   * They said the week had a CEILING — *"these picks hold up to about 4h35 a week, and the week is
   * built at that ceiling"* — and **that is not the model.** His ruling: *"your hard ride caps at…
   * your long ride caps at… any additional hour will be programmed easy."* The QUALITY sessions are
   * band-capped; the base is not, and surplus volume becomes easy work rather than being refused.
   * A ceiling sentence over a plan with no ceiling is a false statement about the plan, and the
   * standing rule is silence over bad copy.
   *
   * ⚠️ THE SIZING UNDERNEATH STAYS AND IS STILL CORRECT — a target inside the bands still shrinks
   * the week toward it (his 4h ride ask, which used to build 5h19). What is temporarily missing is
   * the case ABOVE the bands, where the surplus should become easy sessions and currently just
   * clamps. ⛔ `volume.run` / `volume.ride` still carry the verdict, so nothing downstream lost the
   * fact — only the sentence is gone.
   *
   * ⛔ `capLine` and `volumeLine` ARE now deleted — `fixedHoursLine` replaced them, so keeping a
   * silenced sentence "in case" would just be dead copy.
   */

  /**
   * ⛔⛔ A DOUBLE DAY IS LEGAL AND SAYS ITS SPACING (Michael, 2026-08-26). The book sanctions the
   * two-a-day rather than merely tolerating it:
   *
   *   · B3: *"6-8h between two-a-days (4-6h if the morning is a sub-hour VT1 session)."*
   *   · Rule 5: *"work that benefits from pre-fatigue goes last — almost always VT1-intensity
   *     endurance… you could cut your VT1 run volume by a third or so after a hard leg workout and
   *     get the same overall adaptations."*
   *
   * ⛔ READ OFF THE FINISHED WEEK, NOT OFF THE FILL LOOP. A first draft only noticed doubles a FILL
   * created and went silent on the ones the relocator made moving the frame's OWN sessions off a
   * blocked day — which is most of them. Whatever put two sessions of one sport on a day, the
   * athlete needs the same sentence.
   * ⛔ AND THE SENTENCE IS THE SPACING, because that is the only part the calendar cannot show. Two
   * sessions on one day are visible on the grid; the hours between them are the condition that
   * makes it safe, and a two-a-day without them is the prescription minus its condition.
   * ⚠️ DAY-AGNOSTIC — this screen runs before the scheduler, so a weekday would be a promise the
   * next screen breaks.
   * ⚠️ THE CITE NAMES BOTH PLACES BECAUSE THEY DIFFER IN STANDING. B3's bullet carries only its
   * chapter (pp.69-125, no page photographed); rule 6 gives the same two figures on a page that WAS
   * read, in the context of a session before resistance work. Naming one alone would overstate it.
   */
  for (const sport of ['run', 'ride'] as const) {
    const perDay = new Map<string, number>();
    for (const x of sessions.filter((y) => y.type === sport)) {
      perDay.set(x.day, (perDay.get(x.day) ?? 0) + 1);
    }
    if (![...perDay.values()].some((n) => n > 1)) continue;
    const text = `Two ${sport === 'run' ? 'runs' : 'rides'} land on one day. The source leaves six to `
      + 'eight hours between them, or four to six when the first is under an hour.';
    if (!notes.some((n) => n.text === text)) {
      notes.push({ kind: 'warning', text, cite: 'Viada pp.69-125, p139-145' });
    }
  }

  const conflicts = weekConflicts({
    sessions,
    frame: args.frame,
    column: args.column,
    dayOffset: args.dayOffset ?? 0,
  });
  for (const c of conflicts) {
    if (!notes.some((n) => n.text === c.text)) {
      notes.push({ kind: 'warning', text: c.text, cite: 'Viada p130, p131' });
    }
  }

  return {
    frame: args.frame, week: args.week, column: args.column, isTestWeek: testWeek,
    sessions, ledger, meRows, notes, conflicts, volume,
    // ⛔ p146's BUCKETS 1-3, counted off the sessions as the library built them. See
    // `endurance-ledger.ts` — nothing surfaces it, and it asks the athlete nothing.
    enduranceLedger: enduranceLedgerFor(builtEndurance),
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
