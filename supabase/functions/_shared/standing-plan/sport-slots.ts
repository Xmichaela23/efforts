// ============================================================================
// SPORT-SLOT ASSIGNMENT — the frame's endurance slots stop being run-only.
//
// ⛔ THE SLOTS ARE SESSION TYPES; THE SPORT IS ASSIGNED (pivot §2). His permission is p275 — any
// power-metered non-impact modality, and the long run may be a ride. ⚠️ **Applying that across
// programs is OUR TRANSFER**, and so is the family-to-family equivalence below; the corpus contains
// no such table anywhere.
//
// ⛔ THE PROGRAM OWNS THE SESSION COUNT. The athlete's "three runs, two rides" is a MIX, not a count:
// it sets the ratio, and the frame's own slot count is untouched. Reading those numbers as counts is
// the ask-15-get-20 defect this whole work order exists to kill.
//
// ⛔ AND THE HARD SESSIONS ARE PLACED, NEVER ASKED (pivot §2, his p280 reasoning): with strength
// leading, intensity goes on the bike when a bike is in the mix, because no impact means it does not
// tax the lifts. A held sport keeps its LONG session and loses its hard one.
// ============================================================================

import { FAMILIES } from '../endurance-library/index.ts';
import type { FamilyId, Level } from '../endurance-library/index.ts';
import { clampRideLevel } from './frames.ts';
import type { EnduranceSlot, FrameDay } from './frames.ts';

export type SportMix = {
  /** Runs a week the athlete asked for. */
  runs?: number | null;
  /** Rides a week they asked for. */
  rides?: number | null;
  /** ⛔ OFF BY DEFAULT (Michael, 2026-08-23). Kept means easy laps and technique, and nothing else. */
  swimDays?: number | null;
  /**
   * ⛔⛔ THE ATHLETE'S OWN PER-SLOT ANSWER, WHEN A SCREEN HAS ASKED FOR ONE (stage 5, 2026-08-24).
   *
   * ⚠️ **THIS EXISTS BECAUSE THE WIZARD'S AGREEMENT TEST FOUND THE SCREEN LYING.** The endurance-week
   * screen offers a sport per slot — Hard 1, Hard 2, Easy, Long — and until now only the COUNTS
   * reached here, so the assigner re-derived which slots were which from its own rule. An athlete
   * choosing *"Hard 1 = Run, Long = Ride"* got *"Hard 1 = Ride, Long = Run"*: the same two-and-two
   * mix, a different week, and nothing said. That is the ask-15-get-20 defect with new clothes on.
   *
   * ⛔ IT IS AN OVERRIDE, NOT A REPLACEMENT. Absent — every caller before this screen existed — the
   * dial assigns exactly as it did: hard slots to the bike, the long session kept by the runner.
   * Pivot §2's *"placed by the dial, never asked"* is what the SCREEN'S PRE-FILL implements; this is
   * the athlete overriding that default, which his own brief asks for.
   *
   * ⚠️ KEYED `${frameDay}:${indexWithinDay}` — the same key `byKey` uses, so a caller cannot supply
   * an answer for a slot the column does not have.
   *
   * ⛔⛔ `'none'` MEANS THE ATHLETE DECLINED A HARD SESSION (Michael's ruling, 2026-08-25: hard
   * sessions are opt-in, up to two, and the default is ZERO). It is a THIRD state and it is not the
   * same as omitting the key:
   *
   *   - **key absent** — nobody asked. Every caller before the endurance screen existed. The slot
   *     keeps the frame's own run, exactly as it always did.
   *   - **`'none'`** — the screen asked and the athlete added no hard session there. The slot
   *     CONVERTS to the frame's easy session (see `declineHardSlot`).
   *
   * ⚠️ THE DISTINCTION IS LOAD-BEARING. Collapsing them would silently strip the intensity out of
   * every plan built by a generator that never had this screen.
   */
  slots?: Record<string, 'run' | 'ride' | 'none'> | null;
  /**
   * ⛔ THE WITHIN-FAMILY VARIANT PICKS (Michael, 2026-08-24 — "the speed drills"). Keyed like
   * `slots`; values are the library's archetype ids. A pick that is not one of the ASSIGNED
   * family's own archetypes is ignored — the athlete chooses among the family's page-cited
   * workouts, never past them. Absent = the engine's rotation.
   */
  archetypes?: Record<string, string> | null;
};

export type AssignedSlot = {
  /** The family actually built — the frame's own, or its cross-sport equivalent. */
  family: FamilyId;
  level: Level;
  archetype?: string;
  raceTempo?: boolean;
  sport: 'run' | 'ride' | 'swim';
  /** ⛔ TRUE WHEN THE SPORT WAS SUBSTITUTED. Carried so a note can say so and a test can see it. */
  substituted: boolean;
  /**
   * ⛔⛔ THE FRAME'S OWN MARKER, CARRIED THROUGH THE ASSIGNMENT (2026-08-30). `EnduranceSlot.role`
   * existed and every reader downstream of `assignSports` lost it here, so a frame that stated its
   * roles was still classified by family name once the week had been assigned — the exact silence
   * the field was added to end.
   *
   * ⚠️ IT IS THE **ASSIGNED** SESSION'S ROLE, NOT ALWAYS THE FRAME SLOT'S. A modality swap keeps it
   * (a hard run moved to the bike is still the week's hard session); a DECLINED hard slot takes the
   * easy slot's role, because the week has genuinely converted it to easy work.
   */
  role?: 'hard' | 'long' | 'easy';
  /** The frame slot this came from, verbatim, so a reader can find the row on the page. */
  sourceText: string;
};

