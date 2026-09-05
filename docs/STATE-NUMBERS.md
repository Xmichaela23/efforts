# STATE-NUMBERS — every number on the State screen, how it is calculated, and whose rule it is

Written 2026-09-04 for Michael; rewritten the same night under the ruling **one absolute reference per
metric**: each number copies ONE product's rule, whole — never "the formula is TrainingPeaks' and the
window is Garmin's". Plain English, one row per number, top of the screen to the bottom. **Source** names
the product whose method this copies. The code-level ledger is `STATE-SOURCES.md`.

---

## LOAD (top of the screen) — TrainingPeaks, whole

| What you see | How it's calculated | Source |
|---|---|---|
| **fitness 48** | The 42-day exponentially weighted average of your daily workload points (CTL). Each day: yesterday's fitness + (today's points − yesterday's fitness) ÷ 42. Starts at zero on your first logged session and runs over your whole history. | TrainingPeaks Performance Management Chart, "Fitness (CTL)" |
| **fatigue 61** | The same, with a 7-day constant (ATL). | TrainingPeaks, "Fatigue (ATL)" |
| **form −13 · optimal** | Yesterday's fitness minus yesterday's fatigue (TSB). The word beside it is TrainingPeaks' zone: above +25 transitional, +5 to +25 fresh, −10 to +5 grey zone, −30 to −10 optimal, below −30 high risk. A value exactly on a line takes the zone below it (the ranges are printed as "+5 to +25", the boundary itself is not assigned). | TrainingPeaks "Form (TSB)"; zones from Friel, "Managing Training Using TSB", as the PMC legend reproduces them |
| **313 pts · last 7 days** and **strength 41% · run 30% · bike 29%** | The last seven days' workload points summed, and each sport's share. | TrainingPeaks' "TSS by sport" dashboard split, over a date range |
| **Workload points per session** (ride) | TSS = hours × IF² × 100, IF = normalized power ÷ FTP. | TrainingPeaks TSS |
| **Workload points per session** (run) | rTSS = hours × IF² × 100, IF = threshold pace ÷ grade-adjusted pace. | TrainingPeaks rTSS |
| **Workload points per session** (swim) | sTSS = hours × IF³ × 100, IF = CSS ÷ pace per 100 m. | TrainingPeaks sTSS |
| **When a run or ride has no power / pace / threshold** | Heart rate against threshold heart rate → Friel's zone table of TSS per hour (Z1 10–30, Z2 40–50, Z3 60, Z4–5a 70, Z5b 80–90, Z5c 100); else your rating: TSS per hour = rating × 10; else 0. Measured beats self-reported. | Friel, "Estimating Training Stress Score", trainingpeaks.com (the table is RPE 1 → 10/hr … RPE 10 → 100/hr, with the heart-rate zones beside it). Where a zone spans two values (Z1, Z2, Z5b) the split inside the zone is at its midpoint — Friel prints the range, not the split |
| **Workload points per session** (strength) | Minutes ÷ 60 × rating × 10 — the same Friel estimate. Your session rating first; if you gave none, RPE = 10 − your average logged reps-in-reserve; nothing logged → 0 points. | Friel, as above (his own examples: 30 min at RPE 6 = 30; 90 min at RPE 4 = 60). RIR → RPE is Zourdos 2016 (RPE 8 = 2 RIR). **Replaces** (weight lifted ÷ 10,000) × intensity², which was ours |

