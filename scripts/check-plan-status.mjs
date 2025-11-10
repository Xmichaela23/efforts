#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPlanStatus(planId) {
  console.log('\n=== CHECKING PLAN STATUS ===');
  console.log('Plan ID:', planId);
  
  // Get plan details
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();
    
  if (planErr) {
    console.error('Error fetching plan:', planErr);
    return;
  }
  
  console.log('\n📋 Plan Details:');
  console.log('  Status:', plan.status);
  console.log('  Paused at:', plan.paused_at);
  console.log('  Config:', plan.config);
  console.log('  Duration weeks:', plan.duration_weeks);
  console.log('  Sessions by week:', plan.sessions_by_week ? 'YES' : 'NO');
  
  // Check planned workouts
  const { data: planned, error: plannedErr } = await supabase
    .from('planned_workouts')
    .select('date, type, description')
    .eq('training_plan_id', planId)
    .order('date', { ascending: true });
    
  if (plannedErr) {
    console.error('Error fetching planned workouts:', plannedErr);
    return;
  }
  
  console.log('\n📅 Planned Workouts:');
  console.log('  Total count:', planned?.length || 0);
  if (planned && planned.length > 0) {
    console.log('  First:', planned[0].date, '-', planned[0].type);
    console.log('  Last:', planned[planned.length - 1].date, '-', planned[planned.length - 1].type);
  }
  
  // Check today
  const today = new Date().toISOString().split('T')[0];
  const todayWorkouts = planned?.filter(p => p.date === today) || [];
  console.log('\n🗓️  Today (' + today + '):');
  console.log('  Workouts:', todayWorkouts.length);
  todayWorkouts.forEach(w => console.log('    -', w.type, ':', w.description));
}

const planId = process.argv[2];
if (!planId) {
  console.error('Usage: node check-plan-status.mjs <plan-id>');
  process.exit(1);
}

checkPlanStatus(planId).then(() => process.exit(0));

