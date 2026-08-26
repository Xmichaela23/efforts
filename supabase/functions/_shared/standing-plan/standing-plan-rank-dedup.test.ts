// ============================================================================
// THE GATE — two device findings from the plan built on 2026-08-24, after the equipment-gate fix.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-rank-dedup.test.ts
//
// ⛔ FINDING 1 — A BODYWEIGHT FALLBACK BEAT THE DUMBBELLS THE ATHLETE OWNS.
// `reverse flyes (bodyweight)` filled a focused-pull slot on a declared home gym. That name is not a
// movement anybody chose to program: `materialize-plan` EMITS it as a substitution when the athlete
// owns nothing, and its own config comment says so — *"a BODYWEIGHT fallback — the thing the engine
// reaches for when the athlete owns nothing"*. It reached the offered pool because an UNTAGGED
// movement has no gear route, so `equipmentFitRank` returns 0 for every one of them: a dumbbell rear
// delt fly and a bodyweight fallback TIE at zero and **the catalogue's key order** breaks it. That
// is not a decision, it is an accident of where a key sits in a 316-entry object literal.
//
// ⛔ FINDING 2 — THE SAME LIFT PRINTED TWICE IN ONE SESSION, under two spellings:
// `bulgarian split squat` (secondary push lower) beside `Bulgarian Split Squats` (the athlete's own
// spelling). Three dedup surfaces compared RAW STRINGS — `takenToday` lowercased, the pick pool
// folded, the muscle floor's `alreadyPrescribed` not normalized at all — and none of the three knows
// that a plural is the same lift. `foldExerciseName` strips punctuation and stops there.
//
// ⛔ THE ONE OWNER OF "ARE THESE THE SAME LIFT" ALREADY EXISTS and is `_shared/canonicalize.ts` —
// the SERVER one, which carries the Q-197 plural rule and the Q-210 parenthetical ladder. The client
// mirror in `src/lib` does not, and reaching for it would have fixed nothing.
//
// ⛔⛔ WHAT IS BEHAVIOURALLY PINNED AND WHAT IS ONLY GUARDED — read this before trusting the file.
// Mutation-tested 2026-08-24, and the four changes are NOT equally covered:
//
//   THE RANKING (`grid.ts:rank`)          — behavioural. Disabling the tiebreak fails two tests;
//                                           firing it for a bodyweight athlete fails a third.
//   THE PICK POOL (`compose.ts:pickPool`) — behavioural. Reverting to folded keys fails two tests,
//                                           and reproduces the week-level repeat described below.
//   `takenToday`                          — SOURCE LINT ONLY. Reverting every one of its sites to
//                                           raw `.toLowerCase()` produces NO duplicate anywhere in
//                                           the session sweep. The 17 collision groups in the grid's
//                                           index are real and no week currently lands two of them
//                                           on one day; this is a guard, not a repair.
//   THE MUSCLE FLOOR (`ledger.ts`)        — SOURCE LINT ONLY, for the same reason.
//
// ⚠️ AND THE EXACT REPORTED ROW WAS NOT REPRODUCED. `bulgarian split squat` beside
// `Bulgarian Split Squats` in ONE session does not occur at any frame, kit, week or pick set swept
// here, before or after the fix. What the composer produces on the un-fixed pick pool is the same
// lift on TWO DAYS plus a false "not placed" warning. Something outside this module — the
// materialize layer, or an input shape not modelled here — is between the composer and that row.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { FRAMES } from './frames.ts';
import { canonicalize } from '../canonicalize.ts';
import {
  allGridMovements,
  resolveSlot,
  VIADA_CATEGORIES,
  VIADA_INTENTS,
  VIADA_PATTERNS,
  type ViadaPattern,
} from '../strength-grid/index.ts';
import {
  equipmentFitRank,
  hasLoadableFit,
  ownsLoadingImplement,
} from '../../../../src/lib/strength-gear.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';

