// STRENGTH-PRIMARY PLAN — ATR arc with a DELOAD, peak to a 96–97% single, and a SAFE retest
// (heavy sub-max triple → estimate e1RM, no solo max-grind). Off the entered 1RM, no inflation.
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { roleForExercise } from '../../_shared/strength/exercise-role.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
});
const wk = (n: number) => PLAN.sessions_by_week[String(n)];
const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
const benchEx = (n: number) =>
  strengthOf(n).flatMap((s) => s.strength_exercises ?? []).filter((e) => /^Bench Press/i.test(e.name));
const benchPct = (n: number) => Number((benchEx(n)[0]?.weight.match(/([\d.]+)%/) || [])[1]);
const allText = (n: number) => JSON.stringify(wk(n)).toLowerCase();

Deno.test('ATR arc with a DELOAD — accumulate→intensify→deload→peak→retest', () => {
  const { phases, recovery_weeks } = buildArcPhases(12);
  assertEquals(phases.map((p) => p.name), ['Base', 'Power', 'Deload', 'Peak', 'Retest']);
  // deload sits BETWEEN intensify and peak, ~6–8 wk in
  const deload = phases.find((p) => p.name === 'Deload')!;
  assert(deload.start_week >= 6 && deload.start_week <= 8, `deload at wk ${deload.start_week}, want 6–8`);
  assertEquals(recovery_weeks, [deload.start_week]);
});

Deno.test('DELOAD week recovers — lower volume + intensity than the weeks around it', () => {
  const deWk = buildArcPhases(12).phases.find((p) => p.name === 'Deload')!.start_week;
  const dePct = benchPct(deWk);
  assert(dePct <= 70, `deload bench ${dePct}% should drop (≤70)`);
  assert(dePct < benchPct(deWk - 1), 'deload intensity < the intensify week before it');
  assert(dePct < benchPct(deWk + 1), 'deload intensity < the peak week after it');
  // volume drop: deload sets < base sets
  const deSets = benchEx(deWk)[0].sets;
  assert(deSets <= 3, `deload volume should drop (sets ${deSets})`);
});

Deno.test('CURVE — peak is heavy DOUBLES (no near-max single); base opens at 72%', () => {
  const peak = buildArcPhases(12).phases.find((p) => p.name === 'Peak')!;
  const last = benchEx(peak.end_week)[0];
  assertEquals(last.reps, 2, 'final peak week = a double, NOT a near-max single');
  const pk = Number((last.weight.match(/([\d.]+)%/) || [])[1]);
  assert(pk >= 92 && pk <= 95, `peak double ~94%, got ${last.weight}`);
  assertEquals(benchPct(1), 72, 'base wk1 = 72%');
});

Deno.test('AMRAP RETEST — fixed ~88% + OPEN reps (can show a gain); 1rm_test tagged; deadlift-conservative note (D-224)', () => {
  const wk12 = strengthOf(12);
  assertEquals(wk12.length, 4, 'four AMRAP retest sessions (one per key lift)');
  wk12.forEach((s) => {
    const ex = s.strength_exercises ?? [];
    assertEquals(ex.length, 1, 'ONE scored set only (warm-up is copy-guided) so the estimate is clean');
    assertEquals(String(ex[0].reps).toLowerCase(), 'amrap', 'reps are OPEN (AMRAP), not a fixed number');
    assert(/88% 1RM/.test(ex[0].weight), `fixed ~88% test weight, got ${ex[0].weight}`);
    assert(s.tags.includes('1rm_test'), 'tagged 1rm_test → cluster-e1RM + ratchet-up write-back');
  });
  // the D-223 bug is gone: no fixed-rep estimate set anywhere
  assert(!wk12.some((s) => (s.strength_exercises ?? []).some((e) => e.reps === 3)), 'no fixed-3 estimate remains');
  // load-bearing copy: AMRAP, the RPE-9 near-failure stop, and the deadlift-conservative note (LeSuer)
  const t = allText(12);
  assert(t.includes('amrap') && t.includes('rpe 9'), 'copy names AMRAP + the RPE-9 stop (accuracy-critical)');
  assert(t.includes('lesuer') && t.includes('conservative'), 'deadlift-conservative note cites LeSuer');
});

Deno.test('honest copy — measured gain, ends on an AMRAP retest', () => {
  const d = PLAN.description.toLowerCase();
  assert(d.includes('measured') && d.includes('modest'), 'promise is tempered');
  assert(d.includes('amrap retest') && d.includes('open'), 'ends on an AMRAP retest (open reps)');
});

