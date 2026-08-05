# Efforts — the work queue

**Rebuilt 2026-07-13.** Every one of the 92 open items on the old list was **verified against code** (3 parallel readers). ~10 were already done, 4 were moot, 11 were "verify X" questions that now have answers, and 9 need Michael. The rest are real, and they are ordered below by leverage — not by the order they were filed.

**The full 133KB history (202 completed items + the originals) is in [`archive/POLISH-PUNCH-LIST-archive-2026-07-13.md`](archive/POLISH-PUNCH-LIST-archive-2026-07-13.md).**

Read `START-HERE.md` and `LIFECYCLE.md` first. **`CAPABILITY-MAP.md` is the anti-rebuild index — check it before building anything on this list.**

---

## 🏁 RACE BUILDER — OPEN ITEMS (2026-08-05)

Full record, incl. everything that shipped: [`STATE-race-builder-2026-08-05.md`](STATE-race-builder-2026-08-05.md).
**Check it before building any of these** — most of this subsystem is already built and starved, not absent.

| # | Item | Size |
|---|---|---|
| ~~1~~ | ~~**The intake screen has grown by accretion.**~~ ✅ **CLOSED 2026-08-05 — Michael: *"keep as is."*** Reviewed on device and kept: strength picker stays on "Your week", club-intensity stays under the club picker. ⛔ **Not a backlog item — a decision. Do not "tidy" it later.** | — |
| 2 | **The solver collapse** — `week-solver.ts` still has not taken the run generators (`SPEC-week-solver` §7). `assign-days.ts` is a narrow stopgap that overrode a written "do not patch this". | large |
| 3 | **Two doors to a marathon plan** — route `run` out of `renderEventForm` (`GoalsScreen.tsx:2433`); the form keeps ride/swim/tri. | small |
| 4 | **Bike/swim cannot be opted into a marathon plan** — the hold cards move *after* the preview, and no post-preview surface exists. | medium |
| 5 | **"Marathon" → "Run race"** (half/10k/5k). Engine is already multi-distance; needs per-distance `TIER_SEEDS` + distance-neutral tier copy first. | medium |
| 6 | **Mark redundancies for deletion** — Michael asked for this explicitly. Six named in §2.6 of the state doc, incl. two duplicates that are numerically identical *today* only. | small |
| 7 | **The tri event path has the same unguarded-insert hole** the race path had (`create-goal…:2842`) — preview still writes. | small |
| 8 | **Delete the stray `Efforts_Summer` Supabase secret.** | trivial |

⚠️ **Nothing from 2026-08-05 is device-verified.** Code, tests and typecheck only.

---

## 🅿️ PARKED 2026-08-04 — REPLACE THE RACE-READINESS PARAGRAPH WITH CHARTS

**Michael's call, parked as a to-do — not started.** *"cant we use graphs or visuals instead?"*

**The idea:** `_shared/session-detail/race-readiness-llm.ts` spends a model call per workout writing
six fields — headline, verdict, tactical_instruction, flag, projection, taper_guidance. **The numbers
underneath are already deterministic** (`_shared/race-readiness/`, VDOT projections). Four of the six
are better as pictures than sentences:

| field | better as |
|---|---|
| projection | a finish-time band, not a sentence |
| "holding pace at a lower HR" | a line going down — pace-at-HR is already computed |
| fitness trending | a line — already computed |
| flag | a marked point where a threshold crossed |
| taper_guidance | ⛔ **the schedule, read out — see below** |

⛔ **THE COMPONENT ALREADY EXISTS AND IS SHIPPED.** `TrendSparkline`
(`StatePerformanceSection.tsx:750`) renders 12-week series for run efficiency, strength e1RM and bike
power, and already handles the hard parts: recent points coloured differently, a `building · N of 12
weeks` state for thin data, captions. Device-verified for run + strength. This is a wiring job over an
existing chart, not a charting build.

⛔ **THERE IS NO PROSE REMAINDER — taper_guidance goes too.** A first draft of this entry carved it
out as *"the one with a real argument for words."* Michael, same day: *"we lay out the plan, we can
phrase that."* He is right and the carve-out was wrong. **The taper is not a judgement about the
athlete — it is a schedule the engine already built.** `taperWeeks()` (`science.ts:903`) sets its
length from distance × priority; `buildPhaseTimeline` sets when it starts; the long-run arc carries
the taper in its own tail; `generateRaceWeekSessions` already lays out the shakeouts and the reduced
long run. The model was handed all of that and asked to rephrase it.

So a template here is not straining to write coaching prose — it is **stating the calendar**: *"Last
long run is three weeks out at 16 miles. Volume drops next week and again the week after. Race week is
three easy runs and a shakeout."* That is BETTER than the model's version, because it cannot drift
from what is actually on the athlete's calendar. All six fields go.

⛔ **WHY CHARTS BEAT TEMPLATING THE REST.** The obvious cheaper move — keep the sentences, generate
them with rules — is worse on both axes: a template writes worse than the model AND is no more
truthful. **A chart is more honest than either.** It shows the shape *and* the gaps; `building · 7 of
12 weeks` is something a sentence has to remember to say and a chart says by existing.

⚠️ **AND THE PROMPT IS ALREADY MOSTLY GUARDRAILS.** That file is thick with rules stopping the model
distorting facts the engine already has right — *don't use today's elevation as a stand-in for race
terrain*, *only mention course_profile if it exists*, *every number must appear in DATA*. When the
scaffolding is that heavy, the deterministic layer should own more of the sentence. All of it
disappears with the model call, along with one more thing that breaks when API credit runs out.

**Before building:** load the `dataviz` skill — which two or three charts earn the space, and what the
short computed label under each says, is the actual design work. Not freestyle chart code.

**Related, also parked:** `course-strategy` is the other live output-LLM of this kind. Its geometry is
already pure math (`segmentCourseFromProfile` — grade windows, hysteresis, merges); the model only
groups adjacent segments and writes cues. The grouping is rule-able; the cues are the real writing.
Judged the weaker target of the two — more work, less gain.

---

## ✅ CLOSED 2026-08-02 NIGHT — THE LAST TWO COPY PUSHES (confirmed on screen)

