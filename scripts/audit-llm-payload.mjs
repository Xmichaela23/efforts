#!/usr/bin/env node
/**
 * One-off audit script — dumps the LLM input payload + is_first_post_race_run
 * reconstruction for the most recent completed run workout for a given email.
 *
 * Read-only. No mutations.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/audit-llm-payload.mjs [email] [workout_id?]
 *
 * Defaults: email = michaelangelos@me.com, workout_id = most recent completed run.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const email = process.argv[2] || 'michaelangelos@me.com';
const explicitWorkoutId = process.argv[3] || null;

function calendarDaysBetween(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T12:00:00.000Z').getTime();
  const b = new Date(toYmd + 'T12:00:00.000Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

async function main() {
  // 1. Resolve user via auth admin API (auth.users is not exposed to PostgREST)
  let userId = null;
  let page = 1;
  while (page <= 10 && !userId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (match) { userId = match.id; break; }
    if (!data?.users?.length || data.users.length < 1000) break;
    page += 1;
  }
  if (!userId) { console.error(`Could not find user with email ${email}`); process.exit(1); }
  console.log(`User: ${email}  →  ${userId}`);

  // 2. Find target workout
  let workoutId = explicitWorkoutId;
  let workoutRow;
  if (!workoutId) {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, user_id, date, type, distance, duration, workout_status')
      .eq('user_id', userId)
      .ilike('type', '%run%')
      .eq('workout_status', 'completed')
      .order('date', { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) { console.error('No completed run workouts found.'); process.exit(1); }
    console.log('\nRecent 5 completed runs:');
    data.forEach((w, i) => console.log(`  [${i}] ${w.date}  id=${w.id}  ${(w.distance ?? '?')} mi  ${(w.duration ?? '?')}s`));
    workoutId = data[0].id;
    workoutRow = data[0];
    console.log(`\nUsing most recent: ${workoutId} (${workoutRow.date})`);
  } else {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, user_id, date, type, distance, duration')
      .eq('id', workoutId)
      .single();
    if (error) throw error;
    workoutRow = data;
  }

  const focusYmd = String(workoutRow.date).slice(0, 10);

  // 3. Pull workout_analysis (JSONB column on workouts, NOT a separate table)
  const { data: wRow, error: wErr } = await supabase
    .from('workouts')
    .select('id, date, updated_at, workout_analysis')
    .eq('id', workoutId)
    .single();
  if (wErr || !wRow?.workout_analysis) {
    console.error('No workout_analysis JSONB for', workoutId, wErr?.message);
    process.exit(1);
  }
  const wa = wRow.workout_analysis;
  // Note: workouts.updated_at does NOT advance on JSONB-only writes; trust
  // fact_packet_v1.generated_at as the true "last analyzed" timestamp.
  const lastAnalyzedAt = wa?.fact_packet_v1?.generated_at || wa?.ai_summary_generated_at || wRow.updated_at;
  const fp = wa?.fact_packet_v1 || {};
  const vsSimilar = fp?.derived?.comparisons?.vs_similar || null;
  const isMixedEffort = wa?.session_state_v1?.glance?.is_mixed_effort ?? null;
  const decoupling = {
    pct: fp?.derived?.cardiac_decoupling_pct ?? null,
    basis: fp?.derived?.decoupling_basis ?? null,
    assessment: fp?.derived?.decoupling_assessment ?? null,
  };
  const aiSummary = wa?.ai_summary || null;

  // 4. Reconstruct is_first_post_race_run
  // 4a. Find last completed goal-race event before focusYmd
  const { data: goalRows, error: goalErr } = await supabase
    .from('goals')
    .select('id, name, target_date, status, goal_type, priority, distance')
    .eq('user_id', userId)
    .eq('goal_type', 'event');
  if (goalErr) throw goalErr;
  const candidates = (goalRows || [])
    .filter((r) => String(r.status || '').toLowerCase() !== 'cancelled')
    .map((r) => ({ ...r, td: r.target_date ? String(r.target_date).slice(0, 10) : '' }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.td) && r.td < focusYmd)
    .sort((a, b) => b.td.localeCompare(a.td));
  const lastRace = candidates[0] || null;

  let runsSinceLastRace = null;
  let daysSinceLastRace = null;
  if (lastRace) {
    daysSinceLastRace = calendarDaysBetween(lastRace.td, focusYmd);
    const { data: runs, error: runsErr } = await supabase
      .from('workouts')
      .select('id, date, workout_status')
      .eq('user_id', userId)
      .ilike('type', '%run%')
      .eq('workout_status', 'completed')
      .gt('date', lastRace.td)
      .lte('date', focusYmd);
    if (runsErr) throw runsErr;
    runsSinceLastRace = (runs || []).length;
  }

  const isFirstPostRaceRun =
    (runsSinceLastRace ?? 999) <= 1 && (daysSinceLastRace ?? 999) <= 60;

  // 5. Report
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`WORKOUT ${workoutId}  date=${focusYmd}  is_mixed_effort=${isMixedEffort}`);
  console.log(`last_analyzed_at: ${lastAnalyzedAt}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('\n── is_first_post_race_run reconstruction ──');
  console.log(`  last_goal_race: ${lastRace ? `${lastRace.name} (${lastRace.distance || '?'}) @ ${lastRace.td}` : 'NONE'}`);
  console.log(`  days_since_last_goal_race: ${daysSinceLastRace}`);
  console.log(`  runs_since_last_race: ${runsSinceLastRace}`);
  console.log(`  is_first_post_race_run: ${isFirstPostRaceRun}  (need runs<=1 AND days<=60)`);

  console.log('\n── decoupling (from fact_packet_v1.derived) ──');
  console.log(`  pct: ${decoupling.pct}`);
  console.log(`  basis: ${decoupling.basis}`);
  console.log(`  assessment: ${decoupling.assessment}`);

  console.log('\n── vs_similar (raw, from fact_packet_v1.derived.comparisons) ──');
  if (!vsSimilar) {
    console.log('  null  (no comparison computed)');
  } else {
    console.log(`  sample_size: ${vsSimilar.sample_size}`);
    console.log(`  assessment: ${vsSimilar.assessment}`);
    console.log(`  pace_delta_sec: ${vsSimilar.pace_delta_sec}  (basis: ${vsSimilar.pace_basis})`);
    console.log(`  hr_delta_bpm: ${vsSimilar.hr_delta_bpm}`);
    console.log(`  drift_delta_bpm: ${vsSimilar.drift_delta_bpm}`);
    console.log(`  avg_pace_at_similar_hr: ${vsSimilar.avg_pace_at_similar_hr}`);
    console.log(`  avg_hr_drift: ${vsSimilar.avg_hr_drift}`);
    const tps = Array.isArray(vsSimilar.trend_points) ? vsSimilar.trend_points : [];
    console.log(`\n  trend_points (${tps.length}):`);
    console.log('    date         pace_sec_per_mi  pace(mm:ss/mi)  avg_hr  pace_basis');
    for (const tp of tps) {
      const p = Number(tp?.pace_sec_per_mi);
      const mm = Math.floor(p / 60);
      const ss = String(Math.round(p % 60)).padStart(2, '0');
      const paceStr = Number.isFinite(p) ? `${mm}:${ss}/mi` : '?';
      console.log(`    ${tp?.date || '?'}   ${String(tp?.pace_sec_per_mi ?? '?').padEnd(15)}  ${paceStr.padEnd(13)}  ${String(tp?.avg_hr ?? '?').padEnd(6)}  ${tp?.pace_basis ?? '?'}`);
    }
  }

  console.log('\n── AI summary (the rendered narrative) ──');
  console.log(aiSummary || '(none)');
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
