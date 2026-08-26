# Punch-list archive — moved 2026-08-25 (the stale-orders sweep)

**Why these moved:** every block below is a device-verification checklist (or a closed record) for
screens and flows that were REBUILT after the block was written — the State readout rework
(2026-08-15), the Strong Focus intake rebuild (2026-08-18/19), the standing-plan pivot
(2026-08-21/22), and the Dial / opt-in / pins-win arc (2026-08-24/25). Checking them now would be
verifying screens that no longer exist. Michael approved the move 2026-08-25.

**Nothing was deleted.** Still-live items were lifted into the active list before the move:
the two watches on the rebuilt block (week-2 bench ME sanity, the ME set ladder), the marathon-flow
checks (2026-08-07 + the marathon-through-Race build from 2026-08-05), Q-261 (the Garmin hill
export — only a watch send can close it), the Single Leg RDL double-listing, the Spiering citation
correction, and the Q-186 / Q-187 watches. Everything else here is history: superseded, verified by
three-plus weeks of daily use, or describing UI that has since been replaced.

The active list: [`../POLISH-PUNCH-LIST.md`](../POLISH-PUNCH-LIST.md). The older archive
(202 completed items, pre-2026-07-13): [`POLISH-PUNCH-LIST-archive-2026-07-13.md`](POLISH-PUNCH-LIST-archive-2026-07-13.md).

---

## ⏳ SUPERSEDED — the first block's acceptance (2026-08-24, block since deleted + rebuilt)

He is ON the block (started 2026-08-24, test week live). What to look for:
- [x] **(2026-08-24 midday — SEEN ON DEVICE.)** Save **Test: Upper** → the sheet announced bench
      135×5 → 149 and overheadPress 90×6 → 102; weeks 2-12 filled. Three cosmetic/UX defects the
      save surfaced (Wendler cue leak, locked Saved! modal, raw lift keys on the sheet) were fixed,
      pushed and deployed the same hour — `8ea5e84c`, `ca4eabf6`. The modal + lift-name fixes only
      render on a FUTURE test-save; the cue fix shows on his next accessory workout.
- [ ] Week 2's bench ME weight should look like ~90% of (96% of ~157 est) ≈ mid-130s — sane, not
      a grinder.
- [ ] The ME set ladder: after two clean ME sessions on a pattern, the calendar's later weeks gain
      a second set. Watch it appear (or not) around week 4.
- [ ] Q-279..283 (export week-skip, "Taper" label, stale prefs echo, duplicate picks, session-B
      mutation pass) — logged, none block training.

## ⏳ AWAITING MICHAEL — THE STRONG FOCUS INTAKE (2026-08-19, PUSHED `9d49db9a`; four edge functions DEPLOYED `12:23`; **ZERO of it device-verified**)

**61 commits over 2026-08-18/19 rebuilding the Strong Focus intake.** Suites are green — 556
strength-system, 53 lib, 61/61 sweep shapes, TDZ clean, tsc 313 — and that is not the same claim.
**Two defects reached the device this session that the suites could not see**, so this list is what
a human still has to look at.

### The matrix Michael wrote, still unrun
1. **Card independence** — two hard days; toggle "club session" on the Run card; the Ride card must
   be entirely unaffected.
2. **Allocation swap** — tap "Set as top-end" on the Ride; the labels swap and the sport, day and
   club status stay anchored to their own cards.
3. **Schedule step** — two hard days must show TWO labelled day rows. Assign Run→Tue, Ride→Fri;
   tapping Friday must not overwrite Tuesday.
4. **Copy and tooltip** — option bodies read as one operational line; the (i) renders the
   eccentric-impact and 48-hour sections without blowing out the modal width.

### Added after that matrix was written
5. **Zero hard days** — the Schedule step should read *"No high intensity sessions in this block.
   Nothing to place."*, not an empty grid. New path, untested.
6. **Two of one sport** — two rides: both cards read "Ride", the first holds the top end, and the
   swap action appears only on the second.
7. **One session a week** — the new `1` on both pickers. A 1-run week builds ONE run; the helper line
   reads *"One run carries it all (~12 mi)."*
