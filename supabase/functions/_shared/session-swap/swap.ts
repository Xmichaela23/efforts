// =============================================================================
// session-discipline-swap — run ↔ ride ↔ swim, at ONE shared layer
// =============================================================================
//
// ⛔ MOVED TO THE SERVER (2026-09-10, audit H-T15). This file was `src/lib/session-discipline-swap.ts`.
// `swap-session` runs it: which swaps a planned session offers, and what each writes (with
// `resolve-write.ts`). The phone keeps only the readers for a row that is ALREADY swapped —
// `src/lib/session-discipline-swap.ts` re-exports them. Comments below that name phone screens say
// where each rule came from; the rules themselves are unchanged.
//
// ⛔ SHARED = DEPLOY TRAP: grep -rln "session-swap/" supabase/functions
//
// ⛔ WHY THIS IS NOT IN A GENERATOR, AND THAT IS THE WHOLE POINT. The engine picks a modality by
// default — `week-solver` prefers an easy RIDE the morning after a long run, because a long run's
// cost is eccentric and another easy run puts impact back through the same tissue inside the 24–48h
// damage window. That default is science-optimal and it is still WRONG for the athlete whose bike is
// in the shop. The override has to live where the SESSION lives, not where the plan is built:
// marathon, Strong Focus, combined and tri all render planned sessions through the same client
// surfaces, so one implementation here is inherited by every plan type and a per-generator version
// would have to be written four times and would drift three ways.
//
// ⛔ TRACED BEFORE BUILDING, and the trace is why this file is small:
//   • `getInSlotAlternatives` (`src/lib/exercise-alternatives.ts:217`) is the pattern — a PURE
//     function returning options, with the UI and the persistence living in the caller. Copied
//     deliberately, including its refusal to guess: it returns [] rather than offer a bad swap.
//   • `validate-reschedule` moves a session's DAY. It has an `IntensityBucket` and a
//     `WorkoutPurpose`, and it never changes `type` — confirmed, so nothing already does this.
//   • Nothing else in `src/` performs a discipline change. `StateTab`'s week-mix bar already
//     RENDERS the consequence of one (*"a run traded for a swim shows the run share shrink"*), which
//     is the app expecting a capability it did not have.
//
// ⛔ THE LAW IS IMPORTED, NEVER COPIED. `schedule-session-constraints.ts` is zero-dependency pure TS
// (no Deno APIs, no remote imports — checked), so the client reads the same table the solver does.
// A second copy of the clearance matrix on the client is the divergence this codebase keeps paying
// for; there is exactly one.

// ⛔ ONE PLANNED-DURATION READER — the server's (2026-09-10, audit H-T01). The phone ladder this read
// (`src/lib/planned-session/duration.ts`) is deleted; the swap gate asks the same resolver get-week
// prints the session's length from, so the button and the length on the card cannot disagree.
import { resolvePlannedDurationSeconds as plannedDurationSeconds } from '../planned-duration.ts';
// ⛔ ONE VOCABULARY (stage 1). See `src/lib/discipline.ts` for why `ride`, and why unknown is null.
import { normalizeDiscipline, postureKey, type Discipline as CanonicalDiscipline } from '../../../../src/lib/discipline.ts';
// ⛔ ONE POSTURE SANITISER, and it is the server's. `@shared/state-trend` is already imported by the
// client (`useStateTrends`), so this reads the same three values the State screen groups by.
import type { PerDisciplinePosture } from '../state-trend/posture.ts';
import {
  areSameDayCompatible,
  type MatrixSessionKind,
  requiredAdjacencyHours,
  stackNeedsRecoveryGap,
} from '../schedule-session-constraints.ts';

/**
 * ⚠️ THE SWAP'S SET IS A SUBSET OF THE CANONICAL ONE. `normalizeDiscipline` also returns `strength`;
 * a strength session is not swappable by discipline (a different swap exists for its exercises), so
 * this narrows rather than redefines. One vocabulary, one narrowing, stated.
 */
export type Discipline = Exclude<CanonicalDiscipline, 'strength'>;

/** The session as the client holds it (`planned_workouts` row, loosely typed at the call site). */
import type { LibrarySwapSession } from './library-session.ts';

export type SwappableSession = {
  id?: string;
  type?: string | null;
  /** `planned` / `completed` / `skipped`. A session already done or skipped is not swappable. */
  workout_status?: string | null;
  name?: string | null;
  description?: string | null;
  /** Minutes. Present on raw `planned_workouts` rows. */
  duration?: number | null;
  /** The materialiser's expanded prose for the CURRENT discipline. Cleared by a swap. */
  rendered_description?: string | null;
  /** SECONDS, and the app's authoritative total — see `resolveMinutes`. */
  total_duration_seconds?: number | null;
  computed?: { total_duration_seconds?: number | null } | null;
  tags?: string[] | null;
  steps_preset?: string[] | null;
};

/**
 * ⛔ THREE KINDS OF SWAP NOW (work order 2026-09-09), and they are different changes to the row:
 *   · `discipline` — run ↔ ride ↔ swim, as before.
 *   · `hike`       — the long day as a `walk` row (p275). Not a discipline: the plan vocabulary has
 *                    no `hike` type, and Garmin hikes already ingest as walks, so inventing one
 *                    would give the app a type it could never read back.
 *   · `venue`      — the SAME session on a machine (p275). Same family, same targets, same minutes;
 *                    only a `venue:` tag is added. It is not a swap of what is trained at all.
 */
/**
 *   · `revert`     — back to the plan (§8). Not a swap at all: it undoes one. It is listed FIRST on
 *                    the sheet, because the athlete looking at a session they already changed is
 *                    more often looking for the way back than for a third option.
 */
export type SwapKind = 'discipline' | 'hike' | 'venue' | 'revert';

/** The machines p275 blesses, per sport. ⛔ THE LABELS ARE PENDING MICHAEL'S WORDS — see `venueKey`. */
/**
 * ⛔⛔ ONE MACHINE PER SPORT, AND THE OTHER FIVE ARE CUT (Michael, 2026-09-09: *"the five other
 * machines are cut, not pending"*). p275 also blesses the rower, ski erg, air bike, elliptical and
 * arc trainer; they are not in the app and nothing is held back waiting for a label.
 *
 * ⚠️ THE GROUND-IMPACT GATE BELOW OUTLIVES THEM ON PURPOSE. p275's rule — *"impact with the ground
 * on at least one day"* a week — is the source's, not a consequence of this list, and the treadmill
 * is exempt from it because it keeps feet on the ground. The gate costs one line and is the thing a
 * second run machine would need on day one.
 */
