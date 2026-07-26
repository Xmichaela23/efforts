import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bike, Waves, Dumbbell } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { useArcSetupContext } from '@/hooks/useArcSetupContext';
import { getDisciplineColor } from '@/lib/context-utils';
// ONE band, shared with the composer — what the athlete is told while typing and what the plan
// records cannot disagree. A REFERENCE, never a cap (D-222's ceiling was retired on purpose).
import { maintenanceDoseFor, startLightMiles, volumeStateForMiles, volumeStateLine, volumeStateLineVsUsual, volumeStateVsUsual } from '@/lib/maintenance-volume-band';
// ONE source for the block's own words — the composer writes the same sentences onto the plan.
import { strengthFocusSections, STRENGTH_FOCUS_WEEKS } from '@/lib/strength-focus-copy';
// ONE menu, shared with the composer that authors the block (`assistance-menu.ts`). A name this
// picker offers that the composer does not recognise would fall back to the default — the athlete
// would pick something and silently get something else.
import { ASSISTANCE_DEFAULTS, ASSISTANCE_GUIDANCE, ASSISTANCE_MENU, type AssistancePicks } from '@/lib/assistance-menu';
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
  GOAL_LABELS,
  GOALS_NEEDING_DISCIPLINE,
  strengthDevelopersFor,
  defaultStrengthDeveloper,
  sportFromPosture,
  STRENGTH_PROTOCOL_LABELS,
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
// ⛔ ONE CARD, AND THE REST WERE PLACEHOLDERS. Michael, 2026-07-25: *"let's clear out all the
// placeholders — let's just have Strength Focus now."*
//
// Build endurance / Build speed / Build muscle + train / Maintain / Starting over were all pickable
// and none of them had been built to the standard Strength Focus now sets. A front door offering
// five things that do not work is worse than a door offering one that does.
//
// The goal IDs still exist in `non-race-goal-seeds.ts` and existing goals built on them keep
// working — this list is only what the picker OFFERS. Add one back the day it is real.
//
// (Michael also ruled Maintain should never be a card at all: it is the state between blocks, not
// something an athlete chooses. The app drops into it when a block ends. See BUILD-ORDER.)
const GOAL_ORDER: NonRaceGoalId[] = ['get_stronger'];
const DAYS: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT: Record<DayName, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

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
// The line shown once BOTH hard days are taken — the ledger, not a warning. Nothing is refused.
const TWO_HARD_DAYS_LINE =
  'Two hard days alongside four lifting days is the ceiling. Hard intervals and heavy bar work draw '
  + 'on the same recovery, so at this level strength holds rather than climbs.';

// ⛔ THE MULHOLLAND DIALOG — and it is deliberate, so do not "clean it up" into house voice.
// Michael, 2026-07-25: *"we can hand them the keys to the Porsche, but it's up to them how they
// handle the curves on Mulholland… it's smart and funny, maybe unnecessarily sexy, but it gets the
// message across and it's language you would never see on a training app."*
//
// ⚠️ IT BENDS TWO RULES ON PURPOSE, both argued and both accepted:
//  1. `COPY-VOICE.md` rule 10 bans idiom and metaphor. That rule exists to kill EMPTY filler
//     ("trust the taper", "move the needle") — sentences that cost nothing and say nothing. This
//     metaphor carries the actual message: the capability is real and the consequence is yours.
//     Metaphor doing work, not metaphor doing decoration.
//  2. *"Gate it, don't warn it — no accept-the-risk button."* Held by CONSTRUCTION, not by wording:
//     the day is ALREADY SET before this opens, the dialog asks for nothing, and dismissing it
//     changes no state. There is no checkbox, no "I understand", and no path that refuses the
//     choice. It is the app being frank, not the app covering itself. **If a future change makes
//     this dialog decide anything, it has become the button this was not, and it must come out.**
//
// Fires ONCE PER BUILD, on the transition to two — not on every tap, and not again if they fiddle.
// A new block a year later is a new decision and gets it again.
function MulhollandDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-white/12 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-left text-lg">Two hard days</DialogTitle>
        </DialogHeader>
        <p className="text-white/90 text-[15px] leading-relaxed">
          We can hand you the keys to the Porsche. How you take the curves on Mulholland is up to you.
        </p>
        <p className="text-white/70 text-sm leading-relaxed">{TWO_HARD_DAYS_LINE}</p>
        <button
          type="button" onClick={onClose}
          className="w-full min-h-[48px] mt-1 rounded-xl bg-teal-500 text-white font-semibold text-base"
        >Got it</button>
      </DialogContent>
    </Dialog>
  );
}

