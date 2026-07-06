// deno test — heat-adjust (Familiar Routes, docs/DESIGN-familiar-routes.md §4).
// Run: deno test supabase/functions/_shared/heat-adjust.test.ts
// Active heat variable = AIR TEMPERATURE (°F), neutral reference TEMP_REF_F = 60. Dew point is still
// computed + stored (dewPointF) but DORMANT in the model — the humid-climate refinement.
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  adjEfficiency,
  DEFAULT_HEAT_K,
  DEW_REF_F,
  dewPointF,
  heatTerm,
  isComparableIntent,
  MIN_REGRESSION_N,
  type RouteHeatRow,
  routeEfficiencyDirectionHeatAdjusted,
  routeTrend,
  TEMP_REF_F,
} from "./heat-adjust.ts";
import { computeEfficiencyIndex } from "./efficiency-index.ts";

// ── heatTerm (now air-temperature-based, hinged one-sided) ──────────────────────────────────────────
Deno.test("heatTerm: hinged one-sided on air temp — 0 at/below 60°F, positive above, null unknown", () => {
  assertEquals(heatTerm(50), 0);
  assertEquals(heatTerm(TEMP_REF_F), 0); // exactly at ref
  assertEquals(heatTerm(75), 15);
  assertEquals(heatTerm(null), null);
  assertEquals(heatTerm(undefined), null);
});

// ── dewPointF (still computed for storage / future humid path) ──────────────────────────────────────
Deno.test("dewPointF: warm & humid (80°F / 50%) ≈ 59.7°F", () => {
  assertAlmostEquals(dewPointF(80, 50)!, 59.7, 0.3);
});
Deno.test("dewPointF: cool & dry (50°F / 40%) is well below the dew reference", () => {
  assert(dewPointF(50, 40)! < DEW_REF_F);
});
Deno.test("dewPointF: missing/invalid inputs → null, never a fabricated 0", () => {
  assertEquals(dewPointF(null, 50), null);
  assertEquals(dewPointF(80, null), null);
  assertEquals(dewPointF(80, 0), null);   // RH 0 invalid (log domain)
  assertEquals(dewPointF(80, 120), null); // out of range
});

// ── adjEfficiency: one-sided guarantee (temperature) ────────────────────────────────────────────────
Deno.test("adjEfficiency: cool run (temp ≤ ref) is returned UNCHANGED — never scaled down", () => {
  assertEquals(adjEfficiency(2.2, 50, 0.005), 2.2);
  assertEquals(adjEfficiency(2.2, TEMP_REF_F, 0.005), 2.2); // at ref → penalty 0
});
Deno.test("adjEfficiency: unknown conditions (temp null) → unchanged, no invented correction", () => {
  assertEquals(adjEfficiency(2.2, null, 0.005), 2.2);
  assertEquals(adjEfficiency(null, 75, 0.005), null);
});
Deno.test("adjEfficiency: hot run is corrected UPWARD toward the neutral value", () => {
  const adj = adjEfficiency(2.0, 75, 0.005)!; // penalty = 0.005 × (75−60) = 0.075
  assertAlmostEquals(adj, 2.0 * 1.075, 1e-9);
  assert(adj > 2.0, "heat correction must raise a hot run's efficiency");
});

// ── acceptance: equal fitness, different heat, read equal after adjustment ───────────────────────────
Deno.test("acceptance: hot & cool runs of EQUAL fitness read equal (pure primitive)", () => {
  const k = 0.005;
  const tempHot = 75;
  const effCool = 2.20;
  const penalty = k * (tempHot - TEMP_REF_F); // 0.075
  const effHot = effCool / (1 + penalty);     // same fitness, heat inflated HR → lower observed
  assertAlmostEquals(adjEfficiency(effHot, tempHot, k)!, adjEfficiency(effCool, 50, k)!, 1e-9);
});
Deno.test("acceptance: same speed, heat-inflated HR — end-to-end through computeEfficiencyIndex", () => {
  const k = DEFAULT_HEAT_K;
  const pace = 300;
  const hrCool = 150;
  const hrHot = hrCool * (1 + k * (80 - TEMP_REF_F)); // 165 — heat drives HR up 10% over 20°F
  const adjCool = adjEfficiency(computeEfficiencyIndex(pace, hrCool), 50, k)!;
  const adjHot = adjEfficiency(computeEfficiencyIndex(pace, hrHot), 80, k)!;
  assertAlmostEquals(adjHot, adjCool, 0.02);
});

// ── intent gate ─────────────────────────────────────────────────────────────────────────────────────
Deno.test("intent gate: hard efforts dropped, easy/steady/long/unknown kept", () => {
  assertEquals(isComparableIntent("easy_run"), true);
  assertEquals(isComparableIntent("steady_state"), true);
  assertEquals(isComparableIntent("long_run"), true);
  assertEquals(isComparableIntent(null), true);
  assertEquals(isComparableIntent("intervals"), false);
  assertEquals(isComparableIntent("Tempo"), false);
  assertEquals(isComparableIntent("race"), false);
});

