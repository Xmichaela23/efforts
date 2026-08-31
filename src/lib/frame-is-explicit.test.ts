/**
 * ⛔⛔⛔ D-457 — THE CHOSEN FRAME IS EXPLICIT AT EVERY CALL SITE. THE STANDING LAW, ENFORCED.
 *
 * **Michael, 2026-08-30: *"We need to really separate the builders. The code and anyone touching it
 * needs to know the difference. There will be a lot of different builds."***
 *
 * ⛔ THE DISEASE THIS EXISTS TO END, AND IT HAS BITTEN FIVE TIMES ON ONE SCREEN'S PATH:
 *   1. The endurance card read `SLOT_KEYS` / `SLOT_LABEL` / `SLOT_OPTIONS` /
 *      `REQUIRED_SLOT_DISPLAY_ORDER` / `HARD_SLOT_KEYS` — five module constants baked from
 *      `strength_5k` — while its completion gate read the CHOSEN frame. Standard Focus drew four
 *      rows and demanded five answers: **Continue was disabled and could not be satisfied.**
 *   2. `SLOT_FAMILY`, the same shape, indexed by a five-row frame's keys: `.family` on `undefined`
 *      **took the whole page blank.**
 *   3. `FRAME_ARCHETYPE` handed p274's ride row p246's RUN archetype, so its ladder came back empty
 *      and both riding chips rendered as bare labels with no number on them.
 *   4. The equal-tiers line's own comment swept `strength_5k` alone and reported the result as the
 *      app's, so a **provably false** sentence shipped on the other frame.
 *   5. The Build focus screen called `pickKeysInDayOrder()` and `dayLabelForPick()` with no frame:
 *      p246's nine controls rendered over a p274 week and **five of them were dead** — every option
 *      swept through `composeWeek` and none landed.
 *
 * ⛔⛔ EVERY ONE OF THEM FAILED SILENTLY. Not one threw. That is the whole argument for a test that
 * reads the SOURCE: a defaulted frame argument is indistinguishable, at the call site, from a
 * correct one, and no runtime assertion can see the difference.
 *
 * ⚠️ IT DERIVES ITS OWN SUBJECT. The list of frame-taking functions is read out of the modules at
 * test time rather than typed here — a hand-kept list of what to guard is the same rot in a
 * different file. A new frame-taking export is covered the moment it is written.
 * ⚠️ AND ITS LIMIT IS STATED: this reads source text, so it catches an omitted argument and not a
 * WRONG one. A screen passing the other frame's id on purpose is a different failure and needs a
 * rendered check — which is why every frame change in this area also gets one.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/frame-is-explicit.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALL_ROUNDER_PICK_KEYS,
  dayLabelForPick,
  frameMuscleForPick,
  pickKeysInDayOrder,
  pickOptions,
  picksForFrame,
  VIADA_PICKS,
  VIADA_PICK_KEYS,
} from '../../supabase/functions/_shared/standing-plan/accessory-picks.ts';
import {
  composeWeek,
  defaultCompetitionLifts,
} from '../../supabase/functions/_shared/standing-plan/index.ts';
import { FRAMES } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import { musclesWorkedBy } from '../../supabase/functions/_shared/accessory-dosing/index.ts';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

/** ⚠️ ANCHORS ONLY — the picks are movement names and no number here depends on the athlete. */
const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
  ftp: 250,
};

/** ⛔ THE MODULES THAT SPEAK FRAME. A screen reaches the frames through one of these or not at all. */
const SOURCES = [
  '../../supabase/functions/_shared/standing-plan/accessory-picks.ts',
  './standing-plan-week-copy.ts',
  './standing-plan-week-bounds.ts',
  './hard-slot-choices.ts',
];
/** ⛔ THE SCREENS. Where every one of the five defects above actually landed. */
const SCREENS = [
  '../components/NonRaceBuilder.tsx',
  '../components/EnduranceWeekCard.tsx',
  '../components/HardSlotChoices.tsx',
];

/**
 * Exported functions whose signature takes a `frame`. ⚠️ Parsed from the signature text between the
 * name and the closing paren of the parameter list, so an options-bag `{ frame?: FrameId }` counts
 * too — those defaulted just as silently as the positional ones.
 */
