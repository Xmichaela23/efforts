import React from 'react';
import WorkoutDetailView from './WorkoutDetailView';
import WorkoutSummaryView from './WorkoutSummaryView';
import WorkoutExecutionView from './WorkoutExecutionView';

// Demo data to show how the templates work
const demoEnduranceComputed = {
  total_duration_seconds: 3300, // 55 minutes
  steps: [
    {
      kind: 'steady',
      ctrl: 'time',
      seconds: 600, // 10 minutes
      pace_sec_per_mi: 585, // 9:45/mi
      pace_range: { lower: 556, upper: 614 }, // ±5%
      label: 'WU',
      original_val: 10,
      original_units: 'min'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230, // ~3:50 for 800m
      pace_sec_per_mi: 463, // 7:43/mi (5K pace)
      pace_range: { lower: 440, upper: 486 }, // ±5%
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'recovery',
      ctrl: 'time',
      seconds: 120, // 2 minutes
      pace_sec_per_mi: 585, // 9:45/mi
      pace_range: { lower: 556, upper: 614 }, // ±5%
      label: 'jog'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230,
      pace_sec_per_mi: 463,
      pace_range: { lower: 440, upper: 486 },
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'recovery',
      ctrl: 'time',
      seconds: 120,
      pace_sec_per_mi: 585,
      pace_range: { lower: 556, upper: 614 },
      label: 'jog'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230,
      pace_sec_per_mi: 463,
      pace_range: { lower: 440, upper: 486 },
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'recovery',
      ctrl: 'time',
      seconds: 120,
      pace_sec_per_mi: 585,
      pace_range: { lower: 556, upper: 614 },
      label: 'jog'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230,
      pace_sec_per_mi: 463,
      pace_range: { lower: 440, upper: 486 },
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'recovery',
      ctrl: 'time',
      seconds: 120,
      pace_sec_per_mi: 585,
      pace_range: { lower: 556, upper: 614 },
      label: 'jog'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230,
      pace_sec_per_mi: 463,
      pace_range: { lower: 440, upper: 486 },
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'recovery',
      ctrl: 'time',
      seconds: 120,
      pace_sec_per_mi: 585,
      pace_range: { lower: 556, upper: 614 },
      label: 'jog'
    },
    {
      kind: 'work',
      ctrl: 'distance',
      seconds: 230,
      pace_sec_per_mi: 463,
      pace_range: { lower: 440, upper: 486 },
      label: '800m',
      original_val: 0.5,
      original_units: 'mi'
    },
    {
      kind: 'steady',
      ctrl: 'time',
      seconds: 600, // 10 minutes
      pace_sec_per_mi: 585, // 9:45/mi
      pace_range: { lower: 556, upper: 614 }, // ±5%
      label: 'CD',
      original_val: 10,
      original_units: 'min'
    }
  ]
};

const demoStrengthComputed = {
  total_duration_seconds: 2700, // 45 minutes
  steps: [
    {
      exercise_name: 'Squat',
      sets: 5,
      reps: 5,
      percentage: 70,
      calculated_weight: 185,
      rest_time: 3
    },
    {
      exercise_name: 'Bench Press',
      sets: 5,
      reps: 5,
      percentage: 70,
      calculated_weight: 130,
      rest_time: 3
    },
    {
      exercise_name: 'Barbell Row',
      sets: 4,
      reps: 6,
      percentage: 70,
      calculated_weight: 130,
      rest_time: 2
    },
    {
      exercise_name: 'Deadlift',
      sets: 5,
      reps: 3,
      percentage: 75,
      calculated_weight: 235,
      rest_time: 4
    },
    {
      exercise_name: 'Overhead Press',
      sets: 4,
      reps: 5,
      percentage: 70,
      calculated_weight: 95,
      rest_time: 3
    }
  ]
};

