// ============================================================================
// THE PLAN ROW — a composed block becomes the row shape this app already stores.
//
// ⛔ IT INVENTS NO STORAGE. `plans.sessions_by_week`, `plans.config.phase_structure` and
// `plans.duration_weeks` are the columns every other builder writes, and `PlanSession` here is
// field-for-field `strength-primary-plan.ts:559`'s. What is NEW is one config key
// (`standing_plan`) — and it exists precisely so the working number never has to borrow
// `config.training_max`.
//
// ⛔ THE WORKING NUMBER NEVER TOUCHES `config.training_max` (pivot §3). That key is Wendler's, 85%
// of a TRUE 1RM, with three live readers, and this block's number is 96% of a fresh prediction. A
// row that wrote both would be the conversion this module exists to make impossible.
// ============================================================================

import {
  composeBlock,
  testWeekLiftNames,
  type ComposeArgs,
  type ComposedWeek,
  type PlanSession,
} from './compose.ts';
import { FRAMES, type FrameId } from './frames.ts';
import { TEST_WEEK_INDEX, type TestedLift, type WorkingNumber } from './working-number.ts';
import { type DayMap } from './day-map.ts';
import type { ViadaPattern } from '../strength-grid/index.ts';

/** The app's existing phase shape — `strength-primary-plan.ts` writes the same one. */
export type ArcPhase = { name: string; start_week: number; end_week: number; weeks_in_phase: number };

/**
 * ⛔ THE PROTOCOL STAMP. `plans.config.strength_protocol`, which `block-identity.ts:246` reads as the
 * app's ONE answer to *"which protocol is this block on"*.
 *
 * ⚠️ IT MUST HAVE A `PROTOCOL_PROFILES` ENTRY IN THE SAME CHANGE THAT STARTS EMITTING IT.
 * `strength-profiles.ts:408` falls an unknown id back to `durability` — a flat RIR 2.5 for twelve
 * weeks — and logs it, and `block-identity.ts:380` reads `protocolKnown: false`, which silences every
 * effort-aware surface. That file's own comment says why: *"an unrecognised name resolves to the
 * default silently, and that silence is Q-192's whole failure mode."*
 */
export const STANDING_PLAN_PROTOCOL_ID = 'standing_plan';

/**
 * ⛔ NO SCHEDULED DELOAD, AND THAT IS SOURCED RATHER THAN OMITTED (p120, corpus §"why
 * overreach-to-deload is rejected").
 *
 * > *"this 'overreach to deload' will always be suboptimal for at least one discipline, and it may
 * > result in slower progress at best and overtraining/stagnation at worst."*
 *
 * His standard week is built to be run indefinitely, and the taper/deload column is **a tool you
 * deploy** — a race two weeks out (p247), or a break — not a scheduled recovery from accumulated
 * damage. So a block with no race in it carries no taper week, and adding a light week every fourth
 * would be inverting his model on his own page.
 */
export const NO_SCHEDULED_DELOAD_CITE = 'Viada p120';

export type StandingPlanRow = {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<string, PlanSession[]>;
  phaseStructure: { phases: ArcPhase[]; recovery_weeks: number[] };
  /** Lowercase weekday names carrying a strength session — the same contract `strength_days` has. */
  strength_days: string[];
  /** ⛔ EVERYTHING THIS BLOCK NEEDS TO BE READ BACK. Written to `plans.config.standing_plan`. */
  config: StandingPlanConfig;
  /** Every note the composer raised, deduped across the block. Surfacing only. */
  notes: ComposedWeek['notes'];
  /**
   * ⛔ THE EXISTING COMPROMISE CHANNEL, AND IT IS NOT A NEW ONE. `NonRaceBuilder.tsx:2716` renders
   * this off the preview and `strength-focus-copy.ts:237` folds it into the plan's description —
   * both already, for the Get Stronger block. Slice 2 put the Standing Plan's warnings in
   * `config.standing_plan_notes`, which nothing renders: *"a cost the athlete pays and cannot see is
   * not disclosed"* (that file's own sentence).
   *
   * ⚠️ `kind: 'cost'` — a pin that could not be honoured broke no rule. `'breach'` is for a week
   * that is actually compromised, and `'ceiling'` is dropped by the copy layer.
   */
  placement_compromises?: Array<{ kind: 'breach' | 'cost' | 'ceiling'; text: string }>;
};

