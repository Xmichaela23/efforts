// ============================================================================
// THE GRID'S TAXONOMY — A FOURTH ACCESSOR OVER A VOCABULARY THAT ALREADY EXISTS.
//
// ⛔ READ THIS BEFORE ADDING ANYTHING. Three accessors already sit over `MovementPattern`
// (`src/lib/exercise-config.ts`), and each was added because it asked a question the others could
// not answer:
//
//   `MovementPattern`   (Q-181, 9 values)  "which movement slot is this?"          — the vocabulary
//   `MovementGroup`     (D-315, 3 values)  "upper day or lower day?"               — placement
//   `MovementFamily`    (Q-212, 7 values)  "do these two collide on one day?"      — collision
//   ↓
//   THIS FILE                              "how braced, how compound, in Viada's   — the grid
//                                           four-tier scheme, and which of his
//                                           four patterns is it?"
//
// **Same data, four questions, four accessors, side by side.** That is the shape `CLAUDE.md`
// prescribes and the shape `exercise-config.ts` already demonstrates twice. Nothing here adds a
// value to `MovementPattern` and nothing here is a second exercise catalogue.
//
// ⛔ AND IT IS NOT `StrengthIntent` EITHER. `protocols/intent-taxonomy.ts` names whole SESSIONS —
// `LOWER_NEURAL`, `UPPER_STRENGTH`, `FULLBODY_MAINTENANCE`. Viada's ME/DE/SKILL/HYP name how ONE
// movement's sets are loaded. A `LOWER_NEURAL` day contains an ME slot and several HYP slots. Its
// header sentence — *"protocols output intents, placement policies assign intents to days"* — stays
// exactly true and describes the other axis.
//
// ── WHAT IS HIS AND WHAT IS OURS ─────────────────────────────────────────────────────────────────
//
// ⛔ HIS CATEGORY DEFINITIONS ARE METHOD AND ARE CITED. "Primary: compound, barbell or bar, cardinal
// plane" is a definition; "bench press, military press, push press" is his LIST, and a list is
// expression. **This file ships the definitions as a CLASSIFIER and runs it over OUR OWN catalogue.**
// His lists appear once, in the test file, as the classifier's ground truth — the author's own worked
// examples are the right thing to verify a classifier against, and that is the only place they are.
// ============================================================================

import {
  EXERCISE_CONFIG,
  SAME_MOVEMENT,
  foldExerciseName,
  getExerciseConfig,
  type MovementPattern,
} from '../../../../src/lib/exercise-config.ts';
import {
  ASSISTANCE_GEAR,
  canPerform,
  equipmentFitRank,
} from '../../../../src/lib/strength-gear.ts';

/**
 * ⛔ FIVE CATEGORIES PLUS CORE. There is no sixth, and in particular there is no `asymmetrical` —
 * that is a MODIFIER (see {@link isAsymmetrical}), settled 2026-08-21 after a page-by-page check.
 *
 * ⚠️ CORE IS ITS OWN HEADING ON p223, not one of the five, which is why it is a member of this union
 * but never a substitution target for the others.
 */
export type ViadaCategory = 'primary' | 'secondary' | 'braced' | 'focused' | 'carry' | 'core';

export const VIADA_CATEGORIES: ViadaCategory[] = [
  'primary', 'secondary', 'braced', 'focused', 'carry', 'core',
];

/** His own one-line definitions, from the page each category opens on. */
export const CATEGORY_DEFINITION: Record<ViadaCategory, { text: string; cite: string }> = {
  primary: {
    text: 'Compound movements, barbell or bar, cardinal plane of movement (vertical/horizontal), or '
      + 'contest- or assessment-specific movement with or without minor modifications to setup.',
    cite: 'Viada pp218-219',
  },
  secondary: {
    text: 'Compound noncontested movements, dumbbell variants — variable form and plane of movement.',
    cite: 'Viada p220',
  },
  braced: { text: 'More externally braced movements.', cite: 'Viada pp221-222' },
  focused: {
    text: 'Single-joint emphasis (chest / deltoid / lat / hamstring / quad / calf / biceps / triceps).',
    cite: 'Viada pp222-223',
  },
  carry: {
    text: 'Movements where the weight is transported from one place to another. A "pick" is picking '
      + 'the implement up and putting it down without forward movement.',
    cite: 'Viada p226',
  },
  core: { text: 'Trunk work.', cite: 'Viada p223' },
};