const demoBaselines = {
  fiveK_pace_sec_per_mi: 463, // 7:43/mi
  easy_pace_sec_per_mi: 585,  // 9:45/mi
  ftp: 250,
  swim_pace_per_100_sec: 130,  // 2:10/100yd
  // Strength 1RMs
  squat: 265,
  bench: 185,
  deadlift: 315,
  overheadPress1RM: 135,
  barbellRow: 185
};

const WorkoutTemplateDemo: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Workout Template Demo</h1>
        <p className="text-gray-600">Showing how both endurance and strength workouts display in three different contexts</p>
      </div>

      {/* Endurance Workout Examples */}
      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">Endurance Workout: Run Intervals</h2>
        
        {/* 1. Detailed View (Planned Tab) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">1. Detailed View (Planned Tab)</h3>
          <p className="text-gray-600 mb-4">Full workout breakdown for planning and review</p>
          <WorkoutDetailView
            computed={demoEnduranceComputed}
            baselines={demoBaselines}
            workoutType="Run"
            description="6×800m intervals with 2:00 jog recovery"
          />
        </div>

        {/* 2. Summary View (Plan Page) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">2. Summary View (Plan Page)</h3>
          <p className="text-gray-600 mb-4">Compact overview when browsing plans</p>
          <WorkoutSummaryView
            computed={demoEnduranceComputed}
            baselines={demoBaselines}
            workoutType="Run Intervals"
            description="Quality session focusing on 5K pace intervals"
          />
        </div>

        {/* 3. Execution View (Today's Efforts) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">3. Execution View (Today's Efforts)</h3>
          <p className="text-gray-600 mb-4">Quick reference for daily execution</p>
          <WorkoutExecutionView
            computed={demoEnduranceComputed}
            baselines={demoBaselines}
            workoutType="Run"
            description="Focus on maintaining consistent pace during intervals"
          />
        </div>
      </div>

      {/* Strength Workout Examples */}
      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">Strength Workout: Lower Body Focus</h2>
        
        {/* 1. Detailed View (Planned Tab) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">1. Detailed View (Planned Tab)</h3>
          <p className="text-gray-600 mb-4">Full workout breakdown with calculated weights</p>
          <WorkoutDetailView
            computed={demoStrengthComputed}
            baselines={demoBaselines}
            workoutType="Strength"
            description="Lower body focus with progressive loading"
          />
        </div>

        {/* 2. Summary View (Plan Page) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">2. Summary View (Plan Page)</h3>
          <p className="text-gray-600 mb-4">Compact overview when browsing plans</p>
          <WorkoutSummaryView
            computed={demoStrengthComputed}
            baselines={demoBaselines}
            workoutType="Strength - Lower Body"
            description="Progressive loading with calculated weights"
          />
        </div>

        {/* 3. Execution View (Today's Efforts) */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">3. Execution View (Today's Efforts)</h3>
          <p className="text-gray-600 mb-4">Quick reference for daily execution</p>
          <WorkoutExecutionView
            computed={demoStrengthComputed}
            baselines={demoBaselines}
            workoutType="Strength"
            description="Focus on form and progressive loading"
          />
        </div>
      </div>

      {/* Data Source Info */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Data Source</h3>
        <p className="text-sm text-gray-600 mb-2">
          All views use the same computed data from the plan baker:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• <strong>Endurance Baselines:</strong> 5K pace: 7:43/mi, Easy pace: 9:45/mi, FTP: 250W</li>
          <li>• <strong>Strength 1RMs:</strong> Squat: 265 lbs, Bench: 185 lbs, Deadlift: 315 lbs</li>
          <li>• <strong>Computed Values:</strong> All paces, powers, and weights calculated automatically</li>
          <li>• <strong>Progressive Loading:</strong> Strength percentages automatically convert to actual weights</li>
        </ul>
        <p className="text-sm text-gray-500 mt-3">
          This demonstrates seamless integration: one baked plan data → three different display formats for both endurance and strength
        </p>
      </div>
    </div>
  );
};

export default WorkoutTemplateDemo;
