import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StepLayout } from '@/components/wizard/StepLayout';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';

// Cut B3 — the NonRaceBuilder shell. Minimal end-to-end: a length step + a confirm that submits a
// non-race (capacity) goal through the SAME complete() path the race wizard uses → materializes a plan.
// Later cuts plug additional steps into getSteps (goal picker, per-discipline posture, length-floor,
// commitment tier, schedule). Default posture = all-develop (omit per_discipline_posture → the engine
// treats absent as all-develop, byte-identical to today's non-race plan). Draft persistence (B4) deferred.

type NonRaceState = {
  goalType: 'capacity' | 'maintenance';
  sport: string;
  targetWeeks: number;
};

type StepKey = 'length' | 'confirm';

// Static for B3; later cuts insert 'goal' / 'posture' / 'commitment' / 'schedule' before 'confirm'.
function getSteps(_state: NonRaceState): StepKey[] {
  return ['length', 'confirm'];
}

// The non-race analog of ArcSetupWizard.assemblePayload: a capacity/maintenance goal (target_date null,
// target_weeks the length source) + the kept generic scheduling prefs; every race-specific field dropped.
function assemblePayload(state: NonRaceState): ArcSetupPayload {
  return {
    summary: `${state.targetWeeks}-week ${state.goalType} block`,
    goals: [
      {
        name: state.goalType === 'capacity' ? 'Build fitness' : 'Maintain fitness',
        goal_type: state.goalType,
        target_date: null,
        target_weeks: state.targetWeeks,
        sport: state.sport,
        distance: null,
        priority: 'A',
        training_prefs: {
          training_intent: 'completion',
          fitness: 'intermediate',
          days_per_week: 5,
          weekly_hours_available: 6,
          strength_frequency: 2,
        },
      },
    ],
    strength_frequency: 2,
  };
}

export default function NonRaceBuilder() {
  const navigate = useNavigate();
  const { complete, saving } = useArcSetupComplete();
  const [state, setState] = useState<NonRaceState>({ goalType: 'capacity', sport: 'run', targetWeeks: 12 });
  const [stepIdx, setStepIdx] = useState(0);

  const steps = getSteps(state);
  const currentStep = steps[stepIdx] ?? 'confirm';

  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => {
    if (stepIdx === 0) navigate(-1);
    else setStepIdx((i) => i - 1);
  };

  const handleConfirm = () => {
    void complete(assemblePayload(state));
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-white flex flex-col">
      {currentStep === 'length' && (
        <StepLayout
          step={1}
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
          step={2}
          totalSteps={steps.length}
          title="Build this plan?"
          subtitle={`A ${state.targetWeeks}-week ${state.sport} block — develop, then retest.`}
          onBack={back}
          onContinue={handleConfirm}
          canContinue={!saving}
          continueLabel={saving ? 'Building…' : 'Build plan'}
          saving={saving}
        >
          <p className="text-white/60 text-sm">
            We'll build a {state.targetWeeks}-week plan from your current fitness, ending in a retest.
            Goal type, per-discipline focus, and schedule arrive in later steps.
          </p>
        </StepLayout>
      )}
    </div>
  );
}
