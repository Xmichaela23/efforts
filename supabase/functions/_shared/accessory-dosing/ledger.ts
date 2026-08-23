// ============================================================================
// THE LEDGER — what a week actually buys each muscle, and what each session actually costs.
//
// ⛔ THIS IS THE UNIT CHANGE. `src/lib/assistance-menu.ts` answers "how many REPS in this slot"; it
// cannot answer "did the quads get anything this week" or "will tomorrow's run survive this
// session", because a rep total per category is not addressed to a muscle or to a session. Those
// two questions are what this file adds, and they are the two the source says matter.
//
// ⛔ IT DOES NOT DECIDE THE WEEK. Stage 4's composer owns which slots exist; this reads a week it is
// handed and reports. The one thing it will CHANGE is a muscle sitting at zero — see
// {@link fillMuscleFloor}, which is a floor beneath the athlete's picks and never a replacement for
// them.
// ============================================================================

import {
  accessorySetsPerSlot,
  COUNTED_INTENTS,
  effectiveRepsFor,
  SESSION_CEILING_NOTE,
  UNCLASSIFIED_INTENTS,
  UNCLASSIFIED_INTENTS_NOTE,
  verdictForSessionSets,
  verdictForWeeklySets,
  WARMUPS_NOT_COUNTED,
  type MuscleVerdict,
  type SessionVerdict,
} from './dose.ts';
import {
  ATTRIBUTION_IS_APPROXIMATE,
  MUSCLE_GROUPS,
  musclesWorkedBy,
  type MuscleGroup,
} from './muscles.ts';
import {
  allGridMovements,
  canPerform,
  equipmentFitRank,
  type GridMovement,
  type ViadaCategory,
  type ViadaIntent,
} from '../strength-grid/index.ts';

export type DoseNote = { kind: 'source' | 'ours' | 'gap' | 'warning'; text: string; cite?: string };

/** One prescribed set group. ⛔ `isWarmup` sets are never counted — p147 says so outright. */
export type PlannedWorkSet = {
  movement: string;
  intent: ViadaIntent;
  sets: number;
  isWarmup?: boolean;
};

export type PlannedSession = { label: string; sets: PlannedWorkSet[] };

export type MuscleLine = {
  muscle: MuscleGroup;
  /** Sets counted to this muscle as the prime mover. */
  sets: number;
  /** ⛔ HIS FORMULA — sets x 4 (p147, p086). */
  effectiveReps: number;
  verdict: MuscleVerdict;
  /**
   * ⛔ LOADED BUT NOT COUNTED. Movements where this muscle is engaged without being the prime mover.
   * Listed because p084 says that engagement is real fatigue; uncounted because he gives no fraction.
   */
  secondaryFrom: string[];
};

export type SessionLine = {
  label: string;
  /** Work sets that meet his test — see `COUNTED_INTENTS`. Warm-ups excluded. */
  countedSets: number;
  /** ⚠️ DE and SKILL. He never classifies them; both numbers are reported. */
  unclassifiedSets: number;
  totalIfAllCounted: number;
  verdict: SessionVerdict;
  verdictIfAllCounted: SessionVerdict;
};

export type DoseLedger = {
  perMuscle: MuscleLine[];
  perSession: SessionLine[];
  /** The floor in sets — one accessory slot. See {@link MUSCLE_FLOOR_IS_ONE_SLOT}. */
  floorSets: number;
  /** Muscles the week leaves under the floor. Empty is the goal, not the assumption. */
  belowFloor: MuscleGroup[];
  /** Movements the week names that the catalogue cannot attribute to a muscle. */
  unattributed: string[];
  notes: DoseNote[];
};

