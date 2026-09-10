/**
 * ═══ THE INSTEAD SHEET, ASSEMBLED ON THE SERVER (2026-09-10, audit H-T15) ═════════════════════════
 *
 * ⛔ WHAT THREE PHONE SCREENS USED TO PUT TOGETHER, IN ONE PLACE.
 *   · Today's sheet listed `revertOptions`, then `sessionSwapExtras`, then `getDisciplineSwaps`.
 *   · The workout drawer listed `getDisciplineSwaps` only.
 *   · Today's session glyph and the calendar chip asked `getDisciplineSwaps` whether anything was
 *     offered at all.
 * Each fed the library its own copy of the week, the day, the posture and the FTP. `swap-session`
 * loads those once, and this file builds the answer each screen renders.
 *
 * ⚠️ THE WORDS ARE THE ONES THE SHEET SHOWED. The button is `swapButtonLabel`. The line is
 * `swapLineFor` for a machine and for the way back; for a sport swap or the hike it is
 * `swapSessionLine` over the session the tap will write, resolved by the same `resolveSwapWrite` the
 * write uses — which is what `SwapPreviewLine` did on the phone.
 */
import {
  availableDisciplines,
  disciplineOf,
  getDisciplineSwaps,
  intensityOf,
  isPlanTwin,
  matrixKindFor,
  resolveMinutes,
  revertOptions,
  sameSwapOn,
  sessionSwapExtras,
  type SwapOption,
  type SwappableSession,
} from './swap.ts';
import type { MatrixSessionKind } from '../schedule-session-constraints.ts';
import type { PerDisciplinePosture } from '../state-trend/posture.ts';
import { swapButtonLabel, swapLineFor, swapSessionLine, SWAP_BACK_TO_PLAN, SWAP_SHEET_HEADER } from './copy.ts';
import { resolveSwapWrite } from './resolve-write.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export type SwapRow = SwappableSession & {
  id?: string;
  date?: string | null;
  training_plan_id?: string | null;
  week_number?: number | null;
};

export type SwapContext = {
  session: SwapRow;
  /**
   * The session's Monday-to-Sunday week as get-week lists it: every planned row, and every completed
   * activity that is not already a planned row's. Which sports to offer, the ground-impact count and
   * the same-day warnings all read it.
   */
  week: SwapRow[];
  posture: PerDisciplinePosture | null;
  /** Usable FTP (learned or typed), or null — gates the hard ride only. */
  ftp: number | null;
};

/** The option's id on the wire: its kind and its target, the key the sheet already keyed its buttons on. */
export function optionId(o: Pick<SwapOption, 'kind' | 'venue' | 'to'>): string {
  return `${o.kind ?? 'discipline'}:${o.venue ?? o.to}`;
}

/** The rest of that day in the law's vocabulary, so a warning is about a real pairing. */
export function sameDayOthers(session: SwapRow, week: ReadonlyArray<SwapRow>): Array<{ kind: MatrixSessionKind; label: string }> {
  const day = String(session?.date ?? '').slice(0, 10);
  const out: Array<{ kind: MatrixSessionKind; label: string }> = [];
  for (const it of week) {
    if (String(it?.date ?? '').slice(0, 10) !== day || String(it?.id) === String(session?.id)) continue;
    const d = disciplineOf(it?.type);
    const kind: MatrixSessionKind | null = String(it?.type || '').toLowerCase() === 'strength'
      ? (/squat|deadlift|lunge|leg/i.test(String(it?.name || '')) ? 'lower_body_strength' : 'upper_body_strength')
      : d ? matrixKindFor(d, intensityOf(it)) : null;
    if (kind) out.push({ kind, label: String(it?.name || 'another session') });
  }
  return out;
}

