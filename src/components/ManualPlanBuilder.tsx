import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

// Manual plan builder - no AI dependencies

// Quick plan suggestions for manual tab
const quickPlans = [
  "Build me a 30-minute easy run for recovery",
  "Create a 5K training plan over 6 weeks", 
  "I want a 45-minute bike ride with intervals",
  "Design a full-body strength workout",
  "Give me a 2000m swim workout",
  "Build me a 4-week marathon training plan",
  "Create a 12-week triathlon program",
  "I need a strength plan for runners",
  "Design a 2-week taper for my race",
  "Create interval training for speed"
];

interface ManualPlanBuilderProps {
  startDate: string;
  onStartDateChange: (date: string) => void;
  onPlanGenerated: (plan: any) => void;
  generatingPlan: boolean;
  onSetGeneratingPlan: (generating: boolean) => void;
}

export default function ManualPlanBuilder({ 
  startDate, 
  onStartDateChange, 
  onPlanGenerated, 
  generatingPlan,
  onSetGeneratingPlan 
}: ManualPlanBuilderProps) {
  // Simple mock for manual plan generation (no AI)
  const generateMockPlan = async (prompt: string, startDate: string) => {
    return {
      plan: {
        id: `manual-${Date.now()}`,
        name: 'Manual Training Plan',
        description: `Custom plan: ${prompt}`,
        type: 'manual',
        goal: 'custom',
        status: 'active',
        currentWeek: 1,
        createdDate: new Date().toISOString(),
        totalWorkouts: 7,
        disciplines: ['custom'],
        isIntegrated: true,
        duration: 7 // Add missing duration property
      },
      workouts: [
        { name: 'Custom Workout 1', type: 'custom', date: startDate, duration: 60, description: 'Day 1: ' + prompt },
        { name: 'Custom Workout 2', type: 'custom', date: startDate, duration: 60, description: 'Day 2: ' + prompt },
        { name: 'Custom Workout 3', type: 'custom', date: startDate, duration: 60, description: 'Day 3: ' + prompt },
        { name: 'Custom Workout 4', type: 'custom', date: startDate, duration: 60, description: 'Day 4: ' + prompt },
        { name: 'Custom Workout 5', type: 'custom', date: startDate, duration: 60, description: 'Day 5: ' + prompt },
        { name: 'Custom Workout 6', type: 'custom', date: startDate, duration: 60, description: 'Day 6: ' + prompt },
        { name: 'Custom Workout 7', type: 'custom', date: startDate, duration: 60, description: 'Day 7: ' + prompt }
      ]
    };
  };
  const [planPrompt, setPlanPrompt] = useState('');

  const generateDisplaySchedule = (workouts: any[]): string[] => {
    console.log('Generating display schedule from workouts:', workouts);
    
    if (!workouts || workouts.length === 0) {
      console.log('No workouts provided, using fallback schedule');
      return [
        'Monday: Structured workout based on your goals',
        'Tuesday: Recovery or cross-training',
        'Wednesday: High intensity training session', 
        'Thursday: Active recovery',
        'Friday: Skill or technique work',
        'Saturday: Long session or competition prep',
        'Sunday: Rest or light activity'
      ];
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const schedule = [];
    
    for (let i = 0; i < 7; i++) {
      if (workouts[i]) {
        const workout = workouts[i];
        
        if (workout.name && workout.description) {
          let description = workout.description;
          if (description.toLowerCase().startsWith(dayNames[i].toLowerCase())) {
            description = description.substring(dayNames[i].length + 1).trim();
            if (description.startsWith(':')) description = description.substring(1).trim();
          }
          
          schedule.push(`${dayNames[i]}: ${workout.name} - ${description}`);
        } else {
          schedule.push(`${dayNames[i]}: ${workout.name || 'Training Session'}`);
        }
      } else {
        schedule.push(`${dayNames[i]}: Rest day`);
      }
    }
    
    return schedule;
  };

  // Generate plan from manual input
  const handleManualGenerate = async () => {
    if (!planPrompt.trim()) return;
    
    onSetGeneratingPlan(true);
    try {
      console.log('Generating plan from manual prompt...');
      
      const result = await generateMockPlan(planPrompt, startDate);
      
      const manualPlan = {
        id: result.plan.id || `manual-plan-${Date.now()}`,
        name: result.plan.name,
        description: result.plan.description,
        focus: result.plan.type,
        goal: result.plan.goal,
        timeline: 'Flexible',
        daysPerWeek: '4-5 days',
        weeklySchedule: generateDisplaySchedule(result.workouts),
        phase: 'Progressive Training',
        currentWeek: 1,
        totalWeeks: result.plan.duration,
        customPrompt: planPrompt,
        workouts: result.workouts
      };
      
      console.log('Manual plan generated:', manualPlan);
      onPlanGenerated(manualPlan);
      setPlanPrompt('');
      
    } catch (error) {
      console.error('Error generating manual plan:', error);
      alert('Error generating plan. Please try again with a different description.');
    } finally {
      onSetGeneratingPlan(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-medium mb-2">Manual Plan Creation</h1>
        <p className="text-gray-600">
          Describe your training goals and we'll create a plan
        </p>
      </div>

      <div className="space-y-6">
        {/* Start Date Input */}
        <div className="space-y-2">
          <label htmlFor="startDate" className="text-sm font-medium text-gray-700">
            Start Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="pl-10 min-h-[44px] w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
            />
          </div>
        </div>

        {/* Plan Description */}
        <div className="space-y-2">
          <label htmlFor="planPrompt" className="text-sm font-medium text-gray-700">
            Describe Your Training Goal
          </label>
          <textarea
            id="planPrompt"
            value={planPrompt}
            onChange={(e) => setPlanPrompt(e.target.value)}
            placeholder="I want to train for a 5K race in 8 weeks. I'm a beginner runner who can currently run for 20 minutes..."
            rows={4}
            className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
          />
        </div>
        
        {/* Quick Suggestions */}
        <div className="space-y-3">
          <p className="text-sm text-gray-600 font-medium">Quick suggestions:</p>
          <div className="grid grid-cols-1 gap-2">
            {quickPlans.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setPlanPrompt(suggestion)}
                className="text-left p-3 text-sm hover:text-blue-600 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        
        {/* Generate Button */}
        <div className="pt-4">
          <button
            onClick={handleManualGenerate}
            disabled={!planPrompt.trim() || generatingPlan}
            className="w-full h-12 px-4 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
          >
            {generatingPlan ? (
              "Building plan..."
            ) : (
              "Build Plan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}