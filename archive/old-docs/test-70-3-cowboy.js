// Test 70.3 Cowboy Plan Generation
import { SimpleTrainingService } from './src/services/SimpleTrainingService.ts';

async function test70_3CowboyPlan() {
  console.log('🧪 Testing 70.3 Cowboy Plan Generation...');
  
  const service = new SimpleTrainingService();
  
  // Test user baselines for 70.3
  const testBaselines = {
    ftp: 250, // Higher FTP for 70.3
    fiveKPace: '20:00', // Faster runner for 70.3
    easyPace: '8:30',
    swimPace100: '1:45', // Faster swimmer for 70.3
    squat1RM: 250, // Stronger for 70.3
    deadlift1RM: 300,
    bench1RM: 180,
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
    console.log('📋 Generating 70.3 Cowboy plan...');
    const plan = service.generateSeventy3Plan(
      'serious', // timeLevel - serious for 70.3
      'cowboy_compound', // strengthOption - full cowboy
      'Saturday', // longSessionDays
      testBaselines,
      testEquipment
    );
    
    console.log('✅ 70.3 Cowboy plan generated successfully!');
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
    
    // Check strength sessions
    console.log('\n🏋️ Strength Sessions Check:');
    plan.weeks.forEach((week, index) => {
      const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
      if (strengthSessions.length > 0) {
        console.log(`  • Week ${index + 1}: ${strengthSessions.length} strength sessions`);
        strengthSessions.forEach(session => {
          console.log(`    - ${session.strengthType} (${session.duration}min)`);
        });
      }
    });
    
    // Check progressive overload
    console.log('\n📈 Progressive Overload Check:');
    plan.weeks.forEach((week, index) => {
      console.log(`  • Week ${index + 1} (${week.phase}): ${week.totalHours.toFixed(1)}h`);
    });
    
    // Validate plan
    console.log('\n🔍 Validating plan...');
    const validation = service.validatePlan(plan, 'serious', 'cowboy_compound', 'Saturday');
    
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

test70_3CowboyPlan(); 