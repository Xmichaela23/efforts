/**
 * BLOCK IDENTITY — the one card that says WHAT THE ATHLETE IS IN, on a given date.
 *
 * ⛔ WHY THIS EXISTS (Q-230, audit F3/F4/F9). Every surface that reasons about a session or a block
 * was answering "what is this plan?" for itself, off `plans.config`, and getting different answers:
 *
 *   - `coach` (→ State) read `config.strength_protocol` and NOTHING ELSE, so a strength-primary
 *     block — which never writes that key — resolved to null. `protocolExpectsE1rmToDip(null)` is
 *     false, so State told the athlete their one-rep maxes were "sliding" on a block whose own
 *     prescription is the reason they dipped.
 *   - `materialize-plan` read the same key AND fell back to `config.source === 'strength_primary'`.
 *     Same question, two dialects, and the readers are not wrong — they are being told two things.
 *   - The per-session read (`_shared/plan-context.ts`) opened the plan a third time and derived a
 *     week index and a phase of its own.
 *
 * Constitution Law 1 (one source of truth per claim) and Law 5 (new reasoning is born on the spine).
 * This module is the single place that answers it; State, Performance and the session all read it.
 *
 * ⛔ WHAT THIS IS NOT — and this is a hard line, not a preference.
 *
 * This card is a LABEL ON A PLAN THAT ALREADY EXISTS. It is read-only, it is downstream of every
 * build decision, and NOTHING that reads it may change a prescribed weight, move a session, or feed
 * the week solver. Efforts is a hybrid app and the endurance/strength balance is a solved, delicate
 * arrangement made at build time; a read surface that starts steering it is a second builder.
 * (Law 4: surfaces render, they never re-decide.)
 *
 * ⛔ AND IT DOES NOT RE-DERIVE THE BLOCK SHAPE. The builder already decided leader-vs-anchor and
 * where the deloads fall, and stored it in `config.phase_structure`. This module READS that. If it
 * ran `cyclesForBlock()` again it would be a second lineage the moment the shape inputs (continuity,
 * posture, aerobic load) were not identical at read time — exactly the class of bug D-261 fixed for
 * phase. The only math it does is `setsForWeek()`, which is a pure function of (kind, weekInCycle)
 * and is the SAME function the composer used to write the sets.
 *
 * ⛔ UNKNOWN IS SILENT, NEVER A DEFAULT. Michael: *"i have fallabck ptsd from early AI builds of this
 * app that were all fallbacks and nothing worked."* He is right, and the code agrees: `resolveProfile()`
 * returns `durability` for ANY unrecognised id, which made a missing entry and a deliberate choice
 * indistinguishable and caused the same bug twice (Q-192, then `strength_primary` in D-322). Every
 * field here is nullable and every "do we know?" is its own boolean. A reader that finds `null` says
 * nothing (Law 2: the app never fills a gap with a confident number).
 */

import { resolvePlanWeekIndex } from './plan-week.ts';
import {
  resolvePlanPhaseDetailed,
  resolveWeekIntent,
  type PhaseSource,
  type WeekIntent,
} from './plan-phase.ts';
import {
  PROTOCOL_PROFILES,
  normalizePhaseKey,
  protocolEffortRead,
  type EffortReadMode,
  type StrengthProtocolId,
} from './strength-profiles.ts';
import {
  setsForWeek,
  WEEKS_PER_CYCLE,
  VALIDITY_CHECK_PCT,
  type CycleKind,
} from '../shared/strength-system/loading/wendler-531.ts';

// ---------------------------------------------------------------------------
// The goal — deliberately OPEN, and deliberately two families
// ---------------------------------------------------------------------------

/**
 * ⛔ THE VOCABULARY IS OPEN ON PURPOSE. Efforts builds race blocks, endurance blocks, speed blocks
 * and strength blocks, and it will build more (a VO2-max block is not offered as its own goal today —
 * it lives inside `build_speed`, which is why that goal's floor is 6 weeks). A new goal joins by
 * adding ONE entry to this list and one label; no reader changes, because readers switch on
 * `goal.known` and render `goal.focus`, never on a hardcoded id.
 *
 * ⚠️ THIS LIST MIRRORS `src/lib/non-race-goal-seeds.ts` (`NonRaceGoalId`), which is the client's
 * picker and the authority for what an athlete can CHOOSE. This copy exists because edge functions
 * cannot depend on a client component's shape for a fact they must resolve server-side. Keep them in
 * step; `block-identity.test.ts` pins the two lists against each other so drift fails a test rather
 * than silently rendering "unknown" on a goal the athlete definitely picked.
 */
