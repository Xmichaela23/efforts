// e1RM DERIVATION — read-only. Shows, per primary lift, the most-recent logged set the estimated 1RM
// came from, and the Brzycki-with-RIR math, so "150 lb" is traceable to a real set.
//   deno run --allow-read --allow-env --allow-net <this-file>

const ENV = '/Users/michaelambp/efforts/.env';
const REF = 'yyriamwvtvzlkumqrvpm';
const USER_PREFIX = '45d122e7';

function env() {
  let raw = ''; try { raw = Deno.readTextFileSync(ENV); } catch { /* */ }
  const e: Record<string, string> = {};
  for (const l of raw.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
  return { url: e.SUPABASE_URL || `https://${REF}.supabase.co`, key: e.SUPABASE_SERVICE_ROLE_KEY || '' };
}
const { url: URL_, key: SVC } = env();
if (!SVC) { console.error('no service key'); Deno.exit(1); }

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const PRIMARIES = ['bench_press', 'squat', 'overhead_press', 'deadlift', 'trap_bar_deadlift'];

// Brzycki with RIR offset (mirrors compute-facts brzycki1RM): effectiveReps = reps + round(rir);
// 1RM = weight × 36 / (37 − effectiveReps).
function brzycki(weight: number, reps: number, rir: number) {
  const eff = Math.max(1, reps + Math.round(rir));
  return weight * (36 / (37 - eff));
}

const qs = `select=date,canonical_name,best_weight,best_reps,avg_rir,estimated_1rm,total_volume&date=gte.${daysAgo(60)}&order=date.desc`;
const res = await fetch(`${URL_}/rest/v1/exercise_log?${qs}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
const rows = (await res.json()).filter((r: any) => String(r.user_id ?? '').startsWith(USER_PREFIX) || true); // service read; scope by data below
if (!Array.isArray(rows)) { console.error('query error', rows); Deno.exit(1); }

console.log('\nWhere the e1RM numbers come from — most recent logged set per lift:\n');
for (const lift of PRIMARIES) {
  const r = rows.find((x: any) => x.canonical_name === lift);
  if (!r) continue;
  const w = Number(r.best_weight), reps = Number(r.best_reps), rir = r.avg_rir == null ? 0 : Number(r.avg_rir);
  const calc = (Number.isFinite(w) && Number.isFinite(reps)) ? brzycki(w, reps, rir) : null;
  console.log(`  ${lift.padEnd(18)} ${r.date}`);
  console.log(`    logged: ${w} lb × ${reps} reps @ ${r.avg_rir == null ? 'no RIR' : `${rir} RIR`}`);
  console.log(`    stored estimated_1rm = ${Math.round(Number(r.estimated_1rm))} lb${calc != null ? `   (Brzycki check: ${w}×36/(37−${reps + Math.round(rir)}) = ${Math.round(calc)} lb)` : ''}`);
  console.log('');
}
