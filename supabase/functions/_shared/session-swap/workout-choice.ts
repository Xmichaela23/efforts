/**
 * ═══ CHOOSE THE WORKOUT ON THE DAY (2026-09-11) ══════════════════════════════════════════════════
 *
 * ⛔ WHAT WAS MISSING. The hard session's workout could be chosen only in the plan builder
 * (`HardSlotChoices`, used by `NonRaceBuilder` alone), and since 2026-09-11 not even there: both
 * programmes' builders now leave the shape to the engine's week-to-week rotation (p112) and say
 * "Choose the workout on the day." Nothing on a built plan — Today, the drawer, State Adjust, the
 * Instead sheet — could change a built hard session's workout. This is that control.
 *
 * ⛔ WHAT IT OFFERS. On a planned, not-done hard session, the book's other workouts for the
 * session's own family at the session's own level — the library's list (`archetypesFor`), the same
 * list the builder's picker offered for that slot. Where a programme names the shapes a slot rotates
 * through (`EnduranceSlot.archetypes` — p247's Wednesday), that list, because it is what the engine
 * rotates there. The option's name is the workout's own label and its minutes.
 *
 * ⛔ WHAT A TAP WRITES. That one session rebuilt as `composeWeek` builds a hard slot: the same
 * family, the same level, the chosen archetype, the athlete's own anchors, `DEFAULT_SIZE` (a quality
 * rung is one fixed dose at the middle of its band — `ladderOf`), through the same
 * `translateEnduranceSession`. Steps, minutes and tags are that session's. The day, the sport and
 * the row's own extra tags (a machine, `sport_assigned`) are kept. Just today: later weeks keep the
 * rotation. `workout-choice.test.ts` holds this against every hard row the composer builds.
 *
 * ⚠️ NOT OFFERED on a row that is done or skipped, on a sport-swapped row (it holds the library
 * session another sport handed over, not a planned slot), or on the taper's race-tempo session (p247
 * names that one session for the two weeks before a race).
 */
import {
  archetypesFor,
  buildEnduranceSession,
  FAMILIES,
  resolveEnduranceAnchors,
  type EnduranceBaselines,
  type FamilyId,
  type Level,
} from '../endurance-library/index.ts';
import { translateEnduranceSession, type TranslatedSession } from '../standing-plan/session-vocabulary.ts';
/**
 * ⛔ THE SAME PARSER `materialize-plan` EXPANDS THE SESSION'S STEPS WITH (2026-09-11). The option's
 * second line is rendered off the tokens the patch writes, so the sheet cannot describe a session
 * the tap does not build.
 */
import { parseQualityWork, qualityWorkLine, type QualityPricing } from '../plan-tokens/quality-work.ts';
import { FRAMES } from '../standing-plan/frames.ts';
import { DEFAULT_SIZE } from '../standing-plan/volume-bounds.ts';
// ⛔ ONE PLANNED-DURATION READER — the one the card prints its length from.
import { resolvePlannedDurationSeconds } from '../planned-duration.ts';
import {
  disciplineOf,
  intensityOf,
  isDisciplineSwapped,
  WORKOUT_FROM_PREFIX,
  workoutFromOf,
  type SwapOption,
  type SwappableSession,
} from './swap.ts';

