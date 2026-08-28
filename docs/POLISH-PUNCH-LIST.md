# Efforts — the work queue

**Rebuilt 2026-07-13.** Every one of the 92 open items on the old list was **verified against code** (3 parallel readers). ~10 were already done, 4 were moot, 11 were "verify X" questions that now have answers, and 9 need Michael. The rest are real, and they are ordered below by leverage — not by the order they were filed.

**The full 133KB history (202 completed items + the originals) is in [`archive/POLISH-PUNCH-LIST-archive-2026-07-13.md`](archive/POLISH-PUNCH-LIST-archive-2026-07-13.md).**

**2026-08-25 stale-orders sweep:** the device-verify checklists from 2026-07-13 → 2026-08-09 (whose
screens were since rebuilt — readout rework 08-15, intake rebuild 08-18/19, standing-plan pivot
08-21/22, Dial/pins arc 08-24/25) moved to
[`archive/POLISH-PUNCH-LIST-archive-2026-08-25.md`](archive/POLISH-PUNCH-LIST-archive-2026-08-25.md).
Still-live items were lifted into the blocks below before the move; nothing was deleted.

Read `START-HERE.md` and `LIFECYCLE.md` first. **`CAPABILITY-MAP.md` is the anti-rebuild index — check it before building anything on this list.**

---

## ⏳ AWAITING MICHAEL — THE GEAR GATE (2026-08-26, PUSHED `64509824`, **DEPLOYED**; NOT DEVICE-VERIFIED)

- [x] **Deployed and verified against the API**, 2026-08-26 18:50:23 UTC (commit 18:30:28 UTC):
      `create-goal-and-materialize-plan` v368→**v369**, `generate-strength-plan` v157→**v158**,
      `rematerialize-standing-block` v32→**v33**, all ACTIVE. ⚠️ Versions were checked, not just
      timestamps — both changed files ride the `_shared` bundle, so a function whose VERSION had not
      moved would still be carrying the old tags.
- [ ] Client half (the two chips + the tags) lands via Netlify on the push. Confirm the build shipped.

**Then, on a device — none of this has been seen by a human. Deployed is not verified:**

- [ ] The equipment picker shows **"TRX / suspension trainer"** and **"Stability ball"** and both
      persist. ⚠️ The strings are matched by SUBSTRING in `athleteEquipmentToKeys`; renaming either
      silently removes the capability from every athlete who ticked it.
- [ ] A home gym that declares NEITHER is never handed `trx fallout`, `stir the pot` or
      `stability ball rollout`. That is the reported defect — *"should never be just prescribed."*
- [ ] A sled push / GHD sit-up / captain's chair raise never appears in a generated block. They are
      dropped from prescribing, **not** from the library — confirm they are still findable and
      loggable by an athlete who goes looking.
- [ ] A commercial-gym athlete now gets band and kettlebell work (`band face pulls`, swings, goblet
      squats). They were being ejected before this, unrelated to tonight's change.
- [ ] A one-hard-run + one-hard-ride week reads **"One of the hard sessions is on the bike"**, not
      "The hard sessions are on the bike".

**Suite/build state at handoff:** 4,445 deno tests passing, 0 failing. `tsc -p tsconfig.app.json` =
**316 errors, baseline 316**, none in any touched file. `npm run build` clean. ⛔ `tsc -p
tsconfig.json` checks ZERO files — a "clean" from it is a no-op.

**Known and ruled OFF the table, so nobody re-opens it:** the catalogue has no bodyweight arms
movement, so a pull-up-bar-only athlete gets an empty arms row and a floor that reports *"Could not
reach biceps, triceps."* Michael: entry-language (rack + bar minimum) is built last, so a
bodyweight-only kit is not a real case for this plan. Not a bug to fix now.

---

## ⏳ AWAITING MICHAEL — WEEK-2 WEIGHTS ON HIS LIVE BLOCK (2026-08-25)

⚠️ **STILL OPEN, AND STILL UNPROVEN EITHER WAY (noted 2026-08-28).** The same save path
(`StrengthLogger.tsx:4473` → `rematerialize-standing-block` with `apply: true`) has now been
exercised repeatedly across the 2026-08-27→28 logger arc with no further report of it failing, and
Michael has device-verified that arc. ⛔ **That is evidence, not proof** — nobody has watched week-2
weights appear from a save, which is the specific thing this item asks for. Leave it open.

The logger's save-time fill did not visibly fire on his Mon/Tue test saves. Deployed fallback:
- [ ] Open `/plans/admin` in the **web** app → **Check** → read the line → **Apply**.
- [ ] Then open week 2 Monday's ME Upper: bench shows a weight, not "By feel".
- [ ] If Check says `no_completed_test_sets`: report back — that's an attach failure
      (logged tests not linked to planned rows), needs a data look.

## QUEUED — STEP 8 CONFIRM SCREEN (Michael, 2026-08-25, "when we get to it")

- [~] **FIXED IN WORKING TREE 2026-08-26** (client only, not device-seen): `WeekGrid` colors each
      session name by sport via `getDisciplineColor`, same palette + same plyo-by-tag / ride→bike
      mappings as the master strip. Original ask: **Color-code the workouts by sport** on the step 8 week list (same sport colors as the
      master strip). Nothing is missing from the list — the sessions are all there, they just
      read as a wall of same-colored text (Michael corrected the earlier "missing sessions" read).

## ✅ DONE 2026-08-25 night — THE BUILT BLOCK'S ACCESSORY ROWS (all four checks passed in the audited plan export; see ENGINE-STATE banner)

**Deployed and version-verified** (`generate-strength-plan` v140, `rematerialize-standing-block` v18,
2026-08-25 10:44 UTC). The wizard screens are seen; **the BUILT WEEK is not.** Generate a Strength
Focus block and read the accessory rows:
- [x] **(2026-08-25 night — passed in the audited plan export.)** Core = his pick plus at most ONE
      complement.
- [x] **(2026-08-25 night — passed.)** The two "Isolation pull" rows hold DIFFERENT movements —
      rear delt fly (mon), barbell curl (thu).
- [x] **(2026-08-25 night — passed.)** The two "Single-leg" rows hold DIFFERENT movements —
      Bulgarian Split Squat (tue), Walking Lunge (fri).
- [x] **(2026-08-25 night — passed.)** The A-skip row asks reps only, no weight box.

⚠️ The Dial's extra rows carry **no day tag** — that is a decision (`DIAL_ROW_DAY_IS_THE_COMPOSERS`,
D-450), not a bug. The day is on the plan one screen later.

- [x] **(2026-08-25 — VERIFIED ON DEVICE.)** The endurance-week screen: opt-in model, add / X
      controls, block order, copy. **D-451 closed.**
- [x] **(2026-08-24/25 — the Dial WIZARD screen was seen.)** Seven-then-eight picks pre-filled with
      weekday tags, the Dial row and its chips, the Glutes sentence and row picker.

### ⛔ NEW STANDING ITEMS FROM THIS ARC (2026-08-25)

