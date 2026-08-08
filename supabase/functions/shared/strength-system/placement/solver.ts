// =============================================================================
// solver placement — the lifts are placed by `_shared/week-solver.ts`, not by a weekday grid
// =============================================================================
//
// ⛔ WHAT THIS REPLACES, AND WHY IT HAD TO GO. `simple.ts` holds a HARDCODED WEEKDAY TEMPLATE:
// *"Hal Higdon (Completion): Mon=Upper, Wed=Lower, Fri=Optional / Jack Daniels (Performance):
// Mon=Upper, Tue=Lower (stacked), Wed=None, Fri=Optional"*. Those weekdays are the METHODOLOGY'S
// EXAMPLE WEEK, not its rule, and `SPEC-week-solver` §0c names this exact translation as the error
// the whole solver exists to end: *"the law's currency is HOURS BETWEEN TWO NAMED SESSIONS, never
// forbidden weekdays."* A grid cannot answer "is this day clear of the long run" — it can only
// answer "is this day Wednesday" — so the moment the athlete moves their long run off Sunday, the
// grid is placing heavy legs by coincidence.
//
// ⛔ AND THE ENGINE ALREADY DOES EVERY RULE THIS WAS ASKED FOR. Nothing new is decided here:
//   • **Lower body never on a hard or long day** — `SAME_DAY_COMPATIBLE.lower_body_strength` is 0
//     against `long_run` and `quality_run`, and `ADJACENCY_HOURS` carries 48h off the long run and
//     24h off quality. The solver refuses those days; this file does not know their names.
//   • **The long day stays clear of ALL lifts by default** — `week-solver`'s score carries
//     `stackHostPenalty` (`longHostedStacks`), which prices a lift stacked onto a `long_run` /
//     `long_ride` above every other stack. It is a preference, so it yields only when the week has
//     nowhere else.
//   • **An upper lift stacks ONLY when the week is genuinely full** — the leaf gates it on
//     arithmetic, not taste: `stacksRequired = anchors + lifts − maxActiveDays`, and any assignment
//     stacking more than that is discarded outright. A week with room stacks nothing.
//   • **Hard efforts spaced apart** — the run week's anchors arrive already placed here (the run
//     generator owns them, see below), and the solver refuses an illegal anchor pair rather than
//     silently seating one.
//
// ⚠️ RUNS FIRST, LIFTS SECOND — AND THAT IS THE ARCHITECTURE, NOT THIS FILE'S CHOICE.
// `generate-run-plan/index.ts` builds the run week and only then calls `overlayStrengthLegacy`. So
// by the time this runs, every run already has a day; they enter the solver as ANCHORS and the bar
// takes what the law leaves. That is the correct priority for a run plan and it is why this adapter
// passes `flexible: []` — there is no endurance left to place.
//
// ⛔ GET STRONGER IS NOT THIS PATH AND MUST NOT BE TOUCHED. `strength-primary-plan.ts` calls
// `solve()` directly with the mirror-image priority (lifts are the spine, endurance is the pin) and
// is byte-identical after this change — it never imported `placement/simple.ts` and does not import
// this either.

import type {
  GuardrailResult,
  IntentSession,
  PlacedSession,
} from '../protocols/types.ts';
import { isLowerIntent } from '../protocols/intent-taxonomy.ts';
import {
  type Anchor,
  type Lift,
  MAX_ACTIVE_DAYS_DEFAULT,
  solve,
  SOLVER_DAYS,
  type SolverDay,
} from '../../../_shared/week-solver.ts';

/** The run week as the overlay describes it. Same shape `simplePlacementPolicy` receives. */
export type PrimarySchedule = {
  longSessionDays: string[];
  qualitySessionDays: string[];
  easySessionDays: string[];
};

const DAY_NAMES: Record<SolverDay, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

/** `'Mon'` / `'monday'` / `'MONDAY'` → a solver day, or null if it cannot be resolved. */
export function toSolverDay(v: string | null | undefined): SolverDay | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return SOLVER_DAYS.find((d) => d === s || d.startsWith(s.slice(0, 3))) ?? null;
}

/**
 * ⛔ THE ANCHOR'S KIND IS THE LAW'S QUESTION, so a day the run plan called "quality" must arrive as
 * `quality_run` and not as "a run". `easy_run` carries 0h against heavy legs and `quality_run`
 * carries 24h; collapsing them would hand the solver a week where every run looks harmless.
 *
 * ⚠️ A DAY LISTED TWICE TAKES ITS HARDEST ROLE. `extractPrimaryScheduleForWeekSessions` can report
 * the same weekday in two buckets (a long run that is also the week's quality session). Anchors do
 * not yield to each other — §2.3 makes a same-day anchor pair a REFUSAL — so the day is emitted
 * once, as the most demanding of its roles.
 */