export const NON_RACE_GOAL_FOCUS = [
  'build_endurance',
  'build_speed',
  'get_stronger',
  'build_muscle',
  'maintain',
  'starting_over',
] as const;

export type NonRaceGoalFocus = typeof NON_RACE_GOAL_FOCUS[number];

/**
 * What the block is FOR.
 *
 * `kind: 'race'` — there is a date and an event. `kind: 'non_race'` — there is an adaptation being
 * chased. `kind: 'unknown'` — the plan does not say, and no surface may guess.
 *
 * ⚠️ `known: false` on a `non_race` goal means the plan named a focus this build does not recognise
 * (a newer client, a hand-edited config). The raw string is carried through so it can be LOGGED, but
 * a surface must treat it exactly like `unknown` — render nothing.
 */
export type BlockGoal =
  | {
      kind: 'race';
      known: true;
      /** 'run' | 'ride' | 'triathlon' | … — whatever the goal row carries. */
      sport: string | null;
      /** '70.3' | 'marathon' | … — the event distance/profile as the plan stated it. */
      distance: string | null;
      raceDateIso: string | null;
      raceName: string | null;
      targetFinishSeconds: number | null;
    }
  | {
      kind: 'non_race';
      known: boolean;
      focus: string;
    }
  | { kind: 'unknown'; known: false };

// ---------------------------------------------------------------------------
// The cycle slice — present ONLY on a block that has cycles
// ---------------------------------------------------------------------------

/**
 * Where in the block's own rhythm this date falls.
 *
 * ⛔ NULL ON EVERY PLAN THAT DOES NOT CARRY A CYCLE STRUCTURE, which today means everything except a
 * strength-primary block. A run plan has phases, not leader/anchor cycles, and inventing a
 * `weekInCycle` for one would be a fabricated fact travelling as a measured one (Law 2).
 */
export type BlockCycle = {
  kind: CycleKind;
  /** 1-based week within the four-week cycle. Week 4 is always the deload. */
  weekInCycle: number;
  isDeload: boolean;
};

export type BlockIdentity = {
  planId: string | null;
  planName: string | null;

  /** ⛔ ONE ANSWER. `config.strength_protocol`, else the strength-primary self-identification. */
  protocolId: string | null;
  /** Is `protocolId` a protocol this build actually knows? A stranger reads as unknown, not durability. */
  protocolKnown: boolean;
  /** How this block judges effort. 'none' whenever the protocol is unknown — see `protocolEffortRead`. */
  effortRead: EffortReadMode;

  goal: BlockGoal;

  /** 1-based plan week for the date asked about. Null before the plan starts / no start date. */
  weekIndex: number | null;
  blockWeeks: number | null;
  /** Raw phase NAME as the plan stored it ('Anchor' / 'Leader' / 'Deload' / 'base' / 'taper' / …). */
  phase: string | null;

  /**
   * ⛔ THE WORD A SCREEN MAY PRINT. Null whenever the plan's phase does not resolve — and a null
   * here means the surface says nothing about the phase, not that it picks a default.
   *
   * `phase` above is the plan's OWN name, and half of those names are internal: 'Leader' and
   * 'Anchor' are Wendler's words for a 5/3/1 cycle and mean nothing to an athlete reading a screen.
   * A surface that wants a readable word must NOT translate one — the moment two screens each keep
   * their own leader→"build" table they will disagree, and a non-5/3/1 plan (whose phases are
   * already called base/build/peak/taper) gets whatever the table's fallback happens to be.
   *
   * ⚠️ THIS IS AN ACCESSOR OVER THE VOCABULARY THAT ALREADY EXISTS, NOT A SECOND ONE.
   * `normalizePhaseKey` (D-322, `strength-profiles.ts`) already maps every phase name any composer
   * emits onto five plain words — base / build / peak / taper / recovery — and
   * `strength-phase-vocabulary.test.ts` fails if a composer ever emits a name it does not cover.
   * Two questions, one table: that function answers *"which effort rule governs this week"*, and
   * this field answers *"what do we call this week out loud"*. They must not drift apart, which is
   * exactly why this reads through it rather than beside it.
   */
  phaseWord: string | null;
  /** Where the phase came from. `'unknown'` is a real signal, not a silent null. */
  phaseSource: PhaseSource;
  weekIntent: WeekIntent;

  cycle: BlockCycle | null;

  /**
   * Does this week carry an all-out set at all? True in EVERY non-deload anchor week — weeks 1, 2
   * and 3 all end on an open set. Null when the block has no cycle structure to answer with.
   */
  hasAllOutSet: boolean | null;

  /**
   * ⛔ IS THIS THE WEEK THAT DECIDES — the all-out set at the 95% validity check.
   *
   * ⚠️ NOT THE SAME AS `hasAllOutSet`, and conflating them is a real mistake this file's own tests
   * caught. Every anchor week ends on an open set, so three weeks in four produce a rep count. Only
   * the 95% week is the one `verdictFrom95Set` reads to move the working number — weeks 1 and 2 are
   * open sets at 85% and 90%, which are training, not the reading.
   *
   * Derived from the sets themselves (an `amrap` set at `VALIDITY_CHECK_PCT`), never from a
   * hardcoded "week 3", so a protocol that puts its check somewhere else answers correctly.
   */
  isMeasurementWeek: boolean | null;
  /** The top set's percentage of the working number this week (0.95 = 95%). Null when unknown. */
  topSetPct: number | null;

  /** True when there is enough here for a surface to say ANYTHING plan-aware. */
  known: boolean;
};

