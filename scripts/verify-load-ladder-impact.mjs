// D-237 / load-ladder: size the impact of removing TRIMP (resting-HR-based) in favour of an
// output-first ladder (power/pace → sRPE → threshold-HR), on Michael's real cardio history.
// READ-ONLY. Reports: stored resting HR (real vs fabricated), how many cardio workouts currently
// take the TRIMP path, how many would move to an output/threshold method, and a before/after
// magnitude on up to 8 sessions that have BOTH HR and power/pace (where the number actually shifts).
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

// --- current TRIMP (Banister, resting-HR reserve) — mirrors _shared/workload.ts ---
const trimp = (avgHR, maxHR, restingHR, thresholdHR, dur) => {
  const rest = restingHR || (thresholdHR ? Math.max(thresholdHR - 90, 45) : 60);
  if (!avgHR || !maxHR || avgHR <= rest || avgHR > maxHR || !dur) return null;
  const ratio = (avgHR - rest) / (maxHR - rest);
  return Math.round(dur * ratio * (0.64 * Math.exp(1.92 * ratio)) * 0.6);
};
const durLoad = (dur, intensity) => Math.round((dur / 60) * intensity * intensity * 100);
const ridePowerIF = (p, ftp) => { const i = p / ftp; return i>=1.05?1.15:i>=.95?1:i>=.85?.9:i>=.75?.8:i>=.6?.7:i>=.55?.65:.55; };
const runHrIF = (hr, lthr) => { const p = hr / lthr; return p>=1.05?1.1:p>=.95?1:p>=.88?.88:p>=.8?.8:p>=.7?.7:.6; };

const base = await q(`user_baselines?select=performance_numbers,learned_fitness&user_id=eq.${UID}`);
const pn = base?.[0]?.performance_numbers || {}, lf = base?.[0]?.learned_fitness || {};
const storedRHR = pn.resting_heart_rate ?? lf?.run?.resting_hr ?? lf?.ride?.resting_hr ?? null;
const ftp = pn.ftp ?? lf?.ride?.ride_ftp_estimated?.value ?? 176;
const lthr = pn.threshold_heart_rate ?? lf?.run?.run_threshold_hr?.value ?? 151;

console.log(`\nStored resting HR: ${storedRHR ?? 'NONE → every TRIMP used the fabricated 60'}`);
console.log(`FTP ${ftp}  |  LTHR ${lthr}\n`);

const w = await q(`workouts?select=id,date,type,duration,moving_time,avg_heart_rate,max_heart_rate,avg_power,avg_pace,threshold_heart_rate&user_id=eq.${UID}&type=in.(run,ride,bike,swim)&workout_status=eq.completed&order=date.desc`);
let cardio = 0, hasHR = 0, hrPlusOutput = 0, hrOnly = 0;
const examples = [];
for (const r of w) {
  cardio++;
  const hr = r.avg_heart_rate && r.max_heart_rate;
  const isRide = r.type === 'ride' || r.type === 'bike';
  const output = (isRide && r.avg_power) || (r.type === 'run' && (r.threshold_heart_rate || lthr)) || (r.type === 'swim' && r.avg_pace);
  if (hr) hasHR++;
  if (hr && output) hrPlusOutput++;
  if (hr && !output) hrOnly++;
  // before/after where both exist and the number can shift (rides w/ power; runs w/ HR+LTHR)
  const dur = (r.moving_time && r.moving_time > 0) ? r.moving_time / 60 : (r.duration || 0);
  if (hr && dur && examples.length < 8) {
    const before = trimp(r.avg_heart_rate, r.max_heart_rate, storedRHR, r.threshold_heart_rate ?? lthr, dur);
    let after = null, method = null;
    if (isRide && r.avg_power) { after = durLoad(dur, ridePowerIF(r.avg_power, ftp)); method = 'power'; }
    else if (r.type === 'run') { after = durLoad(dur, runHrIF(r.avg_heart_rate, lthr)); method = 'HR%LTHR'; }
    if (after != null) examples.push({ date: r.date, type: r.type, before, after, method, delta: after - before });
  }
}
console.log(`Completed cardio: ${cardio}`);
console.log(`  with avg+max HR (currently TRIMP path): ${hasHR}`);
console.log(`    → also have power/pace/LTHR (move to OUTPUT/threshold): ${hrPlusOutput}`);
console.log(`    → HR-only, no output (fall to sRPE/default): ${hrOnly}\n`);

