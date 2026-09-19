/**
 * ═══ A SWAP IS A `plan_adjustments` ROW — LIFTS AND RUNS/RIDES ALIKE (2026-09-19) ════════════════════════════════
 *
 * ⛔ ONE LIST. The logger's "Rest of plan" lift swap already wrote `plan_adjustments` (`exercise_name` = the slot,
 * `substitute_exercise_name` = what it became, `applies_from`/`applies_until` = the dates, `status` active/reverted)
 * and materialize-plan already applied it (`resolveSwap`). An endurance swap now writes the same kind of row, and the
 * plan rewrite (`rematerialize-standing-block`) reads it when it composes the weeks, so the swapped session is what the
 * plan builds from then on. No new table, no new column, no config key.
 *
 * ⛔ HOW THE EXISTING COLUMNS CARRY AN ENDURANCE SWAP:
 *   · `exercise_name`            = `endurance:<Weekday>:<sport>` — the slot: the weekday and the sport the plan wrote
 *                                  there. Prefixed so the lift readers (`applyAdjustment`, `resolveSwap`,
 *                                  `planAddInjections`, which match lift names by substring) skip it by name.
 *   · `substitute_exercise_name` = the swap sheet's own option id (`optionId`): `discipline:ride`, `workout:sandwich`,
 *                                  `hike:run`, `venue:trainer`.
 *   · `applies_from` / `applies_until` — the scope. ⛔ "JUST TODAY" IS ONE DATE (`applies_until = applies_from`), the
 *                                  table's own window, so it never reaches another date and a rewrite still builds it.
 *                                  "Rest of plan" leaves `applies_until` empty.
 *
 * ⚠️ A MACHINE STACKS ON THE SESSION; everything else replaces it. So a ride moved to the trainer after the run became a
 * ride is two rows, applied in date order, the second built on what the first made — as the taps happened.
 */
import type { ComposedWeek, PlanSession } from '../standing-plan/compose.ts';
import { archetypesFor } from '../endurance-library/index.ts';
import {
  disciplineOf,
  disciplineShellPatch,
  hikePatch,
  intensityOf,
  isDisciplineSwapped,
  originOf,
  RIDE_VENUES,
  RUN_VENUES,
  venueOf,
  venuePatch,
  withLibrarySession,
  workoutFromOf,
  type Discipline,
  type SwappableSession,
  type Venue,
} from './swap.ts';
import { librarySwapSession, swapTargetFamily } from './library-session.ts';
import { composedHardSession, hardSlotOf, workoutChoicePatch } from './workout-choice.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export type SwapAdjustment = {
  id?: string;
  exercise_name: string;
  substitute_exercise_name: string | null;
  applies_from: string;
  applies_until?: string | null;
  status?: string;
  created_at?: string | null;
};

export const ENDURANCE_SLOT_PREFIX = 'endurance:';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayOfDate(iso: string): string {
  return WEEKDAYS[new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay()];
}
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The slot an endurance session is: its weekday and the sport the plan wrote there (`swapped_from:` when swapped). */
export function enduranceSlotName(dateIso: string, session: Pick<SwappableSession, 'type' | 'tags'>): string | null {
  const sport = originOf(session as SwappableSession) ?? disciplineOf(session.type);
  return sport ? `${ENDURANCE_SLOT_PREFIX}${weekdayOfDate(dateIso)}:${sport}` : null;
}

/** An endurance row — the lift readers leave it alone. */
export function isEnduranceAdjustment(a: { exercise_name?: unknown }): boolean {
  return String(a?.exercise_name ?? '').startsWith(ENDURANCE_SLOT_PREFIX);
}

/** A machine stacks on the session; every other option replaces the session. One active row per class and date. */
export function swapClassOf(option: string | null | undefined): 'venue' | 'session' {
  return String(option ?? '').startsWith('venue:') ? 'venue' : 'session';
}

const covers = (a: SwapAdjustment, date: string) =>
  a.applies_from <= date && (!a.applies_until || a.applies_until >= date);

/**
 * ⛔ THE ONE WRITE, for the logger's lift swap and the swap sheet's endurance swap — what `persistPlanSwap` did, moved
 * to the server and given the one-date scope.
 *   · a swap, just today:   that date's earlier one-date swap of the slot goes; a one-date row is added.
 *   · a swap, rest of plan: the slot's swaps from that date on go, an earlier one stops the day before; a row from the
 *                           date on is added.
 *   · back to the plan, just today: that date's one-date swap goes; a rest-of-plan swap covering it skips that date
 *                           (it stops the day before and a copy resumes the day after).
 *   · back to the plan, rest of plan: the slot's swaps from that date on go; an earlier one stops the day before.
 * Only rows of the same class (`sameClass`) — a machine is undone on its own. Reverted rows keep their history
 * (`status: reverted`), as `persistPlanSwap` did.
 */
