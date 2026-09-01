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
  SESSION_SETS_COSTLY,
  accessorySetsPerSlot,
  COUNTED_INTENTS,
  effectiveRepsFor,
  SESSION_CEILING_NOTE,
  WEEKLY_SETS_SOLID,
  UNCLASSIFIED_INTENTS,
  UNCLASSIFIED_INTENTS_NOTE,
  verdictForSessionSets,
  verdictForWeeklySets,
  WARMUPS_NOT_COUNTED,
  type MuscleVerdict,
  type SessionVerdict,
} from './dose.ts';
/**
 * ⛔ THE SERVER'S CANONICALIZER — the app's one owner of "are these two names the same lift". The
 * client mirror in `src/lib` lacks the Q-197 plural rule that makes `Bulgarian Split Squats` and
 * `bulgarian split squat` one movement.
 */
import { canonicalize } from '../canonicalize.ts';
import { capabilitiesForExercise } from '../../../../src/lib/exercise-role.ts';
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

export type PlannedSession = {
  label: string;
  sets: PlannedWorkSet[];
  /**
   * ⛔⛔ WHERE THIS SESSION SITS AND WHAT IT TRAINS — SUPPLIED BY THE CALLER, OPTIONAL, AND THE
   * FLOOR'S PLACEMENT RULE IS BUILT ON IT (2026-08-31). See {@link fillMuscleFloor}.
   * ⚠️ ABSENT MEANS "no placement facts", and the floor falls back to its old weight-only choice —
   * so every caller written before this behaves exactly as it did.
   */
  /** The frame day this session sits on. Placement needs ORDER, not only weight. */
  day?: number;
  /** What this day's lifting trains, stated by the frame rather than read off the label. */
  region?: 'upper' | 'lower';
  /** ⛔ A heavy lower-body day — a max test or an ME lower slot. p247 prices what sits before it. */
  heavyLower?: boolean;
  /**
   * ⛔⛔ A TEST SESSION, WHICH TAKES NO FLOOR VOLUME AT ALL (Michael, 2026-08-31:
   * *"it shouldnt arbitrarily drop workouts in so test days should be test days"*).
   *
   * ⛔ WHAT HE FOUND, mid-session, on his own Test: Upper — a **hanging leg raise** below the bench
   * and press, carrying the note *"Floor: core had nothing else this week."* Nothing in p274 puts it
   * there. The floor put it there because week one's test day holds two lifts and is by a wide
   * margin the lightest session of the week, and rule 3 is *"then the lightest"*.
   *
   * ⛔ AND CORE HITS IT EVERY BLOCK, not occasionally. Rule 2 ranks on region, `rank()` returns the
   * same middle value for any muscle in neither `UPPER_MUSCLES` nor `LOWER_MUSCLES`, and core is
   * deliberately in neither — so for core the region preference is inert and placement collapses to
   * rule 3 alone. The lightest session is the test. It is not a coin flip that landed badly.
   *
   * ⛔⛔ WHY IT IS A HARD EXCLUSION AND NOT A PREFERENCE. Every other session in a week costs the
   * athlete recovery; a test costs the BLOCK its numbers. p215's pretest is a measurement, and work
   * added around it changes the reading the whole twelve weeks is derived from. A preference would
   * still put volume there on a week where nothing else fits, which is precisely the week it would
   * do the most damage.
   *
   * ⚠️ THE MUSCLE IS NOT SILENTLY DROPPED. It goes to the next session the rules allow, and if none
   * qualifies it lands in `unfilled` with a stated reason — the path that already exists.
   * ⚠️ AND IT IS NARROWER THAN `heavyLower`, which is about what sits BEFORE a heavy day. This is
   * about what sits INSIDE a test.
   */
  isTest?: boolean;
};

/**
 * ⛔ WHICH MUSCLES ARE LOWER-BODY, for the floor's placement rule. Core is deliberately in neither
 * list: it is trained on any day and p223 gives it its own heading rather than a region.
 */
