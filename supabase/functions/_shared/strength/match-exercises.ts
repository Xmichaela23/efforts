/**
 * THE planned↔executed matcher for strength. One source. (Q-181.)
 *
 * Extracted out of `analyze-strength-workout/index.ts` on 2026-07-14 so it can be pin-tested.
 * **This is the core of every strength execution score.** Do not write a second matcher.
 *
 * ── THE RULE (Q-181) ──────────────────────────────────────────────────────────────────────────
 *   THE SLOT IS THE UNIT OF ADHERENCE, NOT THE EXERCISE NAME.
 *
 *   A DECLARED swap is not a skip. An exercise that simply DIDN'T HAPPEN still is.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY. Matching was BY NAME ONLY (exact, then a fuzzy `includes()`), and no substitution concept
 * existed anywhere in the codebase. So an honest swap — hip thrust instead of the planned Bulgarian
 * split squat — was read as TWO separate failures:
 *
 *   the planned lift   -> matched:false  -> a SKIP, dragging the 30%-weighted exercise-completion term
 *   the work he DID    -> planned:null   -> dropped from the denominator. ZERO CREDIT.
 *
 * Penalised for what he didn't do, and unpaid for what he did. The app could not tell a substitution
 * from a skip BECAUSE NOBODY EVER TOLD IT.
 *
 * FIELD STANDARD (researched 2026-07-14; see docs/SPEC-exercise-substitution.md §2): no commercial
 * strength app treats the EXERCISE as the unit of adherence — they treat the SLOT (the movement pattern
 * the program prescribed). ABC Trainerize's substitution filters are literally "Same muscle group /
 * Same Equipment / Same movement". Fitbod auto-substitutes same-muscle at equivalent intensity. RP
 * Hypertrophy swaps mid-cycle from a library. Built with Science swaps "while keeping the plan
 * structurally sound." **Swap within the slot and NOTHING WAS MISSED — so no app docks you for it.**
 *
 * THE DECLARATION IS WHAT MAKES IT A SWAP. `substituted_for` is written by the athlete's Swap action
 * (mirroring the `prefilled` / `rir_autofilled` / `from_previous` provenance pattern: a flag that
 * records HOW WE KNOW, stamped at the point of truth).
 *
 * ── ⛔ SUPERSEDED IN PART, 2026-08-02 (D-370). READ THIS BEFORE TRUSTING THE PARAGRAPH ABOVE. ──
 *
 * Q-181 also wrote: *"We never INFER a substitution — if the athlete just logs a different exercise
 * with no declaration, that is an unplanned exercise PLUS a skip."* **That is no longer true for
 * ASSISTANCE SLOTS.** It remains true, unchanged and guarded, for everything else.
 *
 * WHY THE REVERSAL IS SAFE NOW, AND WOULD NOT HAVE BEEN THEN. The stated fear was *"a score that
 * lies in the athlete's FAVOUR"* — forgiving a skip inflating the execution score. **D-338 deleted
 * the strength execution score.** No strength surface grades a session any more; what is left is a
 * count ("Completed 4 of 4") and a row label. The thing the law protected no longer exists.
 *
 * WHY ASSISTANCE IS DIFFERENT FROM A MAIN LIFT. A main lift is prescribed BY NAME at a percentage of
 * a training max — a skipped bench is a skipped bench, and Tier 3 below must never touch it. An
 * assistance slot is prescribed as a CATEGORY WITH A MENU: Wendler writes it as *"Lats, Upper Back,
 * Triceps — 5 sets of 10-20 reps (DB rows, Bent Over Rows, Chins, T-bar Rows, Lat Pulldowns, Face
 * Pulls, Shrugs)"* (2nd ed. p50-51). Filling that slot with a movement off the menu IS the
 * prescription, not a deviation from it. Michael, 2026-08-02: *"if its not an apples to apples swap
 * we should flag it — credit it."*
 *
 * FIELD STANDARD (re-checked 2026-08-02): every app credits the swap and none of them flag a bad
 * one. Boostcamp carries the working weights and rep targets straight over to the substitute;
 * Hevy/TrainHeroic/Juggernaut all replace-and-continue. TrainHeroic's own writeup names the gap —
 * athletes improvising *"sometimes choose movements that don't match the original training goal"* —
 * and answers it with coach-preselected alternatives, not with a warning. **Crediting is the field.
 * The flag is the part the field does not do**, and `substitution-note.ts` already writes it.
 *
 * ⚠️ THE FLAG IS NOT BUILT HERE. `buildSubstitutionNote` already compares MOVEMENT PATTERN and emits
 * the honest sentence, and it has done since Q-181 slice 3 — it was simply never reached, because
 * nothing ever produced an undeclared swap for it to describe. This tier feeds it. Do not write a
 * second pattern comparison.
 */

