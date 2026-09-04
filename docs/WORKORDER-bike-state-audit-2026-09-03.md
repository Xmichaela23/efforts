# WORKORDER — the bike section of the State screen (2026-09-03)

**Written by the chat session, for a terminal session. Every claim below is traced to a line and was
read this session — nothing here is inherited from a doc.** Where a value came from Michael's own rows
it is quoted with the query that produced it. Verify anything that is load-bearing before you build on
it; three of my claims tonight were wrong before I traced them, and they are listed in §6 so you know
which kind of statement to distrust.

**Trigger:** Michael's Sep 3 ride (workout `b33cd7b4-5953-44f7-955d-288b8c542248`, 15.6 mi, 1:08:34,
+958/−756 ft, out-and-back). The State bike card and the ride's own Performance screen disagreed about
the same ride, and the card printed a climb figure belonging to that day's run.

---

## §1. THE FACT LOOKUP IS KEYED BY DATE, NOT BY SPORT — the bike card can print the run's numbers

**This is the one to fix first. Everything else on the card reads these points.**

`supabase/functions/compute-snapshot/index.ts:1345` builds `endFactByDate`, a
`Map<date, { efficiency, drift, hr, elevM }>`, by iterating `workout_facts` rows and calling
`endFactByDate.set(String(f.date).slice(0,10), …)`. **One entry per DATE. Last row written wins.**

Each field inside it already falls back across sports:

```ts
const eff  = Number(rf?.efficiency_index ?? bf?.efficiency_factor);   // :1342
const hr   = Number(rf?.hr_avg ?? bf?.avg_hr);                        // :1344
elevM: Number(rf?.elevation_gain_m ?? bf?.elevation_gain_m)           // :1352
```

The spine point then reads that map with **no sport in the key**
(`compute-snapshot/index.ts:1433`):

```ts
const sport = t.includes("run") ? "run" : "ride";
const f = endFactByDate.get(date);            // ← date only
…
efficiency: f.efficiency,                     // :1437
hrAvg:      f.hr,                             // :1436
elevationGainM: f.elevM ?? null,              // :1488
```

**Consequence.** On any day with both a run and a ride, the ride's spine point can carry the run's
efficiency index (metres per second per beat, ~1.4), the run's average heart rate and the run's climb —
and the run's point can carry the ride's. Sep 3 is exactly that day: run 62 ft, ride 958 ft, and the
State bike card printed **62 ft of climb** on the drift line under a 958 ft ride.

⚠️ Note the units hazard this creates on top of the mix-up: `run_facts.efficiency_index` and
`ride_facts.efficiency_factor` are **different quantities** (m/s per beat vs watts per beat). A run
value landing in a bike series is not merely the wrong session, it is the wrong scale, and it is
plotted on a chart whose axis is watts per heartbeat.

**Fix:** key the map by `date + sport`, or resolve the facts per workout row rather than per date.
`drift` is already correct on the point (`driftReadForPoint` takes the row's own `workout_analysis`);
only the four date-keyed fields are affected. Also decide what `elevM`'s cross-sport `??` fallback is
for once the key is right — it may simply be dead.

**Verification that costs nothing:** compose the spine for an athlete with a run AND a ride on one
date and assert the bike point's `elevationGainM` equals the ride's, not the run's. There is no such
fixture today.

---

## §2. TWO DRIFT NUMBERS, ONE WORD, OPPOSITE SIGNS

For the Sep 3 ride, read from his rows this session:

```
hr_drift_v1 = { pct: -7.2, basis: "hr", method: "halves_by_time",
                seconds: 3934, first_avg_hr: 139, second_avg_hr: 129 }
heart_rate_analysis = null
```

- **State's bike card shows −7.2%.** `driftReadForPoint` (`compute-snapshot/index.ts:98`) prefers
  `hrs?.decouplingPct` (from `workout_analysis.heart_rate_summary`) and falls back to
  `workout_analysis.hr_drift_v1.pct`. The cycling analyser does not write `heart_rate_summary
  .decouplingPct`, so a ride always lands on the `hr_drift_v1` branch — heart rate alone, halves by
  time.
- **The ride's Performance screen shows 7.4%.** `_shared/session-detail/build.ts:1765` reads
  `comp?.analysis?.efficiency.aerobic_decoupling_pct` — power against heart rate — and labels it
  `'Moderate drift over the ride (drift 7.4%)'` (`:1769`).

Both are real, both are correctly computed, and they measure different things. The ride is the case
that makes them disagree in SIGN: power fell 155 → 136 W (−12%) while heart rate fell 139 → 129 (−7%),
so heart-rate-alone is negative and power-against-heart-rate is positive.

**The label is the defect, not the arithmetic.** "Moderate drift over the ride" reads as heart rate
climbing. His heart rate fell. Name each for what it measures, and let one surface own each.

⚠️ **`heart_rate_analysis` is NULL on this ride**, so the older `hr_drift_bpm ÷ early_avg_hr` figure did
not exist for it at all. A commit earlier tonight (`analyze-cycling-workout`) made that path read
`hr-drift-halves` and fall back to the bpm figure only when samples are unreadable — that change is
correct and deployed, but it is NOT what produced 7.4, so do not treat it as the fix for this item.

---

## §3. THE 5% LINE IS PRINTED AGAINST THE WRONG NUMBER

The card's drift line renders `line {DRIFT_LIMITS.hybridPct}%` beside the heart-rate-only figure
(`src/components/context/StrengthReadCards.tsx`, SpineCard drift line).

p107 (`docs/SOURCE-viada-hybrid-athlete.md:293`) reads, verbatim:

> "a session is terminated when cardiac drift reaches 10 percent (either a given pace/output at a
> given heart rate is 10 percent slower, or the heart rate goes up by 10 percent at a given
> pace/output). For hybrid athletes engaged in numerous weekly sessions, OR if a session will be
> followed by a 'key' session … within 24 hours, the number is 5 percent."