8. **The split lines** — set a long run day, then walk back: the line must recompute, never stale.
9. **Pull-up prompt** — turn the progression on with no max on file: *"Do one set to failure and
   enter your number."* It must vanish permanently once any number is entered, including 0.
10. **The DEFAULT tag** — two hard days, nothing allocated: the sustained card shows `DEFAULT`. Tap
    "Set as top-end" and it disappears.
11. **The 20-mile / one-hard-day bench session** — accessory rows at **30 total**, not 25. Fixture-
    verified, device-unverified. This is the [D-428] tier fix landing.

⚠️ **Known and unsaid on screen:** one run + one hard run builds ~3.5 mi against a 12-mile ask
([Q-274]).

---

## ⏳ AWAITING MICHAEL — THE STRONG FOCUS ACCEPTANCE RUN (2026-08-09, pushed + deployed, **NOT device-verified**)

> ⛔ **2026-08-13 — the assistance lines below are STALE.** [D-423]–[D-427] replaced the template
> assistance with per-day Forever picks (push/pull/single-leg-core daily, athlete-picked,
> equipment-gated; chins daily when the progression is on). Week-1 expectations like "press days
> finish on triceps" and "leg days leg · leg · abs with no chin-up" no longer describe what a new
> plan builds. The engine checks (week-4 deload, AMRAP → training-max card) still stand.

**D-404 → D-408 + Q-269. Five commits, 14 edge functions, zero device passes.** Held to the end on
purpose so it is ONE run rather than six — the full checklist is in the `NEXT SESSION` banner at the
top of `ENGINE-STATE.md`, which is the authoritative copy. In short:

**Build:** Strength Focus, 12 weeks, run · long run Sun · long ride Sat · hard day Thu (run, 3-min
hills) · a loadable push pick. Keep the hard day off the long-run day.

- [ ] **Intake** — anchor-held days grey out and say which anchor; tapping your own day releases it;
      the club night cannot land on the long-run day; third accessory dropdown is "Single-leg".
- [ ] **Week 1** — press days keep the pull pick and finish on triceps; leg days are leg · leg · abs
      with no chin-up; loadable accessories show a greyed overwritable weight, chins/dips blank.
- [ ] **Week 4** — Thursday is an easy run; endurance down ~⅓; strength 60 → 35 min.
- [ ] **End of week 4** — log the week-3 AMRAP, then the training-max card on the coach week tab.
      Tapping it is the only consent-gated write in the batch.

⚠️ **The 7 failing `triathlon_performance.conformance` tests are pre-existing** (verified with the
changes stashed) — not part of this run.

---

## ⏳ AWAITING MICHAEL — THE WIZARD VISUAL LANGUAGE + STRONG FOCUS (2026-08-07, pushed/deployed, **preview-verified only**)

[D-399], [D-400]. Confirmed in the browser preview, not on a device. One pass through Focus closes it:

- [ ] **Strong Focus flow** — Train → Strength Focus → Strong. The whole flow should read AMBER (CTA,
      progress bar, selected cards + chips). On "Your week": the Run/Ride hard-day toggle should be
      gold/green, the Runs count gold, the Rides count green; the block chrome amber.
- [ ] **Train card** is a **Gauge** dial (was the run pulse). **Focus heading** wears the eye sigil.
- [ ] **Marathon flow** still reads gold end to end after the restructure; the "Your week" card is
      anchors-only (run days "Auto"; only long run + standing session tappable).
- [ ] **Strength "Keep it heavy"** builds without crashing — the `LOWER_HYPERTROPHY` guard ([D-400])
      is deployed; this is the device confirmation of the fix.

---

## ⏳ AWAITING MICHAEL — THE STRENGTH BLOCK REBUILD + THE LAP-BUTTON HILL (2026-08-06, pushed + deployed, **NOT SEEN ON A DEVICE**)

Six commits (`a0d1baec` → `a5a1f19d`), [D-385]–[D-390]. Deployed: `generate-strength-plan`,
`materialize-plan`, `generate-run-plan`, `create-goal-and-materialize-plan`, `send-workout-to-garmin`.
⚠️ **Your CURRENT block is not rewritten by any of this** — it changes what new plans build.

