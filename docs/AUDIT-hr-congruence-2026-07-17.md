# AUDIT — Heart-Rate Congruence Across the App

**2026-07-17. Read-only trace (3 parallel code sweeps + the existing truth docs). Nothing changed.** The question: is heart rate one logged truth, congruent on every surface (Constitution Law 1)? Answer in one line: **the measured HR is congruent and never fabricated; the yardsticks that interpret it (LTHR, max HR, zone seams) are not yet unified — and there are two live divergences plus the four-way LTHR anchor.**

This supersedes the scattered picture. Pairs with `SPEC-lthr-one-anchor.md` (the fix for the biggest item).

---

## The verdict, at a glance

| Layer | State | Congruent? |
|---|---|---|
| **Raw measured HR** (the bpm your device logged) | one authority; read null-safely everywhere; never invented | ✅ **CLEAN** |
| **Run durability** (the "holding steady" read) | one authority (`state_trends_v1.run.decoupling`) | ✅ **CLEAN** |
| **LTHR anchor** (threshold HR that judges everything) | **4 different resolvers, 2 inverted**; single resolver never built | 🔴 **FRACTURED** |
| **Max HR** (for %HRmax fallbacks) | 4+ different estimates (`180`, `220−age`, Tanaka, `obsMax/0.95`) | 🟠 **SCATTERED** |
| **HR zone seams** (where a bpm becomes easy/threshold) | math unified (D-286) but 2 live copies re-seed the old bug + 1 dead copy | 🟠 **MOSTLY, 2 leaks** |
| **Bike efficiency** (HR-at-power vs HR-drift) | 2 visible engines, kept apart only by scope labels | 🟡 **CONTAINED** |

---

## Layer 1 — Raw measured HR: CLEAN (this is the part you asked about)

**One authority, one logged truth.** Raw HR lives in `workouts.avg_heart_rate` / `max_heart_rate` (+ the per-sample series in `workouts.computed.analysis.series.hr_bpm`, and `computed.overall.avg_hr`). It's written on ingest straight from device samples (`ingest-phone-workout:212`, `import-strava-history:597`, `save-imported-workout:150`, FIT import).

**Every surface reads that same source and shows "N/A / —" when it's missing — no site invents a bpm.** Verified across State, workout detail (`useWorkoutData:60`, `WorkoutMetrics:121`, `CompletedTab`, `EnduranceIntervalTable`), coach, load (`calculate-workload:126`), baselines, live execution (Bluetooth strap). The coach even has an explicit anti-fabrication guard (`coach:3423`): it refuses to state an HR norm it can't back and emits the raw bpm instead.

**So: heart rate IS what's in the DB, everywhere it's shown.** That half of your requirement holds today.

---

## Layer 2 — The anchors that INTERPRET HR: fractured

This is where "congruent across the app" breaks. The raw bpm is one number, but to call it easy/threshold or bin it into zones, the app compares it to **LTHR** and **max HR** — and those resolve differently depending on the surface.

### LTHR — four resolvers, two inverted

| # | Site | Source order it uses |
|---|---|---|
| A | `_shared/easy-hr.ts:112` — the **easy band** (feeds facts, snapshot, learner, analyzer Z3 floor) | **learned first** (with a `sample_count:0` reject gate) → manual → %max bootstrap |
| B | `compute-workout-analysis:1578` — the **zone bins** on Details | **configured/typed first** → device column → learned last (no gate) |
| C | `calculate-workload:241` — the **load/intensity** ladder | **device column first** → learned → manual |
| D | `coach:2101` — the **coach's HR bins** | **learned only** (ignores a typed LTHR entirely) |

**A and B are inverted.** The realized bug: **type an LTHR into Baselines and your zone bins use the typed number while your easy band uses the learned one — two LTHRs, one athlete, same week.** Plus: C trusts a per-workout device column that A never sees; D ignores your typed value outright; and only A rejects a zero-sample estimated LTHR, so an invented threshold can move zones/load/coach but not the easy band.

The fix already has a spec: one `resolveCurrentLthr()` (`SPEC-lthr-one-anchor.md`), the same move already done for bike FTP and run pace. **It was never built** — the file doesn't exist and none of the four sites route through it.

### Max HR — even more scattered (all fallbacks, but they disagree)