export const RIDE_VENUES = ['trainer'] as const;
export const RUN_VENUES = ['treadmill'] as const;
export type Venue = (typeof RIDE_VENUES)[number] | (typeof RUN_VENUES)[number];

/**
 * One literal, shared with the readers that ask "was this indoors".
 * ⛔ IT MOVED TO `@shared/indoor-session` (2026-09-09) and is re-exported here so no call site had to
 * change. The server reads the same tag to decide whether a session gets a heat or a hills line, and
 * a prefix that lived only in a client file would have been two literals within a week.
 */
export { VENUE_PREFIX } from '../indoor-session.ts';
import { VENUE_PREFIX } from '../indoor-session.ts';

/**
 * ⛔ THE SHEET'S LINES ARE KEYS, NOT SENTENCES. Every athlete-facing line in this work order is
 * Michael's to write ("Copy (Michael's words, pending)"), so the library hands the UI a KEY. When
 * the words land they replace the key in one place; until then an athlete sees the key, which is
 * unmistakably unfinished rather than plausibly wrong.
 */
export const SWAP_COPY_KEYS = {
  machine: 'swap.machine.pending',
  machineGround: 'swap.machine.ground_impact.pending',
  easy: 'swap.easy.pending',
  hardRunToRide: 'swap.hard_run_to_ride.pending',
  longDay: 'swap.long_day.pending',
} as const;

/** The `venue:` a row already carries, or null. */
export function venueOf(s: SwappableSession): Venue | null {
  for (const t of s.tags ?? []) {
    const raw = String(t).toLowerCase();
    if (!raw.startsWith(VENUE_PREFIX)) continue;
    const v = raw.slice(VENUE_PREFIX.length) as Venue;
    if ((RIDE_VENUES as readonly string[]).includes(v) || (RUN_VENUES as readonly string[]).includes(v)) return v;
  }
  return null;
}

export type SwapOption = {
  /** `discipline` unless this is the hike or a machine. */
  kind?: SwapKind;
  /** The machine, when `kind` is `venue`. */
  venue?: Venue;
  /**
   * ⛔ A PLACEHOLDER KEY, NOT A SENTENCE (work order: *every athlete-facing line waits for Michael's
   * words*). The sheet renders the key until the copy lands; `label` carries the same key today so a
   * half-written line can never reach an athlete by accident.
   */
  copyKey?: string;
  to: Discipline;
  label: string;
  /** The patch to apply to `planned_workouts`. Duration is deliberately absent — see `buildSwap`. */
  patch: Record<string, unknown>;
  /**
   * True when the patch wrote tokens that only become a real session after `materialize-plan`
   * expands them (the hard ride's watts). The apply path must invoke it for this row.
   */
  needsMaterialize: boolean;
  /** Non-blocking. Empty when the swap creates no conflict with the rest of that day. */
  warnings: string[];
};

/**
 * ⛔ MIGRATED TO THE CANONICAL NORMALIZER (stage 1, 2026-08-09). This carried its own three-entry map
 * and its own substring ladder — a fourth opinion about what "bike" means. It now narrows the one
 * canonical answer, and `strength` (which the canonical set includes and the swap does not) is the
 * only thing it filters.
 */
export function disciplineOf(type: string | null | undefined): Discipline | null {
  const d = normalizeDiscipline(type);
  return d && d !== 'strength' ? d : null;
}

/** Prefix for the origin tag. One literal, shared with `get-week` via an asserted test. */
export const SWAPPED_FROM_PREFIX = 'swapped_from:';

/**
 * The discipline the PLAN originally prescribed, read back off a previous swap's tag.
 * Null when this session has never been swapped — the caller then uses its current discipline.
 */
export function originOf(s: SwappableSession): Discipline | null {
  for (const t of s.tags ?? []) {
    const raw = String(t);
    if (!raw.startsWith(SWAPPED_FROM_PREFIX)) continue;
    const d = disciplineOf(raw.slice(SWAPPED_FROM_PREFIX.length));
    if (d) return d;
  }
  return null;
}

/** The tag every swapped row carries, beside `swapped_from:<origin>`. */
export const SWAPPED_TAG = 'discipline_swapped';

/**
 * ⛔ THE ORIGINAL SESSION'S NAME, CARRIED ON THE ROW (§8, 2026-09-09).
 *
 * The revert option is NAMED for the session the plan authored — `Near-threshold Run`, not "Run
 * instead" — and by the time the sheet is drawn that name is gone: the swap overwrites `name` with
 * the library session's, and `withLibrarySession` replaces `family:`/`sport:`/`band:` with the new
 * sport's. `swapped_from:` survives, but it holds a DISCIPLINE, not a name.
 *
 * ⚠️ A TAG, BECAUSE THE SHEET IS SYNCHRONOUS. The authored name lives in `plans.sessions_by_week`,
 * and that is a database read — fine at write time (`resolveSwapWrite` already does one) and wrong
 * at draw time, where it would turn every option button into a loading state. The tag is written
 * once, by the swap, and read for free thereafter.
 *
 * ⚠️ THE EARLIEST NAME WINS, exactly as `swapped_from:` keeps the earliest DISCIPLINE. run → ride →
 * swim must still offer the run the plan authored; recording each hop would offer the ride, which
 * the plan never prescribed.
 */
export const SWAPPED_NAME_PREFIX = 'swapped_name:';

/** The name of the session the plan authored, off a previous swap's tag. Null when never swapped. */
export function originalNameOf(s: SwappableSession): string | null {
  for (const t of s.tags ?? []) {
    const raw = String(t);
    if (!raw.startsWith(SWAPPED_NAME_PREFIX)) continue;
    const name = raw.slice(SWAPPED_NAME_PREFIX.length).trim();
    if (name) return name;
  }
  return null;
}

/**
 * The tags a swap writes: the row's own, minus the source sport's step markers, plus the three that
 * point back at what the plan asked for.
 *
 * ⛔ ONE BUILDER, TWO CALLERS. The discipline patch and the hike patch each had this list inline and
 * they had already drifted once (the hike clears `workout_structure`, the discipline patch does
 * not). The origin tags are the half that must never drift, so they are built here.
 */
function swapOriginTags(session: SwappableSession, from: Discipline): string[] {
  const authored = originalNameOf(session) ?? (typeof session.name === 'string' ? session.name.trim() : '');
  return [...new Set([
    ...(session.tags ?? []).filter((t) => !/^(run|ride|bike|swim)_/.test(String(t))),
    SWAPPED_TAG,
    `${SWAPPED_FROM_PREFIX}${originOf(session) ?? from}`,
    ...(authored ? [`${SWAPPED_NAME_PREFIX}${authored}`] : []),
  ])];
}

