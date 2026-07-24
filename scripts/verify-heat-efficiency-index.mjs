// Does HEAT drive the "easing off" EFFICIENCY verdict? Tests the exact metric the State run row uses:
// run_facts.efficiency_index / gap_efficiency_index, steady aerobic, 30-70 min (mirrors efficiencyIndexToSeries).
// Also checks the 12-week WINDOW temp gradient (cool-early vs hot-now) — the thing that fakes the trend. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';

const { data: ws } = await sb.from('workouts')
  .select('id,date,weather_data,moving_time,duration').eq('user_id',USER).eq('type','run').order('date',{ascending:true});
const { data: fs } = await sb.from('workout_facts').select('workout_id,run_facts').eq('user_id',USER);
const F = new Map((fs??[]).map(f=>[f.workout_id, typeof f.run_facts==='string'?JSON.parse(f.run_facts):f.run_facts]));

const rows=[];
for (const w of ws) {
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const t = wd?.temperature_start_f ?? wd?.temperature ?? null;
  const rf = F.get(w.id); if(!rf) continue;
  const eff = rf.efficiency_index ?? null;
  const durMin = Number(w.moving_time ?? w.duration ?? 0);       // already in minutes
  const qualifies = durMin>=30 && durMin<=70;                    // same duration band as the verdict
  rows.push({ date:w.date, t:t==null?null:Number(t), eff, durMin, qualifies });
}

console.log(`DEBUG: total run rows w/ facts=${rows.length}, w/ eff=${rows.filter(r=>r.eff!=null).length}, w/ temp=${rows.filter(r=>r.t!=null).length}, dur30-70=${rows.filter(r=>r.qualifies).length}`);
console.log('DEBUG last 6:', rows.slice(-6).map(r=>`${r.date} t=${r.t} eff=${r.eff} dur=${r.durMin?.toFixed(0)}`).join(' | '));

// The series the verdict trends: raw efficiency_index, qualifying-duration rows, finite 0.5-5.
const series = rows.filter(r=>r.qualifies).map(r=>({date:r.date, t:r.t, v:r.eff}))
  .filter(p=>Number.isFinite(p.v) && p.v>=0.5 && p.v<=5 && p.t!=null);

function ols(pts,label){
  const n=pts.length; if(n<4){console.log(`   ${label}: n=${n} — too few`);return;}
  const mx=pts.reduce((s,p)=>s+p.x,0)/n,my=pts.reduce((s,p)=>s+p.y,0)/n;
  const sxx=pts.reduce((s,p)=>s+(p.x-mx)**2,0),sxy=pts.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const syy=pts.reduce((s,p)=>s+(p.y-my)**2,0);
  if(sxx===0){console.log('   no temp variance');return;}
  const b=sxy/sxx,r=sxy/Math.sqrt(sxx*syy);
  const sse=pts.reduce((s,p)=>s+(p.y-(my+b*(p.x-mx)))**2,0);
  const se=Math.sqrt(sse/(n-2)/sxx),t=b/se,lo=b-2*se,hi=b+2*se;
  console.log(`   ${label}  (n=${n})`);
  console.log(`   slope = ${b.toFixed(4)} index-units per degF above 60F  (negative = hotter -> lower efficiency)`);
  console.log(`   t = ${t.toFixed(2)}   r^2 = ${(r*r).toFixed(3)}   ${Math.abs(t)>2?'*** SIGNIFICANT — HEAT MOVES THE EFFICIENCY NUMBER ***':'not significant'}`);
  console.log(`   95% CI slope: [${lo.toFixed(4)}, ${hi.toFixed(4)}] ${lo<0&&hi>0?'straddles zero':''}`);
}

console.log(`=== EFFICIENCY-INDEX vs HEAT (the exact verdict metric) ===`);
ols(series.map(p=>({x:Math.max(0,p.t-60), y:p.v})), 'heatTerm -> efficiency');

// The trend window: last 12 weeks (84d) from the newest run. classifyTrend's early vs recent.
const asOf = series.length ? series[series.length-1].date : null;
const start = asOf ? new Date(new Date(asOf+'T12:00:00Z').getTime()-84*86400000).toISOString().slice(0,10) : null;
const win = series.filter(p=>p.date>start && p.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));
console.log(`\n=== 12-WEEK WINDOW TEMP GRADIENT (does the trend get faked by warming?) ===`);
console.log(`   window ${start} -> ${asOf},  ${win.length} qualifying runs`);
const half = Math.floor(win.length/2);
const early = win.slice(0,half), recent = win.slice(-half || win.length);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const et=mean(early.map(p=>p.t)), rt=mean(recent.map(p=>p.t));
const ev=mean(early.map(p=>p.v)), rv=mean(recent.map(p=>p.v));
console.log(`   EARLY half:  mean temp ${et?.toFixed(0)}F   mean efficiency ${ev?.toFixed(3)}`);
console.log(`   RECENT half: mean temp ${rt?.toFixed(0)}F   mean efficiency ${rv?.toFixed(3)}`);
if(et!=null&&rt!=null){
  console.log(`   temp change early->recent: ${(rt-et>0?'+':'')}${(rt-et).toFixed(0)}F`);
  console.log(`   efficiency change:         ${(rv-ev>0?'+':'')}${(rv-ev).toFixed(3)}  (the "easing off")`);
}
console.log(`\n   per-run window detail (date / tempF / efficiency):`);
for(const p of win) console.log(`   ${p.date}   ${String(p.t??'--').padStart(4)}F   ${p.v.toFixed(3)}`);
