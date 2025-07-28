import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';

// TODO: Add plan generation and preview integration

const FOCUS_OPTIONS = [
  { key: 'run', label: 'Run' },
  { key: 'ride', label: 'Ride' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'strength', label: 'Strength' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'hybrid', label: 'Hybrid (mix of these)' },
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
      <h2 className="text-xl font-semibold mb-4">Training Assistant</h2>
      <div className="space-y-6">
        {/* Step 1: Focus selection */}
        {step === 0 && (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What are you training for?</div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => toggleFocus(opt.key)}
                  className={`border rounded px-4 py-2 text-left transition-colors ${
                    selectedFocus.includes(opt.key)
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
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