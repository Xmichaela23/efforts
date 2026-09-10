/**
 * HOW LONG THE REST COUNTDOWN RUNS AFTER A SET — the server's answer, stamped on every planned row.
 *
 * ⛔ MOVED TO THE SERVER (2026-09-10, audit H-S07, Stage 3 item 21) — was `src/lib/strength-rest-timer.ts`,
 * and before that inline in `StrengthLogger.tsx`. The phone ran this rule itself on every set, from the
 * name and the rep count it happened to hold. Now the composer stamps `rest_seconds` on each row it
 * writes, materialize-plan carries it (or stamps it on rows no composer wrote), and the logger's
 * countdown prints the row's number. A row with no number gets no countdown.
 * ⛔ SHARED = DEPLOY TRAP: grep -rl "strength/rest-seconds" supabase/functions
 *
 * ⚠️ THE NUMBERS AND THE BRANCH ORDER ARE UNCHANGED — the rule below is the phone's, moved as it was.
 *
 * ⛔ THE MAIN-LIFT TEST IS THE SHARED ONE (`MAIN_BARBELL_LIFTS`, via `isMainBarbellLift`). The logger once
 * carried a private `isMainCompound` regex that missed Push Press and Military Press (they rested like
 * accessories) and excluded Sumo Deadlift; that copy is gone.
 *
 * ⚠️ THE PLYO TEST IS STILL A PRIVATE REGEX, transcribed byte-for-byte. `typeForExercise` would call
 * "Explosive Step Up" a loaded accessory, which this regex calls plyometric — changing that is a
 * separate behaviour change and is not made here.
 */
import { isMainBarbellLift } from '../../../../src/lib/exercise-role.ts';
import { REST_BETWEEN_SETS_RULE, REST_BETWEEN_SETS_RULE_HYP } from '../strength-grid/intents.ts';

/**
 * Plyometric / explosive movement — needs full neural recovery between sets.
 * ⚠️ `skip|shuffle|ladder drill|stiff-legged` were added 2026-08-24 for Viada's named drills (p227), whose
 * own rule is *"ample rest"* and stopping on movement quality. This one only lowercases, so hyphens
 * survive and the stems are spelt with them.
 * ⚠️ The logger still imports this through `src/lib/strength-rest-timer.ts` to decide how a plyo row is
 * DRAWN. That is display, not rest.
 */
export const isPlyometricMovement = (exerciseName: string): boolean => {
  const name = String(exerciseName || '').toLowerCase();
  return /jump|bound|hop|box jump|bench jump|broad jump|depth jump|squat jump|tuck jump|split jump|plyo|skip|shuffle|ladder drill|stiff-legged|explosive/.test(name);
};

/**
 * ⛔ THE HEAVY MAIN-LIFT REST IS 3 MINUTES (2026-08-03, raised from 150s). Source: the NSCA prescribes
 * 2-5 min between sets for strength/power, and the phosphagen system that fuels a set of 3-5 is only
 * ~85% resynthesised at two minutes and effectively complete around three.
 * ⚠️ ONLY THE 3-5 REP MAIN CASE. The 6-8 band stays 120s, plyometrics 150s, accessories unchanged.
 */
export const HEAVY_MAIN_REST_SEC = 180;
// OURS — a warm-up set is not the work, so it does not take the work's rest (Michael, 2026-09-07:
// three minutes after the empty bar). Strong and Hevy run their warm-up sets on a short timer.
// docs/STATE-SOURCES.md has the row.
export const WARMUP_REST_SEC = 60;

/**
 * ⛔ WHAT THE SLOT IS, NOT JUST WHAT THE MOVEMENT IS (2026-08-27). A max-effort pull-up used to rest 90s
 * (not a main barbell lift) while a max-effort bench rested 180s, and a speed bench at 2-4 reps took the
 * heavy answer. The slot intent now outranks the name and the rep count.
 *
 * ⛔ THE RULE IS SOURCED, THE MINUTES ARE NOT. Viada p78 ("Rest Periods") is {@link REST_BETWEEN_SETS_RULE};
 * p84's opposite rule for hypertrophy is {@link REST_BETWEEN_SETS_RULE_HYP}. He gives no minutes anywhere:
 * every number in {@link REST_BY_SLOT} is OURS ({@link REST_MINUTES_ARE_OURS}).
 */
export type RestBucket = 'heavy' | 'speed' | 'muscle';

/**
 * ⛔ FOUR INTENTS, THREE BUCKETS — Michael's call, 2026-08-27. `SKILL` rides with `DE` because p218 gives
 * both the same fatigue instruction (*"fatigue is discouraged"*, *"ample rest"*) at loads well under maximal.
 */
export function restBucketForIntent(intent: string | null | undefined): RestBucket | null {
  switch (String(intent ?? '').toUpperCase()) {
    case 'ME': return 'heavy';
    case 'DE': case 'SKILL': return 'speed';
    case 'HYP': return 'muscle';
    default: return null;
  }
}

/**
 * ⛔ OURS, EVERY ONE:
 *   · **heavy — 180s.** NSCA 2-5 min for strength/power plus phosphagen resynthesis; the same number and
 *     argument as {@link HEAVY_MAIN_REST_SEC}.
 *   · **speed — 120s.** The bottom of the NSCA's 2-5 min power band: a light fast set reaches p78's
 *     "nearly full recovery" sooner than a heavy one. ⚠️ Not the 45-60s of Westside dynamic-effort work,
 *     which p78 rules out for this purpose.
 *   · **muscle — 90s.** The top of the NSCA's 30-90s hypertrophy band; p84 says the drop-off in capacity
 *     is part of the stimulus here.
 */
