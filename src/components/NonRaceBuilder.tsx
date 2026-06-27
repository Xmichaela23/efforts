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
  athleteDisciplinesFromBaselines,
  floorForGoal,
  hoursForTier,
  COMMITMENT_TIERS,
  GOAL_LABELS,
  GOALS_NEEDING_DISCIPLINE,
  STRENGTH_DEVELOPERS,
  TWO_BUILD_CEILING,
  type NonRaceGoalId,
  type Discipline,
  type Posture,
  type CommitmentTier,
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

type NonRaceState = {
  goal: NonRaceGoalId | null;
  discipline: Discipline | undefined;
  posture: Partial<Record<Discipline, Posture>>;
  strengthProtocol: string | undefined;
  commitment: CommitmentTier;
  targetWeeks: number;
};

type StepKey = 'goal' | 'posture' | 'commitment' | 'length' | 'confirm';

function getSteps(_state: NonRaceState): StepKey[] {
  return ['goal', 'posture', 'commitment', 'length', 'confirm'];
}

// The goal seeded the posture; the user may have edited it. Re-derive goal_type/sport/strength_protocol
// from the EDITED posture (derivePlanShape), not from seedFromGoal. Generic scheduling prefs kept.
function assemblePayload(state: NonRaceState): ArcSetupPayload {
  const goal = state.goal!;
  const shape = derivePlanShape(state.posture, state.strengthProtocol);
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
          days_per_week: 5,
          strength_frequency: 2,
          weekly_hours_available: hoursForTier(state.commitment),
          per_discipline_posture: state.posture,
          ...(shape.strength_protocol ? { strength_protocol: shape.strength_protocol } : {}),
        },
      },
    ],
    strength_frequency: 2,
  };
}

export default function NonRaceBuilder() {
  const navigate = useNavigate();
  const { complete, saving } = useArcSetupComplete();
  const { arc } = useArcSetupContext();

  // Real per-athlete disciplines (declared baselines), long→short, strength always, fallback all-3.
  const athleteDisciplines = useMemo(
    () => athleteDisciplinesFromBaselines((arc as { disciplines?: unknown } | null)?.disciplines),
    [arc],
  );

  const [state, setState] = useState<NonRaceState>({
    goal: null, discipline: undefined, posture: {}, strengthProtocol: undefined, commitment: 'light', targetWeeks: 12,
  });
  const [stepIdx, setStepIdx] = useState(0);

  const steps = getSteps(state);
  const currentStep = steps[stepIdx] ?? 'confirm';
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => { if (stepIdx === 0) navigate(-1); else setStepIdx((i) => i - 1); };

  // Picking a goal (or its discipline sub-choice) re-seeds the posture + the default strength protocol.
  const reseed = (goal: NonRaceGoalId, discipline: Discipline | undefined) => {
    const seed = seedFromGoal(goal, discipline, athleteDisciplines);
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
      if (d === 'strength' && p === 'develop' && !strengthProtocol) strengthProtocol = 'upper_aesthetics';
      return { ...s, posture, strengthProtocol };
    });
  };

  const needsDiscipline = state.goal != null && GOALS_NEEDING_DISCIPLINE.includes(state.goal);
  const enduranceChoices = athleteDisciplines.filter((d) => d !== 'strength');
  const goalCanContinue = state.goal != null && (!needsDiscipline || state.discipline != null);
  const postureCanContinue = Object.values(state.posture).some((p) => p !== 'out');
  const rows = DISCIPLINE_ORDER.filter((d) => athleteDisciplines.includes(d));

  const handleConfirm = () => { if (state.goal) void complete(assemblePayload(state)); };

  const optBtn = (active: boolean) =>
    `w-full text-left px-4 py-3 rounded-xl border ${active ? 'border-teal-400 bg-teal-500/10' : 'border-white/12 bg-white/[0.03]'} text-white`;

  return (
    <div className="h-[100dvh] bg-zinc-950 text-white flex flex-col">
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
                        {STRENGTH_DEVELOPERS.map((sp) => (
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

      {currentStep === 'confirm' && (
        <StepLayout
          step={5} totalSteps={steps.length} title="Build this plan?"
          subtitle={`${state.goal ? GOAL_LABELS[state.goal] : 'Goal'} — a ${state.targetWeeks}-week block, develop then retest.`}
          onBack={back} onContinue={handleConfirm} canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'} saving={saving}
        >
          <p className="text-white/60 text-sm">
            We'll build a {state.targetWeeks}-week plan from your current fitness, ending in a retest, with the
            per-discipline focus you set.
          </p>
        </StepLayout>
      )}
    </div>
  );
}