All three checked on the running app. Nothing outstanding here.

- [x] **Planned reads at Completed's luminosity** (`8483f083`) — confirmed 2026-08-02 on a three-set
      **Box Jump** row (Sat Aug 1), where all three levels appear at once: Planned and Completed sit
      at the same brightness, Previous stays clearly dimmer. Reads as two halves of one row with
      context behind them, which was the intent. **Previous deliberately stays at 50%** — levelling
      all three would make the row read as three equal prescriptions.
- [x] **Assistance rows say the word "Planned"** (`8483f083`) — confirmed. `Dips  Planned 25 total ·
      by feel`, no Planned column, `25 of 25 reps` under the sets.
- [x] **The swap sentence at 14px/80%** (`ac536a99`) — confirmed on **Tue Jul 28** (Overhead Press
      day), sitting directly under `COMPLETED 3 of 4` at full readable size: *"Chin Up filled the Face
      Pull slot. Vertical pulling instead of horizontal pulling — same session, different stimulus."*
      ⚠️ The punch-list draft said *"Dips filled the Face Pull slot"* — that was a different session's
      swap. The sentence is generated per session, so the exercise name changes; the line itself is
      the same one. It is DETERMINISTIC (`_shared/strength/substitution-note.ts`), not model prose.
      ⛔ **This screen is also where [Q-249] is now visible in a single glance** — the row header says
      `Band Face Pulls → Chin Up` while the sentence above says "the Face Pull slot." Parked, needs
      Michael, do not fix.

**Already confirmed by him tonight:** the assistance totals, the collapsed swap row, `4 of 4`, and the
strength LLM deletion (*"looks good"* — nothing changed on screen, which was the pass condition).

---

## ⏳ AWAITING MICHAEL — THE STRENGTH ROWS AFTER [D-373] + [D-374] (2026-08-02 night, deployed + pushed)

Server side is **verified in the payload** (Hip Thrust and Barbell Row returned empty verdicts, the
four main lifts unchanged). The **client filter is pushed but not seen on a device** — Netlify has to
build, and the last screenshot of the night was still the old payload.

- [ ] **Open State → the strength row → "from your logged sets".** It should now list **main lifts
      only** — Squat, Deadlift, Bench Press, Overhead Press — and the count beside the header should
      drop (it read `· 5 lifts` with accessories in it). ⛔ **No red "back off weight" anywhere**, on
      any row.
- [ ] **Check the count reads sensibly** when fewer than four main lifts have enough sessions — the
      section hides entirely at zero rather than rendering an empty box.
- [ ] ⚠️ **Hip Thrust and Barbell Row are now simply absent from that section.** That is [D-374] and it
      is deliberate — the column is *"Working ~X vs your Y baseline"* and there is no tested max for
      them. **If their absence feels wrong, that is [Q-253], not a regression** — the answer is a
      different frame for accessories (their own history), not putting them back in this one.

**Also unverified on a device tonight:** the State performance section itself was restored by hand
after [Q-252] blanked it. It came back with all four cards in the payload — **worth one look that run,
ride, swim and strength are all actually on screen.**

---

## ⏳ AWAITING MICHAEL — THE LAST PUSH OF 2026-08-02 (client only, unseen)

- [ ] **Chip subtitles must not break through a value** (`5eb0b0ce`). "typically 68–117" was wrapping
      with "117" alone on the last line. The value line is now nowrap and the numbers inside subtitles
      are joined by non-breaking spaces, so words wrap around them and figures cannot be cut in half.
      ⚠️ Client only — no function deploy. Just needs a look.

---

## ✅ VERIFIED ON DEVICE — THE SESSION SCREEN, BOTH ENDURANCE SPORTS (2026-08-02, Michael reading it live)

Michael confirmed all of this on a device across the afternoon. Kept as the record of what was checked.

- [x] **Three numbers, no blends:** `Workload · Duration · Easy/Power`. Execution gone (it was the other
      two averaged); TSS gone from the ride (a run has none, and the two disagreed by a quarter).
- [x] **Workload carries the athlete's own band** — "typically 68–117". Never a verdict. No band under
      five sessions.
- [x] **An easy session is judged on heart rate**, as time under a ceiling, gated on plan intent. A
      tempo run is no longer graded against the easy ceiling.
- [x] **One verdict per session** — the green pace badge comes off an easy row; the prescription and the
      executed pace both still render.
- [x] **"Steady", not "Interval 1"**, on a single-block session.
- [x] **One temperature per screen** — `79 → 84°F` in the header, Insights and Terrain together.
- [x] **The bike mirrors the run** — *"Prescribed easy, ridden at threshold — 9 of 64 minutes stayed
      under your 131 bpm ceiling"*, conditions as load with RPE, a Pacing row on an unstructured ride,
      heart rate as its own row and **absent** on a hard ride.
- [x] **A confounded run makes no heart-rate claim** — the paragraph states the shape and lets the heat
      carry the cause.

---

## ⏸ PARKED — POLISH, NOT NOW (2026-08-02, Michael: *"thats a polish once things are working"*)

- [ ] **Should the app notice "I keep failing to hit my intervals" and say so?**
      The old coach rule that did something like this was **deleted** 2026-08-02 — it read a blended
      duration+intensity average and returned "dial back intensity for 24-48h", a verdict about the
      BODY that State owns (same violation D-363 closed on the session screen). Nothing is broken by
      its absence; the concern it half-served is a **new feature**, not a repair.
      ⚠️ If it ever returns: it belongs in **State**, not the coach's weekly read, and it needs a
      **fresh threshold**. The old bars (65 / 70 / 75, per methodology in
      `coach/methodologies/*.ts`) were fitted to the blended number and no longer measure what they
      were set against. `min_execution_score_ok` is now **unread** — leave it or remove it in the
      cleanup sweep; it is part of a published config shape.

---

## ✅ VERIFIED ON DEVICE — THE BODY + STATE REBUILD (2026-08-01 evening, Michael)

**Michael confirmed these on a device 2026-08-01.** Kept as the record of what was checked — the copy
was all Claude-written and one invented verdict word had already shipped that day, so "seen and
accepted" is the meaningful state, not "deployed".

