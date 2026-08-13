/**
 * IN-SLOT exercise alternatives for the Swap sheet. (Q-181 / D-289, slice 2.)
 *
 * ── THE FIELD STANDARD ────────────────────────────────────────────────────────────────────────
 *   The app OFFERS the alternatives, filtered by MOVEMENT PATTERN + the athlete's EQUIPMENT.
 *   The athlete does not have to know what a valid substitute is.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ABC Trainerize's substitution filters are literally "Same muscle group / Same Equipment / Same
 * movement". Fitbod auto-substitutes same-muscle at equivalent intensity. RP Hypertrophy swaps
 * mid-cycle from a library. The consensus on a GOOD substitute: MATCH THE MOVEMENT PATTERN.
 *
 * ⛔ FILTER ON `pattern`, NOT `primaryRef`. I had this WRONG and it shipped: `primaryRef` is a LOADING
 * reference ("which 1RM do I derive the weight from"), and a Barbell Row is `primaryRef: 'bench'`
 * because a row loads at ~80% of your bench. The config's own section header says so — "UPPER PULL
 * (Bench Reference AS PROXY)". Filtering on it OFFERED A BENCH PRESS AS A SUBSTITUTE FOR A ROW: a push
 * for a pull, the opposite muscle group. And every bodyweight movement (pull-ups — THE most-substituted
 * exercise in the gym — push-ups, planks) had `primaryRef: null` and so got no options at all.
 *
 * `pattern` (MovementPattern in exercise-config.ts) is the real slot. It was NOT invented: it is
 * transcribed from that file's own section headers, which have carried the taxonomy as comments all
 * along.
 *
 * ⛔ WE DO NOT FILTER ON ROLE — BUT WE DO NOW FILTER ON INTENSITY TIER. ⚠️ THIS PARAGRAPH USED TO SAY
 * THE OPPOSITE, and the correction is worth keeping in full because the original reasoning was half
 * right. It read: *"THE FIELD DOESN'T: … Neither filters on load tier — that was MY judgment, not the
 * field's."*
 *
 *   • **On role, it still stands.** `roleForExercise` is too noisy to filter on: `barbell row` is
 *     'primary' while `bent over row` is 'accessory' — THE SAME MOVEMENT. Filtering on it produced
 *     EMPTY lists. (That inconsistency is a real data bug in exercise-role.ts; filed, not papered over.)
 *   • **On tier, it was wrong, and the gate below is the fix.** Fitbod's own rule is "same muscles at
 *     *equivalent intensity*" — that IS a tier filter. The main-lift gate further down this same file
 *     already said so in terms (*"Trainerize and Fitbod substitute within muscle group AND equivalent
 *     intensity, never across load tiers"*) and then applied it to exactly one case. Without the
 *     general rule the engine offered a **Barbell Hip Thrust for a Clamshell** and a **DB Lateral
 *     Raise for a Band Lateral Raise**. Measured over the library: 97 of 764 offers were wrong on
 *     tier alone (docs/AUDIT-accessory-swaps-2026-08-03.md). Tier is derived in
 *     `strength-intensity-tier.ts` from the TYPE axis, never from role.
 *
 * ⚠️ AND THE MUSCLE AXIS STAYS LOOSE ON PURPOSE. The same audit flagged 253 offers whose target muscle
 * differs (Single Leg RDL → Hip Thrust: hamstrings vs glutes). Those are NOT gated — Michael's ruling
 * and Wendler's: posterior-chain assistance is interchangeable, `pattern` remains the muscle proxy,
 * and a same-muscle gate would empty half these lists.
 *
 * ⚠️ THERE IS A DEAD SECOND TAXONOMY IN THE REPO — `src/services/ExerciseLibrary.ts` (primaryMuscles,
 * equipment, categories). Its header claims it is "Used by PlanEngine, ManualPlanBuilder, and Logging
 * components"; it is used by **CoreTimer and nothing else**. DO NOT merge it in, and DO NOT build a
 * third. Filed as a DEAD/DOUBLED finding — mount it or delete it, but not here.
 *
 * EQUIPMENT is derived from `displayFormat`, which the config already carries — NOT from a new field:
 *   'total'      → a barbell movement (needs a barbell)
 *   'perHand'    → dumbbells / kettlebells
 *   'bodyweight' → always available
 *   'band'       → needs bands
 * A coarse but honest signal, and it is the one that exists. **Where we cannot tell, we OFFER rather
 * than hide** — a false exclusion is worse than a false offer: the athlete can see a barbell hip thrust
 * and skip it, but they cannot pick something the app never showed them.
 */