// ── THE EQUIVALENCE, MATCHED ON THE STATED WORK FLOOR ────────────────────────────────────────────

/**
 * ⛔ MATCHED ON `workFloorPct`, WHICH EVERY FAMILY IN `source-rules.ts` STATES FOR ITSELF. That makes
 * the substitution a lookup rather than a judgement:
 *
 *     run_mlss            1.00   →  ride_sweet_spot / medium   work at 0.95-1.00
 *     run_near_threshold  0.85   →  ride_sweet_spot / long     work at 0.90
 *     run_vt1             0      →  ride_endurance / steady    below 0.75
 *     run_lsd             0      →  ride_endurance / steady    below 0.75
 *
 * ⛔⛔ `ride_vo2` IS NOT THE ANSWER FOR THE HARD SLOT, AND THIS IS THE TRAP. Its floor is **1.10** —
 * ABOVE the run slot it would replace. Substituting it would add intensity while claiming to convert,
 * which is the one thing pivot §2 forbids. Sweet spot's own stated intent is *"as close to threshold
 * as possible without exceeding it"* (pp238-239), which is exactly what an MLSS slot asks for.
 *
 * ⚠️ **THE TABLE IS OURS.** p275 permits the modality swap and says the long ride may stand in for the
 * long run; it gives no family-to-family mapping, and neither does anything else in the corpus.
 */
export const RIDE_EQUIVALENT: Partial<Record<FamilyId, { family: FamilyId; archetype: string }>> = {
  /**
   * ⛔⛔ THE HARD RIDE IS HIS LONGEST PRINTED SWEET-SPOT SESSION — 3 rounds of 20 min @ 80%, p238-239
   * (Michael, 2026-08-27), which builds to about 68 minutes at level 1 and 75 at level 2.
   *
   * ⛔ WHY IT MOVED OFF `medium`. That shape gave 43 minutes at level 1 and 51 at level 2 — an
   * eight-minute gap between the two experience answers, which is not a choice worth a control. The
   * cause is not the tier: a quality rung is a fixed dose at the middle of its band (`ladderOf`) and
   * his two cycling levels' middles sit close together on that shape. The longest shape ladders.
   * ⚠️ AND IT IS HIS SESSION, NOT OUR ARITHMETIC. A 1.5x run-to-ride ratio was proposed for the same
   * numbers and WITHDRAWN — it was ours. Both figures here are sessions he prints.
   * ⚠️ LEVEL 3 IS UNREACHABLE ANYWAY — see `clampRideLevel`. So this shape's 83-minute level 3 never
   * arrives, and the pair is 68 / 75.
   *
   * ⛔⛔ SEVEN MINUTES BETWEEN THE TWO EXPERIENCE ANSWERS IS NOT A WEAK LADDER — IT IS HIS OWN SPAN,
   * AND THIS NOTE EXISTS SO IT IS NOT "FIXED" (Michael, 2026-08-27).
   *
   * p278, Cycling Base, standard week, day 1: `Cyc sweet spot (level 1-2)`. **That is the only cell
   * in the captured corpus where he prescribes a SPAN of levels rather than one level.** Every other
   * cell in every program table names a single level. On this session — the hard ride on day 1,
   * which is exactly the slot the placement rule now puts it on — he deliberately leaves the choice
   * between level 1 and level 2 to the rider. The two chips ARE his "level 1-2", spelled out.
   *
   * ⛔ SO THERE IS NOTHING TO WIDEN AT EITHER END. Level 1 is the floor of his span, and p280 is a
   * reason to KEEP it rather than raise it: cycling *"may allow for fatigue accumulation that is not
   * 'felt'"*, so the smaller dose has to stay available to a rider carrying more than they can
   * sense. Level 2 is the top of his span and also `clampRideLevel`'s ceiling; the two agree.
   * ⚠️ EVERY WIDER GAP WAS FLOATED ON 2026-08-27 AND WITHDRAWN — a run-to-ride ratio, a different
   * position in the band, the top of the band instead of its middle. The gap is seven minutes
   * because his span is seven minutes wide.
   */
  /**
   * ⛔⛔ THE BIKE'S SECOND QUALITY SESSION IS ANAEROBIC, NOT A SECOND SWEET SPOT (2026-08-30).
   *
   * ⛔ THE DEFECT IT FIXES, measured on materialized rows at FTP 220: a week with both hard slots on
   * the bike built 198 W and 198 W — 90% FTP twice — plus two 154 W steady rides. **Two subthreshold
   * sessions and no quality above them**, for the whole block. p109's floor asks for ONE speed
   * session, ONE subthreshold session, remainder at or below VT1. Mapping both run quality slots to
   * `ride_sweet_spot` collapsed them into one family and the speed session was lost in the mapping.
   *
   * ⛔ AND IT IS HIS OWN WEEK, NOT AN ESCALATION WE INVENTED. The All Rounder (p274, transcribed and
   * verified against the page image) puts `Cyc AnA (level 1)` on day 2, beside MLSS+ on day 1 and NT
   * on day 3. When the source puts a second quality session into a week containing cycling, it is
   * anaerobic. ⚠️ This does NOT reopen the VO2 question — the objection to `ride_vo2` in this file
   * stands, and `long_vo2` / `short_vo2` are deliberately not the archetype chosen below.
   *
   * ⚠️ WHY `run_mlss` AND NOT `run_near_threshold` — DECIDED ON THE FLOORS, not by eye:
   *     run_mlss           workFloorPct 1.0   "Above threshold"   → ride_anaerobic  floor 1.0
   *     run_near_threshold workFloorPct 0.85  "Near-threshold"    → ride_sweet_spot floor 0.80
   * The floors match across the swap, so each slot keeps the intensity it had on the run side and the
   * subthreshold slot is untouched.
   *
   * ⚠️ `progressive_repeats` IS p237'S OWN FIRST LEVEL-1 OPTION — *"6-10 x 45s @ 110-115%+ with 4-6
   * min recovery between sets, each set starting at 110% and progressing to 125-130%"* — and the
   * archetype's stated recovery band (240-360s) is that sentence. p237 also warns the session is
   * *"best done by feel with a power FLOOR rather than a specific power target — the numbers are
   * guidelines"*, which is a display question for the row, not a reason to pick a softer family.
   *
   * ⚠️ THE LEVEL IS NOT SET HERE. The slot carries the frame's own level and `clampRideLevel` caps
   * every ride family at 2 (`RIDE_LEVEL_CEILING`), so this cannot climb past what p238-239 print.
   */
  run_mlss: { family: 'ride_anaerobic', archetype: 'progressive_repeats' },
  run_near_threshold: { family: 'ride_sweet_spot', archetype: 'long' },
  run_vt1: { family: 'ride_endurance', archetype: 'steady' },
  run_lsd: { family: 'ride_endurance', archetype: 'steady' },
};

