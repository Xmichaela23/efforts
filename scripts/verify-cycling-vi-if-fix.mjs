#!/usr/bin/env node
/**
 * Verify / backfill the cycling fact-packet classifier inputs.
 *
 * Default mode: selects ride workouts where the STORED fact packet's
 * variability_index / intensity_factor disagree with computed.analysis.power.*
 * (the canonical analyzer values) — the rides the IF/VI fix (D-015) targets,
 * found by the discrepancy itself rather than by guessing IDs.
 *
 * --all (wide backfill): process EVERY ride in the window, not just discrepant
 * ones. Use after a classifier-input change (e.g. D-016 elevation source) so
 * every ride's stored classified_type is re-derived — needed for the
 * type-filtered pwr20_trend_v1 to reach ≥3 same-type rides (Q-008 / SESSION-
 * CONTEXT #2).
 *
 * Both modes replay the recompute-workout chain (compute-workout-analysis →
 * analyze-cycling-workout) with the service-role token, then re-read and report
 * classified_type before → after and fact-packet-vs-canonical convergence.
 *
 * Usage: node scripts/verify-cycling-vi-if-fix.mjs [--all] [--limit N] [--days N] [--dry-run]
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
const all = args.includes('--all');
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) || 10 : (all ? 1000 : 10);
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
    .limit(1000);
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
  const modeLabel = all
    ? 'ALL rides (wide backfill — re-derive every stored classified_type)'
    : 'discrepancy only (fact-packet VI/IF vs computed.analysis.power.*)';
  console.log(`🔍 ride workouts, last ${days}d — ${modeLabel}\n`);

  const allRows = (await fetchRides()).map(rowMetrics);
  const candidates = all
    ? allRows
    : allRows
        .filter((m) => m.capVi != null || m.capIf != null) // fix only applies where canonical exists
        .filter((m) => differs(m.fpVi, m.capVi) || differs(m.fpIf, m.capIf));

  if (candidates.length === 0) { console.log('✅ Nothing to process.'); return; }

  const target = candidates.slice(0, limit);
  console.log(`Scope: ${allRows.length} ride(s) in window; ${candidates.length} selected; processing ${target.length}.\n`);
  if (!all) { console.log('BEFORE:'); target.forEach(printRow); console.log(''); }

  if (dryRun) { console.log('[DRY RUN] no recompute performed.'); return; }

  console.log('♻️  recompute chain (compute-workout-analysis → analyze-cycling-workout)…');
  let ok = 0, fail = 0;
  for (let i = 0; i < target.length; i++) {
    const m = target[i];
    process.stdout.write(`  [${i + 1}/${target.length}] ${m.id.slice(0, 8)} … `);
    try {
      await invoke('compute-workout-analysis', m.id);
      await new Promise((r) => setTimeout(r, 350));
      await invoke('analyze-cycling-workout', m.id);
      ok++; console.log('done');
    } catch (e) { fail++; console.log(`FAILED: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`\nrecompute: ${ok} ok, ${fail} failed.`);

  await new Promise((r) => setTimeout(r, 2000));
  const byId = new Map((await fetchRides()).map(rowMetrics).map((m) => [m.id, m]));

  const reclassified = [];
  let stillDiverge = 0, capChecked = 0, missing = 0;
  for (const before of target) {
    const a = byId.get(before.id);
    if (!a) { missing++; continue; }
    if (before.fpType !== a.fpType) {
      reclassified.push({ id: a.id.slice(0, 8), date: a.date, from: before.fpType ?? 'null', to: a.fpType ?? 'null' });
    }
    if (a.capVi != null || a.capIf != null) {
      capChecked++;
      if (differs(a.fpVi, a.capVi) || differs(a.fpIf, a.capIf)) stillDiverge++;
    }
  }

  console.log(`\n── Reclassifications (${reclassified.length}/${target.length}) ──`);
  for (const r of reclassified) console.log(`  ${r.id}  ${pad(r.date, 11)}  ${pad(r.from, 13)} → ${r.to}`);
  if (reclassified.length === 0) console.log('  (none — stored types already reflected the current logic)');

  console.log(`\nfact-packet vs canonical: ${capChecked - stillDiverge}/${capChecked} match (${stillDiverge} still diverge)${missing ? `; ${missing} not found post-recompute` : ''}.`);
  const clean = stillDiverge === 0 && fail === 0 && missing === 0;
  console.log(clean
    ? '✅ Backfill complete; all cap-present rides consistent.'
    : '❌ Investigate: failures / divergence / missing rows above.');
  process.exit(clean ? 0 : 1);
}

main().catch((e) => { console.error('❌ Fatal:', e); process.exit(1); });