/** His declared kit, from the device report. No cable machine. */
const HOME_GYM = [
  'Barbell + plates', 'Dumbbells', 'Rack', 'Flat bench', 'Pull-up bar', 'Bands', 'Ab wheel',
];

const BASE = {
  competitionLifts: {
    push_upper: 'Bench Press',
    press_lower: 'Back Squat',
    hinge_lower: 'Deadlift',
  } as Partial<Record<ViadaPattern, string>>,
  roundTo: 5,
};

const isBodyweight = (name: string) =>
  resolveExerciseConfig(name).config?.displayFormat === 'bodyweight';

const week = (opts: { equipment?: string[] | null; picks?: string[]; frame?: string; wk?: number }) =>
  composeWeek({
    ...BASE,
    frame: opts.frame ?? 'strength_5k',
    week: opts.wk ?? 2,
    column: 'standard',
    equipment: opts.equipment ?? null,
    ...(opts.picks ? { accessoryPicks: opts.picks } : {}),
  } as never);

const rows = (w: ReturnType<typeof week>) =>
  w.sessions
    .filter((s) => s.type === 'strength')
    .map((s) => ({ day: s.day, names: (s.strength_exercises ?? []).map((e) => String(e.name)) }));

/** Every kit shape, so neither fix is tuned to one athlete's inventory. */
const KITS: { label: string; equipment: string[] | null }[] = [
  { label: 'home gym', equipment: HOME_GYM },
  { label: 'commercial gym', equipment: ['Commercial gym'] },
  { label: 'dumbbells only', equipment: ['Dumbbells'] },
  { label: 'barbell + rack', equipment: ['Barbell + plates', 'Squat rack / Power cage'] },
  { label: 'dumbbells + bands', equipment: ['Dumbbells', 'Bands'] },
  { label: 'bands only', equipment: ['Bands'] },
  { label: 'pull-up bar only', equipment: ['Pull-up bar'] },
  { label: 'kettlebell only', equipment: ['Kettlebells'] },
  { label: 'undeclared', equipment: null },
  { label: 'unrecognised chip', equipment: ['Sandbag'] },
];

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — FINDING 1: LOADED BEFORE BODYWEIGHT, AMONG MOVEMENTS THAT OTHERWISE TIE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ A BODYWEIGHT FALLBACK NEVER OUTRANKS A LOADED MOVEMENT THE ATHLETE CAN LOAD', () => {
  /**
   * ⛔ THE SWEEP, over every cell and every kit. The rule is a TIEBREAK: within one equipment-fit
   * rank, nothing drawn without a weight box may sit ahead of something drawn with one.
   *
   * ⚠️ IT IS ASSERTED ON `options`, NOT ON `chosen`, and that is the point. `chosen` is options[0],
   * and the bug only shows once the head of the list is consumed by another slot on the same day —
   * so an assertion on the head alone would have passed on the broken build. The ORDER is the fix.
   */
  let checked = 0;
  for (const kit of KITS) {
    if (!ownsLoadingImplement(kit.equipment)) continue;
    for (const category of VIADA_CATEGORIES) {
      const patterns: (ViadaPattern | null)[] =
        category === 'core' || category === 'carry' ? [null] : VIADA_PATTERNS;
      for (const pattern of patterns) {
        for (const intent of VIADA_INTENTS) {
          const r = resolveSlot({ category, pattern, intent, equipment: kit.equipment });
          checked++;
          for (let i = 1; i < r.options.length; i++) {
            const prev = r.options[i - 1];
            const here = r.options[i];
            const pr = equipmentFitRank(prev.name, kit.equipment);
            const hr = equipmentFitRank(here.name, kit.equipment);
            if (pr !== hr) continue; // different fit tier — `equipmentFitRank` owns that ordering
            assert(
              !(isBodyweight(prev.name) && !isBodyweight(here.name)),
              `${category}/${pattern}/${intent} [${kit.label}]: bodyweight "${prev.name}" sits ahead `
              + `of loaded "${here.name}" at the same fit rank`,
            );
          }
        }
      }
    }
  }
  assert(checked > 200, `only ${checked} resolutions were driven — the sweep shrank`);
});

