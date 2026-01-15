#!/usr/bin/env node
/**
 * Test script for marathon long run progression algorithm
 * Validates the performance-build generator produces correct progressions
 * 
 * Run: node scripts/test-marathon-progressions.mjs
 */

// ============================================================================
// DURATION REQUIREMENTS (copied from types.ts)
// ============================================================================

const MARATHON_DURATION_REQUIREMENTS = {
  16: { minWeeklyMiles: 0, peakLongRun: 20, taperWeeks: 3, startingLongRun: 10 },
  15: { minWeeklyMiles: 0, peakLongRun: 20, taperWeeks: 3, startingLongRun: 10 },
  14: { minWeeklyMiles: 15, peakLongRun: 20, taperWeeks: 3, startingLongRun: 10 },
  13: { minWeeklyMiles: 15, peakLongRun: 20, taperWeeks: 3, startingLongRun: 10 },
  12: { minWeeklyMiles: 20, peakLongRun: 20, taperWeeks: 3, startingLongRun: 12 },
  11: { minWeeklyMiles: 25, peakLongRun: 18, taperWeeks: 2, startingLongRun: 12 },
  10: { minWeeklyMiles: 25, peakLongRun: 18, taperWeeks: 2, startingLongRun: 12 }
};

function getMarathonDurationRequirements(weeks) {
  if (MARATHON_DURATION_REQUIREMENTS[weeks]) {
    return MARATHON_DURATION_REQUIREMENTS[weeks];
  }
  if (weeks > 16) return MARATHON_DURATION_REQUIREMENTS[16];
  if (weeks < 10) return MARATHON_DURATION_REQUIREMENTS[10];
  return MARATHON_DURATION_REQUIREMENTS[12];
}

// ============================================================================
// PROGRESSION ALGORITHM (copied from performance-build.ts)
// ============================================================================

function calculatePeakWeek(planWeeks, _taperWeeks) {
  if (planWeeks <= 10) return 6;
  if (planWeeks <= 11) return 6;
  if (planWeeks <= 12) return 8;
  if (planWeeks <= 13) return 9;
  if (planWeeks <= 14) return 10;
  if (planWeeks <= 15) return 11;
  return 12;
}

function calculateStartingLongRun(defaultStart, currentMiles) {
  if (!currentMiles) return defaultStart;
  
  let maxStart;
  if (currentMiles < 20) maxStart = 8;
  else if (currentMiles < 25) maxStart = 10;
  else if (currentMiles < 30) maxStart = 12;
  else maxStart = 12;
  
  return Math.min(defaultStart, maxStart);
}

function getTaperMiles(weeksFromRace, totalTaperWeeks, peakMiles) {
  if (weeksFromRace === 1) return 8;
  
  if (totalTaperWeeks >= 3) {
    if (weeksFromRace === 2) return 10;
    if (weeksFromRace === 3) return 14;
  } else {
    if (weeksFromRace === 2) return 10;
  }
  
  return Math.round(peakMiles * 0.6);
}

function getRecoveryWeekMiles(week, startMiles) {
  return Math.min(12, startMiles - 2 + Math.floor(week / 8) * 2);
}

function calculateBuildUpMiles(currentWeek, peakWeek, peakMiles, startMiles, previousMiles) {
  const buildWeeks = peakWeek - 1;
  const recoveryWeeksInBuild = Math.floor(buildWeeks / 4);
  const effectiveBuildWeeks = buildWeeks - recoveryWeeksInBuild;
  
  const recoveryWeeksPassed = Math.floor((currentWeek - 1) / 4);
  const effectiveWeek = currentWeek - recoveryWeeksPassed;
  
  const milesNeeded = peakMiles - 2 - startMiles;
  const progressRatio = Math.min(1, (effectiveWeek - 1) / Math.max(1, effectiveBuildWeeks - 1));
  let targetMiles = startMiles + milesNeeded * progressRatio;
  
  const minMiles = previousMiles > 0 ? previousMiles + 1 : startMiles;
  const maxMiles = previousMiles > 0 ? previousMiles + 2 : startMiles + 2;
  
  targetMiles = Math.round(targetMiles);
  targetMiles = Math.max(minMiles, Math.min(maxMiles, targetMiles));
  targetMiles = Math.min(targetMiles, peakMiles - 2);
  
  return targetMiles;
}

