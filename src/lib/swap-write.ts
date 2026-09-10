/**
 * ═══ WHAT A SWAP ACTUALLY WRITES ═════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-endurance-swaps-2026-09-09.md §7.
 *
 * ⛔ TWO SCREENS APPLY A SWAP — Today's sheet and the workout drawer — and they each wrote
 * `option.patch` straight to the row. §7 makes the write more than the patch: a sport swap has to
 * hand over the composer's own session for the new sport, which needs a read the pure library cannot
 * do. Putting that in one screen would leave the other one still writing a shell, so it lives here
 * and both screens ask the same question.
 *
 * ⚠️ THE PURE LIBRARY STILL DECIDES WHAT IS OFFERED. This file only resolves what the offered thing
 * writes; every gate — posture, band, the ground-impact rule, unstarted-only — stays in
 * `session-discipline-swap`.
 */
import { supabase } from '@/lib/supabase';
import {
  disciplineOf,
  intensityOf,
  withLibrarySession,
  type SwapOption,
  type SwappableSession,
} from './session-discipline-swap';
import { originOf } from './session-discipline-swap';
import { swapTargetFamily, librarySwapSession } from './swap-library-session';

/** `2026-09-14` → `Monday`. The names `sessions_by_week` authors days under. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
function dayNameFromISO(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : DAY_NAMES[d.getUTCDay()];
}

/**
 * The plan vocabulary's own normalisation, transcribed from `get-week/index.ts` where the authored
 * blob is read into rows. ⚠️ IT MUST STAY THE SERVER'S, not a second opinion: the restore has to
 * match the session get-week would have inserted, or "back to the plan" gives back a different row
 * from the one the plan holds.
 */
function normPlanType(s: Record<string, unknown>): string | null {
  const raw = String((s?.type ?? s?.discipline ?? '') || '').trim().toLowerCase();
  if (Array.isArray(s?.mobility_exercises) && (s.mobility_exercises as unknown[]).length > 0) return 'mobility';
  if (raw === 'brick') return 'brick';
  if (raw === 'bike' || raw === 'cycling' || raw === 'ride') return 'ride';
  if (raw === 'walk') return 'walk';
  if (raw === 'strength' || raw === 'lift' || raw === 'weights') return 'strength';
  if (raw === 'swim') return 'swim';
  if (raw === 'run') return 'run';
  if (raw === 'mobility') return 'mobility';
  if (raw === 'pilates_yoga' || raw === 'pilates' || raw === 'yoga') return 'pilates_yoga';
  return null;
}

export type SwapWrite = {
  patch: Record<string, unknown>;
  /**
   * ⛔ FALSE WHEN A REVERT COULD NOT FIND THE AUTHORED SESSION. The caller must not write an empty
   * patch and call it a restore — it would leave the row swapped and tell the athlete it was not.
   */
  ok?: boolean;
  /**
   * True when the row must go through `materialize-plan` before it is a real session. ⛔ A LIBRARY
   * SESSION IS ALWAYS TOKENS, so it always does — the watts and paces only exist once the expander
   * has run them against this athlete's numbers.
   */
  needsMaterialize: boolean;
};

/**
 * The row the swap writes, resolved against the athlete's own plan.
 *
 * ⚠️ THEIR OWN ROW IS THE FIRST ANSWER, and that is the point rather than an optimisation. Their
 * plan already holds the composer's session for that family — at their level, their volume, their
 * baselines. Re-deriving it would be a SECOND composer, and a second composer is how two screens
 * start disagreeing. `librarySwapSession` falls back to a fresh library build only when the plan has
 * no session of that family at all.
 *
 * ⚠️ AND A FAILED READ IS NOT A FAILED SWAP. If the query throws, the athlete's tap still writes the
 * patch the library built rather than being refused.
 */
export async function resolveSwapWrite(
  userId: string,
  row: SwappableSession & { id?: string; type?: string | null },
  option: SwapOption,
): Promise<SwapWrite> {
  const plain: SwapWrite = { patch: option.patch, needsMaterialize: option.needsMaterialize, ok: true };

  /**
   * ═══ §8 — BACK TO THE PLAN ═════════════════════════════════════════════════════════════════════
   *
   * ⛔ THE ROW THE PLAN AUTHORED, NOT A SWAP BACK. Swapping the ride to a run would write the
   * LIBRARY's run at this athlete's level — a perfectly good session, and not the one the plan
   * prescribed. `plans.sessions_by_week` still holds the original, untouched (the swap deliberately
   * never writes to the blob), so the restore reads it and puts it back.
   *
   * ⚠️ IT IS A PATCH, NOT A DELETE. Deleting the row and letting `get-week` re-insert it from the
   * blob would also work and is one line — but it only works while the plan is `active`, it destroys
   * the row before knowing the replacement lands, and it makes a restore depend on a background
   * re-read. Writing the authored fields onto the row the athlete is looking at fails safely.
   *
   * ⚠️ `materialize-plan` DOES THE EXPANSION, exactly as it does for a row `get-week` inserts. The
   * blob holds tokens (`steps_preset`); the paces and watts only exist once it has run.
   */
  if (option.kind === 'revert') {
    // The machine's revert is the tag the library already built — no session to restore.
    if (option.venue) return plain;
    return resolveRevertToPlan(userId, row);
  }
  // ⛔ A MACHINE OR A HIKE IS NOT A SPORT SWAP. p275's machine is the same session performed
  // elsewhere, so there is no other session to hand over — it changes a tag and nothing else.
  if ((option.kind ?? 'discipline') !== 'discipline') return plain;

  const from = disciplineOf(row?.type);
  if (!from || option.to === from) return plain;
  const band = intensityOf(row);
  const family = swapTargetFamily(from, band);
  if (!family) return plain;

  let template: SwappableSession | null = null;
  try {
    const { data } = await supabase
      .from('planned_workouts')
      .select('id,date,name,description,tags,duration,total_duration_seconds,steps_preset,workout_status')
      .eq('user_id', userId)
      .contains('tags', [`family:${family}`])
      .order('date', { ascending: true })
      // ⚠️ A FEW ROWS, NOT ONE. The earliest match can be a row THIS athlete already swapped, and a
      // swapped row is a copy of the composer's session rather than the composer's session.
      // `librarySwapSession` refuses those; asking for one row would hand it nothing to fall back on.
      .limit(8);
    template = (Array.isArray(data) ? data : [])
      .find((r: any) => !(r?.tags ?? []).includes('discipline_swapped')) as never ?? null;
  } catch (e) {
    console.warn('[swap] could not read the athlete\'s own session for', family, e);
  }

  const lib = librarySwapSession(row, from, band, template);
  if (!lib) return plain;
  return { patch: withLibrarySession(option.patch, row, lib), needsMaterialize: true };
}