/**
 * ⛔ FOUR PATTERNS, AND THEY ARE HIS, NOT OURS. Every category heading on pp218-223 is one of
 * `push upper` · `pull upper` · `hinge lower` · `press/push lower`, and each category page repeats
 * the same parenthetical: *"(push/pull/hinge/lower push)"*. His FOCUSED headings name a muscle after
 * the pattern — "focused push lower/QUADS", "focused hinge lower/HAMSTRINGS" — but the pattern axis
 * underneath is the same four.
 *
 * ⚠️ IT IS A COARSENING OF `MovementPattern`, not a rival: our nine values collapse onto his four.
 * Horizontal and vertical push are one thing to him; knee and hip dominant are his two lower halves.
 */
export type ViadaPattern = 'push_upper' | 'pull_upper' | 'hinge_lower' | 'press_lower';

export const VIADA_PATTERNS: ViadaPattern[] = ['push_upper', 'pull_upper', 'hinge_lower', 'press_lower'];

export const PATTERN_LABEL: Record<ViadaPattern, string> = {
  push_upper: 'Push (upper)',
  pull_upper: 'Pull (upper)',
  hinge_lower: 'Hinge (lower)',
  press_lower: 'Press (lower)',
};

/**
 * Our nine-value pattern → his four.
 *
 * ⚠️ `calf` MAPS TO PRESS LOWER ON HIS OWN AUTHORITY, not by our convenience: freestanding barbell
 * calf raises are in his SECONDARY PRESS LOWER list and seated calf raises in his FOCUSED PUSH
 * LOWER/QUADS list. Both sit under the lower-press heading.
 *
 * ⚠️ `core` AND `plyometric` RETURN NULL. Core is its own heading (p223) and plyometrics are their
 * own chapter section with their own rules (p227) — neither is a pattern within the lifting grid,
 * and forcing them into one would put an ab wheel in a pressing slot.
 */
export function viadaPatternOfMovementPattern(p: MovementPattern | null | undefined): ViadaPattern | null {
  switch (p) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'push_upper';
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'pull_upper';
    case 'hip_dominant':
      return 'hinge_lower';
    case 'knee_dominant':
    case 'calf':
      return 'press_lower';
    default:
      return null;
  }
}

// ── THE EQUIPMENT READING OF A NAME ─────────────────────────────────────────────────────────────
//
// ⛔ THE NAME-READING CLASSIFIER IS GONE (2026-09-18): a movement's heading is its entry in `FILING` below, by what
// it is (a drag curl is a curl, not a drag). What is left of the name tests answers one other question — does a
// movement need a machine — for the equipment gate.

/** More externally braced (pp221-222): a machine, a Smith rack, a cable stack, a sled-guided path. */
const BRACED_RE =
  /\b(machine|smith|hack squat|leg press|lever|pulldown|pull down|cable|assisted|pec deck|chest supported|chest-supported|ghd|back extension|hyperextension|hyper|glute ham|glute-ham)\b/;

/**
 * ⛔ DOES THE NAME READ AS MACHINE-BRACED — the same axis {@link BRACED_RE} already owns, asked a
 * different question.
 *
 * `viadaCategoryOf` cannot answer this one. Its order is deliberate — single-joint is tested BEFORE
 * bracing so a pec deck files under FOCUSED — so a `lat pulldown` comes back `focused` and a
 * `leg extension` comes back `focused`, and neither category tells a caller whether the movement
 * needs a machine to exist. That is the question the equipment gate has, and it is asked here.
 *
 * ⚠️ IT IS A NAME TEST AND IT IS DELIBERATELY COARSE. It exists to stop an UNTAGGED movement being
 * handed to an athlete who declared a home gym — `leg press`, `hack squat`, `chest supported row`,
 * `GHD back extension`. A movement with a real {@link ASSISTANCE_GEAR} tag never reaches it: a tag
 * is a better answer than a regex, and `canPerform` reads it.
 *
 * ⚠️ NO NEW GEAR KEY. The stage-2 notes asked for a `machine` key in the equipment vocabulary; this
 * is not it, and it does not pretend to be. It is a local reading of a name, in the one place that
 * needs it, so the vocabulary is not grown for a single caller.
 */
export function readsAsMachineBraced(exerciseName: string): boolean {
  const key = foldExerciseName(String(exerciseName ?? ''));
  return BRACED_RE.test(key) && !MACHINE_BRACED_EXCLUDE_RE.test(key);
}

