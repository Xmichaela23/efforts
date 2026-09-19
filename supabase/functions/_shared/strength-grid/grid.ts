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
  filingOf,
  STAND_INS,
  HIP_THRUST_STAND_IN,
  isAsymmetrical,
  equipmentFitRank,
  isGearTagged,
  movementsIn,
  type GridMovement,
  type ViadaCategory,
  type ViadaPattern,
} from './taxonomy.ts';
import { foldExerciseName, resolveExerciseConfig, SAME_MOVEMENT } from '../../../../src/lib/exercise-config.ts';
import { LAST_RESORT_RANK_FLOOR, ownsLoadingImplement, athleteEquipmentToKeys, gearRoutesFor, type GearKey } from '../../../../src/lib/strength-gear.ts';

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
    /** A marked stand-in on no page (`STAND_INS`, 2026-09-18). */
    standIn?: true;
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
 * ⛔ REACHABLE IS `canPerform`, AND A TAG IS REQUIRED — the strict rule, back for the reason it was
 * first written (2026-09-10).
 *
 * ⚠️ THE HISTORY, BECAUSE THIS LINE HAS FLIPPED TWICE. The strict rule (tagged AND performable) was
 * relaxed on 2026-08-24 when `ASSISTANCE_GEAR` tagged 52 of ~316 movements: requiring a tag emptied
 * every cell of its untagged rivals and a bands-owner was handed a band-tier pulldown while dumbbell
 * movements sat untagged and unconsidered. The relaxed rule admitted an untagged movement unless its
 * NAME read as machine-braced (`readsAsMachineBraced`) — a regex standing in for the tags that were
 * missing. The 2026-08-26 pass tagged the wider catalogue and, measured 2026-09-10, EVERY movement
 * the grid classifies now carries a tag (242 of 242; `standing-plan-home-kit.test.ts` pins it). The
 * reason for the relaxed rule is gone, and what it cost is real: an untagged movement was admitted
 * by default to an athlete who had declared a kit that could not do it.
 *
 * ⛔ SO: a declared kit admits a movement only when the catalogue SAYS what it needs and the kit has
 * it. An undeclared movement is refused, never admitted by default — the pin test is what keeps a
 * new catalogue row from silently disappearing from every gated cell.
 *
 * ⚠️ UNDECLARED EQUIPMENT IS THE §0h CASE and short-circuits to true: unknown inventory means "we
 * have not asked", never "owns nothing".
 *
 * ⚠️ `readsAsMachineBraced` is no longer consulted here. It stays exported from the taxonomy for the
 * tests that document the 2026-08-24 finding.
 */
function reachable(name: string, equipment: string[] | null | undefined): boolean {
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return true;
  if (!isGearTagged(name)) return false;
  return canPerform(name, equipment);
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
  // ⛔ ONE NAME, ONE MOVEMENT, ON THIS KIT (2026-09-18): two entries the kit does the same way (the name it will do,
  // `executionName`) are one option, in its own place in the builder's order. The one the page prints is kept (p222's
  // rear delt machine over the rear delt fly, p220's Romanian deadlift over its dumbbell version), so a pick naming it holds.
  const ranked: GridMovement[] = [];
  const at = new Map<string, number>();
  for (const m of rank(pool, equipment)) {
    const k = executionName(m.name, equipment).toLowerCase();
    const i = at.get(k);
    if (i == null) { at.set(k, ranked.length); ranked.push(m); continue; }
    if (filingOf(ranked[i].name)?.basis !== 'printed' && filingOf(m.name)?.basis === 'printed') {
      ranked.splice(i, 1);
      for (const [key, idx] of at) if (idx > i) at.set(key, idx - 1);
      at.set(k, ranked.length);
      ranked.push(m);
    }
  }
  // ⛔ THE PULL-UP LEADS THE PRIMARY PULL CELL (Michael, 2026-09-18) — p218 prints it first, and with the barbell
  // row filed beside it (p218) a week built the row twice and no vertical pull. Every other cell keeps its order.
  if (category === 'primary' && pattern === 'pull_upper') {
    const i = ranked.findIndex((m) => m.name === 'pull up');
    if (i > 0) ranked.unshift(...ranked.splice(i, 1));
  }
  return ranked;
}

/**
 * THE BUILDER'S OWN CELL, AS IS — the movements the definitions file under this heading and pattern, the ones the
 * athlete's kit reaches, in the builder's order. No substitution: an empty cell stays empty. Read by the logger's
 * Swap sheet (`standing-plan/swap-groups.ts`, 2026-09-18) so a swap offers what the builder can place, sorted the
 * same way.
 */
export function cellOptions(
  category: ViadaCategory,
  pattern: ViadaPattern | null,
  equipment: string[] | null | undefined,
): GridMovement[] {
  return poolFor(category, category === 'core' || category === 'carry' ? null : pattern, false, equipment, true);
}

/**
 * The barbell hip thrust as a marked stand-in, when the kit reaches neither hip thrust p223 prints; null otherwise
 * (`HIP_THRUST_STAND_IN`, Michael 2026-09-18).
 */
export function hipThrustStandIn(equipment: string[] | null | undefined): GridMovement | null {
  if (HIP_THRUST_STAND_IN.printed.some((n) => reachable(n, equipment))) return null;
  if (!reachable(HIP_THRUST_STAND_IN.name, equipment)) return null;
  return { name: HIP_THRUST_STAND_IN.name, category: 'focused', pattern: 'hinge_lower', asymmetrical: false, standIn: true };
}

/** The builder's own reach test (declared kit, gear-tagged movement), for a list the builder already chose. */
export function builderReaches(name: string, equipment: string[] | null | undefined): boolean {
  return reachable(name, equipment);
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
  // ── Rung 3: A MARKED STAND-IN (Michael, 2026-09-18). Nothing the pages file is reachable anywhere on the ladder,
  // so the smallest bodyweight or band movement the kit can do holds the slot, marked. OURS (`STAND_INS`).
  if (options.length === 0 && pattern) {
    const found = STAND_INS[pattern]
      .filter((name) => reachable(name, equipment))
      .map((name): GridMovement => ({ name, category: req.category, pattern, asymmetrical: isAsymmetrical(name), standIn: true }));
    if (found.length > 0) {
      options = [found[0]];
      substitution = {
        fromCategory: req.category,
        toCategory: req.category,
        droppedAsymmetrical: asym,
        ungated: false,
        standIn: true,
        reason: 'No movement the pages file for this slot is reachable with the declared equipment, so the '
          + 'smallest bodyweight or band movement the kit can do stands in, marked.',
        cite: 'ours',
      };
      notes.push({ kind: 'ours', text: 'A stand-in: no page prints a movement this kit can do for this slot.' });
    }
  }

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
      // The instruction only (2026-09-07). The provenance sentence is for whoever maintains the
      // number and read as talk about "the source" on an athlete's screen; the cite carries the page.
      ? { kind: 'source', text: REST_BETWEEN_SETS_RULE_HYP.cue, cite: 'Viada p84' }
      : { kind: 'source', text: REST_BETWEEN_SETS_RULE.cue, cite: 'Viada p78' },
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
  if (hasStation) return name;
  return byRoute(free, keys, name);
}

/**
 * ONE FREE-WEIGHT VERSION, OR ONE PER ROUTE (2026-09-10). A string is the name for every free route.
 * A list is tried in order and the first route the kit reaches names the row — the rear delt work
 * is chest-supported on an incline bench where there is one and bent-over where there is not, and
 * the row has to say which. No entry the kit reaches leaves the name alone.
 */
type ByRoute<T> = T | { route: GearKey[]; value: T }[];
function byRoute<T>(entry: ByRoute<T>, keys: Set<string>, fallback: T): T {
  if (!Array.isArray(entry)) return entry;
  const hit = entry.find((e) => e.route.every((k) => keys.has(k)));
  return hit ? hit.value : fallback;
}

/**
 * The free-weight execution of a movement he names for a machine, and WHICH route index is the
 * station one. Two entries, and both are movements the swap rule already passed - the position and
 * the joint action are unchanged, only the load source differs.
 *
 * A movement belongs here only when it already has a free-weight route in `ASSISTANCE_GEAR`. This
 * renames; it never widens what an athlete can reach.
 */
/**
 * 2026-09-08 (Michael, on the logger: "back extension is cut off and confusing, not sure how to do
 * it"): the setup came OUT of the name and into `EXECUTION_HOW_TO` below. A name that carries its
 * setup in parentheses overflows the box and still does not say how to do the movement. The name is
 * the plain movement again; the how-to travels on the row as `how_to` and the logger shows it behind
 * an (i) beside the name. Same gate as the name: only when the free-weight route is the one that
 * resolved.
 */