Deno.test('guard — real barbell every work phase, maintenance runs, sport-agnostic', () => {
  for (const n of [2, 6, 9]) {
    assertEquals(strengthOf(n).length, 4);
    const t = allText(n);
    assert(!t.includes('bodyweight tier cannot') && !t.includes('glute bridges'));
    assertEquals(wk(n).filter((s) => s.type === 'run').length, 2);
  }
  const bike = composeStrengthPrimaryPlan({ durationWeeks: 8, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'bike', enduranceFrequency: 2 });
  assertEquals(bike.sessions_by_week['2'].filter((s) => s.type === 'ride').length, 2);
});

Deno.test('maintenance band — typed miles HONORED (cap retired); state reported; flat; pace-estimate disclosed', () => {
  const mk = (miles: number) => composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: miles, easyPaceMinPerMile: 9.5 });
  // 9.5 min/mi → soft floor 6 (60/9.5), soft ceiling 19 (180/9.5) — REFERENCE only, NOT a clamp (D-222 retired)
  const inb = mk(12); assertEquals(inb.volume_state, 'in_band'); assertEquals(inb.volume_notes, null, '12mi in band — no note');
  const over = mk(30); assertEquals(over.volume_state, 'above', 'over the soft ceiling → state above');
  assertEquals(over.volume_notes, null, 'no cap note — miles honored; the tradeoff copy is client-side');
  const under = mk(3); assertEquals(under.volume_state, 'below', 'under the soft floor → state below');
  assertEquals(under.volume_notes, null, 'no bump note — low mileage honored, not penalized');
  // miles are HONORED, not clamped: 30mi produces MORE weekly run volume than 12mi, and exceeds the old 19mi cap
  const runMin = (p: ReturnType<typeof mk>) => p.sessions_by_week['2'].filter((s) => s.type === 'run').reduce((a, s) => a + s.duration, 0);
  assert(runMin(mk(30)) > runMin(mk(12)), 'more miles → more run volume (honored, not capped)');
  assert(runMin(mk(30)) > 200, `30mi honored, not capped at the old 19mi ceiling (~180min); got ${runMin(mk(30))}min`);
  // flat: maintenance run duration is the same every work week (no ramp)
  const rd = (w: string) => mk(12).sessions_by_week[w].find((s) => s.type === 'run')!.duration;
  assertEquals(rd('2'), rd('9'), 'maintenance is FLAT — no ramp');
  // absent (no typed miles) → the fixed default, backward-compatible
  const def = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2 });
  assertEquals(def.volume_notes, null); assertEquals(def.volume_state, null, 'no typed miles → no band state');
  assertEquals(def.sessions_by_week['2'].find((s) => s.type === 'run')!.duration, 35, 'no typed miles → fixed ~35min default');
});

Deno.test('SQUAT FREQUENCY — one heavy back squat/week; Lower B is hinge (deadlift + lighter front squat), never stacked', () => {
  // across a work week, Back Squat appears exactly once (Lower A, primary heavy) — not on both lower days
  const lifts = strengthOf(2).flatMap((s) => s.strength_exercises ?? []).map((e) => e.name);
  assertEquals(lifts.filter((n) => /^Back Squat/i.test(n)).length, 1, 'only ONE heavy back squat/week (was two)');
  // the hinge day carries the deadlift + a LIGHTER front squat — no heavy back-squat + deadlift in one session
  const lowerB = strengthOf(2).find((s) => /Lower B/i.test(s.name))!;
  const lbNames = (lowerB.strength_exercises ?? []).map((e) => e.name).join(' ');
  assert(/Conventional Deadlift/i.test(lbNames) && /Front Squat/i.test(lbNames), `Lower B = deadlift + front squat, got ${lbNames}`);
  assert(!/Back Squat/i.test(lbNames), 'Lower B must NOT stack a heavy back squat with the deadlift');
});

Deno.test('MILEAGE never silently dropped — typed miles honored even without a learned easy pace (estimate + disclose)', () => {
  // pace UNKNOWN but miles typed → must NOT fall to the fixed 35min default; estimate + say so
  const noPace = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 25 });
  const mins = noPace.sessions_by_week['2'].find((s) => s.type === 'run')!.duration;
  assert(mins !== 35, `typed 25mi must not collapse to the 35min default (got ${mins})`);
  assert(noPace.volume_notes !== null && /estimated/i.test(noPace.volume_notes), 'missing pace → disclosed estimate note');
  // 25mi over the 10:00/mi fallback → state 'above', but NO cap note (the hard ceiling is retired)
  assertEquals(noPace.volume_state, 'above', 'over the soft ceiling on fallback pace → above');
  assert(!/Held to/.test(noPace.volume_notes!), 'no cap note — miles honored, only the pace-estimate disclosure remains');
});

