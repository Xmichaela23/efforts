/**
 * STRENGTH GEAR — the one equipment vocabulary, and the one place that answers "can this athlete do
 * this movement".
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL, AND WHY IT IS IN `src/lib/`.
 *
 * The keys, the exercise→gear map and the chip→gear map all lived in
 * `supabase/functions/_shared/strength-equipment-tier.ts`, which the CLIENT CANNOT IMPORT AS A VALUE
 * (only `import type` is precedented — `UnifiedWorkoutView.tsx:42`, and `useCoachWeekContext.ts:71`
 * says so in as many words). So when slice 3 needed the same vocabulary on the client, it copied the
 * key union into `assistance-menu.ts` and pinned the two with a contract test — a tripwire over a
 * duplicate, which is the second-vocabulary disease with a smoke alarm attached.
 *
 * Slice 4 has to GATE on this from both the builder (client) and the composer (edge). A duplicate
 * that both sides filter on is not survivable, so the vocabulary moved here — the home
 * `exercise-config.ts` established for exactly this: **anything the client and the edge functions
 * must agree on lives in `src/lib/`.** `_shared/strength-equipment-tier.ts` now RE-EXPORTS these, so
 * every existing edge importer is unchanged.
 *
 * ── THE TWO MAPS ANSWER DIFFERENT QUESTIONS. Read this before "reconciling" them. ─────────────────
 *
 *   `exerciseRequiredGearKeys`  →  "what should the session card's Equipment line MENTION"
 *                                  GENEROUS. It names the bench beside a DB row, because a lifter
 *                                  packing a bag wants to know a bench is involved.
 *
 *   `ASSISTANCE_GEAR` (routes)  →  "what is the MINIMUM to perform this at all"
 *                                  STRICT-MINIMUM, and it is what a GATE reads. A DB row needs
 *                                  dumbbells; the bench is where most people brace, not a
 *                                  prerequisite. Gating on the generous answer would delete the row
 *                                  from every athlete who owns dumbbells and no bench.
 *
 * Same data, two questions, two accessors, side by side — the `MovementGroup` / `MovementPattern`
 * shape one axis over (CLAUDE.md). ⚠️ If one is WRONG, fix that one. Do not make them agree by making
 * one answer the other's question.
 */

import { foldExerciseName } from './exercise-config.ts';

/**
 * ⛔ THE EQUIPMENT VOCABULARY. Every key here must be produceable by {@link athleteEquipmentToKeys}
 * from some inventory chip, or a movement requiring it can never be performed by anyone. A test
 * asserts exactly that (`strength-equipment-tier.test.ts`).
 */
export type GearKey =
  | 'barbell'
  | 'rack'
  | 'bench'
  | 'incline_bench'
  | 'dumbbells'
  | 'kettlebell'
  | 'cable'
  | 'pull_up_bar'
  | 'ab_wheel'
  | 'bands'
  // ⚠️ MENTION-ONLY KEYS. `box` and `rings` name gear on a session card's Equipment line and are
  // deliberately absent from every GATE route — see the two-maps note in the header. Nothing an
  // athlete can declare produces them, and after Slice 7 nothing needs to: a key that gates must be
  // commonly declarable, a key that merely INFORMS need not be.
  | 'box'
  | 'rings'
  // ⛔ FIXED-STATION MACHINES — granted ONLY by the commercial-gym chip (2026-08-25). Exists for
  // `leg extension`, which was untagged and therefore ungated: the composer placed it for home
  // athletes and `materialize-plan`'s week-blind backstop swapped it to Bulgarian Split Squats —
  // duplicating the athlete's own single-leg pick on a device-verified block. The leg-curl
  // precedent above (leave ungated, let substitution swap) does not transfer: leg curl's
  // substitute collides with nothing, leg extension's collided with a default pick on its own
  // path. "Commonly declarable" is satisfied — the commercial-gym chip is the declaration.
  | 'machine'
  // ⛔ THE SLICE 7 EXCEPTION, RULED 2026-08-26 — and it does not reverse Slice 7's rule, it applies
  // it. That ruling cut gear people could not NAME: a glute-ham developer, dip bars, a leg curl
  // machine, drawing Michael's *"I wouldn't know what that is."* The test it left behind is "BOTH
  // required AND commonly declarable", and these two pass it — somebody with a rack and a bar in
  // their garage knows perfectly well whether they own a TRX or a stability ball.
  //
  // ⚠️ THE ALTERNATIVE WAS WORSE, which is why they earned keys rather than joining the drop list.
  // `trx fallout`, `stability ball rollout` and `stir the pot` were being PRESCRIBED to athletes who
  // own neither — the 2026-08-26 defect. The kit that could not clear the same bar (a GHD, a sled, a
  // captain's chair, a landmine, a sandbag) was dropped from the prescribable pool instead; see
  // `PRESCRIPTION_EXCLUDED` in `strength-grid/taxonomy.ts`.
  | 'suspension_trainer'
  | 'stability_ball';

/** Athlete-facing label per key. Also the vocabulary's roster — a key absent here does not exist. */
export const STRENGTH_GEAR_LABEL: Record<GearKey, string> = {
  barbell: 'Barbell',
  rack: 'Rack',
  bench: 'Bench',
  incline_bench: 'Incline Bench',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  cable: 'Cable',
  pull_up_bar: 'Pull-up Bar',
  ab_wheel: 'Ab Wheel',
  bands: 'Bands',
  box: 'Box',
  rings: 'Rings',
  machine: 'Machine',
  suspension_trainer: 'Suspension Trainer',
  stability_ball: 'Stability Ball',
};

export function normStrengthEquipmentStrings(strengthEquipment: unknown): string[] {
  if (!Array.isArray(strengthEquipment)) return [];
  return strengthEquipment.map((s) => String(s).toLowerCase());
}

/**
 * Map a single strength exercise name → the equipment keys its session card should MENTION.
 * Generous by design — see the header. `buildStrengthEquipmentLine` is its only consumer.
 */
