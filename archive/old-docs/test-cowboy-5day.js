import { generateTriathlonPlan } from './src/services/TriathlonPlanBuilder.ts';

console.log('🤠 Testing 5-Day Cowboy Plans...\n');

const testParams = {
  distance: '70.3',
  trainingFrequency: 5,
  strengthOption: 'cowboy_compound',
  disciplineFocus: 'standard',
  weeklyHours: 15,
  longSessionDays: ['Saturday', 'Sunday'],
  longSessionOrder: 'bike_first'
};

const userBaselines = {
  ftp: 250,
  fiveKPace: '20:00',
  easyPace: '8:00',
  swimPace: '1:30',
  squat: 200,
  deadlift: 250,
  bench: 150
};

try {
  console.log('🎯 Generating 5-day Cowboy Compound plan...');
  const plan = generateTriathlonPlan(testParams, userBaselines);
  
  console.log('✅ Plan generated!');
  console.log(`📊 Total sessions: ${plan.sessions.length}`);
  console.log(`📈 Total minutes: ${plan.totalMinutes}`);
  console.log(`💪 Strength sessions: ${plan.strengthSessions}`);
  
  console.log('\n📋 Week 1 Sessions:');
  const week1 = plan.sessions.slice(0, 8);
  week1.forEach((session, index) => {
    console.log(`${index + 1}. ${session.day} - ${session.discipline} ${session.type} (${session.duration}min) - ${session.intensity}`);
  });
  
  // Check session distribution
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  console.log('\n🔍 Day Analysis:');
  days.forEach(day => {
    const sessionsForDay = week1.filter(s => s.day === day);
    console.log(`${day}: ${sessionsForDay.length} sessions`);
  });
  
  // Check if we have 3 strength sessions per week
  const strengthSessions = week1.filter(s => s.discipline === 'strength');
  console.log(`\n💪 Strength Sessions in Week 1: ${strengthSessions.length}`);
  
  if (strengthSessions.length >= 3) {
    console.log('✅ Cowboy requirement met: 3+ strength sessions per week');
  } else {
    console.log('❌ Cowboy requirement NOT met: Need 3+ strength sessions per week');
  }
  
} catch (error) {
  console.error('❌ Error:', error);
} 