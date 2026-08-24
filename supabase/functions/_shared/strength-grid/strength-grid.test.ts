// ============================================================================
// THE GATE — stage 2 of the Standing Plan work order.
//
// *"Every slot the All Rounder names (p274) resolves to a real movement with a real prescription,
// for an athlete with any equipment subset. No slot may resolve to nothing."*
//
// ⛔ VIADA'S MOVEMENT LISTS APPEAR IN THIS FILE AND NOWHERE ELSE IN THE CODEBASE, ON PURPOSE. They
// are the classifier's GROUND TRUTH — the author's own worked examples are the right thing to verify
// a classifier against, and keeping them here rather than in `taxonomy.ts` is the difference between
// shipping a list and testing against one. The shipped code holds his category DEFINITIONS and runs
// them over our own catalogue.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — the code it covers was broken and the test confirmed
// to fail. The mutations are listed in `docs/NOTES-stage2-strength-grid-2026-08-22.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/strength-grid/
// ============================================================================

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  allGridMovements,
  CATEGORY_DEFINITION,
  gridCells,
  isAsymmetrical,
  equipmentFitRank,
  isGearTagged,
  movementsIn,
  prescribe,
  resolveSlot,
  setsFor,
  SUBSTITUTION_LADDER,
  VIADA_CATEGORIES,
  VIADA_INTENTS,
  VIADA_PATTERNS,
  viadaCategoryOf,
  viadaPatternOf,
  type SlotRequest,
  type ViadaCategory,
  type ViadaIntent,
  type ViadaPattern,
} from './index.ts';
import { getExerciseConfig } from '../../../../src/lib/exercise-config.ts';

// ── THE ATHLETE SPACE ───────────────────────────────────────────────────────────────────────────
//
// ⛔ NOT MICHAEL'S GYM, AND NOT A HANDFUL OF SHAPES. Rule 8. Every subset below is a real athlete:
// the fully-equipped, the barbell-only home lifter, the traveller with bands, the athlete who owns
// nothing at all, and the one who has never been asked.

const KITS: { label: string; equipment: string[] | null }[] = [
  { label: 'never asked', equipment: null },
  { label: 'asked, owns nothing', equipment: [] },
  { label: 'commercial gym', equipment: ['Commercial gym'] },
  { label: 'barbell + rack + bench', equipment: ['Barbell + plates', 'Rack', 'Bench'] },
  { label: 'barbell only', equipment: ['Barbell + plates'] },
  { label: 'dumbbells only', equipment: ['Dumbbells'] },
  { label: 'dumbbells + bench', equipment: ['Dumbbells', 'Bench'] },
  { label: 'kettlebell only', equipment: ['Kettlebell'] },
  { label: 'bands only', equipment: ['Bands'] },
  { label: 'pull-up bar only', equipment: ['Pull-up bar'] },
  { label: 'bodyweight + bar + bands', equipment: ['Pull-up bar', 'Bands'] },
  { label: 'cable + bench', equipment: ['Cable', 'Bench'] },
  { label: 'unrecognised chip', equipment: ['Sandbag', 'Tractor tyre'] },
];

/**
 * ⛔ THE SLOT SHAPES THE ALL ROUNDER NAMES — every distinct one, across both its columns.
 *
 * Verified against `p274.jpg` on 2026-08-22. The DISTINCT shapes are listed rather than the
 * day-by-day table: the gate's question is whether each *kind* of slot resolves, and repeating a
 * shape once per day it appears on would test the same code path five times and reproduce his
 * week table for no gain.
 *
 * ⚠️ "Secondary push" on a LOWER-body day is `secondary / press_lower`, not `push_upper` — the day's
 * heading disambiguates it. That is the composer's job (stage 4); both readings are listed here so
 * the grid is proven to answer either.
 */