import { sharesMovementFamily } from '../../../../src/lib/exercise-config.ts';
import { isMain531Lift } from '../../../../src/lib/exercise-role.ts';
import { isAssistanceSlot } from '../../../../src/lib/assistance-slot.ts';

export interface MatchableExercise {
  name?: string;
  /** Q-181: set by the athlete's Swap action — the PLANNED exercise name this replaces. */
  substituted_for?: string | null;
  [k: string]: unknown;
}

export interface ExerciseMatch {
  name: string;
  planned: unknown | null;
  executed: unknown | null;
  matched: boolean;
  /** Q-181: true when this match exists only because the athlete DECLARED a swap. */
  substituted?: boolean;
  /** Q-181: what the athlete actually did, when it differs from the planned name. */
  substituted_with?: string;
  /**
   * D-370: true when the swap was INFERRED (assistance slot, nothing declared) rather than declared
   * by the athlete's Swap action. Downstream may want to speak more softly about a pairing the
   * athlete never confirmed — the app decided this, they did not say it.
   * ⚠️ Absent on a DECLARED swap, so `substituted && !inferred` reads "they told us".
   */
  inferred?: boolean;
}

/** Normalize exercise names for matching. Strips punctuation, so "Farmer's Carry" === "Farmers Carry". */
export function normalizeExerciseName(name: string): string {
  return String(name || '').toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(curls?|curl)\b/gi, 'curl')
    .replace(/\b(squats?|squat)\b/gi, 'squat')
    .replace(/\b(deadlifts?|deadlift)\b/gi, 'deadlift')
    .replace(/\b(nordic\s*curl|nordic)\b/gi, 'nordic curl');
}

/** Flat planned shape → the nested {sets: []} shape the executed side uses. */
export function normalizePlannedExercise(planned: any): any {
  if (Array.isArray(planned?.sets)) return planned;

  const numSets = typeof planned?.sets === 'number' ? planned.sets : 0;
  // D-322: parse, don't pass through. A rep RANGE ("5-8") would otherwise land in
  // LoggedSet.reps as a STRING and leak a non-numeric into every downstream consumer.
  const reps = typeof planned?.reps === 'number'
    ? planned.reps
    : (Number.parseInt(String(planned?.reps ?? ''), 10) || 0);
  const weight = typeof planned?.weight === 'number' ? planned.weight : 0;
  const durationSeconds = planned?.duration_seconds || null;
  const rir = planned?.rir || null;

  const sets = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({ reps, weight, duration_seconds: durationSeconds, rir, completed: false });
  }
  return { ...planned, sets };
}

