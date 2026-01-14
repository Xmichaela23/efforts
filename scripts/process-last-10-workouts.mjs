#!/usr/bin/env node
/**
 * Process the last 10 workouts that need computed.analysis.series
 */

const workoutIds = [
  '3698ec60-84fa-4d32-8bb4-81f67a1e56bf', // ride, 2026-01-05
  'b85e797b-135c-488a-8e15-71edc0236ad9', // run, 2026-01-04
  '0c2b43df-7806-44d9-b5a3-af652342b348', // ride, 2026-01-03
  '32179ccd-9008-4d4a-81d5-df5912688996', // ride, 2026-01-02
  '361d3165-d52a-4271-b4b1-f091ca0cef61', // run, 2026-01-01
  '830508fc-e780-453b-9de2-de515cda3c7d', // run, 2025-12-31
  'f75edc59-4492-40cb-88ec-3f42ec30ec7c', // run, 2025-12-29
  '2f51666b-315e-42b0-b0b6-916f45178a72', // run, 2025-12-22
  '697a5c25-9363-4c55-b463-c94c658a9b0a', // ride, 2025-12-14
  'c6132234-c169-49d2-add2-803adc8b3875', // ride, 2025-12-13
];

async function processWorkout(workoutId, supabaseUrl, serviceKey) {
  try {
    const functionUrl = `${supabaseUrl}/functions/v1/compute-workout-analysis`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      },
      body: JSON.stringify({ workout_id: workoutId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return { success: result.success !== false, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  // Try to get env vars from common locations
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('   Set these as environment variables:');
    console.error('   export SUPABASE_URL="your-url"');
    console.error('   export SUPABASE_SERVICE_ROLE_KEY="your-key"');
    process.exit(1);
  }

  console.log(`🚀 Processing ${workoutIds.length} workouts...\n`);

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < workoutIds.length; i++) {
    const workoutId = workoutIds[i];
    const progress = `[${i + 1}/${workoutIds.length}]`;
    
    console.log(`${progress} Processing workout ${workoutId}...`);
    
    const result = await processWorkout(workoutId, supabaseUrl, serviceKey);
    
    if (result.success) {
      successCount++;
      console.log(`  ✅ Success\n`);
    } else {
      failCount++;
      console.log(`  ❌ Failed: ${result.error || 'Unknown error'}\n`);
    }

    // Small delay to avoid overwhelming the system
    if (i < workoutIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏱️  Duration: ${duration}s`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