/**
 * ⛔⛔ THE SENTENCE COUNTS THE WEEK IT IS DESCRIBING (fixed 2026-08-26). It read *"The hard sessions
 * are on the bike"* and fired whenever ANY slot was substituted — so a week with one hard run and
 * one hard ride said both were on the bike. Michael read it on his own export beside a Monday hard
 * run. Same disease as `describeBlock`'s "four runs": inherited copy asserting a fact the build
 * disproves, and the true numbers were already in hand.
 *
 * ⚠️ THE CLAIM IS UNCHANGED AND IS STILL THE REASON THE DIAL PUTS INTENSITY ON THE BIKE — only its
 * SUBJECT is corrected to however many hard sessions actually ended up there.
 *
 * ⛔⛔ THE CITE IS UNVERIFIED AND SAYS SO. p280 is **not transcribed in
 * `docs/SOURCE-viada-hybrid-athlete.md`** — it appears only in the program index, as the notes page
 * for the three cycling programs. The claim may well be his; nobody has read the page. Michael's
 * ruling (2026-08-26): do not delete the claim, mark the cite so nobody later reads it as
 * page-backed. ⛔ If p280 is ever photographed, this is the line to come back to.
 */
export const HARD_ON_BIKE_CITE = 'Viada p280 — UNVERIFIED, page not transcribed in the corpus';

export function hardOnBikeNote(hardRides: number, hardRuns: number): string | null {
  if (hardRides <= 0) return null;
  // ⚠️ NAMED BY COUNT, and the mixed case is its own sentence rather than a hedge on the plural.
  const subject = hardRuns > 0
    ? (hardRides === 1 ? 'One of the hard sessions is on the bike' : `${hardRides} of the hard sessions are on the bike`)
    : (hardRides === 1 ? 'The hard session is on the bike' : 'The hard sessions are on the bike');
  return `${subject}. Riding hard does not land on the legs the way running does, so the intensity `
    + 'costs the lifting less.';
}

export const RIDE_EQUIVALENCE_IS_OURS =
  'Matching each run slot to the ride family whose stated work floor is closest to its own is ours. '
  + 'The source permits swapping to any power-metered non-impact modality and says the long ride can '
  + 'stand in for the long run (p275); it gives no table of which ride session replaces which run.';

/**
 * ⛔ THE SWIM IS ONE SESSION AND ONE LEVEL (Michael, 2026-08-23): easy laps and technique only.
 *
 * `swim_endurance` at level 1 is that session and the library already says so — *"Level 1 sessions
 * are simple and non-fatiguing"*, and its archetype is literally *"Drill opener into long repeats"*,
 * so the technique work is already in it. ⛔ `swim_speed` is all-out and `swim_open_water` is a
 * sighting skill; **neither is ever reachable from this plan** and a lint holds that.
 */
export const SWIM_SLOT: { family: FamilyId; level: Level } = { family: 'swim_endurance', level: 1 };
export const SWIM_IS_EASY_ONLY =
  'A kept swim is easy laps and technique. The hard swim sessions in the source — the all-out speed '
  + 'sets and the open-water sighting work — are never prescribed by this plan.';

// ── HOW HARD IS A SLOT ───────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE FRAME'S OWN ORDER OF INTENSITY, read off the families it uses rather than restated. Higher
 * is harder. The hard slots are the ones the dial moves to the bike; the long slot is the one a held
 * sport keeps.
 */
