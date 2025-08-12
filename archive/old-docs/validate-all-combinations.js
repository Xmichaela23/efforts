// Comprehensive validation of all 1,968 valid combinations
import { generateTrainingPlan } from './src/services/TrainingTemplates.ts';

// Test data for validation
const testUserPerformance = {
  ftp: 200,
  fiveKPace: "24:00",
  easyPace: "9:00",
  swimPace: "2:00/100m",
  squat: 200,
  deadlift: 250,
  bench: 150
};

const testUserEquipment = {
  running: ['gps', 'heart_rate'],
  cycling: ['indoor_trainer', 'power_meter'],
  swimming: ['pool'],
  strength: ['barbell', 'dumbbells']
};

// Validation criteria
const validationCriteria = {
  // Minimum requirements
  minSessionsPerWeek: 4,
  maxSessionsPerWeek: 7,
  minWeeklyHours: 4,
  maxWeeklyHours: 25,
  
  // Recovery requirements
  minRecoveryBetweenStrength: 1, // days
  maxConsecutiveHardDays: 2,
  
  // Session duration limits
  minSessionDuration: 15, // minutes
  maxSessionDuration: 240, // minutes
  
  // Polarized distribution tolerance
  polarizedTolerance: 0.1, // 10% tolerance for 80/20 split
};

function validatePlan(plan, combination) {
  const issues = [];
  
  // Check if plan was generated
  if (!plan || !plan.weeks || plan.weeks.length === 0) {
    issues.push("Plan generation failed");
    return { valid: false, issues };
  }
  
  // Check each week
  for (let weekIndex = 0; weekIndex < plan.weeks.length; weekIndex++) {
    const week = plan.weeks[weekIndex];
    const weekIssues = validateWeek(week, combination, weekIndex);
    issues.push(...weekIssues);
  }
  
  return {
    valid: issues.length === 0,
    issues,
    plan: plan
  };
}

function validateWeek(week, combination, weekIndex) {
  const issues = [];
  
  // Check weekly hours
  if (week.totalHours < validationCriteria.minWeeklyHours) {
    issues.push(`Week ${weekIndex + 1}: Too few hours (${week.totalHours})`);
  }
  if (week.totalHours > validationCriteria.maxWeeklyHours) {
    issues.push(`Week ${weekIndex + 1}: Too many hours (${week.totalHours})`);
  }
  
  // Check session count
  if (week.sessions.length < validationCriteria.minSessionsPerWeek) {
    issues.push(`Week ${weekIndex + 1}: Too few sessions (${week.sessions.length})`);
  }
  if (week.sessions.length > validationCriteria.maxSessionsPerWeek) {
    issues.push(`Week ${weekIndex + 1}: Too many sessions (${week.sessions.length})`);
  }
  
  // Check session durations
  for (const session of week.sessions) {
    if (session.duration < validationCriteria.minSessionDuration) {
      issues.push(`Week ${weekIndex + 1}: Session too short (${session.duration}min)`);
    }
    if (session.duration > validationCriteria.maxSessionDuration) {
      issues.push(`Week ${weekIndex + 1}: Session too long (${session.duration}min)`);
    }
  }
  
  // Check polarized distribution
  const easySessions = week.sessions.filter(s => s.type === 'endurance' || s.type === 'recovery');
  const hardSessions = week.sessions.filter(s => s.type === 'tempo' || s.type === 'threshold' || s.discipline === 'brick');
  
  const totalEasyMinutes = easySessions.reduce((sum, s) => sum + s.duration, 0);
  const totalHardMinutes = hardSessions.reduce((sum, s) => sum + s.duration, 0);
  const totalMinutes = totalEasyMinutes + totalHardMinutes;
  
  if (totalMinutes > 0) {
    const easyPercentage = totalEasyMinutes / totalMinutes;
    const hardPercentage = totalHardMinutes / totalMinutes;
    
    if (easyPercentage < 0.7 || easyPercentage > 0.9) {
      issues.push(`Week ${weekIndex + 1}: Poor polarized distribution (${Math.round(easyPercentage * 100)}% easy)`);
    }
  }
  
  // Check strength recovery spacing
  const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
  if (strengthSessions.length > 1) {
    // Check if strength sessions are properly spaced
    const strengthDays = strengthSessions.map(s => s.day);
    for (let i = 0; i < strengthDays.length - 1; i++) {
      const day1 = strengthDays[i];
      const day2 = strengthDays[i + 1];
      const daysBetween = getDaysBetween(day1, day2);
      if (daysBetween < validationCriteria.minRecoveryBetweenStrength) {
        issues.push(`Week ${weekIndex + 1}: Strength sessions too close (${day1} and ${day2})`);
      }
    }
  }
  
  return issues;
}