/**
 * ⛔ THE FLOOR IS ONE SLOT, NOT A NUMBER SOMEBODY PICKED — and that is the only honest way to have
 * one, because **he never states a floor**.
 *
 * What he states is a *solid range*: 8 to 12 sets per muscle per week (p086). ⛔ **That range and
 * his own session ceiling are mutually unreachable for this athlete, and the arithmetic is not
 * close.** Ten muscle groups at 8 sets each is 80 work sets a week. At his 6-8-sets-per-session
 * recovery band that needs ten lifting sessions; the All Rounder has four. Even at 14 sets a session
 * — the figure he says costs three days of other-modality performance — it needs six.
 *
 * **So 8-12 is a bodybuilder's number and 6-8-per-session is a hybrid athlete's, and they do not
 * compose.** p147 shows what actually happens: his own endurance-athlete example runs 10 to 15
 * effective reps per lower-body muscle group, which is two to four sets — and he criticises it.
 *
 * ⛔ **THE FLOOR THIS MODULE ENFORCES IS THEREFORE STRUCTURAL: at least one accessory slot per
 * muscle group, which is three sets** — the low end of his HYP band (p218), taken through stage 2's
 * `setsFor` because *"sets should always remain on the lower end when starting a program"* is his
 * instruction. **No new scalar is introduced.** The failure being fixed is a muscle at ZERO, which
 * is what the picker can produce today; the fix is not a promise of his solid range, and the ledger
 * reports `light` rather than pretending otherwise.
 */
export const MUSCLE_FLOOR_IS_ONE_SLOT =
  'The floor is one accessory slot per muscle group — three sets, the low end of the source\'s own '
  + 'hypertrophy band. It is not his 8-to-12 solid range: ten muscle groups at eight sets is eighty '
  + 'work sets a week, which needs ten lifting sessions at the six-to-eight the source says a session '
  + 'should stay under. This plan has four.';

export function muscleFloorSets(setPosition?: number): number {
  return accessorySetsPerSlot(setPosition);
}

// ── the ledger ──────────────────────────────────────────────────────────────────────────────────

export function ledgerFor(
  week: PlannedSession[],
  opts?: { setPosition?: number },
): DoseLedger {
  const floorSets = muscleFloorSets(opts?.setPosition);
  const sets: Record<MuscleGroup, number> = Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, 0]),
  ) as Record<MuscleGroup, number>;
  const secondary: Record<MuscleGroup, Set<string>> = Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, new Set<string>()]),
  ) as Record<MuscleGroup, Set<string>>;
  const unattributed = new Set<string>();
  const perSession: SessionLine[] = [];

  for (const session of week) {
    let counted = 0;
    let unclassified = 0;
    for (const s of session.sets) {
      const n = Math.max(0, Math.round(s.sets));
      // ⛔ WARM-UPS ARE NOT WORK SETS, at any percentage (p147).
      if (s.isWarmup) continue;
      if (COUNTED_INTENTS.includes(s.intent)) counted += n;
      else if (UNCLASSIFIED_INTENTS.includes(s.intent)) unclassified += n;

      const work = musclesWorkedBy(s.movement);
      if (!work) {
        unattributed.add(s.movement);
        continue;
      }
      sets[work.primary] += n;
      for (const m of work.secondary) secondary[m].add(s.movement);
    }
    const total = counted + unclassified;
    perSession.push({
      label: session.label,
      countedSets: counted,
      unclassifiedSets: unclassified,
      totalIfAllCounted: total,
      verdict: verdictForSessionSets(counted),
      verdictIfAllCounted: verdictForSessionSets(total),
    });
  }

  const perMuscle: MuscleLine[] = MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    sets: sets[muscle],
    effectiveReps: effectiveRepsFor(sets[muscle]),
    verdict: verdictForWeeklySets(sets[muscle], floorSets),
    secondaryFrom: [...secondary[muscle]].sort(),
  }));

  const belowFloor = perMuscle.filter((l) => l.verdict === 'below_floor').map((l) => l.muscle);

  const notes: DoseNote[] = [
    { kind: 'source', text: ATTRIBUTION_IS_APPROXIMATE, cite: 'Viada p84' },
    { kind: 'source', text: SESSION_CEILING_NOTE, cite: 'Viada p86' },
    { kind: 'source', text: WARMUPS_NOT_COUNTED, cite: 'Viada p147' },
    { kind: 'gap', text: UNCLASSIFIED_INTENTS_NOTE, cite: 'Viada p147 — not classified' },
    { kind: 'ours', text: MUSCLE_FLOOR_IS_ONE_SLOT, cite: 'Viada p86, p218 — the floor itself is ours' },
  ];
  if (belowFloor.length > 0) {
    notes.push({
      kind: 'warning',
      text: `Nothing this week reaches ${belowFloor.join(', ')}.`,
    });
  }
  if (perSession.some((s) => s.verdict === 'costly')) {
    notes.push({
      kind: 'warning',
      text: 'At least one session is at or past fourteen work sets, where the source says performance '
        + 'in other disciplines drops significantly for a day and is still notably down at three.',
      cite: 'Viada p86',
    });
  }
  if (unattributed.size > 0) {
    notes.push({
      kind: 'warning',
      text: `Not counted against any muscle, because the catalogue does not hold them: `
        + `${[...unattributed].sort().join(', ')}.`,
    });
  }
  return { perMuscle, perSession, floorSets, belowFloor, unattributed: [...unattributed].sort(), notes };
}