const EXECUTION_NAME: Record<string, ByRoute<string>> = {
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
  'back extension': 'Back Extension',
  /**
   * ⛔ THE LATERAL RAISE, NAMED FOR THE KIT WHEN THE PLAN IS BUILT (2026-09-17, clean-up batch item 3, option b). The
   * names are the ones materialize-plan's older equipment swap printed ("Dumbbell Lateral Raise", "Band Lateral
   * Raise"), moved here so the stored row, the step and every screen carry one name. Dumbbells first, as that swap
   * did. A cable-only kit keeps "Lateral Raise".
   */
  'lateral raise': [
    { route: ['dumbbells'], value: 'Dumbbell Lateral Raise' },
    { route: ['bands'], value: 'Band Lateral Raise' },
  ],
  /**
   * ⛔ THE GHD BACK EXTENSION ON A BACK EXTENSION BENCH (D-479, 2026-09-16) — "Back Extension", the name lifters
   * use. Shown only when the bench route resolved; a gym member who owns the station reads "GHD Back Extension".
   * Name approved by Michael 2026-09-16 night. It shares the floor version's name above; the clash check (every
   * frame, pick and six kits) found no list that holds both.
   */
  'ghd back extension': 'Back Extension',
  /**
   * ⛔ THE BENCH EXECUTION, NAMED AS ONE (2026-08-30). `reverse hyper` and `reverse hyperextension`
   * read as the same movement and were the same route; p221's is the MACHINE, and this is the home
   * version — torso on the bench, hips at the edge, legs swinging, a dumbbell between the feet.
   * Naming it "Bench" is what stops an athlete reading it as the machine they do not own.
   * ⚠️ IT FIRES ALWAYS, not conditionally: this movement has no machine route, so `hasStation` is
   * never true for it and the bench name is the only one it ever shows. That is deliberate — it is
   * not an equipment fallback, it IS the movement.
   */
  'reverse hyper': 'Reverse Hyper',
  // ⚠️ THE LOADED ONE SAYS BENCH TOO — without it an athlete reads "Weighted Reverse Hyper" and
  // pictures the machine with plates on it.
  'weighted reverse hyper': 'Weighted Reverse Hyper',
  'banded leg extension': 'Banded Leg Extension',
  // Seated, chest against the pad, arms sweeping back - on an incline bench with dumbbells.
  /**
   * ⚠️ "FLY", NOT "RAISE" (2026-09-01). Both name the movement; **fly is the word lifters search
   * for**, and an athlete who does not know it looks it up. A name that finds the wrong video, or
   * none, has failed at the only job a display name has.
   */
  /**
   * ⛔ TWO HOME VERSIONS (Michael, 2026-09-10 — `docs/WORKORDER-kill-ours-2026-09-09.md` addendum):
   * chest-supported on the incline bench where the kit has one, bent-over with dumbbells where it
   * does not. The kit decides; the canonical name stays his.
   */
  'rear delt machine': [
    { route: ['dumbbells', 'incline_bench'], value: 'Chest-Supported Rear Delt Fly' },
    { route: ['dumbbells'], value: 'Bent-Over Dumbbell Rear Delt Fly' },
  ],
  // ⛔ THE PULLOVER MACHINE'S HOME NAME IS GONE (2026-09-18): at home it is p220's DB pullover (`strength-gear.ts`).
  // ⛔ ONE NAME FOR ONE MOVEMENT AT HOME (Michael, 2026-09-18): on a dumbbell kit the Romanian deadlift IS the DB Romanian
  // deadlift, and a rear delt fly IS the bent-over dumbbell rear delt fly the rear delt machine becomes. Same words, one
  // option (the swap list shows a name once; the builder places a name once).
  'romanian deadlift': [
    { route: ['barbell'], value: 'Romanian Deadlift' },
    { route: ['dumbbells'], value: 'DB Romanian Deadlift' },
  ],
  'rear delt fly': [
    { route: ['dumbbells'], value: 'Bent-Over Dumbbell Rear Delt Fly' },
  ],
  // ⛔ ON A DUMBBELL KIT, THE DUMBBELL VERSION BY THAT NAME (Michael, 2026-09-18); with a barbell, his name.
  'stiff legged deadlift': [
    { route: ['barbell'], value: 'Stiff-Legged Deadlift' },
    { route: ['dumbbells'], value: 'Dumbbell Stiff-Legged Deadlift' },
  ],
  /**
   * ⛔ THE CONCENTRATION CURL (Michael, 2026-09-10 — the third home route in the same addendum:
   * "a bench, a rack and dumbbells is a pretty standard home gym"). The preacher curl's station
   * fixes the upper arm on a pad; at home the inner knee fixes it, seated on the bench, one arm at
   * a time. Same braced-arm biceps intent. Viada p275 permits the implement change (variety of
   * implements); the substitution itself is field-standard, not a page. The station route keeps
   * his name, because a gym member walks over to the preacher bench.
   */
  'preacher curl': 'Concentration Curl',
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
  'chest supported row': 'Chest-Supported Row',
  // ⛔ "Dumbbell Leg Curl" (Michael, 2026-09-11: "shouldn't these be called dumbbell leg curl for
  // this kit?"). The free route is the prone curl with a dumbbell between the feet (the how-to
  // below); the name says so, as the pullover and the concentration curl do. A kit with the machine
  // still sees "Leg Curl" — `executionName` keeps his name where the station is owned.
  'leg curl': 'Dumbbell Leg Curl',
  'leg curls': 'Dumbbell Leg Curl',
  'lying leg curl': 'Dumbbell Leg Curl',
  'hamstring curl': 'Dumbbell Leg Curl',
  /**
   * ONE ENTRY, AND THE OTHER CANDIDATES WERE CHECKED AND LEFT OUT.
   * `seated calf raise` names no equipment - a home athlete reads it and does it with a dumbbell
   * across the knees without being told. `machine hip thrust`, `pec deck` and `leg extension` have
   * only a station route, so an athlete without one is never offered them and there is no wrong
   * name to show (`pullover machine` gained a home route on 2026-09-10 and an entry above with it).
   * The defect was specifically a MACHINE in the name of a movement the athlete would do with free
   * weights.
   */
};

/**
 * ⛔ THE HOW-TO IS PART OF THE MOVEMENT (2026-09-18, Michael approved docs/DRAFT-how-tos-2026-09-18.md at c3f5076d,
 * word for word). Every movement a plan can print has one, on every kit, the main lifts included — until this date
 * the table held 14 entries and spoke only when the plan swapped a machine movement for a home one.
 *
 * ONE TABLE, ONE READER (`executionHowTo`). The composer writes the words onto the row as `how_to`; materialize-plan
 * and the logger's swap call the same reader; the phone shows what the row carries behind the (i) beside the name.
 *
 * KEYED BY THE MOVEMENT'S NAME ON THE ROW (folded). Where one name is done differently by kit the entry is a route
 * list, tried in order, first route the kit owns wins; with no declared kit, or none of the routes owned, the FIRST
 * entry answers. ⚠️ A STATION ROUTE IS ALWAYS LISTED FIRST, the same test `executionName` uses: an athlete who owns
 * the machine walks over to it and reads the machine's words ("Leg Curl"); without it they read the home version's
 * ("Dumbbell Leg Curl"). Band renames (`bandRouteName`) are keys of their own ("band pull down").
 *
 * EVERY ENTRY CARRIES ITS SOURCE — the page the steps were written from, read 2026-09-18 — and a row per source in
 * docs/STATE-SOURCES.md ("Exercise how-tos"). The words that predate this table (the home rear delt, pullover,
 * concentration curl, dumbbell leg curl, chest-supported row, back extension, reverse hypers, calf raise) are
 * Michael's, approved 2026-09-08/10/16, unchanged.
 */