const ALL_ROUNDER_SLOTS: { label: string; req: Omit<SlotRequest, 'equipment'> }[] = [
  // Day 1 — Upper body: Push (standard)
  { label: 'D1 ME secondary push', req: { intent: 'ME', category: 'secondary', pattern: 'push_upper' } },
  { label: 'D1 DE secondary push', req: { intent: 'DE', category: 'secondary', pattern: 'push_upper' } },
  { label: 'D1 HYP braced push', req: { intent: 'HYP', category: 'braced', pattern: 'push_upper' } },
  { label: 'D1 HYP focused push (arms superset)', req: { intent: 'HYP', category: 'focused', pattern: 'push_upper' } },
  { label: 'D1 HYP focused pull (arms superset)', req: { intent: 'HYP', category: 'focused', pattern: 'pull_upper' } },
  // Day 2 — Lower body: Hinge (standard)
  { label: 'D2 ME secondary hinge', req: { intent: 'ME', category: 'secondary', pattern: 'hinge_lower' } },
  { label: 'D2 HYP braced hinge (superset)', req: { intent: 'HYP', category: 'braced', pattern: 'hinge_lower' } },
  { label: 'D2 HYP braced lower push (superset)', req: { intent: 'HYP', category: 'braced', pattern: 'press_lower' } },
  { label: 'D2 HYP focused hamstring', req: { intent: 'HYP', category: 'focused', pattern: 'hinge_lower' } },
  { label: 'D2 DE braced push (asymmetrical)', req: { intent: 'DE', category: 'braced', pattern: 'press_lower', asymmetrical: true } },
  // Day 4 — Upper body: Pull (standard)
  { label: 'D4 ME secondary pull', req: { intent: 'ME', category: 'secondary', pattern: 'pull_upper' } },
  { label: 'D4 DE secondary pull', req: { intent: 'DE', category: 'secondary', pattern: 'pull_upper' } },
  { label: 'D4 HYP braced pull', req: { intent: 'HYP', category: 'braced', pattern: 'pull_upper' } },
  // Day 5 — Lower body: Push (standard)
  { label: 'D5 ME secondary press lower', req: { intent: 'ME', category: 'secondary', pattern: 'press_lower' } },
  { label: 'D5 HYP focused quadriceps', req: { intent: 'HYP', category: 'focused', pattern: 'press_lower' } },
  { label: 'D5 SKILL braced push (asymmetrical)', req: { intent: 'SKILL', category: 'braced', pattern: 'press_lower', asymmetrical: true } },
  // Taper/deload column — every ME becomes SKILL (upper) or DE (lower)
  { label: 'T D1 SKILL secondary push', req: { intent: 'SKILL', category: 'secondary', pattern: 'push_upper' } },
  { label: 'T D2 DE secondary hinge', req: { intent: 'DE', category: 'secondary', pattern: 'hinge_lower' } },
  { label: 'T D4 SKILL secondary pull', req: { intent: 'SKILL', category: 'secondary', pattern: 'pull_upper' } },
  { label: 'T D5 DE secondary press lower', req: { intent: 'DE', category: 'secondary', pattern: 'press_lower' } },
];

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE GATE ITSELF
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every All Rounder slot resolves, for every equipment subset', () => {
  // ⛔ THE STAGE'S GATE, IN ONE TEST. 20 slot shapes x 13 kits.
  let resolved = 0;
  for (const kit of KITS) {
    for (const slot of ALL_ROUNDER_SLOTS) {
      const r = resolveSlot({ ...slot.req, equipment: kit.equipment });
      const where = `${slot.label} [${kit.label}]`;
      resolved++;

      // A real movement.
      assert(r.options.length > 0, `${where}: resolved to NOTHING`);
      assert(r.chosen && typeof r.chosen.name === 'string' && r.chosen.name.length > 0,
        `${where}: chose an empty movement`);
      assertEquals(r.chosen, r.options[0], `${where}: chose something not at the head of its own list`);

      // ⛔ A REAL movement means one the catalogue resolves EXACTLY. A name that only fuzzy-matches
      // silently borrows another movement's ratio and display (D-322 — "Pull Up @ 110 lb"), so a
      // grid that offered one would be handing the composer a landmine.
      assert(getExerciseConfig(r.chosen.name) != null, `${where}: "${r.chosen.name}" is not in the catalogue`);

      // A real prescription.
      const p = r.prescription;
      if (p.kind === 'barbell') {
        assert(p.reps.lo >= 1 && p.reps.hi >= p.reps.lo, `${where}: nonsense rep range`);
        assert(p.sets >= 1, `${where}: ${p.sets} sets`);
        assert(p.objective.length > 20, `${where}: no objective`);
      } else {
        assert(p.load.length > 0 && p.emphasis.length > 0, `${where}: empty carry prescription`);
      }
      assert(r.notes.length > 0, `${where}: no notes at all`);

      // ⛔ AND NOT VIA THE LAST RESORT. The ungated rung exists so nothing is ever empty, but a slot
      // in the programme's own week reaching it means the LADDER failed — the athlete would be shown
      // a movement their declared kit cannot set up. Every All Rounder slot must be filled by
      // something they can actually do.
      assert(r.substitution?.ungated !== true,
        `${where}: filled by the ungated last resort — the substitution ladder did not cover it`);
    }
  }
  assertEquals(resolved, KITS.length * ALL_ROUNDER_SLOTS.length);
});

Deno.test('every cell of the grid resolves, for every equipment subset', () => {
  // Wider than the All Rounder: the library also has to answer for the pivots and for stage 4's
  // taper column, so every category x pattern x intent is driven, not only the 20 shapes above.
  for (const kit of KITS) {
    for (const category of VIADA_CATEGORIES) {
      const patterns: (ViadaPattern | null)[] =
        category === 'core' || category === 'carry' ? [null] : VIADA_PATTERNS;
      for (const pattern of patterns) {
        for (const intent of VIADA_INTENTS) {
          const r = resolveSlot({ category, pattern, intent, equipment: kit.equipment });
          assert(r.options.length > 0,
            `${category}/${pattern}/${intent} [${kit.label}]: resolved to nothing`);
          assert(getExerciseConfig(r.chosen.name) != null,
            `${category}/${pattern}/${intent} [${kit.label}]: "${r.chosen.name}" is not in the catalogue`);
        }
      }
    }
  }
});

