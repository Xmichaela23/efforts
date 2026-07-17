// Composer + enforced voice. Run: deno test --no-check week-accent.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  composeWeekAccent, overReachCandidate, rirCandidate, bannerCandidate,
  tradeCandidate, leverCandidate, voiceViolation, ACCENT_TIER,
} from './week-accent.ts';

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