// ── the floor beneath the picker ────────────────────────────────────────────────────────────────

/**
 * ⛔ ISOLATION AND MACHINE WORK FOR HYPERTROPHY, COMPOUNDS FOR STRENGTH — his rule, and it is what
 * orders the search below. p086, read off the page:
 *
 * > *"Because we also want to minimize the likelihood of task failure … I will typically use
 * > externally braced or fixed-path lifts for hypertrophy (that is, 'isolation' movements or
 * > machines) and reserve compound lifts for strength. It's also far easier to track individual
 * > muscle volume when movements are less complex!"*
 *
 * ⚠️ THE SECOND SENTENCE IS THE REASON THIS WHOLE MODULE WORKS BETTER ON FOCUSED WORK. A set of
 * lateral raises is unambiguously deltoids; a set of squats is quads, glutes, hamstrings and a
 * fair amount of trunk. So the same rule that lowers task-failure risk also makes the ledger honest.
 */
export const HYPERTROPHY_PREFERS_ISOLATION =
  'Externally braced and fixed-path movements are the source\'s own choice for hypertrophy work, with '
  + 'compounds reserved for strength — partly because a single-joint movement is far easier to count '
  + 'toward one muscle.';

const CATEGORY_PREFERENCE: ViadaCategory[] = ['focused', 'braced', 'secondary', 'primary'];

/**
 * ⛔ EVERY MOVEMENT WHOSE PRIME MOVER IS THIS MUSCLE, GATED ON WHAT THE ATHLETE CAN ACTUALLY DO.
 *
 * ⚠️ THE GATE HERE IS `canPerform`, NOT THE GRID'S STRICTER LOCAL READING, AND THE DIFFERENCE IS A
 * BUG THIS FUNCTION USED TO HAVE. `strength-grid` treats an untagged movement as *unknown* rather
 * than free, which is right when it is choosing what to OFFER as a slot's headline: there, an
 * unverified movement should lose to a verified one. It is wrong here, because the alternative is
 * not a different movement — it is the muscle getting nothing.
 *
 * Measured 2026-08-22: routing this search through `resolveSlot` left CALVES unfillable for a
 * commercial-gym athlete, because every calf movement in the catalogue is untagged and the grid
 * therefore declined all nine. `canPerform` — the app's one owner of "can this athlete do this
 * movement" — passes them, which is the answer that matters when the choice is *something* or
 * *nothing*.
 *
 * ⚠️ Ranking still goes through `equipmentFitRank`, the same owner the grid uses, so a movement the
 * athlete has the kit for still beats one they do not. Category order is p086's: isolation and
 * braced work for hypertrophy, compounds reserved for strength.
 */
function candidatesFor(muscle: MuscleGroup, equipment: string[] | null | undefined): GridMovement[] {
  return allGridMovements()
    .filter((m) => musclesWorkedBy(m.name)?.primary === muscle)
    .filter((m) => canPerform(m.name, equipment))
    .map((m, i) => ({ m, i, r: equipmentFitRank(m.name, equipment) }))
    .sort((a, b) => {
      const byCategory = CATEGORY_PREFERENCE.indexOf(a.m.category) - CATEGORY_PREFERENCE.indexOf(b.m.category);
      if (byCategory !== 0) return byCategory;
      const ar = a.r == null ? Number.MAX_SAFE_INTEGER : a.r;
      const br = b.r == null ? Number.MAX_SAFE_INTEGER : b.r;
      return ar === br ? a.i - b.i : ar - br;
    })
    .map((x) => x.m);
}

export type FloorAddition = {
  muscle: MuscleGroup;
  movement: string;
  sets: number;
  category: ViadaCategory;
  /** Which session it was added to. */
  session: string;
};