Deno.test('a substitution is always declared, and an exact fill never claims one', () => {
  // ⛔ THE HONESTY HALF OF THE GATE. Filling a braced slot with a secondary movement is allowed;
  // doing it silently is not, because the athlete then cannot tell a designed slot from a fallback.
  for (const kit of KITS) {
    for (const slot of ALL_ROUNDER_SLOTS) {
      const r = resolveSlot({ ...slot.req, equipment: kit.equipment });
      const where = `${slot.label} [${kit.label}]`;
      if (r.substitution) {
        assert(r.substitution.reason.length > 20, `${where}: substituted with no reason`);
        assert(r.substitution.cite.length > 0, `${where}: substituted with no citation`);
        const changed = r.substitution.toCategory !== r.substitution.fromCategory
          || r.substitution.droppedAsymmetrical || r.substitution.ungated;
        assert(changed, `${where}: declared a substitution that changed nothing`);
        // The movement really is from the category it says it is.
        assertEquals(r.chosen.category, r.substitution.toCategory,
          `${where}: says it substituted to ${r.substitution.toCategory} but chose a ${r.chosen.category}`);
      } else {
        assertEquals(r.chosen.category, slot.req.category,
          `${where}: filled from ${r.chosen.category} without declaring a substitution`);
        if (slot.req.asymmetrical) {
          assert(r.chosen.asymmetrical,
            `${where}: an asymmetrical slot took a two-limb movement and declared nothing`);
        }
      }
    }
  }
});

Deno.test("the source's own rotation is preferred to our inference, and is cited as his", () => {
  // ⛔ p275 LICENSES BRACED ↔ SECONDARY *ASYMMETRICAL* SPECIFICALLY. A braced asymmetrical slot the
  // athlete cannot reach must become a SECONDARY ASYMMETRICAL one — keeping the single-limb quality,
  // which is the point of the slot — before anything of ours fires.
  const r = resolveSlot({
    intent: 'SKILL', category: 'braced', pattern: 'press_lower', asymmetrical: true,
    equipment: ['Dumbbells'],
  });
  assertEquals(r.substitution?.toCategory, 'secondary');
  assertEquals(r.substitution?.droppedAsymmetrical, false, 'the single-limb quality was thrown away first');
  assert(r.chosen.asymmetrical, 'the chosen movement is not single-limb');
  assertEquals(r.substitution?.cite, 'Viada p275');
  assert(r.notes.some((n) => n.kind === 'source' && n.cite === 'Viada p275'));
});

Deno.test('our inference is labelled as ours, never as his', () => {
  // ⛔ THE OTHER HALF. Extending his asymmetrical rotation to whole categories is OUR reading, and a
  // slot that fires it says so — the cycling-percentage-basis rule from stage 1, one subsystem over.
  //
  // ⚠️ AND WHAT CHANGED ON 2026-08-24, BECAUSE THIS ASSERTION MOVED AND THE REASON MATTERS. It used
  // to demand that our OWN rung fired somewhere in this matrix, so the label had a subject. It no
  // longer fires anywhere — not in these 260 resolutions and not in the full category x pattern x
  // intent x kit sweep either (measured: 352 rotations, 392 asymmetrical drops, **0** cross-category
  // inferences, 0 ungated). That is the equipment-gate fix landing, not the rung going dead: an
  // untagged movement is now performable unless it reads as machine-braced, so a cell that used to
  // empty of everything untagged now fills at its OWN rung and never reaches for a neighbour's.
  //
  // ⛔ SO THE SUBJECT IS NOW HIS ROTATION, and the per-hit label assertions below are unchanged —
  // whichever rung fires still has to say whose it is. If a future catalogue or gate change makes
  // our rung reachable again, the `ours` branch here catches it the first time it fires.
  let sawCrossCategory = false;
  for (const kit of KITS) {
    for (const slot of ALL_ROUNDER_SLOTS) {
      const r = resolveSlot({ ...slot.req, equipment: kit.equipment });
      const s = r.substitution;
      if (!s || s.toCategory === s.fromCategory) continue;
      sawCrossCategory = true;
      const hisRotation = (s.fromCategory === 'braced' && s.toCategory === 'secondary')
        || (s.fromCategory === 'secondary' && s.toCategory === 'braced');
      if (hisRotation) {
        assertEquals(s.cite, 'Viada p275', `${slot.label} [${kit.label}]: his rotation is cited as "${s.cite}"`);
        continue;
      }
      assert(s.cite.includes('ours'), `${slot.label} [${kit.label}]: our inference is cited as "${s.cite}"`);
      assert(r.notes.some((n) => n.kind === 'inferred' || n.kind === 'ours'),
        `${slot.label} [${kit.label}]: substituted across categories with no inference note`);
    }
  }
  assert(sawCrossCategory, 'no cross-category substitution fired anywhere — the label has no subject');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — HIS NUMBERS, EXACTLY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the four intents carry his numbers, written out', () => {
  // ⛔ LITERALS, NOT THE CONSTANTS. A test that recomputes its expectation from the table it is
  // checking can never fail — stage 1's mutation run proved that twice in one afternoon.
  const me = prescribe('ME', 'barbell');
  const de = prescribe('DE', 'barbell');
  const skill = prescribe('SKILL', 'barbell');
  const hyp = prescribe('HYP', 'barbell');
  if (me.kind !== 'barbell' || de.kind !== 'barbell' || skill.kind !== 'barbell' || hyp.kind !== 'barbell') {
    throw new Error('barbell family did not return a barbell prescription');
  }

  assertEquals(me.reps, { lo: 1, hi: 5 });
  assertEquals(me.pctOf1RM, { lo: 0.90, hi: 1.00 });
  assertEquals(me.setsBand, { lo: 1, hi: 3 });
  // ⛔ NULL, NOT ZERO. p218 says "no RIR target"; p219 defines 0 RIR as a specific and different thing.
  assertEquals(me.rir, null, 'ME grew an RIR target the source says it does not have');

  assertEquals(de.reps, { lo: 2, hi: 4 });
  assertEquals(de.pctOf1RM, { lo: 0.70, hi: 0.80 });
  assertEquals(de.rir, { lo: 3, hi: 4 });
  assertEquals(de.setsBand, { lo: 4, hi: 6 });

  assertEquals(skill.reps, { lo: 3, hi: 5 });
  assertEquals(skill.pctOf1RM, { lo: 0.75, hi: 0.85 });
  assertEquals(skill.rir, { lo: 3, hi: 4 });
  assertEquals(skill.setsBand, { lo: 3, hi: 5 });

  assertEquals(hyp.reps, { lo: 6, hi: 12 });
  assertEquals(hyp.rir, { lo: 0, hi: 2 });
  assertEquals(hyp.setsBand, { lo: 3, hi: 4 });
  // ⛔ HE GIVES NO PERCENTAGE FOR HYP. Supplying one would be the invented number rule 2 forbids.
  assertEquals(hyp.pctOf1RM, null, 'HYP grew a percentage the source does not give');

  // The tempo clauses are on p218 and were missing from the transcription — read off the image.
  assertEquals(de.tempo, 'Maximum velocity.');
  assertEquals(skill.tempo, 'Controlled eccentric, fast concentric.');
  assertEquals(hyp.tempo, 'Controlled eccentric, controlled concentric.');
  assertEquals(me.tempo, null);
});

