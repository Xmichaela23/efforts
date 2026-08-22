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
  REST_BETWEEN_SETS_NOT_STATED,
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
  type GridMovement,
  type ViadaCategory,
  type ViadaPattern,
} from './taxonomy.ts';

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
 * Best equipment fit first, then catalogue order.
 *
 * ⚠️ `equipmentFitRank` IS THE EXISTING OWNER of "which of these does this athlete reach most
 * naturally", and it already knows that a banded route is a last resort. Nothing is re-derived.
 */
function rank(movements: GridMovement[], equipment: string[] | null | undefined): GridMovement[] {
  return movements
    .map((m, i) => ({ m, i, r: equipmentFitRank(m.name, equipment) }))
    .sort((a, b) => {
      const ar = a.r == null ? Number.MAX_SAFE_INTEGER : a.r;
      const br = b.r == null ? Number.MAX_SAFE_INTEGER : b.r;
      return ar === br ? a.i - b.i : ar - br;
    })
    .map((x) => x.m);
}

/**
 * ⛔ REACHABLE MEANS TAGGED **AND** PERFORMABLE — see `isGearTagged` for why the second half is not
 * enough on its own. An untagged movement is not "free"; it is unknown, and the grid will not spend
 * a declared-equipment athlete's slot on an unknown.
 *
 * ⚠️ UNDECLARED EQUIPMENT IS THE §0h CASE and short-circuits to true: unknown inventory means "we
 * have not asked", never "owns nothing".
 */
function reachable(name: string, equipment: string[] | null | undefined): boolean {
  const declared = Array.isArray(equipment) && equipment.some((c) => String(c || '').trim());
  if (!declared) return true;
  return isGearTagged(name) && canPerform(name, equipment);
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
  notes.push({ kind: 'gap', text: REST_BETWEEN_SETS_NOT_STATED, cite: 'Viada — not stated' });
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
