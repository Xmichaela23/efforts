// Composer unit checks — contract §8b. Run: deno test week-accent.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  composeWeekAccent,
  overReachCandidate,
  rirCandidate,
  bannerCandidate,
  tradeCandidate,
  leverCandidate,
  ACCENT_TIER,
} from './week-accent.ts';

// ── THE TRADE sentence — names carriers + benefit + cost; RIR folds in; honest about aerobic ──────
Deno.test('trade: aerobic cross-training carried → names base covered + specificity cost', () => {
  const t = tradeCandidate({ underDone: 'run', carriers: ['swim', 'strength'], aerobicCarried: true });
  assertEquals(t?.source, 'substitution');
  assertStringIncludes(t!.sentence, 'Swimming and strength carried the week');
  assertStringIncludes(t!.sentence, 'running eased off');
  assertStringIncludes(t!.sentence, 'aerobic base is likely covered');
  assertStringIncludes(t!.sentence, 'running-specific speed');
  assertStringIncludes(t!.sentence, 'if it holds'); // conditional, never a prophecy
});

Deno.test('trade: strength-only carrier → NO "aerobic base covered" claim (honest)', () => {
  const t = tradeCandidate({ underDone: 'run', carriers: ['strength'], aerobicCarried: false });
  assertEquals(t?.sentence.includes('aerobic base is likely covered'), false);
  assertStringIncludes(t!.sentence, 'running eased off');
});

Deno.test('trade: RIR under target folds in as ONE tail (not a second accent)', () => {
  const t = tradeCandidate({ underDone: 'run', carriers: ['swim'], aerobicCarried: true, rirUnderTarget: true });
  assertStringIncludes(t!.sentence, 'aerobic base is likely covered');
  assertStringIncludes(t!.sentence, 'harder than planned');
});

Deno.test('trade: no shortfall (nothing eased off) → null', () => {
  assertEquals(tradeCandidate({ underDone: null, carriers: [], aerobicCarried: false }), null);
});

// ── §8b(i) — multiple qualifying candidates → exactly ONE accent, correct priority ──────────────────
Deno.test('multi-qualify → one accent, highest priority (over-reach beats substitution)', () => {
  const over = overReachCandidate({ loadStatus: 'high', readiness: 'overreached', runningAcwr: 1.6 });
  const sub = bannerCandidate('Running behind plan — total load carried via easy cross-training.', 'carried');
  assertEquals(over?.source, 'overreach');
  assertEquals(sub?.source, 'substitution');
  const picked = composeWeekAccent([sub, over]); // submission order deliberately worst-first
  assertEquals(picked?.source, 'overreach');
  assertEquals(picked?.tier, ACCENT_TIER.overreach);
});

Deno.test('multi-qualify → RIR (tier 3) beats substitution (tier 4) but loses to over-reach (tier 1)', () => {
  const rir = rirCandidate({ actualRir: 0.5, targetRir: 2, sampleSize: 3 });
  const sub = bannerCandidate('Running behind plan — total load carried across your training.', 'carried');
  assertEquals(composeWeekAccent([sub, rir])?.source, 'rir');
  const over = overReachCandidate({ loadStatus: 'elevated', readiness: 'fatigued' });
  assertEquals(composeWeekAccent([sub, rir, over])?.source, 'overreach');
});

// ── §8b(ii) — no qualifying candidates → EMPTY accent (silence is valid, never backfilled) ──────────
Deno.test('none qualify → null (counts-only section)', () => {
  const over = overReachCandidate({ loadStatus: 'on_target', readiness: 'fresh' }); // load fine, body fine
  const rir = rirCandidate({ actualRir: 2, targetRir: 2, sampleSize: 3 }); // on target
  const sub = bannerCandidate(null, null); // banner silent
  assertEquals(over, null);
  assertEquals(rir, null);
  assertEquals(sub, null);
  assertEquals(composeWeekAccent([over, rir, sub, leverCandidate()]), null);
});

// ── §8b(iii) — the positive case selects when it is the sole qualifier (first-class, not a fallback) ─
Deno.test('positive maintenance selects when sole qualifier', () => {
  const positive = bannerCandidate('On plan — strength on track; endurance via cross-training.', 'positive');
  assertEquals(positive?.source, 'positive');
  const picked = composeWeekAccent([positive, leverCandidate()]);
  assertEquals(picked?.source, 'positive');
  assertEquals(picked?.sentence, 'On plan — strength on track; endurance via cross-training.');
});

// ── Gates: the agreement rule (over-reach needs load AND body), RIR needs a target + a real sample ──
Deno.test('over-reach does NOT fire on high load with a fine body (ratio describes, body prescribes)', () => {
  assertEquals(overReachCandidate({ loadStatus: 'high', readiness: 'fresh' }), null);
  assertEquals(overReachCandidate({ loadStatus: 'on_target', readiness: 'overreached' }), null);
});

Deno.test('RIR does not qualify without a target (§7 — never invent the number)', () => {
  assertEquals(rirCandidate({ actualRir: 0, targetRir: null, sampleSize: 4 }), null);
  assertEquals(rirCandidate({ actualRir: 0.5, targetRir: 2, sampleSize: 1 }), null); // one session ≠ a week
});

// ── The lever slot is dormant until State v3 (never duplicates the PERFORMANCE posture line) ─────────
Deno.test('lever candidate is dormant (owed by State v3)', () => {
  assertEquals(leverCandidate(), null);
});

// ── Traceability — every emitted accent cites a source measurement (voice §5c) ──────────────────────
Deno.test('every accent carries a non-empty trace', () => {
  const accents = [
    overReachCandidate({ loadStatus: 'high', readiness: 'overreached', runningAcwr: 1.6 }),
    rirCandidate({ actualRir: 0.5, targetRir: 2, sampleSize: 3 }),
    bannerCandidate('Running behind plan — total load carried via easy cross-training.', 'carried'),
    bannerCandidate('On plan — strength on track; endurance via cross-training.', 'positive'),
  ];
  for (const a of accents) {
    assertEquals(typeof a?.trace.detail, 'string');
    assertEquals((a?.trace.detail.length ?? 0) > 0, true);
  }
});