> ⛔ **2026-08-13 — the assistance items below are STALE** (same [D-423]–[D-427] supersession as
> the top entry: per-day picks now, not templates). The Wendler-order, alternation, and naming
> checks still stand.

**Build a new Strong Focus plan and check:**

- [ ] **A press day carries a real push.** Bench or OHP, then a push, a pull, and abs — **50 reps
      each**, not 25. It used to be two pulls and no push, every time.
- [ ] **No leg work on bench or press days.** Squat day gets hip thrusts, deadlift day gets lunges —
      different patterns, so the two leg days no longer repeat.
- [ ] **The week opens Mon Press · Tue Deadlift · Thu Bench · Fri Squat** if you pin nothing. That is
      Wendler p.11 verbatim.
- [ ] **Runs and rides alternate** rather than the runs taking every open day and the rides stacking
      onto lifts. One rest day survives unless your own asks fill the week — and then it says so.
- [ ] **The plan is called "Strong Focus"**, and the lifting-days screen no longer promises a fourth
      day in week 3.
- [ ] ⛔ **THE ONE THAT NOTHING HERE CAN PROVE — [Q-261]. Send the hill session to your watch.** The
      descent should show **no countdown**, count **up**, and wait for you to press lap. There was no
      `OPEN` step in this codebase before 2026-08-06, so nothing local can verify Garmin accepts it.
      ⚠️ If it exports but the descent is a **1-second** rest, the fix at the interval builder's rest
      branch did not take.

⚠️ **Known and unfixed:** the hill session's planned duration excludes its open descents, so the
calendar under-reads it (~32 min for ~40) — [Q-259]. And an athlete with no 3-minute climb still gets
a session they cannot run — [Q-260], deliberately not patched.

---

## ⏳ AWAITING MICHAEL — THE FOCUS FRONT DOOR (2026-08-05, pushed + client-deployed, **NOT SEEN ON A DEVICE**)

Eight commits (`5634b4f3` → `8a0efcd7`), [D-382] / [D-383] / [D-384]. **Client only — no edge function
was touched, so there is no Supabase deploy in any of it.** Netlify builds off the push. See [Q-258].

- [ ] **Open Focus** (the tab is renamed from Goals, with an eye). Three cards: **Train · Race ·
      Build**, above them a "Start something new" label, and your running block under a **"Current"**
      label. Build is dashed and dark.
- [ ] **Tap Train.** Run / Ride / Strength / Athletic Focus, each in its discipline colour. ⛔ **Try to
      tap Run, Ride and Athletic — they should do nothing at all.** They are `disabled`, not just
      handler-less.
- [ ] **Tap Strength Focus →** Strong / Heavy / Definition. Heavy and Definition are dark. **Tap
      Strong** — it should drop you into the block exactly as it was, nothing changed.
- [ ] **Back out one screen at a time** — Strong → Strength → Train → the door → closes. It should
      never dump you straight out.
- [ ] ⚠️ **THE ONE THAT MATTERS — build a marathon through Race.** That path now seeds the goal on
      mount rather than on a tap. Confirm the race card is the first thing you see (no flash of the
      wrong screen) and that a plan actually builds. **Nobody has watched this work.**
- [ ] **"Plan a season"** is no longer on the Focus screen — it is at the foot of the race card. Confirm
      it still opens the season builder.

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
- [x] ✅ **CLOSED 2026-08-25 — the whole suite is green** (4357 passed, 0 failed, per the
      2026-08-25 ENGINE-STATE banner; the 2026-08-25 triage retired 8 stale pins and fixed 1 real bug).
- [x] ✅ **DONE — `ios/debug.xcconfig` is committed** (landed in `16e320bf`); working tree clean. ⟨A31⟩

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
- [x] ✅ **DONE 2026-08-25 — all three deleted** (they were untracked). ⚠️ ~100 other `scripts/_*.mjs`
      throwaway scripts remain, many also reading `.env` — bulk-delete is a separate call for Michael.

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