function QualityDayPicker({
  label, hint, atCeiling, value, onChange,
}: {
  label: string; hint: string; atCeiling?: boolean;
  value: DayName | ''; onChange: (d: DayName | '') => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-white/85 text-sm">{label}</p>
        {value && (
          <button
            type="button" onClick={() => onChange('')}
            className="text-white/65 text-sm underline underline-offset-2"
          >Clear</button>
        )}
      </div>
      <DayPicker value={value} onChange={onChange} />
      <p className="text-white/70 text-sm mt-1.5 leading-relaxed">{hint}</p>
      {atCeiling && <p className="text-white/85 text-sm mt-2 leading-relaxed">{TWO_HARD_DAYS_LINE}</p>}
    </div>
  );
}

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
  goal: NonRaceGoalId | null;
  discipline: Discipline | undefined;
  posture: Partial<Record<Discipline, Posture>>;
  strengthProtocol: string | undefined;
  commitment: CommitmentTier;
  targetWeeks: number;
  daysPerWeek: number;
  longRunDay: DayName | '';
  longRideDay: DayName | '';
  /** The hard day the athlete already owns — a club run, a track night, a chaingang — PER DISCIPLINE.
   *  Was a single `anchorDiscipline` + `anchorDay`, which forced a runner who also rides to pick one
   *  and lose the other. `preferred_days` has always had room for both (`quality_run`, `quality_bike`),
   *  so the single-anchor shape was the narrower thing, not the safer one. */
  qualityDays: Partial<Record<'run' | 'bike', DayName>>;
  /** What they NORMALLY run, in their display unit. The band is a fraction of THIS — an absolute
   *  band tells a 40-mile runner and a 10-mile runner the same thing, and it is only true for one. */
  usualMiles: number | '';
  targetMiles: number | ''; // Get Strong: typed maintenance mileage, in the user's display unit; canonicalized to miles at confirm
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
  startDate: string; // Week 1 start (YYYY-MM-DD); plans are Monday-based so this snaps to that week server-side
};

type StepKey =
  | 'goal' | 'posture' | 'commitment' | 'length'
  // The old single `schedule` step, split one card per screen (below).
  | 'days' | 'accessory' | 'run' | 'bike' | 'swim'
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
function scheduleSteps(state: NonRaceState, isStrengthFocus: boolean): StepKey[] {
  const kept = (d: Discipline) => state.posture[d] != null && state.posture[d] !== 'out';
  const strengthDevelop = state.posture?.strength === 'develop';
  const out: StepKey[] = [];
  // ⛔ NOT ON THE STRENGTH PATH. Lifting is four days fixed by the protocol and the endurance days
  // are typed per discipline, so a total would only contradict both. *"how many days is redundant."*
  if (!isStrengthFocus) out.push('days');
  if (strengthDevelop) out.push('accessory');
  if (kept('run')) out.push('run');
  if (kept('bike')) out.push('bike');
  // Swim sits last — booked, not coached. It is the slot we merely hold, so it follows the work.
  if (strengthDevelop && state.posture?.swim === 'maintain') out.push('swim');
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
  const effective = state.goal ?? (GOAL_ORDER.length === 1 ? GOAL_ORDER[0] : null);
  const isStrengthFocus = effective === 'get_stronger';
  // ⛔ AND NO LENGTH SLIDER on this path. Twelve weeks is not a preference — Wendler's ratios are
  // 2:1, 3:2 and 2:2 over four-week cycles, so 12 is the only length that runs leader-leader-anchor
  // as designed. The slider offered 8-52 while the composer rounds DOWN to whole cycles, so 10
  // silently became 8 and 14 became 12: the athlete picked a number the engine never built. 8 ships
  // later as the short, off-ratio option, labelled as such.
  const head: StepKey[] = isStrengthFocus
    ? ['goal', 'posture']
    : ['goal', 'posture', 'commitment', 'length'];
  return [...head, ...scheduleSteps(state, isStrengthFocus), 'confirm'];
}

