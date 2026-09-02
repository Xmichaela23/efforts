# STATE SCREEN — STRING INVENTORY (2026-09-01, before the copy pass)

⛔ **INVENTORY ONLY. NOTHING REWRITTEN.** Every athlete-facing string on the State screen, by block:
current text, where it comes from, and whether it survives the confidence rule (say only what the
sample supports; no interpretation we can't defend; no coaching voice). Flags: **(a)** interpretive
without a defensible basis · **(b)** hedge/filler · **(c)** invented term · **(d)** already known-bad.

⚠️ Many strings are SERVER-MINTED (`compute-snapshot` → the display contract). Those need a server
change to reword; client-only rewording is not available for them. Marked **[server]** vs **[client]**.

---

## 1. LOAD PLATE — `LoadBar.tsx`, `src/lib/load-headline.ts` [client wording; inputs server]

| string | source | flag / note |
|---|---|---|
| "Balanced load" / "Room to build" / "Building on plan" / "Load a bit high" / "Load high" | `load-headline.ts` verdict map | survives — states the load state; plain. |
| "legs loaded" / "legs sore" / "effort up" / "fatigued" | `load-headline.ts` (strength/soreness tags) | **(a)** "fatigued" is an inference; overlaps the readiness/ACWR read. Review against the confidence rule. |
| "open for more" / "you have headroom" / "add a session" | `load-headline.ts` (under-target) | **(b)+coaching** — "add a session" is an imperative. Voice: quant, not coach. |
| "a bit high" / "back off" / "build more" / "pull back" | `load-headline.ts` | **coaching imperative** ("back off", "pull back", "build more"). |
| "Points" | `LoadBar.tsx` label | **(c)** — "Points" is our unit for load; opaque to a run+ride athlete. |
| "The word" | `LoadBar.tsx` | **(c)** — internal-sounding label. |
| "Where your load is going" | `LoadBar.tsx` (split legend heading) | survives — plain. |
| "{sport} {pct}%" legend | `LoadBar.tsx` | survives — fact. |

---

## 2. BODY — `StateBodyBlock.tsx` [server text, client labels]

| string | source | flag / note |
|---|---|---|
| "BODY" | client label | survives. |
| "not enough data" | client fallback chip | survives (states the absence). |
| per-signal `s.label` (e.g. "How hard it feels") + `s.detail` | **[server]** visibleSignals | **(d)** the run-on body paragraph lives in `s.detail` — server-minted; the known-bad run-on. Rewording needs server. |
| `readinessRpeDriver` sentence | **[server]** | **(a)** interpretive; check basis. |
| "Soreness above this athlete's OWN normal for 4 of the last 6 sessions…" | client provenance tap | survives — states the rule + count. |
| "Adjust ›" | client action | survives. |
| `fmtBodyAsOf(as_of_date)` "as of …" | client fmt of server date | survives — receipt. |

---

## 3. PLANNED vs ACTUAL — `StateWeekExecution.tsx` [client]

| string | source | flag / note |
|---|---|---|
| "this week · planned vs actual" / "this week" | client heading | survives. ⚠️ (d)-adjacent: verify no trailing-full-stop / heading-punctuation inconsistency here vs other headings. |
| per-discipline planned/done counts | **[server]** counts | survives — facts. |
| the composed week accent (one line) | **[server]** | **(a)** if interpretive — read it against the rule. |

---

## 4. STRENGTH — `StatePerformanceSection` (StrengthFitnessRow) + `ViadaWeekCard` + `StrengthLoggedSets` [client wording; numbers server]

| string | source | flag / note |
|---|---|---|
| "STRENGTH" heading (icon) | `Row` | survives. |
| "estimated 1-rep max" | client label | survives. |
| per-lift tiles: "e1RM" · "best" · "N sessions" + "as of …" | client | survives — facts. |
| "all-out N lb × R" + "rep PR" + "too many reps to estimate a max from" | client, from `lastAllOut` | survives — facts. |
| block context line (week/phase) | **[server]** blockContextLine | check basis. |
| calibration `liftStatusLine` (training-max climbing/holding/reset) | `strength-calibration-copy.ts` | **(d)** contains "holding" — the word the spec is retiring; review. |
| "needs 2+ logged lifts to trend" | client empty-state | survives. |
| "pull-ups" section label | client | survives. |
| **ViadaWeekCard** "this week's lifting" | client | survives. |
| "how long each day takes to recover from, by its work sets — 6–8 is a day or two, 14 or more is up to three days" | client (recovery copy, shipped tonight) | survives — just rewritten to the confidence rule. |
| per-session "{label} — N work sets · a day or two / up to three days" | client + `SESSION_VERDICT_WORD` | survives — the 9–13 gap correctly says nothing. |
| "nothing this week for {muscles}" | client, `belowFloor` | survives — states the gap. |
| "outside the plan this week" + "anything you add outside the plan is the volume the programme has not already counted" | client `offPlan` | survives. |
| "against the seven days before that: {bucket ±%}" | client `weekChange` | ⚠️ becomes the change-line work; wording will move to "since {month}" per the new build. |

---

## 5. RUN & BIKE — endurance cards (`StrengthReadCards.tsx`) + `BikeFitnessRow`/`FitnessDotBlock` [client wording; verdicts server]

| string | source | flag / note |
|---|---|---|
| "easy runs" / "long runs" / "quality runs" / "rides" | `GROUP_LABEL` | survives. |
| "N logged" | client count | survives. |
| "{value} efficiency factor" + "watts per heartbeat / pace per heartbeat · higher is better" | client | survives — names the field (TrainingPeaks' term), defines it. |
| "one session doesn't tell you much — a hot day or a hilly route moves this more than your fitness does. watch the line over a few weeks." | client (now once per sport) | **(d)** was the duplicated caution; consolidated tonight. Voice check: borderline coaching ("watch the line"). |
| "last one: N% harder in the second half · X% is the line[, and a hard day is inside 24 hours]" | client, `driftPct` | survives — fact + threshold. |
| "last one: no second-half number — its pace changed on purpose" | client, `fadeWithheld` | survives. |
| "N min long" / "same {dur} session" | client | survives. |
| chart caption "last N weeks · recent 6 weeks in color · tap to expand" / "each dot = one {noun} · recent 6 weeks in color" | `TrendSparkline` | survives — unified tonight. |
| **VERDICT words** — improving→"improving"↑ · holding→"holding"→ · sliding→"easing off"↓ · needs_data→"needs data" | `VERDICT` map | **(d)** "holding" is Q-289: printed for genuinely-flat AND too-noisy-to-call. The spec retires "holding". |
| **RUN_EFF words** — "Faster at the same effort" / "Holding steady" / "Slower at the same effort" | `RUN_EFF_WORDS` | **(d)** "Holding steady" = same Q-289 issue. |
| bike "fitness N · form −M · from every ride" + "more" | `BikeFitnessRow` (CTL/TSB) | **(a)+(c)** — "form −13" is Banister/Coggan TSB, coach-facing, duplicates the ACWR plate. Spec: GOES. |
| "Your heart rate at the same power, from N easy rides" | `AerobicSignal` | survives — fact. |
| "N W threshold" / "power" | `FitnessDotBlock` label | survives. |
| axis: "weaker" / "vs your 12-week range" / "stronger" | `FitnessDotBlock` | survives — but only on the first axis-consumer (Round 3). |
| "carrying fatigue" | readiness/fitness inference | **(a)+(d)** — Spec: GOES. Inference we can't state plainly; duplicates ACWR. |

---

## 6. SWIM — `SwimVolumeRow` + `StateSwimNudge` [client]

| string | source | flag / note |
|---|---|---|
| swim volume facts (counts/distance) | **[server]** swimVolume | survives — described, not graded (correct). |
| "Swim check-in" (nudge) | `StateSwimNudge` | survives — action, gated. |

---

## 7. NEXT — `StateNextBlock.tsx` [server sessions, client frame]

| string | source | flag / note |
|---|---|---|
| "NEXT" heading | client | survives. |
| upcoming session lines | **[server]** `nextSessions` | facts; verify no interpretive tail. |

---

## THE HEADLINE FINDINGS (what the confidence-rule pass removes or fixes)

1. **"holding" / "Holding steady"** (VERDICT + RUN_EFF, Q-289) — printed for a genuinely-flat metric
   AND one too noisy to call. **Retire the word**; when the verdict can't call a direction, state the
   number + count and stop. [client maps]
2. **"carrying fatigue" + "fitness N · form −M"** (bike TSB) — coach-facing inference, duplicates the
   ACWR plate. **Remove from render** (model stays server-side). [client]
3. **The run-on BODY paragraph** (`s.detail`) — **[server]**, so reword needs a server change; flag,
   don't client-patch.
4. **Load imperatives** — "back off" / "pull back" / "build more" / "add a session" — coaching voice;
   restate as the conditional fact or drop. [client wording, server verdict key]
5. **Invented labels** — "Points", "The word" — opaque units; rename or drop. [client]
6. **Heading punctuation** — verify the "this week ·…" / week headings for the trailing-full-stop
   inconsistency the spec flagged. [client]
7. **"watch the line over a few weeks"** — borderline coaching; consider the flatter statement.

⛔ **Server-minted strings that need a server change to reword:** the BODY `s.detail` run-on, the
week accent, `readinessRpeDriver`, and any interpretive tail on NEXT/planned-vs-actual. Everything
else in this inventory is client wording.