async function frameTakingExports(rel: string): Promise<Set<string>> {
  const src = await read(rel);
  const out = new Set<string>();
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const open = re.lastIndex - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    if (/\bframe\b/.test(src.slice(open, end))) out.add(m[1]);
  }
  return out;
}

/** The text of each argument list for `name(...)`, paren-balanced so nested calls do not truncate it. */
function callArgs(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(^|[^A-Za-z0-9_.])${name}\\s*\\(`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const open = re.lastIndex - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') {
        depth -= 1;
        if (depth === 0) { out.push(src.slice(open + 1, i)); break; }
      }
    }
  }
  return out;
}

/** ⚠️ WHAT COUNTS AS NAMING A FRAME. A variable called `frame`, a prop, or a frame id spelled out. */
const NAMES_A_FRAME = (args: string) =>
  /\bframe\b|\bwizardFrame\b|'all_rounder'|'strength_5k'|"all_rounder"|"strength_5k"/.test(args);

Deno.test('⛔⛔⛔ D-457 — NO SCREEN CALLS A FRAME-TAKING FUNCTION WITHOUT NAMING THE FRAME', async () => {
  const guarded = new Set<string>();
  for (const s of SOURCES) for (const n of await frameTakingExports(s)) guarded.add(n);
  /**
   * ⚠️ A FLOOR ON THE SUBJECT ITSELF. Without this the test passes loudly the day the parse breaks
   * or a module is renamed out of `SOURCES` — a guard that guards nothing is worse than none.
   */
  assert(guarded.size >= 20,
    `only ${guarded.size} frame-taking exports found — the parse or the module list has rotted`);

  const offenders: string[] = [];
  for (const screen of SCREENS) {
    const src = await read(screen);
    for (const fn of guarded) {
      for (const args of callArgs(src, fn)) {
        if (!NAMES_A_FRAME(args)) {
          offenders.push(`${screen.replace('../', '')} → ${fn}(${args.trim().slice(0, 60)})`);
        }
      }
    }
  }
  assertEquals(offenders, [],
    '⛔ A SCREEN IS ASKING A FRAME-TAKING FUNCTION WITHOUT SAYING WHICH FRAME, so it silently gets '
    + '`strength_5k` and renders one programme over another\'s week. Pass the chosen frame:\n  '
    + offenders.join('\n  '));
});

Deno.test('⛔⛔ AND NO SCREEN IMPORTS A CONSTANT BAKED FROM ONE FRAME', async () => {
  /**
   * ⛔ THESE ARE `strength_5k`'s MEMBERSHIP, evaluated at module load. Every one of them is exported
   * for a caller that predates the second frame, and every one is a live trap for a screen: **a
   * constant imported at the top of a file looks identical, at the call site, to a derived value.**
   * ⚠️ THEY ARE NOT DELETED, because the pre-frame callers are real. What is forbidden is a SCREEN
   * reading one — a screen always knows its frame and has a function that takes it.
   */
  const BAKED = [
    'SLOT_KEYS', 'SLOT_LABEL', 'SLOT_OPTIONS', 'REQUIRED_SLOT_DISPLAY_ORDER',
    'REQUIRED_SLOT_KEYS', 'HARD_SLOT_KEYS', 'SLOT_FAMILY', 'FRAME_ARCHETYPE',
  ];
  const offenders: string[] = [];
  for (const screen of SCREENS) {
    const src = await read(screen);
    /**
     * ⚠️ THE IMPORT BLOCKS ONLY, AND WITH THEIR COMMENTS STRIPPED. Two reasons, and the second was
     * found by this test failing on its own tombstone: these names appear in prose throughout the
     * files' comment trails, and the note explaining WHY a constant is not imported lives inside the
     * import braces. **A guard that cannot tell an import from a note about an import is a guard
     * nobody can satisfy.**
     */
    const blocks = (src.match(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];/g) ?? [])
      .map((b) => b.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
    for (const block of blocks) {
      for (const name of BAKED) {
        if (new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(block)) {
          offenders.push(`${screen.replace('../', '')} imports ${name}`);
        }
      }
    }
  }
  assertEquals(offenders, [],
    '⛔ A SCREEN IMPORTS ONE FRAME\'S MEMBERSHIP AS A CONSTANT. It will index it by the CHOSEN '
    + 'frame\'s keys, which has blanked the app once and disabled Continue once:\n  '
    + offenders.join('\n  '));
});

Deno.test('⛔ THE BUILD FOCUS SCREEN DRAWS ONLY PICKS THE CHOSEN FRAME CAN HONOUR', async () => {
  /**
   * ⛔ THE FIFTH BITE, PINNED AT ITS OWN CALL SITE. `picksForFrame` is the composer's own
   * reachability rule — a pick is drawn when the frame carries an HYP accessory cell it can fill —
   * and reverting to the unfiltered list is what puts five dead controls back on Standard Focus.
   */
  const src = await read('../components/NonRaceBuilder.tsx');
  assert(/picksForFrame\(wizardFrame,\s*strengthEquipment\)/.test(src),
    'the Build focus screen no longer asks the chosen frame — and its kit — which picks it can draw');
  assert(!/pickKeysInDayOrder\(\s*\)/.test(src),
    '⛔ the unfiltered, frame-less pick list is back on the screen');
  assert(/dayLabelForPick\(key,\s*wizardFrame\)/.test(src),
    'the day tags no longer come from the chosen frame');
});

Deno.test('⛔⛔ PASSING THE FRAME CHANGED NOTHING FOR `strength_5k` — the identity, asserted', () => {
  /**
   * ⛔ THIS IS THE ACCEPTANCE TEST FOR MICHAEL'S *"strength_5k renders exactly as today"*, and it is
   * stronger than a screenshot because it is permanent. The only change to that frame's Build focus
   * screen is that two arguments are now named instead of defaulted — and for `strength_5k` the
   * named value IS the default, so the rendered list and every day tag are identical by
   * construction rather than by inspection.
   * ⚠️ IT WOULD FAIL THE DAY THE FILTER STOPPED EXEMPTING THAT FRAME. The same reachability rule
   * would drop Hinge variation from it — correctly, and it is a separate pre-existing defect — so
   * this assertion is what makes that a deliberate change rather than a silent one.
   */
  assertEquals(picksForFrame('strength_5k'), pickKeysInDayOrder(),
    'the 5K Build focus screen no longer draws the list it drew before the frame was passed');
  assertEquals(picksForFrame('strength_5k').length, VIADA_PICK_KEYS.length,
    'a pick went missing from the 5K screen');
  /**
   * ⛔⛔ AND p274's OWN TABLE MUST NOT LEAK ONTO IT. The five braced/focused picks are p274's cells;
   * `strength_5k` carries no `braced` category anywhere, so a shared table would have put five
   * controls on that screen pointing at nothing — the same defect, mirrored.
   */
  for (const k of ['braced_push', 'braced_pull', 'braced_hinge', 'braced_leg', 'ham_iso'] as const) {
    assert(!picksForFrame('strength_5k').includes(k), `p274's ${k} leaked onto the 5K screen`);
  }
  for (const k of VIADA_PICK_KEYS) {
    assertEquals(dayLabelForPick(k, 'strength_5k'), dayLabelForPick(k),
      `the 5K day tag for ${k} changed when the frame became explicit`);
  }

  /**
   * ⛔ AND STANDARD FOCUS DRAWS THE FOUR ITS FRAME CAN HONOUR. The five that go are the five measured
   * dead against `composeWeek`: Hinge variation, both Leg variations, Press variation and Core.
   * p274's accessory work is `braced` and `focused`; p246's is `secondary`, and four of the picks
   * aim at cells this frame does not contain.
   */
  /**
   * ⛔⛔ p274's NINE, IN DAY ORDER — its own table, over the cells the page actually carries. Michael
   * ruled WIRE rather than hide (2026-08-30): the athlete gets a say over all four lifting days.
   * ⚠️ Equipment omitted here, so this is the frame's full membership before the kit is considered —
   * `BRACED_NEEDS_MACHINES` covers what a barbell-only athlete loses.
   */
  assertEquals(picksForFrame('all_rounder'), [
    'braced_push', 'iso_push', 'iso_pull_a',
    'braced_hinge', 'braced_leg', 'ham_iso',
    'braced_pull', 'iso_pull_b', 'quad_iso',
  ]);
  // ⛔ AND ITS DAY TAGS ARE ITS OWN: p274 carries the focused push cell on day 1 AND day 4, where the
  // defaulted call printed "day 1" alone.
  assertEquals(dayLabelForPick('iso_push', 'all_rounder'), 'day 1 · day 4');
  assertEquals(dayLabelForPick('iso_push'), 'day 1');
});

