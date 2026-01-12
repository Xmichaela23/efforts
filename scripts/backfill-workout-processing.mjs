#!/usr/bin/env node
/**
 * Backfill script: Process all workouts missing computed.series
 * 
 * Usage:
 *   node scripts/backfill-workout-processing.mjs [--limit N] [--dry-run]
 * 
 * Options:
 *   --limit N     Process only N workouts (default: all)
 *   --dry-run     Show what would be processed without actually processing
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Set these in .env.local or .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Parse command line args
const args = process.argv.slice(2);
const limit = args.includes('--limit') 
  ? parseInt(args[args.indexOf('--limit') + 1]) || null
  : null;
const dryRun = args.includes('--dry-run');

function hasSeries(computed) {
  try {
    const parsed = typeof computed === 'string' ? JSON.parse(computed) : computed;
    const s = parsed?.analysis?.series || null;
    const n = Array.isArray(s?.distance_m) ? s.distance_m.length : 0;
    const nt = Array.isArray(s?.time_s) ? s.time_s.length : (Array.isArray(s?.time) ? s.time.length : 0);
    return n > 1 && nt > 1;
  } catch {
    return false;
  }
}

async function processWorkout(workoutId) {
  if (dryRun) {
    console.log(`  [DRY RUN] Would process: ${workoutId}`);
    return { success: true, dryRun: true };
  }

  try {
    const functionUrl = `${SUPABASE_URL}/functions/v1/compute-workout-analysis`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
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
  console.log('🔍 Finding workouts missing computed.series...');
  console.log(dryRun ? '  [DRY RUN MODE - no changes will be made]' : '');

  // Fetch all completed workouts
  let allWorkouts = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, type, date, computed, workout_status')
      .eq('workout_status', 'completed')
      .order('date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Error fetching workouts:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allWorkouts.push(...data);
    
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`📊 Found ${allWorkouts.length} completed workouts`);

  // Filter to workouts missing series
  const needsProcessing = allWorkouts.filter(w => !hasSeries(w.computed));
  console.log(`⚠️  ${needsProcessing.length} workouts need processing`);

  if (needsProcessing.length === 0) {
    console.log('✅ All workouts are already processed!');
    return;
  }

  // Apply limit if specified
  const toProcess = limit ? needsProcessing.slice(0, limit) : needsProcessing;
  console.log(`🚀 Processing ${toProcess.length} workout(s)...\n`);

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const workout = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    
    console.log(`${progress} Processing ${workout.type} from ${workout.date} (${workout.id})...`);
    
    const result = await processWorkout(workout.id);
    
    if (result.success) {
      successCount++;
      console.log(`  ✅ Success`);
    } else {
      failCount++;
      console.log(`  ❌ Failed: ${result.error || 'Unknown error'}`);
    }

    // Small delay to avoid overwhelming the system
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${toProcess.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏱️  Duration: ${duration}s`);
  console.log(`   📈 Remaining: ${needsProcessing.length - toProcess.length}`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
