import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bike, Waves, Dumbbell, Info, Footprints, Shuffle, Weight, Target, Flag, Plus } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { useArcSetupContext } from '@/hooks/useArcSetupContext';
import { getDisciplineColor, FOCUS_RACE_COLOR } from '@/lib/context-utils';
// ONE band, shared with the composer — what the athlete is told while typing and what the plan
// records cannot disagree. A REFERENCE, never a cap (D-222's ceiling was retired on purpose).
import { maintenanceDoseFor, startLightMiles, volumeStateForMiles, volumeStateLine, volumeStateLineVsUsual, volumeStateVsUsual } from '@/lib/maintenance-volume-band';
// ONE source for the block's own words — the composer writes the same sentences onto the plan.
import { strengthFocusBrief, STRENGTH_FOCUS_WEEKS, HARD_DAY_WHY } from '@/lib/strength-focus-copy';
// ONE menu, shared with the composer that authors the block (`assistance-menu.ts`). A name this
// picker offers that the composer does not recognise would fall back to the default — the athlete
// would pick something and silently get something else.
import { ASSISTANCE_DEFAULTS, ASSISTANCE_GUIDANCE, ASSISTANCE_MENU, type AssistancePicks } from '@/lib/assistance-menu';
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
// ⛔ ONE READING OF THE WEEK, shared with whatever renders it next — the letters under the day chips
// are the same rule on all three intake cards, so the rule cannot live on any one of them.
import { weekDayRoles, DAY_ROLE_TITLE, type DayRole } from '@/lib/week-budget';
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
  train: { label: 'Train', blurb: 'Run, ride, strength, or a mix', Icon: Activity, color: getDisciplineColor('mobility') },
  race: { label: 'Race', blurb: 'Train for any race', Icon: Flag, color: FOCUS_RACE_COLOR },
  build: { label: 'Build', blurb: 'Write your own, the engine does the math', Icon: Plus, color: null },
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
const TRAIN_ORDER: TrainCardId[] = ['run', 'ride', 'strength', 'athletic'];
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
    // Michael's wording. It names the trade the block actually makes: the lifting leads, and the
    // aerobic base is HELD rather than dropped — which is the whole reason this is a hybrid block
    // and not a powerlifting programme.
    blurb: 'Get stronger, bigger, more defined while holding aerobic base',
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
type StrengthTierId = 'strong' | 'heavy' | 'definition';
const TIER_ORDER: StrengthTierId[] = ['strong', 'heavy', 'definition'];
const TIER_COPY: Record<StrengthTierId, { label: string; blurb: string; Icon: CardIcon; live: boolean }> = {
  strong: { label: 'Strong', blurb: 'Stronger, not bigger.', Icon: Dumbbell, live: true },
  heavy: { label: 'Heavy', blurb: 'Build muscle.', Icon: Weight, live: false },
  definition: { label: 'Definition', blurb: 'Shape where you choose.', Icon: Target, live: false },
};

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
/**
 * ⛔ THE WEEK'S THREE QUESTIONS, ASKED ON ONE CARD. The card does not change between them — the
 * PROMPT does, and the row underneath keeps every answer already given. Three screens for three
 * seven-chip rows was the version before this one, and it left two thirds of a phone empty under
 * each of them.
 */
const WEEK_QUESTIONS = [
  { prompt: 'Which days do you run?', hint: 'Leave it blank and the plan picks them.' },
  { prompt: 'Which one is the long run?', hint: 'It grows through the block and comes down last.' },
  { prompt: 'Which days are full rest?', hint: 'Nothing at all — not even a lift. Skip if none.' },
  { prompt: 'Any standing day — club night or a fixed hard session?', hint: 'Skip if none. Tap again to clear.' },
] as const;