Deno.test('⛔⛔⛔ EVERY PICK STANDARD FOCUS DRAWS ACTUALLY LANDS IN THE COMPOSED WEEK', () => {
  /**
   * ⛔⛔ THIS IS THE DEFECT CLASS THAT STARTED THE WHOLE PASS, and it is now a standing check rather
   * than a one-off sweep. A control the athlete answers and the plan discards is worse than no
   * control: it is the app agreeing to something it will not do. Five of p246's nine did exactly
   * that on p274 before this.
   *
   * ⛔ IT ASSERTS THE BUILT WEEK, not a module call (handoff §7, trap three). Every option of every
   * pick is composed and the movement is looked for on the frame day the screen advertises — so a
   * pick that lands on the WRONG day fails here too, which a presence check alone would miss.
   */
  const BASE = {
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'all_rounder' as const, week: 3,
    column: 'standard' as const, equipment: ['Commercial gym'], baselines: BASELINES,
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    sportMix: { slots: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'ride' } },
    enduranceExperience: { run: 'experienced' as const, ride: 'experienced' as const },
  };
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const drawn = picksForFrame('all_rounder', ['Commercial gym']);
  assertEquals(drawn.length, 9, 'Standard Focus no longer draws a control for all nine of its cells');

  let checked = 0;
  for (const key of drawn) {
      const options = pickOptions(key, ['Commercial gym'], frameMuscleForPick(key, 'all_rounder'))
      .map((o) => o.name);
    assert(options.length >= 1, `${key} is drawn with no movements at all`);
    const wantDays = (dayLabelForPick(key, 'all_rounder') ?? '')
      .split(' · ').map((d) => Number(d.replace('day ', ''))).filter((n) => Number.isFinite(n));
    assert(wantDays.length > 0, `${key} advertises no day`);
    for (const movement of options) {
      const w = composeWeek({ ...BASE, slotPicks: { [key]: movement } } as never) as {
        sessions: Array<{ day: string; type: string; strength_exercises?: Array<{ name: string }> }>;
      };
      const landedOn = new Set(w.sessions
        .filter((x) => x.type === 'strength'
          && (x.strength_exercises ?? []).some((e) => e.name.toLowerCase() === movement.toLowerCase()))
        .map((x) => DAYS.indexOf(x.day) + 1));
      assert(landedOn.size > 0,
        `⛔ ${VIADA_PICKS[key].label} → "${movement}" is offered and the built week does not contain it`);
      for (const d of wantDays) {
        assert(landedOn.has(d),
          `⛔ ${VIADA_PICKS[key].label} says day ${d} and "${movement}" landed on ${[...landedOn].join('/')}`);
      }
      checked += 1;
    }
  }
  assert(checked >= 30, `only ${checked} pick/movement pairs swept — the sweep stopped covering the table`);
});