/**
 * ⛔⛔ EVERY FAMILY, NOT JUST THE RUN ONES (2026-08-30, for the All Rounder).
 *
 * ⛔ WHY IT HAD TO WIDEN. This table listed run families alone, and that was correct while every
 * frame slot WAS a run family — `strength_5k` is transcribed run-only and `RIDE_EQUIVALENT` converts
 * afterwards, so a ride only ever existed downstream of a run slot that had already been classified.
 * **The All Rounder prescribes cycling NATIVELY** — p274 puts `Cyc AnA (level 1)` on day 2 and
 * `Cyc endurance (level 1)` on day 4 — so its ride slots arrive here unconverted and a run-only
 * table returns `undefined` for them: not hard, not long, not easy. Invisible.
 *
 * ⚠️ AND INVISIBLE IS SILENT. A slot with no role gets no pin, no anchor placement, no interference
 * check against the leg days, and nothing for the experience chips to size. It does not throw; the
 * week just quietly comes out wrong. **Same class as the `HARD_FAMILIES` defect fixed earlier today,
 * where the hardest session in a rider's week did not count as hard.**
 *
 * ⚠️ THE RIDE NUMBERS MIRROR THE RUN ONES BY INTENSITY, and that ordering is OURS — the corpus
 * ranks no family against another. `ride_anaerobic` (110-125%, p237) sits where `run_mlss` does
 * (above threshold, p231); `ride_sweet_spot` (80-95%, p238-239) where `run_near_threshold` does;
 * `ride_endurance` (below 75%, p239) where `run_vt1` does. It is a ranking for placement, not a
 * claim about training equivalence.
 * ⚠️ `ride_sprints` / `ride_vo2` ARE DELIBERATELY ABSENT. No frame prescribes them, and a family
 * with no role is the honest answer for a session this plan never builds — see `isHardSlot`.
 */
const HARDNESS: Partial<Record<FamilyId, number>> = {
  run_mlss: 4,
  run_near_threshold: 3,
  run_vt1: 1,
  run_lsd: 2,
  ride_anaerobic: 4,
  ride_sweet_spot: 3,
  ride_endurance: 1,
};

/**
 * ⛔ THE LONG SLOT — the frame's longest session, whatever sport prescribes it.
 *
 * ⚠️ IT IS NOT A FAMILY TEST ANY MORE. `family === 'run_lsd'` was right while the long slot was
 * always an LSD run that a ride might later replace. The All Rounder's day 6 is still LSD, but a
 * frame whose long session is prescribed as a ride would have had no long slot at all — no long-day
 * pin, and `sport-slots.ts`'s own "a held sport keeps its long session" rule reduced to a no-op.
 * ⛔ THE MARKER IS THE SLOT'S, when it carries one — `EnduranceSlot.role` — so a frame states which
 * session is its long one rather than the reader inferring it from a family name. Absent, the
 * family test stands exactly as before, which is every caller that predates this.
 */
export function isLongSlot(slot: { family: FamilyId; role?: string | null }): boolean {
  if (slot.role) return slot.role === 'long';
  return slot.family === 'run_lsd';
}

/**
 * ⛔⛔ A DECLINED HARD SLOT BECOMES THE FRAME'S EASY SESSION — CONVERT, NEVER ADD (Michael, 2026-08-25).
 *
 * Hard sessions are opt-in, up to two, default ZERO. An athlete who adds none still trains four
 * sessions: *"Your miles and hours default to easy pace and recovery if none is picked."* So the
 * slot is REPLACED, never removed — the week's session count is the frame's and nothing here moves
 * it. That is pivot §2's rule and the same shape the taper column already uses, which holds its own
 * count and drops the LEVEL rather than deleting a day.
 *
 * ⛔⛔ THE TARGET IS THE COLUMN'S OWN EASY SLOT, PASSED IN — NOT A LITERAL. A first draft wrote
 * `{ family: 'run_vt1', level: 1, archetype: 'steady' }` by hand and the composer threw
 * **"archetype steady is not offered for run_vt1 at level 1"**: the family and level were right and
 * the archetype was invented. ⚠️ The library owns which archetypes a family offers at a level, and
 * a hand-written triple here is a second statement of the frame that is wrong the moment it drifts.
 * `assignSports` reads the easy slot out of the very column it is assigning and hands it over.
 *
 * ⚠️ NOT THE TAPER'S SUBSTITUTION TARGET. The taper holds the hard family at level 1, which is right
 * for a deload week and wrong here — an athlete who declined intensity is not asking for a quieter
 * version of it, they are asking for easy running.
 *
 * ⚠️ THE CONVERTED SLOT TAKES THE SPORT OF THE EASY SLOT the athlete DID answer, where they answered
 * one — it has become an easy session, and it reading "Run" beside their "Easy · Ride" would be the
 * screen and the week disagreeing again.
 */
export function declineHardSlot(
  slot: EnduranceSlot,
  easySport: 'run' | 'ride' | null,
  /** ⛔ THE COLUMN'S OWN EASY SLOT. Required — there is no honest default for it here. */
  easySlot: EnduranceSlot,
): AssignedSlot {
  if (easySport === 'ride') {
    const eq = RIDE_EQUIVALENT[easySlot.family];
    if (eq) {
      return {
        family: eq.family, level: easySlot.level, archetype: eq.archetype, raceTempo: false,
        sport: 'ride', substituted: true, sourceText: slot.sourceText,
        // ⛔ THE EASY SLOT'S ROLE, NOT THE DECLINED ONE'S — this session IS the easy slot now.
        role: easySlot.role,
      };
    }
  }
  return {
    family: easySlot.family, level: easySlot.level, archetype: easySlot.archetype, raceTempo: false,
    sport: 'run', substituted: true, sourceText: slot.sourceText,
    // ⛔ THE EASY SLOT'S ROLE — see the ride branch above.
    role: easySlot.role,
  };
}

export const HARD_SESSIONS_ARE_OPT_IN =
  'Hard sessions are added, up to two. A week with none still carries its four sessions — the hard '
  + 'ones become easy running instead, so the miles and hours you set are unchanged.';