export async function writeSwapAdjustment(db: Db, a: {
  userId: string;
  planId: string | null;
  slot: string;
  date: string;
  scope: 'today' | 'rest_of_plan';
  /** What the slot becomes; null = back to the plan. */
  substitute: string | null;
  sameClass: (substitute: string | null) => boolean;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await db.from('plan_adjustments')
    .select('id, user_id, plan_id, exercise_name, substitute_exercise_name, applies_from, applies_until, status, reason')
    .eq('user_id', a.userId).eq('exercise_name', a.slot).eq('status', 'active')
    .not('substitute_exercise_name', 'is', null);
  if (error) return { ok: false, error: error.message };
  const rows = ((data ?? []) as Array<SwapAdjustment & Record<string, unknown>>).filter((r) => a.sameClass(r.substitute_exercise_name));
  const revert = async (id: unknown) => db.from('plan_adjustments').update({ status: 'reverted', updated_at: now }).eq('id', id);
  const stopBefore = async (r: SwapAdjustment & Record<string, unknown>) => {
    if (r.applies_from <= addDaysIso(a.date, -1)) {
      await db.from('plan_adjustments').update({ applies_until: addDaysIso(a.date, -1), updated_at: now }).eq('id', r.id);
    } else await revert(r.id);
  };
  const oneDate = (r: SwapAdjustment) => !!r.applies_until && r.applies_until === r.applies_from;
  if (a.scope === 'today') {
    for (const r of rows) {
      if (oneDate(r) && r.applies_from === a.date) { await revert(r.id); continue; }
      if (a.substitute == null && !oneDate(r) && covers(r, a.date)) {
        await stopBefore(r);
        if (!r.applies_until || r.applies_until > a.date) {
          await db.from('plan_adjustments').insert({
            user_id: r.user_id, plan_id: r.plan_id, exercise_name: r.exercise_name,
            substitute_exercise_name: r.substitute_exercise_name, applies_from: addDaysIso(a.date, 1),
            applies_until: r.applies_until ?? null, status: 'active', reason: r.reason,
          });
        }
      }
    }
  } else {
    for (const r of rows) {
      if (r.applies_from >= a.date) await revert(r.id);
      else if (covers(r, a.date)) await stopBefore(r);
    }
  }
  if (a.substitute != null) {
    const { error: e2 } = await db.from('plan_adjustments').insert({
      user_id: a.userId, plan_id: a.planId, exercise_name: a.slot, substitute_exercise_name: a.substitute,
      applies_from: a.date, applies_until: a.scope === 'today' ? a.date : null, status: 'active', reason: a.reason,
    });
    if (e2) return { ok: false, error: e2.message };
  }
  return { ok: true };
}

/**
 * What one option makes of one composed session, built by the swap sheet's own builders so the tap and the rewrite
 * cannot disagree. Null when the option does not hold on this session (a workout this level does not have, a hike on
 * a session that is not long) — the session is then left as the plan wrote it, never forced.
 */
export function sessionForOption(
  session: PlanSession,
  option: string,
  template: (family: string) => PlanSession | null,
): PlanSession | null {
  const row = { ...session, workout_status: 'planned', steps_preset: session.steps_preset ?? null } as SwappableSession & PlanSession;
  const at = option.indexOf(':');
  const kind = option.slice(0, at);
  const arg = option.slice(at + 1);
  let patch: Record<string, unknown> | null = null;
  if (kind === 'workout') {
    const slot = hardSlotOf(row);
    if (!slot || slot.archetype === arg || !archetypesFor(slot.family, slot.level).some((x) => x.id === arg)) return null;
    // ⚠️ No anchors, as the composer is called here: the tokens carry percentages and materialize-plan prices them.
    patch = workoutChoicePatch(row, slot, composedHardSession({ ...slot, archetype: arg, baselines: null }));
  } else if (kind === 'discipline') {
    const from = disciplineOf(row.type);
    const to = disciplineOf(arg);
    if (!from || !to || to === from) return null;
    // ⛔ THE SAME RESOLUTION `resolveSwapWrite` MAKES: the plan's own session of the target family, the library's
    // build when the plan has none, the shell alone when the page blesses no family in this direction.
    const shell = disciplineShellPatch(row, to);
    const band = intensityOf(row);
    const family = swapTargetFamily(from, band);
    const lib = family ? librarySwapSession(row, from, band, template(family) as SwappableSession | null) : null;
    patch = lib ? withLibrarySession(shell, row, lib) : shell;
  } else if (kind === 'hike') {
    if (intensityOf(row) !== 'long') return null;
    patch = hikePatch(row);
  } else if (kind === 'venue') {
    const sport = disciplineOf(row.type);
    const fits = sport === 'ride' ? (RIDE_VENUES as readonly string[]).includes(arg)
      : sport === 'run' ? (RUN_VENUES as readonly string[]).includes(arg) : false;
    if (!fits || venueOf(row) === arg) return null;
    patch = venuePatch(row, arg as Venue);
  }
  if (!patch) return null;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  return {
    ...session,
    type: has('type') ? String(patch.type) : session.type,
    name: has('name') ? String(patch.name ?? '') : session.name,
    description: has('description') ? String(patch.description ?? '') : session.description,
    duration: has('duration') && Number(patch.duration) > 0 ? Number(patch.duration) : session.duration,
    steps_preset: has('steps_preset') ? (Array.isArray(patch.steps_preset) ? patch.steps_preset as string[] : []) : session.steps_preset,
    tags: has('tags') && Array.isArray(patch.tags) ? (patch.tags as unknown[]).map(String) : session.tags,
  };
}

/**
 * ⛔ THE WEEKS, WITH THE ATHLETE'S ENDURANCE SWAPS IN THEM. Each endurance session whose slot and date an active row
 * covers becomes what that row's option makes of it, rows applied in date order (then the order they were made).
 * Lifting sessions are never touched here — materialize-plan applies a lift swap, as it always has.
 */
export function applyEnduranceAdjustments(
  composed: ComposedWeek[],
  adjustments: SwapAdjustment[],
  dateOf: (week: number, day: string) => string | null,
): ComposedWeek[] {
  const live = adjustments
    .filter((a) => isEnduranceAdjustment(a) && a.substitute_exercise_name && (a.status ?? 'active') === 'active')
    .sort((x, y) => x.applies_from.localeCompare(y.applies_from) || String(x.created_at ?? '').localeCompare(String(y.created_at ?? '')));
  if (!live.length) return composed;
  // ⚠️ THE TEMPLATE IS THE PLAN'S OWN SESSION OF THAT FAMILY, the earliest in the block — the composition's copy of
  // the read `resolveSwapWrite` makes against the athlete's rows.
  const template = (family: string): PlanSession | null => {
    for (const wk of composed) {
      for (const s of wk.sessions) if ((s.tags ?? []).includes(`family:${family}`) && (s.steps_preset ?? []).length > 0) return s;
    }
    return null;
  };
  return composed.map((wk) => ({
    ...wk,
    sessions: wk.sessions.map((s) => {
      const date = dateOf(wk.week, String(s.day));
      const slot = date ? enduranceSlotName(date, s as SwappableSession) : null;
      if (!date || !slot) return s;
      let cur = s;
      for (const a of live) {
        if (a.exercise_name !== slot || !covers(a, date)) continue;
        cur = sessionForOption(cur, String(a.substitute_exercise_name), template) ?? cur;
      }
      return cur;
    }),
  }));
}

/** The option a swapped row's own tags say it carries, per class — what a row swapped before this shipped holds. */
export function optionsFromSwapTags(row: SwappableSession & { type?: string | null }, planSport: Discipline): string[] {
  const out: string[] = [];
  const now = disciplineOf(row.type);
  if (isDisciplineSwapped(row)) {
    if (String(row.type ?? '').toLowerCase() === 'walk') out.push(`hike:${planSport}`);
    else if (now && now !== planSport) out.push(`discipline:${now}`);
  } else {
    const planned = workoutFromOf(row);
    const chosen = (row.tags ?? []).map(String).find((t) => t.startsWith('archetype:'))?.slice('archetype:'.length);
    if (planned && chosen && chosen !== planned) out.push(`workout:${chosen}`);
  }
  const venue = venueOf(row);
  if (venue) out.push(`venue:${venue}`);
  return out;
}

/**
 * ⛔ A SWAP MADE BEFORE THIS SHIPPED, READ INTO `plan_adjustments` ONCE — by the first rewrite after deploy, in the code
 * path. `rows` are the slot's sessions not done, today on, in date order, each with the options its tags carry. For
 * each option: when every session of the slot from the first one carrying it to the end of the plan carries it, it was
 * a "Rest of plan" swap and becomes one row from that date; otherwise each carrying session gets its own one-date row
 * (a chosen workout is always one date — the sheet offers it for today only).
 */
export function adjustmentsFromSwapTags(
  slot: string,
  rows: Array<{ date: string; options: string[] }>,
): Array<{ exercise_name: string; substitute_exercise_name: string; applies_from: string; applies_until: string | null }> {
  const out: Array<{ exercise_name: string; substitute_exercise_name: string; applies_from: string; applies_until: string | null }> = [];
  const options = [...new Set(rows.flatMap((r) => r.options))];
  for (const option of options) {
    const first = rows.findIndex((r) => r.options.includes(option));
    const tail = rows.slice(first);
    if (!option.startsWith('workout:') && tail.length > 1 && tail.every((r) => r.options.includes(option))) {
      out.push({ exercise_name: slot, substitute_exercise_name: option, applies_from: rows[first].date, applies_until: null });
      continue;
    }
    for (const r of rows) {
      if (r.options.includes(option)) out.push({ exercise_name: slot, substitute_exercise_name: option, applies_from: r.date, applies_until: r.date });
    }
  }
  return out;
}