Deno.test('⛔ THE SUPERSET p274 PRINTS AS ONE ROW IS NAMED ON BOTH ITS HALVES', () => {
  /**
   * ⛔ p274, BOTH LOWER DAYS, VERBATIM: *"2 × HYP: braced hinge / braced lower push superset"*. One
   * printed row, two movements. Nothing in the app pairs exercises yet (`frames.ts`, DESIGN §5), so
   * the screen states the pairing instead — without it the athlete meets two unrelated dropdowns.
   */
  assertEquals(VIADA_PICKS.braced_hinge.pairedWith, 'braced_leg');
  assertEquals(VIADA_PICKS.braced_leg.pairedWith, 'braced_hinge');
  for (const k of ['braced_hinge', 'braced_leg'] as const) {
    assert((VIADA_PICKS[k].superset ?? '').length > 0, `${k} lost the sentence naming its pair`);
  }
  // ⚠️ AND NOTHING ELSE CLAIMS A PAIR. p274 prints only two supersets and the arms one is already
  // three separate picks across two days — a `pairedWith` there would assert a 1:1 link it has not.
  const paired = VIADA_PICK_KEYS.concat(picksForFrame('all_rounder'))
    .filter((k) => VIADA_PICKS[k].pairedWith != null);
  assertEquals([...new Set(paired)].sort(), ['braced_hinge', 'braced_leg']);
});