/** Every option, in the sheet's order: the way back, then the machine and the hike, then the sports. */
export function sheetOptions(ctx: SwapContext): SwapOption[] {
  const { session, week, posture, ftp } = ctx;
  return [
    ...revertOptions(session, session.training_plan_id ?? null),
    ...sessionSwapExtras(session, posture, week),
    ...getDisciplineSwaps(session, availableDisciplines(week), sameDayOthers(session, week), posture, ftp),
  ];
}

/** Does this session carry the swap glyph? The question Today's card and the calendar chip asked. */
export function hasSportSwap(ctx: SwapContext): boolean {
  return getDisciplineSwaps(ctx.session, availableDisciplines(ctx.week), [], ctx.posture, ctx.ftp).length > 0;
}

/**
 * ⛔ AN EASY SESSION OFFERS JUST TODAY ONLY (Michael, 2026-09-10). Easy work can be any sport on any
 * day; swapping every later easy ride for a run is a different plan, not a swap.
 */
export function restOfPlanOffered(session: SwapRow): boolean {
  return intensityOf(session) !== 'easy';
}

export type SheetOption = {
  id: string;
  kind: string;
  venue: string | null;
  to: string;
  /** A sport swap — the only kind the workout drawer lists. */
  sport: boolean;
  label: string;
  line: string | null;
  warnings: string[];
};

export type Sheet = { header: string; rest_of_plan: boolean; options: SheetOption[] };

async function lineFor(db: Db, userId: string, session: SwapRow, option: SwapOption): Promise<string | null> {
  const kind = option.kind ?? 'discipline';
  if (kind !== 'discipline' && kind !== 'hike') return swapLineFor(option);
  const replacing = (disciplineOf(session?.type) ?? 'run') as 'ride' | 'run' | 'swim';
  const long = intensityOf(session) === 'long';
  // The hike keeps the long session's own minutes; there is no other session to resolve.
  if (kind === 'hike') return swapSessionLine({ name: 'Hike', minutes: resolveMinutes(session), long: true, replacing });
  try {
    const write = await resolveSwapWrite(db, userId, session, option);
    const patch = write.patch as { name?: unknown; duration?: unknown };
    // ⚠️ A SHELL PATCH CARRIES NO DURATION — the row keeps its own time, so its own minutes are the
    // length it will have.
    const minutes = Number(patch.duration) > 0 ? Number(patch.duration) : resolveMinutes(session);
    return swapSessionLine({ name: String(patch.name ?? ''), minutes, long, replacing });
  } catch (e) {
    // A failed read is no line, never a wrong one.
    console.warn('[swap] could not resolve the session for the sheet line', e);
    return null;
  }
}

/** The sheet for one session: header, whether "Rest of plan" is offered, and each option's words. */
export async function describeSheet(db: Db, userId: string, ctx: SwapContext): Promise<Sheet> {
  const options: SheetOption[] = [];
  for (const o of sheetOptions(ctx)) {
    options.push({
      id: optionId(o),
      kind: o.kind ?? 'discipline',
      venue: o.venue ?? null,
      to: o.to,
      sport: (o.kind ?? 'discipline') === 'discipline',
      label: swapButtonLabel(o),
      line: await lineFor(db, userId, ctx.session, o),
      warnings: o.warnings,
    });
  }
  return { header: SWAP_SHEET_HEADER, rest_of_plan: restOfPlanOffered(ctx.session), options };
}

/**
 * The toast after a tap, as Today worded it. ⛔ THE WAY BACK USES THE SHEET'S OWN LINE (§8): Michael
 * approved `Back to the plan.` and gave no separate confirmation for it.
 * ⛔ SAY HOW MANY, NOT "rest of plan": what the athlete gets is the sessions the plan actually held.
 */
