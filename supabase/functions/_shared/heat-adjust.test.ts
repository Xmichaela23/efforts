// deno test — heat-adjust primitive (Familiar Routes, docs/DESIGN-familiar-routes.md §4.2/§8 step 2).
// Run: deno test supabase/functions/_shared/heat-adjust.test.ts
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  adjEfficiency,
  DEFAULT_HEAT_K,
  DEW_REF_F,
  dewPointF,
  isComparableIntent,
  type RouteHeatRow,
  routeEfficiencyDirectionHeatAdjusted,
} from "./heat-adjust.ts";
import { computeEfficiencyIndex, routeEfficiencyDirection } from "./efficiency-index.ts";
import { heatTerm } from "./heat-adjust.ts";

Deno.test("heatTerm: hinged one-sided — 0 at/below ref, positive above, null when unknown", () => {
  assertEquals(heatTerm(45), 0);
  assertEquals(heatTerm(DEW_REF_F), 0);
  assertEquals(heatTerm(70), 15);
  assertEquals(heatTerm(null), null);
  assertEquals(heatTerm(undefined), null);
});

// ── dewPointF ───────────────────────────────────────────────────────────────────────────────────
Deno.test("dewPointF: warm & humid (80°F / 50%) ≈ 59.7°F", () => {
  assertAlmostEquals(dewPointF(80, 50)!, 59.7, 0.3);
});

Deno.test("dewPointF: cool & dry (50°F / 40%) is well below the neutral reference", () => {
  const d = dewPointF(50, 40)!;
  assert(d < DEW_REF_F, `expected dry-cool dew point < ${DEW_REF_F}, got ${d}`);
});

Deno.test("dewPointF: missing/invalid inputs → null, never a fabricated 0", () => {
  assertEquals(dewPointF(null, 50), null);
  assertEquals(dewPointF(80, null), null);
  assertEquals(dewPointF(80, 0), null);    // RH 0 is invalid (log domain), not "0% humidity"
  assertEquals(dewPointF(80, 120), null);  // out of range
});

// ── adjEfficiency: one-sided guarantee ────────────────────────────────────────────────────────────
Deno.test("adjEfficiency: cool run (dew < ref) is returned UNCHANGED — never scaled down", () => {
  assertEquals(adjEfficiency(2.2, 50, 0.005), 2.2);
  assertEquals(adjEfficiency(2.2, DEW_REF_F, 0.005), 2.2); // exactly at ref → penalty 0
});

Deno.test("adjEfficiency: unknown conditions (dew null) → unchanged, no invented correction", () => {
  assertEquals(adjEfficiency(2.2, null, 0.005), 2.2);
  assertEquals(adjEfficiency(null, 70, 0.005), null);
});

Deno.test("adjEfficiency: hot run is corrected UPWARD toward the neutral value", () => {
  const raw = 2.0;
  const adj = adjEfficiency(raw, 70, 0.005)!; // penalty = 0.005 * (70-55) = 0.075
  assertAlmostEquals(adj, 2.0 * 1.075, 1e-9);
  assert(adj > raw, "heat correction must raise a hot run's efficiency");
});

// ── THE ACCEPTANCE TEST — equal fitness, different heat, must read equal after adjustment ──────────
Deno.test("acceptance: hot & cool runs of EQUAL fitness read equal (pure primitive)", () => {
  const k = 0.005;
  const dewHot = 70;
  const effCool = 2.20;                                   // cool-day observed efficiency
  const penalty = k * (dewHot - DEW_REF_F);              // 0.075
  const effHot = effCool / (1 + penalty);               // same fitness, but heat inflated HR → lower observed
  // Cool run unchanged; hot run corrected back up — they must land on the same number.
  assertAlmostEquals(adjEfficiency(effHot, dewHot, k)!, adjEfficiency(effCool, 50, k)!, 1e-9);
});

Deno.test("acceptance: same speed, heat-inflated HR — end-to-end through computeEfficiencyIndex", () => {
  const k = DEFAULT_HEAT_K;                 // 0.005
  const pace = 300;                          // s/km, identical effort both days
  const hrCool = 150;
  const hrHot = hrCool * (1 + k * (70 - DEW_REF_F)); // 161.25 — heat drives HR up 7.5% over 15°F
  const adjCool = adjEfficiency(computeEfficiencyIndex(pace, hrCool), 50, k)!;
  const adjHot = adjEfficiency(computeEfficiencyIndex(pace, hrHot), 70, k)!;
  // Tolerance absorbs the 2-dp rounding inside computeEfficiencyIndex.
  assertAlmostEquals(adjHot, adjCool, 0.02);
});

