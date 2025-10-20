#!/usr/bin/env node

/**
 * Test script for analyze-running-workout function
 * Run with: node test-running-analysis.mjs
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'
);

async function testRunningAnalysis() {
  console.log('🧪 Testing analyze-running-workout function...\n');
  
  try {
    // Test 1: Find a running workout with planned workout
    console.log('📊 Looking for running workout with planned workout...');
    
    const { data: workouts, error: fetchError } = await supabase
      .from('workouts')
      .select('id, type, planned_id, computed')
      .eq('type', 'run')
      .not('planned_id', 'is', null)
      .limit(1);
    
    if (fetchError) {
      throw new Error(`Failed to fetch workouts: ${fetchError.message}`);
    }
    
    if (!workouts || workouts.length === 0) {
      console.log('❌ No running workouts with planned workouts found');
      console.log('   Create a running workout with a planned workout to test');
      return;
    }
    
    const testWorkout = workouts[0];
    console.log(`✅ Found test workout: ${testWorkout.id}`);
    console.log(`   Type: ${testWorkout.type}`);
    console.log(`   Planned ID: ${testWorkout.planned_id}`);
    console.log(`   Has computed data: ${!!testWorkout.computed}\n`);
    
    // Test 2: Run compute-workout-summary first
    console.log('🔄 Step 1: Running compute-workout-summary...');
    
    const { data: computeResult, error: computeError } = await supabase.functions.invoke('compute-workout-summary', {
      body: { workout_id: testWorkout.id }
    });
    
    if (computeError) {
      throw new Error(`Compute-workout-summary failed: ${computeError.message}`);
    }
    
    console.log('✅ compute-workout-summary completed\n');
    
    // Test 3: Run analyze-running-workout
    console.log('🏃 Step 2: Running analyze-running-workout...');
    
    const { data: analysisResult, error: analysisError } = await supabase.functions.invoke('analyze-running-workout', {
      body: { workout_id: testWorkout.id }
    });
    
    if (analysisError) {
      throw new Error(`analyze-running-workout failed: ${analysisError.message}`);
    }
    
    console.log('✅ analyze-running-workout completed\n');
    
    // Test 4: Display results
    console.log('📈 Analysis Results:');
    console.log('==================');
    
    if (analysisResult.analysis) {
      const analysis = analysisResult.analysis;
      
      console.log(`Overall Adherence: ${analysis.adherence_percentage}%`);
      console.log(`Time in Range: ${analysis.time_in_prescribed_range}s`);
      console.log(`Time Outside Range: ${analysis.time_outside_prescribed_range}s`);
      console.log(`Range Consistency: ${Math.round(analysis.range_consistency * 100)}%`);
      console.log(`Execution Grade: ${analysis.execution_quality.overall_grade}`);
      
      console.log('\nPrimary Issues:');
      analysis.execution_quality.primary_issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });
      
      console.log('\nStrengths:');
      analysis.execution_quality.strengths.forEach((strength, i) => {
        console.log(`  ${i + 1}. ${strength}`);
      });
      
      console.log('\nInterval Breakdown:');
      analysis.range_analysis.intervals.forEach((interval, i) => {
        console.log(`  Interval ${i + 1}: ${interval.adherence_percentage}% adherence (${interval.time_in_range}s in range)`);
      });
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testRunningAnalysis();