const tagValue = (s: SwappableSession | null | undefined, prefix: string): string | null => {
  for (const t of s?.tags ?? []) {
    const raw = String(t);
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return null;
};

/** The composer's bands for a hard slot — `ENDURANCE_CLASS`. Sweet spot is `below`, and it is a hard slot. */
const HARD_BANDS = new Set(['near', 'above', 'below']);

export type HardSlot = { family: FamilyId; level: Level; archetype: string; sport: 'run' | 'ride' };

/** The row's family, level and workout, when it is a planned hard session whose workout can be chosen. */
export function hardSlotOf(session: SwappableSession | null | undefined): HardSlot | null {
  if (!session) return null;
  const status = String(session.workout_status ?? 'planned').toLowerCase();
  if (status === 'completed' || status === 'skipped') return null;
  if (isDisciplineSwapped(session)) return null;
  if ((session.tags ?? []).map(String).includes('race_tempo')) return null;
  if (intensityOf(session) !== 'hard') return null;
  if (!HARD_BANDS.has(tagValue(session, 'band:') ?? '')) return null;
  const family = tagValue(session, 'family:') as FamilyId | null;
  if (!family || !FAMILIES[family]) return null;
  const level = Number(tagValue(session, 'level:'));
  if (level !== 1 && level !== 2 && level !== 3) return null;
  const archetype = tagValue(session, 'archetype:');
  if (!archetype) return null;
  const sport = FAMILIES[family].sport;
  if ((sport !== 'run' && sport !== 'ride') || disciplineOf(session.type) !== sport) return null;
  if (!archetypesFor(family, level as Level).some((a) => a.id === archetype)) return null;
  return { family, level: level as Level, archetype, sport };
}

/**
 * The workouts this slot may be: the frame's own rotation where a programme names one for a slot of
 * this family holding this workout, the library's list for the family at this level otherwise.
 * ⚠️ FILTERED TO THE LEVEL either way — the low-volume tier builds p247's Wednesday at level 1, where
 * its three shapes do not exist, and the composer falls back to the family's rotation there too.
 */
export function workoutsForSlot(slot: HardSlot): { id: string; label: string }[] {
  const offered = archetypesFor(slot.family, slot.level).map((a) => ({ id: a.id, label: a.label }));
  for (const frame of Object.values(FRAMES)) {
    for (const column of Object.values(frame.columns)) {
      for (const day of column) {
        for (const e of day.endurance ?? []) {
          const named = e.archetypes;
          if (e.family !== slot.family || !Array.isArray(named) || !named.includes(slot.archetype)) continue;
          const list = offered.filter((a) => named.includes(a.id));
          if (list.length > 0) return list;
        }
      }
    }
  }
  return offered;
}

/** One hard session as `composeWeek` builds a hard slot. */
export function composedHardSession(args: {
  family: FamilyId;
  level: Level;
  archetype: string;
  baselines?: EnduranceBaselines | null;
}): TranslatedSession {
  const built = buildEnduranceSession({
    family: args.family,
    level: args.level,
    archetype: args.archetype,
    anchors: resolveEnduranceAnchors(args.baselines ?? null),
    size: DEFAULT_SIZE,
  });
  return translateEnduranceSession(built);
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * ⛔ THE MINUTES ON AN OPTION ARE THE LENGTH THE ROW WILL SHOW, off the athlete's own plan.
 *
 * The composer's duration and the expanded row's can differ by a minute: the ride's warm-up is
 * 12:30 in the library and travels as a 13-minute token, so p237's progressive repeats compose at 65
 * and read 66 once `materialize-plan` has expanded them. The same plan's expanded row of that
 * workout, at that family and level, is the length the card will print after the tap, read by the
 * same duration reader. A workout the block never built falls back to the composer's minutes.
 * ⚠️ A ROW ALREADY CHANGED ON THE DAY OR SWAPPED IS NOT READ — it is a copy, not the plan's row.
 * ⚠️ A FAILED READ IS NO MINUTES, and the composer's number stands.
 */
export async function loadWorkoutMinutes(
  db: Db,
  userId: string,
  session: SwappableSession & { training_plan_id?: string | null },
): Promise<Record<string, number>> {
  const slot = hardSlotOf(session);
  if (!slot || !db) return {};
  const out: Record<string, number> = {};
  try {
    let q = db
      .from('planned_workouts')
      .select('tags,duration,total_duration_seconds,computed')
      .eq('user_id', userId)
      .contains('tags', [`family:${slot.family}`, `level:${slot.level}`]);
    if (session.training_plan_id) q = q.eq('training_plan_id', session.training_plan_id);
    const { data } = await q;
    for (const r of (Array.isArray(data) ? data : []) as SwappableSession[]) {
      if (isDisciplineSwapped(r) || workoutFromOf(r)) continue;
      if ((r.tags ?? []).map(String).includes('race_tempo')) continue;
      const id = tagValue(r, 'archetype:');
      if (!id || out[id] != null) continue;
      const secs = resolvePlannedDurationSeconds(r);
      if (secs != null && secs > 0) out[id] = Math.round(secs / 60);
    }
  } catch (e) {
    console.warn('[swap] could not read the plan\'s own workout lengths', e);
  }
  return out;
}

/** The session's own classification, replaced wholesale by the new session's. */
const COMPOSED_TAG = /^(family|level|sport|intensity|band|archetype):/;

/**
 * The patch that makes the row the chosen workout. The composer's own fields for the new session;
 * the row's other tags kept; `workout_from:` records the plan's workout (the earliest wins), which is
 * what offers Back to the plan and keeps that workout off the list while it does.
 * ⚠️ `computed` and the structure go, and `materialize-plan` expands the new tokens, exactly as a
 * sport swap's library session does.
 */
export function workoutChoicePatch(session: SwappableSession, slot: HardSlot, next: TranslatedSession): Record<string, unknown> {
  const planned = workoutFromOf(session) ?? slot.archetype;
  const kept = (session.tags ?? []).map(String).filter((t) =>
    !COMPOSED_TAG.test(t) && t !== 'standing_plan' && t !== 'race_tempo' && !t.startsWith(WORKOUT_FROM_PREFIX));
  return {
    name: next.name,
    description: next.description,
    rendered_description: null,
    duration: next.duration,
    total_duration_seconds: next.duration * 60,
    steps_preset: [...next.steps_preset],
    computed: null,
    workout_structure: null,
    friendly_summary: null,
    intervals: null,
    tags: [...new Set([...next.tags, ...kept, `${WORKOUT_FROM_PREFIX}${planned}`])],
  };
}

/**
 * ⛔⛔ WHAT THE WORKOUT IS, IN ONE LINE (Michael, 2026-09-11). The option carried a name and its
 * minutes; two shapes from the same family read identically under them.
 *
 * ⛔ IT IS BUILT FROM THE TOKENS THE PATCH WRITES — `next.steps_preset`, the session's own — and
 * parsed by `parseQualityWork`, which is what `materialize-plan` expands those same tokens with. The
 * line and the steps the tap produces are one derivation; there is no second prescription here.
 * ⚠️ THE WORK ONLY. The warm-up and cool-down tokens carry no percentage and parse to null, so they
 * drop out by construction rather than by a name filter.
 * ⚠️ EMPTY IS LEGAL: a family whose token is not one of the quality shapes says nothing rather than
 * guessing at its own structure, and the option keeps its name and minutes alone.
 */
export function workoutLine(session: TranslatedSession, sport: 'run' | 'ride', pricing: QualityPricing): string | undefined {
  const lines: string[] = [];
  for (const token of session.steps_preset ?? []) {
    const work = parseQualityWork(token);
    if (!work) continue;
    const line = qualityWorkLine(work, sport, pricing);
    if (line) lines.push(line);
  }
  // ⚠️ ONE LINE. A session with two work tokens joins them with the same semicolon the page uses
  // between a round and its rest, rather than wrapping onto a second row the sheet does not draw.
  return lines.length > 0 ? lines.join('; ') : undefined;
}

/**
 * The sheet's workout options for one row. Leaves out the workout the row already is, the plan's own
 * workout while Back to the plan is offered, and a workout another session of the same family holds
 * that week — the builder's rule that no week builds one shape twice (`variantsTakenBy`,
 * `applyVariantPicks`).
 */
export function workoutChoiceOptions(
  session: SwappableSession & { id?: string },
  week: ReadonlyArray<SwappableSession & { id?: string }> = [],
  baselines?: EnduranceBaselines | null,
  /** Minutes by archetype, off the athlete's own expanded rows — see `loadWorkoutMinutes`. */
  minutesByWorkout?: Record<string, number> | null,
  /** The numbers the line is priced with — see `workoutLine`. Absent prints the page's percentages. */
  pricing: QualityPricing = {},
): SwapOption[] {
  const slot = hardSlotOf(session);
  if (!slot) return [];
  const planned = workoutFromOf(session);
  const taken = new Set<string>();
  for (const r of week ?? []) {
    if (!r || String(r.id) === String(session.id)) continue;
    if (tagValue(r, 'family:') !== slot.family) continue;
    const held = tagValue(r, 'archetype:');
    if (held) taken.add(held);
  }
  const out: SwapOption[] = [];
  for (const w of workoutsForSlot(slot)) {
    if (w.id === slot.archetype || w.id === planned || taken.has(w.id)) continue;
    let next: TranslatedSession;
    try {
      next = composedHardSession({ ...slot, archetype: w.id, baselines });
    } catch (e) {
      // A workout the library cannot build is not offered.
      console.warn('[swap] could not build workout', slot.family, slot.level, w.id, e);
      continue;
    }
    const onPlan = Number(minutesByWorkout?.[w.id]);
    const minutes = Number.isFinite(onPlan) && onPlan > 0 ? onPlan : next.duration;
    out.push({
      kind: 'workout',
      archetype: w.id,
      to: slot.sport,
      label: `${w.label} · ${minutes} min`,
      line: workoutLine(next, slot.sport, pricing),
      patch: workoutChoicePatch(session, slot, next),
      needsMaterialize: true,
      warnings: [],
    });
  }
  return out;
}