/**
 * ⛔ IS THIS ROW A SWAP? The one predicate every SURFACE asks before it renders structure.
 *
 * ⚠️ IT READS THE TAG, NOT THE ABSENCE OF `steps_preset`. The swap patch clears `steps_preset` and
 * `rendered_description`, and for a while that was treated as "the row is clean now". It is not:
 * `computed.steps`, `intervals`, `workout_structure` and `export_hints` are UNTOUCHED by the patch
 * and still hold the SOURCE sport's prescription. A row with no `steps_preset` and a full
 * `computed.steps` is exactly the shape that renders a run's mileage under a ride's name.
 */
export function isDisciplineSwapped(s: SwappableSession | null | undefined): boolean {
  if (!s) return false;
  const tags = (s.tags ?? []).map((t) => String(t));
  return tags.includes(SWAPPED_TAG) || tags.some((t) => t.startsWith(SWAPPED_FROM_PREFIX));
}

/**
 * ⛔ SHOULD THE RENDERERS HIDE THIS ROW'S STRUCTURE? Not every swap leaves stale structure behind.
 *
 * ⚠️ THE DISTINCTION EXISTS BECAUSE OF THE HARD RIDE (2026-08-09). An EASY swap writes
 * `steps_preset: null` and leaves `computed.steps` holding the SOURCE sport's session — that is the
 * "5.0 mi @ run pace on a ride" bug, and it must be suppressed. A HARD swap to the bike writes real
 * bike tokens and has `materialize-plan` regenerate `computed` from them, so its steps ARE the
 * ride's — suppressing those would hide the 4×4 the athlete is meant to do.
 *
 * ⛔ THE TELL IS `steps_preset`. Present ⇒ something was written FOR the target sport and expanded
 * for it. Absent ⇒ nothing was, and whatever is in `computed` belongs to the sport left behind.
 */
export function swappedStructureIsStale(s: SwappableSession | null | undefined): boolean {
  if (!isDisciplineSwapped(s)) return false;
  const preset = (s as { steps_preset?: unknown } | null)?.steps_preset;
  return !(Array.isArray(preset) && preset.length > 0);
}

/**
 * ⛔ WHAT A SWAPPED SESSION IS ALLOWED TO SAY — a time and an effort, and nothing else.
 *
 * The bug this closes, in the athlete's words: a swapped Easy Ride printed *"5.0 mi @ run pace"*,
 * and a swapped hard ride printed the hill-RUN structure — warmup miles, repeats, and **"Walk
 * down"** — under the name "Bike Intervals". The swap changed `type` and `name`; the STRUCTURE
 * underneath was still the run's, and three surfaces faithfully rendered it.
 *
 * ⛔ THE APP DOES NOT KNOW THE EQUIVALENT SESSION YET, AND MUST NOT PRETEND. Converting a hill-run
 * prescription into a real hard-ride prescription means the athlete's FTP and a generated interval
 * set (`bikeQualitySession`) — that is a server-backed build, not a relabel. Until it exists, the
 * honest artefact is a time block with the effort named: it is what the swap actually promises
 * ("same time, same effort, different surface") and it prescribes nothing it cannot back up.
 *
 * ⚠️ NO DISTANCE, NO PACE, NO WATTS — deliberately. A number carried across a modality change is
 * wrong in a way that looks right, which is the single most expensive kind of wrong in this app.
 */
export function swappedSessionBlock(s: SwappableSession): { effort: string; note: string } {
  const to = disciplineOf(s.type);
  const band = intensityOf(s);
  const noun = to === 'ride' ? 'ride' : to === 'swim' ? 'swim' : 'run';
  const effort = band === 'hard'
    ? `Hard ${noun}, no target`
    : `Easy ${noun}, no pace target`;
  const from = originOf(s);
  const note = from
    ? `Swapped from your planned ${from === 'ride' ? 'ride' : from}. Same time, same effort.`
    : 'Swapped from another sport. Same time, same effort.';
  return { effort, note };
}

/**
 * ⛔ INTENSITY IS PRESERVED, NOT RE-DECIDED. Michael's rule: *"easy stays easy, hard stays hard."*
 * A swap is a modality change; turning an athlete's hard session into an easy one because the target
 * sport's default is easy would be the engine quietly re-dosing their week through a UI control.
 *
 * ⚠️ THE LONG SESSION IS NOT SWAPPABLE, and that is a judgement worth stating. A long run is the
 * week's key session and the thing every other placement is built around — swapping it to a ride
 * changes what the block IS, not how one day is spent. The athlete can still move or skip it. If
 * this proves too strict, the fix is to allow it WITH a loud warning, not to silence the question.
 */
export type IntensityBand = 'easy' | 'hard' | 'long';

export function intensityOf(s: SwappableSession): IntensityBand {
  const tags = (s.tags ?? []).map((t) => String(t).toLowerCase());
  const name = String(s.name ?? '').toLowerCase();

  /**
   * ⛔⛔ THE COMPOSER'S OWN BANDS COME FIRST (2026-09-09), AND NOT READING THEM WAS A LIVE BUG.
   *
   * Every composed endurance row carries `band:` off `ENDURANCE_CLASS` — `above` / `near` / `below`
   * / `vt1_or_easier` — and `family:`. This function read neither: it matched a hand-written tag
   * list (`intervals`, `tempo`, `threshold`…) and a name regex, and the standing plan writes none of
   * those words. **An Anaerobic Ride (`band:above`) therefore banded EASY**, and the swap sheet
   * offered it "Run instead" under the easy-work line — the one swap p138 does not bless in that
   * direction, sold with a sentence about easy work.
   *
   * ⚠️ THE LONG DAY IS ITS FAMILY, NOT ITS NAME. `family:run_lsd` is what the composer stamps on the
   * long run; the row carries no `long` tag at all, so this used to band it long off the WORD "Long"
   * in its name. One rename and the week's key session would have started offering easy swaps.
   *
   * ⚠️ THE OLD LADDER STAYS UNDERNEATH for every row that carries no `band:` — a marathon-generator
   * row, a library plan, anything built before these tags existed. A missing signal is not a verdict.
   */
  const family = tags.find((t) => t.startsWith('family:'))?.slice('family:'.length);
  if (family === 'run_lsd' || family === 'ride_long') return 'long';

  if (tags.includes('long_run') || tags.includes('long_ride') || tags.includes('long') || /\blong\b/.test(name)) {
    return 'long';
  }

  const band = tags.find((t) => t.startsWith('band:'))?.slice('band:'.length);
  if (band === 'above' || band === 'near' || band === 'below') return 'hard';
  if (band === 'vt1_or_easier') return 'easy';

  const hard = ['intervals', 'tempo', 'threshold', 'hard_run', 'vo2', 'quality', 'race_day'];
  if (tags.some((t) => hard.includes(t)) || /interval|tempo|threshold|hill repeat/.test(name)) return 'hard';
  return 'easy';
}

