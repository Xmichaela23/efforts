// Real JSON Engine Test
// This tests the actual SimpleTrainingService and TrainingRulesEngine

import { SimpleTrainingService } from './src/services/SimpleTrainingService.ts';

class RealJSONEngineTest {
  constructor() {
    this.testBaselines = {
      performanceNumbers: {
        ftp: 220,
        fiveK: '24:00',
        easyPace: '10:30',
        swimPace100: '2:10',
        squat: 115,
        deadlift: 160,
        bench: 160
      },
      age: 56,
      trainingPhilosophy: 'polarized'
    };
  }

  async testRealJSONEngine() {
    console.log('🧪 Testing REAL JSON Engine...');
    
    const trainingService = new SimpleTrainingService();
    
    const timeLevels = ['minimum', 'moderate', 'serious'];
    const strengthOptions = ['none', 'traditional', 'compound', 'cowboy_endurance', 'cowboy_compound'];
    const longSessionDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      failures: []
    };

    for (const timeLevel of timeLevels) {
      for (const strengthOption of strengthOptions) {
        for (const longSessionDay of longSessionDays) {
          results.total++;
          
          try {
            console.log(`🔍 Testing: ${timeLevel} + ${strengthOption} + ${longSessionDay}`);
            
            const plan = await trainingService.generateSprintPlan(
              timeLevel,
              strengthOption,
              longSessionDay,
              this.testBaselines
            );
            
            const validation = this.validateRealPlan(plan, timeLevel, strengthOption, longSessionDay);
            
            if (validation.isValid) {
              results.passed++;
              console.log(`✅ PASSED: ${timeLevel} + ${strengthOption} + ${longSessionDay}`);
            } else {
              results.failed++;
              results.failures.push({
                combination: `${timeLevel} + ${strengthOption} + ${longSessionDay}`,
                issues: validation.issues
              });
              console.log(`❌ FAILED: ${timeLevel} + ${strengthOption} + ${longSessionDay}`);
              console.log(`   Issues: ${validation.issues.join(', ')}`);
            }
          } catch (error) {
            results.failed++;
            results.failures.push({
              combination: `${timeLevel} + ${strengthOption} + ${longSessionDay}`,
              issues: [`Error: ${error.message}`]
            });
            console.log(`❌ ERROR: ${timeLevel} + ${strengthOption} + ${longSessionDay} - ${error.message}`);
          }
        }
      }
    }

    return results;
  }

  validateRealPlan(plan, timeLevel, strengthOption, longSessionDay) {
    const issues = [];
    
    // Basic validation
    if (!plan) {
      issues.push('No plan generated');
      return { isValid: false, issues };
    }
    
    if (!plan.weeks || plan.weeks.length !== 12) {
      issues.push(`Plan should be 12 weeks long, got ${plan.weeks?.length || 0}`);
    }
    
    if (!plan.totalHours || plan.totalHours < 3 || plan.totalHours > 15) {
      issues.push(`Total hours (${plan.totalHours}) outside reasonable range (3-15)`);
    }
    
    // Check that plan has sessions
    if (!plan.weeks || plan.weeks.length === 0) {
      issues.push('No weeks in plan');
      return { isValid: false, issues };
    }
    
    const firstWeek = plan.weeks[0];
    if (!firstWeek.sessions || firstWeek.sessions.length === 0) {
      issues.push('No sessions in first week');
      return { isValid: false, issues };
    }
    
    // Check polarized distribution using actual session data
    const allSessions = plan.weeks.flatMap(week => week.sessions);
    const lowIntensity = allSessions.filter(s => 
      s.type === 'recovery' || s.type === 'endurance' || 
      (s.zones && s.zones.some(zone => zone <= 2))
    ).length;
    const highIntensity = allSessions.filter(s => 
      s.type === 'tempo' || s.type === 'threshold' || 
      (s.zones && s.zones.some(zone => zone >= 3))
    ).length;
    const total = allSessions.length;
    
    if (total > 0) {
      const lowPercentage = (lowIntensity / total) * 100;
      const highPercentage = (highIntensity / total) * 100;
      
      console.log(`📊 Session distribution: ${lowIntensity}/${total} low (${lowPercentage.toFixed(1)}%), ${highIntensity}/${total} high (${highPercentage.toFixed(1)}%)`);
      
      // More flexible validation for real engine
      if (lowPercentage < 60 || lowPercentage > 90) {
        issues.push(`Low intensity percentage (${lowPercentage.toFixed(1)}%) outside reasonable range (60-90%)`);
      }
      
      if (highPercentage < 10 || highPercentage > 40) {
        issues.push(`High intensity percentage (${highPercentage.toFixed(1)}%) outside reasonable range (10-40%)`);
      }
    }
    
    // Check that sessions have proper structure
    const invalidSessions = allSessions.filter(s => 
      !s.discipline || !s.type || !s.duration || s.duration <= 0
    );
    
    if (invalidSessions.length > 0) {
      issues.push(`${invalidSessions.length} sessions have invalid structure`);
    }
    
    // Check that strength sessions are present when requested
    if (strengthOption !== 'none') {
      const strengthSessions = allSessions.filter(s => s.discipline === 'strength');
      const expectedStrengthSessions = strengthOption.includes('cowboy') ? 3 : 2;
      
      if (strengthSessions.length < expectedStrengthSessions) {
        issues.push(`Expected ${expectedStrengthSessions} strength sessions, got ${strengthSessions.length}`);
      }
    }
    
    // Check that brick session is on the specified day
    const brickSessions = allSessions.filter(s => s.discipline === 'brick');
    if (brickSessions.length === 0) {
      issues.push('No brick sessions found');
    } else {
      const brickOnCorrectDay = brickSessions.some(s => 
        s.day && s.day.toLowerCase() === longSessionDay.toLowerCase()
      );
      if (!brickOnCorrectDay) {
        issues.push(`Brick session not on specified day (${longSessionDay})`);
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  async runRealTests() {
    console.log('🚀 Starting REAL JSON Engine tests...');
    console.log('🔍 Testing actual SimpleTrainingService and TrainingRulesEngine');
    
    try {
      const results = await this.testRealJSONEngine();
      
      console.log('\n📊 REAL JSON ENGINE TEST RESULTS:');
      console.log(`Total combinations tested: ${results.total}`);
      console.log(`Passed: ${results.passed}`);
      console.log(`Failed: ${results.failed}`);
      console.log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
      
      if (results.failures.length > 0) {
        console.log('\n❌ FAILURES:');
        results.failures.slice(0, 5).forEach(failure => {
          console.log(`  ${failure.combination}:`);
          failure.issues.forEach(issue => console.log(`    - ${issue}`));
        });
        if (results.failures.length > 5) {
          console.log(`  ... and ${results.failures.length - 5} more failures`);
        }
      }
      
      console.log('\n✅ REAL JSON Engine testing complete!');
      return results;
      
    } catch (error) {
      console.error('❌ Error running real JSON engine tests:', error);
      throw error;
    }
  }
}

// Run the real tests
async function runRealJSONEngineTests() {
  const tester = new RealJSONEngineTest();
  await tester.runRealTests();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRealJSONEngineTests().catch(console.error);
} 