export const REST_BY_SLOT: Record<RestBucket, number> = {
  heavy: 180,
  speed: 120,
  muscle: 90,
};

/** ⛔ The rule is his; the minutes are not. Recorded here and in docs/STATE-SOURCES.md, not on the screen. */
export const REST_MINUTES_ARE_OURS =
  'The rule is the source\'s; the minutes are ours. He gives no rest interval anywhere in the book.';

/**
 * The line that belongs beside the countdown for a slot. ⛔ IMPORTED, NEVER REWORDED — one owner, in
 * `strength-grid/intents.ts`, so the plan's notes and the timer cannot drift apart.
 */
export function restCueForBucket(bucket: RestBucket): string {
  return bucket === 'muscle' ? REST_BETWEEN_SETS_RULE_HYP.cue : REST_BETWEEN_SETS_RULE.cue;
}

/**
 * Rest in SECONDS for one set.
 *
 * ⚠️ `slotIntent` IS THE STANDING PLAN'S ONLY, AND ITS ABSENCE CHANGES NOTHING — a row with no plan
 * intent falls through to the ladder below. ⛔ THAT LADDER — 150 / 120 / 90 / 75 / 60 — HAS NO STATED
 * BASIS and is OURS ({@link LEGACY_LADDER_IS_OURS}).
 */
export function restSecondsFor(
  exerciseName: string,
  reps: number | undefined,
  slotIntent?: string | null,
): number {
  const bucket = restBucketForIntent(slotIntent);
  if (bucket) return REST_BY_SLOT[bucket];

  if (!reps || reps === 0) return 90; // OURS — the no-rep-count default

  // Plyometrics: OURS — 2:30 for neural recovery.
  if (isPlyometricMovement(exerciseName)) return 150;

  if (isMainBarbellLift(exerciseName)) {
    if (reps >= 3 && reps <= 5) return HEAVY_MAIN_REST_SEC;
    if (reps >= 6 && reps <= 8) return 120; // OURS
    return 120; // OURS — main lifts outside the bands
  }

  // Accessories — OURS: 6-9 reps 90s, 10-14 75s, 15+ 60s, anything else 90s.
  if (reps >= 6 && reps < 10) return 90;
  if (reps >= 10 && reps < 15) return 75;
  if (reps >= 15) return 60;
  return 90;
}

/**
 * ⛔ THE UNSOURCED LADDER, NAMED (2026-08-27). Only the 180s heavy case and the main-versus-accessory
 * split (D-380) ever had a basis. The rest is OURS and still runs, on purpose: nobody has reported a
 * problem with it, and changing a number on no evidence is worse than leaving one that works.
 */
export const LEGACY_LADDER_IS_OURS =
  'Rest on a session with no plan intent is ours and has no stated source: three minutes for a heavy '
  + 'main lift, two for a main lift in the middle bands, two and a half for plyometrics, and ninety '
  + 'down to sixty seconds for accessories as the reps climb. Only the three-minute case is argued '
  + 'anywhere.';

/** The rest fields a planned row carries. Absent keys mean "no number". */
export type RestFields = {
  /** Seconds after a work set. */
  rest_seconds: number;
  /** Seconds after a warm-up set. Present only when the row's `set_plan` has a warm-up set. */
  warmup_rest_seconds?: number;
  /** The sentence beside the countdown. Present only when the row declares a slot intent. */
  rest_cue?: string;
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The rep count the rest rule reads for a row: the first work set's own reps in `set_plan`, else the
 * leading number of `reps` ("8-10" → 8, "20/side" → 20, "5+" → 5). The logger read the same leading
 * number when it ran this rule itself.
 */
function workRepsOf(row: Record<string, unknown>): number | undefined {
  const plan = Array.isArray(row?.set_plan) ? row.set_plan as Array<Record<string, unknown>> : [];
  const firstWork = plan.find((s) => s?.warmup !== true);
  const own = positive(firstWork?.reps);
  if (own != null && firstWork?.amrap !== true) return Math.round(own);
  const raw = row?.reps;
  if (typeof raw === 'number' && raw > 0) return Math.round(raw);
  const m = typeof raw === 'string' ? raw.trim().match(/^(\d+)/) : null;
  return m ? parseInt(m[1], 10) : undefined;
}

/**
 * ⛔ THE ROW'S REST FIELDS — the composer calls this on every row it writes, and materialize-plan calls
 * it on every strength step so rows no composer wrote get the same numbers.
 * ⚠️ A NUMBER ALREADY ON THE ROW WINS. Materialize passes the composer's stamp through rather than
 * deciding again.
 */
export function restFieldsForRow(row: Record<string, unknown>): RestFields {
  const intent = typeof row?.slot_intent === 'string' ? row.slot_intent : null;
  const name = String(row?.name ?? '');
  const out: RestFields = {
    rest_seconds: positive(row?.rest_seconds) ?? restSecondsFor(name, workRepsOf(row), intent),
  };
  const plan = Array.isArray(row?.set_plan) ? row.set_plan as Array<Record<string, unknown>> : [];
  if (plan.some((s) => s?.warmup === true)) {
    out.warmup_rest_seconds = positive(row?.warmup_rest_seconds) ?? WARMUP_REST_SEC;
  }
  const bucket = restBucketForIntent(intent);
  const cue = typeof row?.rest_cue === 'string' && row.rest_cue.trim()
    ? row.rest_cue
    : (bucket ? restCueForBucket(bucket) : null);
  if (cue) out.rest_cue = cue;
  return out;
}
