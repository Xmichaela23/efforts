# Efforts — the work queue

**Rebuilt 2026-07-13.** Every one of the 92 open items on the old list was **verified against code** (3 parallel readers). ~10 were already done, 4 were moot, 11 were "verify X" questions that now have answers, and 9 need Michael. The rest are real, and they are ordered below by leverage — not by the order they were filed.

**The full 133KB history (202 completed items + the originals) is in [`archive/POLISH-PUNCH-LIST-archive-2026-07-13.md`](archive/POLISH-PUNCH-LIST-archive-2026-07-13.md).**

Read `START-HERE.md` and `LIFECYCLE.md` first. **`CAPABILITY-MAP.md` is the anti-rebuild index — check it before building anything on this list.**

---

## ▶ NEXT UP — THREE PROTOCOL-BLIND READS ON STATE (2026-08-01)
**All three found by Michael reading his own screen at the end of 2026-07-30. Same family as everything
that shipped that day: the reader does not know what the session was for.**
- [x] ⛔ ~~**The per-lift row calls a prescribed dip a decline.**~~ ✅ **PUSHED + DEPLOYED 2026-08-01
      (D-347).** The chip is DELETED, not made protocol-aware — one measurement per cycle is too sparse
      to carry a direction. The row now states the block instead ("week 1 of 12 · build"), read from
      `block-identity`. ⚠️ Not device-verified.
- [ ] **Cross-training compares a PARTIAL week to a whole-week target** — "9 of your 18-mile target",
      read on a Thursday. `_shared/insights/cross-training-read.ts`, the `floorBreach` clause.
- [ ] **The run narrative guessed the wrong session** — "Monday's lower-body session"; Monday was Bench.

## ▶ ALSO NEXT — THE HEART-RATE STAMP (2026-08-01)
- [ ] **"as of Jul 14" is the OLDEST contributor, by design.** The row rolls up run + bike and stamps
      `Math.max(...ages)` so it cannot overstate freshness. His run is 3d old, his bike 16d.
      ⚠️ It reads as "this whole reading is stale". **Fix the STAMP** — show the newest and let the
      detail line name the stale contributor, which it already does. Do NOT "fix" the data path again.

## ⛔ AWAITING MICHAEL — 2026-08-01 (Stage 1 + Stage 3 of the State audit: PUSHED + DEPLOYED, **none of it seen on a device**)
- [ ] **Open State and look at the strength row.** Expect "week N of M · build" above the lifts, each
      lift showing name + number + any PR, and **no ↑/↓ chip per lift**. Chart footer should read
      "N weeks of readings", not "building · N of 12 weeks".
- [ ] **Open a strength session in Performance.** Expect one grey line at the top naming the plan and
      the week ("Strength Focus · week 1 of 12 · build").
- [ ] **Check the load mix.** Strength should now be a real share of the week (measured: 8% → 38% over
      28 days). ⚠️ **The coach payload caches 24h** — if it still reads ~8%, pull to refresh; that is
      the cache, not the fix.
- [ ] **Run Xcode.** `npm run ios` synced Stage 1 but was NOT re-run after Stage 3 — nothing from the
      load work is on the phone.
- [ ] **`docs/AUDIT-state-screen-2026-08-01.md` is now committed** (it governed this stream untracked
      for two sessions).

## ⛔ AWAITING MICHAEL — 2026-07-31 (run row: DEPLOYED + seen on device by Michael during the session)
- [x] **The RUN row** — verdict, heat line, chart, pace line, labels. Michael reviewed it on screen four
      times during the build and each round found something; the last screenshot was clean.
- [ ] **Install the latest iOS build.** `npm run ios` ran at the close; the last three client commits
      (the ⓘ rewrite, the dead GAP toggle removal, the hidden race projections) are synced but **not
      installed**. The web build is live via Netlify.
- [ ] **Look at the BODY section once more.** The heart-rate row now says "Running easing off (today) ·
      bike holding (16d ago)" in amber, not "drifting up" in red. Confirm the two rows read as one voice.

## ⛔ AWAITING MICHAEL — 2026-07-30 (a very long day; most of it deployed, the client not re-run)
- [ ] **Run Xcode.** The last client commits — the weight-change sheet, the swap fixes, the removed
      difficulty tap, Recompute moved to the top — were pushed and synced but not installed.
- [ ] **The weight sheet will not fire until a week-3 session.** That is the 95% set that decides.
- [x] ~~The all-out panel~~ — ✅ **SEEN 2026-07-30**: "Back Squat 75 lb × 15 · First time at this weight ·
      Estimated max 110 lb · rough — over 8 reps no formula holds up."
- [x] ~~Assistance swaps~~ — ✅ **SEEN**: Single Leg Hip Thrust → Reverse Lunge / Bulgarian Split Squat /
      Hanging Leg Raise. Inverted Row → Dumbbell Row / Pull Up / Chin Up.
- [ ] **Recompute your remaining sessions** so they carry Wendler's formula (per-session button).
      Nothing is backfilled automatically — his call.
- [ ] **`Single Leg Rdl` / `Single Leg Romanian Deadlift`** are the same movement listed twice in the
      library swap list.
- [ ] **Two stale failures in `src/lib/non-race-goal-seeds.test.ts`**, third session carrying it.
- [ ] **`ios/debug.xcconfig` uncommitted**, five sessions running.

## ▶ NEXT UP — MAKE THE ALL-OUT REPS MOVE THE WEIGHT (2026-07-31)

**The rematerializer (Q-226), now unblocked.** It was parked because its input did not exist; D-338 made the all-out rep count a saved fact. Read the ENGINE-STATE banner first — it names the seam.

