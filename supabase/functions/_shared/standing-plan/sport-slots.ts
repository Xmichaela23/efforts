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

import type { FamilyId, Level } from '../endurance-library/index.ts';
import type { EnduranceSlot, FrameDay } from './frames.ts';

export type SportMix = {
  /** Runs a week the athlete asked for. */
  runs?: number | null;
  /** Rides a week they asked for. */
  rides?: number | null;
  /** ⛔ OFF BY DEFAULT (Michael, 2026-08-23). Kept means easy laps and technique, and nothing else. */
  swimDays?: number | null;
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

  // ── 1. the swim, at most one easy slot ────────────────────────────────────────────────────────
  const takenBySwim = new Set<string>();
  if (swimKept) {
    const easiest = [...slots]
      .filter(({ slot }) => !isLongSlot(slot) && !isHardSlot(slot))
      .sort((a, b) => (HARDNESS[a.slot.family] ?? 0) - (HARDNESS[b.slot.family] ?? 0))[0];
    if (easiest) {
      byKey[key(easiest.day, easiest.i)] = {
        family: SWIM_SLOT.family, level: SWIM_SLOT.level,
        sport: 'swim', substituted: true, sourceText: easiest.slot.sourceText,
      };
      takenBySwim.add(key(easiest.day, easiest.i));
      notes.push({ kind: 'ours', text: SWIM_IS_EASY_ONLY });
    } else {
      // ⛔ NEVER SILENTLY DROPPED. A column with no easy slot cannot hold a swim, and the athlete is
      // told rather than finding the swim missing.
      notes.push({
        kind: 'warning',
        text: 'This week has no easy session for a swim to stand in for, so no swim is booked in it.',
      });
    }
  }

  // ── 2-4. the run/ride split over what is left ─────────────────────────────────────────────────
  const open = slots.filter(({ day, i }) => !takenBySwim.has(key(day, i)));
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