Deno.test('the two cells from the device report order loaded work first', () => {
  // ⛔ THE NAMED MOVEMENT FROM THE PLAN. `reverse flyes (bodyweight)` must sit behind every dumbbell
  // option in the cell it was drawn from — not merely behind the head of the list.
  const pull = resolveSlot({ intent: 'HYP', category: 'focused', pattern: 'pull_upper', equipment: HOME_GYM });
  const names = pull.options.map((o) => o.name);
  const fallback = names.indexOf('reverse flyes (bodyweight)');
  assert(fallback >= 0, 'the bodyweight fallback left this cell — this test is now stale');
  // ⛔ "LOADED" IS `hasLoadableFit`, NOT "not bodyweight-format" (corrected 2026-08-26). The old
  // reading counted `cable curls` as loaded work that the fallback had to sit behind. Once the
  // catalogue was tagged, `cable curls` resolved to `[['cable'], ['bands']]` on a gym with bands and
  // no cable stack — a BAND-tier fit, rank 101, which `equipmentFitRank` deliberately sorts below
  // every rank-0 movement including this fallback. Demanding the fallback sit behind it would be
  // demanding the band rule be broken. `hasLoadableFit` is the app's own word for the distinction.
  // ⚠️ AND BOTH HALVES ARE NEEDED. `hasLoadableFit` alone means "reached without a band", which an
  // ALWAYS-tagged bodyweight movement satisfies — it caught `reverse flyes bodyweight`, the second
  // spelling of the fallback itself, and demanded the fallback sort behind its own twin.
  const isLoaded = (n: string) => hasLoadableFit(n, HOME_GYM) && !isBodyweight(n);
  const lastLoaded = names.reduce((acc, n, i) => (isLoaded(n) ? i : acc), -1);
  assert(fallback > lastLoaded,
    `"reverse flyes (bodyweight)" is at ${fallback}, ahead of loadable work ending at ${lastLoaded}`);

  /**
   * ⛔ AND THE CELL WHERE THE FIX ACTUALLY MOVES SOMETHING. `focused / press_lower` held
   * `weighted single leg calf raise` (per-hand dumbbells) BEHIND three bodyweight calf raises purely
   * on catalogue order. This is the assertion that fails on the un-fixed ranking — the two upper
   * cells happened to be in the right order by accident, which is exactly why the accident had to
   * be replaced with a rule.
   */
  const lower = resolveSlot({ intent: 'HYP', category: 'focused', pattern: 'press_lower', equipment: HOME_GYM });
  const l = lower.options.map((o) => o.name);
  assert(l.indexOf('weighted single leg calf raise') < l.indexOf('calf raise'),
    `a dumbbell calf raise still sorts behind a bodyweight one: ${l.join(', ')}`);
});

