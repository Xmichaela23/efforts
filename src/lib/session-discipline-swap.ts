// =============================================================================
// session-discipline-swap — run ↔ ride ↔ swim, at ONE shared layer
// =============================================================================
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

import { resolveMovingSeconds } from '../utils/resolveMovingSeconds';
import {
  areSameDayCompatible,
  type MatrixSessionKind,
  requiredAdjacencyHours,
  stackNeedsRecoveryGap,
} from '../../supabase/functions/_shared/schedule-session-constraints.ts';

export type Discipline = 'run' | 'ride' | 'swim';

/** The session as the client holds it (`planned_workouts` row, loosely typed at the call site). */
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

export type SwapOption = {
  to: Discipline;
  label: string;
  /** The patch to apply to `planned_workouts`. Duration is deliberately absent — see `buildSwap`. */
  patch: Record<string, unknown>;
  /** Non-blocking. Empty when the swap creates no conflict with the rest of that day. */
  warnings: string[];
};

const DISCIPLINE_OF: Record<string, Discipline | null> = {
  run: 'run', running: 'run',
  ride: 'ride', bike: 'ride', cycling: 'ride',
  swim: 'swim', swimming: 'swim',
};

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

export function disciplineOf(type: string | null | undefined): Discipline | null {
  return DISCIPLINE_OF[String(type ?? '').toLowerCase()] ?? null;
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
  if (tags.includes('long_run') || tags.includes('long_ride') || tags.includes('long') || /\blong\b/.test(name)) {
    return 'long';
  }
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
 */
export function resolveMinutes(s: SwappableSession): number {
  const secs = resolveMovingSeconds({ workout_status: 'planned', ...(s as Record<string, unknown>) });
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
): SwapOption[] {
  const from = disciplineOf(session.type);
  if (!from) return [];
  /**
   * ⛔ UNSTARTED ONLY, AND THE CHECK LIVES HERE (2026-08-08). The callers each had their own
   * `!isCompleted` guard, which meant "should the button exist" and "should the swap be offered"
   * were two questions asked in two places — exactly how a button and its sheet start disagreeing.
   * Swapping the sport of a session already logged would also rewrite history, not a plan.
   */
  const status = String(session.workout_status ?? 'planned').toLowerCase();
  if (status === 'completed' || status === 'skipped') return [];
  const band = intensityOf(session);
  if (band === 'long') return [];

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
  const targets = available.filter((d) => (band === 'hard' ? d !== 'swim' : true));

  return targets
    .filter((d) => d !== from)
    .map((to) => {
      const { name, description } = describeSwap(to, band, minutes);
      return {
        to,
        label: to === 'ride' ? 'Ride instead' : to === 'swim' ? 'Swim instead' : 'Run instead',
        patch: {
          type: to,
          name,
          description,
          // ⛔ duration is NOT in the patch — it is already correct on the row and re-writing it is
          // how a preserved value gets accidentally rounded. Stated so nobody "fixes" the omission.
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
          tags: [...new Set([
            ...(session.tags ?? []).filter((t) => !/^(run|ride|bike|swim)_/.test(String(t))),
            'discipline_swapped',
            `swapped_from:${originOf(session) ?? from}`,
          ])],
        },
        warnings: [
          ...swapWarnings(to, band, sameDayOthers),
          // The doctrine's own caution, surfaced rather than enforced.
          ...(band === 'hard' && from === 'ride' && to === 'run'
            ? ['Hard running costs the legs more than hard riding — the plan put this on the bike for that reason.']
            : []),
        ],
      };
    });
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
