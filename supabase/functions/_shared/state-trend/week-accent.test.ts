// Composer + enforced voice. Run: deno test --no-check week-accent.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  composeWeekAccent, overReachCandidate, rirCandidate, bannerCandidate,
  tradeCandidate, upkeepCandidate, leverCandidate, voiceViolation, ACCENT_TIER,
} from './week-accent.ts';

// ── THE UPKEEP READ — COMPLIANCE FACT ONLY (2026-07-18, app-aligned; no weekly adaptation consequence) ─
Deno.test('upkeep RUN: states the COMPLIANCE fact (miles vs target + load carried), no consequence', () => {
  const a = upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 6, aerobicCarriers: ['swim', 'ride'] });
  assertEquals(!!a, true);
  assertStringIncludes(a!.sentence, '18-mile upkeep');                 // the TARGET, in miles — not "1 of 3 runs"
  assertStringIncludes(a!.sentence, 'carried the endurance load');      // load language (§7), app-aligned
  assertStringIncludes(a!.sentence, '6 weeks now');                     // trailing pattern
  assertEquals(a!.sentence.includes('fade'), false);                   // NO adaptation consequence on the weekly
  assertEquals(a!.sentence.includes('impact-tolerance'), false);       // that lives in the glass box / Fitness card
  assertEquals(voiceViolation(a!.sentence), null);
  assertEquals(a!.source, 'upkeep');
});

// ── THE SLIP GATE (refines D-297): base measurably slipping → tipping-point flag; else compliance-only ──
Deno.test('upkeep RUN: base SLIPPING flips the read to the measured tipping-point fact (replaces carried-load)', () => {
  const a = upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 6, aerobicCarriers: ['swim', 'ride'], baseSlipping: true });
  assertStringIncludes(a!.sentence, '18-mile upkeep');
  assertStringIncludes(a!.sentence, 'has started to slip');              // measured "has", the tipping-point flag
  assertEquals(a!.sentence.includes('carried the endurance load'), false); // slip REPLACES the positive — no contradiction
  assertEquals(a!.sentence.includes('may'), false);                     // measured, not a prediction (D-297 held)
  assertEquals(voiceViolation(a!.sentence), null);                      // still fact-first, no imperative/scold
});

Deno.test('upkeep RUN: base HOLDING (or absent) is compliance-only — D-297 unchanged, no slip claim', () => {
  const holding = upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 6, aerobicCarriers: ['swim', 'ride'], baseSlipping: false });
  assertStringIncludes(holding!.sentence, 'carried the endurance load');
  assertEquals(holding!.sentence.includes('slip'), false);
  // absent flag behaves identically to false (Law 2 — no data → no claim)
  const absent = upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 6, aerobicCarriers: ['swim', 'ride'] });
  assertEquals(absent!.sentence.includes('slip'), false);
});

Deno.test('upkeep RUN: near target (16 of 18 ≈ 89%) does NOT fire — still maintaining', () => {
  assertEquals(upkeepCandidate({ discipline: 'run', actualPerWeek: 16, targetPerWeek: 18, unit: 'mile', aerobicCarriers: ['swim'] }), null);
});

Deno.test('upkeep RUN: ONE light week (weeksUnder < 2) is silent — not yet a pattern', () => {
  assertEquals(upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 1, aerobicCarriers: ['swim', 'ride'] }), null);
});

Deno.test('upkeep: NO numeric target → null (nothing app-standard to say weekly; science lives in the glass box)', () => {
  assertEquals(upkeepCandidate({ discipline: 'swim', aerobicCarriers: ['run', 'ride'] }), null);
  assertEquals(upkeepCandidate({ discipline: 'strength', aerobicCarriers: [] }), null);
});

Deno.test('upkeep OUTRANKS the session-count substitution read (tier 3.8 < 4)', () => {
  const up = upkeepCandidate({ discipline: 'run', actualPerWeek: 4, targetPerWeek: 18, unit: 'mile', weeksUnder: 6, aerobicCarriers: ['swim', 'ride'] });
  const trade = tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim', 'ride'] });
  const chosen = composeWeekAccent([trade, up]);
  assertEquals(chosen!.source, 'upkeep'); // the target read wins over "1 of 3"
});

// ── THE VOICE, ENFORCED — banned words + exclamations fail; clean copy passes ───────────────────────
Deno.test('voiceViolation catches the banned register', () => {
  for (const bad of ['Great work this week', 'Nice, keep it up', 'You are on track', 'Stay consistent', 'Solid week', 'Do more!']) {
    assertEquals(voiceViolation(bad) !== null, true, bad);
  }
  assertEquals(voiceViolation('Running came in at 1 of 3 this week; swimming carried the endurance load.'), null);
});

// EVERY producible accent must pass the check — this is the guard that keeps the voice from rotting.
Deno.test('every emitted accent passes the voice check', () => {
  const all = [
    overReachCandidate({ loadStatus: 'high', readiness: 'overreached', runningAcwr: 1.6 }),
    overReachCandidate({ loadStatus: 'high', readiness: 'fatigued' }),
    rirCandidate({ actualRir: 0.5, targetRir: 2, sampleSize: 3 }),
    bannerCandidate(null, 'behind'),
    bannerCandidate(null, 'nothing_loaded'),
    tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim'], rirActual: 0.5, rirTarget: 2 }),
    tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim', 'ride'] }),
  ].filter(Boolean);
  for (const a of all) assertEquals(voiceViolation(a!.sentence), null, a!.sentence);
});

