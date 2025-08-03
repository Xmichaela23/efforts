// Simple test for TrainingTemplates
import { 
  generateTrainingPlan, 
  calculateIntensityZones,
  STRENGTH_OPTIONS,
  DISCIPLINE_FOCUS_OPTIONS 
} from './TrainingTemplates';

// Test data
const testUserPerformance = {
  ftp: 220,
  fiveKPace: '24:00',
  swimPace: '2:10/100m'
};

// Test the intensity zone calculations
console.log('🧮 Testing intensity zone calculations...');
const zones = calculateIntensityZones(
  testUserPerformance.ftp,
  testUserPerformance.fiveKPace,
  testUserPerformance.swimPace
);

console.log('✅ Bike zones:', zones.bike);
console.log('✅ Run zones:', zones.run);
console.log('✅ Swim zones:', zones.swim);

// Test the strength options
console.log('🧮 Testing strength options...');
console.log('✅ Available strength options:', STRENGTH_OPTIONS.map(opt => opt.name));

// Test the discipline focus options
console.log('🧮 Testing discipline focus options...');
console.log('✅ Available discipline focus options:', DISCIPLINE_FOCUS_OPTIONS.map(opt => opt.name));

// Test plan generation
console.log('🧮 Testing plan generation...');
try {
  const plan = generateTrainingPlan(
    'olympic',
    'power_development',
    'standard',
    10,
    testUserPerformance
  );
  
  console.log('✅ Plan generated successfully!');
  console.log('✅ Plan distance:', plan.distance);
  console.log('✅ Plan base hours:', plan.baseHours);
  console.log('✅ Plan weeks:', plan.weeks.length);
  
} catch (error) {
  console.error('❌ Plan generation failed:', error.message);
}

console.log('🧮 Algorithm-based training system test completed!'); 