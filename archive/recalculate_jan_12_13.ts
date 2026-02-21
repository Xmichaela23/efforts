/**
 * Quick script to recalculate workload for Jan 12-13 workouts
 * Run with: deno run --allow-net --allow-env recalculate_jan_12_13.ts
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const WORKOUT_IDS = [
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  // Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53'   // Jan 12
];

async function recalculateWorkload(workoutId: string) {
  const url = `${SUPABASE_URL}/functions/v1/calculate-workload`;
  
  console.log(`\n🔄 Recalculating workload for workout: ${workoutId}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      workout_id: workoutId
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  console.log(`✅ Success:`, data);
  return data;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    Deno.exit(1);
  }

  console.log('🚀 Starting workload recalculation for Jan 12-13 workouts...\n');

  for (const workoutId of WORKOUT_IDS) {
    await recalculateWorkload(workoutId);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✨ Done! Refresh your context screen to see the workouts.');
}

main().catch(console.error);