export function exerciseRequiredGearKeys(name: string): string[] {
  const n = String(name ?? '').toLowerCase();
  if (!n) return [];
  // (F-6) Names that offer an equipment CHOICE ("X or Y") — the athlete picks the variant they own,
  // so require nothing (e.g. "Box Jumps or Broad Jumps", "Inverted Ring Row or Band Row",
  // "Goblet Squat or Bodyweight Squat"). Must precede the single-variant patterns below.
  if (/\bor\b/.test(n)) return [];
  // Barbell-anchored compounds — rack required for back squat / OHP / standing press. (F-6) Match the
  // unprefixed names the protocols actually emit (5×5: "Back Squat" / "Overhead Press" / "Deadlift"),
  // guarding against DB/band/RDL variants that have their own rules below.
  if (/\bback\s+squat\b/.test(n)) return ['barbell', 'rack'];
  if ((/overhead\s+press|push\s+press|\bohp\b/.test(n)) && !/\b(db|dumbbell|band)\b/.test(n)) {
    return ['barbell', 'rack'];
  }
  if (/\bdeadlift\b/.test(n) && !/\b(db|dumbbell|romanian|rdl|single-leg)\b/.test(n)) return ['barbell'];
  if (/^bench\s+press$|^bench\s+press\s+\(barbell/.test(n)) return ['barbell', 'rack', 'bench'];
  if (/barbell\s+row/.test(n)) return ['barbell'];
  if (/hip\s+thrusts?\b/.test(n)) {
    // Performance protocol uses Heavy/Moderate barbell hip thrusts. DB tier uses backpack/BW.
    return /barbell|moderate|heavy|fast\s+concentric/.test(n) ? ['barbell', 'bench'] : ['bench'];
  }
  // Incline pressing — the bench is the whole requirement, and it must be tested BEFORE the flat
  // bench patterns below or "DB Incline Press" falls through to plain dumbbells+bench and the athlete
  // is told they have everything they need for a movement they cannot set up. Added 2026-08-13.
  if (/incline\s+(bench\s+)?press/.test(n)) {
    return /\b(db|dumbbell)\b/.test(n)
      ? ['dumbbells', 'incline_bench']
      : ['barbell', 'incline_bench'];
  }
  // Dumbbell-anchored compounds.
  if (/db\s+bench\s+press|dumbbell\s+bench/.test(n)) return ['dumbbells', 'bench'];
  if (/db\s+shoulder\s+press|db\s+ohp/.test(n)) return ['dumbbells'];
  if (/db\s+row|chest-supported\s+row/.test(n)) return ['dumbbells', 'bench'];
  if (/db\s+romanian\s+deadlift|dumbbell\s+rdl/.test(n)) return ['dumbbells'];
  if (/single-leg\s+rdl\s*\(heavy\s*db|single-leg\s+rdl\s*\(.*db/.test(n)) return ['dumbbells'];
  if (/goblet\s+squat/.test(n)) return ['dumbbells']; // KB also works — counted via optional pool
  // Cable / pulley.
  if (/lat\s*pull[-\s]?down/.test(n)) return ['cable'];
  // Pull-up patterns.
  if (/^pull[-\s]?ups?\b|^pull[-\s]?ups\s+\(explosive/.test(n)) return ['pull_up_bar'];
  if (/band[-\s]?assisted\s+pull[-\s]?up/.test(n)) return ['pull_up_bar', 'bands'];
  if (/ring\s+rows?/.test(n)) return ['rings']; // (F-6) explicit rings only; plain "Inverted Rows" falls through to [] ("…or band row" choices handled by the top or-guard)
  // Ab wheel — the one abs movement on Wendler's list that needs a piece of kit (Forever p.30).
  if (/ab\s+wheel|ab\s+rollout/.test(n)) return ['ab_wheel'];
  // Plyo / power.
  if (/box\s+jumps?/.test(n)) return ['box'];
  // Kettlebell-specific.
  if (/^kb\s+swings?|^kettlebell\s+swings?/.test(n)) return ['kettlebell'];
  // Bands.
  if (/band\s+pull[-\s]?aparts?|band\s+pull[-\s]?down|band\s+lateral\s+walks|band\s+overhead\s+press|band\s+row/.test(n)) {
    return ['bands'];
  }
  if (/face\s+pulls?/.test(n)) {
    // Cable when available, band otherwise — depends on prescription text.
    return /cable/.test(n) ? ['cable'] : ['bands'];
  }
  if (/external\s+rotation/.test(n)) return ['bands'];
  // (F-6) Step-ups: any elevated surface (box / step / stair / bench) — improvisable, not a specific
  // gear requirement → falls through to [] (was wrongly requiring a bench).
  // Bodyweight-only patterns: push-ups, plank variants, bird dog, dead bug, glute bridges,
  // calf raises, BW squat, single-leg RDL (BW), broad jumps, jump squats, plyo.
  return [];
}

/**
 * Athlete equipment chip → canonical keys.
 *
 * ⛔ SUBSTRING MATCHING, SO CHIP LABELS ARE LOAD-BEARING. Renaming a chip in
 * `TrainingBaselines.tsx` without a matching clause here silently removes capability from every
 * athlete who ticked it — and after slice 4 that means movements disappearing from their menu.
 */
export function athleteEquipmentToKeys(strengthEquipment: string[]): Set<string> {
  const out = new Set<string>();
  const n = normStrengthEquipmentStrings(strengthEquipment);
  for (const s of n) {
    if (s.includes('barbell') || s.includes('plate')) out.add('barbell');
    if (s.includes('rack') || s.includes('cage')) out.add('rack');
    if (s.includes('bench')) out.add('bench');
    if (s.includes('dumbbell') || /\bdb\b/.test(s)) out.add('dumbbells');
    if (s.includes('kettlebell') || /\bkb\b/.test(s)) out.add('kettlebell');
    if (s.includes('band')) out.add('bands');
    if (s.includes('cable')) out.add('cable');
    if (s.includes('pull-up bar') || s.includes('pull up bar') || s.includes('chin-up')) out.add('pull_up_bar');
    if (s.includes('box') || s.includes('plyo box')) out.add('box');
    if (s.includes('ring')) out.add('rings');
    if (s.includes('incline bench')) out.add('incline_bench');
    if (s.includes('ab wheel') || s.includes('ab roller')) out.add('ab_wheel');
    // ⚠️ THE `dip_bars` / `ghd` / `leg_curl_machine` / `decline_bench` CLAUSES ARE GONE WITH THEIR
    // CHIPS (Slice 7). Nothing routes on them any more, so a clause here would map a chip nobody can
    // tick onto a key nothing reads.
    // Commercial gym implies most fixed equipment is on hand.
    if (s.includes('commercial gym')) {
      out.add('barbell');
      out.add('rack');
      out.add('bench');
      out.add('dumbbells');
      out.add('cable');
      out.add('pull_up_bar');
      // An adjustable bench is what a commercial gym HAS. ⛔ An ab wheel is not — see `hasAbWheel`.
      out.add('incline_bench');
      // Fixed-station machines are what a commercial gym IS. Nothing else grants this key.
      out.add('machine');
      // ⛔ BANDS AND KETTLEBELLS TOO (2026-08-26). The clause above says "most fixed equipment", and
      // these two are the things it left out for being loose rather than bolted down — which is not
      // the question. The question is whether the athlete can reach one, and in a commercial gym they
      // can. The omission was already costing offers before the catalogue was tagged: `band face
      // pulls`, `band leg curls` and `band tricep pushdown` all carried `[['bands']]` and were
      // therefore ejected from every gym member's pool. Tagging the wider catalogue widened the same
      // hole to swings, goblet squats, turkish get-ups and the whole banded prehab shelf.
      //
      // ⚠️ THIS CAN ONLY ADD, NEVER SUBTRACT. Granting a key opens routes; it closes none.
      out.add('bands');
      out.add('kettlebell');
      // ⚠️ AND THE TWO 2026-08-26 KEYS. A commercial gym has a suspension trainer and a stability
      // ball on the floor as surely as it has dumbbells.
      out.add('suspension_trainer');
      out.add('stability_ball');
    }
    // ⛔ THE TWO CHIPS ADDED 2026-08-26 — see the GearKey note. Matched by SUBSTRING, like every
    // clause above, so "TRX / suspension trainer" and "Stability ball" both land.
    if (s.includes('trx') || s.includes('suspension')) out.add('suspension_trainer');
    if (s.includes('stability ball') || s.includes('swiss ball') || s.includes('exercise ball')) {
      out.add('stability_ball');
    }
  }
  return out;
}

/**
 * What it takes to perform a movement: **a list of ALTERNATIVE routes, each a set of keys that must
 * ALL be present.** OR of ANDs. `[['dumbbells', 'incline_bench']]` is one route needing both;
 * `[['rack'], ['bench']]` is two ways to set up the same movement.
 *
 * ⛔ A SINGLE FLAT LIST CANNOT SAY THIS, and the alternatives are the point — a Nordic Curl on a GHD,
 * on a decline bench's ankle rollers, or with the feet under a loaded barbell is the same movement
 * three ways, and a flat AND-list would gate out two of the three.
 *
 * `[[]]` — one route requiring nothing — means always available. {@link ALWAYS}.
 */
export type GearRoutes = GearKey[][];

/** Needs nothing. Spelled out because a bare `[[]]` in a table of 50 rows reads as a typo. */
export const ALWAYS: GearRoutes = [[]];

/**
 * ⛔ MINIMUM TO PERFORM, per movement. This is what the gate reads. See the header for why it is not
 * `exerciseRequiredGearKeys`.
 */
export const ASSISTANCE_GEAR: Record<string, GearRoutes> = {
  // ── PUSH ────────────────────────────────────────────────────────────────────────────────────────
  // ⛔ DIPS ARE THE MOVEMENT SLICE 7 EXISTS FOR. The route was `[['dip_bars'], ['rings']]` — precise,
  // sourced (Wendler's dips are parallel bars, Forever p.24), and it gated a normal home gym OUT of a
  // movement it can obviously do. Dips "worked" until Slice 3/4 invented that gate.
  //
  // ⚠️ ANYTHING TO DIP ON COUNTS: rack safety-arms, a dip attachment on the rack, two benches. Both
  // routes are gear the athlete can actually declare, which is the whole rule now — gate on what is
  // BOTH required AND commonly declarable, and let substitution handle the rest.
  'dips': [['rack'], ['bench']],
  'tricep dips': [['rack'], ['bench']],
  'push up': ALWAYS,
  'diamond push up': ALWAYS,
  'dumbbell bench press': [['dumbbells', 'bench']],
  'db bench press': [['dumbbells', 'bench']],
  // The floor is the point — it is the no-bench answer, so requiring one would be circular.
  'db floor press': [['dumbbells']],
  'incline bench press': [['barbell', 'incline_bench']],
  'db incline press': [['dumbbells', 'incline_bench']],
  'dumbbell incline press': [['dumbbells', 'incline_bench']],
  'db shoulder press': [['dumbbells']],
  'dumbbell shoulder press': [['dumbbells']],
  // A plate. `barbell` is the only key whose chip ("Barbell + plates") implies loose plates.
  'plate raise': [['barbell']],
  'tricep pushdown': [['cable'], ['bands']],
  'triceps pushdown': [['cable'], ['bands']],
  'tricep extension': [['dumbbells'], ['barbell'], ['bands']],
  'triceps extension': [['dumbbells'], ['barbell'], ['bands']],
  // ⛔ RACK INCLUDED, unlike the plain bench press entry's history: this is a heavy pressing lift
  // taken out of uprights, and setting up without them is how people get pinned. It is the one
  // triceps option that loads, which is why it leads that pool wherever a rack exists.
  'close grip bench press': [['barbell', 'rack', 'bench']],

  // ── PULL ────────────────────────────────────────────────────────────────────────────────────────
  'pull up': [['pull_up_bar']],
  'chin up': [['pull_up_bar']],
  // ⚠️ ALWAYS, deliberately, and it follows F-6 rather than contradicting it: `exerciseRequiredGearKeys`
  // returns [] for inverted rows because the athlete rows under whatever they have — a bar in a rack,
  // rings, a table edge. Gating it would be an over-reach the gear line already declined to make.
  'inverted row': ALWAYS,
  // ⚠️ UNGATED like the plain inverted row above it. Rings are no longer declarable, and "row under
  // whatever you have" is the same F-6 reasoning the gear line already applies.
  'inverted ring row': ALWAYS,
  // Dumbbells only. The bench is a brace, not a prerequisite — see the header.
  'dumbbell row': [['dumbbells']],
  'db row': [['dumbbells']],
  'barbell row': [['barbell']],
  'lat pulldown': [['cable'], ['bands']],
  // ⚠️ THE OLD TAG WAS `null` — "needs nothing". A face pull needs a cable stack or a band; there is
  // no bodyweight version. This is the other half of "incomplete": a movement gated on nothing that
  // half the athletes cannot do.
  'face pull': [['cable'], ['bands']],
  'band face pulls': [['bands']],
  /**
   * ⛔ THE THREE BAND-NAMED KEYS THE STANDING PLAN'S BAND LABEL DEPENDS ON (2026-08-24).
   *
   * `bandRouteName` (`_shared/strength-grid/grid.ts`) renames a pick that only a band reaches — `lat
   * pulldown` becomes `band pull down`, `tricep pushdown` becomes `band tricep pushdown` — so the
   * plan says what the athlete will actually be holding. That rename puts the renamed key into the
   * grid's own movement pool, and an UNTAGGED movement is treated as "needs nothing": rank 0, the
   * best possible fit, ahead of the dumbbell work it should sit behind. Measured: `band tricep
   * pushdown` won a home gym's triceps slot on catalogue order alone.
   *
   * ⚠️ A BAND IS A LAST RESORT, and `LAST_RESORT_KEYS` already says so — but only for a movement
   * whose tag names the band. These three name it, so the ranking they were always supposed to get
   * is the ranking they now get, and an athlete with no bands is no longer offered one.
   *
   * ⚠️ THIS IS NOT THE BULK TAGGING PASS, and it is deliberately not. Nine more band-named movements
   * in the catalogue are still untagged and still rank 0 — `band row`, `band overhead press`,
   * `band lateral raise`, `band pull apart`, `resistance band row`, `band face pull` (singular),
   * `band lateral walk` / `lateral band walk`, `band leg curl`. They are a pre-existing gap, they
   * are read by the Get Stronger picker as well as by this grid, and closing them is its own change.
   */
  'band pull down': [['bands']],
  'band tricep pushdown': [['bands']],
  'band triceps pushdown': [['bands']],
  'bent over reverse flyes': [['dumbbells']],
  'dumbbell curl': [['dumbbells']],
  'hammer curl': [['dumbbells']],

  // ── SINGLE-LEG / CORE ───────────────────────────────────────────────────────────────────────────
  'reverse lunge': ALWAYS,
  'bodyweight lunges': ALWAYS,
  // An elevated surface — bench, box, chair, stairs. Improvisable, so not gated (F-6's step-up rule).
  'bulgarian split squat': ALWAYS,
  'single leg hip thrust': ALWAYS,
  // ⚠️ NO RACK IN THE ROUTE. A front squat is usually taken from a rack, but it can be cleaned from
  // the floor, and MINIMUM TO PERFORM is the question this table answers.
  'front squat': [['barbell']],
  'hip thrust': [['bench']],
  // ⛔ THE LOADED VERSION NEEDS BOTH — a bar to sit across the hips and a bench to set the shoulders
  // on. Distinct from the bare `hip thrust` above, which is the bodyweight/DB version.
  'barbell hip thrust': [['barbell', 'bench']],
  'romanian deadlift': [['barbell'], ['dumbbells']],
  'good morning': [['barbell']],
  // ⛔ UNGATED, AND THE BACKSTOP IS WHY. A leg-curl machine is required and NOT commonly declarable,
  // which is exactly the case Slice 7 says to leave to substitution:
  // `substituteExerciseForEquipment` already turns Leg Curl into Nordic Curls / Band Leg Curls for
  // anyone without gym access. Gating it here would have deleted the movement instead of swapping it,
  // which is the worse of the two failures — a swap keeps Wendler's hamstring work, a gate loses it.
  'leg curl': ALWAYS,
  'leg curls': ALWAYS,
  'band leg curls': [['bands']],
  // ⛔ MACHINE-ONLY, unlike leg curl above — see the `machine` key's note in `GearKey` for why the
  // two machine movements get opposite calls. A home athlete's quad-isolation slot resolves to a
  // performable movement in the composer instead of being patched at render.
  'leg extension': [['machine']],
  'leg extensions': [['machine']],
  // ⛔ THE KNEEL-AND-LOWER FAMILY NOW ROUTES ON THE BARBELL ALONE (Slice 7), and that is the route
  // most people actually use: feet hooked under a loaded bar.
  //
  // ⚠️ THE `ghd` AND `decline_bench` ROUTES ARE GONE WITH THEIR CHIPS. Slice 3 gave the decline bench
  // this consumer deliberately — its ankle rollers ARE the standard home GHD substitute, and that
  // remains true of the world. It is not true of the PICKER any more: neither piece of gear was
  // recognisable enough to keep asking about, so neither can be declared, so neither can gate.
  // ⛔ Do not re-add them without re-adding the chips; a route nobody can satisfy is a movement
  // nobody is offered.
  'nordic curl': [['barbell']],
  'nordic curls': [['barbell']],
  'nordic hamstring curl': [['barbell']],
  'glute ham raise': [['barbell']],
  'back extension': [['barbell']],
  // Hips on the pad, legs swinging — any bench does it. ⚠️ `athleteEquipmentToKeys` adds `bench` for
  // ANY chip containing the word, so the incline chip satisfies this too.
  'reverse hyper': [['bench']],
  'reverse hyperextension': [['bench']],
  'hanging leg raise': [['pull_up_bar']],
  'hanging knee raise': [['pull_up_bar']],
  'ab wheel rollout': [['ab_wheel']],
  'sit up': ALWAYS,
  'weighted sit up': ALWAYS,
  'db side bend': [['dumbbells'], ['kettlebell']],
  'dumbbell side bend': [['dumbbells'], ['kettlebell']],
  'plank': ALWAYS,

  // ══ THE WIDER CATALOGUE (2026-08-26) ═══════════════════════════════════════════════════════════
  //
  // ⛔ WHY THESE 147 ROWS EXIST. Everything above is the curated 28-movement assistance menu, and it
  // is fully tagged. `strength-grid` is the OTHER consumer, and it reads the whole of
  // `EXERCISE_CONFIG` — 211 classified movements, of which 160 carried no tag. Measured for a
  // declared home gym (barbell, rack, bench, dumbbells, pull-up bar, bands): 148 of those 160 reached
  // the athlete anyway, because `grid.ts:reachable` lets an untagged movement through unless its NAME
  // reads as machine-braced. A regex was doing a tag's job for two thirds of the catalogue.
  //
  // ⚠️ THE RANKING WAS THE QUIETER HALF OF IT. `equipmentFitRank` has no route to read for an
  // untagged movement, so all 160 tied at zero and the catalogue's key order picked the winner —
  // "not a decision, an accident", in `grid.ts`'s own words about the case that surfaced it.
  //
  // ⛔ ALWAYS HERE IS AN ANSWER, NOT AN ABSENCE. A row tagged {@link ALWAYS} has been read and judged
  // to need nothing; an absent row is a movement nobody has looked at. The two used to be
  // indistinguishable, which is the whole reason `gearRoutesFor` warns.
  //
  // ⚠️ THIRTEEN MOVEMENTS ARE DELIBERATELY LEFT UNTAGGED: trx fallout, stability ball rollout, stir
  // the pot, ghd sit up, roman chair sit up, captain's chair knee raise (both spellings), sled push,
  // sled pull, landmine twist, sandbag lunge, backpack carry, ring dips. Each needs kit this
  // vocabulary cannot express, and the Slice 7 ruling in `TrainingBaselines.tsx` forbids re-adding
  // the chips that would express it — "gate only on gear that is BOTH required AND commonly
  // declarable", after an itemized picker drew *"I wouldn't know what that is."* Tagging them would
  // mean inventing keys no athlete can produce, which the vocabulary note at the top of this file
  // rules out. Open with Michael, 2026-08-26; not an oversight.

  // ── PRIMARY LIFTS ───────────────────────────────────────────────────────────────────────────────
  // ⚠️ Bare `squat` / `bench` / `press` / `deadlift` are the grid's PRIMARY names — the main lift
  // itself, not a bodyweight cousin. Tagged as the loaded movement they classify as.
  'squat': [['barbell', 'rack']],
  'back squat': [['barbell', 'rack']],
  'barbell back squat': [['barbell', 'rack']],
  'deadlift': [['barbell']],
  'conventional deadlift': [['barbell']],
  // A trap bar is a barbell variant with no key of its own, and inventing one fails "commonly
  // declarable". The plates chip is the honest minimum.
  'trap bar deadlift': [['barbell']],
  'sumo deadlift': [['barbell']],
  'bench': [['barbell', 'bench']],
  'bench press': [['barbell', 'bench']],
  'barbell bench press': [['barbell', 'bench']],
  // ⚠️ NO `decline_bench` KEY — that chip was cut by Slice 7. A flat bench is the declarable
  // minimum; the decline itself is the substitution backstop's problem, not the gate's.
  'decline bench press': [['barbell', 'bench']],
  'overhead press': [['barbell']],
  'standing barbell overhead press': [['barbell']],
  'military press': [['barbell']],
  'press': [['barbell']],
  'ohp': [['barbell']],
  'push press': [['barbell']],
  // Ambiguous name — dumbbells are the commoner reading, so both routes.
  'shoulder press': [['dumbbells'], ['barbell']],
  'pullup': [['pull_up_bar']],
  'chinup': [['pull_up_bar']],

  // ── BRACED / FIXED-STATION ──────────────────────────────────────────────────────────────────────
  // The motivating case for the `machine` key, named in the vocabulary note above.
  'leg press': [['machine']],
  'ab machine crunch': [['machine']],
  'lat pull down': [['cable'], ['bands']],
  'explosive lat pull down': [['cable'], ['bands']],
  'cable row': [['cable']],
  'cable face pull': [['cable']],
  'band assisted pull up': [['pull_up_bar', 'bands']],
  // Chest-supported means something to lie on at an angle, or the station that does it for you.
  'chest supported row': [['dumbbells', 'incline_bench'], ['machine']],

  // ── CARRIES ─────────────────────────────────────────────────────────────────────────────────────
  // Anything with a handle. `backpack carry` is NOT here — see the thirteen, above.
  'farmer walk': [['dumbbells'], ['kettlebell'], ['barbell']],
  'farmers carry': [['dumbbells'], ['kettlebell'], ['barbell']],
  'suitcase carry': [['dumbbells'], ['kettlebell'], ['barbell']],
  'overhead carry': [['dumbbells'], ['kettlebell'], ['barbell']],

  // ── CORE: NEEDS NOTHING ─────────────────────────────────────────────────────────────────────────
  'crunch': ALWAYS,
  'bicycle crunch': ALWAYS,
  'cross body crunch': ALWAYS,
  'reverse crunch': ALWAYS,
  'bird dog': ALWAYS,
  'dead bug': ALWAYS,
  'plank hold': ALWAYS,
  'plank with shoulder tap': ALWAYS,
  'side plank': ALWAYS,
  'side plank abduction': ALWAYS,
  'side plank with hip dip': ALWAYS,
  // ⚠️ A COUCH OR A CHAIR IS THE PROP, the same F-6 reasoning `inverted row` follows. The bench a gym
  // athlete uses is convenience, not a prerequisite.
  'copenhagen plank': ALWAYS,
  'superman hold': ALWAYS,
  'flutter kicks': ALWAYS,
  'scissor kicks': ALWAYS,
  'russian twist': ALWAYS,
  'toe touches': ALWAYS,
  'v up': ALWAYS,
  // The athlete's-choice rows. Gating a free choice would be circular.
  'core work': ALWAYS,
  'core circuit': ALWAYS,
  'core work (5 min your choice)': ALWAYS,
  'core work 5 min your choice': ALWAYS,

  // ── CORE: NEEDS SOMETHING ───────────────────────────────────────────────────────────────────────
  // Hanging. The bar is the movement.
  'toes to bar': [['pull_up_bar']],
  'hanging windshield wipers': [['pull_up_bar']],
  'l sits': [['pull_up_bar']],
  'ab rollout': [['ab_wheel']],
  // ⛔ THE TWO CHIPS RULED IN 2026-08-26 — see the `suspension_trainer` / `stability_ball` note on
  // GearKey. These three movements were the case: prescribed to athletes who owned neither.
  'trx fallout': [['suspension_trainer']],
  // ⚠️ EITHER BALL OR STRAPS. A stir-the-pot is forearms on a ball; the TRX version is the same
  // anti-extension movement on straps, and an athlete with one does not need the other.
  'stir the pot': [['stability_ball'], ['suspension_trainer']],
  'stability ball rollout': [['stability_ball']],
  'cable crunch': [['cable'], ['bands']],
  'cable woodchopper': [['cable'], ['bands']],
  'pallof press': [['cable'], ['bands']],
  'turkish getup': [['kettlebell'], ['dumbbells']],
  'turkish get ups': [['kettlebell'], ['dumbbells']],

  // ── CALVES AND SHINS ────────────────────────────────────────────────────────────────────────────
  // ⛔ ALWAYS, AND IT MATTERS. `accessory-dosing/ledger.ts` recorded calves going unfillable for a
  // commercial-gym athlete under a stricter reading, because every calf movement was untagged. They
  // are also genuinely bodyweight movements — a step edge is not equipment.
  'calf raise': ALWAYS,
  'calf raises (bilateral)': ALWAYS,
  'single leg calf raise': ALWAYS,
  'soleus raise': ALWAYS,
  'tibialis raise': ALWAYS,
  'weighted single leg calf raise': [['dumbbells'], ['kettlebell'], ['barbell']],

  // ── ARMS, DELTS AND FLYES ───────────────────────────────────────────────────────────────────────
  'barbell curl': [['barbell']],
  // Plural aliases of rows already above. ⚠️ The routes must MATCH their singulars — the grid dedupes
  // plurals and can offer either spelling, so a disagreement here is a gate that flips on spelling.
  'dumbbell curls': [['dumbbells']],
  'hammer curls': [['dumbbells']],
  'cable curls': [['cable'], ['bands']],
  'tricep extensions': [['dumbbells'], ['barbell'], ['bands']],
  'bent over reverse flye': [['dumbbells']],
  'rear delt fly': [['dumbbells'], ['cable'], ['bands']],
  'rear delt flyes': [['dumbbells'], ['cable'], ['bands']],
  'reverse fly': [['dumbbells'], ['cable'], ['bands']],
  'reverse flye': [['dumbbells'], ['cable'], ['bands']],
  // ⛔ THE NAME SAYS BODYWEIGHT and the config comment calls it the fallback the engine reaches for
  // when the athlete owns nothing. Gating it would delete the fallback from the athlete it is for.
  'reverse flyes (bodyweight)': ALWAYS,
  'reverse flyes bodyweight': ALWAYS,
  // Prone on the floor. Light plates are optional, never required.
  'prone y t w raise': ALWAYS,
  'ytw raises': ALWAYS,
  'lateral raise': [['dumbbells'], ['cable'], ['bands']],
  'dumbbell lateral raise': [['dumbbells']],
  'band lateral raise': [['bands']],
  'front raise': [['dumbbells'], ['barbell'], ['bands']],
  'scaption': [['dumbbells'], ['bands']],
  'scaption (bodyweight shoulder raises)': ALWAYS,
  'scaption bodyweight shoulder raise': ALWAYS,
  'chest fly': [['dumbbells'], ['cable'], ['bands']],
  'chest flyes': [['dumbbells'], ['cable'], ['bands']],
  'dumbbell fly': [['dumbbells']],
  'dumbbell flyes': [['dumbbells']],
  'cable crossover': [['cable'], ['bands']],

  // ── HINGE ───────────────────────────────────────────────────────────────────────────────────────
  'rdl': [['barbell'], ['dumbbells'], ['kettlebell']],
  'db romanian deadlift': [['dumbbells']],
  'single leg rdl': [['dumbbells'], ['kettlebell'], ['barbell']],
  'single leg romanian deadlift': [['dumbbells'], ['kettlebell'], ['barbell']],
  'kettlebell swing': [['kettlebell']],
  'kb swings': [['kettlebell']],
  'dumbbell swing': [['dumbbells']],
  'db swings': [['dumbbells']],
  'kb db swing': [['kettlebell'], ['dumbbells']],
  'glute bridge': ALWAYS,
  'glute bridge march': ALWAYS,
  'single leg glute bridge': ALWAYS,
  'hip extension': ALWAYS,
  'clamshell': ALWAYS,
  'band lateral walk': [['bands']],
  'lateral band walk': [['bands']],

  // ── SQUAT PATTERN AND LUNGES ────────────────────────────────────────────────────────────────────
  'air squat': ALWAYS,
  'bodyweight squat': ALWAYS,
  'single leg squat': ALWAYS,
  'pistol squats': ALWAYS,
  'lunges': ALWAYS,
  'walking lunge': ALWAYS,
  'lateral lunge': ALWAYS,
  // ⚠️ `box` IS MENTION-ONLY — no chip produces it, so a route through it could never be satisfied.
  // A step-up is done on whatever is knee height, which is the F-6 reading `inverted row` already
  // takes. The box belongs on the Equipment line, not in the gate.
  'step up': ALWAYS,
  'box step up': ALWAYS,
  'explosive step up': ALWAYS,
  'barbell walking lunge': [['barbell']],
  'dumbbell walking lunge': [['dumbbells']],
  'goblet squat': [['kettlebell'], ['dumbbells']],

  // ── ROWS AND REAR-CHAIN PULLS ───────────────────────────────────────────────────────────────────
  'bent over row': [['barbell'], ['dumbbells']],
  'rows': [['barbell'], ['dumbbells']],
  'single arm row': [['dumbbells']],
  'light db row': [['dumbbells']],
  'kettlebell rows': [['kettlebell']],
  'band row': [['bands']],
  'resistance band row': [['bands']],
  'band pull apart': [['bands']],
  'band face pull': [['bands']],
  'band leg curl': [['bands']],
  'external rotation': [['bands'], ['dumbbells'], ['cable']],

  // ── PRESSES AND PUSH-UPS ────────────────────────────────────────────────────────────────────────
  'pushup': ALWAYS,
  'archer push up': ALWAYS,
  'decline push up': ALWAYS,
  'pike push up': ALWAYS,
  'handstand push ups': ALWAYS,
  'dumbbell press': [['dumbbells']],
  'db push press': [['dumbbells']],
  'db thruster': [['dumbbells']],
  'kettlebell press': [['kettlebell']],
  'kettlebell snatches': [['kettlebell']],
  'band overhead press': [['bands']],
  'incline bench': [['barbell', 'incline_bench']],

  // ============================================================================
  // ⛔⛔ VIADA'S MOVEMENT KEY — ROUTES FOR THE THIRTY ADDED 2026-08-29 (pp.218-223)
  //
  // ⛔ ADDING MOVEMENTS WITHOUT ROUTES REPEATS THE DEFECT THE 2026-08-22 GRID AUDIT FOUND: `leg
  // extension` and `seated calf raise` existed and carried no tag, so for an athlete who HAD declared
  // equipment they read as *unknown* rather than available and were substituted away. The cell looked
  // starved when it was only unlabelled.
  //
  // ⚠️ FIXED-STATION WORK TAKES `machine`, which the commercial-gym chip grants (2026-08-25). That is
  // the declaration, so "commonly declarable" is satisfied and the leg-curl "leave it ungated"
  // precedent does not apply.
  // ============================================================================

  // ⚠️ KEYS ARE IN FOLDED FORM — `gearRoutesFor` folds the incoming name (lowercase, apostrophes
  // dropped, hyphens and underscores to spaces) and looks the TABLE up with it, so a hyphenated key
  // here can never be hit. Three of these were written hyphenated and the untagged-gear warning
  // caught them: "stiff-legged deadlift", "t-bar row", "ground-based deadlift machine".
  // ── free-weight secondaries: gate on the implement, never on the bench ──────────────────────────
  'paused deadlift': [['barbell']],
  'box squat': [['barbell', 'rack']],
  'larsen press': [['barbell', 'bench']],
  'jm press': [['barbell', 'bench']],
  'seated db press': [['dumbbells', 'bench']],
  'arnold press': [['dumbbells']],
  'kroc row': [['dumbbells']],
  't bar row': [['barbell']],
  'meadows row': [['barbell']],
  'gorilla row': [['dumbbells'], ['kettlebell']],
  'db pullover': [['dumbbells', 'bench']],
  'stiff legged deadlift': [['barbell'], ['dumbbells']],
  'zercher squat': [['barbell', 'rack']],

  // ⛔ UNGATED, ON THE `leg curl` PRECEDENT. A sandbag is required and is NOT commonly declarable —
  // no inventory chip produces one — so a route would delete the movement instead of swapping it.
  'sandbag throw': ALWAYS,

  // ── fixed stations: the commercial-gym chip is the declaration ──────────────────────────────────
  'smith machine press': [['machine']],
  'machine chest press': [['machine']],
  'dip machine': [['machine']],
  'hack squat': [['machine']],
  'lever squat': [['machine']],
  'ground based deadlift machine': [['machine']],
  'pec deck': [['machine']],
  'pullover machine': [['machine']],
  'hip adduction machine': [['machine']],

  // ── cable work ─────────────────────────────────────────────────────────────────────────────────
  'cable upright row': [['cable']],
  'cable kickback': [['cable'], ['machine']],

  // ── focused arms: two ways into most of them ───────────────────────────────────────────────────
  'tate press': [['dumbbells', 'bench']],
  'skull crusher': [['barbell', 'bench'], ['dumbbells', 'bench']],
  'preacher curl': [['barbell', 'bench'], ['dumbbells', 'bench']],
  'spider curl': [['dumbbells', 'incline_bench']],
  'drag curl': [['barbell'], ['dumbbells']],

};

/** Names already warned about, so an untagged movement announces itself once, not once per render. */
const warnedUntaggedGear = new Set<string>();

/**
 * The equipment routes for a movement.
 *
 * ⛔ THE DEFAULT IS LOUD, the same rule `getExerciseConfig` learned the expensive way: an untagged
 * movement returns {@link ALWAYS} — offer rather than hide, since a false exclusion is worse than a
 * false offer — and says so once. Silence would mean the gate either drops a movement or waves it
 * through with nobody knowing which.
 */
export function gearRoutesFor(exerciseName: string): GearRoutes {
  const key = foldExerciseName(String(exerciseName ?? ''));
  const hit = ASSISTANCE_GEAR[key];
  if (hit) return hit;
  if (key && !warnedUntaggedGear.has(key)) {
    warnedUntaggedGear.add(key);
    console.warn(
      `[strength-gear] NO GEAR TAG: "${exerciseName}" is not in ASSISTANCE_GEAR — treated as needing ` +
        `nothing. Add it in src/lib/strength-gear.ts before anything gates on equipment.`,
    );
  }
  return ALWAYS;
}

/**
 * ⛔ THE GATE. Can this athlete perform this movement with what they own?
 *
 * One route satisfied is enough (OR of ANDs). Movements with no tag return true — see
 * {@link gearRoutesFor}: offer rather than hide.
 *
 * ⚠️ AN EMPTY INVENTORY MEANS "WE DO NOT KNOW", NOT "THEY OWN NOTHING", and the difference is the
 * whole athlete's menu. `user_baselines.equipment.strength` is empty for anyone who never opened the
 * picker, and a strict reading would hand them four days of push-ups. Unknown degrades to UNGATED,
 * which is the same §0h rule `resolveAssistance` follows for an unknown main lift.
 */
/**
 * ⛔ A BAND IS A LAST RESORT, NOT AN IMPLEMENT. This is the one gear judgement in the file, so it is
 * stated once, here, rather than inferred at three call sites.
 *
 * Every other key names something you can LOAD or PROGRESS: a barbell and dumbbells add weight, a
 * cable stack and a machine add pins, a rack or a bench lets bodyweight work be leaned into, and
 * bodyweight itself progresses by reps (Push-Up, Inverted Row, Reverse Lunge — Wendler's own 50-rep
 * prescription is exactly that progression). A band adds tension that FALLS as the movement
 * shortens, cannot be measured, and cannot be stepped in any repeatable way.
 *
 * ⚠️ IT IS STILL A REAL ROUTE. Nothing here excludes a band — `canPerform` is untouched, and an
 * athlete with nothing else keeps every movement a band can reach. This decides ORDER, and only when
 * there is something loadable to put in front.
 */
const LAST_RESORT_KEYS: ReadonlySet<string> = new Set(['bands']);

/**
 * The rank boundary. A fit at or above this is BAND-ONLY for this athlete: every route they can
 * satisfy runs through a band. Below it, something loadable reaches the movement.
 */
export const LAST_RESORT_RANK_FLOOR = 100;

/** Does this route depend on a last-resort implement? */
function isLastResortRoute(route: readonly string[]): boolean {
  return route.some((k) => LAST_RESORT_KEYS.has(k));
}

/**
 * ⛔ HOW WELL DOES THE ATHLETE'S KIT FIT THIS MOVEMENT? Lower is better; `null` = cannot perform.
 *
 * TWO TIERS, then the route order inside each:
 *
 *   `0 … 99`    a LOADABLE route is satisfied — barbell, dumbbells, cable, machine, rack/bench, or
 *               progressable bodyweight. The number is the route's own index.
 *   `100 …`     only a BAND route is satisfied. Sorts below every loadable movement in the pool.
 *   `null`      nothing is satisfied — the athlete cannot perform it at all.
 *
 * ⚠️ THE ROUTE INDEX ALONE WAS NOT ENOUGH, and the case that proved it is the one this rank exists
 * for. `'triceps pushdown': [['cable'], ['bands']]` and `'tricep extension': [['dumbbells'], …]` both
 * have the athlete's kit satisfied at *some* index, and on a dumbbells+bands gym the pushdown's band
 * route (index 1) beat nothing — it simply sat first in the catalog. Comparing indices across
 * movements compares two different questions; comparing IMPLEMENT QUALITY first is the real one.
 *
 * ⚠️ THE ORDERING OF ROUTES WITHIN A MOVEMENT IS STILL LOAD-BEARING — {@link ASSISTANCE_GEAR} lists
 * them natural-first, and that is what breaks ties inside a tier. Put the natural implement first.
 *
 * ⛔ THIS IS NOT A SECOND GATE. `canPerform` decides IF; this decides WHICH FIRST, among movements
 * that already passed. Anything performable has a rank; nothing is excluded by it.
 */
export function equipmentFitRank(
  exerciseName: string,
  athleteEquipment: string[] | null | undefined,
): number | null {
  const chips = Array.isArray(athleteEquipment) ? athleteEquipment.filter((c) => String(c || '').trim()) : [];
  const routes = gearRoutesFor(exerciseName);
  // Unknown inventory → everything is equally plausible. Same §0h rule `canPerform` follows: unknown
  // degrades to UNCHANGED (catalog order), never to a guessed ranking.
  if (chips.length === 0) return 0;
  const owned = athleteEquipmentToKeys(chips);
  let lastResort: number | null = null;
  for (let i = 0; i < routes.length; i++) {
    if (!routes[i].every((k) => owned.has(k))) continue;
    // A loadable route wins outright — no later route can beat it, so return immediately.
    if (!isLastResortRoute(routes[i])) return i;
    if (lastResort == null) lastResort = LAST_RESORT_RANK_FLOOR + i;
  }
  return lastResort;
}

/** True when the athlete reaches this movement WITHOUT a band. */
export function hasLoadableFit(
  exerciseName: string,
  athleteEquipment: string[] | null | undefined,
): boolean {
  const r = equipmentFitRank(exerciseName, athleteEquipment);
  return r != null && r < LAST_RESORT_RANK_FLOOR;
}

/**
 * ⛔ THE KEYS THAT ADD EXTERNAL LOAD. Not "gear the athlete owns" — gear that puts WEIGHT in their
 * hands, which is a different question from either of this file's two existing maps.
 *
 * ⚠️ A RACK, A BENCH AND A PULL-UP BAR ARE DELIBERATELY ABSENT. They SUPPORT a movement; they do not
 * load one. An athlete with a bench and no dumbbells is still a bodyweight athlete, and treating a
 * bench as an implement would tell {@link ownsLoadingImplement} the opposite.
 *
 * ⚠️ SO ARE BANDS, and for the reason {@link LAST_RESORT_KEYS} already states once: a band's tension
 * cannot be measured or stepped. A bands-only athlete is not an athlete with weights.
 */
const LOADING_KEYS: ReadonlySet<string> = new Set(['barbell', 'dumbbells', 'kettlebell', 'cable']);

/**
 * ⛔ DOES THIS ATHLETE OWN SOMETHING THEY CAN PUT WEIGHT ON — the question the GRID's ordering has
 * and neither {@link canPerform} nor {@link equipmentFitRank} answers.
 *
 * `equipmentFitRank` ranks by ROUTE, and an untagged movement has no route: it returns 0 for every
 * one of them, so a bodyweight fallback and a dumbbell movement tie and the CATALOGUE'S ORDER breaks
 * it. That is how `reverse flyes (bodyweight)` — a name `materialize-plan` emits precisely BECAUSE
 * the athlete owns nothing — can be offered to somebody with a rack full of dumbbells.
 *
 * ⚠️ FALSE FOR AN ATHLETE NOBODY ASKED, which is the §0h rule again: unknown inventory means "we
 * have not asked", so no claim about implements can be made and nothing is reordered.
 */
export function ownsLoadingImplement(athleteEquipment: string[] | null | undefined): boolean {
  const chips = Array.isArray(athleteEquipment) ? athleteEquipment.filter((c) => String(c || '').trim()) : [];
  if (chips.length === 0) return false;
  const owned = athleteEquipmentToKeys(chips);
  for (const k of owned) if (LOADING_KEYS.has(k)) return true;
  return false;
}

export function canPerform(exerciseName: string, athleteEquipment: string[] | null | undefined): boolean {
  const chips = Array.isArray(athleteEquipment) ? athleteEquipment.filter((c) => String(c || '').trim()) : [];
  if (chips.length === 0) return true;
  const owned = athleteEquipmentToKeys(chips);
  return gearRoutesFor(exerciseName).some((route) => route.every((k) => owned.has(k)));
}
