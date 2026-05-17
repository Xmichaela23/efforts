#!/usr/bin/env node
/**
 * Verify the cycling fact-packet IF/VI canonical-source fix.
 *
 * Selects ride workouts where the STORED fact packet's variability_index /
 * intensity_factor disagree with computed.analysis.power.* (the canonical
 * analyzer values) — i.e. exactly the rides the fix targets, found by the
 * discrepancy itself rather than by guessing IDs. For each, replays the
 * recompute-workout chain (compute-workout-analysis → analyze-cycling-workout)
 * with the service-role token, then re-reads and asserts the fact packet now
 * matches the canonical numbers. Prints classified_type before → after.
 *
 * Usage: node scripts/verify-cycling-vi-if-fix.mjs [--limit N] [--days N] [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) || 10 : 10;
const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) || 120 : 120;
const dryRun = args.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, KEY);
const r2 = (x) => (x == null || !Number.isFinite(Number(x))) ? null : Math.round(Number(x) * 100) / 100;
const differs = (a, b) => a != null && b != null && Math.abs(a - b) > 0.011;

async function fetchRides() {
  const sinceIso = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('workouts')
    .select('id, date, fp:workout_analysis->fact_packet_v1->facts, cap:computed->analysis->power')
    .eq('type', 'ride')
    .gte('date', sinceIso)
    .order('date', { ascending: false })
    .limit(400);
  if (error) { console.error('❌ query error:', error); process.exit(1); }
  return data || [];
}

function rowMetrics(w) {
  const fp = w.fp || {};
  const cap = w.cap || {};
  return {
    id: w.id, date: w.date,
    fpVi: r2(fp.variability_index), fpIf: r2(fp.intensity_factor), fpType: fp.classified_type ?? null,
    capVi: r2(cap.variability_index), capIf: r2(cap.intensity_factor), capNp: cap.normalized_power ?? null,
  };
}

async function invoke(fn, workout_id) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: KEY },
    body: JSON.stringify({ workout_id }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

const pad = (s, n) => String(s ?? '').padEnd(n);
function printRow(m) {
  const flag = (differs(m.fpVi, m.capVi) || differs(m.fpIf, m.capIf)) ? '❌ DIFF' : '✓ match';
  console.log(
    `  ${pad(m.id?.slice(0, 8), 9)} ${pad(m.date, 11)} ` +
    `fpVI ${pad(m.fpVi, 5)} capVI ${pad(m.capVi, 5)} | ` +
    `fpIF ${pad(m.fpIf, 5)} capIF ${pad(m.capIf, 5)} | ` +
    `${pad(m.fpType, 13)} ${flag}`
  );
}

async function main() {
  console.log(`🔍 ride workouts, last ${days}d, fact-packet VI/IF vs computed.analysis.power.*\n`);
  const rows = (await fetchRides()).map(rowMetrics)
    .filter((m) => m.capVi != null || m.capIf != null) // fix only applies where canonical exists
    .filter((m) => differs(m.fpVi, m.capVi) || differs(m.fpIf, m.capIf));

  if (rows.length === 0) { console.log('✅ No discrepant rides found — nothing to verify (or already consistent).'); return; }

  const target = rows.slice(0, limit);
  console.log(`Found ${rows.length} discrepant ride(s); verifying ${target.length}:\n`);
  console.log('BEFORE:'); target.forEach(printRow);

  if (dryRun) { console.log('\n[DRY RUN] no recompute performed.'); return; }

  console.log('\n♻️  recompute chain (compute-workout-analysis → analyze-cycling-workout)…');
  for (const m of target) {
    process.stdout.write(`  ${m.id.slice(0, 8)} … `);
    try {
      await invoke('compute-workout-analysis', m.id);
      await new Promise((r) => setTimeout(r, 400));
      await invoke('analyze-cycling-workout', m.id);
      console.log('done');
    } catch (e) { console.log(`FAILED: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 600));
  }

  await new Promise((r) => setTimeout(r, 1500));
  const afterRows = (await fetchRides()).map(rowMetrics);
  const byId = new Map(afterRows.map((m) => [m.id, m]));

  console.log('\nAFTER:');
  let allMatch = true;
  for (const before of target) {
    const a = byId.get(before.id);
    if (!a) { console.log(`  ${before.id.slice(0, 8)} — not found post-recompute`); allMatch = false; continue; }
    printRow(a);
    const matched = !differs(a.fpVi, a.capVi) && !differs(a.fpIf, a.capIf);
    if (!matched) allMatch = false;
    console.log(
      `      classified_type: ${before.fpType ?? 'null'} → ${a.fpType ?? 'null'}` +
      `${before.fpType !== a.fpType ? '  (RECLASSIFIED)' : ''}` +
      `   fact-packet now ${matched ? 'matches' : 'STILL DIFFERS from'} canonical`
    );
  }
  console.log(`\n${allMatch ? '✅ All verified rides: fact packet now == computed.analysis.power.*' : '❌ Some rides still diverge — investigate.'}`);
  process.exit(allMatch ? 0 : 1);
}

main().catch((e) => { console.error('❌ Fatal:', e); process.exit(1); });
