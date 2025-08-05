// Test Sprint Plan Generation
const { SimpleTrainingService } = require('./src/services/SimpleTrainingService.ts');

async function testSprintPlan() {
  console.log('🧪 Testing Sprint Plan Generation...');
  
  const service = new SimpleTrainingService();
  
  // Test user baselines
  const testBaselines = {
    ftp: 220,
    fiveKPace: '22:00',
    easyPace: '9:30',
    swimPace100: '2:15',
    squat1RM: 200,
    deadlift1RM: 250,
    bench1RM: 150,
    age: 35
  };
  
  // Test equipment
  const testEquipment = {
    running: ['gps', 'heart_rate'],
    cycling: ['indoor_trainer', 'power_meter'],
    swimming: ['pool'],
    strength: ['gym', 'barbell', 'dumbbells', 'rack']
  };
  
  try {
    console.log('📋 Generating Sprint plan...');
    const plan = service.generateSprintPlan(
      'moderate', // timeLevel
      'traditional', // strengthOption
      'Saturday', // longSessionDays
      testBaselines,
      testEquipment
    );
    
    console.log('✅ Plan generated successfully!');
    console.log(`📊 Plan Summary:`);
    console.log(`  • Distance: ${plan.distance}`);
    console.log(`  • Time Level: ${plan.timeLevel}`);
    console.log(`  • Strength: ${plan.strengthOption}`);
    console.log(`  • Total Hours: ${plan.totalHours}`);
    console.log(`  • Weeks: ${plan.weeks.length}`);
    
    // Check first week
    const firstWeek = plan.weeks[0];
    console.log(`\n📅 Week 1 (${firstWeek.phase}):`);
    console.log(`  • Sessions: ${firstWeek.sessions.length}`);
    console.log(`  • Hours: ${firstWeek.totalHours}`);
    
    // Check progressive overload
    console.log('\n🏋️ Progressive Overload Check:');
    plan.weeks.forEach((week, index) => {
      const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
      if (strengthSessions.length > 0) {
        console.log(`  • Week ${index + 1}: ${strengthSessions.length} strength sessions`);
      }
    });
    
    // Validate plan
    console.log('\n🔍 Validating plan...');
    const validation = service.validatePlan(plan, 'moderate', 'traditional', 'Saturday');
    
    if (validation.isValid) {
      console.log('✅ Plan validation passed!');
    } else {
      console.log('❌ Plan validation failed:');
      validation.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
  } catch (error) {
    console.error('❌ Error generating plan:', error.message);
    console.error(error.stack);
  }
}

testSprintPlan(); 