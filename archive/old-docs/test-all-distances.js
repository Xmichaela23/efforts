import { AlgorithmTrainingService } from './src/services/AlgorithmTrainingService.ts';

const service = new AlgorithmTrainingService();

const testCases = [
  {
    name: 'Sprint - 5 days - none strength',
    params: {
      distance: 'sprint',
      strengthOption: 'none',
      disciplineFocus: 'standard',
      targetHours: 6,
      trainingFrequency: 5,
      userPerformance: { ftp: 200, fiveKPace: '22:00', swimPace: '2:30' }
    }
  },
  {
    name: 'Olympic - 6 days - compound strength',
    params: {
      distance: 'olympic',
      strengthOption: 'compound_strength',
      disciplineFocus: 'standard',
      targetHours: 8,
      trainingFrequency: 6,
      userPerformance: { ftp: 250, fiveKPace: '20:00', swimPace: '2:00', squat: 200, deadlift: 250, bench: 150 }
    }
  },
  {
    name: '70.3 - 6 days - cowboy_compound strength',
    params: {
      distance: 'seventy3',
      strengthOption: 'cowboy_compound',
      disciplineFocus: 'standard',
      targetHours: 10,
      trainingFrequency: 6,
      userPerformance: { ftp: 280, fiveKPace: '18:30', swimPace: '1:45', squat: 250, deadlift: 300, bench: 180 }
    }
  },
  {
    name: 'Ironman - 7 days - compound strength',
    params: {
      distance: 'ironman',
      strengthOption: 'compound_strength',
      disciplineFocus: 'standard',
      targetHours: 15,
      trainingFrequency: 7,
      userPerformance: { ftp: 300, fiveKPace: '17:00', swimPace: '1:30', squat: 300, deadlift: 350, bench: 200 }
    }
  }
];

console.log('🧪 Testing All Distances with UI Service...\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`📊 Testing: ${testCase.name}`);
  
  try {
    const plan = await service.generateTrainingPlan(testCase.params, '2024-01-01');
    
    // Expected results
    const expectedWorkouts = 12 * 8; // 12 weeks × 8 sessions
    const expectedStrengthSessions = testCase.params.strengthOption === 'none' ? 0 : 36; // 3 per week × 12 weeks
    
    // Check results
    const actualWorkouts = plan.workouts.length;
    const actualStrengthSessions = plan.workouts.filter(w => w.discipline === 'strength').length;
    const hasWeekNumbers = plan.workouts.some(w => w.day?.includes('Week'));
    
    console.log(`  📈 Total workouts: ${actualWorkouts}/${expectedWorkouts}`);
    console.log(`  💪 Strength sessions: ${actualStrengthSessions}/${expectedStrengthSessions}`);
    console.log(`  📅 Has week numbers: ${hasWeekNumbers ? '✅' : '❌'}`);
    
    // Check first and last workouts
    const firstWorkout = plan.workouts[0];
    const lastWorkout = plan.workouts[plan.workouts.length - 1];
    console.log(`  🏁 First: ${firstWorkout?.day} - ${firstWorkout?.discipline} ${firstWorkout?.type}`);
    console.log(`  🏁 Last: ${lastWorkout?.day} - ${lastWorkout?.discipline} ${lastWorkout?.type}`);
    
    // Determine if test passed
    const workoutsCorrect = actualWorkouts === expectedWorkouts;
    const strengthCorrect = actualStrengthSessions === expectedStrengthSessions;
    const weeksCorrect = hasWeekNumbers;
    
    if (workoutsCorrect && strengthCorrect && weeksCorrect) {
      console.log(`  ✅ PASSED`);
      passed++;
    } else {
      console.log(`  ❌ FAILED`);
      console.log(`     - Workouts: ${workoutsCorrect ? '✅' : '❌'}`);
      console.log(`     - Strength: ${strengthCorrect ? '✅' : '❌'}`);
      console.log(`     - Weeks: ${weeksCorrect ? '✅' : '❌'}`);
      failed++;
    }
    
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    failed++;
  }
  
  console.log('');
}

console.log('📊 Final Results:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! The UI service is working correctly for all distances.');
} else {
  console.log('\n⚠️  Some tests failed. Check the issues above.');
} 