// ── Trade: only AEROBIC (swim/bike) carries endurance — strength is never a carrier ─────────────────
Deno.test('trade names only aerobic carriers, leads with the count, folds RIR', () => {
  const t = tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim'], rirActual: 0.5, rirTarget: 2 });
  assertStringIncludes(t!.sentence, 'Running came in at 1 of 3');
  assertStringIncludes(t!.sentence, 'swimming carried the endurance load');
  assertEquals(t!.sentence.includes('strength'), false); // strength is NOT an endurance carrier
  assertStringIncludes(t!.sentence, 'running-specific speed only comes from running'); // scoped to SPEED, not "run" broadly (no contradiction with the durability row)
  assertStringIncludes(t!.sentence, 'fades if running stays this low'); // conditional, not a prophecy
  assertStringIncludes(t!.sentence, 'RIR 0.5');            // folded tail
});

Deno.test('no aerobic carrier → NOT a trade → null (under-training is the banner/posture, not a trade)', () => {
  assertEquals(tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: [] }), null);
  assertEquals(tradeCandidate({ underDone: null, aerobicCarriers: ['swim'] }), null);
});

// ── Composer selection ──────────────────────────────────────────────────────────────────────────────
Deno.test('over-reach outranks the trade', () => {
  const over = overReachCandidate({ loadStatus: 'high', readiness: 'overreached', runningAcwr: 1.6 });
  const trade = tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim'] });
  assertEquals(composeWeekAccent([trade, over])?.source, 'overreach');
});

Deno.test('none qualify → null (silence)', () => {
  assertEquals(composeWeekAccent([
    overReachCandidate({ loadStatus: 'on_target', readiness: 'fresh' }),
    bannerCandidate('On plan — strength on track', 'positive'),
    leverCandidate(),
  ]), null);
});

Deno.test('positive and carried banners → null (boring week is silent; trade owns carried)', () => {
  assertEquals(bannerCandidate('On plan — strength on track', 'positive'), null);
  assertEquals(bannerCandidate('Running behind — load carried', 'carried'), null);
});

// ── Gates unchanged: over-reach needs load AND body; RIR needs a target + a real sample ─────────────
Deno.test('gates hold', () => {
  assertEquals(overReachCandidate({ loadStatus: 'high', readiness: 'fresh' }), null);
  assertEquals(rirCandidate({ actualRir: 0, targetRir: null, sampleSize: 4 }), null);
  assertEquals(rirCandidate({ actualRir: 0.5, targetRir: 2, sampleSize: 1 }), null);
  assertEquals(leverCandidate(), null);
});

// ── The composer DROPS a voice-violating candidate rather than ship it ──────────────────────────────
Deno.test('composer drops a candidate that trips the voice check', () => {
  const bad = { source: 'substitution' as const, tier: ACCENT_TIER.substitution, sentence: 'Great job — keep it up!', trace: { kind: 'load' as const, detail: 'x' } };
  const good = tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim'] });
  assertEquals(composeWeekAccent([bad, good])?.source, 'substitution'); // the good (trade) survives
  assertEquals(composeWeekAccent([bad]), null);                          // only the bad one → dropped → silence
});

// ── ANCHOR DESCENT (rolling anchor eased by window aging) ──────────────────────────────────────────
import { anchorDescentCandidate } from './week-accent.ts';

Deno.test('anchor descent: no cause carried → silence', () => {
  assertEquals(anchorDescentCandidate({ agedOutMonth: null, aerobicCarriers: ['swim'], creditSupported: true }), null);
});

Deno.test('anchor descent: credit clause renders ONLY when cross-signals support it', () => {
  const withCredit = anchorDescentCandidate({ agedOutMonth: 'February', aerobicCarriers: ['swim', 'ride'], creditSupported: true })!;
  assertStringIncludes(withCredit.sentence, 'the February runs behind it aged out');
  assertStringIncludes(withCredit.sentence, 'carrying the aerobic load');
  assertStringIncludes(withCredit.sentence, "durability is the part they don't cover");

  const noCredit = anchorDescentCandidate({ agedOutMonth: 'February', aerobicCarriers: ['swim', 'ride'], creditSupported: false })!;
  assertStringIncludes(noCredit.sentence, 'Little recent running behind it');
  assertEquals(noCredit.sentence.includes('carrying'), false); // no courtesy credit
});

Deno.test('anchor descent: no carriers → bare template even if creditSupported flips true', () => {
  const b = anchorDescentCandidate({ agedOutMonth: 'March', aerobicCarriers: [], creditSupported: true })!;
  assertStringIncludes(b.sentence, 'Little recent running behind it');
});

Deno.test('anchor descent: both templates pass the voice check', () => {
  for (const credit of [true, false]) {
    const a = anchorDescentCandidate({ agedOutMonth: 'February', aerobicCarriers: ['swim', 'ride'], creditSupported: credit })!;
    assertEquals(voiceViolation(a.sentence), null, a.sentence);
  }
});

Deno.test('anchor descent: outranks substitution, ranks below the lever', () => {
  const descent = anchorDescentCandidate({ agedOutMonth: 'February', aerobicCarriers: ['swim'], creditSupported: false });
  const trade = tradeCandidate({ underDone: 'run', underDoneDone: 1, underDonePlanned: 3, aerobicCarriers: ['swim'] });
  assertEquals(composeWeekAccent([trade, descent])?.source, 'anchor_descent'); // beats substitution
  assertEquals(ACCENT_TIER.anchor_descent > ACCENT_TIER.lever && ACCENT_TIER.anchor_descent < ACCENT_TIER.substitution, true);
});