- [x] **BODY is ONE row.** No "Heart-rate response". No "Cross-training". Just **What you've logged**.
- [x] It reads roughly: *"Effort about as usual: 3.6 of 10 avg vs 3.8 typical. Soreness normal for you:
      2.1 of 7. Logged on 4 sessions."* ⚠️ **Both numbers should carry their scale** (of 10, of 7).
- [x] **If soreness has fewer than 5 logged entries** it should SAY so — *"Soreness needs 5 logged
      sessions to read a normal; N so far"* — not silently vanish.
- [x] **The persistence line probably will NOT show**, and that is correct: it needs 4 of your last 6
      sessions above your own normal. If it does show, it reads *"Soreness above your normal on 4 of
      your last 6 sessions. Adjust ›"* and tapping opens the **Adjust** tab.
- [x] **RUN row now reads in plain language** ([D-356]): *"↓ Slower at the same effort −15%"* — a
      phrase, and a WHOLE percent (no tenths). `pace ~12:49/mi at 134 bpm` still there; heart rate
      stays with run.
- [x] **Tap the ⓘ on the run row** → *"About 15% less speed per heartbeat over 13 weeks (range −24%
      to −6%). Heat, fatigue, or a base block can all cause this."* ⚠️ **The range is the thing to
      check** — it should appear on EVERY state that shows a number, including the flat-arrow
      "Slower, now holding" one. If a number ever appears without a range, that is the bug.
- [x] **BIKE row is deliberately unchanged** — still wordless (arrow + number), because it has no
      confidence interval yet. Not an oversight.

**MEASURED, NOT SEEN:**
- [x] The first open after this deploy may take one extra beat while the cached payload refreshes.
      ⚠️ **If BODY still shows a heart-rate row after that, tell me** — that is the [D-355] cache trap
      recurring and it is not a copy problem.

---

## ✅ VERIFIED ON DEVICE — THE STRENGTH LOGGER (2026-08-01 evening, Michael: "it works")

**Michael walked these in a real Get Stronger session on 2026-08-01 and accepted them** ([D-351]
logger half, [D-352]). Kept as the record of what was checked. As with the State pass, the copy is
Claude-written — "seen and accepted", not a line-by-line copy review.

- [x] A **main lift** set card shows a bar-speed line under the "last:" anchor. Sets 1–2 read
      "Every rep at the same speed as the first"; the top set reads **"Grind it out. Stop before
      failure."** ⚠️ It should be legible, not grey-on-grey — that was the first complaint.
- [x] The open set reads **"AMRAP"**, not "all out" — placeholder and the "· 5 minimum" label.
- [x] **A Box Jump shows NO bar-speed cue**, no bar, no plate calculator, no weight box. Reps only.
- [x] **One** "Split these into as many sets as you need…" line sits **above** the accessory block —
      not inside a card, not repeated per exercise, and the exercise NAME is visible.
- [x] A chin-up's band control is a numeric **Assist (lb)** box, not Light/Moderate/Heavy.
- [x] **Single Leg Hip Thrust**: plain weight box, no 45 lb bar, no plate calculator.
- [x] Type reps into a set, do NOT tap Done, hit save → a prompt names that set and offers
      "Mark them done" / "Save without them".

---

## ✅ VERIFIED ON DEVICE — THE SESSION SCREEN PASS (2026-08-02, Michael reading it live)

Michael watched each of these land on his own screen through the night. **Higher confidence than usual
— but the last three pushes came after his final screenshot** (see AWAITING below).

- [x] The 2026-08-01 ride **attaches** to its planned Long Ride ("Ride — Long Ride", Unattach shown).
- [x] Execution chips on the ride: **37% Execution · 14% Easy · 59% Duration**, easy ceiling 131 bpm.
- [x] Insights leads with **"Ridden at threshold"** — the zone he actually rode, contradicting the
      "easy, all conversational" prescription, which is the point.
- [x] The ride tab is **four rows, not nine**; fatigue is gone from it.
- [x] **958 ft on BOTH tabs** (was 958 on Details, 942 on Performance).
- [x] The **heart-rate-at-easy-power card no longer renders on this ride** — the trend discards
      threshold rides, so the card must not print the number ([D-363] §2).

## ⏳ AWAITING MICHAEL — THE LAST THREE PUSHES (2026-08-02)

Landed after his final screenshot; a reload is needed for all three.

- [ ] **Easy chip is ONE line:** `131 bpm · est. from your max HR` (was two lines, which is what knocked
      the chip row out of alignment).
- [ ] **Chip row is flush** — 14% level with 37% and 59%.
- [ ] **Recompute analysis sits at the right end of the stat line** (`15.7 mi · 1:04:00 · 81°F`), not on
      a row of its own.
- [ ] **The 28 Jul run shows chips** — 84% Execution / 78% Duration. It was hidden because a ≥30%
      distance deviation flipped `assessed_against` to 'actual'. ⚠️ **If it still shows nothing, that is
      a real bug** and the guard is not the only thing suppressing it.
- [ ] **The easy-power card reads three lines**, ending *"Lower over time means fitter — this feeds your
      bike read on State"*, with no "easy ceiling" line (two different "easy"s collided).

## ✅ VERIFIED ON DEVICE — THE FTP CHOICE (2026-08-01 late, Michael)

- [x] **Two pills under the FTP field** — *Use my rides 176 W* / *Use my number 181 W* ([D-360], closes
      [Q-240]). Typed 181, "Use my number" went active, **Z2 moved 97–132 W → 100–136 W**; switching back
      returned it. The choice reaches the zone maths.
- [x] **The FTP field is editable.** It used to render the LEARNED value, so backspacing snapped back.

## ⏳ AWAITING MICHAEL — THE BIKE ROW'S OTHER TWO STATES (2026-08-01 late)

**Only the BUILDING state has ever rendered** — `6 rides in 8 weeks · newest today`, which is the new
8-ride floor working as designed, not a fault. The other two need data that does not exist yet.

- [ ] **AEROBIC state** — needs 2 more qualifying easy rides (≥10 min in the Z2 band, no threshold-level
      effort in them). Should read `142 bpm at easy power → Holding steady`, with
      *"No hard efforts yet, so there is no threshold read"* under it — **tappable**, revealing which ride
      types record a 20-min max.