function buildAnchors(schedule: PrimarySchedule): Anchor[] {
  const byDay = new Map<SolverDay, Anchor>();
  const rank: Record<string, number> = { long_run: 3, quality_run: 2, easy_run: 1 };
  const add = (raw: string, kind: Anchor['kind'], label: string) => {
    const day = toSolverDay(raw);
    if (!day) return;
    const existing = byDay.get(day);
    if (existing && rank[existing.kind] >= rank[kind]) return;
    byDay.set(day, { day, kind, label });
  };
  for (const d of schedule.easySessionDays ?? []) add(d, 'easy_run', 'an easy run');
  for (const d of schedule.qualitySessionDays ?? []) add(d, 'quality_run', 'your hard run');
  for (const d of schedule.longSessionDays ?? []) add(d, 'long_run', 'your long run');
  return [...byDay.values()];
}

/**
 * Place strength sessions around the run week using the shared solver.
 *
 * Signature-compatible with `simplePlacementPolicy.assignSessions` so the swap at the one call site
 * (`generate-run-plan/strength-overlay.ts`) is a single line.
 *
 * ⛔ NO SESSION IS DROPPED. Same promise the run placer makes and for the same reason: by the time
 * this runs, the week is generated and must be rendered. If the solver refuses — a genuinely
 * over-constrained week — every lift it could not seat still gets the best remaining day, and the
 * refusal's own reason is attached as a guardrail warning so the compromise is visible rather than
 * silent (§5.2b: the engine never subtracts, and never subtracts quietly).
 */
export function assignSessionsViaSolver(
  intentSessions: IntentSession[],
  primarySchedule: PrimarySchedule,
  guardrails: GuardrailResult[],
  opts?: { maxActiveDays?: number },
): PlacedSession[] {
  const kept = intentSessions
    .map((session, index) => ({ session, index }))
    .filter(({ index }) => guardrails.find((g) => g.sessionIndex === index)?.finalAction !== 'skip');

  if (kept.length === 0) return [];

  const anchors = buildAnchors(primarySchedule);
  const lifts: Lift[] = kept.map(({ session }, i) => ({
    // The solver's tie-break reads `name`; the intent is what the law cares about.
    name: `${session.intent}#${i}`,
    isLower: isLowerIntent(session.intent),
  }));

  const result = solve({
    anchors,
    lifts,
    maxActiveDays: opts?.maxActiveDays ?? MAX_ACTIVE_DAYS_DEFAULT,
  });

  const placed: PlacedSession[] = [];
  const usedDays = new Set<string>();

  if (result.status !== 'unsolvable') {
    const byName = new Map(result.week.lifts.map((l) => [l.lift, l]));
    kept.forEach(({ session, index }, i) => {
      const hit = byName.get(`${session.intent}#${i}`);
      if (!hit) return;
      const day = DAY_NAMES[hit.day];
      usedDays.add(day);
      const g = guardrails.find((x) => x.sessionIndex === index);
      placed.push({
        ...session,
        day,
        isOptional: false,
        ...(g?.guardrails?.length
          ? { guardrailWarnings: g.guardrails.map((r: { reason?: string }) => r.reason ?? '').filter(Boolean) }
          : {}),
        ...(hit.stackedWith
          ? {
              guardrailModifications: [
                `Shares ${day} with ${hit.stackedWith.label} — lift first, then the run.`,
              ],
            }
          : {}),
      });
    });
  }

  /**
   * ⛔ THE NO-DROP FALLBACK. A refusal is the right answer to an athlete at intake; it is the wrong
   * answer to a week that has already been generated, because the caller has no way to render it and
   * the athlete simply loses a session they were promised. The compromise is stated, not hidden.
   */
  if (placed.length < kept.length) {
    const reason = result.status === 'unsolvable'
      ? result.message
      : 'the week could not seat every lift on a legal day';
    for (const { session } of kept) {
      if (placed.some((p) => p.intent === session.intent && p.name === session.name)) continue;
      const open = SOLVER_DAYS.map((d) => DAY_NAMES[d]).find((d) => !usedDays.has(d))
        ?? DAY_NAMES[SOLVER_DAYS[0]];
      usedDays.add(open);
      placed.push({
        ...session,
        day: open,
        isOptional: false,
        guardrailWarnings: [reason],
      });
    }
  }

  return placed;
}

/** Policy-shaped wrapper, so the call site reads the same as the one it replaces. */
export const solverPlacementPolicy = {
  name: 'week-solver',
  assignSessions: assignSessionsViaSolver,
};
