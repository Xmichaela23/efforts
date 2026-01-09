/**
 * Test script to validate exercise configuration
 * Verifies that all exercises used in strength-overlay have matching configs
 */

// Copy of exercise config for testing (simplified)
const EXERCISE_CONFIG = {
  // Knee dominant
  'bulgarian split squat': { primaryRef: 'squat', ratio: 0.60 },
  'walking lunge': { primaryRef: 'squat', ratio: 0.55 },
  'walking lunges': { primaryRef: 'squat', ratio: 0.55 },
  'reverse lunge': { primaryRef: 'squat', ratio: 0.55 },
  'reverse lunges': { primaryRef: 'squat', ratio: 0.55 },
  'lateral lunge': { primaryRef: 'squat', ratio: 0.45 },
  'lateral lunges': { primaryRef: 'squat', ratio: 0.45 },
  'goblet squat': { primaryRef: 'squat', ratio: 0.45 },
  'step up': { primaryRef: 'squat', ratio: 0.40 },
  'step ups': { primaryRef: 'squat', ratio: 0.40 },
  'step-ups': { primaryRef: 'squat', ratio: 0.40 },
  'box step-up': { primaryRef: 'squat', ratio: 0.40 },
  'box step-ups': { primaryRef: 'squat', ratio: 0.40 },
  
  // Hip dominant
  'hip thrust': { primaryRef: 'deadlift', ratio: 0.90 },
  'hip thrusts': { primaryRef: 'deadlift', ratio: 0.90 },
  'romanian deadlift': { primaryRef: 'deadlift', ratio: 0.75 },
  'rdl': { primaryRef: 'deadlift', ratio: 0.75 },
  'single leg rdl': { primaryRef: 'deadlift', ratio: 0.35 },
  'glute bridge': { primaryRef: 'deadlift', ratio: 0.40 },
  'glute bridges': { primaryRef: 'deadlift', ratio: 0.40 },
  'single leg glute bridge': { primaryRef: null, ratio: 0.0 },
  'single leg glute bridges': { primaryRef: null, ratio: 0.0 },
  
  // Upper push
  'bench press': { primaryRef: 'bench', ratio: 1.0 },
  'dumbbell bench press': { primaryRef: 'bench', ratio: 0.80 },
  'db bench press': { primaryRef: 'bench', ratio: 0.80 },
  'dumbbell shoulder press': { primaryRef: 'overhead', ratio: 0.70 },
  'db shoulder press': { primaryRef: 'overhead', ratio: 0.70 },
  'shoulder press': { primaryRef: 'overhead', ratio: 1.0 },
  
  // Upper pull
  'barbell row': { primaryRef: 'bench', ratio: 0.85 },
  'barbell rows': { primaryRef: 'bench', ratio: 0.85 },
  'dumbbell row': { primaryRef: 'bench', ratio: 0.45 },
  'dumbbell rows': { primaryRef: 'bench', ratio: 0.45 },
  'rows': { primaryRef: 'bench', ratio: 0.85 }, // Alias
  
  // Swings
  'kettlebell swing': { primaryRef: 'deadlift', ratio: 0.25 },
  'kettlebell swings': { primaryRef: 'deadlift', ratio: 0.25 },
  'kb/db swings': { primaryRef: 'deadlift', ratio: 0.25 },
  'kb swings': { primaryRef: 'deadlift', ratio: 0.25 },
  'db swings': { primaryRef: 'deadlift', ratio: 0.25 },
  
  // Bodyweight (ratio 0)
  'push-up': { primaryRef: null, ratio: 0.0 },
  'push-ups': { primaryRef: null, ratio: 0.0 },
  'pull-up': { primaryRef: null, ratio: 0.0 },
  'pull-ups': { primaryRef: null, ratio: 0.0 },
  'inverted row': { primaryRef: null, ratio: 0.0 },
  'inverted rows': { primaryRef: null, ratio: 0.0 },
  'pike push-up': { primaryRef: null, ratio: 0.0 },
  'pike push-ups': { primaryRef: null, ratio: 0.0 },
  'box jump': { primaryRef: null, ratio: 0.0 },
  'box jumps': { primaryRef: null, ratio: 0.0 },
  'jump squat': { primaryRef: null, ratio: 0.0 },
  'jump squats': { primaryRef: null, ratio: 0.0 },
  'squat jump': { primaryRef: null, ratio: 0.0 },
  'squat jumps': { primaryRef: null, ratio: 0.0 },
  'skater hop': { primaryRef: null, ratio: 0.0 },
  'skater hops': { primaryRef: null, ratio: 0.0 },
  'jump lunge': { primaryRef: null, ratio: 0.0 },
  'jump lunges': { primaryRef: null, ratio: 0.0 },
  'bodyweight squat': { primaryRef: null, ratio: 0.0 },
  'bodyweight squats': { primaryRef: null, ratio: 0.0 },
  'calf raise': { primaryRef: null, ratio: 0.0 },
  'calf raises': { primaryRef: null, ratio: 0.0 },
  
  // Band/Core
  'face pull': { primaryRef: null, ratio: 0.0 },
  'face pulls': { primaryRef: null, ratio: 0.0 },
  'clamshell': { primaryRef: null, ratio: 0.0 },
  'clamshells': { primaryRef: null, ratio: 0.0 },
  'lateral band walk': { primaryRef: null, ratio: 0.0 },
  'lateral band walks': { primaryRef: null, ratio: 0.0 },
  'core circuit': { primaryRef: null, ratio: 0.0 },
};

