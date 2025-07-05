// src/components/PlanBuilder.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Kanban } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface PlanBuilderProps {
  onClose: () => void;
  onPlanGenerated?: (plan: any) => void; // NEW: Callback for plan creation
}

export default function PlanBuilder({ onClose, onPlanGenerated }: PlanBuilderProps) {
  const { addWorkout } = useAppContext();
  const [planPrompt, setPlanPrompt] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Quick plan suggestions
  const quickPlans = [
    "Build me a 30-minute easy run",
    "Create a 5K training workout", 
    "I want a 45-minute bike ride with intervals",
    "Design a full-body strength workout",
    "Give me a swim workout for endurance",
    "Build me a 4-week marathon training plan",
    "Create a triathlon program",
    "I need a strength plan for runners"
  ];

  const generatePlan = async () => {
    if (!planPrompt.trim()) return;
    
    setGeneratingPlan(true);
    try {
      // Mock response for now - replace with real AI later
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
      
      // Generate a month of progressive workouts
      const generateMonthOfWorkouts = (goal: string) => {
        const workouts = [];
        const startDate = new Date();
        
        // Example: 5K training plan over 4 weeks
        for (let week = 0; week < 4; week++) {
          for (let day = 0; day < 7; day++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + (week * 7) + day);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Skip some days (rest days)
            if (day === 1 || day === 3 || day === 6) continue;
            
            let workout = null;
            
            if (day === 0) { // Monday - Long run
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Long Run`,
                intervals: [
                  {
                    id: '1',
                    time: '10:00',
                    effortLabel: 'Easy Warmup',
                    rpeTarget: '4',
                    duration: 600,
                    repeatCount: 1
                  },
                  {
                    id: '2',
                    time: `${30 + (week * 5)}:00`,
                    effortLabel: 'Steady Pace',
                    rpeTarget: '6',
                    duration: (30 + (week * 5)) * 60,
                    repeatCount: 1
                  },
                  {
                    id: '3',
                    time: '10:00',
                    effortLabel: 'Easy Cool Down',
                    rpeTarget: '3',
                    duration: 600,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 2) { // Wednesday - Intervals
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Speed Work`,
                intervals: [
                  {
                    id: '1',
                    time: '15:00',
                    effortLabel: 'Warmup',
                    rpeTarget: '4',
                    duration: 900,
                    repeatCount: 1
                  },
                  {
                    id: '2',
                    time: `${4 + week}x(2:00 Hard/1:00 Easy)`,
                    effortLabel: 'Intervals',
                    rpeTarget: '8',
                    duration: (4 + week) * 180,
                    repeatCount: 1,
                    isRepeatBlock: true
                  },
                  {
                    id: '3',
                    time: '10:00',
                    effortLabel: 'Cool Down',
                    rpeTarget: '3',
                    duration: 600,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 4) { // Friday - Recovery
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Recovery Run`,
                intervals: [
                  {
                    id: '1',
                    time: '25:00',
                    effortLabel: 'Easy Recovery',
                    rpeTarget: '4',
                    duration: 1500,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 5) { // Saturday - Strength
              workout = {
                date: dateStr,
                type: 'strength',
                name: `Week ${week + 1} - Strength Training`,
                strength_exercises: [  // 🔥 FIXED: Changed from 'exercises' to 'strength_exercises'
                  {
                    id: '1',
                    name: 'Squats',
                    sets: 3,
                    reps: 12,
                    weight: 135,
                    weightMode: 'same'
                  },
                  {
                    id: '2',
                    name: 'Lunges',
                    sets: 3,
                    reps: 10,
                    weight: 0,
                    weightMode: 'same'
                  },
                  {
                    id: '3',
                    name: 'Calf Raises',
                    sets: 3,
                    reps: 15,
                    weight: 0,
                    weightMode: 'same'
                  }
                ]
              };
            }
            
            if (workout) {
              workouts.push(workout);
            }
          }
        }
        
        return workouts;
      };
      
      // Generate the month of workouts
      const monthWorkouts = generateMonthOfWorkouts(planPrompt);
      
      // NEW: Create plan metadata for Plans dropdown
      const planId = `plan-${Date.now()}`;
      const planData = {
        id: planId,
        name: planPrompt.length > 30 ? `${planPrompt.substring(0, 30)}...` : planPrompt,
        description: planPrompt,
        type: 'run', // Could be determined by AI
        duration: 4, // 4 weeks
        level: 'intermediate',
        goal: planPrompt,
        status: 'active',
        currentWeek: 1,
        createdDate: new Date().toISOString().split('T')[0],
        totalWorkouts: monthWorkouts.length,
        weeks: [] // Could be populated with detailed week structure for plan detail view
      };
      
      console.log('🚀 Generated plan data:', planData);
      
      // Save all workouts to your app
      for (const workout of monthWorkouts) {
        const workoutData = {
          name: workout.name,
          type: workout.type,
          date: workout.date,
          description: workout.intervals ? 
            workout.intervals.map(i => i.effortLabel || i.time).join(' + ') :
            workout.strength_exercises?.map(e => `${e.name} ${e.sets}x${e.reps}`).join(' + ') || '',
          duration: workout.intervals ? 
            workout.intervals.reduce((sum, i) => sum + (i.duration || 0), 0) : 
            2400, // 40 min default for strength
          workout_status: 'planned',
          intervals: workout.intervals || undefined,
          strength_exercises: workout.strength_exercises || undefined,
          userComments: '',  // 🔥 FIXED: Added missing required fields
          completedManually: false,  // 🔥 FIXED: Added missing required fields
          planId: planId  // Link workouts to plan
        };
        
        try {
          await addWorkout(workoutData);
        } catch (error) {
          console.error('Error saving workout:', error);
        }
      }
      
      // NEW: Call the plan generation callback
      if (onPlanGenerated) {
        console.log('🚀 Calling onPlanGenerated with:', planData);
        onPlanGenerated(planData);
      }
      
      setPlanPrompt('');
      
      // Show success message
      alert(`Generated ${monthWorkouts.length} workouts for your training plan!`);
      
      // Don't close automatically - let AppLayout handle it
      // onClose();
      
    } catch (error) {
      console.error('Error generating plan:', error);
      alert('Error generating plan. Please try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-3 py-2">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={onClose}
            variant="ghost"
            className="flex items-center gap-2 p-0 h-auto text-muted-foreground hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-gray-50 rounded-full">
                <Kanban className="h-8 w-8 text-gray-600" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold mb-2">Build me a plan</h1>
            <p className="text-gray-600">
              Describe what you want to train for and I'll create a personalized plan
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <Textarea
                value={planPrompt}
                onChange={(e) => setPlanPrompt(e.target.value)}
                placeholder="I want to train for a 5K race in 8 weeks..."
                rows={4}
                className="w-full min-h-[100px] border-gray-300"
                style={{fontFamily: 'Inter, sans-serif'}}
              />
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">Quick suggestions:</p>
              <div className="grid grid-cols-1 gap-2">
                {quickPlans.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setPlanPrompt(suggestion)}
                    className="text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    style={{fontFamily: 'Inter, sans-serif'}}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="pt-4">
              <Button
                onClick={generatePlan}
                disabled={!planPrompt.trim() || generatingPlan}
                className="w-full h-12 bg-black text-white hover:bg-gray-800"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600
                }}
              >
                {generatingPlan ? 'Generating plan...' : 'Generate Plan'}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}