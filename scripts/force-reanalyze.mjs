#!/usr/bin/env node
/**
 * Force reanalysis of a workout by clearing its cached analysis data
 * Usage: node scripts/force-reanalyze.mjs <workout-id>
 * 
 * This script:
 * 1. Clears the cached analysis.series data
 * 2. Calls compute-workout-analysis to regenerate it with the latest fixes
 */

import { createClient } from '@supabase/supabase-js';

// Get workout ID from command line
const workoutId = process.argv[2];

if (!workoutId) {
  console.error('❌ Error: Please provide a workout ID');
  console.log('Usage: node scripts/force-reanalyze.mjs <workout-id>');
  process.exit(1);
}

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.log('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔄 Forcing reanalysis for workout:', workoutId);

try {
  // Step 1: Clear the cached analysis data
  console.log('📝 Clearing cached analysis data...');
  
  const { error: updateError } = await supabase
    .from('workouts')
    .update({
      computed: supabase.rpc('jsonb_set', {
        target: 'computed',
        path: ['analysis'],
        new_value: null
      })
    })
    .eq('id', workoutId);

  if (updateError) {
    console.error('❌ Failed to clear cache:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Cache cleared');

  // Step 2: Trigger compute-workout-analysis
  console.log('⚙️  Triggering analysis recomputation...');
  
  const { data, error: invokeError } = await supabase.functions.invoke(
    'compute-workout-analysis',
    {
      body: { workout_id: workoutId }
    }
  );

  if (invokeError) {
    console.error('❌ Failed to invoke analysis:', invokeError.message);
    process.exit(1);
  }

  console.log('✅ Analysis recomputed successfully!');
  console.log('📊 Result:', data);
  console.log('\n🎉 Done! Open the workout in your app to see the corrected pace chart.');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}