Both arms are ratios of output to heart rate. The heart-rate-only number is neither arm — it is one
side of the ratio. On the Sep 3 ride the rule fired on the FIRST arm (power fell relative to heart
rate), and the number the card put the 5% line next to was the one the rule does not govern.

⛔ **The book contains no terrain, grade or coasting exception.** The corpus records this explicitly at
`SOURCE-viada-hybrid-athlete.md:2280` — *"Nothing about sun exposure or grade."* p107 is the only place
cardiac drift appears anywhere in the source. Do not invent one.

---

## §4. THE RIDE EFFICIENCY TREND TAKES EVERY RIDE — AND THE GATE FOR IT IS ALREADY BUILT

The endurance spine puts every ride in one group (`compute-snapshot/index.ts:1443`):

```ts
const group = sport === "run" ? "aerobic" : "all";
```

`_shared/state-trend/assemble.ts:1896` explains why: *"Rides carry the single group `all`: the bike has
no equivalent session-type classifier and inventing one here would grow a second vocabulary beside the
first."* **That was true when it was written and is not true now.**

⛔ **`bikeEfficiencyRideEligible` exists** — `_shared/state-trend/bike-fitness.ts:70`. Three conditions:
the ride's `classified_type` is in `BIKE_EFFICIENCY_AEROBIC_TYPES`; time in the easy band clears
`MIN_EFFICIENCY_IN_BAND_S`; and `bikeRideIntensityAerobic(w20, bandHi)` (`:65`) — best-20 under
`THRESHOLD_FTP_FRACTION` of FTP. It already gates the HR-at-power efficiency read and the coach's 7d
bike drift row (`coach/index.ts:1742`), and `coach` payload note 79 records that both bike engines were
deliberately made to agree on "too hard to count as aerobic".

**The rides card is the only bike surface that does not call it.** Point the ride efficiency series at
it. Do not write a second predicate.

**Field practice, sourced this session, on the split this creates:**
- The PER-SESSION number prints always. TrainingPeaks shows Pw:Hr in the workout summary whenever
  power and heart rate exist, whatever the ride was, and explains the caveat rather than hiding the
  number: *"TrainingPeaks is not pulling just your aerobic zone, which is why those numbers are not
  accurate during interval rides, group rides, etc."*
- The TREND is built from steady sessions only. TrainingPeaks' own instruction is to *"schedule a
  steadily paced aerobic benchmark run or ride every one to two weeks and track your Efficiency Factor
  over time"* and to read *"steadily paced, low VI, aerobic long runs or rides."*
- ⛔ **No withholding, no blank space.** An earlier proposal in this chat to hide the number on a
  non-steady ride was my inference, not the field's behaviour, and Michael ruled it out once sourced.
  Sources: TrainingPeaks help centre "Aerobic Decoupling (Pw:Hr and Pa:HR) and Efficiency Factor",
  TrainingPeaks blog "Efficiency Factor and Decoupling".
- ⚠️ Garmin's behaviour is UNCONFIRMED. Secondary sources say it exposes Pa:Hr / Pw:Hr; the existence
  of Connect IQ apps built to compute drift argues the other way. Do not cite Garmin either way
  without a primary source.

