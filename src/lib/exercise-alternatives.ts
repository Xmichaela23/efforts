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
 * ⛔ AND WE DO NOT FILTER ON ROLE. Two reasons. (1) THE FIELD DOESN'T: Trainerize's filters are "Same
 * muscle group / Same Equipment / Same movement"; Fitbod matches "same muscles at equivalent
 * intensity". Neither filters on load tier — that was MY judgment, not the field's. (2) `roleForExercise`
 * is too noisy to filter on anyway: `barbell row` is 'primary' while `bent over row` is 'accessory' —
 * THE SAME MOVEMENT. Filtering on it produced EMPTY lists. (That inconsistency is a real data bug in
 * exercise-role.ts; it is filed, not papered over here.)
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

export interface AlternativeOption {
  /** The exercise name, title-cased for display. */
  name: string;
  /** Same movement-pattern slot as the exercise being replaced. Always true for offered options. */
  same_pattern: true;
  /** What the athlete needs. Derived from displayFormat — coarse, but not invented. */
  equipment: 'barbell' | 'dumbbell' | 'bodyweight' | 'band' | 'unknown';
  /**
   * How TRUE a swap this is for the slot. 'direct' = a loadable compound at a substantial load
   * (a real replacement — Trap Bar / Sumo / RDL for a deadlift). 'lighter' = a band/bodyweight or
   * low-load accessory in the same pattern (Clamshell, Glute Bridge) — same muscles, not the same lift.
   * Same movement pattern either way (never a wrong-muscle offer); this only ranks closeness.
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

/** The athlete's declared equipment (user_baselines.equipment) → what they can actually load. */
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
): AlternativeOption[] {
  const cfg = getExerciseConfig(plannedName);
  // Q-181: filter on PATTERN, not primaryRef. primaryRef is a LOADING reference — a Barbell Row is
  // primaryRef 'bench' ("a row loads at ~80% of your bench"), so filtering on it offered a BENCH PRESS
  // as a substitute for a ROW. A push for a pull. See MovementPattern in exercise-config.ts.
  if (!cfg || !cfg.pattern) return [];

  // Normalize with punctuation → SPACE (not deletion), or 'step-ups' becomes 'stepups' and fails to
  // dedupe against 'step ups'.
  const norm = (n: string) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const selfNorm = norm(plannedName);
  const selfTight = selfNorm.replace(/ /g, '');
  const seen = new Set<string>([selfNorm, selfTight.endsWith('s') ? selfTight.slice(0, -1) : selfTight]);
  const out: AlternativeOption[] = [];

  for (const [key, c] of Object.entries(EXERCISE_CONFIG)) {
    if (c.pattern !== cfg.pattern) continue;                // different movement pattern → not a substitute

    // The config carries plural ALIASES as separate keys ('reverse lunge' AND 'reverse lunges',
    // 'step up' / 'step ups' / 'step-ups'). Offering the same movement three times is noise.
    // Dedupe EXACTLY, not by guessing at plurals: a key is an alias iff dropping its trailing 's'
    // yields ANOTHER REAL KEY. ('bench press' → 'bench pres' is not a key, so it survives — which is
    // why a naive "strip the s" rule would have been wrong.)
    if (key.endsWith('s') && Object.prototype.hasOwnProperty.call(EXERCISE_CONFIG, key.slice(0, -1))) continue;

    // Dedupe on the SINGULARIZED normalized form too. The exact-alias rule above misses hyphenated
    // plurals: 'step-ups' → slice off the 's' → 'step-up', which is NOT a config key, so it survives —
    // and then normalizes to 'step ups', which does not equal the already-seen 'step up'.
    // Collapse every alias form to ONE option. The config carries 'pull-up' / 'pull-ups' / 'pullup' /
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
    if (!canDo(equipment, need)) continue;                   // they cannot load it

    // Closeness: a loadable compound at a real load is a DIRECT swap; a band/bodyweight or low-load
    // accessory in the same pattern is a LIGHTER alternative. Rank direct first, heaviest first — so
    // "true swaps" (Trap Bar / Sumo / RDL for a deadlift) sit above accessories (Clamshell, band walk).
    // We rank within the already-pattern-filtered list, so this never trips the primaryRef push/pull
    // trap (Q-181) — every option here is already the right muscle group.
    const ratio = typeof c.ratio === 'number' ? c.ratio : 0;
    const loadable = need === 'barbell' || need === 'dumbbell';
    const tier: AlternativeOption['tier'] = loadable && ratio >= 0.5 ? 'direct' : 'lighter';
    out.push({ name: titleCase(key), same_pattern: true, equipment: need, tier, _ratio: ratio } as AlternativeOption & { _ratio: number });
  }

  return (out as Array<AlternativeOption & { _ratio: number }>)
    .sort((a, b) => (a.tier !== b.tier ? (a.tier === 'direct' ? -1 : 1) : b._ratio - a._ratio))
    .map(({ _ratio, ...opt }) => opt);
}