Deno.test('⛔ THE SUPERSET SENTENCE IS GATED ON ITS PARTNER BEING DRAWN', async () => {
  /**
   * ⛔ CAUGHT ON THE RENDERED PAGE, 2026-08-30, and it is the orphaned-core-note defect one screen
   * later. p274 pairs the braced hinge with the braced lower push, but the leg press half is machine
   * work (p221) — so an athlete without machines saw *"Back extension · superset with the leg
   * press"* over a leg press picker that was not on the screen. **Copy outliving the control it
   * describes.**
   * ⚠️ THE WEEK STILL SUPERSETS; the composer fills that cell by substitution. What the athlete has
   * no say over, the screen does not talk about.
   */
  const src = await read('../components/NonRaceBuilder.tsx');
  assert(/spec\.superset && pairDrawn/.test(src),
    '⛔ the superset sentence is no longer gated on its partner being drawn');
  assert(/drawn\.includes\(spec\.pairedWith\)/.test(src),
    'the pair test no longer reads the list the screen actually drew');

  /**
   * ⚠️⚠️ THE STATE IT GUARDS IS NO LONGER REACHABLE, and that is the amendment working rather than
   * the guard rotting. This test used to assert it live: at a barbell/dumbbell/bench kit the leg
   * press half was dropped and the back extension half survived, so the survivor named a control
   * that was not there. **Michael's substitution amendment closed that** — both halves now offer
   * same-muscle free-weight movements at every kit, so neither is ever dropped alone.
   * ⛔ THE GUARD STAYS, for the same reason the zero-leader guard in `strength-focus-copy.ts` stayed
   * after it stopped being reachable: it costs one boolean and it is what stops the next
   * equipment-gated pick from re-creating the defect. If a future cell has no substitute, this is
   * what keeps its partner's sentence honest.
   */
  const kit = ['Barbell + plates', 'Dumbbells', 'Flat bench'];
  const drawn = picksForFrame('all_rounder', kit);
  for (const half of ['braced_hinge', 'braced_leg'] as const) {
    assert(drawn.includes(half),
      `${half} is not drawn at the barbell baseline — the same-muscle substitution stopped firing`);
  }
});

/** ⛔ THE KITS THE AUDIT RUNS AT. Standard Focus's entry gate asks for a barbell, plates, a rack and
 *  a bench — so the two barbell rows are real athletes, not edge cases. */
const KITS: Array<[string, string[]]> = [
  ['commercial', ['Commercial gym']],
  ['bb+db+bench', ['Barbell + plates', 'Dumbbells', 'Flat bench']],
  ['bb+rack+bench', ['Barbell + plates', 'Squat rack', 'Flat bench']],
];

Deno.test('⛔⛔⛔ THE MUSCLE THE PAGE NAMES IS WHAT THE WEEK BUILDS, AT EVERY KIT', () => {
  /**
   * ⛔⛔ THE DEFECT, AS IT REACHED MICHAEL'S SCREEN. p274 asks for `1 × HYP: focused quadriceps`.
   * p223's list for that CATEGORY is *"leg extensions · hip adduction machine · weighted knee raises
   * (hip flexors) · seated calf raises"* — only the first is quadriceps, and Viada annotates the
   * hip-flexor one himself. Measured across three kits before the fix, that row built:
   *     commercial      leg extension                  <quadriceps>  ✓
   *     bb+db+bench     weighted single leg calf raise <calves>      ⛔
   *     bb+rack+bench   freestanding barbell calf raise<calves>      ⛔
   * and `1 × HYP: braced push` built a **dumbbell shoulder press** <deltoids> at bb+db+bench where
   * p221 prints three chest presses.
   *
   * ⛔ THIS SWEEPS EVERY p274 SLOT THAT NAMES A MUSCLE, AT EVERY KIT, ON THE BUILT WEEK — not on a
   * module call. The muscle is the law; a substitute may leave his printed list, never his muscle.
   */
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let checked = 0;
  for (const [kitName, equipment] of KITS) {
    const w = composeWeek({
      competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'all_rounder', week: 3,
      column: 'standard', equipment, baselines: BASELINES,
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
      sportMix: { slots: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'ride' } },
      enduranceExperience: { run: 'experienced' as const, ride: 'experienced' as const },
    } as never) as { sessions: Array<{ day: string; type: string; strength_exercises?: Array<{ name: string }> }> };
    const byDay: Record<number, string[]> = {};
    for (const sess of w.sessions.filter((x) => x.type === 'strength')) {
      byDay[DAYS.indexOf(sess.day) + 1] = (sess.strength_exercises ?? []).map((e) => e.name);
    }
    for (const day of FRAMES.all_rounder.columns.standard) {
      day.strength.forEach((sl, i) => {
        if (!sl.muscle) return;
        const built = byDay[day.day]?.[i];
        // ⚠️ A DROPPED SLOT IS LEGAL — the week says "N exercises short" and names the equipment.
        // What is never legal is the wrong muscle standing in for the right one.
        if (built == null) return;
        assertEquals(musclesWorkedBy(built)?.primary, sl.muscle,
          `⛔ ${kitName} day ${day.day} "${sl.sourceText}" wants ${sl.muscle} and built "${built}"`);
        checked += 1;
      });
    }
  }
  assert(checked >= 15, `only ${checked} muscle-named slots swept — the sweep stopped covering p274`);
});