/** ⛔ A HARD SLOT — at or above near-threshold. These are the two the dial places. */
export function isHardSlot(slot: { family: FamilyId; role?: string | null }): boolean {
  // ⛔ THE SLOT'S OWN MARKER WINS — see `isLongSlot`. Absent, the intensity table decides, and a
  // family the table does not rank is NOT hard: the honest answer for a session no frame builds.
  if (slot.role) return slot.role === 'hard';
  return (HARDNESS[slot.family] ?? 0) >= 3;
}

// ── THE ASSIGNMENT ───────────────────────────────────────────────────────────────────────────────

export type SlotAssignment = {
  /** Keyed `${frameDay}:${indexWithinDay}`. */
  byKey: Record<string, AssignedSlot>;
  counts: { run: number; ride: number; swim: number };
  /**
   * ⛔ THE HAIRCUT'S CAUSE IS NOT ANSWERED HERE ANY MORE (2026-08-26). This carried
   * `hardRunBeforeMeLower`, read off the FRAME's day-1 slot — and p247's subject is an ADJACENCY
   * ("Monday's run… an ME lower session the next day"), which no function that has never seen a
   * weekday can answer. `endurancePins` can put that run anywhere in the week, so the field was
   * true of blocks with no run in front of the leg day and false of blocks with one. `compose.ts`
   * owns it now, off the placed calendar. ⛔ Do not reinstate a frame-level answer here.
   */
  notes: { kind: 'source' | 'ours' | 'warning'; text: string; cite?: string }[];
};

const key = (day: number, i: number) => `${day}:${i}`;

/**
 * ⛔⛔ THE ATHLETE'S VARIANT PICKS, AND THE RULE THAT NO WEEK BUILDS ONE SHAPE TWICE.
 *
 * ⛔⛔ IT IS A FUNCTION BECAUSE `assignSports` HAS TWO EXITS AND THIS RAN ON ONLY ONE OF THEM
 * (found 2026-08-26). The `mix.slots` branch — the one the wizard ALWAYS takes, because the
 * endurance screen answers every slot's sport — returns before the bottom of the function, so
 * **every within-family variant the athlete picked was silently dropped on the live path.** The
 * card offered Over-unders or Cut-downs, the athlete tapped one, and the week built the engine's
 * rotation regardless. Two exits, one rule, applied once: that is what this shape prevents.
 *
 * ⚠️ MUTATES `byKey` IN PLACE, deliberately — both callers own it and neither wants a copy.
 */
function applyVariantPicks(
  byKey: Record<string, AssignedSlot>,
  slots: { day: number; i: number; slot: EnduranceSlot }[],
  mix: SportMix,
): void {
  // ── the athlete's variant picks, validated against the assigned family ───────────────────────
  /** ⛔ WHICH SLOTS THE ATHLETE ANSWERED. A pick is never moved by the de-collision below. */
  const picked = new Set<string>();
  for (const [k, want] of Object.entries(mix.archetypes ?? {})) {
    const assigned = byKey[k];
    if (!assigned || typeof want !== 'string' || !want) continue;
    const fam = FAMILIES[assigned.family];
    if (fam?.archetypes.some((a) => a.id === want)) {
      byKey[k] = { ...assigned, archetype: want };
      picked.add(k);
    }
  }

  /**
   * ⛔⛔ NO WEEK BUILDS THE SAME SHAPE TWICE (Michael, 2026-08-26): *"the two hard-session cards must
   * not build the same shape twice."* The card greys out a shape the other card holds; this is the
   * same rule on the engine, and it is not a duplicate of that — a payload can arrive from a client
   * that never greyed anything, and the built week is what the athlete trains.
   *
   * ⛔⛔ AND THE CASE THAT NEEDED IT MOST IS THE ONE THE GREYING CANNOT REACH: the athlete picks a
   * shape on one card and leaves the other on "engine's pick". On the BIKE both hard slots resolve
   * to `ride_sweet_spot`, and an unanswered slot is not left blank — `RIDE_EQUIVALENT` stamps it
   * `medium` (frame day 1) or `long` (day 3). So picking `long` on card one and leaving card two
   * alone produced two identical sweet-spot sessions, and nothing in the week said so.
   *
   * ⚠️ THE ATHLETE'S PICK NEVER MOVES — pins-win (D-452). Only a slot they did not answer is
   * re-pointed, and it takes the first shape its own family offers that nothing else in the week
   * holds. ⚠️ TWO EXPLICIT PICKS OF THE SAME SHAPE ARE LEFT ALONE: both are answers, and overriding
   * one would be the engine unpicking a choice. The card is what stops that arising.
   * ⚠️ FAMILY-LOCAL. Two slots in DIFFERENT families sharing an archetype id is not a collision —
   * they build different sessions — so the comparison is keyed on family and id together, and on
   * the run (two different families) this whole block is a no-op.
   */
  {
    const heldByFamily = new Map<string, Set<string>>();
    const hold = (family: string, id: string) => {
      const set = heldByFamily.get(family) ?? new Set<string>();
      set.add(id);
      heldByFamily.set(family, set);
    };
    // ⚠️ THE ATHLETE'S ANSWERS ARE RESERVED FIRST, in one pass, so a pick always beats a default
    // whatever order the slots come in.
    for (const k of picked) {
      const a = byKey[k];
      if (a?.archetype) hold(a.family, a.archetype);
    }
    for (const { day, i } of slots) {
      const k = key(day, i);
      if (picked.has(k)) continue;
      const a = byKey[k];
      if (!a?.archetype) continue;
      const held = heldByFamily.get(a.family);
      if (!held?.has(a.archetype)) { hold(a.family, a.archetype); continue; }
      const free = (FAMILIES[a.family]?.archetypes ?? [])
        .filter((x) => !x.levels || x.levels.includes(a.level))
        .find((x) => !held.has(x.id));
      // ⚠️ NOWHERE TO MOVE — a family with one usable shape keeps it rather than being emptied.
      // The week then genuinely has two of it, and that is the library's ceiling, not a defect here.
      if (!free) continue;
      byKey[k] = { ...a, archetype: free.id };
      hold(a.family, free.id);
    }
  }

}