export type StandingPlanConfig = {
  frame: FrameId;
  cite: string;
  /** ⛔ WHAT THE BLOCK PRESCRIBES FROM. Absent until week one's test is read back. */
  working_numbers: Partial<Record<TestedLift, WorkingNumber>> | null;
  /** ⛔ WHICH MOVEMENT EACH PATTERN'S COMPETITION SLOT CARRIES — and what the test week measured. */
  competition_lifts: Partial<Record<ViadaPattern, string>>;
  /** The names week one's test used, per lift. The reader needs exactly these. */
  test_lift_names: Record<TestedLift, string>;
  /** Provenance: what aimed the test's warm-ups. ⛔ Never the working number (p215). */
  seed_one_rep_maxes: Partial<Record<TestedLift, number>>;
  /** The week the pretest runs. */
  test_week: number;
  /** Demonstrated weekly miles the advanced tier was gated on, and where the number came from. */
  demonstrated_weekly_miles: number | null;
  demonstrated_miles_source: string | null;
  /** ⛔ TRUE ONCE THE TEST HAS BEEN READ AND THE FUTURE WEEKS REWRITTEN FROM IT. */
  test_read: boolean;
  /**
   * ⛔ FRAME DAY 1 LANDS THIS MANY DAYS AFTER MONDAY. Stored so a rebuild, a restate, or any surface
   * asking "which day is this session on" gets the block's own answer rather than re-deriving it
   * from pins that may since have changed.
   */
  day_offset: number;
  /** Which pins the chosen rotation honoured. Surfacing and provenance. */
  pins_honoured: { longRun: boolean; hardDays: number };
  /**
   * ⛔ TRUE WHEN THE ATHLETE TOOK THE SKIP. The block opened on numbers read from logged sets rather
   * than from a test week. ⚠️ Never a bare preference — see `evidenceForSkip`.
   */
  test_skipped: boolean;
  /** What the skip was read off, per lift: the set, its date, and the number it produced. */
  skip_evidence: Record<string, unknown> | null;
  /**
   * ⛔ THE SPORT MIX THE BLOCK WAS BUILT ON (slice 4). Stored for the same reason `day_offset` is:
   * a restate re-composes this block and must reach the identical week. Re-deriving it from the
   * athlete's current answers would rebuild a DIFFERENT week against the calendar that exists.
   */
  sport_mix: {
    runs: number; rides: number; swimDays: number;
    /** ⛔ The per-slot answers and variant picks RIDE ALONG (2026-08-24): a restate re-composes
     *  this block, and a mix stored without them would rebuild the dial's own week — a different
     *  calendar than the one that exists. */
    slots?: Record<string, string> | null;
    archetypes?: Record<string, string> | null;
  } | null;
  /** The easy-swim ADD-ON count the block was built on (Michael, 2026-08-24) — stored so a restate
   *  re-composes the identical week. 0/absent = none. */
  swim_easy_sessions: number | null;
  /** How many of the frame's endurance slots each sport actually got. Surfacing and provenance. */
  sport_counts: { run: number; ride: number; swim: number } | null;
  /**
   * ⛔ THE ACCESSORY PICKS THE BLOCK WAS BUILT ON (A1, 2026-08-24). Stored for exactly the reason
   * `sport_mix` and `day_offset` are: a restate RE-COMPOSES this block and has to reach the identical
   * week. Re-reading the athlete's CURRENT picks would compose a different week — a different movement
   * on the calendar's row — and `restateFromTest` matches on the movement NAME, so every row would
   * report as unmatched and the restate would look like a no-op.
   */
  accessory_picks: string[] | null;
  /**
   * ⛔ THE EQUIPMENT THE BLOCK WAS COMPOSED AGAINST (2026-08-24). Same law as `sport_mix`,
   * `day_offset` and `accessory_picks`: a restate RE-COMPOSES this block and has to reach the
   * identical week.
   *
   * ⚠️ IT WAS READ BY `rematerialize-standing-block` AND WRITTEN BY NOTHING. The build passed the
   * athlete's kit into the composer and the row stored none of it, so every restate re-composed
   * UNGATED — a different movement in the same slot, on a calendar that carries the gated one. And
   * `restateFromTest` matches a composed row to a calendar row on the MOVEMENT NAME, so those rows
   * matched nothing and silently missed the weight restate: the exact no-op `restate.ts` warns about.
   *
   * ⚠️ NULL MEANS THE ATHLETE DECLARED NOTHING — the §0h case, "we have not asked", which the gate
   * treats as ungated. It is never `[]` for "owns nothing".
   */
  athlete_equipment: string[] | null;
  /**
   * ⛔ WHAT EACH PATTERN'S ME SLOT HAD EARNED WHEN THIS VERSION WAS WRITTEN (A2, 2026-08-24).
   * ⚠️ ABSENT AT BUILD TIME, ALWAYS — a set is earned by logged sessions and a block is authored
   * before any of them exist. It arrives through the restate, beside the working numbers.
   */
  me_sets_by_pattern: Partial<Record<ViadaPattern, number>> | null;
};

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * ⛔ ONE BLOCK → ONE PLAN ROW.
 *
 * ⚠️ `weeks` IS THE ATHLETE'S ASK, UNROUNDED. Get Stronger rounds down to whole four-week Wendler
 * cycles because its wave is four weeks long; this block has no wave, so ten weeks means ten weeks.
 */
