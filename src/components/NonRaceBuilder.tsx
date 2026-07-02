import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bike, Waves, Dumbbell } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { useArcSetupContext } from '@/hooks/useArcSetupContext';
import { getDisciplineColor } from '@/lib/context-utils';
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
const GOAL_ORDER: NonRaceGoalId[] = [
  'build_endurance', 'build_speed', 'get_stronger', 'build_muscle', 'maintain', 'starting_over',
];
const DAYS: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT: Record<DayName, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

function DayPicker({ value, onChange }: { value: DayName | ''; onChange: (d: DayName) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map((d) => (
        <button
          key={d} type="button" onClick={() => onChange(d)}
          className={`py-2 rounded-lg text-xs ${value === d ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/60 border border-white/12'}`}
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
  accessoryBias: 'glute' | 'hyrox' | null; // Get Strong add-on: one posterior-chain accessory slot (glute) or the Hyrox station rotation
  startDate: string; // Week 1 start (YYYY-MM-DD); plans are Monday-based so this snaps to that week server-side
};

type StepKey = 'goal' | 'posture' | 'commitment' | 'length' | 'schedule' | 'confirm';

function getSteps(_state: NonRaceState): StepKey[] {
  return ['goal', 'posture', 'commitment', 'length', 'schedule', 'confirm'];
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
          ...(state.posture?.strength === 'develop' && (state.accessoryBias === 'glute' || state.accessoryBias === 'hyrox') ? { accessory_bias: state.accessoryBias } : {}), // Get Strong add-on: one accessory-bias slot (engine injects on Upper A)
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
    daysPerWeek: 5, longRunDay: '', longRideDay: '', anchorDiscipline: null, anchorDay: '', targetMiles: '', runDays: 3, accessoryBias: null, startDate: nextMondayISO(),
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
      targetWeeks: Math.max(s.targetWeeks, floor), // never start below the goal's science floor (§13.2)
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
          subtitle="Pick one — we seed the rest (which disciplines develop, maintain, or sit out)."
          onBack={back} onContinue={next} canContinue={goalCanContinue}
        >
          <div className="space-y-2">
            {GOAL_ORDER.map((g) => (
              <button key={g} type="button" className={optBtn(state.goal === g)} onClick={() => reseed(g, undefined)}>
                {GOAL_LABELS[g]}
              </button>
            ))}
          </div>
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

      {currentStep === 'posture' && (
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
            {posturePresent('run') && (
              <div>
                <p className="text-white/55 text-sm mb-2">Long run day</p>
                <DayPicker value={state.longRunDay} onChange={(d) => setState((s) => ({ ...s, longRunDay: d }))} />
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
            {state.posture?.strength === 'develop' && (
              <div>
                <p className="text-white/55 text-sm mb-2">Add-on focus (optional)</p>
                <div className="grid grid-cols-3 gap-1.5 max-w-[300px]">
                  {([['None', null], ['Glutes', 'glute'], ['Hyrox', 'hyrox']] as const).map(([label, val]) => (
                    <button
                      key={label} type="button" onClick={() => setState((s) => ({ ...s, accessoryBias: val }))}
                      className={`py-2 rounded-lg text-sm border ${state.accessoryBias === val ? 'border-teal-400 bg-teal-500/10 text-white' : 'border-white/12 text-white/60'}`}
                    >{label}</button>
                  ))}
                </div>
                <p className="text-white/35 text-xs mt-1.5">
                  {state.accessoryBias === 'glute' ? 'One posterior-chain slot on your upper day — stronger, more durable hips (not a speed promise).'
                    : state.accessoryBias === 'hyrox' ? 'Adds one station accessory during the week, plus a run→station combo on your long-run day — back-to-back, on tired legs. Adds volume; this is the Hyrox opt-in.'
                    : 'Just the strength block — no add-on.'}
                </p>
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
                const proto = d === 'strength' && p === 'develop' && state.strengthProtocol
                  ? ` · ${strengthDeveloperLabel(state.strengthProtocol)}` : '';
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
            <p className="text-white/60 text-sm">
              An {state.targetWeeks}-week block from your current fitness (≈ {hoursForTier(state.commitment)} h/wk),
              ending in a <span className="text-white/80">retest</span>.
            </p>
          </div>
        </StepLayout>
      )}
    </div>
  );
}