Used only when there's no LTHR, but they don't agree with each other:
- `compute-workout-analysis:1614` — a literal **`180`** bpm; `:1611` — `observedMax / 0.95` (inflates the peak ~5%).
- `compute-adaptation-metrics:191` — **`220 − age`** (defaults age to 35 when null).
- `hr-plausibility.ts:48` — **Tanaka `208 − 0.7×age`** (a corruption ceiling only).
- `TrainingBaselines:584` / `HRZoneChart:116` — client **`220 − age × 0.88`**, which *no server surface uses* — so a data-less athlete sees a Baselines LTHR/max nothing else agrees with.

---

## Layer 3 — HR zone seams: math unified, two live leaks + one dead copy

D-286 consolidated the Friel zone *math* into `src/lib/friel-zones.ts` (easy ceiling **0.89·LTHR**). Good. But:

- ✅ `compute-workout-analysis:1586` (the authoritative `time_in_zone` bins) imports the canonical model — congruent **when it computes from LTHR itself**.
- 🔴 **`save-imported-workout:173` writes a `0.90` Z2/Z3 seam** into `configured_hr_zones` — and that field is **Priority 1** for every downstream binner. So a FIT-import athlete gets the old D-286 bug re-seeded (seam at 136 not 134 at LTHR 151), overriding the canonical binner. **Live.**
- 🔴 **`analyze-running-workout:1030` + `:1934`** use a **non-Friel** fallback (0.75 / 0.85 / 0.92 / 0.98 and a 0.85 aerobic ceiling) when no configured zones exist — a *second* zone distribution that surfaces to you alongside the facts bins, so the same run can read one zone mix in the debrief and another in the facts. **Live.**
- ⚪ `_shared/endurance/hr-zones.ts:15` — a competing `0.90` copy, **dead** (no production importer). Safe to delete.
- %HRmax fallback tables (`compute-workout-analysis:1615`, `analyze-running .../zones.ts`, `analyze-cycling:426`, `HRZoneChart`) are mutually inconsistent but they're per-sport fallbacks/display and don't cross-contaminate the LTHR path.

---

## Per-surface map (what each surface uses)

| Surface | Raw HR source | LTHR anchor | Note |
|---|---|---|---|
| **State — run durability** | `heart_rate_summary.decoupling_pct` (spine) | n/a (decoupling is HR-vs-pace, no LTHR) | ✅ clean, one authority |
| **Workout detail — zone bins** | `computed` series | **configured/typed first** (B) | 🔴 diverges from easy band |
| **Workout detail — analyzer debrief** | `computed` series | non-Friel fallback (#5) when no configured zones | 🔴 second distribution |
| **Baselines** | learned/typed max HR | display: manual→learned→**220−age** | 🟠 age fallback nothing else shares |
| **Load / workload** | `avg_heart_rate` | **device column first** (C) | 🟠 third order |
| **Coach** | drift/creep from `heart_rate_analysis` | **learned only** (D) | 🟠 ignores typed LTHR |
| **Easy-pace learner + easy band** | `avg_heart_rate` | **learned first, gated** (A) | the strictest, and the odd one out |

---

## Ranked fracture list (what to fix, biggest leverage first)

1. **Build `resolveCurrentLthr()` and route the four sites (A–D).** The root. Collapses the typed-vs-learned inversion, the device-column divergence, the coach's blindness to a typed value, and the sample-count gate — all at once. Spec exists (`SPEC-lthr-one-anchor.md`); this is the same pattern as `resolveCurrentFtp`.
2. **Fix `save-imported-workout:173` (0.90 → canonical 0.89).** Small, high-value — it re-seeds the exact bug D-286 fixed, on the FIT-import path D-286 didn't touch, into the field that overrides everything.
3. **Route `analyze-running-workout:1030/:1944` through `friel-zones.ts`** instead of its 0.75/0.85/0.92/0.98 hardcodes — kills the second zone distribution.
4. **Delete the dead `_shared/endurance/hr-zones.ts`** (0.90 copy, no importers).
5. **One max-HR resolver** — unify the `180` / `220−age` / Tanaka / `obsMax/0.95` estimates behind a single fallback (folds naturally into #1).
6. **Bike efficiency double** (spine 56-day HR-at-power vs coach 7-day HR-drift) — contained by scope labels today; lowest priority.

---

## What is NOT broken (don't re-alarm)

- Raw measured HR — one authority, never fabricated.
- Run durability / decoupling — one rendered authority; TRUTH-MAP calls it the model the others should copy.
- The Friel zone *math* — one canonical model since D-286; the leaks are the *anchor* feeding it and two un-migrated copies, not the formula.

**Net:** your heart rate is logged truth everywhere it's shown. The congruence gap is entirely in the interpretation layer — and it's four fixes, one of them (the LTHR resolver) already spec'd and worth more than the other three combined.