type HowTo = { text: string; source: string };
const EXECUTION_HOW_TO: Record<string, ByRoute<HowTo>> = {
  'a skip': { text: 'Skip forward on the balls of your feet. On each skip, lift one knee until the thigh is level with your hip, then bring the foot straight back down under your hip. Swing the opposite arm with each knee. Switch legs on every skip.',
    source: 'NSCA Kinetic Select, "High Knee Drills" — https://www.nsca.com/education/articles/kinetic-select/high-knee-drills/' },
  'air squat': { text: 'Stand with your feet about shoulder-width apart, arms in front of you. Squat down until your thighs are at least parallel to the floor, keeping your chest up and your knees in line with your toes. Stand back up.',
    source: 'ExRx, "Squat" — https://exrx.net/WeightExercises/GluteusMaximus/BWSquat' },
  'archer push up': { text: 'Start in a push-up position with your hands much wider than your shoulders. Lower your chest toward one hand, bending that elbow while the other arm stays straight, then push back up. Alternate sides or do all reps on one side, then the other.',
    source: 'ExRx, "Archer Push-up" — https://exrx.net/WeightExercises/PectoralSternal/BWArcherPushup' },
  'arnold press': { text: 'Sit on a bench with the back upright, holding a dumbbell in each hand in front of your shoulders, palms facing you. Press the dumbbells up while turning your palms to face forward, until your arms are straight overhead. Reverse the turn on the way down.',
    source: 'ExRx, "Dumbbell Arnold Press" — https://exrx.net/WeightExercises/DeltoidAnterior/DBArnoldPress' },
  'b skip': { text: 'Skip forward as for an A-skip. At the top of each knee lift, straighten the leg out in front of you. Pull the foot down and back so it brushes the ground backwards as it lands under you. Swing your arms as you do when running.',
    source: 'Adam Hodges, PhD (USAT coach) / TrainingPeaks, "8 Running Drills to Improve Your Running Form" — https://www.trainingpeaks.com/blog/drills-for-proper-running-form/; Viada p227 names it' },
  'back extension': { text: 'Lie face down on the floor with your feet hooked under a loaded barbell. Hands behind your head or across your chest. Raise your chest and shoulders off the floor as far as you can, pause, then lower. Keep your feet down and your neck in line with your back.',
    source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' },
  'back squat': { text: 'Set the bar across your upper back, below the bony part of your neck, and stand with feet about shoulder-width apart, toes turned slightly out. Take a breath and hold it, then bend at the hips and knees together until your thighs are at least parallel to the floor. Stand back up. Keep your chest up and your knees in line with your toes.',
    source: 'ExRx, "Barbell Squat" — https://exrx.net/WeightExercises/Quadriceps/BBSquat' },
  'band lateral raise': { text: 'Stand on the middle of a band with both feet and hold the ends at your sides with an overhand grip. Lift your hands to shoulder height, pause, then lower them slowly.',
    source: 'Shane McLean, CPT / Garage Gym Reviews, "An At-Home Upper-Body Resistance Band Workout" (Lateral Raise) — https://www.garagegymreviews.com/upper-body-resistance-band-workout' },
  'band lateral walk': { text: 'Stand on the middle of a band and hold one end in each hand at your hips, ends crossed. Step sideways with your legs straight and your trunk still, keeping the band tight. Take the set number of steps one way, then the other.',
    source: 'ACE, "Walking Abduction" — https://www.acefitness.org/resources/everyone/exercise-library/290/walking-abduction/' },
  'band leg curl': { text: 'Anchor a band low in front of you and loop it around one ankle. Lie face down on the floor and curl your heel toward your glutes against the band, pause, then lower it slowly. Do all reps on one leg, then the other.',
    source: 'ACE, "Prone (Lying) Hamstring Curl" — https://www.acefitness.org/resources/everyone/exercise-library/131/prone-lying-hamstrings-curl/' },
  'band pull down': { text: 'Anchor a band high, on a pull-up bar or over the top of a closed door. Stand, or kneel if the anchor is low, holding the band\'s loop with your hands apart and your arms straight above your head. Pull your elbows down toward your back pockets until the band reaches your chin. Let the band pull your arms back up slowly.',
    source: 'Alex Polish, ACE-CPT / BarBend, "11 Lat Pulldown Variations" (Resistance Band Lat Pulldown) — https://barbend.com/lat-pulldown-variations/' },
  'band tricep pushdown': { text: 'Anchor a band high and face it, feet together and elbows at your sides. Keep your chest up and your back flat, hips angled slightly forward. Push the band down until your arms are straight, keeping your elbows slightly in front of your shoulders. Let it come back up slowly.',
    source: 'Mike Dewar / BarBend, "The 15 Best Tricep Exercises" (Triceps Pushdown) — https://barbend.com/best-triceps-exercises/' },
  'banded leg extension': { text: 'Loop a band around one ankle with the anchor behind you and stand with your feet hip-width apart, holding something for balance. Lift the looped foot 1 to 2 inches off the floor. Straighten your knee against the band without leaning your hips or torso back. Lower your leg slowly.',
    source: 'ACE, "Standing Leg Extension" — https://www.acefitness.org/resources/everyone/exercise-library/133/standing-leg-extension/' },
  'barbell row': { text: 'Hold the bar with your hands just wider than your legs. Bend at the hips until your torso is close to parallel with the floor, knees slightly bent, back flat. Pull the bar to your lower chest, then lower it until your arms are straight. Keep your torso still.',
    source: 'ExRx, "Barbell Bent-over Row" — https://exrx.net/WeightExercises/BackGeneral/BBBentOverRow' },
  'behind the neck db triceps extension': { text: 'Sit or stand holding one dumbbell in both hands straight overhead. Bend your elbows to lower the dumbbell behind your head, keeping your elbows pointing up, then straighten your arms to lift it back up.',
    source: 'ExRx, "Dumbbell Triceps Extension" — https://exrx.net/WeightExercises/Triceps/DBTriExt' },
  'bench press': { text: 'Lie on a flat bench with your eyes under the bar and your feet flat on the floor. Grip the bar a little wider than shoulder-width and lift it off the rack. Lower it to the middle of your chest, then press it back up until your arms are straight. Keep your hips on the bench.',
    source: 'ExRx, "Barbell Bench Press" — https://exrx.net/WeightExercises/PectoralSternal/BBBenchPress' },
  'bent over row': [
    { route: ['barbell'], value: { text: 'Hold the bar with your hands just wider than your legs. Bend at the hips until your torso is close to parallel with the floor, knees slightly bent, back flat. Pull the bar to your lower chest, then lower it until your arms are straight. Keep your torso still.',
      source: 'ExRx, "Barbell Bent-over Row" — https://exrx.net/WeightExercises/BackGeneral/BBBentOverRow' } },
    { route: ['dumbbells'], value: { text: 'Stand with your feet shoulder-width apart and a dumbbell in each hand, palms facing each other. Bend at the hips, knees slightly bent, until your torso is at about 45 degrees to the floor. Pull the dumbbells up until your elbows are bent to 90 degrees, squeezing your shoulder blades together. Lower them slowly.',
      source: 'Christopher Covello, checked by Erin Chancer, CPT / Garage Gym Reviews, "Bent-Over Dumbbell Rows" — https://www.garagegymreviews.com/dumbbell-rows' } },
  ],
  'bodyweight lunges': { text: 'Step forward with one foot and lower your back knee toward the floor until both knees are bent at about 90 degrees. Push through the front foot and bring your back foot forward into the next step. Keep your torso upright.',
    source: 'ExRx, "Walking Lunge" — https://exrx.net/Stretches/Miscellaneous/WalkingLunge' },
  'bodyweight squat': { text: 'Stand with your feet about shoulder-width apart, arms in front of you. Squat down until your thighs are at least parallel to the floor, keeping your chest up and your knees in line with your toes. Stand back up.',
    source: 'ExRx, "Squat" — https://exrx.net/WeightExercises/GluteusMaximus/BWSquat' },
  'bounding': { text: 'Jog a few steps, then push off one foot and lift the other knee until the thigh is level with your hip. Stay in the air as long as you can and land on that front foot. Push off it straight into the next bound. Swing both arms forward on each bound.',
    source: 'ExRx, "Alternate Bound" — https://exrx.net/Plyometrics/AlternateBoundDoubleArm' },
  'box step up': { text: 'Stand facing a box or bench about knee height. Put one foot fully on it and push through that foot to stand up on the box, then step back down with the same leg you stepped up with last. Do all reps on one leg, then the other.',
    source: 'ExRx, "Dumbbell Step-up" — https://exrx.net/WeightExercises/GluteusMaximus/DBStepUp' },
  'bulgarian split squat': { text: 'Stand a stride in front of a bench and put the top of your back foot on it. Lower your back knee toward the floor until your front thigh is about parallel to the floor, then push back up through the front foot. Keep your front knee in line with your toes. Do all reps on one leg, then the other.',
    source: 'ExRx, "Single Leg Split Squat" — https://exrx.net/WeightExercises/GluteusMaximus/BWSingleLegSplitSquat' },
  'cable crossover': { text: 'Stand between two high pulleys holding a handle in each hand, leaning forward slightly with your hips and knees a little bent. With a slight bend in your elbows, bring the handles together in front of you in a hugging motion. Let them go back out until you feel a stretch across your chest. Keep the same bend in your elbows on every rep.',
    source: 'ExRx, "Cable Isolateral Standing Fly" — https://exrx.net/WeightExercises/PectoralSternal/CBStandingFly' },
  'cable curls': { text: 'Stand facing a low pulley or standing on a band, holding the handle or band with your palms up and arms straight. Curl your hands up toward your shoulders, then lower them until your arms are straight. Keep your elbows at your sides.',
    source: 'ExRx, "Cable Curl"; ACE, "Standing Bicep Curl" (band) — https://exrx.net/WeightExercises/Biceps/CBCurl' },
  'calf raise': { text: 'Stand with the balls of both feet on a step or a plate, heels hanging off. Rise onto your toes as high as you can, pause, then lower your heels below the step. Bodyweight, both legs at once.',
    source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' },
  'calf raises': { text: 'Stand with the balls of both feet on a step or a plate, heels hanging off. Rise onto your toes as high as you can, pause, then lower your heels below the step. Bodyweight, both legs at once.',
    source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' },
  'chest fly': [
    { route: ['dumbbells'], value: { text: 'Lie on a flat bench with a dumbbell in each hand above your chest, palms facing each other and a slight bend in your elbows. Lower the dumbbells out to your sides in a wide arc until you feel a stretch across your chest. Bring them back together over your chest. Keep the same bend in your elbows on every rep.',
      source: 'ExRx, "Dumbbell Fly" — https://exrx.net/WeightExercises/PectoralSternal/DBFly' } },
    { route: ['cable'], value: { text: 'Stand between two high pulleys holding a handle in each hand, leaning forward slightly with your hips and knees a little bent. With a slight bend in your elbows, bring the handles together in front of you in a hugging motion. Let them go back out until you feel a stretch across your chest. Keep the same bend in your elbows on every rep.',
      source: 'ExRx, "Cable Isolateral Standing Fly" — https://exrx.net/WeightExercises/PectoralSternal/CBStandingFly' } },
    { route: ['bands'], value: { text: 'Wrap a band around a rack or post at chest height and hold one end in each hand, arms out to your sides. Step forward until the band is tight, with a slight bend in your elbows. Bring your hands together in front of you, then let them go back out slowly.',
      source: 'Stephen Sheehan, CPT / Garage Gym Reviews, "10 Best Cable Fly Alternatives" (Resistance Band Fly) — https://www.garagegymreviews.com/cable-fly-alternatives' } },
  ],
  'chest flyes': [
    { route: ['dumbbells'], value: { text: 'Lie on a flat bench with a dumbbell in each hand above your chest, palms facing each other and a slight bend in your elbows. Lower the dumbbells out to your sides in a wide arc until you feel a stretch across your chest. Bring them back together over your chest. Keep the same bend in your elbows on every rep.',
      source: 'ExRx, "Dumbbell Fly" — https://exrx.net/WeightExercises/PectoralSternal/DBFly' } },
    { route: ['cable'], value: { text: 'Stand between two high pulleys holding a handle in each hand, leaning forward slightly with your hips and knees a little bent. With a slight bend in your elbows, bring the handles together in front of you in a hugging motion. Let them go back out until you feel a stretch across your chest. Keep the same bend in your elbows on every rep.',
      source: 'ExRx, "Cable Isolateral Standing Fly" — https://exrx.net/WeightExercises/PectoralSternal/CBStandingFly' } },
    { route: ['bands'], value: { text: 'Wrap a band around a rack or post at chest height and hold one end in each hand, arms out to your sides. Step forward until the band is tight, with a slight bend in your elbows. Bring your hands together in front of you, then let them go back out slowly.',
      source: 'Stephen Sheehan, CPT / Garage Gym Reviews, "10 Best Cable Fly Alternatives" (Resistance Band Fly) — https://www.garagegymreviews.com/cable-fly-alternatives' } },
  ],
  'chest supported row': [
    { route: ['machine'], value: { text: 'Set the seat so the chest pad is at your chest and the handles are just within reach with your arms straight. Pull the handles to your ribs until your elbows are behind your back, pulling your shoulders back. Let them go back until your arms are straight. Keep your chest on the pad.',
      source: 'ExRx, "Lever Seated Row" — https://exrx.net/WeightExercises/BackGeneral/LVSeatedRow' } },
    { route: ['dumbbells', 'incline_bench'], value: { text: 'Set a bench to about 45 degrees and lie chest down on it with a dumbbell in each hand, arms hanging. Row both dumbbells to your ribs, squeezing your shoulder blades together, then lower until your arms are straight. Keep your chest on the bench.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'close grip bench press': { text: 'Set up as for the bench press, but grip the bar with your hands about shoulder-width apart. Lower it to the lower part of your chest, keeping your elbows close to your sides, then press it back up until your arms are straight.',
    source: 'ExRx, "Barbell Close Grip Bench Press" — https://exrx.net/WeightExercises/Triceps/BBCloseGripBenchPress' },
  'db floor press': { text: 'Lie face up on the floor with a dumbbell in each hand and your feet on the floor or your legs straight. Press the dumbbells up until your arms are straight. Lower them until your upper arms lightly touch the floor, elbows at about 45 degrees from your body. Press them back up without bouncing off the floor.',
    source: 'Shane McLean, CPT / Garage Gym Reviews, "How To Do The Floor Press Exercise" — https://www.garagegymreviews.com/floor-press-exercise' },
  'db pullover': { text: 'Lie on your back on a flat bench, feet on the floor, holding one dumbbell in both hands above your chest. With a slight bend in the elbows, lower the dumbbell in an arc behind your head until you feel a stretch, then pull it back over your chest. Keep your hips down on the bench.',
    source: 'ExRx, "Dumbbell Pullover" — https://exrx.net/WeightExercises/PectoralSternal/DBPullover' },
  'db swings': { text: 'Stand over the weight with your feet wide and toes turned slightly out, and lift it just off the floor with straight arms: a dumbbell held by the top with a hand on each side, or a kettlebell by the handle. Bend slightly at the hips until your forearms touch your inner thighs. Straighten your hips and knees straight away so the weight rises to between upper chest and head height. Let it fall forward and swing back between your legs, bending your knees, and repeat.',
    source: 'ExRx, "Dumbbell Low Swing" — https://exrx.net/WeightExercises/Power/DBLowSwing; ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'deadlift': { text: 'Stand with the bar over the middle of your feet, feet about hip-width apart. Bend down and grip the bar just outside your legs, shins touching the bar, back flat. Stand up by pushing the floor away, keeping the bar close to your legs, until your hips and knees are straight. Lower it the same way.',
    source: 'ExRx, "Barbell Deadlift" — https://exrx.net/WeightExercises/ErectorSpinae/BBDeadlift' },
  'decline push up': { text: 'Place your feet on a bench or box and your hands on the floor a little wider than your shoulders, body in a straight line. Lower your chest to just above the floor, then push back up. Keep your hips in line with your shoulders.',
    source: 'ExRx, "Decline Push-up" — https://exrx.net/WeightExercises/PectoralClavicular/BWDeclinePushup' },
  'diamond push up': { text: 'Start in a push-up position with your hands close together under your upper chest, thumbs and first fingers forming a diamond. Lower your chest toward your hands, keeping your elbows close to your sides. Push back up, moving your whole body at once.',
    source: 'Norman Cheung / BarBend, "How to Do the Diamond Push-Up" — https://barbend.com/diamond-push-up/' },
  'dip machine': { text: 'Sit with your back against the pad and grip the handles, in the narrow position if the machine has one, elbows pointing back. Push the handles down until your arms are straight. Let them come back up, elbows still pointing back, until you feel a slight stretch in your shoulders.',
    source: 'ExRx, "Lever Triceps Dip" — https://exrx.net/WeightExercises/Triceps/LVTriDip' },
  'dips': { text: 'Hold yourself up on parallel bars with your arms straight. Lower yourself by bending your elbows until your upper arms are about parallel to the floor, leaning your chest slightly forward. Push back up until your arms are straight.',
    source: 'ExRx, "Chest Dip" — https://exrx.net/WeightExercises/PectoralSternal/BWChestDip' },
  'drag curl': { text: 'Stand with your feet shoulder-width apart, knees slightly bent and hips back a little, holding a barbell or dumbbells at arm\'s length with your palms facing forward. Pull your shoulder blades back and down. Curl the weight up while pulling your elbows back, keeping the weight close to your body. Lower it slowly until your arms are straight.',
    source: 'Eric Bugera, CSCS / BarBend, "How to Do the Drag Curl to Build Your Arms" — https://barbend.com/drag-curl/' },
  'dumbbell bench press': { text: 'Lie on a flat bench with a dumbbell in each hand above your chest, palms facing your feet, feet flat on the floor. Lower the dumbbells to the sides of your chest, elbows at about 45 degrees from your body. Press them back up until your arms are straight.',
    source: 'ExRx, "Dumbbell Bench Press" — https://exrx.net/WeightExercises/PectoralSternal/DBBenchPress' },
  'dumbbell incline press': { text: 'Set the bench to about 30 to 45 degrees and lie back with a dumbbell in each hand at your shoulders. Press the dumbbells up over your upper chest until your arms are straight, then lower them back to your shoulders.',
    source: 'ExRx, "Dumbbell Incline Bench Press" — https://exrx.net/WeightExercises/PectoralClavicular/DBInclineBenchPress' },
  'dumbbell lateral raise': { text: 'Stand with a dumbbell in each hand at your sides. With a slight bend in the elbows, raise both dumbbells out to the sides until they are level with your shoulders, then lower them slowly. Do not swing your body.',
    source: 'ExRx, "Dumbbell Lateral Raise" — https://exrx.net/WeightExercises/DeltoidLateral/DBLateralRaise' },
  'dumbbell row': { text: 'Put one knee and the same-side hand on a flat bench, back flat, and hold a dumbbell in the other hand with the arm hanging straight. Pull the dumbbell to your hip, then lower it until your arm is straight. Do all reps on one arm, then the other.',
    source: 'ExRx, "Dumbbell Bent-over Row" — https://exrx.net/WeightExercises/BackGeneral/DBBentOverRow' },
  'dumbbell swing': { text: 'Stand over the weight with your feet wide and toes turned slightly out, and lift it just off the floor with straight arms: a dumbbell held by the top with a hand on each side, or a kettlebell by the handle. Bend slightly at the hips until your forearms touch your inner thighs. Straighten your hips and knees straight away so the weight rises to between upper chest and head height. Let it fall forward and swing back between your legs, bending your knees, and repeat.',
    source: 'ExRx, "Dumbbell Low Swing" — https://exrx.net/WeightExercises/Power/DBLowSwing; ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'explosive step up': { text: 'Stand with one foot on a box and the other on the floor, leaning forward from the hips. Push through the foot on the box and jump straight up until your hips, knees and ankles are straight. Land with the same foot on the box and the other on the floor, and go into the next rep.',
    source: 'ACE, "Single Leg Push-off" — https://www.acefitness.org/resources/everyone/exercise-library/230/single-leg-push-off/' },
  'external rotation': [
    { route: ['bands'], value: { text: 'Tie a band at waist height to a post or door handle and stand side-on to it, feet shoulder-width apart and knees slightly bent. Hold the band in the hand farther from the post, elbow against your side and bent to 90 degrees, hand close to your chest. Move your hand away from your body as far as is comfortable, keeping your elbow at your side. Return slowly to the start.',
      source: 'Massachusetts General Hospital Sports Physical Therapy, "Shoulder Rotator Cuff and Scapular Strengthening Program" (External Rotation) — https://web.archive.org/web/2026/https://www.massgeneral.org/assets/MGH/pdf/orthopaedics/sports-medicine/physical-therapy/mass-general-shoulder-twelve-strengthening-program.pdf; the 90 degrees from Tomah Memorial Hospital Physical Therapy (E. Bender, MSPT, CSCS; W. Gnewikow, DPT) / MSD Manual, "Standing Resisted Shoulder External Rotation" — https://www.msdmanuals.com/professional/multimedia/video/standing-resisted-shoulder-external-rotation' } },
    { route: ['dumbbells'], value: { text: 'Lie on your side with a light dumbbell in your top hand, elbow bent at 90 degrees and pressed against your side, forearm across your stomach. Lift the dumbbell by turning your forearm up until it points at the ceiling, then lower it slowly. Do all reps on one arm, then the other.',
      source: 'ExRx, "Dumbbell Lying Shoulder External Rotation" — https://exrx.net/WeightExercises/Infraspinatus/DBLyingExternalRotation' } },
    { route: ['cable'], value: { text: 'Set a pulley at elbow height and stand side-on to it, holding the handle in the hand farther from the machine. Keep that elbow bent at 90 degrees and pressed against your side. Turn your forearm out away from your body as far as you can, then return slowly.',
      source: 'ExRx, "Cable Standing Shoulder External Rotation" — https://exrx.net/WeightExercises/Infraspinatus/CBStandingExternalRotation' } },
  ],
  'farmers carry': { text: 'Pick up a heavy dumbbell or kettlebell in each hand and stand up straight, weights at your sides. Walk for the set distance, turn around, and walk back. Keep your back straight and do not let the weights swing.',
    source: 'ACE, "Farmer\'s Carry" — https://www.acefitness.org/resources/everyone/exercise-library/359/farmer-s-carry/' },
  'freestanding barbell calf raise': { text: 'Stand with a barbell across your upper back, feet hip-width apart on the floor or on a plate. Rise onto your toes as high as you can, pause, then lower your heels slowly. Keep your knees straight.',
    source: 'ExRx, "Barbell Standing Leg Calf Raise" — https://exrx.net/WeightExercises/Gastrocnemius/BBStandingCalfRaise' },
  'front squat': { text: 'Set the bar in a rack at upper chest height and rest it on the front of your shoulders. Cross your arms and put your hands on top of the bar, upper arms parallel to the floor. Squat down, bending your hips back and your knees forward, until your thighs are just past parallel. Stand back up until your legs are straight.',
    source: 'ExRx, "Barbell Front Squat" — https://exrx.net/WeightExercises/GluteusMaximus/BBFrontSquat' },
  'ghd back extension': { text: 'Set the hip pad just below your hip bones. Hook your ankles under the ankle pads. Cross your arms over your chest. Bend at the hips and lower your chest toward the floor. Raise your torso until your body is in a straight line. Do not arch past a straight line at the top.',
    source: 'FIELD — Healthline, LiveLeanTV, Fitness Volt, REP Fitness; ledger row "GHD back extension on a back extension bench" in docs/STATE-SOURCES.md' },
  'glute bridge': { text: 'Lie on your back with your knees bent and your feet flat on the floor, hip-width apart. Push through your heels and lift your hips until your body is in a straight line from knees to shoulders. Lower your hips back to the floor.',
    source: 'ACE, "Glute Bridge" — https://www.acefitness.org/resources/everyone/exercise-library/49/glute-bridge/' },
  'glute ham raise': { text: 'Kneel on a pad with your ankles held under a stable anchor or by a partner, hips straight and arms crossed over your chest. Lean forward as slowly as you can, keeping a straight line from knees to shoulders. When you can no longer hold it, catch yourself in a push-up position. Push off lightly and pull yourself back up with your hamstrings.',
    source: 'Eric Bugera, CSCS / BarBend, "How to Do the Nordic Curl" — https://barbend.com/nordic-curl/' },
  'goblet squat': { text: 'Hold a dumbbell or kettlebell against your chest with both hands, feet a little wider than your hips. Squat down until your thighs are at least parallel to the floor, keeping your chest up and your elbows inside your knees. Stand back up.',
    source: 'ExRx, "Kettlebell Goblet Squat" — https://exrx.net/WeightExercises/Kettlebell/KBGobletSquat' },
  'good morning': { text: 'Stand with a barbell across your upper back, knees slightly bent. Push your hips back and lean forward with a flat back until your torso is close to parallel with the floor, then stand back up.',
    source: 'ExRx, "Barbell Good-morning" — https://exrx.net/WeightExercises/Hamstrings/BBGoodMorning' },
  'gorilla row': { text: 'Place two dumbbells or kettlebells on the floor between your feet, feet wider than your shoulders. Bend at the hips until your torso is close to parallel with the floor and grip both. Pull one to your hip while the other stays on the floor, lower it, then pull the other. Keep your back flat.',
    source: 'NSCA PTQ 9.4, "Resistance Training Progressions for the Older Adult: Pulls and Rows" — https://www.nsca.com/contentassets/1cf6f81b246549cfa07473dbd8516ff1/ptq-9.4.3-resistance-training-progressions-for-the-older-adult-pulls-and-rows.pdf' },
  'ground based deadlift machine': { text: 'Stand on the platform between the handles, feet about hip-width apart. Bend at the hips and knees and grip the handles, back flat. Stand up by pushing the floor away until your hips and knees are straight, then lower back down the same way.',
    source: 'ExRx, "Lever Deadlift" — https://exrx.net/WeightExercises/ErectorSpinae/LVDeadlift' },
  'hack squat': { text: 'Stand on the platform with your back against the pad and your shoulders under the shoulder pads, feet about shoulder-width apart. Release the handles and lower yourself until your thighs are at least parallel to the platform, then push back up.',
    source: 'ExRx, "Sled Hack Squat" — https://exrx.net/WeightExercises/GluteusMaximus/SLHackSquat' },
  'hamstring curl': [
    { route: ['machine'], value: { text: 'Lie face down on the machine with the pad resting on the back of your lower legs, just above your heels, and your knees just past the bench. Curl your heels toward your glutes, pause, then lower the pad slowly until your legs are straight.',
      source: 'ExRx, "Lever Lying Leg Curl" — https://exrx.net/WeightExercises/Hamstrings/LVLyingLegCurl' } },
    { route: ['dumbbells', 'bench'], value: { text: 'Lie face down on a flat bench with your knees just past the end and a dumbbell held between your feet. Hold the bench with your hands. Curl your heels toward your glutes, pause, then lower the dumbbell slowly until your legs are straight.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'hip extension': { text: 'Start on your hands and knees, hands under your shoulders and knees under your hips. Keeping the knee bent at 90 degrees, lift one leg behind you until your thigh is in line with your body, then lower it. Keep your back flat and do not twist. Do all reps on one leg, then the other.',
    source: 'ACE, "Quadruped Bent-knee Hip Extensions" — https://www.acefitness.org/resources/everyone/exercise-library/270/quadruped-bent-knee-hip-extensions/' },
  'hip thrust': { text: 'Sit on the floor with your upper back against a bench and a barbell across your hips, knees bent and feet flat. Push through your heels to lift your hips until your body is in a straight line from knees to shoulders, then lower. Keep your chin tucked.',
    source: 'ExRx, "Barbell Hip Thrust" — https://exrx.net/WeightExercises/GluteusMaximus/BBHipThrust' },
  'hopscotch': { text: 'Stand at the bottom of an agility ladder on your left foot. Hop on that foot through the first three squares, then jump both feet out to either side of the ladder. Hop your right foot back in and hop on it through the next three squares, then jump both feet out again. Keep going to the end, landing only in the squares and never on the rungs.',
    source: 'Amber Sayer, MS, CPT / Marathon Handbook, "10 Agility Ladder Drills" — https://marathonhandbook.com/agility-ladder-drills/; Viada p227 names it' },
  'ickey shuffle': { text: 'Stand at one side of an agility ladder, facing down it. Step into the first square with the inside foot, then the outside foot, then step out to the side of the next square with the first foot. Repeat the in, in, out pattern into each square, so you move up the ladder from side to side. Keep your feet low to the ground.',
    source: 'Matt Toupalik, ACE CPT / Cactus Athletics, "Ickey Shuffle Ladder Progression #1" — https://cactusathletics.com/ickey-shuffle-ladder-progression-1/' },
  'incline bench press': { text: 'Set the bench to about 30 to 45 degrees and lie back with your feet flat on the floor. Grip the bar a little wider than shoulder-width and lift it off the rack. Lower it to your upper chest, then press it back up until your arms are straight.',
    source: 'ExRx, "Barbell Incline Bench Press" — https://exrx.net/WeightExercises/PectoralClavicular/BBInclineBenchPress' },
  'inverted ring row': { text: 'Set the rings higher than arm\'s length above the floor. Hang under them with your arms straight, shoulders under the rings, body straight and heels on the floor. Pull up until the rings touch the sides of your chest, keeping your body straight. Lower until your arms are straight.',
    source: 'ExRx, "Suspended Inverted Row" — https://exrx.net/WeightExercises/BackGeneral/STInvertedRow (the page names rings and suspension handles)' },
  'inverted row': { text: 'Set a bar in a rack at about waist height. Lie under it and grip it a little wider than shoulder-width, body in a straight line and heels on the floor. Pull your chest to the bar, then lower until your arms are straight. Keep your hips in line with your shoulders.',
    source: 'ExRx, "Inverted Row" — https://exrx.net/WeightExercises/BackGeneral/BWSupineRow' },
  'jm press': { text: 'Lie flat on a bench and hold the bar at arm\'s length over your chest, hands about 15 to 18 inches apart. Point your elbows out at about 45 degrees from your body. Lower the bar toward a point between your chin and throat, keeping your elbows high and pointing at the ceiling, until your forearms touch your biceps. Press the bar straight up to the start.',
    source: 'Dave Tate / elitefts, "How to Perform the JM Press: A Step-by-Step Guide from the Inventor" (JM Blakley\'s method) — https://elitefts.com/blogs/training/how-to-perform-the-jm-press-a-step-by-step-guide-from-the-inventor; Viada p220 names it' },
  'kb db swing': { text: 'Stand over the weight with your feet wide and toes turned slightly out, and lift it just off the floor with straight arms: a dumbbell held by the top with a hand on each side, or a kettlebell by the handle. Bend slightly at the hips until your forearms touch your inner thighs. Straighten your hips and knees straight away so the weight rises to between upper chest and head height. Let it fall forward and swing back between your legs, bending your knees, and repeat.',
    source: 'ExRx, "Dumbbell Low Swing" — https://exrx.net/WeightExercises/Power/DBLowSwing; ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'kb swing': { text: 'Stand behind a kettlebell with your feet slightly wider than your shoulders. Bend at the hips with your knees bent and back straight, grab the handle and swing it back until your forearm touches your inner thigh. Drive your hips forward and straighten your knees so the kettlebell swings forward and up to between shoulder and eye height. Let it swing back between your legs, bending at the hips, and repeat.',
    source: 'ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'kb swings': { text: 'Stand behind a kettlebell with your feet slightly wider than your shoulders. Bend at the hips with your knees bent and back straight, grab the handle and swing it back until your forearm touches your inner thigh. Drive your hips forward and straighten your knees so the kettlebell swings forward and up to between shoulder and eye height. Let it swing back between your legs, bending at the hips, and repeat.',
    source: 'ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'kettlebell press': { text: 'Stand holding a kettlebell at your shoulder, the bell resting on the back of your forearm and your elbow tucked in. Press it straight up until your arm is straight overhead, then lower it back to your shoulder. Keep your ribs down and do not lean away. Do all reps on one arm, then the other.',
    source: 'ExRx, "Kettlebell Press" — https://exrx.net/WeightExercises/Kettlebell/KBPress' },
  'kettlebell row': { text: 'Hold a kettlebell in one hand at your side. Bend at the hips with a flat back until your torso is close to parallel with the floor. Pull the kettlebell up until it reaches about chest height, then lower it slowly. Do all reps on one arm, then the other.',
    source: 'Alex Polish, ACE-CPT / BarBend, "10 Upper Body Kettlebell Exercises" (Kettlebell Bent-Over Row) — https://barbend.com/upper-body-kettlebell-exercises/' },
  'kettlebell rows': { text: 'Hold a kettlebell in one hand at your side. Bend at the hips with a flat back until your torso is close to parallel with the floor. Pull the kettlebell up until it reaches about chest height, then lower it slowly. Do all reps on one arm, then the other.',
    source: 'Alex Polish, ACE-CPT / BarBend, "10 Upper Body Kettlebell Exercises" (Kettlebell Bent-Over Row) — https://barbend.com/upper-body-kettlebell-exercises/' },
  'kettlebell swing': { text: 'Stand behind a kettlebell with your feet slightly wider than your shoulders. Bend at the hips with your knees bent and back straight, grab the handle and swing it back until your forearm touches your inner thigh. Drive your hips forward and straighten your knees so the kettlebell swings forward and up to between shoulder and eye height. Let it swing back between your legs, bending at the hips, and repeat.',
    source: 'ExRx, "Kettlebell Swing" — https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
  'kroc row': { text: 'Put one hand and one knee on a flat bench, or stand and hold something solid with your free hand, shoulders higher than your hips. Pull the dumbbell in a straight line from below your chest to the lower part of your ribs, pulling your shoulder blade back. Lower it until your arm is straight and you feel the stretch in your lat. Do all reps on one arm, then the other.',
    source: 'Matt Kroczaleski / T Nation, "Kroc Rows – 101" — https://t-nation.com/t/kroc-rows-101/284491; Viada p220 names it' },
  'larsen press': { text: 'Set up as for the bench press. Lift your feet off the floor with your legs straight out in front of you and the tops of your thighs on the bench, or rest your feet on a bench or blocks. Lower the bar to your chest and press it back up. Keep your legs no higher than the bench.',
    source: 'Jake Boly, CSCS / BarBend, "How the Larsen Press Can Be a Secret Weapon For Bench Press Gains" — https://barbend.com/larsen-press/; Viada p220 names it' },
  'lat pulldown': [
    { route: ['cable'], value: { text: 'Sit with your thighs under the pads and grip the bar a little wider than your shoulders. Pull the bar down to your upper chest, leaning back slightly, then let it go back up until your arms are straight.',
      source: 'ExRx, "Cable Pulldown" — https://exrx.net/WeightExercises/LatissimusDorsi/CBFrontPulldown' } },
    { route: ['bands'], value: { text: 'Anchor a band high, on a pull-up bar or over the top of a closed door. Stand, or kneel if the anchor is low, holding the band\'s loop with your hands apart and your arms straight above your head. Pull your elbows down toward your back pockets until the band reaches your chin. Let the band pull your arms back up slowly.',
      source: 'Alex Polish, ACE-CPT / BarBend, "11 Lat Pulldown Variations" (Resistance Band Lat Pulldown) — https://barbend.com/lat-pulldown-variations/' } },
  ],
  'lateral band walk': { text: 'Stand on the middle of a band and hold one end in each hand at your hips, ends crossed. Step sideways with your legs straight and your trunk still, keeping the band tight. Take the set number of steps one way, then the other.',
    source: 'ACE, "Walking Abduction" — https://www.acefitness.org/resources/everyone/exercise-library/290/walking-abduction/' },
  'lateral lunge': { text: 'Stand with your feet together. Take a wide step to one side, bend that knee and push your hips back while the other leg stays straight. Push back to standing. Keep both feet pointing forward.',
    source: 'ACE, "Lateral Lunge" — https://www.acefitness.org/resources/everyone/exercise-library/364/lateral-lunge/' },
  'lateral raise': [
    { route: ['dumbbells'], value: { text: 'Stand with a dumbbell in each hand at your sides. With a slight bend in the elbows, raise both dumbbells out to the sides until they are level with your shoulders, then lower them slowly. Do not swing your body.',
      source: 'ExRx, "Dumbbell Lateral Raise" — https://exrx.net/WeightExercises/DeltoidLateral/DBLateralRaise' } },
    { route: ['bands'], value: { text: 'Stand on the middle of a band with both feet and hold the ends at your sides with an overhand grip. Lift your hands to shoulder height, pause, then lower them slowly.',
      source: 'Shane McLean, CPT / Garage Gym Reviews, "An At-Home Upper-Body Resistance Band Workout" (Lateral Raise) — https://www.garagegymreviews.com/upper-body-resistance-band-workout' } },
    { route: ['cable'], value: { text: 'Set a pulley at the bottom and stand side-on to it, holding the handle in the hand farther from the machine. With a slight bend in the elbow, raise your arm out to the side until it is level with your shoulder, then lower it slowly. Do all reps on one arm, then the other.',
      source: 'ExRx, "Cable Isolateral Lateral Raise" — https://exrx.net/WeightExercises/DeltoidLateral/CBLateralRaise' } },
  ],
  'leg curl': [
    { route: ['machine'], value: { text: 'Lie face down on the machine with the pad resting on the back of your lower legs, just above your heels, and your knees just past the bench. Curl your heels toward your glutes, pause, then lower the pad slowly until your legs are straight.',
      source: 'ExRx, "Lever Lying Leg Curl" — https://exrx.net/WeightExercises/Hamstrings/LVLyingLegCurl' } },
    { route: ['dumbbells', 'bench'], value: { text: 'Lie face down on a flat bench with your knees just past the end and a dumbbell held between your feet. Hold the bench with your hands. Curl your heels toward your glutes, pause, then lower the dumbbell slowly until your legs are straight.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'leg curls': [
    { route: ['machine'], value: { text: 'Lie face down on the machine with the pad resting on the back of your lower legs, just above your heels, and your knees just past the bench. Curl your heels toward your glutes, pause, then lower the pad slowly until your legs are straight.',
      source: 'ExRx, "Lever Lying Leg Curl" — https://exrx.net/WeightExercises/Hamstrings/LVLyingLegCurl' } },
    { route: ['dumbbells', 'bench'], value: { text: 'Lie face down on a flat bench with your knees just past the end and a dumbbell held between your feet. Hold the bench with your hands. Curl your heels toward your glutes, pause, then lower the dumbbell slowly until your legs are straight.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'leg extension': { text: 'Sit in the machine with your back against the pad and the ankle pad resting on the front of your lower shins. Straighten your knees to lift the pad, pause, then lower it slowly.',
    source: 'ExRx, "Lever Leg Extension" — https://exrx.net/WeightExercises/Quadriceps/LVLegExtension' },
  'leg press': { text: 'Sit in the machine with your back against the pad and your feet about shoulder-width apart on the platform. Release the handles and lower the platform until your knees are bent at about 90 degrees, then push it back up without locking your knees. Keep your lower back on the pad.',
    source: 'ExRx, "Lever 45° Leg Press" — https://exrx.net/WeightExercises/GluteusMaximus/LV45LegPress' },
  'lever squat': { text: 'Stand under the machine\'s shoulder pads with your feet about shoulder-width apart. Release the handle and squat down until your thighs are at least parallel to the platform, then push back up. Keep your back against the pads.',
    source: 'ExRx, "Lever Squat" — https://exrx.net/WeightExercises/GluteusMaximus/LVSquat' },
  'light db row': { text: 'Put one knee and the same-side hand on a flat bench, back flat, and hold a dumbbell in the other hand with the arm hanging straight. Pull the dumbbell to your hip, then lower it until your arm is straight. Do all reps on one arm, then the other.',
    source: 'ExRx, "Dumbbell Bent-over Row" — https://exrx.net/WeightExercises/BackGeneral/DBBentOverRow' },
  'lunge hops': { text: 'Stand in a split stance with one foot forward and your knees slightly bent. Dip down, then jump straight up and switch legs in the air. Land in a split stance with the other foot forward and go straight into the next dip.',
    source: 'ExRx, "Split Jump" — https://exrx.net/Plyometrics/SplitJump' },
  'lying leg curl': [
    { route: ['machine'], value: { text: 'Lie face down on the machine with the pad resting on the back of your lower legs, just above your heels, and your knees just past the bench. Curl your heels toward your glutes, pause, then lower the pad slowly until your legs are straight.',
      source: 'ExRx, "Lever Lying Leg Curl" — https://exrx.net/WeightExercises/Hamstrings/LVLyingLegCurl' } },
    { route: ['dumbbells', 'bench'], value: { text: 'Lie face down on a flat bench with your knees just past the end and a dumbbell held between your feet. Hold the bench with your hands. Curl your heels toward your glutes, pause, then lower the dumbbell slowly until your legs are straight.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'machine back extension': { text: 'Sit in the machine with the pad across your upper back and your feet on the footrest. Push back against the pad until your body is upright, then let it return slowly. Keep your back flat.',
    source: 'ExRx, "Lever Back Extension" — https://exrx.net/WeightExercises/ErectorSpinae/LVBackExtension' },
  'machine chest press': { text: 'Set the seat so the handles are level with the middle of your chest. Sit with your back against the pad and grip the handles. Press forward until your arms are straight, then let the handles come back until they are level with your chest.',
    source: 'ExRx, "Lever Chest Press" — https://exrx.net/WeightExercises/PectoralSternal/LVChestPress' },
  'machine hip thrust': { text: 'Lie back on the pad and strap the belt tight around your waist, feet about shoulder-width apart and turned slightly out. Push your hips up until they lock out, then release the two safety levers. Lower as far as you can without the machine touching the floor, then push back up until your legs are in line with your back and your knees are at about 90 degrees. Pull the handles toward you to lock the machine when you finish.',
    source: 'Asphalt Green (fitness organization, no named author), "The Beginner\'s Guide to the Hip Thrust Machine" — https://www.asphaltgreen.org/blog/the-beginners-guide-to-the-hip-thrust-machine/' },
  'meadows row': { text: 'Put one end of a barbell in a corner or landmine and stand beside the loaded end, where you would stand to add a plate. Grab the end of the bar with one hand, using straps, and raise the hip nearest the bar higher than the other. Pull your elbow up without twisting your body, then lower the bar. Do all reps on one arm, then the other.',
    source: 'John Meadows / T Nation, "Tip: Master the Meadows Row" — https://archive.t-nation.com/training/tip-master-the-meadows-row/; Viada p220 names it' },
  'overhead press': { text: 'Stand with the bar resting on the front of your shoulders, hands just wider than shoulder-width. Press the bar straight up, moving your head back so the bar passes your face, until your arms are straight overhead. Lower it back to the front of your shoulders. Do not lean back.',
    source: 'ExRx, "Barbell Military Press" — https://exrx.net/WeightExercises/DeltoidAnterior/BBMilitaryPress' },
  'pec deck': { text: 'Set the seat so the handles are level with your chest. Sit with your back against the pad and hold the handles or rest your forearms on the pads. Bring the handles together in front of your chest, then let them go back until you feel a stretch across your chest.',
    source: 'ExRx, "Lever Isolateral Pec Deck Fly" — https://exrx.net/WeightExercises/PectoralSternal/LVPecDeckFly' },
  'pike push up': { text: 'Start with your hands on the floor slightly wider than your shoulders and your hips high, so your body makes an upside-down V. Bend your elbows, at about 45 degrees from your body, and lower your head until it nearly touches the floor. Push back up without locking your elbows at the top.',
    source: 'NASM Exercise Library, "Pike Push-Up" — https://www.nasm.org/resource-center/exercise-library/pike-push-up' },
  'pistol squats': { text: 'Stand on one leg with the other leg held out straight in front of you. Squat down on the standing leg as far as you can control, reaching your arms forward for balance, then stand back up. Hold a support or squat to a box until you can do it freely. Do all reps on one leg, then the other.',
    source: 'ExRx, "Single Leg Squat (pistol)" — https://exrx.net/WeightExercises/GluteusMaximus/BWSingleLegSquat' },
  'plate raise': { text: 'Stand with your feet shoulder-width apart, holding a weight plate with both hands in front of your thighs. Keep your arms straight and lift the plate until your arms are parallel to the floor. Lower it slowly back to your thighs.',
    source: 'Stephen Sheehan, CPT / Garage Gym Reviews, "18 Trainer-Approved Weight Plate Exercises" (Weight Plate Front Raise) — https://www.garagegymreviews.com/weight-plate-exercises' },
  'pogo hops': { text: 'Stand up straight with your feet hip-width apart, arms relaxed at your sides and knees slightly bent. Make small, quick hops off the balls of your feet, just high enough to leave the ground. Land quietly on the balls of your feet and hop again straight away.',
    source: 'Ryan Horton, CSCS / Horton Barbell, "Low Pogo Hops (How To, Benefits, Common Mistakes)" — https://hortonbarbell.com/low-pogo-hops-how-to-benefits-common-mistakes/; Viada p227 names it' },
  'preacher curl': [
    { route: ['machine'], value: { text: 'Sit at the preacher bench with the backs of your upper arms flat on the pad, holding the bar or handles with your palms up. Curl the weight up toward your shoulders, then lower it until your arms are nearly straight. Keep your upper arms on the pad.',
      source: 'ExRx, "Barbell Preacher Curl" — https://exrx.net/WeightExercises/Brachialis/BBPreacherCurl' } },
    { route: ['dumbbells', 'bench'], value: { text: 'Sit on the end of a flat bench with your feet wide and a dumbbell in one hand, arm hanging between your legs. Brace the back of that upper arm against the inside of the same-side knee. Curl the dumbbell up toward your shoulder, pause, then lower until your arm is straight. Keep the upper arm on the knee. Do all reps on one arm, then the other.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'prone y t w raise': { text: 'Lie face down on the floor, arms straight above your head and thumbs up. Lift your arms off the floor in a Y shape, then lower them. Move them out to the sides in a T, lift and lower. Bend your elbows and pull them down into a W, lift and lower.',
    source: 'ACE, "Prone Scapular (Shoulder) Stabilization Exercises" — https://www.acefitness.org/resources/everyone/exercise-library/249/prone-scapular-shoulder-stabilization-series-i-y-t-w-o-formation/' },
  'pull up': { text: 'Hang from a bar with your hands just wider than your shoulders, palms facing away. Pull yourself up until your chin is over the bar, then lower until your arms are straight. Keep your legs still and do not swing.',
    source: 'ExRx, "Pull-up" — https://exrx.net/WeightExercises/LatissimusDorsi/BWPullup' },
  'pullover machine': [
    { route: ['machine'], value: { text: 'Set the seat so your shoulders line up with the machine\'s pivot. Sit with your back against the pad and hold the handles or bar above and behind your head. Pull it down in an arc until it reaches your stomach, then let it go back up until you feel a stretch.',
      source: 'ExRx, "Lever Pullover" — https://exrx.net/WeightExercises/LatissimusDorsi/LVPullover' } },
    // The flat-bench dumbbell route left 2026-09-18: at home this is p220's DB pullover, which carries the same words.
  ],
  'push up': { text: 'Start with your hands on the floor a little wider than your shoulders and your body in a straight line from head to heels. Lower your chest to just above the floor, elbows at about 45 degrees from your body, then push back up. Keep your hips in line with your shoulders.',
    source: 'ExRx, "Push-up" — https://exrx.net/WeightExercises/PectoralSternal/BWPushup' },
  'rdl': { text: 'Stand holding a barbell or dumbbells in front of your thighs, knees slightly bent. Push your hips back and lower the weight along your legs until you feel a stretch in your hamstrings, about mid-shin, keeping your back flat. Push your hips forward to stand back up.',
    source: 'ExRx, "Romanian Deadlift" — https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift (barbell); NASM Exercise Library, "Dumbbell Romanian Deadlift" — https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift' },
  'rear delt fly': [
    { route: ['dumbbells'], value: { text: 'Stand with a dumbbell in each hand and hinge at the hips until your chest is close to parallel with the floor, arms hanging with a slight bend. Raise both dumbbells out to the sides until they are level with your shoulders, pause, then lower. Keep your back flat and your neck in line with your spine.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
    { route: ['cable'], value: { text: 'Set two pulleys close together at about shoulder height and face them, holding one handle in each hand. Step back until the cables are tight and stagger your feet. Pull the handles out to your sides with your arms straight or slightly bent, keeping your upper arms at shoulder height. Return slowly.',
      source: 'ExRx, "Cable Isolateral Reverse Fly" — https://exrx.net/WeightExercises/DeltoidPosterior/CBStandingReverseFly' } },
    { route: ['bands'], value: { text: 'Hold a band in both hands at shoulder height, hands about shoulder-width apart. With a slight bend in your elbows, pull the band apart by squeezing your shoulder blades together, until the band touches your upper chest. Return slowly.',
      source: 'Shane McLean, CPT / Garage Gym Reviews, "An At-Home Upper-Body Resistance Band Workout" (Band Pull-Apart) — https://www.garagegymreviews.com/upper-body-resistance-band-workout' } },
  ],
  'rear delt machine': [
    { route: ['machine'], value: { text: 'Sit facing the pad with your chest against it and the handles level with your shoulders. Hold the handles with your arms straight in front of you, then pull them out and back in a wide arc until your arms are level with your body. Return slowly.',
      source: 'ExRx, "Lever Isolateral Seated Reverse Fly" — https://exrx.net/WeightExercises/DeltoidPosterior/LVRearLateralRaise' } },
    { route: ['dumbbells', 'incline_bench'], value: { text: 'Set a bench to about 45 degrees and sit facing it, chest against the pad, a dumbbell in each hand hanging below. With a slight bend in the elbows, raise both dumbbells out to the sides until they are level with your shoulders, pause, then lower. Keep your chest on the pad.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
    { route: ['dumbbells'], value: { text: 'Stand with a dumbbell in each hand and hinge at the hips until your chest is close to parallel with the floor, arms hanging with a slight bend. Raise both dumbbells out to the sides until they are level with your shoulders, pause, then lower. Keep your back flat and your neck in line with your spine.',
      source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' } },
  ],
  'rebound jumps': { text: 'Stand with feet hip-width apart. Jump straight up, land on the balls of both feet with the knees slightly bent, and jump again as soon as you land. Spend as little time on the ground as you can.',
    source: 'ExRx, "Vertical Jumps" — https://exrx.net/Plyometrics/VerticalJumps' },
  'reverse hyper': { text: 'Lie face down on a flat bench with your hips right at the edge. Hold the front legs or sides of the bench to brace your upper body. Keep your legs straight, toes turned slightly out, and use your glutes to lift your legs until they are in line with your torso. Lower with control.',
    source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' },
  'reverse hyperextension': { text: 'Put the strap around your legs just above the ankles and lie face down on the pad, holding the handles. Lift your legs behind you as high as you can, keeping them nearly straight. Lower them slowly.',
    source: 'ExRx, "Lever Reverse Hyper-extension" — https://exrx.net/WeightExercises/GluteusMaximus/LVReverseHyperextension' },
  'reverse lunge': { text: 'Stand up straight. Step back with one foot and land on the ball of that foot. Lower your back knee until it nearly touches the floor, then push through the front foot to stand back up. Alternate legs or do all reps on one leg, then the other.',
    source: 'ExRx, "Dumbbell Rear Lunge" — https://exrx.net/WeightExercises/GluteusMaximus/DBRearLunge' },
  'romanian deadlift': { text: 'Stand holding a barbell or dumbbells in front of your thighs, knees slightly bent. Push your hips back and lower the weight along your legs until you feel a stretch in your hamstrings, about mid-shin, keeping your back flat. Push your hips forward to stand back up.',
    source: 'ExRx, "Romanian Deadlift" — https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift (barbell); NASM Exercise Library, "Dumbbell Romanian Deadlift" — https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift' },
  'sandbag throw': { text: 'Stand over a sandbag with it between your feet, then squat down and grip it on each side. Pull it up into your lap and move your hands to hug it. Stand up in one movement and throw it so it clears one shoulder and falls behind you. Turn around and repeat.',
    source: 'Adam Gardner / PowerliftingTechnique.com, "Sandbag Workouts" (5. Sandbag Shouldering, throw version) — https://powerliftingtechnique.com/sandbag-workout-routine/; Viada p220 names it' },
  'scaption (bodyweight shoulder raises)': { text: 'Stand with your arms at your sides, thumbs facing forward. Keep your elbows straight and raise your arms forward and up to shoulder level, angled about 30 degrees out to the sides. Pause for one second, then lower them slowly.',
    source: 'Massachusetts General Hospital Sports Physical Therapy, "Shoulder Rotator Cuff and Scapular Strengthening Program" (Standing forward flexion, full can) — https://web.archive.org/web/2026/https://www.massgeneral.org/assets/MGH/pdf/orthopaedics/sports-medicine/physical-therapy/mass-general-shoulder-twelve-strengthening-program.pdf' },
  'scaption bodyweight shoulder raise': { text: 'Stand with your arms at your sides, thumbs facing forward. Keep your elbows straight and raise your arms forward and up to shoulder level, angled about 30 degrees out to the sides. Pause for one second, then lower them slowly.',
    source: 'Massachusetts General Hospital Sports Physical Therapy, "Shoulder Rotator Cuff and Scapular Strengthening Program" (Standing forward flexion, full can) — https://web.archive.org/web/2026/https://www.massgeneral.org/assets/MGH/pdf/orthopaedics/sports-medicine/physical-therapy/mass-general-shoulder-twelve-strengthening-program.pdf' },
  'seated db press': { text: 'Sit on a bench with the back upright and a dumbbell in each hand at shoulder height, palms facing forward. Press the dumbbells straight up until your arms are straight, then lower them back to your shoulders. Keep your back against the pad.',
    source: 'ExRx, "Dumbbell Shoulder Press" — https://exrx.net/WeightExercises/DeltoidAnterior/DBShoulderPress' },
  'single arm row': { text: 'Put one knee and the same-side hand on a flat bench, back flat, and hold a dumbbell in the other hand with the arm hanging straight. Pull the dumbbell to your hip, then lower it until your arm is straight. Do all reps on one arm, then the other.',
    source: 'ExRx, "Dumbbell Bent-over Row" — https://exrx.net/WeightExercises/BackGeneral/DBBentOverRow' },
  'single leg hops': { text: 'Stand on one foot beside a line or a low cone, hip and knee slightly bent. Hop sideways over it and back, landing on the ball of the foot and taking off again as soon as you land. Keep the other foot off the floor. Do all hops on one leg, then the other.',
    source: 'ExRx, "Single Leg Lateral Hop" — https://exrx.net/Plyometrics/SingleLegLateralHopBarrier' },
  'single leg rdl': { text: 'Stand on one leg holding a weight in the opposite hand, knee slightly bent. Push your hips back and lean forward, letting the free leg go straight back, until your torso is close to parallel with the floor. Stand back up, keeping your hips level. Do all reps on one leg, then the other.',
    source: 'ExRx, "Single Leg Stiff-leg Deadlift" — https://exrx.net/WeightExercises/GluteusMaximus/BWSingleLegStiffLegDeadlift' },
  'single leg romanian deadlift': { text: 'Stand on one leg holding a weight in the opposite hand, knee slightly bent. Push your hips back and lean forward, letting the free leg go straight back, until your torso is close to parallel with the floor. Stand back up, keeping your hips level. Do all reps on one leg, then the other.',
    source: 'ExRx, "Single Leg Stiff-leg Deadlift" — https://exrx.net/WeightExercises/GluteusMaximus/BWSingleLegStiffLegDeadlift' },
  'single leg squat': { text: 'Stand on one leg with the other leg held out straight in front of you. Squat down on the standing leg as far as you can control, reaching your arms forward for balance, then stand back up. Hold a support or squat to a box until you can do it freely. Do all reps on one leg, then the other.',
    source: 'ExRx, "Single Leg Squat (pistol)" — https://exrx.net/WeightExercises/GluteusMaximus/BWSingleLegSquat' },
  'skater hops': { text: 'Stand with your feet hip-width apart. Leap sideways to the right and land lightly on your right foot, knee bent, swinging your left leg behind your right. Push off your right foot and leap to the left, landing on your left foot and swinging your right leg behind you. Swing your arms with each leap.',
    source: 'Jesse Zucker, CPT / BarBend, "The 12 Best Cardiovascular Exercises" (Skater) — https://barbend.com/best-cardiovascular-exercises/' },
  'skull crusher': { text: 'Lie on a flat bench holding a barbell or dumbbells above your chest with your arms straight. Bend only your elbows to lower the weight toward your forehead, then straighten your arms to lift it back up. Keep your upper arms still.',
    source: 'ExRx, "Barbell Lying Triceps Extension" — https://exrx.net/WeightExercises/Triceps/BBLyingTriExt' },
  'sled pull': { text: 'Put on a shoulder harness attached to the sled and face away from it. Lean forward and walk or run forward with short, quick steps, heels off the ground. Keep your back flat.',
    source: 'ExRx, "Sled Pull" — https://exrx.net/WeightExercises/Power/WTPullSprint' },
  'sled push': { text: 'Hold the sled\'s handles with your feet staggered and your hips low. Lean your body weight into the sled with your heels off the ground. Step forward as fast as you can, staying low.',
    source: 'ExRx, "Sled Push" — https://exrx.net/WeightExercises/Power/WTPushSprint' },
  'smith machine hip thrust': { text: 'Set a bench behind the Smith machine bar and put your upper back on it, with the bar over the crease of your hips. Place your feet wider than hip-width and hold the bar with an overhand grip. Push your hips up to unhook the bar, then lower your hips until your glutes are near the floor. Push the bar back up until your body is in a straight line from shoulders to knees.',
    source: 'Anthony O\'Reilly, CPT / BarBend, "The 15 Best Smith Machine Exercises and How to do Them" — https://barbend.com/best-smith-machine-exercises/' },
  'smith machine press': { text: 'Set a flat bench under the Smith machine bar so the bar lowers to the middle of your chest. Lie back, grip the bar a little wider than shoulder-width and turn it to unhook it. Lower it to your chest, then press it back up until your arms are straight.',
    source: 'ExRx, "Smith Bench Press" — https://exrx.net/WeightExercises/PectoralSternal/SMBenchPress' },
  'spider curl': { text: 'Set a bench to about 45 degrees and lie chest down on it, holding dumbbells or a barbell with your arms hanging straight down, palms facing forward. Curl the weight up toward your shoulders without moving your upper arms, then lower it until your arms are straight.',
    source: 'ExRx, "Barbell Prone Incline Curl" — https://exrx.net/WeightExercises/Brachialis/BBProneInclineCurl' },
  'split squat': { text: 'Stand in a long split stance, one foot forward and the back heel off the floor. Lower your back knee toward the floor until your front thigh is about parallel to the floor, then push back up. Keep your torso upright. Do all reps on one leg, then the other.',
    source: 'ExRx, "Dumbbell Split Squat" — https://exrx.net/WeightExercises/GluteusMaximus/DBSplitSquat' },
  'step up': { text: 'Stand facing a box or bench about knee height. Put one foot fully on it and push through that foot to stand up on the box, then step back down with the same leg you stepped up with last. Do all reps on one leg, then the other.',
    source: 'ExRx, "Dumbbell Step-up" — https://exrx.net/WeightExercises/GluteusMaximus/DBStepUp' },
  'stiff legged deadlift': { text: 'Stand holding a barbell or dumbbells in front of your thighs, knees almost straight. Bend at the hips and lower the weight toward the floor as far as you can with a flat back, then stand back up. Keep the weight close to your legs.',
    source: 'ExRx, "Barbell Stiff Leg Deadlift" — https://exrx.net/WeightExercises/ErectorSpinae/BBStiffLegDeadlift' },
  'stiff legged run': { text: 'Run forward with your legs straight, starting slowly and building speed. Keep your upper body upright and do not lean back. As each foot lands, pull it backwards along the ground.',
    source: 'Adam Hodges, PhD / TrainingPeaks, "8 Running Drills to Improve Your Running Form" (Straight Leg Run) — https://www.trainingpeaks.com/blog/drills-for-proper-running-form/; Viada p227 names it' },
  't bar row': { text: 'Put one end of a barbell in a landmine or a corner and load the other end. Stand over the bar facing away from the corner, feet about shoulder-width apart, and hook a V-handle under the bar near the plates. Bend at the hips until your torso is 30 to 45 degrees to the floor, then row the bar up with your elbows close to your sides, squeezing your shoulder blades together at the top. Lower it until your arms are straight, without letting the plates touch the floor.',
    source: 'Onnit Academy, checked by Sean Hyson, CSCS / Onnit, "The Expert\'s Guide To The Landmine Row Exercise" — https://www.onnit.com/blogs/the-edge/the-expert-s-guide-to-the-landmine-row-exercise' },
  'tate press': { text: 'Lie on a flat bench holding the dumbbells above your chest, thumbs next to each other, palms facing your feet and elbows pointed out. Bend your elbows to bring the ends of the dumbbells down to the middle of your chest. Straighten your elbows to press them back up, without lifting your shoulders off the bench.',
    source: 'Mike Dewar, CSCS / BarBend, "How to Do the Tate Press for Thicker Arms and Bigger Pressing Numbers" — https://barbend.com/tate-press/; Viada p222 names it' },
  'trap bar deadlift': { text: 'Stand inside the trap bar with feet hip-width apart. Bend at the hips and knees and grip the handles, back flat and chest up. Stand up by pushing the floor away until your hips and knees are straight, then lower the bar back to the floor the same way.',
    source: 'ExRx, "Trap Bar Squat" — https://exrx.net/WeightExercises/Quadriceps/TBSquat' },
  'tricep pushdown': [
    { route: ['cable'], value: { text: 'Stand facing a high pulley and hold the bar or rope with your elbows at your sides. Push the handle down until your arms are straight, then let it come back up until your forearms are about parallel to the floor. Keep your elbows at your sides.',
      source: 'ExRx, "Cable Pushdown" — https://exrx.net/WeightExercises/Triceps/CBPushdown' } },
    { route: ['bands'], value: { text: 'Anchor a band high and face it, feet together and elbows at your sides. Keep your chest up and your back flat, hips angled slightly forward. Push the band down until your arms are straight, keeping your elbows slightly in front of your shoulders. Let it come back up slowly.',
      source: 'Mike Dewar / BarBend, "The 15 Best Tricep Exercises" (Triceps Pushdown) — https://barbend.com/best-triceps-exercises/' } },
  ],
  'walking lunge': { text: 'Step forward with one foot and lower your back knee toward the floor until both knees are bent at about 90 degrees. Push through the front foot and bring your back foot forward into the next step. Keep your torso upright.',
    source: 'ExRx, "Walking Lunge" — https://exrx.net/Stretches/Miscellaneous/WalkingLunge' },
  'weighted reverse hyper': { text: 'Lie face down on a flat bench with your hips right at the edge. Hold the front legs or sides of the bench to brace your upper body. Squeeze a light dumbbell between your feet. Keep your legs straight, toes turned slightly out, and use your glutes to lift your legs until they are in line with your torso. Lower with control.',
    source: 'OURS — Michael\'s approved words (docs/STATE-SOURCES.md, \'Exercise how-to lines\')' },
  'ytw raises': { text: 'Lie face down on the floor, arms straight above your head and thumbs up. Lift your arms off the floor in a Y shape, then lower them. Move them out to the sides in a T, lift and lower. Bend your elbows and pull them down into a W, lift and lower.',
    source: 'ACE, "Prone Scapular (Shoulder) Stabilization Exercises" — https://www.acefitness.org/resources/everyone/exercise-library/249/prone-scapular-shoulder-stabilization-series-i-y-t-w-o-formation/' },
  'zercher squat': { text: 'Set a bar in a rack at about the height of your breastbone. Rest the bar in the crooks of your arms, just below the elbows, hands apart or clasped. Stand up, take a few small steps back, and squat down with your upper arms vertical and the bar over the middle of your feet. Stand back up, keeping your shoulders down.',
    source: 'Dave Tate / elitefts, "A Beginner\'s Guide to the Zercher Squat" — https://elitefts.com/blogs/training/a-beginners-guide-to-the-zercher-squat; Viada p220 names it' },
};

/**
 * The how-to for a movement on this kit, or `null` when the movement is not one a plan prints. Station words for an
 * athlete who owns the station (or declared no kit); the home version's words otherwise. See `EXECUTION_HOW_TO`.
 */
/** A merged spelling's words (2026-09-18, `SAME_MOVEMENT`): the one entry's, or any spelling that now names it. */
function sameMovementHowTo(name: string): (typeof EXECUTION_HOW_TO)[string] | undefined {
  const f = foldExerciseName(name);
  const canon = SAME_MOVEMENT[String(name ?? '').toLowerCase().trim()] ?? SAME_MOVEMENT[f] ?? f;
  if (EXECUTION_HOW_TO[canon]) return EXECUTION_HOW_TO[canon];
  const alias = Object.keys(SAME_MOVEMENT).find((a) => SAME_MOVEMENT[a] === canon && EXECUTION_HOW_TO[foldExerciseName(a)]);
  return alias ? EXECUTION_HOW_TO[foldExerciseName(alias)] : undefined;
}

export function executionHowTo(name: string, equipment: string[] | null | undefined): string | null {
  const entry = EXECUTION_HOW_TO[foldExerciseName(name)]
    ?? EXECUTION_HOW_TO[foldExerciseName(bandRouteName(name, equipment))]
    ?? sameMovementHowTo(name);
  if (!entry) return null;
  if (!Array.isArray(entry)) return entry.text;
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  const keys = declared ? athleteEquipmentToKeys(equipment as string[]) : new Set<string>();
  return byRoute(entry, keys, entry[0].value).text;
}

/**
 * ⚠️ WHAT `executionHowTo(...) != null` USED TO MEAN, KEPT FOR THE ONE CALLER THAT ASKED IT (materialize-plan's
 * equipment swap, 2026-09-10). Before 2026-09-18 a how-to existed only for these movements, and only when the kit
 * resolved to their home route — so "has a how-to" stood for "the grid already has a home route for this row on this
 * kit, do not rename it". Every movement has words now, so the question gets its own answer, unchanged: the same 14
 * names and the same station test.
 */
const HOME_ROUTE_MOVEMENTS = new Set([
  'rear delt machine', 'preacher curl', 'back extension', 'leg curl', 'leg curls', 'lying leg curl',
  'hamstring curl', 'chest supported row', 'reverse hyper', 'calf raise', 'calf raises', 'ghd back extension',
  'weighted reverse hyper',
]);
export function homeRouteOnKit(name: string, equipment: string[] | null | undefined): boolean {
  const key = foldExerciseName(name);
  if (!HOME_ROUTE_MOVEMENTS.has(key)) return false;
  const routes = gearRoutesFor(name);
  if (!routes.some((r) => r.includes('machine'))) return true;
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return false;
  const keys = athleteEquipmentToKeys(equipment as string[]);
  if (routes.some((r) => r.includes('machine') && r.every((k) => keys.has(k)))) return false;
  // The rear delt entry was the only route list; both of its home routes need dumbbells.
  return key === 'rear delt machine' ? keys.has('dumbbells') : true;
}

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