function calculateLongRunProgression(planWeeks, currentWeeklyMiles = 25) {
  const durationReqs = getMarathonDurationRequirements(planWeeks);
  
  const peakMiles = durationReqs.peakLongRun;
  const taperWeeks = durationReqs.taperWeeks;
  const startMiles = calculateStartingLongRun(durationReqs.startingLongRun, currentWeeklyMiles);
  
  const peakWeek = calculatePeakWeek(planWeeks, taperWeeks);
  
  // Two-pass algorithm matching performance-build.ts
  const progression = new Array(planWeeks).fill(0);
  const weekTypes = new Array(planWeeks).fill('build');
  
  // Pass 1: Mark special weeks
  for (let week = 1; week <= planWeeks; week++) {
    const weeksFromRace = planWeeks - week + 1;
    const idx = week - 1;
    
    // Taper weeks
    if (weeksFromRace <= taperWeeks) {
      progression[idx] = getTaperMiles(weeksFromRace, taperWeeks, peakMiles);
      weekTypes[idx] = weeksFromRace === 1 ? 'race' : 'taper';
    }
    // Peak week
    else if (week === peakWeek) {
      progression[idx] = peakMiles;
      weekTypes[idx] = 'PEAK';
    }
    // Week before peak - must be peakMiles - 2 for smooth transition
    else if (week === peakWeek - 1) {
      progression[idx] = peakMiles - 2;
      weekTypes[idx] = 'pre-peak';
    }
    // Post-peak weeks (between peak and taper) - declining volume
    else if (week > peakWeek && weeksFromRace > taperWeeks) {
      const weeksAfterPeak = week - peakWeek;
      // Determine first taper week's mileage
      const firstTaperMiles = getTaperMiles(taperWeeks, taperWeeks, peakMiles);
      // Post-peak should bridge from peak to taper smoothly
      const postPeakStart = peakMiles - 4;
      const postPeakEnd = firstTaperMiles + 2;
      const postPeakWeeks = planWeeks - peakWeek - taperWeeks;
      
      if (postPeakWeeks <= 1) {
        progression[idx] = postPeakStart;
      } else {
        const step = (postPeakStart - postPeakEnd) / (postPeakWeeks - 1);
        progression[idx] = Math.round(postPeakStart - step * (weeksAfterPeak - 1));
      }
      weekTypes[idx] = 'post-peak';
    }
    // Recovery weeks (every 4th week, but not too close to peak)
    else if (week % 4 === 0 && week < peakWeek - 2) {
      progression[idx] = getRecoveryWeekMiles(week, startMiles);
      weekTypes[idx] = 'recovery';
    }
  }
  
  // Pass 2: Fill in build weeks with smooth progression
  // Build weeks cap at peakMiles - 3, only pre-peak gets peakMiles - 2
  let lastBuildMiles = startMiles - 1;
  const buildCap = peakMiles - 3; // e.g., 17 for 20mi peak
  
  for (let week = 1; week <= planWeeks; week++) {
    const idx = week - 1;
    
    // Skip already-filled weeks
    if (progression[idx] > 0) {
      if (weekTypes[idx] !== 'recovery') {
        lastBuildMiles = progression[idx];
      }
      continue;
    }
    
    // Calculate target for this build week
    const milesNeeded = buildCap - lastBuildMiles;
    
    // How many build weeks remain? (excluding recovery and pre-peak)
    let buildWeeksRemaining = 0;
    for (let w = week; w < peakWeek - 1; w++) {
      if (weekTypes[w - 1] !== 'recovery' && weekTypes[w - 1] !== 'pre-peak') {
        buildWeeksRemaining++;
      }
    }
    
    let targetMiles;
    if (buildWeeksRemaining <= 0) {
      targetMiles = buildCap;
    } else {
      const idealIncrement = milesNeeded / buildWeeksRemaining;
      const increment = Math.max(1, Math.min(2, Math.ceil(idealIncrement)));
      targetMiles = lastBuildMiles + increment;
    }
    
    // Ensure we don't exceed build cap
    targetMiles = Math.min(targetMiles, buildCap);
    
    // Ensure we don't repeat same distance
    if (targetMiles === lastBuildMiles) {
      targetMiles = Math.min(buildCap, lastBuildMiles + 1);
    }
    
    progression[idx] = targetMiles;
    weekTypes[idx] = 'build';
    lastBuildMiles = targetMiles;
  }
  
  // Convert to result format
  const result = [];
  for (let week = 1; week <= planWeeks; week++) {
    const idx = week - 1;
    result.push({
      week,
      miles: progression[idx],
      type: weekTypes[idx],
      weeksFromRace: planWeeks - week + 1
    });
  }
  
  return { progression: result, peakWeek, peakMiles, startMiles, taperWeeks };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function validateProgression(planWeeks, currentMiles = 25) {
  const result = calculateLongRunProgression(planWeeks, currentMiles);
  const { progression, peakWeek, peakMiles, startMiles, taperWeeks } = result;
  
  const errors = [];
  const warnings = [];
  
  // Check 1: No repeated distances (except recovery weeks)
  for (let i = 1; i < progression.length; i++) {
    const prev = progression[i - 1];
    const curr = progression[i];
    
    if (curr.miles === prev.miles && curr.type !== 'recovery' && prev.type !== 'recovery' && curr.type !== 'taper' && prev.type !== 'PEAK') {
      errors.push(`Week ${curr.week}: Repeated distance ${curr.miles}mi (same as Week ${prev.week})`);
    }
  }
  
  // Check 2: Peak timing is 4-5 weeks before race
  const peakEntry = progression.find(p => p.type === 'PEAK');
  if (peakEntry) {
    if (peakEntry.weeksFromRace < 4) {
      errors.push(`Peak at Week ${peakEntry.week} is only ${peakEntry.weeksFromRace} weeks out (should be 4-5)`);
    } else if (peakEntry.weeksFromRace > 6) {
      warnings.push(`Peak at Week ${peakEntry.week} is ${peakEntry.weeksFromRace} weeks out (a bit early)`);
    }
  }
  
  // Check 3: Max increase is 2-3 miles/week (except post-recovery)
  for (let i = 1; i < progression.length; i++) {
    const prev = progression[i - 1];
    const curr = progression[i];
    const increase = curr.miles - prev.miles;
    
    // Skip if coming out of recovery or into taper
    if (prev.type === 'recovery' || curr.type === 'taper' || curr.type === 'recovery') continue;
    
    if (increase > 3) {
      errors.push(`Week ${curr.week}: Increase of ${increase}mi from ${prev.miles}→${curr.miles} exceeds 3mi max`);
    }
  }
  
  // Check 4: Recovery weeks are ~70-80% of previous week
  for (const entry of progression) {
    if (entry.type === 'recovery' && entry.week > 1) {
      const prevWeek = progression[entry.week - 2]; // -2 because array is 0-indexed
      if (prevWeek) {
        const ratio = entry.miles / prevWeek.miles;
        if (ratio > 0.85) {
          warnings.push(`Week ${entry.week} recovery (${entry.miles}mi) is ${Math.round(ratio * 100)}% of previous (should be 70-80%)`);
        }
      }
    }
  }
  
  // Check 5: Taper weeks decrease properly
  const taperEntries = progression.filter(p => p.type === 'taper' || p.type === 'race');
  for (let i = 1; i < taperEntries.length; i++) {
    if (taperEntries[i].miles >= taperEntries[i - 1].miles) {
      errors.push(`Taper not decreasing: Week ${taperEntries[i - 1].week} (${taperEntries[i - 1].miles}mi) → Week ${taperEntries[i].week} (${taperEntries[i].miles}mi)`);
    }
  }
  
  // Check 6: Starting volume matches baseline
  if (currentMiles < 25 && startMiles > 10) {
    warnings.push(`Starting at ${startMiles}mi but baseline is only ${currentMiles} mpw`);
  }
  
  return { planWeeks, currentMiles, progression, peakWeek, peakMiles, startMiles, taperWeeks, errors, warnings };
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function printProgression(result) {
  const { planWeeks, currentMiles, progression, peakWeek, peakMiles, startMiles, taperWeeks, errors, warnings } = result;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📅 ${planWeeks}-WEEK PLAN (${currentMiles} mpw baseline)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Peak: Week ${peakWeek} @ ${peakMiles}mi | Start: ${startMiles}mi | Taper: ${taperWeeks} weeks`);
  console.log(`${'─'.repeat(60)}`);
  
  // Print progression in columns
  const cols = 4;
  const rows = Math.ceil(progression.length / cols);
  
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const idx = row + col * rows;
      if (idx < progression.length) {
        const p = progression[idx];
        const typeIcon = {
          'build': '📈',
          'recovery': '🔄',
          'PEAK': '🏔️',
          'pre-peak': '⬆️',
          'post-peak': '⬇️',
          'taper': '📉',
          'race': '🏁'
        }[p.type] || '  ';
        
        line += `W${String(p.week).padStart(2)}: ${String(p.miles).padStart(2)}mi ${typeIcon}  `;
      }
    }
    console.log(`   ${line}`);
  }
  
  // Print validation results
  console.log(`${'─'.repeat(60)}`);
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`   ✅ All checks passed!`);
  } else {
    if (errors.length > 0) {
      console.log(`   ❌ ERRORS:`);
      errors.forEach(e => console.log(`      • ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`   ⚠️  WARNINGS:`);
      warnings.forEach(w => console.log(`      • ${w}`));
    }
  }
}

