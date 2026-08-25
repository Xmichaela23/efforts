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
  run_mlss: { family: 'ride_sweet_spot', archetype: 'medium' },
  run_near_threshold: { family: 'ride_sweet_spot', archetype: 'long' },
  run_vt1: { family: 'ride_endurance', archetype: 'steady' },
  run_lsd: { family: 'ride_endurance', archetype: 'steady' },
};

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
const HARDNESS: Partial<Record<FamilyId, number>> = {
  run_mlss: 4,
  run_near_threshold: 3,
  run_vt1: 1,
  run_lsd: 2,
};

/** ⛔ THE LONG SLOT. `run_lsd` is the frame's long session; a held sport keeps it (pivot §2). */
export function isLongSlot(slot: { family: FamilyId }): boolean {
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
      };
    }
  }
  return {
    family: easySlot.family, level: easySlot.level, archetype: easySlot.archetype, raceTempo: false,
    sport: 'run', substituted: true, sourceText: slot.sourceText,
  };
}

export const HARD_SESSIONS_ARE_OPT_IN =
  'Hard sessions are added, up to two. A week with none still carries its four sessions — the hard '
  + 'ones become easy running instead, so the miles and hours you set are unchanged.';

/** ⛔ A HARD SLOT — at or above near-threshold. These are the two the dial places. */
export function isHardSlot(slot: { family: FamilyId }): boolean {
  return (HARDNESS[slot.family] ?? 0) >= 3;
}

// ── THE ASSIGNMENT ───────────────────────────────────────────────────────────────────────────────

export type SlotAssignment = {
  /** Keyed `${frameDay}:${indexWithinDay}`. */
  byKey: Record<string, AssignedSlot>;
  counts: { run: number; ride: number; swim: number };
  /** ⛔ TRUE WHEN DAY 1'S ENDURANCE SESSION IS A RUN — the haircut's stated cause. See `compose.ts`. */
  hardRunBeforeMeLower: boolean;
  notes: { kind: 'source' | 'ours' | 'warning'; text: string; cite?: string }[];
};

const key = (day: number, i: number) => `${day}:${i}`;

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
    sport: 'run', substituted: false, sourceText: s.sourceText,
  });
  for (const { day, i, slot } of slots) byKey[key(day, i)] = asRun(slot);

  const total = slots.length;
  if (total === 0) {
    return { byKey, counts: { run: 0, ride: 0, swim: 0 }, hardRunBeforeMeLower: false, notes };
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
    let substituted = 0;
    let declined = 0;
    // ⚠️ RESOLVED BEFORE THE LOOP so every declined hard slot reads the SAME easy answer, whatever
    // order the slots come in. The easy slot is the one the athlete did answer.
    // ⛔ THE COLUMN'S OWN EASY SESSION — read off the frame being assigned, never written down here.
    const frameEasySlot = open.find(({ slot }) => !isHardSlot(slot) && !isLongSlot(slot))?.slot ?? null;
    const easySport = ((): 'run' | 'ride' | null => {
      for (const { day, i, slot } of open) {
        if (isHardSlot(slot) || isLongSlot(slot)) continue;
        const a = mix.slots?.[key(day, i)];
        if (a === 'run' || a === 'ride') return a;
      }
      return null;
    })();
    for (const { day, i, slot } of open) {
      const asked = mix.slots[key(day, i)];
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
        family: eq.family, level: slot.level, archetype: eq.archetype, raceTempo: slot.raceTempo,
        sport: 'ride', substituted: true, sourceText: slot.sourceText,
      };
      substituted += 1;
    }
    if (declined > 0) notes.push({ kind: 'ours', text: HARD_SESSIONS_ARE_OPT_IN });
    if (substituted > 0) {
      notes.push({ kind: 'ours', text: RIDE_EQUIVALENCE_IS_OURS });
      notes.push({
        kind: 'source',
        text: 'The hard sessions are on the bike. Riding hard does not land on the legs the way '
          + 'running does, so the intensity costs the lifting less.',
        cite: 'Viada p280',
      });
    }
    const counts0 = { run: 0, ride: 0, swim: 0 };
    for (const a of Object.values(byKey)) counts0[a.sport] += 1;
    const dayOne0 = slots.filter(({ day }) => day === 1);
    return {
      byKey,
      counts: counts0,
      /**
       * ⛔⛔ HARDNESS IS READ OFF THE **ASSIGNED** SLOT, NOT THE FRAME'S (2026-08-25). This said
       * `isHardSlot(slot)` — the frame's own slot — and that was correct while every assignment
       * kept the family and changed only the sport. **A declined hard slot changes the FAMILY**, so
       * the frame still calls day 1 hard after the week has converted it to easy running, and the
       * lower-body haircut would fire on an intensity session that is no longer in the plan.
       *
       * ⚠️ `byKey` is fully populated for every slot before this runs, so there is no ordering risk.
       */
      hardRunBeforeMeLower: dayOne0.some(({ day, i }) => {
        const a = byKey[key(day, i)];
        return !!a && isHardSlot({ family: a.family }) && a.sport === 'run';
      }),
      notes,
    };
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
      };
      placed += 1;
    }
    if (placed > 0) {
      notes.push({ kind: 'ours', text: RIDE_EQUIVALENCE_IS_OURS });
      notes.push({
        kind: 'source',
        text: 'The hard sessions are on the bike. Riding hard does not land on the legs the way '
          + 'running does, so the intensity costs the lifting less.',
        cite: 'Viada p280',
      });
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

  /**
   * ⛔ THE HAIRCUT'S STATED CAUSE, ANSWERED HERE RATHER THAN ASSUMED IN THE LOADER.
   *
   * p247: *"**Monday's run is fairly challenging**, given that there is an ME lower session the next
   * day… a 3 to 4 percent reduction in working 1RM should be assumed here."* The subject of that
   * sentence is the RUN. See `compose.ts` for what this flag does and for why the substituted case
   * is labelled ours.
   */
  const dayOne = slots.filter(({ day }) => day === 1);
  const hardRunBeforeMeLower = dayOne.some(({ day, i, slot }) =>
    isHardSlot(slot) && byKey[key(day, i)]?.sport === 'run');

  // ── the athlete's variant picks, validated against the assigned family ───────────────────────
  for (const [k, want] of Object.entries(mix.archetypes ?? {})) {
    const assigned = byKey[k];
    if (!assigned || typeof want !== 'string' || !want) continue;
    const fam = FAMILIES[assigned.family];
    if (fam?.archetypes.some((a) => a.id === want)) {
      byKey[k] = { ...assigned, archetype: want };
    }
  }

  return { byKey, counts, hardRunBeforeMeLower, notes };
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
  };
}