// The goal seeded the posture; the user may have edited it. Re-derive goal_type/sport/strength_protocol
// from the EDITED posture (derivePlanShape), not from seedFromGoal. Generic scheduling prefs kept.
// Default Week-1 start = the upcoming Monday (plans are Monday-based; the server snaps to the week anyway).
function nextMondayISO(): string {
  const d = new Date();
  const delta = (8 - d.getDay()) % 7 || 7; // days until next Monday (getDay: Sun=0…Sat=6)
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function assemblePayload(state: NonRaceState, equipmentTier?: string, targetWeeklyMiles?: number): ArcSetupPayload {
  const goal = state.goal!;
  const shape = derivePlanShape(state.posture, state.strengthProtocol, equipmentTier);
  return {
    summary: `${state.targetWeeks}-week ${GOAL_LABELS[goal]} block`,
    goals: [
      {
        name: GOAL_LABELS[goal],
        goal_type: shape.goal_type,
        target_date: null,
        target_weeks: state.targetWeeks,
        sport: shape.sport,
        distance: null,
        priority: 'A',
        training_prefs: {
          training_intent: 'completion',
          fitness: 'intermediate',
          days_per_week: state.daysPerWeek,
          strength_frequency: state.posture?.strength === 'develop' ? 4 : 2, // Get Strong = the 4-day develop arc; don't offer 2×/week the engine overrides
          weekly_hours_available: hoursForTier(state.commitment),
          per_discipline_posture: state.posture,
          preferred_days: buildPreferredDays(state.posture, {
            longRunDay: state.longRunDay, longRideDay: state.longRideDay,
            qualityDays: state.qualityDays,
          }),
          ...(shape.strength_protocol ? { strength_protocol: shape.strength_protocol } : {}),
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
        },
      },
    ],
    strength_frequency: state.posture?.strength === 'develop' ? 4 : 2, // Get Strong = the 4-day develop arc; don't offer 2×/week the engine overrides
    ...(state.startDate ? { plan_start_date: state.startDate } : {}), // Week 1 start → create-goal → the plan's calendar
  };
}

export default function NonRaceBuilder({ onClose }: { onClose?: () => void } = {}) {
  const navigate = useNavigate();
  const { complete, saving } = useArcSetupComplete();
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

  const [state, setState] = useState<NonRaceState>({
    goal: null, discipline: undefined, posture: {}, strengthProtocol: undefined, commitment: 'light', targetWeeks: 12,
    daysPerWeek: 5, longRunDay: '', longRideDay: '', qualityDays: {}, usualMiles: '', targetMiles: '', runDays: 3, assistancePicks: {}, swimDays: 2, rideHours: '', startDate: nextMondayISO(),
  });
  const [stepIdx, setStepIdx] = useState(0);

  // ⚠️ The schedule screens are built from the POSTURE, which is only seeded when the goal is tapped
  // — so on step 1 the flow would count itself with no disciplines kept ("1 of 3") and then jump.
  // With one goal offered, the posture it seeds is knowable in advance. Count off that.
  const seededPosture = useMemo(
    () => (GOAL_ORDER.length === 1
      ? seedFromGoal(GOAL_ORDER[0], undefined, athleteDisciplines, equipmentTier).per_discipline_posture
      : {}),
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
  // Don't gate disciplines: everyone is offered all of them (people come in exclusive but switch
  // gears). The athlete picks develop/maintain/out per discipline — the engine never decides what
  // they're "allowed" to train. Missing baselines for a developed discipline are handled downstream
  // (calibration prompt), not by hiding the option.
  const enduranceChoices = DISCIPLINE_ORDER.filter((d) => d !== 'strength');
  const goalCanContinue = state.goal != null && (!needsDiscipline || state.discipline != null);
  const postureCanContinue = Object.values(state.posture).some((p) => p !== 'out');
  const rows = DISCIPLINE_ORDER; // ungated — always show all four disciplines (don't gate)
  // The Strength Focus path. Strength is `develop` by definition here, so the screen never asks —
  // but the VALUE still has to be written, because `create-goal-and-materialize-plan` routes on
  // `posture.strength === 'develop'`. An assumed answer that never reaches the payload is the same
  // as no answer.
  const isStrengthFocus = state.goal === 'get_stronger';
  const posturePresent = (d: Discipline) => state.posture[d] != null && state.posture[d] !== 'out';
  // ⛔ TWO HARD DAYS IS THE CEILING, AND THE SHAPE ENFORCES IT — one per discipline, run and bike, so
  // there is no third to gate. Michael, 2026-07-25: *"two hard days pushes the recovery system to its
  // absolute limit on a 4-day strength block… you can do it, but you're paying full price for it."*
  // Field practice, not invented: even trained endurance athletes hold 2-3 genuinely hard sessions a
  // week, and four heavy lifting days are already drawing on that same account.
  //
  // The line appears only at TWO. One hard day is unremarkable and says nothing; a ledger that talks
  // at one is noise by the time it matters. Gate-don't-warn holds — nothing here is refused, and
  // there is no "accept the risk" button. The cost is stated and the athlete owns it.
  const hardDayCount = (['run', 'bike'] as const).filter((d) => state.qualityDays[d]).length;
  // Fires on the TRANSITION to two, once per build. `seen` is a ref, not state: re-rendering must
  // never re-open it, and toggling a day off and back on is fiddling, not a new decision.
  const [mulhollandOpen, setMulhollandOpen] = useState(false);
  const mulhollandSeen = useRef(false);
  const setQualityDay = (d: 'run' | 'bike', day: DayName | '') => setState((s) => {
    const next = { ...s.qualityDays };
    if (day) next[d] = day; else delete next[d];
    // ⛔ THE DAY IS SET FIRST, ALWAYS. The dialog reports a choice already made — it does not stand
    // between the athlete and the choice. That ordering is what keeps it from being a consent gate.
    const count = (['run', 'bike'] as const).filter((k) => next[k]).length;
    if (count === 2 && !mulhollandSeen.current) {
      mulhollandSeen.current = true;
      setMulhollandOpen(true);
    }
    return { ...s, qualityDays: next };
  });
  const strengthDeveloperLabel = (id?: string) => (id ? STRENGTH_PROTOCOL_LABELS[id] ?? id : id);

  const handleConfirm = () => {
    if (!state.goal) return;
    // canonicalize the typed mileage (display unit → miles) before it leaves the client
    const canonMiles = typeof state.targetMiles === 'number' && state.targetMiles > 0
      ? (unit === 'km' ? Math.round(state.targetMiles / 1.609344) : state.targetMiles)
      : undefined;
    void complete(assemblePayload(state, equipmentTier, canonMiles));
  };

  const optBtn = (active: boolean) =>
    `w-full text-left px-4 py-3 rounded-xl border ${active ? 'border-teal-400 bg-teal-500/10' : 'border-white/12 bg-white/[0.03]'} text-white`;

  return (
    // h-full (not 100dvh) so it fills GoalsScreen's content area and keeps the app nav/banner when
    // embedded; standalone route still fills its container.
    <div className="h-full bg-zinc-950 text-white flex flex-col">
      <MulhollandDialog open={mulhollandOpen} onClose={() => setMulhollandOpen(false)} />
      {currentStep === 'goal' && (
        <StepLayout
          step={stepNo('goal')} totalSteps={steps.length} title="What's the goal?"
          subtitle="Every plan carries strength. This one puts it in front."
          onBack={back} onContinue={next} canContinue={goalCanContinue}
          hideContinue
        >
          <div className="space-y-2">
            {GOAL_ORDER.map((g) => (
              <button
                key={g} type="button" className={optBtn(state.goal === g)}
                // Picking IS the answer — no second tap to confirm it. The card is the only thing on
                // the screen and Continue was pure ceremony. Goals that still need a discipline pick
                // (build_endurance / build_speed / starting_over) stay on the step so that question
                // can be asked; none of them are offered today, but auto-advancing them would skip it.
                onClick={() => { reseed(g, undefined); if (!GOALS_NEEDING_DISCIPLINE.includes(g)) next(); }}
              >
                <span className="block">{g === 'get_stronger' ? 'Strength Focus' : GOAL_LABELS[g]}</span>
                {g === 'get_stronger' && (
                  <>
                    {/* The card states what it NEEDS and who it is FOR. The app cannot tell a
                        beginner from an experienced lifter, and the scope cut governs what we build,
                        not who gets in (SPEC §4). */}
                    <span className="block text-white/85 text-sm mt-1.5 leading-relaxed">
                      12 weeks of Wendler's 5/3/1, four lifting days. For someone who already lifts and
                      is months from a race. Needs a barbell, a rack and a bench — and your squat,
                      bench, deadlift and overhead press maxes on file.
                      {' '}
                      {/* ⛔ THE PRECONDITION, SAID AT THE DOOR. The block holds an aerobic base at
                          two-thirds of normal — so it assumes there IS a normal, and that the athlete
                          knows what it is. The intake asks for it outright ("what do you normally
                          run?") and the whole volume verdict is computed off that answer. Someone
                          who cannot name their usual week is being asked a question they cannot
                          answer, and finding that out on step three is worse than knowing at the
                          door. Michael, 2026-07-25. */}
                      Your usual weekly volume helps, but is not required — it starts light and adapts
                      if you don't know it.
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          {/* Strength is not a mode you switch into — it is in every plan, and only the dose changes.
              Saying so here is what makes ONE strength card make sense rather than look like a gap. */}
          <p className="text-white/75 text-sm mt-5 leading-relaxed">
            Every plan has a strength component built on the same 5/3/1 principle. The load adjusts to
            the goal — a race build holds it at maintenance, this one develops it.
          </p>
          {needsDiscipline && (
            <div className="mt-4 space-y-2">
              <p className="text-white/70 text-sm">Which discipline?</p>
              {enduranceChoices.map((d) => (
                <button key={d} type="button" className={optBtn(state.discipline === d)} onClick={() => reseed(state.goal!, d)}>
                  {DISCIPLINE_LABEL[d]}
                </button>
              ))}
            </div>
          )}
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
          develop them."* Every other goal keeps the full screen underneath. */}
      {currentStep === 'posture' && isStrengthFocus && (
        <StepLayout
          step={stepNo('posture')} totalSteps={steps.length} title={`Strength Focus · ${STRENGTH_FOCUS_WEEKS} weeks`}
          subtitle="What you're buying, before you commit to it."
          onBack={back} onContinue={next} canContinue={postureCanContinue}
        >
          <div className="space-y-3">
            {/* ⛔ THE BLOCK OPENS WITH WHAT IT IS. Michael, 2026-07-25 — the athlete should read what
                they are buying before answering a single question about it. Same sentences the plan
                itself carries (`strength-focus-copy.ts`), so what was promised and what was built
                cannot drift. */}
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4 space-y-3.5">
              {strengthFocusSections({}).map((sec) => (
                <div key={sec.heading}>
                  <p className="text-white/90 text-sm font-medium mb-0.5">{sec.heading}</p>
                  <p className="text-white/75 text-sm leading-relaxed">{sec.body}</p>
                </div>
              ))}
            </div>
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
            <p className="text-white/50 text-xs">
              Held at maintenance — easy sessions, enough to hold the aerobic base. Speed and threshold
              are not maintained by this block.
            </p>
          </div>
        </StepLayout>
      )}

      {currentStep === 'posture' && !isStrengthFocus && (
        <StepLayout
          step={stepNo('posture')} totalSteps={steps.length} title="Per-discipline focus"
          subtitle="Seeded from your goal — adjust as you like. At most 2 disciplines develop at once."
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
                      const disabled = p === 'develop' && !canSetDevelop(state.posture, d);
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
            {developCount(state.posture) >= TWO_BUILD_CEILING && (
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
      {currentStep === 'days' && (
        <StepLayout
          step={stepNo('days')} totalSteps={steps.length} title="How many days can you train?"
          onBack={back} onContinue={next} canContinue={state.daysPerWeek >= 4 && state.daysPerWeek <= 7}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {[4, 5, 6, 7].map((n) => (
              <button
                key={n} type="button" onClick={() => setState((s) => ({ ...s, daysPerWeek: n }))}
                className={`py-2 rounded-lg text-sm ${state.daysPerWeek === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/75 border border-white/12'}`}
              >{n}</button>
            ))}
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
          subtitle="Every session ends with three short slots. The main lifting is set — these are yours to direct."
          onBack={back} onContinue={next} canContinue
        >
          <div className="space-y-5">
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
            <div className="space-y-2">
              <p className="text-white/75 text-sm leading-relaxed">
                Endurance moves you forward in one plane, over and over — the same joints take the
                same load, and tight hips and rounded shoulders follow it. The four main lifts are
                heavy and central; they leave gaps. These three slots are where the joints get armor.
              </p>
              <p className="text-white/75 text-sm leading-relaxed">
                Push and pull sit against the posture that collapses over a handlebar and late in a
                stride. Single-leg and core work builds balance one side at a time, without loading
                the spine — the knees and hips get the work at no cost to the next main lift.
              </p>
            </div>
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

      {currentStep === 'run' && (
        <StepLayout
          step={stepNo('run')} totalSteps={steps.length} title="Running"
          subtitle="All of it conversational — strength leads this block."
          onBack={back} onContinue={next} canContinue
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
            </div>
            {/* The volume questions belong to the STRENGTH path — elsewhere the mileage comes from
                the commitment tier, so asking here would be asking twice. */}
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
                    // never a clamp. Only while they have not typed one themselves.
                    return { ...st, usualMiles: usual, targetMiles: st.targetMiles === '' && dose ? dose : st.targetMiles };
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
                  onChange={(e) => setState((s) => ({ ...s, targetMiles: e.target.value === '' ? '' : Number(e.target.value) }))}
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
            <QualityDayPicker
              label="Hard run day"
              hint="A club night, track repeats, a hard tempo — yours or someone else's. The day it lands, if you have one. It is kept, and it counts as a hard day: intervals draw on the same recovery a heavy squat does."
              atCeiling={hardDayCount === 2}
              value={state.qualityDays.run ?? ''}
              onChange={(d) => setQualityDay('run', d)}
            />
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
            <div>
              <p className="text-white/85 text-sm mb-2">Long ride day</p>
              <DayPicker value={state.longRideDay} onChange={(d) => setState((s) => ({ ...s, longRideDay: d }))} />
            </div>
            <QualityDayPicker
              label="Hard ride day"
              hint="A chaingang, a club ride, a threshold turbo — yours or someone else's. The day it lands, if you have one. It is kept, and it counts as a hard day rather than easy hours."
              atCeiling={hardDayCount === 2}
              value={state.qualityDays.bike ?? ''}
              onChange={(d) => setQualityDay('bike', d)}
            />
          </div>
        </StepLayout>
      )}

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
          subtitle={`${state.goal ? GOAL_LABELS[state.goal] : 'Goal'} — an ${state.targetWeeks}-week block.`}
          onBack={back} onContinue={handleConfirm} canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'} saving={saving}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-2">
              {rows.map((d) => {
                const p = state.posture[d] ?? 'maintain';
                const color = getDisciplineColor(d);
                const Icon = DISCIPLINE_ICONS[d];
                const label = p === 'develop' ? 'Develop' : p === 'maintain' ? 'Maintain' : 'Out';
                // ⛔ On the Strength Focus path the protocol label was a LIE. The picker seeds
                // `strengthProtocol` (5×5 / Upper Aesthetics / Neural Speed), the engine ignores it
                // entirely and builds Wendler 5/3/1, and this row reported the dead value back to the
                // athlete as the plan they were about to get. Name what actually gets built.
                const proto = d !== 'strength' || p !== 'develop' ? ''
                  : isStrengthFocus ? ' · Wendler 5/3/1'
                  : state.strengthProtocol ? ` · ${strengthDeveloperLabel(state.strengthProtocol)}` : '';
                return (
                  <div key={d} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2" style={{ color }}>
                      <Icon className="h-4 w-4" /> {DISCIPLINE_LABEL[d]}
                    </span>
                    <span className="text-white/75">{label}{proto}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="text-white/70 text-sm mb-2">Start the week of</p>
              <input
                type="date"
                value={state.startDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
              />
              <p className="text-white/50 text-xs mt-1.5">Week 1 begins this week — plans run Monday to Sunday.</p>
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
              {isStrengthFocus ? (
                <>A {state.targetWeeks}-week block. The last set of every third week is the
                measurement — there is no separate retest.</>
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
