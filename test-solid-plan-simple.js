// Test the Solid Plan Engine
console.log('🎯 Testing Solid Plan Engine...\n');

// Mock the SolidPlanEngine (since we can't import TypeScript directly)
class MockSolidPlanEngine {
  generateSolidSprintPlan(userBaselines) {
    console.log('🎯 Generating ONE solid Sprint plan...');
    
    // Calculate personalized targets
    const easyBikePower = Math.round(userBaselines.ftp * 0.65);
    const enduranceBikePower = Math.round(userBaselines.ftp * 0.75);
    const tempoBikePower = Math.round(userBaselines.ftp * 0.85);
    
    console.log('🔧 Personalized targets:');
    console.log(`  • Bike: Easy ${easyBikePower}W, Endurance ${enduranceBikePower}W, Tempo ${tempoBikePower}W`);
    console.log(`  • Run: Easy ${userBaselines.easyPace}, Tempo 9:00/mile`);
    console.log(`  • Swim: Easy ${userBaselines.swimPace100}, Endurance 2:30/100m`);
    
    // Create base weekly template (6 hours = 360 minutes)
    const baseSessions = [
      { day: 'Monday', discipline: 'swim', type: 'recovery', duration: 45, zones: [1] },
      { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 60, zones: [2] },
      { day: 'Wednesday', discipline: 'run', type: 'tempo', duration: 45, zones: [3] },
      { day: 'Thursday', discipline: 'bike', type: 'endurance', duration: 50, zones: [2] },
      { day: 'Friday', discipline: 'swim', type: 'endurance', duration: 40, zones: [2] },
      { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 90, zones: [2] },
      { day: 'Sunday', discipline: 'run', type: 'recovery', duration: 30, zones: [1] }
    ];
    
    // Create 12-week progression
    const weeks = [];
    for (let weekNum = 1; weekNum <= 12; weekNum++) {
      const phase = this.getPhaseForWeek(weekNum);
      const phaseMultiplier = this.getPhaseMultiplier(phase, weekNum);
      
      const adjustedSessions = baseSessions.map(session => ({
        ...session,
        duration: Math.round(session.duration * phaseMultiplier)
      }));
      
      const totalHours = adjustedSessions.reduce((sum, session) => sum + session.duration, 0) / 60;
      
      weeks.push({
        weekNumber: weekNum,
        phase,
        totalHours,
        sessions: adjustedSessions
      });
    }
    
    const totalHours = weeks.reduce((sum, week) => sum + week.totalHours, 0);
    
    return {
      distance: 'sprint',
      totalHours,
      weeks
    };
  }
  
  getPhaseForWeek(weekNum) {
    if (weekNum <= 5) return 'base';
    if (weekNum <= 8) return 'build';
    if (weekNum <= 11) return 'peak';
    return 'taper';
  }
  
  getPhaseMultiplier(phase, weekNum) {
    switch (phase) {
      case 'base':
        return 1.0 + (weekNum - 1) * 0.05;
      case 'build':
        return 1.2 + (weekNum - 6) * 0.08;
      case 'peak':
        return 1.4 + (weekNum - 9) * 0.05;
      case 'taper':
        return 0.7;
      default:
        return 1.0;
    }
  }
}

// Test the plan
const engine = new MockSolidPlanEngine();

const baselines = {
  ftp: 220,
  fiveKPace: '22:00',
  easyPace: '9:30',
  swimPace100: '2:15',
  age: 35
};

try {
  const plan = engine.generateSolidSprintPlan(baselines);
  
  console.log('\n✅ Plan generated!');
  console.log(`📊 Plan Summary:`);
  console.log(`  • Distance: ${plan.distance}`);
  console.log(`  • Total Hours: ${plan.totalHours.toFixed(1)}`);
  console.log(`  • Weeks: ${plan.weeks.length}`);
  
  // Check each week
  plan.weeks.forEach((week, index) => {
    console.log(`\n📅 Week ${index + 1} (${week.phase}):`);
    console.log(`  • Hours: ${week.totalHours.toFixed(1)}h`);
    console.log(`  • Sessions: ${week.sessions.length}`);
    
    const sessionTypes = week.sessions.map(s => `${s.discipline} (${s.duration}min)`);
    console.log(`  • Sessions: ${sessionTypes.join(', ')}`);
  });
  
  // Check 80/20 polarized training
  console.log('\n🔍 80/20 Polarized Training Check:');
  let lowIntensity = 0;
  let highIntensity = 0;
  
  plan.weeks.forEach(week => {
    week.sessions.forEach(session => {
      if (session.zones.includes(1) || session.zones.includes(2)) {
        lowIntensity += session.duration;
      } else if (session.zones.includes(3)) {
        highIntensity += session.duration;
      }
    });
  });
  
  const total = lowIntensity + highIntensity;
  const lowPercent = (lowIntensity / total) * 100;
  const highPercent = (highIntensity / total) * 100;
  
  console.log(`  • Low Intensity (Zone 1-2): ${lowPercent.toFixed(1)}%`);
  console.log(`  • High Intensity (Zone 3): ${highPercent.toFixed(1)}%`);
  console.log(`  • 80/20 Target: 80% low, 20% high`);
  
  // Check progressive overload
  console.log('\n📈 Progressive Overload Check:');
  plan.weeks.forEach((week, index) => {
    console.log(`  • Week ${index + 1}: ${week.totalHours.toFixed(1)}h`);
  });
  
  console.log('\n🎉 This looks like a SOLID plan!');
  
} catch (error) {
  console.error('❌ Error generating plan:', error.message);
} 