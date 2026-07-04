// D-238 / load-ladder: size the impact of removing TRIMP (resting-HR-based) in favour of an
// output-first ladder (power/pace → sRPE → threshold-HR), on Michael's real cardio history.
// READ-ONLY. "Before" = the REAL stored workload_actual (current TRIMP-based load); "after" =
// the new ladder recomputed here with the SAME duration convention as the edge functions
// (durationMinutes = moving_time ?? duration, in MINUTES — no ÷60). Reports the window ACWR
// shift, dramatic movers, and a RUN SAFETY canary (run-power is never scored vs cycling FTP).
//
// Run:  ~/.deno/bin/deno run --allow-read --allow-env --allow-net scripts/verify-load-ladder-impact.mjs

const env = Object.fromEntries(
  (await Deno.readTextFile('.env')).split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const U = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const UID = '45d122e7-a950-4d50-858c-380b492061aa';
const H = { apikey: K, Authorization: 'Bearer ' + K };
const q = async (p) => (await fetch(U + '/rest/v1/' + p, { headers: H })).json();

// --- new-ladder intensity (mirrors _shared/workload.ts inferIntensityFromPerformance) ---
const durLoad = (durMin, intensity) => Math.round((durMin / 60) * intensity * intensity * 100);
const ridePowerIF = (p, ftp) => { const i = p / ftp; return i>=1.05?1.15:i>=.95?1:i>=.85?.9:i>=.75?.8:i>=.6?.7:i>=.55?.65:.55; };
const runHrIF = (hr, lthr) => { const p = hr / lthr; return p>=1.05?1.1:p>=.95?1:p>=.88?.88:p>=.8?.8:p>=.7?.7:.6; };
const rideHrIF = (hr, lthr) => { const p = hr / lthr; return p>=.95?1:p>=.9?.9:p>=.85?.8:p>=.75?.7:.6; };
const swimPaceIF = (pace) => { const s = pace/60; return s<1.5?1:s<2?.95:s<2.5?.85:s<3?.75:.65; };
const mapRPE = (rpe) => Math.min(1, Math.max(0.3, rpe/10)); // approx of mapRPEToIntensity for the 16 rpe-only rows

const base = await q(`user_baselines?select=performance_numbers,learned_fitness&user_id=eq.${UID}`);
const pn = base?.[0]?.performance_numbers || {}, lf = base?.[0]?.learned_fitness || {};
const storedRHR = pn.resting_heart_rate ?? lf?.run?.resting_hr ?? lf?.ride?.resting_hr ?? null;
const ftp = pn.ftp ?? lf?.ride?.ride_ftp_estimated?.value ?? 176;
const lthr = pn.threshold_heart_rate ?? lf?.run?.run_threshold_hr?.value ?? lf?.running?.threshold_hr ?? 151;

console.log(`\nStored resting HR: ${storedRHR ?? 'NONE → every current TRIMP used the fabricated 60'}`);
console.log(`FTP ${ftp}  |  LTHR ${lthr}\n`);

const durMin = (r) => (r.moving_time ?? r.duration ?? 0);           // MINUTES, matches durationMinutes()
const isCardio = (t) => t === 'run' || t === 'ride' || t === 'bike' || t === 'swim';
const isRide = (t) => t === 'ride' || t === 'bike';

// New-ladder load for a cardio workout (output → HR%LTHR → sRPE → default). RUN-POWER IS NEVER
// SCORED vs FTP — the power branch is ride-only.
function newCardioLoad(r) {
  const d = durMin(r); if (!d) return 0;
  if (isRide(r.type) && r.avg_power) return durLoad(d, ridePowerIF(r.avg_power, ftp));
  if (r.type === 'run' && r.avg_heart_rate && lthr) return durLoad(d, runHrIF(r.avg_heart_rate, lthr));
  if (isRide(r.type) && r.avg_heart_rate && lthr) return durLoad(d, rideHrIF(r.avg_heart_rate, lthr));
  if (r.type === 'swim' && r.avg_pace) return durLoad(d, swimPaceIF(r.avg_pace));
  const rpe = (r.workout_metadata || {}).session_rpe;
  if (typeof rpe === 'number' && rpe >= 1 && rpe <= 10) return durLoad(d, mapRPE(rpe)); // sRPE
  return durLoad(d, 0.7); // duration default
}

// All completed workouts (need non-cardio too so the window ACWR is the REAL total-load shift).
const all = await q(`workouts?select=id,date,type,duration,moving_time,avg_heart_rate,max_heart_rate,avg_power,avg_pace,workload_actual,workout_metadata&user_id=eq.${UID}&workout_status=eq.completed&order=date.desc`);
const cardio = all.filter((r) => isCardio(r.type));
console.log(`Completed workouts: ${all.length} (cardio ${cardio.length})`);
console.log(`  cardio with avg HR (was TRIMP): ${cardio.filter(r=>r.avg_heart_rate).length}`);
console.log(`    → have power/pace/LTHR (→ output/threshold): ${cardio.filter(r=>(isRide(r.type)&&r.avg_power)||r.avg_heart_rate||r.avg_pace).length}`);

// Window sums: before = stored workload_actual (real current load); after = new ladder (cardio) /
// unchanged (non-cardio).
const dayMs = 86400000, today = new Date(all[0]?.date || Date.now());
let old7=0,new7=0,old28=0,new28=0;
const movers = [];
for (const r of all) {
  const before = Number(r.workload_actual) || 0;
  const after = isCardio(r.type) ? newCardioLoad(r) : before;
  const ageDays = (today - new Date(r.date)) / dayMs;
  if (ageDays >= 0 && ageDays < 7) { old7+=before; new7+=after; }
  if (ageDays >= 0 && ageDays < 28) { old28+=before; new28+=after; }
  if (isCardio(r.type) && Math.abs(after-before) >= 25)
    movers.push({ date:r.date, type:r.type, before, after, delta:after-before, power:r.avg_power, hr:r.avg_heart_rate });
}
const acwr = (a,c) => c ? (a/(c/4)) : null;
console.log(`\nRECENT-WINDOW LOAD (stored current → new ladder; non-cardio unchanged):`);
console.log(`  acute-7:   ${Math.round(old7)} → ${Math.round(new7)}`);
console.log(`  chronic-28:${Math.round(old28)} → ${Math.round(new28)}`);
console.log(`  ACWR:      ${acwr(old7,old28)?.toFixed(2)} → ${acwr(new7,new28)?.toFixed(2)}\n`);

movers.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
console.log(`DRAMATIC MOVERS (cardio, |Δ| ≥ 25 stored-vs-new): ${movers.length}`);
for (const m of movers.slice(0, 20))
  console.log(`  ${m.date} ${m.type.padEnd(4)} ${String(m.before).padStart(4)} → ${String(m.after).padStart(4)}  Δ ${m.delta>=0?'+':''}${m.delta}  (power ${m.power ?? '—'}, avgHR ${m.hr ?? '—'})`);

// --- RUN SAFETY CANARY: runs must score on HR%LTHR, NEVER run-power ÷ cycling-FTP ---
const runs = cardio.filter((r) => r.type === 'run');
const strydRuns = runs.filter((r) => r.avg_power);
let runSpikes = 0;
console.log(`\nRUN SAFETY — ${runs.length} runs, ${strydRuns.length} with Stryd power (run-power IGNORED; HR%LTHR used):`);
for (const r of strydRuns.slice(0, 12)) {
  const d = durMin(r); if (!d) continue;
  const actual = newCardioLoad(r);
  const bug = durLoad(d, ridePowerIF(r.avg_power, ftp));            // what run-power÷FTP WOULD give
  const impliedIF = Math.sqrt(actual / Math.max(1, durLoad(d, 1)));
  const spiked = impliedIF > 1.05; if (spiked) runSpikes++;
  console.log(`  ${r.date}  new ${String(actual).padStart(4)} (IF~${impliedIF.toFixed(2)}, ${d}min, avgHR ${r.avg_heart_rate})  |  BUG(${r.avg_power}W÷${ftp})→IF ${(r.avg_power/ftp).toFixed(2)} would spike  ${spiked?'⚠':'✓ avoided'}`);
}
console.log(runSpikes === 0
  ? `  ✓ 0/${strydRuns.length} runs spiked — no cross-discipline power error. Run-power ÷ cycling-FTP never fires.`
  : `  ✗ ${runSpikes} run(s) spiked — INVESTIGATE cross-discipline power.`);
