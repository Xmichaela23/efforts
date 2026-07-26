import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bike, Waves, Dumbbell } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { useArcSetupContext } from '@/hooks/useArcSetupContext';
import { getDisciplineColor } from '@/lib/context-utils';
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
          className={`${allowed ? 'flex-1 ' : ''}py-2 rounded-lg text-xs ${value === d ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/60 border border-white/12'}`}
        >
          {DAY_SHORT[d]}
        </button>
      ))}
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
  anchorDiscipline: 'run' | 'bike' | null;
  anchorDay: DayName | '';
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
  startDate: string; // Week 1 start (YYYY-MM-DD); plans are Monday-based so this snaps to that week server-side
};

type StepKey = 'goal' | 'posture' | 'commitment' | 'length' | 'schedule' | 'confirm';

function getSteps(state: NonRaceState): StepKey[] {
  // ⛔ STRENGTH FOCUS SKIPS "What can you sustain?". That step converts a Light/Moderate/Committed
  // tier into `weekly_hours_available` — and on this path nothing reads it. The lifting is four days,
  // fixed by the protocol; the endurance volume is TYPED two screens later (run miles, run days,
  // swims). So the tier decides nothing and its only effect was a stale "≈ 6 h/wk" on the confirm
  // screen. Michael, 2026-07-25: *"not necessary, user enters these."* Every other goal keeps it —
  // there the tier really does set the volume.
  const base: StepKey[] = ['goal', 'posture', 'commitment', 'length', 'schedule', 'confirm'];
  // ⚠️ On step 1 no goal has been chosen yet, so this returned the FULL six-step flow and the
  // progress bar read "1 of 6" — then jumped to "2 of 4" the moment the athlete tapped. With one
  // goal offered, the flow it produces is knowable before it is picked. Count that.
  const effective = state.goal ?? (GOAL_ORDER.length === 1 ? GOAL_ORDER[0] : null);
  if (effective === 'get_stronger') return base.filter((k) => k !== 'commitment' && k !== 'length');
  // ⛔ AND NO LENGTH SLIDER. Twelve weeks is not a preference — Wendler's ratios are 2:1, 3:2 and
  // 2:2 over four-week cycles, so 12 is the only length that runs leader-leader-anchor as designed.
  // The slider offered 8-52 while the composer rounds DOWN to whole cycles, so 10 silently became 8
  // and 14 became 12: the athlete picked a number the engine never built. 8 ships later as the
  // short, off-ratio option, labelled as such.
  return base;
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
            anchorDiscipline: state.anchorDiscipline, anchorDay: state.anchorDay,
          }),
          ...(shape.strength_protocol ? { strength_protocol: shape.strength_protocol } : {}),
          ...(typeof targetWeeklyMiles === 'number' && targetWeeklyMiles > 0 ? { target_weekly_miles: targetWeeklyMiles } : {}), // Get Strong maintenance mileage (canonical miles); engine guardrails it to the band
          ...(state.posture?.strength === 'develop' && state.runDays >= 2 ? { run_days: state.runDays } : {}), // Get Strong run frequency (2/3/4); engine spreads miles + stacks extras onto upper lift days
          // Strength Focus: the three assistance picks. The composer validates each name against the
          // shared menu, so a stale one falls back to the default rather than reaching a session.
          ...(state.posture?.strength === 'develop' && Object.keys(state.assistancePicks).length > 0
            ? { assistance_picks: state.assistancePicks } : {}),
          ...(state.posture?.swim === 'maintain' && state.swimDays > 0 ? { swim_days: state.swimDays } : {}),
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
    daysPerWeek: 5, longRunDay: '', longRideDay: '', anchorDiscipline: null, anchorDay: '', targetMiles: '', runDays: 3, assistancePicks: {}, swimDays: 2, startDate: nextMondayISO(),
  });
  const [stepIdx, setStepIdx] = useState(0);

  const steps = getSteps(state);
  const currentStep = steps[stepIdx] ?? 'confirm';
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
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
  const anchorChoices = (['run', 'bike'] as const).filter((d) => posturePresent(d));
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
      {currentStep === 'goal' && (
        <StepLayout
          step={1} totalSteps={steps.length} title="What's the goal?"
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
                    <span className="block text-white/50 text-xs mt-1 leading-relaxed">
                      12 weeks of Wendler's 5/3/1, four lifting days. For someone who already lifts and
                      is months from a race. Needs a barbell, a rack and a bench — and your squat,
                      bench, deadlift and overhead press maxes on file.
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          {/* Strength is not a mode you switch into — it is in every plan, and only the dose changes.
              Saying so here is what makes ONE strength card make sense rather than look like a gap. */}
          <p className="text-white/45 text-xs mt-4 leading-relaxed">
            Every plan has a strength component built on the same 5/3/1 principle. The load adjusts to
            the goal — a race build holds it at maintenance, this one develops it.
          </p>
          {needsDiscipline && (
            <div className="mt-4 space-y-2">
              <p className="text-white/55 text-sm">Which discipline?</p>
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
          step={2} totalSteps={steps.length} title={`Strength Focus · ${STRENGTH_FOCUS_WEEKS} weeks`}
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
                  <p className="text-white/85 text-sm font-medium mb-0.5">{sec.heading}</p>
                  <p className="text-white/65 text-sm leading-relaxed">{sec.body}</p>
                </div>
              ))}
            </div>
            <p className="text-white/70 text-sm pt-1">Which endurance are you keeping?</p>
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
                  <span className={`text-sm ${keeping ? 'text-white/70' : 'text-white/30'}`}>
                    {keeping ? 'Keeping' : 'Not this block'}
                  </span>
                </button>
              );
            })}
            <p className="text-white/35 text-xs">
              Held at maintenance — easy sessions, enough to hold the aerobic base. Speed and threshold
              are not maintained by this block.
            </p>
          </div>
        </StepLayout>
      )}

      {currentStep === 'posture' && !isStrengthFocus && (
        <StepLayout
          step={2} totalSteps={steps.length} title="Per-discipline focus"
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
                          className={`px-2 py-2 rounded-lg text-sm border ${active ? 'border-transparent text-zinc-950 font-semibold' : 'border-white/12 text-white/70'} ${disabled ? 'opacity-30' : ''}`}
                          style={active ? { background: color } : undefined}
                        >
                          {p === 'develop' ? 'Develop' : p === 'maintain' ? 'Maintain' : 'Out'}
                        </button>
                      );
                    })}
                  </div>
                  {d === 'strength' && cur === 'develop' && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-white/55 text-xs">Strength protocol</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {strengthDevelopersFor(equipmentTier).map((sp) => (
                          <button
                            key={sp.id} type="button"
                            onClick={() => setState((s) => ({ ...s, strengthProtocol: sp.id }))}
                            className={`px-2 py-2 rounded-lg text-xs border ${state.strengthProtocol === sp.id ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
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
              <p className="text-white/45 text-xs">
                At most 2 disciplines develop together — the interference ceiling. Set one to maintain to develop another.
              </p>
            )}
          </div>
        </StepLayout>
      )}

      {currentStep === 'commitment' && (
        <StepLayout
          step={3} totalSteps={steps.length} title="What can you sustain?"
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
                  <span className="text-white/45 text-sm tabular-nums">≈ {hoursForTier(t.id)} h/wk</span>
                </div>
                <p className="text-white/50 text-sm mt-0.5">{t.blurb}</p>
              </button>
            ))}
          </div>
        </StepLayout>
      )}

      {currentStep === 'length' && (() => {
        const floor = floorForGoal(state.goal); // §13.2 — the minimum where the adaptation shows in a retest
        return (
          <StepLayout
            step={4} totalSteps={steps.length} title="How long is this block?"
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
              <p className="text-white/45 text-sm">{floor}–52 weeks. Shorter than {floor} wouldn't show in a retest.</p>
            </div>
          </StepLayout>
        );
      })()}

      {currentStep === 'schedule' && (
        <StepLayout
          step={5} totalSteps={steps.length} title="When can you train?"
          subtitle="Days per week, your long days, and any fixed club session to keep."
          onBack={back} onContinue={next} canContinue={state.daysPerWeek >= 4 && state.daysPerWeek <= 7}
        >
          <div className="space-y-5">
            <div>
              <p className="text-white/55 text-sm mb-2">Days per week</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[4, 5, 6, 7].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setState((s) => ({ ...s, daysPerWeek: n }))}
                    className={`py-2 rounded-lg text-sm ${state.daysPerWeek === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/60 border border-white/12'}`}
                  >{n}</button>
                ))}
              </div>
            </div>
            {/* The assistance slots, ABOVE the mileage input — a numeric input buries anything below it
                on mobile (keyboard + Continue eclipse it), which locked users out of the control that
                used to sit here. */}
            {/* Swim is BOOKED, not coached. The app learns no swim pace and grades no swim, so it
                holds the time and says so. Only asked when swim was kept — one control, no yardage,
                no sets. It exists for the triathlete who wants the slots on the calendar. */}
            {state.posture?.strength === 'develop' && state.posture?.swim === 'maintain' && (
              <div>
                <p className="text-white/55 text-sm mb-2">Swims per week</p>
                <div className="flex gap-1.5 max-w-[240px]">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n} type="button" onClick={() => setState((st) => ({ ...st, swimDays: n }))}
                      className={`flex-1 py-2 rounded-lg text-sm border ${state.swimDays === n ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
                    >{n}</button>
                  ))}
                </div>
                <p className="text-white/35 text-xs mt-1.5">
                  About an hour each, on days nothing else is booked. Held on the calendar, not coached —
                  no set, no target.
                </p>
              </div>
            )}
            {state.posture?.strength === 'develop' && (
              <div>
                <p className="text-white/55 text-sm mb-1">Accessory work</p>
                <p className="text-white/35 text-xs mb-3">
                  Every session ends with three short slots. The lifting itself is set — these are yours to pick.
                </p>
                <div className="space-y-3">
                  {ASSISTANCE_MENU.map((menu) => {
                    const picked = state.assistancePicks[menu.slot] ?? ASSISTANCE_DEFAULTS[menu.slot];
                    const targets = menu.options.find((o) => o.name === picked)?.targets ?? '';
                    return (
                      <div key={menu.slot}>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="text-white/70 text-sm">{menu.label}</span>
                          <span className="text-white/35 text-xs tabular-nums">{menu.totalReps} reps</span>
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
                        {targets && <p className="text-white/35 text-xs mt-1">{targets}</p>}
                      </div>
                    );
                  })}
                </div>
                <p className="text-white/35 text-xs mt-3 leading-relaxed">{ASSISTANCE_GUIDANCE}</p>
              </div>
            )}
            {posturePresent('run') && (
              <div>
                <p className="text-white/55 text-sm mb-2">Long run day</p>
                <DayPicker value={state.longRunDay} onChange={(d) => setState((s) => ({ ...s, longRunDay: d }))}
                  allowed={state.posture?.strength === 'develop' ? (['saturday', 'sunday'] as DayName[]) : undefined} />
                {state.posture?.strength === 'develop' && (
                  <p className="text-white/35 text-xs mt-1.5">Sat or Sun — your heavy lower days (Tue/Fri) need clear space around them.</p>
                )}
              </div>
            )}
            {state.posture?.strength === 'develop' && posturePresent('run') && (
              <div className="space-y-4">
                <div>
                  <p className="text-white/55 text-sm mb-2">Weekly running to hold <span className="text-white/35">(maintenance)</span></p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" inputMode="numeric" min={0}
                      value={state.targetMiles === '' ? '' : state.targetMiles}
                      onChange={(e) => setState((s) => ({ ...s, targetMiles: e.target.value === '' ? '' : Number(e.target.value) }))}
                      placeholder={`e.g. ${Math.max(4, capDisplay - 4)}`}
                      className="w-24 py-2 px-3 rounded-lg bg-white/[0.04] text-white border border-white/12 text-sm"
                    />
                    <span className="text-white/45 text-sm">{unit}/wk</span>
                  </div>
                  {/* Live honest tradeoff — shown AS they type. D-222 hard cap RETIRED: we honor the typed
                      miles (no clamp); ~${capDisplay} is a soft reference, not a wall. Matches the server
                      amendment + the Get-Strong card copy. */}
                  <p className={`text-xs mt-1.5 ${typeof state.targetMiles === 'number' && state.targetMiles > capDisplay ? 'text-amber-400/80' : 'text-white/35'}`}>
                    {typeof state.targetMiles === 'number' && state.targetMiles > capDisplay
                      ? `Above ~${capDisplay} ${unit} your strength gain trends toward the low end — you'll still get stronger, just modestly. Not a cap; it's a strength plan. [Wilson 2012]`
                      : `Run what you'll actually do — it's all easy, strength leads. Low weeks aren't penalized (more recovery for the lifts).`}
                  </p>
                </div>
                <div>
                  <p className="text-white/55 text-sm mb-2">How many days to run</p>
                  <div className="grid grid-cols-3 gap-1.5 max-w-[220px]">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n} type="button" onClick={() => setState((s) => ({ ...s, runDays: n }))}
                        className={`py-2 rounded-lg text-sm ${state.runDays === n ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/60 border border-white/12'}`}
                      >{n}</button>
                    ))}
                  </div>
                  <p className="text-white/35 text-xs mt-1.5">We spread your miles across these — a longer run plus easy fill, not the same run twice.</p>
                </div>
              </div>
            )}
            {posturePresent('bike') && (
              <div>
                <p className="text-white/55 text-sm mb-2">Long ride day</p>
                <DayPicker value={state.longRideDay} onChange={(d) => setState((s) => ({ ...s, longRideDay: d }))} />
              </div>
            )}
            {anchorChoices.length > 0 && (
              <div>
                <p className="text-white/55 text-sm mb-2">Keep a fixed hard session? (e.g. a club run or ride)</p>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <button
                    type="button" onClick={() => setState((s) => ({ ...s, anchorDiscipline: null, anchorDay: '' }))}
                    className={`py-2 rounded-lg text-sm border ${state.anchorDiscipline === null ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
                  >No</button>
                  <button
                    type="button" onClick={() => setState((s) => ({ ...s, anchorDiscipline: s.anchorDiscipline ?? anchorChoices[0] }))}
                    className={`py-2 rounded-lg text-sm border ${state.anchorDiscipline !== null ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
                  >Yes</button>
                </div>
                {state.anchorDiscipline !== null && (
                  <div className="space-y-2">
                    {anchorChoices.length > 1 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {anchorChoices.map((d) => (
                          <button
                            key={d} type="button" onClick={() => setState((s) => ({ ...s, anchorDiscipline: d }))}
                            className={`py-2 rounded-lg text-sm border ${state.anchorDiscipline === d ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
                          >{DISCIPLINE_LABEL[d]}</button>
                        ))}
                      </div>
                    )}
                    <DayPicker value={state.anchorDay} onChange={(d) => setState((s) => ({ ...s, anchorDay: d }))} />
                  </div>
                )}
              </div>
            )}
          </div>
        </StepLayout>
      )}

      {currentStep === 'confirm' && (
        <StepLayout
          step={6} totalSteps={steps.length} title="Build this plan?"
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
                    <span className="text-white/60">{label}{proto}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="text-white/55 text-sm mb-2">Start the week of</p>
              <input
                type="date"
                value={state.startDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
              />
              <p className="text-white/35 text-xs mt-1.5">Week 1 begins this week — plans run Monday to Sunday.</p>
            </div>
            {/* ⛔ TWO FALSEHOODS ON THIS LINE, both created when the engine changed under it.
                • "ending in a retest" — Strength Focus has NO retest week. The last set of every
                  third week is the test (5/3/1); weeks 9, 10 and 11 are the measurement. The
                  separate retest week was deleted with the old protocol.
                • "from your current fitness (≈ N h/wk)" — the hours tier is not asked on this path
                  and nothing reads it. Reporting a number the athlete never gave, that changes
                  nothing, is the shape of bug this file keeps producing.
                Also fixed the article: "An 12-week" read wrong for every length that is not 8. */}
            <p className="text-white/60 text-sm">
              {isStrengthFocus ? (
                <>A {state.targetWeeks}-week block. The last set of every third week is the
                measurement — there is no separate retest.</>
              ) : (
                <>{state.targetWeeks === 8 || state.targetWeeks === 11 || state.targetWeeks === 18 ? 'An' : 'A'} {state.targetWeeks}-week
                block from your current fitness (≈ {hoursForTier(state.commitment)} h/wk),
                ending in a <span className="text-white/80">retest</span>.</>
              )}
            </p>
          </div>
        </StepLayout>
      )}
    </div>
  );
}