Deno.test('⛔ A BODYWEIGHT ATHLETE IS NOT DEMOTED OUT OF THEIR OWN CATALOGUE', () => {
  /**
   * ⛔ THE HALF THAT WOULD BE A REGRESSION IF THE RULE FIRED ALWAYS. An athlete with a pull-up bar
   * and nothing to load owns a catalogue that is ALL bodyweight; sorting it behind movements they
   * have no weights for would bury every real option they have. `ownsLoadingImplement` is the gate,
   * and it reads the existing chip vocabulary rather than inventing a tier.
   */
  assertEquals(ownsLoadingImplement(['Pull-up bar']), false);
  assertEquals(ownsLoadingImplement(['Bands']), false, 'a band was counted as a loading implement');
  assertEquals(ownsLoadingImplement(['Flat bench', 'Rack']), false, 'a bench was counted as load');
  assertEquals(ownsLoadingImplement(['Dumbbells']), true);
  assertEquals(ownsLoadingImplement(['Barbell + plates']), true);
  assertEquals(ownsLoadingImplement(['Commercial gym']), true);
  // ⚠️ §0h — an athlete nobody asked. No claim about implements can be made, so nothing is reordered.
  assertEquals(ownsLoadingImplement(null), false);
  assertEquals(ownsLoadingImplement([]), false);

  // ⛔ AND THE ORDER ITSELF IS UNTOUCHED for those two cases — same list, same sequence.
  //
  // ⚠️ THE TWO HEADS DIVERGED 2026-08-25 when `leg extension` was gated on `machine` (commercial
  // gym only — see `strength-gear.ts`). An UNDECLARED athlete still sees it lead: §0h, unknown
  // degrades to ungated. A DECLARED pull-up-bar athlete does not own a machine, so the head is the
  // first movement they can actually perform. The old pin (`leg extension` for both) was the bug
  // this closes — it fed materialize-plan's week-blind swap and duplicated an athlete's own
  // single-leg pick on a device-verified block.
  for (const [equipment, expectedHead] of [
    [null, 'leg extension'],
    [['Pull-up bar'], 'calf raise'],
  ] as const) {
    const r = resolveSlot({ intent: 'HYP', category: 'focused', pattern: 'press_lower', equipment: equipment as string[] | null });
    const names = r.options.map((o) => o.name);
    assertEquals(names[0], expectedHead, `[${equipment ?? 'undeclared'}] the head of the cell moved`);
    // ⚠️ AND IF THE DUMBBELL MOVEMENT IS NOT OFFERED AT ALL, THE DEMOTION CANNOT HAPPEN — the
    // stronger outcome, not a weaker test. `weighted single leg calf raise` was untagged until
    // 2026-08-26 and therefore offered to everyone; it now routes through dumbbells, a kettlebell or
    // a barbell, so a pull-up-bar athlete never sees it. `indexOf` returning -1 is that fact, and
    // reading -1 as "sorts first" is how this assertion would silently invert.
    const bw = names.indexOf('calf raise');
    const loaded = names.indexOf('weighted single leg calf raise');
    assert(bw >= 0, `[${equipment ?? 'undeclared'}] the bodyweight calf raise left the cell`);
    assert(loaded < 0 || bw < loaded,
      `[${equipment ?? 'undeclared'}] a bodyweight athlete was demoted below dumbbell work`);
  }
});