export function buildStandingPlanRow(args: {
  compose: Omit<ComposeArgs, 'week' | 'column'>;
  weeks: number;
  /** ⛔ DEPLOYED, NEVER SCHEDULED — see `NO_SCHEDULED_DELOAD_CITE`. Empty on a block with no race. */
  taperWeeks?: number[];
  goalName?: string | null;
  demonstratedMilesSource?: string | null;
  /** ⛔ THE ROTATION AND WHAT IT COST — `chooseDayMap`. Absent = the Monday-start week, no pins. */
  dayMap?: DayMap;
  /** What the skip was read off, when the athlete took it. Provenance only. */
  skipEvidence?: Record<string, unknown> | null;
  /** Surfacing only. */
  extraNotes?: ComposedWeek['notes'];
}): StandingPlanRow {
  const weeks = Math.max(1, Math.round(args.weeks));
  const blocks = composeBlock({
    ...args.compose,
    // ⛔ THE ROTATION REACHES THE COMPOSER HERE AND NOWHERE ELSE. A caller that set `dayOffset`
    // directly AND passed a `dayMap` would have two answers to one question; the map wins.
    ...(args.dayMap ? { dayOffset: args.dayMap.offset } : {}),
    weeks,
    taperWeeks: args.taperWeeks ?? [],
  });

  const sessions_by_week: Record<string, PlanSession[]> = {};
  for (const wk of blocks) sessions_by_week[String(wk.week)] = wk.sessions;

  // ⚠️ DEDUPED BY TEXT ACROSS THE BLOCK. Every week raises the same source notes; twelve copies of
  // "the first week is the test" is not more honest than one.
  const seen = new Set<string>();
  const notes: ComposedWeek['notes'] = [];
  for (const n of [...(args.extraNotes ?? []), ...blocks.flatMap((b) => b.notes)]) {
    if (seen.has(n.text)) continue;
    seen.add(n.text);
    notes.push(n);
  }

  const strengthDays = new Set<string>();
  for (const wk of blocks) {
    for (const s of wk.sessions) {
      if (s.type === 'strength') strengthDays.add(s.day.toLowerCase());
    }
  }

  const frame = FRAMES[args.compose.frame];
  return {
    name: (args.goalName ?? '').trim() || 'Strength, with running',
    description: describeBlock(weeks, notes, blocks[0]?.isTestWeek === true),
    duration_weeks: weeks,
    sessions_by_week,
    phaseStructure: phasesFor(weeks, args.taperWeeks ?? []),
    strength_days: [...strengthDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)),
    config: {
      frame: args.compose.frame,
      cite: frame.cite,
      // ⛔ ABSENT AT BUILD TIME, ALWAYS. The test is in week one and the block is written before it.
      working_numbers: args.compose.workingNumbers ?? null,
      competition_lifts: args.compose.competitionLifts,
      test_lift_names: testWeekLiftNames(args.compose.competitionLifts),
      seed_one_rep_maxes: args.compose.seed1RMs ?? {},
      test_week: TEST_WEEK_INDEX,
      demonstrated_weekly_miles: args.compose.demonstratedWeeklyMiles ?? null,
      demonstrated_miles_source: args.demonstratedMilesSource ?? null,
      test_read: args.compose.workingNumbers != null,
      day_offset: args.dayMap?.offset ?? args.compose.dayOffset ?? 0,
      pins_honoured: args.dayMap?.honoured ?? { longRun: false, hardDays: 0 },
      test_skipped: args.compose.skipTestWeek === true
        && Object.keys(args.compose.workingNumbers ?? {}).length > 0,
      skip_evidence: args.skipEvidence ?? null,
      sport_mix: args.compose.sportMix
        ? {
            runs: Math.max(0, Math.round(Number(args.compose.sportMix.runs) || 0)),
            rides: Math.max(0, Math.round(Number(args.compose.sportMix.rides) || 0)),
            swimDays: Math.max(0, Math.round(Number(args.compose.sportMix.swimDays) || 0)),
            slots: args.compose.sportMix.slots ?? null,
            archetypes: args.compose.sportMix.archetypes ?? null,
          }
        : null,
      swim_easy_sessions: Math.min(2, Math.max(0, Math.round(Number(args.compose.swimEasySessions) || 0))) || null,
      accessory_picks: (args.compose.accessoryPicks ?? []).length > 0
        ? [...(args.compose.accessoryPicks as string[])]
        : null,
      // ⛔ THE KIT THE WEEK WAS BUILT AGAINST — see `athlete_equipment` for why a restate is a
      // silent no-op without it. Empty declares as null: absent means "not asked", never "owns nothing".
      athlete_equipment: (() => {
        const kit = (args.compose.equipment ?? []).filter((c) => String(c ?? '').trim());
        return kit.length > 0 ? [...kit] : null;
      })(),
      me_sets_by_pattern: args.compose.meSetsByPattern ?? null,
      sport_counts: (() => {
        // ⚠️ COUNTED OFF THE BUILT WEEK, not off the ask. What the athlete asked for is a ratio;
        // what the week holds is the answer, and only the second is worth storing as a fact.
        const wk = blocks.find((b) => !b.isTestWeek) ?? blocks[0];
        if (!wk) return null;
        const c = { run: 0, ride: 0, swim: 0 };
        for (const s of wk.sessions) {
          if (s.type === 'run' || s.type === 'ride' || s.type === 'swim') c[s.type] += 1;
        }
        return c;
      })(),
    },
    notes,
    /**
     * ⛔ THE COST, WHERE THE ATHLETE ALREADY LOOKS. Two sources, one channel: the rotation's own
     * unhonoured pins, and any `warning` note the composer or the wiring raised. ⚠️ Absent when
     * nothing was compromised — never `[]` for "we did not look".
     */
    ...(() => {
      const out = [
        ...(args.dayMap?.compromises ?? []),
        ...notes.filter((n) => n.kind === 'warning').map((n) => ({ kind: 'cost' as const, text: n.text })),
      ];
      return out.length > 0 ? { placement_compromises: out } : {};
    })(),
  };
}

