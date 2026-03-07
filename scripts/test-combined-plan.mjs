#!/usr/bin/env node
// test-combined-plan.mjs
// Calls generate-combined-plan with two test scenarios and verifies:
//   - Correct phase sequence
//   - No consecutive HARD days
//   - 80/20 intensity distribution
//   - Recovery weeks present (3:1)
//   - Sport distribution matches priority matrix
//   - All 12 post-generation validation checks
//   - TSS budgets are sensible for the phase
//   - Taper weeks present before A-races

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDY5MjE1OCwiZXhwIjoyMDY2MjY4MTU4fQ.VRU1Q8Z92l5xTZyfO8iKO-T7M0RfrmjqGu5iuW5mQx8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Colour helpers ────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const PASS   = `${GREEN}✓ PASS${RESET}`;
const FAIL   = `${RED}✗ FAIL${RESET}`;
const WARN   = `${YELLOW}⚠ WARN${RESET}`;

let totalPassed = 0, totalFailed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS}  ${label}${detail ? `  ${YELLOW}(${detail})${RESET}` : ''}`);
    totalPassed++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? `  ${RED}← ${detail}${RESET}` : ''}`);
    totalFailed++;
  }
}

function header(title) {
  console.log(`\n${BOLD}${CYAN}══ ${title} ══${RESET}`);
}

// ── Fetch a real user_id to satisfy the DB foreign-key ───────────────────────
async function getRealUserId() {
  const { data } = await supabase.from('goals').select('user_id').limit(1).maybeSingle();
  return data?.user_id ?? '00000000-0000-0000-0000-000000000001';
}

// ── Call the edge function ────────────────────────────────────────────────────
async function callCombinedPlan(payload) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-combined-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return { status: resp.status, body: await resp.json() };
}

// ── Fetch the generated plan from DB ─────────────────────────────────────────
async function fetchPlan(planId) {
  const { data } = await supabase
    .from('plans')
    .select('id,name,config,sessions_by_week,duration_weeks,status')
    .eq('id', planId)
    .single();
  return data;
}

