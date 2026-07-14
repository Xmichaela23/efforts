// Strength exercise ROLE classifier (D-208).
//
// Role is a deterministic function of the exercise NAME, so we classify at read-time from a
// curated table rather than persisting a `role` field on every emitted exercise (that would be
// ~425 edit sites across the protocol files; this is one table). The table is built from the
// protocols' KNOWN prescription vocabulary — it is NOT free-text guessing, so it has Option-1
// correctness (declared roles) at the heuristic's blast radius.
//
// WHY ROLE EXISTS: the execution score weights exercise-completion. A skipped prehab/postural
// accessory should ding LESS than a skipped main lift — see ROLE_WEIGHT + D-208.
//
// TRIPWIRE: a name that isn't in the table is the one failure mode (the table drifting out of
// sync with the protocols). On a miss we log LOUDLY and default to 'primary' (full weight) — so
// an unmapped exercise scores exactly as it does today (no silent discount, no free pass), and
// the warning tells us to add it. Never make the default quiet.

export type StrengthRole = 'primary' | 'secondary' | 'accessory';

// D-208: accessory = 0.5 (not 0.0, not 1.0). For a triathlete's strength block, prehab/postural
// accessories are durability insurance, not the primary adaptation driver — a skip is a
// proportionate nudge, not equivalence to dropping a main lift, nor a free pass. 'secondary'
// weights the same as 'primary' today; it's kept as a distinct tier for future granularity and
// for display/microcopy, not because it changes the score.
export const ROLE_WEIGHT: Record<StrengthRole, number> = {
  primary: 1.0,
  secondary: 1.0,
  accessory: 0.5,
};

// Canonicalize an emitted exercise name to a table key: lowercase, strip parenthetical variants
// ("(Light)", "(3-sec descent)"), take the first option of an "X or Y" name, reduce punctuation/
// hyphens/slashes to spaces ("Y/T/W" → "y t w"), and depluralize words (keeping "press"/"ss").
function canonical(name: string): string {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop parenthetical variants
    .split(/\bor\b/)[0]              // "goblet squat or bodyweight squat" → first
    .replace(/[^a-z0-9]+/g, ' ')     // hyphens/slashes/punct → space
    .trim();
  // Depluralize the LAST word only — the plural marker always lands there ("Soleus Raises",
  // "Barbell Rows", "Push-ups"). Depluralizing every word wrongly stripped singular words that
  // end in 's' (soleus→soleu, tibialis→tibiali). "ss" guard keeps "press"; len>2 so "ups"→"up".
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length) {
    const last = parts[parts.length - 1];
    if (last.length > 2 && last.endsWith('s') && !last.endsWith('ss')) parts[parts.length - 1] = last.slice(0, -1);
  }
  return parts.join(' ');
}

