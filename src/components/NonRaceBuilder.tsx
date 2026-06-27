import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StepLayout } from '@/components/wizard/StepLayout';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';
import {
  seedFromGoal,
  GOAL_LABELS,
  GOALS_NEEDING_DISCIPLINE,
  type NonRaceGoalId,
  type Discipline,
} from '@/lib/non-race-goal-seeds';

// Cut C — the goal picker is the first, load-bearing step: one pick seeds goal_type + per-discipline
// posture + sport + strength protocol (seedFromGoal, §13/§13.1), intersected with the athlete's actual
// disciplines. assemblePayload sends the seeds → the Cut A wiring finally has a real consumer. Later cuts
// add the posture-confirm / commitment / schedule steps; B4 draft persistence is still deferred.

// TODO(Cut C follow-up): source the athlete's real disciplines from profile (ArcContext / baselines).
// seedFromGoal already intersects correctly (a runner-only athlete never maintains swim/bike); this
// default just needs to become the real per-athlete list so the intersection fires in production.
const ATHLETE_DISCIPLINES: Discipline[] = ['swim', 'bike', 'run', 'strength'];

const GOAL_ORDER: NonRaceGoalId[] = [
  'build_endurance', 'build_speed', 'get_stronger', 'build_muscle', 'maintain', 'starting_over',
];

type NonRaceState = {
  goal: NonRaceGoalId | null;
  discipline: Discipline | undefined;
  targetWeeks: number;
};

type StepKey = 'goal' | 'length' | 'confirm';

// Static for C; later cuts insert 'posture' / 'commitment' / 'schedule' before 'confirm'.
function getSteps(_state: NonRaceState): StepKey[] {
  return ['goal', 'length', 'confirm'];
}

// The non-race analog of ArcSetupWizard.assemblePayload: the goal seeds goal_type + per_discipline_posture
// + sport + strength_protocol (intersected); the length supplies target_weeks; the generic scheduling
// prefs are kept. Every race-specific field is dropped.
function assemblePayload(state: NonRaceState): ArcSetupPayload {
  const goal = state.goal!;
  const seed = seedFromGoal(goal, state.discipline, ATHLETE_DISCIPLINES);
  return {
    summary: `${state.targetWeeks}-week ${GOAL_LABELS[goal]} block`,
    goals: [
      {
        name: GOAL_LABELS[goal],
        goal_type: seed.goal_type,
        target_date: null,
        target_weeks: state.targetWeeks,
        sport: seed.sport,
        distance: null,
        priority: 'A',
        training_prefs: {
          training_intent: 'completion',
          fitness: 'intermediate',
          days_per_week: 5,
          weekly_hours_available: 6,
          strength_frequency: 2,
          per_discipline_posture: seed.per_discipline_posture,
          ...(seed.strength_protocol ? { strength_protocol: seed.strength_protocol } : {}),
        },
      },
    ],
    strength_frequency: 2,
  };
}

export default function NonRaceBuilder() {
  const navigate = useNavigate();
  const { complete, saving } = useArcSetupComplete();
  const [state, setState] = useState<NonRaceState>({ goal: null, discipline: undefined, targetWeeks: 12 });
  const [stepIdx, setStepIdx] = useState(0);

  const steps = getSteps(state);
  const currentStep = steps[stepIdx] ?? 'confirm';

  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => {
    if (stepIdx === 0) navigate(-1);
    else setStepIdx((i) => i - 1);
  };

  const needsDiscipline = state.goal != null && GOALS_NEEDING_DISCIPLINE.includes(state.goal);
  const enduranceChoices = ATHLETE_DISCIPLINES.filter((d) => d !== 'strength');
  const goalCanContinue = state.goal != null && (!needsDiscipline || state.discipline != null);

  const handleConfirm = () => {
    if (state.goal) void complete(assemblePayload(state));
  };

  const btn = (active: boolean) =>
    `w-full text-left px-4 py-3 rounded-xl border ${
      active ? 'border-teal-400 bg-teal-500/10' : 'border-white/12 bg-white/[0.03]'
    } text-white`;

  return (
    <div className="h-[100dvh] bg-zinc-950 text-white flex flex-col">
      {currentStep === 'goal' && (
        <StepLayout
          step={1}
          totalSteps={steps.length}
          title="What's the goal?"
          subtitle="Pick one — we seed the rest (which disciplines develop, maintain, or sit out)."
          onBack={back}
          onContinue={next}
          canContinue={goalCanContinue}
        >
          <div className="space-y-2">
            {GOAL_ORDER.map((g) => (
              <button
                key={g}
                type="button"
                className={btn(state.goal === g)}
                onClick={() => setState((s) => ({ ...s, goal: g, discipline: undefined }))}
              >
                {GOAL_LABELS[g]}
              </button>
            ))}
          </div>
          {needsDiscipline && (
            <div className="mt-4 space-y-2">
              <p className="text-white/55 text-sm">Which discipline?</p>
              {enduranceChoices.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={btn(state.discipline === d)}
                  onClick={() => setState((s) => ({ ...s, discipline: d }))}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          )}
        </StepLayout>
      )}

      {currentStep === 'length' && (
        <StepLayout
          step={2}
          totalSteps={steps.length}
          title="How long is this block?"
          subtitle="Pick the number of weeks — you develop, then retest and start the next block."
          onBack={back}
          onContinue={next}
          canContinue={state.targetWeeks >= 4 && state.targetWeeks <= 52}
        >
          <div className="space-y-4">
            <div className="text-3xl font-semibold tabular-nums">{state.targetWeeks} weeks</div>
            <input
              type="range"
              min={4}
              max={52}
              step={1}
              value={state.targetWeeks}
              onChange={(e) => setState((s) => ({ ...s, targetWeeks: Number(e.target.value) }))}
              className="w-full accent-teal-500"
            />
            <p className="text-white/45 text-sm">4–52 weeks. Defaults to 12.</p>
          </div>
        </StepLayout>
      )}

      {currentStep === 'confirm' && (
        <StepLayout
          step={3}
          totalSteps={steps.length}
          title="Build this plan?"
          subtitle={`${state.goal ? GOAL_LABELS[state.goal] : 'Goal'} — a ${state.targetWeeks}-week block, develop then retest.`}
          onBack={back}
          onContinue={handleConfirm}
          canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'}
          saving={saving}
        >
          <p className="text-white/60 text-sm">
            We'll build a {state.targetWeeks}-week plan from your current fitness, ending in a retest.
            Per-discipline focus is seeded from your goal; you'll be able to fine-tune it in a later step.
          </p>
        </StepLayout>
      )}
    </div>
  );
}