// ── The route trend read (step 3) ─────────────────────────────────────────────────────────────────

Deno.test("intent gate: hard efforts dropped, easy/steady/long/unknown kept", () => {
  assertEquals(isComparableIntent("easy_run"), true);
  assertEquals(isComparableIntent("steady_state"), true);
  assertEquals(isComparableIntent("long_run"), true);
  assertEquals(isComparableIntent(null), true);       // unlabeled → kept (blocklist)
  assertEquals(isComparableIntent("intervals"), false);
  assertEquals(isComparableIntent("Tempo"), false);   // case-insensitive
  assertEquals(isComparableIntent("race"), false);
});

// THE MONEY TEST — the exact failure the old route line had: a hot stretch at UNCHANGED fitness read
// as "declining". Raw efficiency declines; heat-adjusted holds.
Deno.test("acceptance: summer heat at unchanged fitness — raw LIES 'declining', adjusted holds", () => {
  const pace = 300; // identical effort every run
  // Cool early runs, hot later runs; HR on hot days is heat-inflated for the SAME fitness
  // (165 = 150 × (1 + 0.005×(75−55))), so real fitness never changed.
  const rows: RouteHeatRow[] = [
    { date: "2026-03-01", pace_s_per_km: pace, hr: 150, dew_point_f: 45, intent: "easy_run" },
    { date: "2026-03-15", pace_s_per_km: pace, hr: 150, dew_point_f: 48, intent: "easy_run" },
    { date: "2026-07-01", pace_s_per_km: pace, hr: 165, dew_point_f: 75, intent: "easy_run" },
    { date: "2026-07-15", pace_s_per_km: pace, hr: 165, dew_point_f: 75, intent: "easy_run" },
  ];
  const raw = routeEfficiencyDirection(rows.map((r) => ({ date: r.date, pace_s_per_km: r.pace_s_per_km, hr: r.hr })))!;
  const adj = routeEfficiencyDirectionHeatAdjusted(rows)!;
  assertEquals(raw.direction, "declining"); // the confound-driven lie
  assertEquals(adj.direction, "holding");   // the honest read
});

Deno.test("acceptance: genuine improvement (HR drops at same pace, neutral weather) survives adjustment", () => {
  const pace = 300;
  const rows: RouteHeatRow[] = [
    { date: "2026-01-01", pace_s_per_km: pace, hr: 162, dew_point_f: 45, intent: "easy_run" },
    { date: "2026-01-15", pace_s_per_km: pace, hr: 160, dew_point_f: 46, intent: "easy_run" },
    { date: "2026-02-01", pace_s_per_km: pace, hr: 151, dew_point_f: 45, intent: "easy_run" },
    { date: "2026-02-15", pace_s_per_km: pace, hr: 149, dew_point_f: 47, intent: "easy_run" },
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows)!.direction, "improving");
});

