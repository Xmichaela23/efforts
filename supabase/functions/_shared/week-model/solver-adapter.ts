// ============================================================================
// THE ADAPTER — the week-model behind the slot solver's own interface.
//
// ⛔ WHY AN ADAPTER AND NOT A REWRITE OF THE CALLER. `strength-primary-plan.ts` is 4,000 lines and
// reads `SolverResult` in a dozen places. Changing the engine and the caller in one step means a
// failure could be in either. This takes the SAME input and returns the SAME output shape, so the
// swap is one import line and reverting is one import line.
//
// ⛔ WHAT ACTUALLY CHANGES BEHIND IT — the reason the swap exists:
//   • **Coupling.** A heavy lower lift and its matching hard cardio become ONE unit that cannot be
//     split. The slot solver had no way to say two sessions belong together, only that they were
//     permitted to touch, which is why a squat could never FOLLOW a hard run onto a day.
//   • **Debt.** A session's cost is a duration on a named system, checked around a REPEATING week.
//     The slot solver held pairwise hour clearances and could not say "this is still outstanding on
//     Tuesday".
//   • **Refusal is relational.** "X needs `long_effort` clear; Y leaves it outstanding another 24h;
//     it clears on Tuesday" — instead of "there was no day left".
//
// ⚠️ WHAT DELIBERATELY DOES NOT COME ACROSS. The slot solver's relaxation ladder, its score vector,
// `flexibleRanking`, `flexibleAvoid`, `preferredClearance` and the methodology-constraint channel
// have no equivalent here and are IGNORED, not emulated. They exist because the slot model could
// not express the law directly and needed tie-breakers to approximate it. Re-implementing them on
// top of a model that states the law outright would be rebuilding the thing this replaces.
// ⛔ If a caller's behaviour depends on one of them, that is a finding to report — not a reason to
// grow this file a fifth ranking term.
// ============================================================================

import type { MatrixSessionKind } from '../schedule-session-constraints.ts';
import type {
  Anchor,
  FlexibleSession,
  Lift,
  PlacedFlexible,
  PlacedLift,
  SolverDay,
  SolverInput,
  SolverResult,
} from '../week-solver.ts';
import { type Load, type Session, type Sport, buildUnits, COUPLED_GAP_HOURS, DAY_NAMES } from './model.ts';
import { type Placement, resolve, restDaysOf, unmetNeeds } from './resolve.ts';

