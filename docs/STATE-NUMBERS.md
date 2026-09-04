# STATE-NUMBERS — every number on the State screen, how it is calculated, and who else does it that way

Written 2026-09-04 for Michael. Plain English. One row per number, top of the screen to the bottom.
**Source** names the trusted app or author whose method this copies. **Ours** means no outside source —
the reason is stated, and it is Michael's to keep or remove. The code-level ledger is `STATE-SOURCES.md`.

---

## LOAD (top of the screen)

| What you see | How it's calculated | Source |
|---|---|---|
| **balanced** | Acute:chronic ratio in a band. ≤ 1.3 reads balanced; ≥ 1.2 the coach starts saying "elevated"; < 0.8 "light week". | Gabbett's ACWR bands (0.8–1.3 = the "sweet spot") |
| **ACWR 0.8** | Last 7 days of workload points ÷ average of the last 28 days, rounded to 2 decimals. | Gabbett, coupled ACWR (7-day acute over 28-day chronic) |
| **313 pts · rolling 7d** | Sum of every session's workload points in the last 7 days. | TrainingPeaks TSS is summed the same way |
| **Workload points per session** (ride) | Hours × IF² × 100, IF = normalized power ÷ FTP, raw. If you rated the ride, your rating is used instead (Strava's rule for perceived exertion). | TrainingPeaks TSS, exactly. **The rating-to-intensity map is ours** (Strava doesn't publish theirs). |
| **Workload points per session** (run / swim) | Hours × intensity² × 100; run intensity = heart rate ÷ threshold heart rate snapped to a step; swim from pace. If rated, the rating. | TrainingPeaks' shape. **The run steps and the rating map are ours.** |
| **Workload points per session** (strength) | (Total weight lifted ÷ 10,000) × intensity² × 100, intensity from reps-in-reserve or RPE. | Foster's session-RPE is the field method for strength load. **The ÷10,000 volume factor and the RIR-to-intensity map are ours.** |
| **strength 41% · run 30% · bike 29%** | Each sport's share of the 7-day points. | Arithmetic |

## BODY

| What you see | How it's calculated | Source |
|---|---|---|
| **effort 4.5 of 10 · usual 4.6** | Average of the RPE you gave your sessions in the last 7 days, against your average over the last 28 days. "About as hard as usual" when they're within noise. | Foster's session RPE (0–10). **The 7-day vs 28-day comparison is ours.** |
| **soreness 1.5 of 7 · normal for you** | Average of your soreness entries in the last 7 days, compared to your own earlier entries (the last week is left out of its own baseline). "Elevated" when it sits well above your own normal. | The 1–7 scale is Hooper's wellness index. **The "well above" test (a z-score against your own history) is ours.** |
| **logged 8 sessions · as of Sep 3** | How many sessions in the window carried an RPE or soreness entry; the date of the newest. | Count |

## THIS WEEK · SESSIONS PLANNED VS DONE

| What you see | How it's calculated | Source |
|---|---|---|
| **planned / so far bars** | Number of planned sessions this week per sport, and how many are done. | Count |

## TRENDS · LAST 12 WEEKS

The header says what every line below it covers: 12 weeks. TrainingPeaks' dashboard default is 90 days.

### STRENGTH

| What you see | How it's calculated | Source |
|---|---|---|
| **Bench Press 160 · e1RM** (and each lift) | Estimated one-rep max from your most recent logged set: weight × 36 ÷ (37 − reps). | Brzycki formula — the standard e1RM |
| **No arrow on lifts** | Deliberate. | Strong and Hevy show no direction on a lift |

### RUN

| What you see | How it's calculated | Source |
|---|---|---|
| **aerobic efficiency 1.567** | Efficiency factor = grade-adjusted pace ÷ average heart rate, per run. The number shown is the average of the last 28 days of steady runs (easy runs whole; hard runs contribute their warm-up). | TrainingPeaks EF on Normalized Graded Pace; the 28-day window is Garmin's |
| **↑ · +2%** | Average of the last 28 days against the average of the 28 days before. Higher ↑, lower ↓, same →. "Same" = identical to 3 decimals. Blank only when one of the two halves has no run. | Garmin's VO2 max / Training Status trend: recent 4 weeks against before, updated every activity |
| **easy 11:45/mi · 136 bpm · incl. warm-ups** | Average recorded pace and heart rate of your recent easy runs. When there are none in the block, the warm-ups of hard runs stand in. | Recorded values. **The warm-up stand-in is ours.** |
| **hard 11:13/mi · 144 bpm** | Average recorded pace and heart rate of your recent hard runs. | Recorded values |

### BIKE

| What you see | How it's calculated | Source |
|---|---|---|
| **FTP 167 W · estimated** | Best power at each duration from 2 to 20 minutes across the last 90 days of rides, fitted to the critical-power curve P = CP + W′/t; FTP = 0.97 × CP. Never above your best 20-minute power on file. Moves at most 5% per update. | TrainerRoad AI FTP Detection and intervals.icu eFTP (power only, from the curve); the curve model is Hill 1993 / Jones 2010 / Vanhatalo 2011. **The 5%-per-update cap is ours.** |
| **"estimated"** | Label: the number came from your rides, not a test. | — |
| **Accepting a new FTP** | A new estimate waits on Training Baselines (`167 · measured 171 · use it`) and the week-6 checkpoint; zones and plan targets don't move until you accept. | TrainerRoad |
| **efficiency factor 0.88** | Normalized power ÷ average heart rate, per ride. The number shown is the average of the last 28 days of rides that count. | TrainingPeaks EF; 28-day window is Garmin's |
| **↑ · 4 weeks · 8 rides** | Same 28-vs-28 rule as the run. | Garmin |
| **Which rides count** | Any ride with at least 10 minutes in your aerobic zone. No other test — not ride type, not how hard it was. | Garmin: the fitness estimate updates from any ride with ≥10 min at aerobic intensity |

### SWIM

| What you see | How it's calculated | Source |
|---|---|---|
| **swims 7 · last 8wk** | Count. | Count |

## The open cards (tap a row)

| What you see | How it's calculated | Source |
|---|---|---|
| **The efficiency line** | One dot per session over 12 weeks, one colour. | TrainingPeaks and intervals.icu plot every workout |
| **drift +6.2% · pace to heart rate · lower is better** | Per session: first half against second half, warm-up skipped, on grade-adjusted pace (run) or power (ride). The number shown is the average of the last 28 days. The 5% line is printed beside it and does nothing else. | Friel / TrainingPeaks Pa:Hr and Pw:Hr; 5% is Friel's line and Viada p107's session rule |
| **The drift line** | One dot per session, 12 weeks. | TrainingPeaks trends Pa:Hr on a dashboard |

---

## What is still ours, in one list

1. The run intensity steps and the rating-to-intensity map in the workload formula (the ride now uses TrainingPeaks' raw IF).
2. The strength volume factor (÷ 10,000) and the RIR-to-intensity map.
3. The 7-day vs 28-day comparison behind "usual" effort.
4. The z-score behind "normal for you" soreness.
5. The warm-up stand-in on the easy-run row.
6. The 5%-per-update cap on FTP.

Everything else on the screen is a copy of a named product's rule or a published formula.