import { EXERCISE_CONFIG, getExerciseConfig, type ExerciseConfig } from './exercise-config.ts';
// The assistance framework owns its own peer list — see `assistancePeersFor`.
// D-407 — the assistance framework's own peers now come from the per-day catalog.
import { assistancePeersFor } from './assistance-catalog.ts';
import { canPerform } from './strength-gear.ts';
// [Step 4] The ONE answer to "is this one of the four main lifts" — the same classifier the State
// row and the logger's bar-speed cue gate on. Unioned with this file's curated families, never
// substituted for them; see `isMainLift` for the measurement behind that.
import { isMain531Lift } from './exercise-role.ts';
// The INTENSITY-TIER gate (2026-08-03). Generalizes the main-lift exclusion below from "never offer a
// main lift for an accessory" to "never offer across load tiers at all".
import { intensityTierForExercise } from './strength-intensity-tier.ts';

// DIRECT-SWAP FAMILIES — a small curated map of "the same movement, programmed differently," the way a
// strength app groups substitutes. Members of the same family are DIRECT swaps for each other (Leg Press
// for a Back Squat); a same-pattern lift NOT in the family is a same-muscle ALTERNATIVE (Hip Thrust is
// hip-dominant like a deadlift but it is not a deadlift). Names are in normalized form (lowercase,
// punctuation→space). A slot not found in any family falls back to a loadable-compound heuristic below.
const DIRECT_FAMILIES: Array<Set<string>> = [
  // Squat / quad-dominant compounds
  new Set(['back squat', 'barbell back squat', 'squat', 'front squat', 'leg press', 'hack squat', 'goblet squat', 'box squat', 'safety bar squat', 'zercher squat', 'belt squat']),
  // Deadlift / bilateral hip-hinge compounds (NOT hip thrust / glute bridge — those are accessories)
  new Set(['conventional deadlift', 'deadlift', 'sumo deadlift', 'trap bar deadlift', 'hex bar deadlift', 'romanian deadlift', 'rdl', 'stiff leg deadlift', 'stiff legged deadlift', 'deficit deadlift', 'rack pull', 'good morning']),
  // Horizontal press
  // ⚠️ 'bench' is a real config key (a shorthand alias). Without it the alias reads as an accessory.
  new Set(['bench press', 'bench', 'barbell bench press', 'incline bench press', 'decline bench press', 'close grip bench press', 'dumbbell bench press', 'dumbbell incline press', 'floor press']),
  // Vertical press
  // ⚠️ 'shoulder press' is a real key, and its absence here is why a Lateral Raise was offered one.
  new Set(['overhead press', 'shoulder press', 'standing overhead press', 'strict press', 'military press', 'push press', 'seated dumbbell press', 'dumbbell shoulder press', 'arnold press', 'z press']),
  // Horizontal pull (rows)
  // ⚠️ 'rows' is a real key and is NOT the plural of a key here ('row' does not exist), so the
  // singularizing rules never collapsed it — which is why a Face Pull was offered "Rows".
  new Set(['barbell row', 'rows', 'bent over row', 'pendlay row', 'dumbbell row', 't bar row', 'seal row', 'chest supported row', 'cable row', 'seated cable row']),
  // Vertical pull
  // ⚠️ 'pullup' / 'pullups' / 'pull ups' / 'chin ups' are all real keys. The normalizer turns
  // punctuation into spaces but cannot know 'pullup' is 'pull up', so each had to be listed.
  new Set(['pull up', 'pull ups', 'pullup', 'pullups', 'chin up', 'chin ups', 'lat pulldown', 'pulldown', 'neutral grip pulldown']),
];