---

## §4b. WITHDRAWN — the trigger ride's power recording was partial

⛔ **A section proposing an app-wide recording-completeness detector stood here and is withdrawn
(Michael: *"what could you possibly have added? tuning this entire app to a malfunction?"*). He is
right.** One power meter cut out on one ride and I wrote a check that would run on every ride for
every athlete. No reference app does this; TrainingPeaks and Garmin both compute their power numbers
from whatever was recorded and say nothing.

**What is still worth knowing, and it is a fact about the trigger ride only, not a build item:**
Michael's power meter stopped during the Sep 3 ride and he finished about 200 ft above home
(consistent with +958 / −756). So that ride's `avg_power_w` (146), `normalized_power_w` (164),
`intensity_factor` (0.98), TSS (109), execution score and `aerobic_decoupling_pct` (7.4) are computed
from an incomplete power record.

⚠️ **THE CONSEQUENCE FOR THIS DOCUMENT: do not use the Sep 3 ride's power-derived numbers as the
expected output of any fix.** §2's arithmetic (155 → 136 W across the halves) is real as stored and
still demonstrates the two-numbers-one-word defect, which is a LABELLING defect and holds whatever the
watts were. But "he went past the book's 5% line" does not follow from a partial recording, and the
ride is not a good fixture for anything power-based.

---

## §5. SMALLER, ORDERED AFTER THE ABOVE

1. **FTP prints twice.** The collapsed bike row gained an `FTP 168 W · estimated` line today
   (`StatePerformanceSection.tsx`, the bike branch of `summaryRows`) and the open card already had one
   (`:446`). Same fact, two lines apart. Mine, from this session — pick one.
2. **`tap to expand` on the chart** (`TrendSparkline.tsx:88`) is a second-level tap on a screen where
   Michael ruled second-level taps out on 2026-09-03. It survived because the ruling was applied to the
   sport ROWS, not to the charts inside them.
3. **`last 13 weeks` vs a 12-week model.** `TrendSparkline` prints `spanWeeksRaw` (uncapped span of the
   data, 13) while its own "still building" test uses `spanWeeks`, capped at 12 (`:60-62`), and the
   spine's fetch window is `STATE_TREND_WINDOWS.cadenceDays = 90` (`assemble.ts:146`) ≈ 12.8 weeks.
   Cosmetic; make the three agree.

---

## §6. WHAT I GOT WRONG TONIGHT — distrust statements of this shape

Recorded so the next session knows which of my claims were inference wearing the clothes of a finding.

1. **"Decoupling only reads on a steady effort — that's the standard."** Stated as though it were in
   the book. It is TrainingPeaks' guidance; the book has no such condition and no terrain exception.
   Corrected only after Michael pushed back and I read p107 and §2280 of the corpus.
2. **"The 7.4% looks wrong — your heart rate fell."** Wrong. 7.4 is power against heart rate and it is
   consistent with the trace: power fell faster than heart rate did. I asserted a defect from a
   screenshot before pulling the stored values.
3. **"Withhold the number on a non-steady ride."** Proposed twice as the field standard. It is not what
   TrainingPeaks does; it prints and explains.
4. **A units bug I shipped and fixed the same session:** `share-strength-to-strava` read
   `workouts.moving_time` / `elapsed_time` as seconds. **Every duration column on a workout row is
   MINUTES** — `ingest-activity` divides by 60 before writing all three (`:473`, `:474`, `:946`,
   `:964`); only the `metrics.*_seconds` fields are seconds. A 52-minute session would have posted to
   Strava as 52 seconds.

**The shape to distrust: a claim about what a source says, or about what a number means, made from a
screenshot rather than from the stored row or the page.**

---

## §7. STATE AT THE TIME OF WRITING

- **PUSHED and client-live:** the bike row leading with FTP then efficiency factor; the Garmin
  attribution as `Garmin [device model]`; the Attach button; the Garmin View link (`-detail` stripped,
  `/app/activity/`); the `unlinked` tag moved off the provider line.
- **DEPLOYED:** `ingest-activity` (the athlete's numbers are re-read after every completed workout on
  both providers, not on Garmin's old milestone/weekly throttle); `analyze-cycling-workout` (one drift
  definition inside that function, plus the two paragraph claims that outran their numbers);
  `share-strength-to-strava`.
- **NOT VERIFIED ON A DEVICE:** all of the above.
- **OWED, needs Michael:** `supabase db push` for
  `20260903200000_workouts_strava_shared_activity_id.sql` — the receipt column the automatic Strava
  share reads to avoid double-posting. Everything else works without it.