/**
 * Reads the authored session for this row out of its plan and returns the patch that puts it back.
 *
 * ⚠️ THE LOOKUP IS THE SERVER'S: plan → `sessions_by_week[week_number]` → the sessions authored for
 * this DATE'S day name → the one whose type is the discipline the row was swapped FROM. That last
 * clause is what makes it unambiguous on a day carrying two sessions.
 */
async function resolveRevertToPlan(
  userId: string,
  row: SwappableSession & { id?: string; date?: string | null; week_number?: number | null; training_plan_id?: string | null },
): Promise<SwapWrite> {
  const fail: SwapWrite = { patch: {}, needsMaterialize: false, ok: false };
  const planId = row?.training_plan_id ? String(row.training_plan_id) : null;
  const week = Number(row?.week_number);
  if (!planId || !Number.isFinite(week) || week < 1) return fail;

  const want = originOf(row);
  if (!want) return fail;

  let blob: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from('plans')
      .select('sessions_by_week')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    blob = ((data as { sessions_by_week?: Record<string, unknown> } | null)?.sessions_by_week ?? null) as never;
  } catch (e) {
    console.warn('[swap] could not read the plan to restore the original session', e);
    return fail;
  }
  if (!blob) return fail;

  // Tolerant of the same three shapes `get-week` accepts: an array, an object of arrays, a single.
  const raw = (blob as Record<string, unknown>)[String(week)];
  const weekArr: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : v ? [v] : [])) as Array<Record<string, unknown>>
      : raw ? [raw as Record<string, unknown>] : [];
  if (!weekArr.length) return fail;

  const dayName = dayNameFromISO(String(row?.date ?? ''));
  const authored = weekArr.find((sn) => String(sn?.day ?? '').trim() === dayName && normPlanType(sn) === (want === 'ride' ? 'ride' : want));
  if (!authored) return fail;

  const name = typeof authored.name === 'string' ? authored.name
    : typeof authored.title === 'string' ? authored.title : null;
  if (!name) return fail;

  const description = typeof authored.description === 'string' ? authored.description
    : typeof authored.title === 'string' ? authored.title : null;

  /**
   * ⛔ EVERY FIELD THE SWAP TOUCHED IS PUT BACK OR CLEARED, and the list is the swap's own: `type`,
   * `name`, `description`, `rendered_description`, `steps_preset`, `duration`,
   * `total_duration_seconds`, `computed`, `workout_structure`, `intervals`, `tags`.
   *
   * ⚠️ THE DURATIONS GO TO NULL RATHER THAN THE BLOB'S. The blob authors tokens, not a total; the
   * total is `materialize-plan`'s answer for this athlete, and writing a stale one would survive the
   * expansion and print a length the steps do not add up to.
   *
   * ⚠️ AND THE TAGS ARE THE AUTHORED ONES OUTRIGHT — no merge. `discipline_swapped`,
   * `swapped_from:`, `swapped_name:` and any `venue:` all have to go, and every tag the swap added
   * (`family:` and `sport:` for the sport it became) is the wrong sport now.
   */
  return {
    ok: true,
    needsMaterialize: true,
    patch: {
      type: normPlanType(authored),
      name,
      description,
      rendered_description: null,
      steps_preset: Array.isArray(authored.steps_preset) ? authored.steps_preset : null,
      workout_structure: authored.workout_structure && typeof authored.workout_structure === 'object' ? authored.workout_structure : null,
      export_hints: authored.export_hints && typeof authored.export_hints === 'object' ? authored.export_hints : null,
      strength_exercises: Array.isArray(authored.strength_exercises) ? authored.strength_exercises : null,
      mobility_exercises: Array.isArray(authored.mobility_exercises) ? authored.mobility_exercises : null,
      intervals: null,
      computed: null,
      duration: null,
      total_duration_seconds: null,
      tags: Array.isArray(authored.tags) ? authored.tags : [],
    },
  };
}