/**
 * ⛔ IS THIS A MAIN LIFT? Membership in a curated family IS the answer (2026-07-30).
 *
 * Michael: *"we arent offering the right swaps for accessories, reads them as traditional lifts."*
 * He is right, and it was reproducible without touching any of his data:
 *
 *   Hip Thrust             → DIRECT: Deadlift, Conventional Deadlift, Trap Bar Deadlift, Sumo Deadlift
 *   Bulgarian Split Squat  → DIRECT: Leg Press, Squat, Back Squat, Front Squat
 *   Face Pull              → DIRECT: Barbell Row
 *   Lateral Raise          → DIRECT: Shoulder Press
 *
 * THE CAUSE, and it is one line: the uncurated fallback was `loadable ? 'direct' : 'lighter'` — a
 * SYMMETRIC rule. An accessory belongs to no family, so it fell to that fallback, and every loadable
 * lift sharing its movement pattern was labelled a direct swap. Sorted heaviest-ratio-first, which put
 * the main lifts at the TOP of a list headed "Direct swaps."
 *
 * ⛔ AND THIS IS NOT THE ROLE FILTER THE HEADER WARNS OFF. That warning is about `roleForExercise`,
 * whose data genuinely contradicts itself (`barbell row` primary, `bent over row` accessory — the same
 * movement). This reads DIRECT_FAMILIES, which is curated in this file and internally consistent.
 *
 * ⚠️ MEASURED BEFORE SHIPPING, because "offer rather than hide" is this module's standing rule and an
 * exclusion has to earn itself: across all 110 uncurated slots, excluding main lifts empties **2**
 * lists — and both are the `pullup`/`pullups` alias gap below, not a real absence. Every other
 * accessory keeps a full list of same-pattern accessories.
 *
 * ── [Step 4] THE SHARED CLASSIFIER IS NOW AUTHORITATIVE, AS A UNION — NOT AS A REPLACEMENT ──────
 *
 * ⛔ REPOINTING THIS AT `isMain531Lift` OUTRIGHT WOULD HAVE UNDONE THE FIX ABOVE. Measured across
 * the 143 config names, the two answers disagree on **27**, and 26 of those run the same way: a
 * Goblet Squat, Leg Press, RDL, Barbell Row, Dumbbell Row, Pull Up, Chin Up and Lat Pulldown are all
 * in a curated family and are all `isMain531Lift === false`. Dropping the family test would let every
 * one of them back into an accessory's swap list — i.e. exactly the Face Pull → "Barbell Row" and
 * Lateral Raise → "Shoulder Press" offers this function was written to stop.
 *
 * ⚠️ THE TWO QUESTIONS ARE GENUINELY DIFFERENT, WHICH IS WHY IT IS A UNION AND NOT A CHOICE.
 * `isMain531Lift` asks "is this one of Wendler's four" — a narrow, protocol question. This asks "is
 * this too heavy a compound to offer in an accessory slot" — a relative one, and a Leg Press is
 * exactly that without being anybody's main lift.
 *
 * ⚠️ AND THE UNION CHANGES NOTHING ON SCREEN TODAY — MEASURED, NOT ASSUMED. The swap lists are
 * byte-identical with and without it. Only two names the shared classifier calls main lifts sit in
 * no family: `press`, which is not a config key at all, and `standing barbell overhead press`, which
 * is already suppressed by the CONFIG-IDENTITY DEDUP below (~:279) — its config is byte-identical to
 * `overhead press`, which is iterated first and added to `seen` before this gate drops it.
 *
 * ⛔ SO THIS IS A GUARD, NOT A FIX, AND IT SHOULD BE READ THAT WAY. It becomes load-bearing the
 * moment those two configs diverge (one gains a `note`, or a different `confidence`) — the dedup
 * stops firing and the name would otherwise leak into every vertical-push accessory's list. What it
 * buys unconditionally is that no name list in this file can disagree with the rest of the app about
 * what a main lift is, which is the "answered in one place" this step is for.
 * `exercise-alternatives.shared-role.test.ts` pins the divergence check that announces the change.
 *
 * ⛔ STILL NOT A ROLE FILTER, and the header's warning stands: `roleForExercise` says `barbell row`
 * is primary and `bent over row` is accessory — the same movement — so filtering on it produced
 * EMPTY lists. That data bug is filed, not papered over here.
 */
function isMainLift(name: string): boolean {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Curated family membership OR the shared classifier — either makes it too big for an accessory slot.
  return directFamilyOf(n) != null || isMain531Lift(name);
}

