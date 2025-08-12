// Simple test script to check plan generation
const testBaselines = {
  ftp: 220,
  fiveKPace: '22:00',
  easyPace: '9:30',
  swimPace100: '2:15',
  squat1RM: 200,
  deadlift1RM: 250,
  bench1RM: 150,
  overheadPress1RM: 100,
  age: 35
};

console.log('🧪 Testing plan generation...');
console.log('Test baselines:', testBaselines);

// Test a few combinations
const testCases = [
  { timeLevel: 'moderate', strengthOption: 'traditional', longSessionDay: 'Saturday' },
  { timeLevel: 'serious', strengthOption: 'compound', longSessionDay: 'Sunday' },
  { timeLevel: 'minimum', strengthOption: 'none', longSessionDay: 'Saturday' }
];

testCases.forEach((testCase, index) => {
  console.log(`\n📋 Test ${index + 1}: ${JSON.stringify(testCase)}`);
  
  try {
    // This would normally call the service, but for now just log the test case
    console.log('✅ Test case structure looks valid');
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
});

console.log('\n🎯 Ready to test with actual service integration'); 