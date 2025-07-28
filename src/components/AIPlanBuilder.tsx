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

export default function AIPlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    loadUserBaselines().then(setBaselines);
  }, [loadUserBaselines]);

  const toggleFocus = (key: string) => {
    setSelectedFocus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="max-w-lg mx-auto mt-8 p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Create a Training Plan</h2>
      <div className="space-y-6">
        {/* Step 1: Focus selection */}
        {step === 0 && (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What is your focus?</div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {/* First row: Run, Triathlon (center), Ride */}
              <div className="col-span-1 flex justify-center">
                <button
                  key="run"
                  onClick={() => toggleFocus('run')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
                    selectedFocus.includes('run')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Run
                </button>
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  key="triathlon"
                  onClick={() => toggleFocus('triathlon')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
                    selectedFocus.includes('triathlon')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Triathlon
                </button>
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  key="ride"
                  onClick={() => toggleFocus('ride')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
                    selectedFocus.includes('ride')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Ride
                </button>
              </div>
              {/* Second row: Strength, Mobility, Swim */}
              <div className="col-span-1 flex justify-center">
                <button
                  key="strength"
                  onClick={() => toggleFocus('strength')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
                    selectedFocus.includes('strength')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Strength
                </button>
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  key="mobility"
                  onClick={() => toggleFocus('mobility')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
                    selectedFocus.includes('mobility')
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Mobility
                </button>
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  key="swim"
                  onClick={() => toggleFocus('swim')}
                  className={`rounded px-4 py-2 text-center transition-colors w-full ${
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
        )}
        {/* Future steps go here */}
        {step === 1 && (
          <div className="text-gray-600">(TODO: Continue assessment and plan generation...)</div>
        )}
      </div>
    </div>
  );
} 