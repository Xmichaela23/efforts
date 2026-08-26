import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Bike, Waves, Check, Dumbbell, Info, Footprints, Shuffle, Weight, Flag, Plus, Gauge, ChevronDown } from 'lucide-react';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { StepLayout } from '@/components/wizard/StepLayout';
// ⛔ THE ENDURANCE WEEK — one screen replacing `volume` + `hardday` on the strength path (2026-08-24).
import EnduranceWeekCard, { EnduranceWeekRate } from './EnduranceWeekCard';
// ⛔ THE HARD SLOT'S SESSION CHOICES — one component, shared with anything that renders a slot.
import HardSlotChoices from './HardSlotChoices';
import {
  SLOT_KEYS,
  allSlotsChosen,
  emptySlotSports,
  unansweredLine,
  type SlotKey,
  type SlotSelection,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { hardSlotDefault, slotFamilyFact, slotVariantOptions } from '@/lib/hard-slot-choices';
import { slotsForEngine } from '@/lib/standing-plan-week-bounds';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { useAppContext } from '@/contexts/AppContext';
// ⛔ THE SAME functions the SERVER's tier gate runs — client-reachable by design, so the line the
// wizard shows and the tier the composer builds cannot disagree (item 8, 2026-08-24).
import { demonstratedRunVolume } from '../../supabase/functions/_shared/standing-plan/demonstrated-history.ts';
import { advancedTierSessions } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import { useArcSetupContext } from '@/hooks/useArcSetupContext';
import { getDisciplineColor, getDisciplineColorRgb, FOCUS_RACE_COLOR } from '@/lib/context-utils';
// ⛔ ONE READER FOR "is this the plyo day" — shared with the calendar chip. The tag, never the name.
import { isPlyoSession } from '@/lib/utils';
// ONE band, shared with the composer — what the athlete is told while typing and what the plan
// records cannot disagree. A REFERENCE, never a cap (D-222's ceiling was retired on purpose).
import { maintenanceDoseFor, startLightMiles, volumeStateForMiles, volumeStateLine, volumeStateLineVsUsual, volumeStateVsUsual } from '@/lib/maintenance-volume-band';
// ONE source for the block's own words — the composer writes the same sentences onto the plan.
import { STRENGTH_FOCUS_WEEKS, HARD_DAY_WHY, HARD_RIDE_SHAPE, VOLUME_WHY } from '@/lib/strength-focus-copy';
// ONE menu, shared with the composer that authors the block (`assistance-menu.ts`). A name this
// picker offers that the composer does not recognise would fall back to the default — the athlete
// would pick something and silently get something else.
import { ASSISTANCE_GUIDANCE, resolveEnduranceTier, TIER_BAND } from '@/lib/assistance-menu';
// D-407 — the per-day picker. Twelve slots inside a locked frame, not three block-wide picks.
import {
  ASSISTANCE_CATEGORIES,
  type AssistanceWeekPrefs,
  buildDefaultWeek,
  CATEGORY_LABEL,
  displayName,
  // ⛔ THE COST LINE FOR A HIGH-ECCENTRIC PICK ON AN UPPER DAY (2026-08-17). Advice, never a gate.
  eccentricCostNote,
  FOCUS_CAP,
  FOCUS_CHIPS,
  FOCUS_LABEL,
  type FocusChip,
  LIFT_DAY_LABEL,
  LIFT_DAYS,
  type LiftDay,
  normalizeAssistancePrefs,
  optionsFor,
} from '@/lib/assistance-catalog';
/**
 * ⛔ THE STANDING PLAN'S OWN ACCESSORY TABLE (2026-08-24) — seven picks named after the frame's real
 * slots, and the Dial. ONE table, read here and by the composer, so this screen cannot
 * offer a movement the engine will not place.
 *
 * ⚠️ `assistance-catalog` IS STILL IMPORTED ABOVE AND STILL USED — by the Get Stronger branch, which
 * is untouched. The two screens sit in one file and read two different tables on purpose.
 */
import {
  DIAL_CAP,
  DIAL_CHIPS,
  DIAL_LABEL,
  DIAL_OWNERSHIP,
  dialRowKey,
  dialRowOptions,
  DIAL_ROW_DAY_IS_THE_COMPOSERS,
  chipHasFrameSlot,
  daysForPick,
  defaultViadaPicks,
  pickOptions,
  VIADA_PICK_KEYS,
  VIADA_PICKS,
  type DialChip,
  type ViadaAccessoryPrefs,
  type ViadaPickKey,
} from '@shared/standing-plan/accessory-picks.ts';
import {
  ACCESSORY_DOSE_LINE,
  ACCESSORY_SUBTITLE,
  CORE_PICK_NOTE,
  DIAL_CAP_NOTE,
  DIAL_SUBLINE,
  dialChipLine,
} from '@/lib/dial-copy';
// Slice 6 — the tracked pull-up progression. A performance GOAL, a different axis from the chips.
import {
  PULLUP_TEST_PROMPT, pullupDoseNote, SESSION_STANDARD_MINUTES, SESSION_STANDARD_REPS, weeklyVolumeFor,
} from '@/lib/pullup-progression';
// §7 — the hard day's gate reads the SAME resolvers the composer prices off. Fed, never re-derived.
// ⛔ THE SCHEDULER'S OPINIONATED DEFAULT — the SAME solver the composer uses, via `@shared`.
// ⛔ THE MENUS MOVED TO `src/lib/` SO A TEST CAN READ THEM (2026-08-18). They were data inside this
// component, which meant the doctrine's terrain rules could only be checked by a human on a device —
// and the recipe suite's Menu Rule had nothing to assert against. Same home as `assistance-menu.ts`,
// for the same reason its header gives: anything the client and the engine must agree on lives here.
import {
  accessoryCostLine, INTENT_ALLOCATION_NOTE, interlockLine, RUN_GROUND_NOTE, RUN_GROUND_OPTIONS,
  SESSION_PRESCRIPTION, singleSlotOptions, SINGLE_SLOT_NOTE,
} from '@/lib/hard-day-menus';
import { relocationPhrase, solveWizardWeek } from '@/lib/suggest-hard-days';
import { resolveCurrent5kPace } from '@/lib/resolve-current-5k-pace';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';

/**
 * ⛔ TWO HARD ENDURANCE DAYS IS THE CEILING (§1i, 2026-08-17) — and the SCREEN enforces it, not only
 * the engine. `strength-primary-plan.ts` caps at two and drops the rest at the door; a third chip
 * here that silently did nothing would be worse than no third chip, because the athlete would have
 * answered a question the plan then ignored.
 *
 * ⚠️ MIRRORS `MAX_HARD_DAYS` in the composer. Two owners of one number is a drift risk and it is
 * accepted deliberately: importing an edge-function constant into the wizard would pull the whole
 * strength chassis into the client bundle. If one moves, move both.
 */
const MAX_HARD_DAY_SLOTS = 2;

/**
 * ⛔ THE HARD DAY'S GROUND, KEYED BY WHAT THE SESSION ACTUALLY IS (Michael, 2026-08-18).
 *
 * One menu could not serve three sessions. Hill / treadmill / short-hill / flat shapes a VO2
 * session; a SPRINT needs flat predictable footing and a safe run-out; a THRESHOLD run needs
 * uninterrupted flat or rolling ground and a treadmill at ONE percent, not the VO2 option's 5-8%.
 * Offering the wrong list is how an athlete ends up choosing the ground for a session whose ground
 * was already decided.
 *
 * ⚠️ THE BIKE'S IS AN ENVIRONMENT, NOT A GRADIENT. Cycling has no footfall, so the question is not
 * what the ground does to the legs — it is whether the rider can hold an exact power target without
 * stopping. `stationary` is on the intervals menu and not the threshold one (a dumb bike can hold a
 * hard effort but not a precise sustained wattage); `long_climb` is the reverse.
 */

import { anchorDaysTaken } from '@/lib/anchor-days';
// The "why can't I continue" rule, extracted so it can be RUN — it shipped a dead Continue button
// beside a fully built week, which is exactly the kind of rule that rots inside a component.
import {
  scheduleBlockedReason as scheduleGateReason,
  scheduleBlockedReasons as scheduleGateReasons,
} from '@/lib/schedule-gate';
// ⛔ ONE COPY OF THE MILEAGE TABLES, shared with `generate-run-plan`. The intake must judge a typed
// week against the SAME numbers the engine builds from, or it is guessing at the athlete.
import {
  validateWeeklyMiles, TIER_SEEDS, tierMismatchNote, longRunCeiling,
  TYPICAL_PEAK_LONG_RUN_MI, type IntakeTier,
} from '@/lib/run-volume-tables';
// ⛔ ONE CALIBRATION, shared with the race form's. Also the ONLY vDOT engine — `effort-score.ts`.
import {
  hasPaceBenchmark, calibrationFromPaces, saveCalibration, formatPaceInput,
  type PaceBenchmarkRow,
} from '@/lib/run-pace-calibration';
import { supabase, getStoredUserId } from '@/lib/supabase';
import WeekGrid from '@/components/WeekGrid';
import { liftingCommitmentLine, liftingDaysForFrame } from '@/lib/lifting-commitment';
import {
  PLACEMENT_RULES, ruleWarning, tierOf, type RuleId,
} from '@/lib/week-rules-copy';
// ⛔ ONE READING OF THE WEEK, shared with whatever renders it next — the letters under the day chips
// are the same rule on all three intake cards, so the rule cannot live on any one of them.
import { roundMiles, roundRideMinutes, splitNote, weekDayRoles, DAY_ROLE_TITLE, type DayRole } from '@/lib/week-budget';
/**
 * ⛔ THE NO-OPINION ANSWER, AND ITS IDENTITY IS STABLE ON PURPOSE. Off the `schedule` step the solve
 * does not run, and this stands in for it. A fresh object literal here would change identity on every
 * render and re-fire the pre-fill effects that depend on it — which is the loop this file already
 * paid for once (see the `touchedUnits` note). Same shape `solveWizardWeek` returns from its own
 * catch: no suggestion is a legal answer, and it is better than a wrong one.
 */
const IDLE_WIZARD_WEEK = {
  hardDays: [] as Array<string | null>,
  longRun: null as string | null,
  longRide: null as string | null,
  health: { ok: true, collisions: [] as string[] },
  relocations: [] as Array<{ unit: string; session: string; sessionId: string; from: number; to: number }>,
};
/**
 * ⛔ THE RIDE-COUNT RANGE HAS ONE OWNER (stage 4, 2026-08-21). It was written out FIVE times — two
 * pickers here, a validator in `create-goal-and-materialize-plan`, a clamp in
 * `generate-strength-plan`, and a clamp in the composer — and three of the five were still capped
 * at 3 after the ceiling was raised to 4. The file this comes from carries the full account.
 */
import {
  RIDE_DAYS_CHOICES,
  RUN_DAYS_CHOICES,
  SWIM_DAYS_CHOICES,
} from '../../supabase/functions/_shared/athlete-weekly-intent';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';
import {
  seedFromGoal,
  derivePlanShape,
  canSetDevelop,
  developCount,
  floorForGoal,
  hoursForTier,
  COMMITMENT_TIERS,
  buildPreferredDays,
  buildStrengthDefaultSlots,
  GOAL_LABELS,
  GOALS_NEEDING_DISCIPLINE,
  strengthDevelopersFor,
  defaultStrengthDeveloper,
  sportFromPosture,
  TWO_BUILD_CEILING,
  type NonRaceGoalId,
  type Discipline,
  type Posture,
  type CommitmentTier,
  type DayName,
} from '@/lib/non-race-goal-seeds';

// Cut C/D — the goal-first non-race builder. The goal SEEDS everything (goal_type + per-discipline
// posture + sport + strength protocol, intersected with the athlete's real disciplines); the posture
// step lets the user confirm/edit those seeds (two-build ceiling blocked at the UI), and picks the
// strength developer when strength=develop. assemblePayload sends the EDITED posture. B4 draft deferred.

const DISCIPLINE_ORDER: Discipline[] = ['swim', 'bike', 'run', 'strength'];
const DISCIPLINE_LABEL: Record<Discipline, string> = { swim: 'Swim', bike: 'Bike', run: 'Run', strength: 'Strength' };
const DISCIPLINE_ICONS: Record<Discipline, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  run: Activity, bike: Bike, swim: Waves, strength: Dumbbell,
};
// ⛔ THE JULY RULE, AND WHY IT NO LONGER READS THE WAY IT DID (rewritten 2026-08-05, SPEC §B).
//
// Michael, 2026-07-25: *"let's clear out all the placeholders — let's just have Strength Focus now,"*
// on the reasoning that *a front door offering five things that do not work is worse than a door
// offering one that does.* Build endurance / Build speed / Build muscle / Maintain / Starting over
// were all pickable and none of them worked.
//
// ⚠️ **That reasoning still stands and is NOT discarded.** What changed is that the door now has two
// levels: the entry screen offers only things that OPEN (Train, Race), and the not-yet disciplines
// live one level down, rendered dimmed and NON-TAPPABLE. A card that says it isn't ready is not the
// thing that rule was written against — a card that opens a half-built flow is. Michael, 2026-08-05:
// *"the run focus ride focus etc are just place holders."*
//
// (Maintain is still never a card: it is the state between blocks, not something an athlete chooses.
// The app drops into it when a block ends. See BUILD-ORDER.)
//
// ⛔ THIS LIST IS GOALS, NOT NAVIGATION — DO NOT PUT `train` / `race` / `build` IN IT. It feeds
// `seedFromGoal` (`:816`), which switches on the goal id; an entry-card id falls through to a default
// and reintroduces the 2026-08-04 progress-bar jump. The entry cards are `ENTRY_ORDER` below, and the
// goal id is set one screen later — Strength → `get_stronger`, Race → `marathon`.
const GOAL_ORDER: NonRaceGoalId[] = ['get_stronger', 'marathon'];

/**
 * ⛔ THE FRONT DOOR — three cards, and it REPLACES "What's the goal?" (SPEC §B, 2026-08-05).
 *
 * Train / Race / Build. These are NAVIGATION, not goals — see the warning on `GOAL_ORDER`. Train
 * drills down to a discipline picker (`TRAIN_ORDER`); Race and Build route straight into their flows.
 *
 * ⚠️ THE HONESTY RULE: the subtitles here are deliberately BROAD ("Train for any race"), and the
 * screen behind each card shows only what is live. Never a card that opens nothing.
 */
type EntryCardId = 'train' | 'race' | 'build';
const ENTRY_ORDER: EntryCardId[] = ['train', 'race', 'build'];
const ENTRY_COPY: Record<EntryCardId, { label: string; blurb: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string | null }> = {
  // Colours mirror the Goals door exactly (`GoalsScreen`) — same three cards, so the same palette.
  // Build carries none: it has no discipline until the athlete writes one.
  // ⛔ RENAMED FROM "Build" (Michael, 2026-08-13): a new user kept tapping it to get a plan — the
  // label claimed the verb Train and Race actually perform. The card names the DIY path plainly;
  // the blurbs on the other two name the outcome (plan) and the differentiator (race date or not).
  train: { label: 'Build a training plan', blurb: 'Run, ride, strength, or a mix — no race needed', Icon: Gauge, color: getDisciplineColor('mobility') },
  race: { label: 'Build a race plan', blurb: 'Train for any race — built to the date', Icon: Flag, color: FOCUS_RACE_COLOR },
  build: { label: 'Build your own', blurb: 'You place the sessions, the engine does the math', Icon: Plus, color: null },
};
/**
 * Build is a CREATE action, not a pick — every catalog app separates the two, so it gets a distinct
 * (dashed) treatment and sits apart. ⚠️ It is NOT live: the flow is spec'd only
 * (`WORKORDER-build-your-own-strength-2026-08-04.md`, Stage 0 not started), so it renders as not-yet
 * rather than opening a door to nothing. Flip this the day the build flow lands.
 */
const ENTRY_LIVE: Record<EntryCardId, boolean> = { train: true, race: true, build: false };

/**
 * ⛔ THE TRAIN DRILL-DOWN — the four ongoing-focus disciplines. Strength is the only one built.
 *
 * "Athletic", never "Multi" (Michael, 2026-08-05): *"Multi" reads as triathlon-only, which is the
 * read we are avoiding.* The card name alone does not signal multi-discipline, so the SUBTITLE
 * carries it — never render one of these without its blurb.
 *
 * ⛔ Run / Ride / Athletic are DIMMED AND NON-TAPPABLE, and they must NOT be wired to the
 * `build_endurance` / `build_speed` / `starting_over` seeds. Those ids still exist in
 * `non-race-goal-seeds.ts` and still work for goals already built on them — pointing a card at one
 * would open exactly the unfinished flow the July rule exists to keep shut.
 */
type TrainCardId = 'run' | 'ride' | 'strength' | 'athletic';
// ⛔ STRENGTH LEADS (Michael, 2026-08-24) — it is the one card that is actually buildable today,
// so it goes first rather than sitting third under two dimmed ones.
const TRAIN_ORDER: TrainCardId[] = ['strength', 'run', 'ride', 'athletic'];
type CardIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
/**
 * ⛔ THEY ARE "<DISCIPLINE> FOCUS", NOT THE BARE DISCIPLINE (Michael, 2026-08-05). "Run" is a thing
 * you do on Tuesday; "Run Focus" is what the block is aimed at, and it is the word the tab, the
 * screen title and the copy all use. One name for one idea.
 *
 * ⛔ COLOURS COME FROM `SPORT_COLORS` (`context-utils.ts`) — the app's one discipline palette. Do not
 * hand-pick a hex. Athletic has no single discipline, so it takes the palette's unclaimed colour
 * rather than borrowing one of the four and implying a default.
 */
const TRAIN_COPY: Record<TrainCardId, { label: string; blurb: string; Icon: CardIcon; color: string }> = {
  run: { label: 'Run Focus', blurb: 'Base, VO2 max, distance', Icon: Footprints, color: getDisciplineColor('run') },
  ride: { label: 'Ride Focus', blurb: 'FTP and endurance', Icon: Bike, color: getDisciplineColor('ride') },
  strength: {
    label: 'Strength Focus',
    // 2026-08-24: the card now fronts the Standing Plan (Viada), not Wendler — the Wendler line
    // described a block this flow no longer builds. Same rule as before: who it's for, no number.
    // The gate (65, barbell-maxes.ts) still refuses true beginners with its own copy.
    blurb: 'Barbell compounds, heavy and fast, with run, ride or both held around them — based on Alex Viada\'s method.',
    Icon: Dumbbell,
    color: getDisciplineColor('strength'),
  },
  athletic: { label: 'Athletic Focus', blurb: 'Several disciplines, balanced', Icon: Shuffle, color: getDisciplineColor('mobility') },
};
/** The goal each Train card seeds. `null` = not built; the card is dimmed and does not navigate. */
const TRAIN_GOAL: Record<TrainCardId, NonRaceGoalId | null> = {
  run: null, ride: null, strength: 'get_stronger', athletic: null,
};

/**
 * ⛔ THE THREE STRENGTH TIERS (SPEC §A). One Wendler spine, three intents — the tier moves accessory
 * VOLUME and CHARACTER (plus a focus area for Definition). The main-lift engine (training max,
 * percentages, deload, the "+" set) is identical in all three.
 *
 * ⛔ STRONG IS TODAY'S PLAN, NOT A NEW ONE. Michael, 2026-08-05: *"strong is our current strength
 * focus plan."* So picking it changes NOTHING about what gets built — it routes into the existing
 * `get_stronger` flow untouched, and sends no new field. Heavy and Definition are dark until the
 * assistance rework lands (`SPEC-assistance-fix.md` §0–§7), because the accessory selection they
 * differ ON is the thing being fixed. Offering them now would ship three names for one block.
 *
 * ⚠️ NOTHING HERE REACHES THE PAYLOAD YET, DELIBERATELY. The spec's resolved call is that the tier
 * travels as its own `strength_tier` field — but that key is ALREADY TAKEN on the plan config by the
 * EQUIPMENT tier (`generate-strength-plan/index.ts`, `strength_tier: 'barbell'`). Two meanings, one
 * key, and the readers would not know which they had. Pick the name when the field is actually
 * needed (when Heavy or Definition ships), not now while Strong is a no-op.
 */
/** ⛔ DEFINITION IS GONE, RULED 2026-08-24 (Michael): its job is the focus chips ("shape where you
 *  choose" is literally the picker), and there is no page behind it — Strong maps to Strength+5K
 *  (p246), Heavy to Hypertrophy+5K (p244, the book's own recommended first program), Definition to
 *  nothing. This screen's earlier comment already called it: three names for one block. */
type StrengthTierId = 'strong' | 'heavy';
const TIER_ORDER: StrengthTierId[] = ['strong', 'heavy'];
const TIER_COPY: Record<StrengthTierId, { label: string; blurb: string; Icon: CardIcon; live: boolean }> = {
  strong: { label: 'Strong', blurb: 'Stronger, not bigger.', Icon: Dumbbell, live: true },
  heavy: { label: 'Heavy', blurb: 'Build muscle.', Icon: Weight, live: false },
};

// ⛔ TIER_ENTRY_NOTE and RUNNER_MILEAGE_CHART MOVED to `standing-plan-week-copy.ts` (2026-08-24
// evening, Michael) — they render beside the miles input on the endurance-week screen now, the
// moment the number they are about is typed. See `VOLUME_HONESTY_LINES` / `RUNNER_MILEAGE_CHART`.

/** Race distances this card offers. One for now — the rest come behind the same machinery. */
const RACE_DISTANCES = ['Marathon'] as const;

/**
 * Label → the key the ENGINE uses. The payload carries the label because that is what
 * `DISTANCE_TO_API` (`create-goal…:195`) expects; the volume tables are keyed by the api value.
 * Mapping in one place so the two never drift apart inside this file.
 */
const RACE_DISTANCE_API: Record<string, string> = { Marathon: 'marathon' };

/**
 * Which discipline a race distance develops. Keyed by distance rather than hardcoded to `run`,
 * because the tri distances arrive behind the same machinery and a 70.3 develops three things —
 * the day that lands, this map is where it is said, not an `if` somewhere in the posture card.
 */
const RACE_DISCIPLINE: Record<string, Discipline> = { Marathon: 'run' };

/**
 * Level, and it is the most load-bearing answer on the race path — it picks the weekly-volume table
 * (`generate-run-plan/types.ts:380`), the long-run arc, and the fallback paces. Same three tiers and
 * the same wording as the existing race form (`GoalsScreen.tsx:2519`) so the two cannot drift.
 *
 * ⚠️ NOT SEEDED FROM DATA HERE. The race form pre-fills this from vDOT or weekly miles when the
 * athlete has baselines; this card asks outright and starts blank. Seeding it is the blank-user
 * slice, not this one — and a blank default was the thing that made the old form quietly pick
 * `intermediate` for someone with no numbers at all.
 */
const FITNESS_TIERS: Array<{ id: IntakeTier; label: string; blurb: string }> = [
  // ⛔ HISTORY WITH THE DISTANCE, NOT AN ADJECTIVE. Higdon's own framing, and the field's: the
  // button names where you are with the marathon, the line under it describes the week that
  // implies. "Beginner / Intermediate / Advanced" as button text asks the athlete to grade
  // themselves, which is a different and harder question than the one we need answered.
  //
  // ⚠️ THE COPY SAYS THE RANGE, THE FIELD GETS THE NUMBER (`TIER_SEEDS`). "40+ miles a week" reads
  // as a description; 40 is what lands in the box, editable.
  { id: 'beginner', label: "Haven't run one", blurb: 'Or coming back after time off. Long run around 6 miles.' },
  { id: 'intermediate', label: 'Finished one before', blurb: 'Running consistently. Long run in double figures.' },
  { id: 'advanced', label: 'Chasing a number', blurb: '40+ miles a week, comfortable with quality work.' },
];

/**
 * `h:mm` or `h:mm:ss` → seconds. Bounded to the range `parseClientPredictedFinishSeconds` accepts
 * server-side (10 minutes to 24 hours) so a typo cannot become a stored target.
 */
function parseTargetTime(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
  return sec >= 600 && sec <= 86400 ? sec : null;
}

/**
 * Whole weeks from today to the race, the way the SERVER counts them
 * (`create-goal…:243` `weeksUntilRace` — ceil, from today, not from plan start).
 *
 * ⚠️ DISPLAY ONLY, AND IT IS AN APPROXIMATION. The server takes
 * `max(floor, min(weeksOut, 20))` and can cap far lower in its race-support / bridge-peak modes,
 * which this cannot predict. Every place it is shown says "about".
 */
function weeksUntilRaceApprox(raceISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raceISO)) return null;
  const ms = new Date(`${raceISO}T12:00:00`).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  const w = Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
  return w > 0 ? Math.min(20, w) : null;
}
const DAYS: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT: Record<DayName, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

/**
 * ⛔⛔ IT DID NOT MATCH THE SESSIONS THE COMPOSER ACTUALLY EMITS (found on the dev preview,
 * 2026-08-25) — and that is half of the contradiction Michael photographed.
 *
 * The test read `/Hill|Threshold|Intervals|Repeat|Club/i`. The Standing Plan composer names its
 * two quality sessions **`Hard Run`** and **`Hard Ride`**, which match NONE of those words — so
 * `proposedDays` came back empty on every Strong Focus week, `dayForSlot` had no engine answer to
 * fall back to, and the "High intensity days" row printed the club sentence beside a placed week
 * that plainly showed both sessions. The row and the list read the same `previewWeek` and still
 * disagreed, because only one of them could recognise it.
 *
 * ⚠️ THE SIBLING DERIVATION HAD `Hard` AND THIS ONE NEVER GOT IT. `strengthRoles` (deleted with
 * the coded strip, above) tested `/Hard|Hill|Threshold|Intervals|Repeat|Club/i` — so the chips
 * lettered the right days while the row beside them said nothing. Two copies of one rule, one of
 * them fixed. It is a named constant now so the next reader finds one owner.
 *
 * ⚠️ THE OTHER WORDS STAY. `Hill Repeats`, `Threshold Run` and `Bike Intervals` are §7's names
 * for the same slots and a Club session carries its own; dropping them would trade this bug for
 * its mirror image.
 */
const IS_HARD_SESSION_NAME = /Hard|Hill|Threshold|Intervals|Repeat|Club/i;

/**
 * ⛔ THE MASTER STRIP — THE PLACED WEEK AT A GLANCE (Michael, round 3, 2026-08-25).
 *
 * Seven days, one dot per session, coloured by sport. It answers "what shape is my week" without
 * being read; the worded list below answers "what exactly is on Thursday". Two views, one job each.
 *
 * ⛔⛔ IT RENDERS THE SAME DATA AS THE LIST AND MUST KEEP DOING SO. Both take `previewWeek` — the
 * server's placed week — and neither derives anything of its own. That is the whole reason a strip
 * is safe to add here at all: this screen has already shipped two objects claiming to describe one
 * week and disagreeing (the coded pill strip vs the day list, killed 2026-08-25). A strip fed from
 * a second source would be that bug rebuilt with rounder pixels.
 *
 * ⚠️ DOTS, NOT LETTERS, AND NOT A LEGEND. The sport hue is the app's wayfinding language and the
 * COUNT of dots is the only other fact carried — how loaded the day is. Nothing here encodes a
 * session TYPE, so there is nothing to decode; the list below names every session in words.
 * ⚠️ A DOT IS A SESSION, so a day holding a lift and a hard run shows two. That is the crowding the
 * athlete is actually deciding about when they move a pin.
 */
function WeekStrip({ byDay }: { byDay: Record<string, string[]> }) {
  return (
    <div className="grid grid-cols-7 gap-1 min-w-0">
      {DAYS.map((d) => {
        const types = byDay[d] ?? [];
        return (
          <div
            key={d}
            className="flex flex-col items-center justify-start gap-1.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] min-w-0"
          >
            <span className="leading-none text-[11px] font-medium text-white/70">{DAY_SHORT[d]}</span>
            {/* ⚠️ THE REST DAY IS A DASH, NOT AN ABSENCE. An empty cell reads as "not loaded yet";
                the dash is the same mark the worded list uses for a day with nothing on it. */}
            {types.length === 0 ? (
              <span aria-hidden className="leading-none text-[11px] text-white/25">—</span>
            ) : (
              <span className="flex items-center justify-center gap-[3px] flex-wrap px-0.5">
                {types.map((t, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="block w-[7px] h-[7px] rounded-full"
                    style={{ backgroundColor: `rgb(${getDisciplineColorRgb(t)})` }}
                  />
                ))}
              </span>
            )}
            <span className="sr-only">
              {types.length === 0 ? 'rest' : `${types.length} session${types.length === 1 ? '' : 's'}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ⛔⛔ `PLACEMENT_RULES` MOVED TO `src/lib/week-rules-copy.ts` (pins-win slice 3, 2026-08-25).
 *
 * The eight sentences lived here as a local const and the violation notes were composed separately
 * a thousand lines below — two statements of one rule, which is how the explainer came to describe
 * a law the warning contradicted. They are one keyed table now: a rule's abstract form and its
 * fired form are the same row, so neither can move without the other.
 * ⚠️ ONE SENTENCE WAS DELETED IN THE MOVE, not carried: *"When two pinned days cannot both be
 * reached, the long day is kept"* is false under this ruling. See the note in that file.
 */

/**
 * ⛔ ONE WEEK, MARKED UP ACROSS THREE CARDS (2026-08-06). Michael, on the split: *"one week laid
 * out — how does the user distinguish?"*
 *
 * The three questions that used to stack on "Your week" are each a seven-day row, and three
 * identical rows on three consecutive screens are indistinguishable — the athlete taps by muscle
 * memory and cannot tell which one they are answering. So it is not three rows. It is THE SAME WEEK,
 * carried forward and accumulating marks:
 *
 *   card 1  tap the days you train              → they fill
 *   card 2  tap which of those is long          → non-training days DIM AND GO DEAD; the pick takes an `L`
 *   card 3  tap a standing hard day, if any     → the `L` is still showing, so the collision is visible
 *
 * ⚠️ THE DIMMING IS THE DISTINGUISHER, not a colour legend. By card 2 the row has visibly changed
 * shape — four of seven chips are inert — so it cannot be mistaken for card 1, and a mis-tap is not
 * available rather than merely discouraged.
 *
 * ⚠️ AND IT MAKES THE THIRD CARD HONEST. The club-next-to-long-run cost (48-72h) has been stated
 * since 2026-08-05, but on the old stacked screen the long run was three questions up the scroll.
 * Here it is a badge on the chip beside the one being tapped.
 */
function WeekDayRow({
  selected, disabled = [], roles = {}, taken = {}, onTap, stacked = [], plain = false, accentRgb,
  pinned = false,
}: {
  /**
   * ⛔ WHOSE DAY IS THIS (pins-win, 2026-08-25). A selected chip means two different things now:
   * the day the ATHLETE tapped, which is absolute, or the day the ENGINE placed the session on,
   * which will move as other pins change. They looked identical, so an athlete could not tell which
   * of their days were actually theirs.
   * ⚠️ WEIGHT, NOT HUE. Both states keep the sport colour — a second colour would read as a second
   * sport. The pin is FILLED and the engine's answer is an OUTLINE, which is the same distinction
   * the app already uses between an answer and a suggestion.
   */
  pinned?: boolean;
  /**
   * ⛔ THE SELECTOR VARIANT (2026-08-25 week-screen pass). `plain` strips the role letters and the
   * ×2 mark and leaves seven day chips that are only a picker — the QUESTION zone. The coded
   * variant survives untouched on the race path, where the row IS the accumulating week the note
   * above describes.
   *
   * ⚠️ IT IS A VARIANT, NOT A REPLACEMENT, AND THE DIFFERENCE IS WHAT THE ROW IS FOR. Marks on a
   * control are a report; a report you can tap is two things at once, which is the fusion this
   * pass split. On the strength path the week is reported ONCE, in words, below.
   * ⚠️ A HELD DAY IS STILL NAMED HERE — `taken` prints the holder's own words under the day rather
   * than a dash, because a dash is the puzzle `taken` exists to stop.
   */
  plain?: boolean;
  /** The sport hue the SELECTED chip fills with. Omit for the wizard's own accent. */
  accentRgb?: string;
  /** Days carrying MORE than one session — a small dot under the letter says "there's more here". */
  stacked?: DayName[];
  /** The day(s) answering the ACTIVE question — ringed, not filled. */
  selected: DayName[];
  disabled?: DayName[];
  /** What each day IS. This is what the fill carries. */
  roles?: Partial<Record<DayName, DayRole>>;
  /**
   * ⛔ DAYS ANOTHER ANCHOR ALREADY HOLDS — day → that anchor's athlete-facing name. Same lock as
   * `DayPicker` and `DaySelect`, and this row was the last card without it (2026-08-09).
   *
   * ⚠️ IT REPLACES A SILENT UNPICK, WHICH IS THE WHOLE POINT. This row asks two questions against
   * one set of days — long run, and the standing session — and it used to resolve a collision by
   * BLANKING whichever answer was older: tapping your club onto your long-run day wiped the long
   * run, on a different line of the same card, with nothing said. The athlete had answered, and the
   * answer quietly stopped existing. Locking states the conflict before the tap instead of
   * destroying an answer after it.
   *
   * ⚠️ DISTINCT FROM `disabled`, which means "not a candidate for this question at all". `taken`
   * means "spoken for, and here is by what" — it renders named, not merely dead.
   */
  taken?: Partial<Record<DayName, string>>;
  /** ⛔ Tapping the day this question already holds RELEASES it — see the toggle note below. */
  onTap: (d: DayName) => void;
}) {
  /**
   * ⛔ THE FILL CARRIES WHAT THE DAY IS; THE RING CARRIES WHAT YOU ARE EDITING (2026-08-06).
   * It was the other way round — the fill marked the active question's answer — so selecting "Club
   * night" with none set emptied every chip and the row went flat, leaving a 9px letter to carry
   * the whole week. Michael: *"they should grey out or something… it's a little hard to read."*
   *
   * Two states, two channels: rest is dim and hollow, a run day is filled, the long run is the
   * accent, the club night is amber. The day you are about to change gets a ring on top of
   * whatever it already is.
   */
  /**
   * ⛔ THE DAY CHIPS ARE NEUTRAL CHROME; THE SPORT LIVES ON WHAT IS PLACED (Michael, 2026-08-18:
   * "the days should be neutral, where you place your runs and rides etc should be sport color").
   *
   * ⚠️ THIS IS THE THIRD COLOURING THIS ROW HAS HAD AND THE FIRST TWO ARE WHY. It painted picked
   * anchors in the wizard ACCENT — which on this path is strength orange, so a long-RUN day glowed
   * the strength hue. That was corrected to plain white, which stopped miscoding and left the grid
   * saying nothing about sport at all: seven near-identical boxes where four different disciplines
   * were sitting.
   *
   * ⛔ SO THE SURFACE IS ONE NEUTRAL FOR EVERY DAY, and the ROLE LETTER carries the discipline —
   * `LR`/`R` gold, `LB` green, `H` amber for intensity. The eye reads the week's shape off the
   * letters rather than off seven competing backgrounds.
   * ⚠️ `H` STAYS AMBER AND IS NOT A SPORT. It is this file's mark for an intensity day, run or ride
   * alike; colouring it by discipline would lose the one thing it exists to say.
   */
  const NEUTRAL = 'bg-white/[0.04] border-white/15';
  const letterColour: Record<DayRole, string> = {
    R: `rgba(${getDisciplineColorRgb('run')},0.55)`,
    E: `rgba(${getDisciplineColorRgb('run')},0.65)`,
    LR: `rgb(${getDisciplineColorRgb('run')})`,
    LB: `rgb(${getDisciplineColorRgb('bike')})`,
    B: `rgba(${getDisciplineColorRgb('bike')},0.65)`,
    S: 'rgba(255,255,255,0.45)',
    H: 'rgb(251,191,36)',
    C: 'rgb(251,191,36)',
  };

  /**
   * ⛔ SELECTED IS FILLED, NOT RINGED (punch item 2, 2026-08-25). The picked day carried a
   * `ring-2 ring-white/60` over a near-identical surface — on a phone that is a hairline, and a
   * screenshot of seven chips did not say which one was the answer. A chip is now either the
   * neutral surface or the sport's own fill; the difference is the whole chip, not its edge.
   *
   * ⚠️ SPORT COLOUR IS THE FILL AND NOT A SECOND CODE. It repeats what the row's own label
   * already says in words, which is the only reason it may be a colour: nothing rides on the hue
   * alone. That is the same rule the killed letter legend broke.
   */
  const A = accentRgb ?? 'var(--wiz-accent-rgb, 236,233,227)';
  return (
    <div className="grid grid-cols-7 gap-1 min-w-0">
      {DAYS.map((d) => {
        // ⛔ A DAY WITH NOTHING GETS NO LETTER (Michael, 2026-08-24: "there shouldn't be a
        // letter in a day with nothing — honestly the letters are confusing"). The 'R' fallback
        // lettered every empty day, which drowned the four letters that meant something.
        // ⛔ AND ON THE PLAIN SELECTOR THERE ARE NO LETTERS AT ALL (2026-08-25). Same finding,
        // taken to its end: the week is reported once, in words, in the answer zone below.
        const role = plain ? undefined : roles[d];
        const active = selected.includes(d);
        // ⚠️ THE ACTIVE QUESTION'S OWN DAY IS NEVER LOCKED, or it could not be released.
        const heldBy = active ? undefined : taken[d];
        const off = disabled.includes(d) || !!heldBy;
        // ⚠️ THE MARKS LINE ONLY RESERVES ITS HEIGHT WHERE SOMETHING CAN FILL IT. On the plain
        // selector nothing ever does, so reserving it is a blank strip under all seven chips.
        return (
          <button
            key={d}
            type="button"
            disabled={off}
            onClick={() => !off && onTap(d)}
            title={heldBy ? `${DAY_SHORT[d]} is your ${heldBy}` : (active ? 'Tap again to clear' : (role ? DAY_ROLE_TITLE[role] : DAY_SHORT[d]))}
            aria-label={heldBy
              ? `${DAY_SHORT[d]} — unavailable, held by your ${heldBy}`
              : (active ? `${DAY_SHORT[d]} — selected, tap to clear` : DAY_SHORT[d])}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] min-w-0 border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              plain ? 'py-2.5' : 'py-2'
            } ${
              off ? 'bg-transparent border-white/5 text-white/15'
                : active ? 'text-white font-semibold' : `${NEUTRAL} text-white/70`
            }`}
            style={active && !off
              ? (pinned
                // The athlete's own day: filled, and the ring doubled so it reads as committed.
                ? { backgroundColor: `rgba(${A},0.34)`, borderColor: `rgb(${A})`, boxShadow: `inset 0 0 0 2px rgb(${A})` }
                // The engine's answer: the same hue, carried by the outline alone.
                : { backgroundColor: 'transparent', borderColor: `rgba(${A},0.75)`, boxShadow: 'none' })
              : undefined}
          >
            <span className="leading-none font-medium">{DAY_SHORT[d]}</span>
            {/* Named, not just greyed — an inert square is a puzzle; "long run" is an answer. */}
            {/* ⛔ THE LETTER IS WHERE THE SPORT SHOWS. Neutral box, coloured mark. */}
            {plain ? (
              // ⛔ THE HOLDER IS NAMED ON THE CHIP, not in a `title` a thumb cannot reach. This is
              // the `taken` contract made visible: locked, and here is by what.
              heldBy ? (
                <span className="leading-tight text-[8px] text-white/30 text-center px-0.5 break-words">{heldBy}</span>
              ) : null
            ) : (
              <>
                <span
                  className="leading-none text-[9px] font-medium"
                  style={off || !role ? undefined : { color: letterColour[role] }}
                >{heldBy ? '—' : (role ?? '\u00A0')}</span>
                {/* ×2 — this day carries two sessions (Michael, 2026-08-24: clearer than a dot). */}
                {stacked.includes(d) && !off ? (
                  <span aria-hidden className="leading-none text-[8px] text-white/50 mt-0.5">×2</span>
                ) : <span aria-hidden className="leading-none text-[8px] mt-0.5">{'\u00A0'}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ⛔ A DAY ALREADY HELD BY ANOTHER ANCHOR IS LOCKED, NOT AVAILABLE-THEN-RESOLVED (2026-08-09).
 *
 * The long run, the long ride and the hard day are ANCHORS: the solver treats them as fixed and
 * places the barbell around them. Two anchors on one day is therefore not a preference the engine
 * can arbitrate — `week-solver` has a typed refusal for it whose own copy says *"Both are fixed, so
 * this is yours to resolve — the engine will not pick one."*
 *
 * ⚠️ SO THE FIX BELONGS AT INPUT. The collision that is never entered needs no dedupe, no refusal
 * screen and no explanation after the fact. `taken` greys the day and disables the button, and the
 * label says WHICH anchor holds it — an inert grey square is a puzzle, a grey square that says
 * "long run" is an answer.
 *
 * ⛔ THIS REPLACES A LAST-WRITE-WINS CLEAR. The club-day handler used to blank `longRunDay` when the
 * club took its day — a silent unpick of something the athlete had already chosen, on a different
 * card, with no message. Locking says the same thing before the fact instead of after it.
 */
function DayPicker({ value, onChange, allowed, taken }: {
  /** ⛔ Receives `''` when the athlete taps the day already selected — the release. */
  value: DayName | ''; onChange: (d: DayName | '') => void; allowed?: DayName[];
  /** day → the athlete-facing name of the anchor holding it. Absent = free. */
  taken?: Partial<Record<DayName, string>>;
}) {
  const days = allowed ?? DAYS;
  return (
    <div className={allowed ? 'flex gap-1' : 'grid grid-cols-7 gap-1'}>
      {days.map((d) => {
        // ⚠️ THE CURRENT VALUE IS NEVER LOCKED. A picker whose own selection reads as taken cannot be
        // re-confirmed and looks broken to the athlete who set it.
        const heldBy = value === d ? undefined : taken?.[d];
        return (
          <button
            key={d} type="button" disabled={!!heldBy}
            // ⛔ TAP-TO-RELEASE. Tapping the selected day clears it rather than re-confirming a
            // choice that was already made — no pick is ever stuck, on any card.
            onClick={() => { if (!heldBy) onChange(value === d ? '' : d); }}
            title={heldBy ? `${DAY_SHORT[d]} is your ${heldBy}` : undefined}
            aria-label={heldBy
              ? `${DAY_SHORT[d]} — unavailable, held by your ${heldBy}`
              : (value === d ? `${DAY_SHORT[d]} — selected, tap to clear` : DAY_SHORT[d])}
            className={`${allowed ? 'flex-1 ' : ''}py-2 rounded-xl text-xs ${
              heldBy
                ? 'bg-white/[0.02] text-white/25 border border-white/[0.06] cursor-not-allowed'
                : value === d
                  ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]'
                  : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
          >
            {DAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

// ⛔ `DaySelect` LIVED HERE AND IS GONE (2026-08-09) — replace means delete.
//
// It was three one-line `<select>`s, and its reason was sound: the scheduler carries THREE day
// questions, and as three seven-button grids they took three rows and pushed the week off the
// screen. Michael, then: *"you need to be able to click and see everything without scrolling."*
//
// ⚠️ THAT OBJECTION IS NOT REVERSED, IT IS ANSWERED BETTER. The dropdowns cost less height than
// three grids and still could not show a selection — each one knew only its own answer, so the card
// had no picture of the week and needed a nine-rem placeholder box to say so. The scheduler now uses
// what the race card already used: an answer card listing all three questions, and ONE `WeekDayRow`
// serving whichever is open. Three questions, seven chips, one row — fewer rows than the selects it
// replaces, and it renders the week as it fills.
//
// `DayPicker` above is untouched and still used by the per-discipline cards, where nothing competes
// for the screen.

/**
 * The (i) that opens the volume rationale, sitting on an input LABEL rather than on a line of its
 * own — so the receipt stays one tap away without the card spending a row to advertise it.
 *
 * ⚠️ A COMPONENT RATHER THAN TWO COPIES OF THE MARKUP, because it renders against whichever field
 * the card actually has: the running label normally, the riding label for a bike-only athlete. Two
 * inline copies is how one of them ends up with a different aria-label or a stale handler.
 */
function VolumeWhyToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Why the volume number matters"
      className="shrink-0 text-white/40 hover:text-white/70 transition-colors"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  );
}

// ⛔ THE HARD DAY THE ATHLETE ALREADY OWNS — asked ON the discipline's own card, never as a separate
// "Fixed sessions" screen. Michael, 2026-07-25: *"run club hard conditioning day needs to be in
// here."* A club run is a RUN fact; splitting it out asked the athlete to hold their running in their
// head across two screens.
//
// It is not the same question as the long day, and the difference is the whole reason it is asked.
// The long run is volume — steady, aerobic, the engine. A club night, track repeats, a chaingang, a
// sled session is a HARD day, and it draws on the same recovery a heavy squat or deadlift does. The
// app does not remove it and does not warn about it: it takes the day, calls it hard, and books the
// lifting around it.
//
// ⚠️ WHAT THE COPY MAY NOT SAY YET: that the lifting moves for it. `place-week.ts` is the solver that
// makes that true and it is UNWIRED — and `create-goal-and-materialize-plan:2465` forwards only
// `long_run` from `preferred_days` to `generate-strength-plan`, so `quality_run` / `quality_bike`
// reach the GOAL and stop there. So the line states what the session IS (a hard day, same recovery
// bank), not what the engine will do with it. Promote the copy the day the pin arrives.
// ⛔ REMOVED 2026-07-26 (D-327): `TWO_HARD_DAYS_LINE` and the "Mulholland" two-hard-days dialog.
// They stated a ceiling of TWO hard aerobic days. `DOCTRINE-aerobic-maintenance.md` §6 makes it ONE,
// so the line was wrong, not merely dead, and the dialog fired on a transition that can no longer
// happen. Michael's call, explicitly: *"it was a late night fun thing, not necessary."*
// The rule now lives on the `schedule` screen's "Hard day" row — one toggle, options limited to the
// disciplines they kept. Do not reinstate a warning here, and do not re-add a per-discipline picker.
// ⚠️ IT WAS A STANDALONE `hardday` CARD UNTIL 2026-07-28, when the scheduler rebuild absorbed it. The
// dead render block survived until 2026-08-06 and cost a bug — see the note where it was deleted.

// ⛔ D-327 — ONE HARD AEROBIC DAY, asked ONCE, now on the `schedule` screen's "Hard day" row.
//
// This used to be a `QualityDayPicker` on the run card and another on the bike card, with whichever
// came second GREYED and a swap offered. That worked, but it was one question wearing two costumes:
// the block carries exactly one hard aerobic day, so offering two slots and then refusing the second
// meant the athlete picked a hard run and was told on the next screen it was the worse choice.
// Framing the ride as a correction rather than the default.
//
// One card, one question, options limited to the disciplines they kept — so there is no second slot
// to refuse, no greying, and the doctrine's reason gets stated once instead of split across two
// sections most athletes only ever see one of.
// Mirror ArcSetupWizard's chip→tier derivation (:2103-2109): barbell present → full_barbell; else DB
// present → dumbbell_based; else bodyweight_bands. Drives the equipment-aware strength developer default
// (5×5 needs loadable resistance; a bodyweight/bands athlete falls back to durability).
function equipmentTierFromArc(arc: unknown): 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands' {
  const chips = ((((arc as { equipment?: { strength?: unknown } } | null)?.equipment?.strength) as string[] | undefined) ?? [])
    .map((s) => String(s).toLowerCase());
  // A commercial / full gym HAS barbells — recognize it (was falling through to bodyweight_bands →
  // durability instead of 5×5; the engine-side resolver already treats 'Commercial gym' as barbell).
  const hasBarbell = chips.some((s) =>
    s.includes('barbell') || s.includes('rack') || /\bbar\b/.test(s) ||
    s.includes('commercial') || s.includes('full gym'));
  const hasDumbbell = chips.some((s) => s.includes('dumbbell') || /\bdb\b/.test(s));
  if (hasBarbell) return 'full_barbell';
  if (hasDumbbell) return 'dumbbell_based';
  return 'bodyweight_bands';
}

type NonRaceState = {
  /**
   * Which front-door card was tapped (SPEC §B). NAVIGATION ONLY — it never reaches the payload and
   * nothing derives a plan from it; it exists so the step machine knows whether the Train drill-down
   * belongs in the flow, and so Back walks entry ← train instead of jumping to the door.
   */
  entry: EntryCardId | null;
  /**
   * Which strength tier was picked (SPEC §A). Only `strong` is selectable today and it is a no-op —
   * see `TIER_COPY`. Held in state so the card reads as chosen and Back returns to it.
   */
  strengthTier: StrengthTierId | null;
  /** Easy-swim add-on count (Michael, 2026-08-24): 0 = none, 1–2 = easy/technique swims appended
   *  outside the four endurance slots. Cap 2 — past that the athlete wants a tri plan. */
  swimEasySessions?: 0 | 1 | 2;
  goal: NonRaceGoalId | null;
  discipline: Discipline | undefined;
  posture: Partial<Record<Discipline, Posture>>;
  strengthProtocol: string | undefined;
  commitment: CommitmentTier;
  targetWeeks: number;
  daysPerWeek: number;
  /** The days the athlete can train. Empty = unanswered; rest is the remainder. */
  trainingDays: DayName[];
  longRunDay: DayName | '';
  /**
   * ⛔ THE LONG SESSION IS A CLUB RIDE (slice 2b, 2026-08-25). Ownership on the LONG slot, kept out
   * of `hardDays` so it cannot be counted as a hard session — `hardDays.length` is what the
   * endurance tier and the composer read, and the handoff is explicit that club on the long card
   * does not consume a hard slot.
   * ⚠️ ITS DAY IS STILL `longRunDay` / `longRideDay`. Club changes who owns the day, not where the
   * day is stored — a second home for it is how the two would drift.
   */
  longClub: boolean;
  /**
   * ⛔ HOW LONG THE CLUB RIDE ACTUALLY RUNS, in minutes (slice 2b). The one fact only the athlete
   * has — the app cannot derive it, and without it the shortfall note has nothing to compare.
   * ⚠️ EMPTY IS "NOT ASKED", NOT ZERO. An unanswered duration produces no note at all rather than a
   * note claiming the ride is 0 minutes short.
   */
  longClubMinutes: number | '';
  longRideDay: DayName | '';
  /** The hard day the athlete already owns — a club run, a track night, a chaingang — PER DISCIPLINE.
   *  Was a single `anchorDiscipline` + `anchorDay`, which forced a runner who also rides to pick one
   *  and lose the other. `preferred_days` has always had room for both (`quality_run`, `quality_bike`),
   *  so the single-anchor shape was the narrower thing, not the safer one. */
  // ⛔ THE DAY MAY BE EMPTY WHILE THE DISCIPLINE IS CHOSEN (2026-07-29). Tapping Run or Ride used to
  // seed 'tuesday' so the select had a value — an arbitrary day, not a derived one: the doctrine
  // steers the DISCIPLINE (bike over run, on tissue cost) and has never had a view on which day.
  // Michael: *"leave it empty unless there is an ideal."* Nothing derives an ideal — the solver takes
  // the hard day as a fixed anchor and places lifting around it — so empty it is.
  // ⚠️ PRESENCE, NOT TRUTHINESS, is now what "this discipline is picked" means. Read with
  // `d in qualityDays`; `!!qualityDays[d]` is false for a chosen discipline awaiting its day.
  qualityDays: Partial<Record<'run' | 'bike', DayName | ''>>;
  /**
   * ⛔ UP TO TWO HARD DAYS, ANY MIX (§1i, 2026-08-17). Two runs, two rides, one of each, one, or
   * none. `qualityDays` above is keyed BY SPORT and so can only ever hold one of each — it stays as
   * the race path's club-night input, which is a different question; this is the Strong Focus
   * hard-day answer and it is a LIST because two hard runs is now a legal week.
   *
   * ⚠️ EACH SLOT CARRIES ITS OWN OWNERSHIP — one checkbox: "this is a club session I already
   * attend". ⛔ THE "OURS TO WRITE" FRAMING IS RETIRED (Michael, 2026-08-18: *"that's weird
   * sounding anyway"*) and must not come back. Both kinds count as hard days for placement and
   * recovery, identically; the ONLY difference is that a club slot gets no session template,
   * because the app cannot write 4 × 3 min uphill into a group run and must not pretend to.
   *
   * ⚠️ A SLOT MAY HAVE A DISCIPLINE AND NO DAY YET — the same rule `qualityDays` documents. Presence
   * in this list means the discipline is chosen; the day arrives after.
   */
  /**
   * ⛔ THE SLOT CARRIES ITS OWN ANSWERS NOW (2026-08-18). `goal`, `terrain` and `environment` were
   * either global (`qualityRunTerrain`) or absent, and neither survives two hard days with different
   * shapes: an athlete running sprints on Tuesday and a threshold run on Friday needs two different
   * grounds, and one field cannot hold both.
   */
  hardDays: Array<{
    /**
     * ⛔ WHICH HARD SLOT THIS ENTRY IS (2026-08-25). The array used to be POSITIONAL — hard1 at
     * index 0, hard2 at index 1 — which held only while both slots always existed. **Hard sessions
     * became removable**, so the array is now "the sessions the athlete added" and its length is
     * what the tier reads; an entry's index no longer says which slot it came from.
     *
     * ⚠️ Absent on drafts made before today. `hardEntry` falls back to the positional read for
     * those, which is correct for them because they always carried both slots.
     */
    slot?: 'hard1' | 'hard2';
    discipline: 'run' | 'bike';
    day: DayName | '';
    ownership: 'prescribed' | 'club';
    /**
     * ⛔ THE ATHLETE'S OWN ALLOCATION (2026-08-18) — WHICH SESSION THIS SLOT IS.
     * Absent → the old positional rule (first prescribed slot is the intensity one), which is what
     * every draft made before today carries. `hardRoleOf` holds both paths.
     */
    role?: 'intensity' | 'threshold';
    /** ⛔ THE WITHIN-FAMILY VARIANT (2026-08-24) — the library's archetype id for this slot, the
     *  athlete's pick; absent = the engine's rotation. See `slotVariantOptions`. */
    archetype?: string;
    /**
     * ⛔ THE ONE GROUND QUESTION LEFT, AND IT IS ASKED AS A GOAL. Flat sprints or hill repeats —
     * the eccentric/concentric fork, the only ground choice that reaches Layer 1. Run slots holding
     * the intensity role only. Absent → hills.
     */
    goal?: 'speed' | 'vo2';
    /**
     * ⚠️ NO LONGER WRITTEN BY THE WIZARD (2026-08-18) — the surface menus moved into the session
     * descriptions. Kept on the shape because drafts made before today carry values, and the
     * composer still honours them.
     */
    terrain?: string;
    /** ⚠️ SAME — read from old drafts, never set by this screen any more. */
    environment?: string;
  }>;
  /**
   * ⛔ WHICH GROUND THE HARD RUN HAPPENS ON. The one fact about this session the app cannot derive —
   * whether there is a climb outside their door they can run hard for three minutes. Not in posture,
   * not in history, not in their sport.
   *
   * ⚠️ THIS IS NOT A NEW STEP AND MUST NOT BECOME ONE (doctrine §2.0, 2026-07-26: *"No 'do you have
   * a hill?' step… availability reveals itself in the choice"*). It renders inside the hard-day card
   * they are already on, revealed under "Hard run" exactly as the day picker is.
   *
   * ⚠️ Only meaningful for RUN. Picking "Hard ride" or "None" leaves it unread — the ride is
   * Helgerud 4 × 4 on any terrain, and "None" means there is no hard session to give ground to.
   */
  qualityRunTerrain: 'hill_3min' | 'hill_short' | 'treadmill' | 'flat';
  /** What they NORMALLY run, in their display unit. The band is a fraction of THIS — an absolute
   *  band tells a 40-mile runner and a 10-mile runner the same thing, and it is only true for one. */
  usualMiles: number | '';
  targetMiles: number | ''; // Get Strong: typed maintenance mileage, in the user's display unit; canonicalized to miles at confirm
  /** ⛔ Has the athlete typed in the hold field THEMSELVES? The seed re-runs until they have.
   *  Emptiness is NOT the test: `onChange` fires per keystroke, so typing "28" seeds off "2" first
   *  (dose 1), and the field is no longer empty when the "8" arrives. The hold then stays at 1 while
   *  the copy above it correctly reads "holds about 19" — the seed locked on the first digit. */
  targetTouched: boolean;
  runDays: number; // Get Strong: how many days to run (2/3/4) — engine spreads the miles + stacks extras onto upper lift days
  /** Strength Focus: the athlete's pick for each of the three assistance slots. Empty = the engine's
   *  bodyweight default, so skipping this is a valid answer that still yields a complete block.
   *  (Replaced `accessoryBias` — the Glutes/Hyrox add-ons move to the Adjust tab, D-323, where they
   *  REPLACE a slot rather than stacking on top of the block.) */
  /** D-407: nine slots × three day keys + the focus chips. Persisted whole. ⚠️ Three keys as of
   *  slice 5 — the press key is deleted, not stored; `normalizeAssistancePrefs` returns the current
   *  shape whatever an older goal carries. */
  assistancePicks: AssistanceWeekPrefs;
  /** Swim slots per week. Booked, not coached (D-323 §5) — it exists for the triathlete who wants
   *  the time held. Only asked when swim is kept for the block. */
  swimDays: number;
  /** Weekly riding to hold, in HOURS (D-323 §6 — never miles; the app learns no ride speed). */
  rideHours: number | '';
  /** How many days the weekly ride hours spread across. The run has always asked this; the bike
   *  did not, so the composer had a total with nothing to divide it by. */
  rideDays: number;
  /** ⛔ WEEKLY SWIM DISTANCE, in the athlete's own unit (yards, or metres for a metric athlete).
   *  Stored on the goal; nothing reads it yet — see the swim block on the volume card. */
  swimVolume: number | '';
  startDate: string; // Week 1 start (YYYY-MM-DD); plans are Monday-based so this snaps to that week server-side
  /** ⛔ Standing Plan only: the athlete took the offer to open on logged numbers instead of a test
   *  week. Absent/false is the default and the default is the test. */
  skipTestWeek?: boolean;
  /**
   * ⛔ WHICH SPORT FILLS EACH OF THE FRAME'S FOUR ENDURANCE SLOTS (2026-08-24). The athlete's ONLY
   * endurance-shape choice on the Standing Plan — the program owns the count, so `runDays` and
   * `rideDays` are DERIVED from this rather than asked. See `EnduranceWeekCard.tsx`.
   */
  slotSports?: SlotSelection;
  /** Race day (YYYY-MM-DD). Empty on every non-race goal — its presence IS "this is a race goal",
   *  and it is what flips `assemblePayload` from a capacity goal to an `event` one. */
  raceDate: string;
  /** Race distance as the SERVER's label vocabulary expects it (`DISTANCE_TO_API`, `create-goal…:195`
   *  — 'Marathon' → 'marathon'). Sending the lowercase api key here would not resolve. */
  raceDistance: string;
  /**
   * ⛔ THE RACE'S OWN NAME. Without it every marathon goal was literally called "Marathon" —
   * `assemblePayload` fell back to `GOAL_LABELS[goal]`. The name reaches the plan title, the goal
   * card, and the coach, so a real one is worth one field.
   */
  raceName: string;
  /**
   * Total climb, in the athlete's display unit. OPTIONAL — never gates the build.
   * Empty is a legitimate answer and the plan is built without any terrain claim at all.
   */
  raceElevation: number | '';
  /** Self-reported level. Race path only; blank until answered — see FITNESS_TIERS. */
  fitness: 'beginner' | 'intermediate' | 'advanced' | '';
  /**
   * ⛔ WHAT THE ATHLETE IS AFTER, AND IT PICKS THE GENERATOR — not a label.
   * `complete` → `sustainable` (effort-based, needs no numbers); `speed` → `performance_build`,
   * built on real pace targets (`create-goal…:3411`). Blank until answered.
   */
  raceIntent: 'complete' | 'speed' | '';
  /** Is the standing session hard or easy? Mirrors `ArcSetupWizard`'s `groupRunIntensity`. */
  runClubIntensity: 'quality' | 'easy';
  /** Calibration fields, shown only when `speed` is picked with no pace on file. */
  calEasy: string;
  calFiveK: string;
  /**
   * ⛔ THE ATHLETE'S CURRENT LONG RUN — seeded by the level tier, editable, and it is NOT
   * decoration. It travels as `recent_long_run_miles`, which `getProgressionOffset`
   * (`generators/base-generator.ts:133`) uses to decide how far into the long-run arc the plan
   * starts. With it absent the arc always enters at week 1 regardless of the athlete.
   */
  longRunMiles: number | '';
  /** Target finish, `h:mm` or `h:mm:ss`. Only asked when the intent is a time. */
  targetTime: string;
  /**
   * Days the athlete cannot move — a club night, a track session, a standing group run. The solver
   * takes them as fixed anchors. Cheap version of the run-club model: a locked slot, no type yet.
   */
  fixedDays: DayName[];
};

type StepKey =
  // ⛔ `goal` IS NOW THE ENTRY SCREEN — Train / Race / Build (SPEC §B, 2026-08-05). The key keeps its
  // name because every `stepNo`/`steps.indexOf` caller and the back-to-close behaviour at `:830` key
  // off it; renaming it is a bigger diff than it is worth for a screen whose job did not change (it
  // is still "the first card, and the one Back closes the builder from").
  | 'goal'
  // ⛔ THE TRAIN DRILL-DOWN — Run / Ride / Strength / Athletic. Only reachable from the Train entry
  // card, and only Strength opens anything today. It sits between `goal` and the picked goal's own
  // flow, so the Strength path is: entry → train → tier → posture → … → confirm.
  | 'train'
  // ⛔ THE STRENGTH TIER — Strong / Heavy / Definition (SPEC §A). Only on the Strength path, and only
  // Strong is live: it is today's block, so the step is a pass-through that sends nothing new.
  | 'tier'
  // ⛔ THE RACE ITSELF — distance, date, level. Its own card, immediately after the goal, because
  // every screen after it is shaped by the answers: the date owns the block length (so the `length`
  // step drops out), and the level picks the volume table the plan is built from.
  | 'race'
  // ⛔ SPLIT OUT OF `race` (2026-08-04). One question per card: the race card asks WHICH RACE, the
  // level card asks WHERE THEY ARE, the intent card asks WHAT IT IS FOR. They were stacked on one
  // scrolling card and the level question — the one that seeds every number in the plan — sat
  // below the fold.
  | 'level' | 'intent'
  | 'posture' | 'commitment' | 'length'
  // The old single `schedule` step, split one card per screen (below).
  | 'days' | 'accessory' | 'run' | 'bike' | 'swim'
  /**
   * ⛔ THE ENDURANCE WEEK — ONE SCREEN, REPLACING `volume` + `hardday` ON THE STRENGTH PATH
   * (Michael's flow, 2026-08-24). Those two asked one question in two places: how much, then how
   * many of each, then which were hard. **The program owns the count** (8-21 §3c) — the frame has
   * four endurance slots, always — so the count pickers asked the athlete to decide something the
   * plan had already decided. What is theirs is which SPORT fills each slot. See
   * `EnduranceWeekCard.tsx`.
   * ⚠️ `volume` and `hardday` still exist for every OTHER goal; only the strength path stops using
   * them.
   */
  | 'endurance'
  // ⛔ STRENGTH, ON ITS OWN CARD (2026-08-06) — one primary decision per screen. It was the fifth
  // question on "Your week" and got missed on a device.
  | 'strength'
  // ⛔ THE WEEK WAS BRIEFLY THREE STEPS AND IS ONE AGAIN (2026-08-06). Those step keys are gone.
  // Michael: *"i thought we were doing one week 3 questions."* Three cards each holding a single
  // seven-chip row is three taps to answer what is visibly one thing, with the phone empty beneath.
  // The card stays and the week is drawn once; the three questions sit under it and you pick one
  // (`weekQuestion`) before tapping days. `weekStage` — the Next-tap version — is gone too. [D-398]
  // ⛔ THE SCHEDULER — one screen, rebuilt 2026-07-28, replacing `run` + `bike` + `hardday` on the
  // strength path. Those three asked the same question in three places and none of them could show
  // the answer: how many endurance sessions fit around the lifting days, and where the one that
  // does not fit lands. Michael: *"this is a rebuild, one simple scheduler."*
  //
  // ⚠️ VOLUME STAYS SEPARATE. Miles and hours are HOW MUCH; this card is WHEN. Deciding the second
  // while looking at the first is what made the old run card scroll past the fold.
  // ⛔ HARD DAYS GET THEIR OWN PAGE (Michael, 2026-08-18) — "so when they get to scheduler it's just
  // picking, and hard days can be explained better in their own section". It renders the SAME
  // disclosure list as `schedule`, filtered to the one row: the control, its rationale, the
  // ownership question and the terrain menu are ~500 lines of JSX that already work, and copying
  // them into a second block would be the doubled disease. One renderer, two steps, filtered.
  | 'hardday'
  | 'schedule' | 'volume'
  // ⛔ THE 'lifting' STEP IS DELETED (§1f-0, 2026-08-16). It asked four days or three, and there is
  // no longer a choice to make: every Strong Focus block is three — Squat · Bench · Deadlift + Press.
  // Do not reintroduce it, and do not keep a four-day branch "for later" — the option is gone from
  // the engine (`StrengthPrimaryArgs` has no `liftingDays`), so a card offering it would be a screen
  // asking a question nothing downstream can answer.
  | 'confirm';

// ⛔ ONE DISCIPLINE, ONE SCREEN. Michael, 2026-07-25: *"everything should have its own card, no
// scroll"* — then, having walked it: *"run can all sit on the same card, as with bike and swim, each
// just has one card where you work it out."*
//
// The schedule step used to stack Strength / Run / Bike / Fixed / Swim in one scrolling column, so a
// triathlete met a form long enough that the controls below the fold read as absent. Each is now its
// own step, and the flow is built from what the athlete KEPT — someone who dropped the bike never
// sees a bike screen. The unit is the DISCIPLINE, not the question: run holds its day and its volume
// together, because deciding one without seeing the other is deciding half of it.
// This is grouping, not new logic: every control here was already gated on posture.
function scheduleSteps(state: NonRaceState, isStrengthFocus: boolean, isRaceGoal = false): StepKey[] {
  const kept = (d: Discipline) => state.posture[d] != null && state.posture[d] !== 'out';
  const strengthDevelop = state.posture?.strength === 'develop';
  const out: StepKey[] = [];
  // ⛔ NOT ON THE STRENGTH PATH. Lifting is three days fixed by the protocol (§1f-0) and the
  // endurance days are typed per discipline, so a total would only contradict both.
  // *"how many days is redundant."*
  if (!isStrengthFocus) out.push('days');
  // ⚠️ ON THE STRENGTH PATH THIS MOVED DOWN, to after the volume — see the block below. Every other
  // goal keeps it here: there is no endurance tier deciding its numbers.
  if (strengthDevelop && !isStrengthFocus) out.push('accessory');
  // ⛔ ONE SCHEDULER ON THE STRENGTH PATH. Every other goal keeps the per-discipline cards, because
  // there the endurance IS the plan and there is no lifting frequency to fit it around.
  /**
   * ⛔⛔ THE ENDURANCE LOAD IS GATHERED BEFORE THE STRENGTH ACCESSORIES, AND THE CALENDAR IS LAST
   * (Michael, 2026-08-17). Strength path: goal → train → tier → posture → **volume (incl. swim) →
   * accessory → schedule** → confirm.
   *
   * ⛔ IT IS A DATA DEPENDENCY, NOT A PREFERENCE. The accessory card's rep totals come from the
   * ENDURANCE TIER — hard days plus total weekly hours (`resolveEnduranceTier`, and
   * `docs/SPEC-viada-ingestion-order.md`). Asked before the volume, that card cannot state the
   * number the athlete is signing up for, and the swim gate's warning on the pull-up progression
   * cannot fire at all because the swim answer arrives two screens later. The ENGINE was put in this
   * order on 2026-08-17; this is the screen catching up.
   *
   * ⚠️ AND IT GROUPS THE HUMAN DECISIONS: how much you do, then what you want to work on, then when.
   * The calendar is the last thing because it is the only step that depends on all of the others.
   */
  if (isStrengthFocus && (kept('run') || kept('bike'))) {
    // ⛔ ONE SCREEN NOW (2026-08-24). `volume` + `hardday` were two cards asking one question; see
    // the `endurance` StepKey. They are untouched for every other goal.
    out.push('endurance');
    // ⚠️ `hardday` IS GONE FROM THIS PATH. Its two jobs — which sessions are hard, and their flavour
    // — moved into the endurance screen's slot cards, where each sits inside the session it is
    // about. The accessory card's data dependency is unchanged: it still runs after the endurance
    // answer, which is now one step instead of two.
    if (strengthDevelop) out.push('accessory');
    out.push('schedule');
  } else {
    if (kept('run')) out.push('run');
    if (kept('bike')) out.push('bike');
  }
  // Swim sits last — booked, not coached. It is the slot we merely hold, so it follows the work.
  // ⛔ UNGATED FOR A RACE GOAL (2026-08-04). The condition was `strengthDevelop && swim === 'maintain'`,
  // so on a marathon block the athlete could opt the swim IN on the posture card and then never be
  // asked how many — `swim_days` went out unset and the engine guessed. The swim hold card is the
  // same mechanic whichever goal is leading; what gates it is whether the swim is KEPT, not which
  // discipline develops. Strength-path behaviour is unchanged (`maintain` is the only non-out state
  // that path seeds for swim).
  // ⛔ THE STANDALONE SWIM CARD IS OFF THE STRENGTH PATH (2026-08-17). Michael: the swim belongs on
  // the same card as the miles and the hours — it is a VOLUME question in its own unit, not a screen
  // of its own. It renders as the third row of `volume`.
  // ⚠️ THE RACE PATH KEEPS ITS CARD: that flow has no `volume` step to fold it into.
  const swimKept = state.posture?.swim != null && state.posture?.swim !== 'out';
  if (isRaceGoal && swimKept) out.push('swim');
  return out;
}

function getSteps(state: NonRaceState): StepKey[] {
  // ⛔ STRENGTH FOCUS SKIPS "What can you sustain?". That step converts a Light/Moderate/Committed
  // tier into `weekly_hours_available` — and on this path nothing reads it. The lifting is three days,
  // fixed by the protocol; the endurance volume is TYPED two screens later (run miles, run days,
  // swims). So the tier decides nothing and its only effect was a stale "≈ 6 h/wk" on the confirm
  // screen. Michael, 2026-07-25: *"not necessary, user enters these."* Every other goal keeps it —
  // there the tier really does set the volume.
  // ⚠️ On step 1 no goal has been chosen yet, so this returned the FULL six-step flow and the
  // progress bar read "1 of 6" — then jumped to "2 of 4" the moment the athlete tapped. With one
  // goal offered, the flow it produces is knowable before it is picked. Count that.
  // ⚠️ THE `GOAL_ORDER.length === 1` FALLBACK IS GONE (2026-08-05). It existed to make the progress
  // bar countable on step 1 before a goal was picked, and it was already wrong with two cards. The
  // entry and train screens now both `hideProgress` — there is no honest count until a discipline is
  // chosen, so there is nothing left to guess a goal for. See `seededPosture` (`:816`), which still
  // passes a REAL goal id and must keep doing so.
  const effective = state.goal;
  const isStrengthFocus = effective === 'get_stronger';
  const isRaceGoal = effective === 'marathon';
  // ⛔ AND NO LENGTH SLIDER on this path. Twelve weeks is not a preference — Wendler's ratios are
  // 2:1, 3:2 and 2:2 over four-week cycles, so 12 is the only length that runs leader-leader-anchor
  // as designed. The slider offered 8-52 while the composer rounds DOWN to whole cycles, so 10
  // silently became 8 and 14 became 12: the athlete picked a number the engine never built. 8 ships
  // later as the short, off-ratio option, labelled as such.
  // ⛔ AND NO LENGTH SLIDER ON A RACE EITHER, FOR A DIFFERENT REASON (2026-08-04). Strength Focus
  // skips it because 12 is the protocol; a race skips it because THE DATE ALREADY DECIDED. The
  // server computes `durationWeeks = max(floor, min(weeksOut, 20))` from the race date
  // (`create-goal…:3293`) and never reads `target_weeks` on the event path. Showing a slider that
  // moves a number the engine discards is the exact failure this file has produced twice before —
  // "Days Per Week: 5" and "Weekly Hours Available: 6" printed as constraints the athlete never set.
  // The confirm screen states the derived length instead.
  // ⛔ THE RACE FLOW IS DECLARED WHOLE, NOT ASSEMBLED (2026-08-04). Michael's five screens:
  // race+date, days (with the long-run day), level, intent, preview. It does NOT go through
  // `scheduleSteps` — that builds a per-discipline flow from posture, which is the strength path's
  // shape and produced three cards a race build does not want.
  //
  // ⛔ WHAT CAME OUT, AND WHY:
  //   • `commitment` (the hours tier) — CUT. Screen 3 now carries volume as miles and a long run,
  //     and `days` carries frequency. Asking hours after that is a THIRD estimate of the same
  //     quantity, and it is the one athletes are worst at. `weekly_hours_available` is derived
  //     from the miles instead (see `assemblePayload`).
  //   • `posture` (the hold cards) — MOVED, not cut. Bike/swim maintenance is a decision about
  //     disciplines outside the plan's primary, and it belongs after the athlete has seen the
  //     plan. It now lives on the confirm card, under the preview.
  //   • `length` — already skipped on a race; the date owns it.
  // ⛔ RACE SKIPS THE TRAIN PICKER. It is reached from the entry card directly — racing is an intent
  // that spans disciplines, not one of the four ongoing focuses (SPEC §B).
  // ⛔ STRENGTH IS ITS OWN CARD (2026-08-06). It sat at the bottom of "Your week" — three stacked
  // options with two-line descriptions, below the day count, the long-run day, the club night and
  // two conditional notices — and Michael's device pass found it missed entirely. §2.1 recorded the
  // accretion that put it there and kept the OUTCOME on his review; this moves the question, not the
  // decision. The week card gets the training-day picker in the same pass, so it is not re-loaded.
  // Capacity (level + weekly miles + days-a-week) comes BEFORE the week anchors and strength — Runna
  // and the hybrid apps ask availability up front, since everything downstream is placed inside it
  // (2026-08-07). Order: goal → race → level(capacity) → days(anchors) → strength → intent → confirm.
  if (isRaceGoal) return ['goal', 'race', 'level', 'intent', 'days', 'strength', 'confirm'];

  // The drill-down only exists on the Train branch, and it stays in the array after a discipline is
  // picked so Back walks entry ← train ← flow instead of jumping to the door.
  const door: StepKey[] = state.entry === 'train' ? ['goal', 'train'] : ['goal'];
  // The tier sits between the discipline and the block's own questions — it is WHICH strength block,
  // so it has to be answered before anything shaped by it. Only on the Train→Strength path; a goal
  // reached another way (standalone route, a stored goal) keeps the old flow.
  const head: StepKey[] = isStrengthFocus
    ? [...door, ...(state.entry === 'train' ? ['tier' as StepKey] : []), 'posture']
    : [...door, 'posture', 'commitment', 'length'];
  return [...head, ...scheduleSteps(state, isStrengthFocus, isRaceGoal), 'confirm'];
}

// The goal seeded the posture; the user may have edited it. Re-derive goal_type/sport/strength_protocol
// from the EDITED posture (derivePlanShape), not from seedFromGoal. Generic scheduling prefs kept.
// Default Week-1 start = the upcoming Monday (plans are Monday-based; the server snaps to the week anyway).
/**
 * ⛔ THE START OF THE PLAN WEEK — today when today IS Monday, otherwise the next one.
 *
 * Was `nextMondayISO()`, and it ALWAYS SKIPPED A WEEK when run on a Monday: `(8 - 1) % 7` is 0, and
 * `|| 7` turned that into a full seven days. So an athlete setting up on a Monday — the one day the
 * answer should obviously be "today" — was pushed to the following week, while the helper text below
 * the field said *"Week 1 begins this week."*
 *
 * ⚠️ Local date parts, never `toISOString()`. The old version built the string in UTC, so anyone
 * west of Greenwich got tomorrow's date after ~17:00 local — a second silent shift on top of the first.
 */
function planWeekStartISO(): string {
  const d = new Date();
  const day = d.getDay();                       // 0=Sun … 6=Sat
  const delta = day === 1 ? 0 : (8 - day) % 7;  // Monday → today; anything else → the next Monday
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * ⚠️ EVERY DISTANCE ARRIVES IN MILES. The athlete's display unit lives in the component; this
 * function is unit-blind on purpose, so a km figure can never reach the engine's mile tables.
 * `payloadNow()` does the conversion at the one call site.
 */
function assemblePayload(
  state: NonRaceState,
  equipmentTier?: string,
  targetWeeklyMiles?: number,
  canonLongRunMi?: number,
  easyPaceMinPerMile?: number,
  /** Race climb in METRES. Converted at the call site — this function is unit-blind. */
  canonElevationM?: number,
  /**
   * ⛔ DAYS THE ATHLETE CANNOT TRAIN — lowercase weekdays, the shape the rest of this payload speaks
   * (2026-08-25). ⚠️ It is NOT on `NonRaceState`: the chip row owns its own `useState`, so it
   * arrives as an argument rather than the payload reaching around the screen for it.
   */
  unavailableDays?: string[],
): ArcSetupPayload {
  const goal = state.goal!;
  const shape = derivePlanShape(state.posture, state.strengthProtocol, equipmentTier);
  /**
   * ⛔ THE RACE FORK, AND IT IS THE ONLY ONE IN THIS FUNCTION. A race date present means this goal
   * is an `event` row: `goal_type` flips, the date and distance stop being null, and `target_weeks`
   * is omitted because the server anchors the length on the date instead (`create-goal…:3293`).
   *
   * ⚠️ `goal_type` HERE IS THE **ROW** TYPE, and `training_prefs.goal_type` below is a DIFFERENT
   * FIELD with the same name — 'complete' | 'speed', which picks the generator's approach
   * (`create-goal…:3411`). They are not interchangeable and the server reads both.
   *
   * ⚠️ ONE GOAL, SO `combine` STAYS FALSE (`arc-setup-persistence.ts:465` = "two or more races").
   * A single marathon therefore builds on `generate-run-plan`, exactly as the existing race form
   * already does. This slice deliberately does not change that routing.
   */
  const isRace = !!state.raceDate;
  /**
   * ⛔ THE COUNTS, DERIVED FROM THE SLOTS ON THE STRENGTH PATH (2026-08-24). The program owns the
   * count (8-21 §3c), so "how many runs" is "how many of the four endurance slots are runs" — one
   * control, one answer. ⚠️ Computed HERE rather than passed in, because this function is the single
   * place the payload is assembled and a second derivation upstream is how two numbers drift.
   */
  const isStrengthFocusPath = state.goal === 'get_stronger';
  const derivedCounts = (() => {
      const slots = state.slotSports ?? emptySlotSports();
    const runs = SLOT_KEYS.filter((k) => slots[k] === 'run').length;
    const rides = SLOT_KEYS.filter((k) => slots[k] === 'ride').length;
    return { runs, rides, slots: slotsForEngine(slots) };
  })();
  return {
    summary: isRace
      ? `${GOAL_LABELS[goal]} — ${state.raceDate}`
      : `${state.targetWeeks}-week ${GOAL_LABELS[goal]} block`,
    goals: [
      {
        // ⛔ THE RACE'S OWN NAME WHEN THERE IS ONE. Every marathon goal used to be called
        // "Marathon" because this fell through to the card's label.
        name: isRace && state.raceName.trim() ? state.raceName.trim() : GOAL_LABELS[goal],
        goal_type: isRace ? 'event' : shape.goal_type,
        target_date: isRace ? state.raceDate : null,
        ...(isRace ? {} : { target_weeks: state.targetWeeks }),
        sport: shape.sport,
        distance: isRace ? state.raceDistance : null,
        /**
         * ⛔ THE TERRAIN CLAIM, AND IT IS STAMPED AS A CLAIM (2026-08-04).
         *
         * `goals.course_profile` already has a reader with an honesty rule built in:
         * `race-readiness-llm` refuses to mention race terrain at all unless this field is present,
         * and explicitly forbids using today's route as a stand-in for race day. Writing an
         * athlete-typed number here turns that rule on — so the number had better be labelled for
         * what it is.
         *
         * ⚠️ `source: 'athlete'` IS THE LOAD-BEARING PART. A measured profile from a GPX
         * (`course-upload` → `race_courses`) and a number somebody typed from memory are not the
         * same evidence, and anything reasoning over this must be able to tell them apart. Stored
         * in METRES — one unit in the database, the display unit stays on the screen.
         *
         * ⚠️ OMITTED ENTIRELY WHEN BLANK, never `{}` or a zero. An empty object would satisfy the
         * "is course_profile present" check and switch on terrain talk with nothing behind it —
         * the absence has to stay a real absence.
         */
        ...(isRace && typeof canonElevationM === 'number' && canonElevationM > 0
          ? { course_profile: { elevation_gain_m: Math.round(canonElevationM), source: 'athlete' } }
          : {}),
        // ⛔ THE TARGET FINISH, IN SECONDS, ON THE GOAL ROW. `goals.target_time` is already read by
        // `resolveGoalTargetTimeSeconds` → the coach, course-strategy, course-detail and the finish
        // projection. It has simply never been WRITTEN by any intake — another reader with no
        // producer. Only sent when a time was actually asked for and parsed.
        ...(isRace && state.raceIntent === 'speed' && parseTargetTime(state.targetTime)
          ? { target_time: parseTargetTime(state.targetTime) } : {}),
        priority: 'A',
        training_prefs: {
          // ⛔ THIS FIELD SHADOWED THE ATHLETE'S ANSWER, AND IT WAS HARDCODED (fixed 2026-08-05).
          //
          // Michael, 2026-08-05, on a 17-week "A time" build that came back with four easy runs and
          // nothing else: *"no speed work showing up."*
          //
          // ⛔ THE INTENT QUESTION WAS BEING ASKED AND THROWN AWAY. `create-goal…:2366` resolves the
          // build's approach like this:
          //     if (training_intent is set) return trainingIntentToPrefsGoalType(training_intent);
          //     return tPrefs.goal_type || 'complete';
          // `training_intent` is consulted FIRST and returns before `goal_type` is ever read. So a
          // constant `'completion'` here meant `goal_type: state.raceIntent` fifteen lines below —
          // the whole point of the intent card — could never reach the decision. Every race built
          // `sustainable`: no tempo, no intervals, at any distance, for any athlete, whatever they
          // picked. The one hard session `sustainable` offers is optional strides from week 3, which
          // is why week 1 was four easy runs and a long run.
          //
          // ⚠️ TWO FIELDS SAYING ONE THING IS THE HAZARD — they are kept in agreement here, derived
          // from the same answer, rather than one being trusted to shadow the other correctly.
          training_intent: isRace && state.raceIntent === 'speed' ? 'performance' : 'completion',
          // ⛔ LEVEL. It was hardcoded `'intermediate'` here for every goal, which is fine on the
          // non-race path (nothing downstream keys off it) and is NOT fine on a race, where it
          // picks the weekly-volume table, the long-run arc and the fallback paces. The race card
          // asks; every other goal keeps the old constant so their payloads are byte-identical.
          fitness: isRace && state.fitness ? state.fitness : 'intermediate',
          // ⛔ THE **OTHER** `goal_type` (see the note above): 'complete' → the `sustainable`,
          // effort-based generator; 'speed' → `performance_build`, built on real pace targets and
          // refused server-side without a pace benchmark (`create-goal…:3295`).
          //
          // ⚠️ IT SHIPPED HARDCODED TO 'complete' FOR ONE DAY, because asking the question without
          // an in-flow way to supply a pace would dead-end a no-numbers athlete at the Build
          // button. The race card now asks it AND carries the calibration, so the answer travels.
          // Falls back to 'complete' only if the field is somehow unset — the safe branch, the one
          // that builds with nothing on file.
          ...(isRace ? { goal_type: state.raceIntent || 'complete' } : {}),
          // ⛔ THE LONG RUN THE ATHLETE ACTUALLY HAS. `getProgressionOffset` uses it to enter the
          // long-run arc at the right point; without it the arc always opens at week 1 and a
          // sub-20-week plan never reaches the table's taper tail. Miles, canonicalised.
          ...(isRace && typeof canonLongRunMi === 'number' && canonLongRunMi > 0
            ? { recent_long_run_miles: Math.round(canonLongRunMi) } : {}),
          // ⛔ DERIVED, NOT ASKED (2026-08-04). The hours tier came out of the flow — it was a
          // third estimate of a quantity the athlete had already given twice, and the one they are
          // worst at guessing. Downstream still wants a number (`scaledWeeklyTSS`), so it is
          // computed from the miles at the easy pace this athlete actually has, plus a fifth for
          // warmups, strides and the fact that not every mile is easy.
          ...(isRace && typeof targetWeeklyMiles === 'number' && targetWeeklyMiles > 0
            ? { weekly_hours_available: Math.max(3, Math.round(
                (targetWeeklyMiles * (easyPaceMinPerMile ?? 10) * 1.2) / 60)) }
            : {}),
          // ⛔ WHAT THE ATHLETE IS ACTUALLY CHASING, PERSISTED (Q-230 Part B).
          //
          // The goal id was the FIRST thing this screen knew and the only thing it never saved.
          // `derivePlanShape` collapses it to `goal_type: 'capacity' | 'maintenance'` plus a posture,
          // and everything downstream read those — so chasing SPEED and chasing DISTANCE both arrived
          // as "run: develop" and were indistinguishable to every surface that tried to reason about
          // the block. The only surviving trace was `GOAL_LABELS[goal]` in the plan's NAME, which is
          // display text, not a fact.
          //
          // ⛔ IT LIVES ON THE GOAL, NOT ON THE PLAN. The goal owns what the athlete wants; the plan
          // is one attempt at it, and a block can be rebuilt or replaced without the want changing.
          // Copying it into `plans.config` would create a second owner that drifts on every rebuild
          // (Constitution Law 1). `_shared/block-identity.ts` reads it from here.
          //
          // ⚠️ EXISTING GOALS DO NOT HAVE IT and are not backfilled — their focus was never recorded,
          // so inventing one now would be a guess wearing a fact's clothes (Law 2). They read
          // `unknown`, and every surface stays silent about their goal rather than naming the wrong one.
          goal_focus: goal,
          // ⛔ NOT SENT ON THE STRENGTH PATH — because they are never ASKED on it.
          //
          // `getSteps` skips both the `days` and `commitment` screens for Strength Focus (the lifting
          // is three days fixed by the protocol; the endurance volume is typed per discipline). But
          // this payload sent them anyway, so they went out as INITIAL STATE: `daysPerWeek: 5` and
          // `commitment: 'light'` → 6 hours.
          //
          // The plan then printed "Days Per Week: 5" and "Weekly Hours Available: 6" as though the
          // athlete had chosen them, next to a week carrying seven days and ~10.4 hours. Two numbers
          // from nowhere, displayed as constraints, and read later as if they were answers.
          // Michael: *"we don't ask any more — 4 days of strength, the user must assume their miles
          // and hours will go somewhere."*
          //
          // ⚠️ The comment on the skipped step already noted the tier "decides nothing and its only
          // effect was a stale ≈6 h/wk on the confirm screen." That was half-fixed: the screen
          // stopped showing it and the payload kept sending it.
          // ⚠️ Safe to omit — the one downstream reader (`create-goal:2549`) is the RUN-plan branch
          // and already falls back to '4-5'.
          ...(goal === 'get_stronger' ? {} : {
            // ⛔ DERIVED ON THE RACE PATH (2026-08-06). "Days a week" and "which days can you train" were
            // the same answer asked twice; the row is the question now and the count falls out of it.
            // Blank stays legal — an athlete who pinned nothing keeps the seeded count and the engine
            // picks the days, which is what every block before today did.
            days_per_week: isRace && state.trainingDays.length >= 4 ? state.trainingDays.length : state.daysPerWeek,
            weekly_hours_available: hoursForTier(state.commitment),
          }),
          // ⛔ 'out' MEANS ZERO, AND IT DID NOT (2026-08-06). Michael, on a preview built after
          // picking None: *"its also prescribing strength when user says none."* This read
          // `develop ? 4 : 2`, so the two postures that are not develop — maintain AND out — both
          // sent 2. The race card's None writes `posture.strength = 'out'` and correctly omits the
          // protocol, and then `persistArcSetup` put one back: seeing a frequency of 2 on the
          // payload it writes `strength_protocol = mapStrengthFocusToProtocol('general')` into the
          // goal row (`arc-setup-persistence.ts:186-201`), which is the field
          // `create-goal…:3761` gates the whole strength overlay on. Two lifting days, from an
          // athlete who said none.
          // ⚠️ ZERO IS ALREADY THE LANGUAGE FOR THIS — the same writer maps `freq === 0` to
          // `strength_protocol: 'none'`. The path existed; nothing could reach it.
          strength_frequency: strengthFrequencyForPosture(state.posture?.strength),
          // ⛔ `lifting_days` IS NO LONGER SENT (§1f-0, 2026-08-16). It carried the athlete's
          // four-or-three answer, and there is no answer any more: every block is three days. The
          // server-side reader is slice 3's to remove; sending nothing is already correct, because
          // the composer no longer accepts the field at all.
          per_discipline_posture: state.posture,
          // ⛔ THE CLUB NIGHT GOES IN THE SLOT ITS INTENSITY NAMES. A social club run filed as
          // `quality_run` tells the engine to put the week's intervals on the one evening the
          // athlete is jogging and chatting. `runClubIntensity` decides which key it lands in;
          // `buildPreferredDays` omits both when no day is picked.
          preferred_days: buildPreferredDays(state.posture, {
            trainingDays: state.trainingDays,
            longRunDay: state.longRunDay, longRideDay: state.longRideDay,
            /**
             * ⛔ THE ONE LONG SLOT, SO THE BAG CANNOT WRITE A DAY FOR THE OTHER SPORT (2026-08-25).
             * `slotSports` is only ever set on the strength path, so passing it is self-gating:
             * every race and combined goal sends `undefined` here and gets the behaviour it always
             * had. See the note on `longSlotSport` in `buildPreferredDays` for what it was fixing —
             * a `'sunday'` long run defaulted onto a week whose only long session is a ride.
             */
            longSlotSport: state.slotSports?.long ?? undefined,
            // ⚠️ THE STRONG FOCUS HARD DAYS FEED THIS TOO (§1i) — one per sport, which is all this
            // sport-keyed bag can express. It is the pre-§1i pin and the combined-plan path reads it;
            // `hard_days` below carries the full answer. First slot of each discipline wins here.
            qualityDays: {
              ...(state.runClubIntensity === 'quality' ? state.qualityDays : {}),
              ...Object.fromEntries(
                (['run', 'bike'] as const)
                  .map((d) => [d, state.hardDays.find((h) => h.discipline === d && !!h.day)?.day])
                  .filter(([, day]) => !!day),
              ),
            },
            easyDays: state.runClubIntensity === 'easy' ? state.qualityDays : {},
            // ⚠️ RIDES ALONG WITH THE HARD-RUN PIN AND DIES WITH IT. `buildPreferredDays` writes it
            // only when `qualityDays.run` survives the gate above — so a club run the athlete
            // declared EASY carries no terrain, which is right: there is no hard run to give ground
            // to, and a terrain answer sitting beside an easy day would be a preference for a
            // session that does not exist.
            qualityRunTerrain: state.qualityRunTerrain,
          }),
          // ⛔ THE TWO HARD DAYS, IN THE §1i SHAPE (2026-08-17). `preferred_days.quality_run` /
          // `.quality_bike` above are keyed BY SPORT and can hold one of each at most — they stay,
          // because `generate-combined-plan` and the pre-§1i fallback in `create-goal` both read
          // them, and a Strong Focus goal with one hard day still writes the same pin it always did.
          // This is the list that can express two runs, two rides, and whose session each one is.
          // ⚠️ ONLY DAYS THAT ARE FILLED. A slot with a discipline and no day yet is an unanswered
          // question, not a pin, and forwarding it would book a session on no day.
          // ⛔ AN UNPLACED HARD DAY IS SENT, NOT FILTERED OUT (§1i placement model, slice 8). It used
          // to be dropped — `.filter((h) => !!h.day)` — which is why the screen had to make the
          // athlete assemble one. Absent `day` now means "engine, propose one", and the composer
          // places it in the same solve that places the bar.
          // ⚠️ A CLUB DAY WITHOUT A DAY IS STILL DROPPED: only the athlete knows when the club meets,
          // and the engine declines to invent an appointment (it drops it server-side too).
          /**
           * ⛔ THE LONG SESSION'S OWNERSHIP, ON ITS OWN KEY (slice 2b, 2026-08-25). It does NOT ride
           * in `hard_days`: that array's LENGTH is what the composer and the endurance tier read as
           * "how many hard sessions", and a long entry inside it would charge the block for one.
           * The handoff is explicit — club on the long card does not consume a hard slot.
           * ⚠️ THE DAY IS NOT REPEATED HERE. It is already `preferred_days.long_run` /
           * `.long_ride`; sending it twice is two answers to one question.
           * ⚠️ OMITTED WHEN FALSE, like every other key in this payload — absent means "the app
           * writes this session", which is what every block before this field did.
           */
          ...(state.longClub ? { long_session: { ownership: 'club' as const } } : {}),
          ...(state.hardDays.some((h) => h.ownership !== 'club' || !!h.day)
            ? {
                hard_days: state.hardDays
                  .filter((h) => h.ownership !== 'club' || !!h.day)
                  .map((h) => ({
                    ...(h.day ? { day: h.day } : {}),
                    discipline: h.discipline,
                    ownership: h.ownership,
                    /**
                     * ⛔ THE `qualityRunTerrain` FALLBACK IS DELETED, AND IT HAD TO GO WITH THE MENU
                     * (2026-08-18). It defaulted to `hill_3min`, so with the terrain menu removed
                     * EVERY hard run would have been stamped `hill_3min` — and a stamped terrain is
                     * indistinguishable from an athlete who chose one. That would have silently
                     * suppressed the session's own *"no hill outside? a treadmill at 5-8% is the
                     * same session"* line, which is the whole point of moving the question to the
                     * day. Absent must stay absent.
                     *
                     * ⚠️ AN OLD DRAFT'S STORED `terrain` IS STILL SENT AND STILL HONOURED — the
                     * composer's allowlist has not changed. Nothing NEW writes one.
                     */
                    ...(h.discipline === 'run' && h.terrain ? { terrain: h.terrain } : {}),
                    ...(h.discipline === 'run' && h.goal ? { goal: h.goal } : {}),
                    ...(h.discipline === 'bike' && h.environment ? { environment: h.environment } : {}),
                    /**
                     * ⛔ THE ALLOCATION TRAVELS, OR THE SCREEN AND THE ENGINE DISAGREE. The athlete
                     * picked which sport holds the top-end session; without this the composer falls
                     * back to list order and can hand them the opposite of what the card promised.
                     * ⚠️ CLUB SLOTS SEND NOTHING — `assignHardRoles` gives the club the sustained
                     * slot by its nature, and an allocation on it would be a value the engine
                     * ignores, sitting in the goal looking authoritative.
                     */
                    ...(h.ownership !== 'club' && h.role ? { role: h.role } : {}),
                  })),
              }
            : {}),
          /**
           * ⛔⛔ THE DAYS THE ATHLETE CANNOT TRAIN, ON THE WIRE (2026-08-25).
           *
           * It was CLIENT-ONLY until now: the chip row fed the preview's own solve and nothing
           * else, so the block that was actually built had never heard of it. The screen could show
           * a clean week and the engine would compose a lifting day and an endurance session onto
           * the day off — which is exactly what the device showed.
           *
           * ⚠️ IT IS A PIN, NOT A PREFERENCE, so it lives beside `hard_days` rather than inside
           * `preferred_days` — that bag is keyed by sport and holds days a session WANTS, and this
           * is a day no session may have. ⚠️ OMITTED WHEN EMPTY, like every other key here: absent
           * means "no days blocked", which is every block built before this field.
           */
          ...(unavailableDays?.length ? { unavailable_days: [...unavailableDays] } : {}),
          // §0g — the engine's strength-day default travels in the channel NAMED for engine choices,
          // never inside `preferred_days`. Absent for Strength Focus: the solver places those days
          // and `create-goal` writes the real ones back once the plan exists.
          ...(buildStrengthDefaultSlots(state.posture) ? { strength_optimizer_slots: buildStrengthDefaultSlots(state.posture)! } : {}),
          // ⛔ THE RACE PATH'S HEAVY OPTION OVERRIDES THE MAINTAIN DEFAULT — DELIBERATELY, AND ONLY
          // HERE. `derivePlanShape` honours an explicit protocol ONLY when strength is `develop`
          // (`strengthProtocolFor` hardcodes maintain → 'durability'), which is right everywhere
          // else: maintain means "hold it", and holding it is durability work.
          //
          // A marathon build is the exception the rule did not anticipate. Michael, 2026-08-05:
          // *"are we using a 5/3/1 for strength? should give more discretion."* Two sessions of
          // heavy low-volume lifting is not a develop block — `strength_frequency` stays 2, there is
          // no progression arc, running is still the goal — but it is not durability work either.
          // Rønnestad's running-economy protocol is what `neural_speed` implements, and it is the
          // field's answer for a runner who lifts. Widening `derivePlanShape` to honour a protocol at
          // maintain would change every other caller's behaviour to reach one card; this does not.
          //
          // ⚠️ THE EQUIPMENT GATE IS THE SERVER'S AND IT IS SILENT — `generate-run-plan` honours a
          // protocol only at `strength_tier === 'strength_power'`, which needs barbell capability, so
          // a bodyweight athlete choosing this would get durability back with nothing said (§0h). The
          // card states the requirement rather than letting the downgrade happen unannounced.
          ...(isRace && state.posture?.strength === 'maintain' && state.strengthProtocol === 'neural_speed'
            ? { strength_protocol: 'neural_speed', strength_intent: 'performance' }
            : (shape.strength_protocol ? { strength_protocol: shape.strength_protocol } : {})),
          ...(typeof targetWeeklyMiles === 'number' && targetWeeklyMiles > 0 ? { target_weekly_miles: targetWeeklyMiles } : {}), // Get Strong maintenance mileage (canonical miles); engine guardrails it to the band
          // ⚠️ `>= 1` (2026-08-19) — this sent `run_days` only at 2+, so a 1-run answer was
          // dropped on the floor and the engine fell back to its default of 2. The screen
          // offered an option the payload refused to carry.
          //
          // ⛔⛔ AND THE `strength === 'develop'` HALF IS GONE (stage 4 run half, 2026-08-22). It was
          // a ROUTING KEY BEING USED AS A DISCIPLINE GATE — flagged in the trace report §2.5a, which
          // could neither find a path to the bad state nor prove there wasn't one:
          //
          //   *"`run_days` ships only when `state.posture?.strength === 'develop'`, while
          //    `target_weekly_miles` beside it ships UNGATED. On Strong Focus strength is always
          //    `develop`, so it works — by coincidence, not by construction."*
          //
          // ⛔ THE FAILURE IT ALLOWS IS SILENT AND EXPENSIVE: the miles arrive and the count does
          // not, so the athlete's typed mileage is divided across the DEFAULT two runs instead of
          // the four they picked. Nothing anywhere reports it — the plan just looks plausible.
          //
          // ⚠️ THE COUNT IS ITS OWN GATE. `state.runDays` is only ever set by the strength path's
          // own cards, so `>= 1` already means "the athlete answered this question", which is the
          // thing worth gating on. Strength posture is not a fact about running.
          // ⚠️ THIS CAN ONLY ADD THE FIELD WHERE IT WAS BEING DROPPED — it never removes it, and
          // `create-goal` reads `run_days` on the Get Strong branch alone, so it is inert elsewhere.
          /**
           * ⛔⛔ ON THE STRENGTH PATH THIS COMES FROM THE SLOTS (2026-08-24), not from a picker.
           * The program owns the count, so "how many runs" is "how many of the four endurance slots
           * are runs" — and there is exactly one control that answers it. ⚠️ Every OTHER goal still
           * reads `state.runDays`; those flows keep their own cards and their own gate.
           */
          ...(isStrengthFocusPath
            ? { run_days: derivedCounts.runs }
            : (state.runDays >= 1 ? { run_days: state.runDays } : {})),
          /**
           * ⛔⛔ THE PER-SLOT ANSWER ITSELF, NOT JUST ITS TOTALS (2026-08-24). Counts alone do not
           * carry which slot is which, so the engine re-derived it from its own rule and an athlete
           * who chose "Hard 1 = Run, Long = Ride" got "Hard 1 = Ride, Long = Run" — the same mix, a
           * different week, nothing said. The wizard's own agreement test caught it.
           */
          ...(isStrengthFocusPath ? { endurance_slots: derivedCounts.slots } : {}),
          /** Easy-swim add-on (Michael, 2026-08-24): 1–2 easy/technique swims OUTSIDE the four
           *  slots. 0/absent = none. The composer appends them; they never take a session spot. */
          /** ⛔ THE VARIANT PICKS, keyed the engine's way (same keys as endurance_slots). Only the
           *  hard slots carry one; absent = the engine's rotation. */
          ...(() => {
            if (!isStrengthFocusPath) return {};
            // ⚠️ Indices inlined (hard1=0, hard2=3:0's entry=1) — the component-scope
            // HARD_SLOT_INDEX declares later in this body and a closure here must not TDZ on it.
            const slots: Array<{ i: number; key: string }> = [{ i: 0, key: '1:0' }, { i: 1, key: '3:0' }];
            const out: Record<string, string> = {};
            slots.forEach(({ i, key }) => {
              const a = state.hardDays[i]?.archetype;
              if (a) out[key] = a;
            });
            return Object.keys(out).length > 0 ? { endurance_slot_archetypes: out } : {};
          })(),
          ...(isStrengthFocusPath && (state.posture.swim ?? 'out') === 'maintain' && (state.swimEasySessions ?? 0) > 0
            ? { swim_easy_sessions: Math.min(2, state.swimEasySessions ?? 1) }
            : {}),
          // Strength Focus: the three assistance picks. The composer validates each name against the
          // shared menu, so a stale one falls back to the default rather than reaching a session.
          // ⛔ ALWAYS SENT NOW, and that is the migration working rather than a widened condition.
          // The old shape was `{}` until the athlete touched a dropdown, so "did they choose?" was
          // answerable by key count. The new shape is a COMPLETE twelve-slot week from the first
          // render (the balanced default), so an emptiness test would never fire — and the composer
          // needs the week either way, since `normalizeAssistancePrefs` produces the same default
          // from nothing. Sending it makes the goal a record of what was actually built.
          ...(state.posture?.strength === 'develop' ? { assistance_picks: state.assistancePicks } : {}),
          /**
           * ⛔ THE TEST-WEEK SKIP (Standing Plan, slice 3). Forwarded ONLY when the athlete took the
           * offer, and the offer only appears when the preview said the evidence is there.
           *
           * ⚠️ THE ANSWER, NOT THE PERMISSION. `generate-strength-plan` re-reads the logged sets
           * server-side and builds the test week anyway when they are not there — a stale client
           * answer cannot skip a test.
           */
          ...(state.skipTestWeek === true ? { skip_test_week: true } : {}),
          ...(state.posture?.swim === 'maintain' && state.swimDays > 0 ? { swim_days: state.swimDays } : {}),
          // ⚠️ STORED, NOT YET READ. The engine books off `swim_days`; this is the athlete's own
          // number so the swim can stop being a guess without asking them again later.
          ...(state.posture?.swim === 'maintain' && Number(state.swimVolume) > 0
            ? { swim_volume: Number(state.swimVolume) } : {}),
          // Bike volume in HOURS (D-323 §6). Stored as typed; the engine turns hours into sessions —
          // it cannot turn miles into anything, having never learned a ride speed.
          ...(state.posture?.bike === 'maintain' && Number(state.rideHours) > 0
            ? { target_weekly_ride_hours: Number(state.rideHours) } : {}),
          // How many days those hours spread across (1/2/3). Without it the engine guessed.
          // ⛔ SAME SOURCE AS THE RUNS on the strength path — see `run_days` above. A ride count and
          // a run count derived from two different controls is what let the two old screens disagree.
          ...(isStrengthFocusPath
            ? (derivedCounts.rides > 0 ? { ride_days: derivedCounts.rides } : {})
            : (state.posture?.bike === 'maintain' && state.rideDays > 0
              ? { ride_days: state.rideDays } : {})),
        },
      },
    ],
    // The TOP-LEVEL copy, and it is the one that actually did the damage — `persistArcSetup` reads
    // this as the `parent` frequency and writes a protocol into the goal row from it. Same rule.
    strength_frequency: strengthFrequencyForPosture(state.posture?.strength),
    ...(state.startDate ? { plan_start_date: state.startDate } : {}), // Week 1 start → create-goal → the plan's calendar
  };
}

/**
 * ⛔ HOW MANY LIFTING DAYS A POSTURE MEANS. One rule, two call sites in the payload — they used to
 * be two copies of the same ternary and both were missing the `out` case.
 *
 * develop → 4 (the Get Stronger U/L/U/L arc), maintain → 2, out or unset → **0**.
 *
 * ⚠️ 0 IS LOAD-BEARING, NOT COSMETIC. `arc-setup-persistence` maps a frequency of 0 to
 * `strength_protocol: 'none'`, and a non-zero one to a REAL protocol regardless of what the athlete
 * chose — so sending 2 for `out` is what put lifting into a plan that asked for none.
 */
function strengthFrequencyForPosture(p: Posture | undefined): 0 | 2 | 4 {
  if (p === 'develop') return 4;
  if (p === 'maintain') return 2;
  return 0;
}

/** Just what the confirm-screen preview renders — the plan carries far more. */
type PreviewSession = {
  day: string;
  name: string;
  duration?: number;
  /** ⛔ CARRIED NOW. Without it the grid cannot tell a lift from a run. The composer has always
   *  emitted it; this type simply dropped it on the way in. */
  type?: string;
  /** The session's rows — the grid shows the accessory names so the swaps are visible at intake. */
  strength_exercises?: Array<{ name: string }>;
};
type PreviewPlan = {
  sessions_by_week?: Record<string, PreviewSession[]>;
  /** `place-week`'s own words for every clearance the week could not honour. */
  /** ⛔ TAGGED: `breach` = a rule was broken; `cost` = the shape the athlete chose cost something.
   *  One channel, two meanings — the reader must not have to infer which. */
  placement_compromises?: Array<{ kind: 'breach' | 'cost'; text: string }>;
};

/**
 * ⛔ `entry` = THE FRONT DOOR LIVES ON THE GOALS SCREEN, NOT IN HERE (2026-08-05, SPEC §B).
 *
 * The three cards are what Goals OPENS TO — Michael tapped through the first build and found them
 * one level down, behind "Add a goal": *"nothing there."* So `GoalsScreen` renders the door and
 * deep-links into this builder with the card that was tapped, and the builder starts on the screen
 * AFTER the entry (the Train drill-down, or the race flow).
 *
 * ⚠️ The builder's own `goal` step is KEPT, not dead: the standalone route mounts this component
 * with no props, and Back from step 1 needs somewhere to land that isn't a closed builder. Passing
 * no `entry` gives you the full flow, door included.
 */
export default function NonRaceBuilder({ onClose, entry: initialEntry, onPlanSeason }: { onClose?: () => void; entry?: EntryCardId; onPlanSeason?: () => void } = {}) {
  const navigate = useNavigate();
  // ⛔ `error` WAS NOT READ, AND THE BUILD BUTTON FAILED SILENTLY (2026-08-04).
  //
  // The hook has always returned it and `ArcSetupWizard.tsx:2791` has always rendered it; this
  // builder destructured four of the eight fields and left it behind. So when `complete()` was
  // refused server-side, the spinner stopped and **nothing appeared** — the athlete tapped "Build
  // plan" and the screen sat there. Pre-existing, and it swallowed every build error, not just the
  // new one.
  //
  // ⚠️ IT BECOMES LOAD-BEARING WITH THE TIMELINE WALL. A refusal the athlete cannot see is worse
  // than no refusal: without the message they cannot tell "too close" from "broken", and the only
  // action left is to tap it again.
  const { complete, preview, saving, previewError, previewAdvisories, error: buildError } = useArcSetupComplete();
  // ⛔ THE WEEK, BEFORE IT IS ACCEPTED. Nothing here writes: `preview()` calls the composer with the
  // goal inline and persists neither a goal nor a plan.
  const [previewWeek, setPreviewWeek] = React.useState<PreviewSession[] | null>(null);
  /** ⛔ Distinguishes "the preview could not be built" from "the week is empty". They are not the same. */
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const [previewNotes, setPreviewNotes] = React.useState<string[]>([]);
  /** ⛔ Standing Plan only: whether this block COULD open without a test week, and why not. */
  const [previewSkip, setPreviewSkip] = React.useState<
    { available: boolean; summary: string; window_days: number } | null
  >(null);
  const [previewing, setPreviewing] = React.useState(false);
  const { arc } = useArcSetupContext();

  // Don't gate: every athlete is OFFERED all four disciplines (matches the ungated matrix). The seed
  // defaults sensibly per goal; the athlete flips develop/maintain/out. Previously this read the stale
  // declared `disciplines` array, which dropped sports that have real baselines but aren't listed
  // (e.g. claudemore has run pace but 'running' isn't in disciplines) → the seed forced run 'out' →
  // the goal went bike-shaped → unsupported. A developed discipline without baselines is handled
  // downstream (calibration prompt), not by hiding it.
  const athleteDisciplines = useMemo<Discipline[]>(() => DISCIPLINE_ORDER, []);
  const equipmentTier = useMemo(() => equipmentTierFromArc(arc), [arc]);
  const unit = (arc as { units?: string } | null)?.units === 'metric' ? 'km' : 'mi'; // display unit for typed mileage; store canonical miles
  // Inline maintenance cap (shown live as the athlete types) = 180 min/wk ÷ their easy pace [Wilson 2012, D-222].
  const easySecPerKm = Number((arc as { easy?: { sec_per_km?: number } } | null)?.easy?.sec_per_km);
  const paceMinPerMile = easySecPerKm > 0 ? (easySecPerKm * 1.609344) / 60 : 10; // fallback ~10:00/mi until pace is learned
  const capMiles = Math.round(180 / paceMinPerMile);
  const capDisplay = unit === 'km' ? Math.round(capMiles * 1.609344) : capMiles; // ceiling in the athlete's unit

  // ⛔ THE CARD KEEPS ONE LINE; THE RECEIPT LIVES BEHIND A TAP. Default closed — the week above is
  // what the athlete came to see, and an expanded science block would push it off the fold, which is
  // the trade this card has lost twice already.
  const [showHardDayWhy, setShowHardDayWhy] = useState(false);
  // ⛔ ONE DAY OPEN AT A TIME — the `StrengthLogger.tsx` accordion pattern (`expandedExercises`).
  // Nine dropdowns open at once is three phone screens of scrolling and the week loses its shape.
  // ⚠️ SEEDED FROM THE DAY LIST, NOT A LITERAL. This was `'press'`, which is no longer a day at all
  // (slice 5) — leaving it would have opened the screen with every card collapsed and no way to tell
  // that was a bug rather than the design.
  const [expandedAssistanceDay, setExpandedAssistanceDay] = useState<LiftDay | null>(LIFT_DAYS[0]);
  /**
   * The athlete's declared kit, for the picker's equipment GATE (slice 4). ⛔ ARC IS THE SOURCE — the
   * same `equipment.strength` chips `equipmentTierFromArc` reads two hundred lines up. An empty list
   * means "we do not know", and `canPerform` treats that as ungated rather than as "owns nothing";
   * anything else would hand a new athlete three days of push-ups.
   */
  const strengthEquipment = useMemo<string[]>(
    () => ((((arc as { equipment?: { strength?: unknown } } | null)?.equipment?.strength) as string[] | undefined) ?? []),
    [arc],
  );
  /**
   * The athlete's tested pull-up capacity, for the progression's dose copy. ⛔ 0 IS A REAL VALUE
   * ("goal: your first pull-up", Q-102) and must not be coerced to absent — 0 is precisely what
   * triggers the band on-ramp. ⚠️ `null` means UNTESTED and takes the same conservative
   * on-ramp dose as of 2026-08-19 — it used to take the full 100/week, which handed the
   * maximal prescription out on no evidence. See `weeklyVolumeFor`.
   */
  const pullupMaxReps = useMemo<number | null>(() => {
    const raw = (arc as { performance_numbers?: { pullupMaxReps?: unknown } } | null)?.performance_numbers?.pullupMaxReps;
    /**
     * ⛔ `Number(null)` IS 0 AND `Number('')` IS 0, SO THIS TURNED "NO ANSWER" INTO "TESTED ZERO"
     * (found 2026-08-19). A stored null or blank came back as 0 — an ANSWER — which both mislabels
     * the dose as the `on_ramp` ("no clean rep on file", a claim the athlete never made) and hides
     * the test prompt, since the prompt only asks athletes who have not answered.
     * ⚠️ THE NULL CHECK HAS TO COME FIRST. This is Q-102's trap, and it is the third field in this
     * codebase to be bitten by it — `resolveEnduranceTier` and `weeklyVolumeFor` both carry the
     * same warning. ⛔ A tested 0 still returns 0: zero is a real answer and must not be re-asked.
     */
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [arc]);
  /**
   * ⛔ NO NUMBER, NO OFFER (§7, Michael 2026-08-16) — THE SCREEN HALF OF THE GATE.
   *
   * The engine refuses a hard day it cannot price and says so; this stops the athlete being asked
   * for one in the first place. Both halves exist on purpose: the screen is the humane end (never
   * offer what cannot be built) and the engine is the honest one (the wire cannot smuggle one past).
   *
   * ⛔ FED FROM THE RESOLVERS, NOT RE-DERIVED. `resolveCurrent5kPace` and `resolveCurrentFtp` are
   * the single source of truth for their fact and already run client-side elsewhere
   * (`TrainingBaselines.tsx` uses the FTP one). This asks them the same question the server will.
   *
   * ⚠️ THE RUN TESTS THE 5K, NOT A THRESHOLD PACE — there is no independent threshold pace on the
   * athlete; the app derives it as 5K + 20 s/mi. Gating on the derived number would refuse athletes
   * who have everything the session needs.
   * ⚠️ AND THE REASON IS NOT A MISSING FIELD, IT IS A MISSING PROGRESSION. A session that cannot
   * state a pace or a wattage cannot get faster on purpose — that is what the copy says, rather
   * than naming a database column at someone.
   */
  const hardDayAvailable = useMemo<{ run: boolean; bike: boolean }>(() => {
    const baselines = (arc ?? {}) as never;
    return {
      run: resolveCurrent5kPace(baselines).sec_per_mi != null,
      bike: resolveCurrentFtp(baselines).value != null,
    };
  }, [arc]);
  // The same (i) mechanic on "How much" — the volume rationale that used to sit between the two
  // inputs and push the second one off the screen.
  const [showVolumeWhy, setShowVolumeWhy] = useState(false);
  // ⛔ WHICH DAY QUESTION THE SCHEDULER'S ONE DAY ROW IS ANSWERING. Three anchors, one row — the
  // race path's pattern, brought to the card that had three `<select>`s and no week on screen.
  /** Which of the week's three questions the day row is currently answering. Card-local. */
  const [weekQuestion, setWeekQuestion] = useState<'run' | 'long' | 'club'>('long');
  // The standing session can be a run club or a ride club — this picks which, and the day pins to
  // qualityDays.run (gold) or qualityDays.bike (green). Kept single: switching sport drops the other.
  const [clubSport, setClubSport] = useState<'run' | 'bike'>('run');
  /** Which hard-day slot the shared day row is currently filling (§1i). Card-local, like `clubSport`. */
  /**
   * ⛔⛔ `activeHardSlot` IS DELETED (2026-08-18). ⛔ DO NOT REINTRODUCE IT IN ANY FORM.
   *
   * It held "which hard session are the shared controls editing", and NOTHING ON SCREEN SAID WHICH.
   * A chip row set it; the club checkbox, the session sub-question and the Schedule step's day
   * picker all read it. So one visible control edited two different pieces of data depending on an
   * invisible background toggle — an athlete with two hard sessions picked BOTH days through ONE
   * row, and a tap landed on whichever slot a chip two screens earlier had left selected.
   *
   * Michael: *"a classic state entanglement trap… that is exactly how users accidentally delete
   * their own inputs without realising it."*
   *
   * ⛔ THE REPLACEMENT IS CONTAINMENT: every hard session renders its own card on the intensity step
   * and its own labelled day row on the Schedule step, and each writes its own index `i` from the
   * loop it is in. There is no shared cursor, so there is nothing to desync. If you find yourself
   * wanting "the current slot", you are about to rebuild this bug.
   */
  const [state, setState] = useState<NonRaceState>({
    // Deep-linked from the Goals door. ⚠️ `goal` IS SEEDED HERE FOR RACE, DELIBERATELY: `getSteps`
    // branches on it, so leaving it null for one render would flash the posture screen before the
    // effect below swaps in the race flow. The POSTURE still comes from `reseed` a tick later —
    // `equipmentTier` reads the arc, which may not have loaded on the first render, and the race
    // screen reads no posture.
    entry: initialEntry ?? null,
    strengthTier: null,
    goal: initialEntry === 'race' ? 'marathon' : null,
    discipline: undefined, posture: {}, strengthProtocol: undefined, commitment: 'light', targetWeeks: 12,
    // ⛔ NO PREFILLED DAYS (2026-07-29). These seeded 'sunday' / 'thursday' so the week drew on
    // arrival instead of an empty box. Michael: *"no prefill let them chose."* A long run is
    // conditional — an athlete may not have one — and a seeded day answers that question for them
    // and then shows them a week built on an answer they never gave. Thursday was never even a
    // convention; it came out of a sweep. Empty is the honest state, and the card already has copy
    // for it ("Pick your days and the week appears here").
    // ⛔ AND THE COUNTS ARE UNSET TOO (2026-07-29, second pass). Michael, on the screenshot after the
    // day fields went empty: *"still preselcted"* — Runs sat on 3 and Rides on 2, highlighted, which
    // is the same defect one control to the left. A pill that arrives lit is an answer, not a
    // question, and an athlete who agrees with it has told the engine nothing.
    //
    // ⚠️ 0 IS ALREADY THE LEGAL UNSET HERE, which is why this needs no type change: the payload
    // builder at :359 sends `run_days` only when `runDays >= 2`, and :370 sends `ride_days` only
    // when `rideDays > 0`. Never picking one omits the field and the engine keeps its own default,
    // rather than being handed a number the athlete never chose.
    // ⛔ THE `liftingDays: 4` SEED IS GONE WITH THE CARD THAT READ IT (§1f-0, 2026-08-16). It was a
    // deliberate exception to the no-prefill rule — the block's default shape, preselected — and
    // there is no shape question left to answer: every block is three days.
    // ⚠️ `hill_3min` IS THE SEED AND IT IS NOT AN ARBITRARY ONE — it is the session this block has
    // built since it shipped, and the doctrine's default (§2.0: hill is the recommendation, and the
    // default position carries that rather than the word "recommended"). An athlete who never looks
    // at the menu gets exactly the week they got yesterday.
    daysPerWeek: 5,
    // ⛔ THE WEEK ARRIVES LAID OUT (2026-08-06). It opened empty — seven blank chips the athlete had
    // to fill before anything happened — and a blank week reads as a broken screen, not as a
    // question. Michael: *"your week is still blank."*
    //
    // ⚠️ THIS OVERRIDES THE 2026-07-29 NO-PREFILL RULE, DELIBERATELY, AND ONLY HERE. That rule was
    // written against controls that arrive ANSWERED and hide the question (a lit "3 runs" pill the
    // athlete never chose). This is the opposite case: the answer is visible, every chip is one tap
    // to change, and the alternative is a form. Five days with the long run on Sunday is what the
    // plan builds anyway when nothing is pinned — so the screen now SHOWS the default instead of
    // applying it silently, which is the honest half of that rule rather than the letter of it.
    trainingDays: [], longRunDay: '', longRideDay: '', longClub: false, longClubMinutes: '', qualityDays: {}, hardDays: [], qualityRunTerrain: 'hill_3min', usualMiles: '', targetMiles: '', targetTouched: false, runDays: 0, assistancePicks: normalizeAssistancePrefs(null), swimDays: 2, swimVolume: '', rideHours: '', rideDays: 0, startDate: planWeekStartISO(), skipTestWeek: false, slotSports: undefined,
    // ⚠️ `fitness` starts BLANK and the race step gates Continue on it. A default here would be the
    // silent `intermediate` all over again, one screen further in.
    raceDate: '', raceDistance: RACE_DISTANCES[0], raceName: '', raceElevation: '', fitness: '',
    raceIntent: '', calEasy: '', calFiveK: '', runClubIntensity: 'quality',
    longRunMiles: '', targetTime: '', fixedDays: [],
  });
  // Step 0 is the door. When Goals already asked (deep link), start on the screen AFTER it — the
  // Train drill-down, or the race card. Back from there still closes the builder, which returns the
  // athlete to the Goals screen the door now lives on.
  const [stepIdx, setStepIdx] = useState(initialEntry ? 1 : 0);

  // ⚠️ The schedule screens are built from the POSTURE, which is only seeded when the goal is tapped
  // — so on step 1 the flow would count itself with no disciplines kept ("1 of 3") and then jump.
  // With one goal offered, the posture it seeds is knowable in advance. Count off that.
  // ⛔ THIS USED TO BE GATED ON `GOAL_ORDER.length === 1` AND THAT BROKE THE MOMENT A SECOND CARD
  // WAS ADDED (2026-08-04). With two goals the memo returned `{}`, so on step 1 `getSteps` saw no
  // disciplines kept, counted a short flow, and the progress bar jumped the instant a card was
  // tapped — the exact bug the original comment above was written to fix, reintroduced by the fix's
  // own precondition. Every card's seed is knowable before it is picked; when they disagree on step
  // count there is nothing honest to show, so fall back to the FIRST card's seed only while the
  // counts agree, and otherwise show the flow the athlete is actually in once they have chosen.
  const seededPosture = useMemo(
    () => seedFromGoal(GOAL_ORDER[0], undefined, athleteDisciplines, equipmentTier).per_discipline_posture,
    [athleteDisciplines, equipmentTier],
  );
  const steps = getSteps(state.goal ? state : { ...state, posture: seededPosture });
  const currentStep = steps[stepIdx] ?? 'confirm';
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  // ⚠️ Step numbers were HARDCODED (step={5} on the schedule screen) while `steps` is now shorter on
  // the Strength Focus path — so the bar read "5 of 4". Derive the position from the flow that is
  // actually running; a screen cannot know its own number in a flow that varies.
  const stepNo = (k: StepKey) => steps.indexOf(k) + 1;
  // Embedded in GoalsScreen → step-0 back closes the builder view (onClose); standalone route falls
  // back to history navigation.
  const back = () => {
    if (stepIdx === 0) { if (onClose) onClose(); else navigate(-1); }
    else setStepIdx((i) => i - 1);
  };

  // Picking a goal (or its discipline sub-choice) re-seeds the posture + the default strength protocol.
  const reseed = (goal: NonRaceGoalId, discipline: Discipline | undefined) => {
    const seed = seedFromGoal(goal, discipline, athleteDisciplines, equipmentTier);
    const floor = floorForGoal(goal);
    setState((s) => ({
      ...s, goal, discipline,
      posture: seed.per_discipline_posture,
      strengthProtocol: seed.strength_protocol,
      // Strength Focus is FIXED at 12 — the only length that runs Wendler's 2:1 leader/leader/anchor
      // over four-week cycles. There is no slider on that path, so this is the value, not a default.
      targetWeeks: goal === 'get_stronger' ? STRENGTH_FOCUS_WEEKS : Math.max(s.targetWeeks, floor),
    }));
  };
  // Deep-linked into the race flow: the goal was seeded in the initial state so the right screen
  // renders immediately; this fills in the posture / protocol / length the tap handler would have.
  // Once, on mount — `reseed` overwrites posture, so re-running it would wipe the athlete's edits.
  React.useEffect(() => {
    if (initialEntry === 'race') reseed('marathon', undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modal-lock: hide the app tab bar while the builder is open (see index.css `body.wizard-active`).
  React.useEffect(() => {
    document.body.classList.add('wizard-active');
    return () => document.body.classList.remove('wizard-active');
  }, []);

  const setPosture = (d: Discipline, p: Posture) => {
    setState((s) => {
      const posture = { ...s.posture, [d]: p };
      let strengthProtocol = s.strengthProtocol;
      if (d === 'strength' && p === 'develop' && !strengthProtocol) {
        strengthProtocol = defaultStrengthDeveloper(sportFromPosture(posture), equipmentTier);
      }
      return { ...s, posture, strengthProtocol };
    });
  };

  const needsDiscipline = state.goal != null && GOALS_NEEDING_DISCIPLINE.includes(state.goal);
  // ⚠️ `enduranceChoices` DELETED 2026-08-05 — it fed the "Which discipline?" sub-picker on the old
  // goal screen, and the front door's Train card names the discipline instead (SPEC §B). The rule it
  // carried is unchanged and still holds on the posture screen: don't gate disciplines, everyone is
  // offered all of them, and missing baselines are handled downstream, not by hiding the option.
  const goalCanContinue = state.goal != null && (!needsDiscipline || state.discipline != null);
  const postureCanContinue = Object.values(state.posture).some((p) => p !== 'out');
  const rows = DISCIPLINE_ORDER; // ungated — always show all four disciplines (don't gate)
  // The Strength Focus path. Strength is `develop` by definition here, so the screen never asks —
  // but the VALUE still has to be written, because `create-goal-and-materialize-plan` routes on
  // `posture.strength === 'develop'`. An assumed answer that never reaches the payload is the same
  // as no answer.
  const isStrengthFocus = state.goal === 'get_stronger';
  // ── THE STANDING PLAN'S ACCESSORY ANSWERS ────────────────────────────────────────────────────
  //
  // ⛔ SEEDED PRE-FILLED, AND THAT IS THE POINT OF THE SCREEN (Michael, 2026-08-24): the picks open
  // on the grid's own defaults and a zero-touch Continue builds a complete week. An empty shape here
  // would make "did they answer?" the composer's problem again, which is the A1 defect's shape.
  //
  // ⚠️ THE EFFECT ONLY EVER SEEDS. It never re-runs over an athlete's own answers — equipment can
  // change under it (they edit the Arc mid-wizard) and re-deriving would silently discard the picks.
  // A pick the kit no longer reaches is caught by `normalizeViadaPrefs` at the wire, per slot.
  const viadaPrefs = state.assistancePicks.viada ?? null;
  useEffect(() => {
    if (!isStrengthFocus || viadaPrefs) return;
    setState((st) => (st.assistancePicks.viada ? st : {
      ...st,
      assistancePicks: {
        ...st.assistancePicks,
        viada: {
          version: 1,
          picks: defaultViadaPicks(strengthEquipment, []),
          dial: [],
          dial_rows: {},
        } as ViadaAccessoryPrefs,
      },
    }));
  }, [isStrengthFocus, viadaPrefs, strengthEquipment]);
  /**
   * ⛔ THE EXTRA-ROW PICKERS — ONE PER CHIP THAT REACHES NO FRAME SLOT (Glutes, Core).
   *
   * For those two the extra rows are not a bonus, they ARE the mechanism: no cell in `strength_5k`
   * offers a glute- or core-prime movement, which is exactly why the old focus chips for them could
   * never fire. Chest, Shoulders and Arms need no picker — their re-pointing is visible in the
   * picks below.
   *
   * ⚠️ NO DAY TAG, AND THAT IS A DECISION — see `DIAL_ROW_DAY_IS_THE_COMPOSERS`. Two
   * projections of the day were built and both were wrong the moment two chips competed for the
   * same room; reproducing the composer's placement means running the composer, which this file
   * already rules out for the hard-day roles one screen over.
   *
   * ⚠️ ONE PICKER, NOT ONE PER ROW. How MANY rows a chip buys is the composer's answer too — it
   * depends on what the muscle already gets — so the athlete names the movement and the engine uses
   * it for the first row it places (`fillMuscleFloor`'s `prefer`), exactly as the core pick works.
   */
  /**
   * ⛔ AND `core` IS EXCLUDED, THOUGH IT REACHES NO FRAME SLOT EITHER (Michael, 2026-08-24, from a
   * device screenshot). It already has a control on this very screen — the "Core movement" pick —
   * and a second core dropdown produced exactly what you would expect: the pick said one movement,
   * the Dial row defaulted to another, and the built week carried BOTH. **A third core movement the
   * athlete never asked for.**
   *
   * ⛔ SO THE CORE CHIP EXTENDS THE CORE PICK instead of naming its own movement. The pick already
   * travels to `fillMuscleFloor`'s `prefer` through `flattenViadaPicks`, so the added rows open on
   * it by construction; where the target needs a second row, `alreadyPrescribed` blocks a repeat and
   * the next rep-based movement in the pool becomes the complement. One control, one muscle.
   */
  const dialRowChips = useMemo(
    () => (viadaPrefs?.dial ?? []).filter((c) => !chipHasFrameSlot(c) && c !== 'core'),
    [viadaPrefs],
  );

  /**
   * ⛔ THE THREE WRITERS FOR THE STANDING PLAN'S BLOCK. Every one of them writes the WHOLE block,
   * because a partially-updated `viada` is a shape the wire has to guess about.
   */
  const patchViada = (patch: Partial<ViadaAccessoryPrefs>) => setState((st) => {
    const cur = st.assistancePicks.viada ?? {
      version: 1 as const,
      picks: defaultViadaPicks(strengthEquipment, []),
      dial: [] as DialChip[],
      dial_rows: {},
    };
    return { ...st, assistancePicks: { ...st.assistancePicks, viada: { ...cur, ...patch } } };
  });
  /**
   * ⛔ CHANGING THE CHIPS REBUILDS EVERY PICK, and it is the same ruling the Get Stronger screen
   * already carries: the alternative needs a per-slot "did they choose this" flag, and a
   * half-applied dial is worse than an honest one — the athlete taps Chest and reads picks that
   * are mostly not chest.
   * ⚠️ AND ROWS FOR A DROPPED CHIP ARE DROPPED WITH IT. A stored `glutes:1` under no glutes chip is
   * a movement nothing will ever place.
   */
  const setViadaDial = (next: DialChip[]) => {
    const rows = Object.fromEntries(
      Object.entries(viadaPrefs?.dial_rows ?? {})
        .filter(([k]) => next.some((c) => k.startsWith(`${c}:`))),
    );
    patchViada({
      dial: next,
      picks: defaultViadaPicks(strengthEquipment, next),
      dial_rows: rows,
    });
  };
  const setViadaPick = (key: ViadaPickKey, name: string) => patchViada({
    picks: { ...(viadaPrefs?.picks ?? defaultViadaPicks(strengthEquipment, viadaPrefs?.dial ?? [])), [key]: name },
  });
  const setViadaRow = (key: string, name: string) => patchViada({
    dial_rows: { ...(viadaPrefs?.dial_rows ?? {}), [key]: name },
  });
  const isRaceGoal = state.goal === 'marathon';
  /** The discipline the race develops. Everything else is held or parked (Michael, 2026-08-04). */
  const raceDiscipline: Discipline = RACE_DISCIPLINE[state.raceDistance] ?? 'run';
  const raceWeeks = state.raceDate ? weeksUntilRaceApprox(state.raceDate) : null;
  /**
   * ⛔ HOW LONG THE BLOCK WILL ACTUALLY BE — the week race day falls in, counted from the plan's own
   * first Monday, NOT from today.
   *
   * `raceWeeks` is weeks-from-now, which is the right question for "can this be planned at all" and
   * the wrong one for "how many weeks is it". They differ whenever the plan opens on a later Monday:
   * a Sunday race 66 days out is 10 weeks away and plan week 9. The server trims the block to the
   * race week for exactly this reason (`planWeekContaining`, `_shared/planning-context.ts`), so a
   * screen quoting `raceWeeks` describes a plan one week longer than the one it builds.
   *
   * ⚠️ THE GATE STILL READS `raceWeeks`. This is display and arithmetic only — race-week support
   * mode depends on a race that is days away, and re-pointing the gate would change who gets in.
   */
  const planWeeks = (() => {
    if (!state.raceDate || !state.startDate) return raceWeeks;
    const start = new Date(`${state.startDate}T00:00:00`).getTime();
    const race = new Date(`${state.raceDate}T00:00:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(race) || race < start) return raceWeeks;
    const week = Math.floor((race - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return raceWeeks != null ? Math.min(raceWeeks, week) : week;
  })();
  // The race card cannot continue on a date alone: level picks the volume table the whole plan is
  // built from, and a blank one would fall to the silent `intermediate` this card exists to replace.
  /**
   * ⛔ DO WE ALREADY HAVE A PACE TO BUILD ON? Read once, with the SAME predicate the server uses
   * (`hasPaceBenchmark`). `null` = not looked up yet, so the card stays quiet rather than asking
   * for a calibration the athlete may not need.
   *
   * ⚠️ A SEPARATE READ FROM THE ARC, DELIBERATELY. The Arc gives this builder an easy pace and
   * nothing else about running; the server's gate accepts four different signals. Judging on the
   * one field the Arc happens to expose would ask experienced athletes to re-enter numbers they
   * already have on file.
   */
  const [paceRow, setPaceRow] = React.useState<PaceBenchmarkRow | null>(null);
  const [paceChecked, setPaceChecked] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const uid = getStoredUserId();
      if (!uid) { if (!cancelled) setPaceChecked(true); return; }
      const { data } = await supabase
        .from('user_baselines')
        // ⛔ `performance_numbers` ADDED 2026-08-24 for the endurance-week screen: the ride caps
        // resolve against the athlete's FTP and the rate line prints pounds off their squat. Both
        // live in that column, and a SELECT that omits it is the projection footgun this repo has
        // hit repeatedly — the resolver would abstain and the screen would show no ride cap at all.
        .select('effort_score, effort_source_distance, effort_source_time, effort_paces, learned_fitness, performance_numbers')
        .eq('user_id', uid).maybeSingle();
      if (cancelled) return;
      setPaceRow(data as PaceBenchmarkRow);
      setPaceChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);
  const paceOnFile = paceChecked && hasPaceBenchmark(paceRow);
  /**
   * ⛔ THE BASELINES THE ENDURANCE-WEEK CAPS RESOLVE AGAINST. Same row, same shape the engine's
   * `resolveEnduranceAnchors` reads — run pace, ride watts. ⚠️ Null until the fetch lands, and the
   * card renders no cap rather than one computed off nothing.
   */
  const baselinesRow = paceRow as unknown;
  /** The squat on file, for the rate line's pounds. ⚠️ Absent → the sentence stands without it. */
  const squat1RMNow = (() => {
    const pn = (paceRow as { performance_numbers?: Record<string, unknown> } | null)?.performance_numbers;
    const v = Number(pn?.squat ?? (pn as Record<string, unknown> | undefined)?.squat1RM);
    return Number.isFinite(v) && v > 0 ? v : null;
  })();
  /** The typed calibration, if it is coherent. Drives the preview and the save. */
  const calResult = calibrationFromPaces({
    easyPace: state.calEasy, fiveKPace: state.calFiveK, isMetric: unit === 'km',
  });
  const [calSaving, setCalSaving] = React.useState(false);
  const [calSaved, setCalSaved] = React.useState(false);
  /** Speed needs numbers. Either they are on file, or they were just entered here. */
  const speedNeedsCalibration = state.raceIntent === 'speed' && paceChecked && !paceOnFile && !calSaved;

  /**
   * ⛔ THE INTENT IS REQUIRED, AND SO IS A PACE IF THEY PICKED SPEED. Without the second half the
   * athlete answers "get faster", walks five more screens, and is refused at the Build button by
   * `missing_pace_benchmark` — the dead end this card exists to close.
   */
  /**
   * ⛔ NAME AND DATE. THAT IS THE WHOLE GATE. Michael, 2026-08-04: *"name and date is all we need."*
   *
   * Distance is given by the card being Marathon, and elevation is deliberately NOT here — it is an
   * input, not a requirement. Someone who knows nothing but which race and when gets a plan.
   */
  const raceCanContinue = !!state.raceName.trim() && !!state.raceDate && raceWeeks !== null;

  /**
   * ⛔ TWO HARD DAYS BACK TO BACK — STATED, NEVER BLOCKED (§5.2b).
   *
   * The long run is a hard day. So is a track night. Putting them on consecutive days is the one
   * placement problem the engine cannot solve, because both days belong to the athlete: the club
   * meets when it meets, and the long run is the block's anchor. 48–72h between hard efforts is the
   * standard recovery window, and adjacent days give roughly 24.
   *
   * ⚠️ ONLY WHEN THE CLUB NIGHT IS HARD. A social club run beside the long run is two aerobic days
   * in a row, which is ordinary training and not worth a word.
   * ⚠️ SAME DAY IS A SEPARATE, LOUDER CASE — it is not two hard days, it is one day asked to be two
   * sessions, and the athlete almost certainly meant something else.
   */
  /**
   * The strength card's three-way answer, read back out of the two fields it writes.
   * ⚠️ Derived rather than stored so it cannot disagree with the payload: `posture.strength` and
   * `strengthProtocol` are what actually travel, and a third state variable beside them is a second
   * source of truth waiting to drift.
   */
  const raceStrengthChoice: 'durability' | 'heavy' | 'none' =
    (state.posture.strength ?? 'maintain') === 'out'
      ? 'none'
      : state.strengthProtocol === 'neural_speed' ? 'heavy' : 'durability';

  /**
   * ⛔ ONE READING OF THE WEEK, SHARED BY THE THREE CARDS. Derived, never stored — a fourth copy of
   * "what is Tuesday" is how the cards would start disagreeing with each other and with the plan.
   *
   * ⚠️ NOTHING IS LABELLED UNTIL THE DAYS ARE PINNED. With no training days chosen the engine picks
   * them, so calling every day "E" would be inventing an answer the athlete has not given. Only the
   * long run and a standing day — both explicit — carry a letter then.
   *
   * ⚠️ A CLUB NIGHT DECLARED EASY IS `E`, NOT `H`. It is pinned, but pinned is not hard, and the
   * whole point of asking hard-or-easy is that the engine puts its quality session elsewhere.
   */
  // Run days are Auto (the engine places them), so the pills mark ONLY the athlete's pins — the long
  // run (LR) and the standing session (C). Passing no trainingDays keeps stray "E" easy-run chips off
  // the week; everything else reads as rest until the plan is built.
  const weekRoles = weekDayRoles({
    trainingDays: [],
    longRunDay: state.longRunDay || undefined,
    standingDay: (state.qualityDays.run || state.qualityDays.bike) || undefined,
    days: DAYS,
  }) as Partial<Record<DayName, DayRole>>;

  /**
   * ── THE STRONG FOCUS SCHEDULER'S DAY ROW ────────────────────────────────────────────────────────
   *
   * Same one-row-many-questions shape as the race card above, over that path's own three anchors:
   * the one hard day, the long run, the long ride.
   *
   * ⚠️ THE HARD DAY IS KEYED BY SPORT, which is the only structural difference from the race card.
   * `qualityDays` is `{ run: 'tuesday' }` or `{ bike: 'tuesday' }` — a run club and a ride club are
   * different anchors — so a day cannot be written until the discipline is chosen. `hardDaySport` is
   * that gate, and it is `d in qualityDays` rather than truthiness because the discipline is picked
   * first and the day arrives after.
   */
  /**
   * ⛔ WHICH HARD SLOT THE DAY ROW IS ANSWERING (§1i, 2026-08-17). There are up to two now, so "the"
   * hard day is no longer a thing — the row answers ONE slot at a time and this says which.
   * ⚠️ Clamped to the list on every render: dropping a slot must not leave the row writing into an
   * index that no longer exists, which is the same class of bug `scheduleAsk` guards against above.
   */
  /**
   * ⚠️ `hardSlotIndex` / `activeHard` / `hardDaySport` WENT WITH IT. `hardDaySport` fed the row's
   * accent colour — which is now neutral for this row anyway, because the hard row is the one row
   * that is not one sport.
   */
  /** Every day already spoken for by a hard slot — a second slot may not take the first one's day. */
  /**
   * ⛔ THE ENGINE'S PROPOSED DAY, READ OFF THE PREVIEW (§1i placement model, slice 8).
   *
   * The screen does not place anything and must not — `previewWeek` is the composer's own answer,
   * built by the same solve that places the bar. A hard slot with no day of its own shows the day
   * the engine chose, so the athlete sees the week already arranged and a tap MOVES a session
   * rather than building one from nothing.
   *
   * ⚠️ MATCHED BY DISCIPLINE AND ORDER, not by name — the preview carries session names ("Hill
   * Repeats", "Threshold Run", "Bike Intervals") and which name a slot gets is §7's business, not
   * this screen's. Order within a discipline is the composer's order, which is the slot order.
   */
  const placedDays = useMemo<Record<number, DayName | undefined>>(() => {
    const out: Record<number, DayName | undefined> = {};
    if (!previewWeek?.length) return out;
    const byDiscipline: Record<'run' | 'bike', DayName[]> = { run: [], bike: [] };
    for (const s of previewWeek) {
      const hard = IS_HARD_SESSION_NAME.test(String((s as { name?: string }).name ?? ''));
      if (!hard) continue;
      const t = String((s as { type?: string }).type ?? '');
      /**
       * ⛔ THE ENGINE SPEAKS `Monday`; THIS SCREEN SPEAKS `monday` (2026-08-25). `WEEK_DAYS` is
       * Title Case on the wire and `DAY_SHORT` / `DAYS` are lowercase, so the raw value indexed
       * nothing: the row read `Run undefined · Ride undefined` and the day chip could not match
       * its own selection. Same trap the deleted `strengthRoles` had already hit and named.
       */
      const d = (String((s as { day?: string }).day ?? '').toLowerCase() || undefined) as DayName | undefined;
      if (!d) continue;
      if (t === 'run') byDiscipline.run.push(d);
      else if (t === 'ride') byDiscipline.bike.push(d);
    }
    const seen: Record<'run' | 'bike', number> = { run: 0, bike: 0 };
    /**
     * ⛔⛔ EVERY SLOT, PINNED OR NOT (round 2, 2026-08-25). This read `if (!h.day) out[i] = …`, so a
     * slot the athlete had pinned kept the PICK and never learned where the week actually put it.
     * That is what let the chips glow Fri/Tue over a week holding Mon/Wed.
     */
    state.hardDays.forEach((h, i) => {
      const list = byDiscipline[h.discipline];
      const n = seen[h.discipline]++;
      out[i] = list[n];
    });
    return out;
  }, [previewWeek, state.hardDays]);
  /**
   * ⛔ THE PLACED WEEK, GROUPED BY DAY — the master strip's only input (round 3, 2026-08-25).
   *
   * ⚠️ SAME ARRAY THE WORDED LIST TAKES. `WeekGrid` receives `previewWeek` directly and groups it
   * the same way; this is that grouping reduced to the one fact a strip shows, which sport. If the
   * two ever disagree the cause is here, not in a second placement opinion — nothing on this screen
   * places anything.
   * ⚠️ THE ENGINE SPEAKS `Monday`, THE CHIPS SPEAK `monday` — the same casing trap `placedDays`
   * carries a note about, and the reason this lowercases rather than trusting the wire.
   */
  const placedWeekByDay = useMemo<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const s of previewWeek ?? []) {
      const d = String((s as { day?: string }).day ?? '').toLowerCase();
      if (!d) continue;
      const t = String((s as { type?: string }).type ?? '').toLowerCase();
      /**
       * ⛔ THE PLYO DAY GETS ITS OWN DOT (2026-08-25). It is `type: 'strength'` — the same fact
       * `WeekGrid`'s lift count had to exclude by tag — so the strip drew a fifth orange dot on a
       * four-lift week, in the one object whose whole job is "what shape is my week".
       * ⚠️ `isPlyoSession` IS THE READER, shared with the calendar chip, so the strip and the
       * calendar cannot come to different conclusions about the same session.
       */
      (out[d] ??= []).push(
        isPlyoSession(s as { tags?: unknown }) ? 'plyo' : (t === 'ride' ? 'bike' : (t || 'strength')),
      );
    }
    return out;
  }, [previewWeek]);
  /**
   * ⛔⛔ THE SELECTOR SHOWS THE WEEK, NOT THE WISH (Michael, round 2, 2026-08-25).
   *
   * It was `state.hardDays[i].day || placedDays[i]` — the athlete's pick winning over the built
   * answer. So a pin the frame could not reach lit a chip on a day that carries no hard session,
   * two inches above a list that says otherwise. A control that reports a day the week does not
   * have is the same lie the coded pill strip was killed for, in a smaller font.
   *
   * ⚠️ THE PICK IS NOT LOST, IT MOVES TO THE NOTE. `unhonouredPick` below is what surfaces it, in
   * the one place a divergence belongs: the sentence that explains it.
   * ⚠️ AND THE PICK IS THE FALLBACK, not the answer — before the first preview lands there is no
   * placed week to read, and a chip showing the athlete's own tap beats a row of empty chips.
   */
  const dayForSlot = (i: number): DayName | '' => {
    /**
     * ⛔⛔ THE PIN WINS HERE TOO (pins-win, 2026-08-25). Round 2 made this `placedDays[i] || pick`,
     * which was right while the engine could overrule a choice. It cannot any more — `compose.ts`
     * puts the endurance session on the day that was tapped — so the pin IS the placement and
     * reading the placed week first only introduces a window where they disagree.
     *
     * ⚠️ AND THE WINDOW IS REAL, NOT THEORETICAL: it was caught on the dev preview, which calls the
     * DEPLOYED composer. Between a tap and the next solve the chip read `Mon — yours` about a day
     * the athlete had not picked, which is the worst of both — the engine's answer wearing the
     * athlete's label.
     * ⚠️ THE ENGINE'S DAY IS STILL THE FALLBACK for a slot nobody has touched, which is the normal
     * case and the whole point of arriving with the week already arranged.
     */
    /**
     * ⛔⛔ A BLOCKED DAY IS RESOLVED HERE, NOT IN STATE (Michael, 2026-08-25 afternoon). The athlete's
     * answer stays exactly where they put it; what the chip SHOWS is the day the engine re-solved it
     * onto. A chip still glowing on the day off would be the screen showing a day the plan does not
     * have — the exact lie the "picked Thu, placed Mon" line was killed for.
     *
     * ⚠️ THE CLIENT SOLVE IS READ FIRST HERE, ahead of `placedDays`, and only in this branch. The
     * placed week is the SERVER's, which is a round trip behind — and in the one moment the athlete
     * has just blocked a day, being a round trip behind means showing them the day they blocked.
     */
    const pick = state.hardDays[i]?.day as DayName | '' | undefined;
    if (pick && isBlockedDay(pick)) {
      return (suggestedHardDays[i] as DayName | undefined) || placedDays[i] || '';
    }
    if (touchedUnits[`hard:${i}`] && pick) return pick;
    return placedDays[i] || pick || '';
  };

  /**
   * ⛔ `hardDayValues` STOOD HERE AND IS DELETED (2026-08-25). It flattened every hard slot's
   * resolved day into a bare string list, and its only consumer was `scheduleRoles` — the coded
   * chip strip's letter derivation, deleted with the strip. Each picker reads `dayForSlot(i)`
   * directly now, which is the same answer without the intermediate list.
   */
  // ⚠️ RESOLVED DAYS, not just the athlete's — a slot must not be able to take the day the engine
  // proposed for the other one, or two hard sessions land together and the composer dedupes one away.
  /** ⛔ THE COUNT DRIVES THE COPY (§1i). One HOLDS top-end fitness; two BUILDS it. */
  /**
   * ⛔ IT COUNTED PINNED DAYS, NOT HARD DAYS, AND ON THIS STEP THAT IS ALWAYS ZERO (found 2026-08-18).
   *
   * `filter(h => !!h.day)` was written when the hard row asked WHAT and WHEN together. The two were
   * split on 2026-08-18 — `hardday` asks what, `schedule` asks when — so on the screen this number
   * is read from, no slot has a day yet. An athlete with two hard sessions selected was told "one
   * hard session a week holds top-end aerobic fitness", which is the wrong sentence about the wrong
   * week.
   *
   * ⚠️ THE SLOT IS THE ANSWER, THE DAY IS THE SCHEDULE. Presence in `hardDays` means the discipline
   * is chosen; the day arrives later and may be the engine's to propose (§1i slice 8). Anything
   * counting "how much intensity does this block carry" must count slots.
   */
  const hardDayCount = state.hardDays.length;
  /**
   * ⚠️ THE OPEN QUESTION HAS TO BE ONE THE CARD IS SHOWING. Long run and long ride are posture-gated
   * rows, and posture is editable on an earlier step — so walking Back, dropping the bike, and
   * walking forward again would leave "ride" selected with no row for it and a day row quietly
   * writing to a discipline that is no longer in the plan. Falls back to the hard day, which every
   * Strong Focus week has.
   */
  /**
   * ⛔ THE STRENGTH PATH DERIVES THIS SCREEN FROM THE SLOT ANSWERS (B1, 2026-08-24). The week has
   * ONE long session and the slot screen already said which sport it is — so exactly one long row
   * renders, the other's pin is cleared (the phantom "Long Run: sunday" on a long-ride week came
   * from here), and the count rows do not exist: counts derive from the slots.
   */
  const longSlotSport = isStrengthFocus ? ((state.slotSports ?? emptySlotSports()).long ?? null) : null;
  const scheduleRunShown = isStrengthFocus
    ? longSlotSport === 'run'
    : state.posture?.run != null && state.posture?.run !== 'out';
  const scheduleRideShown = isStrengthFocus
    ? longSlotSport === 'ride'
    : state.posture?.bike === 'maintain';
  /**
   * ⛔⛔ `scheduleRows` / `scheduleRowsShown` STOOD HERE AND ARE DELETED (Michael, 2026-08-25).
   *
   * They built the disclosure list's rows — a label, a one-line ANSWER for the collapsed state, an
   * `optional` chip and a shared sort order — for a list this screen no longer has. Every picker is
   * open now, so a row has no collapsed state to render an answer into, and the only consumer of
   * the array was the `hardday` block deleted below.
   *
   * ⚠️ THE ANSWER STRINGS WENT WITH THEM AND NOTHING IS LOST: each picker states its own day beside
   * its own label, which is what those strings were summarising. `SCHEDULE_ROW_ORDER` and
   * `SCHEDULE_OPTIONAL_ROWS` in `schedule-gate.ts` are untouched — the GATE still reads them; only
   * this screen's row list stopped.
   */
  const longRowShown = scheduleRunShown || scheduleRideShown;
  const longRowRgb = getDisciplineColorRgb(scheduleRunShown ? 'run' : 'bike');
  /**
   * ⚠️ THE OPEN QUESTION HAS TO BE ONE THE CARD IS SHOWING. Four of the five rows are posture-gated,
   * and posture is editable on an earlier step — so walking Back, dropping the bike, and walking
   * forward again would leave a row open that no longer renders, with its day chips quietly writing
   * to a discipline that is not in the plan.
   *
   * ⚠️ AND NOTHING IS OPEN BY DEFAULT-BY-NAME. The initial value is null and resolves to the FIRST
   * shown row, so the card always opens on a question the athlete has, whichever disciplines they
   * kept. Hardcoding a key here is how the card ended up opening on the optional question.
   */
  /**
   * ⛔ THE HARD-DAY STEP OPENS ON ITS OWN QUESTION, ALWAYS (2026-08-18). Without this the list's
   * "open the first shown row" rule resolved to `long`, and the hard row rendered CLOSED on the page
   * built for it — a screen whose only question is collapsed behind a tap.
   */
  /**
   * ⛔⛔ `scheduleRowKeys`, `scheduleAsk` AND THE DEFAULT-ASK EFFECT ARE DELETED (2026-08-25). They
   * resolved WHICH single row was open, which was the disclosure list's central question and is no
   * longer a question anyone asks: every picker on this step renders open.
   * ⚠️ `src/lib/schedule-ask.ts` GOES WITH THEM — it had exactly one caller.
   */
  /**
   * ⛔ THE OPINIONATED DEFAULT (Michael, 2026-08-18). The scheduler does not open on a blank grid for
   * the hard days — it opens with the model's own answer already chosen, labelled as a suggestion.
   *
   * ⛔ IT IS THE REAL ENGINE, NOT A CLIENT-SIDE GUESS. `suggestHardDays` runs `week-model/resolve`
   * through the `@shared` alias, so the day the wizard offers is the day the composer would pick. A
   * cheaper approximation here would disagree with the built plan the moment the week got tight,
   * which is the one place an athlete would catch it.
   *
   * ⚠️ IT WRITES INTO STATE RATHER THAN MERELY DISPLAYING, so the athlete can walk straight past the
   * screen and still get the optimal week. Agency is intact: any chip overrides it, and a move that
   * creates a collision is caught and reported by the plan, never blocked here.
   * ⚠️ AND IT NEVER OVERWRITES AN ANSWER. It fills only slots that are still empty — a day the
   * athlete typed, or a club night, is theirs.
   */
  /**
   * ⛔ ONE SOLVE, THREE ANSWERS (2026-08-18). This was three separate memos — the hard-day
   * suggestion, the long-day suggestion and the health badge — each running the exhaustive placer
   * over the same week on every tap. On a browser that reads as buttons not responding.
   * ⚠️ It also means the three can no longer disagree: they are literally the same placement.
   */
  /**
   * ⛔⛔ THE SOLVE IS GATED TO THE ONE STEP THAT READS IT, AND DEFERRED OFF THE PAINT (stage 3,
   * 2026-08-21). Michael: *"long run and ride sorta linger until they are clicked a couple of
   * times."* It is not a state bug — the taps register. This memo ran the exhaustive placer
   * SYNCHRONOUSLY between the tap and the paint.
   *
   * **Re-measured 2026-08-21, desktop V8, on his shape (2 hard days, 4 runs, 2 rides):**
   * ```
   *   nothing picked        457.7 ms      long run picked   50.5 ms
   *   both long days         5.0 ms       fully pinned       0.1 ms
   * ```
   * ⚠️ Essentially unchanged from the 472 ms the trace report measured — stages 2, 4 and 5 did NOT
   * help here, and neither did deleting the composer's Q-215 double-solve. Those were SERVER-side
   * solves; this one is the client's own call into `week-model/resolve`. A phone is 3–5× these.
   *
   * ⛔ THE REAL DEFECT WAS THE DEPENDENCY LIST, NOT THE COST. Nothing outside the `schedule` step
   * reads this — the two long-day pre-fills, the hard-day pre-fill and the health badge are all
   * gated to it. But the memo was ungated, and its deps include `runDays`, `rideDays` and
   * `swimDays`. So **tapping a ride-count chip on the VOLUME step ran a 457 ms exhaustive solve
   * whose answer nobody reads until two screens later.** That is the chip that "lingers".
   *
   * ⚠️ AND WHY THE UNPINNED CASE IS THE EXPENSIVE ONE: `resolve` searches only the units that can
   * break the law, and with nothing picked that is three lifts + two hard days + both long days —
   * seven free constrained units, 7^7 candidates. Pin the long run and it is 7^6 and 50 ms. The card
   * opens with nothing picked, so the FIRST solve is always the worst one.
   *
   * ⛔ DEFERRED, NOT DEBOUNCED. `useDeferredValue` re-renders with the PREVIOUS input first — the tap
   * paints immediately with the last suggestion — and schedules the new solve at low priority. A
   * debounce would make the answer arrive late by a fixed delay whether or not it was needed;
   * this makes it arrive as soon as the browser is free. ⚠️ It does not make the solve itself
   * interruptible: React cannot slice a synchronous `useMemo`. What it buys is that the TAP is never
   * behind it.
   */
  /**
   * ⛔ DAYS THE ATHLETE CANNOT TRAIN — slice 2's rest-day row. A pin like any other: absolute, and
   * the endurance sessions arrange around it.
   *
   * ⛔ AND THE SOLVER JUGGLES BEFORE IT WARNS (Michael, 2026-08-25). The endurance never lands on a
   * blocked day — it is movable by definition — and the LIFTING frame has seven rotations, so
   * `chooseDayMap` is scored to land the frame's empty day on the one the athlete blocked. A lift
   * sits on a blocked day only when no rotation can honour every pin at once, and the note then
   * says which pins collided rather than asserting the order is why.
   */
  const [unavailableDays, setUnavailableDays] = useState<DayName[]>([]);

  // ⚠️ DECLARED ABOVE `wizardSolveInput` (2026-08-25): the solve now reads it to tell the
  //    athlete's pins from the engine's own placements, and a `const` cannot be read above
  //    its own declaration.
  /**
   * ⛔ PRISTINE VS DIRTY — AND IT IS PRIORITY ZERO, because without it the smart default is a
   * HOSTAGE SITUATION (Michael, 2026-08-18).
   *
   * The pre-fill guarded on "is this field empty", which is a state loop: tapping a chosen day to
   * release it emptied the field, the solve then produced a suggestion for the now-empty field, and
   * the effect refilled it. **The athlete could not clear a long day.** To them that reads as the
   * button not working — the same complaint as the hard-day chips, from a different cause, and
   * exactly the hostility the whiteboard change was meant to end.
   *
   * ⛔ EMPTY IS NOT THE QUESTION. TOUCHED IS. The engine fills a unit once, while nobody has said
   * anything about it; the moment the athlete touches that unit — including to CLEAR it — it is
   * theirs and the engine never writes to it again. An empty field they emptied is an answer.
   *
   * ⚠️ PER UNIT, NOT PER SCREEN. Clearing the long run must not stop the long ride being suggested;
   * they are separate decisions and a screen-wide flag would make the first tap silence the rest.
   * ⚠️ HARD SLOTS ARE KEYED BY INDEX, so removing a slot re-points the flags of the ones after it.
   * The cost is one stale suggestion on a rebuilt slot, which the athlete can clear; keying on
   * identity would mean giving slots ids for this alone.
   */
  const [touchedUnits, setTouchedUnits] = useState<Record<string, boolean>>({});
  const touch = (key: string) => setTouchedUnits((t) => (t[key] ? t : { ...t, [key]: true }));

  const wizardSolveInput = React.useMemo(
    () => ({
      hardDays: state.hardDays.map((h, i) => ({
        discipline: h.discipline, day: h.day, ownership: h.ownership,
        /**
         * ⛔⛔ WHOSE ANSWER THE DAY IS, HANDED TO THE SOLVER (2026-08-25). The pre-fill writes the
         * engine's own suggestion into `h.day`, and every named day used to come back as a pin — so
         * the engine's proposal became an absolute the engine could not move, and marking that day
         * unavailable afterwards changed nothing. `touchedUnits` is the only place that knows the
         * difference, and it is here.
         */
        pinned: h.ownership === 'club' || !!touchedUnits[`hard:${i}`],
      })),
      longRunDay: state.longRunDay,
      longRideDay: state.longRideDay,
      // ⛔ SAME RULE FOR THE TWO LONG SLOTS. A club long session is pinned by its nature (slice 2b).
      longRunPinned: !!state.longClub || !!touchedUnits.longRun,
      longRidePinned: !!state.longClub || !!touchedUnits.longRide,
      runDays: state.runDays,
      rideDays: state.rideDays,
      swimDays: state.posture?.swim === 'maintain' ? state.swimDays : 0,
      // ⛔ THE REST-DAY PINS REACH THE CLIENT MODEL TOO (pins-win slice 2). `week-model`'s
      // `unavailableDays` keeps the free units off them, so the conflict badge is computed against
      // the week the athlete is actually asking for rather than a seven-day one.
      unavailableDays,
    }),
    [state.hardDays, state.longRunDay, state.longRideDay, state.runDays, state.rideDays,
      state.swimDays, state.posture?.swim, unavailableDays, touchedUnits, state.longClub],
  );
  /**
   * ⛔ AND THE FIRST RENDER OF THE STEP IS ARMED ON THE NEXT FRAME, WHICH `useDeferredValue` ALONE
   * DOES NOT DO. On React 18 it returns the value UNCHANGED on the initial render — there is no
   * previous value to fall back to — so arriving at the schedule step would still pay the full
   * unpinned solve before the card's first paint. (React 19's `initialValue` argument exists for
   * exactly this; this project is on 18.3.)
   *
   * ⚠️ SO THE CARD PAINTS ONCE WITH NO SUGGESTION AND THE DAYS FILL IN ON THE NEXT FRAME. That is
   * the right trade and not a compromise: these are SUGGESTIONS, the athlete can override every one
   * of them, and the alternative is a frozen screen for as long as the solve takes — on his shape
   * 457 ms on a desktop, and a phone is 3-5× that.
   */
  const [solveArmed, setSolveArmed] = useState(false);
  React.useEffect(() => {
    if (currentStep !== 'schedule') { setSolveArmed(false); return; }
    const id = requestAnimationFrame(() => setSolveArmed(true));
    return () => cancelAnimationFrame(id);
  }, [currentStep]);
  // ⚠️ `null` OFF THE SCHEDULE STEP, not a cheaper input — the answer is unused there, and computing
  // one anyway is what this change exists to stop.
  const deferredSolveInput = React.useDeferredValue(
    currentStep === 'schedule' && solveArmed ? wizardSolveInput : null,
  );
  const wizardWeek = React.useMemo(
    () => (deferredSolveInput ? solveWizardWeek(deferredSolveInput) : IDLE_WIZARD_WEEK),
    [deferredSolveInput],
  );
  const suggestedHardDays = wizardWeek.hardDays;
  const suggestedLongDays = { run: wizardWeek.longRun, ride: wizardWeek.longRide };
  /**
   * ⚠️ DECLARED BELOW `suggestedLongDays` AND `unavailableDays`, both of which it reads — a `const`
   * cannot be evaluated above its own declaration, and this block used to sit 180 lines higher.
   */
  /**
   * ⛔ THE LONG ROW'S DAY, AND A BLOCKED ONE RESOLVES THE SAME WAY THE HARD SLOTS DO (2026-08-25
   * afternoon) — the athlete's answer stays in state, the chip shows where the engine put it.
   * ⚠️ `longRowMoved` is what stops the row calling that replacement "yours".
   */
  const longRowOwn = (scheduleRunShown ? state.longRunDay : state.longRideDay) || '';
  const longRowMoved = !!longRowOwn && unavailableDays.includes(String(longRowOwn).toLowerCase() as DayName);
  const longRowDay = longRowMoved
    ? ((scheduleRunShown ? suggestedLongDays.run : suggestedLongDays.ride) || longRowOwn)
    : longRowOwn;
  const scheduleHealthState = wizardWeek.health;
  const [healthOpen, setHealthOpen] = useState(false);
  /** The engine's own list of pins it could not reach — see the override row on the week step. */
  const [overridesOpen, setOverridesOpen] = useState(false);
  /** The static placement-rules section — see `PLACEMENT_RULES`. Closed by default: it is
   *  reference, not a step in the flow. */
  const [rulesOpen, setRulesOpen] = useState(false);


  /**
   * The athlete's own day when the built week did not use it. Empty when they never picked one, or
   * when the week honoured it — a pick that landed needs no sentence.
   */
  /**
   * ⛔⛔ `unhonouredPick` / `overrideLine` / `overrideLines` / `ENGINE_HARD_NOTE` STOOD HERE AND ARE
   * DELETED (pins-win, 2026-08-25). They existed to explain a day the engine had overruled —
   * *"Hard run: picked Thu, placed Mon"* — and nothing is overruled any more. `compose.ts` places
   * the endurance session on the day that was tapped, so the pick and the placement are the same
   * answer and there is nothing to reconcile.
   * ⚠️ The engine's own compromise prose is no longer filtered, either: `chooseDayMap` still writes
   * a line when its ROTATION could not reach a pin, but the pin is honoured downstream regardless,
   * so that line now describes an intermediate step rather than the built week. It is dropped
   * wholesale below rather than matched and replaced.
   */

  /** A day the athlete tapped, as opposed to one the engine chose. Drives the chip's own styling. */
  const isPinned = (i: number): boolean =>
    // ⛔ A CLUB SESSION IS PINNED BY ITS NATURE (slice 2b) — its day is the world's, not a
    // preference, so it reads as the athlete's answer whether or not they tapped the chip.
    (state.hardDays[i]?.ownership === 'club' || !!touchedUnits[`hard:${i}`])
    && !!state.hardDays[i]?.day
    // ⛔ BUT NOT ONCE THEY HAVE BLOCKED THAT DAY (2026-08-25 afternoon). The chip is then showing the
    // engine's replacement, and labelling it "yours" would credit the athlete with a day they never
    // picked — the same lie in the opposite direction from the one this cue was built to end.
    && !isBlockedDay(state.hardDays[i]?.day);


  /**
   * ⛔⛔ THE TIERED NOTES — breaches first, then trade-offs, then the engine's own remaining lines.
   *
   * ⛔ THE TIER IS THE ENGINE'S, NOT THIS SCREEN'S. `tierOf` reads the same table the explainer list
   * reads, which reads the layer the rule lives in (`week-model/resolve.ts`). Nothing here decides
   * how serious a rule is; deciding that on the client is how the screen and the plan come to
   * disagree about what is safe.
   * ⛔ AND NOTHING IS A BLOCK. Michael, 2026-08-25: *"user choice always wins, it's just informed."*
   * Every line below is a fact about the week the athlete asked for, and Continue is never gated on
   * one. ⚠️ `docs/COPY-VOICE.md`: no imperatives, no "consider moving", no consoling closer.
   */
  const weekNotes = useMemo<Array<{ tier: 'breach' | 'tradeoff'; text: string }>>(() => {
    const out: Array<{ tier: 'breach' | 'tradeoff'; text: string }> = [];
    const seen = new Set<string>();
    const add = (rule: RuleId, facts: Parameters<typeof ruleWarning>[1] = {}) => {
      const text = ruleWarning(rule, facts);
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push({ tier: tierOf(rule), text });
    };

    /**
     * ⛔ THE CLUB RIDE COMES UP SHORT (slice 2b, 2026-08-25) — ONE informed note, never a block.
     *
     * ⚠️ THE TARGET IS THE PLAN'S OWN, READ OFF THE BUILT WEEK. The long session's duration in
     * `previewWeek` is what the block actually asks for; a number invented here would be the screen
     * holding the athlete to a target the plan does not have.
     * ⚠️ SILENT UNTIL BOTH NUMBERS EXIST. No duration answered, or no long session in the week yet,
     * means there is nothing to compare — and a note about a 0-minute shortfall is the kind of
     * confident wrong answer this codebase keeps deleting.
     * ⚠️ ROUNDED TO 5 MINUTES. A club ride's "usually about two hours" is not a stopwatch reading,
     * and reporting "47 minutes short" off it would be precision the input does not carry.
     */
    if (state.longClub && typeof state.longClubMinutes === 'number' && state.longClubMinutes > 0) {
      /**
       * ⚠️ THE SPORTS HAVE TO MATCH, and this was caught on the dev preview. The sport mix can put
       * the frame's one long slot on the RUN while the athlete's club is a ride — the engine then
       * reports the orphaned pin itself. Comparing a club ride's duration against a long RUN's
       * target would be a shortfall note about two different sessions.
       */
      const wantType = scheduleRunShown ? 'run' : 'ride';
      const longSession = (previewWeek ?? []).find((x) =>
        /Long/i.test(String((x as { name?: string }).name ?? ''))
        && String((x as { type?: string }).type ?? '') === wantType);
      const target = Number((longSession as { duration?: number } | undefined)?.duration ?? 0);
      const shortBy = target - state.longClubMinutes;
      if (target > 0 && shortBy > 0) {
        add('club_long_short', { shortMinutes: Math.round(shortBy / 5) * 5 });
      }
    }

    /**
     * ⛔⛔ WHAT A DAY OFF MOVED, AND WHERE TO (Michael, 2026-08-25 afternoon). *"The note says what
     * moved and why."*
     *
     * ⛔ THE MOVE IS THE ENGINE'S, READ BACK — `solveWizardWeek` returns `relocations` from
     * `resolveAroundPins`, the same call that placed the week. This screen composes no prose and
     * decides nothing about which session went where; it renders the fact through the copy table.
     * ⚠️ THE ENGINE'S OWN SENTENCE WINS when the preview has come back with one, exactly like the
     * lifting note below — one sentence per day off, and the built week's version is the truer one.
     */
    for (const r of wizardWeek.relocations) {
      const from = DAY_SHORT[DAYS[r.from]];
      if (previewNotes.some((n) => /is a day off/i.test(n) && new RegExp(`\\b${DAYS[r.from]}\\b`, 'i').test(n))) {
        continue;
      }
      add('session_moved_off_unavailable_day', {
        day: from,
        session: relocationPhrase(r.session),
        movedTo: DAY_SHORT[DAYS[r.to]],
      });
    }

    /**
     * ⚠️ A LIFT ON A DAY THE ATHLETE BLOCKED — and it is now the case the rotation could not solve,
     * not the case nobody tried (`chooseDayMap` scores all seven rotations as of 2026-08-25).
     *
     * ⛔ THE ENGINE'S OWN SENTENCE WINS WHEN IT HAS ONE. `chooseDayMap` knows WHICH pin took the
     * only rotation that would have cleared the day and names it; this screen cannot know that, and
     * rendering both would be two sentences about one day, the weaker one first.
     */
    for (const d of unavailableDays) {
      const lifts = (previewWeek ?? []).filter((x) => {
        const day = String((x as { day?: string }).day ?? '').toLowerCase();
        return day === d && String((x as { type?: string }).type ?? '') === 'strength';
      });
      if (lifts.length === 0) continue;
      const enginesOwn = previewNotes.some((n) =>
        /carr(?:ies|y) (?:a )?lifting day/i.test(n) && new RegExp(`\\b${d}\\b`, 'i').test(n));
      if (enginesOwn) continue;
      add('lift_on_unavailable_day', { day: DAY_SHORT[d] });
    }

    /**
     * ⛔ THE ENGINE'S OWN SENTENCES, KEPT VERBATIM AND KEPT LAST. `placement_compromises` still
     * carries the notes this screen has no independent way to compose — the sport the frame has no
     * long slot for, the mid-week start. ⚠️ THE ROTATION'S OWN "the hard session is on X rather
     * than Y" LINE IS DROPPED: the rotation is now the no-pins default rather than the ceiling, so
     * that line describes a step, not the week that was built.
     */
    for (const n of previewNotes) {
      const t = n.trim();
      if (/^The hard session is on/i.test(t)) continue;
      if (/^The long run is on/i.test(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ tier: 'tradeoff', text: t });
    }
    return out;
  }, [previewWeek, previewNotes, unavailableDays, state.longClub, state.longClubMinutes,
    scheduleRunShown, wizardWeek.relocations]);

  const breachNotes = weekNotes.filter((n) => n.tier === 'breach');


  /**
   * ⛔⛔ IT PRE-FILLED A LONG DAY FOR A DISCIPLINE THE CARD IS NOT SHOWING, AND THE ENGINE REPORTED
   * IT AS A COMPROMISE EVERY SINGLE TIME (found on the dev preview, 2026-08-25).
   *
   * On the strength path the week has ONE long session and the slot screen already said which sport
   * it is — that is why `scheduleRunShown` / `scheduleRideShown` render exactly one long row (B1,
   * 2026-08-24, the note on `longSlotSport`). These two effects never learned it: on a long-RIDE
   * week the run effect still wrote `longRunDay = Sunday`, `buildPreferredDays` still shipped it as
   * `preferred_days.long_run`, and `chooseDayMap` answered — correctly — *"This week has one long
   * session and it is a ride, so the long run pinned to Sunday is not in it."*
   *
   * ⛔ SO EVERY LONG-RIDE ATHLETE CARRIED A PERMANENT FALSE COMPROMISE about a day they were never
   * shown and never chose. It was invisible until this pass rendered `placement_compromises`; the
   * screen was discarding them, which is what let a phantom pin sit there unnoticed.
   *
   * ⚠️ THE GUARD IS THE SAME PREDICATE THE ROW USES, deliberately — one owner for "is this
   * discipline's long day a question on this card". A second test here is how they drift apart.
   */
  /**
   * ⛔⛔ AND AN ENGINE-OWNED DAY IS REWRITTEN WHEN THE ATHLETE BLOCKS IT (2026-08-25).
   *
   * The guard below is `!st.longRunDay` — fill an EMPTY field once, never overwrite. That is right
   * for an athlete's answer and wrong for the engine's own, and it is half of the bug that put a
   * hard run on a day marked "can't train": the engine filled Friday, the athlete blocked Friday,
   * and the field was no longer empty so nothing rewrote it. `staleEngineDay` is the one exception —
   * a day nobody touched that the athlete has since said they cannot train.
   *
   * ⚠️ THE OTHER HALF IS IN THE SOLVE, and both are needed. Releasing the field here alone would
   * re-fill it with the same Friday, because `buildWizardWeek` was handing that day back to the
   * solver as an absolute (`HardSlot.pinned`).
   */
  // ⚠️ MEMOISED ON THE ROW IT READS, so the three effects below can name it in their deps without
  // re-running on every render — a fresh closure each time would make them fire in a loop.
  const isBlockedDay = React.useCallback(
    (d: string | null | undefined): boolean =>
      !!d && unavailableDays.includes(String(d).toLowerCase() as DayName),
    [unavailableDays],
  );

  /**
   * ⛔⛔ A BLOCKED DAY IS NEVER WRITTEN OVER IN STATE — IT IS RESOLVED AT RENDER (2026-08-25 afternoon).
   *
   * The first pass at Michael's ruling re-filled the field: the athlete tapped Friday, blocked
   * Friday, and the effect rewrote `hardDays[0].day` to Monday. It moved the session correctly and
   * **erased the reason.** On the very next solve the pin was an ordinary unblocked Monday, the
   * engine had nothing to report, and *"Fri is a day off — the hard run moved to Mon"* appeared for
   * one frame and vanished. The screen said "Mon — yours" about a day the athlete never picked.
   *
   * ⛔ SO THE ATHLETE'S ANSWER STAYS. `dayForSlot` renders the engine's replacement, `isPinned`
   * stops calling it theirs, and the note keeps firing for as long as the contradiction is real.
   * ⚠️ AND THE TAP COMES BACK IF THEY UNBLOCK THE DAY, which is the behaviour a re-fill destroyed:
   * their Friday was gone for good the moment they tried a day off.
   * ⚠️ THE WIRE CARRIES THE ANSWER, NOT THE WORKAROUND. `hard_days` ships the tapped day and
   * `unavailable_days` ships beside it; the engine resolves the pair, exactly as it does here.
   */
  React.useEffect(() => {
    if (currentStep !== 'schedule' || !scheduleRunShown || touchedUnits.longRun) return;
    setState((st) => {
      if (st.longRunDay || !suggestedLongDays.run) return st;
      return { ...st, longRunDay: suggestedLongDays.run as typeof st.longRunDay };
    });
  }, [currentStep, scheduleRunShown, suggestedLongDays.run, touchedUnits.longRun]);
  React.useEffect(() => {
    if (currentStep !== 'schedule' || !scheduleRideShown || touchedUnits.longRide) return;
    setState((st) => {
      if (st.longRideDay || !suggestedLongDays.ride) return st;
      return { ...st, longRideDay: suggestedLongDays.ride as typeof st.longRideDay };
    });
  }, [currentStep, scheduleRideShown, suggestedLongDays.ride, touchedUnits.longRide]);

  React.useEffect(() => {
    if (currentStep !== 'schedule') return;
    setState((st) => {
      let touched = false;
      const next = st.hardDays.map((h, i) => {
        if (h.day || h.ownership === 'club' || touchedUnits[`hard:${i}`]) return h;
        const s = suggestedHardDays[i];
        if (!s) return h;
        touched = true;
        return { ...h, day: s as typeof h.day };
      });
      return touched ? { ...st, hardDays: next } : st;
    });
  }, [currentStep, suggestedHardDays, touchedUnits]);


  /**
   * ⛔ WHAT EACH HARD SLOT WILL ACTUALLY BE — the screen's copy of `assignHardRoles`
   * (`strength-primary-plan.ts`), and it exists so the athlete is told before they build rather
   * than after. Threshold is the DEFAULT and intervals are the UNLOCK: VO2 work competes with the
   * squat and the deadlift for the same nervous system, so one hard session a week has to be the
   * cheap one.
   *
   * ⚠️ A CLUB SESSION CONSUMES THE THRESHOLD SLOT — a group run or ride already settles into exactly
   * that rhythm — so the app's own day goes to intervals. Same rule, same order, as the engine.
   * ⛔ TWO OWNERS OF ONE RULE, ACCEPTED DELIBERATELY: importing an edge-function constant into the
   * wizard would pull the whole composer into the client bundle. If `assignHardRoles` changes, this
   * changes with it.
   */
  /**
   * ⛔ IT MIRRORS `assignHardRoles` AND MUST KEEP DOING SO — INCLUDING THE ORDER OF THE TWO PATHS.
   * The screen and the composer disagreeing about which session an athlete is getting is the exact
   * failure this card has now been rebuilt twice to fix.
   */
  const hardRoleOf = (i: number): 'threshold' | 'vo2' | 'club' => {
    const slots = state.hardDays;
    if (slots[i]?.ownership === 'club') return 'club';
    // ⛔ THE ATHLETE'S ALLOCATION WINS (2026-08-18). Which sport holds the top-end session is a real
    // training decision and it used to be settled by which chip was tapped first, with no surface
    // saying so. Now it is a stated toggle and this reads it.
    /**
     * ⛔⛔ A HALF-ALLOCATED PAIR LIT BOTH BUTTONS AND BUILT TWO INTENSITY SESSIONS (found on device,
     * 2026-08-18: *"wrong buttons for ride"*). READ THIS BEFORE SIMPLIFYING IT.
     *
     * The first version read one slot's own field: `role === 'threshold' ? 'threshold' : 'vo2'`. An
     * UNSET slot therefore answered `vo2` — and unset is reachable in one ordinary sequence:
     *
     *     add a run → pick a session from the merged one-slot list (writes role to slot 0)
     *     → add a ride (slot 1 has no role at all)
     *
     * Both slots then resolved to intensity. The toggle showed BOTH buttons filled, the card printed
     * "Run — top-end intensity" above "Ride — top-end intensity", and the interlock line above them
     * said the ride was the sustained one — three statements, two of them false, on one screen.
     *
     * ⛔ THE BUDGET IS ONE OF EACH AND THE RESOLVER MUST ENFORCE IT, not assume the writer did. So
     * it derives the single intensity INDEX rather than answering per slot in isolation: an explicit
     * `intensity` mark wins, otherwise the first slot not marked `threshold` takes it, and every
     * other prescribed slot is the sustained one by subtraction.
     *
     * ⚠️ MIRRORED IN `assignHardRoles`, which takes the same half-allocated payload off the wire and
     * had the same hole. Change both or the screen and the plan disagree.
     */
    /**
     * ⛔ A LONE-SLOT ANSWER IS NOT AN ALLOCATION — full reasoning on `assignHardRoles` in
     * `strength-primary-plan.ts`, which this MUST mirror exactly. Answering a one-slot card's
     * "what is this session" list and then adding a second sport used to hand the top end to
     * whichever sport was added first. ⛔ Change both or the screen and the plan disagree.
     */
    const pres = slots.map((h, j) => ({ h, j })).filter(({ h }) => h.ownership !== 'club');
    if (pres.some(({ h }) => h.role)) {
      const fullyAllocated = pres.length > 0 && pres.every(({ h }) => !!h.role);
      const candidates = pres.filter(({ h }) => h.role !== 'threshold');
      const pick = fullyAllocated
        ? candidates.find(({ h }) => h.role === 'intensity') ?? candidates[0]
        : (candidates.find(({ h }) => h.discipline === 'run') ?? candidates[0]);
      return i === (pick?.j ?? -1) ? 'vo2' : 'threshold';
    }
    /**
     * ⛔ THE FALLBACK IS A TRAINING RULE NOW, NOT LIST ORDER (2026-08-18) — the run holds the
     * top-end session when the pair is a run and a ride. Full reasoning lives on `assignHardRoles`
     * in `strength-primary-plan.ts`; the short version is that the THRESHOLD session is the long
     * one, and putting it on the bike takes twenty-plus minutes of level footfall off the legs the
     * barbell needs. ⛔ MIRRORS THE ENGINE AND MUST KEEP DOING SO — the screen and the plan
     * disagreeing about which session an athlete gets is the failure this card has been rebuilt
     * twice to fix.
     * ⚠️ A club session IS the sustained one, so it consumes the threshold slot and the app's own
     * days stay on intensity.
     */
    if (slots.some((h) => h.ownership === 'club')) return 'vo2';
    const prescribed = slots.map((h, j) => ({ h, j })).filter(({ h }) => h.ownership !== 'club');
    const runIdx = prescribed.find(({ h }) => h.discipline === 'run')?.j ?? -1;
    const rideIdx = prescribed.find(({ h }) => h.discipline === 'bike')?.j ?? -1;
    // ⚠️ ORDER STILL DECIDES WHEN THE RULE CANNOT SPEAK — two runs, or two rides.
    const idx = runIdx >= 0 && rideIdx >= 0 ? runIdx : (prescribed[0]?.j ?? -1);
    return i === idx ? 'vo2' : 'threshold';
  };
  /**
   * ⛔ ONE TOGGLE, BOTH SLOTS. Allocating intensity to one sport IS allocating threshold to the
   * other — the week's budget is one of each — so this writes both rather than leaving the second
   * to be inferred. Writing only the tapped slot would leave the other reading the positional
   * fallback, and the two rules can disagree.
   * ⚠️ CLUB SLOTS ARE SKIPPED, not overwritten: a club session already holds the sustained slot by
   * its nature and the athlete does not get to reassign it.
   */
  /**
   * ⚠️ `allocationIsExplicit` STOOD HERE AND IS DELETED (2026-08-18). It existed for one caller —
   * the per-card "secondary sessions default to sustained threshold" note — which moved to the
   * banner, where it is a rule stated up front rather than a fact about one card. The gate went
   * with it: a banner explaining how the block is BUILT is true whether or not this athlete has
   * overridden anything.
   * ⛔ The `fullyAllocated` test itself is NOT gone — it lives in `hardRoleOf` and `assignHardRoles`,
   * where it decides whether an explicit allocation outranks the discipline rule.
   */

  /**
   * ⛔ DID THE ATHLETE ALLOCATE, OR DID THE ENGINE? Exactly the `fullyAllocated` test `hardRoleOf`
   * and `assignHardRoles` both use: every prescribed slot carrying a role means they tapped the
   * control, which writes both. Anything less means the role on the sustained card is the engine's
   * discipline rule speaking, not a choice.
   *
   * ⚠️ IT EXISTED, WAS DELETED WHEN ITS ONLY CALLER MOVED TO THE BANNER, AND IS BACK FOR A SMALLER
   * ONE — a `Default` tag rather than a sentence. Michael: *"we default to threshold — a way to
   * notify the user, quick and non-idiomatic."* A tag is the shortest honest form of that: it names
   * who decided, sits beside the control that undoes it, and vanishes the moment they use it.
   */
  const allocationIsExplicit = (() => {
    const pres = state.hardDays.filter((h) => h.ownership !== 'club');
    return pres.length > 0 && pres.every((h) => !!h.role);
  })();

  const allocateIntensityTo = (slot: number) => setState((st) => ({
    ...st,
    hardDays: st.hardDays.map((h, i) => (
      h.ownership === 'club' ? h
        : {
          ...h,
          role: i === slot ? 'intensity' as const : 'threshold' as const,
          // ⚠️ THE GROUND ANSWER DIES WITH THE ROLE. `goal` is only meaningful on an intensity RUN;
          // leaving a stored `speed` on a slot that just became the threshold session would charge
          // the week a 48h clearance for a session that is no longer a sprint.
          ...(i === slot ? {} : { goal: undefined }),
        }
    )),
  }));

  /**
   * ⛔ `scheduleSelectedDay` STOOD HERE AND IS DELETED (2026-08-25). It read the open row's day
   * through `scheduleAsk`, so one picker could serve whichever question was open. Each picker owns
   * its own value now — `longRowDay` for the long day, `dayForSlot(i)` per hard session.
   */
  /**
   * ⛔⛔ `strengthRoles` / `strengthStacked` / `scheduleRoles` STOOD HERE AND ARE DELETED
   * (2026-08-25). They derived a letter per day — H / LR / LB / E / B / S plus a ×2 mark — out of
   * the built week, and the ONLY consumer was the coded chip strip on this step. The strip is gone,
   * so the derivation is gone with it: replace means delete.
   *
   * ⚠️ THE 2026-08-24 FINDING THAT CREATED THEM IS NOT REVERSED, IT IS ANSWERED ELSEWHERE. The
   * letters were moved onto the built week that day because the chips had been reading stale wizard
   * state — *"two answers to one question on one screen"*. That is still true and still fixed: the
   * ONE answer is now the worded week below, which reads the same `previewWeek` these did.
   *
   * ⚠️ `weekDayRoles` AND `DayRole` ARE STILL LIVE — the RACE path's week card (`weekRoles`) is the
   * accumulating-marks row those were written for, and this pass does not touch it.
   */

  const clubCollision = (() => {
    if (!isRaceGoal || state.runClubIntensity !== 'quality') return null;
    const club = state.qualityDays.run;
    const long = state.longRunDay;
    if (!club || !long) return null;
    const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const i = order.indexOf(club), j = order.indexOf(long);
    if (i < 0 || j < 0) return null;
    if (i === j) {
      return 'That is your long run day. The plan will keep the long run there and place its hard '
        + 'session elsewhere in the week.';
    }
    const gap = Math.min(Math.abs(i - j), order.length - Math.abs(i - j));
    if (gap > 1) return null;
    return 'That sits next to your long run — two hard days back to back, with about 24 hours '
      + 'between them instead of the 48 to 72 most plans leave. It is kept as you set it. Moving '
      + 'the long run, if it is the one that can move, opens the gap.';
  })();
  /**
   * Level card: a tier and a weekly mileage. ⚠️ THE LONGEST RUN IS NOT GATED (2026-08-06) — it is
   * no longer prefilled, and requiring a number we stopped supplying would turn "I don't have one"
   * into a wall. Absent is a legal answer: the arc opens at the row's first rung, which is where a
   * beginner starts anyway.
   */
  const levelCanContinue = !!state.fitness && Number(state.targetMiles) > 0;
  /**
   * Intent card. A time goal needs the time AND a pace to write it against — the calibration is
   * offered inline, so this is a completable state, not a wall.
   */
  /**
   * ⛔ THE TARGET TIME IS OPTIONAL (2026-08-05). Michael: plenty of people want to race hard
   * without a number in mind. It used to block Continue, which made "A time" mean "a time you have
   * already decided on" — a different and much narrower question.
   *
   * ⚠️ THE CALIBRATION IS STILL REQUIRED, and that asymmetry is deliberate: the time is what we
   * MEASURE you against, the paces are what the sessions are WRITTEN FROM. Only the second one is
   * load-bearing, and without it the server refuses the build.
   *
   * ⚠️ A HALF-TYPED TIME STILL BLOCKS — "3:" is not the same as leaving it blank. Empty is an
   * answer; unparseable is an unfinished one.
   */
  const targetTimeUsable = !state.targetTime.trim() || !!parseTargetTime(state.targetTime);
  const intentCanContinue = !!state.raceIntent
    && (state.raceIntent === 'complete' || (targetTimeUsable && !speedNeedsCalibration));

  /**
   * ⛔ THE TYPED MILEAGE, JUDGED AGAINST THE ENGINE'S OWN TABLES (`src/lib/run-volume-tables.ts`).
   *
   * ⚠️ CANONICALISE BEFORE VALIDATING. The tables are in MILES; the field is in the athlete's
   * display unit. Validating a kilometre figure against a mile table would tell a 32 km/wk runner
   * they are under a 27-mile floor — the same unit slip the bike card's "hours, not miles" note was
   * written to catch, in the other direction.
   */
  const typedMilesCanonical = typeof state.targetMiles === 'number' && state.targetMiles > 0
    ? (unit === 'km' ? state.targetMiles / 1.609344 : state.targetMiles)
    : null;
  const milesVerdict = isRaceGoal && state.fitness
    ? validateWeeklyMiles(RACE_DISTANCE_API[state.raceDistance] ?? '', state.fitness, typedMilesCanonical)
    : null;
  /** Floor + week-1 long run back in the athlete's unit, for the copy. Miles in, display unit out. */
  const toDisplayMi = (mi: number) => Math.round(unit === 'km' ? mi * 1.609344 : mi);
  const milesFloorDisplay = milesVerdict ? Math.ceil(unit === 'km' ? milesVerdict.requiredMi * 1.609344 : milesVerdict.requiredMi) : null;
  const longRunDisplay = milesVerdict ? toDisplayMi(milesVerdict.longRunWeek1Mi) : null;
  const typedLongRunCanonical = typeof state.longRunMiles === 'number' && state.longRunMiles > 0
    ? (unit === 'km' ? state.longRunMiles / 1.609344 : state.longRunMiles)
    : null;
  /** The soft signal — what they entered vs what the tier assumes. Null when they agree. */
  const mismatchNote = state.fitness
    ? tierMismatchNote(state.fitness as IntakeTier, {
        weeklyMi: typedMilesCanonical,
        longRunMi: typedLongRunCanonical,
      })
    : null;

  /**
   * ⛔ WHAT THE LONGEST RUN ACTUALLY REACHES ON THIS TIMELINE — stated before the athlete commits.
   *
   * The engine builds the long run backward from race day now (`buildLongRunArc`), so a block
   * shorter than the distance's arc climbs the same ladder and stops lower. That is the correct
   * plan; the failure was never saying so. A 9-week marathon that tops out at a 10-mile long run is
   * a fact the athlete can act on — race the half, or move the date — and finding it out in the
   * race is the one outcome the screen can prevent.
   *
   * ⚠️ SAME FUNCTION THE ENGINE RUNS. The number here is the number that will be prescribed, off the
   * same table, the same entry rung and the same taper — not a second estimate of it.
   *
   * ⚠️ IT IS NOT A WALL and it is not conditional on the mileage floor. The two say different
   * things: the floor is about the week the block opens on, this is about the run it ends on.
   */
  const longRunReach = isRaceGoal && state.fitness && planWeeks
    ? longRunCeiling(
        RACE_DISTANCE_API[state.raceDistance] ?? '', state.fitness, planWeeks, typedLongRunCanonical,
        { startDateISO: state.startDate, raceDateISO: state.raceDate },
      )
    : null;
  const typicalPeak = TYPICAL_PEAK_LONG_RUN_MI[RACE_DISTANCE_API[state.raceDistance] ?? ''] ?? null;
  /**
   * ⛔ AND THE HALF IS OFFERED ONLY WHEN IT IS TRUE. "The same weeks build a half" is a claim about
   * the athlete, not about the distance: on 10 weeks off a 6-mile long run the half arc comes up
   * short as well, and offering it then is the same silent over-promise one distance down.
   */
  const halfReach = longRunReach?.shortOfTable && state.fitness
    ? longRunCeiling('half', state.fitness, planWeeks ?? 0, typedLongRunCanonical,
        { startDateISO: state.startDate, raceDateISO: state.raceDate })
    : null;

  /**
   * ⛔ THE MILEAGE FLOOR IS ADVISORY. IT WARNS AND IT DOES NOT REFUSE. Michael's call, 2026-08-04:
   * *"warn, no wall."*
   *
   * ⛔ THIS LINE IS DELIBERATELY A CONSTANT, AND DELETING IT WOULD LOSE THE DECISION. It shipped
   * for one day as `!isRaceGoal || milesVerdict?.ok === true` — a wall — and the wall was WRONG
   * for the reason the file already documents in three other places: **§5.2b, breach states cost
   * and never refuses**, and *"None is a real answer with a stated cost."* A beginner running 20
   * miles a week is making a decision about their own body with the consequence in front of them;
   * the app's job is to put the consequence there, not to take the decision.
   *
   * ⚠️ THE ARGUMENT FOR THE WALL, WRITTEN DOWN SO IT IS NOT RE-MADE FROM SCRATCH: the cost of
   * being wrong here is an injury rather than a worse plan, and the engine clamps the number
   * upward anyway (`resolveEffectiveStartVolume`), so an athlete who proceeds under the floor gets
   * a week bigger than the one they typed. **That second half is why the WARNING has to name the
   * clamp** — see the `engine_clamp` branch of the copy. It is not why they should be stopped.
   *
   * ⚠️ THE ONE HARD REFUSAL ON THIS PATH IS THE TIMELINE, NOT THE VOLUME — `raceCanContinue`
   * above (a race in the past cannot be planned) and the server's weeks-to-race floor. Those are a
   * different kind of claim: a date that does not work is arithmetic, a body that is not ready is
   * a judgement about a person.
   */
  const runCanContinue = true;
  const posturePresent = (d: Discipline) => state.posture[d] != null && state.posture[d] !== 'out';

  /**
   * ⛔⛔ THIS BLOCK LIVED 500 LINES HIGHER AND WHITE-SCREENED THE APP (2026-08-18). It is an IIFE —
   * it runs the moment the component body reaches it — and it calls `posturePresent`, which is
   * declared just above. From up there that is a temporal dead zone: `Uncaught ReferenceError:
   * Cannot access 'Un' before initialization`, and the whole wizard renders black.
   *
   * ⚠️ `tsc` AND THE BUILD BOTH PASSED. TypeScript flags a direct use-before-declaration (TS2448)
   * but not one inside a function body, because a function COULD be called later — and this one is
   * called immediately. ⛔ So an IIFE reading other component-scope consts must sit below every one
   * of them, and a green build is not evidence that it does.
   */
  /**
   * ⛔ THE ACCESSORY BAND, COMPUTED THE WAY THE ENGINE COMPUTES IT — OR THE CARD SELLS A BLOCK THE
   * PLAN DOES NOT BUILD.
   *
   * ⚠️ THE FORMULA IS COPIED FROM `strength-primary-plan.ts:3898-3917` DELIBERATELY, not
   * approximated: run hours = miles x easy pace / 60, ride hours = the typed figure, absent stays
   * ABSENT rather than becoming zero (§0h — an unknown week is not licence to hand out the
   * ceiling). `resolveEnduranceTier` is the shared function, so the tier decision itself has exactly
   * one owner; what is duplicated here is only the two inputs. ⛔ If that derivation moves, this
   * moves with it.
   */
  const accessoryBands = (() => {
    const miles = typeof state.targetMiles === 'number' && state.targetMiles > 0
      ? (unit === 'km' ? state.targetMiles / 1.609344 : state.targetMiles)
      : null;
    /**
     * ⚠️ `paceMinPerMile` IS THE SAME NUMBER THE ENGINE RECEIVES — `assemblePayload` sends it as
     * `easyPaceMinPerMile`. That includes its 10:00/mi fallback for an athlete with no learned pace,
     * so the card and the plan agree even in the unmeasured case. ⛔ If the payload ever sends a
     * different figure, this line is the one that starts lying.
     */
    const runHours = miles != null && paceMinPerMile > 0 ? (miles * paceMinPerMile) / 60 : null;
    const rideHours = Number(state.rideHours) > 0 ? Number(state.rideHours) : null;
    const declared = posturePresent('run') || posturePresent('bike');
    const totalHours = !declared ? 0
      : (runHours == null && rideHours == null ? null : (runHours ?? 0) + (rideHours ?? 0));
    return {
      now: TIER_BAND[resolveEnduranceTier({ hardDays: hardDayCount, totalHours })],
      // ⚠️ THE BASELINE IS THE SAME WEEK WITH NO HARD DAYS — which is what makes the line about the
      // athlete's CHOICE rather than about their volume. A high-volume athlete already in survival
      // on hours alone sees nothing, because their hard day cost them nothing further.
      none: TIER_BAND[resolveEnduranceTier({ hardDays: 0, totalHours })],
    };
  })();

  // "How much" (volume) gate — mirror the schedule gate's "require only what the card renders" rule:
  // the running field shows on posturePresent('run'), the riding field on bike === 'maintain'. Require
  // a number for each field that is actually shown; a strength-only athlete (neither shown) is not blocked.
  /**
   * ⛔ THE COUNTS GATE HERE NOW, BECAUSE THE COUNTS ARE HERE NOW (2026-08-18). They moved off the
   * scheduler onto this card; leaving their requirement in `scheduleBlockedReasons` would block
   * Continue on a screen that no longer shows the control, naming a chip the athlete cannot see.
   * ⚠️ The shared gate is UNCHANGED and still asserts the same rule — the caller below simply drops
   * the two count sentences from what the SCHEDULE step displays, so one rule keeps one owner.
   */
  const volumeCanContinue =
    // ⚠️ `>= 1`, NOT `>= 2` — one run a week is an answer now, and a gate demanding two
    // would refuse the option the picker offers.
    (!posturePresent('run') || (Number(state.targetMiles) > 0 && state.runDays >= 1)) &&
    (state.posture?.bike !== 'maintain' || (Number(state.rideHours) > 0 && state.rideDays >= 1));
  // Reason shown at the Continue key when blocked — fact-statement, matching the schedule gate's
  // "Runs a week has no number yet" voice (not an imperative).
  const volumeMissing: string[] = [];
  if (posturePresent('run') && !(Number(state.targetMiles) > 0)) volumeMissing.push('running');
  if (state.posture?.bike === 'maintain' && !(Number(state.rideHours) > 0)) volumeMissing.push('riding');
  // ⚠️ THE COUNT IS ITS OWN SENTENCE, in the scheduler's exact words — the athlete may have met one
  // half of the question and not the other, and "Weekly running has no number yet" would be false
  // when the miles are typed and the count is not.
  const volumeCountMissing: string[] = [];
  if (posturePresent('run') && Number(state.targetMiles) > 0 && state.runDays < 1) {
    volumeCountMissing.push('Runs a week has no number yet.');
  }
  if (state.posture?.bike === 'maintain' && Number(state.rideHours) > 0 && state.rideDays < 1) {
    volumeCountMissing.push('Rides a week has no number yet.');
  }
  const volumeBlockedReason =
    volumeMissing.length === 0
      ? (volumeCountMissing[0] ?? undefined)
      : volumeMissing.length === 1 ? `Weekly ${volumeMissing[0]} has no number yet.`
      : 'Weekly running and riding have no number yet.';

  // A blocker reason that NAMES a discipline gets that discipline's colour (run gold / ride green) —
  // the same wayfinding as the rows. Without this the line renders in the wizard accent, which is the
  // FOCUS sport's colour (strength orange), so "Runs a week has no number yet" read as strength.
  // Mixed / hard-day / non-discipline reasons fall through to the neutral accent.
  const reasonSportColor = (reason?: string | null): string | undefined =>
    !reason ? undefined
    : /^(Runs|The long run|Weekly running)/.test(reason) ? `rgb(${getDisciplineColorRgb('run')})`
    : /^(Rides|The long ride|Weekly riding)/.test(reason) ? `rgb(${getDisciplineColorRgb('bike')})`
    : undefined;
  const tintedReason = (reason?: string | null) =>
    reason ? <span style={{ color: reasonSportColor(reason) }}>{reason}</span> : undefined;

  /**
   * ⛔ THE SCHEDULER GATE (2026-07-29). Michael: *"all that needs to be gated."*
   *
   * Nothing on this card is prefilled any more, so Continue had to stop being unconditional — an
   * ungated card plus empty controls means an athlete walks past having answered nothing, and the
   * engine builds twelve weeks on defaults they never saw. The prefill used to hide that; removing it
   * exposed it.
   *
   * ⛔ AND IT GATES THE COUNTS ONLY. A first pass also required a long day per kept discipline;
   * Michael struck it — *"technically they dont need long days or hard days."* He is right, and the
   * engine agrees: `week-solver.ts` takes long runs, long rides and hard days as OPTIONAL anchors,
   * and a week with none of them solves fine. Requiring a pin the solver does not require would
   * invent a wall — the §5.2b failure in reverse, refusing a week that fits.
   *
   * ⚠️ SO WHAT IS LEFT IS THE HALF-ANSWER, which is the only genuinely incoherent state:
   * - A kept discipline with no session count. Nothing downstream can read "runs, an unstated
   *   number of times".
   * - A hard-day discipline toggled on with no day. Not "a hard day is required" — declining one
   *   entirely stays legal (`ae7e061c`: None is a real answer with a stated cost). It is that
   *   starting the answer and not finishing it cannot be forwarded.
   * - ⛔ AND THE LONG DAY COMES BACK CONDITIONALLY. Michael: *"unless their hour and mile count
   *   calls for them."* The engine's own split decides this, not a preference:
   *   `distributeRunMiles` weights the week 1.4/1.0 at two runs and 1.5/1.0/0.85 at three, so the
   *   moment a volume is typed across two or more sessions, ONE OF THEM IS THE LONG ONE whether the
   *   athlete named it or not. Leaving it blank then does not mean "no long run" — it means the
   *   engine picks the day for the longest session of their week. At one session, or with no volume
   *   typed, there is no split and nothing to ask about.
   *
   * ⚠️ THE COUNT AND THE VOLUME ARE BOTH REQUIRED FOR THAT TEST, and only the count is asked on
   * this card — the volume comes from the discipline screens before it. So an athlete who skipped
   * those is not blocked here for a number they were never shown.
   */
  /**
   * ⛔ THE GATE MOVED TO `src/lib/schedule-gate.ts` (2026-08-10) — REPLACE MEANS DELETE.
   *
   * It was an inline expression here, and it shipped a state where the athlete looked at a fully
   * built six-day week and a dead Continue button with nothing saying why. Two faults, both now
   * pinned by fixtures that could not exist while the rule lived in TSX:
   *   1. it required `runDays`/`rideDays` > 0, and 0 is the LEGAL UNSET — `assemblePayload` omits
   *      those fields unless the athlete picks one, so the payload called them optional while the
   *      gate called them required. That is why the preview built a perfect week and the button
   *      refused.
   *   2. it asked about disciplines by POSTURE while the rows render on a narrower test, so a
   *      question the card never showed could still block it.
   *
   * ⚠️ THE CALLER NOW PASSES WHAT IT RENDERS — `scheduleRunShown` / `scheduleRideShown` are the same
   * booleans the rows are built from, so an off-screen question cannot block the screen. And the
   * gate returns a SENTENCE, from which `canContinue` is derived, so the button and its explanation
   * are one decision.
   */
  const scheduleGateInput = {
    runShown: scheduleRunShown,
    rideShown: scheduleRideShown,
    longRunDay: state.longRunDay,
    longRideDay: state.longRideDay,
    // ⛔ Strength path: the counts are the SLOTS' — the gate must never demand a number the
    // athlete was never asked (the count rows are hidden there). Read off state directly: the
    // component-scope `derivedCounts` declares later in this function body.
    runDays: isStrengthFocus
      ? SLOT_KEYS.filter((k) => (state.slotSports ?? emptySlotSports())[k] === 'run').length
      : state.runDays,
    rideDays: isStrengthFocus
      ? SLOT_KEYS.filter((k) => (state.slotSports ?? emptySlotSports())[k] === 'ride').length
      : state.rideDays,
    targetMiles: state.targetMiles,
    rideHours: state.rideHours,
    qualityDays: state.qualityDays,
    // ⛔ NO LONGER SENT (§1i placement model, slice 8). A prescribed hard day with no day is not a
    // half-answer any more — it is the engine being asked to place it — so the "has a discipline but
    // no day" block is DELETED rather than re-worded. A club day without a day is simply not
    // forwarded, which is a silent drop of an unanswered optional question, not a blocked flow.
  };
  const scheduleBlockedReason = scheduleGateReason(scheduleGateInput);
  const scheduleCanContinue = scheduleGateReasons(scheduleGateInput)
    .filter((r) => !/^(Runs|Rides) a week has no number yet\.$/.test(r)).length === 0;
  // Surface EVERY missing required field at once (runs AND rides, not just the first), each in its
  // own discipline colour — so the athlete sees the whole ask, not one-then-the-next.
  // ⛔ THE COUNT SENTENCES BELONG TO THE VOLUME STEP NOW. The shared gate still produces them —
  // one rule, one owner — and this step simply does not speak for a control it no longer renders.
  const scheduleAllReasons = scheduleGateReasons(scheduleGateInput)
    .filter((r) => !/^(Runs|Rides) a week has no number yet\.$/.test(r));
  const scheduleReasonNode = scheduleAllReasons.length === 0
    ? undefined
    : scheduleAllReasons.length === 1
      ? tintedReason(scheduleAllReasons[0])
      : (
        <span className="flex flex-col gap-0.5">
          {scheduleAllReasons.map((r, idx) => (
            <span key={idx} style={{ color: reasonSportColor(r) }}>{r}</span>
          ))}
        </span>
      );
  // ⛔ ONE HARD AEROBIC DAY — D-327, enforced by the SHAPE of the "Hard day" row (one slot).
  //
  // History, so nobody re-derives it: this was TWO hard days, priced-not-refused, with a one-shot
  // "Mulholland" dialog on the transition to the second. `DOCTRINE-aerobic-maintenance.md` §6 replaced
  // that with one — bike if they have one, hill repeats if not; "both" means a choice, not two. The
  // dialog and the two-day ceiling line were DELETED at Michael's call, not left dead: the state they
  // fired on cannot occur, and a rule nobody can reach is one somebody tunes later assuming it fires.
  //
  const setQualityDay = (d: 'run' | 'bike', day: DayName | '') => setState((s) => {
    const next = { ...s.qualityDays };
    if (day) next[d] = day; else delete next[d];
    return { ...s, qualityDays: next };
  });

  // One place builds the payload, so the week previewed and the week built cannot disagree.
  /**
   * ⛔ THE FOUR SLOTS, RESOLVED. Untouched by the athlete means the pre-fill: strength leading with a
   * bike kept puts both hard slots on the bike (p280 — no impact, so the intensity does not tax the
   * lifts); with no bike every slot is a run and the screen is a read-out.
   */
  /**
   * ⛔ EVERY ROW STARTS NEUTRAL (Michael, 2026-08-24). No sport, no colour, and Continue disabled
   * until all four are answered — see `allSlotsChosen`. ⚠️ The pre-fill this replaced put both hard
   * slots on the bike before the athlete had said anything.
   */
  const slotSportsNow: SlotSelection = state.slotSports ?? emptySlotSports();

  /**
   * ⛔ THE ATHLETE-TYPE ANSWER PRE-SHAPES THE SLOT SCREEN (Michael, 2026-08-24). "Run only" never
   * renders Ride chips; with one sport allowed every slot is auto-assigned to it — the choice
   * screen only exists for the mixed athlete. Swim is never a slot sport (add-on ruling).
   */
  const allowedSlotSports: SlotSport[] = [
    ...((state.posture.run ?? 'out') === 'maintain' ? (['run'] as const) : []),
    ...((state.posture.bike ?? 'out') === 'maintain' ? (['ride'] as const) : []),
  ];
  /**
   * ⛔ THE TIER LINE (item 8, 2026-08-24): when logged history unlocks the +1-2 easy-run tier, the
   * volume step SAYS so — a fact, not a question. Same functions the server's gate runs, fed the
   * workouts already in context, so the line and the built tier cannot disagree.
   */
  const { workouts: ctxWorkouts } = useAppContext();
  const tierLine = useMemo(() => {
    const vol = demonstratedRunVolume((ctxWorkouts ?? []) as never);
    const extra = advancedTierSessions(vol.weeklyMiles);
    if (extra <= 0) return null;
    return `Your history supports a ${4 + extra}-session endurance week — ${extra} extra easy `
      + `run${extra === 1 ? '' : 's'} (${vol.source}).`;
  }, [ctxWorkouts]);

  /** ⛔ ONE LONG SESSION, ONE PIN (B1). When the long slot is a ride, a stale long-RUN pin is the
   *  phantom pref that reached a built goal ("Long Run: sunday" on a week with no long run). */
  useEffect(() => {
    if (!isStrengthFocus) return;
    if (longSlotSport === 'ride' && state.longRunDay) setState((st) => ({ ...st, longRunDay: '' }));
    if (longSlotSport === 'run' && state.longRideDay) setState((st) => ({ ...st, longRideDay: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStrengthFocus, longSlotSport, state.longRunDay, state.longRideDay]);

  useEffect(() => {
    if (currentStep !== 'endurance' || allowedSlotSports.length !== 1) return;
    const only = allowedSlotSports[0];
    const cur = state.slotSports ?? emptySlotSports();
    if (Object.values(cur).every((s) => s === only)) return;
    setState((st) => {
      const slots = { hard1: only, hard2: only, easy: only, long: only } as SlotSelection;
      return { ...st, slotSports: slots, hardDays: syncHardDays(st, slots) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, allowedSlotSports.join(','), state.slotSports]);

  /**
   * ⛔ THE HARD SLOT'S SESSION CHOICES, RESTORED (Michael's screenshot review, 2026-08-24).
   *
   * The endurance screen shipped with the sport toggle and nothing under it, so picking Ride on a
   * hard slot revealed no session — the choices the old "High intensity days" card carried had no
   * control on the new one. ⛔ **THE PLUMBING WAS NEVER THE PROBLEM.** `state.hardDays` already
   * holds `{discipline, role, goal, ownership}` per slot and `create-goal` already forwards it; what
   * was missing was the buttons. These write the SAME fields the old card wrote.
   *
   * ⚠️ HARD 1 IS `hardDays[0]`, HARD 2 IS `hardDays[1]` — positional, because the frame's two hard
   * slots are positional and the composer caps at two and dedupes by day.
   */
  const HARD_SLOT_INDEX: Record<'hard1' | 'hard2', number> = { hard1: 0, hard2: 1 };

  /**
   * ⛔ THE ENTRY FOR A SLOT, BY KEY — NOT BY POSITION (2026-08-25). With hard sessions removable, an
   * athlete who deletes the first one leaves `hardDays[0]` holding the SECOND slot's answer, and a
   * positional read hands the wrong session's day and archetype to the row. ⚠️ Falls back to the
   * positional read for drafts written before `slot` existed, which always carried both entries.
   */
  const hardEntry = (st: NonRaceState, k: 'hard1' | 'hard2') =>
    st.hardDays.find((h) => h.slot === k)
    ?? (st.hardDays.some((h) => h.slot) ? undefined : st.hardDays[HARD_SLOT_INDEX[k]]);


  /**
   * ⛔ THE SLOT'S SESSION, WHICH IS THE FRAME'S FACT AND NOT A DEFAULT (Michael's A4 ruling,
   * 2026-08-24). Slot one is the top-end session and slot two the sustained one, on either sport —
   * `p246`'s own two hard days in order. ⚠️ THE WORD "DEFAULT" IS WRONG HERE NOW: there is nothing to
   * default away from, because the card that offered the alternative has been removed.
   */
  const hardDefaultsFor = (sport: SlotSport, slot: 'hard1' | 'hard2' = 'hard1') => ({
    discipline: (sport === 'ride' ? 'bike' : 'run') as 'run' | 'bike',
    // ⛔ ONE OWNER FOR THE DEFAULT — `hardSlotDefault` in `src/lib/hard-slot-choices.ts`, which is
    // also what the card highlights. Two statements of "a ride defaults to threshold" is how the
    // pre-selected chip and the stored answer start disagreeing.
    ...hardSlotDefault(sport, slot),
  });

  /**
   * Keep `hardDays` in step with the two hard slots.
   *
   * ⛔⛔ IT NOW RE-STAMPS THE FRAME'S SESSION EVERY TIME, NOT ONLY ON A SPORT CHANGE (A4,
   * 2026-08-24). It used to return `prev` untouched when the discipline matched, which was right
   * while the athlete could pick the session: their answer had to survive. **With the picker gone
   * the frame's fact is the only legal value**, and returning `prev` would leave a stale `role` or a
   * leftover `goal` — from an earlier draft, or from a slot that was never answered at all — sitting
   * in `hardDays` and travelling to the composer as an allocation nobody made.
   *
   * ⚠️ THE DAY AND THE CLUB ANSWER STILL SURVIVE. Those two are genuinely the athlete's; the session
   * identity is not.
   */
  const syncHardDays = (
    st: NonRaceState,
    slots: SlotSelection,
  ): NonRaceState['hardDays'] => (['hard1', 'hard2'] as const).map((k) => {
    const i = HARD_SLOT_INDEX[k];
    const prev = st.hardDays[i];
    // ⚠️ AN UNANSWERED HARD SLOT KEEPS WHATEVER WAS THERE. Nothing reaches the engine until Continue
    // opens, and Continue is gated on every row having a sport.
    const sport = slots[k];
    // ⛔⛔ AN UNADDED HARD SLOT IS NULL NOW, NOT "not yet answered" (Michael, 2026-08-25: hard
    // sessions are opt-in, default zero). It used to return `prev` — right while every slot was a
    // session being configured and the athlete's draft had to survive a sport change. **With the
    // slot removable, returning `prev` resurrects the session they just deleted**: the day, the
    // club answer and the archetype all travel on to the composer as an allocation nobody made.
    if (!sport) return null;
    const want = hardDefaultsFor(sport, k);
    return {
      ...(prev ?? {}),
      slot: k,
      discipline: want.discipline,
      day: (prev?.day ?? '') as DayName | '',
      ownership: prev?.ownership ?? 'prescribed',
      role: want.role,
      // ⚠️ `goal` IS WRITTEN EVERY TIME, INCLUDING AS `undefined`. A threshold slot carrying a
      // leftover `speed` charges the week a 48-hour clearance for a session that is not a sprint.
      goal: want.goal,
    };
    // ⛔ NULLS ARE DROPPED, NOT KEPT AS PLACEHOLDERS. `hardDays` is now "the hard sessions this
    // athlete added" — its LENGTH is what the tier reads and what `create-goal` forwards, so an
    // empty entry standing in for a removed session would charge the week for it.
  }).filter((h): h is NonNullable<typeof h> => h != null);

  /**
   * ⛔⛔ `runDays` / `rideDays` ARE DERIVED FROM THE SLOTS, NOT ASKED (2026-08-24). The program owns
   * the count (8-21 §3c), so the only honest reading of "how many runs" is HOW MANY SLOTS ARE RUNS.
   *
   * ⚠️ THIS IS WHY THE COUNT PICKERS COULD BE DELETED RATHER THAN HIDDEN. Two controls writing one
   * pair of numbers is what let the old screens contradict each other — an athlete could tap four
   * rides on "How much" and have the next card quietly rewrite it to three (2026-08-21). One source
   * cannot disagree with itself.
   */
  const derivedCounts = (() => {
    const runs = SLOT_KEYS.filter((k) => slotSportsNow[k] === 'run').length;
    return { runs, rides: SLOT_KEYS.length - runs };
  })();

  const payloadNow = () => {
    // canonicalize the typed mileage (display unit → miles) before it leaves the client
    const canonMiles = typeof state.targetMiles === 'number' && state.targetMiles > 0
      ? (unit === 'km' ? Math.round(state.targetMiles / 1.609344) : state.targetMiles)
      : undefined;
    const canonLongRun = typeof state.longRunMiles === 'number' && state.longRunMiles > 0
      ? (unit === 'km' ? state.longRunMiles / 1.609344 : state.longRunMiles)
      : undefined;
    // Feet on screen when imperial, metres in the database. One unit stored, always.
    const canonElevM = typeof state.raceElevation === 'number' && state.raceElevation > 0
      ? (unit === 'km' ? state.raceElevation : state.raceElevation * 0.3048)
      : undefined;
    return assemblePayload(
      state, equipmentTier, canonMiles, canonLongRun, paceMinPerMile, canonElevM, unavailableDays,
    );
  };

  const handleConfirm = () => {
    if (!state.goal) return;
    // ⛔ NO COMPLETION CARD ON THE INTAKE (2026-08-10). `complete()` lands on Focus either way; this
    // says land on the PLAN rather than on a banner announcing it. The athlete tapped "Build plan"
    // and the block renders under CURRENT on that same screen — an acknowledgement in between
    // answers a question nobody asked, and on a short phone it pushed the plan itself down into the
    // region that collapses. The Arc season wizard keeps its banner; see the note on `complete()`.
    void complete(payloadNow(), { announcePlanReady: false });
  };

  /**
   * ⛔ SHOW THE WEEK BEFORE IT IS ACCEPTED, AND SHOW WHAT IT COULD NOT HONOUR.
   *
   * The athlete answers three lifting days (fixed by the protocol), three run days and two ride days
   * and never sees that it adds to more days than the week holds — because nobody adds it up in front of
   * them. Michael: *"we still don't see a general week before it's accepted."*
   *
   * ⚠️ `placement_compromises` is the part that matters. `place-week` has always named every
   * clearance it could not honour and nothing rendered them, so the week arrived silently short a
   * ride and silently short a rest day. Those sentences are the honest half of the preview.
   */
  /**
   * ⛔ THE PREVIEW IS BACK ON FOR RACE GOALS (2026-08-05) — THE REASON IT WAS OFF IS FIXED.
   *
   * It was disabled because `preview()` calls `create-goal-and-materialize-plan` with
   * `mode: 'create'` + `preview: true`, and the EVENT branch had a second, unguarded goal insert
   * (`create-goal…:3307`). Previewing a race therefore created a live goal, built a plan, activated
   * it, and called `retireCompetingActivePlans` — ending whatever the athlete was training on.
   *
   * That is fixed and deployed: the insert is guarded, the generator gets its no-persist flag, and
   * the handler returns before anything links, activates or retires. So the client guard is dead
   * weight, and keeping it would mean an athlete building the biggest block in the app is the one
   * person who never sees the week before committing.
   *
   * ⚠️ LEFT AS A NAMED CONSTANT rather than deleted, so the next person to read `runPreview` finds
   * the history instead of wondering whether previewing writes.
   */
  const previewSupported = true;

  const runPreview = async () => {
    if (!state.goal || previewing || !previewSupported) return;
    setPreviewing(true);
    const plan = (await preview(payloadNow())) as PreviewPlan | null;
    const wk1 = plan?.sessions_by_week?.['1'];
    // ⛔ A FAILED PREVIEW IS NOT AN EMPTY WEEK. This used to coerce anything unusable to `[]`, which
    // the card below then rendered as "0 training days, 7 rest · about 0h a week" — a confident,
    // completely false answer, presented in the same shape as a real one. §0h: an absence is not a
    // result, and the athlete cannot tell the difference.
    setPreviewFailed(!Array.isArray(wk1) || wk1.length === 0);
    setPreviewWeek(Array.isArray(wk1) ? wk1 : []);
    /**
     * ⛔ THE OFFER, WHEN THERE IS ONE. Only a Standing Plan preview carries it; every other block
     * leaves it null and the panel renders nothing, which is the honest answer for a plan with no
     * test week to skip.
     */
    const skip = (plan as { _skip_test_week?: { available?: boolean; summary?: string; window_days?: number } } | null)
      ?._skip_test_week;
    setPreviewSkip(
      skip && skip.available === true
        ? { available: true, summary: String(skip.summary ?? ''), window_days: Number(skip.window_days) || 42 }
        : null,
    );
    setPreviewNotes(
      Array.isArray(plan?.placement_compromises)
        // Tolerate the old flat-string shape while any cached plan still carries it.
        ? plan!.placement_compromises!.map((c: any) => (typeof c === 'string' ? c : c?.text)).filter(Boolean)
        : [],
    );
    setPreviewing(false);
  };

  /**
   * ⛔ THE WEEK, LIVE, WHILE THEY PICK. Restored 2026-07-29 — it was deleted by accident when the
   * budget card came out, and the scheduler then rendered an empty space where the answer goes with
   * nothing saying why.
   *
   * ⚠️ DEBOUNCED, AND ONLY ON THIS STEP. `preview()` composes all twelve weeks server-side; firing
   * per tap would queue a round trip behind every button.
   *
   * ⚠️ IT PLACES NOTHING CLIENT-SIDE. The grid renders what the solver returned.
   */
  /**
   * ⛔ THE HARD DAY ARRIVES ALREADY THERE (§1i placement model, slice 8). A Strong Focus athlete
   * reaching the scheduler finds one prescribed hard day proposed, not an empty optional row they
   * have to discover and assemble. Same pattern as strength: engine-designed default, athlete
   * adjusts after.
   *
   * ⚠️ ONE, NOT TWO. §7's assignment gives a single hard day the VO2 session, which is the quality
   * ordinary easy volume cannot hold; the second is an ADDITION the athlete asks for, and it brings
   * the threshold day with it. Seeding two would be the app deciding they want more hard training.
   *
   * ⚠️ SEEDED ONCE, AND ONLY WHEN EMPTY. `hardDaysSeeded` latches, so an athlete who removes the
   * default does not get it handed back on the next render — "one or none" has to stay exactly as
   * reachable as it is today, and a default that reappears is not a default, it is a refusal.
   * ⚠️ AND THE §7 GATE COMPOSES: a discipline with no number offers no proposal at all.
   */
  const hardDaysSeeded = React.useRef(false);
  React.useEffect(() => {
    if (currentStep !== 'schedule' || hardDaysSeeded.current) return;
    if (state.hardDays.length > 0) { hardDaysSeeded.current = true; return; }
    const d = (['run', 'bike'] as const).find((x) => posturePresent(x) && hardDayAvailable[x]);
    if (!d) return;
    hardDaysSeeded.current = true;
    setState((st) => (st.hardDays.length > 0 ? st : {
      ...st,
      hardDays: [{ discipline: d, day: '' as const, ownership: 'prescribed' as const }],
    }));
  }, [currentStep, state.hardDays.length, hardDayAvailable]);

  React.useEffect(() => {
    if (currentStep !== 'schedule') return;
    if (!state.longRunDay && !state.longRideDay) return;   // nothing to solve around yet
    const t = setTimeout(() => { void runPreview(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, state.longRunDay, state.longRideDay, state.runDays, state.rideDays,
      state.qualityDays, state.hardDays, state.targetMiles, state.rideHours]);

  /**
   * ⛔ THE CONFIRM SCREEN SHOWS THE WEEK, NOT A BUTTON THAT OFFERS ONE. Michael, 2026-07-29:
   * *"just the final week and the date you start."* The posture card that used to sit at the top of
   * this step said Swim/Bike/Run/Strength in words; the week says the same thing in days, and says
   * it concretely. Asking someone to press "show me a week first" on the last screen before Build
   * is asking them to opt in to the only thing on the screen worth reading.
   *
   * ⚠️ FIRES ONLY WHEN NOTHING IS THERE. Paths with a scheduler step arrive with `previewWeek`
   * already solved and this is a no-op; paths without one (no strength focus) get it built here.
   * It also does not retry a FAILED preview — a loop against a failing server is worse than the
   * panel that explains the failure.
   */
  React.useEffect(() => {
    if (currentStep !== 'confirm') return;
    if (!previewSupported) return;   // race goals: previewing would WRITE — see `previewSupported`
    if (previewWeek !== null || previewing || previewFailed) return;
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // ⛔ A THIRD STATE (2026-08-05, SPEC §B): `notYet`. The front door shows disciplines that are not
  // built, and they have to READ as not built — dimmed, no accent, and (at the call site) no click
  // handler. The honesty rule is the whole point: a card that says it isn't ready is fine; a card
  // that opens a half-built flow is the thing the July rule was written against.
  //
  // ⚠️ NO "Soon" TAG (Michael's call). The dimming carries it; a badge promises a date we don't have.
  // ⚠️ Sized up a step 2026-08-05 — Michael read the first build on a phone: *"make the 3 cards
  // bigger easier to read."* `px-4 py-3` → `p-5`, labels to `text-base`, blurbs to `text-sm`.
  const optBtn = (active: boolean, notYet = false) =>
    `w-full text-left p-5 rounded-xl border text-white ${
      notYet
        ? 'border-white/8 bg-white/[0.015] text-white/40 cursor-default'
        : active ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)]' : 'border-white/12 bg-white/[0.03]'
    }`;
  // Build is a CREATE action, not a pick — dashed edge, set apart from the two that route to a plan.
  const createBtn = (notYet: boolean) =>
    `w-full text-left p-5 rounded-xl border border-dashed ${
      notYet ? 'border-white/12 bg-transparent text-white/40 cursor-default' : 'border-white/25 bg-white/[0.02] text-white'
    }`;

  // The eye — the mark of the Focus section, beside its screen titles. Same CSS drawing as the tab
  // bar's (`.eye-mark`), one size up. Decorative: `aria-hidden`, the heading text carries the name.
  const eyeTitle = (text: string) => (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className="eye-mark eye-heading shrink-0" />
      {text}
    </span>
  );

  // Wizard accent: chosen discipline, or the goal's own colour when no single discipline leads —
  // run/gold for a marathon race, strength/amber for a Strong Focus block. Without the strength
  // fallback the whole get_stronger flow rendered on the off-white universal accent (state.discipline
  // is never set to 'strength' on this path), so the amber chrome marathon gets never engaged. Drives
  // the CTA, progress bar and every selection state.
  const wizAccent: Discipline | undefined =
    state.discipline ?? (state.goal === 'marathon' ? 'run' : state.goal === 'get_stronger' ? 'strength' : undefined);

  return (
    // h-full (not 100dvh) so it fills GoalsScreen's content area and keeps the app nav/banner when
    // embedded; standalone route still fills its container. `wizard-galaxy` carries the deep-space look;
    // `--wiz-accent-rgb` tints StepLayout's chrome and every selection-state inside.
    <div
      className="wizard-galaxy h-full text-white flex flex-col"
      style={wizAccent ? ({ ['--wiz-accent-rgb']: getDisciplineColorRgb(wizAccent) } as React.CSSProperties) : undefined}
    >
      {/* ── THE FRONT DOOR ───────────────────────────────────────────────────────────────────────
          Three cards, and it REPLACES "What's the goal?" (SPEC §B, 2026-08-05). Train drills down;
          Race and Build route straight in.

          ⛔ THE SUB-PICKER IS GONE, NOT MOVED. The old screen carried a "Which discipline?" list for
          `build_endurance` / `build_speed` / `starting_over` — goals that were never offered. The
          Train card NAMES the discipline, so the question it asked cannot arise here; when Run and
          Ride land, the card they are tapped from is the answer. `GOALS_NEEDING_DISCIPLINE` still
          governs any goal reached another way — this is the picker leaving, not the rule. */}
      {currentStep === 'goal' && (
        <StepLayout
          step={stepNo('goal')} totalSteps={steps.length} title={eyeTitle('Choose your focus')}
          subtitle="Change it whenever you want."
          onBack={back} onContinue={next} canContinue={goalCanContinue}
          hideContinue
          // ⛔ The cards lead to flows of different lengths, so there is no honest count to print
          // here until one is tapped. See `hideProgress` in StepLayout.
          hideProgress
        >
          <div className="space-y-2">
            {ENTRY_ORDER.map((e) => {
              const live = ENTRY_LIVE[e];
              const isCreate = e === 'build';
              return (
                <button
                  key={e} type="button"
                  className={isCreate ? createBtn(!live) : optBtn(state.entry === e, !live)}
                  // ⛔ NOT-YET CARDS DO NOT NAVIGATE. `disabled` (not just a missing handler) so the
                  // card is inert to keyboard and screen readers too — "it isn't ready" has to be
                  // true for everyone, not only for a mouse.
                  disabled={!live}
                  // Picking IS the answer — no second tap to confirm. Train opens the drill-down;
                  // Race is a goal in its own right and seeds it here.
                  onClick={() => {
                    if (!live) return;
                    if (e === 'race') { setState((s) => ({ ...s, entry: e })); reseed('marathon', undefined); }
                    else setState((s) => ({ ...s, entry: e, goal: null }));
                    next();
                  }}
                >
                  <span className="flex items-start gap-3.5">
                    {React.createElement(ENTRY_COPY[e].Icon, {
                      className: 'h-6 w-6 shrink-0 mt-0.5',
                      style: {
                        color: ENTRY_COPY[e].color ?? (live ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'),
                        opacity: ENTRY_COPY[e].color && !live ? 0.4 : 1,
                      },
                    })}
                    <span className="min-w-0 block">
                      <span className="block text-base">{ENTRY_COPY[e].label}</span>
                      <span className={`block text-sm mt-1 leading-relaxed ${live ? 'text-white/70' : 'text-white/40'}`}>
                        {ENTRY_COPY[e].blurb}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {/* Strength is not a mode you switch into — it is in every plan, and only the dose changes.
              Saying so here is what makes the Train list read as a focus, not as a menu of apps. */}
          <p className="text-white/75 text-sm mt-5 leading-relaxed">
            Every plan has a strength component built on the same 5/3/1 principle. The load adjusts to
            the focus — a race build holds it at maintenance, a strength block develops it.
          </p>
        </StepLayout>
      )}

      {/* ── THE TRAIN DRILL-DOWN ─────────────────────────────────────────────────────────────────
          Run / Ride / Strength / Athletic. Only Strength opens anything today; the other three are
          dimmed and inert. This is the screen the July placeholder rule was rewritten for — see the
          comment above `GOAL_ORDER`. */}
      {currentStep === 'train' && (
        <StepLayout
          step={stepNo('train')} totalSteps={steps.length} title={eyeTitle('Train')}
          subtitle="Pick an area of focus."
          onBack={back} onContinue={next} canContinue={state.goal != null}
          hideContinue hideProgress
        >
          <div className="space-y-2">
            {TRAIN_ORDER.map((t) => {
              const goal = TRAIN_GOAL[t];
              const { Icon, color } = TRAIN_COPY[t];
              const live = goal != null;
              return (
                <button
                  key={t} type="button"
                  className={optBtn(live && state.goal === goal, !live)}
                  disabled={!live}
                  onClick={() => { if (!goal) return; reseed(goal, undefined); next(); }}
                >
                  <span className="flex items-start gap-3.5">
                    {/* Discipline colour survives the dimming, at lower opacity — a not-yet card
                        should still say which discipline it is. */}
                    <Icon className="h-6 w-6 shrink-0 mt-0.5" style={{ color, opacity: live ? 1 : 0.4 }} />
                    <span className="min-w-0 block">
                      <span className="block text-base">{TRAIN_COPY[t].label}</span>
                      <span className={`block text-sm mt-1 leading-relaxed ${live ? 'text-white/70' : 'text-white/40'}`}>
                        {TRAIN_COPY[t].blurb}
                      </span>
                      {/* ⛔ THE PRECONDITION PARAGRAPH IS GONE (Michael, 2026-08-05: *"lose this"*).
                          It listed what the block needs — barbell, rack, bench, four maxes on file —
                          and it made one card three times the height of its three neighbours, which
                          is what a picker screen cannot afford.

                          ⚠️ IT WAS THERE FOR A REASON AND THAT REASON HAS NOT GONE AWAY: the
                          2026-07-25 rule was to state a block's requirements AT THE DOOR, because
                          finding out on step three that you need four 1RMs on file is worse than
                          knowing before you start. The requirement is now UNSAID on this path. The
                          natural home is the tier screen (the next tap, still before any work) —
                          not built, deliberately not guessed at. */}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </StepLayout>
      )}

      {/* ── THE STRENGTH TIER ────────────────────────────────────────────────────────────────────
          Strong / Heavy / Definition (SPEC §A). Strong is the block that exists today, so picking it
          is a pass-through — nothing new goes to the engine. Heavy and Definition are dark until the
          assistance rework lands, because the accessory selection they differ ON is exactly what is
          being fixed; shipping them now would be three names for one block. */}
      {currentStep === 'tier' && (
        <StepLayout
          step={stepNo('tier')} totalSteps={steps.length} title={eyeTitle('Strength')}
          subtitle="Hold your endurance while you focus on strength goals."
          onBack={back} onContinue={next} canContinue={state.strengthTier != null}
          hideContinue hideProgress
        >
          <div className="space-y-2">
            {/* ⛔ THE HONESTY NOTE + MILEAGE CHECK LEFT THIS SCREEN (Michael, 2026-08-24 evening).
                They are about the running VOLUME, which is typed on the endurance-week screen — so
                they render there, beside the miles box (`EnduranceWeekCard`), not at the tier door
                where there is nothing to apply them to. Copy now lives in
                `standing-plan-week-copy.ts` (`VOLUME_HONESTY_LINES`, `RUNNER_MILEAGE_CHART`). */}
            {TIER_ORDER.map((t) => {
              const { label, blurb, Icon, live } = TIER_COPY[t];
              return (
                <button
                  key={t} type="button"
                  className={optBtn(state.strengthTier === t, !live)}
                  disabled={!live}
                  onClick={() => { if (!live) return; setState((s) => ({ ...s, strengthTier: t })); next(); }}
                >
                  <span className="flex items-start gap-3.5">
                    {/* All three are strength blocks, so all three carry the strength colour — what
                        differs between them is the work around the lifts, not the discipline. */}
                    <Icon
                      className="h-6 w-6 shrink-0 mt-0.5"
                      style={{ color: getDisciplineColor('strength'), opacity: live ? 1 : 0.4 }}
                    />
                    <span className="min-w-0 block">
                      <span className="block text-base">{label}</span>
                      <span className={`block text-sm mt-1 leading-relaxed ${live ? 'text-white/70' : 'text-white/40'}`}>
                        {blurb}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </StepLayout>
      )}

      {/* ── THE RACE ─────────────────────────────────────────────────────────────────────────────
          Distance, date, level — the three fields the existing race form (`GoalsScreen.tsx:2433`)
          collects that this builder never had. Everything else that form asks (name, priority,
          strength protocol + frequency) is either answered elsewhere in this flow or defaulted.

          ⛔ NO RACE PICKER HERE YET. The date is typed. `extract-races` exists and works
          (web search, official name, A/B priority) and wiring it is the next slice — it changes what
          this card LOOKS like, not what it produces, so the payload below is already final.

          ⛔ AND NO "just finish vs get faster" QUESTION. That answer picks the generator
          (`create-goal…:3411`), and the faster branch is gated on a real pace benchmark — an athlete
          with no numbers on file is refused outright. Asking it before the calibration prompt exists
          would build a door with a wall behind it. Until then this sends 'complete'. */}
      {currentStep === 'race' && (
        <StepLayout
          step={stepNo('race')} totalSteps={steps.length} title="Which race?"
          subtitle="The date sets the length of the block — training runs from the week you start to race day."
          onBack={back} onContinue={next} canContinue={raceCanContinue}
        >
          <div className="space-y-5">
            <div>
              <p className="text-white/85 text-sm mb-2">Which race?</p>
              <input
                type="text"
                value={state.raceName}
                onChange={(e) => setState((s) => ({ ...s, raceName: e.target.value }))}
                placeholder="e.g. Humboldt Redwoods Marathon"
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 placeholder:text-white/25 focus:outline-none focus:border-[rgba(var(--wiz-accent-rgb,236,233,227),0.50)]"
                style={{ fontSize: '16px' }}
              />
              {/* ⛔ THE NAME IS NOT DECORATION. It becomes the goal's name and the plan's title, and
                  the coach reads it. Without this field every marathon goal was called "Marathon". */}
            </div>

            <div>
              <p className="text-white/85 text-sm mb-2">Distance</p>
              <div className="grid grid-cols-3 gap-1.5">
                {RACE_DISTANCES.map((d) => (
                  <button
                    key={d} type="button"
                    onClick={() => setState((s) => ({ ...s, raceDistance: d }))}
                    className={`py-2 rounded-xl text-sm ${state.raceDistance === d ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                  >{d}</button>
                ))}
              </div>
              {/* Say why there is one option, so it reads as scope and not as a broken control. */}
              <p className="text-white/50 text-xs mt-1.5">
                Marathon first. The other distances come on the same machinery.
              </p>
            </div>

            <div>
              {/* Race day + start week share the line — set both up front (start defaults to this
                  week's Monday; you can still adjust it on the build screen). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/85 text-sm mb-2">Race day</p>
                  <input
                    type="date"
                    value={state.raceDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setState((s) => ({ ...s, raceDate: e.target.value }))}
                    className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-[rgba(var(--wiz-accent-rgb,236,233,227),0.50)]"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <p className="text-white/85 text-sm mb-2">Start the week of</p>
                  <input
                    type="date"
                    value={state.startDate}
                    onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                    className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-[rgba(var(--wiz-accent-rgb,236,233,227),0.50)]"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>
              {/* ⚠️ "About", and it means it — the server can shorten this a long way on a close
                  race (its race-support and bridge-peak modes cap at 2 and 6 weeks). Stating a
                  number this screen cannot guarantee as though it were fixed is the failure this
                  file keeps having; the hedge is the honest half. */}
              {raceWeeks !== null && planWeeks !== null && (
                <p className="text-white/70 text-sm mt-1.5">
                  About {planWeeks} week{planWeeks === 1 ? '' : 's'} of training
                  {planWeeks === 20 ? ' — the longest block we build to a single race.' : '.'}
                </p>
              )}
              {state.raceDate && raceWeeks === null && (
                <p className="text-amber-400/70 text-sm mt-1.5">That date has already passed.</p>
              )}
            </div>

            {/* ── CLIMB — AN INPUT, NOT A GATE ────────────────────────────────────────────────
                ⛔ OPTIONAL, AND THE COPY SAYS SO. Michael, 2026-08-04: *"ask for it in the front
                but say you can add both later."* Blank is a real answer — the block builds without
                any terrain claim at all, and nothing downstream invents one.

                ⛔ AND NOTHING GUESSES IT. There is no queryable database of race courses, so an
                automatic lookup would be right for some races and quietly wrong for others — and
                silently wrong terrain is worse than none, because the plan would prescribe hill
                work for a flat course or miss a real climb. The athlete knows or they don't.

                ⚠️ A NUMBER IS THE COARSE CALL ONLY — does this block need hill work. The per-mile
                strategy needs real geometry, which is what the GPX upload on the goal card
                produces (`course-upload` → segments → `course-strategy`). Both are deterministic;
                neither needs a model to read the terrain. */}
            <div>
              <p className="text-white/85 text-sm mb-2">
                How much climbing? <span className="text-white/45">Optional</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="numeric" min={0}
                  value={state.raceElevation === '' ? '' : state.raceElevation}
                  onChange={(e) => setState((s) => ({
                    ...s, raceElevation: e.target.value === '' ? '' : Number(e.target.value),
                  }))}
                  placeholder={unit === 'km' ? 'e.g. 340' : 'e.g. 1100'}
                  className="w-28 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                  style={{ fontSize: '16px' }}
                />
                <span className="text-white/75 text-sm">{unit === 'km' ? 'm' : 'ft'} of gain</span>
              </div>
              <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                Shapes whether the block builds in hill work. You can add this — or the course file,
                for mile-by-mile pacing — any time from the goal once the plan exists.
              </p>
            </div>

            {/* ⛔ "PLAN A SEASON" LIVES BEHIND RACE (Michael, 2026-08-05: *"plan a season should be
                in race"*). It was a top-level button on the Goals screen, beside the front door,
                which put a racing decision outside the racing card. It routes to `/arc-setup` — a
                different builder entirely, for several races across a season rather than one block
                to one date.

                ⚠️ SECONDARY, NOT A THIRD CARD. One race is the common case and keeps the whole
                screen; this is the way out for the athlete who wants more, placed after the fields
                so it cannot be mistaken for the primary action. */}
            {onPlanSeason && (
              <div className="pt-1 border-t border-white/8">
                <button
                  type="button"
                  onClick={onPlanSeason}
                  className="w-full text-left pt-4"
                >
                  <span className="block text-white/85 text-sm">Racing more than once this year?</span>
                  <span className="block text-white/50 text-xs mt-1 leading-relaxed">
                    Plan a season instead — several races in order, with the build and the recovery
                    between them worked out together.
                  </span>
                </button>
              </div>
            )}

          </div>
        </StepLayout>
      )}

      {/* ── WHERE ARE YOU WITH THE MARATHON ─────────────────────────────────────────────────
          ⛔ THE TIER SEEDS, IT DOES NOT DECIDE. Tapping a tier drops two numbers into two fields
          and the athlete edits from there — Runna's shape, and the field's: label on the button,
          editable numbers behind it. The tier itself still drives the plan's volume table and
          long-run arc; these two numbers say where the athlete is TODAY.

          ⛔ SUGGEST, DO NOT GATE. Books gate (Pfitzinger's prerequisite, Higdon's "about a year of
          running"); apps do not. Nobody is blocked here. When the numbers and the tier contradict
          each other the card says so and moves on — the same move as Runna's implausible-time
          warning and Garmin's confidence ring: let them in, then tell the truth. */}
      {currentStep === 'level' && (
        <StepLayout
          step={stepNo('level')} totalSteps={steps.length} title="Where are you with the marathon?"
          subtitle="Your level sets the plan. The week below is what it assumes you are running now."
          onBack={back} onContinue={next} canContinue={levelCanContinue}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              {FITNESS_TIERS.map((t) => (
                <button
                  key={t.id} type="button"
                  onClick={() => setState((st) => ({
                    ...st,
                    fitness: t.id,
                    // ⛔ RESEED ON EVERY TAP, INCLUDING A RE-TAP. Someone who edits, changes their
                    // mind about the tier, and comes back expects the new tier's numbers — not
                    // their edits to the old one silently kept under a different heading.
                    targetMiles: TIER_SEEDS[t.id].weeklyMi,
                    // ⛔ THE LONG-RUN SEED IS GONE (2026-08-06). It stayed prefilled at the tier's
                    // number — 6 for a beginner — and that number is not decoration: it is the rung
                    // `buildLongRunArc` enters the table at, so an athlete who never touched the
                    // field had the block's ceiling set by a guess we made on their behalf and
                    // showed back to them as their own answer. Michael's own build shipped with
                    // `Recent Long Run Miles: 6` he never typed.
                    // ⚠️ THE FIELD STAYS. Blank and a seeded 6 produce the IDENTICAL plan for a
                    // true beginner (both enter at rung 0), so nothing is lost by leaving it empty
                    // — while a beginner who really does run 10-mile long runs can still say so and
                    // enter the arc where they actually are. Killing the field would have cost them
                    // that for no gain. Same rule as the days and long-run-day controls
                    // (2026-07-29): *"no prefill let them chose."*
                    longRunMiles: '',
                    targetTouched: true,
                  }))}
                  className={optBtn(state.fitness === t.id)}
                >
                  {/* ⛔ ONE LINE EACH. Three cards with two-line blurbs pushed the mileage field and
                      both advisory notices below the fold on a phone, so the athlete met the CTA
                      before the numbers the CTA commits them to. `line-clamp-2` keeps a long blurb
                      from re-creating that on the next copy edit. */}
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-white/55 text-sm mt-0.5 leading-snug line-clamp-2">{t.blurb}</span>
                </button>
              ))}
            </div>

            {state.fitness && (
              <div className="space-y-4 rounded-xl border border-white/12 bg-white/[0.03] p-3">
                <div>
                  {/* Availability first: how many days a week they can train — the engine's run-day
                      count (days_per_week). Floor is 4. Miles below give volume; together set the week. */}
                  <p className="text-white/85 text-sm mb-2">How many days a week can you train?</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[4, 5, 6, 7].map((n) => (
                      <button
                        key={n} type="button" onClick={() => setState((st) => ({ ...st, daysPerWeek: n }))}
                        className={`py-2 rounded-xl text-sm ${state.daysPerWeek === n ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-white/85 text-sm mb-2">Current weekly {unit === 'km' ? 'kilometres' : 'miles'}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" inputMode="decimal" min={0}
                      value={state.targetMiles === '' ? '' : state.targetMiles}
                      onChange={(e) => setState((st) => ({
                        ...st, targetMiles: e.target.value === '' ? '' : Number(e.target.value), targetTouched: true,
                      }))}
                      className="w-24 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                      style={{ fontSize: '16px' }}
                    />
                    <span className="text-white/75 text-sm">{unit}/wk</span>
                  </div>
                </div>
                <div>
                  {/* ⛔ THIS ONE DOES REAL WORK. It travels as `recent_long_run_miles`, and
                      `getProgressionOffset` uses it to pick where in the long-run arc the plan
                      starts. Absent, the arc always opens at week 1 no matter who the athlete is. */}
                  <p className="text-white/85 text-sm mb-2">Longest run in the last month</p>
                  <p className="text-white/50 text-xs mb-2 leading-relaxed">
                    Leave it blank if there isn&apos;t one — the plan opens at its first step.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" inputMode="decimal" min={0}
                      value={state.longRunMiles === '' ? '' : state.longRunMiles}
                      onChange={(e) => setState((st) => ({
                        ...st, longRunMiles: e.target.value === '' ? '' : Number(e.target.value),
                      }))}
                      className="w-24 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                      style={{ fontSize: '16px' }}
                    />
                    <span className="text-white/75 text-sm">{unit}</span>
                  </div>
                </div>

                {/* The soft signal. Rare by construction — 25% under the seed before it speaks. */}
                {mismatchNote && (
                  <p className="text-white/60 text-xs leading-relaxed">
                    {mismatchNote} The plan builds from what you entered.
                  </p>
                )}
                {/* ⛔ SAY WHERE THE PLAN WILL ACTUALLY START. Michael: *"we should offer with
                    minimum as the floor."* The engine ALREADY overrides a too-low number —
                    `resolveEffectiveStartVolume` floors week one and never says so — and a silent
                    override is the worst of both: the athlete's answer is discarded AND they think
                    it was used. Naming the number the block opens at is the whole fix.
                    ⚠️ Still not a wall. They continue either way; §5.2b, breach states cost. */}
                {milesVerdict?.ok === false && (
                  <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-2.5">
                    <p className="text-white/85 text-xs leading-relaxed">
                      A {state.raceDistance.toLowerCase()} block usually sits on about{' '}
                      {milesFloorDisplay} {unit} a week. Building on less means a faster ramp, and a
                      faster ramp raises injury risk.
                    </p>
                    <p className="text-white/60 text-xs mt-1.5 leading-relaxed">
                      The plan will open near {milesFloorDisplay} {unit} either way — that is its
                      floor for this level.
                    </p>
                  </div>
                )}
                {/* ⛔ THE CEILING, STATED. Where the block's longest run lands, against what the
                    distance normally asks for. Fact, then consequence, then the alternative — no
                    instruction, and no wall: they continue either way. */}
                {longRunReach?.shortOfTable && typicalPeak && planWeeks && (
                  <div className="rounded-lg border border-white/12 bg-white/[0.03] p-2.5">
                    <p className="text-white/85 text-xs leading-relaxed">
                      Over {planWeeks} weeks from where you are now, the longest run in this block
                      reaches about {toDisplayMi(longRunReach.peakLongRunMi)} {unit}. Most{' '}
                      {state.raceDistance.toLowerCase()} plans peak at {toDisplayMi(typicalPeak[0])}{' '}
                      to {toDisplayMi(typicalPeak[1])}.
                    </p>
                    <p className="text-white/60 text-xs mt-1.5 leading-relaxed">
                      The block builds and tapers either way, and the last long run sits two to three
                      weeks before race day. The gap shows up late in the race, over the distance
                      nothing in training covered.
                      {halfReach && !halfReach.shortOfTable
                        ? ' The same weeks build a half marathon to its full arc.'
                        : ''}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </StepLayout>
      )}

      {/* ── WHAT IS THIS FOR ─────────────────────────────────────────────────────────────────
          ⛔ SHOWN TO EVERYONE, INCLUDING A FIRST-TIMER. An earlier draft hid this from beginners;
          no app in the reference set does that. Drills are gated on the tier — that IS field
          standard — but the QUESTION is not. Someone running their first marathon is allowed to
          want a time.

          ⛔ THE ANSWER PICKS THE GENERATOR: `complete` → `sustainable` (distance and effort, no
          pace targets); `speed` → `performance_build` (tempo, cruise intervals, reps, MP runs). */}
      {currentStep === 'intent' && (
        <StepLayout
          step={stepNo('intent')} totalSteps={steps.length} title="What's this block for?"
          subtitle="Sessions come by distance and effort. Where we have your paces or heart rate, they carry those too."
          onBack={back} onContinue={next} canContinue={intentCanContinue}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setState((st) => ({ ...st, raceIntent: 'complete' }))}
                className={optBtn(state.raceIntent === 'complete')}
              >
                <span className="font-medium">Getting to the finish</span>
                <span className="block text-white/55 text-sm mt-0.5">
                  Easy running and long runs, run by feel. No paces needed.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setState((st) => ({ ...st, raceIntent: 'speed' }))}
                className={optBtn(state.raceIntent === 'speed')}
              >
                <span className="font-medium">A time</span>
                <span className="block text-white/55 text-sm mt-0.5">
                  Adds tempo and intervals, written to your paces. Needs a recent 5k.
                </span>
              </button>
            </div>

            {/* ⛔ ONE FIELD, REVEALED. `goals.target_time` is already read by the coach, the course
                strategy and the finish projection — it has simply never been written by this path. */}
            {state.raceIntent === 'speed' && (
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-3">
                <div>
                  <p className="text-white/85 text-sm mb-2">
                    Target finish <span className="text-white/45">Optional</span>
                  </p>
                  {/* ⛔ SAY WHICH NUMBER DOES WHAT, because without this the field reads as the one
                      the plan trains you at — which is the dangerous version and NOT what happens.
                      `effort_paces` comes from current fitness only; `target_time` never reaches the
                      generator. It goes to the coach, the race-day pacing and the readiness
                      projection: the thing you are measured against, not trained at. */}
                  <p className="text-white/60 text-sm mb-2 leading-relaxed">
                    Sessions are built from your current paces either way. This is what we measure
                    you against.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text" inputMode="numeric" placeholder="3:45"
                      value={state.targetTime}
                      onChange={(e) => setState((st) => ({ ...st, targetTime: e.target.value }))}
                      className="w-28 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm text-center"
                      style={{ fontSize: '16px' }}
                    />
                    <span className="text-white/60 text-sm">h:mm</span>
                  </div>
                  {state.targetTime && !parseTargetTime(state.targetTime) && (
                    <p className="text-amber-400/70 text-xs mt-1.5">Enter it as h:mm, like 3:45.</p>
                  )}
                </div>
                {speedNeedsCalibration && (
                  <p className="text-white/60 text-xs leading-relaxed">
                    A time goal is written against your paces, and there are none on file yet. Two
                    numbers below and the plan can write real targets.
                  </p>
                )}
              </div>
            )}
          </div>
        </StepLayout>
      )}

      {/* ── STRENGTH FOCUS: strength is the answer they already gave ──────────────────────────────
          The generic screen below asks develop/maintain/out for all four disciplines and then offers
          a strength-protocol picker. On this path all three of those questions are already settled:

            • Strength DEVELOPS — that is what "Get stronger" means. Asking again is a form.
            • Endurance CANNOT develop. `create-goal-and-materialize-plan` routes to the strength
              engine only when no endurance discipline develops; pick develop and the plan silently
              stops being a strength block and goes somewhere else entirely. Offering the option is
              offering to leave.
            • The PROTOCOL picker (5×5 / Upper Aesthetics / Neural Speed) is inert — the engine builds
              Wendler 5/3/1 regardless, and the confirm screen was reporting the dead choice back as
              fact. Omakase: the engine designs the block (D-323).

          So the only real question is which endurance you are keeping through the block. Michael,
          2026-07-25: *"strength is assumed, question is do you want to run ride swim — and you can't
          develop them."* Every other goal keeps the full screen underneath.

          ⛔ AND THE TITLE'S NAME COMES FROM `GOAL_LABELS`, IT IS NOT TYPED HERE. It used to be the
          literal "Strength Focus", which is the exact second-copy the label's own comment was written
          to stop — rename the block and this title silently keeps the old name. One source. */}
      {currentStep === 'posture' && isStrengthFocus && (
        <StepLayout
          step={stepNo('posture')} totalSteps={steps.length} title={`${GOAL_LABELS.get_stronger} · ${STRENGTH_FOCUS_WEEKS} weeks`}
          onBack={back} onContinue={next} canContinue={postureCanContinue}
        >
          <div className="space-y-3">
            {/* ⛔ THE BRIEF PARAGRAPH IS GONE FROM THIS STEP (Michael, 2026-08-25: use the space
                to get the cards on the phone). The title already says 12 weeks; the commitment
                line below carries the rest. `strengthFocusBrief` still opens the PLAN. */}
            {/* ⛔ WHAT IS OWED, BEFORE THE DAY PICKER (Michael, 2026-08-25). The lifting days are
                what define this block and they were not named until step 7's week list — the last
                screen before Build, three steps after the athlete committed to the shape.
                ⛔ DERIVED FROM THE FRAME, NOT TYPED HERE — `liftingCommitmentLine` counts the days
                the frame's own column carries barbell work, so a frame with a different count says
                a different number without anyone editing this line. ⚠️ COPY-VOICE: the fact and its
                consequence, no imperative and no reassurance. */}
            {liftingCommitmentLine() && (
              <p className="text-white/75 text-sm leading-relaxed">{liftingCommitmentLine()}</p>
            )}
            {/* ⛔ "Who are you this block?" CUT (Michael, 2026-08-24 evening) — the four cards ARE
                the question, and the heading's line of height is what kept the swim card below the
                fold. The cards still pre-shape the slot screen exactly as before. */}
            {([
              // ⛔ THE EFFECT LINE UNDER EACH CARD (Michael, 2026-08-24): what the choice does to
              // the lifting, his anchors, flat. "smaller toll" is his approved phrasing — riding
              // is not zero-cost, it just doesn't pound the legs.
              { id: 'run_only', label: 'Run only', run: true, bike: false,
                effect: 'Get stronger while holding your running base.' },
              { id: 'ride_only', label: 'Ride only', run: false, bike: true,
                effect: 'Get stronger while holding your riding base.' },
              { id: 'run_ride', label: 'Run + ride', run: true, bike: true,
                effect: 'Get stronger while holding your running and riding base.' },
            ] as const).map((card) => {
              const selected =
                ((state.posture.run ?? 'out') === 'maintain') === card.run &&
                ((state.posture.bike ?? 'out') === 'maintain') === card.bike;
              return (
                <button
                  key={card.id} type="button"
                  onClick={() => {
                    setPosture('run', card.run ? 'maintain' : 'out');
                    setPosture('bike', card.bike ? 'maintain' : 'out');
                  }}
                  className={`w-full rounded-xl border p-3 ${selected ? 'border-white/25 bg-white/[0.06]' : 'border-white/12 bg-white/[0.02]'}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2.5">
                      {card.run && <Footprints className="h-4 w-4" style={{ color: getDisciplineColor('run') }} />}
                      {card.bike && <Bike className="h-4 w-4" style={{ color: getDisciplineColor('bike') }} />}
                      <span className={`font-medium ${selected ? 'text-white' : 'text-white/60'}`}>{card.label}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 text-white/70" />}
                  </span>
                  <span className="block text-left text-white/50 text-xs mt-1.5 leading-relaxed">{card.effect}</span>
                </button>
              );
            })}
            {/* ⛔ SWIM IS AN ADD-ON, NEVER A SLOT (Michael, 2026-08-24): easy laps + technique only,
                1 or 2 a week, off by default. Cap 2 — past that the athlete wants a tri plan. The
                hard swim families are never prescribed by this plan (standing ruling). */}
            <div className="rounded-xl border border-white/12 bg-white/[0.02] p-3">
              <button
                type="button"
                onClick={() => setState((s) => ({
                  ...s,
                  posture: { ...s.posture, swim: (s.posture.swim ?? 'out') === 'maintain' ? 'out' : 'maintain' },
                  swimEasySessions: (s.posture.swim ?? 'out') === 'maintain' ? 0 : 1,
                }))}
                className="w-full flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <Waves className="h-4 w-4" style={{ color: getDisciplineColor('swim') }} />
                  <span className={`font-medium ${(state.posture.swim ?? 'out') === 'maintain' ? 'text-white' : 'text-white/60'}`}>
                    Add easy swims
                  </span>
                </span>
                {(state.posture.swim ?? 'out') === 'maintain' && <Check className="h-4 w-4 text-white/70" />}
              </button>
              <p className="text-white/50 text-xs mt-1.5">
                Technique and easy laps, for feel. Doesn't take a session spot, costs your lifting nothing.
              </p>
              {(state.posture.swim ?? 'out') === 'maintain' && (
                <div className="flex gap-1.5 mt-2">
                  {([1, 2] as const).map((n) => (
                    <button
                      key={n} type="button"
                      onClick={() => setState((s) => ({ ...s, swimEasySessions: n }))}
                      className={`px-3.5 py-1.5 rounded-lg text-sm border ${(state.swimEasySessions ?? 1) === n ? 'border-white/40 bg-white/[0.08] text-white' : 'border-white/12 text-white/55'}`}
                    >{n} a week</button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-white/50 text-xs">The week has two hard sessions. A sport that doesn't get one keeps its endurance base but not its speed.</p>
          </div>
        </StepLayout>
      )}

      {currentStep === 'posture' && !isStrengthFocus && (
        <StepLayout
          step={stepNo('posture')} totalSteps={steps.length} title="Per-discipline focus"
          subtitle={isRaceGoal
            ? `Everything else is held or parked while the ${DISCIPLINE_LABEL[raceDiscipline].toLowerCase()} builds. Keep what you want to keep.`
            : 'Seeded from your goal — adjust as you like. At most 2 disciplines develop at once.'}
          onBack={back} onContinue={next} canContinue={postureCanContinue}
        >
          <div className="space-y-3">
            {rows.map((d) => {
              const color = getDisciplineColor(d);
              const Icon = DISCIPLINE_ICONS[d];
              const cur = state.posture[d] ?? 'maintain';
              return (
                <div key={d} className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color }} />
                    <span className="font-medium" style={{ color }}>{DISCIPLINE_LABEL[d]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['develop', 'maintain', 'out'] as Posture[]).map((p) => {
                      /**
                       * ⛔ ON A RACE, EXACTLY ONE DISCIPLINE DEVELOPS — THE RACE'S. Michael,
                       * 2026-08-04: *"no develop — maintain for now or opt out."*
                       *
                       * ⛔ THE APP ALREADY SAID THIS AND THEN OFFERED THE OPPOSITE. The goal card
                       * two screens back reads *"a race build holds it at maintenance, this one
                       * develops it"* — the rule, stated in prose, next to a control that broke it.
                       *
                       * ⛔ AND STRENGTH-DEVELOP HERE WAS SILENTLY WRONG, not merely unwise. It does
                       * NOT produce a 5/3/1 block: `create-goal…:2432` routes to the strength engine
                       * only when strength develops AND no endurance does, so with the run
                       * developing it fell through to the race path carrying
                       * `strength_frequency: 4` (`assemblePayload`) — **four heavy lifting days
                       * under a marathon build**, with nothing on screen saying so.
                       *
                       * ⚠️ DISABLED, NOT HIDDEN. Same treatment the two-develop ceiling already
                       * gets on this card: the option stays visible and the reason is printed
                       * below. Hiding it removes the word; greying it teaches the rule.
                       */
                      const raceLead = isRaceGoal && d === raceDiscipline;
                      const raceHeld = isRaceGoal && d !== raceDiscipline;
                      const disabled =
                        // the race's own discipline cannot be anything BUT develop
                        (raceLead && p !== 'develop')
                        // and nothing else may develop beside it
                        || (raceHeld && p === 'develop')
                        || (p === 'develop' && !canSetDevelop(state.posture, d));
                      const active = cur === p;
                      return (
                        <button
                          key={p} type="button" disabled={disabled} onClick={() => setPosture(d, p)}
                          className={`px-2 py-2 rounded-xl text-sm border ${active ? 'border-transparent text-zinc-950 font-semibold' : 'border-white/12 text-white/85'} ${disabled ? 'opacity-30' : ''}`}
                          style={active ? { background: color } : undefined}
                        >
                          {p === 'develop' ? 'Develop' : p === 'maintain' ? 'Maintain' : 'Out'}
                        </button>
                      );
                    })}
                  </div>
                  {d === 'strength' && cur === 'develop' && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-white/70 text-xs">Strength protocol</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {strengthDevelopersFor(equipmentTier).map((sp) => (
                          <button
                            key={sp.id} type="button"
                            onClick={() => setState((s) => ({ ...s, strengthProtocol: sp.id }))}
                            className={`px-2 py-2 rounded-xl text-xs border ${state.strengthProtocol === sp.id ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)] text-white' : 'border-white/12 text-white/75'}`}
                          >
                            {sp.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* ⛔ SAY WHY THE GREYED BUTTONS ARE GREY (§0f — a cost computed and never said is not
                a cost, it is a mystery). On a race this line replaces the ceiling note: the ceiling
                is two, but a race allows one, so printing the ceiling would explain the wrong rule.
                ⚠️ FACT AND CONSEQUENCE, NOT AN INSTRUCTION — it says what the block does, not what
                the athlete should do. */}
            {isRaceGoal ? (
              <p className="text-white/60 text-xs leading-relaxed">
                The {DISCIPLINE_LABEL[raceDiscipline].toLowerCase()} is what this block develops — it
                is the one with a date on it. The rest can be held at a maintenance dose or parked;
                building two things at once costs the race.
              </p>
            ) : developCount(state.posture) >= TWO_BUILD_CEILING && (
              <p className="text-white/60 text-xs">
                At most 2 disciplines develop together — the interference ceiling. Set one to maintain to develop another.
              </p>
            )}
          </div>
        </StepLayout>
      )}

      {currentStep === 'commitment' && (
        <StepLayout
          step={stepNo('commitment')} totalSteps={steps.length} title="What can you sustain?"
          subtitle="Not how many hours — what fits your life right now. We set the volume to match."
          onBack={back} onContinue={next} canContinue={true}
        >
          <div className="space-y-2">
            {COMMITMENT_TIERS.map((t) => (
              <button
                key={t.id} type="button" className={optBtn(state.commitment === t.id)}
                onClick={() => setState((s) => ({ ...s, commitment: t.id }))}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-white/60 text-sm tabular-nums">≈ {hoursForTier(t.id)} h/wk</span>
                </div>
                <p className="text-white/65 text-sm mt-0.5">{t.blurb}</p>
              </button>
            ))}
          </div>
        </StepLayout>
      )}

      {currentStep === 'length' && (() => {
        const floor = floorForGoal(state.goal); // §13.2 — the minimum where the adaptation shows in a retest
        return (
          <StepLayout
            step={stepNo('length')} totalSteps={steps.length} title="How long is this block?"
            subtitle={`At least ${floor} weeks for ${state.goal ? GOAL_LABELS[state.goal] : 'this goal'} — that's where the change shows in a retest.`}
            onBack={back} onContinue={next} canContinue={state.targetWeeks >= floor && state.targetWeeks <= 52}
          >
            <div className="space-y-4">
              <div className="text-3xl font-semibold tabular-nums">{state.targetWeeks} weeks</div>
              <input
                type="range" min={floor} max={52} step={1} value={state.targetWeeks}
                onChange={(e) => setState((s) => ({ ...s, targetWeeks: Number(e.target.value) }))}
                className="w-full accent-[rgb(var(--wiz-accent-rgb,236,233,227))]"
              />
              <p className="text-white/60 text-sm">{floor}–52 weeks. Shorter than {floor} wouldn't show in a retest.</p>
            </div>
          </StepLayout>
        );
      })()}

      {/* ⛔ NOT ON THE STRENGTH PATH. Lifting is three days fixed by the protocol (§1f-0), and the endurance
          days are typed per discipline. A total that contradicts both is a number the engine cannot
          honour. Michael, 2026-07-25: *"how many days is redundant."* */}
      {/* ⛔ THE ATHLETE SEES THEIR WEEK. Seven rows, what is on each day, one tap to change it.
          Not three chip rows asking three questions about a week — the week itself. */}
      {/* ⛔ ONE WEEK, DRAWN ONCE, WITH THE THREE QUESTIONS UNDER IT (2026-08-06). Michael, after I
          had drawn the week three times and then three times again on three cards: *"we need to
          select each question and then hit the day of the week."*
          Pick what you are setting, then tap the days — the alarm-clock / calendar-label pattern.
          The run apps all repeat a day picker per question, one screen each; this draws the week
          once and lets the three questions share it. The selected question sits directly under the
          row so the mode is never in doubt, and the letters on the chips show a mis-tap instantly. */}
      {currentStep === 'days' && (
        <StepLayout
          step={stepNo('days')} totalSteps={steps.length} title="Your week"
          subtitle={isRaceGoal ? 'Pick your long run — that anchors the week. Add a standing session if you have one; we place the rest.' : undefined}
          onBack={back} onContinue={next}
          canContinue={!isRaceGoal || !!state.longRunDay}
        >
          {isRaceGoal ? (
            <div className="space-y-4">
              {/* THE WEEK. Once. Every question writes onto this row. */}
              {/* Card FIRST (choose a line), day row BELOW it. Only Long run and Standing session are
                  day-controllable; Run days are the engine's (week-optimizer places them from the
                  frequency/level inputs), so that row is read-only "Auto". */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                {([
                  ['run', 'Run days', 'Auto'],
                  ['long', 'Long run', state.longRunDay ? DAY_SHORT[state.longRunDay as DayName] : 'Pick one'],
                  ['club', 'Standing session', state.qualityDays[clubSport] ? DAY_SHORT[state.qualityDays[clubSport] as DayName] : 'None'],
                ] as const).map(([k, label, answer], i) => {
                  const controllable = k !== 'run';
                  const active = controllable && weekQuestion === k;
                  const rowCls = `w-full flex items-center justify-between gap-3 px-3 py-3 text-left ${i > 0 ? 'border-t border-white/8' : ''} ${active ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)] border-l-2 border-l-[rgb(var(--wiz-accent-rgb,236,233,227))]' : ''}`;
                  // The active Standing-session row carries its Run/Ride toggle INLINE (proximity) — and
                  // it's a div, not a button, so the toggle buttons don't nest inside a button. The day
                  // row below never moves because the card's height doesn't change.
                  if (k === 'club' && active) {
                    return (
                      <div key={k} className={rowCls}>
                        <span className="text-sm text-white shrink-0">{label}</span>
                        <div className="flex gap-1">
                          {([['run', 'Run club'], ['bike', 'Ride club']] as const).map(([v, lbl]) => (
                            <button
                              key={v} type="button"
                              onClick={() => {
                                setClubSport(v);
                                setState((st) => { const q = { ...st.qualityDays }; if (v === 'run') delete q.bike; else delete q.run; return { ...st, qualityDays: q }; });
                              }}
                              className="px-3 py-1 rounded-xl text-xs border"
                              style={clubSport === v
                                ? { borderColor: `rgb(${getDisciplineColorRgb(v)})`, backgroundColor: `rgba(${getDisciplineColorRgb(v)},0.16)`, color: '#fff' }
                                : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
                            >{lbl}</button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!controllable}
                      onClick={() => { if (controllable) setWeekQuestion(k); }}
                      className={`${rowCls} ${controllable ? '' : 'cursor-default'}`}
                    >
                      <span className={`text-sm ${active ? 'text-white' : 'text-white/70'}`}>
                        {label}{k === 'club' && <span className="text-white/35"> · run or ride club</span>}
                      </span>
                      <span className={`text-sm text-right ${active ? 'text-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'text-white/40'}`}>{answer}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tap-to-pick cue — contextual to the active line, so the day row reads as tappable. */}
              <p className="text-[rgba(var(--wiz-accent-rgb,236,233,227),0.85)] text-xs -mb-1">
                {weekQuestion === 'long'
                  ? 'Tap your long-run day'
                  : `Tap the day of your ${clubSport === 'bike' ? 'ride' : 'run'} club`}
              </p>
              {/* Day row — controls whichever line is active (Long run, or the Standing session's sport). */}
              <WeekDayRow
                selected={
                  weekQuestion === 'long' ? (state.longRunDay ? [state.longRunDay as DayName] : [])
                    : (state.qualityDays[clubSport] ? [state.qualityDays[clubSport] as DayName] : [])
                }
                roles={weekRoles}
                // ⚠️ EACH QUESTION IS SHOWN THE OTHER'S DAY, never its own — excluding its own is
                // what leaves it releasable.
                taken={weekQuestion === 'long'
                  ? anchorDaysTaken(state, 'long run')
                  : anchorDaysTaken(state, 'hard day')}
                onTap={(d) => {
                  // ⛔ TAP YOUR OWN DAY TO RELEASE IT. Both questions toggle: an assigned pick is
                  // cleared by tapping it again, so a day is never stuck and the athlete never has to
                  // find some other control to undo a choice. `WeekDayRow` locks days the OTHER
                  // question holds, so the only day either branch can be tapped on is its own or a
                  // free one — which is what makes a plain toggle safe here.
                  if (weekQuestion === 'long') {
                    const releasing = state.longRunDay === d;
                    setState((st) => ({
                      ...st,
                      longRunDay: releasing ? '' : d,
                      trainingDays: (releasing || st.trainingDays.includes(d)) ? st.trainingDays : [...st.trainingDays, d],
                      // ⛔ THE SILENT UNPICK IS GONE (2026-08-09). This branch used to DELETE
                      // `qualityDays.run` when the long run took its day — the athlete's club night,
                      // erased from a different line of the same card with nothing said. The club day
                      // is locked in the row now, so this collision cannot be entered.
                    }));
                  } else {
                    const releasing = state.qualityDays[clubSport] === d;
                    setState((st) => {
                      const q = { ...st.qualityDays };
                      if (releasing) delete q[clubSport]; else q[clubSport] = d;
                      return {
                        ...st,
                        qualityDays: q,
                        // a RUN club is a run day; a RIDE club is not
                        trainingDays: (releasing || clubSport === 'bike' || st.trainingDays.includes(d)) ? st.trainingDays : [...st.trainingDays, d],
                        // ⛔ AND THE MIRROR OF THE SAME UNPICK IS GONE — this used to blank
                        // `longRunDay`. Same reason: the long-run day is locked in the row.
                      };
                    });
                  }
                }}
              />

              {state.qualityDays[clubSport] && (
                <div>
                  <p className="text-white/85 text-sm mb-2">Is the standing session hard or easy?</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['quality', 'Hard — counts as a hard session'], ['easy', 'Easy / social']] as const).map(([k, label]) => (
                      <button
                        key={k} type="button"
                        onClick={() => setState((st) => ({ ...st, runClubIntensity: k }))}
                        className={`py-2 rounded-xl text-sm border ${state.runClubIntensity === k ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)] text-white' : 'border-white/12 text-white/75'}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* ⛔ A DISABLED BUTTON WITH NO REASON IS THE DEFECT, NOT THE GATE (2026-08-06). Continue
                  was already blocked below four run days and without a long-run day, and said
                  nothing — so the athlete taps a dead control and cannot tell "not yet" from
                  "broken". The gate stands; it states itself now.
                  ⚠️ THESE TWO ARE STRUCTURAL, WHICH IS WHY THEY BLOCK where the mileage floor only
                  warns: the block cannot be laid out around a long run that has no day, and four
                  days is the shape every marathon row is written for. */}
              {clubCollision && <p className="text-white/60 text-xs leading-relaxed">{clubCollision}</p>}
            </div>
          ) : (
            <div>
              <p className="text-white/85 text-sm mb-2">Days a week</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[4, 5, 6, 7].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s2) => ({ ...s2, daysPerWeek: n }))}
                    className={`py-2 rounded-xl text-sm ${state.daysPerWeek === n ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                  >{n}</button>
                ))}
              </div>
            </div>
          )}
        </StepLayout>
      )}

      {/* ⛔ STRENGTH GETS ITS OWN CARD (2026-08-06). It was the fifth question on "Your week", under
          the day count, the long-run day, the club night and two conditional notices — and a device
          pass found it missed. §2.1 kept the OUTCOME of that screen on Michael's review ("keep as
          is"); this moves the question off it, which is the thing that review did not cover.
          The decision itself is unchanged: two options, and None. */}
      {currentStep === 'strength' && (
        <StepLayout
          step={stepNo('strength')} totalSteps={steps.length} title="Strength work"
          subtitle="Running is the goal. This is what holds you together while you chase it."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-4">
              <div>
                <div className="space-y-2">
                  {([
                    ['heavy', 'Keep it heavy',
                      'Two sessions of low-rep barbell work. Improves running economy without adding bulk — the volume is deliberately too low for that. Needs a barbell.'],
                    ['durability', 'Keep it together',
                      'Two short sessions — posture, single-leg, tendon work. It is not lifting to get stronger; it is what keeps the mileage from finding a weak link.'],
                    ['none', 'None', 'Running only.'],
                  ] as const).map(([k, title, sub]) => (
                    <button
                      key={k} type="button"
                      onClick={() => setState((st) => ({
                        ...st,
                        posture: { ...st.posture, strength: k === 'none' ? 'out' : 'maintain' },
                        strengthProtocol: k === 'heavy' ? 'neural_speed' : undefined,
                      }))}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border ${
                        raceStrengthChoice === k
                          ? 'border-[rgba(var(--wiz-accent-rgb,236,233,227),0.70)] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.07)]'
                          : 'border-white/12 bg-white/[0.03]'
                      }`}
                    >
                      <span className="block text-sm text-white/90">{title}</span>
                      <span className="block text-[13px] text-white/55 mt-0.5 leading-relaxed">{sub}</span>
                    </button>
                  ))}
                </div>
                {/* ⛔ §0h — THE DOWNGRADE IS SAID OUT LOUD OR IT DOES NOT HAPPEN. `generate-run-plan`
                    honours a chosen protocol only at `strength_tier === 'strength_power'`, which
                    needs barbell capability on file. Without it the heavy pick silently becomes
                    durability — the athlete picks one thing, gets another, and nothing tells them. */}
                {raceStrengthChoice === 'heavy' && equipmentTier === 'bodyweight_bands' && (
                  <p className="text-amber-300/85 text-xs mt-2 leading-relaxed">
                    Your equipment on file is bodyweight and bands. Heavy loading needs a barbell, so
                    this would build the durability sessions instead. Adding your gear in settings
                    changes it.
                  </p>
                )}
              </div>
          </div>
        </StepLayout>
      )}


      {/* THE ACCESSORY SLOTS — and the screen has to say why they exist. Endurance pounds the body in
          one plane and leaves the same imbalances behind it; the main lifts do not saturate the joints
          that takes. So these are armour, and they are the one part of the block the athlete DIRECTS:
          push/pull for the posture that collapses over handlebars and late in a stride, single-leg or
          core for unilateral stability without adding spinal load that would cost recovery.
          Michael, 2026-07-25 — the title is "Accessory work", not "When can you train?" (that heading
          belonged to the old stacked step and described none of this). */}
      {/* ⛔⛔ THE STANDING PLAN'S ACCESSORY SCREEN (Michael, 2026-08-24 — D-450 in
          `docs/DECISIONS-LOG-3.md`). Seven picks named after the frame's own
          slots, real day tags, everything pre-filled.

          ⛔ IT IS A SEPARATE `StepLayout`, NOT A THIRD BRANCH INSIDE THE OLD ONE. The card below had
          five `isStrengthFocus ?` forks in it — intro copy, chips, the pull-up row, the day cards,
          the dose line — and every one of them was a Wendler control being talked out of applying.
          Get Stronger's screen is now literally untouched by this path.

          ⛔ WHAT THE OLD SHAPE GOT WRONG, so nobody merges them back: it asked for NINE movements
          across Wendler's three lifting days. This frame has FOUR differently shaped days, seven HYP
          accessory slots, no core slot and no open compound-pull slot — so three of the nine picks
          could essentially never place, and the Glutes and Core focus chips could never fire at all
          because no cell in the grid offers a glute- or core-prime movement. */}
      {currentStep === 'accessory' && isStrengthFocus && (
        <StepLayout
          step={stepNo('accessory')} totalSteps={steps.length} title="Accessory work"
          // ⛔ MICHAEL'S WORDING, VERBATIM (2026-08-24). It replaced "The programme owns the slots.
          // You pick what fills them." — true, and it taught the athlete a word out of the engine's
          // vocabulary in the first sentence of the screen. ⛔ THE WORD "SLOT" IS NOT TO APPEAR
          // ANYWHERE ATHLETE-FACING ON THIS SCREEN; `dial-copy.ts` carries the rule and the reason.
          subtitle={ACCESSORY_SUBTITLE}
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-4">
            {/* ── DIAL ─────────────────────────────────────────────────────────────────────
                ⛔ THE WORD IS THE DECISION, AND IT IS NOT "FOCUS" (Michael, 2026-08-24). It was
                built as "Aesthetics" and renamed before the first commit — working title only, no
                row ever persisted, so `dial` is the only spelling in storage. What these chips do is
                not what a focus chip did: a focus chip re-pointed which movement filled a cell, this
                moves VOLUME. One word, one idea.
                ⚠️ THE SUPPORTING LINE IS MICHAEL'S WORDING, VERBATIM, AND IT TRIPS THE VOICE LINT ON
                `focus` — shipped anyway on the same standing override already on record for "Speed
                focus" / "VO2 max focus". It is pinned in `strength-focus-copy.voice.test.ts` as an
                EXPECTED violation, so a future edit of it fails the gate rather than sliding through.
                ⛔ Do not reword it to satisfy the lint. The collision the rename fixed is with the
                endurance screens' focus CONTROL; a verb in a supporting line is not that control.
                ⛔ CAP TWO, AND THE SCREEN SAYS WHY IN ITS OWN LINE. The upper days already carry
                seven to nine counted work sets and p086's ceiling is the binding constraint. */}
            <div>
              {/* ⛔ SECTION-TITLE WEIGHT, NOT LABEL WEIGHT (Michael, from device screenshots
                  2026-08-24). At `text-sm` it read as a field label sitting above some chips rather
                  than as the screen's second section, and the chip row below it looked orphaned.
                  It sits one step under `StepLayout`'s own `text-[1.3rem]` title, and its sub-line
                  takes the same treatment StepLayout gives a subtitle — so "Dial" reads as a
                  section WITH a subtitle, which is what it is. */}
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-white text-[17px] font-semibold leading-snug tracking-tight">Dial</h3>
                <span className="text-white/50 text-xs shrink-0">
                  {(viadaPrefs?.dial ?? []).length}/{DIAL_CAP}
                </span>
              </div>
              <p className="mt-1 mb-3 text-[15px] text-white/55 leading-relaxed">
                {DIAL_SUBLINE}
              </p>
              {/* Same 3-column grid as the Get Stronger chips, and for the measured reason recorded
                  there: five chips in a flex-wrap orphan the fifth on its own line. */}
              <div className="grid grid-cols-3 gap-2">
                <GalaxyButton
                  shape="chip"
                  variant={(viadaPrefs?.dial ?? []).length === 0 ? 'primary' : 'secondary'}
                  onClick={() => setViadaDial([])}
                >Balanced</GalaxyButton>
                {DIAL_CHIPS.map((chip) => {
                  const on = (viadaPrefs?.dial ?? []).includes(chip);
                  const atCap = !on && (viadaPrefs?.dial ?? []).length >= DIAL_CAP;
                  return (
                    <GalaxyButton
                      key={chip}
                      shape="chip"
                      variant={on ? 'primary' : 'secondary'}
                      disabled={atCap}
                      onClick={() => setViadaDial(on
                        ? (viadaPrefs?.dial ?? []).filter((c) => c !== chip)
                        : [...(viadaPrefs?.dial ?? []), chip].slice(0, DIAL_CAP))}
                    >{DIAL_LABEL[chip]}</GalaxyButton>
                  );
                })}
              </div>
              {/* ⛔ ONE LINE PER ACTIVE CHIP. TWO CHIPS = TWO ONE-LINERS, NEVER TWO PARAGRAPHS
                  (Michael, from device screenshots 2026-08-24). The shape is fixed in `dialChipLine`
                  so every chip reads the same; the copy rule that governs it — one line inline, any
                  deeper explanation behind an (i) that is NOT built yet — is on `dial-copy.ts`.
                  ⚠️ The named movement is the athlete's own pick from the row below, so the line
                  says "extra Hip Thrust sets" rather than "extra sets". */}
              {(viadaPrefs?.dial ?? []).map((chip) => (
                <p key={chip} className="text-white/65 text-[13px] mt-2 leading-relaxed">
                  {dialChipLine(chip, {
                    equipment: strengthEquipment,
                    // ⛔ CORE READS THE "Core movement" PICK, not a row of its own — it has no row
                    // picker any more, and the line must name what the athlete actually chose.
                    movement: chip === 'core'
                      ? (viadaPrefs?.picks?.core ?? null)
                      : (viadaPrefs?.dial_rows?.[dialRowKey(chip, 0)] ?? null),
                  })}
                </p>
              ))}
              {(viadaPrefs?.dial ?? []).length >= DIAL_CAP && (
                <p className="text-white/45 text-[13px] mt-2 leading-relaxed">{DIAL_CAP_NOTE}</p>
              )}
            </div>

            {/* ── THE ROWS A CHIP ADDS ───────────────────────────────────────────────────────────
                ⛔ ONLY FOR THE CHIPS THAT REACH NO SLOT — Glutes and Core. For those two the extra
                rows are not a bonus, they ARE the mechanism, so the athlete names the movement
                rather than being handed one. Chest, Shoulders and Arms are already visible in the
                picks below, which is where their re-pointing shows up. */}
            {dialRowChips.length > 0 && (
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-3">
                {dialRowChips.map((chip) => {
                  const opts = dialRowOptions(chip, strengthEquipment);
                  const key = dialRowKey(chip, 0);
                  const value = viadaPrefs?.dial_rows?.[key] ?? opts[0]?.name ?? '';
                  return (
                    <div key={key}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-white/85 text-sm">
                          {DIAL_OWNERSHIP[chip]} focus
                        </span>
                        <span className="text-white/45 text-xs">3 &times; 8&ndash;10, by feel</span>
                      </div>
                      <select
                        value={value}
                        onChange={(e) => setViadaRow(key, e.target.value)}
                        className="w-full py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white appearance-none"
                        style={{ fontSize: '16px' }}
                        aria-label={`${DIAL_OWNERSHIP[chip]} focus movement`}
                      >
                        {opts.map((o) => (
                          <option key={o.name} value={o.name} className="bg-neutral-900">{o.display}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {/* ⛔ THE DAY IS THE COMPOSER'S ANSWER, NOT THIS SCREEN'S. Said once, under the rows
                    it is about, rather than guessed at per row. */}
                <p className="text-white/45 text-xs leading-relaxed">
                  {DIAL_ROW_DAY_IS_THE_COMPOSERS}
                </p>
              </div>
            )}

            {/* ── THE SEVEN ──────────────────────────────────────────────────────────────────────
                ⛔ THE DAY TAGS ARE REAL DAYS, READ OFF THE FRAME. The week is fixed (p246) and the
                calendar question comes one screen later, so there is nothing to hedge about: these
                are the days the block opens on. ⚠️ Pinning a long-run day on the next screen rotates
                the whole week, which moves every one of these by the same amount.
                ⚠️ ISOLATION PULL AND SINGLE-LEG EACH RENDER TWICE — two rows apiece, one per day.
                The frame carries both cells twice and each occurrence has its own pick, so the two
                rows share a label and are told apart by the day tag beside them. This list is driven
                off VIADA_PICK_KEYS, so a table split shows up here with no change to this file. */}
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-3">
              {VIADA_PICK_KEYS.map((key) => {
                const spec = VIADA_PICKS[key];
                const opts = pickOptions(key, strengthEquipment);
                const value = viadaPrefs?.picks?.[key] ?? opts[0]?.name ?? '';
                const days = daysForPick(key);
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-white/85 text-sm">{spec.label}</span>
                      <span className="text-white/45 text-xs">
                        {days.length > 0
                          ? days.map((d) => d.toLowerCase()).join(' · ')
                          : 'fills the week\u2019s core minimum'}
                      </span>
                    </div>
                    <select
                      value={value}
                      onChange={(e) => setViadaPick(key, e.target.value)}
                      className="w-full py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white appearance-none"
                      style={{ fontSize: '16px' }}
                      aria-label={`${spec.label} movement`}
                    >
                      {opts.map((o) => (
                        <option key={o.name} value={o.name} className="bg-neutral-900">{o.display}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {/* ⛔ ONE LINE, UNDER THE FIELD IT IS ABOUT. What stood here named the source, the
                  missing core slot and "the four movement patterns" — sourcing talk and engine
                  vocabulary, under a dropdown. */}
              <p className="text-white/45 text-[13px] leading-relaxed">{CORE_PICK_NOTE}</p>
            </div>

            {/* ⛔ IT SAID "sets of 6-12" WHILE THE ROWS ON THIS SAME SCREEN SAID "3 x 8-10"
                (Michael, from device screenshots 2026-08-24). Two dose claims one scroll apart, and
                the rows were the right one — p086 prescribes 3 x 8-10 at 1-2 RIR. Kept rather than
                deleted because the rows print their dose only for the Glutes and Core extra rows,
                so this is the only place the seven picks' own dose is stated. */}
            <p className="text-white/70 text-sm leading-relaxed">{ACCESSORY_DOSE_LINE}</p>
          </div>
        </StepLayout>
      )}

      {currentStep === 'accessory' && !isStrengthFocus && (
        <StepLayout
          step={stepNo('accessory')} totalSteps={steps.length} title="Accessory work"
          subtitle="Three short slots after the main lift. Yours to direct."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-4">
            {/* WHY THESE SLOTS EXIST, said before they are picked. Without it the screen reads as
                three arbitrary dropdowns and the athlete has no basis for a choice the app is
                deliberately handing them.
                ⛔ AND IT SAYS "ARMOR" — the hedged version of this paragraph was rewritten OUT.
                Michael, 2026-07-25: *"unless it's an unreasonable claim I think it's fair, not sure
                why we got gun shy."* The claims here are the uncontested ones (repetitive
                single-plane loading; four heavy central lifts leaving gaps) and NO number is stated,
                so there is no invented threshold to defend — the caution that killed a numeric
                volume cap does not apply to a plain mechanical fact. The trailing clause is the
                consequence, not an instruction (COPY-VOICE rule 7). */}
            {/* ⛔ TWO LINES, NOT TWO PARAGRAPHS. The old copy explained WHY accessory work exists —
                single-plane endurance loading, four central lifts leaving gaps — over twelve lines,
                which pushed the third slot below the fold on a phone. The athlete came here to
                choose three movements, not to read the rationale for having them.
                ⚠️ The "why" is not deleted, it is relocated: the plan's own description carries it,
                where there is room and where they are reading rather than choosing.
                ⛔ AND IT NOW STATES THE SUBSTITUTION, WHICH IT ONLY GESTURED AT. Michael: *"we should
                mention alts that might happen sometimes."* The picks genuinely do not appear on every
                day — the rule is live, and an athlete who chose Chin Up and meets an Inverted Row on
                press day should have been told that here, not discover it in week one. */}
            {/* ⛔ ONE LINE, AND THE FIRST PARAGRAPH IS GONE (2026-07-29). It opened "Three short
                slots after the main lift" — word for word what the SUBTITLE two lines above it
                already said. The screen was paying four lines to say one thing twice, and the third
                dropdown fell below the fold as a result. What survives is the only claim the
                subtitle does not make: that the pick does not appear on every day. */}
            {/* ⛔ THE CARD NOW ASKS FOR TWELVE MOVEMENTS, NOT THREE (D-407).

                What was here described the RE-ROLING: "Three slots, placed by the day. Your picks
                are kept — on squat and deadlift days you get the leg work you chose; on bench and
                press days those slots carry triceps…" Every clause of that was true of the code and
                every clause of it was the app explaining an inference the athlete never asked it to
                make. Forever p.24 asks for one movement per category per day; asked directly, there
                is nothing to explain. */}
            {/* ⛔ IT WAS STILL SELLING THE ADD-ABS SLOT (Michael's replacement, 2026-08-19). The
                paragraph read *"plus an optional abs movement that shares the single-leg reps"* —
                a fourth slot and a rep-splitting rule that were both DELETED yesterday. The intro
                to a screen was describing a control that is not on it.
                ⚠️ `focus` TRIPS THE VOICE LINT and ships anyway — the same override already on
                record for "Speed focus" / "VO2 max focus". It is this screen's domain word for the
                chips, and one word for one concept beats a synonym per surface. ⛔ Do not "fix" it
                to satisfy the lint without asking. */}
            <ul className="space-y-1 list-disc list-outside ml-5 marker:text-white/30">
              {/* ⛔ THE STANDING PLAN'S FORK IS GONE FROM HERE (2026-08-24) — it has its own card
                  now, above. This copy is Wendler's week and it is true of Wendler's week. */}
              <li className="text-white/70 text-sm leading-relaxed pl-1">
                Three lifting days, each with a push, a pull and a single-leg or core movement.
              </li>
              <li className="text-white/70 text-sm leading-relaxed pl-1">
                Pick a focus and the days fill in.
              </li>
              <li className="text-white/70 text-sm leading-relaxed pl-1">
                Change to preferred movements below, or swap on the day.
              </li>
            </ul>

            {/* ── FOCUS CHIPS ───────────────────────────────────────────────────────────────────
                ⛔ A FOCUS RE-POINTS MOVEMENT CHOICE INSIDE A CATEGORY. It is not a new axis and it
                does not add volume — the frame stays push · pull · single-leg/core on all three days.
                Capped at three: past that every day is a focus day and the emphasis means nothing. */}
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-white/85 text-sm">Focus</span>
                <span className="text-white/50 text-xs">{state.assistancePicks.focus.length}/{FOCUS_CAP}</span>
              </div>
              {/* ⛔ FIVE ACROSS DOES NOT FIT, MEASURED RATHER THAN GUESSED (2026-08-19). On a 390px
                  viewport the card's content is ~358px. "Shoulders" is nine characters: ~59px of
                  glyphs at 12px plus chip padding and border is ~77px, and five of those with gaps
                  is ~400px. It only fits by dropping to 11px type, which is under a comfortable
                  label size and still breaks on a 360px phone.

                  ⛔ SO IT IS AN EVEN 3-COLUMN GRID INSTEAD OF A WRAP. Five chips in a flex-wrap
                  produce a ragged 4 + 1 — "Glutes" orphaned on its own line, which is what reads as
                  broken. A grid gives 3 + 2 with equal widths, which reads as a layout rather than
                  an accident, and every chip keeps a full-size tap target. ⚠️ Do not "tidy" this
                  back to flex-wrap; the raggedness was the complaint. */}
              <div className="grid grid-cols-3 gap-2">
                <GalaxyButton
                  shape="chip"
                  variant={state.assistancePicks.focus.length === 0 ? 'primary' : 'secondary'}
                  onClick={() => setState((st) => ({
                    ...st,
                    assistancePicks: {
                      ...st.assistancePicks,
                      focus: [],
                      by_day: buildDefaultWeek([], strengthEquipment),
                    },
                  }))}
                >Balanced</GalaxyButton>
                {/* ⛔ THE `core` CHIP IS GONE FROM HERE (2026-08-24). It existed for the Standing
                    Plan alone — B2's cell bias — and that path now has the Dial on its
                    own card, where Core moves volume instead of nudging a cell. `isFocusChip` never
                    accepted it on this screen, so nothing about Get Stronger changes. */}
                {FOCUS_CHIPS.map((chip) => {
                  const on = state.assistancePicks.focus.includes(chip);
                  const atCap = !on && state.assistancePicks.focus.length >= FOCUS_CAP;
                  return (
                    <GalaxyButton
                      key={chip}
                      shape="chip"
                      variant={on ? 'primary' : 'secondary'}
                      disabled={atCap}
                      onClick={() => setState((st) => {
                        const next = on
                          ? st.assistancePicks.focus.filter((f) => f !== chip)
                          : [...st.assistancePicks.focus, chip].slice(0, FOCUS_CAP);
                        // ⛔ CHANGING THE FOCUS REBUILDS THE WEEK. The alternative — keeping whatever
                        // is in the slots and only re-pointing the untouched ones — needs a
                        // per-slot "did they choose this" flag, and a half-applied focus is worse
                        // than an honest one: the athlete taps Chest and reads three days that are
                        // mostly not chest.
                        return {
                          ...st,
                          assistancePicks: {
                            ...st.assistancePicks,
                            focus: next as FocusChip[],
                            by_day: buildDefaultWeek((next as string[]).filter((f) => f !== 'core') as FocusChip[], strengthEquipment),
                          },
                        };
                      })}
                    >{(chip as string) === 'core' ? 'Core' : FOCUS_LABEL[chip]}</GalaxyButton>
                  );
                })}
              </div>
            </div>

            {/* ── THE PULL-UP PROGRESSION ───────────────────────────────────────────────────────
                ⛔ A DIFFERENT AXIS FROM THE FOCUS CHIPS, AND IT IS SEPARATED ON THE SCREEN FOR THAT
                REASON. A chip biases which movement fills a category; this is a PROGRAMME — it pins
                the pull category to chins on all three days, sets the volume off Wendler's own
                prescription, and tracks a number that climbs. Rendering it as a seventh chip would
                teach the athlete it is the same kind of choice, and it is not.
                ⚠️ THE COPY NAMES THE DOSE AND THE STANDARD SEPARATELY. 50 reps in 10 minutes is a
                SESSION measure; a max-clean-rep figure is not the same measurement, and the two must
                never be merged into "progress toward 50". */}
            {/* ⛔⛔ THE "ADD ABS" ROW IS DELETED (Michael, 2026-08-18) — AND SO IS THE FOURTH SLOT
                IT DROVE. Do not rebuild either; the reason is that abs were never a fourth bucket.

                It shipped that morning to fix a real problem — *"abs are lost if the user doesn't
                know to open the adjustment"* — and the fix was the wrong shape. Abs already ARE a
                single-leg/core movement in the catalog: Hanging Leg Raise, Ab Wheel, Weighted
                Sit-Up and DB Side Bend all sit in that category, and `BALANCED_WEEK.bench` already
                defaults to Hanging Leg Raise. The add-on gave the athlete a SECOND way to ask for a
                movement they could already choose in the slot itself, then halved the slot's reps
                to pay for it (`splitRepsForAbs`: 30 -> 15/15).

                ⛔ SO THE ANSWER IS THE SAME ONE THE OTHER TWO SLOTS GET: pick your preferred
                movement in the Single-leg / core field, exactly like Push and Pull. Choose an abs
                movement there and it takes the WHOLE slot budget instead of half of it. One
                question per slot, three slots, no optional fourth.

                ⚠️ WHAT THIS COSTS, STATED: abs on every lifting day used to be one tap. It is now
                three picks, one per day card. That is the same number of taps the athlete spends on
                any other preference, and it buys back the full rep total on whichever days they
                choose it. */}


            {/* ⛔ AND IT IS NOT ON THE STANDING PLAN AT ALL (Michael, 2026-08-24): that plan trains
                pull-ups as a MAIN lift — heavy Monday, fast Thursday, the earn ladder, progression
                off the tested max — so a daily-chins add-on would double-load the pull pattern and
                add volume the set ledger cannot see. Its screen simply does not carry this row; the
                gate that used to say so here is gone with the fork. */}
            <div
              className="rounded-lg border transition"
              style={state.assistancePicks.performance_focus === 'pullups'
                ? { borderColor: `${getDisciplineColor('strength')}66`, backgroundColor: `${getDisciplineColor('strength')}14` }
                : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <button
                type="button"
                onClick={() => setState((st) => ({
                  ...st,
                  assistancePicks: {
                    ...st.assistancePicks,
                    performance_focus: st.assistancePicks.performance_focus === 'pullups' ? null : 'pullups',
                  },
                }))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  {/* ⚠️ "ADD …", MATCHING THE HARD-DAY CARD'S "+ Add a run" (Michael, 2026-08-19).
                      "Pull-up progression" named a THING; the row is an ACTION that turns it on, and
                      an athlete scanning for what they can add was reading a noun. */}
                  <p className="text-white/80 text-sm">Add pull-up progression</p>
                  <p className="text-white/45 text-xs mt-0.5">Build your chin-up number up — chins every day, tracked.</p>
                </div>
                <span
                  className="shrink-0 w-[18px] h-[18px] rounded-full border-2 grid place-items-center transition"
                  style={{
                    borderColor: state.assistancePicks.performance_focus === 'pullups' ? getDisciplineColor('strength') : 'rgba(255,255,255,0.25)',
                    backgroundColor: state.assistancePicks.performance_focus === 'pullups' ? getDisciplineColor('strength') : 'transparent',
                  }}
                >
                  {state.assistancePicks.performance_focus === 'pullups' && (
                    <span className="text-[9px] text-black font-bold leading-none">✓</span>
                  )}
                </span>
              </button>
              {state.assistancePicks.performance_focus === 'pullups' && (
                <p className="text-white/65 text-xs px-3 pb-3 -mt-0.5 leading-relaxed">
                  Chins every lifting day, grip varying, tracked to Wendler's {SESSION_STANDARD_REPS}-in-{SESSION_STANDARD_MINUTES} standard.
                  {/* ⛔ NO HARDCODED DIVISOR (§1h, 2026-08-16). These two calls passed a literal `4`,
                      so the note would keep quoting a four-way split however the library divided —
                      the screen and the engine disagreeing about the dose, which is the defect this
                      whole pass exists to close. The count comes from `weeklyVolumeFor`'s own
                      default; slice 4 moves that default to 3 and the note follows it with no edit
                      here. ⚠️ Until slice 4 lands this still reads the old number — it is now WRONG
                      IN ONE PLACE instead of two, and that place is the library. */}
                  {' '}{pullupDoseNote(weeklyVolumeFor(pullupMaxReps), pullupMaxReps)}
                  {' '}It replaces your pull pick on all three days while it is on.
                  {weeklyVolumeFor(pullupMaxReps).assistedOnRamp
                    ? ' Band-assisted reps are logged separately, so they never count as clean ones.'
                    : ''}
                </p>
              )}
              {/* ⛔ THE TEST PROMPT — ACTIVE PROGRESSION AND NO MAX ON FILE, AND NOTHING ELSE
                  (Michael, 2026-08-19). Unknown capacity now takes the CONSERVATIVE dose — the same
                  ~50/week band on-ramp a tested zero gets — rather than the full 100, because 100
                  chins a week is the maximal prescription and handing it out on no evidence is
                  exactly the "unknown buys the ceiling" trap §0h exists to prevent.
                  ⛔ THIS LINE IS WHAT KEEPS THAT A SHORT STATE RATHER THAN A PERMANENT ONE. One set
                  to failure and the prescription jumps to its real tier.
                  ⚠️ IT DISAPPEARS PERMANENTLY ONCE A MAX EXISTS, INCLUDING A TESTED ZERO — zero is
                  an answer, and an athlete who gave it must not be asked again.
                  ⚠️ `pullupMaxReps` IS ALREADY NULL-SAFE at :1401: it reads `performance_numbers`
                  and returns null for absent, empty or unparseable, so `== null` is the whole
                  test. ⛔ Do not add `|| 0` here — that would erase the distinction this change
                  was made to preserve. */}
              {state.assistancePicks.performance_focus === 'pullups' && pullupMaxReps == null && (
                <p className="text-white/45 text-xs px-3 pb-3 -mt-1.5 leading-relaxed">
                  {PULLUP_TEST_PROMPT}
                </p>
              )}
              {/* ── THE SWIM COLLISION ──────────────────────────────────────────────────────────
                  ⛔ THE PROGRESSION WINS AND THE ATHLETE IS WARNED (Michael, 2026-08-17).

                  The Viada lat quarantine locks the pull slot to its floor for any athlete who
                  swims — swimming is thousands of unweighted pull-ups, and the lats, teres major
                  and shoulder capsule are under continuous tension through the catch of every
                  stroke. The progression asks for Wendler's 100 chins a week. Two rules, one
                  bucket, opposite directions.

                  ⚠️ D-407/D-423 SETTLES IT: the engine advises, the athlete decides. They toggled
                  this on by name, so it is honoured and the gate yields. What they get is this
                  line — the same shape as the eccentric cost note, and for the same reason.
                  ⛔ Do not "resolve" this by capping the progression; that is the override those
                  decisions were written to delete. */}
              {state.assistancePicks.performance_focus === 'pullups'
                && state.posture?.swim === 'maintain' && state.swimDays > 0 && (
                <p className="text-amber-200/70 text-xs px-3 pb-3 -mt-1.5 leading-relaxed">
                  Combining a high-volume pull-up progression with swim training places extreme,
                  continuous tension on the lats and shoulder capsule. Proceed with caution.
                </p>
              )}
            </div>

            {/* ── THE FOUR DAY CARDS ────────────────────────────────────────────────────────────
                ⛔ COLLAPSIBLE, MATCHING `StrengthLogger.tsx`'s accordion. Twelve dropdowns stacked
                open is four screens of scrolling on a phone, and the athlete loses the shape of the
                week entirely. First day open, the rest collapsed to their one-line summary — the
                same pattern, so the two screens do not teach two different interactions. */}
            {/* ⛔ THE STANDING PLAN'S FLAT NINE-PICK LIST IS GONE FROM HERE (2026-08-24) AND MUST
                NOT COME BACK. It was this screen's last attempt at serving both plans: the day cards
                are Wendler's three lifting days, and on the Viada frame the grouping was a LIE, so
                the fix was to drop the grouping and show nine dropdowns in a column.
                ⛔ THAT WAS STILL THE WRONG NINE. The picks themselves were Wendler's categories —
                three of them could never place in that frame at all — which is why the whole screen
                moved rather than the layout. See the Standing Plan card above. */}
            <div className="space-y-2">
              {LIFT_DAYS.map((day) => {
                const picks = state.assistancePicks.by_day[day];
                const open = expandedAssistanceDay === day;
                // ⚠️ THREE SLOTS, NOT FOUR — `picks.abs` went with the add-on row (2026-08-18).
                const summary = [picks.push, picks.pull, picks.single_leg_core]
                  .filter(Boolean).map((n) => displayName(n as string)).join(' · ');
                return (
                  <div key={day} className="rounded-xl border border-white/12 bg-white/[0.03] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedAssistanceDay(open ? null : day)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                      aria-expanded={open}
                    >
                      <span className="min-w-0">
                        <span className="block text-white/85 text-sm">{LIFT_DAY_LABEL[day]}</span>
                        {!open && <span className="block text-white/55 text-xs truncate mt-0.5">{summary}</span>}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-3">
                        {ASSISTANCE_CATEGORIES.map((category) => {
                          // ⛔ THE DAY RANKS THE SINGLE-LEG/CORE MENU (2026-08-17). On the bench day
                          // — the block's one PURE UPPER day — the core movements lead and the
                          // high-eccentric leg work sorts dead last; on a lower day it inverts.
                          // ⚠️ ORDERING ONLY. Nothing is removed and nothing is substituted: the
                          // athlete may still pick anything on the list (D-407/D-423), and what a
                          // costly pick gets is the line below, not a swap.
                          const opts = optionsFor(category, strengthEquipment, day);
                          const value = picks[category];
                          const muscle = opts.find((o) => o.name === value)?.muscle ?? '';
                          // ⛔ THE PULL PICKER GOES QUIET WHILE THE PROGRESSION OWNS THE SLOT
                          // (2026-08-17, Michael, from the screen). The engine replaces the pull
                          // pick on every day when the progression is on — a live-looking picker
                          // beside that toggle reads as "you get both". The chins do not double;
                          // now the screen says so instead of leaving it to be asked.
                          const pulledByProgression = category === 'pull'
                            && state.assistancePicks.performance_focus === 'pullups';
                          if (pulledByProgression) {
                            return (
                              <div key={category} className="opacity-50">
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                  <span className="text-white/85 text-sm">{CATEGORY_LABEL[category]}</span>
                                  <span className="text-white/50 text-xs">pull-up progression</span>
                                </div>
                                <div className="w-full py-2 px-3 rounded-xl text-sm bg-white/[0.03] border border-white/8 text-white/60">
                                  Chins — set by the progression while it is on
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={category}>
                              <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className="text-white/85 text-sm">{CATEGORY_LABEL[category]}</span>
                                {muscle && <span className="text-white/50 text-xs">{muscle}</span>}
                              </div>
                              <select
                                value={value}
                                onChange={(e) => setState((st) => ({
                                  ...st,
                                  assistancePicks: {
                                    ...st.assistancePicks,
                                    by_day: {
                                      ...st.assistancePicks.by_day,
                                      [day]: { ...st.assistancePicks.by_day[day], [category]: e.target.value },
                                    },
                                  },
                                }))}
                                className="w-full py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white appearance-none"
                                style={{ fontSize: '16px' }}
                                aria-label={`${LIFT_DAY_LABEL[day]} ${CATEGORY_LABEL[category]} exercise`}
                              >
                                {/* ⛔ VALUE IS THE STORED NAME, LABEL IS WENDLER'S WORD. `Back
                                    Extension` is stored so the token resolves (D-322); the athlete
                                    reads "Back Raise", which is what the book calls it. */}
                                {opts.map((o) => (
                                  <option key={o.name} value={o.name} className="bg-neutral-900">{o.display}</option>
                                ))}
                              </select>
                              {/* ⛔ THE COST OF THE PICK, WHEN THERE IS ONE — heavy eccentric leg
                                  work on an upper day. Fact then consequence, no imperative: the
                                  athlete chose it and the app is not going to argue, it is going to
                                  say what happens. Silent on every safe pick. */}
                              {eccentricCostNote(value, day) && (
                                <p className="text-amber-200/70 text-xs mt-1.5 leading-snug">
                                  {eccentricCostNote(value, day)}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* ── ADD-ABS ───────────────────────────────────────────────────────────
                            ⛔ A SECOND MOVEMENT IN THE SINGLE-LEG/CORE CATEGORY, SHARING ITS REPS —
                            Forever p.32 ("one or two exercises per category"). It is NOT a fourth
                            category and it must never stack a fresh rep total: that would be pure
                            added fatigue charged against the endurance budget, which is the one
                            thing this whole model is arranged to protect. The split happens in
                            `resolveDayAssistance`; the copy below says so. */}
                        {/* ⛔⛔ THE PER-DAY "ABS" FIELD IS DELETED WITH THE CARD TOGGLE (Michael,
                            2026-08-18: *"kill add abs, but let users still choose their preferred
                            exercises like the other"*). Read this before adding a fourth field back.

                            It was a SECOND way to ask for a movement the Single-leg / core field
                            above already offers. Hanging Leg Raise, Ab Wheel, Weighted Sit-Up and
                            DB Side Bend are all `single_leg_core` entries — the bench day's default
                            IS Hanging Leg Raise. So the athlete could reach abs through two
                            different controls, and only one of them charged them half the slot.

                            ⛔ AND THE HALVING IS WHAT ACTUALLY DIED HERE. `splitRepsForAbs` paid for
                            the extra movement out of the same budget (30 -> 15/15), because Forever
                            p.32 allows two movements per category but this model cannot afford a
                            fourth 30. An athlete who wanted abs was quietly trading away half their
                            leg work to get them. Choosing an abs movement in the slot itself takes
                            the WHOLE budget, which is the honest version of the same choice. */}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* ⛔ THE REP-TOTAL GUIDANCE IS WENDLER'S MODEL AND THIS IS WENDLER'S SCREEN. The
                Standing Plan doses accessories as SETS with reps in reserve (stage 3) and says so
                on its own card. */}
            <p className="text-white/70 text-sm leading-relaxed">{ASSISTANCE_GUIDANCE}</p>
          </div>
        </StepLayout>
      )}

      {/* ⛔ THE ENDURANCE WEEK — ONE SCREEN (Michael's flow, 2026-08-24), replacing `volume` and
          `hardday` on the strength path. Both of those still render for every other goal; this step
          simply is not in their flow. See `EnduranceWeekCard.tsx` for why one screen. */}
      {currentStep === 'endurance' && (
        <StepLayout
          step={stepNo('endurance')} totalSteps={steps.length} title="Your endurance week"
          // ⚠️ NO SUBTITLE. Michael's header is the first thing on the card and it is verbatim; a
          // subtitle above it would be the app talking over him.
          onBack={back} onContinue={next}
          /**
           * ⛔ CONTINUE IS GATED ON EVERY ROW HAVING A SPORT (Michael, 2026-08-24). The rows start
           * neutral, so an ungated Continue would build a week off four unanswered slots — which is
           * exactly what the deleted pre-fill did silently.
           */
          canContinue={allSlotsChosen(slotSportsNow)}
          blockedReason={tintedReason(unansweredLine(slotSportsNow) ?? undefined)}
          /**
           * ⛔ THE LIVE RATE SITS IN THE CHROME, NOT IN THE BODY. It has to stay visible while the
           * slots below it change — a number that moves off-screen teaches nobody — and a `sticky`
           * element inside the scroll lifts over its own siblings the moment the content passes the
           * port height, which is how it ended up on top of the volume inputs.
           */
          footer={<EnduranceWeekRate slots={slotSportsNow} squat1RM={squat1RMNow} />}
        >
          {tierLine ? (
            <p className="text-white/55 text-xs mb-3" data-testid="tier-line">{tierLine}</p>
          ) : null}
          <EnduranceWeekCard
            allowedSports={allowedSlotSports.length > 0 ? allowedSlotSports : undefined}
            slots={slotSportsNow}
            /** ⛔ `sport` IS `null` WHEN A HARD SESSION IS REMOVED (2026-08-25). It clears the slot
             *  and `syncHardDays` drops the matching `hardDays` entry, so nothing about a session
             *  the athlete deleted travels to the composer. */
            onSlotChange={(key, sport) => setState((st) => {
              const slots = { ...(st.slotSports ?? emptySlotSports()), [key]: sport };
              // ⛔ THE HARD SLOTS' SESSIONS FOLLOW THEIR SPORT — see `syncHardDays`. Without this the
              // card would offer ride sessions on a slot the engine still had down as a run.
              return { ...st, slotSports: slots, hardDays: syncHardDays(st, slots) };
            })}
            /**
             * ⛔ THE SESSION CHOICES, INSIDE THE SLOT THEY BELONG TO (restored 2026-08-24). Same
             * option tables the old "High intensity days" card used — `singleSlotOptions` for the
             * ride, `RUN_GROUND_OPTIONS` for the run — writing the same `role`/`goal`/`ownership`
             * fields on the same `hardDays` entries. Nothing about the plumbing is new.
             */
            /** ⛔ WHAT THE COLLAPSED ROW SHOWS AFTER THE SPORT — the option table's own title. */
            hardSessionTitle={(key) => {
              const sport = slotSportsNow[key];
              // ⛔ NO SPORT, NO SESSION. The row shows its label alone until the athlete picks.
              if (!sport) return null;
              // ⚠️ THE LONG SLOT READS ITS OWN FIELD — see `renderHardFlavor` for why its club
              // answer is not in `hardDays`. Its only session answer is whether it is the club ride.
              if (key === 'long') return state.longClub ? 'Club ride' : null;
              const h = hardEntry(state, key);
              if (h?.ownership === 'club') return 'Club session';
              // ⛔ THE TITLE READS THE LIBRARY (2026-08-24): the chosen variant's label when one is
              // picked, the family's own label otherwise — never the old tables' copy.
              const variant = h?.archetype
                ? slotVariantOptions(key, sport).find((v) => v.id === h.archetype)?.label
                : null;
              return variant ?? slotFamilyFact(key, sport)?.title ?? null;
            }}
            renderHardFlavor={(key) => {
              const sport = slotSportsNow[key];
              // ⛔ THE SESSION CHOICES APPEAR WITH THE SPORT — there is nothing to choose between
              // before one is picked, and two empty option lists is the form this screen stopped being.
              if (!sport) return null;
              /**
               * ⛔ THE LONG SLOT'S CLUB ANSWER LIVES IN ITS OWN FIELD, NOT IN `hardDays` (slice 2b,
               * 2026-08-25). `hardDays` means "the hard sessions this athlete added" and its LENGTH
               * is what the endurance tier and the composer count — pushing a long entry into it
               * would charge the week for a hard day nobody asked for, which the handoff forbids
               * outright ("club on the long card does not consume a hard slot").
               */
              if (key === 'long') {
                return (
                  <div className="space-y-2">
                    <HardSlotChoices
                    slotKey="long"
                    sport={sport}
                    value={{ ownership: state.longClub ? 'club' : 'prescribed' }}
                    onChange={(patch) => setState((st) => {
                      if (patch.ownership == null) return st;
                      const club = patch.ownership === 'club';
                      /**
                       * ⛔ TICKING CLUB PINS THE DAY (Michael's ruling, 2026-08-25). A club session's
                       * day is fixed by the world, not chosen — so the moment it is marked club, the
                       * day stops being the engine's to propose. `touch` is the same flag a tap sets,
                       * which is what makes step 7 render the chip as the athlete's rather than the
                       * engine's, and what stops the pre-fill effect writing over it.
                       */
                      if (club) touch(scheduleRunShown ? 'longRun' : 'longRide');
                      return { ...st, longClub: club };
                    })}
                    />
                    {/* ⛔ HOW LONG IT RUNS — asked only once club is ticked, because it is only a
                        question about a session the app is not writing. The plan's own long-ride
                        target is compared against it on the week step; a club ride that comes up
                        short is ONE note there, never a block. */}
                    {state.longClub && (
                      <label className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl border border-white/12 bg-white/[0.03]">
                        <span className="text-white/85 text-sm">Usually runs about</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={state.longClubMinutes === '' ? '' : String(state.longClubMinutes)}
                            onChange={(e) => setState((st) => ({
                              ...st,
                              longClubMinutes: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)),
                            }))}
                            className="w-20 text-right bg-transparent border-b border-white/20 text-white text-sm py-0.5 focus:outline-none focus:border-white/60"
                          />
                          <span className="text-white/55 text-sm">min</span>
                        </span>
                      </label>
                    )}
                  </div>
                );
              }
              const h = hardEntry(state, key) ?? hardDefaultsFor(sport, key);
              return (
                <HardSlotChoices
                  slotKey={key}
                  sport={sport}
                  value={{ role: h.role, goal: h.goal, ownership: h.ownership, archetype: (h as { archetype?: string }).archetype }}
                  onChange={(patch) => setState((st) => {
                    const next = syncHardDays(st, slotSportsNow);
                    // ⚠️ INDEX RESOLVED AGAINST `next`, NOT `st` — `syncHardDays` may have dropped a
                    // removed slot, so the position in the rebuilt array is the only valid one.
                    const j = next.findIndex((h) => h.slot === key);
                    if (j < 0) return st;
                    // ⚠️ SPREAD THE PATCH LAST so an explicit `goal: undefined` CLEARS a stale one —
                    // a threshold slot carrying a leftover "speed" is a session nobody picked.
                    next[j] = { ...next[j], ...patch } as NonRaceState['hardDays'][number];
                    /**
                     * ⛔ CLUB PINS THE DAY (Michael's ruling, 2026-08-25) — the club meets when it
                     * meets, so its day is the world's answer and not the engine's to propose. Same
                     * `touch` a tap sets, so the chip reads as the athlete's and the pre-fill stops
                     * writing over it. ⚠️ Un-ticking does NOT release the pin: the day is still a day
                     * they answered, and silently handing it back to the engine would be the unpick
                     * this file has removed twice.
                     */
                    if (patch.ownership === 'club') touch(`hard:${j}`);
                    return { ...st, hardDays: next };
                  })}
                />
              );
            }}
            baselines={baselinesRow}
            easyPaceSecPerMi={paceMinPerMile ? paceMinPerMile * 60 : null}
            squat1RM={squat1RMNow}
            runVolume={state.targetMiles === '' ? '' : String(state.targetMiles)}
            onRunVolume={(v) => setState((st) => ({
              ...st, targetMiles: v === '' ? '' : Number(v), targetTouched: true,
            }))}
            rideHours={state.rideHours}
            onRideHours={(v) => setState((st) => ({ ...st, rideHours: v }))}
            unit={unit === 'km' ? 'km' : 'mi'}
          />
        </StepLayout>
      )}

      {/* ⛔ HOW MUCH — the volume card. Separated from the scheduler on purpose: deciding WHEN while
          looking at HOW MUCH is what made the old run card scroll past the fold on a phone. */}
      {currentStep === 'volume' && (
        <StepLayout
          step={stepNo('volume')} totalSteps={steps.length} title="How much"
          subtitle="Your holding dose while strength leads. All of it conversational."
          onBack={back} onContinue={next} canContinue={volumeCanContinue} blockedReason={tintedReason(volumeBlockedReason)}
        >
          <div className="space-y-4">
            {/* ⛔ NO ARGUMENT ON THIS CARD AT ALL — IT LEADS STRAIGHT INTO THE INPUTS (2026-08-10).
                ═══════════════════════════════════════════════════════════════════════════════════
                Two passes were needed to get here, and the first stopped one step short. What was
                here originally: six lines of Fyfe sitting BETWEEN the two fields, so on a phone the
                riding-hours question was off screen and an athlete who trains both never learned it
                existed. That moved behind the (i) on 2026-08-09, leaving one claim sentence above
                the inputs — *"Pace is not what competes with strength here — total work is."*

                ⛔ THAT SENTENCE IS GONE TOO. It was still a line of ARGUMENT at the top of a screen
                whose entire job is to take two numbers, and the framing the card needs is already in
                the subtitle: *"Your holding dose while strength leads."* An athlete who reads the
                claim and agrees does the same thing as one who never saw it — types a number. So it
                buys nothing at the top and costs the first line of the card.

                It is not deleted: it now OPENS `VOLUME_WHY`, ahead of the numbers that support it,
                which is the one place it can be read by someone who actually wants the reasoning.

                ⚠️ THE (i) MOVES TO THE INPUT LABEL, so the receipt stays one tap away with no line
                of its own. It hangs off whichever field renders first — bike-only athletes get it on
                the riding label — because a card can be missing either input and the tap must not
                disappear with it.

                ⚠️ Both corrections from 2026-08-06 live inside `VOLUME_WHY`: it was cycling rather
                than running, and volume-as-mediator is the authors' suggestion rather than their
                result. `strength-focus-copy.voice.test.ts` asserts both survive any trim, and runs
                every string through `voiceViolation()` — which is what the comment this all replaced
                only ever asked a human to remember to do. */}
            {posturePresent('run') && (
              <div>
                {/* ⛔ THE ATHLETE'S OWN UNIT. `unit` comes off their baselines and the payload
                    canonicalises back to miles on the way out — a metric athlete typing 22 means
                    22 km, and showing them "mi/wk" would silently take it as 22 miles. */}
                <p className="text-white/85 text-sm mb-2 flex items-center gap-1.5">
                  Weekly running to hold
                  <VolumeWhyToggle open={showVolumeWhy} onToggle={() => setShowVolumeWhy((v) => !v)} />
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric" min={0} placeholder={unit === 'km' ? 'e.g. 22' : 'e.g. 14'}
                    value={state.targetMiles === '' ? '' : String(state.targetMiles)}
                    onChange={(e) => setState((st) => ({ ...st, targetMiles: e.target.value === '' ? '' : Number(e.target.value), targetTouched: true }))}
                    className="w-28 py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white focus:outline-none focus:border-[var(--fc)]"
                    style={{ fontSize: '16px', ['--fc' as string]: `rgb(${getDisciplineColorRgb('run')})` }}
                  />
                  <span className="px-2.5 py-1 rounded-xl text-sm font-medium" style={{ backgroundColor: `rgba(${getDisciplineColorRgb('run')},0.16)`, color: `rgb(${getDisciplineColorRgb('run')})` }}>
                    {unit === 'km' ? 'km' : 'miles'} / week
                  </span>
                </div>
                {/* ⛔ ASK FOR THE FLOOR, NOT THE AVERAGE. "What do you run?" gets their good week —
                    the number they would tell a friend. For a MAINTENANCE dose the floor is the
                    correct input anyway, so the honest answer and the useful one are the same.
                    ⚠️ CUT TO ONE LINE (2026-08-09). The second sentence — "this is what the plan
                    builds around, and the sessions will not shrink to meet you" — is now the last
                    section of the (i), where it sits with the reason it is true. It was costing a
                    line of height on the screen whose whole defect was height. */}
                {/* ⛔ THE COUNT LIVES WITH THE VOLUME (Michael, 2026-08-18). It was on the
                    scheduler, two steps later — so the line below could never render its per-session
                    split ("about 1h a ride across 3 rides"), because the divisor had not been asked
                    for yet. That line is the unit-slip guard: it is how someone who types 20 meaning
                    MILES sees it come back as "6h40 a ride". It only works if both numbers are on
                    one card.
                    ⚠️ AND IT LEAVES THE SCHEDULER AS PURELY "WHICH DAYS", which is Michael's whole
                    reason for the reorder. */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-white/70 text-sm">across</span>
                  {/* ⛔ 1 IS A LEGAL ANSWER (Michael, 2026-08-19). The engine's floor was
                      `Math.max(2, …)`, so an athlete who could only run once a week had no way to
                      say it — and the engine would have built two if they had. Both are fixed. */}
                  {RUN_DAYS_CHOICES.map((n) => {
                    const on = (state.runDays === n);
                    return (
                      <button
                        key={n} type="button"
                        onClick={() => setState((st) => ({ ...st, runDays: n }))}
                        className="w-9 py-1.5 rounded-xl text-sm border"
                        style={on
                          ? { borderColor: `rgb(${getDisciplineColorRgb('run')})`, backgroundColor: `rgba(${getDisciplineColorRgb('run')},0.16)`, color: '#fff' }
                          : { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)' }}
                      >{n}</button>
                    );
                  })}
                  <span className="text-white/70 text-sm">runs a week</span>
                </div>
                {/* ⛔ THE SPLIT, COMPUTED FROM THE LIVE PINS (Michael, 2026-08-19). The ride line
                    below has stated its per-session figure since 2026-08-17 — it is the unit-slip
                    guard, how someone who types 20 meaning MILES sees it come back wrong — and the
                    run had none.
                    ⛔ IT KEYS OFF `longRunDay`, THE EXISTING DESIGNATION, and introduces no second
                    anchor concept. ⚠️ AND IT READS THE PIN LIVE RATHER THAN A SNAPSHOT: the long-day
                    toggle lives on the SCHEDULE step, two screens away, so a cached string would go
                    stale the moment the athlete walked back and cleared one. */}
                {(() => {
                  const miles = typeof state.targetMiles === 'number' && state.targetMiles > 0
                    ? state.targetMiles : 0;
                  const note = splitNote({
                    total: miles,
                    sessions: state.runDays,
                    hasLongDay: !!state.longRunDay,
                    fmt: (n) => `${roundMiles(n)} ${unit === 'km' ? 'km' : 'mi'}`,
                    noun: 'run',
                  });
                  return note ? (
                    <p className="text-white/70 text-sm mt-1.5 leading-relaxed">{note}</p>
                  ) : null;
                })()}
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  A week you can hit when work is bad, not your best one.
                </p>
                {/* ⛔ THE FYFE PARAGRAPH LIVED HERE AND IS NOW `VOLUME_WHY` IN
                    `src/lib/strength-focus-copy.ts`, BEHIND THE (i) ON THE LABEL ABOVE. It sat
                    BETWEEN the two inputs, six lines of it, and pushed the riding-hours question off
                    a phone screen — so the athlete who trains both never saw the second field. Its
                    whole substance moved, including the claim sentence that briefly stayed behind. */}
              </div>
            )}
            {state.posture?.bike === 'maintain' && (
              <div>
                {/* ⚠️ THE (i) ONLY RENDERS HERE WHEN THERE IS NO RUNNING FIELD ABOVE IT. One tap, one
                    place — a bike-only athlete would otherwise have no route to the rationale at
                    all, and an athlete with both would get the same panel offered twice. */}
                <p className="text-white/85 text-sm mb-2 flex items-center gap-1.5">
                  Weekly riding to hold
                  {!posturePresent('run') && (
                    <VolumeWhyToggle open={showVolumeWhy} onToggle={() => setShowVolumeWhy((v) => !v)} />
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric" min={0} placeholder="e.g. 3"
                    value={state.rideHours === '' ? '' : String(state.rideHours)}
                    onChange={(e) => setState((st) => ({ ...st, rideHours: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-28 py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white focus:outline-none focus:border-[var(--fc)]"
                    style={{ fontSize: '16px', ['--fc' as string]: `rgb(${getDisciplineColorRgb('bike')})` }}
                  />
                  <span className="px-2.5 py-1 rounded-xl text-sm font-medium" style={{ backgroundColor: `rgba(${getDisciplineColorRgb('bike')},0.16)`, color: `rgb(${getDisciplineColorRgb('bike')})` }}>
                    hours / week
                  </span>
                </div>
                {/* ⛔ THE UNIT SLIP IS THE REAL RISK AND A LABEL DOES NOT CATCH IT. 20 is plausible as
                    both hours and miles, and Michael entered 20 meaning MILES on his own field. The
                    label was already there and it did not help. What helps is showing the CONSEQUENCE:
                    at 20 the line below reads "about 6h40 a ride", and the mistake becomes obvious in
                    a way "hr/wk" never was.
                    ⚠️ Hours never miles is D-323 §6 — the app learns ride HR and FTP but no ride
                    speed, so bike miles cannot become a session length without guessing. */}
                {/* ⚠️ THE SPLIT NEEDS A DIVISOR THE ATHLETE ACTUALLY GAVE (2026-07-29). Ride days now
                    start at 0, and this line divided by `Math.max(1, rideDays)` — so before a count
                    was picked it read "About 20h a ride across 0 rides", which is a wrong number and
                    a broken sentence in one go. It waits for the count now; the unit-slip warning
                    this line exists for still fires the moment both are in. */}
                {/* ⛔ THE COUNT LIVES WITH THE VOLUME (Michael, 2026-08-18). It was on the
                    scheduler, two steps later — so the line below could never render its per-session
                    split ("about 1h a ride across 3 rides"), because the divisor had not been asked
                    for yet. That line is the unit-slip guard: it is how someone who types 20 meaning
                    MILES sees it come back as "6h40 a ride". It only works if both numbers are on
                    one card.
                    ⚠️ AND IT LEAVES THE SCHEDULER AS PURELY "WHICH DAYS", which is Michael's whole
                    reason for the reorder. */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-white/70 text-sm">across</span>
                  {/* ⚠️ 1/2/3/4 ON BOTH SPORTS. The ride cap was 3 in TWO places in the composer —
                      the hoisted count and a second re-derivation 1300 lines later — and raising
                      only the picker would have silently discarded a 4.
                      ⛔ AND IT DID, FOR TWO MORE DAYS (stage 4, 2026-08-21). `generate-strength-plan`
                      held a FIFTH copy of this range, still `Math.min(3, …)`, so a 4 tapped here was
                      rewritten one hop past the validator that had just accepted it — silently, with
                      nothing logged. The range has ONE statement now and this row reads it.
                      See `supabase/functions/_shared/athlete-weekly-intent.ts`. */}
                  {RIDE_DAYS_CHOICES.map((n) => {
                    const on = (state.rideDays === n);
                    return (
                      <button
                        key={n} type="button"
                        onClick={() => setState((st) => ({ ...st, rideDays: n }))}
                        className="w-9 py-1.5 rounded-xl text-sm border"
                        style={on
                          ? { borderColor: `rgb(${getDisciplineColorRgb('bike')})`, backgroundColor: `rgba(${getDisciplineColorRgb('bike')},0.16)`, color: '#fff' }
                          : { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)' }}
                      >{n}</button>
                    );
                  })}
                  <span className="text-white/70 text-sm">rides a week</span>
                </div>
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  {/* ⚠️ THE SAME HELPER AS THE RUN NOW. This computed its own even split inline —
                      correct while every ride was equal, and blind to the long ride the athlete had
                      pinned two screens away. One function, one rule, both sports. */}
                  {(() => {
                    const mins = Number(state.rideHours) > 0 ? Number(state.rideHours) * 60 : 0;
                    const note = splitNote({
                      total: mins,
                      sessions: state.rideDays,
                      hasLongDay: !!state.longRideDay,
                      fmt: (n) => {
                        const r = roundRideMinutes(n);
                        const h = Math.floor(r / 60); const mm = r % 60;
                        return h > 0 ? (mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`) : `${mm} min`;
                      },
                      noun: 'ride',
                    });
                    return note ?? 'Hours, not distance — terrain and wind make ride distance a poor measure.';
                  })()}
                </p>
              </div>
            )}
            {/* ── SWIM ─────────────────────────────────────────────────────────────────────────
                ⛔ THE SWIM MOVED ONTO THIS CARD (Michael, 2026-08-17). It had a screen of its own
                asking "swims per week", which made a booked courtesy hold look like a decision on the
                same footing as the running volume. It is a VOLUME question in its own unit and it
                belongs beside the miles and the hours.

                ⛔ YARDS *AND* A COUNT, AND THE COUNT IS NOT REDUNDANT. The plan holds a ~60-minute
                slot per swim; turning a weekly distance into a session length needs a swim PACE, and
                the app has never asked for one and does not learn it. So the distance is what the
                athlete thinks in and the count is what the calendar needs — and inventing the second
                from the first would be exactly the unsourced number this codebase keeps deleting.

                ⚠️ NOTHING DOWNSTREAM READS THE YARDS YET. It is stored on the goal so the swim can
                stop being a guess later; today `swim_days` is still what the engine books off, and
                the lat/shoulder gate on the assistance still keys on "does this athlete swim at all"
                (`docs/SPEC-viada-ingestion-order.md` §3). Flagged rather than quietly wired. */}
            {state.posture?.swim != null && state.posture?.swim !== 'out' && (
              <div>
                <p className="text-white/85 text-sm mb-2">Weekly swimming to hold</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric" min={0} step={100}
                    placeholder={unit === 'km' ? 'e.g. 3000' : 'e.g. 3000'}
                    value={state.swimVolume === '' ? '' : String(state.swimVolume)}
                    onChange={(e) => setState((st) => ({ ...st, swimVolume: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-28 py-2 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/12 text-white"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="px-2.5 py-1 rounded-xl text-sm font-medium" style={{ backgroundColor: `rgba(${getDisciplineColorRgb('swim')},0.16)`, color: `rgb(${getDisciplineColorRgb('swim')})` }}>
                    {unit === 'km' ? 'metres' : 'yards'} / week
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-white/70 text-sm">across</span>
                  {/* ⛔ 1/2/3, AND THE WIRE ACCEPTS 4 — the safe direction, and deliberate. The swim
                      stays minimal by standing decision (D-323 §5, booked not coached); this reads
                      the constant so the count has one owner, and adds nothing else. */}
                  {SWIM_DAYS_CHOICES.map((n) => (
                    <button
                      key={n} type="button" onClick={() => setState((st) => ({ ...st, swimDays: n }))}
                      // ⚠️ SWIM BLUE, NOT THE BLOCK ACCENT. Run miles wear gold and ride hours wear
                      // green on this card; the swim chips wore strength orange, which reads as a
                      // fourth discipline. Wayfinding is by sport everywhere else.
                      className="w-9 py-1.5 rounded-xl text-sm border"
                      style={state.swimDays === n
                        ? { borderColor: `rgb(${getDisciplineColorRgb('swim')})`, backgroundColor: `rgba(${getDisciplineColorRgb('swim')},0.16)`, color: '#fff' }
                        : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)' }}
                    >{n}</button>
                  ))}
                  <span className="text-white/70 text-sm">{state.swimDays === 1 ? 'swim' : 'swims'}</span>
                </div>
                {/* The card's own words, unchanged from the screen it replaces — the swim is held,
                    not coached, and the copy has to keep saying so or the slot reads as a workout. */}
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  Held on the calendar, not coached — no set, no target.
                </p>
              </div>
            )}
            {/* ⛔ WHAT THE NUMBER ABOVE ACTUALLY BUYS (Michael, 2026-08-18). Plain on the card, not
                behind the (i): *"if the app just asks for numbers it feels like a standard form. If
                it states WHY it needs them — that their cardio budget pays for their lifting volume —
                it teaches the hybrid doctrine while they build the plan. They stop fighting the
                limits because they understand the math."*

                ⚠️ IT IS A REAL CLAIM, NOT A REASSURANCE, AND IT IS TRUE OF THE CODE. These hours
                feed `resolveEnduranceTier`, which sets the accessory band before a single rep is
                authored (`docs/SPEC-viada-ingestion-order.md`). If it ever stops being true, delete
                the sentence — do not soften it.

                ⚠️ BELOW THE INPUTS, NOT ABOVE THEM, AND THAT PLACEMENT IS DELIBERATE. The card's
                own history is that a paragraph at the top pushed the riding field off a phone screen
                (2026-08-10, "NO ARGUMENT ON THIS CARD AT ALL"). Michael's instruction is that the
                note must be plainly visible and not behind a tooltip — it is both, without
                reintroducing the defect that rule was written for. */}
            {/* ⚠️ THE 8 IS THE REAL NUMBER, NOT A ROUND ONE. `resolveEnduranceTier` drops to the
                `survival` band — 25-30 reps, the block's floor — on `> 8 total hours` OR `>= 2 hard
                days`. Naming the threshold is the whole point: the athlete can see the cliff before
                they walk off it. ⛔ If that constant ever moves, this sentence moves with it. */}
            {/* ⚠️ LARGER THAN THE FIELD COPY AROUND IT (Michael, 2026-08-19: *"larger"*). It is the
                one sentence on this screen that is not about a field — it is the consequence of BOTH
                numbers together, and at `text-sm` in a column of `text-sm` it read as a third
                footnote. `text-base` and brighter, above the divider it already had. */}
            <p className="text-white/85 text-base leading-relaxed border-t border-white/10 pt-3">
              Over 8 hours a week of endurance, accessory lifting drops to the minimum. Main lifts
              don&rsquo;t change.
            </p>
            {/* ⛔ THE PANEL OPENS AT THE BOTTOM, NOT BESIDE THE (i) THAT TOGGLES IT. Rendering it
                inline under the running label would push the riding field off the screen the moment
                it is tapped — which is the exact defect this whole card was rewritten to fix, and it
                would arrive only for the athlete who asked for more detail. Below both inputs, it
                costs nothing until it is opened and nothing that matters after. */}
            {showVolumeWhy && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                {/* ⛔ SAME NEWLINE-TO-BULLET RULE AS `HARD_DAY_WHY` (2026-08-19). ⚠️ THE FYFE
                    SECTION IS MULTI-LINE AND ITS FIRST LINE IS THE CLAIM — which is what the
                    2026-08-10 ruling protects and what `strength-focus-copy.voice.test.ts` asserts
                    (`VOLUME_WHY[0].body` STARTS WITH it). Rendering it as the first bullet keeps
                    both true. */}
                {VOLUME_WHY.map((s) => {
                  const lines = s.body.split('\n');
                  return (
                    <div key={s.heading}>
                      <p className="text-white/70 text-xs font-medium">{s.heading}</p>
                      {lines.length > 1 ? (
                        <ul className="list-disc list-outside ml-4 space-y-0.5 marker:text-white/25">
                          {lines.map((l) => (
                            <li key={l} className="text-white/45 text-xs leading-snug pl-0.5">{l}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-white/45 text-xs leading-snug">{s.body}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </StepLayout>
      )}

      {/* ⛔ THE SCHEDULER — one screen for every WHEN question, and the week underneath it.
          Replaces the run, bike and hard-day cards, which asked the same question in three places
          and none of which could show the answer. */}
      {(currentStep === 'schedule' || currentStep === 'hardday') && (
        <StepLayout
          step={stepNo(currentStep)} totalSteps={steps.length}
          // ⛔ "HIGH INTENSITY DAYS", NOT "HARD DAYS" (Michael, 2026-08-18). "Hard" is how an athlete
          // describes a session that hurt; INTENSITY is what the block is actually budgeting, and it
          // is the word every rule on this screen turns on — the CNS tax, the rep ceiling, the
          // interference effect. ⚠️ The state key stays `hardDays`: renaming storage would strand
          // every goal already written, and the athlete never sees a key.
          title={currentStep === 'hardday' ? 'High intensity days' : 'Your week'}
          subtitle={currentStep === 'hardday'
            // ⚠️ "None is a valid answer" MOVED INTO THE CARD'S LEAD LINE (2026-08-19), where it
            // sits beside the buttons it is about. Two places said it; the subtitle yielded because
            // the card is where the athlete acts.
            ? 'How much intensity the block carries.'
            /**
             * ⛔ IT NAMED HALF THE SCREEN (punch item 7, 2026-08-25). *"Your days. The lifting is
             * placed around them."* was written when this card asked only about the barbell — but
             * the long day and the hard days are ENDURANCE anchors, and what gets placed around
             * them is the lifting AND every easy run and ride. The sentence described one of the
             * two things the athlete is looking at.
             * ⚠️ IT ALSO NAMES THE SPLIT the card now has: the days are the question, the rest of
             * the week is the answer under it.
             */
            : 'Place the days you can’t move — ride and run clubs, long days. The lifting is placed around them.'}
          onBack={back} onContinue={next}
          // ⚠️ THE HARD-DAY STEP NEVER BLOCKS. Its own row is optional — "None" is a real answer —
          // and `scheduleCanContinue` is about the per-week COUNTS, which live on the other step.
          canContinue={currentStep === 'hardday' ? true : scheduleCanContinue}
          blockedReason={currentStep === 'hardday' ? undefined : scheduleReasonNode}
        >
          {/* ⛔ WHY THIS SCREEN IS A COLUMN OF OPEN CARDS — THE HISTORY, KEPT (2026-08-25).
              ═══════════════════════════════════════════════════════════════════════════════════
              FOUR LAYOUTS HAVE NOW FAILED HERE, and the first three failed the same way: the card's
              parts were laid out in a COLUMN, every part competed for the fold, and whichever lost
              went off screen.

                1. Three `<select>`s under a nine-rem empty box → the day controls were below the
                   fold and the box showed no selection at all.
                2. (2026-08-09) An answer card + a shared day row + the counts + the rationale + the
                   terrain menu, stacked → the day chips floated with no container of their own, and
                   the hard-day rationale ended up several hundred pixels BELOW the control it
                   explains. Michael, on the device: *"shouldn't these day chips stay in a box"* and
                   *"description gets totally lost."*
                3. (2026-08-10) A DISCLOSURE LIST — five questions, one open at a time, each row
                   showing its ANSWER when closed. It fixed 1 and 2 and it was right for FIVE rows.

              ⛔ AND THEN THE SCREEN GOT SMALLER, WHICH IS WHAT RETIRED IT (Michael, round 3,
              2026-08-25). The per-week counts moved to the volume card and the hard sessions' own
              What-question moved to the endurance step. THREE day rows were left, and a disclosure
              list over three rows charges a tap to see each answer's control while hiding the other
              two — the fold it was defending is no longer under threat.

              ⛔ SO THE CONTAINMENT RULE SURVIVES AND THE HIDING DOES NOT. Every picker still lives
              inside its own bordered card with its own label and its own note, so a control can
              still never drift away from the sentence that explains it. What changed is that all
              three are open at once, and the master strip above them shows the week they produce.
              ⛔ Do not reintroduce one-open-at-a-time without a fourth row to justify it. */}
          <div className="space-y-3">
            {/* ⛔⛔ THE MASTER STRIP LEADS THE SCREEN (Michael, round 3, 2026-08-25). The week the
                athlete is editing is the first thing on it, and it redraws on every pin — so a tap
                and its consequence are one glance apart instead of one scroll. The worded list at
                the bottom is unchanged and is still the detail view; this is the shape.
                ⚠️ IT IS NOT A CONTROL. Nothing here is tappable — the pickers below own every
                decision. A strip that both reported and edited is the fusion this screen was
                rebuilt to end. */}
            {(previewWeek?.length ?? 0) > 0 && (
              <div className={previewing ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
                <WeekStrip byDay={placedWeekByDay} />
              </div>
            )}

            {/* ⛔⛔ THE `hardday` DISCLOSURE BLOCK STOOD HERE AND IS DELETED (Michael, 2026-08-25).
                ~830 lines: the one-open-question row list, its collapsed answer lines, a second copy
                of the day pickers, and a second copy of the club toggle and archetype menus.

                ⛔ IT WAS UNREACHABLE. `hardday` is a `StepKey` that `scheduleSteps()` never pushes —
                the What-question moved onto the `endurance` step, where `HardSlotChoices` owns the
                session choice and the club toggle. So `currentStep` could not equal `'hardday'` on
                any path, and every control in here was a duplicate of one the athlete actually uses.
                ⚠️ THE CLUB CONTROL IS NOT LOST WITH IT — it is `HardSlotChoices` on the endurance
                step, writing the same `ownership` field, and it was confirmed working before this
                deletion. The copy in here had drifted: no "Replaces this hard session." sub-label.

                ⛔ AND THE DISCLOSURE PATTERN ITSELF IS GONE FROM THIS SCREEN, deliberately — see the
                note on the always-open pickers above for why three rows do not earn it. The
                three-failed-layouts history that argued for it is preserved there. */}
            {/* ⛔⛔ EVERY PICKER IS OPEN, ALWAYS (Michael, round 3, 2026-08-25). THE DISCLOSURE LIST
                IS GONE FROM THIS STEP — read the three-failed-layouts note above before restoring it.

                Its argument was that five questions stacked in a column all compete for the fold.
                That was true of FIVE. This step is down to three, the counts moved to the volume
                card and the hard sessions' own What-question moved to the `hardday` step, so what is
                left is three day rows — and a disclosure list over three rows costs a tap to see
                each answer's control while hiding the other two. ⚠️ The `hardday` step KEEPS the
                list: it still carries the archetype menus, the club toggle and the add/remove
                buttons, which is the shape the list was built for.

                ⛔ ONE ROW PER SESSION, NOT ONE ROW PER QUESTION. The long day, the hard run and the
                hard ride are three separate answers and each gets its own card, so no card's border
                ever contains another card's controls. */}
            {longRowShown && (
              <div className="rounded-xl border border-white/10 px-3 py-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-white/85 text-sm">
                    {scheduleRunShown ? 'Long run' : 'Long ride'}
                    {state.longClub && <span className="text-white/45"> — club ride</span>}
                  </span>
                  {/* ⛔ A CLUB SESSION IS NOT ASKED WHERE IT SHOULD GO (slice 2b). Only the athlete
                      knows when the club meets, so the question changes from a choice to a fact. */}
                  <span className="text-xs" style={{ color: `rgba(${longRowRgb},0.85)` }}>
                    {longRowDay
                      ? `${DAY_SHORT[longRowDay as DayName]}${
                        longRowMoved ? ' — placed' : state.longClub ? ' — club' : ' — yours'}`
                      : (state.longClub ? 'Which day does it meet?' : 'Tap a day')}
                  </span>
                </div>
                <WeekDayRow
                  selected={longRowDay ? [longRowDay as DayName] : []}
                  plain
                  pinned={(state.longClub || !!touchedUnits[scheduleRunShown ? 'longRun' : 'longRide'])
                    && !!longRowDay && !longRowMoved}
                  accentRgb={longRowRgb}
                  roles={{}}
                  stacked={[]}
                  taken={anchorDaysTaken(state, scheduleRunShown ? 'long run' : 'long ride')}
                  disabled={[]}
                  onTap={(d) => {
                    touch(scheduleRunShown ? 'longRun' : 'longRide');
                    if (scheduleRunShown) {
                      setState((st) => ({ ...st, longRunDay: st.longRunDay === d ? '' : d }));
                    } else {
                      setState((st) => ({ ...st, longRideDay: st.longRideDay === d ? '' : d }));
                    }
                  }}
                />
              </div>
            )}

            {state.hardDays.map((h, i) => {
              const dayVal = dayForSlot(i);
              const rgb = getDisciplineColorRgb(h.discipline === 'bike' ? 'bike' : 'run');
              const label = `${h.discipline === 'bike' ? 'Hard ride' : 'Hard run'}${
                h.ownership === 'club' ? ' — club session'
                  : hardRoleOf(i) === 'threshold' ? ' — sustained threshold'
                    : ' — top-end intensity'}`;
              return (
                <div key={`hard-card-${i}`} className="rounded-xl border border-white/10 px-3 py-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-white/85 text-sm">{label}</span>
                    {/* ⚠️ THE CUE NAMES WHOSE ANSWER IT IS, not just which day. "Yours" is the
                        word that makes the filled chip mean something. */}
                    <span className="text-xs flex items-baseline gap-1 min-w-0" style={{ color: `rgba(${rgb},0.85)` }}>
                      <span className="shrink-0">
                        {dayVal
                          ? `${DAY_SHORT[dayVal as DayName]}${
                            h.ownership === 'club' ? ' — club' : isPinned(i) ? ' — yours' : ' — placed'}`
                          : (h.ownership === 'club' ? 'Which day does it meet?' : 'Tap a day')}
                      </span>
                      {/* ⛔ THE TAP CUE, ON THE ENGINE'S DAYS ONLY (Michael, 2026-08-25). A placed
                          chip looks answered, so nothing said the athlete could take it — the pinned
                          and club states already read as theirs and need no invitation.

                          ⛔ IT DROPS FIRST WHEN THE LINE IS TIGHT, and that is what `truncate` on
                          THIS span and `shrink-0` on the status above it buy: the day and who owns
                          it are the load-bearing half and survive every width; the cue is the half
                          that can go. ⚠️ No breakpoint — a hardcoded width would guess at a device.
                          ⚠️ ZERO NEW VERTICAL SPACE: same line, same row, no new element box. */}
                      {dayVal && h.ownership !== 'club' && !isPinned(i) && (
                        <span className="truncate text-white/45">· tap to change</span>
                      )}
                    </span>
                  </div>
                  <WeekDayRow
                    selected={dayVal ? [dayVal as DayName] : []}
                    plain
                    pinned={isPinned(i)}
                    accentRgb={rgb}
                    /* ⛔ A DAY THE ATHLETE CANNOT TRAIN IS DIMMED, NOT REMOVED, and it is NOT
                       locked: pinning a hard session onto a blocked day is a contradiction the
                       athlete is allowed to enter — it comes back as a note, per the ruling. */
                    disabled={[]}
                    roles={{}}
                    stacked={[]}
                    /* ⛔ NOTHING IS DISABLED. The other slot's day is NOT locked: two hard sessions
                       on one day still builds as one, and the PLAN says so — a lock made it look
                       like a broken button. */
                    taken={{}}
                    onTap={(d) => {
                      // ⛔ THE TAP MARKS THIS UNIT DIRTY WHATEVER IT DOES — set, move or CLEAR.
                      // Clearing is the case that matters: it is an answer, and the engine used to
                      // read it as an empty field and refill it.
                      touch(`hard:${i}`);
                      setState((st) => {
                        const next = [...st.hardDays];
                        const cur = next[i];
                        if (!cur) return st;
                        next[i] = { ...cur, day: cur.day === d ? '' : d };
                        return { ...st, hardDays: next };
                      });
                    }}
                  />
                  {/* ⛔ THE "picked X, placed Y" LINE IS GONE (pins-win, 2026-08-25) — the two are
                      the same day now, so there was nothing left for it to reconcile. What the
                      pinned week costs is stated once, in the tiered notes below, because a
                      clearance breach is a fact about a PAIR of sessions and belongs beside neither
                      one of them on its own. */}
                </div>
              );
            })}
            {/* ⛔ ONE LINE, UNDER BOTH PICKERS (Michael, round 4, 2026-08-25). It was a bullet inside
                the disclosure row's lead copy and went with that structure; it is a fact about what
                counts as a hard day, so it belongs under the two cards it describes rather than
                inside either one.
                ⚠️ THE CONTROL IT REFERS TO IS ON THE ENDURANCE STEP, not here — `HardSlotChoices`
                carries the club toggle beside the session choice, which is where the athlete says
                WHAT the session is. This step only asks WHEN. The sentence is here because this is
                where the count matters. */}
            {state.hardDays.length > 0 && (
              <p className="text-white/60 text-xs leading-snug px-1">
                A club ride or run counts as a high intensity day.
              </p>
            )}
            {state.hardDays.length === 0 && (
              <p className="text-white/45 text-xs leading-snug px-1">
                No high intensity sessions in this block. Nothing to place.
              </p>
            )}

            {/* ⛔ DAYS YOU CANNOT TRAIN — the third kind of pin (handoff §3, 2026-08-25). Same chip
                row, same absoluteness: the endurance sessions arrange around it.

                ⛔ AND THE ENGINE JUGGLES BEFORE IT WARNS (Michael, 2026-08-25). Blocking a day
                moves the ENDURANCE off it outright — it is movable by definition — and the lifting
                frame is ROTATED to try to land its empty day there, all seven rotations scored. A
                lifting day sits on a blocked day only when no rotation honours every pin at once,
                and the note then names the pins that collided.
                ⚠️ NO SPORT COLOUR — this is the absence of training, not a discipline. */}
            <div className="rounded-xl border border-white/10 px-3 py-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-white/85 text-sm">Days you can&rsquo;t train</span>
                <span className="text-xs text-white/45">
                  {unavailableDays.length === 0
                    ? 'None'
                    : unavailableDays.map((d) => DAY_SHORT[d]).join(' · ')}
                </span>
              </div>
              <WeekDayRow
                selected={unavailableDays}
                plain
                pinned
                accentRgb="255,255,255"
                roles={{}}
                stacked={[]}
                taken={{}}
                disabled={[]}
                onTap={(d) => setUnavailableDays((cur) =>
                  cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])}
              />
            </div>


            {/* ⛔ THE GATE STATES ITSELF — a disabled Continue that says nothing is indistinguishable
                from a broken one (the race card learned that 2026-08-06). The reason NOW renders in
                the footer right above the Continue key (StepLayout `blockedReason`), not here below
                the rows where it scrolled off-screen while the dead button stayed visible — the exact
                disconnect that let an athlete miss the "Runs a week" count. One sentence, one place,
                at the button. */}

            {/* ── SCHEDULE HEALTH ──────────────────────────────────────────────────────────────
                ⛔ PINNED DIRECTLY ABOVE THE WEEK (Michael, 2026-08-18), so it answers the tap that
                caused it. It reads the SAME model that will build the block — one solve, run as they
                move a chip — so the badge and the plan agree by construction rather than by luck.

                ⛔ ONLY CLEARANCE COLLISIONS LIGHT IT. A ride the week had no room for, a crowded
                day, the interleaving preference: real costs, none of them biological collisions.
                Folding those in would light the badge on weeks where nothing is breached and the
                warning would stop meaning anything. A week with no rest day is excluded for the same
                reason.

                ⛔ NEUTRAL SURFACE, NOT A COLOUR. This app already spends amber on STRENGTH and green
                on RIDE — a coloured badge here would read as a discipline, which is the wayfinding
                language the rest of the wizard is built in. The state is carried by an ICON and the
                WORDS; the surface stays the card's own.

                ⚠️ A COUNT, NEVER A PERCENTAGE. A week either breaches a clearance or it does not,
                so a score would be a number with no scale behind it — the "score that lies" this
                codebase keeps deleting. It says how many, and tapping shows exactly which. */}
            {/* ⛔⛔ THE LEGEND IS GONE, AND SO ARE THE LETTERS IT DECODED (2026-08-25).
                It read `H hard · LR/LB long · E/B easy run/ride · S lifting only · ×2 = two
                sessions` — written 2026-08-24 because the chips were not "clearly telling you where
                the hard days are, easy days, stacks". That reading was right and the legend was the
                wrong answer to it: **a legend is the screen admitting its own notation failed.**
                Nothing decodes now because nothing is encoded — the week is stated once, in words,
                in the answer zone below, where "Hard Run 41m" needs no key.
                ⚠️ THE ×2 BADGE IS NOT REDESIGNED, it simply has no chip left to sit on
                (Michael's call, 2026-08-24 — the wording stands wherever coded chips still render,
                which is the race path's accumulating week row). */}
            {/* ⛔⛔ THE ENGINE SAID WHAT IT COULD NOT HONOUR AND THIS SCREEN THREW IT AWAY
                (traced on the dev preview, 2026-08-25 — task 0 of the handoff).

                **What is actually happening.** The Standing Plan week is a FIXED-ORDER FRAME: which
                frame day carries a hard session is fixed, and the only freedom `chooseDayMap`
                (`_shared/standing-plan/day-map.ts`) has is which weekday frame-day-1 lands on. It
                scores the seven rotations with the long day weighted above everything —
                `LONG_RUN_WINS`, and its own copy says why — so a long ride pinned to Saturday fixes
                the rotation, and at that rotation the frame's hard days are Monday and Wednesday.
                A hard day pinned to Friday is then unreachable.

                ⛔ AND THAT IS NOT A SILENT OVERRIDE — THE ENGINE WRITES THE SENTENCE. Measured on
                the wire: `plan.placement_compromises` came back with *"The hard session is on Monday
                and Wednesday rather than Thursday. The week's order is fixed and the long day is
                placed first, so Thursday could not also be reached."* The screen rendered
                `<WeekGrid notes={[]} />` and printed none of it. So the athlete saw their day in the
                row, a different day in the week, and a green tick between them.

                ⚠️ NOT THE SAME QUESTION AS THE HEALTH BADGE, WHICH IS WHY IT IS ITS OWN ROW. That
                badge is the CLIENT clearance model — biological collisions between sessions. This is
                the SERVER saying a pin was not reachable. Both can be true, neither implies the
                other, and folding them into one count would be a number with two meanings.

                ⛔ IT SITS WITH THE SELECTORS, NOT UNDER THE WEEK. Feedback lands where the choice
                was made — the day chips above are what caused it.
                ⛔ AND IT IS THE ENGINE'S OWN WORDS, printed verbatim. Re-wording them client-side is
                how the screen and the plan come to describe the same week differently. */}
            {/* ⛔⛔ THE "N days the week could not honour" BANNER IS DELETED (pins-win, 2026-08-25).
                Nothing is unhonoured any more: `compose.ts` puts the endurance session on the day
                that was tapped. Its slot carries the tiered notes instead — what the week the
                athlete asked for COSTS, never what the engine refused them.

                ⛔ TWO TIERS, ONE SURFACE, AND NEITHER IS A BLOCK. A breach is a clearance in the
                law (`week-model` Layer 1 — injury risk, named plainly). A trade-off is a legal week
                that is thinner than it could be (Layer 2). Continue is not gated on either.
                ⚠️ AMBER, NOT RED, AND NO ICON ESCALATION — the handoff is explicit that this is
                information, not an error state. The count leads so the row is legible closed. */}
            {weekNotes.length > 0 && (
              <button
                type="button"
                onClick={() => setOverridesOpen((v) => !v)}
                aria-expanded={overridesOpen}
                className="w-full text-left rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-white/70" />
                  <span className="text-white/85 text-sm">
                    {breachNotes.length > 0
                      ? `${weekNotes.length} ${weekNotes.length === 1 ? 'note' : 'notes'} on this week`
                      : `${weekNotes.length} ${weekNotes.length === 1 ? 'trade-off' : 'trade-offs'} in this week`}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 ml-auto transition-transform ${overridesOpen ? 'rotate-180' : ''}`} />
                </span>
                {overridesOpen && (
                  <span className="block mt-2 space-y-1.5">
                    {/* ⚠️ BREACHES FIRST, and the only difference in their rendering is weight —
                        a second colour here would read as an error the athlete has to clear. */}
                    {weekNotes.map((n, i) => (
                      <span
                        key={i}
                        className={`block text-sm leading-relaxed ${n.tier === 'breach' ? 'text-white/85' : 'text-white/65'}`}
                      >{n.text}</span>
                    ))}
                  </span>
                )}
              </button>
            )}

            {/* ⚠️ THE ALL-CLEAR IS GATED ON BOTH ANSWERS NOW. "No scheduling conflicts" is true of
                the clearance model and was being read as "the week is what you asked for", which it
                was not — so the badge does not render its tick while a pin is outstanding. It still
                renders in full whenever it has a collision of its own to report. */}
            {(state.hardDays.length > 0 || state.longRunDay || state.longRideDay)
              && !(scheduleHealthState.ok && weekNotes.length > 0) && (
              <button
                type="button"
                onClick={() => scheduleHealthState.ok ? undefined : setHealthOpen((v) => !v)}
                aria-expanded={scheduleHealthState.ok ? undefined : healthOpen}
                className={`w-full text-left rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 ${scheduleHealthState.ok ? 'cursor-default' : ''}`}
              >
                <span className="flex items-center gap-2">
                  {scheduleHealthState.ok
                    ? <Check className="h-4 w-4 shrink-0 text-white/70" />
                    : <AlertTriangle className="h-4 w-4 shrink-0 text-white/70" />}
                  <span className="text-white/85 text-sm">
                    {scheduleHealthState.ok
                      // ⛔ "Optimal schedule" OVERCLAIMED (work order stage 5): the check is a
                      // collision scan, not an optimiser. Say what is true.
                      /**
                       * ⛔ IT SAYS WHICH CHECKS PASSED, NOT THAT NOTHING IS WRONG (Michael,
                       * 2026-08-25). "No scheduling conflicts" is an absence, and an absence reads
                       * as "we found nothing" rather than as a result — the athlete could not tell
                       * whether the week had been checked or merely not complained about.
                       * ⚠️ COPY-VOICE: the two rule families this badge actually runs are named —
                       * spacing (the `COST` clearances) and recovery (the rest floor). No praise
                       * word: "balanced" describes the week's shape, not the athlete's choices.
                       * ⚠️ ZERO-VIOLATIONS STATE ONLY. The collision and note states below are
                       * untouched.
                       */
                      ? 'Balanced week — spacing and recovery rules all met.'
                      : `High fatigue risk: ${scheduleHealthState.collisions.length} collision${scheduleHealthState.collisions.length === 1 ? '' : 's'}`}
                  </span>
                  {!scheduleHealthState.ok && (
                    <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 ml-auto transition-transform ${healthOpen ? 'rotate-180' : ''}`} />
                  )}
                </span>
                {/* ⛔ THE RECEIPT, IN THE ENGINE'S OWN WORDS. Not re-worded client-side: the athlete
                    reads the same sentence the plan will print, so the two cannot drift. */}
                {!scheduleHealthState.ok && healthOpen && (
                  <span className="block mt-2 space-y-1.5">
                    {scheduleHealthState.collisions.map((c, i) => (
                      <span key={i} className="block text-white/70 text-sm leading-relaxed">{c}</span>
                    ))}
                  </span>
                )}
              </button>
            )}

            {/* ⛔ HOW THE WEEK IS PUT TOGETHER — UNDER THE CONFLICT LINE, ABOVE THE WEEK (round 3).
                Its position is the argument: the line above says THIS week has an outstanding pin,
                and this says what the rules were that produced it. Reference, so it opens closed.

                ⛔ STATIC, AND SOURCED. Every sentence is traced to `week-model/model.ts` or
                `standing-plan/day-map.ts` at the `PLACEMENT_RULES` declaration — no LLM, no
                per-athlete phrasing, nothing computed. It says the same thing on every week because
                the rules are the same on every week. */}
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="w-full text-left rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5"
            >
              <span className="flex items-center gap-2">
                <span className="text-white/85 text-sm">Use these tips to put your own week together</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 ml-auto transition-transform ${rulesOpen ? 'rotate-180' : ''}`} />
              </span>
              {rulesOpen && (
                <span className="block mt-2 space-y-1.5">
                  {PLACEMENT_RULES.map((r, i) => (
                    <span key={i} className="block text-white/70 text-sm leading-relaxed">{r}</span>
                  ))}
                </span>
              )}
            </button>

            {/* ══ THE ANSWER ZONE ════════════════════════════════════════════════════════════
                ⛔ ONE REPRESENTATION OF THE WEEK, AND IT IS THIS ONE (2026-08-25). Above this line
                everything is a QUESTION — seven plain day chips per anchor, nothing else riding on
                them. Below it is the week those answers produce, stated in words. The screen used
                to do both jobs in one object: the chips were the picker AND a coded report, so
                every chip meant two things and a legend was needed to say which.

                ⛔ THE WEEK, BELOW THE CONTROLS AND NOT COSTING THE FOLD WHEN IT IS EMPTY (kept).
                It led this card once, and reserved nine rems for a sentence that showed no
                selection at all — which put the controls it was meant to accompany off screen.

                ⛔ NEVER A SILENT EMPTY SPACE (kept). Running, failed, and never-asked-for are three
                different states that once all rendered as nothing. Each still says which it is —
                and the box only reserves height once there is something in it. */}
            {(previewWeek?.length || previewing || previewFailed) ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                {/* ⛔ THE ZONE IS NAMED, because an unlabelled block under a picker reads as more
                    controls. It says whose answer it is: the same solve that will build the block. */}
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-white/85 text-sm">The week this builds</p>
                  {/* ⛔⛔ IT SAID NOTHING WHILE IT WAS OUT OF DATE, AND THAT IS THE CONTRADICTION
                      MICHAEL PHOTOGRAPHED (traced 2026-08-25 — task 0 of the handoff).

                      The high-intensity row reads `state.hardDays`, which fills the instant a chip
                      is tapped or the client pre-fill writes a suggestion. This grid reads
                      `previewWeek`, which is the SERVER's composed week and arrives 400 ms of
                      debounce plus a round trip later. Between the two, the old week kept rendering
                      at full confidence beside the new answer — the `previewWeek?.length` arm wins
                      over `previewing`, so "Building your week…" only ever showed on the FIRST
                      build, never on a refresh.

                      ⛔ THE ENGINE IS NOT MOVING ANYTHING, AND THAT WAS THE OTHER HALF OF THE TRACE.
                      A pinned hard day becomes a solver ANCHOR (`strength-primary-plan.ts:3258`),
                      and `week-model/resolve.ts:483` splits units into `fixed` (pinned, kept
                      verbatim) and `free` (searched) — the local-improvement sweep starts at
                      `firstFree`, so a pinned day cannot move. `strength-primary-plan.ts:3617`
                      pushes a pinned entry straight through. The athlete's day is honoured
                      absolutely; the grid was simply showing the previous answer.

                      ⚠️ SO THE FIX IS A STALENESS CUE, NOT A RECONCILIATION. Nothing here is
                      re-derived and no placement happens on the client — the grid dims and says it
                      is catching up, then the real answer lands. */}
                  {previewing && previewWeek && previewWeek.length > 0 && (
                    <span className="text-white/45 text-xs shrink-0">Updating</span>
                  )}
                </div>
                {previewWeek && previewWeek.length > 0 ? (
                  <div className={previewing ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
                    <WeekGrid sessions={previewWeek} notes={[]} />
                  </div>
                ) : previewing ? (
                  <p className="text-white/50 text-sm">Building your week…</p>
                ) : (
                  <p className="text-white/60 text-sm leading-relaxed">
                    The week could not be built — that is a fault on our side, not your answers.
                    {previewError ? <span className="block text-white/35 text-xs mt-1 font-mono break-words">{previewError}</span> : null}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-white/35 text-xs">The week appears once your days are in.</p>
            )}

            {/* ⛔ THE LAST ROW IS NOT THE LAST PIXEL (punch item 4, 2026-08-25). Saturday and Sunday
                sat under the Continue key: `StepLayout`'s scroller carries `pb-24`, and the answer
                zone is the tallest thing on the card, so on a short viewport the scroll ends with
                the final day rows still inside the key's own strip. A spacer the height of the key
                is cheaper than teaching every future step to remember it.

                ⚠️ 32px ON TOP OF `StepLayout`'s EXISTING `pb-24`, NOT INSTEAD OF IT. That padding is
                the documented mechanism (its own comment: the key is the last flex child of an
                `h-full` column and iOS's visual viewport is shorter than that column). If a row is
                still clipped on a device, the number to raise is `pb-24` in `StepLayout` — one
                owner — rather than growing this spacer step by step. */}
            <div aria-hidden className="h-8" />

          </div>
        </StepLayout>
      )}

      {currentStep === 'run' && (
        <StepLayout
          step={stepNo('run')} totalSteps={steps.length} title="Running"
          // ⛔ THE SUBTITLE WAS WRITTEN FOR THE STRENGTH BLOCK AND SAYS SO — "strength leads this
          // block" is false on a race, where running leads and the lifting is the thing being held.
          // The card is shared; the sentence describing what leads cannot be.
          subtitle={isRaceGoal
            ? 'The one day the plan builds around, and the week it sits in.'
            : 'All of it conversational — strength leads this block.'}
          onBack={back} onContinue={next} canContinue={runCanContinue}
        >
          <div className="space-y-5">
            {/* ⛔ THE DAY PICKER SITS ABOVE THE NUMBERS. A numeric input pushes everything below it
                behind the keyboard and the Continue bar on a phone — the same trap that once hid the
                accessory slots. Taps before typing. */}
            <div>
              <p className="text-white/85 text-sm mb-2">Long run day</p>
              {/* ⛔ ALL SEVEN DAYS. This was restricted to Sat/Sun with the note "your heavy lower
                  days (Tue/Fri) need clear space" — a rule from the hardcoded grid the 5/3/1 rebuild
                  replaced. The long run is now an ABSOLUTE the lifting is solved around
                  (`place-week.ts`), not a session squeezed into what the grid left over. Telling the
                  athlete their long run must be a weekend, because of lifting days the engine no
                  longer fixes, is the tail wagging the dog. */}
              <DayPicker value={state.longRunDay} taken={anchorDaysTaken(state, 'long run')} onChange={(d) => setState((s) => ({ ...s, longRunDay: d }))} />
              {state.posture?.strength === 'develop' && (
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  Whichever day you actually run long. The lifting is placed around it — heavy legs
                  stay clear of it by two days.
                </p>
              )}
              {/* Without this the race path shows a bare day picker and no reason for it — the
                  strength-block explanation above is gated off, and nothing replaced it. */}
              {isRaceGoal && (
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  Whichever day you actually run long. It grows through the block and is the last
                  thing to come down before the race.
                </p>
              )}
            </div>

            {/* ── WEEKLY MILEAGE, RACE PATH ────────────────────────────────────────────────────
                ⛔ UNGATED FOR A RACE (2026-08-04). The mileage questions below are wrapped in
                `posture.strength === 'develop'`, so a marathon goal was never asked what it runs —
                and on the event path the engine took `current_weekly_miles` from SNAPSHOTS only
                (`create-goal…:3417`). A brand-new athlete has no snapshots, so week one was built
                off the level tick alone.

                ⛔ ONE FIELD HERE, NOT THE STRENGTH PATH'S TWO. That path asks "what do you
                normally run" and derives a HOLD dose from it (two-thirds, Hickson) because running
                is being maintained under a lifting block. On a race the running IS the block —
                there is no hold to derive, the number typed is the starting volume itself. Reusing
                the two-field mechanic would have asked a question with no second half. */}
            {isRaceGoal && (
              <div>
                <p className="text-white/85 text-sm mb-2">What do you run now?</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="decimal" min={0}
                    value={state.targetMiles === '' ? '' : state.targetMiles}
                    onChange={(e) => setState((st) => ({
                      ...st,
                      targetMiles: e.target.value === '' ? '' : Number(e.target.value),
                      targetTouched: true,
                    }))}
                    placeholder="e.g. 30"
                    className="w-28 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="text-white/75 text-sm">{unit}/wk</span>
                </div>
                {/* ⛔ NO "NOT SURE" BUTTON HERE, AND IT IS A DEPARTURE. The strength card offers one
                    on purpose — *"making someone compute a historical baseline before a screen
                    unlocks is a data-entry exam"* — and that is right when the cost of guessing is a
                    few easy miles. On a marathon this number sets week one's volume and decides
                    whether the block is safe to build at all, so there is nothing honest to put
                    behind an "I don't know". */}
                {milesVerdict === null && (
                  <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                    Your current average, not what you are aiming at. Week one starts from this.
                  </p>
                )}
                {milesVerdict?.ok === true && (
                  <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                    Week one starts near this, with a {longRunDisplay}-{unit} long run — about{' '}
                    {milesVerdict.sharePct}% of the week.
                  </p>
                )}
                {/* ⛔ THE BASE-BUILD NOTICE — AND IT IS A NOTICE, NOT A REFUSAL (Michael, "warn, no
                    wall"). Continue stays live underneath it; `runCanContinue` is a constant.

                    ⛔ FACT, THEN CONSEQUENCE, NEVER AN INSTRUCTION (COPY-VOICE rule 7). The first
                    draft ended *"Build to about N a week first, then come back"* — an imperative,
                    and one the athlete has already implicitly declined by typing what they typed.
                    It now states what the block will do and what that is associated with, and
                    leaves the decision where it belongs.

                    ⛔ THE THREE REASONS ARE DIFFERENT AND THE COPY MUST NOT BLUR THEM: too little
                    base for the DISTANCE, a number the ENGINE will silently raise, or a week too
                    small to carry the LONG RUN it prescribes. Each names its own consequence.

                    ⚠️ THE RISK LINE IS DELIBERATELY GENERAL. Ramp rate and weekly volume are the
                    exposures the injury literature actually associates with running injury; the
                    line says "raises injury risk", not a percentage, because we have no number for
                    THIS athlete and a fabricated one would be the score that lies. */}
                {milesVerdict?.ok === false && (
                  <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
                    <p className="text-white/90 text-sm leading-relaxed">
                      {milesVerdict.bound === 'long_run_share'
                        ? `A ${state.raceDistance.toLowerCase()} block for this level opens with a ${longRunDisplay}-${unit} long run. At ${state.targetMiles} ${unit} a week, that is most of your running in one session.`
                        : milesVerdict.bound === 'engine_clamp'
                          ? `The plan starts near ${milesFloorDisplay} ${unit} a week whatever is entered below that, so the first weeks would be bigger than the week you described.`
                          : `A ${state.raceDistance.toLowerCase()} block usually sits on about ${milesFloorDisplay} ${unit} a week. You are starting under that.`}
                    </p>
                    <p className="text-white/60 text-sm mt-1.5 leading-relaxed">
                      Building on less base than a block asks for means a faster ramp, and a faster
                      ramp raises injury risk. Athletes who reach about {milesFloorDisplay} {unit} a
                      week before the block starts carry it more comfortably.
                    </p>
                    <p className="text-white/45 text-xs mt-2 leading-relaxed">
                      You can carry on — this is a note, not a stop.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* The volume questions belong to the STRENGTH path — elsewhere the mileage comes from
                the commitment tier, so asking here would be asking twice.
                ⚠️ "Elsewhere" no longer means "everywhere else": the race path above asks its own,
                once, because on a race the mileage is not a hold dose derived from a usual week —
                it IS the week. The two blocks are mutually exclusive by construction. */}
            {state.posture?.strength === 'develop' && (
              <>
            <div>
              {/* ⛔ THEIR OWN NUMBER FIRST. Michael, 2026-07-25: *"they need to know, they need
                  to slug it in."* Without it the band is absolute and says the same thing to a
                  40-mile runner and a 10-mile runner. With it, the maintenance dose is ~2/3 of
                  their usual [Hickson: cut duration to ⅔ and VO2max holds; cut intensity and it
                  is lost] — per-athlete by construction, SPEC §2, and no new number invented. */}
              <p className="text-white/85 text-sm mb-2">What do you normally run?</p>
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="number" inputMode="decimal" min={0}
                  value={state.usualMiles === '' ? '' : state.usualMiles}
                  onChange={(e) => setState((st) => {
                    const usual = e.target.value === '' ? '' : Number(e.target.value);
                    const dose = typeof usual === 'number' ? maintenanceDoseFor(usual) : null;
                    // Seed the hold with the maintenance dose — a suggestion they can overtype,
                    // never a clamp. Re-seeds on EVERY keystroke until they type in the hold field
                    // themselves (`targetTouched`).
                    // ⛔ The test used to be `st.targetMiles === ''` and that is the bug: onChange
                    // fires per digit, so "28" seeded off "2" (dose 1) and then refused to update,
                    // because by the time the "8" landed the field was no longer empty. The screen
                    // read "holds about 19" over a hold of 1. Emptiness is not consent.
                    return { ...st, usualMiles: usual, targetMiles: !st.targetTouched && dose ? dose : st.targetMiles };
                  })}
                  placeholder="e.g. 20"
                  className="w-28 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                  style={{ fontSize: '16px' }}
                />
                <span className="text-white/75 text-sm">{unit}/wk</span>
                {/* ⛔ "I DON'T KNOW" IS A VALID ANSWER. Making someone compute a historical
                    baseline before a screen unlocks is a data-entry exam, not an intake. They
                    start at the band's floor — the ~2-sessions-a-week maintenance dose, not a new
                    number — and the app learns them from what they log. Worst case an
                    experienced athlete is under-asked for a few weeks and raises it; never that
                    someone is handed a volume they cannot carry with three lifting days. */}
                <button
                  type="button"
                  onClick={() => setState((st) => ({ ...st, usualMiles: '', targetMiles: startLightMiles() }))}
                  className="text-white/65 text-sm underline underline-offset-2 ml-1"
                >Not sure</button>
              </div>
              <p className="text-white/70 text-sm mb-4 leading-relaxed">
                {typeof state.usualMiles === 'number' && state.usualMiles > 0
                  ? `This block holds about ${maintenanceDoseFor(state.usualMiles)} ${unit} — two-thirds of normal keeps the aerobic base while strength leads.`
                  : `Your usual week, before this block — the holding dose comes off it. Not sure is fine: it starts light and grows as the app learns your weeks. New to running, small is the right answer — every session here is conversational.`}
              </p>
              <p className="text-white/85 text-sm mb-2">Weekly running to hold <span className="text-white/60">(maintenance)</span></p>
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="numeric" min={0}
                  value={state.targetMiles === '' ? '' : state.targetMiles}
                  onChange={(e) => setState((s) => ({ ...s, targetMiles: e.target.value === '' ? '' : Number(e.target.value), targetTouched: true }))}
                  placeholder={`e.g. ${Math.max(4, capDisplay - 4)}`}
                  className="w-24 py-2 px-3 rounded-xl bg-white/[0.04] text-white border border-white/12 text-sm focus:outline-none focus:border-[var(--fc)]"
                  style={{ ['--fc' as string]: `rgb(${getDisciplineColorRgb('run')})` }}
                />
                <span className="text-white/60 text-sm">{unit}/wk</span>
              </div>
              {/* ⛔ THE TRADE, SAID OUT LOUD — and the number stands either way. This is what
                  replaces a cap: a ceiling would have to name a threshold, and this repo's own
                  science doc says any numeric threshold the app states would be invented
                  (Wilson found the volume correlation; Schumann, with more studies, found no
                  frequency moderation). So the athlete types what they carry, reads what it
                  costs, and owns it.

                  Was a LOCAL two-state check against its own `capDisplay`, citing "[Wilson 2012]"
                  for a number Wilson never gives — the exact invented-threshold trap. Now the
                  SHARED band (`maintenance-volume-band.ts`), which the composer also reads, so
                  what is said here and what the plan records cannot disagree. Three states: the
                  old version had no "below", and a runner dropping under a maintenance dose was
                  told nothing at all. */}
              <p className="text-white/85 text-sm mt-2 leading-relaxed">
                {(typeof state.usualMiles === 'number' && state.usualMiles > 0
                  ? volumeStateLineVsUsual(volumeStateVsUsual(Number(state.targetMiles), state.usualMiles), state.usualMiles, unit)
                  : volumeStateLine(volumeStateForMiles(Number(state.targetMiles))))
                  ?? `Run what you'll actually do — it's all easy, strength leads. Low weeks aren't penalized (more recovery for the lifts).`}
              </p>
            </div>
            <div>
              <p className="text-white/85 text-sm mb-2">How many days to run</p>
              <div className="grid grid-cols-3 gap-1.5 max-w-[220px]">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s) => ({ ...s, runDays: n }))}
                    className={`py-2 rounded-xl text-sm ${state.runDays === n ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                  >{n}</button>
                ))}
              </div>
              <p className="text-white/70 text-sm mt-1.5 leading-relaxed">We spread your miles across these — a longer run plus easy fill, not the same run twice.</p>
              </div>
              </>
            )}
          </div>
        </StepLayout>
      )}

      {/* ⛔ BIKE IS ASKED IN HOURS, NEVER MILES (D-323 §6, researched not picked). ~99% of riders
          train on time — terrain and wind distort distance badly — and this app learns ride HR and
          FTP but NO ride speed, so bike miles cannot become a session length without guessing: 20
          miles is 65 minutes flat and over two hours in hills. People TALK in miles and TRAIN in
          hours, so: ask hours, show miles later once a ride speed is learnable. */}
      {currentStep === 'bike' && (
        <StepLayout
          step={stepNo('bike')} totalSteps={steps.length} title="How much will you ride?"
          subtitle="Hours, not miles — terrain makes distance a poor measure of a ride, and it is all easy here."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-5">
            <div>
              <p className="text-white/85 text-sm mb-2">Weekly riding to hold <span className="text-white/60">(maintenance)</span></p>
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="decimal" min={0} step={0.5}
                  value={state.rideHours === '' ? '' : state.rideHours}
                  onChange={(e) => setState((st) => ({ ...st, rideHours: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder="e.g. 4"
                  className="w-28 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm focus:outline-none focus:border-[var(--fc)]"
                  style={{ fontSize: '16px', ['--fc' as string]: `rgb(${getDisciplineColorRgb('bike')})` }}
                />
                <span className="text-white/75 text-sm">h/wk</span>
              </div>
            </div>
            {/* ⛔ HOURS NEED A NUMBER OF DAYS TO SPREAD ACROSS — the run has always asked this and the
                bike never did, so the composer had a weekly total and nothing to divide it by. It
                invented a split, and a 20-hour week came out as ONE 1,200-minute ride.
                ⚠️ It also catches the unit slip: hours-not-miles is right (D-323 §6) and the subtitle
                says so, but 20 is plausible in BOTH units — Michael entered 20 meaning miles on his
                own field. Dividing by days puts the per-ride length on screen, where 20h reads as
                "6h40 each" and the mistake is obvious in a way the label alone was not. */}
            <div>
              <p className="text-white/85 text-sm mb-2">How many days to ride</p>
              {/* ⛔ 1/2/3/4 (Michael, 2026-08-21) — the fifth and last statement of this range to be
                  brought into line. It said 1/2/3 while the strength path's volume card said
                  1/2/3/4, with one `state.rideDays` behind both. See
                  `supabase/functions/_shared/athlete-weekly-intent.ts` for the full account of what
                  six copies of one rule cost. */}
              <div className="grid grid-cols-4 gap-1.5 max-w-[220px]">
                {RIDE_DAYS_CHOICES.map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s) => ({ ...s, rideDays: n }))}
                    className={`py-2 rounded-xl text-sm ${state.rideDays === n ? 'bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.16)] text-white border border-[rgb(var(--wiz-accent-rgb,236,233,227))]' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                  >{n}</button>
                ))}
              </div>
              {/* ⚠️ SAME DIVISOR GUARD as the scheduler card. `Math.max(1, rideDays)` quietly divided
                  by one before a count was picked, so 20 hours read as "About 20h a ride" — the exact
                  unit-slip this line was written to CATCH, printed as though it were the answer. */}
              <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                {Number(state.rideHours) > 0 && state.rideDays > 0
                  ? `We spread your hours across these — the long ride takes the bigger share. About ${
                      (() => {
                        const per = Number(state.rideHours) / state.rideDays;
                        const h = Math.floor(per); const m = Math.round((per - h) * 60);
                        return h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
                      })()
                    } a ride.`
                  : 'We spread your hours across these — the long ride takes the bigger share.'}
              </p>
              </div>
            <div>
              <p className="text-white/85 text-sm mb-2">Long ride day</p>
              <DayPicker value={state.longRideDay} taken={anchorDaysTaken(state, 'long ride')} onChange={(d) => setState((s) => ({ ...s, longRideDay: d }))} />
            </div>
          </div>
        </StepLayout>
      )}

      {/* ⛔ THE ONE HARD SESSION. Asked ONCE, after the disciplines, because the options ARE the
          disciplines they kept.
          The doctrine (`DOCTRINE-aerobic-maintenance.md` §6): a strength-led block carries exactly
          one hard aerobic session, and if the athlete has a bike it is the bike — hard riding costs
          the legs less than hard running does, which is a TISSUE claim and survives even though the
          adaptation-interference version is contested. So the bike is pre-selected when they kept
          one; it is a steer with the reason attached, never an override.
          ⚠️ "None" is a real answer and its cost is stated. Intensity is the protective variable
          (Hickson): easy volume alone does not hold the engine. */}
      {/* ⛔ THE `hardday` STEP WAS DELETED 2026-08-06. IT HAD BEEN DEAD SINCE 2026-07-28.
          The scheduler rebuild replaced `run` + `bike` + `hardday` with the one `schedule` screen,
          and `scheduleSteps` stopped pushing this key — but the render block stayed, so the file
          still carried a full second hard-day picker that nothing could reach.

          ⚠️ IT COST A REAL BUG. The terrain menu was wired into THIS card, which reads as the
          obvious home for it, and a device check found no cards on the schedule screen: the menu
          was rendering nowhere. The live hard-day control is in the `schedule` step above, keyed on
          `'run' in state.qualityDays`, and the menu now lives there — once.

          ⛔ Do not restore this card to add a hard-day question. There is one control; extend it. */}

      {/* ⬇ SWIM SITS LAST. It is a courtesy — booked, not coached — so it follows the work rather
          than sitting above the lifting and the running it is subordinate to. The app learns no swim
          pace and grades no swim, so it holds the time and says so: one control, no yardage, no sets.
          It exists for the triathlete who wants the slots on the calendar. */}
      {currentStep === 'swim' && (
        <StepLayout
          step={stepNo('swim')} totalSteps={steps.length} title="Swims"
          subtitle="About an hour each, on days nothing else is booked. Held on the calendar, not coached — no set, no target."
          onBack={back} onContinue={next} canContinue
        >
          <div>
            <p className="text-white/85 text-sm mb-2">Swims per week</p>
            <div className="flex gap-1.5 max-w-[240px]">
              {SWIM_DAYS_CHOICES.map((n) => (
                <button
                  key={n} type="button" onClick={() => setState((st) => ({ ...st, swimDays: n }))}
                  className={`flex-1 py-2 rounded-xl text-sm border ${state.swimDays === n ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)] text-white' : 'border-white/12 text-white/75'}`}
                >{n}</button>
              ))}
            </div>
          </div>
        </StepLayout>
      )}

      {currentStep === 'confirm' && (
        <StepLayout
          step={stepNo('confirm')} totalSteps={steps.length} title="Build this plan?"
          // "an 12-week" — the article was hardcoded for a number that varies. 8, 12 and 16 all take "a".
          // ⛔ THE PROTOCOL NAME MOVED HERE when the posture card came out — it was the one fact on
          // that card the week grid cannot show, and dropping it silently would have lost it.
          subtitle={isRaceGoal
            ? `${state.raceDistance} — ${state.raceDate}${planWeeks !== null ? `, about ${planWeeks} weeks` : ''}.`
            /* ⛔ "of Wendler 5/3/1" DELETED (2026-08-24): his trademark on the final commit
               screen, and no longer true — the block is the Standing Plan engine, not 5/3/1. */
            : `${state.goal ? GOAL_LABELS[state.goal] : 'Goal'} — ${state.targetWeeks} weeks. Strength leads; your endurance holds.`}
          onBack={back} onContinue={handleConfirm} canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'} saving={saving}
        >
          {/* ⛔ THE POSTURE CARD IS GONE (2026-07-29). It listed Swim Out / Bike Maintain / Run
              Maintain / Strength Develop — four rows restating answers the athlete gave two screens
              ago, in the vocabulary of the engine rather than of their week. The grid below says the
              same thing in days they recognise, and says it specifically. The one fact it carried
              that the grid cannot — the protocol — moved to the subtitle. */}
          {/* ⛔ THE HEALTH BADGE CARRIES OVER (Michael, 2026-08-18) — the last screen before the
              tap is where a collision matters most, and an athlete who never opened the scheduler's
              expander should still meet it here. Same state, same words, same neutral surface.
              ⚠️ IT DOES NOT BLOCK. The Continue key is unaffected: this is the cost stated, not a
              gate, which is the ruling the whole engine runs on. */}
          {!scheduleHealthState.ok && (
            <button
              type="button"
              onClick={() => setHealthOpen((v) => !v)}
              aria-expanded={healthOpen}
              className="w-full text-left rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 mb-3"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-white/70" />
                <span className="text-white/85 text-sm">
                  High fatigue risk: {scheduleHealthState.collisions.length} collision{scheduleHealthState.collisions.length === 1 ? '' : 's'}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 ml-auto transition-transform ${healthOpen ? 'rotate-180' : ''}`} />
              </span>
              {healthOpen && (
                <span className="block mt-2 space-y-1.5">
                  {scheduleHealthState.collisions.map((c, i2) => (
                    <span key={i2} className="block text-white/70 text-sm leading-relaxed">{c}</span>
                  ))}
                </span>
              )}
            </button>
          )}
          <div className="space-y-3">
            {/* ⛔ THE REFUSAL, WHERE THE ATHLETE TAPPED. `complete()` can still be turned down by
                the server, but the timeline wall is no longer what does it — that gate was demoted
                to the advisory below (2026-08-06, "warn, no wall"). What reaches here now is
                `race_within_build_window` (under four weeks the phase builder cannot lay out a
                block at all) and the pace-benchmark gate. Rendered verbatim rather than re-worded
                client-side, so one sentence lives in one place.
                ⚠️ Sits ABOVE the start-date field on purpose: it is the reason the tap did nothing,
                and a reason below the fold is a reason nobody reads. */}
            {buildError && (
              <div className="rounded-xl border border-red-400/25 bg-red-400/[0.07] p-3">
                <p className="text-white/90 text-sm leading-relaxed">{buildError}</p>
              </div>
            )}
            {/* ⛔ THE TIMELINE NOTICE — THE DEMOTED REFUSAL (2026-08-06). Michael: *same "warn, no
                wall" as the mileage floor.* Same amber surface as that notice on the level card,
                deliberately: the athlete has now met this treatment once and knows it means "this
                is a real cost and you may continue."
                ⚠️ IT COMES FROM THE SERVER, verbatim. The floor it quotes is `MIN_WEEKS` — or the
                athlete's own measured floor when memory has one — and neither is knowable here.
                Re-deriving it client-side is how the intake starts quoting a number the engine does
                not hold anyone to.
                ⚠️ IT NEEDS THE PREVIEW. It arrives with the previewed plan, so an athlete who taps
                straight through to Build never sees it. Acceptable — the build screen's own copy
                already states the weeks, and the level card states the long run this timeline
                reaches. This is the third statement of the same cost, not the only one. */}
            {previewAdvisories.map((note) => (
              <div key={note} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
                <p className="text-white/85 text-sm leading-relaxed">{note}</p>
              </div>
            ))}
            <div>
              <p className="text-white/70 text-sm mb-2">Start the week of</p>
              {/* ⛔ NO `min` — A BLOCK MAY START IN THE PAST (2026-08-10).
                  This carried `min={new Date().toISOString()…}`, which greyed out every earlier day
                  in the picker, so an athlete who has been running the block for a fortnight could
                  not say so: the only start they were allowed to declare was one that had not
                  happened yet.

                  ⚠️ THE SAME QUESTION IS ASKED TWICE ON THIS SCREEN AND THE TWO DISAGREED. The race
                  flow's "Start the week of" (`:2174`) has never had a floor. One control accepted a
                  past week and the other refused it, for the same field, in the same builder — so
                  this is the two being reconciled, not a new permission.

                  ⚠️ IT ALSO FIXES A UTC SLIP ON THE WAY OUT. `toISOString()` is UTC, so after 17:00
                  Pacific the floor was already TOMORROW and the picker greyed out the athlete's own
                  current day — the same class of boundary bug as Q-252. It leaves with the floor.
                  ⛔ The RACE DATE field above still carries `min={…toISOString()…}` and still has
                  that slip. Left alone: "can a race be in the past" is a different question and was
                  not asked. */}
              <input
                type="date"
                value={state.startDate}
                onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-[rgba(var(--wiz-accent-rgb,236,233,227),0.50)]"
              />
              {/* ⛔ SAY WHAT ACTUALLY HAPPENS. The old line promised "Week 1 begins this week" while
                  the default skipped to next week and the server took any weekday verbatim. */}
              <p className="text-white/50 text-xs mt-1.5">
                Plans run Monday to Sunday. Any day you pick starts the block on that week&apos;s Monday.
              </p>
            </div>

            {/* ⛔ THE WEEK, BEFORE COMMITTING. Building it here writes nothing — no goal, no plan.
                ⚠️ …ON THIS PATH. On a race goal it WOULD write (see `previewSupported`), so the
                panel is replaced by a line that says the week comes after building rather than
                offering a button that quietly creates a plan. */}
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
              {previewWeek === null ? (
                <button
                  type="button" onClick={() => { void runPreview(); }} disabled={previewing}
                  className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
                >{previewing ? 'Building your week…' : 'Show me a week first'}</button>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                    if (previewFailed) {
                      return (
                        <div className="text-white/80 text-sm">
                          <p className="text-white/90">The week could not be built.</p>
                          <p className="text-white/55 text-xs mt-1.5">
                            This is a fault on our side, not a problem with your answers — nothing about
                            your setup produces an empty week. Building the plan may still work; if it
                            does not, the answers are saved and can be retried.
                          </p>
                          {/* ⛔ NAME THE FAILURE. The reason existed on every one of these and was
                              discarded in the hook, so this panel could only ever shrug. */}
                          {previewError ? (
                            <p className="text-white/40 text-[11px] mt-2 font-mono break-words">{previewError}</p>
                          ) : null}
                        </div>
                      );
                    }
                    // ⛔ ONE COMPONENT, TWO SURFACES. `WeekGrid` renders the week here and is meant
                    // to render the rescheduler on the State screen later — same grid, same budget
                    // line, same compromise sentences, so the athlete learns it once. It also owns
                    // the endurance budget, which is DERIVED from the lifting frequency rather than
                    // hardcoded, so it stays true if the block ever runs 3 lifting days.
                    return <WeekGrid sessions={previewWeek} notes={previewNotes} />;
                  })()}
                </div>
              )}
            </div>
            {/* ⛔ THE TEST-WEEK OFFER (Standing Plan, slice 3). Michael's ruling, 2026-08-23: the test
                can be skipped ONLY when the number on file is evidence-backed and fresh — read from
                logged sets inside the window, never a typed-in max — and **the skip is offered, the
                default stays the test**. So this renders only when the server said the evidence is
                there, it is off until tapped, and the server re-checks the evidence on the build.
                ⚠️ Stage 5 rebuilds this wizard; this is the seam, not its final form. */}
            {previewSkip?.available ? (
              <label className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.03] p-3">
                <input
                  type="checkbox"
                  checked={state.skipTestWeek === true}
                  onChange={(e) => setState((p) => ({ ...p, skipTestWeek: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-white/80"
                />
                <span className="text-white/80 text-sm leading-snug">
                  Start without a test week
                  <span className="block text-white/50 text-xs mt-1">{previewSkip.summary}</span>
                </span>
              </label>
            ) : null}
            {/* ⛔ TWO FALSEHOODS ON THIS LINE, both created when the engine changed under it.
                • "ending in a retest" — Strength Focus has NO retest week. The last set of every
                  third week is the test (5/3/1); weeks 9, 10 and 11 are the measurement. The
                  separate retest week was deleted with the old protocol.
                • "from your current fitness (≈ N h/wk)" — the hours tier is not asked on this path
                  and nothing reads it. Reporting a number the athlete never gave, that changes
                  nothing, is the shape of bug this file keeps producing.
                Also fixed the article: "An 12-week" read wrong for every length that is not 8. */}
            <p className="text-white/75 text-sm">
              {isRaceGoal ? (
                /* ⛔ NO "ending in a retest" HERE — a race block ends in the race, and the terminal
                    phase is a taper, not a retest (`phase-structure.ts:401`). And no promised week
                    count: the number is the server's, computed from today, and it can be cut hard
                    on a close race. "About" is doing real work in this sentence. */
                <>Running leads to {state.raceDistance.toLowerCase()} day, about {planWeeks ?? '—'} weeks
                out, with a taper into the race. Everything you kept is held underneath it.</>
              ) : isStrengthFocus ? (
                /* ⛔ "every third week" was false — the open set exists ONLY in the anchor cycle
                   (`wendler-531.ts:61`: amrap = anchor && !deload && last set), so weeks 9-11 of
                   twelve. Weeks 1-8 are plain fives with nothing to measure. Same correction as
                   `strengthFocusBufferLine`; the two must not drift, because the athlete reads both. */
                <>A {state.targetWeeks}-week block. Two cycles build, the third measures — the last
                set of that cycle is the test, so there is no separate retest week.</>
              ) : (
                <>{state.targetWeeks === 8 || state.targetWeeks === 11 || state.targetWeeks === 18 ? 'An' : 'A'} {state.targetWeeks}-week
                block from your current fitness (≈ {hoursForTier(state.commitment)} h/wk),
                ending in a <span className="text-white/90">retest</span>.</>
              )}
            </p>
          </div>
        </StepLayout>
      )}
    </div>
  );
}