- [ ] ⛔ **`verdictFrom95Set` is written, correct, and called by NOTHING.** Wire it.
- [ ] **`workingNumberForCycles` ALREADY TAKES the verdicts.** The seam is the parameter and it is already there. No verdicts → `advance` → today's behaviour, so this ships behind a behaviour-unchanged proof.
- [ ] ⛔ **The reader cannot live in the composer** — it authors twelve weeks up front. Something must go back and rewrite the remaining weeks.
- [ ] **ONE verdict, THREE customers** (Michael: *"it should be able to handle state as a cumstomer as well"*) — the plan rewrite, State, and the session that earned it. ⚠️ State's per-lift verdict currently keys off a DEAD RIR branch: it reads nothing while looking like it works.
- [ ] **This closes Q-223** (a first block's numbers advancing on the calendar).

---

## ⛔ AWAITING MICHAEL — DEPLOYED 2026-07-30, mostly seen (2026-07-31)

**Eight functions deployed, every version verified before and after:** `auto-attach-planned` v55, `activate-plan` v68, `analyze-strength-workout` v141, `detach-planned` v19, `compute-facts` v90, `compute-snapshot` v101, `coach` v404, `workout-detail` v287, `get-week` v189. Client pushed (Netlify) and synced to Xcode.

- [x] ~~The strength Performance screen~~ — ✅ **SEEN ON SCREEN 2026-07-30.** No 117%; "Completed 3 of 4"; the ramp reads 80/90/105 against 80/90/105 at **+0 lb**; "not logged" on a skipped lift; no plan narrative on an unattached session.
- [x] ~~The owed squat shows on the calendar~~ — ✅ **SEEN.** Michael: *"great its there"*.
- [ ] **Log a session and check the all-out set.** Set 3 should read "all out" greyed in the reps box, "all-out · 5 minimum" beneath, and the date should default to TODAY even when the session was planned for an earlier day. ⚠️ Michael did a session wrong because none of this was visible — this is the one that matters.
- [ ] **The three words and the AMRAP count only land on RECOMPUTED sessions.** Nothing is backfilled (his call). His next logged session picks them up.
- [ ] **The deload fix shows nothing until week 4** — he is in week 1. Not a failure; there is no deload to exclude yet.
- [ ] **Q-222 — the reset percentage is still your call.** Ours lands near 72% of 1RM, Wendler's near 90%. ⛔ It moves prescribed weight.
- [ ] **Q-224 — the deposit claim's run half still has no source.**
- [ ] **The AAA acceptance check** has never run on a device.
- [ ] **`ios/debug.xcconfig` uncommitted, four sessions running.**



### ⛔ CITATION CORRECTIONS — found by the 2026-07-26 evidence sweep. Comments and athlete-facing strings; the RULES do not change.
- [ ] **Petré 2021 is cited for a clearance rule it says nothing about.** It is a strength-development meta by training status. **Five sites:** `_shared/schedule-session-constraints.ts:28` (the single law), `_shared/week-optimizer.ts:484`, `:486` (⛔ cites it for *"the AMPK/mTOR interference"* — a claim **D-324 already STRUCK**), `:657` (⚠️ **athlete-facing narration**), `shared/strength-system/strength-primary-plan.ts:460` (⚠️ **athlete-facing**). Replace with Robineau 2016 + Schumann 2022 same-session. ⛔ **`week-optimizer.anchor-contract.test.ts:679` PINS these strings and will fail until updated — that is the guardrail working.** ⚠️ **Two sites are on the RACE path; this is not strength-only.**
- [ ] **`place-week.ts:64-82` says 6h and 24h "performed the same as each other."** True for the strength outcome, **false for the aerobic one** — Robineau's VO2peak was higher at 24h than at 0h *or* 6h. ⛔ **`MIN_STACK_GAP_H = 6` does NOT change**; the comment does. **24h is the target, 6h is the fallback.**
- [ ] **`strength-primary-plan.ts:460` tells the athlete back-to-back is fine on a lift + easy-run day** — that is Robineau's 0h arm, the worst one. Probably still right (an *easy* run is not a second hard session), but it is **no longer sourced.** Re-word or re-source.
- [ ] **Spiering is understated everywhere it appears as "4–8 weeks."** Actual: **15 weeks endurance on 2 sessions/wk, 32 weeks strength on 1 session of 1 set.** Corrected in the doctrine; check `SCIENCE-*` docs.

### ▶ NEXT UP — D-325 / D-326, spec'd 2026-07-25 late, NOT built
- [ ] **⛔ D-325 STEP 0, BLOCKING — reconcile the penalty table against the law.** Amended 2026-07-26: interference is **DIRECTIONAL**, penalties are **ordered pairs**, and `_shared/schedule-session-constraints.ts` **remains the single law** — the penalty table is a *rendering* of it into costs, never a second ranking. ⛔ **Do not start the scorer before this.** The old symmetric table priced the law's strictest clearance (bike quality 48h after heavy lower, `:374`) as its cheapest row. The law is also what the race optimizer reads — forking it re-ranks physiology on one side of the app only.
- [ ] **D-325 — Session Cost Ledger + Penalty Scheduler.** Full contract in DECISIONS-LOG (read the **AMENDED 2026-07-26** block first — eight changes). Build order: the ledger + scorer as a PURE module with tests first (cost table, ceilings, reconciler deltas, **directional** penalty scoring, **ranked** breach output) — nothing touches the composer until that is green. Then it takes over placement from the **hardcoded Mon/Tue/Thu/Fri grid**, which is the real outlier. ⚠️ Blocked-adjacent: **Q-205** (two of the three emphasis ceilings are unvalidated). ⛔ **Keep `place-week.ts`'s `compromises[]` contract** — the original rationale for retiring it was retracted; it never had walls.
- [ ] **The hard-day trade is UNSPOKEN and the state is already reachable.** An athlete declines the hard day today simply by not picking one, and the app says nothing about what that costs. ⛔ **Copy is written and approved — `DOCTRINE-aerobic-maintenance.md` §5.0.3.** Two options at the hard-day pick, plus *"This block builds strength, not explosive speed"* near the goal card (the one promise Schumann's −0.28 explosive-strength effect forbids). ⚠️ *"Want full bro? Skip the hard sessions."* is a **deliberate COPY-VOICE rule 10 bend, Michael's call** — second line under "No hard day", **never its own moment**; do not clean it into house voice. ⚠️ *"comes back when the running does"* is reused verbatim from the volume screen — reword in both places or neither.
- [ ] **THE DOWNSTREAM BAR — the athlete-facing half, and none of it exists.** Michael: *"build the downstream bar — react to the user — gate the ability to build a crazy weekly schedule."* Intake reacts as quality options are taken; the axis arithmetic shows **before** acceptance, not after; a week the app won't defend needs an explicit confirm. Today the intake collects a hard day per discipline and says nothing back about what they cost together. ⚠️ **Bike VO2 alone is LEGAL (12/7/9) — the bar must not refuse a feature that already shipped into intake.**
- [ ] **D-326 — per-set difficulty replaces the RIR prompt** (top set only, three words on the complete tap, "Select difficulty to mark done"). Three files: `StrengthLogger.tsx` (the control + set field), `compute-facts` (aggregate into `strength_facts`), and the reconciler's `BodyTrends.strength` input. **No DB migration** — sets already persist as JSON. ⛔ It must never reach `brzycki1RM`, never auto-fill, and blank stays legal.
- [~] **D-326 layer 1 — the difficulty tap: CLIENT DONE, server half NOT started.** Top set only, three words on the complete tap, `topSetIndex` extracted + 11 tests, value persists in `strength_exercises` (no migration). ⛔ **Nothing reads it yet.** The server half is NOT a port — see D-326's "the server half is not a port": the existing signal is actual-vs-prescribed and difficulty has no prescription; a raw slope flags everyone every cycle (compare like-for-like, week-3-vs-week-3); and re-including `BodyTrends.strength` before those two are solved reinstates the D-318 false-strain bug on a new input.
- [ ] **Wire `verdictFrom95Set` into the advance path** (D-326 layer 2). `wendler-531.ts:160-200` is written, correct and **called by nothing**; `workingNumberForCycle:112` advances by calendar. This is what stops the gauge grading its own homework.
- [ ] **Render e1RM provenance** (D-326 layer 3) — *earned at week 3, unmeasured since*, never a bare number. Reuse the run-side learned-vs-entered pattern; do not invent a second vocabulary. ⛔ The blindness is NOT closed until layers 1-3 all ship.
- [ ] **Wire `place-week.ts` / settle placement authority** — superseded in FORM by D-325 §6 (its walls become penalties) but the underlying job is the same and still open. Three claimants today; see `ARCH-strength-spine.md` §0.6.
- [ ] **`quality_run` / `quality_bike` are collected and dropped.** `create-goal-and-materialize-plan:~2465` forwards only `long_run` to the strength composer. Same wire as placement.

### 🔥 BACK BURNER — filed 2026-07-25, Michael's call to defer
- [ ] **A one-shot dialog on the SECOND hard conditioning day.** Michael's line: *"we can hand you the keys to the Porsche, but it's up to you how you handle the curves on Mulholland."* The trigger already exists — `NonRaceBuilder.tsx` `hardDayCount === 2` renders `TWO_HARD_DAYS_LINE` inline today; the work is a once-per-athlete modal instead of a line, plus somewhere to remember it fired. **Cheap (~15 min).** ⚠️ Two of Michael's own rules pull against it and he should see them before it ships: *"gate it, don't warn it — no accept-the-risk button"* (a dialog whose only action is Continue **is** that button), and `COPY-VOICE.md` rule 10 bans idioms/metaphor outright. Neither is fatal — this is his rule to bend — but they are the reason it was not built the same night it was asked for.

### ⚡ Shipped 2026-07-24 — Load/strain verdict is MULTI-SPORT (D-317 → D-318) — DEPLOYED + DEVICE-VERIFIED
- [x] **D-317 — load reads TOTAL load, phase-aware** (`body-response.ts:40` `computeTotalLoadStatus`). Killed the run-only `running_acwr>1.3→high` block that read "pull back" on a strength week. `+6` tests, golden updated.
- [x] **D-318 — strain de-run-brained** (`load-status-reconcile.ts` `computeDecliningSignals` opts): strength-primary drops RIR-as-strain; HR-drift obeys the absorption steady-aerobic gate; absorption ledger neutralized for strength-primary. WK3 → **"balanced" · ACWR 1.2**. 4 permanent regressions (incl. Michael WK3 bug case).
- [x] **v144 copy** — HR-response "HR easing" → "lower HR at the same effort" (killed the "easing off" collision).
- [x] **Cache-floor trap fixed** — `COACH_CLIENT_MIN_PAYLOAD_VERSION` had drifted to 35 vs server 142 (the "not budging" cause); pinned to 144 with "bump both" comment.
- [ ] **AWAITING device-verify (carried):** the D-315 strength-track CLIENT UI (logger RIR range / swap sheet / ＋ Add button) — burner-verified server-side, still not device-seen. Do it with the Adjust-tab build.

### ⚡ Shipped 2026-07-22 — State RUN row + FITNESS craft/chart pass (D-307 → D-311) — DEPLOYED + MOSTLY DEVICE-SEEN
- [x] **Precise verdict words** (D-307): `recentlyFlat` → "settled lower" vs "easing off". `classify-recently-flat.test.ts`.
- [x] **Pace-at-HR line + GAP toggle** (D-308): raw pace default, grade-adjusted on tap.
- [x] **Projected race times** (D-309): goal-free VDOT 5k/10k/half/marathon, distance-unlocked.
- [x] **Color system** (D-310): discipline ICONs + white labels; verdicts traffic-light (holding=gray); cross-training by discipline; two load bars unified ("bike"); readability + tabular + aligned grids + left-aligned BODY prose.
- [x] **12-week efficiency chart** (D-311): `EfficiencySparkline`, output-not-load, two-horizon, fills-as-you-build. Michael saw it render (June-peak visible).
- [x] **Q-197 — exercise-name split FIXED** (2026-07-23, D-312): hit squat/deadlift/OHP + plurals, not just squat; canonicalizer synonyms + plural fallback + clean display names + client autofill fix. Recomputed 13 workouts.
- [~] **Open threads (Q-198):** strength e1RM chart SHIPPED (D-313) · tap-to-expand chart still open · load/form-over-time chart still open.
- [ ] **Delete throwaway scripts** `scripts/_trigger-snapshot.mjs` / `_check-run-pace.mjs` / `_chart-data-depth.mjs` (read `.env`, no secrets in them).

### ⚡ Shipped 2026-07-23 — strength + bike output charts, name fix, layout (D-312 → D-314) — DEPLOYED · strength DEVICE-SEEN
- [x] **Q-197 name-split fix** (D-312) — see above. `canonicalize.test.ts` (8 fixtures).
- [x] **Strength e1RM charts** (big-4) + **bike power chart** (D-313): generalized `TrendSparkline`, noise floor, `bike-power-chart.test.ts` (7 fixtures). Strength device-seen.
- [x] **Endurance-rider "power trend ⓘ"** (D-313): names what unlocks the bike power chart.
- [x] **Full-width row layout + bigger discipline headers** (D-314). Device-seen.
- [x] **Week-blurb reassurance clause removed** (`coach-week-insights.ts:168`). Verified live.
- [x] **Bike POWER chart — burner-verified end-to-end** (2026-07-23): live `compute-snapshot` + throwaway user w/ threshold rides → correct rising series (225→256W, improving, recent-flagged). Michael's own row stays chart-less until he logs power rides (correct).
- [ ] **Q-200 — bike efficiency chart for endurance riders** (design call, inverted axis).
- [ ] **Deferred UX:** cross-lift e1RM believability (bench > squat reads wrong); strength chart density (collapse-by-default?).
- [ ] **WATCH:** confirm cross-training line renders gold (not white) on device after a coach refresh; confirm bike "holding" is gray everywhere (`bikeEfficiencyDisplay` server tone still `warning`).

### ⚡ Shipped 2026-07-19 night — DEPLOYED, NOT VERIFIED (coach week composer, D-306)
- [x] **Wired `composeCoachWeekInsight`** — `coach.narrative` is deterministic. Pushed `652f07e3`, `coach` deployed, `COACH_PAYLOAD_VERSION` 118.
- [x] **Stall signal built (Q-193)** — per-set reps vs prescribed, at or above the prescribed load.
- [ ] **⛔ VERIFY ON DEVICE.** State → the collapsed paragraph under "open for more". Expect facts about the week's mix, plus either the plan comparison or your own-normal band. **An EMPTY paragraph may be CORRECT** — silence is legal when data is thin; check logs before calling it broken. ⚠️ The stall code has never seen a real `workout_analysis` row.
- [x] **The paragraph and the plan now describe the same week** — plan comparison moved onto `computeWtdLoadSummary` (calendar week, planned-by-today). Retired the Sunday gate. Caught by Michael on screen.
- [ ] **Q-194 — one SHARED banned-word enforcer.** The voice check doesn't run on `intent_summary` (`coach/index.ts:5492`, live: "body is ready, stay consistent") or on `marathon-readiness` (`:273`, `:296`, which also carry imperatives). ⛔ Needs Michael's replacement wording, not a silent edit.
- [ ] **The LLM still writes `coaching.headline` + next-session guidance.** Only the narrative was replaced; retiring the rest is the sweep.
- [ ] **Ground the two triathlon protocols** in `strength-protocol-read.ts` (currently silent by design) — needs a trace of `triathlon.ts` / `triathlon_performance.ts` intent, then a reading each.
- [ ] **Trace `adapt-plan` for Q-192** before touching `strength-profiles.ts` — `five_by_five` is absent and falls back to durability's thresholds; the prescription may still be right and only the adaptation layer wrong.

# ⚡ AWAITING MICHAEL — SHIPPED 2026-07-13/14, NOT YET VERIFIED ON DEVICE

**All deployed and live.** Fixtures are green; **none of this has been driven by a human yet.** Tick these off as you train.

## ⚡ AWAITING MICHAEL — 2026-07-24 STRENGTH NUMBERS (D-322, DEPLOYED · 5 lines blocked on ONE Xcode run)

**The iOS bundle is BUILT AND SYNCED** (`npm run ios` run, new strings confirmed in the bundle). It is not
on the phone. **One Xcode run closes five ledger lines at once** — `OPEN-QUESTIONS.md` Q-202 lines 3, 6, 11,
12, 14. Nothing client-side in this workstream has been seen working by a human.

What to look for, in the strength logger:

- [ ] **Swap gives the planned weight.** Open a strength session, hit ⇄ Swap on a lift. The new lift's
      weight should be what the plan would have prescribed for *that* lift this week — not a rescale of the
      old one. The old bug was worst on dumbbell lifts: **45 lb per hand against a prescribed 20.**
- [ ] **Type "hip" in the exercise search.** **Hip Thrust** should appear. It never has — it has a config
      entry and a measured e1RM, and the search list simply didn't contain it.
- [ ] **Add an exercise. The weight box should not be empty.** It should fill from your own measured 1RM
      for that lift, or failing that the last weight you logged for it, or failing that a derived estimate.
- [ ] **A pull-up shows "Bodyweight", never a pound value.** (Server side already verified — this is the
      client confirming it renders.)

Everything else in D-322 is **verified against the deployed function**, including on throwaway users. See
Q-202 for the line-by-line state: 10 verified, 15 open, 5 blocked here.

---

## ⚡ AWAITING MICHAEL — 2026-07-24 COPY VOICE SWEEP + WEEK-NARRATIVE FIXES (coach v149, DEPLOYED, client PUSHED)

The coach narrative + posture sentence are **server-verified** (live `skip_cache` call). The **~45 client copy strings are NOT device-seen** — needs a fresh bundle (web hard-refresh, or `npm run ios` for the phone). Look for:
- [ ] Run row ⓘ → the new posture line ("Running's at about half the 3-a-week plan…") + "pace fading on long efforts" (was "aerobic base needs work").
- [ ] State "Show more" → week narrative reads clean/silent (no "Riding came in below…" on your parked bike, no "heavier than planned" contradiction).
- [ ] BODY section → the pushy "This week: prioritize recovery" fallback is GONE.
- [ ] Workout screen → "Heavier than the plan called for" (was "you went heavier — intentional?").
- [ ] BlockSummary / CoachWeek / Adjust tabs → no "X detected", "Insufficient data", "move the needle", "Cardiac drift".

## ⚠️ READ THIS FIRST — do NOT recompute the Mon 2026-07-13 strength session

Q-178 fixed the predicate so a set flagged `completed` with **zero reps, zero weight, zero duration** no longer counts as performed. **That is correct — but that Monday row is genuinely incomplete**, because the logger had no weight box and never persisted the duration (Q-180). So a **recompute of that session will now honestly report the Farmers Carry as unrecorded**, and the score will fall. **The work happened; the record of it does not exist, and no amount of recomputing will conjure it.**

**Don't chase it. Just log the next carry with the fixed logger** — that is the real test.

## The list

### Shipped 2026-07-14 (State) — verify on device
- [ ] **The run row stops scolding you (D-292 / Q-179).** Open **State → PERFORMANCE**. The run row should carry a **grey** line beneath it — *"You said 3 a week. You've been doing about 1.6 a week. That's a trade, not a mistake — but it's yours to make on purpose."* **Grey, NOT amber.** Your STRENGTH row is the one now allowed to flag a concern (it's the thing you're building). ⚠️ Needs the new **Netlify client bundle** — hard-refresh; if the line is missing after that, the fix is in the live-path render (commit `746c3685`), say so.
- [ ] **The durability trend is un-frozen (D-291).** The run row should read **"as of Jul 13"**, not late June, and count your Jul 12/13 runs (`newestAgeDays 1`, not 16). Verified in DB; confirm on screen.
- [ ] **Grade-Adj Pace tile (D-291).** Open a recent outdoor run → **Details**. There should be a **Grade-Adj Pace** tile next to Avg Pace (the hills-removed pace; on a hilly run it reads a few sec/mi slower than raw). And the **route chart** now plots the real grade-adjusted number, not the HR-normalized one.

### Shipped 2026-07-19 (State generalist reframe, D-302) — ⛔ SHIPPED-PENDING-AUDIT, do NOT call verified
- [x] **AUDIT the State posture-aware reads — DONE 2026-07-19 EOD, and it triggered the strength-read rebuild (D-303).** Found: e1RM had NO noise guard (unlike run decoupling), and it was live-lying — a squat "sliding" on noise bigger than the move, flipping the overall verdict on any single session. Fixed (guard). Strength develop word-map + baseline dot REPLACED by the per-lift estimated-1RM read (Strong/Hevy + science). `planWeek≥4` gate was whole-plan not block weeks — gone with the word-map. VERIFIED on device. See D-303.
- [x] **RIR / deload fatigue layer for the strength read — DONE 2026-07-19 EOD (D-303 #2).** `strength_rir_below_prescription` now renders as the grinding/fatigue line on the strength read, moved off the nudge + coach prompt (single home). Wording is a tune-to-voice placeholder.
- [ ] **Instrument-follows-goal (the owed follow-up from D-303).** Strength read leads with e1RM (correct for `get_stronger`). A `build_muscle` goal should lead with VOLUME (`computeStrengthVolumeState`) — hypertrophy peaks on volume, e1RM is fatigue-suppressed mid-block. Goal exists (`non-race-goal-seeds.ts`); read doesn't switch on it yet.
- [x] **State reframe shipped (D-302)** — no Building/Holding labels; dropped+inactive dims (never penalised); active-but-out shows normally; posture-aware strength read. Partial implementation of the `SPEC-posture-flag` / §5 posture-aware-verdict item.

### Shipped 2026-07-18 #2 — max HR + threshold pace single-source (HR-congruence tail closed)
- [x] **Max-HR single-source (D-299)** — one resolver, one divisor + Tanaka/Gulati (Fox retired). Byte-identical for a data-rich account (fallbacks don't fire). Nothing to eyeball on your device; on a brand-new birthday-only profile, Baselines' max HR now matches the zone chart. Don't re-litigate.
- [x] **Threshold-pace single-source (D-300)** — coach + race-projections + snapshot spine now read one pace; 3 units unified. One visible change: the coach's baseline notes quote your **measured** threshold pace, formatted `m:ss` (was a wizard guess). Fixture + full-suite verified; no acceptance run owed. Don't re-litigate.

### Shipped 2026-07-18 — LTHR / decoupling / upkeep / fan-out
- [x] **LoadBar % sum to 100 + "· 7d" label** — verified on device + against history. Don't re-litigate.
- [x] **Decoupling per-run copy (confounded runs)** — verified on device (Jul 13 run no longer says "aerobic base needs work"). Don't re-litigate.
- [x] **Upkeep accent (D-297)** — verified on device ("Running's at about 4 of your 18-mile upkeep — 4 weeks now…"). Don't re-litigate.
- [x] **LTHR single-source (D-296)** — byte-identical for the primary user (all 4 chains already 151); 20 recent runs recomputed for the analyzer-zone change. Nothing to eyeball; the point is nothing moved.
- [ ] **⚠️ VERIFY — fan-out a–d (D-298).** Needs ONE real Garmin/Strava sync. Confirm DB-first: (a) `workout_facts` for the synced run has `execution_score` / `time_in_zone` / `hr_drift` (no race loss); (b) `athlete_snapshot.input_watermark` is set and the week reflects THAT workout; (c) a phone-logged + an imported workout each produce `workout_facts`; (d) ≥3 back-to-back `recompute-workout` runs are idempotent. The guard's stale-refusal (e) is already verified live. See `AUDIT-fanout-ordering-2026-07-17.md` §4.

### Shipped 2026-07-17 (State v3 fitness anchors) — arc ACCEPTED on device; two items still to WATCH
- [x] **The fitness band, anchors, `withheld` gate, swim facts-only (D-293/294/295)** — accepted on device 2026-07-17. Run anchor 3.4% (Jul 12), direction withheld at low volume, swim shows facts, bike `auto · FTP est`. **Do NOT re-litigate.**
- [ ] **⚠️ WATCH — descent accent's FIRST REAL firing (Q-186).** It only fired TEST-triggered. On the next NATURAL anchor descent (a strong old run aging out of the ~12wk window), confirm the coach line reads as an explanation-with-credit, not a scold — and that the credit clause is absent when the aerobic work didn't cover the load.
- [ ] **⚠️ CLEANUP — ~2 stray superseded rows in `fitness_baselines` (Q-187).** From the live-verify reset. Active crown is correct; prune the lineage WITH Michael (timestamps overlap real supersedes).

### Shipped 2026-07-13/14 (strength) — verify on device
- [ ] **The SWAP (Q-181 / D-289 + D-290).** In a prescribed strength session, hit the **⟳ Swap** icon on an exercise. Expect: a sheet of **same-movement-pattern** alternatives you can actually load (Bulgarian Split Squat → walking lunge, reverse lunge, step-up — **never** hip thrust). Pick one → **no dock**, the weight **clears** (it was computed for the other exercise), reps stay.
  Then try an **out-of-slot** override — type "Hip Thrust" into the name field — and check Performance says: *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."*
  And the one that matters most: **skip an exercise entirely and confirm it STILL counts as a skip.** Forgiving a real miss would be far worse than the bug we fixed.
- [ ] **The carry (Q-180).** Log a Farmers Carry — planned OR hand-added. Expect: a **countdown timer**, a **weight box labelled `lb/hand`**, **no RIR prompt** on Done, **no plate calculator**, and the duration **actually on the row afterwards** (`0:40`, not `0 reps`). *(Hand-add already confirmed by screenshot 2026-07-14; the PLANNED path is still untested.)*
- [ ] **The swap (Q-181).** In a prescribed session, **type over an exercise's name** (e.g. Bulgarian Split Squat → Hip Thrust). Expect: **no dock** (the planned lift is not a skip), the substitute **gets credit**, load/RIR **not graded** on it, and on Performance one line — *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."*
  Also worth trying: an **in-slot** swap (reverse lunge for the Bulgarian) → **no dock and NO sentence.** Silence is the correct answer there.
- [ ] **The Monday alarm is gone (Q-177).** Open **State on a Monday or Tuesday**. The *"Strength volume well below recent baseline (−64.4% vs chronic)"* signal — top severity, with a "Review with Arc" button — **should no longer appear at all.** The spine's `STRENGTH · Volume · steady` stands alone.
- [ ] **A strength session's narrative is honest (Q-178).** Skip a set or an exercise deliberately. The prose must **not** claim you *"landed on target across all three lifts."*
- [ ] **The 26-function deploy.** D-285/D-287's run-pace resolver was **stranded and never actually running in the plan generators** — it is now. **Build a plan and sanity-check the paces.** Also the B1 identity fix reached its 7 functions.

**If any of these misbehave, the diagnostic is *which one* — each maps to a different fix.**

---

# 0. THE HEADLINE — three finished engines have never run once

The 2026-07-13 audit found the same disease three times, and it is the highest-leverage thing on this page. **In each case the engine is fully built, pin-tested, and spec'd — and nothing calls it.** These are not features. They are **plumbing jobs**, and each is small.

**Each item below leads with WHAT IT DOES FOR AN ATHLETE**, because the previous docs said only where the code lived — which is why nobody, including the owner, could remember what these were for.

- [ ] **Consolidated strength mode.**
  **What it does:** lets the athlete say *"put my lifting on the SAME day as a hard leg session, so my other days stay free"* — instead of the default, where lower-body lifting and a hard leg run/ride can never share a day. It's the *"how should strength fit into my week?"* fork. Real training-philosophy choice: fewer, denser days vs more, lighter ones.
  **Status: BUILT, TESTED, NEVER EXECUTED ONCE.** The rule set ships (`_shared/week-optimizer.ts:412-417`, same-day QR+lower at `:1215-1291`), the fixtures pass (`week-optimizer.anchor-contract.test.ts:1057-1099`, `consolidated-trade-off.test.ts`), the spec exists (`docs/CONSOLIDATED-MODE.md`, decisions LOCKED), and the server threads the field (`_shared/combined-schedule-prefs.ts:303` → `reconcile-athlete-state-week-optimizer.ts:206`). **But no wizard ever writes `integration_mode`**, so `create-goal-and-materialize-plan/index.ts:1895` hardcodes `'separated'` for everyone. **The job: one wizard question + the payload leg.** Nothing else.
- [ ] **The day-count gate.**
  **What it does:** stops the wizard from silently accepting an **impossible week**. You say *"4 days, 10 hours, hard intent, lots of strength"* — it does the math against the required session count and the 24h spacing rules, and either warns you or refuses **and shows you the arithmetic**. Today the wizard just says yes and builds you something that can't fit.
  **Status: BUILT, 30+ TESTS, ZERO IMPORTERS.** `src/lib/day-count-gate.ts:237 computeDayCountGate` is complete (260 lines, spec at `docs/DAY-COUNT-GATES.md`) and **nothing in the app imports it.** `session-frequency-defaults.ts:305` already emits `gate_block: 'hours_too_high_for_days'` straight into it, and it never reaches a refusal path. **The job: mount it in the wizard + write the warn/block copy.** *(Collapses 5 old items into one.)*
  ⚠️ **DEPENDENCY: this ships AFTER consolidated mode.** The gate's matrix has "Consolidated" cells that key on `integration_mode` (`DAY-COUNT-GATES.md §0`). **Do them in that order.**
- [ ] **The segment engine.**
  **What it does:** *"am I getting faster on this stretch?"* It spots the chunks of road you actually run repeatedly — a **"core"** is a recurring stretch, not a whole route — and tracks whether you're improving on it. Your own personal segments. *(It deliberately supersedes the earlier per-**route** approach, which flip-flopped on real data — said "improving" one week and "declining" the next. See `DESIGN-segments.md §0`.)*
  **Status: BUILT, SPINE-WIRED, STARVED AT THE SOURCE.** `detect-cores` has **zero callers** — no cron, no button, no script. So `route_cores` is always empty, `match-cores` (`compute-facts:1827`) and `compute-core-verdict` (`compute-snapshot:873`) have nothing to match, and `build.ts:928 segment_verdicts` is always `[]`. **The whole feature produces nothing, on web and on iOS.** *(So the queued `npm run ios` rebuild would NOT have surfaced the segment card — fix the caller first.)* **The job: invoke stage 1.**

> **The pattern:** *it doesn't work* is not evidence that *it doesn't exist*. **Ask STARVED or ABSENT before you build.** See `START-HERE.md`.
>
> **And the lesson underneath it:** all three were documented by **where their code lives**, never by **what they do for an athlete**. That is how a solo founder loses track of his own shipped work. **Every capability row should say what it does, in a sentence a runner would understand.**

---

# 1. FRACTURES — split by whether they are LIVE or LATENT

> ## ⚠️ READ THIS BEFORE THE LIST — the 2026-07-13 device session corrected the code audit
>
> The audit was run entirely from code. **Then we opened the app**, and it changed the ordering materially. **Most of the "worst" fractures are LATENT for the only user who exists.** Michael has learned baselines, configured HR zones, and a pace-prescribed plan — which is exactly the configuration that dodges them.
>
> **They are still real. They fire the day a SECOND user exists** — specifically, a user who has **typed** a number, or who has **no** numbers at all. That is the entire population of the onboarding flow.
>
> **The lesson, and it cuts against the standing rule:** *"verify by code trace, not one device session"* is right about **existence** and wrong about **severity**. The trace found the defects. **Only the device session could tell us which ones were biting.** Do both. Neither alone is honest.

## LIVE — happening on the only real account, today

- [ ] **🔴 Q-179 — THE CONTINUITY FRACTURE, WATCHED LIVE. The verdict engine is POSTURE-BLIND.** *(Found 2026-07-13 by putting two screens next to each other.)*
  **One athlete, one week, one question — *how is your running?* — three different answers:**
  - **the plan's own copy:** *"Easy Run — maintenance only (**held so strength leads**)"* ✅ knows
  - **State:** *"Easy — **aerobic base needs work**"* (`state-trend/run.ts:139`, pure decoupling >5%) ❌ blind
  - **`off-plan-banner.ts:66-71`:** *"On plan — strength on track"* — while he ran **zero** of two planned runs ❌ blind
  **The proof is one grep: `per_discipline_posture` appears ZERO times in `_shared/state-trend/` and ZERO times in `coach/index.ts`.** The verdict engine grades a `maintain` discipline exactly as it grades a `develop` one. And the 7.8% decoupling driving the scolding is **`as of Jun 27` — 16 days stale.**
  **This is the same shape as Garmin calling him "Unproductive"** — and `PRODUCT-POSITIONING-v2-DRAFT` opens on exactly that. **Efforts asked, stored the answer, and judged him on the axis he told it to deprioritize anyway.**
  ⛔ **THIS REFRAMES THE POSTURE FLAG.** It is not a banner and it is not a new feature — **it is making the verdict engine posture-aware at runtime.** The banner is the smallest part. **Do NOT ship the flag first:** a posture-aware banner sitting above a posture-blind verdict is not continuity, it is a third opinion.
- [ ] **🔴 Q-177 — THE "STRENGTH VOLUME DOWN" SIGNAL IS A PARTIAL-WEEK ARTIFACT. It fires at CONCERN severity every Monday, for every athlete, by construction.** *(Found 2026-07-13 **by opening the app on a Monday**. The code audit missed it completely.)*
  On screen, simultaneously: **`STRENGTH · Volume · steady`** (the spine, correct) and **`SIGNAL: Strength volume well below recent baseline (-64.4% vs chronic)`** (a top-severity nudge with a "Review with Arc" button). Two engines, one fact, one screen.
  **Why it cannot not fire:** `compute-snapshot:445` compares `current.strengthVolume` — a **cumulative SUM of the CURRENT week** (`:117/:183`, `targetWeek = mondayOfToday()`) — against the **average of COMPLETE prior weeks**. On a Monday with 1 of 4 sessions done that is **≈ −75%**. `longitudinal-signals.ts:148` fires `warning` at `< -12` and **`concern` at `< -22`**. **It measures what day you looked, not what you did**, then decays to nothing by Sunday and re-arms.
  ⚠️ **Second consumer, latent:** `compute-snapshot:507` — `structuralDirection` falls back to this artifact when top-lift e1RM is absent, and feeds **`interferenceScore`**. For an athlete with no lift history, **a Monday makes the app believe their strength is declining, and call it interference.**
  **This is "the score that lies", live.** Cheapest Law-1 fix: **delete the signal**; the spine's 6-week per-workout volume trend is already the single source and it was right. **Do not just widen the threshold — that hides a structural artifact behind a magic number.**
- [ ] **🔴 Q-178 (= Q-076, ROOT-CAUSED) — A SKIPPED EXERCISE COUNTS AS PERFORMED, AND THE NARRATIVE ASSERTS THE OPPOSITE OF WHAT HAPPENED.** *(Found 2026-07-13 **by opening a completed workout**. Q-076 had sat unverified since June — the only screenshot was blank. **Here is the repro.**)*
  **Mon 2026-07-13, Upper A:** bench 4 of 5 sets (−600 lb), **Farmers Carry 0 of 3 sets** (set 2 logged as **`0 reps (RIR 3)`**). The app said **`EXECUTION 98% · Strong`** and *"Sets landed on target across all three lifts, with loads held to plan."*
  **Root cause — `analyze-strength-workout:89` (`isPerformedStrengthSet`):** `return s?.completed === true || reps > 0 || weight > 0 || duration > 0` — **`completed === true` short-circuits, so the flag outranks the data.** A 0-rep / 0-weight / 0-duration set reads as PERFORMED → the exercise **matches** → D-208's 30%-weighted exercise-completion term (`:1337`) pays out in full for an exercise that never happened.
  🔴 **The narrative is the real damage.** The LLM is not hallucinating — **it is handed a fact packet that already says the exercise was performed.** `narrative-core/validate.ts` validates prose against the FACTS, so **it cannot catch a lie that is already IN the facts.** The whole LLM-containment strategy is sound and **only as honest as the packet.** Corrupt the packet and the guard becomes a laundering step.
  **Fix:** a set with `reps === 0 && !weight && !duration` is **not performed**, whatever the flag says. And the logger must not write an RIR onto a zero-rep set. ⚠️ **Read D-204 first** — the predicate was deliberately centralized out of 6 copies. Change the predicate, not the call sites.
- [ ] **🔴 STRENGTH WEIGHTS HAVE TWO WRITERS, AND ONLY ONE ASKS.** `adapt-plan` action=auto silently re-prices the lifts on **every ingest** (`:1161/:1188` → `materialize-plan:1232`), **skipping the Arc fatigue/taper/adherence gate** the `suggest` path applies. Meanwhile the consent path (`StrengthAdjustmentModal`, mounted at `StateTab.tsx:1370`) asks permission for a thing already done. **This silently violates the standing rule that any change to prescribed load or RIR is sign-off-gated**, and it means §8's "GATED — changes prescription" Steps 4/5 describe a door **already ajar**. ✅ **Michael wants the athlete option (mirror the easy-pace chooser).** One writer; default = today's behaviour; visible; overridable. **This is the #1 live item.**
- [ ] **🔴 THE RPE TREND IS AN ORDERING ARTIFACT (Q-167).** `makeTrend` (`_shared/response-model/body-response.ts:369`) splits **this week's** sessions in half **by the order they happened**. Hard Monday + easy Friday reads *improving*; swap the days and the identical week reads *declining*. **It is the required strong-evidence leg for the safety floor** (`load-status-reconcile.ts:83-95`, D-266). Establish intent before touching (Q-121 precedent).
- [ ] **🔴 ONE ACWR BAND (Q-168).** The *ratio* is single-source and clean. The *band* is re-derived in **6 places**, one plan-blind and shipping in the same payload as the real one (`_shared/response-model/weekly.ts:313`). **A taper week at 1.15 reads `elevated` and `optimal` simultaneously.** Also: `load_status` is mutated a second time *after* the reconciler (`coach:3814`, coupled to LLM availability); the State headline has **no `productive` branch** (`load-headline.ts:63`) so a productive week silently drops the load slot.
- [ ] **🟡 A race in the fan-out silently drops facts.** `compute-facts` is awaited but reads `workouts.computed`, written by two fire-and-forget calls it does not wait for (`ingest-activity:1508/:1521`). When it loses: no time-in-zone, no interval hits, no HR drift, no execution score. **No error anywhere.**
- [ ] **🟡 Dead "Aerobic fitness" BODY row (Q-164).** `coach:2131` `cardiac_efficiency_current: null`, `sample_size: 0` → the render gate can never be true, so the row **can never appear**. Feed it or delete it.

## LATENT — dormant today, and they ALL fire on the first new user

**These are the onboarding blast radius. See §1b.**

- [ ] **🔴 THE ZONES — two bad tables, both currently dodged.** ⚠️ **CORRECTED 2026-07-13 after looking at the app.** The earlier claim ("the plan says run at 136, the analyzer grades you at 134, it's happening now") **was FALSE** and is retracted. Verified on the live account: the workout's stored bins are **Z2 128-135, Z3 135-143** (half-open), which **match Baselines exactly**. The analyzer's Priority 1 is `configured_hr_zones` — *deliberately*, with a comment saying so — and those zones are the Friel 0.89 canon. **The system is behaving correctly.**
  **But two divergent tables are real in code, and both are one condition away:**
  - `_shared/endurance/hr-zones.ts:18` — Z2 ceiling **0.90** (→136 @ LTHR 151) vs the canon's **0.89** (→134). Used by `generate-run-plan`. **Dormant only because the current plan prescribes PACE bands, not HR zones.**
  - `analyze-running-workout:1030-1033` — a **non-Friel** model (0.75/0.85/0.92/0.98) whose Z2 tops at **128** (the canon's *floor*) and whose **threshold zone caps at 148 — BELOW a real LTHR of 151.** **Fires only when `configured_hr_zones` is missing — i.e. a brand-new user.**
  - D-286 fixed **three** copies of the Friel seam. **There were five.** Its own header lists the three it knew about; these two are not among them.
- [ ] **🔴 ONE LTHR (Q-176).** Four chains, **no resolver**, two inverted. **Latent only because Michael's LTHR is `learned` and he has never typed one.** The inversion bites the moment an athlete **types** an LTHR: Baselines and the plan generator honour it; the coach, the easy-HR band, the run analyzer and `calculate-workload` **silently discard it**. It is the **root of the run stack**. Spec: `docs/SPEC-lthr-one-anchor.md`. ✅ **Ruled: default learned, athlete can override, override wins (mirrors Q-174).** Do `threshold_pace` in the same pass — **no resolver at all**, read raw in ~17 files across 3 units.
- [ ] **🟡 FTP bypasses the resolver in 8 places** — `get-week:436` (week-view watts), `normalizer.ts:308/898/935` (plan watts), `PlanSelect.tsx:587`, `course-strategy:521`, and `athlete-snapshot/identity.ts:67` → **the LLM prompt**, so the coach can *speak* a different FTP than the screens show. *(TRUTH-MAP says FTP is "CLOSED". It is not.)*
- [ ] **🟡 Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire only `compute-workout-summary` → **no `workout_facts`**. Zero contribution to ACWR while still counting toward `workload_total` — **the same snapshot row contradicts itself.** *(Latent for Michael: he ingests via Strava/Garmin, which take the full path. Fires for anyone using phone-recording or FIT import.)*

---

# 1b. THE ONBOARDING GATE — the app must stop inventing BEFORE it invites anyone in

**Michael's intent (2026-07-13):** a new-user flow to enter easy pace, 5K pace, FTP, 100y/m swim pace, and 1RMs for the major compounds — **as frictionless as possible**, with the option to let the app learn from their own testing instead.

> ### ⛔ THE FRICTIONLESS PATH IS THE DANGEROUS PATH. This is the gate, and it is not optional.
>
> **Today, when a user gives the app nothing, the app does not refuse. It INVENTS, and says nothing.**
> - squat / bench / deadlift 1RM = **135 lb**, OHP = **95 lb**, hip thrust = `max(75, deadlift × 0.55)` (`materialize-plan:2699-2726`) — **console log only**
> - swim pace = **1:30/100** (`materialize-plan:2352`) — drives every swim `duration_s`
> - HR zones fall through to the **non-Friel** model above, whose threshold zone caps below a real LTHR
>
> **Every "LATENT" fracture above fires on exactly this user.** They are not separate work — **they are the onboarding blast radius.**
>
> **Law 2 says: measured ≠ inferred. When you don't know, SAY SO.** The pattern already exists and already ships honestly — the run-pace fallback tells the athlete: *"Run durations estimated at 10:00/mi until we learn your easy pace"* (`strength-primary-plan.ts:427` → `GoalsScreen.tsx:1633`). **Copy it. It is the only disclosed fallback in the app.**

- [ ] **Make the app refuse instead of invent** (strength 1RMs, swim pace, HR zones). Disclose, or decline and ask. **Gates everything below.**
- [ ] **The onboarding flow itself.** ⚠️ **Most of it is BUILT — this is a wiring job, not a build.** `OnboardingProfilePage.tsx` today collects **identity only** (birthday, gender, height, weight) and **never asks for a single performance number**. The performance numbers live on `TrainingBaselines.tsx`, and **nothing walks a new user there.**
- [ ] **The "let the app learn it" half is SHIPPED and working** — verified live on device: *"11:09/mi — pace at easy HR (5 runs; Friel Z2, at or below 89% of your threshold HR (151 bpm)) — as of Jul 13"*, with **the Q-174 chooser next to it**: `Use my runs 11:09` / `Use my number 11:30`. **That IS the "enter it, or let the app learn it" fork Michael is describing.** Reuse the mechanism; do not design a second one.
- [ ] **The "learn from their own test" half is BUILT for strength** — a Get Stronger plan drops in a `baselineTestWeek` (`strength-primary-plan.ts:526`) when it doesn't know the lifts. ⚠️ **But it only fires when BOTH bench AND squat are missing** (`create-goal…:2397`). Enter one, get no test week, and the other is invented.

---

# 2. SECURITY — pre-launch, not burning, but real

- [ ] **🔴 DELETE `strava-refresh`.** Zero callers, **deployed**, **no auth check**: takes `userId` from the request body and **returns that user's Strava access token** (`strava-refresh/index.ts:17`, `:93`). The anon key that reaches it is public and sits in your JS bundle. Live refresh already lives in `_shared/strava-access-token.ts`. **Delete, don't document.**
- [ ] **`_shared/bearer-auth.ts:17` decodes JWTs WITHOUT verifying the signature** (`atob` + `JSON.parse`, trusts an attacker-supplied `sub`). A second, unsafe auth idiom next to the good one. Delete it; adopt `require-user`.
- [ ] **B1 — `require-user` adoption is 9 of 87.** 77 of 87 functions instantiate a service-role (RLS-bypassing) client. Sensitive functions taking identity from the **body** rather than a verified JWT: `strava-token-exchange`, `strava-webhook-manager`, `import-strava-history`, `send-workout-to-garmin`, `import-garmin-history`, `swift-task`. *(`strava-webhook-manager` is called with the anon key as bearer, so it carries no identity **by construction** — it cannot adopt `require-user` without a client change.)*
- [ ] **Admin functions have no server-side admin check.** The 8 edge functions `WorkloadAdmin.tsx` invokes are gated **client-side only**. `is_app_admin()` exists in SQL and guards only `library_plans` INSERT.
- [ ] **`disconect-connection` (misspelled) is a REAL deployed function with NO SOURCE in the repo**, kept as a permanent fallback branch at `Connections.tsx:495`. Unknown behaviour. Find it, delete it, remove the branch.

---

# 3. HYGIENE — deletions, mostly

- [ ] **24 dead edge functions + 11 empty directories.** Full list in `CAPABILITY-MAP.md`. Two are actively dangerous as decoys: `analyze-workout/` (empty, the most guessable name in the repo) and `generate-training-context/` (3.4k lines, a dead twin of the live `coach`). `generate-plan` is a validator that generates nothing.
- [ ] **Five DEAD run-generator classes** in `generate-run-plan/generators/` — and `simple-completion.ts:89` exports a class named **`SustainableGenerator`**, identical to the live one in `sustainable.ts:92`. **Editing the wrong file is a silent no-op.** Delete the decoys.
- [ ] **Nine coach outputs are computed and never rendered** (`CoachWeekTab` + `BlockSummaryTab` are unmounted) — including **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ **`reaction`'s object is load-bearing internally — do not delete it, only its dead emission.** *Decide: mount the tabs, or delete them. Right now it's neither, which is the worst of both.* Also dead: `synthesizeHeadline` runs on **every** snapshot and **every** State render and both throw it away; the LLM's `headline` + `next_session_guidance` are **paid for, parsed, and discarded.**
- [ ] **Five red tests** — `_shared/cycling-v1/{ai-summary,cross-workout-queries}.test.ts` assert the NP-trend fallback that cb4eb1d5 deliberately **deleted** on 2026-07-10. Red for days. *Green must mean green.*
- [ ] **Dead commented block** `compute-workout-analysis/index.ts:1084-1125` ("keeping as backup for rollback") — the real one is imported at `:4`. Pure deletion.
- [ ] **Q-133 peel-back** — `buildRouteReadout` (`_shared/session-detail/build.ts:27`) is still called at `:921` and still emits `terrain.route`, now dead. `SessionNarrative.tsx:395` acknowledges the debt.
- [ ] **`load-headline.ts:67`** carries an unreachable `'building on plan'` branch for a label nothing can produce (D-246's artifact was deleted).
- [ ] **"provisional" → "building base"** wording swap (`LoadBar.tsx:112`, `StatePerformanceSection.tsx:41/130/184/275`). Zero occurrences of "building base" exist today.

---

# 4. REAL WORK, by area

### Plan / wizard
- [ ] **Wizard trade-offs at decision time**, not after generation (`WIZARD-AUDIT.md:79` G2). Only Step6LongDays has a live warning; the rest are static hints.
- [ ] **Explain what each baseline input drives.** Only swim equipment has "what this unlocks" copy (`TrainingBaselines.tsx:950`). Nothing for FTP / CSS / 1RM / threshold pace.
- [ ] **A question→engine data-flow audit.** `WIZARD-AUDIT.md` is explicitly scoped to UX clarity, **not** data flow. No systematic trace exists. *(`CAPABILITY-MAP.md` now covers per-**fact** authority — this is the per-**question** version.)* Then: remove dead questions.
- [ ] **`phase-structure.ts:121`** — with no user-priority-A goal, `sortedGoals[0].priority = 'A'` mutates the **earliest** goal, so `totalWeeks` truncates before the season-final race.
- [ ] **Plan start-date default → today** (currently next-Monday: `ArcSetupWizard.tsx:440/463`, `PlanWizard.tsx:392`, `NonRaceBuilder.tsx:110/176`, `AppContext.tsx:617`). Mechanical; scope is the only open question.
- [ ] **Bypass-path audit for `strength_intent` normalization** — `create-goal-and-materialize-plan` and `arc-setup-chat` read around the normalizer (`_shared/combined-schedule-prefs.ts:372`).
- [ ] **`generate-run-plan`'s `simplePlacementPolicy`** is the only real §4.21 gap left, and it needs a **design pass, not a wire-up**. *(`generate-plan` is dead; `generate-triathlon-plan` has no per-day layer.)*

### Swim
- [ ] **Swim CSS is ORPHANED.** Written by two engines (`learn-fitness-profile:355`, `compute-workout-analysis:772`), read by **nothing**. `planning-context.ts:238 SWIM_CSS_LIVE = false`. **A 70.3 plan's swim leg is not calibrated to the athlete's swimming.** ✅ **2026-07-17 (D-293): the STATE swim verdict question is RESOLVED — swim is deliberately grade-less on State (`facts_only`), because pace is fins/equipment-contaminated. Anchorless-for-grading is now by design. A provisional swim anchor wakes on the first RPE≥7 swim (Q-188).** The PLAN-calibration hole (swim leg not anchored) is the part that remains.
- [ ] **Swim protocol drift audit** — `SWIM-PROTOCOL.md` exists; generation was never cross-checked against it. The 2026-05-27 protocol audit was cycling+run only.
- [ ] **Q-038 — swim stays provisional.** `StatePerformanceSection.tsx:136` hardcodes `PROVISIONAL_PERF = new Set(['swim'])`. Routing is now correct (`ingest-activity:1619`); needs **one live FORM→Strava swim re-ingest** to confirm and close.
- [ ] **Q-016 — drill/main ratio by experience.** `swim-drill-tokens.ts:274` is still a flat 350yd floor; only Path A landed.
- [ ] **Q-019 — wetsuit trade-off** needs two wizard fields (`race_requires_wetsuit`, `open_water_access`) before it can fire.

### Cycling
- [ ] **Ride taxonomy** — only one bike `session_kind` exists (`'quality_bike'`); the long ride is just tags. No Easy / Endurance / Long / Quality / Brick distinction. *(Note: the old item "stop calling Z2 weekday rides long rides" is **MOOT** — `longRide()` has exactly one caller and weekday Z2 comes from `easyBike()`. That bug is gone.)*
- [ ] **Cadence prescription end-to-end** (`CYCLING-PROTOCOL §8`). Analyzer collects it; nothing prescribes it.
- [ ] **Virtual-ride vocabulary** — suppress TERRAIN/CLIMBING for VirtualRide (`_shared/cycling-v1/ai-summary.ts:403`).
- [ ] **Q-036 — `intent_execution_match` adherence field.** Nothing shipped; gated on the secondary-IF-gate decision.
- [ ] **Adaptive intent tracking** — flag when the athlete consistently drifts above/below prescribed intent.
- [ ] **Power-curve + HR-at-power trends into the Arc/snapshot.** Not built.
- [ ] **Bike aerobic decoupling IS computed** (`analyze-cycling-workout:2601`) but **not stored** — a persist job, not a build, if ever wanted. (Run stores its decoupling; bike drops it.)
- [ ] **Q-037 — the 28W FTP gap to Garmin.** No code owed until the data check runs: compare native Garmin `.fit` power stream vs the Strava-ingested one.
- [ ] **Bike `limiter_sport` intensity dial** — `limiter_sport` shifts **volume** only today; no intensity dial exists for bike *or* run.

### Strength
- [ ] **🔴 Q-181 — A SWAP IS NOT A SKIP. The app docks an honest substitution TWICE.** *(Raised by Michael, 2026-07-13, from his own plan: swapping Bulgarian Split Squat → Hip Thrust.)*
  `matchExercises` (`analyze-strength-workout:520`) links planned↔executed **by NAME only**, and **no substitution concept exists in the codebase** (0 hits for any provenance field). So the planned lift reads as a **SKIP** (dragging the 30%-weighted exercise-completion term) **and** the work he actually did gets **zero credit** (`planned: null` → dropped from the denominator). **Penalised for what he didn't do; unpaid for what he did.**
  **SPEC: `docs/SPEC-exercise-substitution.md`.** The athlete declares the swap; the app stops docking and **names the trade** instead of scoring it. ⛔ Do NOT infer equivalence from the movement pattern — BSS is knee-dominant (`primaryRef: squat`), hip thrust is hip-dominant (`primaryRef: deadlift`). Ask, don't guess. **Sign-off gated.**
- [ ] **Strength → endurance interference signals** + **`endurance_load_context` population** (`analyze-strength-workout:2904`, still `null`). ⚠️ **These are ONE job** — the same `athlete_snapshot` fetch serves both. The substrate is already live (`compute-snapshot:512-522`).
- [ ] **Per-exercise history** — 1RM/volume trend + set records. `ExerciseHistory.tsx` does not exist. *(`StrengthCompareTable.tsx:250` already renders this session + the previous one inline — the gap is the last-6 trend + PR flag, not the expansion.)*
- [ ] **Refactor strength INSIGHTS → `_shared/strength-v1/ai-summary.ts`** (the directory doesn't exist; `_shared/cycling-v1/` is the pattern to mirror). Prompt + fact packet are still inlined.
- [ ] **Outcome-specific narrative templates** — one prompt today (`analyze-strength-workout:2451`).
- [ ] **Q-050 — pick-planned reconciliation.** Spec'd, not built (`SPEC-PICK-PLANNED-RECONCILIATION.md`); `auto-attach-planned:396` still matches on exact date only. Sign-off gated.
- [ ] **`analysis_error` truncation** — raw uncapped errors at every analyzer write site (`analyze-strength-workout:2983`, and 4 more).

### The spine (specs filed, nothing built)
- [ ] **Adherence↔Performance bridge** (`SPEC-adherence-performance-bridge.md`) — **zero lines built.** *(Was filed twice; de-duped.)*
- [ ] **Per-session performance engine** (`SPEC-per-session-performance-engine.md`) — zero lines built.
- [ ] **Personal zones / outlier detection** (`SPEC-personal-zones-outlier-detection.md`) — the seam is honest and real: `_shared/state-trend/zones.ts:30 resolveZoneBand` has a `'personal'` source with **no writer**. Everything resolves to `coggan_ftp`.
- [ ] 🔒 **Step 4 — plan builder reads spine** (GATED). Confirmed not built: `state_trends_v1` appears in neither `materialize-plan` nor `adapt-plan`. **Prescription is spine-blind.**
- [ ] 🔒 **Step 5 — autoregulation** (GATED). ⚠️ **Half-shipped without the gate** — see §1, `adapt-plan` auto.
- [ ] 🔒 **Per-discipline periodization** (`SPEC-per-discipline-periodization.md`, D-210) — spec'd, zero build; phase is still single/global.
- [ ] **STATE headline phrase bank** — the bounded-composition half **shipped** (`src/lib/load-headline.ts:98`, tested). Remaining: the authored phrases only.

### Misc
- [ ] **HR row "steady" state** instead of silently vanishing — `_shared/session-detail/build.ts:1561` only emits the row at ≥3 bpm drift. One `else` branch.
- [ ] **`calculateBestRunEfforts` ±2% window** (`compute-workout-analysis:159/164`) hard-clamps, so choppy GPS misses the true best effort.
- [ ] **`invokeFunction` token-IIFE is duplicated** (`src/lib/supabase.ts:126-134` vs `:189-196`); the anon-fallback masks a "user but no access_token" race.
- [ ] **iOS bundle rebuild** (`npm run ios`) — `ios/App/App/public/` is a day stale. ⚠️ **Will NOT surface the segment card** — that's starved at the source (see §0).

### Course → watch pacing (PARKED 2026-07-18 — nice-to-have, revisit AFTER everything else)
Send our per-segment course pacing to the athlete's watch. **Both halves already exist** — course-strategy computes terrain-adjusted per-segment pace (+HR + cue), and `send-workout-to-garmin` pushes structured workouts with distance + SPEED targets. The gap is just the adapter (course_segments → Garmin workout steps) + a "Send to watch" button on the course view.
- **Tiers:** (1) distance-based workout push — small, low-friction, minor late-race drift (~1% / ¼ mile over a marathon, from watch-reads-long; gradual pace targets so it barely matters). (2) GPS-position-glued, no drift — needs our OWN watch app (Garmin Connect IQ, or **easier on Apple Watch** — real native app, no sealed-workout wall — but Apple Watch is the wrong audience for endurance racing; Garmin is where the racers are).
- **Dead ends checked:** can't GPS-steer a native Garmin workout (sealed, distance/lap-advance only); can't inject our paces into Garmin PacePro (no public API — it regenerates generic gradient splits). Lap-advance steps correct drift but add mid-race button-press friction → not worth it; ship distance-based if/when we do this.
- **Cycling ≈ 2× the work:** it's a POWER sport, but our bike course output is speed/pace + FTP-in-cue-text, not structured per-segment watts. Needs a power-pacing brain upgrade (Best-Bike-Split-style) before any bike delivery. **Run first.**
- Full analysis: this session's transcript (2026-07-18).

### State screen needs more detail for SPEED-FOCUSED plans (NOTED 2026-07-18 — build when speed plans ship)
The reorganized State (Building vs Holding, posture-aware metric per discipline — see PRODUCT-POSITIONING north star) puts a *develop* discipline up top. But a get-faster athlete needs *progress* reads, not *retention* reads:
- **Building → run/bike (develop):** lead with **threshold-pace trend** + **race projection / VDOT** (both exist) + **durability-at-speed** (NEW).
- **Holding → (maintain):** steady aerobic durability + the slip flag (exists).
- **⚠️ The one genuinely new metric: DURABILITY-AT-SPEED.** Today "durability" = HR-vs-pace decoupling on STEADY runs only (aerobic, easy pace). A speed athlete needs "do you hold pace/power deep into a HARD or LONG effort" — i.e. fade. **The ingredient exists:** `hr_drift_pct` (first-half vs second-half HR) is computed on EVERY workout incl. hard ones, plus `execution_score` / interval-hold (nail rep 8 like rep 1). So it's a SURFACING build for non-steady efforts, not a new measurement. Build alongside the speed-focused training plans (runners + cyclists).

---

# 5. BLOCKED ON MICHAEL

Nothing here moves without you.

- [ ] **The positioning draft.** `PRODUCT-POSITIONING-v2-DRAFT.md` — approve or shred. **The posture flag's voice depends on it.**
- [ ] **The posture flag** (`docs/SPEC-posture-flag.md`) — **the product one**, the only thing here a competitor structurally cannot copy. ⚠️ **PARTIALLY STARTED 2026-07-19 (D-302):** the STRENGTH develop-read is now posture-aware at runtime (getting stronger / on plan / gains flat), and the D-297 slip gate is the maintain-dropped case — the first real "posture-aware verdict" slices, SHIPPED-PENDING-AUDIT. Remaining: the other disciplines, the RIR/deload layer, the plan-join lever, and the audit. Blocked on the positioning voice, and it should be built **after** the §1 fractures (flag someone's running against four disagreeing anchors and you ship a confident wrong answer). Also owes `SCIENCE-run-specificity.md` before its Tier-2 prose — the app's only maintenance theory is **discipline-blind** (true of the engine, false of the legs).
- [ ] **The D-282/D-284 recompute/backfill decision.** Deploy-forward only; history is on the old rules and the 5-week intensity window mixes two zone schemas. Mechanism: `scripts/verify-d284-backfill.mjs` — **deterministic chain only, NEVER the analyzer** (it regenerates LLM narratives).
- [ ] **On-device tests:** strength deviating-log (edit a set, skip an exercise); rest/haptic; the Execution-chip colours on a genuinely low-scoring session.
- [ ] **Repro artifacts:** Q-076 (skipped exercise shows as done); "deleting actual strength deletes planned" — `useWorkouts.ts:1675` *reverts*, it doesn't delete, so D-110's cause can't fire from that path; Ticket #2 (`UNAUTHORIZED_NO_AUTH_HEADER`) — `src/lib/supabase.ts:126` provably cannot emit an empty Bearer, so the premise needs a DevTools capture.
- [ ] **Product calls:** race-course matching (Q-009, GPX geometry) · segment leaderboards · W′ depletion · the iOS/auth remediation-pass go/no-go (~20 raw `functions.invoke` sites bypass `invokeFunction`).
- [ ] **Q-165 — LLM prose.** Effectively passed; two recomputes were consistent and the over-call was retracted. Needs one human eyeball on a third.

---

# 6. CLOSED by the 2026-07-13 verification

Moved off the queue. Do not re-open without new evidence.

- **✅ Q-170 — the adjust-for-heat toggle. NO ADJUSTMENT IS OWED.** D-283: not field-standard (nobody auto-excludes on temperature), and across **81 steady runs** the heat→decoupling slope's 95% CI straddles zero (r²=0.014). **D-275 is dead.** `COACH_PAYLOAD_VERSION 95` confirms.
- **✅ Q-025 — the TREND pool label.** The row it describes was **deleted** 2026-07-05 (`build.ts:893` — `trend: null`, "macro trends now live ONLY on State"). It cannot render.
- **✅ Standardize swim copy to CSS percentages.** **MOOT — D-030 locked the opposite:** athlete-facing swim copy is effort tiers, CSS words deliberately stripped (`SWIM-PROTOCOL.md:22`).
- **✅ "Stop calling Z2 weekday rides long rides."** The bug is gone — `longRide()` has exactly one caller (`week-builder.ts:1098`, gated on `long_ride_day`); weekday Z2 comes from `easyBike()`.
- **✅ §4.21 week-boundary fix (Bug 3).** The proposed fix is a verified **no-op** — `dayBefore` is already circular (`week-optimizer.ts:51`) and the W-004 pin passes.
- **✅ `scaledWeeklyTSS` endurance-hours fix.** Shipped: `week-builder.ts:733-736` (Q-005 / D-021).
- **✅ Q-049 — check-in → Arc continuity.** `arc-context.ts:265` reads `readiness_checkins` directly (Phase 1). ⚠️ **But the only WRITER is inside the strength logger** (`StrengthLogger.tsx:3278`) — **an endurance-only athlete can never check in.** That's a new item, not this one.
- **✅ Bug B — strength logger loses state on iOS sleep.** Fixed (D-109): `AppLayout.tsx:130-176`.
- **✅ Equipment chips → strength protocol · 1RM → loading · FTP → baked watts · training history → volume floors · group-ride anchor · brick structure.** All verified flowing. *(FTP and 1RM carry the caveats in §1.)*
- **✅ Taper-mode narrative ban.** Live and guarded (`_shared/arc-narrative-ai-appendix.ts:126`). Standing eval watch, not queue work.