export function matchExercises(
  plannedExercises: any[],
  executedExercises: any[],
): ExerciseMatch[] {
  const planned = Array.isArray(plannedExercises) ? plannedExercises : [];
  const executed = Array.isArray(executedExercises) ? executedExercises : [];
  const matches: ExerciseMatch[] = [];
  const consumed = new Set<unknown>();
  // D-370: planned rows that finished the name tiers with nothing on them, held by reference so
  // Tier 3 can fill them IN PLACE. Emitting the skip immediately (as this loop used to) would fix
  // the output order before the inference had run, and re-ordering the array afterwards would move
  // rows around on screen for no reason the athlete can see.
  const unclaimed: Array<{ p: any; match: ExerciseMatch }> = [];

  for (const p of planned) {
    const normalizedPlanned = normalizePlannedExercise(p);
    const plannedName = normalizeExerciseName(p?.name);

    // ── Q-181, TIER 0: A DECLARED SWAP WINS OVER EVERYTHING ─────────────────────────────────────
    // Checked BEFORE the name match, on purpose. The athlete told us what this replaces; that is the
    // strongest signal available and it outranks any string heuristic.
    let exec = executed.find((e) =>
      !consumed.has(e) &&
      e?.substituted_for &&
      normalizeExerciseName(String(e.substituted_for)) === plannedName
    );
    if (exec) {
      consumed.add(exec);
      matches.push({
        name: p?.name,
        planned: normalizedPlanned,
        executed: exec,
        matched: true,          // NOT a skip. The slot was filled.
        substituted: true,
        substituted_with: String(exec?.name ?? ''),
      });
      continue;
    }

    // Tier 1: exact name.
    exec = executed.find((e) => !consumed.has(e) && normalizeExerciseName(e?.name) === plannedName);

    // Tier 2: fuzzy contains (legacy behaviour — preserved).
    if (!exec) {
      exec = executed.find((e) => {
        if (consumed.has(e)) return false;
        const en = normalizeExerciseName(e?.name);
        return !!en && !!plannedName && (en.includes(plannedName) || plannedName.includes(en));
      });
    }

    if (exec) {
      consumed.add(exec);
      matches.push({ name: p?.name, planned: normalizedPlanned, executed: exec, matched: true });
    } else {
      // ⛔ THE GUARD, NARROWED BUT NOT WEAKENED (D-370). An exercise that simply did not happen is
      // STILL A SKIP — for every MAIN LIFT and for every planned row that is not an assistance slot.
      // Tier 3 below may claim this row only if the plan itself declined to prescribe its load.
      const match: ExerciseMatch = { name: p?.name, planned: normalizedPlanned, executed: null, matched: false };
      matches.push(match);
      unclaimed.push({ p, match });
    }
  }

  // ── D-370, TIER 3: AN UNDECLARED SWAP INTO AN ASSISTANCE SLOT ───────────────────────────────
  //
  // Runs LAST, on leftovers only: every declared swap and every name match above has already taken
  // what it was owed, so this can never steal a row from a stronger signal.
  //
  // ⛔ THE GATE IS `isAssistanceSlot`, AND IT IS THE WHOLE SAFETY ARGUMENT. It answers on the
  // composer's marker (`load_prescribed: false`) or, for plans materialized before that marker was
  // plumbed through, on the composer's own authored shape. The four main lifts satisfy neither.
  //
  // ⛔ IT IS SHARED WITH THE CLIENT ON PURPOSE (`src/lib/assistance-slot.ts`). This gate decides
  // whether work the athlete did gets credited; the session screen decides whether to print the
  // slot's rep total. Two private copies of that question would drift, and the drift would read as
  // "the app credited it but won't say what it was for."
  // ⚠️ A MAIN LIFT MAY NEVER FILL AN ASSISTANCE SLOT. Logging a heavy squat does not discharge the
  // single-leg slot, and crediting it there would hide a skipped accessory behind the day's big
  // lift. `isMain531Lift` misses to FALSE on an unmapped name, which is the permissive direction —
  // acceptable here because the stake is one assistance row's label, not a load or a verdict.
  const claimable = () =>
    executed.filter((e) => !consumed.has(e) && !isMain531Lift(String(e?.name ?? '')));

  const claim = (entry: { p: any; match: ExerciseMatch }, exec: any) => {
    consumed.add(exec);
    entry.match.executed = exec;
    entry.match.matched = true;       // the slot was filled — no dock, exactly as a declared swap
    entry.match.substituted = true;
    entry.match.substituted_with = String(exec?.name ?? '');
    entry.match.inferred = true;      // …but the app decided this, the athlete did not say it
  };

  // PASS A — same movement family first. A pull for a pull is the field's own definition of a valid
  // substitute, so these pairings are claimed before anything else can take the exercise. Doing it
  // in two passes (rather than one loop that takes whatever is left) is what stops an earlier slot
  // grabbing the exercise that was obviously the later slot's.
  for (const entry of unclaimed) {
    if (!isAssistanceSlot(entry.p)) continue;
    const exec = claimable().find((e) => sharesMovementFamily(String(entry.p?.name ?? ''), String(e?.name ?? '')));
    if (exec) claim(entry, exec);
  }

  // PASS B — anything still unpaired. Michael, 2026-08-02: *"if its not an apples to apples swap we
  // should flag it — credit it."* The work happened; the slot has work in it; the athlete is not
  // docked for choosing differently. `buildSubstitutionNote` compares the two patterns downstream
  // and speaks the one honest sentence when they differ.
  // ⚠️ NOTHING HERE DECIDES WHETHER THE TRADE WAS GOOD. This tier answers "did the slot get work",
  // and that is all it is allowed to answer.
  for (const entry of unclaimed) {
    if (entry.match.matched) continue;
    if (!isAssistanceSlot(entry.p)) continue;
    const exec = claimable()[0];
    if (exec) claim(entry, exec);
  }

  // Executed exercises that answered to nothing planned → genuinely unplanned extra work.
  for (const e of executed) {
    if (consumed.has(e)) continue;
    matches.push({ name: String(e?.name ?? ''), planned: null, executed: e, matched: false });
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ATTACH GATE — "do these two sessions describe the same work at all?"
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THIS IS NOT A SECOND MATCHER, and the distinction is the whole reason it sits in this file
// rather than in a new one. `matchExercises` above answers *"which planned slot did each logged
// exercise fill"* for a pair we already know belong together. This answers *"do they belong
// together"* — the question `auto-attach-planned` was never asking. Its strength branch matched on
// **date + type alone** (no exercise check, no load check, not even the session name), so
// activating a backdated plan glued months of unrelated sessions onto planned days.
// See `docs/AUDIT-performance-state-2026-07-29.md` F1.
//
// ⚠️ THE VOCABULARY IS `canonicalize`, DELIBERATELY. Those are the same keys `exercise_log` and the
// State trend group on, so "shares a main lift" means HERE exactly what it means on the State
// screen — instead of becoming a sixth private notion of exercise identity (audit F5).
//
// ── THE RULE, AND IT FAILS OPEN ────────────────────────────────────────────────────────────────
//   · Either side carries no exercise list → SHARE. A Garmin/Strava strength import has no
//     exercises on it; we cannot judge what we cannot see, so we must not start declining it.
//     Today's behaviour stands for every one of those.
//   · The planned day names an ANCHOR lift → require one of THOSE to have been done. A 5/3/1
//     Bench day and a Press day carry the SAME assistance block, so "any exercise in common"
//     would wave through anything from the same block.
//   · No anchor planned (an accessory-only day) → require any one exercise in common.
//
// ⚠️ A DECLINE IS NOT A JUDGEMENT ON THE ATHLETE — it means *attach this one by hand.* The manual
// attach path is untouched. And logging FROM a planned session never reaches this gate at all: the
// logger writes `planned_id` itself (`StrengthLogger.tsx:3790`), so auto-attach takes its
// sync-existing-link branch and never runs the heuristic.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { canonicalize, bigAnchorLift } from '../canonicalize.ts';

/** Tolerant read of a `strength_exercises` column: already an array, or JSON in a string. */
export function parseExerciseList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export interface SessionShareResult {
  /** True = these two may be linked. FAILS OPEN — see the header. */
  share: boolean;
  /** WHY, enumerated (never free text) so the attach response carries a readable receipt. */
  basis: 'no_planned_exercises' | 'no_logged_exercises' | 'anchor' | 'any_exercise';
  /** The canonical keys present on BOTH sides (anchors only, when the basis is 'anchor'). */
  shared: string[];
  /** The anchor lifts the PLANNED day asked for — the receipt for a decline. */
  planned_anchors: string[];
}

export function strengthSessionsShareTheWork(
  plannedExercises: unknown,
  executedExercises: unknown,
): SessionShareResult {
  const canonSet = (list: any[], honourDeclaredSwaps = false): Set<string> => {
    const out = new Set<string>();
    for (const ex of list) {
      const name = String((ex as any)?.name ?? '').trim();
      if (name) out.add(canonicalize(name));
      // ⛔ A DECLARED SWAP FILLS THE SLOT — the same law Tier 0 of `matchExercises` runs on
      // (Q-181: the slot is the unit of adherence, not the name). Trap-bar instead of the
      // prescribed deadlift is a different canonical key and BOTH are anchors, so without this
      // the gate would decline an honest, declared substitution of the main lift. The athlete
      // told us what it replaces; that outranks any string comparison.
      if (honourDeclaredSwaps) {
        const forName = String((ex as any)?.substituted_for ?? '').trim();
        if (forName) out.add(canonicalize(forName));
      }
    }
    return out;
  };

  const planned = canonSet(parseExerciseList(plannedExercises));
  const executed = canonSet(parseExerciseList(executedExercises), true);

  if (planned.size === 0) return { share: true, basis: 'no_planned_exercises', shared: [], planned_anchors: [] };
  if (executed.size === 0) return { share: true, basis: 'no_logged_exercises', shared: [], planned_anchors: [] };

  const shared = [...planned].filter((k) => executed.has(k));
  const plannedAnchors = [...planned].filter((k) => bigAnchorLift(k) != null);

  if (plannedAnchors.length > 0) {
    const sharedAnchors = shared.filter((k) => bigAnchorLift(k) != null);
    return { share: sharedAnchors.length > 0, basis: 'anchor', shared: sharedAnchors, planned_anchors: plannedAnchors };
  }

  return { share: shared.length > 0, basis: 'any_exercise', shared, planned_anchors: [] };
}