export type BlockIdentityInput = {
  planId?: string | null;
  planName?: string | null;
  /** The `plans.config` JSON. */
  planConfig: any;
  /** `plans.duration_weeks` — the column, which `config.duration_weeks` sometimes shadows. */
  durationWeeks?: number | null;
  /**
   * The goal row (`goals`), when the caller already has it. Carries the non-race focus and the race
   * fields. Optional: a caller with only a plan still gets everything the plan config can answer.
   */
  goal?: any | null;
  /** The date being reasoned about, `YYYY-MM-DD`. The card is DATE-RELATIVE — week 3 is not a plan fact. */
  onDateIso: string;
};

// ---------------------------------------------------------------------------

/** The plan's own statement of which protocol it is on. */
function resolveProtocolId(config: any): string | null {
  const stamped = String(config?.strength_protocol ?? '').trim();
  if (stamped && stamped !== 'none') return stamped;
  // A strength-primary plan is not produced by the run/tri protocol selector, so it never writes
  // `strength_protocol` — it says what it is in `config.source`. `materialize-plan:3312` already
  // reads it this way (D-322); this is that same rule, in the one place, for everyone.
  // ⚠️ Step 2 of Q-230 makes the builder stamp `strength_protocol` directly. This branch STAYS
  // afterwards — every block already built (including the one Michael is in) identifies itself only
  // this way, and rewriting a live plan's config to fix a read is the wrong direction.
  if (String(config?.source ?? '').toLowerCase() === 'strength_primary') return 'strength_primary';
  return null;
}

function resolveGoal(config: any, goalRow: any | null | undefined): BlockGoal {
  const prefs = goalRow?.training_prefs ?? null;

  // RACE FIRST: a dated event is the least ambiguous thing a plan can be.
  const raceRaw = goalRow?.target_date ?? config?.race_date ?? config?.raceDate ?? null;
  const raceDateIso = typeof raceRaw === 'string' && raceRaw.trim() ? String(raceRaw).slice(0, 10) : null;
  const rowGoalType = String(goalRow?.goal_type ?? '').toLowerCase();
  if (raceDateIso || rowGoalType === 'event') {
    return {
      kind: 'race',
      known: true,
      sport: typeof goalRow?.sport === 'string' ? goalRow.sport : (typeof config?.sport === 'string' ? config.sport : null),
      distance:
        (typeof goalRow?.distance === 'string' && goalRow.distance) ||
        (typeof config?.goal_profile === 'string' && config.goal_profile) ||
        (typeof config?.distance_key === 'string' && config.distance_key) ||
        (typeof config?.event_type === 'string' && config.event_type) ||
        null,
      raceDateIso,
      raceName: typeof config?.race_name === 'string' ? config.race_name : (typeof goalRow?.name === 'string' ? goalRow.name : null),
      targetFinishSeconds:
        typeof config?.target_finish_time_seconds === 'number' && Number.isFinite(config.target_finish_time_seconds)
          ? Math.round(config.target_finish_time_seconds)
          : null,
    };
  }

  // NON-RACE: the adaptation being chased.
  // ⚠️ `goal_focus` is written by step 2 of Q-230. Before that it is absent on every existing plan —
  // the athlete's pick ("Strength Focus", "Build speed") was collapsed to capacity/maintenance at the
  // builder and never persisted. So this reads `unknown` on older blocks, which is the honest answer.
  const focusRaw = String(config?.goal_focus ?? prefs?.goal_focus ?? '').trim();
  if (focusRaw) {
    return {
      kind: 'non_race',
      known: (NON_RACE_GOAL_FOCUS as readonly string[]).includes(focusRaw),
      focus: focusRaw,
    };
  }

  return { kind: 'unknown', known: false };
}

/**
 * The stored phase entry covering this week, from the strength block structure the BUILDER wrote.
 * Returns null for any plan that does not carry one — which is the signal that this plan has no
 * cycles, not that we failed to find them.
 */