Deno.test('DISTRIBUTION — spread as long-run + easy fill (not total÷N), extra runs stacked on UPPER days, lift-first', () => {
  const mk = (freq: number) => composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: freq, targetWeeklyMiles: 18, easyPaceMinPerMile: 10 });
  // 3 run days: only 2 run-only slots (Wed/Sat) → the 3rd stacks onto an upper lift day (Mon)
  const w3 = mk(3).sessions_by_week['2'];
  const runs3 = w3.filter((s) => s.type === 'run');
  assertEquals(runs3.length, 3, '3 run days materialize (stacked beyond the 2 run-only slots)');
  const durs3 = runs3.map((r) => r.duration).sort((a, b) => b - a);
  assert(durs3[0] > durs3[durs3.length - 1], 'NOT equal split — a long run + smaller fill runs');
  // the long run lands on the run-only day (Saturday), never on a lift day
  const longRun = runs3.reduce((m, r) => (r.duration > m.duration ? r : m));
  assertEquals(longRun.day, 'Saturday', 'the long run is on the run-only day, not stacked on a lift day');
  // a stacked day (Monday has both) orders LIFT before RUN
  const monday = w3.filter((s) => s.day === 'Monday');
  assert(monday.length === 2 && monday[0].type === 'strength' && monday[1].type === 'run', 'stacked day: lift first, then the easy run');

  // 4 run days → 2 stacked (both upper days), never a stacked heavy-lower day
  const w4 = mk(4).sessions_by_week['2'];
  const runDays4 = w4.filter((s) => s.type === 'run').map((r) => r.day);
  assertEquals(runDays4.length, 4);
  const lowerDays = w4.filter((s) => s.type === 'strength' && /Lower/.test(s.name)).map((s) => s.day);
  assert(!runDays4.some((d) => lowerDays.includes(d)), 'no run stacked on a heavy-lower day (Tue/Fri)');
});

Deno.test('STACKED-DAY NOTE — shown ONCE (wk1 first lift+run day), never repeated; absent when nothing stacks', () => {
  const p = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 18, easyPaceMinPerMile: 10 });
  const noted = Object.values(p.sessions_by_week).flat().filter((s) => s.type === 'run' && /lift first/i.test(s.description));
  assertEquals(noted.length, 1, 'the stacked-day note appears exactly once across the whole plan');
  assert(/Petr/.test(noted[0].description), 'note carries its citation');
  // 2 run days never stack onto a lift day → no note anywhere (self-gating)
  const p2 = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 12, easyPaceMinPerMile: 10 });
  const noted2 = Object.values(p2.sessions_by_week).flat().filter((s) => s.type === 'run' && /lift first/i.test(s.description));
  assertEquals(noted2.length, 0, 'no stacking (2 run days) → no note');
});

Deno.test('NO-1RMs path — week 1 is a baseline test (offered, not forced); weeks 2-12 train', () => {
  const no = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, needsBaseline: true });
  const wk1 = no.sessions_by_week['1'].filter((s) => s.type === 'strength');
  assertEquals(wk1.length, 2, 'week 1 = 2 baseline tests (lower + upper), not 4 training days');
  assert(wk1.every((s) => /^Baseline Test:/.test(s.name)), 'named "Baseline Test: …" so the logger recognizes it by name + writes performance_numbers');
  assert(JSON.stringify(wk1).includes('Back Squat') && JSON.stringify(wk1).includes('Bench Press'));
  assert(no.sessions_by_week['2'].some((s) => s.type === 'strength' && /Strength Focus/.test(s.name)), 'weeks 2+ train');
  assertEquals(no.sessions_by_week['1'].filter((s) => s.type === 'run').length, 2, 'easy maintenance still fills the baseline week');

  // YES / unset path (default): week 1 trains, no baseline test, no bounce-out
  const yes = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2 });
  assert(!JSON.stringify(yes.sessions_by_week['1']).includes('Baseline Test'), 'YES path: week 1 is training');
});