// Exercises used in strength-overlay.ts
const OVERLAY_EXERCISES = [
  'Hip Thrusts',
  'Romanian Deadlift',
  'Goblet Squat',
  'Box Jumps',
  'Walking Lunges',
  'KB/DB Swings',
  'Jump Squats',
  'Single Leg RDL',
  'Box Step-ups',
  'Glute Bridges',
  'Squat Jumps',
  'Box Jumps or Broad Jumps', // Compound - will fuzzy match
  'Single Leg Glute Bridge',
  'Skater Hops',
  'Jump Lunges',
  'Step-ups',
  'Core Circuit',
  'Bench Press',
  'Barbell Rows',
  'Pull-ups or Lat Pulldown', // Compound
  'Face Pulls',
  'DB Shoulder Press',
  'Weighted Pull-ups or Heavy Pulldown', // Compound
  'Shoulder Press',
  'Rows',
  'Push-ups',
  'Inverted Rows',
  'Pike Push-ups',
  'Negative Pull-ups or Band Assist', // Compound
  'Pull-ups',
  'Bulgarian Split Squat',
  'Lateral Lunges',
  'Clamshells',
  'Calf Raises',
  'Lateral Band Walks',
  'Bodyweight Squats',
  'Walking Lunges',
  'Reverse Lunges',
];

function getExerciseConfig(exerciseName) {
  const normalized = exerciseName.toLowerCase().trim();
  
  // Exact match first
  if (EXERCISE_CONFIG[normalized]) {
    return { ...EXERCISE_CONFIG[normalized], matchType: 'exact' };
  }
  
  // Fuzzy match: check if exercise name contains any key
  for (const [key, config] of Object.entries(EXERCISE_CONFIG)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...config, matchType: 'fuzzy', matchedKey: key };
    }
  }
  
  return null;
}

// Test
console.log('='.repeat(70));
console.log('EXERCISE CONFIG VALIDATION');
console.log('='.repeat(70));
console.log('');

let matched = 0;
let unmatched = 0;
const unmatchedList = [];

for (const exercise of [...new Set(OVERLAY_EXERCISES)]) {
  const config = getExerciseConfig(exercise);
  
  if (config) {
    matched++;
    console.log(`✅ ${exercise}`);
    console.log(`   → ${config.matchType === 'exact' ? 'Exact' : `Fuzzy (${config.matchedKey})`}`);
    if (config.primaryRef) {
      console.log(`   → ${config.primaryRef} × ${config.ratio}`);
    } else {
      console.log(`   → Bodyweight/Band`);
    }
  } else {
    unmatched++;
    unmatchedList.push(exercise);
    console.log(`❌ ${exercise} - NO MATCH`);
  }
  console.log('');
}

console.log('='.repeat(70));
console.log(`SUMMARY: ${matched} matched, ${unmatched} unmatched`);
console.log('='.repeat(70));

if (unmatchedList.length > 0) {
  console.log('\n⚠️  UNMATCHED EXERCISES:');
  unmatchedList.forEach(e => console.log(`  - ${e}`));
  console.log('\nThese need to be added to exercise-config.ts');
  process.exit(1);
}

console.log('\n✅ All exercises have matching configs!');

// Test weight calculation
console.log('\n');
console.log('='.repeat(70));
console.log('WEIGHT CALCULATION TEST');
console.log('='.repeat(70));
console.log('');

const testBaselines = {
  squat: 225,
  deadlift: 275,
  bench: 185,
  overhead: 115
};

console.log('Baselines:', testBaselines);
console.log('');

const testExercises = [
  { name: 'Hip Thrusts', targetPercent: 0.75 },
  { name: 'Romanian Deadlift', targetPercent: 0.70 },
  { name: 'Bulgarian Split Squat', targetPercent: 0.60 },
  { name: 'Bench Press', targetPercent: 0.70 },
  { name: 'Barbell Rows', targetPercent: 0.70 },
  { name: 'KB/DB Swings', targetPercent: 0.25 },
  { name: 'DB Shoulder Press', targetPercent: 0.70 },
];

for (const { name, targetPercent } of testExercises) {
  const config = getExerciseConfig(name);
  if (!config || !config.primaryRef) {
    console.log(`${name}: Bodyweight`);
    continue;
  }
  
  const base1RM = testBaselines[config.primaryRef];
  const inferred1RM = base1RM * config.ratio;
  const prescribedWeight = Math.round(inferred1RM * targetPercent / 5) * 5;
  
  console.log(`${name} @ ${targetPercent * 100}% 1RM:`);
  console.log(`  Base ${config.primaryRef}: ${base1RM} lb`);
  console.log(`  Inferred 1RM: ${base1RM} × ${config.ratio} = ${Math.round(inferred1RM)} lb`);
  console.log(`  Prescribed: ${Math.round(inferred1RM)} × ${targetPercent} = ${prescribedWeight} lb`);
  console.log('');
}