/** The family a lift belongs to (by normalized name, singular-tolerant), or null if uncurated. */
function directFamilyOf(normName: string): Set<string> | null {
  const singular = normName.endsWith('s') ? normName.slice(0, -1) : normName;
  for (const fam of DIRECT_FAMILIES) if (fam.has(normName) || fam.has(singular)) return fam;
  return null;
}

export interface AlternativeOption {
  /** The exercise name, title-cased for display. */
  name: string;
  /** Same movement-pattern slot as the exercise being replaced. Always true for offered options. */
  same_pattern: true;
  /** What the athlete needs. Derived from displayFormat — coarse, but not invented. */
  equipment: 'barbell' | 'dumbbell' | 'bodyweight' | 'band' | 'unknown';
  /**
   * How TRUE a swap this is for the slot. 'direct' = a loadable VARIATION of the same lift (shares the
   * lift's family word — Trap Bar / Sumo / Romanian Deadlift for a deadlift). 'lighter' = a same-muscle
   * ALTERNATIVE in the same movement pattern that isn't the same lift (Hip Thrust, Glute Bridge, a
   * machine, a bodyweight move). Same movement pattern either way (never a wrong-muscle offer).
   */
  tier: 'direct' | 'lighter';
}

function equipmentOf(cfg: ExerciseConfig): AlternativeOption['equipment'] {
  switch (cfg.displayFormat) {
    case 'total': return 'barbell';
    case 'perHand': return 'dumbbell';
    case 'perLeg': return 'dumbbell';
    case 'bodyweight': return 'bodyweight';
    case 'band': return 'band';
    default: return 'unknown';
  }
}

/**
 * ⛔ THE COARSE HALF OF THE EQUIPMENT GATE — barbell / dumbbell / band, read off `displayFormat`.
 *
 * ⚠️ THIS IS NO LONGER THE WHOLE GATE, AND ON ITS OWN IT WAS A HALF-RULE. It knows four categories,
 * and `bodyweight` and `unknown` both return TRUE — so an **Ab Wheel Rollout is `bodyweight`** and was
 * offered to every athlete alive, whether or not they own a wheel. Same for a Chin-Up with no bar, a
 * Glute-Ham Raise with no anchor, and Dips with no dip station. Four gear keys existed with no chip
 * behind them and this function could not have seen them if they had.
 *
 * {@link canSetUp} is the other half and it reads the real gear map. Both run — this one still earns
 * its place because it covers the ~300 library movements that have no gear tag, using the only signal
 * they carry.
 */
export function canDo(equipment: string[] | null | undefined, need: AlternativeOption['equipment']): boolean {
  if (need === 'bodyweight' || need === 'unknown') return true;
  const have = (Array.isArray(equipment) ? equipment : []).map((e) => String(e).toLowerCase());
  // A commercial gym has everything.
  if (have.some((e) => e.includes('commercial gym') || e.includes('full gym') || e.includes('gym access'))) return true;
  if (need === 'barbell') return have.some((e) => e.includes('barbell'));
  if (need === 'dumbbell') return have.some((e) => e.includes('dumbbell') || e.includes('kettlebell'));
  if (need === 'band') return have.some((e) => e.includes('band'));
  return true;
}

/**
 * ⛔ THE SPECIFIC HALF — the same map the BUILDER's picker gates on (slice 4). One gate, two surfaces.
 *
 * The swap sheet and the picker disagreeing is the half-rule this slice exists to close: the builder
 * would decline to offer a movement, and the in-session sheet would offer it back an hour later.
 *
 * Untagged movements return true (`gearRoutesFor`'s loud default: offer rather than hide), so this
 * narrows the library's ~300 entries not at all and narrows the assistance catalog exactly.
 */
function canSetUp(name: string, equipment: string[] | null | undefined): boolean {
  return canPerform(name, equipment);
}

