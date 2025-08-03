// Test file to check plan generation system
import { generateTrainingPlan } from './src/services/TrainingTemplates.ts';

// Test combinations
const testCombinations = [
  // Sprint combinations
  {
    name: "Sprint + Standard + No Strength + 4 days + 6 hours",
    params: {
      distance: 'sprint',
      strengthOption: 'none',
      disciplineFocus: 'standard',
      targetHours: 6,
      trainingFrequency: 4,
      userPerformance: {
        ftp: 200,
        fiveKPace: "24:00",
        easyPace: "9:00",
        swimPace: "2:00/100m",
        squat: 200,
        deadlift: 250,
        bench: 150
      }
    }
  },
  {
    name: "Sprint + Bike+Run Speed + Stability + 5 days + 8 hours",
    params: {
      distance: 'sprint',
      strengthOption: 'stability_focus',
      disciplineFocus: 'bike_run_speed',
      targetHours: 8,
      trainingFrequency: 5,
      userPerformance: {
        ftp: 200,
        fiveKPace: "24:00",
        easyPace: "9:00",
        swimPace: "2:00/100m",
        squat: 200,
        deadlift: 250,
        bench: 150
      }
    }
  },
  // 70.3 combinations
  {
    name: "70.3 + Bike+Run Speed + Stability + 6 days + 12 hours",
    params: {
      distance: 'seventy3',
      strengthOption: 'stability_focus',
      disciplineFocus: 'bike_run_speed',
      targetHours: 12,
      trainingFrequency: 6,
      userPerformance: {
        ftp: 200,
        fiveKPace: "24:00",
        easyPace: "9:00",
        swimPace: "2:00/100m",
        squat: 200,
        deadlift: 250,
        bench: 150
      }
    }
  },
  {
    name: "70.3 + Cowboy Compound + 7 days + 15 hours",
    params: {
      distance: 'seventy3',
      strengthOption: 'cowboy_compound',
      disciplineFocus: 'standard',
      targetHours: 15,
      trainingFrequency: 7,
      userPerformance: {
        ftp: 200,
        fiveKPace: "24:00",
        easyPace: "9:00",
        swimPace: "2:00/100m",
        squat: 200,
        deadlift: 250,
        bench: 150
      }
    }
  }
];

// Test function
async function testPlanGeneration() {
  console.log('🧪 Testing plan generation system...');
  
  for (const test of testCombinations) {
    try {
      console.log(`\n📋 Testing: ${test.name}`);
      
      const plan = generateTrainingPlan(
        test.params.distance,
        test.params.strengthOption,
        test.params.disciplineFocus,
        test.params.targetHours,
        test.params.trainingFrequency,
        test.params.userPerformance
      );
      
      console.log(`✅ SUCCESS: Generated plan with ${plan.weeks.length} weeks`);
      
      // Check if plan has workouts
      const totalWorkouts = plan.weeks.reduce((sum, week) => sum + week.sessions.length, 0);
      console.log(`📊 Total workouts: ${totalWorkouts}`);
      
      // Check weekly hours
      const weeklyHours = plan.weeks[0].totalHours;
      console.log(`⏰ Week 1 hours: ${weeklyHours}`);
      
    } catch (error) {
      console.log(`❌ FAILED: ${test.name}`);
      console.log(`Error: ${error.message}`);
    }
  }
}

testPlanGeneration(); 