/** The matrix kind for a (discipline, band) pair — the vocabulary the law speaks. */
export function matrixKindFor(d: Discipline, band: IntensityBand): MatrixSessionKind {
  if (band === 'long') return d === 'ride' ? 'long_ride' : d === 'run' ? 'long_run' : 'easy_swim';
  if (band === 'hard') {
    return d === 'run' ? 'quality_run' : d === 'ride' ? 'quality_bike' : 'quality_swim';
  }
  return d === 'run' ? 'easy_run' : d === 'ride' ? 'easy_bike' : 'easy_swim';
}

/**
 * ⛔ VOLUME IS PRESERVED AS TIME, AND THIS IS THE ONLY HONEST CHOICE.
 *
 * The session's `duration` carries across untouched. What must NOT carry across is the distance:
 * "8 miles" is meaningless on a bike and the app has never learned a ride speed (D-323 §6 — the
 * reason `bike.hours` is hours and never miles). So the swap keeps the TIME the athlete was going to
 * spend and drops any distance-bearing prescription with it.
 *
 * ⛔ AND THE TOKEN GOES. `steps_preset` is a prescription in the source discipline's vocabulary
 * (`run_easy_45min`, `longrun_12mi_easypace`); carried onto a ride it would be graded by the workload
 * matcher against a run prescription that no longer exists. `materialize-plan`'s own note says a
 * token routes a session through that matcher — so a swapped session carries none, exactly as the
 * swim courtesy sessions deliberately carry none.
 */
function describeSwap(d: Discipline, band: IntensityBand, minutes: number): { name: string; description: string } {
  /**
   * ⛔ THE COPY DOES NOT RESTATE THE DURATION (2026-08-08). Every surface that shows this session
   * already prints its time — the chip reads `RN 63:00`, the drawer prints a duration block — so a
   * description opening `~63 min` says the same number twice on one screen. It read that way because
   * the first draft wrote copy to be read alone; it never is.
   *
   * ⚠️ `minutes` is still passed and still used — for the hard-session line, where "the hard work"
   * needs no number, and to keep the signature honest about what the copy is derived from.
   */
  void minutes;
  if (d === 'swim') {
    return { name: 'Easy Swim', description: 'Easy in the pool. Swapped from another sport — same time, no pace target.' };
  }
  const noun = d === 'ride' ? 'Ride' : 'Run';
  if (band === 'hard') {
    return {
      name: d === 'ride' ? 'Bike Intervals' : 'Hard Run',
      description: 'Swapped from another sport — the effort is the same, the surface is not.',
    };
  }
  return {
    name: `Easy ${noun}`,
    description: 'Easy, all conversational. Swapped from another sport — same time, no pace target.',
  };
}

/**
 * ⛔ ONE DURATION READER, AND IT IS THE ONE THE ROW ITSELF USES (2026-08-09).
 *
 * This function has now been wrong twice, in the same way, and the second time is the instructive
 * one. First it read `session.duration`; the unified row does not carry that, so the gate closed
 * everywhere. Then it read `total_duration_seconds`; that is what
 * `resolvePlannedDuration.ts` reads, so it looked right — and the gate still closed on the Today's
 * Effort card while the calendar chip opened.
 *
 * ⛔ THE APP HAS THREE DURATION READERS AND THEY DISAGREE. `resolvePlannedDurationMinutes` reads the
 * stored root total ONLY, and returns null otherwise, deliberately ("no fallbacks" — it feeds a
 * badge). `resolveMovingSeconds` has FOUR priorities for a planned row: root total, then
 * `computed.total_duration_seconds`, then **the sum of `computed.steps[].seconds`**, then intervals.
 * The row on Today's Effort prints its time with the second one — which is why the card read
 * "63:00" while this gate computed 0 and hid the control on that surface alone.
 *
 * ⚠️ SO IT DELEGATES. Whatever the surface shows as the session's length is what decides whether the
 * session can be swapped; a private ladder here is a fourth answer, and the fourth answer is how
 * this bug survived two fixes. The only thing added is `duration` (minutes) as a last resort, for
 * raw `planned_workouts` rows that never went through the unified mapper.
 *
 * ⛔ STAGE 2: IT NOW CALLS `plannedDurationSeconds` DIRECTLY, and the hack it replaces is worth
 * naming. It used to call `resolveMovingSeconds({ workout_status: 'planned', ...s })` — spreading a
 * fake status in to force the planned branch of a reader that is really two readers. Worse, the
 * spread came SECOND, so a session carrying `workout_status: 'completed'` silently overrode it and
 * the swap gate priced an executed session's moving time. The planned reader has no status gate, so
 * the coercion is gone and the intent is stated instead of simulated.
 */
export function resolveMinutes(s: SwappableSession): number {
  const secs = plannedDurationSeconds(s as Record<string, unknown>);
  if (Number.isFinite(secs) && (secs as number) > 0) return Math.max(1, Math.round((secs as number) / 60));
  const mins = Number(s.duration);
  if (Number.isFinite(mins) && mins > 0) return Math.round(mins);
  return 0;
}

/**
 * Check a proposed swap against the rest of that day. ⛔ WARN, NEVER GATE.
 *
 * Michael: *"guardrail = WARN, not gate."* The law's own framing agrees — `easy_run` carries 0h
 * against most things deliberately, and the clearance table exists to price a choice, not to forbid
 * one. So this returns sentences, and the caller shows them beside a button that still works.
 */
export function swapWarnings(
  to: Discipline,
  band: IntensityBand,
  sameDayOthers: ReadonlyArray<{ kind: MatrixSessionKind; label: string }>,
): string[] {
  const kind = matrixKindFor(to, band);
  const out: string[] = [];
  for (const other of sameDayOthers) {
    if (!areSameDayCompatible(kind, other.kind)) {
      out.push(`${other.label} is already on this day and the two are not usually paired.`);
      continue;
    }
    if (stackNeedsRecoveryGap(kind, other.kind)) {
      const h = requiredAdjacencyHours(kind, other.kind);
      out.push(
        `${other.label} is on this day and loads the same legs — do that first and leave `
        + `${h > 0 ? `${h}h` : 'a few hours'} before this one.`,
      );
    }
  }
  return out;
}