Deno.test('⛔ AND EVERY OPTION THE PICKER OFFERS IS THAT MUSCLE, SUBSTITUTES INCLUDED', () => {
  /**
   * ⛔ NARROWING ONLY THE COMPOSER WOULD LEAVE THE DROPDOWN OFFERING A CALF RAISE FOR A QUAD ROW —
   * the athlete picks it, the composer refuses it, and the screen and the week disagree. Both sides
   * read `StrengthSlot.muscle`; this is the half that pins the screen.
   * ⚠️ AND A SUBSTITUTE IS MARKED. Michael's amendment allows the movement to leave his printed list
   * when the kit demands it — *"labeled OURS"* — and an unmarked addition is exactly what the strict
   * cut exists to prevent.
   */
  for (const [kitName, equipment] of KITS) {
    for (const key of ALL_ROUNDER_PICK_KEYS) {
      const muscle = frameMuscleForPick(key, 'all_rounder');
      if (!muscle) continue;
      const options = pickOptions(key, equipment, muscle);
      for (const o of options) {
        assertEquals(o.muscle, muscle,
          `⛔ ${kitName} ${VIADA_PICKS[key].label} offers "${o.name}" <${o.muscle}> for a ${muscle} row`);
      }
      const his = new Set((VIADA_PICKS[key].hisList ?? []).map((n) => n.toLowerCase()));
      for (const o of options) {
        if (!his.has(o.name.toLowerCase())) {
          assert(o.ours === true,
            `⛔ ${kitName} ${VIADA_PICKS[key].label} offers "${o.name}", which he did not print here, unmarked`);
        }
      }
    }
  }
});

Deno.test('⛔ THE ARMS SUPERSET KEEPS HIS PRINTED LISTS WHOLE — Michael: "follow the book"', () => {
  /**
   * ⛔ THE RULING, 2026-08-30. p274 prints `2 × HYP: focused push/pull (arms) superset` and the
   * parenthetical says ARMS — but p223's lists for those two categories are mixed in his own
   * printing: focused push/arms holds pec deck and lateral raises beside the triceps work, focused
   * pull/arms holds the rear delt machine and the pullover machine beside the curls. **The word and
   * the list disagree on the page, and the list wins.**
   * ⛔ THIS ASSERTION IS WHAT STOPS A LATER SESSION "COMPLETING" THE MUSCLE NARROWING. Narrowing
   * these four cells to biceps and triceps would delete movements he prints for them — the app
   * editing the book rather than following it.
   */
  for (const k of ['iso_push', 'iso_pull_a', 'iso_pull_b'] as const) {
    assertEquals(frameMuscleForPick(k, 'all_rounder'), null,
      `${k} was given a muscle — p274's "(arms)" does not override p223's own list`);
  }
  // ⛔ AND HIS LIST IS STILL WHOLE: the non-arm movements he prints are still offered.
  const push = pickOptions('iso_push', ['Commercial gym'], null).map((o) => o.name.toLowerCase());
  assert(push.includes('pec deck'), 'pec deck was cut from a list he prints it in');
  assert(push.includes('lateral raise'), 'lateral raises were cut from a list he prints them in');
  const pull = pickOptions('iso_pull_a', ['Commercial gym'], null).map((o) => o.name.toLowerCase());
  assert(pull.includes('rear delt machine'), 'the rear delt machine was cut from his pull/arms list');
  assert(pull.includes('pullover machine'), 'the pullover machine was cut from his pull/arms list');
});
