/**
 * Tests for the athlete-snapshot contract (v1).
 *
 * Closes the description↔delivered drift class by pinning the dispatcher's view of athlete
 * inputs into `plan.config.athlete_snapshot`. Consumers read via `readAthleteSnapshotOrLive`.
 *
 * v1 populates strength `performance_numbers` only. Other categories (bike/swim/run/equipment/
 * intent/capacity/bio) are typed in the shape but null until follow-up commits — tests verify
 * the contract carries the null sentinels so future populates are additive.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/_shared/athlete-snapshot.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildAthleteSnapshot,
  readAthleteSnapshotOrLive,
  type AthleteSnapshotV1,
} from './athlete-snapshot.ts';

// ── §1 buildAthleteSnapshot — strength 1RM extraction ─────────────────────

Deno.test('buildAthleteSnapshot: extracts canonical strength 1RMs from athlete_state', () => {
  const snap = buildAthleteSnapshot({
    athleteState: {
      performance_numbers: {
        deadlift: 150,
        squat: 200,
        bench: 175,
        overheadPress1RM: 100,
        hipThrust: 250,
      },
    },
  });
  assertEquals(snap.schema_version, 1);
  assertEquals(snap.source, 'request');
  assertEquals(snap.performance_numbers?.deadlift, 150);
  assertEquals(snap.performance_numbers?.squat, 200);
  assertEquals(snap.performance_numbers?.bench, 175);
  assertEquals(snap.performance_numbers?.overheadPress1RM, 100);
  assertEquals(snap.performance_numbers?.hipThrust, 250);
});

Deno.test('buildAthleteSnapshot: accepts aliases (dead_lift, squat_1rm, bench_press, ohp)', () => {
  const snap = buildAthleteSnapshot({
    athleteState: {
      performance_numbers: {
        dead_lift: 150,
        squat_1rm: 200,
        bench_press: 175,
        ohp: 100,
        hip_thrust: 250,
      },
    },
  });
  // Aliases collapse to canonical keys.
  assertEquals(snap.performance_numbers?.deadlift, 150);
  assertEquals(snap.performance_numbers?.squat, 200);
  assertEquals(snap.performance_numbers?.bench, 175);
  assertEquals(snap.performance_numbers?.overheadPress1RM, 100);
  assertEquals(snap.performance_numbers?.hipThrust, 250);
});

Deno.test('buildAthleteSnapshot: null when no performance_numbers', () => {
  const snap = buildAthleteSnapshot({ athleteState: {} });
  assertEquals(snap.performance_numbers, null);
});

Deno.test('buildAthleteSnapshot: ignores non-positive / non-finite values', () => {
  const snap = buildAthleteSnapshot({
    athleteState: {
      performance_numbers: {
        deadlift: 0,
        squat: -10,
        bench: 'invalid',
        overheadPress1RM: null,
        hipThrust: 100, // only this one survives
      },
    },
  });
  assertEquals(snap.performance_numbers?.deadlift, undefined);
  assertEquals(snap.performance_numbers?.squat, undefined);
  assertEquals(snap.performance_numbers?.bench, undefined);
  assertEquals(snap.performance_numbers?.overheadPress1RM, undefined);
  assertEquals(snap.performance_numbers?.hipThrust, 100);
});

Deno.test('buildAthleteSnapshot: future categories typed but null (forward-compat)', () => {
  const snap = buildAthleteSnapshot({ athleteState: { performance_numbers: { deadlift: 150 } } });
  assertEquals(snap.bike, null);
  assertEquals(snap.swim, null);
  assertEquals(snap.run, null);
  assertEquals(snap.equipment, null);
  assertEquals(snap.intent, null);
  assertEquals(snap.capacity, null);
  assertEquals(snap.bio, null);
});

Deno.test('buildAthleteSnapshot: source label propagates', () => {
  const fromArc = buildAthleteSnapshot({ athleteState: {}, source: 'arc' });
  assertEquals(fromArc.source, 'arc');
  const fromReq = buildAthleteSnapshot({ athleteState: {} });
  assertEquals(fromReq.source, 'request');
});

Deno.test('buildAthleteSnapshot: generated_at is a parseable ISO timestamp', () => {
  const snap = buildAthleteSnapshot({ athleteState: {} });
  const t = Date.parse(snap.generated_at);
  assert(Number.isFinite(t), `expected parseable ISO timestamp — got "${snap.generated_at}"`);
});

// ── §2 round-trip: build → JSON → parse → read ────────────────────────────

Deno.test('snapshot round-trip: build → JSON.stringify → JSON.parse → readAthleteSnapshotOrLive', () => {
  const original = buildAthleteSnapshot({
    athleteState: { performance_numbers: { deadlift: 150, squat: 200 } },
  });
  // Simulate JSONB persistence.
  const persisted = JSON.parse(JSON.stringify(original));
  const planConfig = { athlete_snapshot: persisted };
  const resolved = readAthleteSnapshotOrLive(planConfig, null);
  assertEquals(resolved.source, 'snapshot');
  assertEquals(resolved.performance_numbers.deadlift, 150);
  assertEquals(resolved.performance_numbers.squat, 200);
  assertEquals(resolved.performance_numbers.bench, null);
});

// ── §3 readAthleteSnapshotOrLive — snapshot path ──────────────────────────

Deno.test('readAthleteSnapshotOrLive: prefers snapshot when present', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'request',
      performance_numbers: { deadlift: 150, squat: 200 },
      bike: null, swim: null, run: null, equipment: null, intent: null, capacity: null, bio: null,
    } satisfies AthleteSnapshotV1,
  };
  const live = { performance_numbers: { deadlift: 999, squat: 999 }, learned_fitness: { strength_1rms: { deadlift: { value: 999 } } } };
  const resolved = readAthleteSnapshotOrLive(planConfig, live);
  assertEquals(resolved.source, 'snapshot');
  // Snapshot wins over live values.
  assertEquals(resolved.performance_numbers.deadlift, 150);
  assertEquals(resolved.performance_numbers.squat, 200);
});

Deno.test('readAthleteSnapshotOrLive: snapshot with missing lift returns null for that lift', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'request',
      performance_numbers: { deadlift: 150 }, // only deadlift
      bike: null, swim: null, run: null, equipment: null, intent: null, capacity: null, bio: null,
    } satisfies AthleteSnapshotV1,
  };
  const resolved = readAthleteSnapshotOrLive(planConfig, null);
  assertEquals(resolved.performance_numbers.deadlift, 150);
  assertEquals(resolved.performance_numbers.squat, null);
  assertEquals(resolved.performance_numbers.bench, null);
  assertEquals(resolved.performance_numbers.overheadPress1RM, null);
  assertEquals(resolved.performance_numbers.hipThrust, null);
});

// ── §4 readAthleteSnapshotOrLive — legacy fallback path ───────────────────

Deno.test('readAthleteSnapshotOrLive: legacy plan with no snapshot falls back to live', () => {
  const live = {
    performance_numbers: { deadlift: 200, squat: 250 },
    learned_fitness: null,
  };
  const resolved = readAthleteSnapshotOrLive(null, live, { logLegacyFallback: false });
  assertEquals(resolved.source, 'live');
  assertEquals(resolved.performance_numbers.deadlift, 200);
  assertEquals(resolved.performance_numbers.squat, 250);
});

Deno.test('readAthleteSnapshotOrLive: legacy fallback merges manual > learned > null', () => {
  const live = {
    performance_numbers: { deadlift: 200 }, // manual deadlift
    learned_fitness: {
      strength_1rms: {
        deadlift: { value: 999 }, // would be ignored — manual wins
        squat: { value: 175 }, // no manual → learned wins
        bench: { value: 0 }, // not positive → falls to null
      },
    },
  };
  const resolved = readAthleteSnapshotOrLive(null, live, { logLegacyFallback: false });
  assertEquals(resolved.performance_numbers.deadlift, 200, 'manual wins over learned');
  assertEquals(resolved.performance_numbers.squat, 175, 'learned used when manual missing');
  assertEquals(resolved.performance_numbers.bench, null, 'zero learned → null');
});

Deno.test('readAthleteSnapshotOrLive: schema_version mismatch falls back to live', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 999, // future version this code doesn't understand
      performance_numbers: { deadlift: 150 },
    },
  };
  const live = { performance_numbers: { deadlift: 200 } };
  const resolved = readAthleteSnapshotOrLive(planConfig, live, { logLegacyFallback: false });
  // Unknown version → treat as legacy → use live.
  assertEquals(resolved.source, 'live');
  assertEquals(resolved.performance_numbers.deadlift, 200);
});

// ── §5 audit-scenario reproducers — Bug A drift class ─────────────────────

Deno.test('Bug A reproducer: snapshot 150 + live 200 → resolver returns 150 (snapshot wins)', () => {
  // Real-world scenario from the test plan: athlete's saved deadlift was 150 at plan-gen
  // time (description quoted "1RM 150"). Later user_baselines.performance_numbers.deadlift
  // was 200 in DB (could be from prior plan, learned drift, etc.). Pre-fix the materializer
  // read live 200 → 0.76 × 200 = 152 → delivered 155 lb (matches Week 17 = 155 observed).
  // Post-fix the materializer reads from the pinned snapshot → 150 → 0.76 × 150 = 114 → 115 lb.
  const planConfig = {
    athlete_snapshot: buildAthleteSnapshot({
      athleteState: { performance_numbers: { deadlift: 150 } },
    }),
  };
  const live = { performance_numbers: { deadlift: 200 } }; // drifted live value
  const resolved = readAthleteSnapshotOrLive(planConfig, live);
  assertEquals(resolved.source, 'snapshot');
  assertEquals(resolved.performance_numbers.deadlift, 150);
});

Deno.test('Bug A reproducer: per-session consistency — same plan, same resolved deadlift', () => {
  // Reproduces the Week 16=100/Week 17=155 divergence: in the same plan, two sessions
  // back-solved to different 1RMs (139 and 204). With the snapshot, ALL sessions resolve
  // from the same value because they all read from `plan.config.athlete_snapshot`.
  const planConfig = {
    athlete_snapshot: buildAthleteSnapshot({
      athleteState: { performance_numbers: { deadlift: 150 } },
    }),
  };
  // Simulate three sessions each reading the resolver independently.
  const r1 = readAthleteSnapshotOrLive(planConfig, null);
  const r2 = readAthleteSnapshotOrLive(planConfig, null);
  const r3 = readAthleteSnapshotOrLive(planConfig, null);
  assertEquals(r1.performance_numbers.deadlift, r2.performance_numbers.deadlift);
  assertEquals(r2.performance_numbers.deadlift, r3.performance_numbers.deadlift);
  assertEquals(r1.performance_numbers.deadlift, 150);
});

// ── §6 Tier 1 item 2 — bike + run snapshot pinning ────────────────────────

Deno.test('buildAthleteSnapshot: extracts bike FTP via resolveCurrentFtp (learned ≥medium wins)', () => {
  const snap = buildAthleteSnapshot({
    athleteState: {
      learned_fitness: { ride_ftp_estimated: { value: 265, confidence: 'high' } },
      performance_numbers: { ftp: 240 }, // manual would be ignored — learned-high wins per resolver
    },
  });
  assertEquals(snap.bike?.ftp_w, 265);
});

Deno.test('buildAthleteSnapshot: extracts bike FTP from manual when no learned', () => {
  const snap = buildAthleteSnapshot({
    athleteState: {
      learned_fitness: null,
      performance_numbers: { ftp: 240 },
    },
  });
  assertEquals(snap.bike?.ftp_w, 240);
});

Deno.test('buildAthleteSnapshot: bike null when no FTP signal at all', () => {
  const snap = buildAthleteSnapshot({ athleteState: {} });
  assertEquals(snap.bike, null);
});

Deno.test('buildAthleteSnapshot: extracts run paces from learned_fitness with km→mi conversion', () => {
  // 240 sec/km × 1.609344 = 386.24… → rounds to 386 sec/mi (≈ 6:26/mi).
  // 300 sec/km × 1.609344 = 482.80… → rounds to 483 sec/mi (≈ 8:03/mi).
  const snap = buildAthleteSnapshot({
    athleteState: {
      learned_fitness: {
        run_threshold_pace_sec_per_km: { value: 240, confidence: 'high' },
        run_easy_pace_sec_per_km: { value: 300, confidence: 'medium' },
      },
    },
  });
  assertEquals(snap.run?.threshold_pace_sec_per_mi, 386);
  assertEquals(snap.run?.easy_pace_sec_per_mi, 483);
});

Deno.test('buildAthleteSnapshot: run null when no learned paces present', () => {
  const snap = buildAthleteSnapshot({ athleteState: { learned_fitness: {} } });
  assertEquals(snap.run, null);
});

Deno.test('readAthleteSnapshotOrLive: pinned bike FTP wins over different live FTP', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'request',
      performance_numbers: null,
      bike: { ftp_w: 265 }, // pinned at plan-creation time
      swim: null, run: null, equipment: null, intent: null, capacity: null, bio: null,
    } satisfies AthleteSnapshotV1,
  };
  // Athlete updated FTP to 280 in baselines AFTER plan was created.
  const live = {
    performance_numbers: { ftp: 280 },
    learned_fitness: { ride_ftp_estimated: { value: 290, confidence: 'high' } },
  };
  const resolved = readAthleteSnapshotOrLive(planConfig, live);
  assertEquals(resolved.source, 'snapshot');
  assertEquals(resolved.bike.ftp_w, 265, 'snapshot pin (265) wins over both live values (280, 290)');
});

Deno.test('readAthleteSnapshotOrLive: pinned run paces win over different live paces', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'request',
      performance_numbers: null,
      bike: null,
      swim: null,
      run: {
        threshold_pace_sec_per_mi: 386,
        easy_pace_sec_per_mi: 483,
      },
      equipment: null, intent: null, capacity: null, bio: null,
    } satisfies AthleteSnapshotV1,
  };
  // Athlete's learned paces have shifted faster after plan creation.
  const live = {
    performance_numbers: null,
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 220 }, // would be 354 sec/mi if read live
      run_easy_pace_sec_per_km: { value: 280 },      // would be 451 sec/mi if read live
    },
  };
  const resolved = readAthleteSnapshotOrLive(planConfig, live);
  assertEquals(resolved.source, 'snapshot');
  assertEquals(resolved.run.threshold_pace_sec_per_mi, 386, 'snapshot pin wins');
  assertEquals(resolved.run.easy_pace_sec_per_mi, 483, 'snapshot pin wins');
});

Deno.test('readAthleteSnapshotOrLive: bike+run fall back to live cleanly when no snapshot', () => {
  const live = {
    performance_numbers: { ftp: 245 },
    learned_fitness: {
      ride_ftp_estimated: { value: 260, confidence: 'medium' },
      run_threshold_pace_sec_per_km: { value: 250 },
      run_easy_pace_sec_per_km: { value: 310 },
    },
  };
  const resolved = readAthleteSnapshotOrLive(null, live, { logLegacyFallback: false });
  assertEquals(resolved.source, 'live');
  // Bike: resolver picks learned ≥medium over manual.
  assertEquals(resolved.bike.ftp_w, 260);
  // Run: 250 × 1.609344 → 402; 310 × 1.609344 → 499.
  assertEquals(resolved.run.threshold_pace_sec_per_mi, 402);
  assertEquals(resolved.run.easy_pace_sec_per_mi, 499);
  assertEquals(resolved.run.fiveK_pace_sec_per_mi, null, 'no learned 5K pace path today');
});

Deno.test('readAthleteSnapshotOrLive: legacy with no FTP/pace signal at all returns nulls', () => {
  const resolved = readAthleteSnapshotOrLive(null, { performance_numbers: null, learned_fitness: null }, { logLegacyFallback: false });
  assertEquals(resolved.bike.ftp_w, null);
  assertEquals(resolved.run.threshold_pace_sec_per_mi, null);
  assertEquals(resolved.run.easy_pace_sec_per_mi, null);
  assertEquals(resolved.run.fiveK_pace_sec_per_mi, null);
});

Deno.test('readAthleteSnapshotOrLive: per-category fallback — snapshot has bike but null run → run reads live', () => {
  const planConfig = {
    athlete_snapshot: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'request',
      performance_numbers: null,
      bike: { ftp_w: 265 },
      run: null, // dispatcher had no learned run paces at plan time
      swim: null, equipment: null, intent: null, capacity: null, bio: null,
    } satisfies AthleteSnapshotV1,
  };
  // Athlete subsequently logged enough run history to learn paces.
  const live = {
    performance_numbers: null,
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 240 },
    },
  };
  const resolved = readAthleteSnapshotOrLive(planConfig, live);
  assertEquals(resolved.source, 'snapshot', 'overall source reflects snapshot present');
  assertEquals(resolved.bike.ftp_w, 265, 'bike pinned');
  assertEquals(resolved.run.threshold_pace_sec_per_mi, 386, 'run reads live since snapshot.run is null');
});