export function receiptFor(option: Pick<SwapOption, 'kind' | 'venue' | 'to'>, alsoWritten: number): string {
  const what = option.kind === 'revert'
    ? SWAP_BACK_TO_PLAN
    : option.kind === 'venue'
      ? `Moved to the ${(swapButtonLabel(option) || 'machine').toLowerCase()}`
      : option.kind === 'hike'
        ? 'Swapped to a hike'
        : `Swapped to a ${option.to === 'ride' ? 'ride' : option.to}`;
  return alsoWritten > 0 ? `${what} — this and ${alsoWritten} later` : what;
}

export type ApplyResult =
  | { ok: true; receipt: string; alsoWritten: number; ids: string[] }
  | { ok: false; error: string };

/**
 * Write the chosen option to the session and, for "Rest of plan", to its later repeats — Today's apply
 * path, moved as it was.
 *
 * ⛔ THE OPTION IS RE-DERIVED HERE, NEVER TAKEN FROM THE PHONE. The tap names an option by id; the
 * patch is built from the stored row now. An option the row no longer offers is refused.
 *
 * ⛔ EVERY LATER REPEAT IS RE-ASKED ONE ROW AT A TIME (`isPlanTwin`, `sameSwapOn`), because a patch
 * is built from the row it was built for. A later row that cannot take the swap is skipped, not
 * forced, and a failure on a later row does not undo today's.
 *
 * ⚠️ THE LATER ROWS' OWN WEEKS ARE NOT LOADED, as before: the sports on offer come from this
 * session's week and the ground-impact gate is "not asked" (the treadmill is offered, nothing else).
 */
export async function applySwap(args: {
  db: Db;
  userId: string;
  ctx: SwapContext;
  optionId: string;
  restOfPlan: boolean;
  materialize: (plannedId: string) => Promise<void>;
}): Promise<ApplyResult> {
  const { db, userId, ctx, materialize } = args;
  const session = ctx.session;
  const option = sheetOptions(ctx).find((o) => optionId(o) === args.optionId);
  if (!option) return { ok: false, error: 'This swap is no longer offered for this session' };

  const write = await resolveSwapWrite(db, userId, session, option);
  // ⛔ A RESTORE THAT FOUND NOTHING IS NOT A RESTORE (§8).
  if (write.ok === false) return { ok: false, error: 'The plan no longer holds this session' };
  const { error } = await db.from('planned_workouts').update(write.patch).eq('id', session.id).eq('user_id', userId);
  if (error) return { ok: false, error: error.message ?? 'Could not write the session' };
  // ⛔ A LIBRARY SESSION IS TOKENS; it is not a session until the expander has run.
  if (write.needsMaterialize) await materialize(String(session.id));

  const ids = [String(session.id)];
  let alsoWritten = 0;
  if (args.restOfPlan && restOfPlanOffered(session)) {
    try {
      let q = db
        .from('planned_workouts')
        .select('*')
        .eq('user_id', userId)
        .eq('workout_status', 'planned')
        .gt('date', String(session.date).slice(0, 10));
      if (session.training_plan_id) q = q.eq('training_plan_id', session.training_plan_id);
      const { data: later } = await q;
      for (const row of (Array.isArray(later) ? later : []) as SwapRow[]) {
        if (!isPlanTwin(session, row)) continue;
        const same = sameSwapOn(row, option, {
          available: availableDisciplines(ctx.week),
          posture: ctx.posture,
          ftp: ctx.ftp,
          weekSessions: [],
        });
        if (!same) continue;
        const laterWrite = await resolveSwapWrite(db, userId, row, same);
        if (laterWrite.ok === false) continue;
        const { error: e2 } = await db.from('planned_workouts').update(laterWrite.patch).eq('id', row.id).eq('user_id', userId);
        if (e2) continue;
        if (laterWrite.needsMaterialize) await materialize(String(row.id));
        ids.push(String(row.id));
        alsoWritten += 1;
      }
    } catch (e) {
      console.warn('[swap] rest-of-plan write failed after today succeeded:', e);
    }
  }
  return { ok: true, receipt: receiptFor(option, alsoWritten), alsoWritten, ids };
}
