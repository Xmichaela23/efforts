// Template Analysis - Determine all valid combinations and required templates

const distances = ['sprint', 'olympic', 'seventy3', 'ironman'];
const focuses = ['standard', 'swim_speed', 'swim_endurance', 'bike_speed', 'bike_endurance', 'run_speed', 'run_endurance', 'bike_run_speed'];
const strengthOptions = ['none', 'stability_focus', 'power_development', 'compound_strength', 'cowboy_endurance', 'cowboy_compound'];
const trainingDays = [4, 5, 6, 7];
const weeklyHours = [6, 8, 10, 12, 15, 18];

// Distance constraints
const distanceConstraints = {
  sprint: {
    minDays: 4,
    maxDays: 7,
    minHours: 6,
    maxHours: 12
  },
  olympic: {
    minDays: 5,
    maxDays: 7,
    minHours: 8,
    maxHours: 15
  },
  seventy3: {
    minDays: 5,
    maxDays: 7,
    minHours: 10,
    maxHours: 18
  },
  ironman: {
    minDays: 6,
    maxDays: 7,
    minHours: 12,
    maxHours: 18
  }
};

// High-intensity combinations that require more hours
const highIntensityCombinations = [
  'bike_run_speed' // Requires additional hours when combined with strength
];

function isValidCombination(distance, focus, strength, days, hours) {
  const constraints = distanceConstraints[distance];
  
  // Check basic distance constraints
  if (days < constraints.minDays || days > constraints.maxDays) return false;
  if (hours < constraints.minHours || hours > constraints.maxHours) return false;
  
  // Check high-intensity combinations
  if (focus === 'bike_run_speed' && strength !== 'none') {
    if (distance === 'sprint' && hours < 8) return false;
    if (distance === 'olympic' && hours < 10) return false;
    if (distance === 'seventy3' && hours < 12) return false;
    if (distance === 'ironman' && hours < 15) return false;
  }
  
  // Check Cowboy Compound requirements
  if (strength === 'cowboy_compound') {
    if (distance === 'sprint' && hours < 10) return false;
    if (distance === 'olympic' && hours < 12) return false;
    if (distance === 'seventy3' && hours < 15) return false;
    if (distance === 'ironman' && hours < 18) return false;
  }
  
  return true;
}

function analyzeAllCombinations() {
  console.log('🔍 Analyzing all possible combinations...\n');
  
  let totalCombinations = 0;
  let validCombinations = 0;
  const validCombos = [];
  
  for (const distance of distances) {
    console.log(`\n📊 ${distance.toUpperCase()} DISTANCE:`);
    let distanceValid = 0;
    
    for (const focus of focuses) {
      for (const strength of strengthOptions) {
        for (const days of trainingDays) {
          for (const hours of weeklyHours) {
            totalCombinations++;
            
            if (isValidCombination(distance, focus, strength, days, hours)) {
              validCombinations++;
              distanceValid++;
              validCombos.push({
                distance,
                focus,
                strength,
                days,
                hours,
                key: `${distance}-${focus}-${strength}-${days}d-${hours}h`
              });
            }
          }
        }
      }
    }
    
    console.log(`   Valid combinations: ${distanceValid}`);
  }
  
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total possible combinations: ${totalCombinations}`);
  console.log(`   Valid combinations: ${validCombinations}`);
  console.log(`   Invalid combinations: ${totalCombinations - validCombinations}`);
  
  // Group by template type
  const templateGroups = {};
  
  for (const combo of validCombos) {
    const templateKey = `${combo.distance}-${combo.focus}-${combo.strength}`;
    if (!templateGroups[templateKey]) {
      templateGroups[templateKey] = {
        distance: combo.distance,
        focus: combo.focus,
        strength: combo.strength,
        validDays: [],
        validHours: []
      };
    }
    templateGroups[templateKey].validDays.push(combo.days);
    templateGroups[templateKey].validHours.push(combo.hours);
  }
  
  console.log(`\n🎯 UNIQUE TEMPLATES NEEDED: ${Object.keys(templateGroups).length}`);
  
  // Show template breakdown
  console.log('\n📋 TEMPLATE BREAKDOWN:');
  for (const [key, template] of Object.entries(templateGroups)) {
    const uniqueDays = [...new Set(template.validDays)].sort();
    const uniqueHours = [...new Set(template.validHours)].sort();
    console.log(`   ${key}: ${uniqueDays.length} day options, ${uniqueHours.length} hour options`);
  }
  
  return {
    totalCombinations,
    validCombinations,
    validCombos,
    templateGroups
  };
}

// Run the analysis
const analysis = analyzeAllCombinations(); 