- [ ] **THRESHOLD state** — needs any threshold / sweet-spot / tempo / climbing ride, then 8 of them.
      Should read `212 W threshold ↑ +3%`.
- [ ] **Performance, on a completed ride:** the block reads **"Heart rate at easy power"** (was "Aerobic
      efficiency") and carries *"Counts toward your bike read on State"*.
- [ ] ⚠️ **If any bike row shows a number with no range or a direction off fewer than 8 rides**, the
      payload did not refresh — that is the [D-355] cache trap, not a copy problem.

## ▶ FILED TONIGHT, NOT INVESTIGATED (2026-08-01)

- [ ] ⛔ **THE ATTACH FAILURE — the next session's job.** Evening Ride 2026-08-01 19:54 did not attach to
      the planned Long Ride; the detail screen offers **Attach**. Unattached = no planned-vs-executed and
      it drops out of adherence. See the ENGINE-STATE banner.
- [ ] **`Workload 86` reads as TSS** on the ride readouts (Garmin showed TSS 66.3 for the same ride).
      Different unit, sitting in a grid of power numbers. Label problem, not a maths problem.
- [ ] **Our power is ~1.5% under Garmin's on the same ride** — avg 113 vs 115 W, NP 141 vs 143 W, while
      max power matches EXACTLY (424 W). Same file, slightly different handling — likely the start of the
      ride or zero-power samples.
- [ ] **The ±2.0% bike verdict band is the soft number now**, not the floor — it sits at or below the
      measurement error of its own substrate ([D-359] §2).
- [ ] **Swim and strength may report absences the way bike used to** ([D-359] §3). ⚠️ Michael has not
      ruled on this — ask before building.

## ⏳ AWAITING MICHAEL — DEPLOYED + ON THE PHONE, NOT YET SEEN (2026-08-01)

**Everything below is pushed, deployed and synced to iOS. None of it has been seen on a device.**
A green suite proves the code is right, not that it is doing the right thing on a screen. ⚠️ **The
LOGGER half of this block was verified on 2026-08-01 and has moved above — what is left is the
PERFORMANCE side, which that pass did not cover.**

**In PERFORMANCE (open a completed strength session):**
- [ ] Chin-ups and dips show **pounds**, not blanks.
- [ ] The delta row reads **"vs plan"**, not "Totals" — it sits above the real "Volume (lbs)" total
      and was being read as the session volume.
- [ ] A strength session carries a grey line naming the plan and week.
- [ ] The strength row on State reads "week N of M · build", with **no ↑/↓ chips per lift**.

**MEASURED, NOT SEEN — worth a sanity glance:**
- [ ] Log an assisted chin-up **with an assist number** → it should price BELOW a bodyweight set.
- [ ] Log a chin-up **with added weight** → it should price ABOVE a bodyweight set.
- [ ] ⚠️ First strength session opened after the deploy takes one extra beat while the cached
      payload refreshes. If a number still looks wrong *after* that, it is real.

---

## ⚠️ THREE LIVING DOCS ARE OVER THE CAP (measured 2026-08-01)

`CLAUDE.md`'s rule: **past ~150KB, move closed and superseded entries to the doc's `-ARCHIVE.md` and
leave a pointer.** Nothing is deleted; it stops being loaded. The 2026-07 split was a rescue; this is
the rule that was supposed to stop it recurring — and all three are past it again:

- [ ] **`DECISIONS-LOG.md` — 397 KB** (2.6× the cap). Archive candidates: everything superseded or
      closed below ~D-300.
- [ ] **`OPEN-QUESTIONS.md` — 297 KB** (2×). Archive candidates: every Q marked closed/resolved.
- [ ] **`ENGINE-STATE.md` — 192 KB.** Its Solid entries older than ~2026-07-20 belong in the archive
      that already exists for them.

⛔ **Do this as its own pass, not at the end of a session.** It is a bulk move across the three docs
a fresh session trusts most, and a botched split is worse than an oversized file — the failure mode
is a decision that silently stops existing. Grep-verify every `D-NNN`/`Q-NNN` still resolves after.

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
- [x] ✅ **DONE — the stamp is the NEWEST contributor.** `_shared/state-trend/assemble.ts:862` sets `asOfAgeDays = Math.min(...ages)` with the comment "⛔ NEWEST, not oldest"; `Math.max(...ages)` survives only as the separate `stalestAgeDays` field (`:863`). ⟨A31⟩ His run is 3d old, his bike 16d.
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
- [x] ✅ **DONE — `ios/debug.xcconfig` is committed** (landed in `16e320bf`); working tree clean. ⟨A31⟩

## ▶ NEXT UP — MAKE THE ALL-OUT REPS MOVE THE WEIGHT (2026-07-31)

**The rematerializer (Q-226), now unblocked.** It was parked because its input did not exist; D-338 made the all-out rep count a saved fact. Read the ENGINE-STATE banner first — it names the seam.

- [ ] ✅ **DONE — `verdictFrom95Set` is wired.** Called at `loading/cycle-verdicts.ts:116` → `verdictsForBlock` (`:197`) → `rematerialize-strength-block/index.ts:161`, which the client invokes at `StrengthLogger.tsx:4022` / `:6053`. ⟨A31⟩
- [x] ✅ **DONE — the verdicts are now SUPPLIED through the seam.** `strength-primary-plan.ts:1275-1276` passes `args.cycleVerdicts`, populated by `generate-strength-plan/index.ts:149` and `rematerialize-strength-block/index.ts:161`. ⟨A31⟩
- [x] ✅ **DONE — `rematerialize-strength-block` is that something.** It reads verdicts (`index.ts:161`) and rewrites the remaining cycles' working numbers (`:167`); the client calls it at `StrengthLogger.tsx:4022` / `:6053`. ⟨A31⟩
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
- [x] ✅ **DONE — `ios/debug.xcconfig` is committed** (landed in `16e320bf`). ⟨A31⟩



### ⛔ CITATION CORRECTIONS — found by the 2026-07-26 evidence sweep. Comments and athlete-facing strings; the RULES do not change.
- [x] ✅ **DONE 2026-07-26 — all five Petré sites corrected.** `schedule-session-constraints.ts:30-37`, `week-optimizer.ts:490-500`, `strength-primary-plan.ts:1421`. Robineau 2016 + Schumann 2022 now carry the gaps; the rules are unchanged. **Petré 2021 is cited for a clearance rule it says nothing about.** ⟨A31⟩ It is a strength-development meta by training status. **Five sites:** `_shared/schedule-session-constraints.ts:28` (the single law), `_shared/week-optimizer.ts:484`, `:486` (⛔ cites it for *"the AMPK/mTOR interference"* — a claim **D-324 already STRUCK**), `:657` (⚠️ **athlete-facing narration**), `shared/strength-system/strength-primary-plan.ts:460` (⚠️ **athlete-facing**). Replace with Robineau 2016 + Schumann 2022 same-session. ⛔ **`week-optimizer.anchor-contract.test.ts:679` PINS these strings and will fail until updated — that is the guardrail working.** ⚠️ **Two sites are on the RACE path; this is not strength-only.**
- [x] ✅ **DONE 2026-07-26.** `shared/strength-system/place-week.ts:82-89` now states 24h is the target and 6h the fallback; `MIN_STACK_GAP_H = 6` unchanged at `:106`. **`place-week.ts` said 6h and 24h "performed the same as each other."** ⟨A31⟩ True for the strength outcome, **false for the aerobic one** — Robineau's VO2peak was higher at 24h than at 0h *or* 6h. ⛔ **`MIN_STACK_GAP_H = 6` does NOT change**; the comment does. **24h is the target, 6h is the fallback.**
- [x] ✅ **DONE 2026-07-26 — re-worded, citation stripped.** `strength-primary-plan.ts:1421-1428` states the reasoning with no source attached and forbids re-attaching one without a lift+easy-run trial. **The line told the athlete back-to-back is fine on a lift + easy-run day** ⟨A31⟩ — that is Robineau's 0h arm, the worst one. Probably still right (an *easy* run is not a second hard session), but it is **no longer sourced.** Re-word or re-source.
- [ ] **Spiering is understated everywhere it appears as "4–8 weeks."** Actual: **15 weeks endurance on 2 sessions/wk, 32 weeks strength on 1 session of 1 set.** Corrected in the doctrine; check `SCIENCE-*` docs.

### ▶ NEXT UP — D-325 / D-326, spec'd 2026-07-25 late, NOT built
- [ ] **⛔ D-325 STEP 0, BLOCKING — reconcile the penalty table against the law.** Amended 2026-07-26: interference is **DIRECTIONAL**, penalties are **ordered pairs**, and `_shared/schedule-session-constraints.ts` **remains the single law** — the penalty table is a *rendering* of it into costs, never a second ranking. ⛔ **Do not start the scorer before this.** The old symmetric table priced the law's strictest clearance (bike quality 48h after heavy lower, `:374`) as its cheapest row. The law is also what the race optimizer reads — forking it re-ranks physiology on one side of the app only.
- [ ] **D-325 — Session Cost Ledger + Penalty Scheduler.** Full contract in DECISIONS-LOG (read the **AMENDED 2026-07-26** block first — eight changes). Build order: the ledger + scorer as a PURE module with tests first (cost table, ceilings, reconciler deltas, **directional** penalty scoring, **ranked** breach output) — nothing touches the composer until that is green. Then it takes over placement from the **hardcoded Mon/Tue/Thu/Fri grid**, which is the real outlier. ⚠️ Blocked-adjacent: **Q-205** (two of the three emphasis ceilings are unvalidated). ⛔ **Keep `place-week.ts`'s `compromises[]` contract** — the original rationale for retiring it was retracted; it never had walls.
- [ ] **The hard-day trade is UNSPOKEN and the state is already reachable.** An athlete declines the hard day today simply by not picking one, and the app says nothing about what that costs. ⛔ **Copy is written and approved — `DOCTRINE-aerobic-maintenance.md` §5.0.3.** Two options at the hard-day pick, plus *"This block builds strength, not explosive speed"* near the goal card (the one promise Schumann's −0.28 explosive-strength effect forbids). ⚠️ *"Want full bro? Skip the hard sessions."* is a **deliberate COPY-VOICE rule 10 bend, Michael's call** — second line under "No hard day", **never its own moment**; do not clean it into house voice. ⚠️ *"comes back when the running does"* is reused verbatim from the volume screen — reword in both places or neither.
- [ ] **THE DOWNSTREAM BAR — the athlete-facing half, and none of it exists.** Michael: *"build the downstream bar — react to the user — gate the ability to build a crazy weekly schedule."* Intake reacts as quality options are taken; the axis arithmetic shows **before** acceptance, not after; a week the app won't defend needs an explicit confirm. Today the intake collects a hard day per discipline and says nothing back about what they cost together. ⚠️ **Bike VO2 alone is LEGAL (12/7/9) — the bar must not refuse a feature that already shipped into intake.**
- [ ] **D-326 — per-set difficulty replaces the RIR prompt** (top set only, three words on the complete tap, "Select difficulty to mark done"). Three files: `StrengthLogger.tsx` (the control + set field), `compute-facts` (aggregate into `strength_facts`), and the reconciler's `BodyTrends.strength` input. **No DB migration** — sets already persist as JSON. ⛔ It must never reach `brzycki1RM`, never auto-fill, and blank stays legal.
- [~] **D-326 layer 1 — the difficulty tap: CLIENT DONE, server half NOT started.** Top set only, three words on the complete tap, `topSetIndex` extracted + 11 tests, value persists in `strength_exercises` (no migration). ⛔ **Nothing reads it yet.** The server half is NOT a port — see D-326's "the server half is not a port": the existing signal is actual-vs-prescribed and difficulty has no prescription; a raw slope flags everyone every cycle (compare like-for-like, week-3-vs-week-3); and re-including `BodyTrends.strength` before those two are solved reinstates the D-318 false-strain bug on a new input.
- [ ] **Wire `verdictFrom95Set` into the advance path** (D-326 layer 2). `wendler-531.ts:454` (`verdictFrom95Set`) / `:467` (`applyVerdict`) are now WIRED via `loading/cycle-verdicts.ts:116`; `workingNumberForCycle` at `wendler-531.ts:210` still advances by calendar only on the FORECAST path (`unknownMeans: 'advance'`). ⟨A31⟩ This is what stops the gauge grading its own homework.
- [ ] **Render e1RM provenance** (D-326 layer 3) — *earned at week 3, unmeasured since*, never a bare number. Reuse the run-side learned-vs-entered pattern; do not invent a second vocabulary. ⛔ The blindness is NOT closed until layers 1-3 all ship.
- [ ] **Wire `place-week.ts` / settle placement authority** — superseded in FORM by D-325 §6 (its walls become penalties) but the underlying job is the same and still open. Three claimants today; see `ARCH-strength-spine.md` §0.6.
- [x] ✅ **DONE 2026-07-26 — the second pin ships.** `create-goal-and-materialize-plan/index.ts:2589-2604` forwards the picked hard day as `hard_day: { day, discipline }` from `quality_run` / `quality_bike` (D-327 makes them mutually exclusive at intake). ⟨A31⟩

### 🔥 BACK BURNER — filed 2026-07-25, Michael's call to defer
- [ ] **A one-shot dialog on the SECOND hard conditioning day.** Michael's line: *"we can hand you the keys to the Porsche, but it's up to you how you handle the curves on Mulholland."* ⛔ **THE TRIGGER IS GONE.** `NonRaceBuilder.tsx:131` records that `TWO_HARD_DAYS_LINE` and the Mulholland dialog were REMOVED 2026-07-26 by D-327, which makes two hard days mutually exclusive at intake. This item needs re-scoping against D-327 before anyone starts it. ⟨A31⟩ ⚠️ Two of Michael's own rules pull against it and he should see them before it ships: *"gate it, don't warn it — no accept-the-risk button"* (a dialog whose only action is Continue **is** that button), and `COPY-VOICE.md` rule 10 bans idioms/metaphor outright. Neither is fatal — this is his rule to bend — but they are the reason it was not built the same night it was asked for.

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
- [ ] **Q-194 — one SHARED banned-word enforcer.** `intent_summary` (`coach/index.ts:5522`) is now POSITION ONLY — plan name + week N of M, synopsis hard-nulled at `:5545` — so the live "body is ready, stay consistent" is gone (v121). What remains unenforced is `marathon-readiness` (`:273`, `:296`, which also carry imperatives). ⟨A31⟩ ⛔ Needs Michael's replacement wording, not a silent edit.
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
  **Status: BUILT, TESTED, NEVER EXECUTED ONCE.** The rule set ships (`_shared/week-optimizer.ts:412-417`, same-day QR+lower at `:1215-1291`), the fixtures pass (`week-optimizer.anchor-contract.test.ts:1057-1099`, `consolidated-trade-off.test.ts`), the spec exists (`docs/CONSOLIDATED-MODE.md`, decisions LOCKED), and the server threads the field (`_shared/combined-schedule-prefs.ts:303` → `reconcile-athlete-state-week-optimizer.ts:206`). **But no wizard ever writes `integration_mode`**, so `create-goal-and-materialize-plan/index.ts:1921` resolves it from `freshCombinedPrefs` and falls through to `'separated'` for everyone. ⟨A31⟩ **The job: one wizard question + the payload leg.** Nothing else.
- [ ] **The day-count gate.**
  **What it does:** stops the wizard from silently accepting an **impossible week**. You say *"4 days, 10 hours, hard intent, lots of strength"* — it does the math against the required session count and the 24h spacing rules, and either warns you or refuses **and shows you the arithmetic**. Today the wizard just says yes and builds you something that can't fit.
  **Status: BUILT, 30+ TESTS, ZERO IMPORTERS.** `src/lib/day-count-gate.ts:237 computeDayCountGate` is complete (260 lines, spec at `docs/DAY-COUNT-GATES.md`) and **nothing in the app imports it.** `session-frequency-defaults.ts:305` already emits `gate_block: 'hours_too_high_for_days'` straight into it, and it never reaches a refusal path. **The job: mount it in the wizard + write the warn/block copy.** *(Collapses 5 old items into one.)*
  ⚠️ **DEPENDENCY: this ships AFTER consolidated mode.** The gate's matrix has "Consolidated" cells that key on `integration_mode` (`DAY-COUNT-GATES.md §0`). **Do them in that order.**
- [ ] **The segment engine.**
  **What it does:** *"am I getting faster on this stretch?"* It spots the chunks of road you actually run repeatedly — a **"core"** is a recurring stretch, not a whole route — and tracks whether you're improving on it. Your own personal segments. *(It deliberately supersedes the earlier per-**route** approach, which flip-flopped on real data — said "improving" one week and "declining" the next. See `DESIGN-segments.md §0`.)*
  **Status: BUILT, SPINE-WIRED, STARVED AT THE SOURCE.** `detect-cores` has **zero callers** — no cron, no button, no script. So `route_cores` is always empty, `match-cores` (`compute-facts:1979`) and `compute-core-verdict` (`compute-snapshot:1221`) have nothing to match, and `build.ts:972 segment_verdicts` is always `[]`. ⟨A31⟩ **The whole feature produces nothing, on web and on iOS.** *(So the queued `npm run ios` rebuild would NOT have surfaced the segment card — fix the caller first.)* **The job: invoke stage 1.**

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
  - **State:** *"Easy — **aerobic base needs work**"* (`state-trend/run.ts:186`, pure decoupling >5%) ⟨A31⟩ ❌ blind
  - **`off-plan-banner.ts:33`:** *"On plan — strength on track"* ⟨A31⟩ — while he ran **zero** of two planned runs ❌ blind
  **SUPERSEDED — the grep now hits.** `per_discipline_posture` is read at `_shared/state-trend/posture.ts:5/:37`, `assemble.ts:196`, and `coach/index.ts:2523/:3959/:5436`. The verdict engine is posture-aware on those paths; re-scope this item to whatever is left. ⟨A31⟩ The verdict engine grades a `maintain` discipline exactly as it grades a `develop` one. And the 7.8% decoupling driving the scolding is **`as of Jun 27` — 16 days stale.**
  **This is the same shape as Garmin calling him "Unproductive"** — and `PRODUCT-POSITIONING-v2-DRAFT` opens on exactly that. **Efforts asked, stored the answer, and judged him on the axis he told it to deprioritize anyway.**
  ⛔ **THIS REFRAMES THE POSTURE FLAG.** It is not a banner and it is not a new feature — **it is making the verdict engine posture-aware at runtime.** The banner is the smallest part. **Do NOT ship the flag first:** a posture-aware banner sitting above a posture-blind verdict is not continuity, it is a third opinion.
- [x] ✅ **CLOSED 2026-07-13 — Q-177's signal is RETIRED, both consumers dead.** `_shared/longitudinal-signals.ts:146` retired the `strength_volume_trend` signals (`:169`: "read by nothing"); `compute-snapshot/index.ts:524` removed the `structuralDirection` fallback. Kept as the root-cause record. ⟨A31⟩ *(Found 2026-07-13 **by opening the app on a Monday**. The code audit missed it completely.)*
  On screen, simultaneously: **`STRENGTH · Volume · steady`** (the spine, correct) and **`SIGNAL: Strength volume well below recent baseline (-64.4% vs chronic)`** (a top-severity nudge with a "Review with Arc" button). Two engines, one fact, one screen.
  **Why it cannot not fire:** `compute-snapshot:445` compares `current.strengthVolume` — a **cumulative SUM of the CURRENT week** (`:117/:183`, `targetWeek = mondayOfToday()`) — against the **average of COMPLETE prior weeks**. On a Monday with 1 of 4 sessions done that is **≈ −75%**. `longitudinal-signals.ts:148` fires `warning` at `< -12` and **`concern` at `< -22`**. **It measures what day you looked, not what you did**, then decays to nothing by Sunday and re-arms.
  ⚠️ **Second consumer, latent:** `compute-snapshot:507` — `structuralDirection` falls back to this artifact when top-lift e1RM is absent, and feeds **`interferenceScore`**. For an athlete with no lift history, **a Monday makes the app believe their strength is declining, and call it interference.**
  **This is "the score that lies", live.** Cheapest Law-1 fix: **delete the signal**; the spine's 6-week per-workout volume trend is already the single source and it was right. **Do not just widen the threshold — that hides a structural artifact behind a magic number.**
- [ ] **🔴 Q-178 (= Q-076, ROOT-CAUSED) — A SKIPPED EXERCISE COUNTS AS PERFORMED, AND THE NARRATIVE ASSERTS THE OPPOSITE OF WHAT HAPPENED.** *(Found 2026-07-13 **by opening a completed workout**. Q-076 had sat unverified since June — the only screenshot was blank. **Here is the repro.**)*
  **Mon 2026-07-13, Upper A:** bench 4 of 5 sets (−600 lb), **Farmers Carry 0 of 3 sets** (set 2 logged as **`0 reps (RIR 3)`**). The app said **`EXECUTION 98% · Strong`** and *"Sets landed on target across all three lifts, with loads held to plan."*
  **FIXED 2026-07-13.** The predicate moved to `_shared/strength/performed-set.ts:47` and the `completed === true ||` short-circuit is GONE — a set is performed only if reps/weight/duration carry real work. Kept here as the root-cause record. ⟨A31⟩ A 0-rep / 0-weight / 0-duration set reads as PERFORMED → the exercise **matches** → D-208's 30%-weighted exercise-completion term (`:1337`) pays out in full for an exercise that never happened.
  🔴 **The narrative is the real damage.** The LLM is not hallucinating — **it is handed a fact packet that already says the exercise was performed.** `narrative-core/validate.ts` validates prose against the FACTS, so **it cannot catch a lie that is already IN the facts.** The whole LLM-containment strategy is sound and **only as honest as the packet.** Corrupt the packet and the guard becomes a laundering step.
  **Fix:** a set with `reps === 0 && !weight && !duration` is **not performed**, whatever the flag says. And the logger must not write an RIR onto a zero-rep set. ⚠️ **Read D-204 first** — the predicate was deliberately centralized out of 6 copies. Change the predicate, not the call sites.
- [x] ✅ **CLOSED — the auto-write was DELETED.** `adapt-plan/index.ts:1118` ("THE APP NO LONGER AUTO-CHANGES THE ATHLETE'S WORKING WEIGHT — consent-first") and `:1160` ("⛔ DO NOT RE-ADD AN AUTO-WRITE HERE"). The auto path now only re-lays-out the week; load changes ride the athlete-gated `suggest` path. ⟨A31⟩ Meanwhile the consent path (`StrengthAdjustmentModal`, mounted at `StateTab.tsx:1370`) asks permission for a thing already done. **This silently violates the standing rule that any change to prescribed load or RIR is sign-off-gated**, and it means §8's "GATED — changes prescription" Steps 4/5 describe a door **already ajar**. ✅ **Michael wants the athlete option (mirror the easy-pace chooser).** One writer; default = today's behaviour; visible; overridable. **This is the #1 live item.**
- [ ] **🔴 THE RPE TREND IS AN ORDERING ARTIFACT (Q-167).** `makeTrend` (`_shared/athlete-snapshot/body-response.ts:323`) ⟨A31⟩ splits **this week's** sessions in half **by the order they happened**. Hard Monday + easy Friday reads *improving*; swap the days and the identical week reads *declining*. **It is the required strong-evidence leg for the safety floor** (`load-status-reconcile.ts:83-95`, D-266). Establish intent before touching (Q-121 precedent).
- [ ] **🔴 ONE ACWR BAND (Q-168).** The *ratio* is single-source and clean. The *band* is re-derived in **6 places**, one plan-blind and shipping in the same payload as the real one (`_shared/response-model/weekly.ts:313`). **A taper week at 1.15 reads `elevated` and `optimal` simultaneously.** Also: `load_status` is mutated a second time *after* the reconciler (`coach:3814`, coupled to LLM availability); the State headline has **no `productive` branch** (`load-headline.ts:42-48`, `stateSlot`) ⟨A31⟩ so a productive week silently drops the load slot.
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
- [ ] **🟡 FTP bypasses the resolver in 8 places** — `get-week:436` (week-view watts), `normalizer.ts:308/898/935` (plan watts), `PlanSelect.tsx:587`, `course-strategy:521`, ~~and `athlete-snapshot/identity.ts:67` → **the LLM prompt**~~ — ✅ **CLOSED:** `identity.ts:71` now routes through `resolveCurrentFtp`, so the LLM prompt speaks the same FTP as the screens. The remaining sites still bypass it. ⟨A31⟩ *(TRUTH-MAP says FTP is "CLOSED". It is not.)*
- [ ] **🟡 Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire only `compute-workout-summary` → **no `workout_facts`**. Zero contribution to ACWR while still counting toward `workload_total` — **the same snapshot row contradicts itself.** *(Latent for Michael: he ingests via Strava/Garmin, which take the full path. Fires for anyone using phone-recording or FIT import.)*

---

# 1b. THE ONBOARDING GATE — the app must stop inventing BEFORE it invites anyone in

**Michael's intent (2026-07-13):** a new-user flow to enter easy pace, 5K pace, FTP, 100y/m swim pace, and 1RMs for the major compounds — **as frictionless as possible**, with the option to let the app learn from their own testing instead.

> ### ⛔ THE FRICTIONLESS PATH IS THE DANGEROUS PATH. This is the gate, and it is not optional.
>
> **Today, when a user gives the app nothing, the app does not refuse. It INVENTS, and says nothing.**
> - squat / bench / deadlift 1RM = **135 lb**, OHP = **95 lb**, hip thrust = `max(75, deadlift × 0.55)` (`materialize-plan:3200-3215`) — **console log only** ⟨A31⟩
> - swim pace = **1:30/100** (`materialize-plan:2352`) — drives every swim `duration_s`
> - HR zones fall through to the **non-Friel** model above, whose threshold zone caps below a real LTHR
>
> **Every "LATENT" fracture above fires on exactly this user.** They are not separate work — **they are the onboarding blast radius.**
>
> **Law 2 says: measured ≠ inferred. When you don't know, SAY SO.** The pattern already exists and already ships honestly — the run-pace fallback tells the athlete: *"Run durations estimated at 10:00/mi until we learn your easy pace"* (`strength-primary-plan.ts:1185` → `src/components/GoalsScreen.tsx:1643`) ⟨A31⟩. **Copy it. It is the only disclosed fallback in the app.**

- [ ] **Make the app refuse instead of invent** (strength 1RMs, swim pace, HR zones). Disclose, or decline and ask. **Gates everything below.**
- [ ] **The onboarding flow itself.** ⚠️ **Most of it is BUILT — this is a wiring job, not a build.** `OnboardingProfilePage.tsx` today collects **identity only** (birthday, gender, height, weight) and **never asks for a single performance number**. The performance numbers live on `TrainingBaselines.tsx`, and **nothing walks a new user there.**
- [ ] **The "let the app learn it" half is SHIPPED and working** — verified live on device: *"11:09/mi — pace at easy HR (5 runs; Friel Z2, at or below 89% of your threshold HR (151 bpm)) — as of Jul 13"*, with **the Q-174 chooser next to it**: `Use my runs 11:09` / `Use my number 11:30`. **That IS the "enter it, or let the app learn it" fork Michael is describing.** Reuse the mechanism; do not design a second one.
- [x] ✅ **REPLACED — Get Stronger now REFUSES rather than invents.** The in-plan `baselineTestWeek` is retired; `create-goal-and-materialize-plan/index.ts:2468-2475` reads all four barbell maxes via `readBarbellMaxes`/`missingBarbellLifts` and throws `missing_strength_baseline` naming each missing lift, sending the athlete to the Baselines test screen. ⟨A31⟩ Enter one, get no test week, and the other is invented.

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
- [ ] **Q-133 peel-back** — `buildRouteReadout` (`_shared/session-detail/build.ts:34`) is still called at `:965` ⟨A31⟩ and still emits `terrain.route`, now dead. `SessionNarrative.tsx:395` acknowledges the debt.
- [ ] **`load-headline.ts:45`** carries an unreachable `'building on plan'` branch ⟨A31⟩ for a label nothing can produce (D-246's artifact was deleted).
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
- [ ] **Q-038 — swim stays provisional.** `src/components/context/StatePerformanceSection.tsx:291` hardcodes `PROVISIONAL_PERF = new Set(['swim'])` ⟨A31⟩. Routing is now correct (`ingest-activity:1619`); needs **one live FORM→Strava swim re-ingest** to confirm and close.
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
  **SHIPPED (D-289/D-290).** `matchExercises` moved to `_shared/strength/match-exercises.ts` (imported `analyze-strength-workout:14`, called `:1408`) and now honours `substituted_for` (`:483`), emitting `substitutions` (`:1281`) via `_shared/strength/substitution-note.ts`. Device-verify only — see the 2026-07-13/14 block. ⟨A31⟩ So the planned lift reads as a **SKIP** (dragging the 30%-weighted exercise-completion term) **and** the work he actually did gets **zero credit** (`planned: null` → dropped from the denominator). **Penalised for what he didn't do; unpaid for what he did.**
  **SPEC: `docs/SPEC-exercise-substitution.md`.** The athlete declares the swap; the app stops docking and **names the trade** instead of scoring it. ⛔ Do NOT infer equivalence from the movement pattern — BSS is knee-dominant (`primaryRef: squat`), hip thrust is hip-dominant (`primaryRef: deadlift`). Ask, don't guess. **Sign-off gated.**
- [ ] **Strength → endurance interference signals** + **`endurance_load_context` population** (`analyze-strength-workout:2811`, still `null`) ⟨A31⟩. ⚠️ **These are ONE job** — the same `athlete_snapshot` fetch serves both. The substrate is already live (`compute-snapshot:512-522`).
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
- [ ] **STATE headline phrase bank** — the bounded-composition half **shipped** (`src/lib/load-headline.ts:82` `buildLoadHeadline`, tested) ⟨A31⟩. Remaining: the authored phrases only.

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
