import React from 'react';
import React, { useState } from 'react';
import GetStrongerFasterBuilder from './GetStrongerFasterBuilder';

type Discipline = 'run'|'ride'|'swim'|'strength'|'hybrid';

export default function PlanBuilder() {
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  // Step 1: Choose discipline
  if (!discipline) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h2 className="text-2xl font-semibold mb-4">Plans</h2>
        <div className="flex flex-col gap-2">
          {([
            { id: 'run', label: 'Run' },
            { id: 'ride', label: 'Ride' },
            { id: 'strength', label: 'Strength' },
            { id: 'swim', label: 'Swim' },
            { id: 'hybrid', label: 'Hybrid' },
          ] as {id: Discipline; label: string}[]).map(d => (
            <button
              key={d.id}
              onClick={() => setDiscipline(d.id)}
              className="w-full py-3 text-left text-lg hover:bg-gray-50 focus:bg-gray-50 border-none outline-none ring-0 focus:outline-none focus:ring-0"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Choose plan within discipline
  if (discipline === 'run' && !planId) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setDiscipline(null)} className="text-sm text-blue-600">← Back</button>
          <h2 className="text-xl font-semibold">Run Plans</h2>
          <div />
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setPlanId('get_stronger_faster_8w')}
            className="w-full py-3 text-left hover:bg-gray-50 focus:bg-gray-50 border-none outline-none ring-0 focus:outline-none focus:ring-0"
          >
            <div className="font-medium">Get Stronger Faster</div>
            <div className="text-sm text-gray-600">8 weeks • Run VO2 + Threshold • Strength integrated</div>
            <div className="text-sm text-gray-700 mt-1">8 weeks to get faster and stronger. For runners who want sharper 5K–10K times and the durability strength brings.</div>
          </button>
          {/* Future plans can be added here */}
        </div>
      </div>
    );
  }

  // Step 3: Render selected plan builder
  if (planId === 'get_stronger_faster_8w') {
    return (
      <div className="w-full">
        <div className="max-w-3xl mx-auto p-2"></div>
        <GetStrongerFasterBuilder />
      </div>
    );
  }

  // Placeholder for other disciplines (no plans yet)
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setDiscipline(null)} className="text-sm text-blue-600">← Back</button>
        <h2 className="text-xl font-semibold">{discipline?.charAt(0).toUpperCase() + discipline!.slice(1)} Plans</h2>
        <div />
      </div>
      <div className="text-sm text-gray-600">No plans available yet for this discipline.</div>
    </div>
  );
}