const SOLVER_DAYS: SolverDay[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

/**
 * ⛔ THE MATRIX'S VOCABULARY → THE MODEL'S. Ten kinds collapse to five loads, and the collapse IS
 * the point: the matrix named sessions by discipline and intensity, the model names them by what
 * they LEAVE BEHIND. `quality_run` and `quality_bike` are one thing here because they cost the same
 * recovery; `long_run` and `long_ride` likewise.
 *
 * ⚠️ `quality_swim` MAPS TO `easy`. Swimming is not weight-bearing and leaves nothing the barbell or
 * the run needs back — the swim's real cost in this system is the lat/shoulder tension the assistance
 * gate handles, which is a VOLUME question, not a placement one.
 */
const LOAD_FOR_KIND: Record<MatrixSessionKind, Load> = {
  easy_bike: 'easy',
  easy_run: 'easy',
  easy_swim: 'easy',
  quality_swim: 'easy',
  quality_bike: 'hard_cardio',
  quality_run: 'hard_cardio',
  long_ride: 'long_cardio',
  long_run: 'long_cardio',
  lower_body_strength: 'heavy_lower',
  upper_body_strength: 'upper',
};

/** The discipline, where the model needs it — only the pairing reads this. */
const SPORT_FOR_KIND: Partial<Record<MatrixSessionKind, Sport>> = {
  easy_run: 'run', quality_run: 'run', long_run: 'run',
  easy_bike: 'bike', quality_bike: 'bike', long_ride: 'bike',
  easy_swim: 'swim', quality_swim: 'swim',
};

const dayIndexOf = (d: SolverDay): number => SOLVER_DAYS.indexOf(d);

export function solveWithWeekModel(input: SolverInput): SolverResult {
  const sessions: Session[] = [];
  const pins: Record<string, number> = {};

  // ⛔ IDS ARE PREFIXED BY CLASS so the mapping back is exact. Two anchors can share a label, a lift
  // and a flexible session can share a name, and matching on the athlete-facing string is how a
  // week silently loses a session.
  input.anchors.forEach((a: Anchor, i) => {
    const id = `a${i}`;
    sessions.push({ id, label: a.label, load: LOAD_FOR_KIND[a.kind], sport: SPORT_FOR_KIND[a.kind], minutes: 60 });
    pins[id] = dayIndexOf(a.day);
  });
  input.lifts.forEach((l: Lift, i) => {
    sessions.push({
      id: `l${i}`,
      label: l.name,
      load: l.isLower ? 'heavy_lower' : 'upper',
      minutes: 60,
    });
  });
  (input.flexible ?? []).forEach((f: FlexibleSession, i) => {
    sessions.push({ id: `f${i}`, label: f.name, load: LOAD_FOR_KIND[f.kind], sport: SPORT_FOR_KIND[f.kind], minutes: 60 });
  });

  /**
   * ⛔ THERE IS NO REFUSAL PATH LEFT, AND THAT IS MICHAEL'S RULING (2026-08-17).
   *
   * A gate stood here: two anchors on one day that both cost the legs returned `unsolvable`, on the
   * reasoning that both were the athlete's own and picking one would be the engine overruling them.
   * **That is still true and it is still not a reason to refuse.** *"If the athlete needs to pin a
   * ridiculous schedule because of their real-life constraints, let them. The engine's job is to warn
   * them of the biological cost, not physically block them from building their week."*
   *
   * ⚠️ THE COLLISION IS NOT LOST — it comes out of `unmetNeeds` as a `compromised` week with the
   * debt named, which is a better answer than a dead end: it says WHAT is outstanding, WHO owes it
   * and WHEN it clears. ⛔ Do not restore a refusal here; the `unsolvable` arm of `SolverResult`
   * stays in the type for the old engine's sake and this adapter never returns it.
   */
  const units = buildUnits(sessions, pins);
  const r = resolve(units, { minRestDays: 1 });
  const placements: Placement[] = r.ok ? r.placements : r.best;

  /** Where each session id landed. */
  const dayOfSession = new Map<string, number>();
  for (const p of placements) for (const s of p.unit.sessions) dayOfSession.set(s.id, p.day);

  /**
   * ⛔ THE STACK NOTE IS DERIVED FROM THE UNIT, NOT RE-DISCOVERED. `stackedWith` is what tells the
   * plan a day is one ordered bucket — Eddens: resistance BEFORE endurance, +6.91% lower-body
   * dynamic strength. In this model the unit already carries the order and the gap, so the note is
   * a read rather than a second opinion.
   */
  const stackFor = (sessionId: string): PlacedLift['stackedWith'] => {
    const unit = placements.find((p) => p.unit.sessions.some((s) => s.id === sessionId))?.unit;
    if (!unit || unit.sessions.length < 2) return undefined;
    if (unit.sessions[0].id !== sessionId) return undefined;
    return { label: unit.sessions[1].label, gapHours: unit.internalGapHours || COUPLED_GAP_HOURS, order: 'lift_first' };
  };

  const lifts: PlacedLift[] = input.lifts.map((l, i) => {
    const day = dayOfSession.get(`l${i}`) ?? 0;
    const stacked = stackFor(`l${i}`);
    return { lift: l.name, isLower: l.isLower, day: SOLVER_DAYS[day], ...(stacked ? { stackedWith: stacked } : {}) };
  });

  const flexible: PlacedFlexible[] = (input.flexible ?? []).map((f, i) => {
    const day = dayOfSession.get(`f${i}`) ?? 0;
    // Anything else on the day, so the caller can say what it shares with.
    const shares = placements
      .filter((p) => p.day === day)
      .flatMap((p) => p.unit.sessions)
      .find((s) => s.id !== `f${i}` && s.load !== 'easy');
    return {
      name: f.name,
      kind: f.kind,
      day: SOLVER_DAYS[day],
      ...(shares ? { sharesDayWith: { label: shares.label } } : {}),
    };
  });

  const restDays = restDaysOf(placements).map((d) => SOLVER_DAYS[d]);
  const activeDays = SOLVER_DAYS.filter((d) => !restDays.includes(d));
  const week = { lifts, flexible, activeDays, restDays };

  if (r.ok) return { status: 'solved', week, compromises: [], notes: [] };

  /**
   * ⛔ A WEEK THAT BREAKS A RULE IS STILL BUILT, AND THE REASON IS RELATIONAL (D-325 §7 both ways).
   * The rule is never bent silently and the athlete is never left with nothing — they are told which
   * debt is outstanding, who owes it, and when it clears, which is something they can act on.
   */
  const seen = new Set<string>();
  const compromises: string[] = [];
  for (const u of unmetNeeds(placements)) {
    const key = `${u.unit}|${u.system}|${u.blockedBy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const what = u.system === 'long_effort' ? 'a long effort' : 'heavy legs';
    compromises.push(
      `${u.unit} needs ${u.shortBy}h more clearance from ${what}: ${u.blockedBy} leaves it `
      + `outstanding until ${DAY_NAMES[u.clearsAtDay]}.`,
    );
  }
  if (compromises.length === 0 && restDays.length === 0) {
    compromises.push('Every day carries a session — the week has no rest day left.');
  }
  return { status: 'compromised', week, compromises, notes: [] };
}