/**
 * The swap options for a session: the other disciplines the athlete actually has, same day, same
 * intensity band, duration preserved.
 *
 * ⛔ RETURNS [] RATHER THAN GUESS — the `getInSlotAlternatives` rule. No options for a strength
 * session (a different swap already exists for those), none for a long session, and none for a sport
 * the athlete does not have.
 */
export function getDisciplineSwaps(
  session: SwappableSession,
  available: ReadonlyArray<Discipline>,
  sameDayOthers: ReadonlyArray<{ kind: MatrixSessionKind; label: string }> = [],
  /**
   * The athlete's declared `per_discipline_posture`, straight off `goals.training_prefs`. Absent
   * means "not declared" and is NOT a verdict — see the gate below.
   */
  posture?: PerDisciplinePosture | null,
  /**
   * ⛔ THE ATHLETE'S USABLE FTP, AND IT GATES ONE THING ONLY: hard → ride. A hard ride is written as
   * real 4×4 tokens that `materialize-plan` turns into watts by multiplying FTP; with no FTP the
   * expansion yields interval steps carrying **no targets**, which looks like a prescription and is
   * not one. Null → the hard ride is not offered at all.
   *
   * ⚠️ EASY SWAPS DO NOT CONSULT IT. An easy ride is a time block with no targets by design, so it
   * needs nothing from the athlete's numbers and must keep working for an athlete who has none.
   */
  ftp?: number | null,
): SwapOption[] {
  const from = disciplineOf(session.type);
  if (!from) return [];

  /**
   * ⛔ YOU MAY SWAP WHAT IS HELD, NEVER WHAT IS BEING TRAINED (2026-08-09).
   *
   * Training specificity is the reason, and it is not a preference: a discipline set to `develop` is
   * the thing the block exists to improve, and adaptation is specific to the mode of exercise. Riding
   * instead of the run the plan is developing does not deliver the run's stimulus — it deletes that
   * week's progression while looking like a fair trade. A `maintain` discipline is held, not trained;
   * swapping the modality there costs nothing the plan was buying (it is the same reasoning the
   * engine uses to put an easy RIDE the day after a long run).
   *
   * ⚠️ THIS READS DATA THAT ALREADY EXISTS, on every plan type. `per_discipline_posture` is written
   * at intake and is what tells a strength-focus block from a run-focus one — so a maintain ride in a
   * run-focus plan is swappable and the run is not, with no new field and no plan-type branching.
   *
   * ⛔ AN UNDECLARED POSTURE DOES NOT BLOCK — `SPEC-week-solver` §0h: *a missing signal is not a
   * verdict*. Race plans and anything built before postures existed carry none, and failing closed
   * would silently remove the control from every one of them. Unknown → behave exactly as before.
   */
  /**
   * ⛔ THE POSTURE MAP IS KEYED `bike`, THE SWAP'S DISCIPLINE IS `ride` — and the first version of
   * this gate read `posture['ride']`, which is always undefined. Every ride therefore looked
   * undeclared and sailed through the gate, including a DEVELOP bike in a cycling-focus block. Two
   * vocabularies for one concept, caught by its own test rather than on a device.
   *
   * ⚠️ `non-race-goal-seeds` writes `{ swim, bike, run, strength }`; `disciplineOf` returns
   * `run | ride | swim`. One translation, stated here, so neither side has to change.
   */
  // ⚠️ `postureKey` is the ONE named translation (`ride → bike`). It replaced a private map here —
  // and before that, a direct `posture[from]` read that was always `undefined` for a ride.
  const declared = posture?.[postureKey(from)];
  if (declared && declared !== 'maintain') return [];
  /**
   * ⛔ UNSTARTED ONLY, AND THE CHECK LIVES HERE (2026-08-08). The callers each had their own
   * `!isCompleted` guard, which meant "should the button exist" and "should the swap be offered"
   * were two questions asked in two places — exactly how a button and its sheet start disagreeing.
   * Swapping the sport of a session already logged would also rewrite history, not a plan.
   */
  const status = String(session.workout_status ?? 'planned').toLowerCase();
  if (status === 'completed' || status === 'skipped') return [];
  const band = intensityOf(session);

  const minutes = resolveMinutes(session);
  if (minutes <= 0) return [];

  /**
   * ⛔ HARD SESSIONS ARE SWAPPABLE BETWEEN RUN AND RIDE — BUT NEVER TO SWIM (decided 2026-08-08).
   *
   * Michael asked whether `hard` should be excluded like `long` is. It should not, and the engine's
   * own doctrine is why: `strength-primary-plan.ts` states *"If the athlete has a bike, the doctrine
   * puts the hard session THERE (`DOCTRINE-aerobic-maintenance.md` §6: 'both means a choice, and the
   * bike wins') — hard riding costs the legs less than hard running does."* Blocking hard run → hard
   * ride would forbid the swap the engine would rather have made itself.
   *
   * ⚠️ THE REVERSE IS THE ONE THAT COSTS. The same passage: *"Do NOT emit hills as a substitute for
   * the ride: that spends mechanical budget the doctrine spent the whole day protecting."* So hard
   * ride → hard run is allowed and WARNS — warn, never gate.
   *
   * ⛔ SWIM IS EXCLUDED FOR HARD WORK, and this is not squeamishness. The app does not coach swims at
   * all: *"swim is booked, not coached … no yardage, no sets, no drills"*, no swim pace is learned,
   * and swim sessions deliberately carry no `steps_preset`. Offering "hard swim instead" would
   * promise a prescription this app cannot write. An easy swim is a time block, which it can.
   */
  const hasUsableFtp = Number.isFinite(ftp as number) && (ftp as number) > 0;
  /**
   * ⛔ HARD → RIDE NEEDS AN FTP; HARD → SWIM IS EXCLUDED OUTRIGHT (see above). So a hard session for
   * an athlete with no FTP correctly offers NOTHING — the simpler of the two fallbacks, and the
   * honest one: the app cannot write the session it would be promising.
   */
  const targets = available.filter((d) => {
    /**
     * ⛔ THE LONG DAY IS RUN OR RIDE (work order 2026-09-09 §4, p275: *"a hike, a long ride, a team
     * sport day, or whatever else is of interest"*). ⚠️ NOT SWIM — the app does not coach swims, so a
     * "long swim" would be a booking wearing the week's key session's name. The hike is added below,
     * outside the discipline list, because it is a `walk` row rather than a discipline.
     */
    if (band === 'long') return d !== 'swim';
    if (band !== 'hard') return true;
    if (d === 'swim') return false;
    if (d === 'ride') return hasUsableFtp;
    /**
     * ⛔⛔ HARD RIDE → HARD RUN IS OFF THE SHEET (work order §3, 2026-09-09). p138 permits the swap in
     * ONE direction — a hard run for a hard ride, when running volume is at its limit — and the
     * reverse is not on the page.
     *
     * ⚠️ IT USED TO BE OFFERED WITH A WARNING, and the warning said exactly why it was wrong:
     * *"hard running costs the legs more than hard riding — the plan put this on the bike for that
     * reason."* Warning about a swap the source does not bless is still offering it. The clause and
     * its warning are gone together.
     */
    if (d === 'run' && from === 'ride') return false;
    return true;
  });

  return targets
    .filter((d) => d !== from)
    .map((to) => {
      const { name, description } = describeSwap(to, band, minutes);
      /**
       * ═══ THE SESSION ITSELF IS NOT WRITTEN HERE ANY MORE (§7, 2026-09-09) ════════════════════
       *
       * ⛔ THIS PATCH USED TO CARRY A HAND-WRITTEN 4×4 for a hard swap to the bike — warm-up, the
       * Helgerud protocol, cool-down, 57 minutes. It was a THIRD answer: not the old session, and
       * not the book's either. §7 rules that a sport swap hands over the composer's own session for
       * the new sport and band, so the 4×4 is gone and `ride_anaerobic` (p237) takes its place.
       *
       * ⛔ AND THAT SESSION IS MERGED IN BY `withLibrarySession`, at write time, because finding the
       * athlete's own row of the target family is a database read. What this function returns is the
       * SHELL — type, copy, and the tags that stop `get-week` re-creating the original row.
       *
       * ⚠️ THE FTP GATE STAYS (see `targets`). The library's ride is watts too; with no FTP it
       * expands to interval steps carrying no targets, which is a prescription the app cannot write.
       *
       * ⚠️ AND `needsMaterialize` IS FALSE HERE, ALWAYS. The shell writes no tokens, so there is
       * nothing to expand; the resolver sets it true whenever it merges a library session in. A
       * caller that writes this patch raw gets exactly what it did before §7 for a swim.
       */
      return {
        to,
        label: to === 'ride' ? 'Ride instead' : to === 'swim' ? 'Swim instead' : 'Run instead',
        needsMaterialize: false,
        patch: {
          type: to,
          name,
          description,
          // ⛔ duration is NOT in this patch. The library session writes its own minutes; a shell
          // leaves the row's own time alone, because re-writing a preserved value is how it gets
          // accidentally rounded.
          steps_preset: null,
          /**
           * ⛔ THE STALE RENDERED COPY HAD TO GO WITH IT. `rendered_description` is the
           * materialiser's expanded prose for the ORIGINAL discipline, and several surfaces prefer
           * it over `description` (`TodaysEffort:1886`, `UnifiedWorkoutView:542`). Leaving it in
           * place meant a swapped ride kept printing the run's sentence — the swap would look like
           * it had failed, or worse, quietly prescribe the wrong session.
           */
          rendered_description: null,
          /**
           * ⛔ THE TAG RECORDS WHAT THE PLAN ORIGINALLY ASKED FOR (2026-08-08), and that is load-bearing.
           *
           * `get-week` re-materialises planned rows from `plans.sessions_by_week` on every read and
           * decides "is this session already here?" on `plan|date|TYPE`. A swap changes the type, so
           * the blob's run looked MISSING and get-week inserted a second row — the athlete's Tuesday
           * ended up holding the swapped ride AND a freshly re-created run, on every calendar load.
           * `swapped_from:<original>` is what lets that check find the slot without the blob being
           * touched. The swap stays individualised; the plan keeps saying what it prescribed.
           *
           * ⛔ THE EARLIEST ORIGIN WINS, NOT THE LAST HOP. Swapping run → ride → swim must still
           * report `swapped_from:run`, because `run` is what the blob holds and what get-week will
           * look for. Recording the immediately-previous discipline would leave the blob's run
           * unmatched on the second swap and the duplicate would come straight back.
           */
          // ⚠️ `swapOriginTags` also stamps `swapped_name:` — the name the revert option wears (§8).
          tags: swapOriginTags(session, from),
        },
        kind: 'discipline' as const,
        /** The sheet's line for this row, by band. Pending Michael's words — see `SWAP_COPY_KEYS`. */
        copyKey: band === 'long' ? SWAP_COPY_KEYS.longDay : band === 'hard' ? SWAP_COPY_KEYS.hardRunToRide : SWAP_COPY_KEYS.easy,
        // ⚠️ THE HARD-RIDE-TO-HARD-RUN CAUTION IS GONE WITH THE OPTION IT WARNED ABOUT (see `targets`).
        warnings: swapWarnings(to, band, sameDayOthers),
      };
    });
}