function runAllTests() {
  console.log('\n🏃 MARATHON PROGRESSION VALIDATOR');
  console.log('Testing all durations (10-16 weeks) with various baselines\n');
  
  const testCases = [
    // Standard tests for each duration
    { weeks: 10, mpw: 25, desc: '10-week aggressive' },
    { weeks: 11, mpw: 25, desc: '11-week aggressive' },
    { weeks: 12, mpw: 20, desc: '12-week compressed' },
    { weeks: 12, mpw: 25, desc: '12-week with good base' },
    { weeks: 13, mpw: 20, desc: '13-week standard' },
    { weeks: 14, mpw: 15, desc: '14-week standard' },
    { weeks: 15, mpw: 20, desc: '15-week comfortable' },
    { weeks: 16, mpw: 20, desc: '16-week ideal' },
    
    // Edge cases
    { weeks: 10, mpw: 20, desc: '10-week LOW baseline (edge case)' },
    { weeks: 16, mpw: 35, desc: '16-week HIGH baseline' },
  ];
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const tc of testCases) {
    const result = validateProgression(tc.weeks, tc.mpw);
    printProgression(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`   Tests run: ${testCases.length}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Total warnings: ${totalWarnings}`);
  
  if (totalErrors === 0) {
    console.log(`\n   ✅ ALL PROGRESSIONS VALID`);
  } else {
    console.log(`\n   ❌ ${totalErrors} ERROR(S) FOUND - Review above`);
  }
  
  console.log('\n');
}

// Run tests
runAllTests();