Deno.test('BASELINE seed (piece 1) — no-1RM path emits a bar-start bare-number lb (materialize pass-through), NOT a blank placeholder; rep-count discovery copy; stored path stays %-based', () => {
  const no = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, needsBaseline: true });
  const wk1 = no.sessions_by_week['1'].filter((s) => s.type === 'strength');
  const seeds = wk1.flatMap((s) => s.strength_exercises ?? []);
  // the blank-box placeholder is gone
  assert(!seeds.some((e) => /pick a/i.test(e.weight)), 'no "pick a ~5-rep weight" placeholder (the string that rendered blank)');
  // every seed is a BARE NUMBER string → materialize's pre-resolved-numeric pass-through (real editable lb),
  // sidestepping the missing-anchor hunt that produced the blank box for a no-1RM athlete
  assert(seeds.every((e) => /^\d+$/.test(e.weight)), `every baseline seed is a bare-number lb, got: ${seeds.map((e) => e.weight).join(', ')}`);
  // bar-start: 45 default, deadlift 95 (bar at pulling height)
  const byLift = Object.fromEntries(seeds.map((e) => [e.name.replace(/ — AMRAP test set$/, ''), e.weight]));
  assertEquals(byLift['Back Squat'], '45');
  assertEquals(byLift['Bench Press'], '45');
  assertEquals(byLift['Overhead Press'], '45');
  assertEquals(byLift['Deadlift'], '95');
  // AMRAP shape + the 1rm_test tag preserved → SAME write-back pipeline as the exit retest
  assert(seeds.every((e) => String(e.reps).toLowerCase() === 'amrap'), 'AMRAP (open) reps preserved on the seed set');
  assert(wk1.every((s) => s.tags.includes('1rm_test')), 'baseline stays 1rm_test tagged → one pipeline, no separate baseline math');
  // discovery copy is REP-COUNT driven (never RPE self-report for a novice) + keeps the form-break safety stop
  const c = wk1.map((s) => s.description.toLowerCase()).join(' ');
  assert(c.includes('more than ~8 reps'), 'copy drives the pick by rep count (>~8 reps = too light), not RPE');
  assert(c.includes('3–6'), 'copy names the 3–6 clean-rep target = the test set');
  assert(c.includes('form break'), 'safety stop on form break preserved');

  // stored-1RM path (the exit retest) stays %-based — one pipeline, the % resolves off the stored anchor
  const wk12 = strengthOf(12);
  assert(wk12.every((s) => (s.strength_exercises ?? []).every((e) => /% 1RM/.test(e.weight))), 'retest stays %-based (resolves off the stored 1RM)');
});

