// ============================================================================
// THE GRID — pattern × category × intent, resolved against the athlete's own equipment.
//
// Give it a slot; get back a prescription and the movements that can fill it. Pure, no weeks, no
// days, no plan shape — the strength twin of the endurance library, and the same contract:
// client-reachable, importable through `@shared`, no Deno-only imports.
//
// ⛔ IT DOES NOT DECIDE WHICH SLOTS EXIST. The All Rounder's week names its slots and the composer
// (stage 4) reads them. This file answers "what fills this one", which is the question the week
// cannot answer for itself because only the athlete's equipment can.
//
// ⛔ NO SLOT MAY RESOLVE TO NOTHING. That is the gate, and {@link SUBSTITUTION_LADDER} is how it is
// met — one empty cell exists in our catalogue today (braced push upper) and a home-gym athlete
// empties several more, so a resolver that could return an empty list would fail on real inputs.
// ============================================================================

import {
  prescribe,
  REST_BETWEEN_SETS_RULE,
  REST_BETWEEN_SETS_RULE_HYP,
  RIR_NOTE,
  type Prescription,
  type ViadaIntent,
} from './intents.ts';
import {
  allGridMovements,
  canPerform,
  CATEGORY_DEFINITION,
  equipmentFitRank,
  isGearTagged,
  movementsIn,
  readsAsMachineBraced,
  type GridMovement,
  type ViadaCategory,
  type ViadaPattern,
} from './taxonomy.ts';
import { foldExerciseName, resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { LAST_RESORT_RANK_FLOOR, ownsLoadingImplement, athleteEquipmentToKeys, gearRoutesFor } from '../../../../src/lib/strength-gear.ts';

export type SlotNote = {
  kind: 'source' | 'inferred' | 'ours' | 'gap';
  text: string;
  cite?: string;
};

export type SlotRequest = {
  category: ViadaCategory;
  /** `null` only for `core` and `carry`, which his key does not split by pattern. */
  pattern: ViadaPattern | null;
  intent: ViadaIntent;
  /**
   * ⛔ THE MODIFIER, NOT A CATEGORY. "Braced push (asymmetrical)" is a braced push done one limb at
   * a time — there is no asymmetrical list to draw from, and asking for one here narrows the pool
   * within the category rather than switching to a sixth.
   */
  asymmetrical?: boolean;
  /** Declared strength-equipment chips. Absent or empty means "we have not asked", never "owns nothing". */
  equipment?: string[] | null;
  /** Where in his set band to sit. Absent = the low end, which is his stated default. See `setsFor`. */
  setPosition?: number;
};

export type ResolvedSlot = {
  request: SlotRequest;
  prescription: Prescription;
  /** ⛔ NEVER EMPTY. Best equipment fit first. */
  options: GridMovement[];
  /** The one a caller gets if it does not choose. */
  chosen: GridMovement;
  /** What had to be relaxed, if anything. `null` when the slot was filled exactly as asked. */
  substitution: null | {
    fromCategory: ViadaCategory;
    toCategory: ViadaCategory;
    droppedAsymmetrical: boolean;
    ungated: boolean;
    reason: string;
    cite: string;
  };
  notes: SlotNote[];
};

/**
 * ⛔ CATALOGUE STUBS, KEPT OUT OF WHAT AN ATHLETE IS OFFERED.
 *
 * `EXERCISE_CONFIG` holds bare keys — `press`, `bench`, `row`, `squat` — so that a plan naming a
 * movement loosely still resolves to a real prescription instead of fuzzy-matching. They are
 * load-bearing as KEYS and useless as OFFERS: "Press" is not a movement anybody can perform.
 *
 * ⚠️ They are excluded from the offered pool only. Nothing about their classification changes, and
 * `viadaCategoryOf('press')` still answers, because the composer may still hand one over.
 */
const OFFER_STOPLIST = new Set([
  'press', 'bench', 'row', 'rows', 'squat', 'squats', 'lunge', 'lunges',
  'incline bench', 'shoulder press', 'core work', 'core circuit', 'deadlift',
]);

/**
 * ⛔ THE SUBSTITUTION LADDER, AND WHICH RUNGS ARE HIS.
 *
 * His five categories form a ladder of external bracing: PRIMARY (free, cardinal plane) → SECONDARY
 * (free, variable plane) → BRACED (externally braced) → FOCUSED (single joint). A slot that cannot
 * be filled at its own rung is filled at the nearest one that shares the pattern.
 *
 * ⛔ **THE BRACED ↔ SECONDARY ROTATION IS HIS, STATED, AND IS THE ONLY RUNG THAT IS** (p275, read
 * off the image):
 *
 * > *"You can rotate the braced asymmetrical movements with secondary asymmetrical, but if you want
 * > to incorporate more asymmetrical movements, I encourage you to select those for the secondary
 * > movement that begins each day."*
 *
 * ⚠️ **EVERY OTHER RUNG IS OURS.** He licenses the rotation for the ASYMMETRICAL case specifically;
 * generalising it to every braced slot, and extending the ladder outward to primary and focused, is
 * an inference from his category definitions — not something he wrote. It is labelled `inferred` on
 * every slot it fires on, and the athlete is told which movement was substituted for which.
 *
 * ⚠️ CARRY AND CORE HAVE NO LADDER. A carry is a category of its own with its own intent meanings
 * (p226); nothing else can stand in for one, and a core movement is not a pressing slot. Where those
 * two cannot be filled, the slot says so rather than reaching for an unrelated movement.
 */
export const SUBSTITUTION_LADDER: Record<ViadaCategory, ViadaCategory[]> = {
  primary: ['primary', 'secondary', 'braced', 'focused'],
  secondary: ['secondary', 'primary', 'braced', 'focused'],
  braced: ['braced', 'secondary', 'primary', 'focused'],
  focused: ['focused', 'braced', 'secondary', 'primary'],
  carry: ['carry'],
  core: ['core'],
};

const OFFERABLE = (m: GridMovement) => !OFFER_STOPLIST.has(m.name);

/**
 * ⛔ IS THIS MOVEMENT'S LOAD THE ATHLETE'S OWN BODY — asked of `displayFormat`, the field that
 * already answers it, and not of a new flag.
 *
 * `ExerciseConfig.displayFormat` is how the logger decides what box to draw: `perHand` and `total`
 * draw a weight, `bodyweight` draws none because there is none. That IS the question here — a
 * movement drawn with no weight box carries no external load — so it is read rather than re-derived.
 *
 * ⚠️ `band` IS NOT BODYWEIGHT and is deliberately not folded in. A band is a real external load,
 * badly steppable, and {@link LAST_RESORT_RANK_FLOOR} already ranks it where it belongs. Two
 * judgements, two mechanisms, and merging them would demote a band twice.
 *
 * ⚠️ EXPORTED 2026-08-26 for `accessory-picks.ts`'s `requiresLoad` cells, which need the same
 * question answered one rung up — and needed it as a GATE rather than as the tiebreak `rank` applies
 * below. One owner of "does this movement carry external load", read by both.
 */
export function isBodyweightLoad(name: string): boolean {
  return resolveExerciseConfig(name).config?.displayFormat === 'bodyweight';
}

/**
 * Best equipment fit first, then loaded before bodyweight, then catalogue order.
 *
 * ⚠️ `equipmentFitRank` IS THE EXISTING OWNER of "which of these does this athlete reach most
 * naturally", and it already knows that a banded route is a last resort. Nothing is re-derived.
 *
 * ⛔ AND THE TIEBREAK UNDERNEATH IT IS THE 2026-08-24 DEVICE FINDING'S SECOND HALF. An UNTAGGED
 * movement has no route, so `equipmentFitRank` returns 0 for every one of them — a dumbbell rear
 * delt fly and `reverse flyes (bodyweight)` tie at zero, and **the catalogue's key order** decides.
 * That is not a decision, it is an accident, and it put a bodyweight fallback in a focused-pull slot
 * on a gym with dumbbells in it. `reverse flyes (bodyweight)`'s own config comment says what it is:
 * *"a BODYWEIGHT fallback — the thing the engine reaches for when the athlete owns nothing"*.
 *
 * ⚠️ IT ONLY FIRES FOR AN ATHLETE WHO OWNS SOMETHING TO LOAD WITH — {@link ownsLoadingImplement}.
 * A bodyweight athlete's whole catalogue is bodyweight, and demoting it would sort their real
 * options behind movements they cannot load at all. An athlete nobody asked is untouched (§0h).
 *
 * ⚠️ AND IT IS A TIEBREAK, NEVER A GATE. It moves nothing between fit tiers: a band-tier movement
 * still sorts below every loadable one whichever way it is drawn, and nothing is excluded.
 */
function rank(movements: GridMovement[], equipment: string[] | null | undefined): GridMovement[] {
  const demoteBodyweight = ownsLoadingImplement(equipment);
  return movements
    .map((m, i) => ({
      m,
      i,
      r: equipmentFitRank(m.name, equipment),
      bw: demoteBodyweight && isBodyweightLoad(m.name) ? 1 : 0,
    }))
    .sort((a, b) => {
      const ar = a.r == null ? Number.MAX_SAFE_INTEGER : a.r;
      const br = b.r == null ? Number.MAX_SAFE_INTEGER : b.r;
      if (ar !== br) return ar - br;
      if (a.bw !== b.bw) return a.bw - b.bw;
      return a.i - b.i;
    })
    .map((x) => x.m);
}

/**
 * ⛔ REACHABLE IS `canPerform`, PLUS ONE GUARD FOR THE UNTAGGED — and the version that stood here
 * before (tagged **and** performable) was a bug with a device report behind it.
 *
 * ⚠️ THE DEFECT, IN ONE LINE: **declaring MORE equipment bought a WORSE pick.** `ASSISTANCE_GEAR`
 * tags 52 of the ~316 catalogued movements, so requiring a tag emptied every cell of its untagged
 * rivals — `rear delt fly`, `chest fly`, most curls and extensions — and left whatever WAS tagged to
 * win by default. `lat pulldown` is tagged `[['cable'], ['bands']]`; a home-gym athlete with bands
 * and no cable stack therefore got a BAND-tier pulldown in a slot where a dumbbell movement was
 * sitting untagged and unconsidered (Michael, on device, 2026-08-24). With `equipment: null` the
 * same slot filled correctly, because the gate never ran.
 *
 * ⛔ STAGE 3 ALREADY SETTLED THIS ONE RUNG OVER, and this is the same ruling arriving on the slot
 * path: `accessory-dosing/ledger.ts:candidatesFor` gates on `canPerform` and ranks with
 * `equipmentFitRank`, after routing through the strict rule left CALVES unfillable for a
 * commercial-gym athlete (every calf movement is untagged). Its note — *"untagged movements pass
 * every real equipment gate"* — is the finding; the slot path had not been given it.
 *
 * ⚠️ AND THE ONE THING THE STRICT RULE WAS RIGHT ABOUT IS KEPT. Deleting the tag test outright
 * re-opens the case it existed for: an untagged `leg press` or `hack squat` prescribed to somebody
 * with a barbell in a garage, which the materialize backstop has a rule for only sometimes. So an
 * untagged movement is free UNLESS its NAME reads as machine-braced — {@link readsAsMachineBraced},
 * the taxonomy's own `BRACED_RE` asked a second question. Those stay ejected.
 *
 * ⚠️ A TAGGED MOVEMENT NEVER REACHES THE NAME TEST. A real gear tag is a better answer than a
 * regex, and `canPerform` is the one owner of reading it.
 *
 * ⚠️ UNDECLARED EQUIPMENT IS THE §0h CASE and short-circuits to true: unknown inventory means "we
 * have not asked", never "owns nothing".
 */
function reachable(name: string, equipment: string[] | null | undefined): boolean {
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return true;
  if (!canPerform(name, equipment)) return false;
  if (isGearTagged(name)) return true;
  return !readsAsMachineBraced(name);
}

function poolFor(
  category: ViadaCategory,
  pattern: ViadaPattern | null,
  asymmetrical: boolean,
  equipment: string[] | null | undefined,
  gated: boolean,
): GridMovement[] {
  let pool = movementsIn(category, pattern).filter(OFFERABLE);
  if (asymmetrical) pool = pool.filter((m) => m.asymmetrical);
  if (gated) pool = pool.filter((m) => reachable(m.name, equipment));
  return rank(pool, equipment);
}

/**
 * ⛔ FILL THE SLOT. Never returns an empty option list; throws only when the request itself is
 * incoherent (an unknown category, or a pattern asked of `core`/`carry`, which his key does not
 * split by pattern).
 */
export function resolveSlot(req: SlotRequest): ResolvedSlot {
  if (!SUBSTITUTION_LADDER[req.category]) {
    throw new Error(`unknown category: ${req.category}`);
  }
  const patternless = req.category === 'core' || req.category === 'carry';
  const pattern = patternless ? null : req.pattern;
  const asym = req.asymmetrical === true;
  const equipment = req.equipment ?? null;
  const notes: SlotNote[] = [];

  const prescription = prescribe(req.intent, req.category === 'carry' ? 'carry' : 'barbell', req.setPosition);

  let options: GridMovement[] = [];
  let substitution: ResolvedSlot['substitution'] = null;

  // ── Rung 0: exactly what was asked for. ───────────────────────────────────────────────────────
  options = poolFor(req.category, pattern, asym, equipment, true);

  // ── Rung 1: HIS OWN ROTATION, with the modifier intact. ───────────────────────────────────────
  //
  // ⛔ p275 IS ABOUT EXACTLY THIS CASE AND IS TRIED FIRST: *"You can rotate the braced asymmetrical
  // movements with secondary asymmetrical."* A braced-asymmetrical slot the athlete cannot reach
  // becomes a secondary-asymmetrical one — a split squat instead of a single-leg press — and that is
  // his instruction rather than our inference. Keeping the single-limb quality is the point of the
  // slot; dropping it (rung 1b) is the concession, so it comes second.
  if (options.length === 0 && asym && (req.category === 'braced' || req.category === 'secondary')) {
    const rotateTo: ViadaCategory = req.category === 'braced' ? 'secondary' : 'braced';
    options = poolFor(rotateTo, pattern, true, equipment, true);
    if (options.length > 0) {
      substitution = {
        fromCategory: req.category,
        toCategory: rotateTo,
        droppedAsymmetrical: false,
        ungated: false,
        reason: 'Braced and secondary asymmetrical movements are interchangeable — the source says so '
          + 'directly, and the single-limb quality of the slot is kept.',
        cite: 'Viada p275',
      };
      notes.push({
        kind: 'source',
        text: 'Rotating a braced asymmetrical movement with a secondary asymmetrical one is explicitly '
          + 'permitted.',
        cite: 'Viada p275',
      });
    }
  }

  // ── Rung 1b: drop the ASYMMETRICAL modifier, keeping the category. ─────────────────────────────
  //
  // ⚠️ OURS, AND IT IS A REAL CONCESSION — the athlete asked for single-limb work and is getting the
  // two-limb version. Said on the slot rather than swallowed.
  if (options.length === 0 && asym) {
    options = poolFor(req.category, pattern, false, equipment, true);
    if (options.length > 0) {
      substitution = {
        fromCategory: req.category,
        toCategory: req.category,
        droppedAsymmetrical: true,
        ungated: false,
        reason: 'No single-limb option in this category is reachable with the declared equipment, so '
          + 'the slot is filled with the two-limb version of the same category and pattern.',
        cite: 'ours',
      };
    }
  }

  // ── Rung 2+: walk the bracing ladder, same pattern. ────────────────────────────────────────────
  if (options.length === 0) {
    for (const alt of SUBSTITUTION_LADDER[req.category].slice(1)) {
      const found = poolFor(alt, pattern, false, equipment, true);
      if (found.length === 0) continue;
      options = found;
      const isHisRotation = (req.category === 'braced' && alt === 'secondary')
        || (req.category === 'secondary' && alt === 'braced');
      substitution = {
        fromCategory: req.category,
        toCategory: alt,
        droppedAsymmetrical: asym,
        ungated: false,
        reason: isHisRotation
          ? 'Braced and secondary movements are interchangeable here — the source says so directly.'
          : `Nothing in the ${req.category} category at this pattern is reachable with the declared `
            + `equipment, so the nearest category on the bracing ladder fills the slot.`,
        cite: isHisRotation ? 'Viada p275' : 'ours — an inference from his category definitions',
      };
      notes.push(
        isHisRotation
          ? { kind: 'source', text: 'Rotating a braced movement with a secondary one is explicitly permitted.', cite: 'Viada p275' }
          : {
            kind: 'inferred',
            text: 'The source permits rotating braced movements with secondary ones. Extending that to '
              + 'the other categories is our reading of his definitions, not something he wrote.',
            cite: 'Viada p275',
          },
      );
      break;
    }
  }

  // ── Last rung: offer it ungated rather than return nothing. ────────────────────────────────────
  //
  // ⛔ OFFER RATHER THAN HIDE, and that is this codebase's own standing rule rather than a new one:
  // `gearRoutesFor` says it in as many words — *"a false exclusion is worse than a false offer"*.
  // An athlete who is shown a movement they cannot set up can swap it; an athlete shown an empty
  // slot has a hole in their programme and no way to know what belonged there.
  if (options.length === 0) {
    for (const alt of SUBSTITUTION_LADDER[req.category]) {
      const found = poolFor(alt, pattern, false, equipment, false);
      if (found.length === 0) continue;
      options = found;
      substitution = {
        fromCategory: req.category,
        toCategory: alt,
        droppedAsymmetrical: asym,
        ungated: true,
        reason: 'Nothing at this pattern is reachable with the declared equipment. The movement is '
          + 'offered anyway rather than leaving the slot empty.',
        cite: 'ours',
      };
      notes.push({
        kind: 'ours',
        text: 'The declared equipment does not reach this movement. It is shown rather than dropped, '
          + 'so the slot can be swapped rather than silently disappearing.',
      });
      break;
    }
  }

  if (options.length === 0) {
    // Reachable only for a pattern/category pair the catalogue has never held — the gate asserts it
    // does not happen for any slot the All Rounder names, at any equipment subset.
    throw new Error(
      `no movement anywhere for ${req.category}/${pattern ?? 'any'} — the catalogue has no such cell`,
    );
  }

  // ── the notes every slot carries ──────────────────────────────────────────────────────────────
  const def = CATEGORY_DEFINITION[req.category];
  notes.unshift({ kind: 'source', text: def.text, cite: def.cite });
  notes.push({ kind: 'source', text: prescription.cite === undefined ? '' : RIR_NOTE, cite: 'Viada p219' });
  // ⛔ REST IS SOURCED, AND IT IS TWO DIFFERENT ANSWERS. p78 for strength (nearly full recovery,
  // no accumulating fatigue), p84 for hypertrophy (the drop-off IS the stimulus). This note was a
  // `gap` until 2026-08-27, asserting the book gave no rest guidance — see `intents.ts` for what
  // that assertion was and why it was wrong. ⚠️ Neither page gives minutes; a clock is still ours.
  // ⚠️ THE NOTE IS THE WHOLE THING — cue plus provenance. The two halves are separate fields so the
  // rest timer can print the cue alone beside its clock (2026-08-27); a note reader wants both.
  notes.push(
    req.intent === 'HYP'
      ? { kind: 'source', text: `${REST_BETWEEN_SETS_RULE_HYP.cue} ${REST_BETWEEN_SETS_RULE_HYP.provenance}`, cite: 'Viada p84' }
      : { kind: 'source', text: `${REST_BETWEEN_SETS_RULE.cue} ${REST_BETWEEN_SETS_RULE.provenance}`, cite: 'Viada p78' },
  );
  if (prescription.kind === 'barbell' && prescription.setsBand.lo !== prescription.setsBand.hi) {
    notes.push({
      kind: 'gap',
      text: `Sets start at ${prescription.setsBand.lo} and rise toward ${prescription.setsBand.hi} only `
        + 'when the athlete is progressing well with recovery to spare. The source gives that condition '
        + 'in words and no rule for evaluating it, so nothing here raises it on its own.',
      cite: 'Viada p218',
    });
  }
  if (req.category === 'carry') {
    notes.push({
      kind: 'source',
      text: 'Carries reuse the four intent names with different meanings — no reps and no percentage. '
        + 'Several also qualify as a hinge, pull or press during the pick.',
      cite: 'Viada p226',
    });
  }

  return { request: req, prescription, options, chosen: options[0], substitution, notes };
}

/**
 * ⛔ A MOVEMENT THE ATHLETE CAN ONLY REACH WITH A BAND SAYS SO ON THE PLAN.
 *
 * `equipmentFitRank` already knows the answer — a rank at or above {@link LAST_RESORT_RANK_FLOOR}
 * means every route this athlete satisfies runs through a band — and until now nothing said it out
 * loud. The row printed `lat pulldown` to somebody with no cable stack, which reads as an engine
 * that ignored the declared gym rather than one that found the only route left.
 *
 * ⛔ THE RENAMED STRING MUST RESOLVE EXACTLY, AND THAT IS D-322 (`GridMovement.name`'s own rule). A
 * name that only fuzzy-matches silently borrows another movement's ratio and display — `band tricep
 * pushdown` with no key of its own is priced at 0.56 of a BENCH PRESS. So a rename is only made when
 * `resolveExerciseConfig` answers `exact` or `folded`; anything else leaves the name alone, because
 * a mispriced row is worse than an unlabelled one.
 *
 * ⚠️ IT RENAMES NOTHING ELSE. Undeclared equipment, a loadable route, or a name that already says
 * band, and the movement comes back untouched.
 */
/**
 * WHAT THE ATHLETE WILL ACTUALLY DO, when his name for a movement names equipment they do not have.
 *
 * THE DEFECT (Michael, on the screen, 2026-08-29): "already seeing commercial gym exercises." His
 * p222 entry is "Rear delt machine" and the app offers it to a home athlete via the implement swap -
 * seated and chest-supported on an incline bench, the same position, only the load source differs.
 * Correct, and unreadable: the row said MACHINE to somebody who owns none.
 *
 * DISPLAY ONLY, AND THAT IS THE WHOLE DESIGN. His name stays canonical everywhere that stores, logs,
 * matches or cites. `pickOptions` already returns `name` and `display` separately and the picker
 * writes `value={o.name}` while showing `{o.display}`, so a changed display cannot reach the logger -
 * and if it ever did, logged sets would stop matching planned ones and the session would read as
 * unmatched.
 *
 * IT ONLY FIRES WHEN THE FREE-WEIGHT ROUTE IS THE ONE THAT RESOLVED. A movement whose only route is
 * the station is never offered to an athlete without one, so there is no wrong name to show; an
 * athlete WITH the station sees his name, because that is what they will use.
 */
export function executionName(name: string, equipment: string[] | null | undefined): string {
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return name;
  const free = EXECUTION_NAME[foldExerciseName(name)];
  if (!free) return name;
  /**
   * OWNING THE STATION IS THE TEST, not which route matched first. An athlete with both a machine
   * and dumbbells resolves to whichever route the table lists first, which says nothing about what
   * they will actually walk over to - and a gym member reading "Chest-Supported Rear Delt Raise" for
   * a movement they have the machine for is the same defect pointed the other way.
   */
  const keys = athleteEquipmentToKeys(equipment as string[]);
  const hasStation = gearRoutesFor(name).some((r) => r.includes('machine') && r.every((k) => keys.has(k)));
  return hasStation ? name : free;
}

/**
 * The free-weight execution of a movement he names for a machine, and WHICH route index is the
 * station one. Two entries, and both are movements the swap rule already passed - the position and
 * the joint action are unchanged, only the load source differs.
 *
 * A movement belongs here only when it already has a free-weight route in `ASSISTANCE_GEAR`. This
 * renames; it never widens what an athlete can reach.
 */
const EXECUTION_NAME: Record<string, string> = {
  /**
   * ⛔⛔ "BACK EXTENSION" IS NOT AN INSTRUCTION — Michael, 2026-08-30: *which version, and what does
   * a home athlete actually do?* There are four in common use — a 45-degree bench, a GHD, a flat
   * bench, and the floor — and the row said two words. The catalogue holds the GHD and the machine
   * versions under their own names, so this entry is by elimination the non-machine one, and its
   * gear route says which: `[['barbell']]`, the same anchor the kneel-and-lower family uses —
   * *"feet under a loaded bar, which is what most people actually do."* Its config is
   * `displayFormat: 'bodyweight'` at `ratio: 0.0`, so the bar is the ANCHOR and not the load.
   * ⚠️ THE ATHLETE WAS NEVER TOLD ANY OF THAT. This is the fact they need to perform the row, in
   * their own words, and it is display only — the canonical name is unchanged.
   */
  // ⚠️ PARENTHESES, NOT A DASH. The substitute mark appends " - for your gear", and two dashes in one
  // option read as a run-on: *"Back Extension - feet under a loaded bar - for your gear"*.
  'back extension': 'Back Extension (feet under a loaded bar)',
  /**
   * ⛔ THE BENCH EXECUTION, NAMED AS ONE (2026-08-30). `reverse hyper` and `reverse hyperextension`
   * read as the same movement and were the same route; p221's is the MACHINE, and this is the home
   * version — torso on the bench, hips at the edge, legs swinging, a dumbbell between the feet.
   * Naming it "Bench" is what stops an athlete reading it as the machine they do not own.
   * ⚠️ IT FIRES ALWAYS, not conditionally: this movement has no machine route, so `hasStation` is
   * never true for it and the bench name is the only one it ever shows. That is deliberate — it is
   * not an equipment fallback, it IS the movement.
   */
  'reverse hyper': 'Bench Reverse Hyper',
  // ⚠️ THE LOADED ONE SAYS BENCH TOO — without it an athlete reads "Weighted Reverse Hyper" and
  // pictures the machine with plates on it.
  'weighted reverse hyper': 'Weighted Bench Reverse Hyper',
  // Seated, chest against the pad, arms sweeping back - on an incline bench with dumbbells.
  'rear delt machine': 'Chest-Supported Rear Delt Raise',
  /**
   * ⛔⛔ THE CURL HAS A HOME EXECUTION AND THE NAME HAS TO SAY WHICH (2026-08-31). `leg curl` gained a
   * bench-and-dumbbell route so p223's hamstring curl is reachable without a stack — and it went on
   * showing as a bare *"Leg Curl"*, which to an athlete with no machine names a station they do not
   * own. Same defect and same fix as `back extension`: the row states the execution.
   * ⚠️ CONDITIONAL, like the rear delt above — an athlete WITH the machine sees the plain name,
   * because that is what they will walk over to.
   */
  /**
   * ⛔ HIS ROW SAID "Chest Supported Row" AND HE OWNS NO MACHINE (2026-08-31). It routes to dumbbells
   * on an incline bench for him — the same seated, chest-supported position, only the load source
   * differs — and the name never said which. ⚠️ Conditional: a gym member with the station sees the
   * plain name, because that is what they will walk over to.
   */
  'chest supported row': 'Chest-Supported Row (incline bench, dumbbells)',
  'leg curl': 'Leg Curl (lying, dumbbell between the feet)',
  'leg curls': 'Leg Curl (lying, dumbbell between the feet)',
  'lying leg curl': 'Leg Curl (lying, dumbbell between the feet)',
  'hamstring curl': 'Leg Curl (lying, dumbbell between the feet)',
  /**
   * ONE ENTRY, AND THE OTHER CANDIDATES WERE CHECKED AND LEFT OUT.
   * `seated calf raise` names no equipment - a home athlete reads it and does it with a dumbbell
   * across the knees without being told. `machine hip thrust`, `pec deck`, `leg extension` and
   * `pullover machine` have only a station route, so an athlete without one is never offered them
   * and there is no wrong name to show. The defect was specifically a MACHINE in the name of a
   * movement the athlete would do with free weights.
   */
};

export function bandRouteName(name: string, equipment: string[] | null | undefined): string {
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return name;
  const rank = equipmentFitRank(name, equipment);
  if (rank == null || rank < LAST_RESORT_RANK_FLOOR) return name;
  const key = foldExerciseName(name);
  if (/\bband\b/.test(key)) return name;
  for (const candidate of [BAND_NAME[key], `band ${name}`]) {
    if (!candidate) continue;
    const via = resolveExerciseConfig(candidate).via;
    if (via === 'exact' || via === 'folded') return candidate;
  }
  return name;
}

/**
 * ⚠️ WHERE `band ` + THE NAME IS NOT WHAT THE CATALOGUE CALLS IT. A banded pulldown is already in
 * `EXERCISE_CONFIG` as `band pull down`; minting `band lat pulldown` beside it would be a second
 * entry for one movement, which is the duplication this codebase keeps deleting. Everything not
 * listed here takes the `band ` prefix, and only if that resolves.
 */
const BAND_NAME: Record<string, string> = {
  'lat pulldown': 'band pull down',
  'lat pull down': 'band pull down',
  'lat pulldowns': 'band pull down',
};

/** Every cell of the grid, for a caller that wants to see the whole thing. */
export function gridCells(): { category: ViadaCategory; pattern: ViadaPattern | null; count: number }[] {
  const out: { category: ViadaCategory; pattern: ViadaPattern | null; count: number }[] = [];
  for (const m of allGridMovements()) {
    const hit = out.find((c) => c.category === m.category && c.pattern === m.pattern);
    if (hit) hit.count++;
    else out.push({ category: m.category, pattern: m.pattern, count: 1 });
  }
  return out;
}