Deno.test('sets start at the low end, and nothing raises them on its own', () => {
  // p218: "Sets should always remain on the lower end when starting a program, increasing only if
  // the athlete is finding that they are progressing well and seem to have recovery to spare."
  // ⛔ GAP #11: he gives no rule for evaluating that condition, so the library never raises them.
  for (const intent of VIADA_INTENTS) {
    const p = prescribe(intent, 'barbell');
    if (p.kind !== 'barbell') throw new Error('wrong family');
    assertEquals(p.sets, p.setsBand.lo, `${intent} did not start at the low end`);
  }
  assertEquals((prescribe('ME', 'barbell') as { sets: number }).sets, 1);
  assertEquals((prescribe('DE', 'barbell') as { sets: number }).sets, 4);
  // A caller who has been TOLD to progress can say so; that is the only way the number moves.
  assertEquals(setsFor({ lo: 1, hi: 3 }, 1), 3);
  assertEquals(setsFor({ lo: 1, hi: 3 }, 0.5), 2);
  assertEquals(setsFor({ lo: 1, hi: 3 }), 1);
  assertEquals(setsFor({ lo: 1, hi: 3 }, -5), 1, 'a nonsense position escaped the clamp');
  assertEquals(setsFor({ lo: 1, hi: 3 }, 99), 3, 'a nonsense position escaped the clamp');
});

Deno.test('carries reuse the four names and mean different things by them', () => {
  // ⛔ p226 IS A SECOND VOCABULARY. A carry's ME has no reps and no percentage — it has a weight
  // description and an RPE. Resolving an intent without knowing the family is the mistake the
  // signature exists to prevent.
  for (const intent of VIADA_INTENTS) {
    const c = prescribe(intent, 'carry');
    assertEquals(c.kind, 'carry', `${intent} carry returned a barbell prescription`);
    if (c.kind !== 'carry') continue;
    assert(!('reps' in c), `${intent} carry grew a rep count`);
    assert(!('pctOf1RM' in c), `${intent} carry grew a percentage`);
  }
  const me = prescribe('ME', 'carry');
  const skill = prescribe('SKILL', 'carry');
  const hyp = prescribe('HYP', 'carry');
  if (me.kind !== 'carry' || skill.kind !== 'carry' || hyp.kind !== 'carry') throw new Error('wrong family');
  assertEquals(me.rpe, 9);
  // ⛔ HIS OWN DISTINCTION, AND IT INVERTS BETWEEN TWO OF THE FOUR: skill work accumulates NO
  // fatigue and hypertrophy work accumulates it ON PURPOSE. Collapsing them loses the whole point.
  assertEquals(skill.fatigue, 'avoid');
  assertEquals(hyp.fatigue, 'target');
  // And the barbell table's ME is a different animal entirely.
  const barbellMe = prescribe('ME', 'barbell');
  assert(barbellMe.kind === 'barbell' && 'reps' in barbellMe);
});

