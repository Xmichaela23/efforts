#!/usr/bin/env node
/**
 * Backfill adaptation metrics for existing workouts.
 *
 * Calls the CHEAP lane: compute-adaptation-metrics (NOT compute-workout-analysis).
 *
 * Usage:
 *   node scripts/backfill-adaptation-metrics.mjs --user-id <UUID>
 *   node scripts/backfill-adaptation-metrics.mjs --all-users
 *   node scripts/backfill-adaptation-metrics.mjs --dry-run --user-id <UUID>
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      i++;
    } else {
      args.set(key, true);
    }
  }
  return args;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

async function invokeComputeAdaptation(workoutId, supabaseUrl, serviceKey) {
  const functionUrl = `${supabaseUrl}/functions/v1/compute-adaptation-metrics`;
  const resp = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({ workout_id: workoutId }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function main() {
  const args = parseArgs(process.argv);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const userId = args.get('user-id');
  const allUsers = !!args.get('all-users');
  const dryRun = !!args.get('dry-run');

  if (!userId && !allUsers) {
    console.error('❌ Provide --user-id <UUID> or --all-users');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 183); // ~6 months

  const startISO = isoDate(start);
  const endISO = isoDate(now);

  console.log(`📦 Backfill window: ${startISO} → ${endISO}`);
  console.log(`🔎 Mode: ${dryRun ? 'dry-run' : 'write'}`);
  console.log(`👤 Scope: ${allUsers ? 'all users' : userId}\n`);

  const pageSize = 200;
  let offset = 0;

  let scanned = 0;
  let eligible = 0;
  let invoked = 0;
  let errors = 0;

  while (true) {
    let q = supabase
      .from('workouts')
      .select('id,user_id,date,computed')
      .eq('workout_status', 'completed')
      .gte('date', startISO)
      .lte('date', endISO)
      .order('date', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (!allUsers) q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) break;

    scanned += rows.length;

    const missing = rows.filter((r) => {
      const c = safeJson(r.computed) || {};
      return !c.adaptation;
    });

    eligible += missing.length;

    if (!dryRun) {
      for (let i = 0; i < missing.length; i++) {
        const row = missing[i];
        try {
          await invokeComputeAdaptation(row.id, supabaseUrl, serviceKey);
          invoked++;
        } catch (e) {
          errors++;
          console.error(`❌ ${row.id} (${row.date}) failed: ${e?.message || e}`);
        }

        if (invoked % 50 === 0) {
          console.log(`… progress: scanned=${scanned}, eligible=${eligible}, invoked=${invoked}, errors=${errors}`);
        }

        // Gentle rate limiting
        await sleep(100);
      }
    }

    offset += pageSize;
  }

  console.log('\n📊 Summary');
  console.log(`- scanned:   ${scanned}`);
  console.log(`- eligible:  ${eligible} (missing computed.adaptation)`);
  console.log(`- invoked:   ${dryRun ? 0 : invoked}`);
  console.log(`- errors:    ${errors}`);
  console.log(`- dry_run:   ${dryRun}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

