import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// List every user_baselines row that has a ride_ftp_estimated value
const { data: bs, error } = await sb
  .from('user_baselines')
  .select('user_id, performance_numbers, learned_fitness, updated_at');
if (error) { console.error(error); process.exit(1); }
console.log('total user_baselines rows:', bs.length);
for (const b of bs) {
  const lf = b.learned_fitness || {};
  const ftpManual = b.performance_numbers?.ftp;
  const ftpLearned = lf?.ride_ftp_estimated;
  if (ftpManual || ftpLearned) {
    console.log(`\nuser ${b.user_id} (updated ${b.updated_at})`);
    console.log('  manual ftp:', ftpManual);
    console.log('  learned ride_ftp_estimated:', JSON.stringify(ftpLearned));
    console.log('  workouts_analyzed:', lf.workouts_analyzed, 'learning_status:', lf.learning_status, 'last_updated:', lf.last_updated);
  }
}

// Count rides per user (90d)
const today = new Date();
const ninetyAgoISO = new Date(today.getTime() - 90*86400*1000).toISOString().slice(0,10);
const rideTypes = ['ride','cycling','bike','virtualride','indoorcycling','gravelride','ebikeride','mountainbikeride'];
const { data: rides } = await sb
  .from('workouts')
  .select('user_id, date')
  .eq('workout_status','completed')
  .in('type', rideTypes)
  .gte('date', ninetyAgoISO);
const counts = {};
for (const r of rides) counts[r.user_id] = (counts[r.user_id]||0)+1;
console.log('\n=== ride counts in 90d per user ===');
for (const [uid, n] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log(' ', uid, '→', n);