/**
 * ⛔⛔ THE MACHINE AND THE HIKE ARE NOT DISCIPLINE SWAPS, AND THEY LIVE IN THEIR OWN READER.
 *
 * Both return `to === from`, and `getDisciplineSwaps`' every consumer maps over `to` to mean "the
 * sport this becomes" — folding them into that list made an easy RUN report `run` as one of its
 * options and broke nine existing assertions at once. That is not a test problem: the drawer keys
 * its buttons on `to` as well.
 *
 * ⚠️ THE SHEET STILL SHOWS ONE LIST. It concatenates the two; the SPLIT is about what `to` means,
 * not about what the athlete sees.
 *
 * ⛔ THE SAME GATES APPLY, and they are re-asked here rather than assumed: posture, and unstarted
 * only. A machine on a session already logged would rewrite history exactly as a swap would.
 */
export function sessionSwapExtras(
  session: SwappableSession,
  posture?: PerDisciplinePosture | null,
  /**
   * The week's own rows, for p275's ground-impact rule — a run machine is offered only while another
   * run in the week is still outdoors. ⚠️ ABSENT MEANS "NOT ASKED", and the gate then behaves as if
   * this were the only run: the treadmill is offered and the other two are not. A missing signal is
   * not a verdict, but it is not permission either.
   */
  weekSessions: ReadonlyArray<SwappableSession> = [],
): SwapOption[] {
  const from = disciplineOf(session.type);
  if (!from) return [];
  const declared = posture?.[postureKey(from)];
  if (declared && declared !== 'maintain') return [];
  const status = String(session.workout_status ?? 'planned').toLowerCase();
  if (status === 'completed' || status === 'skipped') return [];

  const options: SwapOption[] = [];
  const K = SWAP_COPY_KEYS;

  /**
   * ⛔ THE MACHINE IS NOT A SWAP OF WHAT IS TRAINED (p275) — same session, same family, same targets,
   * same minutes, performed somewhere else. It stamps `venue:` and nothing else.
   *
   * ⛔ THE GROUND-IMPACT GATE, p275: *"impact with the ground on at least one day"* a week. A run
   * machine is offered only while the week still has a run that has not been moved indoors, counting
   * THIS one — moving it is what the athlete is about to do. ⚠️ A TREADMILL STILL COUNTS AS GROUND
   * IMPACT (work order §1), so it is offered whatever the rest of the week holds.
   */
  if (!venueOf(session)) {
    if (from === 'ride') {
      for (const v of RIDE_VENUES) {
        options.push({ kind: 'venue', venue: v, copyKey: K.machine, to: from, label: K.machine, needsMaterialize: false, warnings: [], patch: venuePatch(session, v) });
      }
    } else if (from === 'run') {
      const onTheGround = weekSessions.filter((r) => disciplineOf(r.type) === 'run' && !venueOf(r)).length;
      for (const v of RUN_VENUES) {
        if (v !== 'treadmill' && onTheGround <= 1) continue;
        options.push({ kind: 'venue', venue: v, copyKey: v === 'treadmill' ? K.machine : K.machineGround, to: from, label: K.machine, needsMaterialize: false, warnings: [], patch: venuePatch(session, v) });
      }
    }
  }

  /**
   * ⛔ THE HIKE IS THE LONG DAY'S THIRD OPTION (p275) — a `walk` row carrying the long session's
   * minutes. No new type: Garmin hikes ingest as walks, so this is a type the app can read back.
   * ⚠️ TEAM SPORT DAY IS NOT OFFERED. The page names it; the app has no type for it and could not
   * read one back, so offering it would promise a record it cannot keep.
   */
  if (intensityOf(session) === 'long' && resolveMinutes(session) > 0) {
    options.push({
      kind: 'hike', to: from, label: K.longDay, copyKey: K.longDay,
      needsMaterialize: false, warnings: [],
      patch: {
        type: 'walk',
        steps_preset: null,
        workout_structure: null,
        intervals: null,
        rendered_description: null,
        tags: swapOriginTags(session, from),
      },
    });
  }

  return options;
}