Deno.test('ACCESSORY-BIAS — glute/hyrox inject ONE slot on Upper A; main lifts/arc/deload/retest byte-identical; names resolve; qualitative', () => {
  const base = { durationWeeks: 12, strengthFrequency: 4 as const, tier: 'barbell' as const, enduranceSport: 'run' as const, enduranceFrequency: 2, targetWeeklyMiles: 20, easyPaceMinPerMile: 9.5 };
  const plain = composeStrengthPrimaryPlan({ ...base });
  const glute = composeStrengthPrimaryPlan({ ...base, accessoryBias: 'glute' });
  const hyrox = composeStrengthPrimaryPlan({ ...base, accessoryBias: 'hyrox' });

  // (a) byte-identical when bias absent: undefined === null, and no bias artifacts anywhere
  assertEquals(JSON.stringify(plain), JSON.stringify(composeStrengthPrimaryPlan({ ...base, accessoryBias: null })), 'absent/null bias → byte-identical');
  assert(!JSON.stringify(plain).includes('bias:') && !/Hip Thrust|Sled|Sandbag|Farmers/.test(JSON.stringify(plain)), 'plain plan carries no bias artifacts');

  // GLUTE — strict: byte-identical to plain EXCEPT Upper A work weeks (+1 accessory). No new sessions.
  for (const w of Object.keys(plain.sessions_by_week)) {
    const p = plain.sessions_by_week[w], b = glute.sessions_by_week[w];
    assertEquals(b.length, p.length, `glute wk${w}: same session count`);
    for (let i = 0; i < p.length; i++) {
      const isBiasSlot = /Upper A/.test(p[i].name) && !(p[i].tags || []).join(' ').match(/deload|retest/);
      if (isBiasSlot) {
        assertEquals((b[i].strength_exercises || []).length, (p[i].strength_exercises || []).length + 1, `glute wk${w} Upper A: +1 accessory`);
        assertEquals(JSON.stringify((b[i].strength_exercises || []).slice(0, 2)), JSON.stringify(p[i].strength_exercises || []), `glute wk${w}: main lifts untouched`);
        assert((b[i].tags || []).includes('bias:glute'), `glute wk${w}: bias tag present`);
      } else {
        assertEquals(JSON.stringify(b[i]), JSON.stringify(p[i]), `glute wk${w} session ${i}: byte-identical (no bias)`);
      }
    }
  }
  assertEquals(JSON.stringify(glute.sessions_by_week['7']), JSON.stringify(plain.sessions_by_week['7']), 'glute deload byte-identical');
  assertEquals(JSON.stringify(glute.sessions_by_week['12']), JSON.stringify(plain.sessions_by_week['12']), 'glute retest byte-identical');

  // HYROX — relaxed (same as glute + the Saturday combo): plain unchanged; hyrox = +1 Upper A accessory
  // + 1 Saturday long-run→station combo. The three non-Upper-A strength days stay byte-identical; the
  // long-run day gains a station AFTER the (unshortened) long run. Deload/retest untouched.
  for (const w of ['2', '5', '9']) { // a Base, a Power, a Peak work week
    const p = plain.sessions_by_week[w], b = hyrox.sessions_by_week[w];
    // Upper A: +1 accessory, main lifts intact, bias:hyrox tag
    const upA = b.find((s) => /Upper A/.test(s.name))!, upAp = p.find((s) => /Upper A/.test(s.name))!;
    assertEquals((upA.strength_exercises || []).length, (upAp.strength_exercises || []).length + 1, `hyrox wk${w}: Upper A +1 accessory`);
    assertEquals(JSON.stringify((upA.strength_exercises || []).slice(0, 2)), JSON.stringify(upAp.strength_exercises || []), `hyrox wk${w}: Upper A main lifts intact`);
    assert((upA.tags || []).includes('bias:hyrox'), `hyrox wk${w}: Upper A bias:hyrox tag`);
    // the other three strength days byte-identical
    for (const n of ['Lower A', 'Upper B', 'Lower B']) {
      assertEquals(JSON.stringify(b.find((s) => s.name.includes(n))), JSON.stringify(p.find((s) => s.name.includes(n))), `hyrox wk${w}: ${n} byte-identical`);
    }
    // Saturday combo: one fatigued-legs station on the long-run day, run unshortened, run-first
    const fat = b.filter((s) => (s.tags || []).includes('fatigued_legs'));
    assertEquals(fat.length, 1, `hyrox wk${w}: one fatigued-legs station`);
    assert((fat[0].tags || []).includes('bias:hyrox') && fat[0].type === 'strength', `hyrox wk${w}: station tagged strength session`);
    const sameDay = b.filter((s) => s.day === fat[0].day);
    const runIdx = sameDay.findIndex((s) => s.type === 'run'), fatIdx = sameDay.findIndex((s) => (s.tags || []).includes('fatigued_legs'));
    assert(runIdx >= 0 && runIdx < fatIdx, `hyrox wk${w}: run BEFORE station (run→station)`);
    const plainRun = p.find((s) => s.day === fat[0].day && s.type === 'run')!;
    assertEquals(sameDay[runIdx].duration, plainRun.duration, `hyrox wk${w}: long run NOT shortened`);
    assertEquals(fat[0].day, plain.sessions_by_week[w].reduce((m: any, s: any) => s.type === 'run' && (!m || s.duration > m.duration) ? s : m, null).day, `hyrox wk${w}: combo on the LONG-run day`);
    assertEquals(b.length, p.length + 1, `hyrox wk${w}: +1 session (the station); Upper A accessory is +1 exercise not +1 session`);
  }
  for (const w of ['7', '12']) { // deload + retest: no combo, byte-identical
    assert(!JSON.stringify(hyrox.sessions_by_week[w]).includes('fatigued_legs'), `hyrox wk${w}: no fatigued-legs on deload/retest`);
    assertEquals(JSON.stringify(hyrox.sessions_by_week[w]), JSON.stringify(plain.sessions_by_week[w]), `hyrox wk${w}: byte-identical to plain`);
  }

  // both presets: bias exercise names resolve to accessory (zero D-208 tripwire) + qualitative loading
  for (const biased of [glute, hyrox]) {
    const biasExs = Object.values(biased.sessions_by_week).flat().flatMap((s) => (s.strength_exercises || []).filter((e) => /Hip Thrust|Single-Leg|Back Extension|Sled|Sandbag|Farmers/.test(e.name)));
    assert(biasExs.length > 0, 'bias slots present on work weeks');
    for (const n of [...new Set(biasExs.map((e) => e.name))]) assertEquals(roleForExercise(n), 'accessory', `${n} → accessory role`);
    for (const e of biasExs) assert(!/\d/.test(e.weight) && !e.weight.includes('%'), `${e.name} weight must be qualitative (no %1RM), got "${e.weight}"`);
  }
});
