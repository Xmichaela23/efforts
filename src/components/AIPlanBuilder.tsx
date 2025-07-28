import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';

// TODO: Add plan generation and preview integration

const FOCUS_OPTIONS = [
  { key: 'run', label: 'Run' },
  { key: 'ride', label: 'Ride' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'strength', label: 'Strength' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'swim', label: 'Swim' },
];

const TIMELINE_OPTIONS = [
  { key: '3-months', label: '3 months (experienced)' },
  { key: '6-months', label: '6 months (recommended)' },
  { key: '12-months', label: '12 months (beginner)' },
  { key: 'no-timeline', label: 'No specific timeline' },
];

const EXPERIENCE_OPTIONS = [
  { key: 'beginner', label: 'Beginner - new to structured training' },
  { key: 'intermediate', label: 'Intermediate - some experience' },
  { key: 'advanced', label: 'Advanced - consistent training history' },
  { key: 'competitive', label: 'Competitive - racing regularly' },
];

const GOAL_OPTIONS = [
  { key: 'finish', label: 'Finish the event' },
  { key: 'improve-time', label: 'Improve my time' },
  { key: 'build-fitness', label: 'Build general fitness' },
  { key: 'maintain', label: 'Maintain current level' },
];

export default function AIPlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<string>('');
  const [experience, setExperience] = useState<string>('');
  const [goal, setGoal] = useState<string>('');
  const [step, setStep] = useState(0);

  useEffect(() => {
    loadUserBaselines().then(setBaselines);
  }, [loadUserBaselines]);

  const toggleFocus = (key: string) => {
    setSelectedFocus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const getCurrentStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What is your focus?</div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {/* First row: Run, Triathlon (center), Ride */}
              <div className="col-span-1">
                <button
                  key="run"
                  onClick={() => toggleFocus('run')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('run')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Run
                </button>
              </div>
              <div className="col-span-1">
                <button
                  key="triathlon"
                  onClick={() => toggleFocus('triathlon')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('triathlon')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Triathlon
                </button>
              </div>
              <div className="col-span-1">
                <button
                  key="ride"
                  onClick={() => toggleFocus('ride')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('ride')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Ride
                </button>
              </div>
              {/* Second row: Strength, Mobility, Swim */}
              <div className="col-span-1">
                <button
                  key="strength"
                  onClick={() => toggleFocus('strength')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('strength')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Strength
                </button>
              </div>
              <div className="col-span-1">
                <button
                  key="mobility"
                  onClick={() => toggleFocus('mobility')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('mobility')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Mobility
                </button>
              </div>
              <div className="col-span-1">
                <button
                  key="swim"
                  onClick={() => toggleFocus('swim')}
                  className={`rounded px-4 py-2 w-full text-center transition-colors ${
                    selectedFocus.includes('swim')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Swim
                </button>
              </div>
            </div>
            <div className="flex justify-center mb-6">
              <button
                key="hybrid"
                onClick={() => toggleFocus('hybrid')}
                className={`rounded px-4 py-2 text-center transition-colors w-2/3 ${
                  selectedFocus.includes('hybrid')
                    ? 'bg-gray-200 text-black'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                Hybrid (mix of these)
              </button>
            </div>
            <button
              className="w-full bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
              disabled={selectedFocus.length === 0}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          </div>
        );

      case 1:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What's your timeline?</div>
            <div className="space-y-3 mb-6">
              {TIMELINE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTimeline(option.key)}
                  className={`w-full p-3 text-left rounded transition-colors ${
                    timeline === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(0)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!timeline}
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What's your experience level?</div>
            <div className="space-y-3 mb-6">
              {EXPERIENCE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setExperience(option.key)}
                  className={`w-full p-3 text-left rounded transition-colors ${
                    experience === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!experience}
                onClick={() => setStep(3)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What's your primary goal?</div>
            <div className="space-y-3 mb-6">
              {GOAL_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setGoal(option.key)}
                  className={`w-full p-3 text-left rounded transition-colors ${
                    goal === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!goal}
                onClick={() => setStep(4)}
              >
                Generate Plan
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center">
            <div className="mb-4 text-gray-800 font-medium">Generating your plan...</div>
            <div className="text-gray-600 mb-6">
              Based on your focus: {selectedFocus.join(', ')}<br />
              Timeline: {TIMELINE_OPTIONS.find(t => t.key === timeline)?.label}<br />
              Experience: {EXPERIENCE_OPTIONS.find(e => e.key === experience)?.label}<br />
              Goal: {GOAL_OPTIONS.find(g => g.key === goal)?.label}
            </div>
            <div className="text-gray-500">(TODO: Connect to AI plan generation)</div>
          </div>
        );

      default:
        return <div>Something went wrong</div>;
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-8 p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Create a Training Plan</h2>
      <div className="space-y-6">
        {getCurrentStepContent()}
      </div>
    </div>
  );
} 