- [~] **The ME pull-up row prefilled "1" rep and read as "do 1 pull-up"** (Michael, 2026-08-25
      evening, previewing next week's ME: Upper). The prescription was correct — ME accessory pull,
      1-5 reps by feel, no weight (untested movements deliberately get no prescribed load,
      `compose.ts:874-889`) — the defect was the logger parsing the "1-5" band through a
      leading-digit match and prefilling every set at the band floor.
      **FIXED IN WORKING TREE 2026-08-25 (Michael: "lose that and give clear instruction") — NOT
      committed/pushed/device-verified.** Two changes, client only: (1) an auto-regulated rep-BAND
      row now opens with a blank reps cell (same contract as the rep-total row; the "target 1-5"
      label carries the band) — `StrengthLogger.tsx` `isRepBandRow`; (2) auto-regulated ME rows on a
      `standing_plan` session get their own title cue — *"Max-effort set — 1-5 reps close to your
      limit. Assistance if you need it, added weight if you don't. Stop short of failure."*
      (reworded same session — Michael: "add weight is the wrong cue"; the Assist/+ column runs
      both directions and the cue must too); (3) auto-regulated DE rows get *"Speed sets — move the
      bar fast and controlled, 2-4 reps. About 70-80% of your max: if the bar slows down, it's too
      heavy."* (`STANDING_DE_SET_CUE`, Viada p218/p219) — this one deliberately REPLACES the Wendler
      bar-speed line, which was leaking onto the close-grip card via its `MAIN_531_LIFTS` listing;
      priced/tested lifts keep the Wendler cue (`STANDING_ME_SET_CUE`,
      `strength-focus-copy.ts`, Viada p218/p219). Copy pin tests green; the one StrengthLogger tsc
      error pre-exists on HEAD. **Verify on the next ME: Upper open after a client deploy.**
      ⚠️ Ripple: standing-plan HYP accessory rows ("6-12") also open blank now instead of
      prefilling 6 — deliberate, same band-not-count rule; priced rows with `set_plan` unaffected.
      **Same session, the advance rule went into all three cues** (Michael: "they should know they
      can add"): ME "Top of the band with room to spare: go heavier next time"; DE "Still crisp
      every set: add a little next time"; accessory section line "Top of the band on every set: add
      weight, start the band over" — double progression, condition-gated, never calendar-driven.
      ⚠️ The 2026-08-24 pin banning "add weight" on the standing cue was SUPERSEDED by his call —
      the test now enforces condition-before-instruction instead (`strength-accessory-copy.test.ts`).
      ⛔ **Elevated to a standing rule (Michael, 2026-08-25): "Viada supersedes any historical bans
      or notes… it needs to be symbiotic with user honesty and deterministic record keeping."**
      Three parts, inseparable: (1) the book outranks older pins, copy bans and session notes — a
      losing pin gets a dated supersession note, never a workaround; (2) field-standard mechanics
      fill only what the book leaves open, and every fill is labeled OURS at the site
      (`standing-plan/progression.ts`'s HIS/OURS labeling is the pattern), never passed off as the
      book's; (3) the record stays deterministic — every prescription and cue traces to a page cite
      or a dated decision, and a later-surfaced page wins over our fill.
- [~] **The header X no longer deletes the exercise** (Michael, 2026-08-25: "where the x is makes
      it easy to delete the exercise"). FIXED IN WORKING TREE, client only: the bare X sat in the
      card header's prime tap zone beside the collapse chevron — one mis-tap from a prescribed
      lift. Deletion now lives at the FOOT of the expanded card as a labeled "Remove exercise"
      button (the core-work card's existing pattern; also where Strong/Hevy keep it), with
      `deleteExercise`'s confirm dialog retained as the second guard. Collapsed cards carry no
      delete affordance at all.
- [~] **The slot-notation notes boxes are hidden** (Michael, 2026-08-25: "these take up a lot of
      space dont use the abbreviations no one knows what they are"). Standing-plan rows prefill the
      athlete-notes box with the composer's internal slot text ("1 x ME: Accessory: primary pull")
      — a three-row jargon box under every card. FIXED IN WORKING TREE, client only: the box
      renders only for athlete-written notes (slot-pattern text suppresses it; any athlete edit
      brings it back). Data kept — the ME/DE cue detection reads it.
      ✅ **The server half is DONE 2026-08-26 (working tree; needs deploy):** the composer now
      writes `slot_intent` (data) + `source_row` (p246 provenance, never rendered) and no longer
      puts sourceText into `notes`; `materialize-plan` carries `slot_intent` through both
      whitelists; the logger's cue detection reads `slot_intent` first with the notes regex as the
      legacy fallback (Michael's live rows keep the old shape until a restate). Standing-plan
      suite 259/0 incl. fuzz; two pins updated to the field.
- [ ] **"Rest of plan" swaps on a standing block — WORK BY CONSTRUCTION, one device check owed**
      (2026-08-25, Michael: "swap used to let you make it permanent for the block — does it
      still?"). ⚠️ The first version of this entry claimed the standing pipeline was blind to swaps
      and a re-test would wipe them — **that was wrong**, corrected the same hour by the full trace.
      The truth: the swap lives ONLY in `plan_adjustments` (never persisted into
      `strength_exercises`), and `materialize-plan`'s expansion loop re-applies it fresh into
      `computed` on every run (`resolveSwap` at `:2154`/`:2483` — equipment sub first, athlete swap
      second, weight re-resolved from the new lift's own reference). Standing rows flow through that
      loop, `persistPlanSwap` ends by invoking materialize, AND `rematerialize-standing-block` ends
      by invoking materialize too — so a re-test apply RE-INJECTS the swap rather than wiping it,
      and the restater's name-matching is untouched because the planned rows keep the original
      names. The composer never needs to know; the two systems compose by design.
      **Owed: one device pass** — swap an accessory "Rest of plan" on the standing block, confirm a
      future week's logger shows the substitute, then (after the next re-test apply) confirm it
      survived. "Just today" swaps were never in question.
- [~] **BUILT IN WORKING TREE 2026-08-26** (client only, not device-seen): the logger now detects
      the trigger from the previous-session fetch (per-set reps + RIR were already there — a render
      job, as the trace note below suspected) and prints "Last time: 12 · 12 · 12 — top of the band
      with room to spare. Add weight." under the cue. Fires only on auto-regulated band rows, all
      sets at band top, no zero-reserve set; DE rows excluded (they advance on bar speed). The
      wording claims logged reserve only when it was logged.
      Original design note — **The advance nudge — the app detecting the trigger instead of only stating it** (designed
      2026-08-25, not built). "Top of the rep band at target RIR on every set" is computable from
      what the logger already stores (per-set reps + RIR); surfaced on the NEXT session's row as a
      one-line fact ("Last time: 12/12/12 with reps to spare — add weight"), it makes the
      double-progression rule self-executing. Deterministic, client-readable, no LLM. ⚠️ Trace
      first: what per-set history the "previous" column already fetches decides whether this is a
      render job or a data-plumbing job.

- [ ] **No mid-block "re-dial" control exists.** Endurance volume and hard sessions are answerable in
      the **wizard only**, so an athlete who wants to add a hard session in week 6 has nowhere to do
      it. This predates the opt-in work; what changed is that D-451's screen now advertises a choice
      the athlete cannot revisit. **Standing debt, now user-visible.**
- [ ] **`fillMuscleFloor` runs TWO searches over ONE candidate list** — the floor loop and the target
      loop, ~30 lines apart in `_shared/accessory-dosing/ledger.ts`. They have already drifted once:
      the hold fix landed on the floor loop and the target loop kept its own copy, so
      *"Plank — 3 x 30-45s"* survived a full round (D-450). **Cross-pointers exist at both sites; the
      merge was not done.** Drift risk, not a live defect.
- [ ] **DO NOT "FIX": day 5 carries two quad movements (Single-leg + Quad isolation) and day 2
      carries none.** Checked against p246 — **it is the book's own layout**, not a bug in the split.
      Recorded because the 2026-08-25 single-leg split makes it easy to mistake for one. If it is ever
      changed it is a training decision of Michael's, not a correction.

## ⏳ AWAITING MICHAEL — TOMORROW'S TEST: LOWER SAVE (2026-08-24 night; block REBUILT on the fixed engine)

The first block was deleted and rebuilt after the equipment-gate + computed-refresh fixes (see the
ENGINE-STATE banner). Monday's Test: Upper is attached to the new block. One save proves it all:
- [ ] Save **Test: Lower** (Tue) → all four lifts price weeks 2–12, and every future strength
      session opens with weights in the logger (bench ME ≈ 135). A blank box after this save is a
      real failure — screenshot it; start at `rematerialize-standing-block` (`computed_refreshed`).
- [ ] New block's accessories: dumbbell work in the small-muscle slots (no "reverse flyes
      (bodyweight)"), no lift twice under two spellings, his plural pick placed once.

Carried from the first (deleted) block's acceptance — they apply to the rebuilt block as he trains it:
- [ ] Week 2's bench ME weight should look like ~90% of (96% of ~157 est) ≈ mid-130s — sane, not
      a grinder.
- [ ] The ME set ladder: after two clean ME sessions on a pattern, the calendar's later weeks gain
      a second set. Watch it appear (or not) around week 4.

## ⏳ AWAITING MICHAEL — THE READOUT LANGUAGE (2026-08-15, PUSHED `905dd75f`→`30d04687`; `get-week` DEPLOYED; client on Netlify; **not device-verified**)

One day's UI campaign, driven live by Michael, all browser-verified only. What to eyeball on the phone:
- **Logger:** one strength orange, four intensities; chips neutral until opened; main-lift card orange rim,
  assistance neutral rim; nebula card grounds. Warm-up label dim-orange (was sky blue).
- **State:** readout plates + nebula + the grid texture on every data card; per-lift cards; discipline
  cards ranked by 90-day session count (swim pinned last); numbers AND labels in the discipline's colour.
- **Home:** ~~LOAD + week totals in one bottom-lit "nova" card~~ **SUPERSEDED 2026-08-24, phone-verified
  by Michael:** the glow moved OFF the card onto the chrome — tabbar = header mirrored verbatim,
  page background bridges both edges, LOAD card is a dark clear instrument (the orange strength
  number was drowning in the in-card gold). Recipe + traps: `docs/REFERENCE-nova-field.md`.
- **Nova drift:** `--nova-dx/dy/hue` roll once per app LAUNCH (`src/main.tsx`); header and tabbar
  drift together so no two opens look identical. ⚠️ If the background ever twitches mid-session,
  something re-rolled per render — that is the bug to look for.
- **LOAD verdict:** "balanced" is white now; caution/alarm escalate on #FF5A5F (non-discipline red).
- **Week 3 label:** Home should now say "Base" (or nothing) instead of "Endurance Building" —
  `get-week` reads `resolveBlockIdentity`, deployed. ⚠️ If it still shows the old words, the plan's
  stored `weekly_summaries` is being trusted over the generator — report back, that's the next fix.
- Files: `readout-plate.ts`, `ReadoutTiles.tsx`, `index.css` (`.galaxy-card`, `.readout-*`),
  `sport-color-parity.test.ts` (pins the 3 colour-definition sites).

## ⏳ AWAITING MICHAEL — THE ENTRY GATE + BAR FLOOR + BAR CHIP (2026-08-13 night, PUSHED + DEPLOYED + Xcode-synced, **not device-verified**)

The flag model, decided and shipped in one evening session (supersedes the interim hard-85 gate and the commercial-gym bar branch, which never deployed):

- [ ] **65 lb 1RM entry minimum, per lift, both entry doors** — under it the build refuses: "even a 35 lb bar can't carry its lightest sets." Test with a sub-65 max on a test account.
- [ ] **65–84 lifts build, floored at the 35 lb bar**, and the plan description names them ("Some Overhead Press sets sit below the 45 lb bar — those are written for a 35 lb bar"). 85+ floors at 45, no flag (pinned by test).
- [ ] **Logger bar chip** — barbell rows show "plates" + "45 lb bar" side by side; the bar pick applies to the whole lift; 33 lb option reads "Light". Look at any barbell exercise.
- [ ] **Focus card copy** — "Barbell compounds on Wendler's 5/3/1 — for strong beginners and intermediates who know the lifts." No number.

Deployed: generate-strength-plan, create-goal-and-materialize-plan, materialize-plan, rematerialize-strength-block. Client pushed (Netlify) + Xcode synced. 375 strength-system tests green.

## ✅ VERIFIED ON DEVICE 2026-08-13 (Michael, same evening)

- [x] **Focus cards** — "Build a training plan / Build a race plan" labels + "Build your own" text row, seen live.
- [x] **Glute-ham raise Assist/+ boxes** in the logger, like pull-ups — seen live.
- Still unverified from the batch: the blank-set done-tap (tap the check on an empty set → keypad), and the equipment gate + 45 lb deload floor (visible only on the next plan build).

## ▶ FILED 2026-08-13 — NOT INVESTIGATED BEYOND THE TRACE

- [ ] **3-day choosers see four assistance day-cards, and the shared day silently doubles** (Michael, 2026-08-13 night: "we need to show those days honestly in that section"). Traced: the per-day picker renders `LIFT_DAYS.map` unconditionally (`NonRaceBuilder.tsx:~3322`) — no `liftingDays === 3` branch — while the composer maps bench+press onto ONE calendar day and emits BOTH cards' assistance there (each lift's session carries its own `assistanceRows`, `strength-primary-plan.ts:~2462`). So a 3-day athlete picks across four cards that are really three days, and the shared day stacks 2× push/pull/leg-core plus up to two abs add-ons. Fix needs a design call FIRST: is double assistance on the shared day Wendler's 3-day intent or an accident? (Source his 3-day/2-day templates before touching either the merged-card UI or the engine's emission.) Then: one merged "Bench + Press day" card in the picker, and the engine emitting whatever the sourced answer is.


- [x] **The plan BUILD never reads the athlete's equipment** — FIXED, PUSHED + DEPLOYED 2026-08-13 evening (commit c338553d; generate-strength-plan, create-goal-and-materialize-plan, materialize-plan). `generate-strength-plan` now reads `user_baselines.equipment.strength` server-side and threads it through `assistanceRows` → `resolveDayAssistance`, which keeps performable picks (band picks included — the athlete chose them), replaces un-performable ones from the same category's pool ranked loadable-first/bands-last (sourced: 2nd ed. pp.50-52), gates the `BALANCED_WEEK` fallbacks and the abs add-on (against the abs pool), and deliberately does NOT gate the opt-in pull-up progression. Unknown/empty equipment degrades to ungated, unchanged. 6 new pins in `assistance-equipment-gate.test.ts`; full strength-system suite 369/369; composer smoke test shows Lat Pulldown replaced by Barbell Row on a no-cable/no-bands kit and kept when ungated. ⚠️ DEPLOY needs `generate-strength-plan` + `create-goal-and-materialize-plan` + `materialize-plan` (they bundle the touched shared files). (Michael, 2026-08-13, from the Triceps Extension on his squat day). Traced: the D-424/D-425 equipment gate (`canPerform`) runs in the wizard picker (`NonRaceBuilder`, off `arc.equipment.strength`) and the swap sheet — and nowhere else. `strength-primary-plan.ts` contains zero equipment references; `assistanceRows(picks, scale, mainLiftName, oneRepMaxes)` has no equipment argument, and `resolveDayAssistance` resolves stored picks + `BALANCED_WEEK` fallbacks ungated. So: picks made while the arc was unloaded (or before equipment was declared) are never re-checked at build, and equipment changed after picking never re-gates the plan. ⚠️ Michael's own Triceps Extension is dumbbells-legal, so his plan carries no illegal movement — the defect is the missing build-time read, not his week. Fix shape: pass `user_baselines.equipment.strength` into the generator and gate `resolveDayAssistance` (with D-425's never-empty + substitution rules), likely also the materializer. ⚠️ Carry BOTH rules, not just the gate: `equipmentFitRank`/`hasLoadableFit` already rank band routes last-resort (loadable gear wins outright — Michael 2026-08-13: "bands are a last resort if there is a better exercise with gear") and the build must apply that ranking too.

- [ ] **Weighted Sit-Up can't take a real weight** (Michael on device 2026-08-13, mid-session). The logger's weight box itself is editable (`renderWeightCell` default branch) — the blocks are beside it: (a) assistance rows ship `weight: 'By feel'` (a STRING) and Weighted Sit-Up has no `weight_suggested`, so the text can land in the numeric box / keypad prefill (⚠️ unverified on device — trace only); (b) `exercise-config.ts:2839` classifies `weighted sit up` as `displayFormat: 'bodyweight', ratio: 0` — logged load renders "Bodyweight" on compare/summary surfaces and the movement is never treated as loadable. Fix: reclassify as loaded core (2nd ed. p.45: "25 or 45lb plate held behind head"), give it a real display format, and sanitize non-numeric plan weights before the set field.

- [ ] **Hill Repeats detail screen renders the hard reps as "3:00 @ 9–14 W"** (seen on device, planned session 2026-08-13) — a WATTS target on a run, on the session whose own copy says "No pace target: on a hill the number would be wrong." Michael: "this is all wrong." The session's token is `run_hills_4x180s_rlap_g5_8_dwalk` (`strength-primary-plan.ts:1074`); the wrong power range appears where the step targets are derived/rendered — materialize's `expandRunToken` or the session-detail builder. Not traced further; the whole steps list needs a look, not just the watts line.

- [x] **Deload work sets prescribe below the empty bar** — FIXED, PUSHED + DEPLOYED 2026-08-13 (superseded same night by the per-lift 45/35 floor — see the entry-gate block above). `mainLiftRow` takes `isDeload` and gives deload work sets the warm-up's `BAR_LB` floor (the deload has no ramp — "the work sets ARE the ramp" — so they take the floor the ramp would have). Non-deload work sets stay deliberately unfloored (a sub-bar set on a normal week is the athlete's cue the TM is broken). Session description text follows automatically (verified: 30/40/50 → "45×5, 45×5, 50×5"). 2 pins in `deload-bar-floor.test.ts`; suite 371/371. ⚠️ Michael's live frozen block keeps its 30/40/50 until a rebuild; deploy rides with the equipment-gate deploy set (same functions).

- [ ] **Logger lets a set be checked done with empty reps** (seen on device — Pull Up set 3 checked, reps blank). FIXED IN WORKING TREE 2026-08-13, **not committed/pushed/verified**: `handleSetComplete` (`StrengthLogger.tsx:~3807`) now opens the reps keypad instead of completing when a working set has no rep count (blank = undefined/null, or 0 on anything but a rep-max test, since typed non-test reps floor at 1). Exempt: duration work, mobility mode, warmups (baseline ramps are rep-free by design, Q-097). Covers the plan's AMRAP sets too — they open at 0 and could previously be completed with no count. ⚠️ Still touches the same tap as the open D-326 item ("Select difficulty to mark done") — reconcile when that builds.

---

## ⏳ AWAITING MICHAEL — THE LANDING FIX (2026-08-13 night; demolition sweep VERIFIED, landing check open)

[D-429], `AUDIT-plan-navigation-2026-08-13.md`:

- [x] **Sweep the app after the −11,900-line demolition** — VERIFIED 2026-08-13 night (Michael: "everything seems to work").
- [ ] **Build a plan through Focus → it lands on the weekly planner at week 1** (the `showGoals` fix, `AppLayout.tsx:~706`). Deliberately NOT closed by the sweep — it needs a real build, and Michael won't build over his live Strong Focus block. **Closes naturally on the next real build.**

---

## ⏳ AWAITING MICHAEL — 2026-08-06 late (the marathon block)

DEPLOYED but NOT device-verified. One pass through Focus → Race → Marathon closes all of it.

- [ ] **The plan itself.** A 9-week beginner build should now peak at an **18-mile long run three
      weeks out**, taper 18 → 14 → 10, open near 25-28 mi/wk, and end with **race day on the
      calendar at 26.2 miles**. The plan's description should state the base it assumes.
- [ ] **Paces.** Every session should print the easy pace you have SELECTED (`use my runs` /
      `use my number`), not a 5K-derived one — and durations should be priced at the same pace.
- [ ] **The week card.** Chips readable at phone size? Any screen still scrolling sideways? Does
      Continue still cover the last field on the level or strength cards? Preview durations real?
      (See [Q-264] — and if the role letters are the problem, delete them.)
- [ ] **Strength "None"** should produce zero lifting sessions, and the day count you pick should be
      the number of runs you get.

Lifted from the archived 2026-08-07 + 2026-08-05 blocks — the marathon path is the part that was
never superseded, so these ride the same Focus → Race → Marathon pass:
- [ ] **Marathon flow still reads gold end to end** after the [D-399]/[D-400] restructure; the
      "Your week" card is anchors-only (run days "Auto"; only long run + standing session tappable).
- [ ] ⚠️ **Build the marathon THROUGH Race.** That path seeds the goal on mount rather than on a
      tap ([D-382]–[D-384]). Confirm the race card is the first thing you see (no flash of the wrong
      screen) and that a plan actually builds. **Nobody has watched this work.**


## ⏳ AWAITING MICHAEL — THE HARD-RUN TERRAIN FALLBACK, FLAT PLACEMENT (2026-08-06 night, pushed + deployed, **cards SEEN, placement NOT**)

[D-391], closes [Q-260]. The four terrain cards are **device-verified** (they render and select on
"Your week" → Hard day → Run). One thing is fixture-verified only:

- [ ] **Build a plan that picks "Flat ground only" and check the schedule.** On a week with room, your
      heavy leg days should sit a day further from the flat run than from a normal hard run; on a tight
      week they sit at the normal 24 h with **no** compromise warning. The engine never moves a squat
      inside the long run's 48 h to buy flat its space (0 breaches across a 24-shape sweep) — this is
      confirming the scored preference behaves in a real plan.

Lifted from the archived 2026-08-06 strength-rebuild block — DIAGNOSED 2026-08-26, one re-send closes it:
- [ ] 🟡 **[Q-261] — the 1-second rests were most likely the OLD block's stale data, not a live
      defect.** Michael saw 1s rests on device 2026-08-25; the full chain was then verified: (1) the
      current block's stored steps are CORRECT (Hard Run recoveries `seconds: 120`, Hard Ride 240 —
      read from prod 2026-08-26); (2) the deployed `send-workout-to-garmin` (v105, 2026-08-06
      08:35 UTC) is byte-current with main — deployed the same minute as commit `a5a1f19d` — and its
      rest branch reads `seconds` (fallback present since 2025-09); (3) so current data through
      deployed code produces real rests. The failing session was almost certainly the PRE-08-06
      block's hill workout, whose descents were expanded before durations/`lap_button` existed —
      no duration stored → `Math.max(1, …) = 1s`. That block was deleted 2026-08-24.
      **CLOSES on one device pass: send the 2026-08-28 "Hard Run" to the watch — rests should read
      2:00.** If 1s persists on THAT session, it is a live repro against clean data — instrument the
      export. ⚠️ The current standing plan has NO open-descent hill session (its vocabulary is
      fixed-rest intervals), so the lap-button path itself now has no live producer.
      (Still true alongside: [Q-259] — the old hill token's planned duration excluded its open
      descents; moot unless that token gets a producer again.)

---

## 🏁 RACE BUILDER — OPEN ITEMS (2026-08-05)

Full record, incl. everything that shipped: [`STATE-race-builder-2026-08-05.md`](STATE-race-builder-2026-08-05.md).
**Check it before building any of these** — most of this subsystem is already built and starved, not absent.

| # | Item | Size |
|---|---|---|
| ~~1~~ | ~~**The intake screen has grown by accretion.**~~ ✅ **CLOSED 2026-08-05 — Michael: *"keep as is."*** Reviewed on device and kept: strength picker stays on "Your week", club-intensity stays under the club picker. ⛔ **Not a backlog item — a decision. Do not "tidy" it later.** | — |
| 2 | **The solver collapse** — `week-solver.ts` still has not taken the run generators (`SPEC-week-solver` §7). `assign-days.ts` is a narrow stopgap that overrode a written "do not patch this". | large |
| ~~3~~ | ~~**Two doors to a marathon plan**~~ ✅ **ALREADY DONE — verified 2026-08-26:** run left `renderEventForm` on 2026-08-06 ("Run leaves by the door" comment; sport select has no Run; a router card sends to the race builder). Stale row. | — |
| 4 | **Bike/swim cannot be opted into a marathon plan** — the hold cards move *after* the preview, and no post-preview surface exists. | medium |
| 5 | **"Marathon" → "Run race"** (half/10k/5k). Engine is already multi-distance; needs per-distance `TIER_SEEDS` + distance-neutral tier copy first. | medium |
| ~~6~~ | ~~**Mark redundancies for deletion**~~ ✅ **MARKED 2026-08-26:** deletion banners on `FITNESS_TO_VOLUME` (types.ts), `distributeVolume` (base-generator, zero callers), and the VDOT duplicate tables (GoalsScreen). Of the other three: the third `LONG_RUN_PROGRESSION` died with `simple-completion.ts`; `schedule_preferences` already carries do-not-add-readers; the dead `hardday` step is now LIVE-adjacent (the 2026-08-24 endurance-week screen replaced it on the strength path only) — not marked. | — |
| ~~7~~ | ~~**The tri event path unguarded-insert hole**~~ ✅ **CLOSED 2026-08-26 (working tree; needs deploy):** the tri branch refuses `bodyPreview` outright before its goal insert (no no-persist mode exists there, so refusal beats a half-run); the run path's stale "still has this hole" comment back-annotated. | — |
| 8 | ~~Delete the stray `Efforts_Summer` Supabase secret.~~ **DONE 2026-08-25 — unset from prod.** | trivial |

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

## ⚠️ LIVING DOCS OVER THE CAP — SUPERSEDED 2026-08-02 by the freeze-and-split rule; one remainder

> ✅ **SUPERSEDED (annotated 2026-08-25).** The archive-the-closed-ones approach this entry proposed
> was tried, measured, and **rejected** — CLAUDE.md now records why (judging entries is where the
> danger is). The 2026-08-02 fix was **freeze by number**: `DECISIONS-LOG.md` frozen at D-373 →
> `DECISIONS-LOG-2.md` → `DECISIONS-LOG-3.md` (live, 92KB); `OPEN-QUESTIONS.md` frozen at Q-251 →
> `OPEN-QUESTIONS-2.md` (live, 64KB). Frozen files don't grow; their size no longer matters.

- [ ] **The one live remainder: `ENGINE-STATE.md` — 178 KB (measured 2026-08-25), over the cap.**
      Its exception is "trim Solid entries older than a few weeks into `archive/ENGINE-STATE-archive.md`"
      — that trim is still outstanding. Own pass, grep-verify every reference after.
- [x] `DECISIONS-LOG-2.md` (198 KB) is already frozen — `DECISIONS-LOG-3.md` (D-428 onward) is live
      and carries the range table. Nothing owed.

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

## ▶ NEXT UP — MAKE THE ALL-OUT REPS MOVE THE WEIGHT (2026-07-31)

**The rematerializer (Q-226), now unblocked.** It was parked because its input did not exist; D-338 made the all-out rep count a saved fact. Read the ENGINE-STATE banner first — it names the seam.

- [ ] ✅ **DONE — `verdictFrom95Set` is wired.** Called at `loading/cycle-verdicts.ts:116` → `verdictsForBlock` (`:197`) → `rematerialize-strength-block/index.ts:161`, which the client invokes at `StrengthLogger.tsx:4022` / `:6053`. ⟨A31⟩
- [x] ✅ **DONE — the verdicts are now SUPPLIED through the seam.** `strength-primary-plan.ts:1275-1276` passes `args.cycleVerdicts`, populated by `generate-strength-plan/index.ts:149` and `rematerialize-strength-block/index.ts:161`. ⟨A31⟩
- [x] ✅ **DONE — `rematerialize-strength-block` is that something.** It reads verdicts (`index.ts:161`) and rewrites the remaining cycles' working numbers (`:167`); the client calls it at `StrengthLogger.tsx:4022` / `:6053`. ⟨A31⟩
- [ ] **ONE verdict, THREE customers** (Michael: *"it should be able to handle state as a cumstomer as well"*) — the plan rewrite, State, and the session that earned it. ⚠️ State's per-lift verdict currently keys off a DEAD RIR branch: it reads nothing while looking like it works.
- [ ] **This closes Q-223** (a first block's numbers advancing on the calendar).

---

### ▶ NEXT UP — D-325 / D-326, spec'd 2026-07-25 late, NOT built

> ⚠️ **RE-SCOPE BEFORE WORKING (annotated 2026-08-25).** `week-model/resolve.ts` (2026-08-18) cites
> D-325 §7 directly and implements the scored-placement idea for the STRENGTH path — six weighted
> score terms over a legality layer. It replaced the hardcoded Mon/Tue/Thu/Fri grid this section
> calls "the real outlier." Parts of the D-325 items below may therefore be BUILT in week-model
> form; trace `week-model/` against each line before starting anything. The D-326 layers
> (difficulty tap server half, advance path, e1RM provenance) are untouched by that and still real.
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

### ⚡ Shipped 2026-07-19 night — DEPLOYED, NOT VERIFIED (coach week composer, D-306)
- [x] **Wired `composeCoachWeekInsight`** — `coach.narrative` is deterministic. Pushed `652f07e3`, `coach` deployed, `COACH_PAYLOAD_VERSION` 118.
- [x] **Stall signal built (Q-193)** — per-set reps vs prescribed, at or above the prescribed load.
- [ ] **⛔ VERIFY ON DEVICE.** State → the collapsed paragraph under "open for more". Expect facts about the week's mix, plus either the plan comparison or your own-normal band. **An EMPTY paragraph may be CORRECT** — silence is legal when data is thin; check logs before calling it broken. ⚠️ The stall code has never seen a real `workout_analysis` row.
- [x] **The paragraph and the plan now describe the same week** — plan comparison moved onto `computeWtdLoadSummary` (calendar week, planned-by-today). Retired the Sunday gate. Caught by Michael on screen.
- [ ] **Q-194 — one SHARED banned-word enforcer.** `intent_summary` (`coach/index.ts:5522`) is now POSITION ONLY — plan name + week N of M, synopsis hard-nulled at `:5545` — so the live "body is ready, stay consistent" is gone (v121). What remains unenforced is `marathon-readiness` (`:273`, `:296`, which also carry imperatives). ⟨A31⟩ ⛔ Needs Michael's replacement wording, not a silent edit.
- [ ] **The LLM still writes `coaching.headline` + next-session guidance.** Only the narrative was replaced; retiring the rest is the sweep.
- [ ] **Ground the two triathlon protocols** in `strength-protocol-read.ts` (currently silent by design) — needs a trace of `triathlon.ts` / `triathlon_performance.ts` intent, then a reading each.
- [ ] **Trace `adapt-plan` for Q-192** before touching `strength-profiles.ts` — `five_by_five` is absent and falls back to durability's thresholds; the prescription may still be right and only the adaptation layer wrong.

# 0. ✅ RESOLVED 2026-08-25 — the three never-run engines (kept as the record; see each entry)

The 2026-07-13 audit found the same disease three times, and it is the highest-leverage thing on this page. **In each case the engine is fully built, pin-tested, and spec'd — and nothing calls it.** These are not features. They are **plumbing jobs**, and each is small.

**Each item below leads with WHAT IT DOES FOR AN ATHLETE**, because the previous docs said only where the code lived — which is why nobody, including the owner, could remember what these were for.

- [x] ✅ **RESOLVED 2026-08-25 (Michael's call) — Consolidated strength mode, SUPERSEDED on the path
  that matters.** Built 2026-05-19 for the race-path optimizer as an athlete choice
  (`integration_mode`), never wired to any wizard. The 2026-08 strength-primary engine now does the
  thing itself: **stacking lifting onto a day that holds a hard session is the built-in release
  valve** when a week is jammed (`week-model/resolve.ts` — a jammed week stacks rather than refuses;
  the 3-day stacked fallback is a first-class shape; D-452). The athlete-facing "fork" question died
  with it — the engine decides, and says so.
  ⚠️ **Leftover for a deliberate sweep (NOT deleted 2026-08-25, on purpose):** the dead race-path
  threading (`integration_mode` in `combined-schedule-prefs.ts` /
  `reconcile-athlete-state-week-optimizer.ts`, always `'separated'`) lives inside LIVE race-path
  files that also cite `docs/CONSOLIDATED-MODE.md` — pulling it means editing deployed functions and
  redeploying their importers, so it goes as its own change, and the spec doc comes down with it.
  Race/marathon plans never got the option — if a marathon athlete ever needs it, that is a NEW
  decision, not this one.
- [x] ✅ **RESOLVED 2026-08-25 (Michael's call) — the day-count gate, SUPERSEDED BY DESIGN.** Built
  2026-05-20 to warn-or-refuse an impossible week. The 2026-08 engine adopted the **opposite law**,
  written at the top of `week-model/resolve.ts`: *"IT NEVER REFUSES TO ANSWER … a week with more
  demand than legal slots must still return a week the athlete can see, not a refusal"* (D-325 §7,
  "state the cost, never refuse"). The one firm intake limit is the two-hard-day cap. So the gate is
  not un-wired — it is a design the app rejected.
  ✅ **Deleted 2026-08-25:** `src/lib/day-count-gate.ts` + its test (zero importers) and
  `docs/DAY-COUNT-GATES.md` (nothing else cited it). Left in place: the `gate_block` field
  `session-frequency-defaults.ts:305` still emits into the void — it is part of a published config
  shape, so it waits for a deliberate shape change.
- [x] ✅ **RETIRED 2026-08-25 — the segment engine. Michael's call: "felt like a bust."** Built
  2026-07-06, never invoked once, produced nothing ever, so retiring it changes nothing on any
  screen. The code stays in place as dead until a deletion sweep: `detect-cores` (no callers),
  `match-cores` (`compute-facts`), `compute-core-verdict` (`compute-snapshot`), and
  `segment_verdicts` (always `[]` in the session payload). `DESIGN-segments.md` stays until that
  code comes out (11 files cite it) — doc and code leave together in one sweep. The segments code
  sits inside `compute-facts` and `compute-snapshot`, which are LIVE — removing it means editing
  deployed functions and redeploying importers, so it is its own change, not a casual deletion.
  Do not re-propose without new evidence the per-core model beats the flip-flopping per-route one
  it replaced.

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

- [x] ✅ **DONE 2026-08-25 — `strava-refresh` DELETED.** Repo directory removed; the DEPLOYED function
      deleted from prod (`supabase functions delete strava-refresh`, project `yyriamwvtvzlkumqrvpm`). Zero callers, **deployed**, **no auth check**: takes `userId` from the request body and **returns that user's Strava access token** (`strava-refresh/index.ts:17`, `:93`). The anon key that reaches it is public and sits in your JS bundle. Live refresh already lives in `_shared/strava-access-token.ts`. **Delete, don't document.**
- [x] ✅ **DONE 2026-08-26 (working tree; needs `fetch-strava-route` redeploy).** `bearer-auth.ts`
      DELETED; its one importer, `fetch-strava-route`, now uses `requireUser` (signature-verified,
      AuthError → 401). `deno check` clean on the changed file.
- [ ] **B1 — `require-user` adoption is 9 of 87.** 77 of 87 functions instantiate a service-role (RLS-bypassing) client. Sensitive functions taking identity from the **body** rather than a verified JWT: `strava-token-exchange`, `strava-webhook-manager`, `import-strava-history`, `send-workout-to-garmin`, `import-garmin-history`, `swift-task`. *(`strava-webhook-manager` is called with the anon key as bearer, so it carries no identity **by construction** — it cannot adopt `require-user` without a client change.)*
- [ ] **LEAD (2026-08-26, filed from the secret-unset session, not investigated):**
      `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` are both set to the EMPTY string
      (shared digest = SHA-256 of ""). Decide: delete them, or fill them — an empty secret that
      looks configured is the misleading kind.
- [ ] **Admin functions have no server-side admin check.** The 8 edge functions `WorkloadAdmin.tsx` invokes are gated **client-side only**. `is_app_admin()` exists in SQL and guards only `library_plans` INSERT.
- [ ] **`disconect-connection` (misspelled) is a REAL deployed function with NO SOURCE in the repo**, kept as a permanent fallback branch at `Connections.tsx:495`. Unknown behaviour. Find it, delete it, remove the branch.

---

# 3. HYGIENE — deletions, mostly

- [~] **24 dead edge functions + 11 empty directories.** ✅ **MOSTLY DONE (verified 2026-08-25):**
      `analyze-workout/`, `generate-training-context/` and `generate-plan/` are all deleted, and
      `find supabase/functions -maxdepth 1 -type d -empty` returns zero. Remaining: the "24 functions"
      count is stale — re-run the dead-function census against `CAPABILITY-MAP.md` before calling this closed.
- [x] ✅ **CLOSED (verified 2026-08-25).** The decoy generator classes are gone —
      `generate-run-plan/generators/` holds one `SustainableGenerator` (`sustainable.ts:38`);
      `simple-completion.ts` no longer exists.
- [ ] **Nine coach outputs are computed and never rendered** (`CoachWeekTab` + `BlockSummaryTab` are unmounted) — including **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ **`reaction`'s object is load-bearing internally — do not delete it, only its dead emission.** *Decide: mount the tabs, or delete them. Right now it's neither, which is the worst of both.* Also dead: `synthesizeHeadline` runs on **every** snapshot and **every** State render and both throw it away; the LLM's `headline` + `next_session_guidance` are **paid for, parsed, and discarded.**
- [x] ✅ **CLOSED (verified 2026-08-25).** `ai-summary.test.ts` is deleted, `cross-workout-queries.test.ts`
      remains, and the whole suite is green (4357/0 per the 2026-08-25 ENGINE-STATE banner).
- [x] ✅ **CLOSED (verified 2026-08-25).** The "keeping as backup" block is gone from
      `compute-workout-analysis/index.ts`.
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
  **SHIPPED (D-289/D-290).** `matchExercises` moved to `_shared/strength/match-exercises.ts` (imported `analyze-strength-workout:14`, called `:1408`) and now honours `substituted_for` (`:483`), emitting `substitutions` (`:1281`) via `_shared/strength/substitution-note.ts`. Device-verify only — the 2026-07-13/14 checklist is in `archive/POLISH-PUNCH-LIST-archive-2026-08-25.md`. ⟨A31⟩ So the planned lift reads as a **SKIP** (dragging the 30%-weighted exercise-completion term) **and** the work he actually did gets **zero credit** (`planned: null` → dropped from the denominator). **Penalised for what he didn't do; unpaid for what he did.**
  **SPEC: `docs/SPEC-exercise-substitution.md`.** The athlete declares the swap; the app stops docking and **names the trade** instead of scoring it. ⛔ Do NOT infer equivalence from the movement pattern — BSS is knee-dominant (`primaryRef: squat`), hip thrust is hip-dominant (`primaryRef: deadlift`). Ask, don't guess. **Sign-off gated.**
- [ ] **Strength → endurance interference signals** + **`endurance_load_context` population** (`analyze-strength-workout:2811`, still `null`) ⟨A31⟩. ⚠️ **These are ONE job** — the same `athlete_snapshot` fetch serves both. The substrate is already live (`compute-snapshot:512-522`).
- [ ] **Per-exercise history** — 1RM/volume trend + set records. `ExerciseHistory.tsx` does not exist. *(`StrengthCompareTable.tsx:250` already renders this session + the previous one inline — the gap is the last-6 trend + PR flag, not the expansion.)*
- [ ] **Refactor strength INSIGHTS → `_shared/strength-v1/ai-summary.ts`** (the directory doesn't exist; `_shared/cycling-v1/` is the pattern to mirror). Prompt + fact packet are still inlined.
- [ ] **Outcome-specific narrative templates** — one prompt today (`analyze-strength-workout:2451`).
- [ ] **Q-050 — pick-planned reconciliation.** Spec'd, not built (`SPEC-PICK-PLANNED-RECONCILIATION.md`); `auto-attach-planned:396` still matches on exact date only. Sign-off gated.
- [ ] **`analysis_error` truncation** — raw uncapped errors at every analyzer write site (`analyze-strength-workout:2983`, and 4 more).
- [ ] **`Single Leg Rdl` / `Single Leg Romanian Deadlift` are the same movement listed twice** in the
      library swap list (carried from 2026-07-30; both spellings verified still separate entries in
      `exercise-config.ts:312/:320`, 2026-08-25).

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
- [ ] **iOS bundle rebuild** (`npm run ios`) — `ios/App/App/public/` is a day stale. ⚠️ The segment
      card will never appear regardless — the segment engine was RETIRED 2026-08-25 (see §0).
- [ ] **Spiering is understated everywhere it appears as "4–8 weeks"** (carried from the 2026-07-26
      evidence sweep). Actual: **15 weeks endurance on 2 sessions/wk, 32 weeks strength on 1 session
      of 1 set.** Corrected in the doctrine; check `SCIENCE-*` docs.
- [ ] ⚠️ **WATCH — descent accent's FIRST REAL firing ([Q-186]**, carried from 2026-07-17). On the
      next NATURAL anchor descent (a strong old run aging out of the ~12wk window), confirm the coach
      line reads as explanation-with-credit, not a scold — and the credit clause is absent when the
      aerobic work didn't cover the load.
- [ ] ⚠️ **CLEANUP — ~2 stray superseded rows in `fitness_baselines` ([Q-187]**, carried from
      2026-07-17). Active crown is correct; prune the lineage WITH Michael (timestamps overlap real
      supersedes).

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

### ⛔ THE BIKE TAKES OVER THE WEEK AND WE KEEP BUILDING A RUNNING PROGRAM (NOTED 2026-08-27)

**The question this answers, Michael's words:** *"does our cycling lighten the fatigue of a run
program to comfortably add on cycling, or does the fatigue cycling might hide along with running add
more fatigue and require his reduced cycling and strength?"* **Both, and the deciding factor is
whether the bike REPLACES running or ADDS to it.**

⛔ **VIADA ANSWERS BOTH CASES AND THEY DO NOT CONTRADICT.** Read off the page images, not the corpus
notes.

- **p137 — replacing is the lighter option.** For a runner at their own ceiling (his example: *"18 to
  20 miles per week running… represents your current upper bound"*), *"adding two hours of cycling or
  Arc Trainer/elliptical per week will almost certainly aid your running, as long as you properly
  maintain recovery."* His default still stands alongside it: *"when in doubt, use cross-training for
  easy work, not threshold or sprint work."*
- **p138 — and hard cross-training has its own permission.** *"Cross-training at higher intensities
  may be useful for athletes who are limited in their overall volume even at an advanced level"*,
  summarised in his own bullets as *"consider adding some work at higher intensity with similar
  modalities if you're really pushing the limits of your tolerable volume."* ⚠️ Giving a run slot to
  the bike caps that athlete's running, so the swap sits inside this permission.
- **p280 — but riding as the main sport costs a lifting day.** *"Cycling can be surprisingly taxing
  on the central nervous system — surprising in that the lack of impact may allow for fatigue
  accumulation that is not 'felt' the same way… fatigue will mask fitness quite thoroughly… you
  should expect somewhat lowered performance on the lower body days… you may want to proactively
  lower your working max by a few more percentage points than usual."*

⛔ **WHAT WE DO THAT HE NEVER DOES: keep FOUR lifting days while the bike takes the week.** p246's
Strength + 5K is four lifting days against four RUNS. p278's Cycling Base is **three** lifting days
against **six rides** — he collapses the two DE days into one `DE: Full` and adds a `SKILL: Carry`.
⚠️ Days 1 and 2 are otherwise WORD-FOR-WORD IDENTICAL between the two programs, so the lifting
difference is exactly that one collapsed day, and p280 says why.

## ⛔ THE LINE, AND IT IS OURS — THE SECOND HARD RIDE

He gives no threshold, so this is ours and is labelled. **Count the HARD slots, not the rides.**

| the athlete's answers | verdict |
|---|---|
| **no hard rides** (bike on the easy/long slots only) | his blessed case, p137 exactly. Nothing changes. |
| **one hard ride** | inside p138's volume-capped permission. The week still holds real running quality. Nothing changes. |
| **two hard rides** | ⛔ **no running quality left at all.** A cycling week with a 5K program's lifting bolted on — and p278-280 already answer that week. |

⚠️ **COUNTING RIDES WOULD MISS IT.** The line can be crossed with only two of the four endurance
slots on the bike, and NOT crossed with two rides on the easy and long days — which is his own
preferred arrangement.

## ⛔ THE BUILD, WHEN IT COMES — offer his cycling program, never switch silently

**Michael, 2026-08-27:** *"can we be smart enough… to shift to the riding program if there is 2 hard
rides and it becomes clear this person is a cyclist who runs a little?"* ✅ Yes, and the book is built
for it — **programs name their own successors** (roster §E0 fact 2), and Cycling Base is his named
entry point: *"if you have less experience, I encourage you to run the Base program for at least 4
weeks before attempting the others"* (p280).

**What it needs:**
1. **The Cycling Base week, p278** — transcribe the table. Standard: day 1 `ME Upper` + Cyc sweet
   spot (level 1-2) · day 2 `ME Lower` + Cyc endurance (1) · day 3 plyo warm-up + Cyc VO2 (1) + Cyc
   sweet spot (1) · day 4 `DE: Full` + `SKILL: Carry`, no ride · day 5 Cyc endurance (1) + Cyc sprint
   (1) · day 7 Cyc endurance (2) · rest. Deload column drops every ride to level 1 and cuts day 2's
   second ME to DE.
2. **Its notes, p280** — the lowered working max, and the powerlifting line: *"For powerlifters, the
   Base and Fondo programs offer the best framework for competitive lift training… the big three can
   be trained one or two times per week, both dynamically and through max effort lifting."*
3. **p279 Fondo and p281 Crit** are the successors, not the entry. ⚠️ Crit cuts strength to *"DE
   secondary movements"* only and says to switch back to Base for 4-6 weeks to peak strength.
4. **Detection is already in the athlete's answers** — two hard rides on the endurance screen is the
   whole signal. No history read, no inference. ⛔ Which keeps it clear of the 28-day-window defect
   the experience control exists to remove.

⛔ **OFFER IT, DO NOT SWITCH SILENTLY** (Michael). Something in the shape of *"you've put both hard
sessions on the bike — his cycling program fits you better. Want it?"*
⚠️ **BASE IS A FOUR-WEEK ENTRY BLOCK IN HIS BOOK, NOT A TWELVE-WEEK PLAN.** The switch has a shape,
not just a swap.

⛔ **NO UI FOR THIS UNTIL IT IS BUILT** (Michael, 2026-08-27: *"we dont have to dress up ui for
something not built"*). No stopgap sentence on the endurance screen, no teaser, no disabled control.

⚠️ **PAGE IMAGES ARE LOCAL ONLY** — `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`,
`p278.jpg` `p279.jpg` `p280.jpg` `p281.jpg` `p137.jpg` `p138.jpg`. Deliberately not in git. Read the
page, not the corpus summary: the corpus bullet *"similar-modality threshold work only when
volume-capped"* is a compression and is NOT his sentence.

---

### THE RIDE SESSIONS ARE BUILT FROM A DIAL, AND HE WROTE A MENU (NOTED 2026-08-27)

⚠️ **A SECOND-ORDER FINDING off the same session — not blocking the experience control, and it
touches the RUN sessions equally.** He prints **four** sweet-spot rides per level (p238-239); the
library models the level as a work BAND and builds somewhere inside it, currently the middle
(`volume-bounds.ts` — a quality rung collapses to `DEFAULT_SIZE`). **Neither the middle nor the
bottom is one of his four sessions.**

**Measured, 2026-08-27, weeks 2-5 at 3h/5h/8h asks — the hard ride is 43 min at level 1 and 51 at
level 2, identical at every hours ask.** Against his own printed sessions with the 10-15 min easy-spin
warm-up (he states no cooldown for sweet spot):

| | his shortest printed | his longest printed | what we build |
|---|---|---|---|
| **level 1** | ~45 min (6 × 4 min @ 95%) | ~70 min (3 × 15 min @ 80%) | 43 min |
| **level 2** | ~60 min (8 × 4 min @ 95%) | ~85 min (3 × 20 min @ 80%) | 51 min |

⛔ **WHY IT MATTERS BEYOND FIDELITY:** the two tiers of the experience control land 8 minutes apart
on the bike, which Michael read as *"nominal"* — and the cause is the dial, not the levels. His own
levels are 15-25 minutes apart at both ends of the menu.
⚠️ **DO NOT "FIX" THIS BY REINTRODUCING A RATIO.** A 1.5x run-to-ride equivalence was floated and
withdrawn — it is not his, and p280 states his own version anyway (*"some of these cycling workouts
may easily run 50 percent longer than a comparable running session"*), which is an observation about
his sessions, not a construction rule for ours.

---

### THE DOWNLOAD SCREEN'S LABELLER MISNAMES A RUN AND DROPS REPS (NOTED 2026-08-27, traced)

⛔ **LABEL-ONLY. NO SESSION IS MIS-BUILT AND NO BIKE WORK REACHES THE ATHLETE** — the plan row and the
materialised workout are both correct. This is `humanizeToken` in `AllPlansInterface.tsx:79-98`,
which renders the parenthetical detail line on the exported plan.

Two defects, both confirmed by reproducing the exact export string:
- **A run is called a bike session.** Line 94 reads `t.startsWith('bike_thr') || t.includes('threshold')`.
  The `includes` arm catches the RUN token `cruise_5x0.8mi_threshold` and returns *"Bike Threshold"*.
- **A repeated block prints as one rep.** The duration regex takes the FIRST `\d{1,3}min` in
  `bike_ss_3x18min_R5min` → *"18min"*, dropping the ×3 and the recoveries. Michael read
  *"Warm-up 13min • Bike Sweet Spot 18min"* against a stated 1h15 and reasonably asked why 31 ≠ 75.

⚠️ **DO NOT "FIX" IT BY CHANGING A SESSION.** The composer, the plan row and the watch are right; only
this string is wrong.

---

### THE PLAN AND THE CALENDAR STILL DISAGREE BY 2-3 MINUTES (NOTED 2026-08-27, two of four causes fixed)

**The same session was priced twice** — once by the composer's own clock, once by the materialiser
expanding its tokens into steps — and the athlete trains the second one. Michael, on being told:
*"nothing should disagree."*

✅ **TWO INVENTED NUMBERS ARE GONE** (`6a56e7bb`, deployed): the recovery after the LAST bike block
(his 5-minute spins between blocks stay — they are on p238-239; a third is not), and the strides'
90-second recovery, now a lap-button step per Michael's ruling. Ride 82 → **77**; easy run 35 → **27**.

⚠️ **WHAT REMAINS, UNTRACED:** the hard ride and the hard run still differ by 2 and 3 minutes. The
materialiser prices the intervals off the athlete's REAL threshold pace where the composer used an
estimate. **That is likely the calendar being MORE right, not less** — so the fix is probably to make
the composer read the same number, not to revert the materialiser.

⛔ **THE ARCHITECTURAL ANSWER, NOT YET RULED:** expand the session first and take its stated length
from those steps, so one calculation serves the chip, the preview, the calendar and the watch. Today
the composer decides a length and the materialiser quietly recomputes it. ⚠️ **The fix reaches every
generator in the app**, which is why it is here and not in a work order — it needs Michael's ruling on
which clock is authoritative.

⚠️ **PRE-EXISTING, NOT FROM THE EXPERIENCE CONTROL.** The divergence applied to the 51-minute ride the
old code built too. What changed is that a chip now prints a promise out loud, so the gap became
visible.

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
