/**
 * Fixtures for the D-263 build-step 3 off-plan Q-140 kill (supersedes D-262).
 * Attribution keys on acute-load COMPOSITION (per-slice ACWR is null-by-floor in
 * prod). Grounded on the real live receipt: easy 252 / hard 58 / strength 68, all
 * ratios null, total 1.58 → "easy cross-training".
 * Run: deno test supabase/functions/_shared/off-plan-banner.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { offPlanAdherenceBanner } from './off-plan-banner.ts';
import { computePerDomainLoad, type SliceSession, type PerDomainLoad, type PerDomainSlice, type SliceKey } from './per-domain-load.ts';

const FACT = 'Off plan this week — planned sessions skipped.';
const FULL = `${FACT} Get back on schedule before adding extra.`;
const CARRIED_EASY = 'Running behind plan — total load carried via easy cross-training.';
const CARRIED_GENERIC = 'Running behind plan — total load carried across your training.';

// Build a PerDomainLoad from acute loads (ratios null = the prod null-by-floor case).
function slice(key: SliceKey, acute: number, acwr: number | null = null): PerDomainSlice {
  return { key, acwr, acute_load: acute, chronic_load: 0, status: acwr == null ? 'insufficient_base' : 'ok', bin_signal: 'mixed', hr_quality: 'n/a' };
}
function pd(easy: number, hard: number, strength: number, easyAcwr: number | null = null): PerDomainLoad {
  return { easy_cardio: slice('easy_cardio', easy, easyAcwr), hard_cardio: slice('hard_cardio', hard), strength: slice('strength', strength) };
}

// ── THE LIVE RECEIPT (prod reality: all ratios null, easy carries the majority) ──
Deno.test('live receipt: easy 252 / hard 58 / strength 68, ratios NULL, total 1.58 → easy cross-training', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.5782881, perDomain: pd(252, 58, 68) }),
    CARRIED_EASY, // 252/378 = 0.67 ≥ 0.5 — composition names the carrier even with null ratios
  );
});

// ── No dominant carrier → generic is CORRECT (not a fallback failure) ──
Deno.test('spread load (no slice ≥ 0.5) → generic "across your training"', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -60, weekIntent: 'build', totalAcwr: 1.2, perDomain: pd(100, 100, 100) }),
    CARRIED_GENERIC, // each 0.33 — no majority carrier
  );
});
Deno.test('hard/strength carries the majority (not easy) → generic, never mis-attributed to easy', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -60, weekIntent: 'build', totalAcwr: 1.2, perDomain: pd(50, 250, 50) }), CARRIED_GENERIC);
});

// ── Maturing history: one cleared-floor case (easy_cardio ACWR non-null) ──
// Composition still drives attribution — result is identical whether the ratio
// exists or not, proving the fix doesn't depend on the null-by-floor accident.
Deno.test('cleared-floor (maturing): easy_cardio acwr present AND dominant → still easy cross-training', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.58, perDomain: pd(252, 58, 68, 1.28) }),
    CARRIED_EASY,
  );
});

// ── Bidirectional supersede (b): add-more can NEVER co-occur with rest-now ──
Deno.test('supersede (b): no input with total ≥ 1.5 (rest-now range) yields add-more', () => {
  for (let a = 1.5; a <= 2.5; a = Math.round((a + 0.1) * 10) / 10) {
    for (const comp of [pd(0, 0, 0), pd(300, 0, 0), pd(100, 100, 100), pd(0, 300, 0)]) {
      if (offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'build', totalAcwr: a, perDomain: comp }) === FULL) {
        throw new Error(`add-more emerged at totalAcwr=${a} — contradiction re-emerged`);
      }
    }
  }
});
Deno.test('genuinely under-training (total < 1.0) → add-more IS correct', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 0.7, perDomain: pd(50, 0, 20) }), FULL);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: null, perDomain: null }), FULL);
});

// ── D-147 firing conditions preserved ──
Deno.test('D-147 preserved: non-shortfall / elevated load / light intent → null', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -20, weekIntent: 'build', totalAcwr: 0.9, perDomain: null }), null);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'elevated', runLoadPct: -100, weekIntent: 'build', totalAcwr: 1.58, perDomain: pd(252, 58, 68) }), null);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'taper', totalAcwr: 0.7, perDomain: null }), null);
});

// ── e2e: real rows → computePerDomainLoad → banner (composition, not hand-set) ──
function ymd(offset: number): string { return new Date(Date.UTC(2026, 6, 8) - offset * 86_400_000).toISOString().slice(0, 10); }
const FTP = 176;
const ride = (d: string, l: number, p: number): SliceSession => ({ date: d, type: 'ride', workload: l, avgPower: p, ftp: FTP });
const swim = (d: string, l: number): SliceSession => ({ date: d, type: 'swim', workload: l, avgPace: 130 });
const st = (d: string, l: number): SliceSession => ({ date: d, type: 'strength', workload: l });
const JULY_WEEK: SliceSession[] = [
  ride(ymd(6), 76, 105), st(ymd(6), 25), swim(ymd(5), 14), ride(ymd(2), 77, 108), st(ymd(2), 25), st(ymd(1), 18), swim(ymd(1), 6), swim(ymd(1), 15),
  ride(ymd(8), 70, 100), ride(ymd(10), 48, 100), swim(ymd(12), 15), st(ymd(9), 30), st(ymd(11), 30),
  ride(ymd(15), 70, 100), ride(ymd(17), 48, 100), swim(ymd(19), 15), st(ymd(16), 30), st(ymd(18), 30),
  ride(ymd(22), 70, 100), ride(ymd(24), 48, 100), swim(ymd(26), 15), st(ymd(23), 30), st(ymd(25), 30),
];
Deno.test('e2e: real rows → per-domain → banner → easy cross-training (composition-driven)', () => {
  const perDomain = computePerDomainLoad(JULY_WEEK, { asOfDate: '2026-07-08' });
  const banner = offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.58, perDomain });
  assertEquals(banner, CARRIED_EASY);
});

// ═══ D-268 Phase 2: strength-primary → banner keys on STRENGTH, never "Running behind plan" ═══
const S_CARRIED = 'On plan — strength on track; endurance via cross-training.';
const S_LIGHT = 'Strength on track — room to add endurance.';
const S_BEHIND = 'Behind on strength this week — your priority sessions.';
const adhMet = { discipline: 'strength', met: true, note: 'strength 3/4 sessions · e1RM steady' };
const adhNot = { discipline: 'strength', met: false, note: 'strength 1/4 sessions' };

Deno.test('D-268 P2: strength-primary, strength met + loaded (his live case, ACWR 1.27) → "On plan", NOT "Running behind plan"', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.27, perDomain: pd(252, 58, 68), planPrimary: 'strength', primaryAdherence: adhMet }),
    S_CARRIED,
  );
});
Deno.test('D-268 P2: strength-primary, strength met + light (ACWR 0.9) → headroom, not behind', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 0.9, perDomain: pd(20, 0, 40), planPrimary: 'strength', primaryAdherence: adhMet }),
    S_LIGHT,
  );
});
Deno.test('D-268 P2: strength-primary, strength NOT met → "Behind on strength" (the genuine miss)', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.2, perDomain: pd(200, 0, 20), planPrimary: 'strength', primaryAdherence: adhNot }),
    S_BEHIND,
  );
});
Deno.test('D-268 P2 NEG: endurance-primary → original run-centric banner unchanged', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.58, perDomain: pd(252, 58, 68), planPrimary: 'endurance', primaryAdherence: null }),
    CARRIED_EASY,
  );
});

// ── D-281 / Q-166: the banner must survive the new 'productive' state ─────────
// The cross-training-carried athlete is EXACTLY who this banner exists to explain — and D-281 is what
// moves that athlete from 'on_target' to 'productive'. A hardcoded ['under','on_target'] gate would
// have silently dropped the banner for them at the very moment the verdict started naming their load.
Deno.test("D-281: loadStatus 'productive' (rank 1, non-alarming) still shows the carried-load banner", () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'productive', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.45, perDomain: pd(252, 58, 68) }),
    CARRIED_EASY,
  );
});

// The other side of the gate: a genuinely elevated week is NOT explained away by this banner — the load
// verdict itself is the message, and the banner would talk over it.
Deno.test("D-281: loadStatus 'elevated' still suppresses the banner (the verdict speaks, not the banner)", () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'elevated', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.64, perDomain: pd(252, 58, 68) }),
    null,
  );
});