/**
 * ⛔ ASSIGN A SPORT TO EVERY ENDURANCE SLOT IN THE COLUMN.
 *
 * The order is the ruling's, not an optimisation:
 *
 *  1. **A kept swim takes ONE easy slot** — the least hard one that is not the long session. Easy
 *     laps replace an easy run; they never replace intensity and never replace the long day.
 *  2. **Rides take the HARD slots first** (pivot §2, his p280: no impact, so intensity there does not
 *     tax the lifts). ⛔ This is placed by the dial and is never asked.
 *  3. **The long slot stays with the running athlete** — *"a sport that is held keeps its LONG
 *     session and loses its hard one."* ⚠️ It becomes a ride only when there is no running in the
 *     mix at all, which is p275's own permission for the long ride.
 *  4. Whatever is left takes the athlete's remaining share.
 *
 * ⛔ THE SLOT COUNT NEVER MOVES. `runs` and `rides` set a ratio against the frame's own count.
 */
/**
 * ⛔⛔ ONE HARD RUN AND ONE HARD RIDE LAND IN A FIXED PLACE, WHATEVER ORDER THEY WERE ANSWERED IN
 * (Michael, 2026-08-27): *"follow his rules."* The picker's order must not decide the week.
 *
 *   HARD RIDE → hard slot 1, his day 1.   HARD RUN → hard slot 2, his day 3.
 *
 * ⛔ BOTH HALVES ARE SOURCED, and together they give each sport the dose its own page prescribes:
 * p278's Cycling Base puts `Cyc sweet spot (level 1-2)` on DAY 1 — day 1 is where he places the hard
 * ride, and level 2 is its ceiling (`clampRideLevel`). p246's Strength + 5K puts `NT (level 3)` on
 * DAY 3, and p247 calls it *"the hardest session of the week"*; that session is a RUN in his program
 * and it stays a run at level 3.
 *
 * ⛔ WHAT THE OTHER ARRANGEMENT COSTS, recorded so it is not re-proposed. Ride on day 3 and run on
 * day 1 caps the ride at level 2 on the hardest day AND drops the run to day 1's easier dose — so
 * the athlete's running never gets its quality session at all.
 *
 * ⚠️ ONE RULE FOR ONE CASE, AND IT MUST NOT GROW INTO A PLACEMENT ENGINE (Michael: *"I'll worry
 * about those nuances later"*). Two hard runs, two hard rides, and the easy and long slots are
 * untouched — this fires only on the exact one-of-each pair, and only to swap it into his order.
 * ⚠️ NOT p247's CROSS-TRAINING ESCAPE HATCH, which permits converting the day 3 run for *"larger
 * athletes who experience more wear and tear from running."* That is a different athlete and a
 * different control; nothing here removes it.
 */
export const HARD_PAIR_ORDER_IS_HIS =
  'A hard ride takes his day 1 and a hard run takes his day 3, whichever way round they were '
  + 'picked. p278 places the hard ride on day 1 of his cycling week; p246 places the near-threshold '
  + 'run on day 3 and p247 calls it the hardest session of the week.';

/** The frame keys of the two hard slots — `${frameDay}:${indexWithinDay}`, same as `mix.slots`. */
export const HARD_SLOT_FRAME_KEYS = { hard1: '1:0', hard2: '3:0' } as const;

/**
 * The two hard answers in his order. ⚠️ TOTAL AND IDEMPOTENT — every other pair, and any pair with
 * an unanswered or declined half, comes back exactly as it went in.
 */
export function hardPairInFrameOrder<T extends string>(
  hard1: T | undefined, hard2: T | undefined,
): { hard1: T | undefined; hard2: T | undefined } {
  if (hard1 === 'run' && hard2 === 'ride') {
    return { hard1: hard2, hard2: hard1 };
  }
  return { hard1, hard2 };
}

/** The athlete's per-slot answers with the one-of-each pair put in his order. */
export function hardSlotsInFrameOrder(
  slots: Record<string, string> | null | undefined,
): Record<string, string> | null | undefined {
  if (!slots) return slots;
  const a = slots[HARD_SLOT_FRAME_KEYS.hard1];
  const b = slots[HARD_SLOT_FRAME_KEYS.hard2];
  const put = hardPairInFrameOrder(a, b);
  if (put.hard1 === a && put.hard2 === b) return slots;
  return {
    ...slots,
    [HARD_SLOT_FRAME_KEYS.hard1]: put.hard1 as string,
    [HARD_SLOT_FRAME_KEYS.hard2]: put.hard2 as string,
  };
}