/**
 * ⛔ A MOVEMENT THAT NAMES ITS OWN IMPLEMENT IS NOT A MACHINE, and without this the guard ejects two
 * movements that need nothing but a band.
 *
 * `band pull down` matches `BRACED_RE` on *"pull down"* and `band assisted pull up` matches it on
 * *"assisted"* — both correctly, for the classifier's purpose: they ARE externally braced in Viada's
 * sense. Neither is a machine, and neither is untagged by accident: `band pull down` is a real
 * `EXERCISE_CONFIG` entry with `displayFormat: 'band'`, and `band assisted pull up`'s own config note
 * says the band is ASSISTANCE, not load. Ejecting them takes two movements away from a bands-owning
 * athlete for having the word "band" in the name — the false exclusion the gate exists to avoid.
 *
 * ⚠️ IT DOES NOT LOOSEN THE CATEGORY. `viadaCategoryOf` still calls both `braced`; this exclusion is
 * read only by {@link readsAsMachineBraced}, which asks the equipment question and nothing else.
 */
const MACHINE_BRACED_EXCLUDE_RE = /\bband\b/;



// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE FILING — EVERY MOVEMENT BY WHAT IT IS, WITH ITS PAGE (Michael, 2026-09-18).
//
// This replaced the name-reading classifier (the regexes above it now answer only the equipment question in
// `readsAsMachineBraced`). The rule, his words: *the page's printed list for the slot, extended ONLY by the
// definition's own words, and nothing of another kind*; "file by what the movement is, not by words in its name"
// (a drag curl is a curl). One filing, read by the builder and by the Swap sheet.
//
//   printed  — named on the page, under that heading.
//   variant  — the definition's own words reach it: PRIMARY "contest-/assessment-specific movement with or without
//              minor modifications to setup" (pp218-219); SECONDARY "compound noncontested movements, dumbbell
//              variants" (p220) — a dumbbell or kettlebell version of a printed movement; FOCUSED "single-joint
//              emphasis (chest/deltoid/lat/hamstring/quad/calf/biceps/triceps)" (pp222-223); CORE "dynamic plank
//              variants" and the printed movements' own variants (p223); CARRY "axial loading/carry variants" (p226).
//   ⚠️ judged — ours: a single-limb version of a printed movement (Bulgarian split squat, single-leg RDL, walking
//              lunge), filed with the movement it is. Named in the report so it can be struck.
//
// Anything not here is on no page for any level: the builder does not place it and the Swap sheet does not offer
// it (push-ups, inverted rows, band rows, step-ups, glute bridges, hip thrusts on a bar, static planks, side bends).
// A spelling of one of these resolves through `SAME_MOVEMENT` in exercise-config.
// ════════════════════════════════════════════════════════════════════════════════════════════════
type Filed = { category: ViadaCategory; pattern: ViadaPattern | null; basis: 'printed' | 'variant' | 'judged'; cite: string };
const F = (category: ViadaCategory, pattern: ViadaPattern | null, basis: Filed['basis'], cite: string): Filed =>
  ({ category, pattern, basis, cite });