Off the screen since 2026-09-04: **ACWR** and the **"balanced" word** (Gabbett's ratio and the app's own
reconciler — neither product's rule; both still feed the coach).

## BODY — removed 2026-09-04

Effort (Foster's session RPE under our 7-day-vs-28-day comparison) and soreness (Hooper's 1–7 scale
under our z-score) are off the screen. Neither Garmin nor TrainingPeaks prints either on a fitness
screen. The server still computes both for the coach.

## THIS WEEK · SESSIONS PLANNED VS DONE

| What you see | How it's calculated | Source |
|---|---|---|
| **planned / so far bars** | Number of planned sessions this week per sport, and how many are done. | Count |

## TRENDS · LAST 12 WEEKS — TrainingPeaks, whole

The chart under every endurance number is 90 days of sessions (12 weeks), one dot per session, one colour —
TrainingPeaks' dashboard default. There are **no arrows** on this screen: ↑ → ↓ were Garmin's three trend
states laid over TrainingPeaks' numbers, and Garmin has no efficiency factor to be the reference for.

### STRENGTH

| What you see | How it's calculated | Source |
|---|---|---|
| **Bench Press 160 · e1RM** (and each lift) | Estimated one-rep max from your most recent logged set, rounded to 5 lb: Epley and Brzycki run on the set's weight and reps and the two are averaged. | Viada, Module 3 / p215 — his own instruction: "use two or three [formulas]… to give you a range," averaged. |
| **No arrow on lifts** | Deliberate. | Strong and Hevy show no direction on a lift |

### RUN

| What you see | How it's calculated | Source |
|---|---|---|
| **aerobic efficiency 1.498 · 12-week trend · from 1.650** | The value where a straight line fitted through your easy-run efficiency factors sits TODAY, with where it sat 12 weeks ago. Efficiency factor per run = grade-adjusted pace ÷ average heart rate. Not any one run — the trend. | TrainingPeaks EF per workout; the fitted trendline is WKO5's chart trendline (least squares through the dots) |
| **easy 12:40/mi · 134 bpm** | Median of your last five easy runs' pace and heart rate — grade-adjusted pace when the run has elevation, raw recorded pace otherwise (flagged "flat pace, no elevation"). | Recorded values; raw-pace fallback is TrainingPeaks' own when NGP can't be computed |
| **hard 11:50/mi · 144 bpm** | The same for hard runs. Easy vs hard is the plan's tag on the run (stamped so it survives a plan rebuild), else the analyser's detected type, else heart rate at/above 90% of threshold = hard. | Recorded values; run type is the auto-detection Garmin/Strava/TrainingPeaks run |

### BIKE

| What you see | How it's calculated | Source |
|---|---|---|
| **FTP 167 W · estimated** | Best power at each duration from 2 to 20 minutes across the last 90 days of rides, fitted to the critical-power curve P = CP + W′/t; FTP = 0.97 × CP. The fit's own gates (≥ 3 durations, W′ 5–40 kJ, r² ≥ 0.9) are the only gates. | Hill 1993 / Jones 2010 / Vanhatalo 2011 for the curve; intervals.icu eFTP and TrainerRoad AI FTP Detection for "from power alone, from the curve". ⚠️ intervals.icu's exact model is not published on any page reachable from this session (see Q-298). **Removed 2026-09-04, both ours:** the 5%-per-update cap and the best-20-minute ceiling |
| **"estimated"** | Label: the number came from your rides, not a test. | — |
| **The FTP line** (open card) | One dot per FTP the app has held for you in the last 90 days (12 weeks), oldest to newest, with a dashed fitted trendline through them. Caption: "FTP over 6 weeks: 160 → 167" — the line's start and end, not any one reading. One reading → the number alone, no line. Replaced the "where this number sits in your 12-week range" dot 2026-09-04. | TrainingPeaks threshold history (previous thresholds plotted over time); WKO5 sFTP history chart; the fitted line is WKO5's chart trendline |
| **Accepting a new FTP** | A new estimate waits on Training Baselines and the week-6 checkpoint; zones and plan targets don't move until you accept. | TrainerRoad |
| **efficiency factor 0.89 · 12-week trend · from 0.83** | The fitted-trendline value today with its 12-week-ago start, over your steady rides. Per ride = normalized power ÷ average heart rate. | TrainingPeaks EF per workout; WKO5 fitted trendline |
| **Which rides count** | Any ride with at least 10 minutes in your aerobic zone. | Garmin's inclusion rule for its fitness estimate (the one Garmin rule left on the screen; it decides which rides are steady, not what the number is) |

### SWIM

| What you see | How it's calculated | Source |
|---|---|---|
| **swims 7 · last 8wk** | Count. | Count |

## The open cards (tap a row)

| What you see | How it's calculated | Source |
|---|---|---|
| **The efficiency line** | One dot per session over 90 days, one colour, with a dashed fitted trendline through it. Caption: "efficiency over 12 weeks: 1.650 → 1.498" — the line's start and end. | TrainingPeaks dashboard chart; WKO5 trendline |
| **drift · pace to heart rate · 5% line for multisport · each dot one run** | The drift chart's caption. Drift per session = first half against second half, warm-up skipped, grade-adjusted pace (run) or power (ride); STEADY sessions only (intervals excluded by the plan tag or the measured mixed-effort test). No single-session number on this screen — a run's own drift lives on that run. The 5% line is printed and does nothing else. | TrainingPeaks Pa:Hr / Pw:Hr per workout; 5% is TrainingPeaks' and Friel's line; steady-only is Friel's condition |
| **The drift line** | One dot per steady session, 90 days, dashed fitted trendline. Caption: "drift over 11 weeks: 8.1% → 5.2%". | TrainingPeaks trends Pa:Hr on a dashboard; WKO5 trendline |
| **Heat note** (shown when a session in the window was ≥ 72°F) | "Heat raises heart rate at the same pace, so efficiency reads lower and drift reads higher on hot days." Fixed text, not generated. | 72°F / 22°C is Garmin's heat-correction cut-off; TrainingPeaks applies none |

---

## What is still ours, in one list

1. Inside Friel's heart-rate table, where a two-value zone (Z1, Z2, Z5b) splits: at the zone midpoint. Friel prints the range, not the split.
2. Nothing else on the screen. The six of this morning's list are gone: strength volume factor and RIR map (now Friel's RPE estimate), the 7-vs-28 effort comparison and the soreness z-score (BODY removed), the warm-up stand-in (removed), the 5% FTP cap (removed).

---

**Deployed:** everything in this file is live on `main` (13f8c53d) and on the server as of 2026-09-04. Stored strength points were re-priced to Friel's scale by `backfill-strength-load` (117 sessions).
