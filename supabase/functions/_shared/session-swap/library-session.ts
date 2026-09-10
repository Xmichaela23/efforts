/**
 * ═══ A SWAPPED SESSION IS THE LIBRARY'S SESSION ══════════════════════════════════════════════════
 *
 * ⛔ MOVED TO THE SERVER UNCHANGED (2026-09-10, audit H-T15) — was `src/lib/swap-library-session.ts`.
 *
 * docs/WORKORDER-endurance-swaps-2026-09-09.md §7.
 *
 * ⛔ THE OLD SWAP HANDED OVER A SHELL. It kept the ORIGINAL session's minutes and wrote a sentence —
 * `Hard ride, no target`, `Easy run, no pace target` — so a three-hour long ride became a three-hour
 * RUN, which is not a session anyone should be handed and is not on any page.
 *
 * ⛔ WHAT REPLACES IT: the session the composer would have built for the new sport in the same band,
 * at the athlete's own level. Steps, targets and minutes come from THAT session and never from the
 * old one. Only the day is kept.
 *
 * ⚠️ THE ATHLETE'S OWN ROW IS PREFERRED OVER A FRESH BUILD, and that is the point rather than an
 * optimisation. Their plan already contains the composer's answer for that family — built with their
 * level, their volume dial and their baselines. Re-deriving it here would be a SECOND composer, and
 * a second composer is how two screens start disagreeing. The library build below is the fallback
 * for a plan that has no session of that family at all, and it can only get the level right.
 */
import {
  buildEnduranceSession,
  type FamilyId,
  type Level,
} from '../endurance-library/index.ts';
import { translateEnduranceSession } from '../standing-plan/session-vocabulary.ts';
import type { Discipline, IntensityBand, SwappableSession } from './swap.ts';
// ⛔ ONE DURATION READER FOR THE WHOLE APP — `planned-session/enforcement.test.ts` pins it by name.
import { plannedDurationSeconds } from '../../../../src/lib/planned-session/duration.ts';

/**
 * ⛔ WHICH SESSION THE BOOK HANDS OVER, by the sport being left and its band.
 *
 * | leaving | band | becomes | page |
 * |---|---|---|---|
 * | run | hard | `ride_anaerobic` | p237 |
 * | run | easy | `ride_endurance` | p239 |
 * | run | long | `ride_endurance` — the frame's long ride | p239 |
 * | ride | long | `run_lsd` | p235 |
 * | ride | easy | `run_vt1` | p235 |
 * | ride | hard | — | p138 blesses one direction only; the option is not offered |
 *
 * ⚠️ SWIM IS ABSENT ON PURPOSE. The app does not coach swims — no yardage, no sets, no pace — so an
 * easy swim is a time block rather than a library session, and it keeps the copy it has.
 */
const TARGET_FAMILY: Record<string, FamilyId> = {
  'run:hard': 'ride_anaerobic',
  'run:easy': 'ride_endurance',
  'run:long': 'ride_endurance',
  'ride:long': 'run_lsd',
  'ride:easy': 'run_vt1',
};

/** The family the swap hands over, or null when the page does not bless this direction. */
export function swapTargetFamily(from: Discipline, band: IntensityBand): FamilyId | null {
  return TARGET_FAMILY[`${from}:${band}`] ?? null;
}

const tagValue = (s: SwappableSession, prefix: string): string | null =>
  (s.tags ?? []).find((t) => String(t).startsWith(prefix))?.slice(prefix.length) ?? null;

/** `family:` off a row. Exported because the template search is the caller's job, not this file's. */
export const familyTagOf = (s: SwappableSession): string | null => tagValue(s, 'family:');

/**
 * The athlete's level for this family, read off their own plan rather than re-derived.
 * ⚠️ THE SOURCE ROW'S LEVEL IS THE FALLBACK, not a default of 2. Same athlete, same block, adjacent
 * sport — it is the closest thing the row itself knows, and inventing a middle level would be this
 * file taking a training decision that belongs to the composer.
 */
function levelFor(session: SwappableSession, template: SwappableSession | null): Level {
  const raw = Number(tagValue(template ?? session, 'level:') ?? tagValue(session, 'level:'));
  return (raw === 1 || raw === 2 || raw === 3 ? raw : 2) as Level;
}

export type LibrarySwapSession = {
  family: FamilyId;
  name: string;
  /**
   * ⛔ THE SESSION'S OWN SENTENCE. Writing null here left the drawer reading "No description
   * available" on a swapped row — the composed ride had one and the run that replaced it did not.
   */
  description: string | null;
  /** Minutes. */
  duration: number;
  steps_preset: string[];
  /** `family:` / `level:` / `sport:` / `intensity:` / `band:` — the new session's, not the old one's. */
  libraryTags: string[];
  /** True when this came from a fresh library build rather than the athlete's own composed row. */
  fromLibraryBuild: boolean;
};

/**
 * The session that replaces this one. `template` is the athlete's own planned row of the target
 * family when they have one — the caller finds it, because finding it is a database read.
 */
export function librarySwapSession(
  session: SwappableSession,
  from: Discipline,
  band: IntensityBand,
  template: SwappableSession | null,
): LibrarySwapSession | null {
  const family = swapTargetFamily(from, band);
  if (!family) return null;

  /**
   * ⛔ THE TEMPLATE MUST ACTUALLY BE THAT FAMILY AND MUST CARRY STEPS. A row the materialiser has
   * not expanded yet has no `steps_preset`, and copying an empty one would hand over a session with
   * no work in it — worse than the shell this replaces.
   *
   * ⛔⛔ AND A ROW THAT IS ITSELF A SWAP IS NOT A TEMPLATE. It carries the target family, so it
   * matches — and it is not the composer's session for that family, it is a copy of one. Left in,
   * the second swap of a block copies the first swap's row, the third copies the second, and any
   * gap in the first is inherited forever. That happened: the first swapped long ride wrote no
   * description, the next swap read it as the template, and the drawer said "No description
   * available" on a row whose own library session had a sentence all along.
   */
  const usable = template
    && familyTagOf(template) === family
    && !(template.tags ?? []).includes('discipline_swapped')
    && Array.isArray(template.steps_preset) && template.steps_preset.length > 0
    ? template : null;

  if (usable) {
    const seconds = plannedDurationSeconds(usable as never) ?? 0;
    const mins = Math.round(seconds / 60);
    return {
      family,
      name: String(usable.name ?? '').trim() || family,
      description: usable.description ?? null,
      duration: mins,
      steps_preset: [...usable.steps_preset!],
      libraryTags: (usable.tags ?? []).filter((t) =>
        /^(family|level|sport|intensity|band):/.test(String(t))),
      fromLibraryBuild: false,
    };
  }

  /**
   * ⚠️ NO SIZE IS PASSED, so the library takes its own default dose for this level. The size dial is
   * the athlete's typed volume and it lives nowhere on a plan row — it cannot be read back, and
   * guessing at it would put a number on the athlete's screen that no page and no answer of theirs
   * produced. The level is theirs; the dose is the library's own middle.
   */
  const built = buildEnduranceSession({ family, level: levelFor(session, template) });
  const row = translateEnduranceSession(built);
  return {
    family,
    name: row.name,
    description: row.description ?? null,
    duration: row.duration,
    steps_preset: [...row.steps_preset],
    libraryTags: row.tags.filter((t) => /^(family|level|sport|intensity|band):/.test(String(t))),
    fromLibraryBuild: true,
  };
}
