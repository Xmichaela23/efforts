import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const res = await fetch(`${env.SUPABASE_URL}/functions/v1/learn-fitness-profile`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  body: JSON.stringify({ user_id: USER_ID }),
});
const txt = await res.text();
console.log('status:', res.status);
try {
  const j = JSON.parse(txt);
  console.log('ride_ftp_estimated:', JSON.stringify(j.ride_ftp_estimated, null, 2));
  console.log('learning_status:', j.learning_status, '/ workouts_analyzed:', j.workouts_analyzed);
} catch {
  console.log(txt.slice(0, 500));
}