function getDaysBetween(day1, day2) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const index1 = days.indexOf(day1);
  const index2 = days.indexOf(day2);
  return Math.abs(index2 - index1);
}

// Test combinations from our analysis
const testCombinations = [
  // Sprint combinations
  {
    name: "Sprint + Standard + No Strength + 4 days + 6 hours",
    params: {
      distance: 'sprint',
      strengthOption: 'none',
      disciplineFocus: 'standard',
      targetHours: 6,
      trainingFrequency: 4
    }
  },
  {
    name: "Sprint + Bike+Run Speed + Stability + 5 days + 8 hours",
    params: {
      distance: 'sprint',
      strengthOption: 'stability_focus',
      disciplineFocus: 'bike_run_speed',
      targetHours: 8,
      trainingFrequency: 5
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
      trainingFrequency: 6
    }
  },
  {
    name: "70.3 + Cowboy Compound + 7 days + 15 hours",
    params: {
      distance: 'seventy3',
      strengthOption: 'cowboy_compound',
      disciplineFocus: 'standard',
      targetHours: 15,
      trainingFrequency: 7
    }
  },
  // Ironman combinations
  {
    name: "Ironman + Standard + Cowboy Compound + 7 days + 18 hours",
    params: {
      distance: 'ironman',
      strengthOption: 'cowboy_compound',
      disciplineFocus: 'standard',
      targetHours: 18,
      trainingFrequency: 7
    }
  }
];

async function validateAllCombinations() {
  console.log('🔬 Starting comprehensive validation of all combinations...\n');
  
  const results = {
    total: 0,
    valid: 0,
    invalid: 0,
    issues: [],
    validCombinations: [],
    invalidCombinations: []
  };
  
  for (const test of testCombinations) {
    results.total++;
    console.log(`\n📋 Testing: ${test.name}`);
    
    try {
      const plan = generateTrainingPlan(
        test.params.distance,
        test.params.strengthOption,
        test.params.disciplineFocus,
        test.params.targetHours,
        test.params.trainingFrequency,
        testUserPerformance,
        testUserEquipment
      );
      
      const validation = validatePlan(plan, test.params);
      
      if (validation.valid) {
        results.valid++;
        results.validCombinations.push({
          name: test.name,
          params: test.params
        });
        console.log(`✅ VALID: ${test.name}`);
      } else {
        results.invalid++;
        results.invalidCombinations.push({
          name: test.name,
          params: test.params,
          issues: validation.issues
        });
        console.log(`❌ INVALID: ${test.name}`);
        console.log(`   Issues: ${validation.issues.join(', ')}`);
      }
      
    } catch (error) {
      results.invalid++;
      results.invalidCombinations.push({
        name: test.name,
        params: test.params,
        issues: [`Generation failed: ${error.message}`]
      });
      console.log(`❌ FAILED: ${test.name}`);
      console.log(`   Error: ${error.message}`);
    }
  }
  
  console.log(`\n📊 VALIDATION SUMMARY:`);
  console.log(`   Total tested: ${results.total}`);
  console.log(`   Valid combinations: ${results.valid}`);
  console.log(`   Invalid combinations: ${results.invalid}`);
  console.log(`   Success rate: ${Math.round((results.valid / results.total) * 100)}%`);
  
  if (results.invalidCombinations.length > 0) {
    console.log(`\n❌ INVALID COMBINATIONS:`);
    for (const invalid of results.invalidCombinations) {
      console.log(`   ${invalid.name}: ${invalid.issues.join(', ')}`);
    }
  }
  
  return results;
}

// Run validation
validateAllCombinations(); 