function titleCase(key: string): string {
  return key.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * In-slot alternatives for `plannedName`: same movement pattern, same role tier, feasible with the
 * athlete's equipment. Excludes the exercise itself.
 *
 * Returns [] when the planned exercise has no config entry (we do not know its slot) or no pattern
 * (bodyweight/`primaryRef: null`) — **we OFFER NOTHING rather than guess.** The athlete can still use
 * the free-library search; the app just refuses to pretend it knows what a valid substitute is.
 */
export function getInSlotAlternatives(
  plannedName: string,
  equipment?: string[] | null,
  /**
   * ⛔ WHAT JOB IS THIS ROW DOING? `assistanceRow: true` when the planned row is one of the block's
   * assistance slots — the composer marks those `load_prescribed: false` / `weight: 'By feel'`.
   * Absent → the generic movement-pattern logic, byte-identical to before this option existed.
   */
  opts?: {
    assistanceRow?: boolean;
    /** The day's main lift. On an assistance row it removes what the day already loaded. */
    mainLift?: string | null;
  },
): AlternativeOption[] {
  // ⛔ THE PLAN'S FRAMEWORK OUTRANKS THE LIBRARY — FOR THE ROWS THE PLAN OWNS (2026-07-30).
  // Michael: *"we need to work with the framework of the plan… the accessories we offer in the plan."*
  //
  // A Strength Focus block does not prescribe "a hip-hinge accessory". It prescribes one of three
  // assistance SLOTS, each with a curated shortlist the athlete already chose from at build time.
  // For those rows the right peers are the rest of that slot — not everything in the library that
  // happens to share a movement pattern.
  //
  // ⛔ OPT-IN, VIA THE CALLER, AND THAT IS NOT TIMIDITY. The first cut keyed off the NAME alone and
  // broke five pinned tests, because four menu movements (Pull Up, Push Up, Dumbbell Row, Bulgarian
  // Split Squat) are also ordinary library exercises. A Pull Up prescribed as a main vertical pull and
  // a Pull Up filling the `pull` assistance slot are the same name in two different jobs, and only the
  // ROW knows which. `load_prescribed: false` is how the composer marks an assistance row.
  //
  // ⚠️ `assistancePeersFor` returns null when the exercise is not in the catalog, so an assistance row
  // carrying something off-catalog (an equipment substitution's output) still falls through to the
  // pattern logic below.
  // ⛔ THE PEERS ARE THE MOVEMENT'S OWN CATEGORY, GATED BY KIT — and the day no longer narrows them
  // (D-407). It used to: the block re-roled a slot per day, so a push row on a squat day had to be
  // offered core movements. Nothing is re-roled now — a push row is a push row on all four days — so
  // `mainLift` has nothing to say here and is no longer passed. The category IS the answer.
  const planPeers = opts?.assistanceRow ? assistancePeersFor(plannedName, equipment) : null;
  if (planPeers) {
    // ⛔ TIER ON WENDLER'S OWN ASSISTANCE LINE — supersedes the original "every peer is a DIRECT swap,
    // there is no second tier" (2026-07-30). That held for a single-pattern slot but was FALSE for the
    // leg pool, which carries both of the book's leg camps by design (leg_match answers for both lower
    // days). It labelled a Front Squat a DIRECT swap for a Romanian Deadlift.
    //
    // The grouping is the BOOK's, not a heuristic: 5/3/1 2nd ed., Periodization Bible (p.50-51) splits
    // leg assistance into POSTERIOR (Hamstrings — Leg Curl, GHR; Low Back — Back Raise, Good Morning,
    // Reverse Hyper) vs QUADS (Leg Press, Lunges, Hack Squat, and Front Squat on p.53). `hip_dominant`
    // IS that posterior camp and `knee_dominant` IS Quads, so the movement pattern reproduces Wendler's
    // own line exactly. (Hamstrings and Low Back are two book categories, but the book places the same
    // hip-hinge in both — Good Morning is "Low Back" yet is the stock RDL swap — so posterior-together
    // is the finest split the book actually supports.) The slot still governs WHAT is offered (nothing
    // is dropped); the camp only sorts it: same camp as the planned move → direct, other camp → lighter.
    const selfPattern = getExerciseConfig(plannedName)?.pattern ?? null;
    return planPeers.map((name) => {
      const c = getExerciseConfig(name);
      const samePattern = selfPattern != null && (c?.pattern ?? null) === selfPattern;
      return {
        name,
        same_pattern: true as const,
        equipment: c ? equipmentOf(c) : 'unknown',
        tier: samePattern ? ('direct' as const) : ('lighter' as const),
      };
    });
  }

  const cfg = getExerciseConfig(plannedName);
  // Q-181: filter on PATTERN, not primaryRef. primaryRef is a LOADING reference — a Barbell Row is
  // primaryRef 'bench' ("a row loads at ~80% of your bench"), so filtering on it offered a BENCH PRESS
  // as a substitute for a ROW. A push for a pull. See MovementPattern in exercise-config.ts.
  if (!cfg || !cfg.pattern) return [];

  // Normalize with punctuation → SPACE (not deletion), or 'step ups' becomes 'stepups' and fails to
  // dedupe against 'step ups'.
  const norm = (n: string) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const selfNorm = norm(plannedName);
  // The slot's own tier, resolved once. ⚠️ Off `plannedName`, not off `selfNorm` — the tier reader
  // resolves through `getExerciseConfig`, which does its own folding.
  const slotTier = intensityTierForExercise(plannedName);
  // ⛔ THE TIER GATE IS FOR ACCESSORY SLOTS ONLY, AND THAT IS THE EXISTING ONE-DIRECTIONAL RULE, NOT
  // A NEW CARVE-OUT. The main-lift exclusion below already says it in terms: *"ONE-DIRECTIONAL. A
  // main-lift slot still offers everything it offered before, accessories included — swapping DOWN
  // from a squat to a lunge is a legitimate call the athlete may need."*
  // ⚠️ A FIRST CUT GATED EVERY SLOT AND BROKE THAT. It dropped Squat Jump from a Back Squat's list
  // (`exercise-alternatives.test.ts` pins it as a 'lighter' alternative), which is the app deciding
  // an athlete may not swap down out of a heavy squat — a decision nobody asked for. The audit's
  // finding was about ACCESSORIES offering each other across tiers; main lifts were never in it.
  //
  // ⛔ AND THE EXEMPTION IS `isMain531Lift`, NOT THIS FILE'S `isMainLift`. They answer different
  // questions and only one fits here. `isMainLift` is a UNION — the shared classifier OR membership
  // of any curated family — built to ask *"is this candidate too big to offer INTO an accessory
  // slot"*, so it calls a Romanian Deadlift, a Barbell Row, a Goblet Squat and a Leg Press main
  // lifts. Using it to exempt SLOTS let `barbell row → ytw raise` and `romanian deadlift → clamshell`
  // straight back through. The swap-down allowance belongs to the four lifts the block is built on.
  const slotIsMainLift = isMain531Lift(plannedName);
  // DIRECT = same curated family (Leg Press IS a direct swap for a Back Squat); a same-pattern lift NOT
  // in the family is an ALTERNATIVE (Hip Thrust). If the slot isn't in any family, fall back to a
  // loadable-compound heuristic (a barbell/dumbbell compound is direct; band/bodyweight is lighter).
  const slotFamily = directFamilyOf(selfNorm);
  const selfTight = selfNorm.replace(/ /g, '');
  const seen = new Set<string>([selfNorm, selfTight.endsWith('s') ? selfTight.slice(0, -1) : selfTight]);
  const out: AlternativeOption[] = [];

  for (const [key, c] of Object.entries(EXERCISE_CONFIG)) {
    if (c.pattern !== cfg.pattern) continue;                // different movement pattern → not a substitute

    // The config carries plural ALIASES as separate keys ('reverse lunge' AND 'reverse lunges',
    // 'step up' / 'step ups' / 'step ups'). Offering the same movement three times is noise.
    // Dedupe EXACTLY, not by guessing at plurals: a key is an alias iff dropping its trailing 's'
    // yields ANOTHER REAL KEY. ('bench press' → 'bench pres' is not a key, so it survives — which is
    // why a naive "strip the s" rule would have been wrong.)
    if (key.endsWith('s') && Object.prototype.hasOwnProperty.call(EXERCISE_CONFIG, key.slice(0, -1))) continue;

    // Dedupe on the SINGULARIZED normalized form too. The exact-alias rule above misses hyphenated
    // plurals: 'step ups' → slice off the 's' → 'step up', which is NOT a config key, so it survives —
    // and then normalizes to 'step ups', which does not equal the already-seen 'step up'.
    // Collapse every alias form to ONE option. The config carries 'pull up' / 'pull ups' / 'pullup' /
    // 'pullups' as four separate keys; offering the same movement four times is noise. Dedupe on the
    // normalized form with spaces removed AND singularized, so all four collapse to 'pullup'.
    const k = norm(key);
    const kTight = k.replace(/ /g, '');
    const kKey = kTight.endsWith('s') ? kTight.slice(0, -1) : kTight;
    // Plus: two keys with a BYTE-IDENTICAL config are the same exercise ('dumbbell bench press' /
    // 'db bench press'). Exact, not a guess.
    const cfgKey = JSON.stringify(c);
    if (seen.has(k) || seen.has(kKey) || seen.has(cfgKey)) continue;
    seen.add(k);
    seen.add(kKey);
    seen.add(cfgKey);

    // ⚠️ KNOWN COSMETIC GAP: pure SHORTHAND aliases survive ('Bench' next to 'Bench Press', 'Squat'
    // next to 'Back Squat') because their configs differ only in `notes`. Every option shown is
    // CORRECT — they resolve to the same exercise — it is just a slightly noisy list. Every cleverer
    // rule I tried broke something real ('squat' is a substring of 'front squat', which is NOT an
    // alias of it), so I stopped rather than invent one.

    const need = equipmentOf(c);
    if (!canDo(equipment, need)) continue;                   // they cannot LOAD it
    if (!canSetUp(key, equipment)) continue;                 // they cannot SET IT UP (slice 4)

    // ⛔ AN ACCESSORY SLOT IS NOT OFFERED A MAIN LIFT. If the planned exercise belongs to no curated
    // family it is an accessory, and a deadlift is not a substitute for a glute bridge — same hip-hinge
    // pattern, different job, and roughly triple the load. The field agrees: Trainerize and Fitbod
    // substitute within muscle group AND equivalent intensity, never across load tiers.
    // ⚠️ ONE-DIRECTIONAL. A main-lift slot still offers everything it offered before, accessories
    // included — swapping DOWN from a squat to a lunge is a legitimate call the athlete may need.
    if (!slotFamily && isMainLift(key)) continue;

    // ⛔ THE INTENSITY-TIER GATE (2026-08-03). The generalization of the rule directly above: that one
    // stops a MAIN LIFT reaching an accessory slot, which caught the loudest case and left every other
    // crossing open. A Clamshell is not a main lift, and neither is a Barbell Hip Thrust — so the old
    // gate passed them both and the engine offered one for the other.
    //
    // ⚠️ EXACT MATCH IN BOTH DIRECTIONS. Not "one tier lighter is acceptable": offering a band movement
    // for a barbell lift under-loads a session the plan sized, and offering the barbell lift for the
    // band movement turns a prehab slot into a heavy one nobody programmed. Tiers are `light` (band,
    // isometric, mobility, bodyweight core work), `loaded` (implements, and bodyweight compounds like
    // pull-ups and dips) and `power` (plyometrics) — see `strength-intensity-tier.ts` for why the third
    // exists and why this reads the TYPE axis rather than `role`.
    if (!slotIsMainLift && intensityTierForExercise(key) !== slotTier) continue;

    // DIRECT = same curated family; else same-pattern is an ALTERNATIVE. Ranked heaviest-first per tier.
    const ratio = typeof c.ratio === 'number' ? c.ratio : 0;
    const loadable = need === 'barbell' || need === 'dumbbell';
    const kSingular = k.endsWith('s') ? k.slice(0, -1) : k;
    const tier: AlternativeOption['tier'] = slotFamily
      ? (slotFamily.has(k) || slotFamily.has(kSingular) ? 'direct' : 'lighter')  // curated slot
      : (loadable ? 'direct' : 'lighter');                                        // uncurated fallback
    out.push({ name: titleCase(key), same_pattern: true, equipment: need, tier, _ratio: ratio } as AlternativeOption & { _ratio: number });
  }

  return (out as Array<AlternativeOption & { _ratio: number }>)
    .sort((a, b) => (a.tier !== b.tier ? (a.tier === 'direct' ? -1 : 1) : b._ratio - a._ratio))
    .map(({ _ratio, ...opt }) => opt);
}