/**
 * ⛔ WEEK ONE IS A TEST WEEK AND SAYS SO; everything else is base work.
 *
 * ⚠️ BOTH NAMES ARE ALREADY REGISTERED IN `normalizePhaseKey` (`strength-profiles.ts:433-454`) —
 * `test` resolves to `taper` (arrive rested, do not tighten the target into it) and `base` to
 * `base`. Emitting a name that file has not heard of resolves to the default silently, which is
 * Q-192's failure mode; these two were checked before they were emitted.
 */
export function phasesFor(weeks: number, taperWeeks: number[]): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const taper = new Set(taperWeeks.filter((w) => w >= 1 && w <= weeks));
  const phases: ArcPhase[] = [{ name: 'Test', start_week: 1, end_week: 1, weeks_in_phase: 1 }];
  let cursor = 2;
  while (cursor <= weeks) {
    const isTaper = taper.has(cursor);
    let end = cursor;
    while (end + 1 <= weeks && taper.has(end + 1) === isTaper) end += 1;
    phases.push({
      name: isTaper ? 'Taper' : 'Base',
      start_week: cursor,
      end_week: end,
      weeks_in_phase: end - cursor + 1,
    });
    cursor = end + 1;
  }
  // ⛔ NO RECOVERY WEEKS, AND THAT IS A SOURCED ANSWER RATHER THAN AN EMPTY FIELD (p120).
  return { phases, recovery_weeks: [] };
}

function describeBlock(weeks: number, notes: ComposedWeek['notes'], hasTestWeek: boolean): string {
  const sourced = notes.filter((n) => n.kind === 'source').slice(0, 3).map((n) => n.text);
  return [
    `${weeks} weeks. Four lifting days, four runs and a plyometric day, with one full rest day.`,
    // ⛔ THE DESCRIPTION SAYS WHICH BLOCK THIS IS. A skipped test with the test sentence still on it
    // would describe a week the athlete does not have — and week one looks different enough that
    // they would notice and have no way to find out why.
    hasTestWeek
      ? 'Week one is a test week: two guided sessions set the numbers the rest of the block is built on.'
      : 'Week one is prescribed from sets already on file, so there is no test week. Weights are on '
        + 'from the first session.',
    ...sourced,
  ].join(' ');
}