export type FloorResult = {
  sessions: PlannedSession[];
  added: FloorAddition[];
  /** Muscles that could not be reached at all, with the reason. Empty is the goal. */
  unfilled: { muscle: MuscleGroup; reason: string }[];
  notes: DoseNote[];
};

/**
 * ⛔ THE FLOOR BENEATH THE PICKER — NOT A REPLACEMENT FOR IT.
 *
 * *"It is the work that matters"* (Wendler p.24), and Viada encourages rotation and unfamiliar
 * movements. **Every pick the athlete made survives untouched.** What this adds is one slot for each
 * muscle group the week left at zero, so the focus picker can no longer leave quads and shoulders
 * with nothing.
 *
 * ⛔ AND IT WILL NOT PUSH A SESSION PAST THE POINT THE SOURCE WARNS ABOUT. Additions go to the
 * lightest session that can still take them without reaching fourteen work sets. If no session can,
 * the muscle is reported `unfilled` with that reason rather than being forced in — a floor that
 * breaks the ceiling has just moved the problem.
 */
export function fillMuscleFloor(
  week: PlannedSession[],
  opts?: { equipment?: string[] | null; setPosition?: number },
): FloorResult {
  const sessions: PlannedSession[] = week.map((s) => ({ label: s.label, sets: [...s.sets] }));
  const setsPerSlot = muscleFloorSets(opts?.setPosition);
  const added: FloorAddition[] = [];
  const unfilled: { muscle: MuscleGroup; reason: string }[] = [];
  const notes: DoseNote[] = [
    { kind: 'source', text: HYPERTROPHY_PREFERS_ISOLATION, cite: 'Viada p86' },
  ];

  const gaps = ledgerFor(sessions, { setPosition: opts?.setPosition }).belowFloor;
  /** ⚠️ What the week already prescribes — a floor slot should widen the week, not repeat it. */
  const alreadyPrescribed = new Set(sessions.flatMap((s) => s.sets.map((x) => x.movement)));

  for (const muscle of gaps) {
    // Which movement — through stage 2's grid, so the equipment ladder and the ranking are not
    // re-implemented here. The first option whose PRIME MOVER is this muscle wins.
    const forMuscle = candidatesFor(muscle, opts?.equipment ?? null);
    // ⚠️ A MOVEMENT THE WEEK DOES NOT ALREADY HAVE, where one exists. Filling a gap by repeating a
    // movement already prescribed adds sets without adding variety, and the source encourages
    // rotation. Falls back to a repeat rather than leaving the muscle at zero.
    const pick = forMuscle.find((o) => !alreadyPrescribed.has(o.name)) ?? forMuscle[0];
    const chosen = pick ? { movement: pick.name, category: pick.category } : null;
    if (!chosen) {
      unfilled.push({ muscle, reason: 'No movement in the catalogue reaches this muscle with the declared equipment.' });
      continue;
    }

    // ⛔ THE LIGHTEST SESSION THAT STAYS UNDER THE COSTLY LINE. Never the one already at the ceiling.
    const lines = ledgerFor(sessions, { setPosition: opts?.setPosition }).perSession;
    const ordered = lines
      .map((l, i) => ({ l, i }))
      .filter((x) => x.l.countedSets + setsPerSlot < 14)
      .sort((a, b) => a.l.countedSets - b.l.countedSets);
    if (ordered.length === 0) {
      unfilled.push({
        muscle,
        reason: 'Every session is already close enough to fourteen work sets that adding a slot would '
          + 'cross it, and the source says that costs up to three days of other-discipline performance.',
      });
      continue;
    }
    const target = ordered[0];
    sessions[target.i].sets.push({ movement: chosen.movement, intent: 'HYP', sets: setsPerSlot });
    alreadyPrescribed.add(chosen.movement);
    added.push({
      muscle,
      movement: chosen.movement,
      sets: setsPerSlot,
      category: chosen.category,
      session: sessions[target.i].label,
    });
  }

  if (added.length > 0) {
    notes.push({
      kind: 'ours',
      text: `Added one slot each for ${added.map((a) => a.muscle).join(', ')}, which the week left at `
        + 'zero. Every movement the athlete chose is untouched.',
    });
  }
  if (unfilled.length > 0) {
    notes.push({
      kind: 'warning',
      text: `Could not reach ${unfilled.map((u) => u.muscle).join(', ')}.`,
    });
  }
  return { sessions, added, unfilled, notes };
}