const LOWER_MUSCLES: MuscleGroup[] = ['quadriceps', 'hamstrings', 'glutes', 'calves'];
const UPPER_MUSCLES: MuscleGroup[] = ['chest', 'deltoids', 'lats', 'biceps', 'triceps'];

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
export function movementsForMuscle(muscle: MuscleGroup, equipment: string[] | null | undefined): GridMovement[] {
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

/**
 * ⛔ CAN THIS MOVEMENT HONESTLY CARRY A REP PRESCRIPTION — a second question over the SAME vocabulary
 * `movementsForMuscle` ranks, sitting next to it on purpose (2026-08-24).
 *
 * ⛔ THE DEFECT IT CLOSES, seen on a device: the Core focus rows opened on **Plank** and the plan
 * printed **"3 x 8-10"** under it. A static hold has no reps. It is not a rounding error in the copy
 * — the row asks the athlete to do something the movement cannot express.
 *
 * ⛔ AND IT IS NOT A NEW TAXONOMY. `src/lib/exercise-role.ts` has answered this since the strength
 * language spec: `isometric` → `loggedAs: 'time'`, `mobility` → `'done_or_time'`, `carry` →
 * `'distance_or_time'`. That table is the authority and this is an accessor over it. ⚠️ Do NOT add
 * an `isHold` flag to `EXERCISE_CONFIG`; that is the second-vocabulary failure CLAUDE.md opens with.
 *
 * ⚠️ THE DEFAULT DIRECTION IS DELIBERATE. An unmapped name resolves to `loaded_accessory` →
 * `weight_x_reps` → **true**, so a movement nobody has typed yet stays OFFERED rather than silently
 * vanishing from a picker. This predicate excludes only what is KNOWN to be measured in time.
 */
export function isRepPrescribable(name: string): boolean {
  const logged = capabilitiesForExercise(String(name ?? '')).loggedAs;
  return logged !== 'time' && logged !== 'done_or_time' && logged !== 'distance_or_time';
}

/**
 * ⛔ WHAT A HOLD'S ROW PRINTS INSTEAD OF REPS. Michael's ruling, 2026-08-24: the floor may still
 * reach for a plank when nothing else in the catalogue reaches a muscle — but then the row must say
 * so honestly. **Never "x 8-10" on a hold.**
 *
 * ⚠️ 30-45 SECONDS IS A PRESCRIPTION AND IT IS OURS, not the source's — p223 lists "dynamic plank
 * variants" among his core movements and prescribes no hold duration anywhere. It is the field's
 * ordinary working range for a trunk isometric, and it is here rather than inline so there is one
 * of it.
 */
export const HOLD_PRESCRIPTION = '30-45s';

export type FloorAddition = {
  muscle: MuscleGroup;
  movement: string;
  /**
   * ⛔ FALSE = THE ROW MUST NOT PRINT REPS. A static hold (plank, dead hang) cannot express "8-10",
   * and printing it anyway is what put "Plank — 3 x 8-10" on a device. Use `HOLD_PRESCRIPTION`.
   */
  repPrescribable: boolean;
  sets: number;
  category: ViadaCategory;
  /** Which session it was added to. */
  session: string;
  /** ⛔ TRUE WHEN THIS IS THE ATHLETE'S OWN PICK filling the gap — see `fillMuscleFloor`'s `prefer`. */
  fromAthletePick?: boolean;
  /**
   * ⛔ WHY THE ROW EXISTS, AND IT DECIDES WHAT THE PLAN SAYS ABOUT IT.
   *
   * `floor` — the muscle was at ZERO and the week owed it one slot. That is this module's original
   * job and its note reads *"had nothing else this week"*.
   * `target` — the athlete asked for this muscle by name and the week is carrying it toward the
   * source's own solid band. Same machinery, opposite direction, and a row that says *"nothing
   * else reached it"* under a movement somebody asked for is the A1 defect with a new face.
   */
  reason: 'floor' | 'target';
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
 * *"It is the work that matters"* (the previous program), and Viada encourages rotation and unfamiliar
 * movements. **Every pick the athlete made survives untouched.** What this adds is one slot for each
 * muscle group the week left at zero, so the focus picker can no longer leave quads and shoulders
 * with nothing.
 *
 * ⛔ AND IT WILL NOT PUSH A SESSION PAST THE POINT THE SOURCE WARNS ABOUT. Additions go to the
 * lightest session that can still take them without reaching fourteen work sets. If no session can,
 * the muscle is reported `unfilled` with that reason rather than being forced in — a floor that
 * breaks the ceiling has just moved the problem.
 */
/**
 * ⛔ THE ATHLETE'S OWN MOVEMENTS, OFFERED TO THE FLOOR FIRST (device finding A1, 2026-08-24).
 *
 * This module's header already says what it is — *"a floor beneath the athlete's picks and never a
 * replacement for them"* — and until now it could only be the first half of that. The Standing Plan
 * composer never saw the accessory picker at all, so an athlete who chose ab work got `plank` with
 * the reason *"core had nothing else this week"*: the engine recording that it had seen no core
 * from the athlete, on a week where the athlete had asked for it by name.
 *
 * ⚠️ IT IS A PREFERENCE, NOT AN OVERRIDE. A preferred movement is used only where it genuinely
 * reaches the muscle that is short — the candidate list is still built by `candidatesFor`, so
 * equipment, category order and the prime-mover test all still hold, and a pick that trains
 * something else simply does not win this slot.
 */
export function fillMuscleFloor(
  week: PlannedSession[],
  opts?: {
    equipment?: string[] | null;
    setPosition?: number;
    prefer?: string[] | null;
    /**
     * ⛔ MUSCLES THE CALLER WANTS CARRIED ABOVE THE FLOOR, AND HOW FAR (2026-08-24).
     *
     * The floor answers *"is this muscle at zero"*. This answers *"the athlete asked for this one"*
     * — the same search, the same equipment gate, the same prime-mover test, run again until the
     * muscle reaches the target instead of stopping at one slot.
     *
     * ⚠️ CLAMPED TO {@link WEEKLY_SETS_SOLID}. A caller asking for thirty sets of chest gets twelve:
     * the source's own solid band is the ceiling, and {@link WEEKLY_SETS_OVERREACHING} is a
     * description of where overreaching starts, never a target to aim at.
     */
    target?: Partial<Record<MuscleGroup, number>> | null;
  },
): FloorResult {
  /**
   * ⚠️ SPREAD, NOT REBUILT FIELD BY FIELD. This read `{ label, sets }` and silently dropped every
   * other field the caller supplied — which is exactly how the placement facts below arrived and did
   * nothing on the first attempt. **A local copy that names its fields is a copy that goes stale the
   * next time the type grows**; the sets array is still cloned so the caller's is not mutated.
   */
  const sessions: PlannedSession[] = week.map((s) => ({ ...s, sets: [...s.sets] }));
  const setsPerSlot = muscleFloorSets(opts?.setPosition);
  const added: FloorAddition[] = [];
  const unfilled: { muscle: MuscleGroup; reason: string }[] = [];
  const notes: DoseNote[] = [
    { kind: 'source', text: HYPERTROPHY_PREFERS_ISOLATION, cite: 'Viada p86' },
  ];

  /**
   * ⛔ CANONICALIZED, NOT LOWERCASED (2026-08-24). The picker stores display names (`Chin-Up`,
   * `Bulgarian Split Squats`) and the grid is keyed off the catalogue's own spellings (`chin up`,
   * `bulgarian split squat`); a lowercase set matches the first pair and MISSES the second, because
   * lowercasing does not know that a plural is the same lift. A pick that misses here does not
   * quietly do nothing — it stays unplaced and the floor adds a movement the week already has under
   * its other spelling, which is the session duplicate reported on 2026-08-24.
   */
  const preferSet = new Set(
    (opts?.prefer ?? []).map((n) => canonicalize(String(n ?? '').trim())).filter((k) => k && k !== 'unknown'),
  );

  const skip = new Set(opts?.skipMuscles ?? []);
  const gaps = ledgerFor(sessions, { setPosition: opts?.setPosition }).belowFloor;
  /**
   * ⚠️ What the week already prescribes — a floor slot should widen the week, not repeat it.
   *
   * ⛔ COMPARED CANONICALLY for the same reason `preferSet` is. A raw-name set makes `pull up` and
   * `pullup`, or `overhead press` and `military press`, two different movements to this check — 17
   * such collision groups exist in the grid's own index — so the floor would "widen" a week by
   * adding a lift it already holds under another name.
   */
  const alreadyPrescribed = new Set(
    sessions.flatMap((s) => s.sets.map((x) => canonicalize(String(x.movement ?? '')))),
  );

  for (const muscle of gaps) {
    /**
     * ⛔ A MUSCLE THE CALLER RULED OUT IS SKIPPED IN SILENCE, AND SILENCE IS CORRECT HERE — see
     * `skipMuscles`.
     * ⚠️ IT WAS PUSHED TO `unfilled` FIRST AND THAT WAS WRONG. `unfilled` becomes
     * `placement_compromises`, the channel that tells an athlete *"we could not do what you asked"*.
     * Core being offered as a CHOICE is not a compromise — nobody asked and nothing failed — and
     * reporting it there put a cost on the screen for a design decision. The block-level invariant
     * that every below-floor muscle is accounted for carries the exemption instead, where the reason
     * belongs.
     */
    if (skip.has(muscle)) continue;
    // Which movement — through stage 2's grid, so the equipment ladder and the ranking are not
    // re-implemented here. The first option whose PRIME MOVER is this muscle wins.
    const forMuscle = movementsForMuscle(muscle, opts?.equipment ?? null);
    // ⛔ THE ATHLETE'S OWN CHOICE FIRST, where it reaches this muscle and the week does not already
    // hold it. `preferred` is matched against the SAME candidate list, so a pick can only win a slot
    // it was already eligible for — nothing here widens the equipment gate or the prime-mover test.
    const preferred = forMuscle.find((o) =>
      preferSet.has(canonicalize(o.name)) && !alreadyPrescribed.has(canonicalize(o.name)));
    // ⚠️ A MOVEMENT THE WEEK DOES NOT ALREADY HAVE, where one exists. Filling a gap by repeating a
    // movement already prescribed adds sets without adding variety, and the source encourages
    // rotation. Falls back to a repeat rather than leaving the muscle at zero.
    // ⛔ A REP-PRESCRIBABLE MOVEMENT BEFORE A HOLD (2026-08-24). Every row this function adds is
    // dosed in SETS x REPS, so a plank winning the core gap produced "3 x 8-10" under a static hold.
    // ⚠️ IT IS A PREFERENCE, NOT A FILTER: a muscle whose only reachable movement is a hold still
    // gets filled — `repPrescribable: false` travels with the row and the plan prints a hold instead.
    // Leaving the muscle at zero would be a worse answer than an honestly-labelled plank.
    const fresh = forMuscle.filter((o) => !alreadyPrescribed.has(canonicalize(o.name)));
    const pick = preferred
      ?? fresh.find((o) => isRepPrescribable(o.name))
      ?? fresh[0]
      ?? forMuscle.find((o) => isRepPrescribable(o.name))
      ?? forMuscle[0];
    const chosen = pick ? { movement: pick.name, category: pick.category } : null;
    if (!chosen) {
      unfilled.push({ muscle, reason: 'No movement in the catalogue reaches this muscle with the declared equipment.' });
      continue;
    }

    /**
     * ⛔⛔⛔ WHERE THE FILL GOES — AND WEIGHT IS THE TIE-BREAK NOW, NOT THE RULE (Michael's own built
     * plan, 2026-08-31).
     *
     * ⛔ WHAT IT DID BEFORE: sorted every session by counted sets and took the lightest, blind to
     * what the day trains and to what follows it. In a TEST week the two test days carry two lifts
     * each and are by far the lightest sessions of the week, so they soaked up every fill — his week
     * one put **glute work on the upper-body test day, the day before his squat and deadlift max
     * test.** That test sets every working number for the whole block.
     *
     * ⛔ THE RULE, IN ORDER:
     *   1. **Never lower-body volume the day before a heavy lower day.** p247 prices a hard session
     *      the day before heavy legs at 3-4% off the squat and deadlift, and the app already honours
     *      that adjacency for endurance. A max TEST is the most expensive place to spend it.
     *   2. **Prefer a session whose region matches the muscle** — glute work on a lower day, triceps
     *      on an upper one. A fill is weekly volume, but the day it lands on is what the athlete
     *      reads and what the session has to absorb.
     *   3. **Then the lightest**, exactly as before.
     *
     * ⚠️ RULE 1 IS A HARD EXCLUSION AND RULES 2-3 ARE PREFERENCES, so a week with no matching region
     * still gets filled rather than leaving a muscle at zero — which the source is clearer about
     * than it is about placement.
     * ⚠️ AND IT DEGRADES TO THE OLD BEHAVIOUR when the caller supplies no `day`/`region`, so nothing
     * that predates these fields moves.
     */
    const lines = ledgerFor(sessions, { setPosition: opts?.setPosition }).perSession;
    const heavyLowerDays = new Set(
      sessions.filter((s) => s.heavyLower && typeof s.day === 'number').map((s) => s.day as number),
    );
    const isLower = LOWER_MUSCLES.includes(muscle);
    const isUpper = UPPER_MUSCLES.includes(muscle);
    const ordered = lines
      .map((l, i) => ({ l, i, s: sessions[i] }))
      /**
       * ⛔⛔ FOURTEEN IS A COST, NOT A CAP — corrected 2026-09-01 after re-reading p86 with Michael.
       *
       * ⛔ HIS SENTENCE, IN FULL: *"A **highly taxing**, 14+ work set session may diminish
       * performance in other modalities significantly for twenty-four hours and still notably for up
       * to seventy-two hours. A less taxing 6 to 8 work set session may result in only marginal
       * performance deficits."* That is a cost curve with a qualifier on it. **He states no limit
       * anywhere**, and he wrote both that sentence and a programme whose own printed rows come to
       * sixteen and seventeen work sets a day — he does not consider his week to breach his advice.
       *
       * ⛔ WHAT THE HARD FILTER DID, MEASURED. It compared the count against fourteen and REFUSED,
       * so on this frame every session failed and a muscle sitting at ZERO stayed at zero — the
       * floor declining to do the one job it exists for, in the name of a limit its author never
       * set. Michael, reading the result: *"are we over programming?"* We were not; the code was
       * enforcing a number as a rule.
       *
       * ⚠️ THE PREFERENCE SURVIVES AND IS THE HONEST HALF. Rule 3 below still sorts the lightest
       * session first, so added work lands where it costs least — which is what the cost curve
       * actually supports.
       */
      // ⛔ RULE 0 — A TEST SESSION TAKES NOTHING. See `PlannedSession.isTest`. It runs first because
      // it is the only exclusion that does not depend on which muscle is being placed.
      .filter((x) => x.s.isTest !== true)
      // ⛔ RULE 1 — the day before a heavy lower day takes no lower-body fill.
      .filter((x) => !(isLower && typeof x.s.day === 'number' && heavyLowerDays.has(x.s.day + 1)))
      .sort((a, b) => {
        // ⛔ RULE 2 — region match first. A session with no stated region ranks between the two.
        const rank = (x: { s: PlannedSession }) => {
          if (!x.s.region) return 1;
          if (isLower) return x.s.region === 'lower' ? 0 : 2;
          if (isUpper) return x.s.region === 'upper' ? 0 : 2;
          return 1;
        };
        const d = rank(a) - rank(b);
        // ⛔ RULE 3 — then the lightest, which is the whole of what this used to be.
        return d !== 0 ? d : a.l.countedSets - b.l.countedSets;
      });
    if (ordered.length === 0) {
      unfilled.push({
        muscle,
        // ⚠️ REWORDED 2026-09-01. This said every session was "close enough to fourteen work sets",
        // which was the cap this path no longer enforces — fourteen is a cost, not a limit (p86).
        // What is left here is a genuine dead end: no session could take the slot at all.
        reason: 'No session on this week could take an added slot for it — every lifting day is '
          + 'either a test or already carries this movement pattern.',
      });
      continue;
    }
    const target = ordered[0];
    sessions[target.i].sets.push({ movement: chosen.movement, intent: 'HYP', sets: setsPerSlot });
    alreadyPrescribed.add(canonicalize(chosen.movement));
    added.push({
      muscle,
      movement: chosen.movement,
      // ⛔ RESOLVED HERE, WHERE THE MOVEMENT IS CHOSEN, so the plan builder never re-derives it and
      // the two cannot disagree about the same row.
      repPrescribable: isRepPrescribable(chosen.movement),
      sets: setsPerSlot,
      category: chosen.category,
      session: sessions[target.i].label,
      // ⛔ SO THE ROW CAN SAY WHOSE MOVEMENT IT IS. "Floor: core had nothing else this week" is the
      // right sentence for a movement the engine picked and the wrong one for a movement the athlete
      // asked for — and printing the wrong one is the defect this whole flag exists to close.
      fromAthletePick: preferred != null,
      reason: 'floor',
    });
  }

  // ── the Dial: the same search, aimed at a target instead of at zero ────────────────
  //
  // ⛔ IT RUNS AFTER THE FLOOR, DELIBERATELY. Every muscle gets its minimum before any muscle gets
  // its extra — a chip must never be able to spend the last room in the week on chest and leave the
  // quads at zero. Ordering IS the guarantee here; there is no second rule enforcing it.
  const targets = Object.entries(opts?.target ?? {})
    .map(([muscle, want]) => ({
      muscle: muscle as MuscleGroup,
      // ⛔ HIS BAND IS THE CEILING. See the `target` option's own note.
      want: Math.min(WEEKLY_SETS_SOLID.hi, Math.max(0, Math.round(Number(want) || 0))),
    }))
    .filter((t) => t.want > 0 && MUSCLE_GROUPS.includes(t.muscle));
  for (const { muscle, want } of targets) {
    const forMuscle = movementsForMuscle(muscle, opts?.equipment ?? null);
    /**
     * ⛔ A CHIP EXTENDS WHAT THE ATHLETE CHOSE — IT NEVER INTRODUCES A THIRD MOVEMENT (Michael,
     * 2026-08-24, ruled on core and applied to every chip).
     *
     * ⛔ THE DEFECT: `alreadyPrescribed` forces VARIETY, which is right for the FLOOR — filling a
     * gap by repeating adds sets without adding variety, and the source encourages rotation. Aimed
     * at a TARGET it is wrong: tapping Core on an athlete whose core pick was `crunch` built a week
     * of crunch + dead bug + bird dog, two of which they never chose. *"More of what I asked for"*
     * is what the control says it does.
     *
     * ⚠️ SO: THE PICK, PLUS AT MOST ONE COMPLEMENT, THEN REPEATS ON OTHER DAYS. Two distinct
     * movements is Michael's line — a complement is variety, a third is the engine picking for them.
     * ⚠️ Applied to every chip and not just core: the same sentence reads true of Glutes ("extra hip
     * thrust sets"), and a rule that held on one chip only is the asymmetry that invites a third.
     */
    const MAX_DISTINCT_PER_TARGET = 2;
    /**
     * ⛔ SEEDED FROM WHAT THE WEEK ALREADY HOLDS FOR THIS MUSCLE, INCLUDING THE FLOOR'S OWN ROW —
     * and that seeding is the whole fix, not a detail. The floor runs FIRST and places the athlete's
     * pick; an empty counter here meant the target loop believed the muscle had nothing, could not
     * re-select the pick (`alreadyPrescribed` holds it), and added TWO more movements on top. Three
     * distinct core movements, exactly what the cap exists to prevent.
     */
    const usedForMuscle: string[] = [...new Set(
      sessions
        .flatMap((sn) => sn.sets.map((x) => String(x.movement ?? '')))
        .filter((n) => n && musclesWorkedBy(n)?.primary === muscle)
        .map((n) => canonicalize(n)),
    )];
    /**
     * ⚠️ A BOUNDED LOOP, NOT A `while`. Each pass adds one slot, so the target is reachable in
     * `ceil(want / setsPerSlot)` passes and the guard is that number — a loop whose exit depends on
     * `ledgerFor` agreeing with the arithmetic is a loop that spins the day they disagree.
     */
    const passes = Math.ceil(want / Math.max(1, setsPerSlot));
    for (let pass = 0; pass < passes; pass++) {
      const led = ledgerFor(sessions, { setPosition: opts?.setPosition });
      const have = led.perMuscle.find((l) => l.muscle === muscle)?.sets ?? 0;
      if (have >= want) break;
      // ⛔ THE ATHLETE'S OWN CHOICE FIRST here too, then a movement the week does not already hold.
      const preferred = forMuscle.find((o) =>
        preferSet.has(canonicalize(o.name)) && !alreadyPrescribed.has(canonicalize(o.name)));
      // ⛔ REP-PRESCRIBABLE BEFORE A HOLD, THE SAME RULE THE FLOOR ABOVE FOLLOWS (2026-08-24). This
      // loop had its own copy of the choice and did NOT get the fix when the floor did — which is
      // how "Plank — 3 x 30-45s. Your core focus." survived one round of it. ⚠️ Two searches over
      // one candidate list: if you change the preference here, change it there.
      const freshT = forMuscle.filter((o) => !alreadyPrescribed.has(canonicalize(o.name)));
      // Once the muscle is at its cap, REPEAT one of its own movements rather than reach for a new
      // one. ⚠️ The repeat still lands on a session that does not already hold it — see `ordered`.
      const atCap = usedForMuscle.length >= MAX_DISTINCT_PER_TARGET;
      const repeat = atCap
        ? forMuscle.find((o) => usedForMuscle.includes(canonicalize(o.name)))
        : undefined;
      const pick = preferred
        ?? repeat
        ?? (atCap ? undefined : (freshT.find((o) => isRepPrescribable(o.name)) ?? freshT[0]));
      if (!pick) {
        // ⚠️ NOT `unfilled`. The muscle is above its floor — the week simply has no further
        // movement for it that it is not already doing, which is a stop, not a failure.
        break;
      }
      const ordered = led.perSession
        .map((l, i) => ({ l, i }))
        /**
         * ⛔ THE SAME LINE THE FLOOR RESPECTS, AND STRICTLY UNDER IT — measured, not assumed. This
         * read `<= 14` for one build and two chips took `ME: Upper` to exactly fourteen work sets,
         * which is the number p086 names as costing up to three days of other-discipline
         * performance. A ceiling you are allowed to land on is not a ceiling.
         */
        /**
       * ⛔ THE DIAL KEEPS THE COST TEST, AND THE FLOOR DOES NOT — the distinction is the point
       * (2026-09-01). The FLOOR fills a muscle sitting at ZERO: that is the one job it exists for,
       * and refusing it in the name of a number p86 never states as a limit left muscles unworked.
       * The DIAL is EXTRA volume on top of a week that is already complete, asked for by the athlete
       * — optional work, and optional work is exactly what a cost curve should steer. So a gap is
       * always filled and an addition lands only where there is room.
       */
      .filter((x) => x.l.countedSets + setsPerSlot < SESSION_SETS_COSTLY)
        // ⚠️ AND NOT ONTO A SESSION THAT ALREADY HOLDS THIS MOVEMENT. Two rows of one lift in one
        // session reads as the engine losing its place — the same defect `takenToday` guards in the
        // slot path. A repeat goes on a DIFFERENT day or it does not go.
        .filter((x) => !sessions[x.i].sets.some((y) => canonicalize(String(y.movement ?? '')) === canonicalize(pick.name)))
        .sort((a, b) => a.l.countedSets - b.l.countedSets);
      if (ordered.length === 0) break;
      const target = ordered[0];
      sessions[target.i].sets.push({ movement: pick.name, intent: 'HYP', sets: setsPerSlot });
      alreadyPrescribed.add(canonicalize(pick.name));
      if (!usedForMuscle.includes(canonicalize(pick.name))) usedForMuscle.push(canonicalize(pick.name));
      added.push({
        muscle,
        movement: pick.name,
        repPrescribable: isRepPrescribable(pick.name),
        sets: setsPerSlot,
        category: pick.category,
        session: sessions[target.i].label,
        fromAthletePick: preferred != null,
        reason: 'target',
      });
    }
  }

  if (added.some((a) => a.reason === 'floor')) {
    notes.push({
      kind: 'ours',
      text: 'Added one slot each for '
        + `${[...new Set(added.filter((a) => a.reason === 'floor').map((a) => a.muscle))].join(', ')}`
        + ', which the week left at zero. Every movement the athlete chose is untouched.',
    });
  }
  if (added.some((a) => a.reason === 'target')) {
    notes.push({
      kind: 'ours',
      text: 'Extra sets of 8 to 10 for '
        + `${[...new Set(added.filter((a) => a.reason === 'target').map((a) => a.muscle))].join(', ')}`
        + ', because you asked for them. They go on the lifting days with the most room left, and '
        + 'they stop at the source\'s own eight-to-twelve weekly range.',
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