Deno.test('the tiebreak moves nothing between equipment-fit tiers', () => {
  // ⚠️ IT IS A TIEBREAK, NOT A GATE. A band-tier movement still sorts below every loadable one, and
  // no movement is excluded — `equipmentFitRank` keeps owning the tiers.
  for (const kit of KITS) {
    for (const [category, pattern] of [['focused', 'push_upper'], ['focused', 'pull_upper'], ['secondary', 'push_upper']] as const) {
      const r = resolveSlot({ intent: 'HYP', category, pattern, equipment: kit.equipment });
      const ranks = r.options.map((o) => equipmentFitRank(o.name, kit.equipment) ?? Number.MAX_SAFE_INTEGER);
      for (let i = 1; i < ranks.length; i++) {
        assert(ranks[i] >= ranks[i - 1],
          `${category}/${pattern} [${kit.label}]: the bodyweight tiebreak reordered a fit tier`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — FINDING 2: ONE LIFT, ONE ROW, WHATEVER IT IS SPELLED LIKE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE COLLISIONS ARE REAL — the dedup has a subject', () => {
  /**
   * ⛔ WHY A RAW-STRING SET WAS NEVER ENOUGH, MEASURED RATHER THAN ASSERTED. The grid's own index
   * holds many groups of names that are ONE lift, and a `.toLowerCase()` set sees each name in a
   * group as a different movement. If this count ever drops to zero the dedup tests below have no
   * subject and should be re-read, not deleted.
   */
  const byCanon = new Map<string, string[]>();
  for (const m of allGridMovements()) {
    const c = canonicalize(m.name);
    byCanon.set(c, [...(byCanon.get(c) ?? []), m.name]);
  }
  const groups = [...byCanon.entries()].filter(([, names]) => names.length > 1);
  assert(groups.length >= 10,
    `only ${groups.length} collision groups — the dedup fix has lost its subject`);

  // The named ones from the report and its neighbours, each proven to be one lift and two strings.
  assertEquals(canonicalize('Bulgarian Split Squats'), canonicalize('bulgarian split squat'));
  assertEquals(canonicalize('Pull Ups'), canonicalize('pullup'));
  assertEquals(canonicalize('Military Press'), canonicalize('overhead press'));
  assertEquals(canonicalize('reverse flyes (bodyweight)'), canonicalize('reverse flyes bodyweight'));
  // ⚠️ AND IT DOES NOT OVER-MERGE. Containment is not identity — that is canonicalize's own rule.
  assert(canonicalize('jump squats') !== canonicalize('back squat'),
    'canonicalize merged a plyometric into the back squat');
  assert(canonicalize('front squat') !== canonicalize('back squat'));
});

const PICK_SETS: { label: string; picks: string[] }[] = [
  { label: 'none', picks: [] },
  { label: 'the report\'s picks', picks: ['Barbell Hip Thrust', 'Ab Wheel Rollout', 'Bulgarian Split Squats'] },
  { label: 'plural spellings', picks: ['Bulgarian Split Squats', 'Pull Ups', 'Hip Thrusts', 'Dumbbell Curls'] },
  { label: 'synonym spellings', picks: ['Military Press', 'RDL', 'DB Row', 'Barbell Back Squat'] },
  { label: 'a full picker', picks: [
    'Barbell Hip Thrust', 'Ab Wheel Rollout', 'Bulgarian Split Squats', 'Dumbbell Curls',
    'Hammer Curls', 'Rear Delt Fly', 'Lateral Raise', 'Chest Fly', 'Reverse Fly', 'YTW Raises',
  ] },
];

Deno.test('⛔ NO SESSION PRINTS THE SAME LIFT TWICE — every frame, kit, week and pick set', () => {
  let sessions = 0;
  for (const frame of Object.keys(FRAMES)) {
    for (const kit of KITS) {
      for (const set of PICK_SETS) {
        for (const wk of [1, 2, 3, 4, 5]) {
          for (const s of rows(week({ frame, equipment: kit.equipment, picks: set.picks, wk }))) {
            sessions++;
            const seen = new Map<string, string>();
            for (const name of s.names) {
              const c = canonicalize(name);
              const first = seen.get(c);
              assert(first === undefined,
                `${frame} [${kit.label}] [${set.label}] wk${wk} ${s.day}: "${first}" and "${name}" `
                + `are the same lift (${c})`);
              seen.set(c, name);
            }
          }
        }
      }
    }
  }
  assert(sessions > 500, `only ${sessions} sessions were driven — the sweep shrank`);
});

Deno.test('⛔ A PICK SPELLED AS A PLURAL LANDS ONCE, in the athlete\'s spelling', () => {
  /**
   * ⛔ THE MECHANISM BEHIND THE DEVICE FINDING, MEASURED. `Bulgarian Split Squats` folded to
   * `bulgarian split squats`; the catalogue's entry folds to `bulgarian split squat`; a folded
   * comparison called them two movements. Reverting the pick pool to folded keys reproduces it:
   * the pick matches no option, the week warns *"Not placed this week: Bulgarian Split Squats"*
   * while ALSO prescribing `bulgarian split squat` — twice, on Tuesday and on Friday.
   *
   * ⚠️ AND WHAT THIS TEST DOES **NOT** CLAIM, stated because the difference is load-bearing. The
   * reported row had both spellings in the SAME SESSION. This fixture reproduces a WEEK-level
   * repeat plus a false unplaced warning — the same root cause, one step short of the exact symptom.
   * Nothing in the composer, at any frame, kit, week or pick set swept below, produces the
   * same-session pair. See the header of `standing-plan-rank-dedup` and the session sweep above.
   */
  const w = week({ equipment: HOME_GYM, picks: ['Bulgarian Split Squats'] });
  const all = rows(w).flatMap((s) => s.names);
  const mine = all.filter((n) => canonicalize(n) === canonicalize('bulgarian split squat'));
  assertEquals(mine.length, 1, `the split squat appears ${mine.length} times: ${mine.join(' + ')}`);
  // ⚠️ THEIR SPELLING, NOT THE CATALOGUE'S. Printing `bulgarian split squat` back at somebody who
  // typed `Bulgarian Split Squats` reads as the app having found something similar.
  assertEquals(mine[0], 'Bulgarian Split Squats');
  // ⛔ AND IT IS PLACED, so no compromise line claims it could not be.
  assert(!w.notes.some((n) => n.kind === 'warning' && /Bulgarian/i.test(n.text)),
    'the week reports the pick as unplaced while also prescribing it');
});

Deno.test('a pick the week cannot place is still reported, in the athlete\'s spelling', () => {
  // ⚠️ THE OTHER DIRECTION, so the canonical matching cannot be "fixed" by silently placing
  // everything. Picks fill HYP accessory slots only; an ME/DE slot is the programme's.
  const w = week({ equipment: HOME_GYM, picks: ['Military Press'] });
  const all = rows(w).flatMap((s) => s.names);
  assert(!all.some((n) => n === 'Military Press'), 'a pick took a slot that is not the athlete\'s');
  assert(w.notes.some((n) => n.kind === 'warning' && /Military Press/.test(n.text)),
    'the unplaced pick was swallowed rather than reported by name');
});

Deno.test('the week-wide pick dedup reads canonically too', () => {
  /**
   * ⚠️ THE RIPPLE, ASSERTED RATHER THAN DISCOVERED LATER. Once the split-squat pick is recognised,
   * `picks.placed` correctly excludes that movement from every LATER cell in the week — so a second
   * slot that used to resolve to the split squat now takes the next option instead. The week is
   * supposed to change here; what it must not do is print the lift twice.
   */
  const withPick = rows(week({ equipment: HOME_GYM, picks: ['Bulgarian Split Squats'] }))
    .flatMap((s) => s.names).map(canonicalize);
  const without = rows(week({ equipment: HOME_GYM })).flatMap((s) => s.names).map(canonicalize);
  const key = canonicalize('bulgarian split squat');
  assertEquals(withPick.filter((c) => c === key).length, 1);
  assert(without.filter((c) => c === key).length >= 1,
    'the un-picked week no longer carries the split squat — this test is now stale');
  assert(JSON.stringify(withPick) !== JSON.stringify(without),
    'honouring the pick changed nothing about the week — the pick did not reach it');
});

Deno.test('the composer compares canonical names, not raw ones', async () => {
  /**
   * ⚠️ A SOURCE LINT, because the sweeps above pass on a week that happens not to collide. What
   * would rot silently is a refactor reintroducing `.toLowerCase()` on a movement comparison — the
   * sweeps would keep passing until the day a real week produced a collision, which is how this
   * defect reached a device in the first place.
   */
  const src = await Deno.readTextFile(new URL('./compose.ts', import.meta.url).pathname);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/takenToday\.(has|add)\([^)]*toLowerCase/.test(code),
    'the session dedup compares lowercased raw strings again');
  assert(!/picks\.(placed|unplaced)\.(has|add|delete)\(\s*foldExerciseName/.test(code),
    'the pick pool went back to folded keys, which do not collapse plurals');
  assert(/takenToday\.add\(canonicalize\(/.test(code), 'the session dedup no longer canonicalizes');

  const ledger = await Deno.readTextFile(new URL('../accessory-dosing/ledger.ts', import.meta.url).pathname);
  const lcode = ledger.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/alreadyPrescribed\.has\(canonicalize\(/.test(lcode),
    'the muscle floor still dedups on raw movement names');
  assert(/preferSet\.has\(canonicalize\(/.test(lcode),
    'the muscle floor still matches the athlete\'s picks on lowercased raw names');
});