// --- WINDOW total load + ACWR shift (old TRIMP-on-60 vs new output/threshold) ---
// Recompute old vs new for every dated cardio workout, then sum a recent acute-7 and
// chronic-28 window and show the ratio both ways. Mirrors the ACWR-readout discipline.
const rpeIntensity = (r) => { const m = (r.workout_metadata||{}); const rpe = m.session_rpe; return (typeof rpe==='number'&&rpe>=1&&rpe<=10) ? (rpe/10) : 0.7; };
const newLoad = (r, dur) => {
  const isRide = r.type==='ride'||r.type==='bike';
  if (isRide && r.avg_power) return durLoad(dur, ridePowerIF(r.avg_power, ftp));
  if ((r.type==='run'||isRide) && r.avg_heart_rate && lthr) return durLoad(dur, runHrIF(r.avg_heart_rate, lthr));
  if (r.type==='swim' && r.avg_pace) return durLoad(dur, (r.avg_pace/60)<2?0.95:0.85);
  return durLoad(dur, rpeIntensity(r)); // sRPE / default
};
const dayMs = 86400000, today = new Date(w[0]?.date || Date.now());
let old7=0,new7=0,old28=0,new28=0;
const movers = [];
for (const r of w) {
  const dur = (r.moving_time && r.moving_time>0) ? r.moving_time/60 : (r.duration||0);
  if (!dur) continue;
  const before = trimp(r.avg_heart_rate, r.max_heart_rate, storedRHR, r.threshold_heart_rate ?? lthr, dur) ?? newLoad(r, dur);
  const after = newLoad(r, dur);
  const ageDays = (today - new Date(r.date)) / dayMs;
  if (ageDays >= 0 && ageDays < 7) { old7+=before; new7+=after; }
  if (ageDays >= 0 && ageDays < 28) { old28+=before; new28+=after; }
  if (before && Math.abs(after-before) >= 25) movers.push({ date:r.date, type:r.type, before, after, delta:after-before, power:r.avg_power, hr:r.avg_heart_rate });
}
const acwrOld = old28 ? (old7/(old28/4)) : null, acwrNew = new28 ? (new7/(new28/4)) : null;
console.log('RECENT-WINDOW LOAD (old TRIMP-on-60 → new output/threshold):');
console.log(`  acute-7:   ${Math.round(old7)} → ${Math.round(new7)}`);
console.log(`  chronic-28:${Math.round(old28)} → ${Math.round(new28)}`);
console.log(`  ACWR:      ${acwrOld?.toFixed(2)} → ${acwrNew?.toFixed(2)}\n`);

console.log('Before(TRIMP) → After(output/threshold), sample of 8:');
for (const e of examples) console.log(`  ${e.date} ${e.type.padEnd(4)} ${String(e.before).padStart(4)} → ${String(e.after).padStart(4)}  (${e.method}, Δ ${e.delta>=0?'+':''}${e.delta})`);

console.log(`\nDRAMATIC MOVERS (|Δ| ≥ 25 load pts — worth your eye): ${movers.length}`);
for (const m of movers.slice(0, 15))
  console.log(`  ${m.date} ${m.type.padEnd(4)} ${String(m.before).padStart(4)} → ${String(m.after).padStart(4)}  Δ ${m.delta>=0?'+':''}${m.delta}  (power ${m.power ?? '—'}, avgHR ${m.hr ?? '—'})`);
console.log(`\n${movers.length===0?'→ near-no-op on magnitude; the correction removes the fabrication without swinging load.':'→ the movers above are where TRIMP-on-60 over/under-scored vs real output. Review before deploy.'}`);