- **NOT BUILT:** every item in §1–§5 of this document.

---

## §8. BUILT — terminal session, 2026-09-03 (edited on disk, NOT committed, NOT pushed, NOT deployed)

Every §1–§5 item is built. Each claim below was traced this session, not inherited from §1–§7.

| item | what changed | where |
|---|---|---|
| §1 | facts index keyed by `workout_id` (the table's primary key), never by date; spine and overlay queries select `id` and look up by it; the cross-sport `??` fallbacks are gone (one facts object per row) | `compute-snapshot/endurance-facts.ts` (new, pure), `compute-snapshot/index.ts` |
| §1 fixture | a run and a ride on one date each read their own climb / efficiency / heart rate, in either row order — 5 tests, green | `compute-snapshot/endurance-facts.test.ts` |
| §2 | a ride's State point reads power-to-heart-rate decoupling FIRST (`computed.analysis.efficiency.aerobic_decoupling_pct`, the Performance screen's number), basis `'power'`; heart-rate-only `hr_drift_v1` is the fallback. The card names the basis in words: "power to heart rate" / "pace to heart rate" / "heart rate, second half vs first". Performance screen ride row now reads "Power to heart rate fell over the ride (7.4%)" instead of "Moderate drift over the ride" | `compute-snapshot/index.ts` `driftReadForPoint`, `state-trend/assemble.ts` type, `StrengthReadCards.tsx`, `session-detail/build.ts` |
| §3 | `line 5%` and "over the line" print ONLY beside a ratio basis (`gap` / `raw` / `power`); never beside heart-rate-only | `StrengthReadCards.tsx` SpineCard |
| §4 | every ride point carries `countsTowardTrend`: the analyser's `bike_fitness_v1.counts_toward_trend` stamp, else `bikeEfficiencyRideEligible` on the same four fields the trend substrate reads. No new predicate. The card keeps every ride (count, latest drift line) and builds the efficiency series, its headline and "based on the last N steady rides · K hard rides not in the trend" from the eligible ones. The collapsed row's efficiency-factor median applies the same filter, so plate and row stay one number | `compute-snapshot/index.ts`, `assemble.ts`, `StrengthReadCards.tsx`, `StatePerformanceSection.tsx` |
| §5.1 | the open bike card's `FTP 168 W · estimated` line is removed; the collapsed row's stays (it remains on screen when the card opens) | `StatePerformanceSection.tsx` |
| §5.2 | the chart's expand toggle is gone — static sparkline, no button, no "tap to expand" | `TrendSparkline.tsx` |
| §5.3 | the caption prints the capped span (`last 12 weeks`), the same number the "building" gate uses | `TrendSparkline.tsx` |

**Checks run:** `deno test` state-trend (296 pass), session-detail (118 pass), compute-snapshot (acwr / watermark / gate / endurance-facts pass; `index.test.ts` fails on `--allow-net` at module load — pre-existing, identical on a clean stash). `deno check compute-snapshot/index.ts`: the same 4 type errors before and after, none in touched code. `npm run build` green. `eslint` on the three touched client files: only pre-existing `no-explicit-any` lines. `tsc --noEmit`: nothing in touched files.

**To deploy (every function that bundles a touched `_shared` file):** `compute-snapshot`, `workout-detail`, `coach`, `analyze-cycling-workout`.

**Not verified on a device:** all of it. What to look for on the Sep 3 ride: the rides card drift line reads `drift +7.4% · power to heart rate · latest ride · line 5% · 2.4 over the line · … · 958 ft of climb`; the Performance screen heart-rate row reads `Power to heart rate fell over the ride (7.4%)`; one FTP line on the bike plate; no "tap to expand" under any chart.

**Side findings, not acted on:**
1. `session-detail/build.ts` still withholds the ride heart-rate row on a non-aerobic ride (`isAerobicRide` gate, 2026-08-02). §4's field rule says the per-session number prints always; that row is the Performance screen, not the State bike section, so it was left as ruled. Same shape as §4 — one decision should cover both.
2. The run row's `Moderate drift over the run` has the same ambiguity §2 fixed on the ride (pace-to-heart-rate ratio, "drift" reads as heart rate rising). Approved copy from 2026-08-02; untouched.
3. Old `state_trends` payloads in cache carry no `countsTowardTrend` and no `'power'` basis; they render exactly as before until recomputed (undefined = counts; basis falls to the heart-rate wording only when the server says `'hr'`).