Deno.test("gate: fewer than the min comparable points → null (familiarity only, never a faked trend)", () => {
  const rows: RouteHeatRow[] = [
    { date: "2026-05-01", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
    { date: "2026-05-08", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
    { date: "2026-05-15", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows), null); // 3 < 4
});

Deno.test("gate: hard efforts don't count toward the min — dropping them can force familiarity-only", () => {
  const rows: RouteHeatRow[] = [
    { date: "2026-05-01", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
    { date: "2026-05-08", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
    { date: "2026-05-15", pace_s_per_km: 300, hr: 150, dew_point_f: 50, intent: "easy_run" },
    { date: "2026-05-22", pace_s_per_km: 240, hr: 175, dew_point_f: 50, intent: "intervals" }, // dropped
    { date: "2026-05-29", pace_s_per_km: 230, hr: 178, dew_point_f: 50, intent: "race" },      // dropped
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows), null); // only 3 comparable → null
});

// ── The joint robust regression path (step 4/5, Option B) ──────────────────────────────────────────
import { MIN_REGRESSION_N, type RouteTrend, routeTrend } from "./heat-adjust.ts";

// 12 monthly runs over ~11 months; dew follows a real seasonal arc (hot summer, cool winter) so heat
// is NOT collinear with time — the case FWL / the joint fit is built for.
const MONTHS = [
  "2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01",
  "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01",
];
const SEASON_DEW = [70, 64, 55, 46, 40, 38, 42, 50, 58, 64, 70, 74]; // heatTerm arc: 15,9,0,0,0,0,0,0,3,9,15,19
function hist(hr: number[], dew: number[], n = hr.length): RouteHeatRow[] {
  return MONTHS.slice(0, n).map((d, i) => ({
    date: d, pace_s_per_km: 300, hr: hr[i], dew_point_f: dew[i], intent: "easy_run",
  }));
}
const ht = (dew: number) => Math.max(0, dew - 55);
// HR at flat fitness (base 150), heat-inflated by 0.5%/°F above ref — the ground-truth confound.
const flatHR = SEASON_DEW.map((d) => Math.round(150 * (1 + 0.005 * ht(d))));
// HR at improving fitness: base falls 158→146 across the year, then heat-inflated.
const improvingHR = SEASON_DEW.map((d, i) => Math.round((158 - i * (12 / 11)) * (1 + 0.005 * ht(d))));

Deno.test("regression: flat fitness under a hot summer — heat confound removed, reads HOLDING not declining", () => {
  const t = routeTrend(hist(flatHR, SEASON_DEW))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "holding");           // honest: fitness never changed
  assert(t.heatCoefPctPerF! < 0, "learned heat coefficient must be negative (heat lowers raw efficiency)");
  // "holding" already guarantees the CI sits within ±band; just confirm a CI object was produced.
  // (This synthetic fit is near-perfect, so its CI width is ~0; real data always has scatter — see
  // the "still_learning" test for a genuinely wide CI.)
  assert(t.ci != null, "regression must report a CI");
});

Deno.test("regression: genuine improvement (HR falls at same pace) is detected, CI clears zero", () => {
  const t = routeTrend(hist(improvingHR, SEASON_DEW))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "improving");
  assert(t.ci != null && t.ci[0] > 0, `CI should be entirely positive, got ${JSON.stringify(t.ci)}`);
});

Deno.test("regression: one sick-day outlier does NOT flip the verdict (Huber robustness)", () => {
  const withOutlier = hist(improvingHR, SEASON_DEW);
  withOutlier[6] = { ...withOutlier[6], hr: improvingHR[6] + 45 }; // one wildly high-HR run
  const t = routeTrend(withOutlier)!;
  assertEquals(t.direction, "improving"); // survives the outlier
});

Deno.test("regression_time_only: all-cool history (no heat confound) trends on time directly", () => {
  const coolDew = [40, 42, 44, 46, 48, 50, 52, 54, 45, 47, 49, 51]; // all ≤54 → heatTerm all 0
  const baseImproving = MONTHS.map((_, i) => Math.round(158 - i * (12 / 11))); // clean fitness gain, no heat
  const t = routeTrend(hist(baseImproving, coolDew))!;
  assertEquals(t.method, "regression_time_only");
  assertEquals(t.direction, "improving");
  assertEquals(t.heatCoefPctPerF, null); // no heat term in the model
});

Deno.test("fallback: weather-uniform route (heat present but under-identified) → linear_k, not a guessed β_heat", () => {
  const narrowDew = [66, 68, 70, 67, 69, 66, 68, 70, 67, 69]; // heatTerm 11–15, SD < 4
  const t = routeTrend(hist(new Array(10).fill(150), narrowDew, 10))!;
  assertEquals(t.method, "linear_k");
  assertEquals(t.ci, null);
});

Deno.test("fallback: thin route (< MIN_REGRESSION_N comparable) → linear_k half-vs-half", () => {
  const t = routeTrend(hist(new Array(5).fill(150), SEASON_DEW.slice(0, 5), 5));
  assert(t != null && t.method === "linear_k", `expected linear_k, got ${t?.method}`);
  assert(MIN_REGRESSION_N === 8);
});

Deno.test("honesty: noisy flat data with a wide CI reads 'still_learning', never a faked direction", () => {
  const noisyHR = SEASON_DEW.map((d, i) => Math.round(150 * (1 + 0.005 * ht(d)) + (i % 2 ? 18 : -18)));
  const t = routeTrend(hist(noisyHR, SEASON_DEW))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "still_learning"); // huge scatter → CI too wide to claim a trend
});