// ── linear-k × half-vs-half (thin-route fallback path) ──────────────────────────────────────────────
// THE MONEY TEST: a hot stretch at UNCHANGED fitness — raw reads "declining", heat-adjusted "holding".
Deno.test("fallback: summer heat at unchanged fitness — raw LIES 'declining', adjusted holds", () => {
  const pace = 300;
  // Hot-day HR heat-inflated for the SAME fitness: 165 = 150 × (1 + 0.005×(80−60)).
  const rows: RouteHeatRow[] = [
    { date: "2026-03-01", pace_s_per_km: pace, hr: 150, temp_f: 50, intent: "easy_run" },
    { date: "2026-03-15", pace_s_per_km: pace, hr: 150, temp_f: 52, intent: "easy_run" },
    { date: "2026-07-01", pace_s_per_km: pace, hr: 165, temp_f: 80, intent: "easy_run" },
    { date: "2026-07-15", pace_s_per_km: pace, hr: 165, temp_f: 80, intent: "easy_run" },
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows)!.direction, "holding");
});
Deno.test("fallback: genuine improvement (HR drops at same pace) survives adjustment", () => {
  const rows: RouteHeatRow[] = [
    { date: "2026-01-01", pace_s_per_km: 300, hr: 162, temp_f: 50, intent: "easy_run" },
    { date: "2026-01-15", pace_s_per_km: 300, hr: 160, temp_f: 52, intent: "easy_run" },
    { date: "2026-02-01", pace_s_per_km: 300, hr: 151, temp_f: 50, intent: "easy_run" },
    { date: "2026-02-15", pace_s_per_km: 300, hr: 149, temp_f: 53, intent: "easy_run" },
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows)!.direction, "improving");
});
Deno.test("gate: fewer than the ≥4 floor → null (familiarity only, never a faked trend)", () => {
  const rows: RouteHeatRow[] = [
    { date: "2026-05-01", pace_s_per_km: 300, hr: 150, temp_f: 60, intent: "easy_run" },
    { date: "2026-05-08", pace_s_per_km: 300, hr: 150, temp_f: 60, intent: "easy_run" },
    { date: "2026-05-15", pace_s_per_km: 300, hr: 150, temp_f: 60, intent: "easy_run" },
  ];
  assertEquals(routeEfficiencyDirectionHeatAdjusted(rows), null);
});

// ── The joint robust regression path (Option B) ─────────────────────────────────────────────────────
// 12 monthly runs; air temp follows a seasonal arc (hot summer / cool winter) so heat is NOT collinear
// with time — the case the joint fit / FWL is built for. Real dry-climate ranges (~50–88°F).
const MONTHS = [
  "2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01",
  "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01",
];
const SEASON_TEMP = [82, 78, 68, 60, 54, 52, 56, 62, 70, 76, 82, 88]; // heatTerm arc: 22,18,8,0,0,0,0,2,10,16,22,28
function hist(hr: number[], temp: number[], n = hr.length): RouteHeatRow[] {
  return MONTHS.slice(0, n).map((d, i) => ({
    date: d, pace_s_per_km: 300, hr: hr[i], temp_f: temp[i], intent: "easy_run",
  }));
}
const ht = (t: number) => Math.max(0, t - TEMP_REF_F);
const flatHR = SEASON_TEMP.map((t) => Math.round(150 * (1 + 0.005 * ht(t))));         // flat fitness, heat-inflated
const improvingHR = SEASON_TEMP.map((t, i) => Math.round((158 - i * (12 / 11)) * (1 + 0.005 * ht(t))));

Deno.test("regression: flat fitness under hot summers — heat confound removed, reads HOLDING", () => {
  const t = routeTrend(hist(flatHR, SEASON_TEMP))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "holding");
  assert(t.heatCoefPctPerF! < 0, "learned heat coefficient must be negative (heat lowers raw efficiency)");
  assert(t.ci != null, "regression must report a CI");
});
Deno.test("regression: genuine improvement is detected, CI clears zero", () => {
  const t = routeTrend(hist(improvingHR, SEASON_TEMP))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "improving");
  assert(t.ci != null && t.ci[0] > 0, `CI should be entirely positive, got ${JSON.stringify(t.ci)}`);
});
Deno.test("regression: one sick-day outlier does NOT flip the verdict (Huber robustness)", () => {
  const withOutlier = hist(improvingHR, SEASON_TEMP);
  withOutlier[6] = { ...withOutlier[6], hr: improvingHR[6] + 45 };
  assertEquals(routeTrend(withOutlier)!.direction, "improving");
});
Deno.test("regression_time_only: all-cool history (no heat confound) trends on time directly", () => {
  const coolTemp = [50, 52, 54, 56, 58, 59, 57, 55, 53, 51, 49, 48]; // all ≤ ref → heatTerm all 0
  const baseImproving = MONTHS.map((_, i) => Math.round(158 - i * (12 / 11)));
  const t = routeTrend(hist(baseImproving, coolTemp))!;
  assertEquals(t.method, "regression_time_only");
  assertEquals(t.direction, "improving");
  assertEquals(t.heatCoefPctPerF, null);
});
Deno.test("fallback: weather-uniform route (heat present but under-identified) → linear_k", () => {
  const narrowTemp = [62, 64, 66, 63, 65, 62, 64, 66, 63, 65]; // heatTerm 2–6, SD < 4
  const t = routeTrend(hist(new Array(10).fill(150), narrowTemp, 10))!;
  assertEquals(t.method, "linear_k");
  assertEquals(t.ci, null);
});
Deno.test("fallback: thin route (< MIN_REGRESSION_N comparable) → linear_k half-vs-half", () => {
  const t = routeTrend(hist(new Array(5).fill(150), SEASON_TEMP.slice(0, 5), 5));
  assert(t != null && t.method === "linear_k", `expected linear_k, got ${t?.method}`);
  assertEquals(MIN_REGRESSION_N, 8);
});
Deno.test("honesty: noisy flat data with a wide CI reads 'still_learning', never a faked direction", () => {
  const noisyHR = SEASON_TEMP.map((t, i) => Math.round(150 * (1 + 0.005 * ht(t)) + (i % 2 ? 18 : -18)));
  const t = routeTrend(hist(noisyHR, SEASON_TEMP))!;
  assertEquals(t.method, "regression");
  assertEquals(t.direction, "still_learning");
});
