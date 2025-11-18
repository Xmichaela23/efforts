#!/usr/bin/env node
/**
 * Interactive script to reanalyze recent workouts
 * This will show your recent workouts and let you pick one to reanalyze
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Fetching your recent workouts...\n');

try {
  // Get recent completed workouts
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('id, name, type, date, distance, moving_time, avg_pace')
    .eq('workout_status', 'completed')
    .order('date', { ascending: false })
    .limit(10);

  if (error) throw error;

  if (!workouts || workouts.length === 0) {
    console.log('No completed workouts found.');
    process.exit(0);
  }

  // Display workouts
  console.log('Recent workouts:');
  console.log('─'.repeat(80));
  workouts.forEach((w, i) => {
    const distStr = w.distance ? `${(w.distance).toFixed(1)} mi` : 'N/A';
    const timeStr = w.moving_time ? `${w.moving_time} min` : 'N/A';
    const paceStr = w.avg_pace ? `${Math.floor(w.avg_pace/60)}:${String(Math.round(w.avg_pace%60)).padStart(2,'0')}/mi` : 'N/A';
    console.log(`${i + 1}. [${w.type.toUpperCase()}] ${w.name || 'Untitled'}`);
    console.log(`   Date: ${w.date} | ${distStr} | ${timeStr} | Pace: ${paceStr}`);
    console.log(`   ID: ${w.id}`);
    console.log('');
  });
  console.log('─'.repeat(80));

  const answer = await question('\nEnter workout number to reanalyze (or "q" to quit): ');

  if (answer.toLowerCase() === 'q') {
    console.log('Exiting...');
    rl.close();
    process.exit(0);
  }

  const index = parseInt(answer) - 1;
  if (isNaN(index) || index < 0 || index >= workouts.length) {
    console.log('❌ Invalid selection');
    rl.close();
    process.exit(1);
  }

  const workout = workouts[index];
  console.log(`\n🔄 Reanalyzing: ${workout.name || workout.type}`);

  // Trigger reanalysis by calling the edge function
  console.log('⚙️  Calling compute-workout-analysis...');
  
  const { data, error: invokeError } = await supabase.functions.invoke(
    'compute-workout-analysis',
    { body: { workout_id: workout.id } }
  );

  if (invokeError) {
    console.error('❌ Failed:', invokeError.message);
    rl.close();
    process.exit(1);
  }

  console.log('✅ Analysis recomputed successfully!');
  console.log('📊 Analysis version:', data?.analysisVersion);
  console.log('\n🎉 Done! Refresh the workout in your app to see the corrected pace chart.');

  rl.close();

} catch (error) {
  console.error('❌ Error:', error.message);
  rl.close();
  process.exit(1);
}





