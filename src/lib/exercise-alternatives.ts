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
 * ⛔ NO NEW TAXONOMY. `primaryRef` in `exercise-config.ts` IS the movement-pattern slot — ~135
 * research-cited entries (NSCA, Schoenfeld, Helms, Contreras), already driving every accessory's load.
 * We filter on it. We do not invent a second one.
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
import { roleForExercise } from './exercise-role.ts';

export interface AlternativeOption {
  /** The exercise name, title-cased for display. */
  name: string;
  /** Same movement-pattern slot as the exercise being replaced. Always true for offered options. */
  same_pattern: true;
  /** What the athlete needs. Derived from displayFormat — coarse, but not invented. */
  equipment: 'barbell' | 'dumbbell' | 'bodyweight' | 'band' | 'unknown';
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
  if (!cfg || !cfg.primaryRef) return [];

  // Normalize with punctuation → SPACE (not deletion), or 'step-ups' becomes 'stepups' and fails to
  // dedupe against 'step ups'.
  const norm = (n: string) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const plannedRole = roleForExercise(plannedName);
  const seen = new Set<string>([norm(plannedName)]);
  const out: AlternativeOption[] = [];

  for (const [key, c] of Object.entries(EXERCISE_CONFIG)) {
    if (c.primaryRef !== cfg.primaryRef) continue;          // different slot → not a substitute

    // SAME ROLE TIER. Without this, an accessory (Bulgarian Split Squat) was offered the PRIMARY
    // compound (Squat / Back Squat) as a "substitute" — a 3×8 accessory swapped for the main lift is
    // not a substitution, it is a different session. The field constrains substitutes to the same
    // slot AND the same job. (roleForExercise / ROLE_WEIGHT, D-208.)
    if (roleForExercise(key) !== plannedRole) continue;

    // The config carries plural ALIASES as separate keys ('reverse lunge' AND 'reverse lunges',
    // 'step up' / 'step ups' / 'step-ups'). Offering the same movement three times is noise.
    // Dedupe EXACTLY, not by guessing at plurals: a key is an alias iff dropping its trailing 's'
    // yields ANOTHER REAL KEY. ('bench press' → 'bench pres' is not a key, so it survives — which is
    // why a naive "strip the s" rule would have been wrong.)
    if (key.endsWith('s') && Object.prototype.hasOwnProperty.call(EXERCISE_CONFIG, key.slice(0, -1))) continue;

    // Dedupe on the SINGULARIZED normalized form too. The exact-alias rule above misses hyphenated
    // plurals: 'step-ups' → slice off the 's' → 'step-up', which is NOT a config key, so it survives —
    // and then normalizes to 'step ups', which does not equal the already-seen 'step up'.
    const k = norm(key);
    const kSingular = k.endsWith('s') ? k.slice(0, -1) : k;
    if (seen.has(k) || seen.has(kSingular)) continue;
    seen.add(k);
    seen.add(kSingular);

    const need = equipmentOf(c);
    if (!canDo(equipment, need)) continue;                   // they cannot load it

    out.push({ name: titleCase(key), same_pattern: true, equipment: need });
  }

  return out;
}
