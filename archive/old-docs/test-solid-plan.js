// Test One Solid Sprint Plan
import { SimpleTrainingService } from './src/services/SimpleTrainingService.ts';

function testSolidPlan() {
  console.log('🎯 Testing One Solid Sprint Plan...\n');
  
  const service = new SimpleTrainingService();
  
  // Simple, realistic baselines
  const baselines = {
    ftp: 220,
    fiveKPace: '22:00',
    easyPace: '9:30',
    swimPace100: '2:15',
    age: 35
  };
  
  try {
    console.log('📋 Generating solid Sprint plan...');
    const plan = service.generateSprintPlan(
      'moderate', // 6 hours/week
      'none',     // No strength - pure triathlon
      'Saturday', // Long session day
      baselines
    );
    
    console.log('✅ Plan generated!');
    console.log(`📊 Plan Summary:`);
    console.log(`  • Distance: ${plan.distance}`);
    console.log(`  • Total Hours: ${plan.totalHours}`);
    console.log(`  • Weeks: ${plan.weeks.length}`);
    
    // Check each week
    plan.weeks.forEach((week, index) => {
      console.log(`\n📅 Week ${index + 1} (${week.phase}):`);
      console.log(`  • Hours: ${week.totalHours.toFixed(1)}h`);
      console.log(`  • Sessions: ${week.sessions.length}`);
      
      // Show session types
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
        } else if (session.zones.includes(3) || session.zones.includes(4) || session.zones.includes(5)) {
          highIntensity += session.duration;
        }
      });
    });
    
    const total = lowIntensity + highIntensity;
    const lowPercent = (lowIntensity / total) * 100;
    const highPercent = (highIntensity / total) * 100;
    
    console.log(`  • Low Intensity (Zone 1-2): ${lowPercent.toFixed(1)}%`);
    console.log(`  • High Intensity (Zone 3-5): ${highPercent.toFixed(1)}%`);
    console.log(`  • 80/20 Target: 80% low, 20% high`);
    
    // Check progressive overload
    console.log('\n📈 Progressive Overload Check:');
    plan.weeks.forEach((week, index) => {
      console.log(`  • Week ${index + 1}: ${week.totalHours.toFixed(1)}h`);
    });
    
    // Validate the plan
    console.log('\n🔍 Validating plan...');
    const validation = service.validatePlan(plan, 'moderate', 'none', 'Saturday');
    
    if (validation.isValid) {
      console.log('✅ Plan validation passed!');
      console.log('🎉 This is a SOLID plan!');
    } else {
      console.log('❌ Plan validation failed:');
      validation.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
  } catch (error) {
    console.error('❌ Error generating plan:', error.message);
  }
}

testSolidPlan(); 