/**
 * ═══ §8 — BACK TO THE PLAN ═══════════════════════════════════════════════════════════════════════
 *
 * ⛔ A SESSION THE ATHLETE ALREADY CHANGED OFFERS ITS ORIGINAL FIRST (Michael, 2026-09-09, on the
 * device). Until now the sheet only ever offered MORE changes: having moved a run to the bike, the
 * only route back was to swap the ride to a run — which writes the library's run, not the run the
 * plan wrote, and leaves the row tagged as a swap forever.
 *
 * ⚠️ TWO SHAPES, AND THEY UNDO DIFFERENT THINGS:
 *   · A MACHINE reverts by dropping one tag. The session never changed — same family, same targets,
 *     same minutes — so there is nothing to restore and the option is named `Outdoors`.
 *   · A SPORT SWAP (or the hike) reverts to the row the plan authored: its type, name, description,
 *     structure and tags, read back out of `plans.sessions_by_week` at write time by
 *     `resolveSwapWrite`. The option is named for that session.
 *
 * ⛔ THE SPORT REVERT IS OFFERED ONLY WHEN IT CAN BE NAMED AND FOUND — a `swapped_name:` tag and a
 * `training_plan_id`. A row swapped before §8 shipped carries no name, and a row with no plan has no
 * authored session to go back to; in both cases the honest sheet says nothing rather than offering a
 * button whose promise it cannot keep. ⚠️ THE FIRST CASE HEALS ITSELF: the next swap of that row
 * stamps the name.
 */
export function revertOptions(session: SwappableSession, planId?: string | null): SwapOption[] {
  const from = disciplineOf(session.type);
  const status = String(session.workout_status ?? 'planned').toLowerCase();
  if (status === 'completed' || status === 'skipped') return [];

  const out: SwapOption[] = [];

  // ⚠️ THE SPORT'S WAY BACK GOES FIRST when a row is both swapped and indoors — "back to the plan"
  // is the whole way back, and it takes the machine with it.
  const authored = originalNameOf(session);
  if (isDisciplineSwapped(session) && authored && planId) {
    out.push({
      kind: 'revert',
      to: originOf(session) ?? from ?? 'run',
      label: authored,
      copyKey: 'swap.back_to_plan',
      // ⚠️ EMPTY ON PURPOSE. The restore is a database read (`resolveSwapWrite`), the same place the
      // swap's own library session is resolved. A pure library cannot build this patch.
      patch: {},
      needsMaterialize: true,
      warnings: [],
    });
  }

  const venue = venueOf(session);
  if (venue && from) {
    out.push({
      kind: 'revert',
      venue,
      to: from,
      label: '',
      copyKey: 'swap.back_to_plan',
      needsMaterialize: false,
      warnings: [],
      patch: {
        tags: (session.tags ?? []).filter((t) => !String(t).toLowerCase().startsWith(VENUE_PREFIX)),
      },
    });
  }

  return out;
}

/**
 * The machine patch: a `venue:` tag and nothing else. ⛔ NO NAME, NO TYPE, NO DURATION — p275's
 * machine is the same session performed elsewhere, and rewriting any of those would make it a
 * different session wearing the same page's blessing.
 */
function venuePatch(session: SwappableSession, venue: Venue): Record<string, unknown> {
  return {
    tags: [...new Set([
      ...(session.tags ?? []).filter((t) => !String(t).toLowerCase().startsWith(VENUE_PREFIX)),
      `${VENUE_PREFIX}${venue}`,
    ])],
  };
}

/**
 * ═══ REST OF PLAN ════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE SAME TWO CHOICES THE LIFT SWAP OFFERS (work order 2026-09-09 §6). "Just today" writes one
 * row; "Rest of plan" writes this session's every later repeat.
 *
 * ⚠️ A PATCH IS NOT PORTABLE, WHICH IS THE WHOLE REASON THIS EXISTS. Every patch the library builds
 * is derived from the row it was built for — the machine patch carries THAT row's whole tag list, the
 * hike patch carries THAT row's minutes, the hard ride's name carries THAT row's length. Copying one
 * row's patch onto another would overwrite the second row's tags with the first's. So a later row is
 * re-asked from scratch and gets its own answer.
 *
 * ⛔ AND IT IS RE-ASKED, NOT ASSUMED. A later row that cannot take this swap — already logged,
 * already indoors, a long day that is no longer long — returns null and is left alone. The athlete
 * asked for the swap wherever it holds, not for it to be forced where it does not.
 */
