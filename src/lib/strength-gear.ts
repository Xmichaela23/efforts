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
  | 'decline_bench'
  | 'dumbbells'
  | 'kettlebell'
  | 'cable'
  | 'pull_up_bar'
  | 'dip_bars'
  | 'box'
  | 'rings'
  | 'ab_wheel'
  | 'ghd'
  | 'leg_curl_machine'
  | 'bands';

/** Athlete-facing label per key. Also the vocabulary's roster — a key absent here does not exist. */
export const STRENGTH_GEAR_LABEL: Record<GearKey, string> = {
  barbell: 'Barbell',
  rack: 'Rack',
  bench: 'Bench',
  incline_bench: 'Incline Bench',
  decline_bench: 'Decline Bench',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  cable: 'Cable',
  pull_up_bar: 'Pull-up Bar',
  dip_bars: 'Dip Bars',
  box: 'Box',
  rings: 'Rings',
  ab_wheel: 'Ab Wheel',
  ghd: 'Glute-ham developer',
  leg_curl_machine: 'Leg Curl Machine',
  bands: 'Bands',
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
    if (s.includes('decline bench')) out.add('decline_bench');
    if (s.includes('ab wheel') || s.includes('ab roller')) out.add('ab_wheel');
    // A power tower is the one home setup that genuinely carries dip bars, and `hasPullUpBar`
    // already recognises the phrase.
    if (s.includes('dip') || s.includes('parallel bar') || s.includes('power tower')) out.add('dip_bars');
    if (s.includes('ghd') || s.includes('glute ham') || s.includes('nordic bench')) out.add('ghd');
    if (s.includes('leg curl')) out.add('leg_curl_machine');
    // Commercial gym implies most fixed equipment is on hand.
    if (s.includes('commercial gym')) {
      out.add('barbell');
      out.add('rack');
      out.add('bench');
      out.add('dumbbells');
      out.add('cable');
      out.add('pull_up_bar');
      // Adjustable benches are what a commercial gym HAS. ⛔ An ab wheel is not — see `hasAbWheel`.
      out.add('incline_bench');
      out.add('decline_bench');
      // A dip station and a leg-curl machine are fixtures; a GHD is NOT — plenty of gyms have none,
      // which is the stance `hasGHD` has always taken and this must not quietly reverse.
      out.add('dip_bars');
      out.add('leg_curl_machine');
      // ⛔ RINGS ARE NOT A GYM FIXTURE EITHER. A commercial gym may have a rig with rings or none at
      // all; the athlete ticks the chip if they have them.
    }
  }
  return out;
}

/**
 * What it takes to perform a movement: **a list of ALTERNATIVE routes, each a set of keys that must
 * ALL be present.** OR of ANDs. `[['dumbbells', 'incline_bench']]` is one route needing both;
 * `[['ghd'], ['decline_bench'], ['barbell']]` is three ways to do the same movement.
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
  // Wendler's dips are parallel bars (Forever p.24). ⚠️ The old advisory tag said `'bar'` — the SAME
  // token it gave a pull-up bar, a squat bar and a low bar for inverted rows. Four pieces of
  // equipment, one word: that is what "incomplete" meant.
  'dips': [['dip_bars'], ['rings']],
  'tricep dips': [['dip_bars'], ['rings']],
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
  'close grip bench press': [['barbell', 'bench']],

  // ── PULL ────────────────────────────────────────────────────────────────────────────────────────
  'pull up': [['pull_up_bar']],
  'chin up': [['pull_up_bar']],
  // ⚠️ ALWAYS, deliberately, and it follows F-6 rather than contradicting it: `exerciseRequiredGearKeys`
  // returns [] for inverted rows because the athlete rows under whatever they have — a bar in a rack,
  // rings, a table edge. Gating it would be an over-reach the gear line already declined to make.
  'inverted row': ALWAYS,
  'inverted ring row': [['rings']],
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
  'romanian deadlift': [['barbell'], ['dumbbells']],
  'good morning': [['barbell']],
  // ⛔ SLICE 5 MIGRATION RISK, AND IT IS WHY THIS ENTRY IS ANNOTATED: Leg Curl reaches an athlete only
  // through the OLD `ROLE_FALLBACK.leg_match` pool. The new catalog carries it (see
  // `ASSISTANCE_CATALOG`) and `substituteExerciseForEquipment` keeps the Nordic/band swap, so
  // Wendler's hamstring-via-curl route survives. Do not drop either half.
  'leg curl': [['leg_curl_machine']],
  'leg curls': [['leg_curl_machine']],
  'band leg curls': [['bands']],
  // ⛔ THE DECLINE BENCH IS AN ANKLE ANCHOR, AND THAT IS WHY IT COUNTS HERE (decided 2026-08-13).
  // A decline bench's rollers hook the feet, which is the standard home substitute for a GHD on the
  // whole kneel-and-lower family: Nordic curl, glute-ham raise, back raise. Feet under a loaded
  // barbell is the third route, and it is what most people actually do.
  // ⚠️ INCLINE DOES NOT SUBSTITUTE. It is the ankle hook that qualifies, not the angle — an
  // incline-only bench unlocks none of these.
  'nordic curl': [['ghd'], ['decline_bench'], ['barbell']],
  'nordic curls': [['ghd'], ['decline_bench'], ['barbell']],
  'nordic hamstring curl': [['ghd'], ['decline_bench'], ['barbell']],
  'glute ham raise': [['ghd'], ['decline_bench'], ['barbell']],
  'back extension': [['ghd'], ['decline_bench'], ['barbell']],
  // Hips on the pad, legs swinging — any bench does it. ⚠️ `athleteEquipmentToKeys` adds `bench` for
  // ANY chip containing the word, so the incline and decline chips satisfy this too.
  'reverse hyper': [['bench'], ['ghd']],
  'reverse hyperextension': [['bench'], ['ghd']],
  'hanging leg raise': [['pull_up_bar']],
  'hanging knee raise': [['pull_up_bar']],
  'ab wheel rollout': [['ab_wheel']],
  'sit up': ALWAYS,
  'weighted sit up': ALWAYS,
  'db side bend': [['dumbbells'], ['kettlebell']],
  'dumbbell side bend': [['dumbbells'], ['kettlebell']],
  'plank': ALWAYS,
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
export function canPerform(exerciseName: string, athleteEquipment: string[] | null | undefined): boolean {
  const chips = Array.isArray(athleteEquipment) ? athleteEquipment.filter((c) => String(c || '').trim()) : [];
  if (chips.length === 0) return true;
  const owned = athleteEquipmentToKeys(chips);
  return gearRoutesFor(exerciseName).some((route) => route.every((k) => owned.has(k)));
}