Deno.test('the gaps he leaves are named, not filled', () => {
  const r = resolveSlot({ intent: 'ME', category: 'secondary', pattern: 'push_upper', equipment: null });
  // Rest between sets — gap #10.
  const rest = r.notes.find((n) => n.kind === 'gap' && n.text.includes('rest interval'));
  assert(rest, 'no note saying the rest interval is unstated');
  assert(!/\b\d+\s*(s|sec|second|min|minute)/.test(rest!.text.replace(/6-8 minutes/, '')),
    'the rest note supplied a number');
  // The 1-to-3-sets band — gap #11.
  assert(r.notes.some((n) => n.kind === 'gap' && n.text.includes('progressing well')),
    'no note saying when the set count may rise');
  // And no prescription anywhere carries a rest field.
  assert(!('restSeconds' in (r.prescription as Record<string, unknown>)),
    'a prescription grew a rest interval the source never gave');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE CLASSIFIER, AGAINST HIS OWN PUBLISHED EXAMPLES
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('his own worked examples classify the way he files them', () => {
  // ⛔ HIS LISTS, AS GROUND TRUTH, AND ONLY HERE. Every entry below is a movement he names under a
  // heading on pp218-226, paired with the heading he files it under. A classifier is verified
  // against the author's worked examples or it is verified against nothing.
  //
  // ⚠️ ONLY THE MOVEMENTS OUR CATALOGUE HOLDS ARE LISTED. The ones it does not hold are the finding
  // in §D below, not a silent omission here.
  const GROUND_TRUTH: [string, ViadaCategory, ViadaPattern | null][] = [
    // PRIMARY (p218-219)
    ['bench press', 'primary', 'push_upper'],
    ['military press', 'primary', 'push_upper'],
    ['push press', 'primary', 'push_upper'],
    ['pull up', 'primary', 'pull_upper'],
    ['deadlift', 'primary', 'hinge_lower'],
    ['trap bar deadlift', 'primary', 'hinge_lower'],
    ['back squat', 'primary', 'press_lower'],
    ['front squat', 'primary', 'press_lower'],
    // SECONDARY (p220)
    ['incline bench press', 'secondary', 'push_upper'],
    ['close grip bench press', 'secondary', 'push_upper'],
    ['dumbbell shoulder press', 'secondary', 'push_upper'],
    ['dumbbell row', 'secondary', 'pull_upper'],
    ['romanian deadlift', 'secondary', 'hinge_lower'],
    ['good morning', 'secondary', 'hinge_lower'],
    ['kettlebell swing', 'secondary', 'hinge_lower'],
    ['bulgarian split squat', 'secondary', 'press_lower'],
    ['reverse lunge', 'secondary', 'press_lower'],
    ['walking lunge', 'secondary', 'press_lower'],
    // BRACED (p221-222)
    ['lat pulldown', 'braced', 'pull_upper'],
    ['chest supported row', 'braced', 'pull_upper'],
    ['leg press', 'braced', 'press_lower'],
    ['reverse hyperextension', 'braced', 'hinge_lower'],
    ['back extension', 'braced', 'hinge_lower'],
    // FOCUSED (p222-223)
    ['triceps pushdown', 'focused', 'push_upper'],
    ['lateral raise', 'focused', 'push_upper'],
    ['leg extension', 'focused', 'press_lower'],
    ['seated calf raise', 'focused', 'press_lower'],
    ['leg curl', 'focused', 'hinge_lower'],
    ['dumbbell curl', 'focused', 'pull_upper'],
    // CORE (p223)
    ['hanging leg raise', 'core', null],
    ['crunch', 'core', null],
    ['v up', 'core', null],
    ['ab wheel rollout', 'core', null],
    // CARRY (p226)
    ['farmers carry', 'carry', null],
    ['sled push', 'carry', null],
    ['sled pull', 'carry', null],
    ['suitcase carry', 'carry', null],
    // ⚠️ NOT A CARRY. A lateral band walk matches the carry test's `walk` and transports nothing —
    // it is the only real subject of `CARRY_EXCLUDE_RE`, and without it that exclusion is untested.
    ['lateral band walk', 'secondary', 'hinge_lower'],
  ];

  const wrong: string[] = [];
  for (const [name, category, pattern] of GROUND_TRUTH) {
    const gotC = viadaCategoryOf(name);
    if (gotC !== category) wrong.push(`${name}: category ${gotC} (he files it ${category})`);
    if (category !== 'core' && category !== 'carry') {
      const gotP = viadaPatternOf(name);
      if (gotP !== pattern) wrong.push(`${name}: pattern ${gotP} (he files it ${pattern})`);
    }
  }
  assertEquals(wrong, [], `the classifier disagrees with the source:\n  ${wrong.join('\n  ')}`);
});

Deno.test('single-joint beats bracing, because that is how HE resolves the overlap', () => {
  // ⛔ A PEC DECK IS A MACHINE AND SINGLE-JOINT, AND HE FILES IT UNDER FOCUSED. Testing bracing
  // first would move half his focused list into braced, so the order is load-bearing.
  // Our catalogue's stand-ins for that overlap:
  assertEquals(viadaCategoryOf('cable crossover'), 'focused', 'a single-joint cable movement went to braced');
  assertEquals(viadaCategoryOf('cable curl'), 'focused', 'a single-joint cable movement went to braced');
  // And a multi-joint cable movement stays braced.
  assertEquals(viadaCategoryOf('cable row'), 'braced');
  assertEquals(viadaCategoryOf('lat pulldown'), 'braced');
});

Deno.test('the arm flag does not turn a compound press into an isolation movement', () => {
  // ⛔ `armIsolation` IS TRUE FOR A CLOSE-GRIP BENCH AND A DIAMOND PUSH-UP — correctly, they are
  // triceps movements — and NEITHER IS SINGLE-JOINT. Viada files close-grip bench under SECONDARY
  // PUSH UPPER by name. This is `exercise-config.ts`'s own "same data, two questions" warning
  // arriving: the arm flag is right about arms and silent about joint count.
  assertEquals(getExerciseConfig('close grip bench press')?.armIsolation, true,
    'the premise of this test has gone — close-grip bench is no longer flagged as arm work');
  assertEquals(viadaCategoryOf('close grip bench press'), 'secondary');
  assertEquals(viadaCategoryOf('diamond push up'), 'secondary');
  // While real single-joint arm work does land in focused.
  assertEquals(viadaCategoryOf('triceps pushdown'), 'focused');
  assertEquals(viadaCategoryOf('dumbbell curl'), 'focused');
});

Deno.test('asymmetrical is a MODIFIER — there is no sixth category', () => {
  // ⛔ SETTLED 2026-08-21 AFTER A PAGE-BY-PAGE CHECK. The word is not a heading anywhere in the
  // movement key, and pp224-225 — where a sixth list was once predicted — are the Olympic lifts.
  assertEquals(VIADA_CATEGORIES.length, 6, 'the category list changed size');
  assert(!VIADA_CATEGORIES.some((c) => String(c).includes('asym')), 'an asymmetrical CATEGORY appeared');
  // It is a property of a movement, read from the flag the app already keeps.
  assertEquals(isAsymmetrical('bulgarian split squat'), true);
  assertEquals(isAsymmetrical('back squat'), false);
  // And asking for it narrows within a category rather than switching to another.
  const r = resolveSlot({ intent: 'HYP', category: 'secondary', pattern: 'press_lower', asymmetrical: true, equipment: null });
  assert(r.chosen.asymmetrical, 'an asymmetrical request returned a two-limb movement with no substitution');
  assertEquals(r.chosen.category, 'secondary');
});

Deno.test('Olympic lifting is not built', () => {
  // ⛔ OUT OF SCOPE (Michael, 2026-08-21). pp224-225 use HEAVY/REP/SKILL/GROOVE — a third vocabulary
  // sharing only the word SKILL, and even there the structure differs (general SKILL is 3-5 reps,
  // OLY SKILL is singles). Nothing here may know those names.
  assertEquals(VIADA_INTENTS, ['ME', 'DE', 'SKILL', 'HYP']);
  for (const bad of ['HEAVY', 'REP', 'GROOVE']) {
    assert(!(VIADA_INTENTS as string[]).includes(bad), `${bad} is an Olympic intent and must not exist here`);
    assertThrows(
      () => resolveSlot({ intent: bad as ViadaIntent, category: 'primary', pattern: 'push_upper', equipment: null }),
      undefined,
      undefined,
      `${bad} was accepted as an intent`,
    );
  }
});

Deno.test('plyometrics are not lifting slots', () => {
  // p227 is its own section with its own rules — drills done separately, ample rest, stop when the
  // movement is optimised. None of that is a set-and-rep prescription, and running a box jump
  // through the ME/DE/SKILL/HYP table would produce one.
  for (const name of ['box jump', 'jump squat', 'bounding', 'skater hop']) {
    assertEquals(viadaCategoryOf(name), null, `${name} was classified into the lifting grid`);
  }
  assert(!allGridMovements().some((m) => m.name === 'box jump'));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE INDEX ITSELF
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every classified movement resolves EXACTLY in the catalogue', () => {
  // ⛔ D-322. A name that only fuzzy-matches borrows another movement's ratio and display — "Hack
  // Squat" would borrow `squat` at ratio 1.0 and prescribe a hack squat at full back-squat load.
  for (const m of allGridMovements()) {
    assert(getExerciseConfig(m.name) != null, `${m.name} does not resolve`);
    assert(m.category != null, `${m.name} has no category`);
    if (m.category !== 'core' && m.category !== 'carry') {
      assert(m.pattern != null, `${m.name} is a ${m.category} with no pattern`);
    }
  }
});

Deno.test('the grid has no duplicate offers, and no bare catalogue stubs', () => {
  const names = allGridMovements().map((m) => m.name);
  assertEquals(names.length, new Set(names).size, 'the index holds the same movement twice');
  // Plurals are collapsed — "lateral raise" and "lateral raises" are one offer, not two.
  const both = names.filter((n) => names.includes(`${n}s`));
  assertEquals(both, [], `a singular and its plural are both offered: ${both.join(', ')}`);
  // And the bare keys the catalogue keeps for loose resolution are never offered.
  for (const kit of KITS) {
    for (const slot of ALL_ROUNDER_SLOTS) {
      const r = resolveSlot({ ...slot.req, equipment: kit.equipment });
      // ⛔ ABSENT FROM THE LIST, not merely unchosen. A stub sitting second in the options is still
      // offered — a swap sheet reads the whole list, and "Press" is not a movement anyone can perform.
      for (const stub of ['press', 'bench', 'row', 'rows', 'squat', 'deadlift', 'lunge', 'incline bench']) {
        assert(!r.options.some((o) => o.name === stub),
          `${slot.label} [${kit.label}] offered the bare stub "${stub}"`);
      }
    }
  }
});

Deno.test('the ladder never reaches outside the two categories that have none', () => {
  // A carry cannot be stood in for by a press, and a core movement is not a pressing slot.
  assertEquals(SUBSTITUTION_LADDER.carry, ['carry']);
  assertEquals(SUBSTITUTION_LADDER.core, ['core']);
  for (const kit of KITS) {
    for (const category of ['carry', 'core'] as ViadaCategory[]) {
      const r = resolveSlot({ category, pattern: null, intent: 'HYP', equipment: kit.equipment });
      assertEquals(r.chosen.category, category,
        `[${kit.label}] a ${category} slot was filled with a ${r.chosen.category} movement`);
    }
  }
});

Deno.test('an incoherent request is refused, not guessed', () => {
  assertThrows(() => resolveSlot({ category: 'nope' as ViadaCategory, pattern: 'push_upper', intent: 'ME' }));
  // An unknown movement classifies to null rather than defaulting into a category — a movement with
  // no prescription must never reach an athlete wearing one borrowed from somewhere else.
  assertEquals(viadaCategoryOf('interpretive dance'), null);
  assertEquals(viadaCategoryOf(''), null);
  assertEquals(viadaPatternOf('interpretive dance'), null);
});

Deno.test('every category and pattern the grid names is populated', () => {
  // ⛔ THE FINDING THIS TEST PINS: `braced / push_upper` IS EMPTY. Our catalogue has no machine chest
  // press, Smith press or dip machine — it grew around Wendler's barbell-and-dumbbell world, and
  // Viada's braced category is the half it never needed. The slot still resolves, via the ladder,
  // and the athlete is told. **If this list ever grows, something has been deleted; if it shrinks,
  // the catalogue gained a movement and that is the fix landing.**
  const empty: string[] = [];
  for (const category of ['primary', 'secondary', 'braced', 'focused'] as ViadaCategory[]) {
    for (const pattern of VIADA_PATTERNS) {
      if (movementsIn(category, pattern).length === 0) empty.push(`${category}/${pattern}`);
    }
  }
  assertEquals(empty, ['braced/push_upper'], 'the set of empty grid cells moved');
  assert(movementsIn('carry', null).length > 0);
  assert(movementsIn('core', null).length > 0);
  // And the cells report themselves for anyone auditing coverage.
  assert(gridCells().length >= 10);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — EQUIPMENT
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('undeclared equipment offers everything; declared equipment gates', () => {
  // §0h — unknown inventory means "we have not asked", never "owns nothing".
  const undeclared = resolveSlot({ intent: 'ME', category: 'secondary', pattern: 'push_upper', equipment: null });
  assertEquals(undeclared.substitution, null, 'an unasked athlete was substituted against');

  // ⛔ AND "EVERYTHING" MEANS EVERYTHING — the whole cell, minus only the bare stubs. Anything less
  // means the gate ran on an athlete nobody asked, which is the §0h violation itself.
  const wholeCell = movementsIn('secondary', 'push_upper')
    .filter((m) => !['press', 'bench', 'row', 'squat', 'deadlift', 'lunge', 'incline bench', 'shoulder press'].includes(m.name));
  assertEquals(undeclared.options.length, wholeCell.length,
    'an unasked athlete had their options filtered');

  // ⛔ THE OPTIONS ARE ORDERED BY EQUIPMENT FIT, not by catalogue order. Dropping the ranking leaves
  // every option present and the best one buried, which no count-based assertion can see.
  for (const kit of KITS) {
    for (const [category, pattern] of [['secondary', 'push_upper'], ['focused', 'push_upper'], ['secondary', 'pull_upper']] as const) {
      const r = resolveSlot({ intent: 'HYP', category, pattern, equipment: kit.equipment });
      const ranks = r.options.map((o) => equipmentFitRank(o.name, kit.equipment) ?? Number.MAX_SAFE_INTEGER);
      for (let i = 1; i < ranks.length; i++) {
        assert(ranks[i] >= ranks[i - 1],
          `${category}/${pattern} [${kit.label}]: option ${i} fits better than the one before it`);
      }
    }
  }

  // ⛔ A TAGGED MOVEMENT THE ATHLETE CANNOT PERFORM IS EXCLUDED — the gate itself, not just the tag
  // check. An incline bench press needs a barbell AND an incline bench.
  const dbOnly = resolveSlot({ intent: 'HYP', category: 'secondary', pattern: 'push_upper', equipment: ['Dumbbells'] });
  assert(dbOnly.options.every((o) => o.name !== 'incline bench press'),
    'a barbell-and-incline-bench movement was offered to a dumbbells-only athlete');
  assert(dbOnly.options.every((o) => o.name !== 'dips'),
    'a movement needing a rack or bench was offered to a dumbbells-only athlete');

  // A bodyweight athlete must not be handed a barbell movement as if they owned one.
  const bw = resolveSlot({ intent: 'ME', category: 'secondary', pattern: 'push_upper', equipment: ['Pull-up bar'] });
  assert(bw.options.every((o) => o.name !== 'incline bench press'),
    'a barbell-and-bench movement was offered to a bodyweight athlete');

  // And an athlete who owns dumbbells gets a dumbbell answer rather than a bodyweight one.
  const db = resolveSlot({ intent: 'ME', category: 'secondary', pattern: 'push_upper', equipment: ['Dumbbells'] });
  assert(/dumbbell|db/.test(db.chosen.name), `a dumbbell owner was offered "${db.chosen.name}"`);
});

Deno.test('an untagged movement is not treated as free for an athlete who declared their kit', () => {
  // ⛔ THE READING THIS GRID MAKES LOCALLY, AND THE REASON. `gearRoutesFor` returns "needs nothing"
  // for an untagged movement — right over a curated 28-movement menu, wrong over a 316-movement
  // catalogue, where it hands a bodyweight athlete a leg press.
  assertEquals(isGearTagged('leg press'), false, 'leg press gained a gear tag — this test is now stale');
  assertEquals(isGearTagged('push up'), true);
  const bw = resolveSlot({ intent: 'HYP', category: 'braced', pattern: 'press_lower', equipment: ['Pull-up bar'] });
  assert(bw.chosen.name !== 'leg press', 'a bodyweight athlete was handed a leg press');
  assert(bw.substitution != null, 'the substitution away from the leg press was not declared');
  // …and the same slot for a gym member is free to be the leg press.
  const gym = resolveSlot({ intent: 'HYP', category: 'braced', pattern: 'press_lower', equipment: null });
  assertEquals(gym.chosen.name, 'leg press');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — CLIENT-REACHABLE, ASSERTED AT THE SOURCE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the module carries nothing that would break in a browser', async () => {
  // ⛔ A LINT, AND IT SAYS SO. What it cannot hold — that the bundler resolves the module through the
  // `@shared` alias and that the result RUNS — was proven by building it with this repo's own Vite
  // and executing the bundle; see the stage notes.
  const dir = new URL('.', import.meta.url).pathname;
  for (const name of ['intents.ts', 'taxonomy.ts', 'grid.ts', 'index.ts']) {
    const src = await Deno.readTextFile(dir + name);
    assert(!/\bDeno\./.test(src), `${name} touches Deno — it cannot run in the client`);
    assert(!/from ['"]https:/.test(src), `${name} imports over https`);
    assert(!/createClient|@supabase\/supabase-js/.test(src), `${name} reaches for a supabase client`);
    assert(!/\bprocess\.env\b/.test(src), `${name} reads process.env`);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
      assert(m[1].startsWith('.'), `${name} imports "${m[1]}", which the client cannot resolve`);
    }
  }
});

Deno.test('the grid does not fork the vocabularies it reads', () => {
  // ⛔ THE DISEASE THIS STAGE WAS WARNED ABOUT. A second exercise catalogue, a second equipment
  // gate, or ME/DE/SKILL/HYP bolted onto `StrengthIntent` would all be the same mistake.
  const dir = new URL('.', import.meta.url).pathname;
  const sources = ['intents.ts', 'taxonomy.ts', 'grid.ts', 'index.ts']
    .map((n) => Deno.readTextFileSync(dir + n))
    .join('\n');
  const code = sources.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // No literal movement table.
  assert(!/EXERCISE_CONFIG\s*[:=]\s*\{/.test(code), 'the grid declares its own exercise config');
  assert(!/ASSISTANCE_GEAR\s*[:=]\s*\{/.test(code), 'the grid declares its own gear table');
  // The three things it must read rather than re-derive.
  assert(/EXERCISE_CONFIG/.test(code), 'the grid stopped reading the shared catalogue');
  assert(/canPerform/.test(code), 'the grid stopped reading the shared equipment gate');
  assert(/isUnilateral|isAsymmetrical/.test(code), 'the grid stopped reading the unilateral flag');
  // And it must not have grown a session-intent union of its own.
  assert(!/LOWER_NEURAL|UPPER_STRENGTH|FULLBODY_/.test(code),
    'the grid reached into the SESSION intent axis, which is a different question');
});

Deno.test('every category carries the definition it was built from', () => {
  for (const c of VIADA_CATEGORIES) {
    const d = CATEGORY_DEFINITION[c];
    assert(d && d.text.length > 10 && /Viada p/.test(d.cite), `${c} has no sourced definition`);
  }
  const r = resolveSlot({ intent: 'HYP', category: 'focused', pattern: 'push_upper', equipment: null });
  assert(r.notes.some((n) => n.kind === 'source' && n.text.includes('Single-joint')),
    'the slot does not carry the definition of the category it came from');
});