function storedCycleEntry(config: any, weekIndex: number): { name: string; start_week: number } | null {
  const psPhases = config?.phase_structure?.phases;
  if (!Array.isArray(psPhases)) return null;
  const sorted = psPhases
    .filter((p: any) => Number.isFinite(Number(p?.start_week)))
    .map((p: any) => ({ name: String(p?.name ?? '').trim(), start_week: Number(p?.start_week) }))
    .sort((a: any, b: any) => a.start_week - b.start_week);
  let matched: { name: string; start_week: number } | null = null;
  for (const p of sorted) {
    if (p.start_week <= weekIndex) { if (p.name) matched = p; }
    else break;
  }
  return matched;
}

/**
 * Turn the stored phase entry into a cycle position.
 *
 * The builder writes each four-week cycle as TWO entries — the work phase ('Leader' or 'Anchor',
 * weeks 1-3) and its 'Deload' (week 4) — so the position is readable off the entry we landed in
 * without re-running the shape decision. A deload is week 4 by construction (`buildBlockPhases`).
 */
function resolveCycle(config: any, weekIndex: number): BlockCycle | null {
  const entry = storedCycleEntry(config, weekIndex);
  if (!entry) return null;
  const name = entry.name.toLowerCase();

  if (name === 'deload' || name === 'recovery') {
    return { kind: 'anchor', weekInCycle: WEEKS_PER_CYCLE, isDeload: true };
  }
  if (name !== 'leader' && name !== 'anchor') return null; // not a cycle-structured block

  const weekInCycle = weekIndex - entry.start_week + 1;
  if (!(weekInCycle >= 1 && weekInCycle < WEEKS_PER_CYCLE)) return null;
  return { kind: name as CycleKind, weekInCycle, isDeload: false };
}

/**
 * ⛔ THE ONE PLACE THAT ANSWERS "WHAT BLOCK IS THIS, ON THIS DATE".
 *
 * Pure: config in, card out. No database, no clock — the caller supplies the date, so the same
 * inputs always produce the same card and a fixture can pin it (Law 6).
 */
export function resolveBlockIdentity(input: BlockIdentityInput): BlockIdentity {
  const config = input.planConfig ?? null;
  const onDate = String(input.onDateIso ?? '').slice(0, 10);

  const protocolId = resolveProtocolId(config);
  const protocolKnown = !!protocolId && Object.prototype.hasOwnProperty.call(PROTOCOL_PROFILES, protocolId);
  const profile = protocolKnown ? PROTOCOL_PROFILES[protocolId as StrengthProtocolId] : null;

  const blockWeeks =
    Number.isFinite(Number(input.durationWeeks)) && Number(input.durationWeeks) > 0
      ? Number(input.durationWeeks)
      : Number.isFinite(Number(config?.duration_weeks)) && Number(config?.duration_weeks) > 0
        ? Number(config.duration_weeks)
        : null;

  const weekIndex = onDate ? resolvePlanWeekIndex(config, onDate, blockWeeks) : null;
  const { phase, phase_source } = resolvePlanPhaseDetailed(config, weekIndex);
  const weekIntent = resolveWeekIntent(config, weekIndex);

  const cycle = weekIndex != null ? resolveCycle(config, weekIndex) : null;

  // The measurement week and the top-set percentage come from the SAME pure function the composer
  // used to write the sets — not a second table of percentages.
  let hasAllOutSet: boolean | null = null;
  let isMeasurementWeek: boolean | null = null;
  let topSetPct: number | null = null;
  if (cycle) {
    const sets = setsForWeek(cycle.kind, cycle.weekInCycle);
    hasAllOutSet = sets.some((s) => s.amrap);
    isMeasurementWeek = sets.some((s) => s.amrap && s.pct >= VALIDITY_CHECK_PCT);
    topSetPct = sets.length ? sets[sets.length - 1].pct : null;
  }

  const goal = resolveGoal(config, input.goal);

  return {
    planId: input.planId ?? null,
    planName: input.planName ?? (typeof config?.name === 'string' ? config.name : null),
    protocolId,
    protocolKnown,
    effortRead: protocolEffortRead(profile),
    goal,
    weekIndex,
    blockWeeks,
    phase,
    phaseWord: normalizePhaseKey(phase),
    phaseSource: phase_source,
    weekIntent,
    cycle,
    hasAllOutSet,
    isMeasurementWeek,
    topSetPct,
    // Enough to speak = we can place the athlete in the block. A card with no week index knows
    // nothing useful about today, whatever else it carries.
    known: weekIndex != null && (protocolKnown || phase != null || goal.known),
  };
}