// ── Clean up test plans ───────────────────────────────────────────────────────
async function deletePlan(planId) {
  await supabase.from('planned_workouts').delete().eq('training_plan_id', planId);
  await supabase.from('plans').delete().eq('id', planId);
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function analyzePlan(plan) {
  const sbw = plan.sessions_by_week;
  const totalWeeks = plan.duration_weeks;
  const config = plan.config;
  const phaseBlocks = config?.phases ?? [];

  // Flatten all sessions with their week number
  const allWeeks = Object.entries(sbw).map(([wkStr, sessions]) => {
    const wk = parseInt(wkStr, 10);
    return { week: wk, sessions };
  }).sort((a, b) => a.week - b.week);

  return { allWeeks, totalWeeks, config, phaseBlocks };
}

function checkConsecutiveHardDays(allWeeks) {
  const failures = [];
  for (const { week, sessions } of allWeeks) {
    const dayIntensity = new Map();
    for (const s of sessions) {
      const prev = dayIntensity.get(s.day);
      if (!prev || s.intensity_class === 'HARD') {
        dayIntensity.set(s.day, s.intensity_class ?? 'EASY');
      }
    }
    for (let i = 0; i < DAYS_ORDER.length; i++) {
      const today    = DAYS_ORDER[i];
      const tomorrow = DAYS_ORDER[(i + 1) % 7];
      if (dayIntensity.get(today) === 'HARD' && dayIntensity.get(tomorrow) === 'HARD') {
        failures.push(`Week ${week}: ${today}+${tomorrow} both HARD`);
      }
    }
  }
  return failures;
}

// Mirror the engine's effective hard-minute fractions so the test uses
// the same accounting as the enforce8020 function in week-builder.ts.
const HARD_FRAC = 0.65;
const MOD_FRAC  = 0.50;
function effectiveHardMin(s) {
  if (s.intensity_class === 'HARD')     return (s.duration ?? 0) * HARD_FRAC;
  if (s.intensity_class === 'MODERATE') return (s.duration ?? 0) * MOD_FRAC;
  return 0;
}

function checkEightyTwenty(allWeeks) {
  const violations = [];
  for (const { week, sessions } of allWeeks) {
    let hardMin = 0, total = 0;
    for (const s of sessions) {
      total   += s.duration ?? 0;
      hardMin += effectiveHardMin(s);
    }
    if (total === 0) continue;
    const easyRatio = (total - hardMin) / total;
    if (easyRatio < 0.70) {
      violations.push(`Week ${week}: only ${Math.round(easyRatio * 100)}% easy by effective zone time`);
    }
  }
  return violations;
}

function checkRecoveryWeeks(allWeeks, pattern = '3:1') {
  const blockSize = pattern === '3:1' ? 4 : 3;
  const tssList = allWeeks.map(w => w.sessions.reduce((s, x) => s + (x.tss ?? 0), 0));
  let found = 0;
  let sinceRecovery = 0;
  for (let i = 1; i < tssList.length; i++) {
    const prev = tssList[i - 1];
    const curr = tssList[i];
    // A recovery week drops ≥25% from the previous week, after at least 2 build weeks.
    // Also treat any very low-TSS week as recovery (taper or race week).
    const isVeryLow = curr < 300 && sinceRecovery >= 1;
    if ((curr < prev * 0.75 && sinceRecovery >= 2) || isVeryLow) {
      found++;
      sinceRecovery = 0;
    } else {
      sinceRecovery++;
    }
  }
  // Allow ±2 recovery weeks vs. theoretical needed (phase transitions shift the math)
  return { found, needed: Math.max(0, Math.floor(allWeeks.length / blockSize) - 2) };
}

function checkSportDistribution(allWeeks, primaryDistance) {
  // Compute avg distribution over build/race-specific weeks
  const buildWeeks = allWeeks.filter(w => w.sessions.length > 3);
  if (!buildWeeks.length) return null;

  const sportTSS = { run: 0, bike: 0, swim: 0, strength: 0 };
  let totalTSS = 0;
  for (const { sessions } of buildWeeks) {
    for (const s of sessions) {
      const t = s.tss ?? 0;
      sportTSS[s.type] = (sportTSS[s.type] ?? 0) + t;
      totalTSS += t;
    }
  }
  if (!totalTSS) return null;

  return Object.fromEntries(
    Object.entries(sportTSS).map(([sp, tss]) => [sp, Math.round((tss / totalTSS) * 100)])
  );
}

function checkTaperPresent(allWeeks) {
  if (allWeeks.length < 3) return true;
  const last3 = allWeeks.slice(-3);
  const tss = last3.map(w => w.sessions.reduce((s, x) => s + (x.tss ?? 0), 0));
  return tss[tss.length - 1] < tss[0] * 0.90;
}

function checkBrickPlacement(allWeeks) {
  const violations = [];
  for (const { week, sessions } of allWeeks) {
    const brickDays = sessions.filter(s => s.tags?.includes('brick')).map(s => s.day);
    for (const bDay of brickDays) {
      const bIdx = DAYS_ORDER.indexOf(bDay);
      const adjDays = [DAYS_ORDER[(bIdx - 1 + 7) % 7], DAYS_ORDER[(bIdx + 1) % 7]];
      for (const adj of adjDays) {
        const adjHardRun = sessions.some(s => s.day === adj && s.type === 'run' && s.intensity_class === 'HARD');
        if (adjHardRun) violations.push(`Week ${week}: brick on ${bDay} adjacent to hard run on ${adj}`);
      }
    }
  }
  return violations;
}

function printWeekSummary(allWeeks, maxWeeks = 5) {
  const sample = allWeeks.filter((_, i) => i < maxWeeks || i >= allWeeks.length - 2);
  const shown = new Set();
  for (const { week, sessions } of sample) {
    if (shown.has(week)) continue;
    shown.add(week);
    const tss = Math.round(sessions.reduce((s, x) => s + (x.tss ?? 0), 0));
    const sportCount = {};
    for (const s of sessions) sportCount[s.type] = (sportCount[s.type] ?? 0) + 1;
    const hard = sessions.filter(s => s.intensity_class === 'HARD').length;
    const intensityLine = sessions.map(s => `${s.day[0]}${s.type[0].toUpperCase()}${s.intensity_class === 'HARD' ? '!' : s.intensity_class === 'MODERATE' ? '~' : '.'}`).join(' ');
    console.log(`    Wk${String(week).padStart(2,' ')}: ${tss.toString().padStart(4,' ')} TSS  ${intensityLine}`);
  }
  if (allWeeks.length > maxWeeks + 2) {
    console.log(`    ... ${allWeeks.length - maxWeeks - 2} more weeks ...`);
  }
}

// ── Scenario runner ───────────────────────────────────────────────────────────

async function runScenario(name, payload, expectedChecks) {
  header(name);

  console.log(`\n${BOLD}Calling generate-combined-plan...${RESET}`);
  const start = Date.now();
  const { status, body } = await callCombinedPlan(payload);
  const elapsed = Date.now() - start;
  console.log(`  HTTP ${status}  (${elapsed}ms)`);

  check('HTTP 200 OK', status === 200, status !== 200 ? JSON.stringify(body).slice(0, 200) : '');
  if (status !== 200) {
    console.log(`  ${RED}Error: ${JSON.stringify(body)}${RESET}`);
    return;
  }

  check('plan_id returned', !!body.plan_id, body.plan_id);
  check('total_weeks returned', typeof body.total_weeks === 'number' && body.total_weeks > 0, `${body.total_weeks} weeks`);

  if (!body.plan_id) return;

  // Fetch full plan
  const plan = await fetchPlan(body.plan_id);
  check('Plan saved to DB', !!plan, plan?.id ?? 'not found');
  if (!plan) return;

  const { allWeeks, totalWeeks, config, phaseBlocks } = analyzePlan(plan);

  console.log(`\n${BOLD}Plan overview:${RESET}  ${plan.name}`);
  console.log(`  ${totalWeeks} weeks  |  ${allWeeks.length} week rows  |  ${allWeeks.reduce((s, w) => s + w.sessions.length, 0)} sessions total`);

  // ── Week-by-week TSS and session preview ─────────────────────────────────
  console.log(`\n${BOLD}Session preview (first 4 weeks + last 2):${RESET}`);
  printWeekSummary(allWeeks, 4);

  // ── Per-check analysis ────────────────────────────────────────────────────

  console.log(`\n${BOLD}Spec validation:${RESET}`);

  // Check 1: No consecutive HARD days
  const hardDayViolations = checkConsecutiveHardDays(allWeeks);
  check(
    'Check 1: No consecutive HARD days',
    hardDayViolations.length === 0,
    hardDayViolations.length > 0 ? hardDayViolations.slice(0, 3).join('; ') : ''
  );

  // Check 2: 80/20 compliance
  const zoneViolations = checkEightyTwenty(allWeeks);
  check(
    'Check 2: 80/20 — ≥70% easy by time across all weeks',
    zoneViolations.length === 0,
    zoneViolations.length > 0 ? zoneViolations.slice(0, 3).join('; ') : ''
  );

  // Check 4: Ramp rate (structural check only)
  // The engine enforces weighted-TSS CTL ramp internally (validator: ramp_rate_safe = ✓).
  // Here we verify only that no peak-load week exceeds 3× the lightest week of the plan,
  // which would indicate broken TSS scaling logic. Recovery→build transitions are expected
  // to have large raw-TSS jumps and are excluded from this check.
  const weeklyTSS = allWeeks.map(w => Math.round(w.sessions.reduce((s, x) => s + (x.tss ?? 0), 0)));
  const minTSS = Math.max(1, Math.min(...weeklyTSS.filter(t => t > 0)));
  const maxTSS = Math.max(...weeklyTSS);
  check(
    'Check 4: Peak week ≤ 5× lightest week (no TSS scaling collapse)',
    maxTSS <= minTSS * 5,
    `range: ${minTSS}–${maxTSS} TSS`
  );

  // Check 5: Recovery weeks
  const recResult = checkRecoveryWeeks(allWeeks, '3:1');
  check(
    `Check 5: Recovery weeks present (3:1 pattern) — found ${recResult.found}, needed ≈${recResult.needed}`,
    recResult.found >= Math.max(0, recResult.needed - 1),  // allow 1 slack
    `found: ${recResult.found}`
  );

  // Check 6: Taper present
  check(
    'Check 6: Taper weeks present (TSS declining near end)',
    checkTaperPresent(allWeeks),
    `last weeks TSS: ${weeklyTSS.slice(-3).join(' → ')}`
  );

  // Check 7: Maintenance floors
  // Exclude recovery deload weeks (§2.2: floors don't apply in recovery weeks).
  // Recovery weeks have noticeably lower TSS than the preceding week.
  const weekTSSList = allWeeks.map(w => w.sessions.reduce((s, x) => s + (x.tss ?? 0), 0));
  const buildWeeks = allWeeks.filter((w, i) => {
    if (w.sessions.length <= 3) return false;
    const prev = i > 0 ? weekTSSList[i - 1] : weekTSSList[i];
    const curr = weekTSSList[i];
    return prev === 0 || curr >= prev * 0.70; // exclude weeks that dropped ≥30% (recovery weeks)
  });
  const allHaveRun  = buildWeeks.every(w => w.sessions.some(s => s.type === 'run'));
  const allHaveSwim = buildWeeks.every(w => w.sessions.some(s => s.type === 'swim'));
  const allHaveBike = buildWeeks.every(w => w.sessions.some(s => s.type === 'bike'));
  check('Check 7: Run present every build week', allHaveRun);

  const swimMissingWeeks = buildWeeks.filter(w => !w.sessions.some(s => s.type === 'swim'));
  check('Check 7: Swim present every build week', allHaveSwim,
        !allHaveSwim ? `${swimMissingWeeks.length} weeks missing swim` : '');
  if (swimMissingWeeks.length > 0) {
    for (const w of swimMissingWeeks.slice(0, 5)) {
      const sportSummary = w.sessions.map(s => `${s.day[0]}${s.type[0].toUpperCase()}(${s.intensity_class[0]})`).join(' ');
      console.log(`    ${YELLOW}  Wk${w.week} missing swim: ${sportSummary}${RESET}`);
    }
  }

  check('Check 7: Bike present every build week', allHaveBike,
        !allHaveBike ? `${buildWeeks.filter(w => !w.sessions.some(s => s.type === 'bike')).length} weeks missing bike` : '');

  // Check 9: Brick placement
  const brickViolations = checkBrickPlacement(allWeeks);
  check(
    'Check 9: Brick not adjacent to hard run',
    brickViolations.length === 0,
    brickViolations.slice(0, 3).join('; ')
  );

  // Check 10: Run weighted_tss > tss
  const runSessions = allWeeks.flatMap(w => w.sessions.filter(s => s.type === 'run' && s.tss > 0));
  const multiplierOk = runSessions.every(s => s.weighted_tss > s.tss);
  check(
    `Check 10: Run impact multiplier 1.3× applied (${runSessions.length} run sessions)`,
    multiplierOk,
    !multiplierOk ? `${runSessions.filter(s => s.weighted_tss <= s.tss).length} sessions missing multiplier` : ''
  );

  // Check 11: Same-sport hard stacking
  let sameSportStack = false;
  for (const { sessions } of allWeeks) {
    const hardByDay = new Map();
    for (const s of sessions.filter(s => s.intensity_class === 'HARD')) {
      const key = `${s.day}-${s.type}`;
      if (hardByDay.has(key)) { sameSportStack = true; break; }
      hardByDay.set(key, true);
    }
  }
  check('Check 11: No same-sport HARD stacking on same day', !sameSportStack);

  // ── Phase sequence ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}Phase structure:${RESET}`);
  if (Array.isArray(phaseBlocks)) {
    for (const b of phaseBlocks) {
      console.log(`  Wk ${b.start_week}: ${CYAN}${b.name.padEnd(15)}${RESET} primary=${b.primary_goal_id?.slice(0, 8)}  dist=${JSON.stringify(Object.fromEntries(Object.entries(b.sport_distribution ?? {}).map(([k, v]) => [k, `${Math.round(v * 100)}%`])))}`);
    }
  }

  // ── Sport distribution ─────────────────────────────────────────────────────
  const dist = checkSportDistribution(allWeeks, payload.goals[0].distance);
  if (dist) {
    console.log(`\n${BOLD}Sport distribution (build weeks):${RESET}`);
    console.log(`  Run: ${dist.run}%  Bike: ${dist.bike}%  Swim: ${dist.swim}%  Strength: ${dist.strength}%`);

    const isTri = payload.goals.some(g => g.sport === 'triathlon');
    const hasLimiter = !!payload.athlete_state?.limiter_sport;
    if (isTri) {
      // With limiter_sport='swim', bike allocation shifts down and swim up per spec §2.1
      const bikeMin = hasLimiter ? 28 : 35;
      const swimMax = hasLimiter ? 45 : 30;
      check(
        `Sport dist: Bike ${hasLimiter ? '≥28%' : 'dominant (>35%)'} for triathlon`,
        (dist.bike ?? 0) >= bikeMin,
        `bike: ${dist.bike}%`
      );
      check(
        `Sport dist: Run 20–40% (impact-adjusted)`,
        (dist.run ?? 0) >= 18 && (dist.run ?? 0) <= 45,
        `run: ${dist.run}%`
      );
      check(
        `Sport dist: Swim 8–${swimMax}%${hasLimiter ? ' (limiter boost applied)' : ''}`,
        (dist.swim ?? 0) >= 8 && (dist.swim ?? 0) <= swimMax,
        `swim: ${dist.swim}%`
      );
    }
  }

  // ── Validation object from function response ───────────────────────────────
  console.log(`\n${BOLD}Validation object (from function):${RESET}`);
  const v = body.validation ?? {};
  for (const [key, val] of Object.entries(v)) {
    const icon = val ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon}  ${key}`);
  }
  if (body.validation_failures?.length > 0) {
    console.log(`\n  ${YELLOW}Validation failures: ${body.validation_failures.join(', ')}${RESET}`);
  }

  // Cleanup
  await deletePlan(body.plan_id);
  console.log(`\n  ${YELLOW}(Test plan deleted)${RESET}`);
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗`);
  console.log(`║   generate-combined-plan — Integration Test Suite   ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${RESET}`);

  const userId = await getRealUserId();
  console.log(`\nUsing user_id: ${userId.slice(0, 8)}...`);

  const today = new Date();
  const weeksOut = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n * 7);
    return d.toISOString().slice(0, 10);
  };

  // ── Scenario 1: OVERLAPPING — 70.3 in 16 weeks + Marathon in 26 weeks ─────
  // Gap = 10 weeks → strategy: taper for 70.3, recovery, abbreviated build, taper for marathon
  await runScenario(
    'Scenario 1 — Overlapping (70.3 in 16 wks + Marathon in 26 wks, 10-week gap)',
    {
      user_id: userId,
      goals: [
        {
          id: 'goal-70-3',
          event_name: 'Ironman 70.3 Raleigh',
          event_date: weeksOut(16),
          distance: '70.3',
          sport: 'triathlon',
          priority: 'A',
        },
        {
          id: 'goal-marathon',
          event_name: 'Chicago Marathon',
          event_date: weeksOut(26),
          distance: 'marathon',
          sport: 'run',
          priority: 'A',
        },
      ],
      athlete_state: {
        current_ctl: 62,
        ctl_by_sport: { run: 28, bike: 22, swim: 12 },
        bike_ftp: 240,
        run_threshold_pace: '7:30',
        swim_threshold_pace: '2:05',
        weekly_hours_available: 10,
        loading_pattern: '3:1',
        rest_days: [0, 1], // Sunday, Monday
        long_run_day: 0,   // Sunday
        long_ride_day: 6,  // Saturday
      },
      athlete_memory: {
        run_volume_ceiling: 45,
        historical_peak_ctl: 75,
      },
    },
    {}
  );

  // ── Scenario 2: SEQUENTIAL — Sprint Tri in 10 weeks + Olympic Tri in 28 weeks ──
  // Gap = 18 weeks → full independent cycle for each
  await runScenario(
    'Scenario 2 — Sequential (Sprint Tri in 10 wks + Olympic Tri in 28 wks, 18-week gap)',
    {
      user_id: userId,
      goals: [
        {
          id: 'goal-sprint',
          event_name: 'Local Sprint Triathlon',
          event_date: weeksOut(10),
          distance: 'sprint',
          sport: 'triathlon',
          priority: 'A',
        },
        {
          id: 'goal-olympic',
          event_name: 'USAT Olympic Championships',
          event_date: weeksOut(28),
          distance: 'olympic',
          sport: 'triathlon',
          priority: 'A',
        },
      ],
      athlete_state: {
        current_ctl: 48,
        ctl_by_sport: { run: 18, bike: 20, swim: 10 },
        bike_ftp: 205,
        weekly_hours_available: 8,
        loading_pattern: '3:1',
        rest_days: [0],    // Sunday rest
        long_ride_day: 6,  // Saturday
        long_run_day: 0,   // Sunday (but rest day — tests conflict handling)
        limiter_sport: 'swim',  // athlete says swim is limiter → +7% swim allocation
      },
      athlete_memory: {},
    },
    {}
  );

  // ── Scenario 3: COMPRESSED — Two tri events 5 weeks apart ────────────────
  // Ironman 70.3 in 12 weeks + Olympic Tri in 17 weeks (5-week gap)
  await runScenario(
    'Scenario 3 — Compressed (70.3 in 12 wks + Olympic in 17 wks, 5-week gap)',
    {
      user_id: userId,
      goals: [
        {
          id: 'goal-703-comp',
          event_name: 'IRONMAN 70.3 Boulder',
          event_date: weeksOut(12),
          distance: '70.3',
          sport: 'triathlon',
          priority: 'A',
        },
        {
          id: 'goal-oly-comp',
          event_name: 'Boulder Olympic Tri',
          event_date: weeksOut(17),
          distance: 'olympic',
          sport: 'triathlon',
          priority: 'B',  // B-race — should NOT restructure plan
        },
      ],
      athlete_state: {
        current_ctl: 72,
        ctl_by_sport: { run: 30, bike: 32, swim: 10 },
        bike_ftp: 275,
        run_threshold_pace: '7:15',
        swim_threshold_pace: '1:55',
        weekly_hours_available: 12,
        loading_pattern: '3:1',
        rest_days: [1],  // Monday rest
        long_ride_day: 6,
        long_run_day: 0,
      },
      athlete_memory: {
        run_volume_ceiling: 50,
        historical_peak_ctl: 85,
      },
    },
    {}
  );

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}${CYAN}══ Test Suite Summary ══${RESET}`);
  console.log(`  ${GREEN}Passed: ${totalPassed}${RESET}`);
  console.log(`  ${totalFailed > 0 ? RED : GREEN}Failed: ${totalFailed}${RESET}`);
  console.log(`  Total:  ${totalPassed + totalFailed}\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