function WeekDayRow({
  selected, disabled = [], roles = {}, onTap,
}: {
  /** Days shown as chosen ON THIS CARD. */
  selected: DayName[];
  /** Days that cannot be picked here — rendered inert, never merely styled. */
  disabled?: DayName[];
  /** What each day already is, across the whole week. Absent = not decided yet. */
  roles?: Partial<Record<DayName, DayRole>>;
  onTap: (d: DayName) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 min-w-0">
      {DAYS.map((d) => {
        const off = disabled.includes(d);
        const on = selected.includes(d);
        const role = roles[d];
        return (
          <button
            key={d}
            type="button"
            disabled={off}
            onClick={() => !off && onTap(d)}
            title={role ? DAY_ROLE_TITLE[role] : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] min-w-0 border ${
              off
                ? 'border-white/5 text-white/20 bg-transparent'
                : on
                  ? 'border-teal-400 bg-teal-500 text-white'
                  : 'border-white/12 bg-white/[0.04] text-white/75'
            }`}
          >
            <span className="leading-none">{DAY_SHORT[d]}</span>
            {/* ⛔ THE ROLE, ON EVERY DAY, ON EVERY CARD (2026-08-06). Michael: *"R rest, E easy, LR
                over the days that get chosen so it's clear."* The fill told the athlete WHICH days
                they had tapped; it never told them what those days ARE. With the letter the row
                reads as a week at a glance — and it reads the same on all three cards, because it
                is the same week. A day with no letter is one nothing has decided yet, which is the
                honest state before they pin anything. */}
            <span className={`leading-none text-[9px] ${
              off ? 'text-white/25' : on ? 'text-white/80' : 'text-teal-300/80'
            }`}>
              {role ?? '\u00A0'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayPicker({ value, onChange, allowed }: { value: DayName | ''; onChange: (d: DayName) => void; allowed?: DayName[] }) {
  const days = allowed ?? DAYS;
  return (
    <div className={allowed ? 'flex gap-1' : 'grid grid-cols-7 gap-1'}>
      {days.map((d) => (
        <button
          key={d} type="button" onClick={() => onChange(d)}
          className={`${allowed ? 'flex-1 ' : ''}py-2 rounded-lg text-xs ${value === d ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
        >
          {DAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

/**
 * ⛔ ONE LINE, NOT SEVEN BUTTONS. The scheduler carries THREE day questions — hard day, long run,
 * long ride — and as button grids they took three rows of seven and pushed the week itself below
 * the fold. Michael: *"you need to be able to click and see everything without scrolling."* The
 * whole value of the card is watching the week change as you tap, which does not survive the week
 * being off screen.
 *
 * ⚠️ `DayPicker` above is unchanged and still used by every other card, where the screen is not
 * competing with a live result.
 */
function DaySelect({ label, value, onChange }: { label: string; value: DayName | ''; onChange: (d: DayName) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-white/70 whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DayName)}
        className="flex-1 min-w-0 py-1.5 px-2 rounded-lg bg-white/[0.06] border border-white/12 text-white appearance-none"
        style={{ fontSize: '16px' }}
      >
        <option value="" className="bg-neutral-900">Pick a day</option>
        {DAYS.map((d) => (
          <option key={d} value={d} className="bg-neutral-900">{DAY_SHORT[d]}</option>
        ))}
      </select>
    </label>
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
  goal: NonRaceGoalId | null;
  discipline: Discipline | undefined;
  posture: Partial<Record<Discipline, Posture>>;
  strengthProtocol: string | undefined;
  commitment: CommitmentTier;
  targetWeeks: number;
  daysPerWeek: number;
  /** The days the athlete can train. Empty = unanswered; rest is the remainder. */
  trainingDays: DayName[];
  /** Days declared as full rest — nothing at all, not even a lift. */
  restDays: DayName[];
  longRunDay: DayName | '';
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
  /** 4 (Wendler's own shape) or 3 (the two upper lifts share a day; the test week still runs four). */
  liftingDays: 3 | 4;
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
  assistancePicks: AssistancePicks;
  /** Swim slots per week. Booked, not coached (D-323 §5) — it exists for the triathlete who wants
   *  the time held. Only asked when swim is kept for the block. */
  swimDays: number;
  /** Weekly riding to hold, in HOURS (D-323 §6 — never miles; the app learns no ride speed). */
  rideHours: number | '';
  /** How many days the weekly ride hours spread across. The run has always asked this; the bike
   *  did not, so the composer had a total with nothing to divide it by. */
  rideDays: number;
  startDate: string; // Week 1 start (YYYY-MM-DD); plans are Monday-based so this snaps to that week server-side
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
  // ⛔ STRENGTH, ON ITS OWN CARD (2026-08-06) — one primary decision per screen. It was the fifth
  // question on "Your week" and got missed on a device.
  | 'strength'
  // ⛔ THE WEEK WAS BRIEFLY THREE STEPS (`longday`, `standing`) AND IS ONE AGAIN (2026-08-06).
  // Michael: *"i thought we were doing one week 3 questions."* Three cards each holding a single
  // seven-chip row is three taps to answer what is visibly one thing, with the phone empty beneath.
  // The card stays; the QUESTION advances (`weekStage`), and the row keeps what has been answered.
  // ⛔ THE SCHEDULER — one screen, rebuilt 2026-07-28, replacing `run` + `bike` + `hardday` on the
  // strength path. Those three asked the same question in three places and none of them could show
  // the answer: how many endurance sessions fit around four lifting days, and where the one that
  // does not fit lands. Michael: *"this is a rebuild, one simple scheduler."*
  //
  // ⚠️ VOLUME STAYS SEPARATE. Miles and hours are HOW MUCH; this card is WHEN. Deciding the second
  // while looking at the first is what made the old run card scroll past the fold.
  | 'schedule' | 'volume'
  // ⛔ THE BLOCK SHAPE — four lifting days or three (2026-07-29). Its own card because it is not a
  // scheduling preference, it is which programme the athlete is running: at four, every lift is
  // trained first and every top set is a clean measurement; at three, two lifts share a day and one
  // of them is read under fatigue on the weeks that are not the test week. That trade has to be
  // stated, not buried in a stepper. Michael: *"its its own card and it explains the structure."*
  | 'lifting'
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
  // ⛔ NOT ON THE STRENGTH PATH. Lifting is four days fixed by the protocol and the endurance days
  // are typed per discipline, so a total would only contradict both. *"how many days is redundant."*
  if (!isStrengthFocus) out.push('days');
  // ⛔ THE SHAPE BEFORE THE SCHEDULE. How many days the lifting occupies decides the week the
  // scheduler then draws, so asking it after would mean drawing a week and immediately redrawing it.
  if (strengthDevelop) out.push('lifting');
  if (strengthDevelop) out.push('accessory');
  // ⛔ ONE SCHEDULER ON THE STRENGTH PATH. Every other goal keeps the per-discipline cards, because
  // there the endurance IS the plan and there is no lifting frequency to fit it around.
  if (isStrengthFocus && (kept('run') || kept('bike'))) {
    out.push('volume');
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
  const swimKept = state.posture?.swim != null && state.posture?.swim !== 'out';
  if ((strengthDevelop || isRaceGoal) && swimKept) out.push('swim');
  return out;
}

function getSteps(state: NonRaceState): StepKey[] {
  // ⛔ STRENGTH FOCUS SKIPS "What can you sustain?". That step converts a Light/Moderate/Committed
  // tier into `weekly_hours_available` — and on this path nothing reads it. The lifting is four days,
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
  if (isRaceGoal) return ['goal', 'race', 'days', 'strength', 'level', 'intent', 'confirm'];

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
          // is four days fixed by the protocol; the endurance volume is typed per discipline). But
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
          // ⛔ THE BLOCK SHAPE, and it is a SEPARATE FIELD from `strength_frequency` above on purpose
          // (2026-07-29). That one is the retired D-323 dial and branches downstream still clamp it
          // to 2; this one says how many DAYS the four lifts occupy. Sent only when the athlete picks
          // 3, so an untouched flow is byte-identical to yesterday's.
          ...(state.liftingDays === 3 ? { lifting_days: 3 } : {}),
          per_discipline_posture: state.posture,
          // ⛔ THE CLUB NIGHT GOES IN THE SLOT ITS INTENSITY NAMES. A social club run filed as
          // `quality_run` tells the engine to put the week's intervals on the one evening the
          // athlete is jogging and chatting. `runClubIntensity` decides which key it lands in;
          // `buildPreferredDays` omits both when no day is picked.
          preferred_days: buildPreferredDays(state.posture, {
            trainingDays: state.trainingDays,
            restDays: state.restDays,
            longRunDay: state.longRunDay, longRideDay: state.longRideDay,
            qualityDays: state.runClubIntensity === 'quality' ? state.qualityDays : {},
            easyDays: state.runClubIntensity === 'easy' ? state.qualityDays : {},
            // ⚠️ RIDES ALONG WITH THE HARD-RUN PIN AND DIES WITH IT. `buildPreferredDays` writes it
            // only when `qualityDays.run` survives the gate above — so a club run the athlete
            // declared EASY carries no terrain, which is right: there is no hard run to give ground
            // to, and a terrain answer sitting beside an easy day would be a preference for a
            // session that does not exist.
            qualityRunTerrain: state.qualityRunTerrain,
          }),
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
          ...(state.posture?.strength === 'develop' && state.runDays >= 2 ? { run_days: state.runDays } : {}), // Get Strong run frequency (2/3/4); engine spreads miles + stacks extras onto upper lift days
          // Strength Focus: the three assistance picks. The composer validates each name against the
          // shared menu, so a stale one falls back to the default rather than reaching a session.
          ...(state.posture?.strength === 'develop' && Object.keys(state.assistancePicks).length > 0
            ? { assistance_picks: state.assistancePicks } : {}),
          ...(state.posture?.swim === 'maintain' && state.swimDays > 0 ? { swim_days: state.swimDays } : {}),
          // Bike volume in HOURS (D-323 §6). Stored as typed; the engine turns hours into sessions —
          // it cannot turn miles into anything, having never learned a ride speed.
          ...(state.posture?.bike === 'maintain' && Number(state.rideHours) > 0
            ? { target_weekly_ride_hours: Number(state.rideHours) } : {}),
          // How many days those hours spread across (1/2/3). Without it the engine guessed.
          ...(state.posture?.bike === 'maintain' && state.rideDays > 0
            ? { ride_days: state.rideDays } : {}),
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
  /** Which of the week card's three questions is being asked. Card-local — never in the payload. */
  const [weekStage, setWeekStage] = useState<0 | 1 | 2 | 3>(0);
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
    // ⚠️ 4 IS SEEDED AND THAT IS DELIBERATE, against the no-prefill rule one field up. This is not a
    // blank question — it is the block's default shape, and 4 is what every block built before today
    // ran. An unlit pair here would read as "the app has no opinion", and the app does: four days is
    // Wendler's own, and it is the only shape where every lift is trained first and every top set is
    // a clean measurement. The card states that rather than hiding it behind an empty control.
    // ⚠️ `hill_3min` IS THE SEED AND IT IS NOT AN ARBITRARY ONE — it is the session this block has
    // built since it shipped, and the doctrine's default (§2.0: hill is the recommendation, and the
    // default position carries that rather than the word "recommended"). An athlete who never looks
    // at the menu gets exactly the week they got yesterday.
    daysPerWeek: 5, trainingDays: [], restDays: [], longRunDay: '', longRideDay: '', qualityDays: {}, qualityRunTerrain: 'hill_3min', usualMiles: '', targetMiles: '', targetTouched: false, runDays: 0, assistancePicks: {}, swimDays: 2, rideHours: '', rideDays: 0, liftingDays: 4, startDate: planWeekStartISO(),
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
        .select('effort_score, effort_source_distance, effort_source_time, effort_paces, learned_fitness')
        .eq('user_id', uid).maybeSingle();
      if (cancelled) return;
      setPaceRow(data as PaceBenchmarkRow);
      setPaceChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);
  const paceOnFile = paceChecked && hasPaceBenchmark(paceRow);
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
  const weekRoles = weekDayRoles({
    trainingDays: state.trainingDays,
    restDays: state.restDays,
    longRunDay: state.longRunDay || undefined,
    standingDay: state.qualityDays.run || undefined,
    days: DAYS,
  }) as Partial<Record<DayName, DayRole>>;

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
  const longDayCalledFor = (d: 'run' | 'bike') => (d === 'run'
    ? state.runDays >= 2 && Number(state.targetMiles) > 0
    : state.rideDays >= 2 && Number(state.rideHours) > 0);

  const scheduleCanContinue = (['run', 'bike'] as const).every((d) => {
    if (!posturePresent(d)) return true;
    if ((d === 'run' ? state.runDays : state.rideDays) <= 0) return false;
    if (!longDayCalledFor(d)) return true;
    return !!(d === 'run' ? state.longRunDay : state.longRideDay);
  }) && (['run', 'bike'] as const).every((d) => !(d in state.qualityDays) || !!state.qualityDays[d]);
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
    return assemblePayload(state, equipmentTier, canonMiles, canonLongRun, paceMinPerMile, canonElevM);
  };

  const handleConfirm = () => {
    if (!state.goal) return;
    void complete(payloadNow());
  };

  /**
   * ⛔ SHOW THE WEEK BEFORE IT IS ACCEPTED, AND SHOW WHAT IT COULD NOT HONOUR.
   *
   * The athlete answers four lifting days (fixed by the protocol), three run days and two ride days
   * and never sees that it adds to seven days with no rest — because nobody adds it up in front of
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
  React.useEffect(() => {
    if (currentStep !== 'schedule') return;
    if (!state.longRunDay && !state.longRideDay) return;   // nothing to solve around yet
    const t = setTimeout(() => { void runPreview(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, state.longRunDay, state.longRideDay, state.runDays, state.rideDays,
      state.qualityDays, state.targetMiles, state.rideHours]);

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
        : active ? 'border-teal-400 bg-teal-500/10' : 'border-white/12 bg-white/[0.03]'
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

  return (
    // h-full (not 100dvh) so it fills GoalsScreen's content area and keeps the app nav/banner when
    // embedded; standalone route still fills its container.
    <div className="h-full bg-zinc-950 text-white flex flex-col">
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
          subtitle="What you're building. The rest keeps ticking over underneath."
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
          subtitle="Same lifts, same 5/3/1 loading. What changes is the work around them."
          onBack={back} onContinue={next} canContinue={state.strengthTier != null}
          hideContinue hideProgress
        >
          <div className="space-y-2">
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
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 placeholder:text-white/25 focus:outline-none focus:border-teal-500/50"
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
                    className={`py-2 rounded-lg text-sm ${state.raceDistance === d ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                  >{d}</button>
                ))}
              </div>
              {/* Say why there is one option, so it reads as scope and not as a broken control. */}
              <p className="text-white/50 text-xs mt-1.5">
                Marathon first. The other distances come on the same machinery.
              </p>
            </div>

            <div>
              <p className="text-white/85 text-sm mb-2">Race day</p>
              <input
                type="date"
                value={state.raceDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setState((s) => ({ ...s, raceDate: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
                style={{ fontSize: '16px' }}
              />
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
                  className="w-28 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
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
                  <p className="text-white/85 text-sm mb-2">Weekly {unit === 'km' ? 'kilometres' : 'miles'} now</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" inputMode="decimal" min={0}
                      value={state.targetMiles === '' ? '' : state.targetMiles}
                      onChange={(e) => setState((st) => ({
                        ...st, targetMiles: e.target.value === '' ? '' : Number(e.target.value), targetTouched: true,
                      }))}
                      className="w-24 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
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
                      className="w-24 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
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
                  Easy running and long runs. No pace targets to hit.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setState((st) => ({ ...st, raceIntent: 'speed' }))}
                className={optBtn(state.raceIntent === 'speed')}
              >
                <span className="font-medium">A time</span>
                <span className="block text-white/55 text-sm mt-0.5">
                  Adds tempo work and intervals, written against your paces.
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
                      className="w-28 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm text-center"
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
          subtitle="What you're buying, before you commit to it."
          onBack={back} onContinue={next} canContinue={postureCanContinue}
        >
          <div className="space-y-3">
            {/* ⛔ THE BLOCK OPENS WITH WHAT IT IS — but in three lines, not four sections. The full
                version is the PLAN's, where the athlete is reading; here they are choosing, and the
                explanation was pushing the question it explains below the fold. Same source numbers,
                so the card and the plan cannot promise different blocks. */}
            <p className="text-white/75 text-sm leading-relaxed">{strengthFocusBrief({})}</p>
            <p className="text-white/85 text-sm pt-1">Which endurance are you keeping?</p>
            {(['run', 'bike', 'swim'] as const).map((d) => {
              const color = getDisciplineColor(d);
              const Icon = DISCIPLINE_ICONS[d];
              const keeping = (state.posture[d] ?? 'out') === 'maintain';
              return (
                <button
                  key={d} type="button"
                  onClick={() => setPosture(d, keeping ? 'out' : 'maintain')}
                  className={`w-full rounded-xl border p-3 flex items-center justify-between ${keeping ? 'border-white/25 bg-white/[0.06]' : 'border-white/12 bg-white/[0.02]'}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color }} />
                    <span className="font-medium" style={{ color: keeping ? color : 'rgba(255,255,255,0.45)' }}>
                      {DISCIPLINE_LABEL[d]}
                    </span>
                  </span>
                  <span className={`text-sm ${keeping ? 'text-white/85' : 'text-white/45'}`}>
                    {keeping ? 'Keeping' : 'Not this block'}
                  </span>
                </button>
              );
            })}
            {/* ⛔ KEEP THE CAVEAT, DROP THE REPEAT. The brief above already says the endurance is
                held easy; what it does not say is what this block will NOT hold, and that is the
                half an athlete needs before choosing. */}
            <p className="text-white/50 text-xs">Speed and threshold are not maintained by this block.</p>
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
                          className={`px-2 py-2 rounded-lg text-sm border ${active ? 'border-transparent text-zinc-950 font-semibold' : 'border-white/12 text-white/85'} ${disabled ? 'opacity-30' : ''}`}
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
                            className={`px-2 py-2 rounded-lg text-xs border ${state.strengthProtocol === sp.id ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/75'}`}
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
                className="w-full accent-teal-500"
              />
              <p className="text-white/60 text-sm">{floor}–52 weeks. Shorter than {floor} wouldn't show in a retest.</p>
            </div>
          </StepLayout>
        );
      })()}

      {/* ⛔ NOT ON THE STRENGTH PATH. Lifting is four days fixed by the protocol, and the endurance
          days are typed per discipline. A total that contradicts both is a number the engine cannot
          honour. Michael, 2026-07-25: *"how many days is redundant."* */}
      {/* ⛔ ONE WEEK, THREE QUESTIONS, ONE CARD (2026-08-06). Michael: *"i thought we were doing one
          week 3 questions."*
          I split it into three screens and each one held a single seven-chip row with two thirds of
          the phone empty under it — three taps to answer what is visibly one thing. The week is the
          control; the QUESTION moves, not the card. The row stays put and fills in while they answer,
          which is also what makes the three questions tellable apart: the athlete watches the same
          week gain marks instead of meeting three identical rows on three screens. */}
      {currentStep === 'days' && (
        <StepLayout
          step={stepNo('days')} totalSteps={steps.length} title="Your week"
          subtitle={isRaceGoal ? WEEK_QUESTIONS[weekStage].prompt : undefined}
          onBack={isRaceGoal && weekStage > 0 ? () => setWeekStage((n) => (n - 1) as 0 | 1 | 2 | 3) : back}
          onContinue={isRaceGoal && weekStage < 3 ? () => setWeekStage((n) => (n + 1) as 0 | 1 | 2 | 3) : next}
          canContinue={
            !isRaceGoal
              ? true
              : weekStage === 0
                ? (state.trainingDays.length === 0 || state.trainingDays.length >= 4)
                : weekStage === 1
                  ? !!state.longRunDay
                  : true
          }
          continueLabel={!isRaceGoal || weekStage === 3 ? 'Continue' : 'Next'}
        >
          {isRaceGoal ? (
            <div className="space-y-4">
              {/* THE WEEK. One row, always here, always current — the three questions write onto it. */}
              <WeekDayRow
                selected={
                  weekStage === 0 ? state.trainingDays
                    : weekStage === 1 ? (state.longRunDay ? [state.longRunDay as DayName] : [])
                      : weekStage === 2 ? state.restDays
                        : (state.qualityDays.run ? [state.qualityDays.run as DayName] : [])
                }
                disabled={
                  weekStage === 0 || state.trainingDays.length === 0
                    ? []
                    : weekStage === 2
                      // Rest is picked from the days you DON'T run — a run day cannot also be rest.
                      ? DAYS.filter((d) => state.trainingDays.includes(d))
                      : DAYS.filter((d) => !state.trainingDays.includes(d))
                }
                roles={weekRoles}
                onTap={(d) => {
                  if (weekStage === 0) {
                    setState((st) => ({
                      ...st,
                      trainingDays: st.trainingDays.includes(d)
                        ? st.trainingDays.filter((x) => x !== d)
                        : [...st.trainingDays, d],
                      // A day that stops being a training day cannot keep carrying the long run or
                      // the club night — the later questions would offer a dead chip and the payload
                      // would pin a day the athlete just took back.
                      longRunDay: st.longRunDay === d && st.trainingDays.includes(d) ? '' : st.longRunDay,
                      qualityDays: st.qualityDays.run === d && st.trainingDays.includes(d)
                        ? (() => { const q = { ...st.qualityDays }; delete q.run; return q; })()
                        : st.qualityDays,
                    }));
                  } else if (weekStage === 1) {
                    setState((st) => ({ ...st, longRunDay: d }));
                  } else if (weekStage === 2) {
                    setState((st) => ({
                      ...st,
                      restDays: st.restDays.includes(d) ? st.restDays.filter((x) => x !== d) : [...st.restDays, d],
                    }));
                  } else {
                    setQualityDay('run', state.qualityDays.run === d ? '' : d);
                  }
                }}
              />

              {/* What the week says so far — the answered questions, in one line each. */}
              <div className="space-y-1">
                <p className="text-white/50 text-xs leading-relaxed">
                  {state.trainingDays.length === 0
                    ? 'No days pinned — the plan picks them.'
                    : `${state.trainingDays.length} training ${state.trainingDays.length === 1 ? 'day' : 'days'}, ${7 - state.trainingDays.length} rest.`}
                  {state.longRunDay ? ` Long run ${DAY_SHORT[state.longRunDay as DayName]}.` : ''}
                  {state.restDays.length > 0 ? ` Rest ${state.restDays.map((d) => DAY_SHORT[d]).join(' ')}.` : ''}
                  {state.qualityDays.run ? ` Club ${DAY_SHORT[state.qualityDays.run as DayName]}.` : ''}
                </p>
                <p className="text-white/40 text-xs leading-relaxed">{WEEK_QUESTIONS[weekStage].hint}</p>
              </div>

              {weekStage === 0 && state.trainingDays.length > 0 && state.trainingDays.length < 4 && (
                <p className="text-white/60 text-xs leading-relaxed">
                  A marathon block is built on four days or more. Fewer than that and the long run
                  carries a share of the week no single run should.
                </p>
              )}

              {weekStage === 3 && clubCollision && (
                <p className="text-white/60 text-xs leading-relaxed">{clubCollision}</p>
              )}

              {weekStage === 3 && state.qualityDays.run && (
                <div>
                  <p className="text-white/85 text-sm mb-2">Is it hard or easy?</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['quality', 'Hard'], ['easy', 'Easy / social']] as const).map(([k, label]) => (
                      <button
                        key={k} type="button"
                        onClick={() => setState((st) => ({ ...st, runClubIntensity: k }))}
                        className={`py-2 rounded-lg text-sm border ${state.runClubIntensity === k ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/75'}`}
                      >{label}</button>
                    ))}
                  </div>
                  <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                    A hard day gets the week&apos;s quality session. An easy one is filed as aerobic and
                    the plan puts its hard running elsewhere.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-white/85 text-sm mb-2">Days a week</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[4, 5, 6, 7].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s2) => ({ ...s2, daysPerWeek: n }))}
                    className={`py-2 rounded-lg text-sm ${state.daysPerWeek === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
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
                    ['durability', 'Keep me together',
                      'Two short sessions — posture, single-leg, tendon work. It is not lifting to get stronger; it is what keeps the mileage from finding a weak link.'],
                    ['heavy', 'Keep lifting heavy',
                      'Two sessions of low-rep barbell work. Improves running economy without adding bulk — the volume is deliberately too low for that. Needs a barbell.'],
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
                          ? 'border-teal-400/70 bg-teal-400/[0.07]'
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

      {/* ⛔ THE BLOCK SHAPE — and the card's job is to state a TRADE, not to offer a preference.
          Michael: *"its its own card and it explains the structure."*

          ── What each line is sourced to ────────────────────────────────────────────────────────
          - *"Four days is Wendler's own"* — his standard template is one main lift per day.
          - *"Three days still builds strength"* — the volume-equated meta-analysis (Grgic et al.,
            Sports Medicine Open) found NO significant effect of training frequency on strength gain;
            one day a week and three-plus produce similar results when weekly volume matches. So the
            three-day option is not a lesser programme, and the card must not imply it is.
          - *"the second lift gives up load and reps"* — exercise-order effects: the movement done
            first is the one that adapts most, and later lifts lose weight and reps to fatigue.
          - *"week 3 splits them"* — muscular fatigue status is a named standardisation variable in
            the 1RM-testing literature, and %1RM prescriptions rest on testing done in a fatigue-free
            state. Test-retest reliability is good-to-excellent (ICC ≥ 0.90) CONDITIONAL on
            standardisation — which is why every test week is four days rather than some of them.

          ⚠️ WHAT IS OURS AND SAYS SO: nobody has trialled "train three, test on a fourth." The parts
          are measured; the join is reasoned, and it is a scheduling choice made to protect a
          measurement rather than a claim about the body. Wendler does not write it either — at three
          days HE rotates the four lifts and lets the cycle run past four weeks; at two days he stacks
          two lifts per session and keeps the calendar. This is his two-day trade one day up.

          ⚠️ FOUR IS PRESELECTED, against the no-prefill rule the day fields now follow. That was a
          deliberate exception: this is not a blank question, it is the block's default shape and the
          one every previous block ran. See the `liftingDays: 4` seed. */}
      {currentStep === 'lifting' && (
        <StepLayout
          step={stepNo('lifting')} totalSteps={steps.length} title="Lifting days"
          subtitle="Four lifts either way. This is how many days they sit on."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-3">
            <button
              type="button" onClick={() => setState((s) => ({ ...s, liftingDays: 4 }))}
              className={optBtn(state.liftingDays === 4)}
            >
              {/* ⛔ THE TWO CARDS ARE ONE COMPARISON AND MUST USE ONE AXIS. Michael's framing, fourth
                  pass: *"a 4 day week favors staying fresh for every lift, a 3 day week may result in
                  fatigue in executing the second lift."* So four days says FRESH and three days says
                  MAY BE FATIGUED — the same variable, once as the upside and once as the risk.

                  ⚠️ "MAY", deliberately. The previous line asserted flatly that the second lift "is
                  done tired and gives up some load." The direction is sourced (the first movement in a
                  session adapts most) but the MAGNITUDE for any given athlete is not, and an endurance
                  athlete's bench and press are not the heaviest thing in their week. Stating a
                  certainty we do not have is the same fault as citing a paper that says something
                  else. */}
              <span className="block text-white/90 text-sm">Four days</span>
              <span className="block text-white/60 text-sm mt-0.5 leading-relaxed">
                One lift a day. Favours staying fresh for every lift, so every top set is a clean read
                of what that lift can do. This is Wendler's own shape.
              </span>
            </button>
            <button
              type="button" onClick={() => setState((s) => ({ ...s, liftingDays: 3 }))}
              className={optBtn(state.liftingDays === 3)}
            >
              {/* ⛔ THE OPTION HAS TO CARRY THE TRADE AND THE TEST WEEK (2026-07-29, second pass).
                  Michael, on the screen: *"3 day copy is a little unlcear should map tradeoffs and
                  that 1 week willbe 4 to test 1rm."*

                  The first draft read *"same weekly work — with volume matched, strength gain does not
                  track how many days it is spread over."* That is the volume-equated meta-analysis
                  paraphrased, and it fails twice on this card: it argues a POSITION instead of naming
                  what the athlete gives up, and volume is NOT in fact fully matched here — the second
                  upper lift is trained fatigued, which is the whole reason the pair was chosen. So the
                  line was defending the option with a study while omitting its cost.

                  ⚠️ AND THE FOUR-DAY WEEK CANNOT BE A SURPRISE. An athlete picks three days because
                  three is what their week holds; finding out later that one week in four needs a
                  fourth is exactly the kind of thing that has to be said before they choose, not in a
                  panel underneath after they have. */}
              <span className="block text-white/90 text-sm">Three days</span>
              {/* ⛔ SAY THE PURPOSE IN THE FIRST FIVE WORDS. Michael, third pass on this card:
                  *"CAN YOU JUST SAY CLEARLY THE PURPOSE? TO test your 1rm."* The previous line
                  described the mechanism — shares a day, done tired, back to four days — and left the
                  athlete to work out what the fourth day was FOR. "That is the week your next weights
                  are set from" is a consequence, not a purpose, and it reads as scheduling admin.
                  It is a MAX TEST. Name it. */}
              {/* ⛔ THE "ONE WEEK IN FOUR GOES BACK TO FOUR DAYS" PROMISE IS GONE (2026-08-05).
                  It described the week-3 test split, which has been removed. That split existed to
                  protect a fresh AMRAP, and the trace killed its premise: `applyVerdict` steps the
                  working number by a FIXED increment (+5 / +10) and `verdictFrom95Set` reads only
                  whether the prescribed single at 95% was completed. The next weight is never
                  computed off an estimated max from that set, so a fatigued lift cannot bias it.
                  ⚠️ A card promising a fourth day the engine no longer builds is the worst kind of
                  stale copy — an athlete picks three BECAUSE three is what their week holds. */}
              <span className="block text-white/60 text-sm mt-0.5 leading-relaxed">
                Bench and press share a day, which may leave the second lift fatigued. Three days every
                week — nothing switches to four.
              </span>
            </button>

            {state.liftingDays === 3 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                <div>
                  <p className="text-white/70 text-xs font-medium mb-1">Most weeks</p>
                  <p className="text-white/50 text-xs leading-relaxed">
                    Squat · Deadlift · Bench + Press
                  </p>
                </div>
                {/* ⛔ THE MAX-TEST WEEK PANEL IS GONE with the split it described. What replaces it is
                    the TRADE, sourced to Wendler rather than to us — Michael's wording, 2026-08-05.
                    Checked against `docs/COPY-VOICE.md` and `voiceViolation()`: all three sentences
                    clean. ⚠️ The previous version ended by crediting the fourth day to "how strength
                    tests are standardised, not the book" — an honest sentence about a thing that no
                    longer happens, which is exactly how a screen starts lying. */}
                <p className="text-white/45 text-xs leading-snug">
                  The four-day plan gives each lift its own day. On three, two lifts share a day and the
                  second is trained fatigued — that is Wendler's own three-day design, not a shortcut.
                  Because 5/3/1 adds weight for hitting a rep target rather than a fresh max, a fatigued
                  lift still progresses.
                </p>
                <p className="text-white/35 text-xs leading-snug">
                  Bench goes first on the shared day — the heavier lift leads, so the one that gives up
                  load and reps is the lighter of the two.
                </p>
              </div>
            )}
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
      {currentStep === 'accessory' && (
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
            {/* ⛔ REWRITTEN 2026-07-29 — the short version was broken twice over, and BOTH breaks
                came from cutting the paragraph above it rather than from the cut being wrong.
                • "that pattern" had NO ANTECEDENT. The deleted paragraph introduced the word; the
                  survivor opened by pointing back at a sentence that was no longer on the screen.
                • The example was FACTUALLY MUDDLED: it read "chin-ups on bench day, rows on press
                  day" as two instances of the same behaviour. Chin-ups on bench day is the pick
                  STANDING (`resolveAssistance`: no shared family, and vertical pull already IS the
                  complement of a horizontal press). Only the press day substitutes. Listing them
                  together taught the athlete the rule fires everywhere, which it does not.
                So: one example, and one that is unambiguously a swap. Push Up on bench day collides
                — both horizontal push — and the slot takes balancing work instead. */}
            {/* ⛔ THE LAST SENTENCE IS A PROMISE, AND IT WAS CHECKED BEFORE IT WAS WRITTEN.
                The Swap sheet is D-290, SHIPPED — `StrengthLogger.tsx:4440` renders the button on
                EVERY exercise row (accessories included, not just the main lifts), and
                `getInSlotAlternatives` offers substitutes filtered by movement pattern + the
                athlete's own equipment. `swapRestOfPlan` persists the choice past today.
                ⚠️ IF THAT BUTTON EVER MOVES OR NARROWS TO MAIN LIFTS ONLY, THIS LINE BECOMES A LIE
                on the screen where the athlete is deciding whether to care about the picks at all. */}
            <p className="text-white/70 text-sm leading-relaxed">
              You&apos;ll get these most days. Where the main lift already covers one — push-ups after
              bench press — you&apos;ll get the opposite movement instead. Anything can be swapped in
              the session.
            </p>
            <div className="space-y-3">
              {ASSISTANCE_MENU.map((menu) => {
                const picked = state.assistancePicks[menu.slot] ?? ASSISTANCE_DEFAULTS[menu.slot];
                const targets = menu.options.find((o) => o.name === picked)?.targets ?? '';
                return (
                  <div key={menu.slot}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-white/85 text-sm">{menu.label}</span>
                      <span className="text-white/70 text-sm tabular-nums">{menu.totalReps} reps</span>
                    </div>
                    <select
                      value={picked}
                      onChange={(e) => setState((st) => ({
                        ...st,
                        assistancePicks: { ...st.assistancePicks, [menu.slot]: e.target.value },
                      }))}
                      className="w-full py-2 px-3 rounded-lg text-sm bg-white/[0.06] border border-white/12 text-white appearance-none"
                      style={{ fontSize: '16px' }}
                      aria-label={`${menu.label} exercise`}
                    >
                      {menu.options.map((o) => (
                        <option key={o.name} value={o.name} className="bg-neutral-900">{o.name}</option>
                      ))}
                    </select>
                    {/* The whole point of the dropdown: the athlete sees what the choice trains. */}
                    {targets && <p className="text-white/70 text-sm mt-1">{targets}</p>}
                  </div>
                );
              })}
            </div>
            <p className="text-white/70 text-sm leading-relaxed">{ASSISTANCE_GUIDANCE}</p>
          </div>
        </StepLayout>
      )}

      {/* ⛔ HOW MUCH — the volume card. Separated from the scheduler on purpose: deciding WHEN while
          looking at HOW MUCH is what made the old run card scroll past the fold on a phone. */}
      {currentStep === 'volume' && (
        <StepLayout
          step={stepNo('volume')} totalSteps={steps.length} title="How much"
          subtitle="Your holding dose while strength leads. All of it conversational."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-6">
            {posturePresent('run') && (
              <div>
                {/* ⛔ THE ATHLETE'S OWN UNIT. `unit` comes off their baselines and the payload
                    canonicalises back to miles on the way out — a metric athlete typing 22 means
                    22 km, and showing them "mi/wk" would silently take it as 22 miles. */}
                <p className="text-white/85 text-sm mb-2">Weekly running to hold</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric" min={0} placeholder={unit === 'km' ? 'e.g. 22' : 'e.g. 14'}
                    value={state.targetMiles === '' ? '' : String(state.targetMiles)}
                    onChange={(e) => setState((st) => ({ ...st, targetMiles: e.target.value === '' ? '' : Number(e.target.value), targetTouched: true }))}
                    className="w-28 py-2 px-3 rounded-lg text-sm bg-white/[0.06] border border-white/12 text-white"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="px-2.5 py-1 rounded-md bg-white/[0.08] text-white/85 text-sm font-medium">
                    {unit === 'km' ? 'km' : 'miles'} / week
                  </span>
                </div>
                {/* ⛔ ASK FOR THE FLOOR, NOT THE AVERAGE. "What do you run?" gets their good week —
                    the number they would tell a friend. For a MAINTENANCE dose the floor is the
                    correct input anyway, so the honest answer and the useful one are the same. */}
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  A week you can hit even when work is bad — not your best one. This is what the plan
                  builds around, and the sessions will not shrink to meet you.
                </p>
                {/* ⛔ THE ONE FINDING THAT HAS TO REACH THE ATHLETE, AND IT IS COUNTERINTUITIVE.
                    Every athlete assumes the hard session is the threat to their lifting. It is not.

                    **Fyfe JJ, Bartlett JD, Hanson ED, Stepto NK, Bishop DJ (2016), "Endurance Training
                    Intensity Does Not Mediate Interference to Maximal Lower-Body Strength Gain during
                    Short-Term Concurrent Training", Frontiers in Physiology 7:487 (PMC5093324).**
                    8 weeks, three groups: RT only +38.5 ± 8.5%, HIT+RT +28.7 ± 5.3%, MICT+RT
                    +27.5 ± 4.6% on leg press. "All MICT sessions were work- and duration-matched to
                    the corresponding HIT session."

                    ⛔ TWO CORRECTIONS MADE 2026-08-06, BOTH AFTER THIS COPY HAD ALREADY SHIPPED:
                    1. **IT WAS CYCLING, NOT RUNNING.** The first version of this paragraph said "hard
                       and easy running". The trial used cycling — the conclusion reads "whether HIT or
                       MICT cycling is incorporated". Applying it to running is a stretch in the
                       direction of OVERSTATING, since cycling carries less eccentric load.
                    2. **VOLUME IS THE AUTHORS' SUGGESTION, NOT THEIR RESULT.** They wrote volume
                       "MIGHT BE a more critical mediator". They held work constant and varied
                       intensity, so what is measured is that INTENSITY does not mediate. The copy
                       stated the volume half flatly and now does not.

                    ⚠️ What survives cleanly is the useful half: pace is not the thing. That is the
                    finding, it is counterintuitive, and this is the screen where the volume is chosen.

                    ⛔ THIS PAPER ALSO DECIDES THE HARD SESSION'S REP COUNT — see `DECISIONS-LOG-2.md`
                    **D-389**, which holds both this and Wen 2019 (the ≥15 min VO2max threshold) and
                    the sentence that connects them: the 5th hill rep would reach Wen's threshold and
                    is bought in exactly the total work Fyfe found interferes with strength. Neither
                    doc said that until 2026-08-06, and the two findings sat in different files.

                    ⚠️ CHECKED AGAINST `docs/COPY-VOICE.md` AND THE RUNTIME GATE, 2026-08-05. Two
                    earlier drafts failed: "How much to keep is yours to set" trips `voiceViolation`
                    on **keep** (banned imperative) and is second-person besides (rule 1); "give
                    ground" passed the gate and still breaks rule 10 — the banned list is finite and
                    idioms have to be caught by reading. ⛔ Run any edit to this paragraph through
                    `voiceViolation()`; passing that check is necessary, not sufficient. */}
                <p className="text-white/60 text-sm mt-3 leading-relaxed">
                  Pace is not what competes with strength here — total work is. Matched for equal work,
                  hard and easy endurance blunted leg-strength gains almost identically — 28.7% and
                  27.5%, against 38.5% for lifting alone. Intensity was not the mediator; the authors
                  point at total work instead. As weekly volume climbs, those strength gains get
                  smaller. The volume set here is the one the plan builds around.
                </p>
              </div>
            )}
            {state.posture?.bike === 'maintain' && (
              <div>
                <p className="text-white/85 text-sm mb-2">Weekly riding to hold</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric" min={0} placeholder="e.g. 3"
                    value={state.rideHours === '' ? '' : String(state.rideHours)}
                    onChange={(e) => setState((st) => ({ ...st, rideHours: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-28 py-2 px-3 rounded-lg text-sm bg-white/[0.06] border border-white/12 text-white"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="px-2.5 py-1 rounded-md bg-teal-500/20 text-teal-200 text-sm font-medium">
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
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                  {Number(state.rideHours) > 0 && state.rideDays > 0
                    ? (() => {
                        const per = Number(state.rideHours) / state.rideDays;
                        const h = Math.floor(per); const m = Math.round((per - h) * 60);
                        const len = h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
                        return `About ${len} a ride across ${state.rideDays} ride${state.rideDays === 1 ? '' : 's'}.`;
                      })()
                    : 'Hours, not distance — terrain and wind make ride distance a poor measure.'}
                </p>
              </div>
            )}
          </div>
        </StepLayout>
      )}

      {/* ⛔ THE SCHEDULER — one screen for every WHEN question, and the week underneath it.
          Replaces the run, bike and hard-day cards, which asked the same question in three places
          and none of which could show the answer. */}
      {currentStep === 'schedule' && (
        <StepLayout
          step={stepNo('schedule')} totalSteps={steps.length} title="Your week"
          subtitle="Your days. The lifting is placed around them."
          onBack={back} onContinue={next} canContinue={scheduleCanContinue}
        >
          <div className="space-y-4">
            {/* ⛔ THE WEEK FIRST, ABOVE THE CONTROLS. It is the answer, and it has to stay on screen
                while they tap — a result below the fold is a result they never see change. */}
            {/* ⛔ NEVER A SILENT EMPTY SPACE. This rendered nothing at all while the preview was
                running, had failed, or had never been asked for — three different states that all
                looked identical to the athlete, which is the same §0h defect the confirm card was
                fixed for. Each says which it is. */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 min-h-[9rem]">
              {previewWeek && previewWeek.length > 0 ? (
                <WeekGrid sessions={previewWeek} notes={[]} />
              ) : previewing ? (
                <p className="text-white/50 text-sm">Building your week…</p>
              ) : previewFailed ? (
                <p className="text-white/60 text-sm leading-relaxed">
                  The week could not be built — that is a fault on our side, not your answers.
                  {previewError ? <span className="block text-white/35 text-xs mt-1 font-mono break-words">{previewError}</span> : null}
                </p>
              ) : (
                <p className="text-white/45 text-sm">Pick your days and the week appears here.</p>
              )}
            </div>

            {/* ── the one hard day ─────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-white/85 text-sm whitespace-nowrap">Hard day</span>
                {/* ⚠️ `d in qualityDays`, NOT `!!qualityDays[d]` — the discipline is chosen the moment
                    it is tapped, and its day arrives after. Truthiness would unlight the button the
                    athlete just pressed. Tapping again clears the discipline entirely. */}
                {(['run', 'bike'] as const).filter((d) => posturePresent(d)).map((d) => {
                  const on = d in state.qualityDays;
                  return (
                    <button
                      key={d} type="button"
                      onClick={() => setState((st) => {
                        const next = { ...st.qualityDays };
                        if (d in next) delete next[d]; else next[d] = '';
                        return { ...st, qualityDays: next };
                      })}
                      className={`px-3 py-1.5 rounded-lg text-sm ${on ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                    >{d === 'run' ? 'Run' : 'Ride'}</button>
                  );
                })}
                {(['run', 'bike'] as const).filter((d) => d in state.qualityDays).map((d) => (
                  <select
                    key={d}
                    value={state.qualityDays[d] ?? ''}
                    onChange={(e) => setState((st) => ({ ...st, qualityDays: { [d]: e.target.value as DayName } }))}
                    className="flex-1 min-w-0 py-1.5 px-2 rounded-lg text-sm bg-white/[0.06] border border-white/12 text-white appearance-none"
                    style={{ fontSize: '16px' }}
                  >
                    <option value="" className="bg-neutral-900">Pick a day</option>
                    {DAYS.map((dd) => <option key={dd} value={dd} className="bg-neutral-900">{DAY_SHORT[dd]}</option>)}
                  </select>
                ))}
              </div>
              {/* ⛔ IT HAS TO SAY WHAT THE SESSION IS FOR (2026-07-29). "Never yields — intensity
                  holds your aerobic fitness" stated the RULE and not the PURPOSE, so an athlete read
                  a protected slot with no idea what it buys or why they would want one. Michael:
                  *"hard run/ride should ad its purpose: maintain vo2 max not speed or if you have a
                  run or ride club."*

                  ⛔ THE FIRST DRAFT SAID "not speed" AND IT WAS NOT SOURCED. That clause borrowed
                  Schumann's −0.28 explosive-strength effect, which is a claim about the WHOLE BLOCK
                  ("this block builds strength, not explosive speed", punch list / DOCTRINE §5.0.3)
                  — not about this session. Attaching a real citation to the wrong sentence is
                  exactly what D-328 and D-329 were both corrections for. Removed.

                  ✅ WHAT IS ACTUALLY SOURCED — `DOCTRINE-aerobic-maintenance.md` §3 and §5.0:
                  - It HOLDS. Hickson's maintenance trilogy (1981 frequency / 1982 duration / 1985
                    intensity) cut frequency 6→2 d/wk and duration 40→13 min with VO2max held for 15
                    weeks; only the intensity cut lost it. Intensity is the protective variable.
                  - It does NOT build. §5.0, sourced 2026-07-26: one interval session a week is
                    BELOW the improvement threshold for trained athletes — 2–3/wk is the range where
                    gains happen, while roughly one every 1–2 weeks preserves. *"The block does not
                    build the engine. It holds it. Any copy promising aerobic improvement during a
                    strength-led block is unsupported."* So "holds, does not build" is the honest
                    pair, and it is the sentence the doctrine asks for by name.

                  ⚠️ "top-end aerobic fitness", not "VO2 max" — COPY-VOICE rule 9 bans the metric
                  name the same way it bans "aerobic base" and "Z2".

                  ⚠️ NOT SAID, DELIBERATELY: that a hard RIDE costs less than a hard RUN. §5's
                  modality split is Wilson 2012, and Schumann 2022 (43 studies) found no modality
                  moderation at all — the doctrine's standing instruction is do not build a new
                  claim on it. The Run/Ride buttons stay neutral.

                  ✅ THE CITATIONS ARE BEHIND THE (i), NOT ON THE CARD. Michael: *"maybe thats an (i)
                  with that and the citations?"* The card carries the claim in one line and the
                  receipt sits one tap away in `HARD_DAY_WHY` — which is where the Hickson years, the
                  one-session-a-week threshold, and the reasons two other claims were CUT are all
                  written down. The pattern is the one `TrainingBaselines.tsx:1581` already uses. */}
              <div className="flex items-start gap-1.5">
                <p className="text-white/45 text-xs leading-snug">
                  One hard session a week holds top-end aerobic fitness. It does not build it. A run
                  or ride club goes here.
                </p>
                <button
                  type="button"
                  onClick={() => setShowHardDayWhy((v) => !v)}
                  aria-expanded={showHardDayWhy}
                  aria-label="What the hard day is for"
                  className="shrink-0 mt-px text-white/40 hover:text-white/70 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              {showHardDayWhy && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                  {HARD_DAY_WHY.map((s) => (
                    <div key={s.heading}>
                      <p className="text-white/70 text-xs font-medium">{s.heading}</p>
                      <p className="text-white/45 text-xs leading-snug">{s.body}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* ── the ground the hard RUN happens on ──────────────────────────
                  ⛔ IT LIVES HERE BECAUSE THIS IS THE CONTROL THAT EXISTS. It was first wired to the
                  `hardday` STEP, which the 2026-07-28 scheduler rebuild replaced — `scheduleSteps`
                  never pushes it, so the menu rendered nowhere and a device check found no cards.
                  That dead step has been deleted; this is the only hard-day control.

                  ⛔ STILL NOT A NEW STEP, WHICH IS WHAT §2.0 ACTUALLY REQUIRES. The doctrine bans a
                  "do you have a hill?" question outright — *"asking would buy nothing and cost a
                  screen… availability reveals itself in the choice."* This is a reveal inside the
                  card they are already on, one row under the toggle that triggers it.

                  ⚠️ KEYED ON `'run' in state.qualityDays`, THE SAME TEST THE DAY SELECT USES, and not
                  on truthiness — the discipline is chosen the moment Run is tapped and the day
                  arrives after. So the menu appears with the day picker, not after it.
                  ⚠️ Hidden for Hard ride (one shape, Helgerud 4 × 4, no terrain question) and for
                  neither-selected (there is no hard session to give ground to).

                  ⚠️ COMPACT ON PURPOSE. This screen carries a live week preview that must stay above
                  the fold while the athlete taps; the four options are one line of title and one of
                  consequence, in this card's own `text-xs` register, not the full-screen cards the
                  dead step used. The flat option's cost and its nudge survive the shortening —
                  that was the condition its ruling came with, not decoration. */}
              {'run' in state.qualityDays && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-white/85 text-sm">What you can run it on</span>
                  <div className="space-y-1">
                    {([
                      {
                        id: 'hill_3min' as const,
                        title: 'A hill you can run for 3 minutes',
                        body: 'Four 3-minute climbs, walk or jog back down. Running uphill may have less effect on your legs, leaving more of the week for lifting.',
                      },
                      {
                        id: 'treadmill' as const,
                        title: 'A treadmill',
                        body: 'The same four 3-minute efforts at 5-8% incline. The incline does the hill\'s job, so it may affect your legs no more than the hill does.',
                      },
                      {
                        id: 'hill_short' as const,
                        title: 'Only a short hill',
                        body: 'Ten 1-minute climbs. Shorter efforts hold less VO2 stimulus than the 3-minute version — the session for the hill you have.',
                      },
                      {
                        id: 'flat' as const,
                        // ⛔ THE STATED COST IS THE RULING'S CONDITION. §2.1 bans this session outright
                        // and §2.0 governs only because the athlete owns a STATED trade — the leg/lift
                        // effect must stay in the copy. (The treadmill nudge was cut 2026-08-06 as a
                        // scold: treadmill is its own card directly above, already declined here.)
                        title: 'Flat ground only',
                        body: 'Four 3-minute efforts on the flat. The same hard work, but without the climb it may have more effect on your legs, and your next lift may feel it.',
                      },
                    ]).map((opt) => (
                      <button
                        key={opt.id} type="button"
                        onClick={() => setState((st) => ({ ...st, qualityRunTerrain: opt.id }))}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${
                          state.qualityRunTerrain === opt.id
                            ? 'border-teal-400/70 bg-teal-500/10'
                            : 'border-white/12 bg-white/[0.04]'
                        }`}
                      >
                        <span className="block text-white/90 text-sm">{opt.title}</span>
                        <span className="block text-white/45 text-xs mt-0.5 leading-snug">{opt.body}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── runs ─────────────────────────────────────────────────────── */}
            {posturePresent('run') && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-white/85 text-sm whitespace-nowrap w-14">Runs</span>
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n} type="button" onClick={() => setState((st) => ({ ...st, runDays: n }))}
                      className={`w-10 py-1.5 rounded-lg text-sm ${state.runDays === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                    >{n}</button>
                  ))}
                </div>
                <DaySelect label="Long run" value={state.longRunDay} onChange={(d) => setState((st) => ({ ...st, longRunDay: d }))} />
              </div>
            )}

            {/* ── rides ────────────────────────────────────────────────────── */}
            {state.posture?.bike === 'maintain' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-white/85 text-sm whitespace-nowrap w-14">Rides</span>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n} type="button" onClick={() => setState((st) => ({ ...st, rideDays: n }))}
                      className={`w-10 py-1.5 rounded-lg text-sm ${state.rideDays === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
                    >{n}</button>
                  ))}
                </div>
                <DaySelect label="Long ride" value={state.longRideDay} onChange={(d) => setState((st) => ({ ...st, longRideDay: d }))} />
              </div>
            )}

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
              <DayPicker value={state.longRunDay} onChange={(d) => setState((s) => ({ ...s, longRunDay: d }))} />
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
                    className="w-28 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
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
                  className="w-28 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
                  style={{ fontSize: '16px' }}
                />
                <span className="text-white/75 text-sm">{unit}/wk</span>
                {/* ⛔ "I DON'T KNOW" IS A VALID ANSWER. Making someone compute a historical
                    baseline before a screen unlocks is a data-entry exam, not an intake. They
                    start at the band's floor — the ~2-sessions-a-week maintenance dose, not a new
                    number — and the app learns them from what they log. Worst case an
                    experienced athlete is under-asked for a few weeks and raises it; never that
                    someone is handed a volume they cannot carry with four lifting days. */}
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
                  className="w-24 py-2 px-3 rounded-lg bg-white/[0.04] text-white border border-white/12 text-sm"
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
                    className={`py-2 rounded-lg text-sm ${state.runDays === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
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
                  className="w-28 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-white text-sm"
                  style={{ fontSize: '16px' }}
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
              <div className="grid grid-cols-3 gap-1.5 max-w-[220px]">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s) => ({ ...s, rideDays: n }))}
                    className={`py-2 rounded-lg text-sm ${state.rideDays === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
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
              <DayPicker value={state.longRideDay} onChange={(d) => setState((s) => ({ ...s, longRideDay: d }))} />
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
              {[1, 2, 3].map((n) => (
                <button
                  key={n} type="button" onClick={() => setState((st) => ({ ...st, swimDays: n }))}
                  className={`flex-1 py-2 rounded-lg text-sm border ${state.swimDays === n ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/75'}`}
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
            : `${state.goal ? GOAL_LABELS[state.goal] : 'Goal'} — ${state.targetWeeks} weeks${isStrengthFocus ? ' of Wendler 5/3/1' : ''}.`}
          onBack={back} onContinue={handleConfirm} canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'} saving={saving}
        >
          {/* ⛔ THE POSTURE CARD IS GONE (2026-07-29). It listed Swim Out / Bike Maintain / Run
              Maintain / Strength Develop — four rows restating answers the athlete gave two screens
              ago, in the vocabulary of the engine rather than of their week. The grid below says the
              same thing in days they recognise, and says it specifically. The one fact it carried
              that the grid cannot — the protocol — moved to the subtitle. */}
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
              <input
                type="date"
                value={state.startDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
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