// Curated over the actual emitted vocabulary (grep of shared/strength-system/protocols/*.ts).
// Only ACCESSORY changes the score; primary/secondary both weight 1.0. When unsure between
// secondary and accessory, choose SECONDARY (full weight) — never accidentally discount work.
const ROLE_TABLE: Record<string, StrengthRole> = {
  // ── PRIMARY: heavy compound drivers, the adaptation target ──────────────────────────────
  'back squat': 'primary',
  'barbell back squat': 'primary',
  'goblet squat': 'primary',
  'bench press': 'primary',
  'db bench press': 'primary',
  'db floor press': 'primary',
  'conventional deadlift': 'primary',
  'trap bar deadlift': 'primary',
  'romanian deadlift': 'primary',
  'db romanian deadlift': 'primary',
  'overhead press': 'primary',
  'standing barbell overhead press': 'primary',
  'push press': 'primary',
  'db push press': 'primary',
  'db shoulder press': 'primary',
  'shoulder press': 'primary',
  'barbell row': 'primary',
  'lat pull down': 'primary',
  'pull up': 'primary',
  'hip thrust': 'primary',

  // ── SECONDARY: supporting compounds / unilateral / plyo / assistance (full weight, 1.0) ──
  'bulgarian split squat': 'secondary',
  'reverse lunge': 'secondary',
  'lateral lunge': 'secondary',
  'walking lunge': 'secondary',
  'step up': 'secondary',
  'box step up': 'secondary',
  'explosive step up': 'secondary',
  'single leg rdl': 'secondary',
  'bodyweight squat': 'secondary',
  'box jump': 'secondary',
  'broad jump': 'secondary',
  'jump lunge': 'secondary',
  'jump squat': 'secondary',
  'squat jump': 'secondary',
  'skater hop': 'secondary',
  'kb swing': 'secondary',
  'kb db swing': 'secondary',
  'inverted row': 'secondary',
  'inverted ring row': 'secondary',
  'cable row': 'secondary',
  'row': 'secondary',
  'resistance band row': 'secondary',
  'light db row': 'secondary',
  'band assisted pull up': 'secondary',
  'band overhead press': 'secondary',
  'band pull down': 'secondary',
  'explosive lat pull down': 'secondary',
  'push up': 'secondary',
  'pike push up': 'secondary',
  'nordic hamstring curl': 'secondary',

  // ── ACCESSORY: prehab / postural / activation / core / isolation (durability insurance) ──
  'band face pull': 'accessory',
  'cable face pull': 'accessory',
  'face pull': 'accessory',
  'band pull apart': 'accessory',
  'band lateral raise': 'accessory',
  'lateral raise': 'accessory',
  'band lateral walk': 'accessory',
  'lateral band walk': 'accessory',
  'clamshell': 'accessory',
  'glute bridge': 'accessory',
  'single leg glute bridge': 'accessory',
  // Accessory-bias add-on (glute | hyrox) — strength-primary. Keys are canonical() space-forms (hyphens
  // are stripped to spaces, so "Single-Leg Squat" → "single leg squat"). Qualitative-loaded, accessory role.
  // NOTE: bare 'hip thrust' already maps to 'primary' above (line ~75) — looks inconsistent with S-005
  // (hip thrust = required ACCESSORY), but left untouched to avoid changing other protocols' scoring.
  // The glute bias uses the precise 'barbell hip thrust' → accessory. FLAGGED for review.
  'barbell hip thrust': 'accessory',
  'single leg squat': 'accessory',
  'back extension': 'accessory',
  'sled push': 'accessory',
  'sled pull': 'accessory',
  'sandbag lunge': 'accessory',
  'farmers carry': 'accessory',
  // Equipment-fallback names (substituteExerciseForEquipment) for the bias stations — accessory role.
  'dumbbell walking lunge': 'accessory',
  'barbell walking lunge': 'accessory',
  // (bare 'walking lunge' already mapped to 'secondary' above — bodyweight fallback inherits that.)
  'dumbbell row': 'accessory',
  'bent over row': 'accessory',
  'band row': 'accessory',
  'backpack carry': 'accessory',
  'prone y t w raise': 'accessory',
  'external rotation': 'accessory',
  'bird dog': 'accessory',
  'dead bug': 'accessory',
  'pallof press': 'accessory',
  'plank hold': 'accessory',
  'plank with shoulder tap': 'accessory',
  'side plank': 'accessory',
  'side plank abduction': 'accessory',
  'copenhagen plank': 'accessory',
  'core circuit': 'accessory',
  'dead hang': 'accessory',
  'calf raise': 'accessory',
  'single leg calf raise': 'accessory',
  'weighted single leg calf raise': 'accessory',
  'wall angel': 'accessory',
  'soleus raise': 'accessory',
  'tibialis raise': 'accessory',
  'foot doming': 'accessory',
};

/**
 * Classify an exercise by name. Unknown names log LOUDLY and default to 'primary' (full weight =
 * today's behavior) — the tripwire for the table drifting out of sync with the protocols.
 */
export function roleForExercise(name: string): StrengthRole {
  const key = canonical(name);
  const role = ROLE_TABLE[key];
  if (!role) {
    console.warn(
      `[exercise-role] UNMAPPED strength exercise "${name}" (key "${key}") — defaulting to 'primary' (full weight). ` +
        `Add it to ROLE_TABLE in _shared/strength/exercise-role.ts so completion scoring stays correct.`,
    );
    return 'primary';
  }
  return role;
}

export function weightForExercise(name: string): number {
  return ROLE_WEIGHT[roleForExercise(name)];
}