export const FILING: Readonly<Record<string, Filed>> = {
  // PRIMARY — p218 push upper, pull; p219 hinge, push lower
  'bench press': F('primary', 'push_upper', 'printed', 'p218'),
  'military press': F('primary', 'push_upper', 'printed', 'p218'),
  'push press': F('primary', 'push_upper', 'printed', 'p218'),
  'pull up': F('primary', 'pull_upper', 'printed', 'p218'),
  'chin up': F('primary', 'pull_upper', 'variant', 'p218 — pull-up, grip modified'),
  'barbell row': F('primary', 'pull_upper', 'printed', 'p218'),
  'deadlift': F('primary', 'hinge_lower', 'printed', 'p219'),
  'paused deadlift': F('primary', 'hinge_lower', 'printed', 'p219'),
  'sumo deadlift': F('primary', 'hinge_lower', 'printed', 'p219'),
  'trap bar deadlift': F('primary', 'hinge_lower', 'printed', 'p219'),
  'back squat': F('primary', 'press_lower', 'printed', 'p219'),
  'front squat': F('primary', 'press_lower', 'printed', 'p219'),
  'box squat': F('primary', 'press_lower', 'printed', 'p219'),
  // SECONDARY — p220
  'larsen press': F('secondary', 'push_upper', 'printed', 'p220'),
  'incline bench press': F('secondary', 'push_upper', 'printed', 'p220'),
  'close grip bench press': F('secondary', 'push_upper', 'printed', 'p220'),
  'jm press': F('secondary', 'push_upper', 'printed', 'p220'),
  'seated db press': F('secondary', 'push_upper', 'printed', 'p220'),
  'arnold press': F('secondary', 'push_upper', 'printed', 'p220'),
  // p220 files the incline bench here; the decline is the same bench press on another angle (Michael, 2026-09-18).
  'decline bench press': F('secondary', 'push_upper', 'variant', 'p220 — incline bench press, other angle'),
  'db bench press': F('secondary', 'push_upper', 'variant', 'p220 — dumbbell bench press'),
  'db incline press': F('secondary', 'push_upper', 'variant', 'p220 — dumbbell incline bench press'),
  'db shoulder press': F('secondary', 'push_upper', 'variant', 'p220 — dumbbell military press'),
  'db floor press': F('secondary', 'push_upper', 'variant', 'p220 — dumbbell bench press from the floor'),
  'db push press': F('secondary', 'push_upper', 'variant', 'p220 — dumbbell push press'),
  'kettlebell press': F('secondary', 'push_upper', 'variant', 'p220 — kettlebell military press'),
  'kroc row': F('secondary', 'pull_upper', 'printed', 'p220'),
  't-bar row': F('secondary', 'pull_upper', 'printed', 'p220'),
  'meadows row': F('secondary', 'pull_upper', 'printed', 'p220'),
  'gorilla row': F('secondary', 'pull_upper', 'printed', 'p220'),
  'db pullover': F('secondary', 'pull_upper', 'printed', 'p220 — DB pullovers'),
  'db row': F('secondary', 'pull_upper', 'variant', 'p220 — dumbbell barbell row'),
  'kettlebell row': F('secondary', 'pull_upper', 'variant', 'p220 — kettlebell barbell row'),
  'romanian deadlift': F('secondary', 'hinge_lower', 'printed', 'p220'),
  'stiff-legged deadlift': F('secondary', 'hinge_lower', 'printed', 'p220'),
  'weighted reverse hyper': F('secondary', 'hinge_lower', 'printed', 'p220 — bench reverse hyper'),
  'good morning': F('secondary', 'hinge_lower', 'printed', 'p220'),
  'kb swing': F('secondary', 'hinge_lower', 'printed', 'p220'),
  'sandbag throw': F('secondary', 'hinge_lower', 'printed', 'p220'),
  'db romanian deadlift': F('secondary', 'hinge_lower', 'variant', 'p220 — dumbbell Romanian deadlift'),
  'dumbbell swing': F('secondary', 'hinge_lower', 'variant', 'p220 — dumbbell KB swing'),
  'single leg rdl': F('secondary', 'hinge_lower', 'judged', 'p220 — Romanian deadlift, one leg'),
  'split squat': F('secondary', 'press_lower', 'printed', 'p220'),
  'zercher squat': F('secondary', 'press_lower', 'printed', 'p220'),
  'freestanding barbell calf raise': F('secondary', 'press_lower', 'printed', 'p220'),
  'lunge': F('secondary', 'press_lower', 'printed', 'p220 — forward lunge'),
  'reverse lunge': F('secondary', 'press_lower', 'printed', 'p220'),
  'goblet squat': F('secondary', 'press_lower', 'variant', 'p220 — dumbbell front squat'),
  'weighted single leg calf raise': F('secondary', 'press_lower', 'variant', 'p220 — dumbbell freestanding calf raise'),
  'walking lunge': F('secondary', 'press_lower', 'judged', 'p220 — forward lunge, travelling'),
  'barbell walking lunge': F('secondary', 'press_lower', 'judged', 'p220 — forward lunge, travelling'),
  'bulgarian split squat': F('secondary', 'press_lower', 'judged', 'p220 — split squat, rear foot raised'),
  // BRACED — p221 push upper, pull upper, push lower; p222 hinge lower
  'smith machine press': F('braced', 'push_upper', 'printed', 'p221'),
  'machine chest press': F('braced', 'push_upper', 'printed', 'p221'),
  'dip machine': F('braced', 'push_upper', 'printed', 'p221 — dip machine/pressdown'),
  // ⛔ BODYWEIGHT DIPS ARE ON NO PAGE (Michael, 2026-09-18): p221 prints the dip machine, which stays.
  'chest supported row': F('braced', 'pull_upper', 'printed', 'p221'),
  'lat pulldown': F('braced', 'pull_upper', 'printed', 'p221 — single or double, any grip'),
  'explosive lat pull down': F('braced', 'pull_upper', 'printed', 'p221 — lat pulldown'),
  'cable upright row': F('braced', 'pull_upper', 'printed', 'p221'),
  'hack squat': F('braced', 'press_lower', 'printed', 'p221'),
  'leg press': F('braced', 'press_lower', 'printed', 'p221'),
  // p275: "rotate the braced asymmetrical movements with secondary asymmetrical" — the braced push lower done one leg at a time.
  'single leg leg press': F('braced', 'press_lower', 'variant', 'p221 — leg press, one leg (p275 braced asymmetrical)'),
  'lever squat': F('braced', 'press_lower', 'printed', 'p221'),
  'reverse hyperextension': F('braced', 'hinge_lower', 'printed', 'p222 — reverse hyperextension (machine)'),
  'ghd back extension': F('braced', 'hinge_lower', 'printed', 'p222'),
  'ground-based deadlift machine': F('braced', 'hinge_lower', 'printed', 'p222'),
  'machine back extension': F('braced', 'hinge_lower', 'printed', 'p222'),
  // ⛔ THE FLOOR `back extension` (feet under a loaded bar) IS DELETED (2026-09-24, B2): p222 prints the machine and
  // the GHD versions, both filed above; the name resolves to `ghd back extension` now (`SAME_MOVEMENT`).
  // FOCUSED — p222 push/arms, pull/arms; p223 push lower/quads, hinge lower/hamstrings
  'triceps pushdown': F('focused', 'push_upper', 'printed', 'p222'),
  'tate press': F('focused', 'push_upper', 'printed', 'p222'),
  'behind the neck db triceps extension': F('focused', 'push_upper', 'printed', 'p222'),
  'skull crusher': F('focused', 'push_upper', 'printed', 'p222'),
  'pec deck': F('focused', 'push_upper', 'printed', 'p222'),
  'lateral raise': F('focused', 'push_upper', 'printed', 'p222'),
  'band tricep pushdown': F('focused', 'push_upper', 'variant', 'p222 — triceps pushdown, band'),
  'chest fly': F('focused', 'push_upper', 'variant', 'p222 — single-joint chest'),
  'cable crossover': F('focused', 'push_upper', 'variant', 'p222 — single-joint chest'),
  'front raise': F('focused', 'push_upper', 'variant', 'p222 — single-joint deltoid'),
  'plate raise': F('focused', 'push_upper', 'variant', 'p222 — single-joint deltoid'),
  'band lateral raise': F('focused', 'push_upper', 'variant', 'p222 — lateral raise, band'),
  'scaption': F('focused', 'push_upper', 'variant', 'p222 — single-joint deltoid'),
  'preacher curl': F('focused', 'pull_upper', 'printed', 'p222'),
  'spider curl': F('focused', 'pull_upper', 'printed', 'p222'),
  'rear delt machine': F('focused', 'pull_upper', 'printed', 'p222'),
  'drag curl': F('focused', 'pull_upper', 'printed', 'p222'),
  'pullover machine': F('focused', 'pull_upper', 'printed', 'p222'),
  'barbell curl': F('focused', 'pull_upper', 'variant', 'p222 — single-joint biceps'),
  'dumbbell curl': F('focused', 'pull_upper', 'variant', 'p222 — single-joint biceps'),
  'hammer curl': F('focused', 'pull_upper', 'variant', 'p222 — single-joint biceps'),
  'cable curl': F('focused', 'pull_upper', 'variant', 'p222 — single-joint biceps'),
  'rear delt fly': F('focused', 'pull_upper', 'variant', 'p222 — rear delt machine, free weight'),
  'reverse flyes (bodyweight)': F('focused', 'pull_upper', 'variant', 'p222 — single-joint deltoid'),
  'ytw raise': F('focused', 'pull_upper', 'variant', 'p222 — single-joint deltoid'),
  'leg extension': F('focused', 'press_lower', 'printed', 'p223'),
  'hip adduction machine': F('focused', 'press_lower', 'printed', 'p223'),
  'weighted knee raise': F('focused', 'press_lower', 'printed', 'p223 — weighted knee raises (hip flexors)'),
  'seated calf raise': F('focused', 'press_lower', 'printed', 'p223'),
  'banded leg extension': F('focused', 'press_lower', 'variant', 'p223 — leg extension, band'),
  'calf raise': F('focused', 'press_lower', 'variant', 'p223 — single-joint calf'),
  'single leg calf raise': F('focused', 'press_lower', 'variant', 'p223 — single-joint calf'),
  'soleus raise': F('focused', 'press_lower', 'variant', 'p223 — single-joint calf'),
  'machine hip thrust': F('focused', 'hinge_lower', 'printed', 'p223'),
  'smith machine hip thrust': F('focused', 'hinge_lower', 'printed', 'p223'),
  // ⛔ THE BARBELL HIP THRUST IS A VARIANT OF p223's HIP THRUST (2026-09-25, minimum-kit follow-up 1): the same movement
  // on the bench with a bar across the hips — the minimum kit's own form. It was a marked stand-in on no page
  // (`HIP_THRUST_STAND_IN`, 2026-09-18); the bench and the bar being in every declared kit, it is filed.
  'barbell hip thrust': F('focused', 'hinge_lower', 'variant', 'p223 — machine/Smith machine hip thrust, barbell on the bench'),
  'leg curl': F('focused', 'hinge_lower', 'printed', 'p223 — hamstring curls (seated or prone)'),
  'cable kickback': F('focused', 'hinge_lower', 'printed', 'p223'),
  'band leg curl': F('focused', 'hinge_lower', 'variant', 'p223 — hamstring curl, band'),
  'nordic hamstring curl': F('focused', 'hinge_lower', 'variant', 'p223 — single-joint hamstring'),
  // CORE EXERCISES — p223
  'hanging leg raise': F('core', null, 'printed', 'p223'),
  'hanging knee raise': F('core', null, 'variant', 'p223 — hanging leg raise, knees bent'),
  'toes to bar': F('core', null, 'variant', 'p223 — hanging leg raise'),
  'crunch': F('core', null, 'printed', 'p223'),
  'reverse crunch': F('core', null, 'variant', 'p223 — crunch'),
  'bicycle crunch': F('core', null, 'variant', 'p223 — crunch'),
  'cross body crunch': F('core', null, 'variant', 'p223 — crunch'),
  'cable crunch': F('core', null, 'variant', 'p223 — crunch'),
  'ab machine crunch': F('core', null, 'variant', 'p223 — crunch'),
  'v up': F('core', null, 'printed', 'p223'),
  'ab wheel rollout': F('core', null, 'printed', 'p223'),
  'stability ball rollout': F('core', null, 'variant', 'p223 — rollout'),
  'plank with shoulder tap': F('core', null, 'variant', 'p223 — dynamic plank variants'),
  'stir the pot': F('core', null, 'variant', 'p223 — dynamic plank variants'),
  'trx fallout': F('core', null, 'variant', 'p223 — dynamic plank variants'),
  'side plank with hip dip': F('core', null, 'variant', 'p223 — dynamic plank variants'),
  'side plank abduction': F('core', null, 'variant', 'p223 — dynamic plank variants'),
  // CARRY/DRAG/PICK OPTIONS — p226
  'farmers carry': F('carry', null, 'printed', "p226 — farmer's carry"),
  'suitcase carry': F('carry', null, 'variant', "p226 — farmer's carry, one hand"),
  'overhead carry': F('carry', null, 'variant', 'p226 — axial loading/carry variants'),
  'sled push': F('carry', null, 'printed', 'p226'),
  'sled pull': F('carry', null, 'printed', 'p226'),
};