export function isPlanTwin(session: SwappableSession, row: SwappableSession): boolean {
  const fam = (t?: readonly string[] | null) =>
    (t ?? []).find((x) => String(x).startsWith('family:')) ?? null;
  const a = fam(session.tags);
  /**
   * ⚠️ `family:` FIRST, THE SPORT ONLY AS A FALLBACK. The composer stamps a family on every standing
   * plan row and it is what "this session, every week" actually means. A row with no family — a
   * marathon-generator row, a hand-added session — is matched on its sport instead, which is looser;
   * it is the widest identity this library will assume, and it never crosses sports.
   */
  if (a) return fam(row.tags) === a;
  const d = disciplineOf(session.type);
  return !!d && disciplineOf(row.type) === d;
}

/** The same swap, re-derived against a LATER row. Null when it does not hold there. */
export function sameSwapOn(
  row: SwappableSession,
  chosen: { kind?: SwapKind; venue?: Venue; to: Discipline },
  ctx: {
    available: ReadonlyArray<Discipline>;
    posture?: PerDisciplinePosture | null;
    ftp?: number | null;
    /** That row's own week, for the ground-impact gate. Absent behaves as `sessionSwapExtras` does. */
    weekSessions?: ReadonlyArray<SwappableSession>;
  },
): SwapOption | null {
  const all = [
    /**
     * ⚠️ THE WAY BACK IS RE-ASKED PER ROW TOO (§8). "Rest of plan" on a revert means every later
     * repeat goes back to what the plan authored — and each of those has its OWN authored session,
     * so each gets its own answer. A later row that was never swapped returns nothing and is left
     * alone, exactly like a row that cannot take a swap.
     */
    ...revertOptions(row, (row as { training_plan_id?: string | null }).training_plan_id ?? null),
    ...sessionSwapExtras(row, ctx.posture ?? null, ctx.weekSessions ?? []),
    /**
     * ⚠️ NO SAME-DAY LIST FOR A FUTURE ROW. That argument only produces WARNINGS, and a warning is a
     * thing said on the sheet to the athlete looking at it — it cannot be said about a day that is
     * not on screen. The swap itself is identical either way.
     */
    ...getDisciplineSwaps(row, ctx.available, [], ctx.posture ?? null, ctx.ftp ?? null),
  ];
  const want = { kind: chosen.kind ?? 'discipline', venue: chosen.venue ?? null, to: chosen.to };
  return all.find((o) => (o.kind ?? 'discipline') === want.kind
    && (o.venue ?? null) === want.venue
    && o.to === want.to) ?? null;
}

/**
 * ═══ §7 — THE SWAP HANDS OVER THE LIBRARY'S SESSION ══════════════════════════════════════════════
 *
 * ⛔ THE PATCH BUILT ABOVE IS A SHELL, AND ON ITS OWN IT KEEPS THE OLD SESSION'S MINUTES — a
 * three-hour long ride became a three-hour run. This merges the real session over it: the composer's
 * own session for the new sport and band, at the athlete's level.
 *
 * ⚠️ IT IS APPLIED AT WRITE TIME, NOT WHEN THE SHEET IS DRAWN, because finding the athlete's own row
 * of the target family is a database read and the sheet must stay cheap. The sheet shows the option;
 * this decides what the option actually writes.
 *
 * ⚠️ AND THE STALE STRUCTURE GOES WITH IT. `computed`, `workout_structure` and `intervals` belong to
 * the session being replaced; nothing else clears them, and they are what printed a run's "Walk
 * down" on a ride. Safe here only because the new total is written on the same object — `computed`
 * is a rung of `plannedDurationSeconds`, so clearing it without pinning a total first would delete
 * the session's duration.
 */
export function withLibrarySession(
  patch: Record<string, unknown>,
  session: SwappableSession,
  lib: LibrarySwapSession,
): Record<string, unknown> {
  const kept = (patch.tags as string[] | undefined) ?? (session.tags ?? []);
  return {
    ...patch,
    name: lib.name,
    /**
     * ⛔ THE NEW SESSION'S OWN SENTENCE, NOT THE OLD ONE'S AND NOT NOTHING. Writing null here left
     * the drawer reading "No description available" on every swapped row: the composed ride had a
     * line, and the run that replaced it had none.
     * ⚠️ `rendered_description` STILL GOES. That one is the materialiser's expanded prose for the
     * discipline being LEFT, and several surfaces prefer it over `description` — leaving it meant a
     * swapped ride kept printing the run's sentence.
     */
    description: lib.description,
    rendered_description: null,
    duration: lib.duration,
    total_duration_seconds: lib.duration * 60,
    steps_preset: [...lib.steps_preset],
    computed: null,
    workout_structure: null,
    intervals: null,
    /**
     * ⛔ THE NEW SESSION'S OWN CLASSIFICATION REPLACES THE OLD ONE. `family:`, `band:`, `sport:`,
     * `level:` and `intensity:` are read all over the app — Today's cue lines, the swap sheet's own
     * band, the week reader — and a ride carrying `family:run_lsd` would be read as a long RUN by
     * every one of them. ⚠️ `swapped_from:` and `discipline_swapped` are set by the caller's patch
     * and survive: they are what stops `get-week` re-creating the original row.
     */
    tags: [...new Set([
      /**
       * ⛔ AND THE LONG-DAY MARKER FOLLOWS THE SPORT. `long_ride` on a run is the old session's word
       * left on the new one — `intensityOf` still bands it long, so nothing breaks loudly, and a
       * reader is told the week's long RIDE is a run. The marker is re-stamped for what this row is
       * now, and only when the row it replaced carried one.
       */
      ...kept.filter((t) => !/^(family|level|sport|intensity|band):/.test(String(t))
        && t !== 'long_run' && t !== 'long_ride'),
      ...(kept.some((t) => t === 'long_run' || t === 'long_ride')
        ? [lib.libraryTags.includes('sport:ride') ? 'long_ride' : 'long_run'] : []),
      ...lib.libraryTags,
    ])],
  };
}

/**
 * Which sports to offer. ⚠️ Derived from what the athlete's own week contains, not from a new field —
 * a plan that has never contained a swim is not evidence they can swim.
 */
export function availableDisciplines(weekSessions: ReadonlyArray<SwappableSession>): Discipline[] {
  const seen = new Set<Discipline>();
  for (const s of weekSessions) {
    const d = disciplineOf(s.type);
    if (d) seen.add(d);
  }
  return (['run', 'ride', 'swim'] as const).filter((d) => seen.has(d));
}
