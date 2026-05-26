#!/usr/bin/env node
/**
 * D-063 test harness — plan-generation differentiation matrix.
 *
 * Generates 486 plans (3 × 3 × 3 × 3 × 2 × 3) via the production
 * `generate-combined-plan` edge function in PREVIEW mode (no DB writes,
 * no plan persistence — preview short-circuits before `.from('plans').insert`).
 *
 * Per combination:
 *   - Build a synthetic athlete_state + goal
 *   - POST to the edge function with `preview: true`
 *   - Render the sessions_by_week response as athlete-facing markdown
 *   - Run a set of assertions (see ASSERTIONS section)
 *   - Append result to the matrix report
 *
 * Run from repo root:
 *   node scripts/plan-generation-matrix.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from /Users/michaelambp/efforts/.env.
 * Concurrency capped at 4 simultaneous invocations; the run is RESUMABLE — if a
 * markdown file already exists for a combo, it skips re-generation but still
 * re-runs the assertions against the cached file. Delete plan-test-output/ to
 * fully reset.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'plan-test-output');
const REPORT_PATH = join(OUTPUT_DIR, 'plan-matrix-report.md');

// ── env / config ────────────────────────────────────────────────────────────
function parseEnvFile(path) {
  const txt = readFileSync(path, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
const env = parseEnvFile('/Users/michaelambp/efforts/.env');
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Test user — michaela@test.com (resolved earlier in this project's history).
// preview: true means the plan is NOT persisted to this user's account.
const TEST_USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const FN_URL = `${SUPABASE_URL}/functions/v1/generate-combined-plan`;

// ── combination matrix ─────────────────────────────────────────────────────
const TRAINING_INTENTS = ['performance', 'completion', 'first_race'];
const SWIM_EXPERIENCES = ['learning', 'intermediate', 'advanced'];
const STRENGTH_INTENTS = ['performance', 'durability', 'none'];
const EQUIPMENT_TIERS = ['full_barbell', 'dumbbell_based', 'bodyweight_bands'];
const RACE_DISTANCES = ['70.3', 'full'];
const WEEKLY_HOURS = [8, 11, 14];

const COMBOS = [];
for (const ti of TRAINING_INTENTS) {
  for (const swimExp of SWIM_EXPERIENCES) {
    for (const si of STRENGTH_INTENTS) {
      for (const eq of EQUIPMENT_TIERS) {
        for (const dist of RACE_DISTANCES) {
          for (const hrs of WEEKLY_HOURS) {
            COMBOS.push({ ti, swimExp, si, eq, dist, hrs });
          }
        }
      }
    }
  }
}
console.error(`[harness] ${COMBOS.length} combinations queued`);
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ── build request body per combo ───────────────────────────────────────────
const START_DATE = '2026-05-22'; // Friday
const RACE_70_3 = '2026-09-13';  // Sunday — ~17 weeks from May 22
const RACE_FULL = '2026-10-11';  // Sunday — ~21 weeks from May 22

function fileNameFor(c) {
  return `${c.ti}_${c.swimExp}_${c.si}_${c.eq}_${c.dist}_${c.hrs}hr.md`.replace('70.3', '703');
}

function buildRequest(c) {
  const swim_intent = c.swimExp === 'learning' ? 'focus' : 'race';
  const strength_intent = c.si === 'performance' ? 'performance' : c.si === 'durability' ? 'support' : null;
  const strength_protocol = c.si === 'performance'
    ? 'triathlon_performance'
    : c.si === 'durability'
      ? 'triathlon'
      : null;
  const limiter_sport = 'run';
  const tri_approach = c.ti === 'performance' ? 'race_peak' : 'base_first';
  const event_date = c.dist === '70.3' ? RACE_70_3 : RACE_FULL;

  const athlete_state = {
    current_ctl: 60,
    weekly_hours_available: c.hrs,
    loading_pattern: '3:1', // overridden by training_intent (D-061)
    limiter_sport,
    rest_days: [1], // Monday rest
    long_run_day: 0,  // Sunday
    long_ride_day: 6, // Saturday
    swim_easy_day: 1,
    swim_quality_day: 4,
    swim_third_day: c.swimExp === 'learning' ? 2 : undefined,
    run_quality_day: 3,
    run_easy_day: 5,
    bike_quality_day: 2,
    bike_easy_day: 3,
    training_intent: c.ti,
    tri_approach,
    swim_intent,
    swim_experience: c.swimExp,
    ...(strength_intent ? { strength_intent } : {}),
    ...(strength_protocol ? { strength_protocol } : {}),
    ...(c.si !== 'none'
      ? { equipment_type: c.eq, strength_sessions_cap: c.si === 'performance' ? 2 : 1 }
      : { strength_sessions_cap: 0 }),
    bike_ftp: 220,
    run_threshold_pace: '8:00',
    swim_threshold_pace: '2:00',
  };

  const goals = [{
    id: `test-${c.ti}-${c.swimExp}-${c.si}-${c.eq}-${c.dist}-${c.hrs}`,
    event_name: `Test ${c.dist} race`,
    event_date,
    distance: c.dist,
    sport: 'triathlon',
    priority: 'A',
  }];

  return {
    user_id: TEST_USER_ID,
    goals,
    athlete_state,
    start_date: START_DATE,
    preview: true,
  };
}

// ── phase resolver ─────────────────────────────────────────────────────────
function phaseForWeek(phases, weekNum) {
  if (!Array.isArray(phases) || phases.length === 0) return '?';
  let p = phases[0]?.name ?? '?';
  for (const ph of phases) {
    if (ph.start_week <= weekNum) p = ph.name;
  }
  return p;
}

// ── markdown render ────────────────────────────────────────────────────────
// `sessions_by_week[N]` is a FLAT array of session objects (not {days,phase,is_recovery}).
function renderMarkdown(c, response) {
  const lines = [];
  lines.push(`# Test Plan — ${c.ti} / ${c.swimExp} / ${c.si} / ${c.eq} / ${c.dist} / ${c.hrs}hr`);
  lines.push('');
  lines.push(`**Loading pattern:** ${response.preview?.loading_pattern ?? '?'}`);
  lines.push(`**Total weeks:** ${response.total_weeks ?? '?'}`);
  lines.push(`**Peak weekly TSS:** ${response.preview?.peak_weekly_tss ?? '?'}`);
  lines.push(`**Avg weekly TSS:** ${response.preview?.avg_weekly_tss ?? '?'}`);
  lines.push('');
  lines.push('## Sessions by week');
  lines.push('');
  const sbw = response.sessions_by_week ?? {};
  const phases = response.plan_contract_v1?.phases ?? [];
  const weekNums = Object.keys(sbw).map(Number).sort((a, b) => a - b);
  for (const w of weekNums) {
    const sessions = Array.isArray(sbw[w]) ? sbw[w] : [];
    const phaseName = phaseForWeek(phases, w);
    const weekTss = sessions.reduce((s, x) => s + (x.weighted_tss ?? 0), 0);
    lines.push(`### Week ${w} — ${phaseName} (TSS ${Math.round(weekTss)})`);
    // Group by day
    const byDay = {};
    for (const s of sessions) {
      const d = s.day ?? '?';
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(s);
    }
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      const ds = byDay[day] ?? [];
      if (ds.length === 0) continue;
      lines.push(`- **${day}**`);
      for (const s of ds) {
        lines.push(`  - ${s.name ?? '?'} (${s.type ?? '?'} · ${s.duration ?? '?'}min · ${s.intensity_class ?? '?'})`);
        if (s.description) lines.push(`    ${s.description}`);
      }
    }
    lines.push('');
  }
  if (Array.isArray(response.generation_trade_offs) && response.generation_trade_offs.length > 0) {
    lines.push('## Trade-offs');
    for (const t of response.generation_trade_offs) {
      lines.push(`- ${t.message_template_id ?? '?'}: ${JSON.stringify(t.variables ?? {})}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── assertions ─────────────────────────────────────────────────────────────
function runAssertions(c, response, markdown) {
  const fails = [];
  const sbw = response.sessions_by_week ?? {};
  const phases = response.plan_contract_v1?.phases ?? [];
  const weekNums = Object.keys(sbw).map(Number).sort((a, b) => a - b);

  // 1. Week count
  const expectedMinWeeks = c.dist === '70.3' ? 17 : 20;
  if (weekNums.length < expectedMinWeeks - 1) {
    fails.push(`week_count: expected ≥${expectedMinWeeks - 1} weeks, got ${weekNums.length}`);
  }

  // Collect all sessions (flat-array shape: sessions_by_week[N] is Session[]).
  const allSessions = [];
  for (const w of weekNums) {
    const sessions = Array.isArray(sbw[w]) ? sbw[w] : [];
    for (const s of sessions) allSessions.push({ week: w, ...s });
  }

  // 2. ≥2 swims/week in build phase (skip recovery weeks — detected by lower TSS).
  const buildWeeks = weekNums.filter((w) => phaseForWeek(phases, w) === 'build');
  // Recovery detection: TSS < 75% of the build-phase PEAK. Median is unsafe for
  // `1:1` loading patterns (first_race / comeback intents) where every-other-week
  // recovery makes the median fall between build and recovery TSS — the recovery
  // weeks then test as `> 0.75 × median` and get treated as build, producing
  // false-positive swim_freq failures. Peak is robust because recovery weeks
  // are by spec ≤0.65× of peak build TSS, which is always < 0.75 × peak.
  const buildTss = buildWeeks.map((w) => (Array.isArray(sbw[w]) ? sbw[w] : []).reduce((s, x) => s + (x.weighted_tss ?? 0), 0));
  const buildPeak = buildTss.length > 0 ? Math.max(...buildTss) : 0;
  const recoveryCutoff = buildPeak * 0.75;
  for (const w of buildWeeks) {
    const sessions = Array.isArray(sbw[w]) ? sbw[w] : [];
    const weekTss = sessions.reduce((s, x) => s + (x.weighted_tss ?? 0), 0);
    if (weekTss < recoveryCutoff) continue; // skip recovery weeks
    const swimCount = sessions.filter((s) => s?.type === 'swim').length;
    if (swimCount < 2) {
      fails.push(`swim_freq_build_w${w}: expected ≥2 swims in non-recovery build week, got ${swimCount}`);
      break;
    }
  }

  // 3. Strength when intent !== none
  if (c.si !== 'none') {
    const strengthCount = allSessions.filter((s) => s.type === 'strength').length;
    if (strengthCount === 0) {
      fails.push(`strength_present: intent=${c.si} but 0 strength sessions emitted`);
    }
  }

  // 4. No "Interval 1" on single-segment steady sessions
  if (/Interval\s+1\b/.test(markdown)) {
    fails.push(`interval_1_label: "Interval 1" label leaked into a session`);
  }

  // 5. No "Route 53" or auto-generated route names
  if (/Route\s+\d+\b/.test(markdown)) {
    fails.push(`route_name_leak: auto-generated route name pattern leaked into output`);
  }

  // 6. No "Hybrid Strength Athlete" label
  if (/Hybrid Strength Athlete/.test(markdown)) {
    fails.push(`hybrid_label_leak: "Hybrid Strength Athlete" label found (D-056 Item 3 renamed it)`);
  }

  // 7. Drill rotation — no same drill consecutive weeks in same session type
  //    (rough check: look for sequential weeks where the same drill name repeats in the same session-type)
  const drillByWeekAndType = {};
  for (const s of allSessions) {
    if (s.type !== 'swim') continue;
    const drillMatch = (s.description ?? '').match(/Prescribed drills?:\s*([^.]+)/i);
    if (!drillMatch) continue;
    const drills = drillMatch[1].split(/[;,]/).map((x) => x.trim().toLowerCase().replace(/\(.*?\)/g, '').trim());
    const key = `${s.week}|${s.name?.split(' — ')[0] ?? '?'}`;
    drillByWeekAndType[key] = drills;
  }
  // For each (sessionType, weekN), check (sessionType, weekN+1) doesn't share drills
  const seenViolation = new Set();
  for (const [key, drills] of Object.entries(drillByWeekAndType)) {
    const [w, type] = key.split('|');
    const nextKey = `${Number(w) + 1}|${type}`;
    const nextDrills = drillByWeekAndType[nextKey];
    if (!nextDrills) continue;
    const overlap = drills.filter((d) => d && nextDrills.includes(d));
    if (overlap.length > 0 && !seenViolation.has(type)) {
      fails.push(`drill_consecutive_${type.replace(/\s+/g, '_')}: drill "${overlap[0]}" repeats W${w}→W${Number(w) + 1} on ${type}`);
      seenViolation.add(type);
    }
  }

  // 8. Recovery cadence matches training_intent (loading_pattern is the canonical signal).
  const expectedPattern = c.ti === 'performance' ? '3:1' : c.ti === 'completion' ? '2:1' : '1:1';
  const actualPattern = response.preview?.loading_pattern;
  if (actualPattern !== expectedPattern) {
    fails.push(`loading_pattern: training_intent=${c.ti} expected ${expectedPattern}, got ${actualPattern}`);
  }

  // 9. No internal jargon in session descriptions (Z-codes, CSS, threshold-as-word)
  //    Check SWIM sessions specifically — these had a §0.5 vocab pass (D-053).
  const swimSessions = allSessions.filter((s) => s.type === 'swim');
  for (const s of swimSessions) {
    const desc = String(s.description ?? '');
    // Allow "threshold" inside step-token-prefixed contexts (description shouldn't have them but defensive)
    if (/\bZ[1-5]\b/.test(desc)) {
      fails.push(`swim_jargon_Z: "${desc.match(/\bZ[1-5]\b/)?.[0]}" in swim description (W${s.week})`);
      break;
    }
    if (/\bCSS\b/.test(desc) || /Critical Swim Speed/i.test(desc)) {
      fails.push(`swim_jargon_CSS: "CSS" in swim description (W${s.week})`);
      break;
    }
    // "threshold" as a standalone word in athlete copy is banned per §0.5
    if (/\bthreshold\b/i.test(desc) && !/threshold pace/.test(desc)) {
      // Allow the "100yd pace" reference; flag standalone "threshold" use
      fails.push(`swim_jargon_threshold: "threshold" used in swim description (W${s.week})`);
      break;
    }
  }

  return fails;
}

// ── invoke + cache ─────────────────────────────────────────────────────────
async function invokePlanGen(body) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// Set NO_CACHE=1 to force re-invocation even when sidecar JSON exists on disk.
// Needed after engine edits — otherwise the harness reads the pre-fix response
// from a previous run and the matrix numbers look unchanged.
const NO_CACHE = !!process.env.NO_CACHE;

async function processOne(c) {
  const file = join(OUTPUT_DIR, fileNameFor(c));
  let markdown;
  let response;
  const sidecar = file.replace(/\.md$/, '.json');
  if (!NO_CACHE && existsSync(file) && existsSync(sidecar)) {
    response = JSON.parse(readFileSync(sidecar, 'utf8'));
    markdown = readFileSync(file, 'utf8');
  } else {
    const body = buildRequest(c);
    response = await invokePlanGen(body);
    markdown = renderMarkdown(c, response);
    writeFileSync(file, markdown);
    writeFileSync(sidecar, JSON.stringify(response));
  }
  const fails = runAssertions(c, response, markdown);
  return { combo: c, file: fileNameFor(c), fails };
}

// ── concurrent dispatch ────────────────────────────────────────────────────
const CONCURRENCY = 4;

async function runMatrix() {
  const results = [];
  let done = 0;
  let errored = 0;
  const t0 = Date.now();
  const queue = [...COMBOS];

  async function worker(id) {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) break;
      try {
        const r = await processOne(c);
        results.push(r);
        if (r.fails.length > 0) {
          process.stderr.write(`F`);
        } else {
          process.stderr.write(`.`);
        }
      } catch (e) {
        errored += 1;
        results.push({ combo: c, file: fileNameFor(c), fails: [`error: ${e.message}`] });
        process.stderr.write(`E`);
      }
      done += 1;
      if (done % 20 === 0) {
        const sec = (Date.now() - t0) / 1000;
        const rate = done / sec;
        const remain = (COMBOS.length - done) / rate;
        process.stderr.write(` [${done}/${COMBOS.length} · ${(rate * 60).toFixed(1)}/min · ETA ${remain.toFixed(0)}s]\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  console.error(`\n[harness] done in ${((Date.now() - t0) / 1000).toFixed(1)}s; errored=${errored}`);
  return results;
}

// ── report ─────────────────────────────────────────────────────────────────
function writeReport(results) {
  const passed = results.filter((r) => r.fails.length === 0);
  const failed = results.filter((r) => r.fails.length > 0);
  const lines = [];
  lines.push('# Plan Generation Matrix Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total combinations:** ${results.length}`);
  lines.push(`**Passed:** ${passed.length}`);
  lines.push(`**Failed:** ${failed.length}`);
  lines.push('');
  if (failed.length > 0) {
    lines.push('## Failures');
    lines.push('');
    // Group by assertion type for easier triage.
    const byAssertion = {};
    for (const r of failed) {
      for (const f of r.fails) {
        const key = f.split(':')[0];
        if (!byAssertion[key]) byAssertion[key] = [];
        byAssertion[key].push({ combo: r.combo, file: r.file, message: f });
      }
    }
    for (const [key, items] of Object.entries(byAssertion).sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`### ${key} (${items.length} combos)`);
      lines.push('');
      for (const it of items.slice(0, 20)) {
        const c = it.combo;
        lines.push(`- \`${c.ti}/${c.swimExp}/${c.si}/${c.eq}/${c.dist}/${c.hrs}hr\` — ${it.message}`);
      }
      if (items.length > 20) lines.push(`- ... ${items.length - 20} more (see individual md files)`);
      lines.push('');
    }
  }
  writeFileSync(REPORT_PATH, lines.join('\n'));
  console.error(`[harness] report written to ${REPORT_PATH}`);
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  const results = await runMatrix();
  writeReport(results);
  const passed = results.filter((r) => r.fails.length === 0).length;
  const failed = results.length - passed;
  console.error(`\n=== SUMMARY ===`);
  console.error(`total: ${results.length}`);
  console.error(`pass:  ${passed}`);
  console.error(`fail:  ${failed}`);
})().catch((e) => {
  console.error('[harness] fatal error:', e);
  process.exit(1);
});