/**
 * ⛔ STAND-INS — ON NO PAGE, NEVER OFFERED, PLACED ONLY WHEN THE KIT REACHES NOTHING THE PAGES FILE (Michael,
 * 2026-09-18: "the builder keeps the smallest bodyweight/band movement the kit can do as a marked stand-in; the swap
 * list never offers it"). OURS — the pages print no bodyweight or band movement for these patterns; the order,
 * smallest first, is ours. Ledger row: docs/STATE-SOURCES.md "Stand-ins". Read only by the builder's last gated rung
 * (`resolveSlot`); the Swap sheet reads `FILING` and never sees these.
 */
export const STAND_INS: Readonly<Record<ViadaPattern, readonly string[]>> = {
  push_upper: ['push up', 'band overhead press', 'pike push up'],
  pull_upper: ['band row', 'inverted row', 'band pull down', 'band assisted pull up'],
  hinge_lower: ['glute bridge', 'single leg glute bridge'],
  press_lower: ['bodyweight squat', 'step up', 'single leg squat'],
};

// ⚠️ `HIP_THRUST_STAND_IN` (the bench-only `hip thrust`, 2026-09-18) is gone 2026-09-25: the barbell hip thrust is filed
// above as p223's variant and reaches the row through the ordinary pool.

/** The filing for a movement under any of its spellings, or null when no page reaches it. */
export function filingOf(exerciseName: string): Filed | null {
  const raw = String(exerciseName ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const folded = foldExerciseName(raw);
  const key = SAME_MOVEMENT[lower] ?? SAME_MOVEMENT[folded] ?? lower;
  if (FILING[key]) return FILING[key];
  const fk = Object.keys(FILING).find((k) => foldExerciseName(k) === foldExerciseName(key));
  return fk ? FILING[fk] : null;
}

/**
 * ⛔ WHICH OF VIADA'S CATEGORIES THIS MOVEMENT IS IN.
 *
 * Returns `null` when the movement is not in the app's catalogue at all — the caller must not treat
 * an unknown name as a secondary by default, because that is how a movement with no prescription
 * reaches an athlete.
 */
export function viadaCategoryOf(exerciseName: string): ViadaCategory | null {
  return filingOf(exerciseName)?.category ?? null;
}

/** His four patterns, for a movement, via the app's own nine. */
export function viadaPatternOf(exerciseName: string): ViadaPattern | null {
  const filed = filingOf(exerciseName);
  if (filed) return filed.pattern;
  const cfg = getExerciseConfig(String(exerciseName ?? ''));
  return viadaPatternOfMovementPattern(cfg?.pattern ?? null);
}

/**
 * ⛔ ASYMMETRICAL IS A MODIFIER, NOT A CATEGORY — and this function is the entire implementation of
 * that ruling. There is no sixth list anywhere in the movement key; a braced push done one limb at a
 * time is a *braced asymmetrical*, and a split squat is a *secondary asymmetrical*.
 *
 * The app already records it: `ExerciseConfig.isUnilateral`. Nothing new is derived.
 */
export function isAsymmetrical(exerciseName: string): boolean {
  return getExerciseConfig(String(exerciseName ?? ''))?.isUnilateral === true;
}

// ── THE CATALOGUE, INDEXED ──────────────────────────────────────────────────────────────────────

export type GridMovement = {
  /** A movement on no page, placed because the kit reaches nothing the pages file (`STAND_INS`). Never offered. */
  standIn?: true;
  /** ⛔ THE STORED NAME. It resolves EXACTLY in `EXERCISE_CONFIG` — asserted by the gate, because a
   *  name that only fuzzy-matches silently borrows another movement's ratio (D-322). */
  name: string;
  category: ViadaCategory;
  pattern: ViadaPattern | null;
  asymmetrical: boolean;
};

/**
 * ⚠️ PLURALS ARE COLLAPSED, AND ONLY PLURALS. `EXERCISE_CONFIG` holds "lateral raise" and "lateral
 * raises" as separate keys (316 keys, 316 distinct folds — `foldExerciseName` does not collapse
 * them). Offering both as two choices is noise. The singular wins, because it is the form the
 * catalogue's canonical entries use.
 */
function dedupeKey(name: string): string {
  return foldExerciseName(name).replace(/(\w)s\b/g, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * ⛔ IN THE LIBRARY, NEVER PRESCRIBED (Michael, 2026-08-26).
 *
 * Each of these needs kit `GearKey` cannot express — a GHD, a roman chair, a captain's chair, a
 * sled (until 2026-09-16, D-479), a landmine, a sandbag, a ruck, gymnastic rings. Slice 7's rule is *"gate only on gear that
 * is BOTH required AND commonly declarable"*, and none of them clears the second half: an itemized
 * picker asking about a glute-ham developer is the exact trade that ruling reversed, after drawing
 * Michael's *"I wouldn't know what that is."*
 *
 * ⚠️ D-479 (2026-09-16): the rule is now one test per chip — nameable gear that unlocks a PRINTED
 * movement unreachable otherwise. A back extension bench passed and routes p222's printed GHD back
 * extension; the two sit-ups below stay here because neither is printed.
 *
 * ⛔ SO THE RULE IS CARRIED THROUGH RATHER THAN BENT: not commonly declarable means not gateable
 * means never prescribed. Leaving them in the pool untagged was the 2026-08-26 defect — measured on
 * a declared home gym, every one of them reached an athlete who had declared none of its kit.
 *
 * ⚠️ THIS DROPS THEM FROM THE ENGINE'S POOL ONLY. `EXERCISE_CONFIG` still holds them, the exercise
 * library still lists them, and an athlete who CHOOSES a sled push can still log one — that is their
 * call to make and it always was. The engine simply never makes it for them.
 *
 * ⚠️ NOT THE SAME LIST AS THE UNTAGGED ONE. `trx fallout`, `stir the pot` and `stability ball
 * rollout` were on it until the same ruling gave suspension trainers and stability balls their own
 * chips — those pass "commonly declarable", so they are tagged and offered rather than dropped.
 */
export const PRESCRIPTION_EXCLUDED: readonly string[] = [
  'backpack carry',
  'captain s chair knee raise',
  "captain's chair knee raise",
  'ghd sit up',
  'landmine twist',
  'ring dips',
  'roman chair sit up',
  'sandbag lunge',
  // ⛔ `sled pull` AND `sled push` LEFT THIS LIST 2026-09-16 (D-479) with the "Sled" chip, on Michael's ruling
  // from p226. They are gated on that chip (`ASSISTANCE_GEAR`) and offered on the carry row only.
];

/**
 * ⛔ MATCHED ON THE DEDUPE STEM, NOT THE FOLD, and the difference showed up immediately. Naming
 * `ring dips` alone dropped the plural and handed the dedupe slot to `ring dip` — the catalogue's
 * other spelling of the same movement — which then sailed back into the pool untagged. Every
 * spelling of a dropped movement has to go with it; see {@link dedupeKey}, the same collapse
 * `allGridMovements` already uses to pick between twins.
 */
const EXCLUDED_STEMS = new Set(PRESCRIPTION_EXCLUDED.map((n) => dedupeKey(n)));

/** Is this movement barred from anything the engine PRESCRIBES? See {@link PRESCRIPTION_EXCLUDED}. */
export function isPrescribable(exerciseName: string): boolean {
  return !EXCLUDED_STEMS.has(dedupeKey(String(exerciseName ?? '')));
}

let INDEX: GridMovement[] | null = null;

/** Every catalogued movement, classified. Built once, lazily; the catalogue is a module constant. */
export function allGridMovements(): GridMovement[] {
  if (INDEX) return INDEX;
  const seen = new Set<string>();
  const out: GridMovement[] = [];
  for (const name of Object.keys(EXERCISE_CONFIG)) {
    const dk = dedupeKey(name);
    if (seen.has(dk)) continue;
    const category = viadaCategoryOf(name);
    if (!category) continue;
    // ⛔ DROPPED BEFORE `seen` IS MARKED, deliberately. Marking first would let an excluded spelling
    // consume the dedupe slot and take a legitimate twin down with it.
    if (!isPrescribable(name)) continue;
    seen.add(dk);
    out.push({
      name,
      category,
      pattern: viadaPatternOf(name),
      asymmetrical: isAsymmetrical(name),
    });
  }
  INDEX = out;
  return out;
}


/**
 * ⚠️ CUTTING THE CORE CELL TO HIS FIVE WAS BUILT AND BACKED OUT, 2026-08-29 — recorded so the next
 * attempt starts from the finding.
 *
 * ⛔ THE CASE FOR IT IS REAL: the cell offers 43 movements where p223 names five, and four of the 43
 * are not movements at all (`core work`, `core circuit`, and `core work (5 min - your choice)` twice
 * with different punctuation). A picker was offering "core work 5 min your choice" as an exercise.
 *
 * ⛔⛔ WHAT STOPPED IT: `fillMuscleFloor` reaches core THROUGH THIS CELL. Closing it to five
 * movements left the floor unable to find a core movement a given athlete could perform, and a week
 * came out with no core work at all.
 *
 * ⛔ AND RULE 4 (p142) SAYS THE LIST IS NOT CLOSED ANYWAY: *"Note that this doesn't necessarily mean
 * crunches. It could be referring to dynamic throws, rotational work with med balls or the landmine,
 * and more."* So p223 is examples. **The defensible cut is the four placeholder non-movements, not a
 * cut to five.**
 */

/** Movements in one cell of the grid. Unfiltered by equipment — that is the grid's job. */
export function movementsIn(category: ViadaCategory, pattern: ViadaPattern | null): GridMovement[] {
  // One heading per movement, from `FILING`. (The second homes the name classifier needed are gone with it.)
  return allGridMovements().filter((m) => m.category === category && (pattern == null || m.pattern === pattern));
}

/**
 * ⛔ IS THIS MOVEMENT TAGGED FOR EQUIPMENT AT ALL — and why the grid has to ask.
 *
 * `gearRoutesFor` returns ALWAYS for an untagged movement and prints a warning saying so: *"treated
 * as needing nothing. Add it in src/lib/strength-gear.ts before anything gates on equipment."* That
 * default is RIGHT for its own consumers, who read a curated 28-movement assistance menu where
 * everything is tagged — offer rather than hide.
 *
 * ⛔ IT IS WRONG OVER THE FULL 316-MOVEMENT CATALOGUE, and this grid is the first thing to read that
 * catalogue. Measured 2026-08-22: ~180 of the movements the grid classifies carry no tag, including
 * `leg press`, `leg extension`, `chest fly` and `back extension`. Under the ALWAYS default a
 * bodyweight-only athlete is handed a leg press, which is exactly the false offer the gate exists to
 * prevent.
 *
 * ⚠️ SO THE GRID TREATS UNTAGGED AS UNKNOWN, NOT AS FREE — but only for an athlete who HAS declared
 * equipment. An athlete who declared nothing is in the §0h case ("we have not asked"), and there
 * everything is offered exactly as before.
 *
 * ⚠️ THIS IS A LOCAL READING, NOT A CHANGE TO THE GATE. `strength-gear.ts` is untouched; its default
 * still serves its own callers. The structural fix — tags for the wider catalogue, and a `machine`
 * gear key, which the vocabulary currently has no way to express — is written up in the stage notes.
 */
export function isGearTagged(exerciseName: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    ASSISTANCE_GEAR,
    foldExerciseName(String(exerciseName ?? '')),
  );
}

/** Re-exported so consumers gate through the ONE owner of "can this athlete do this movement". */
export { canPerform, equipmentFitRank };
