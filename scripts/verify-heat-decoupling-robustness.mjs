import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const { data } = await sb.from('workouts').select('date,workout_analysis,weather_data')
  .eq('user_id',USER).eq('type','run').order('date',{ascending:true});
const NONSTEADY=['interval','fartlek','tempo','threshold','race','hill','sprint','vo2','repeat'];
const rows=[];
for (const w of data) {
  const wa=typeof w.workout_analysis==='string'?JSON.parse(w.workout_analysis):w.workout_analysis;
  const hrs=wa?.heart_rate_summary; if(!hrs) continue;
  const wd=typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const temp=wd?.temperature_start_f ?? wd?.temperature ?? null;
  const dec=hrs.decouplingPct, wt=String(hrs.workoutType??'').toLowerCase();
  if(dec==null||temp==null||hrs.decouplingBasis==='raw') continue;
  if(!(wt.length>0 && !NONSTEADY.some(k=>wt.includes(k)))) continue;
  rows.push({t:Number(temp),ht:Math.max(0,Number(temp)-60),dec:Number(dec)});
}
function ols(pts,label){
  const n=pts.length; if(n<4){console.log(`${label.padEnd(46)} n=${n} too few`);return;}
  const mx=pts.reduce((s,p)=>s+p.x,0)/n,my=pts.reduce((s,p)=>s+p.y,0)/n;
  const sxx=pts.reduce((s,p)=>s+(p.x-mx)**2,0),sxy=pts.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const syy=pts.reduce((s,p)=>s+(p.y-my)**2,0);
  const b=sxy/sxx,a=my-b*mx,r=sxy/Math.sqrt(sxx*syy);
  const sse=pts.reduce((s,p)=>s+(p.y-(a+b*p.x))**2,0);
  const se=Math.sqrt(sse/(n-2)/sxx), t=b/se;
  const lo=b-2*se,hi=b+2*se;
  console.log(`${label.padEnd(46)} n=${String(n).padStart(3)}  slope=${b.toFixed(3).padStart(7)}  t=${t.toFixed(2).padStart(6)}  CI[${lo.toFixed(3)},${hi.toFixed(3)}]${lo<0&&hi>0?'  straddles 0':''}`);
}
console.log('=== ROBUSTNESS: does the "no heat effect" result survive? ===\n');
ols(rows.map(r=>({x:r.ht,y:r.dec})),                                'all steady runs');
ols(rows.filter(r=>r.dec>=-10&&r.dec<=20).map(r=>({x:r.ht,y:r.dec})),'trimmed to plausible decoupling -10..+20%');
ols(rows.filter(r=>r.dec>=-5 &&r.dec<=15).map(r=>({x:r.ht,y:r.dec})),'tightly trimmed -5..+15%');
ols(rows.filter(r=>r.dec>=0).map(r=>({x:r.ht,y:r.dec})),             'positive decoupling only (>=0)');
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
console.log('\n=== MEDIANS by temperature bucket (outlier-proof) ===');
for (const [lo,hi] of [[0,65],[65,70],[70,75],[75,80],[80,99]]) {
  const b=rows.filter(r=>r.t>=lo&&r.t<hi);
  if(!b.length){console.log(`   ${lo}-${hi}F: none`);continue;}
  console.log(`   ${String(lo).padStart(2)}-${hi}F : n=${String(b.length).padStart(2)}  median decoupling = ${med(b.map(r=>r.dec)).toFixed(2)}%`);
}
console.log('\n   Theory says this column should RISE with temperature. Does it?');
