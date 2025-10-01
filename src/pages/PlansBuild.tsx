import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PlansBuild() {
  const navigate = useNavigate();
  const Section: React.FC<{ title: string; desc: string; action?: { label: string; onClick: () => void; }; secondary?: { label: string; disabled?: boolean; } }>=({ title, desc, action, secondary })=> (
    <div className="border rounded-md p-4">
      <div className="text-base font-semibold mb-1">{title}</div>
      <div className="text-sm text-gray-600 mb-3">{desc}</div>
      <div className="flex items-center gap-4">
        {action && (
          <button className="text-sm text-blue-600 hover:text-blue-700" onClick={action.onClick}>{action.label}</button>
        )}
        {secondary && (
          <span className="text-sm text-gray-400">{secondary.label}{secondary.disabled? ' — coming soon' : ''}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Build Plans</h1>
        <p className="text-sm text-gray-600">Create simple plans that populate your calendar and prefill the loggers.</p>
      </div>

      <Section
        title="Mobility"
        desc="Author mobility/PT sessions with simple text. Saves as Mobility and shows as MBL on the calendar."
        action={{ label: 'Build', onClick: () => navigate('/plans/pt') }}
      />

      <Section
        title="Run"
        desc="Generate run sessions with simple language (intervals, tempo, long)."
        secondary={{ label: 'Build', disabled: true }}
      />

      <Section
        title="Ride"
        desc="Create ride workouts (VO2, Threshold, Endurance) from short descriptions."
        secondary={{ label: 'Build', disabled: true }}
      />

      <Section
        title="Triathlon"
        desc="Build multi-week triathlon plans that materialize swim/ride/run sessions."
        secondary={{ label: 'Build', disabled: true }}
      />
    </div>
  );
}


