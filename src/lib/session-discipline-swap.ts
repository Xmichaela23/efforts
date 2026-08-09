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
  const mins = Math.max(1, Math.round(minutes));
  if (d === 'swim') {
    return {
      name: 'Easy Swim',
      description: `~${mins} min easy in the pool. Swapped from another sport — time kept, no pace target.`,
    };
  }
  const noun = d === 'ride' ? 'Ride' : 'Run';
  if (band === 'hard') {
    return {
      name: d === 'ride' ? 'Bike Intervals' : 'Hard Run',
      description: `~${mins} min including the hard work. Swapped from another sport — the effort is the same, the surface is not.`,
    };
  }
  return {
    name: `Easy ${noun}`,
    description: `~${mins} min easy, all conversational. Swapped from another sport — time kept, no pace target.`,
  };
}

/**
 * ⛔ THE DURATION DOES NOT LIVE WHERE I ASSUMED, AND THAT IS WHY THE SWAP NEVER RENDERED (2026-08-08).
 *
 * This read `session.duration` and returned [] when it was falsy — so on a real row the gate closed
 * before anything else was evaluated, silently, on every surface. `resolvePlannedDuration.ts` is the
 * app's own resolver and it reads **`total_duration_seconds` — SECONDS, on the root** — with an
 * explicit note: *"Single source of truth: authoritative stored total only (no fallbacks)"*. That is
 * where the "63:00" on the screen comes from. `duration` (minutes) is populated on raw
 * `planned_workouts` rows but not on the unified item the view actually holds.
 *
 * ⚠️ WHY THIS TAKES A FALLBACK WHERE THE SHARED RESOLVER REFUSES ONE. That resolver returns null
 * rather than guess, because it feeds a DISPLAYED badge and a wrong duration on screen is a lie.
 * Here the number is not displayed — it decides whether a swap can be offered and what the swapped
 * session's copy says. Refusing to answer costs the athlete the control entirely, which is the bug
 * being fixed. So: the authoritative total when it exists, then the row's own minutes, then nothing.
 *
 * ⛔ ORDER MATTERS AND SECONDS COME FIRST. Reading `duration` first would take a stale or rounded
 * minute value over the stored total the rest of the app trusts.
 */
export function resolveMinutes(s: SwappableSession): number {
  const rootSeconds = Number(s.total_duration_seconds);
  if (Number.isFinite(rootSeconds) && rootSeconds > 0) return Math.max(1, Math.round(rootSeconds / 60));
  const computedSeconds = Number(s.computed?.total_duration_seconds);
  if (Number.isFinite(computedSeconds) && computedSeconds > 0) return Math.max(1, Math.round(computedSeconds / 60));
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

  return available
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
          tags: [...new Set([...(session.tags ?? []).filter((t) => !/^(run|ride|bike|swim)_/.test(String(t))), 'discipline_swapped'])],
        },
        warnings: swapWarnings(to, band, sameDayOthers),
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