export function assignSports(days: FrameDay[], mix: SportMix): SlotAssignment {
  const runs = Math.max(0, Math.round(Number(mix.runs) || 0));
  const rides = Math.max(0, Math.round(Number(mix.rides) || 0));
  const swimKept = Math.max(0, Math.round(Number(mix.swimDays) || 0)) > 0;

  const slots: { day: number; i: number; slot: EnduranceSlot }[] = [];
  for (const d of days) {
    d.endurance.forEach((slot, i) => slots.push({ day: d.day, i, slot }));
  }

  const byKey: Record<string, AssignedSlot> = {};
  const notes: SlotAssignment['notes'] = [];
  const asRun = (s: EnduranceSlot): AssignedSlot => ({
    family: s.family, level: s.level, archetype: s.archetype, raceTempo: s.raceTempo,
    sport: 'run', substituted: false, sourceText: s.sourceText, role: s.role,
  });
  for (const { day, i, slot } of slots) byKey[key(day, i)] = asRun(slot);

  const total = slots.length;
  if (total === 0) {
    return { byKey, counts: { run: 0, ride: 0, swim: 0 }, notes };
  }

  // ── 1. SWIM NEVER TAKES A SLOT — RULED 2026-08-24 (Michael), superseding slice 4's easy-slot
  //      substitution: "Add easy swims … Doesn't take a session spot, costs your lifting nothing."
  //      Swims are an ADD-ON, appended by the composer OUTSIDE the four slots (`swimEasySessions`).
  //      `swimKept` no longer moves any slot; it is read only so an old goal shape stays harmless.
  void swimKept;

  // ── 2-4. the run/ride split over the slots ────────────────────────────────────────────────────
  const open = slots;

  /**
   * ⛔ AN EXPLICIT PER-SLOT ANSWER WINS OVER THE RATIO, AND SHORT-CIRCUITS THE DIAL ENTIRELY.
   * See `SportMix.slots`. ⚠️ A slot the caller did not name keeps the frame's own run.
   */
  if (mix.slots && Object.keys(mix.slots).length > 0) {
    /**
     * ⛔ HIS ORDER, NOT THE PICKER'S — see `hardPairInFrameOrder`. Applied here rather than at the
     * screen alone, because a payload can arrive from a client that never normalised anything and
     * the built week is what the athlete trains.
     */
    const answered = hardSlotsInFrameOrder(mix.slots) as Record<string, string>;
    let substituted = 0;
    let declined = 0;
    // ⚠️ RESOLVED BEFORE THE LOOP so every declined hard slot reads the SAME easy answer, whatever
    // order the slots come in. The easy slot is the one the athlete did answer.
    // ⛔ THE COLUMN'S OWN EASY SESSION — read off the frame being assigned, never written down here.
    const frameEasySlot = open.find(({ slot }) => !isHardSlot(slot) && !isLongSlot(slot))?.slot ?? null;
    const easySport = ((): 'run' | 'ride' | null => {
      for (const { day, i, slot } of open) {
        if (isHardSlot(slot) || isLongSlot(slot)) continue;
        const a = answered[key(day, i)];
        if (a === 'run' || a === 'ride') return a;
      }
      return null;
    })();
    for (const { day, i, slot } of open) {
      const asked = answered[key(day, i)];
      // ⛔ DECLINED — the athlete added no hard session here. Convert, never remove. ⚠️ Guarded on
      // `isHardSlot`: `'none'` on an easy or long slot is meaningless (they are not opt-in) and is
      // ignored rather than quietly emptying the week.
      if (asked === 'none') {
        if (!isHardSlot(slot)) continue;
        // ⚠️ NO EASY SLOT IN THE COLUMN → NOTHING TO CONVERT TO, so the slot is left as the frame
        // wrote it rather than replaced with a guess. No column ships this way; the guard exists
        // because inventing a session is the failure this whole function is built to avoid.
        if (!frameEasySlot) continue;
        byKey[key(day, i)] = declineHardSlot(slot, easySport, frameEasySlot);
        declined += 1;
        continue;
      }
      if (asked !== 'ride') continue;
      const eq = RIDE_EQUIVALENT[slot.family];
      if (!eq) continue;
      byKey[key(day, i)] = {
        // ⛔ THE BIKE'S OWN CEILING — see `clampRideLevel`. A ride inherits the SLOT's difficulty,
        // and the frame's second hard slot is level 3, which his cycling programs never prescribe.
        family: eq.family, level: clampRideLevel(eq.family, slot.level),
        archetype: eq.archetype, raceTempo: slot.raceTempo,
        sport: 'ride', substituted: true, sourceText: slot.sourceText,
        // ⛔ A MODALITY SWAP DOES NOT CHANGE WHAT THE SESSION IS FOR. The frame's hard slot ridden
        // instead of run is still the week's hard session.
        role: slot.role,
      };
      substituted += 1;
    }
    if (declined > 0) notes.push({ kind: 'ours', text: HARD_SESSIONS_ARE_OPT_IN });
    if (substituted > 0) {
      notes.push({ kind: 'ours', text: RIDE_EQUIVALENCE_IS_OURS });
      /**
       * ⛔ COUNTED OFF THE **FRAME'S** HARD SLOTS, NOT THE ASSIGNED FAMILY — see `hardOnBikeNote`.
       * ⚠️ `isHardSlot` reads `HARDNESS`, which lists only the RUN families, so asking it about a
       * substituted `ride_sweet_spot` returns false and the count would come back zero on exactly
       * the week the sentence is about. The frame slot owns hard identity here, the same rule
       * `anchorRoleOf` follows in `compose.ts`.
       */
      {
        const hard = slots.filter(({ slot }) => isHardSlot(slot))
          .map(({ day, i }) => byKey[key(day, i)])
          .filter(Boolean);
        const text = hardOnBikeNote(
          hard.filter((x) => x.sport === 'ride').length,
          hard.filter((x) => x.sport === 'run').length,
        );
        if (text) notes.push({ kind: 'source', text, cite: HARD_ON_BIKE_CITE });
      }
    }
    // ⛔ THE PICKS APPLY ON THIS EXIT TOO — see `applyVariantPicks`. This branch skipped them
    // entirely until 2026-08-26, and it is the branch the wizard always takes.
    applyVariantPicks(byKey, slots, mix);
    const counts0 = { run: 0, ride: 0, swim: 0 };
    for (const a of Object.values(byKey)) counts0[a.sport] += 1;
    return { byKey, counts: counts0, notes };
  }

  if (rides > 0 && open.length > 0) {
    /**
     * ⛔ THE RATIO, APPLIED TO THE FRAME'S OWN COUNT. Rounded to the nearest whole slot, then clamped
     * so a sport the athlete kept never disappears from the week: at least one ride, and at least one
     * run whenever they asked for any running at all.
     */
    const share = rides / Math.max(1, runs + rides);
    let rideSlots = Math.round(share * open.length);
    rideSlots = Math.max(1, Math.min(open.length - (runs > 0 ? 1 : 0), rideSlots));
    // ⚠️ NO `if (runs === 0) rideSlots = open.length` — one stood here and mutation testing showed it
    // guarded nothing: with no running the share is 1, the round is `open.length`, and the clamp's
    // own `runs > 0 ? 1 : 0` term is already zero. A branch that cannot change an answer is the dead
    // guard this codebase keeps deleting (`lowerBodyHaircut` and `restate.ts` each lost one).

    /**
     * ⛔ HARDEST FIRST, LONG LAST. The dial puts intensity on the bike; the long session is what a
     * held sport keeps. ⚠️ The long slot is only reachable here when `runs === 0`, because the clamp
     * above always leaves a run slot when there is any running in the mix — and the sort puts the
     * long day at the very back.
     */
    const order = [...open].sort((a, b) => {
      const longA = isLongSlot(a.slot) ? 1 : 0;
      const longB = isLongSlot(b.slot) ? 1 : 0;
      if (longA !== longB) return longA - longB;
      const h = (HARDNESS[b.slot.family] ?? 0) - (HARDNESS[a.slot.family] ?? 0);
      // ⚠️ TIES BROKEN BY DAY, so the same mix never yields two different weeks.
      return h !== 0 ? h : a.day - b.day || a.i - b.i;
    });

    let placed = 0;
    for (const { day, i, slot } of order) {
      if (placed >= rideSlots) break;
      const eq = RIDE_EQUIVALENT[slot.family];
      if (!eq) continue;   // a family with no ride equivalent stays a run rather than being guessed at
      byKey[key(day, i)] = {
        family: eq.family, level: slot.level, archetype: eq.archetype, raceTempo: slot.raceTempo,
        sport: 'ride', substituted: true, sourceText: slot.sourceText,
        // ⛔ SAME RULE AS THE DIAL'S OWN SUBSTITUTION ABOVE — the sport moved, the role did not.
        role: slot.role,
      };
      placed += 1;
    }
    if (placed > 0) {
      notes.push({ kind: 'ours', text: RIDE_EQUIVALENCE_IS_OURS });
      /**
       * ⛔ COUNTED OFF THE **FRAME'S** HARD SLOTS, NOT THE ASSIGNED FAMILY — see `hardOnBikeNote`.
       * ⚠️ `isHardSlot` reads `HARDNESS`, which lists only the RUN families, so asking it about a
       * substituted `ride_sweet_spot` returns false and the count would come back zero on exactly
       * the week the sentence is about. The frame slot owns hard identity here, the same rule
       * `anchorRoleOf` follows in `compose.ts`.
       */
      {
        const hard = slots.filter(({ slot }) => isHardSlot(slot))
          .map(({ day, i }) => byKey[key(day, i)])
          .filter(Boolean);
        const text = hardOnBikeNote(
          hard.filter((x) => x.sport === 'ride').length,
          hard.filter((x) => x.sport === 'run').length,
        );
        if (text) notes.push({ kind: 'source', text, cite: HARD_ON_BIKE_CITE });
      }
      if (runs > 0) {
        // ⛔ STATE THE COST (pivot §2). A held sport keeps its base and loses its top end.
        notes.push({
          kind: 'source',
          text: 'The running keeps its long session and loses its hard one. Base endurance holds on '
            + 'that; top-end running speed decays.',
          cite: 'Viada p275',
        });
      }
    }
  }

  const counts = { run: 0, ride: 0, swim: 0 };
  for (const a of Object.values(byKey)) counts[a.sport] += 1;

  applyVariantPicks(byKey, slots, mix);

  return { byKey, counts, notes };
}

/** The assignment for one slot, or the frame's own run slot when nothing was assigned. */
export function assignedSlot(
  assignment: SlotAssignment | undefined,
  day: number,
  i: number,
  fallback: EnduranceSlot,
): AssignedSlot {
  return assignment?.byKey[key(day, i)] ?? {
    family: fallback.family, level: fallback.level, archetype: fallback.archetype,
    raceTempo: fallback.raceTempo, sport: 'run', substituted: false, sourceText: fallback.sourceText,
    role: fallback.role,
  };
}
