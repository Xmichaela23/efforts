# Decisions Log — Part 3 (D-428 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 → D-427** | [`DECISIONS-LOG-2.md`](DECISIONS-LOG-2.md) | frozen 2026-08-13, **still authoritative** |
| **D-428 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every frozen entry is as binding as the ones here. Grep with a
glob: `docs/DECISIONS-LOG*.md`.

---

## D-428 — The training max is 85% of 1RM, unconditionally (owned rule; Wendler's book says 90%)

**2026-08-13 (ratified in session; the number had been live in the engine without an entry).**

`WORKING_NUMBER_PCT_OF_1RM = 0.85` — `supabase/functions/shared/strength-system/loading/wendler-531.ts:119`.

**The call:** every 5/3/1 percentage in the app keys off a training max set at **85%** of the
athlete's 1RM, not the book's 90% (Wendler, 5/3/1 p.22). This is deliberate and **unconditional** —
there is no pure-strength user in this product. Every athlete here is concurrent (running and/or
riding through the strength block), so the extra buffer is the correct standing posture: sub-maximal
enough to progress while fatigued, per the same logic Wendler applies in his own concurrent-athlete
material. The athlete-facing copy "starts at 85% of your max" is engine-accurate.

**Rejected:** (a) the book's 90% — right for a rested lifter, tighter than we want under endurance
load; (b) a conditional 85/90 switch on declared endurance volume — a knob nobody asked for, gated
on data we don't trust yet, and it would make the copy lie for half the users.

**Tradeoff lived with:** a genuinely strength-only athlete (if one ever exists here) climbs from a
softer start — cycles, not correctness, absorb the difference.

---

## D-429 — The plan wasteland is demolished; the goal lifecycle is the ONLY front door

**2026-08-13.** Census: [`AUDIT-plan-navigation-2026-08-13.md`](AUDIT-plan-navigation-2026-08-13.md)
(client) + [`AUDIT-plan-generators-2026-08-07.md`](AUDIT-plan-generators-2026-08-07.md) (server).

**The call:** deleted ~11,900 lines of dead or bypassing plan machinery, in two commits:

1. **The dead third pipeline** — the client-side library-plan system (`PlanSelect`'s in-browser
   materializer, catalog/import screens, `BundleLoader` + `public/plans.v1.0.0`, bake scripts, the
   broken `plan:validate` npm entry). It wrote `plans` rows from the browser, bypassing
   `create-goal-and-materialize-plan` AND `materialize-plan`. Also: 5 dead routes, the
   never-rendered PlansMenu/PlansDropdown/effort dropdowns, orphan components/hooks, and the
   `generate-overall-context` edge function (zero callers, orphan hook).
2. **PlanWizard retired** (`/plans/generate`, 3,094 lines + the "Build a custom plan" entry link).
   It was live and reachable but built run plans **with no goal row and no activate-plan** —
   minting exactly the orphan "lost plans" the navigation audit was chasing.

**The principle bought:** every plan now enters through ONE door — the Focus screen's builders →
`create-goal-and-materialize-plan`. A plan without a goal can no longer be created from the client.

**Kept deliberately:** `WorkloadAdmin` (`/plans/admin`, re-associate tool);
`services/plans/normalizer.ts`, `optional-ui-spec.json`, `templates/workoutDisplayTemplates.ts`
(live, widely imported); `plan-wizard-distance-label.ts` (name is stale — its live consumer is
StateTab).

**Census corrections recorded:** `StrengthAdjustmentModal`, `swim-source-tier`, `ui/popover` were
flagged dead by the sweep and are **live** — kept. Re-verify at cut time is the rule that caught
them.

**Tradeoff lived with:** custom/manual plan authoring has no UI until it's rebuilt on the goal
lifecycle (the Focus "Build" card is the placeholder). The library-plan concept, if ever revived,
starts from the server-side generators — not from baked client JSON.

---

### D-430 — The assistance equipment gate runs at BUILD TIME too, with band routes ranked last (2026-08-13 night, **PUSHED + DEPLOYED** — generate-strength-plan, create-goal-and-materialize-plan, materialize-plan; **not device-verified**) — extends [D-424]/[D-425]

**The decision.** `resolveDayAssistance` takes the athlete's declared equipment (read server-side off `user_baselines.equipment.strength` in `generate-strength-plan`) and gates at plan build: a performable pick is kept — band picks included, the athlete chose them — and an un-performable one is replaced from its own category's pool, ranked loadable-gear-first / bands-last (`rankByEquipmentFit`). The `BALANCED_WEEK` fallbacks and the abs add-on gate too; the opt-in pull-up progression deliberately does not. Unknown/empty equipment degrades to ungated.

**Why.** D-424/D-425 gated the two surfaces where picks are MADE (wizard picker, swap sheet) and never the surface where the plan is BUILT — so picks stored while the arc was unloaded, equipment changed after picking, and the default fallbacks all reached the plan unchecked (Michael, off a device screenshot: "it's not reading users equipment"). The replacement rule is Wendler's own, sourced before building: same-category menus (2nd ed. pp.50-51, "you can change exercises however you see fit"), bodyweight as the no-gear floor (p.52), bands nowhere in his chapter — "bands are a last resort if there is a better exercise with gear" (Michael).

**Pinned** in `assistance-equipment-gate.test.ts` (6 tests). Composer smoke: a Lat Pulldown pick on a no-cable/no-bands kit becomes Barbell Row; kept when equipment is unknown.

---

### D-431 — Entry at 65 lb 1RM per lift; a per-lift 45/35 bar floor; the light-bar FLAG instead of a hard gate (2026-08-13 night, **PUSHED + DEPLOYED** — same four functions + rematerialize-strength-block; **not device-verified**) — supersedes the same evening's interim hard-85 gate and commercial-gym bar branch (never deployed)

**The problem, found on device.** Michael's week-4 deload OHP read 30×5, 40×5 on a 45 lb bar — the composer floored warm-ups at `BAR_LB` and deliberately not work sets, and the deload (40/50/60% of TM, no ramp) broke that assumption for any working number under ~112. Which opened the real question: what is the price of entry on a barbell program, and what happens to the athlete under it?

**The model that shipped (Michael's design, reached stepwise).**
- **The door: 65 lb 1RM on each of the four lifts** (`STRENGTH_ENTRY_MIN_1RM_LB`, both entry doors). The program's lightest normal set is ~55% of 1RM and must clear a bar that exists; the lightest bar prescribed-for is the 35 lb class (35, not the 33 lb women's Olympic spec — 5 lb rounding steps stay plate-loadable off 35 and break off 33). Under 65, even that bar can't carry the sets — Wendler's own answer is "a different program" (no dumbbell or sub-bar 5/3/1 exists anywhere in his catalog; dumbbells are by-feel only, never programmed) — so the refusal points at the future beginner tier.
- **65–84 is ADMITTED AND FLAGGED, not refused:** the lift floors at 35 (`barFloorForWorkingNumber`, per lift off its working number, same rule in composer and rematerializer; warm-ups follow their lift's own bar) and the plan description names it: "Some Overhead Press sets sit below the 45 lb bar — those are written for a 35 lb bar." A ~$60 bar, disclosed — not a locked door.
- **85+ is untouched:** floors at 45, no flag, pinned by test.
- **Copy carries no threshold:** the Focus card reads "Barbell compounds on Wendler's 5/3/1 — for strong beginners and intermediates who know the lifts." The gate's refusal carries the number. ⚠️ Michael, on wording: never "women's bar" in athlete-facing copy — "35 lb bar"; the logger's 33 lb option reads "Light".
- **The logger's bar picker is its own chip** beside "plates" on barbell rows (it had survived the UI rebuild buried inside the plates popover, per-set); one pick stamps every set of the lift; the chip names the current bar.

**Rejected:** dumbbell substitution for weak lifts inside 5/3/1 (Wendler explicitly: don't program DB percentages); the interim hard-85 gate (right answer to the wrong question — it locked out people a $60 bar admits); the commercial-vs-home bar detection (equipment data goes stale; the per-lift rule needs no declaration).

**Tradeoff lived with:** a 65–84 athlete on a home gym is prescribed sets that need a bar they may not own — the flag line and the logger's bar chip are the disclosure, not a guarantee. And `BAR_LB` stays the hardcoded 45 for everything above the band; a fully athlete-declared bar weight (technique bars, 15 lb) remains an open extension, noted 2026-08-13.

**Pinned** in `deload-bar-floor.test.ts` (6) + the updated warm-up pin in `strength-primary-plan.test.ts`. Suite 375/375.

---

### D-432 — Strong Focus aligns to 5/3/1 Forever: three-week cycles, standalone light weeks, the verdict on the rested week, FSL in the leaders (2026-08-15, **PUSHED `48889070` + DEPLOYED; NOT device-verified**) — supersedes the volume half of [D-385] and the pairing half of [D-387]

> ⛔ **PARTLY SUPERSEDED 2026-08-17 — MICHAEL, AGAINST THIS ENTRY'S OWN PAGE-PINNED READING. Everything below is history for the two rows named here; the rest stands.**
>
> **1. The standalone weeks' assistance row is reversed.** This entry's table gives weeks 4/8/12 `25 / 10` — the seventh-week band at full volume plus ten jumps — on the strength of **p.23: 25–50 is the SEVENTH WEEK's number**, and that citation is correct. Michael overruled it for the hybrid case: **the 7th weeks (4, 8) now HALVE every accessory total, and the TM-test week (12) carries no accessories and no jumps at all.** His reason is systemic-fatigue clearance for an athlete carrying a conditioning load Wendler's seventh week was not written against, and for week 12 that you do not build fatigue in front of a measurement. Halving the busiest band lands at 13, **below p.23's floor** — that is known and accepted. Code: `RECOVERY_ASSISTANCE_SCALE` in `strength-primary-plan.ts`, with the conflict recorded beside the number.
>
> **2. The band axis moved again, and it is now a resolved WEEK-LEVEL tier.** This entry shipped `7th week 25–50 · leader 50–75 · anchor 75–100, clamped at 75` — a PHASE axis. That was already replaced on 2026-08-16 (§1g) by competing stress, and on 2026-08-17 the resolution was **hoisted out of the per-slot call into one tier decided once per week** off hard days **plus total endurance hours**: `survival 25–30 · base 30–40 · strength 40–50`. The phase no longer touches accessory volume at all. Spec: `docs/SPEC-viada-ingestion-order.md`.
>
> ⚠️ **AND THIS ENTRY'S WEEK-BY-WEEK TABLE IS STALE INDEPENDENTLY OF ANY OF THAT** — it shows week 1 as a TM-test week, and the opening TM-test week was removed afterwards. Week 1 is a leader week in the code. Not caused by 2026-08-17; noticed while auditing it.

**Decided by Michael 2026-08-15.** The work order was `docs/WORKORDER-strong-focus-forever-alignment-2026-08-15.md` (deleted on ship, per the spec lifecycle). The 12-week container, the four lifts, days per week and endurance placement are UNTOUCHED. What changed is the internal shape.

**Sources.** Two primaries. *5/3/1 2nd edition* — the licensed PDF, cited throughout and never committed. *5/3/1 Forever* — Michael's physical copy; **page photos of pp.16–45 were read in the 2026-08-15 session and only those pages are verified**, transcribed into `docs/REFERENCE-531-forever-pp16-45.md`. ⚠️ Anything attributed to another page of Forever anywhere in this codebase is secondary and must be marked so.

⛔ **AND THE BUILD DEVIATES FROM THE WORK ORDER IN TWO PLACES, BECAUSE THE PAGE-PINNED READING SAYS OTHERWISE.** The work order was derived from that same reading, and where a derived doc disagrees with its own primary the primary wins. Both are flagged in code:
1. **The assistance bands.** The work order said leaders 25–50, anchors 50–100. The reference reads **p.24: base 50–100 per category per workout** and **p.23: 25–50 is the SEVENTH WEEK's number.** So 25–50 belongs to the light standalone weeks, and leader-vs-anchor is a split inside 50–100. Shipped: 7th week 25–50 · leader 50–75 · anchor 75–100, **all clamped at 75** (ours, T3, for a concurrent athlete). Consequence, stated rather than hidden: **the anchor sits flat at 75**, and a leader with a big tested capacity can reach the same number — the direction is never inverted, but the two can meet.
2. **The FSL citation.** The work order cited Forever p.40 for FSL-as-leader-supplemental. **p.40 is Beginner Prep School**, a novice template the reference explicitly marks "do not cite as general rules". What IS his: p.18, a leader *"increase[s] in barbell volume, usually via supplemental"*; p.15, FSL is one of four named schemes; p.17, not every program has one. **That the pick is FSL 5×5 is OURS (T3)** — it is the only scheme that needs no number the intake has never asked for.

⚠️ **If Michael intended the work order's numbers over the page reading, item 1 is three constants in `src/lib/assistance-menu.ts` and nothing else moves.**

**The block, week by week (a 12-week default):**

| weeks | phase | main lift | supplemental | assistance / jumps |
|---|---|---|---|---|
| 1 | TM-test week | 70/80/90 × 5, then TM × 5+ | none | 25 per slot / 10 jumps |
| 2–4 | Leader 1 | 5s PRO — 65/75/85 · 70/80/90 · 75/85/95, no AMRAP | FSL 5×5 | 25 / 10 |
| 5–7 | Leader 2 | same, TM one step up | FSL 5×5 | 25 / 10 |
| 8 | 7th-week deload | 70×5 · 80×3 · 90×1 · TM×1 | none | 25 / 10 |
| 9–11 | Anchor | standard 5/3/1, top set open | none | 50 / 15 |
| 12 | TM-test week | 70/80/90 × 5, then TM × 5+ | none | 25 / 10 |

16 weeks adds an anchor cycle and a second deload (2L/2A, his p.17 second model). 8 weeks drops the OPENING test week — it costs 9 with it — and the entry gate's 1RM stands in, which the plan copy states. Valid block lengths are no longer multiples of four; `blockWeeks` snaps down to a length the layout fills exactly.

**The six changes, and what is his versus ours:**

- **The assistance and jump direction is FLIPPED** (p.18: less in a leader, more in an anchor). It ran the other way. Bands as corrected above: 7th week 25–50 (p.23), leader 50–75, anchor 75–100 (p.24), **clamped at 75 — ours (T3)**; his 100 is documented beside it as `ASSISTANCE_ANCHOR_CEILING_WENDLER` so nobody re-derives the gap as a bug. Jumps 10 / 15 / 10 — **10 is his** (p.22's tables print 10 total on every day of both schedules) and **15 on the anchor is ours**, being what every week carried before this change.
- **A block never has zero leaders.** `leaderCount`'s `continuous` tier returned 0 — an all-anchor block, which is not one of the three models p.17 publishes (3:2, 2:2, 2:1). Floored at 1. The same page capped the fallback at `ceil(cycles / 2)`, which is the one thing that changed at 16 weeks: 3:1 → 2:2.
- **`WEEKS_PER_CYCLE` 4 → 3, and the light week left the cycle.** The deload row left `PCT_BY_WEEK`; the two standalone shapes are `tmTestSets()` and `deloadSingleSets()` (pp.20–21, sets verbatim). A standalone week belongs to NO cycle — `cycleForWeek` returns null for one, and anything grouping logged work has to handle that. Weeks 1–3 of a cycle are byte-identical to before.
- **The measured event moved to the rested weeks.** `verdictFromTmTestSet`: 5+ advances, 3–4 holds, ≤2 **recalibrates** — the training max is replaced by 85% of the estimate off that set, not walked down 10% over two months. **Every number here is his:** p.20 gives the pass bar as *3 reps at a 90% TM, 5 reps at an 85% one* — ours is 85%, so 5 is the bar, which is why 3–4 holds and the copy explains the difference. p.21 gives the miss band and the remedy in one sentence: *"only 1–2 reps at TM → lower it. Recompute estimated max (weight × reps × .0333 + weight) and set TM to 85–90% of that."* ⚠️ An earlier draft of the code comment marked `2` as ours; it is not. **And p.20 is bold that a big test set does NOT buy a bigger jump** — "the answer every single time is NO" — which is why `advance` gives exactly one increment regardless of reps. The two-consecutive-miss stall counter survives untouched and now has one supplier: the anchor's in-cycle AMRAP. **Week 12's verdict is the block-to-block gate — SPEC-get-stronger §1b's outstanding debt, paid.**
- **FSL 5×5 on the leader weeks**, same lift at the week's own opening percentage. **His:** a leader carries a supplemental (p.18); FSL is one of his named schemes (p.15); BBB is explicitly out (p.45, "not a good option for athletes"). **Ours (T3):** that the pick is FSL — it is the only scheme needing no number the intake has never asked for. `load_prescribed` is TRUE, because it is prescribed barbell work and marking it false would make every name-matched read treat it as an accessory. ⚠️ Not built, and his: a lift on a LOWER training max uses Second Set Last instead (p.40) — the engine runs one TM percentage for every lift, so that has nothing to key on yet.
- **The 3-day pairing is deadlift + press** — p.22, verbatim: *"3-day (squat / bench / deadlift + press share Friday)"*. That makes the shared day a heavy LOWER day, and `pairedIsLower` is derived from the pair rather than asserted. One supplemental and one jump block on a shared day, not two (p.32: one or two exercises per category per workout; 2nd ed. p.77 for the stacked day). ⚠️ The jump row leads the merged session — it is a primer, and the merge used to sweep it in behind the main lifts.

**Deliberate deviations, stated rather than hidden:**
- **p.23 asks for less intensive assistance movements on a 7th week and the engine does not swap them.** Overriding the athlete's own pick is the re-roling model D-407/D-423 retired, and bringing it back for one week in six would restore the sentence explaining why they are not getting what they chose. The guidance travels as copy instead.
- **A block built before today keeps its own light weeks.** `rematerialize-strength-block` leaves a legacy 40/50/60 deload alone rather than rewriting it as a Forever 7th week — switching protocol mid-block on a week the athlete has already seen is worse than a slightly stale deload, which is the smallest-consequence week in the block.
- **Push and core capacity scaling is BUILT AND UNFED.** `assistanceTotalReps` reads `pushupMaxReps` / `hangingLegRaiseMaxReps` if they ever arrive; nothing writes them, no wizard question was added, and absent → the floor with the copy saying so. ⚠️ And the reference points are his **10-minute standards** (p.33) while `pullupMaxReps` is **max clean reps in one set** — only their RATIO is used, the mismatch is flagged in the code, and it is where a real number has to be reconciled rather than plugged in.

**Verification.** `forever-block-map.test.ts` (13) generates a whole block and reads it week by week, all four lifts; `tm-test-verdict.test.ts` (15) pins the verdict bands and the transition gate. Both bug-case fixtures survive: `strength-primary-plan.cycle-climb.test.ts` (the frozen-block regression) and `deload-bar-floor.test.ts`. Full deno suite 3594 passed / 6 failed — the 6 are pre-existing on a clean tree (`d031-convergence-e2e`, `non-race-goal-seeds`, `club-anchor`).

**Not done, and named:** no device acceptance run. The logger renders two rows named for the same lift on a leader week (the main block and its FSL block, distinguished by a `notes` label); nobody has looked at that on a phone.

---

### D-433 — Epley vs Brzycki: the app runs both, on purpose, and this records which is where (2026-08-15, record only — no code changed)

**The fact.** Wendler's own estimator is **Epley** — `weight × reps × 0.0333 + weight` — and it is what `src/lib/estimate-1rm.ts` implements and what every strength surface reads: the all-out-set card, the AMRAP catch-up, the assistance weight suggestion, and (as of D-432) the TM-test recalibration. **`compute-facts` uses Brzycki.**

**Why it is not being unified.** Brzycki reads slightly LOW relative to Epley at the same reps, which is the conservative direction for anything that turns into a prescribed weight. And `compute-facts` feeds surfaces well beyond this block — changing its estimator would move numbers on screens that have nothing to do with 5/3/1, for a difference of a few pounds. **Explicitly out of scope in the work order.**

**What this entry is for:** so the next session that notices the two formulas does not "fix" one of them. If they are ever unified, the direction to check first is what happens to every historical `workout_facts` row computed under the old one.

---

### D-434 — Slice b: a training max that moves is APPLIED, ANNOUNCED and UNDOABLE — both directions (2026-08-15, **PUSHED `790cf50a` + DEPLOYED; NOT device-verified**) — closes `SLICE-strength-b-auto-recalibrate-2026-08-12.md`; **supersedes and replaces `SLICE-strength-max-calibration-4b.md`** (consent-first); folds in D-421's remainder

**The decision.** When a lift's number moves — down on a confirmed stall, up on the earned step — the app writes it, says plainly what it did and why, and leaves a one-tap Undo per lift. No up-front decision gate, and no silent write.

**Why this shape.** The field does exactly this and none of it asks first: StrongLifts auto-deloads 10% after three consecutive fails and tells you; Juggernaut AI recalculates the training max off the week-3 all-out set "without requiring manual input"; Fitbod and Hevy Trainer auto-adjust working weights. The pure trackers (Strong, base Hevy) are manual and don't adjust at all. ⛔ **This is not the silent auto-progression that was deleted** — that one was pulled for being *silent* ("the athlete opened the logger to a number they never agreed to"). The difference is announcement + undo + pattern-gating, not consent-per-change.

**⛔ THE HARD PART, AND IT IS NOT THE WRITE — IT IS THE UNDO.** `rematerialize-strength-block` is a pure function of `(stored training max, verdicts read off logged sets)`. Restore the old prescriptions and the very next save recomputes the same verdicts, reaches the same number, and re-applies the change the athlete just declined. **An undo that gets silently reverted is worse than no undo.** So an undo is a **suppression, not a restore**: the event stays in the log with `undone_at` stamped, and every future recompute consults it — a computed number matching an undone event's `to_training_max` at that event's cycle is replaced by its `from_training_max`. Matched on all three of (lift, cycle, value), so it does not freeze the lift and does not suppress a *different* step that later lands in the same cycle. `calibration.test.ts` runs three consecutive recomputes against it, because one green pass is not evidence of stickiness.

**⛔⛔ ONE THING THE SLICE SPECIFIED IS REFUTED BY THE BOOK AND WAS NOT BUILT.** The brief (written 2026-08-12) asked for a Juggernaut-style up-bump: *"more reps over target → larger step, but capped."* The Forever reading of 2026-08-15 (`docs/REFERENCE-531-forever-pp16-45.md`) contradicts it, in bold:
- **p.20** — more than five reps on the test set → *"stay the course. Do not increase more than the normal amount each cycle."*
- **p.20-21 Q&A** — eight reps at 95%, jump more than 5/10 lb? *"The answer every single time is NO."*
- **p.21, Krypteia** — forty athletes on an 85% TM; after three cycles half could do **15+ reps at the training max**, and the fix is still *"the basic 5-10 lb inching forward."*

So the UP direction is the ordinary earned step (+5 upper / +10 lower) that slice a's engine already applies every cycle. **What slice b adds is that it is announced and reversible, not that it is bigger.** A rep-scaled jump would be an app invention on top of 5/3/1 — the exact class D-422 was written to delete. Pinned: `advance_untrusted` (a set above the D-417 trusted-rep ceiling) moves the number by exactly the same amount as an ordinary advance.

**⚠️ TWO PREMISES IN THE SLICE AND IN `CLAUDE.md` ARE STALE — traced 2026-08-15, and the build does not rest on either.**
1. *"the State strength-row adjust modal … already write[s] a new weight on tap"* — **it does not exist in the running client.** `StrengthAdjustmentModal.tsx` has **zero importers**; `StateAdjustLens` is a v0 scaffold whose own footnote reads "Swap, add, and weight changes live in the logger for now".
2. *"`adapt-plan`'s `suggest` path (`strength_progression` / `strength_deload`) … write on tap"* — those suggestions are computed server-side and **dropped on the floor**. `useCoachWeekContext.ts:615-669` maps only `strength_relayout` and `strength_training_max`, no component reads `plan_adaptation_suggestions`, and no `action: 'accept'` call exists anywhere under `src/`.

**There was no tap-to-apply on the client to convert.** The logger's post-save sheet was the only working path, so that is what was inverted. The unreachable surfaces were left alone rather than revived.

**What shipped, by file:**
- `shared/strength-system/loading/calibration.ts` (new) — the event type, `calibrationEventsFor` (one event per lift per recompute, at the earliest changed cycle), `suppressUndone`, `undoLatestCalibration`, `liftStatus`. Pure; takes an ISO string rather than a clock so it stays replayable.
- `rematerialize-strength-block` — `undo_lift` action; the suppression applied to every computed number **before** the diff; the calibration log written to `plans.config.strength_calibration` on any write; `current_cycle` returned so no client re-derives it. ⚠️ The undo is resolved *before* any number is computed, so the run that creates it already honours it.
- `src/lib/strength-calibration-copy.ts` (new) + test — the two sentences and the three status words, asserted against `voiceViolation()` **and** against the specific failure modes (no second person, no imperative, no consoling closer, no praise, no emoji).
- `StrengthLogger.tsx` — the post-save sheet inverted: `apply: true` on save, per-lift Undo, one "Done" button. The old "Apply / Not now" pair is gone with the model it belonged to.
- `src/hooks/useStrengthCalibration.ts` (new) — **one reader** for both screens; a dry run against the same function the logger calls, so the sheet and the rows cannot contradict.
- `StrengthCalibrationNotice.tsx` (new) — State renders it as the actor, Performance echoes it (`variant="echo"` drops only the block-level scope note). Same line, same undo.
- `StatePerformanceSection.tsx` — the **ambient per-lift status** on the strength row (climbing · holding · reset, with the training max it refers to), always visible. ⛔ This is what the deleted ceiling never gave anybody, and the slice names it as the original bug: *"a number that silently stopped moving with nothing on screen."*

**⚠️ `holding` IS NOT `reset`, and the two must never collapse.** p.33 — a missed session holds the weight and costs nothing, the free re-try. A row calling that "reset" would report a penalty the engine did not apply.

**Copy, and the one check still open.** Every line is fact-first, past tense (the change is already written; the reversibility lives in the Undo control, not in a hedge inside the sentence), and traces to a page — p.31 for the drop, p.33 for the free re-try, p.20 for the fixed increment. ⚠️ **Michael asked for StrongLifts's and Juggernaut's verbatim notices to be pulled and sat beside ours. That was not done** — no browsing was authorised in this session. What is recorded is the *behaviour* the slice verified from its own source list. The check is cheap and still outstanding.

**Fixtures.** `calibration.test.ts` (14) — stall → reset event; earned step → bump event; one miss → nothing (p.33); on target → nothing; a big set buys the same +5; undo restores; **undo survives three recomputes**; suppression is targeted (later cycle, different value, other lift all unaffected); double-tap does not walk backwards; the two acceptance cases re-lay a real block out and put it back. `strength-calibration-copy.test.ts` (10). Full deno suite 3616 passed / 6 failed — the 6 are pre-existing on a clean tree. Type errors 313, unchanged from baseline.

**Not done, and named:**
- **No device pass**, no deploy, nothing pushed.
- The **write itself is unfixtured** — the row loop and the `plans.config` update live in an edge function with no harness. What is pinned is the arithmetic deciding what those rows get.
- The **verbatim field-notice comparison** above.
- `strength-row-text.ts` is orphaned from the screen it was extracted for, and its `tappable` field describes an adjust affordance that no longer exists. Not touched; filed as a finding.

**Supersedes / back-annotate on ship:** delete `SLICE-strength-max-calibration-4b.md` (consent-first, replaced) and `SLICE-strength-b-auto-recalibrate-2026-08-12.md` (this entry is its fold-in). Back-annotate D-421 (its `strength_calibration` wire is now repopulated off reset/bump, `reason: 'ceiling'` retired) and the deleted-auto-progression note in `adapt-plan` (the distinction is silent vs announced-and-undoable).

## D-442 — `resolveEnduranceTier`: `base` is the fall-through, `survival` is only ever earned (2026-08-19, Michael)

**The model was non-monotonic and the copy could not have been written honestly against it.**
`base` required `1 hard day AND 4-8 hours`, and everything failing every AND-gate dropped to
`survival` — described in the code as *"the safe direction"*. The grid says otherwise:

    1 hard day + 3 hrs   ->  survival (25-30)
    1 hard day + 5 hrs   ->  base     (30-40)
    0 hard days + 5 hrs  ->  survival (25-30)   -- the same band as TWO hard days

**More competing stress bought MORE accessory volume**, on a model whose entire claim is the
opposite. The fix is the ORDER, not new numbers: both explicit triggers and both boundaries are
unchanged; `survival` is now only ever assigned by its own trigger and `base` catches the remainder,
which IS the middle case — some competing stress, not a lot.

⚠️ **The unknown case moved deliberately.** No hours figure used to resolve to `survival` and now
resolves to `base`. `strength` still refuses it — the full band is a claim the week carries almost no
competing stress — but `survival` is equally a positive claim that it is heavily loaded, and nobody
has said so. An unmeasured athlete gets 10 more reps than before.

⛔ **Pinned as a PROPERTY, not a table.** `endurance-tier.test.ts` asserts monotonicity across 14
hour-values × 5 day-values on both axes. A six-row grid can be satisfied by a lookup that is wrong
between the rows; that cannot. `580bfed1`.

---

> ⚠️ **RENUMBERED FROM D-428 ON 2026-08-20 — IT WAS A COLLISION, NOT A TYPO.** `DECISIONS-LOG-3.md` already held a different D-428 issued 2026-08-13, and this entry was written into the FROZEN part 2 without seeing it. Two decisions shared one number in two files, which the log's own rule forbids: *a `D-NNN` exists exactly once, anywhere*. The 2026-08-13 entry keeps D-428 because three docs already cite it with that meaning; this one moved. Any pre-2026-08-20 citation of D-428 means the OLDER entry unless it is about this subject.

## D-443 — The intensity/threshold allocation is a training rule, never list order (2026-08-19, Michael)

**Which sport held the block's top-end session was decided by which chip the athlete tapped first,**
and no surface said so — two athletes making identical picks got different twelve-week blocks.
Michael: *"principled; never rely on list order. An array sort change in the future shouldn't
biologically alter an athlete's week."*

**The rule: with a run and a ride, the RUN holds the top-end session.** The mechanism is the
SUSTAINED session, not the intensity one — threshold is the long one (4 × 5 building to 2 × 10),
which on a run is twenty-plus minutes of level footfall and on a bike is zero.

⛔ **AND THE JUSTIFICATION IS TISSUE DAMAGE, NOT ADAPTATION INTERFERENCE.** `DOCTRINE-aerobic-
maintenance.md` §5 retired *"bike does not attenuate strength; run does"* on 2026-07-26 — three
metas, three answers; Schumann 2022 (largest) found no modality moderation and Sabag 2018 found the
REVERSE. Card copy briefly said *"to protect your barbell progression"*, which was that retired claim
in new words **and** contradicted our own tooltip four taps away. Corrected the same day.

⚠️ **A bare `intensity` mark yields to the rule; an explicit `threshold` mark and a full allocation
do not.** The one-slot card asks *"what is this session"* and recommends Top-end intensity, so a mark
on the first sport added is not an allocation between two sports — measured on device as "Run —
sustained threshold" above "Ride — top-end intensity". `011e8fdf`, `fbf40348`.

---

> ⚠️ **RENUMBERED FROM D-429 ON 2026-08-20 — IT WAS A COLLISION, NOT A TYPO.** `DECISIONS-LOG-3.md` already held a different D-429 issued 2026-08-13, and this entry was written into the FROZEN part 2 without seeing it. Two decisions shared one number in two files, which the log's own rule forbids: *a `D-NNN` exists exactly once, anywhere*. The 2026-08-13 entry keeps D-429 because three docs already cite it with that meaning; this one moved. Any pre-2026-08-20 citation of D-429 means the OLDER entry unless it is about this subject.

## D-444 — One endurance session a week is a legal answer, and the long day is a session not an extra (2026-08-19, Michael)

> ⚠️ **RENUMBERED FROM D-430 ON 2026-08-20 — A COLLISION, NOT A TYPO.** A different D-430 was issued 2026-08-13 and is above in this file; this entry was written into the FROZEN part 2 without seeing it. The 2026-08-13 entry keeps D-430 because code and specs already cite it with that meaning; this one moved. A citation of D-430 dated before 2026-08-20 means the OLDER entry.

**1 was unreachable in four places at once:** the picker offered 2/3/4, `assemblePayload` sent
`run_days` only at `>= 2`, the Continue gate demanded 2, and the composer floored at
`Math.max(DEFAULT_ENDURANCE_SESSIONS, …)`.

⛔ **Fixing the floor exposed an overage already live at two sessions.** `runFreq` read
`Math.max(1, asked - hardRunCount)` so that *"a 2-run week with two hard runs still leaves a run to
be long"* — which is the +1 the line above it exists to prevent. **Two asked, two hard, three built.**
There is a long day only when a session is left over once the hard days are seated. Same one
discipline over for the long ride, plus a ride ceiling that was `3` in TWO places.

⚠️ **Known and unsaid:** one run + one hard run builds ~3.5 mi against a 12-mile ask. The hard
session is a fixed cost and no easy volume remains to absorb the rest. Structurally correct; nothing
on screen says it. `9d49db9a`, `one-session-week.test.ts`.

---

## D-445 — Abs are a `single_leg_core` movement; the add-abs slot is deleted (2026-08-19, Michael)

> ⚠️ **RENUMBERED FROM D-431 ON 2026-08-20 — A COLLISION, NOT A TYPO.** A different D-431 was issued 2026-08-13 and is above in this file; this entry was written into the FROZEN part 2 without seeing it. The 2026-08-13 entry keeps D-431 because code and specs already cite it with that meaning; this one moved. A citation of D-431 dated before 2026-08-20 means the OLDER entry.

**It was a SECOND control for a choice the slot already offered, and the only one of the two that
charged half the reps.** Hanging Leg Raise, Ab Wheel, Weighted Sit-Up and DB Side Bend are all
`category: 'single_leg_core'`, and `BALANCED_WEEK.bench` already defaults to Hanging Leg Raise. The
add-on paid for its extra movement out of the same budget (`splitRepsForAbs`: 30 -> 15/15), so an
athlete who wanted abs traded away half their leg work to ask a question they could have asked free.

⚠️ **A stored `abs` on an old goal is DROPPED on read, not honoured** — the same "nothing strands"
rule the file applies to an unrecognised focus chip. Honouring it would mean two athletes on
identical visible settings getting different rep totals from a control one of them cannot see.
`4bf31385`.

---

## D-446 — An untested pull-up max takes the conservative dose (2026-08-19, Michael)

> ⚠️ **RENUMBERED FROM D-432 ON 2026-08-20 — A COLLISION, NOT A TYPO.** A different D-432 was issued 2026-08-13 and is above in this file; this entry was written into the FROZEN part 2 without seeing it. The 2026-08-13 entry keeps D-432 because code and specs already cite it with that meaning; this one moved. A citation of D-432 dated before 2026-08-20 means the OLDER entry.

`weeklyVolumeFor(null)` returned the full **100 chins a week**, citing §0h — *"unknown degrades to
UNCHANGED, never to a guess at a smaller one."* That is right on a field whose shipped behaviour is
the SAFE one and backwards here: **100/week IS the maximal prescription.** §0h's actual rule is that
an unknown must not buy the ceiling.

⚠️ **`untested` and `on_ramp` dose identically and are kept apart.** `on_ramp` says *"no clean rep on
file"* — a claim about the athlete, and an untested one may have fifteen.

⛔ **AND THE `Number(null) === 0` TRAP WAS LIVE IN TWO MORE PLACES** — the component memo and the
library's cap parse both read a stored null or blank as a TESTED ZERO, which would have defeated all
of the above and hidden the test prompt. **Third field in this codebase bitten by that trap.**
`d0b53e02`.

---

## D-447 — Hidden state cursors are an architecture defect, not a convenience (2026-08-19, Michael)

> ⚠️ **RENUMBERED FROM D-433 ON 2026-08-20 — A COLLISION, NOT A TYPO.** A different D-433 was issued 2026-08-13 and is above in this file; this entry was written into the FROZEN part 2 without seeing it. The 2026-08-13 entry keeps D-433 because code and specs already cite it with that meaning; this one moved. A citation of D-433 dated before 2026-08-20 means the OLDER entry.

`activeHardSlot` held *"which hard session are the shared controls editing"* and **nothing on screen
said which.** A chip row set it; the club checkbox, the session sub-question and the Schedule step's
day picker all read it — so one visible control edited two different pieces of data depending on an
invisible background toggle, and an athlete with two hard sessions picked BOTH days through ONE row.
Michael: *"that is exactly how users accidentally delete their own inputs without realising it."*

**The replacement is containment, not compression:** every hard session renders its own card and its
own labelled day row, each writing its own loop index. There is no shared cursor, so there is nothing
to desync.

⚠️ **It was hiding a second bug.** `weekDayRoles` took ONE `hardDay`, so the week preview lettered
whichever session the cursor pointed at and left the other blank. It takes `extraHardDays` now.

⛔ **The generalisable rule:** if a control's target is not visible on screen, the athlete cannot tell
a deliberate edit from an accidental one. `bafb67bb`.



---

## D-448 — `PlanWizard` is retired; `NonRaceBuilder` is the only client front door (retired `b0fecb8f`, **WRITTEN 2026-08-19, LATE**)

> ⚠️ **RENUMBERED FROM D-434 ON 2026-08-20 — A COLLISION, NOT A TYPO.** A different D-434 was issued 2026-08-13 and is above in this file; this entry was written into the FROZEN part 2 without seeing it. The 2026-08-13 entry keeps D-434 because code and specs already cite it with that meaning; this one moved. A citation of D-434 dated before 2026-08-20 means the OLDER entry.

⛔ **THIS DECISION EXISTED ONLY IN A COMMIT MESSAGE FOR WEEKS, AND THAT IS THE POINT OF THE ENTRY.**
`b0fecb8f cleanup: retire PlanWizard — the goal lifecycle is the only front door (D-429)` shipped the
work and cited a number **that was never written to this log** — it ended at D-427. `CLAUDE.md` warns
about exactly this by name (the D-288 story): *"a decision that lives only in a commit message does
not exist."*

⛔ **AND THE PHANTOM NUMBER HAS SINCE BEEN REUSED.** [D-429] was issued on 2026-08-19 for the
intensity/threshold allocation rule, so every surviving citation of "D-429 retired PlanWizard" now
resolves to a decision about which sport carries a block's top-end session. Two of those citations
have been removed (`GAME-PLAN.md`, and the `CAPABILITY-MAP` rows); the commit message cannot be
changed and is why this entry names it.

**The decision itself:** the client had a third plan-building door. `PlanWizard.tsx` called
`generate-run-plan` **directly** — writing a plan with no goal row and no `activate-plan`, bypassing
the `create-goal-and-materialize-plan` lifecycle every other path goes through. It is deleted.

**The front doors as of today, verified on disk:**

| component | lines | status |
|---|---|---|
| `NonRaceBuilder.tsx` | 5,843 | **THE one.** All three Focus cards open it, deep-linked by which was tapped. What the 2026-08-18/19 rebuild touched. |
| `ArcSetupWizard.tsx` | 2,969 | **LIVE and not a rival** — multi-race season planning, reached from a link inside `NonRaceBuilder` and a State-tab nudge. ⛔ Do not retire it. |
| `PlanWizard.tsx` | — | **GONE.** |

⚠️ **WHY IT MATTERED THAT THE MAP STILL LISTED IT.** `CAPABILITY-MAP.md` is the file `CLAUDE.md`
orders every session to read FIRST as the anti-rebuild index, and it described the dead door as live
— with a file, a line (`:858`), a route (`App.tsx:55`) and a real-sounding hazard. A session auditing
plan lifecycle would have chased a ghost for hours. **An anti-rebuild index that lists something gone
is worse than one that omits it:** the reader concludes "already built" and stops looking.

---

## D-435 — The library-plan baker is retired, and `CLAUDE.md` was still telling sessions to run it (2026-08-19)

Found while clearing the runway for the scheduler session. `LibraryPlans.ts`,
`plan_bake_and_compute.ts` and the `bake` / `plan:validate` npm scripts have **zero references
anywhere in the repo** — file, caller, script, all gone.

⛔ **THREE DOCS STILL DESCRIBED IT AS PRESENT**, in three different flavours of wrong:

* `CLAUDE.md`'s **Commands** block listed `npm run bake[:all]` and `npm run plan:validate`. A session
  running them gets script-not-found and no way to tell a retired capability from a typo.
* `CAPABILITY-MAP`'s Library-plans row read **PARTIAL** with a live `file:line` and *"the baker is
  disabled"* — which reads as a feature waiting for a flag.
* The **anti-rebuild list** said *"a plan baker… exists, works offline"*. That is the list whose
  entire job is stopping a rebuild, asserting something is built that is not.

⚠️ **If library plans are ever wanted again, that is a BUILD, not a re-enable.** Recorded so the next
reader does not go looking for the switch.


---

## D-436 — A threshold pace is bounded by the athlete's own measured easy pace (2026-08-20)

A threshold pace **slower than the athlete's easy pace** reached a real screen: easy 12:35/mi,
threshold 14:44/mi. `fe0d8b0f` fixed the learner. This is the question underneath — when the
measured value abstains, what answers.

**THE RULE, ONE PLACE (`src/lib/run-threshold-from-easy.ts`):** an *inferred* threshold must sit in
the band a MEASURED easy pace implies — `easy ÷ 1.19`, ±4% — and still be faster than easy. Outside
it, the easy-pace derivation stands in and the source changes with the number.

- **The ratio is the app's own**, measured off `PACE_TABLE` as `base ÷ steady`: 1.1880–1.1961 across
  all 21 rows, a **0.69% spread** from a 30-vdot beginner to an 80-vdot elite. That spread is why a
  flat constant is defensible where a table lookup would drag a VDOT — and therefore the 5K — back
  into the one derivation whose purpose is to not need the 5K.
- **The tolerance is `RUN_PACE_DIVERGENCE_THRESHOLD`**, now exported from
  `generate-combined-plan/science.ts` rather than copied. ⛔ It is load-bearing, not decoration: a
  bare 1.19 bound is *tighter than the table it came from*, and a fixture sweep caught it rejecting a
  slow athlete's perfectly fresh 5K by three seconds per mile.
- ⛔ **INFERENCES ONLY.** A measurement and a number the athlete typed are never clamped. Disagreement
  with an assertion surfaces as the 5K retest flag, never as a silent edit.
- ⚠️ **Founded on the LEARNED easy pace, or one the athlete CHOSE — never `effort_paces.base`**,
  which is the same VDOT lookup off the same typed 5K. That would bound the 5K with itself.

**RIPPLE.** `resolveCurrentRunThresholdPace` gained a `derived-from-easy` tier, and its wizard tier
now reads `effort_paces.steady` — the key the app actually writes. It had read `threshold`/`z4`,
which **nothing writes in either direction**, so that tier had never once run; its tests were green
against a shape the fixtures invented.

Supersedes nothing. Extends D-285/D-287.

---

## D-437 — Run threshold is MEASURED by fitting best efforts, not by averaging activities (2026-08-20)

`src/lib/run-critical-speed.ts`. The learner took any run whose AVERAGE heart rate sat near threshold
and medianed its AVERAGE PACE over the whole activity — so a hill session's walk-backs were folded
into "threshold pace". **Averaging an activity cannot measure a sustained effort; looking inside it
can.** The bike already learns FTP from a best 20-minute window and the swim already fits a
critical-speed curve; running was the last discipline still averaging.

The pace curve (`buildRunPaceCurve`) samples fixed DURATIONS — 3/6/12/20/35 min — the shape the
bike's power curve already uses. Distance-based bests cluster and produce no duration spread.

⛔ **THERE IS NO HEART-RATE GATE, AND REMOVING IT WAS THE FIX.** The first version required 92% of
threshold HR — the one anchor a base-training athlete does not have. On the real account threshold HR
was a guess at 146, so the gate sat at **134** while that athlete's easy runs run 133-141: it would
have admitted his easy running as threshold work. The alternative was a third "is this anchor real"
check — a guard per consumer, forever. Critical-power modelling does not HR-gate; the filter is the
curve's own shape, and all of it was already present: monotonic, R² ≥ 0.95, faster than measured easy
by more than the ±4% band, efforts from **different sessions**, and no net descent past 1%. None of
those needs anything outside the athlete's own runs. HR now earns confidence instead of gating.

⚠️ What this measures is **critical speed**, which sits a few percent above maximal lactate steady
state. The app already made that call for swim, so this is consistent with precedent rather than a
new claim. ⚠️ **No backfill (Michael's call)** — curves are written at analysis time.

---

## D-438 — Anchor reads are ENFORCED, not documented (2026-08-20)

`TRUTH-MAP §5` already said a reference anchor is read through its resolver and never off the raw
column. Nothing enforced it, so every new surface grew its own chain — the "ten different things"
problem stated exactly. `_shared/anchor-resolver-lint.test.ts` froze **49** raw readers; the ledger
MAY ONLY SHRINK and the test fails the build on a new one. **Now 32 — 26 legitimate, 6 swim.**

Routed: the SPINE (`compute-snapshot` read the learned threshold with **no confidence check at all**,
feeding State's race projections), the Arc's coach text (raw while the coach's own code resolved —
two paces in one function), race readiness, the marathon builder, the goal builder's seed and limiter.
Categories `writer` / `receipt` / `presence-gate` / `reconciler-input` / `comparator` /
`measurement-source` / `output-key` / `prompt-text` record the legitimate ones so the count stays
honest rather than silenced. ⛔ It earned itself the same day: a new invariant check was written as a
raw read and the ledger failed the build on brand-new code.

---

## D-439 — Heart-rate anchors and zones are PER SPORT (2026-08-20)

`resolveCurrentLthr` gained a `sport` option — the pattern `resolve-current-max-hr` already set —
rather than a second `resolveCurrentRideLthr`. The bike had **no owner** and three private chains,
none with the D-284 sample-count gate.

⛔ **THE ZONES MATTERED MORE THAN THE ANCHOR.** One `zones` array built from `runLTHR || rideLTHR`
(run PREFERRED) was **priority 1 in `compute-workout-analysis` for every discipline**, above every
resolver. Rides were binned against RUNNING zones — cycling HR sits 5-10 bpm under running at the
same effort, so each ride landed a zone easy and the time-in-zone the 80/20 read rests on was wrong.
Now per-sport arrays; the shared one stays as the fallback because Strava genuinely has one set per
athlete.

⚠️ `configured_hr_zones.threshold_heart_rate` is **CLOSED FOR READERS, OPEN AS A DATA MODEL** — see
TRUTH-MAP #8. `TrainingBaselines` still writes it (now only when one sport has an anchor, so it
cannot be the wrong sport's). **Do not shorten that to "closed."**

---

## D-440 — A number nobody DETECTED may not anchor anything (2026-08-20)

`LearnedMetric` gained **`is_estimate`**, set by every branch that fills a hole instead of measuring.

The distinction existed only in prose, so readers inferred it from `sample_count === 0` (D-284) — and
the two branches that mean the same thing disagreed under that proxy. `88% of observed max` wrote
`0`; `95th percentile of sustained efforts (no clear threshold data)` wrote **18**, the count of the
efforts it took a percentile OF. Both are non-detections; one passed every gate.

⛔ **THE COST, OBSERVED LIVE.** The percentile branch published 146 bpm and anchored the easy band at
89% × 146 = **130**. That athlete's easy runs sit at 133-141, so ZERO qualified and
`run_easy_pace_sec_per_km` went null. With no easy pace there is no ceiling on the threshold-pace
filter either, so contaminated candidates published at **12:51/mi** — slower than his own easy runs,
labelled "Measured from your runs". **One mislabelled number took out four layers.**

⚠️ **Q-171 IS NOT REVERSED.** *Weak but MEASURED still anchors — the gate is invented-vs-measured, not
weak-vs-strong* stands, and its test is untouched. What changed is that a non-detection now declares
itself instead of being guessed at from a count.

**And the second half:** a pace "at threshold HR" now requires a threshold HR that was DETECTED.
Measuring a real pace against an invented reference is Law 2 one layer up — harder to spot, same lie.

---

## D-441 — The run offers its threshold test; the bike learns its anchor from the effort it already found (2026-08-20)

**Abstaining is correct — Garmin greys the number out too. Abstaining SILENTLY is not.** The bike card
scheduled an FTP test and the swim card explained its 400/200 protocol; the run offered nothing, while
the 12-minute time trial had been built end to end for months (`materialize-plan:1334` expands it,
`compute-workout-analysis` finds the ~720 s lap). Built, tested, unreachable. The button is gated on
the threshold being unmeasured so an athlete who has one is never nagged. ⛔ `run_test` is the
contract, not the name.

Its result now obeys the invariant, writes `as_of` (it wrote only `tested_at`, so the app's most
authoritative reading was undated to every reader), and declares `is_estimate: false`.

**THE BIKE.** Its threshold-HR filter required a WHOLE RIDE to average 85-95% of max — which real
riding never does; you coast, you descend, you stop. Verified live: 20 rides, high-confidence max HR,
**zero** candidates, and `90% of observed max (estimated)` published at `sample_count: 0`. The effort
was already identified — `power_curve['20min']` is what FTP comes from — so the power curve now
carries the HR **during** each window, and FTP and threshold describe one ride.

⚠️ And the card says when an FTP rests on easy riding, reusing that same already-computed signal.

## D-442 — The Standing Plan: one week, a what's-leading dial, each frame one author's table whole (2026-08-22 → 24)

> **⚠️ ONE BULLET BELOW IS SUPERSEDED BY [D-450](#d-450--dial-his-bands-our-dial--the-standing-plan-accessory-screen-2026-08-24) (2026-08-24, same day).**
> The accessory half of the "Program owns lifting-day count" bullet — *"Focus chips (+ Core,
> standing path only) bias HYP slots; picks placed by what they train (day groupings dropped — flat
> Preferred-movements list on this path)"* — **no longer describes this path.** That screen was still
> Wendler's nine picks with the groupings hidden, and three of them could never place in this frame.
> It is replaced by six picks named after the frame's own cells (`ComposeArgs.slotPicks`) and an
> **Dial** that moves VOLUME instead of biasing a cell; the B2 cell-bias stands down
> whenever the Dial is set and the `core` focus chip is deleted from the Get Stronger screen.
> Everything else in this entry stands, and Get Stronger's own picker is unchanged.

**The consolidated record of the pivot + build weekend.** Full rulings:
`DECISIONS-2026-08-21-standing-plan.md`, `DECISIONS-2026-08-22-standing-plan-pivot.md` (+ p247
corrections recorded there), `DEVICE-FINDINGS-standing-plan-2026-08-24.md`. This entry is the
one-page version so the number exists.

- **The All Rounder is OUT as the base** (hardest to software — no primary lifts, every weight
  through the ratio table outside its stated range — and "for the ambivalent"). The product is one
  week with a WHAT'S-LEADING dial over Viada's own program tables: Strength + 5K (strength-leading,
  BUILT), Strength + Half-Marathon (endurance-leading, future), Cycling: Base (bike, future).
  Holding = the frame's own taper column. No week ever blends two authors' structures.
- **One working number, Viada's** — 96% of a two-formula-average predicted 1RM (p215), NEW config
  key, never touching `training_max` (85%, three live readers). Week 1 IS the test (p215 as guided
  sessions, seeded from baselines); skip only on logged evidence ≤42 days; typed maxes never skip.
- **Progression = double progression on his ranges + field-standard stall handling** (hold on miss,
  ~10% back-off on confirmed stall). NOT Wendler's signature system: the wave, TM and AMRAP are out
  of these plans. Wendler keeps three jobs: verdict machinery, the beginner rung, deload permission.
  Rate anchors are PER-FRAME (p247 1%/3wk, p251 1%/4wk). ME loads at 90% of the working number,
  reps open 1-5 (inverse pairing; reps.hi × pct.hi is pinned impossible). ME sets ladder 1→2→3,
  earned (N=2 clean), OURS.
- **Sport-slot assignment** (his p275 permission, our cross-frame transfer): 4 slots, athlete
  assigns sport per slot; hard-on-bike when strength leads (p280); athlete's per-slot answer AND
  variant picks travel and are STORED on the plan (restate identity). Within-family variants are
  the athlete's, from the library's own archetypes; engine default genuinely rotates weekly (OURS).
- **Swim = ADD-ON, never a slot** (1-2 easy/technique, cap 2, off by default) — supersedes slice
  4's easy-slot substitution. **Run ask caps at 20 mi** (regular-runner band; above it links to the
  future endurance-leading block). **Program owns lifting-day count**; athlete owns exercises.
  Focus chips (+ Core, standing path only) bias HYP slots; picks placed by what they train (day
  groupings dropped — flat Preferred-movements list on this path). Pull-up progression toggle
  hidden here: pull-ups are a main lift in this frame.
- **The old generators are CLOSED FOR REPAIRS** (banners on generate-run/tri/combined);
  `generate-strength-plan` is the open path. "Definition" tier deleted; "5/3/1" and "Wendler"
  removed from athlete-facing copy on this path (trademark + no longer true).

**Verified:** wizard end-to-end by Michael (browser, three exports); engine by 213+ tests,
mutation-tested through session A; Get Stronger byte-identical (f7ece1aa) across every slice.
**He is training on the block (started 2026-08-24). The test-save → weeks-fill chain on a device is
the one remaining acceptance step.**

## D-449 — A test week is RULED as taper but PRINTED as "test" (2026-08-24)

Week 1 of the Strong Focus block read "Week 1 • Taper" on the Today header and "week 1 of 12 ·
taper" on State. Cause: `normalizePhaseKey` (D-322) maps the test family (`test`/`retest`/`tm
test`) to `taper` — correct for BEHAVIOR (arrive rested, loosen targets, no progression) — and
every surface printed that rules word.

**The split:** `phaseDisplayWord` (`_shared/strength-profiles.ts`), beside `normalizePhaseKey`,
same table, other question: what to call the week out loud. Diverges ONLY on the test family
('test'); race-family names still print 'taper'. `resolveBlockIdentity().phaseWord` now reads
through it, so get-week, workout-detail and coach all correct from one source. Pinned in
`strength-phase-vocabulary.test.ts` + `block-identity.test.ts`.

**Two cache consequences, both handled:** (1) get-week persists generated `weekly_summaries` into
plan config, so a cached bare-phase-word focus is now RE-RESOLVED live at read time (composer-
written richer focus text untouched) — no DB write needed; (2) coach payloads cache the word, so
COACH_PAYLOAD_VERSION bumped to 170. Commits `efb4e3f2`, `4c2c125c`; all 12 `_shared` importers
redeployed. Device-verified on Today header + workout detail; State pending one fresh open.

## D-451 — Hard sessions are opt-in, up to two, default zero (2026-08-25)

Michael's ruling. The endurance-week screen presented **four sessions to configure**, two of them
hard and both pre-shaped. They are now **something the athlete ADDS**, up to two, and the default is
**none** — the week's miles and hours come out at easy pace and recovery.

**His line, verbatim** (`HARD_SESSIONS_OPT_IN_LINE`): *"Pick up to 2 hard sessions a week to maintain
your top-end fitness. Your miles and hours default to easy pace and recovery if none is picked — which
may improve your lower body lifts."* ⚠️ It opens with an imperative and **still passes the voice gate
unaided** — the banned list holds `stay / keep / try / consider / focus`, not `pick`. It is asserted
CLEAN rather than exempted; an exemption nobody needs is one that later hides a real violation.

### The composer: convert, never add

An unpicked hard slot **converts to the frame's own easy session**. The week keeps its four sessions
— the count is the frame's and nothing here moves it, which is pivot §2 and the same shape the taper
column already uses (it holds its count and drops the level rather than deleting a day).

`SportMix.slots` gains a third value, and the distinction is load-bearing:

| value | meaning |
|---|---|
| **key absent** | nobody asked — the slot keeps the frame's own hard run. Every caller that predates this screen. |
| **`'run'` / `'ride'`** | the athlete added a hard session there. |
| **`'none'`** | the screen asked and the athlete added nothing — the slot converts. |

⚠️ **Collapsing absent and `'none'` would strip the intensity out of every plan built by a generator
that never had this screen.** `slotsForEngine` therefore SENDS `'none'` for an unadded hard slot
rather than omitting it — omitting would have quietly rebuilt the old week.

⛔ **The conversion target is the column's own easy slot, passed in — not a literal.** A first draft
hand-wrote `run_vt1 / L1 / 'steady'` and the composer threw *"archetype steady is not offered for
run_vt1 at level 1"*: family and level right, archetype invented. The library owns which archetypes a
family offers. ⚠️ And **not** the taper's target — the taper holds the hard family at level 1, which
is a quieter version of intensity, and an athlete who declined intensity is asking for easy running.

### Two defects the ruling exposed, both of which would have shipped

1. ⛔ **`hardRunBeforeMeLower` read hardness off the FRAME's slot.** Correct while an assignment only
   ever changed the SPORT; a declined slot changes the **family**, so the frame still called day 1
   hard after the week had converted it to easy running and the lower-body haircut would have fired
   on a session that is not in the plan. It now reads the ASSIGNED slot. **Michael asked for this
   verified in a fixture rather than assumed — assuming would have shipped it.**
2. ⛔ **The screen's live lifting rate gated on `hard1 && hard2`**, so it would have read *"pending"*
   forever on exactly the week the ruling makes standard. It now gates on the REQUIRED slots. ⚠️ Zero
   hard sessions scores the BEST rate (`liftingRateTier` counts hard RUNS → `hard_on_bike`, 1% every
   3 weeks), which is the same direction his own copy states.

**The accessory tier claim is true and is now pinned** (`endurance-tier.test.ts`): at the same hours,
zero hard sessions never buys a thinner band than one or two, and a light week with none reaches
`strength` (40-50). ⚠️ The hours still bite — nine easy hours is still `survival`.

### The decision leads the screen (Michael, from a device screenshot)

The hard-session block sits **first, directly under the subtitle** — his copy line, any added
sessions, then the add control. Recovery and long move below it. **It is the only decision on this
screen**; the other two are passive cards, one sport tap each, and with them on top the one thing the
athlete is there to choose sat underneath them and below the fold on a phone.

⚠️ **The order has now moved twice, for different reasons.** The first pass separated the two KINDS
of row — opt-in versus the frame's own — which was right; it then put the frame's own first, which
reads as *"here is your week, and also…"*. The kinds stay separate; what changed is which block
leads. ⚠️ The added cards sit BETWEEN the copy line and the add control: below the button they read
as the next empty one.

### The dismiss is on the card header (Michael, from a device screenshot)

*"+ Add a hard session costs a curiosity tap too much."* The only exit was a text link at the BOTTOM
of the expanded card, so an athlete who tapped Add to see what it was had to open the card, scroll it
and read for the way out. The dismiss is now an **X on the card's header row, visible whether the
card is expanded or collapsed**, and the bottom link is deleted.

⛔ **It is a sibling of the disclosure button, not inside it.** A button nested in a button is invalid
HTML and the inner click would toggle the row on its way out — the card would collapse and vanish in
one frame, which reads as a glitch rather than a dismissal. The header is a flex row holding both.

⚠️ **"Returns to exactly its pre-tap state" includes which row was open.** Adding a session opens it,
which collapses whatever the athlete already had open; dismissing straight back out would have left
that card closed — a curiosity tap quietly costing them their place. `restoreOnDismiss` remembers the
previously-open row and re-opens it, and is cleared the moment the athlete touches any row, so it can
never restore a stale one later.

### The UX: Add / Remove, not tap-to-clear

Michael asked whether a second tap on the chosen sport should clear the slot. **It should not.** It
conflates two intents — *"I want the other sport"* and *"I do not want this session at all"* — and a
chip that clears on a second tap loses the session to a mis-tap with no undo and no warning, while
leaving no affordance saying removal is possible at all. An explicit **Remove** is the inverse of an
explicit **Add**, which is the pattern the wizard already uses ("+ Add a run"), and it keeps the sport
chips doing exactly one thing.

⚠️ **An added session opens on a sport the athlete actually has** — `defaultSportForAddedSlot`, which
is `SLOT_OPTIONS`' own order filtered by the mix (`allowedSlotSports`, derived from the posture step's
`posture.run` / `posture.bike`). Ride leads a hard slot when riding is in their week (p280); **Run
leads when it is not, and a run-only athlete is never handed a ride.** It opens on something rather
than empty because a slot with no sport would be a fifth unanswered thing on a screen that just
stopped having any.

⛔ **THAT WAS WRONG FOR ONE COMMIT AND MICHAEL CAUGHT IT.** The handler read `allowedSports[0]`, and
`allowedSlotSports` is built RUN-FIRST — so its order is the POSTURE screen's, not a preference. A
mixed athlete's added session opened on **Run**, the opposite of the frame's own lead, and a ride-only
athlete got Ride by luck of the filter rather than by rule. ⚠️ The fix reads the order from
`SLOT_OPTIONS`, which is also what the card renders its chips in — one owner, so the highlighted chip
and the stored answer cannot disagree. Pinned four ways, including *"same mix, other input order, same
answer"*, which is the assertion the bug would have failed.

⛔ **`hardDays` stopped being positional.** It is now *"the hard sessions the athlete added"* and its
LENGTH is what the tier reads, so an entry's index no longer says which slot it came from. Each entry
carries `slot`, and `hardEntry` looks up by key. ⚠️ Without that, removing the first hard session left
`hardDays[0]` holding the SECOND slot's answer and the row rendered the wrong session's day and
archetype. ⚠️ `syncHardDays` returns `null` for an unadded slot instead of `prev` — returning `prev`
resurrected the session the athlete had just deleted, day and club answer and all.

**Continue is gated on the easy and long slots only** (`REQUIRED_SLOT_KEYS`). Gating on the hard ones
would make the default path unreachable and leave the screen naming two rows as missing that the
athlete deliberately left alone. `unansweredLine` never names a hard session.

**Existing behaviour for athletes who pick 1-2 hard sessions is unchanged**, pinned directly: a hard
run on day one still causes the haircut, a hard ride still does not.

**DEPLOY SET (2):** `generate-strength-plan`, `rematerialize-standing-block`.

### ✅ COMPLETE — PUSHED, DEPLOYED, VERIFIED ON DEVICE (2026-08-25)

**All three states are true for this entry, which is rare enough to say plainly.** Michael opened the
endurance-week screen on a device and confirmed the opt-in model, the add / X controls, the block
order and the copy. **This screen is closed — do not redesign it.**

⚠️ **ONE PIECE OF STANDING DEBT THIS RULING MADE USER-VISIBLE, and it is not a defect in the above:**
there is no mid-block **re-dial**. Endurance volume and hard sessions are answerable in the wizard
only, so an athlete who wants to add a hard session in week 6 has no control for it. That predates
this work; what changed is that the opt-in screen now advertises a choice the athlete cannot revisit.
Filed on `POLISH-PUNCH-LIST.md`.

---

## D-450 — "Dial": his bands, our dial — the Standing Plan's accessory screen (2026-08-24)

Decided by Michael in chat and built, renamed and committed the same day. ⚠️ **This entry is the
only record — the `HANDOFF-` spec it was built from and the `WIP-` restart note were deleted on
commit, per the spec lifecycle.** It replaces the accessory step on the Strong
Focus / Standing Plan path only. **Get Stronger's screen is untouched** — the two now live in two
separate `StepLayout` blocks in `NonRaceBuilder.tsx` rather than in one card with five
`isStrengthFocus ?` forks inside it.

**What was wrong.** The screen was Wendler's taxonomy — push / pull / single-leg-core across three
lifting days — serving a Viada frame that does not share it. Read off `frames.ts` (p246): the week
carries **seven HYP accessory slots, no core slot, and no open compound-pull slot**. So three of the
nine picks could essentially never place, every ab pick could only ride the muscle floor, and the
Glutes and Core focus chips could never fire at all, because `compose.ts`'s `FOCUS_MUSCLES` bias only
searches a cell's own options and no cell offers a glute- or core-prime movement.

**The seven picks** (`_shared/standing-plan/accessory-picks.ts`, `VIADA_PICKS`) are named after the
frame's own cells and the day tags are **read out of `FRAMES` at call time**, not transcribed beside
it: Dumbbell press (thursday), Isolation push (monday), Isolation pull ×2 (monday, thursday),
Single-leg (tuesday · friday), Quad isolation (friday), Core movement (no slot — it names what the
week's core minimum is filled with). A pick with no `frameDay` fills its cell on **every** day the
frame carries it, so `ComposeArgs.slotPicks` is a different mechanism from the flat `accessoryPicks`
pool rather than a tidier spelling of it — the pool's `unplaced` set is single-use by construction
and could not express a cell that occurs twice. The flat pipe still travels alongside; it is what
carries the core pick and the Dial rows to `fillMuscleFloor`'s `prefer`.

### The name, and the working title it replaced

**The row is called "Dial."** Michael ruled it 2026-08-24, **after the build and before the first
commit**. It was built as **"Aesthetics" — a working title only.** ⚠️ Nothing had persisted: no goal
carried a `viada` block yet, so the storage keys were renamed with it (`dial`, `dial_rows`) rather
than left as a legacy spelling to read forever. **That was the cheap moment and it was taken; a
migration would have been the alternative.** If "aesthetic" appears anywhere on this path now, it is
a miss rather than a compat shim. *(The `Upper Aesthetics` PROTOCOL under
`shared/strength-system/protocols/` is a different, older thing and keeps its name.)*

The supporting line is **"Dial in the areas you want to focus on."** — Michael's wording, verbatim.
⚠️ **It trips the voice lint on `focus` and ships anyway**, on the standing override already on
record for "Speed focus" / "VO2 max focus". The override is **pinned as an expected violation** in
`strength-focus-copy.voice.test.ts`, not left as a comment — a comment cannot run, which is the
lesson that file exists to carry. The gate stays live for every other line, and a reword of this one
fails the test rather than sliding through. The word collision the rename was worried about is with
the endurance screens' focus **control**; a verb in a supporting line is not that control.

### The hold defect — a row may not prescribe a dose its movement cannot express (2026-08-24)

**Seen on a device: the Core focus rows opened on Plank and the plan printed "3 x 8-10" under it.**
A static hold has no reps. It is not a copy slip — the row asked the athlete for something the
movement cannot express.

**The axis already existed and was not being asked.** `src/lib/exercise-role.ts` has classified this
since the strength language spec: `isometric` → `loggedAs: 'time'`, `mobility` → `'done_or_time'`,
`carry` → `'distance_or_time'`. The fix is a new **accessor over that vocabulary**, `isRepPrescribable`
in `accessory-dosing/ledger.ts`, sitting next to `movementsForMuscle` — **not** an `isHold` flag on
`EXERCISE_CONFIG`, which is the second-vocabulary failure CLAUDE.md opens with. ⚠️ An unmapped name
resolves to `loaded_accessory` → rep-based → **stays offered**; the predicate excludes only what is
known to be measured in time.

**Four places had to change, and finding the fourth is the lesson:**

1. `dialRowOptions` — the picker offered the raw pool, whose core ranking leads with plank, side
   plank, copenhagen plank and two entries literally named "core work". Now filtered to rep-based and
   ordered by **`DIAL_ROW_LEAD`**, which is p223 verbatim for core (hanging leg raises, crunches,
   V-ups, dynamic plank variants, ab wheel rollouts) and ours for glutes.
2. `fillMuscleFloor`'s **floor** loop — prefers a rep-prescribable candidate. ⚠️ A **preference, not a
   filter**: a muscle whose only reachable movement is a hold still gets filled, and
   `FloorAddition.repPrescribable` travels with the row.
3. `compose.ts` — `reps: add.repPrescribable ? '8-10' : HOLD_PRESCRIPTION`. **30-45s is ours**; p223
   lists "dynamic plank variants" and prescribes no duration anywhere.
4. ⛔ **`fillMuscleFloor`'s TARGET loop had its own copy of the choice and did not get the fix when
   the floor did** — so *"Plank — 3 x 30-45s. Your core focus."* survived a full round of this. Two
   searches over one candidate list, thirty lines apart. Both now carry a pointer to the other.

**Hanging Leg Raise leads the core list only where the athlete declared a pull-up bar** — it gates on
`pull_up_bar` and is correctly absent otherwise, where Crunch (also p223) leads. ⚠️ Worth recording
because it cost time twice: `canPerform` takes the **UI equipment labels** ("Pull-up Bar"), not the
raw gear tokens, so a fixture written with `'pullup_bar'` silently owns nothing and every gated
movement vanishes.

### The Core chip extends the core pick — it never introduces a third movement (Michael)

The screen had **two core controls** — the "Core movement" pick and a Dial row picker — and the built
week carried both answers plus a floor row: **three core movements, two of which the athlete never
chose.** The Dial row picker is removed for `core` (`dialRowChips` excludes it), a stored
`dial_rows['core:*']` is dropped on read, and the chip line names `picks.core`.

**And the composer's target loop is capped at two distinct movements per muscle: the pick, plus at
most one complement, then repeats on other days.** ⚠️ The cap alone was not enough — the counter had
to be **seeded from what the week already holds**, because the floor runs first and places the pick;
an empty counter meant the target loop believed the muscle had nothing and added two more on top.
⚠️ `alreadyPrescribed` forcing variety is **right for the floor** (filling a gap by repeating adds no
variety) and **wrong aimed at a target** — "more of what I asked for" is what the control says it
does. Applied to every chip, not just core: the same sentence reads true of Glutes, and a rule that
held on one chip only is the asymmetry that invites a third movement back.

### The copy pattern — this screen's standing rule (Michael, 2026-08-24, from device screenshots)

**(a) Inline copy is ONE LINE PER ELEMENT — what it does, never how it works.** Any deeper
explanation (progressive overload, why volume moves, the recovery arithmetic) lives behind an **(i)
info affordance or an expandable row, never inline.** ⚠️ **The (i) is NOT built and was not built
this round.** It gets built if and when a screen actually needs one — an unbuilt drawer is not a
place to put a paragraph you did not want to cut.

**(b) When a drawer IS built, its content is AUTHORED and STATIC** — written copy, traceable to a
page (Viada p086, p218, p223), the same as every other line in the app. **Never LLM-generated, never
generic training-blog filler. If a fact cannot be cited, it does not go in the drawer.**

**And no engine vocabulary reaches the athlete.** "Slot", "cell", "the muscle floor", "the
pull-back", "column", "frame" are how this app talks to itself. The screenshots that triggered this
round had **"slot" in four places**, including a sentence opening *"The week has no glute slot"* — a
true statement about a data structure and gibberish about training.

**What changed on the screen:**

| element | was | is |
|---|---|---|
| subtitle | "The programme owns the slots. You pick what fills them." | "Every day focuses on a compound lift. The additional accessory fine-tunes the muscle work." |
| "Dial" heading | `text-sm` label weight | `text-[17px] font-semibold` section title, sub-line under it |
| per active chip | a three-clause paragraph (days, dose, pull-back) — **two chips gave two paragraphs** | one line: *"Glutes — extra Hip Thrust sets on your lifting days, toward 8-12 a week. Light weeks carry less."* |
| cap note | "…seven to nine work sets, and past fourteen in a session…" | "Two at a time — past that the lifting days get big enough to cost the next day's run." |
| core note | source + missing slot + "the four movement patterns" | "This pick is the movement your weekly core work uses." |
| dose line | "sets of 6-12" — **contradicted the rows' "3 x 8-10" one scroll away** | "Accessory sets are 8 to 10 reps with a rep or two left in the tank." |

⚠️ **"Light weeks carry less" is the pull-back and it is not decoration.** A deload week, or an
athlete whose LOGGED running has already earned an extra easy session, gets visibly fewer added sets
than the chip implied; unsaid, that reads as a broken control. What was cut from it is the clause
naming *which* branch — **the wizard cannot know**, because the advanced tier gates on demonstrated
running the server reads out of logged history and a number typed into an intake box is not that
fact. The built block still states the branch in the indicative (`dialDose().pullBack`), where it is
known.

⚠️ **The dose line was kept rather than deleted, and that is a judgement call.** The rows print
"3 x 8-10" only for the Glutes and Core extra rows, so this is the only place the seven picks' own
dose is stated; deleting it would have taken the RIR instruction off the screen entirely. Reversible.

**The copy moved to the client.** `dialSentence`, `CORE_IS_NOT_A_FRAME_SLOT` and `DIAL_PULLBACK_LINE`
lived in `_shared/standing-plan/accessory-picks.ts` and **no edge function ever read one** — so every
copy tweak was a change to a file four edge functions bundle. They are now
`src/lib/dial-copy.ts`, gated by `src/lib/dial-copy.test.ts`, which runs every rendered line through
`voiceViolation`, asserts the one-line-per-chip shape, and **pins the deleted phrases as deleted**.
`dialDose` stayed shared — it is the engine's answer, read by `compose.ts`.

### Isolation pull is TWO picks, and the principle behind it

Michael's ruling, 2026-08-24, on the sub-question the handoff left open. `focused pull_upper` falls
on **day 1 and day 4** and each day now carries **its own pick with its own default** — rear delt fly
on monday, curls on thursday (`iso_pull_a` / `iso_pull_b`, scoped by `ViadaPickSpec.slot.frameDay`,
resolved by `pickKeyForSlot(category, pattern, frameDay)`).

**The principle, and it generalises past this screen: the default layout is balanced by itself. The
Dial is a fine-tuning layer on top of a balanced week, never the source of balance.**
(`LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`.) One pick answering both days put one movement on both — a
week that trained rear delts twice and biceps not at all, or the reverse, off a single dropdown. The
athlete who taps nothing must still get a week that covers what the frame's slots are for; a gap
covered by a chip default is a gap the athlete can re-open by turning the chip off.

**The chips are split with the picks for the same reason:** `shoulders` reaches the day-1 pick and
`arms` the day-4 one, so a chip re-points **one** of the two. Serving both chips from both picks
would let a tap on Arms open curls on both days and hand the balance problem straight back through
the dial.

> ### ⛔ SUPERSEDED 2026-08-25 — `single_leg` **IS** SPLIT. Everything in this paragraph is history.
>
> Michael ruled the opposite the next day. The two lower picks are now **`single_leg_a`
> (`slot.frameDay: 2`, tuesday, default Bulgarian Split Squat)** and **`single_leg_b`
> (`frameDay: 5`, friday, default Walking Lunge)** in `_shared/standing-plan/accessory-picks.ts`.
>
> **The paragraph below was right about the MECHANISM and it is the reason this cost one table row:**
> `frameDay` was optional by design, `pickKeyForSlot` already resolved day-scoped over day-agnostic,
> `daysForPick` already filtered, the composer already passed `frameDay`, and the gate already
> asserted a day-scoped pick names a day its cell carries. One row plus a `leadWith` head, exactly as
> predicted. No mechanism was built.
>
> **What it was WRONG about is the grounding, and the correction matters:** the reason is **the day**,
> not the movement being "the same answer twice". Both cells are the same `secondary press_lower` —
> they are not different cells. What differs is what they sit under: day 2 is the ME lower day (the
> cell follows a competition deadlift and a heavy primary `press_lower`); day 5 is the DE lower day
> (it follows a dynamic squat and a primary hinge, and also carries `quad_iso`).
>
> ⚠️ **AND THE SPLIT BUYS MOVEMENT VARIETY, NOT MUSCLE COVERAGE — do not carry the pull split's
> argument over.** Every option in this cell is `quadriceps`, checked against the resolved grid pool,
> all 16. Unlike `iso_pull_a` / `iso_pull_b` — where p222-223 files rear-delt work and arm work
> separately and one dropdown genuinely left a muscle untrained — **no muscle was missed before and
> none is newly covered.** Neither row serves a Dial chip, so there is no chip half to keep in step.
>
> **Pinned both halves:** the two rows default to different movements, AND the mix is unchanged —
> same row count, same per-muscle set ledger, same pattern-per-day shape as the one-pick week
> (`standing-plan-accessory-picks.test.ts`, "⛔ THE PIN"). Legacy `slot_picks.single_leg` is orphaned
> by the rename and falls back cleanly to the new defaults; nothing had persisted a `viada` block, so
> nothing was migrated.
>
> *Everything below is history.*

⚠️ **`single_leg` is deliberately NOT split** — it stays one pick across tuesday and friday, where one
movement twice is the same answer twice rather than two different jobs. It is the same shape as
isolation pull and the opposite call, so `frameDay` is optional by design: **omitted means the pick
owns every day its cell falls on.** If a later reading says the two lower days want different
movements too, the change is one table row plus a default — not a mechanism.

The per-day coverage gate in `standing-plan-accessory-picks.test.ts` now asserts every HYP accessory
cell is owned **on every day it occurs**, which the old per-cell check could not see: a half-done
split — owned on monday, orphaned on thursday — passed it.

### His vs ours

**HIS:** the 3-to-4 set band a hypertrophy slot sits in (p218); the 8-to-12 solid and 18-to-20
overreaching weekly bands and the 6-to-8 / 14-plus session ceiling (p086); the 3 × 8-10 at 1-2 RIR
accessory dose (p086); the core movement list (p223); every category and pattern the picks name
(pp218-223).

**OURS:** **using those bands as a steerable dial at all.** Viada defines no focus feature — his
bands describe where volume sits, not a control an athlete turns (`AESTHETICS_DIAL_IS_OURS`). Also
ours: the glutes as a muscle group of their own (`GLUTES_IS_OURS`, pre-existing), the muscle floor
this dial is built on top of (`MUSCLE_FLOOR_IS_ONE_SLOT`, pre-existing), and **which weeks the added
volume comes out of** (`AESTHETIC_PULLBACK_IS_OURS`).

**A tapped chip does three things**, capped at two chips: (1) the picks that can reach the muscle
open on a movement that trains it; (2) that muscle's HYP slots go to **four** sets — the top of his
3-4 band, via `setsFor`, never a fifth; (3) extra 3 × 8-10 rows where the week has room —
`fillMuscleFloor` given a `target` instead of only a floor. Mechanism 3 is what makes **Glutes and
Core real chips at all**; they reach no cell, so an extra row is the only honest way to train them.

**The pull-back moves the TARGET, not the session ceiling, and that was measured.** The first build
held added rows to his six-to-eight "recovers" line on a heavy running week. This frame's lifting
days already carry eight to eleven counted work sets, so no session could take a three-set row and
stay under it — **the chip silently bought zero for exactly the athlete it was written to protect.**
It now aims at two accessory slots instead of the solid band (`dialDose`), and the taper column
gets no added rows at all. A second build let two chips take one session to **exactly** fourteen work
sets, the number p086 names as costly; the target loop is now strictly under it, the same line the
floor already respected. Both are pinned as REGRESSION tests in
`standing-plan-accessory-picks.test.ts`.

**No day tag on a Dial row, and that is a decision** (`DIAL_ROW_DAY_IS_THE_COMPOSERS`).
The handoff asked for one — *"glute focus · tuesday"*. Two projections of it were built and both were
wrong the moment two chips competed for the same room: the composer places a row on the lightest
session **at the moment it places it**, after the muscle floor has run, and how many floor rows there
are depends on the picks, the equipment and the chips. Reproducing that outside the composer means
running the composer, and `NonRaceBuilder.tsx`'s own `hardRoleOf` already rules that out in as many
words. The screen names the rule instead; the day is on the plan one screen later, where it is the
composer's answer rather than a guess about it.

**Storage.** A `viada` block sits **beside** `by_day` in `goals.training_prefs.assistance_picks` —
not instead of it. Get Stronger keeps writing `by_day` and every existing goal carries it, so nothing
is migrated, and **which block a goal carries is how `generate-strength-plan` knows which screen the
athlete saw** without a flag. `normalizeViadaPrefs` validates each pick against its own pool and
falls back **per slot**, so one stale name cannot wipe the other five.

**Superseded on this path:** the B2 focus cell-bias (D-442's slice). `exerciseForSlot`'s bias stands
down whenever the Dial is set, and `generate-strength-plan` stops sending `focus` when a
`viada` block is there — a chip that moves volume does not also need to nudge a cell. The
`core` focus chip is deleted from the Get Stronger screen; it existed only for this path and
`isFocusChip` never accepted it there, so that screen is unchanged. `PICKS_ARE_PLACED_BY_WHAT_THEY_
TRAIN` and the unplaced-pick warning go quiet on the slot path — both explain an inference that is no
longer performed.

**Ripple:** `_shared/accessory-dosing/ledger.ts` (`fillMuscleFloor` grew `target`; `candidatesFor` is
now the exported `movementsForMuscle`; `FloorAddition.reason` splits floor rows from asked-for ones so
the plan never prints *"had nothing else this week"* under a movement somebody named),
`_shared/standing-plan/compose.ts`, `generate-strength-plan`, `rematerialize-standing-block` (imports
the composer), `src/lib/assistance-catalog.ts` (carries the block, does not parse it).

### ✅ COMPLETE AS A BUILD — PUSHED + DEPLOYED, ONE DEVICE CHECK OUTSTANDING (2026-08-25)

**The screen is done and the rulings below are settled.** What is NOT done is reading a BUILT WEEK:
`generate-strength-plan` **v140** and `rematerialize-standing-block` **v18** are live and
version-verified, and nobody has generated a block and looked at the accessory rows. Four things
settle it — core = pick + at most one complement, the two Isolation pull rows differ, the two
Single-leg rows differ, and an A-skip row asks reps only. On the `ENGINE-STATE` banner and
`POLISH-PUNCH-LIST`.

**The three rulings in this entry are standing and carry past this screen:**

1. **The name and the copy pattern.** The row is **"Dial"** (renamed from the "Aesthetics" working
   title before the first commit; storage keys renamed with it, nothing had persisted). **Inline copy
   is ONE LINE PER ELEMENT — what it does, never how it works.** Anything deeper lives behind an (i)
   or an expandable row. ⚠️ **When a drawer is built, its content is AUTHORED, STATIC and
   PAGE-CITED — never LLM-generated, never training-blog filler. If a fact cannot be cited it does
   not go in.** The (i) is not built; that is not a place to park a paragraph.
2. **The balance principle** (`LAYOUT_IS_BALANCED_THE_DIAL_IS_NOT`): **the default week is balanced on
   its own; the Dial is fine-tuning on top of a balanced week, never the source of balance.** A gap
   covered by a chip default is a gap the athlete re-opens by turning the chip off.
3. **Both twice-occurring cells are day-scoped.** `focused pull_upper` → `iso_pull_a` / `iso_pull_b`
   (days 1/4, split on MUSCLE — rear delt vs arms, p222-223). `secondary press_lower` →
   `single_leg_a` / `single_leg_b` (days 2/5, split on the DAY — ME lower vs DE lower, and it buys
   movement variety, not muscle coverage). ⚠️ **See the superseded block above** — this entry
   originally recorded the opposite call on `single_leg`.

---

## D-452 — Athlete pins always win, informed; blocked days beat everything; stacking is the release valve (2026-08-25, Michael)

**The ruling, verbatim intent: "user choice always wins, it's just informed."** One day of chat
rulings, built and deployed the same day. This entry is the only record — both HANDOFF docs
(`HANDOFF-strongfocus-week-screen-ux-2026-08-25.md`, `HANDOFF-your-week-pins-win-2026-08-25.md`)
shipped fully and were deleted on this close per the spec lifecycle.

**The law, in precedence order:**
1. **A blocked day ("Days you can't train") outranks everything** — including the athlete's own tap
   on the same day (the session is rescheduled off it with a note naming the move) and the long-day
   pin in the lifting rotation (`chooseDayMap` scores blocked days above `LONG_RUN_WINS` — reality
   beats preference). Endurance sessions never land on a blocked day; the lifting frame rotates to
   clear one, and sits on one only when no rotation satisfies all pins together — then the note
   says so.
2. **A tapped day is an absolute pin.** The engine re-solves everything unpinned around it. No
   science rule blocks; every rule warns (breach/trade-off tiers off the layer in
   `week-model/resolve.ts` — `resolveAroundPins`, `violationsOf`).
3. **Club = pin.** Ticking club (any session card, including the long-ride card — club can BE the
   long ride, slice 2b) pins the day the club meets. Club on the long card consumes no hard slot
   (`long_session.ownership`, never in `hardDays`). Club typical-duration shortfall vs the plan's
   long target = one informed note.
4. **Stacking is the release valve.** Relocation prefers days already training (club days included)
   before eating the rest day — consolidation (SOURCE p130) applied under pressure.
5. **The two-hard-session cap stays firm at intake** — the one deliberate exception to warn-never-
   block; it is the source's own prescription for a strength block.

**Anchor identity belongs to the frame slot, not the sport assigner.** `anchorRoleOf` reads
`slot.family`; a 16,832-case fuzz harness (`standing-plan/fuzz-builder.test.ts`, permanent, ~35s)
caught the sport-assigner variant silently dropping every hard/club pin whenever rides were in the
mix. Same harness proved: never throws, never empty, always exactly the frame's lift-day count.

**Copy doctrine that rode along:** engine internals stay internal — clearance hours, pairing, and
rest-day doctrine were removed from the athlete-facing rules list ("Use these tips to put your own
week together", 4 plain lines, Michael's wording); they reach the athlete only as concrete notes
when a pick trips one. Pairing is fully silent. `week-rules-copy.ts` keys explainer + warning to one
row so they cannot drift. Book-lifted display names replaced with field-standard terms (Over-unders,
Cut-downs, Threshold, easy wording). Plyo got its own tag + muted magenta (#B9678F) app-wide.

**Rejected:** carving clubs out of blocked-day relocation (blocking your club's day means you can't
make club); a sports-color legend on the week strip (vertical cost); a third hard slot.

---

## D-453 — A hard day leaves 24h on the legs, and a hard RIDE leaves 12h (2026-08-26, Michael)

**What forced it: encoding the book as a test showed the law calling the book's own week illegal.**
The 2026-08-26 audit wrote p246's frame into `standing-plan/fuzz-builder.test.ts` as a check for the
first time. p246 prints a hard endurance session on day 1 and **ME: Lower on day 2**. `COST` gave
`hard_cardio` a 36-hour leg debt, so that adjacency was **12 hours short** — 4,292 of the 16,832
swept shapes came back as engine-placed keystone breaks, and the engine's "fault" was building the
week the source prints.

**p247 does not forbid the adjacency. It PRICES it:**

> *"Monday's run is fairly challenging, given that there is an ME lower session the next day… a 3 to
> 4 percent reduction in working 1RM should be assumed here."*

The compensation is the haircut. A law that outlaws the compensated case has replaced the author.

### 1. `hard_cardio` → 24h (was 36h)

**The 36 was mine and the note beside it invited exactly this** — *"the number is mine and he should
overrule it if he disagrees."* Overruled. At this model's own convention (an exact clearance PASSES,
set by a Sunday long run clearing a Tuesday deadlift at exactly 48h) 24h makes the day after legal
and anything closer than a full day short.

⚠️ **What the 36 was protecting is relocated, not lost.** Its stated case was an evening threshold
run followed by a morning squat — ~12 hours, not 24. This model has no time of day, so it never
measured that; a unit that genuinely couples the two carries `internalGapHours` and is priced on it.
⛔ Do not restore 36 to reach a within-day case that hours-since-midnight cannot see.

**Class B fell from 4,292 to 0.** Every failure surviving the audit is athlete-caused and
warning-side. There is no placement defect in the composer.

### 2. The hard RIDE splits off at 12h — OURS, and labelled

Michael: *"we will not stop them but they should know the cost."*

⚠️ **The source states no figure.** Searched, not assumed. What it states is the **criterion**: p275
allows the cycling work on *"any modality with a power meter that is relatively non-impact"* (rower,
ski erg, air bike), while running work on an elliptical still *"recommends impact with the ground on
at least one day."* **Impact is the axis**, and p247's reduction names a RUN as its cause and is
written only for the run layout.

⛔ **The precedent is this table's own.** The long-effort clearance already splits by sport for the
same reason — `long_run` needs `heavy_legs` clear, `long_ride` needs nothing, because *"the backward
shadow makes for a miserable ride, but it doesn't cause structural failure"* (Michael, 2026-08-18).
The ride keeps the injury-relevant half and loses the quality half. This is that shape applied to
intensity.

⛔ **12 AND 24 ARE THE SAME ANSWER AT DAY GRANULARITY, AND 12 WAS CHOSEN ANYWAY.** Any value in
(0, 24] behaves identically once sessions are clocked at `day * 24`: the same day is short, the next
day clears. **Only ZERO would change a verdict** — measured, it removes 9,717 of the 34,154
athlete-caused breaks, every one of them a same-day heavy-lower-plus-hard-ride collision. Zero was
rejected: it would say a hard ride costs the legs nothing, contradict the row's own reason for
existing (*"hard cardio is systemic fatigue and cannot cost nothing"*), and make a same-day squat and
hard ride silently legal. **12 is the honest number written down, and it becomes a different answer
the day this model grows a time of day.**

### 3. It lives IN the table, not beside it

A second `Load` (`hard_ride`) was rejected on measurement: every construction site in the repo
already carries `sport` on the session, so a second load means two fields that must agree in eighteen
places with nothing checking that they do — and it would have touched `STRESSOR_LOADS`, `buildUnits`'
pairing, `resolve.ts`'s `isEndurance` and `solver-adapter`'s mapping for a difference none of them
care about. Instead `Cost.emitsBySport` is a cell **inside** `COST`, so a reader looking up what a
hard session costs the legs sees both numbers at once. **One reader — `emitsFor` — and it sits beside
the table.** `emitsOf` and `resolve.ts`'s `unmetNeeds` both come through it.

### 4. ⚠️ AN UNVERIFIED CITE, FLAGGED AND LEFT STANDING

`standing-plan/sport-slots.ts` ships an athlete-facing note cited **"Viada p280"** — *"riding hard
does not land on the legs the way running does, so the intensity costs the lifting less."* **p280 is
not transcribed in `SOURCE-viada-hybrid-athlete.md`**; it appears only in the program index, as the
notes page for the three cycling programs. The copy stays as-is until the page is read (Michael may
photograph it). ⛔ **Nothing in this entry rests on it** — the anchor is p275, which is read.

### What moved

- `week-model/model.ts` — `COST.hard_cardio` 36h → 24h; new `Cost.emitsBySport` with `bike: 12h`;
  new `emitsFor(session)`; `CLOSED_2026_08_17` updated so the figure's history is on the record.
- `week-model/resolve.ts` — `unmetNeeds` reads `emitsFor`, never `COST[...].emits`.
- `week-model/model.test.ts` — the "24h on the legs" test asserted the OLD behaviour and its own
  comment named itself as the assertion that would break. Rewritten; a new test holds the ride split.
- `standing-plan/fuzz-builder.test.ts` — the harness was holding a second opinion about the law: it
  built one unit per DAY with `internalGapHours = 6`, which pushes a hard session's debt LATER and
  therefore CLOSER to the next morning's lift, making p246's week read six hours short even at 24h.
  The standing plan prescribes no time of day. Composed sessions now go to the law's own `buildUnits`
  with their days as pins. The p247 carve-out added earlier that day is **deleted** — at 24h the law
  agrees with the book and no exemption is needed.

**Warn, never block, throughout — D-452 unchanged.** The remaining audit classes (34,154
athlete-caused keystone breaks, 4,616 hard-endurance-on-a-lower-day) are sentences the plan does not
yet say, not weeks it should refuse to build.

---

## D-454 — The weekly volume number is real, bounded both ends, and base sessions climb the book's own sizes first (2026-08-26)

**What forced it: a number the athlete typed that the engine never read.** The
`DECISIONS-2026-08-21-standing-plan.md` ruling — *"the volume number stays, bounded both ends"* —
was written and never built. The wizard collected a weekly figure, and the composer sized every
endurance session off the frame alone.

### 1. HOURS, and a NEW key — not `target_weekly_miles` renamed

⛔ **The field was already load-bearing as MILES to five readers.** Writing hours into it made
`target_weekly_miles: 4` mean *four miles*, and the accessory band then computed `hours × pace / 60`.
The new keys are `target_run_hours` and `target_ride_hours` (`compose.ts` `ComposeArgs`), validated
onto the `gsBody` allowlist in `create-goal-and-materialize-plan`.

⚠️ **A MODULE-IMPORT GREP CANNOT SEE AN ALLOWLIST.** The wizard calls
`create-goal-and-materialize-plan`, which builds an explicit `gsBody` and invokes
`generate-strength-plan`. A key must survive BOTH hops. `target_run_hours` was missing from the
allowlist and the run dial was dead through two deploys, because the deploy list had been checked
twice by grepping module importers — the right answer to the wrong question.

### 2. Bounded both ends, from the frame itself

`volume-bounds.ts`: `slotSpans()` delegates duration to `sessionDurationBandSeconds` rather than
re-deriving it, `weekVolumeBounds()` returns hours for both sports, and `sizeFor()` bisects across
the ladder. The dial offers only reachable values — `WEEKLY_HOUR_OPTIONS` (run 1–6, ride 1–11).

⚠️ **`Math.round`, NOT `Math.ceil`, in the easy fill.** Ceil bought a 30-minute run to cover an
11-minute gap and shipped 1h19 against a 1h ask.

### 3. The ladder — HIS sizes, not ours

⛔ **p235: *"the level refers almost strictly to duration."*** So for BASE families (`run_vt1`,
`run_lsd`, `ride_endurance`) the LEVEL is a dose, and a bigger ask climbs his own rungs before a new
day is added. For QUALITY families (`run_mlss`, `run_near_threshold`, `ride_sweet_spot`) the level is
FIXED by p246 and `rungForSlot()` returns the frame's level unchanged. `LADDER_CEILING_MIN` caps the
climb (`run_vt1: 90, run_lsd: 150, ride_endurance: 300`).

⚠️ A default of 0.5 sitting in level two priced an untargeted week at 7h55 against the frame's own
5h19. The default must sit where the frame sits.

**Superseded:** the `DECISIONS-2026-08-21-standing-plan.md` volume ruling is now BUILT, not pending.

---

## D-455 — Gate only on gear that is required AND declarable; everything else is dropped from prescribing, never silently offered (2026-08-26, Michael)

**What forced it: a screen.** Michael, on his own plan:

> *"we need to add to equipment list for home gym, should never be just prescribed."*

**Measured before the ruling.** `strength-grid` classifies 211 movements out of `EXERCISE_CONFIG`;
**160 carried no gear tag.** For a declared home gym (barbell, rack, bench, dumbbells, pull-up bar,
bands), **148 of those 160 reached the athlete anyway** — `grid.ts:215 reachable` passes an untagged
movement unless its NAME reads machine-braced. A regex was standing in for a tag across two thirds
of the catalogue, and a TRX fallout, a sled push and a GHD sit-up were all prescribable to somebody
who owns none of it.

### 1. Tag the catalogue — 147 rows

⛔ **`ALWAYS` IS AN ANSWER, NOT AN ABSENCE.** A row tagged `ALWAYS` has been read and judged to need
nothing; an absent row is a movement nobody has looked at. The two used to be indistinguishable,
which is the whole reason `gearRoutesFor` warns. Guard: `src/lib/strength-gear-catalogue.test.ts`
asserts the untagged set is now `[]`.

⚠️ **The quieter half was the RANKING.** `equipmentFitRank` has no route to read for an untagged
movement, so all 160 tied at zero and `EXERCISE_CONFIG`'s key order picked the winner — *"not a
decision, an accident"*, in `grid.ts`'s own words about the case that surfaced it.

### 2. The thirteen the vocabulary could not express, split by Slice 7's OWN rule

⛔ **The rule is carried through, not bent.** Slice 7 (2026-08-13) cut an itemized picker down to
*"gate only on gear that is BOTH required AND commonly declarable"*, after granularity drew
Michael's *"I wouldn't know what that is."*

- **THREE EARNED CHIPS.** `suspension_trainer` and `stability_ball` pass both halves — somebody with
  a rack and a bar in their garage knows whether they own a TRX or a stability ball, and what Slice 7
  cut was gear people could not NAME (glute-ham developer, dip bars, leg curl machine). Chips: "TRX /
  suspension trainer", "Stability ball". Movements: `trx fallout`, `stability ball rollout`,
  `stir the pot` (either implement — straps or a ball).
- **TEN WERE DROPPED FROM PRESCRIBING.** `PRESCRIPTION_EXCLUDED` (`strength-grid/taxonomy.ts:374`),
  filtered inside `allGridMovements()` at line 415: ghd sit up, roman chair sit up, captain's chair
  knee raise (both spellings), sled push, sled pull, landmine twist, sandbag lunge, backpack carry,
  ring dips. **Not commonly declarable means not gateable means never prescribed.**

⚠️ **THEY ARE NOT DELETED.** `EXERCISE_CONFIG` still holds them, the library still lists them, and an
athlete who CHOOSES a sled push can still log one — that is their call and always was. The engine
simply never makes it for them.

⚠️ **THE EXCLUSION MATCHES ON THE DEDUPE STEM, NOT THE FOLD.** Naming `ring dips` alone dropped the
plural and handed the dedupe slot to `ring dip` — the catalogue's other spelling of the same
movement — which then sailed back into the pool untagged. It also runs BEFORE `seen.add`, or an
excluded spelling would consume the slot and take a legitimate twin down with it.

### 3. Two things the tagging surfaced rather than caused

⛔ **A commercial gym granted no `bands` and no `kettlebell`.** The expansion said *"most fixed
equipment"* and stopped at things bolted down — which is not the question. `band face pulls` and
`band leg curls` have carried `[['bands']]` for weeks and were ejected from every gym member's pool,
before tonight and unrelated to it. Granting a key opens routes and closes none.

⚠️ **THE CATALOGUE HAS NO BODYWEIGHT ARMS MOVEMENT.**
`movementsForMuscle('biceps', ['Pull-up bar'])` returns nothing; every triceps prime-mover needs
bands, dumbbells, a barbell, a cable, or something to dip on. Chin-ups and push-ups reach those
muscles as SECONDARY engagement, which the ledger lists and deliberately never counts. Before the
tagging this was invisible in the worst way — the arms row offered a BARBELL CURL to an athlete with
no barbell. **Michael ruled it off the table:** entry-language (rack + bar minimum) is built last, so
a bodyweight-only kit is not a real case for this plan. It becomes real the day that plan is built.

⛔ **AND THE FLOOR NOW GOES SHORT INSTEAD OF LYING.** Where the catalogue cannot reach a muscle, the
week says so — *"Could not reach biceps, triceps"* plus a warning per muscle naming the reason. That
path already existed in `accessory-dosing/ledger.ts` and was simply never reached, because untagged
movements filled the floor with kit the athlete did not own. Three tests asserted the old, false
state; each now allows a muscle to be short **only if the engine named it**. Silence is still a
failure, so a future tag error cannot hide there.

**Superseded:** Slice 7's *"do not re-add a chip here"* is annotated in place in
`TrainingBaselines.tsx` — the two chips APPLY its rule rather than excepting it, and the note says
so where the next reader will be standing.

---

## D-456 — The progress standard: no duration gate, group don't delete, fade decided on the session, and a max has a lifespan (2026-08-28/29, Michael)

**One consolidated entry for a whole arc, deliberately.** Six rulings landed in one evening against
`docs/WORKORDER-the-progress-standard-2026-08-28.md`. They are recorded together because they are one
correction stated six ways, and because doc overhead is being kept down — the work order carries the
depth, this carries what must survive it.

**The ask, in his words:** *"Looking for the TrainingPeaks / Viada standard for tracking endurance and
strength gains… What we built wasn't collecting data right — counting low weight sets against the max
— and endurance was not figuring out numbers based on total runs, discarding fast and hilly runs."*

⛔ **THE ONE MISTAKE UNDERNEATH ALL OF IT: the build made the plan a precondition for a MEASUREMENT,
then filtered the population down to whatever the plan prescribed.** TrainingPeaks' reads need no
plan; Viada's same-session-versus-itself test does. **TrainingPeaks is the spine, Viada is the
overlay** — the build shipped that inverted.

### 1. No duration gate on run efficiency, at either end
The 30–70 minute window is gone from `efficiencyIndexToSeries` and `recentEfficiencyPaceHr` and
**neither end returns.** The floor dropped two of every three of this athlete's runs (*"let's match
TrainingPeaks"*); the ceiling deleted the long run (*"it shouldn't cap at 70, that's crucial for
marathon trainers"*). ⚠️ The durability row beside it always ran with a floor and NO ceiling — two
numbers on one screen reading two different populations. Closes **Q-295 at both ends.**

### 2. Group, don't delete
`runSessionGroup` → easy / long / quality. A fast session or a long run is compared to its own kind,
never binned. ⛔ **The `long` group is the same mechanism, not a second one:** *"a long run drifts
more"* is true, and is a reason to compare long runs to long runs. ⛔ **Derived from the session's own
word, never from a minutes threshold** — a duration cutoff is what ruling 1 deleted.
⚠️ **The headline is fitted on the EASY group alone.** Pooling was the actual defect and it lived in
the route engine (`assemble.ts`), not in the two functions the work order named.

### 3. The fade number is decided on whether the session WAS steady
Not on its duration, and not on its plan. `decoupling_mixed_effort` is the **switch**: a session that
was not steady shows **no fade figure** and **still feeds the efficiency trend**. ⛔ Not a second
steadiness test, and not a contradiction of **D-283** — that says don't delete a steady run for being
low-confidence; this says don't print a fade number for a session that wasn't steady.
**Why:** Viada's LSD inserts surges, pauses and race-pace finishes by prescription (p235, p246), so a
fade read there would report a durability failure every week on an athlete following the book exactly.
⛔ **The screen SAYS SO** — *"no fade number — this session changed pace on purpose."* Rendered as a
blank it reads as broken data.

### 4. The endurance read is athlete-scoped (Q-294)
`enduranceSpine` — every run and ride, grouped by session type, **no `planned_id`, no family tag, no
block week map.** Dates, not block weeks, so a rebuilt block cannot empty it. The plan-linked card
becomes the overlay. ⛔ **No day-of-week + duration fallback guessing which session a run "was."**

### 5. Heavy is a property of the set (Q-297), and a max has a LIFESPAN
Two doors into one gate: the plan's stamp, or **1–5 reps at ≥90%** read from `prescribe('ME','barbell')`
rather than restated. ⛔ **Still fails closed** — this is a second door, not a loosening. It unblocks the
off-plan athlete, the Strava importer, and the Get Stronger main lift, which is deliberately unstamped
(a 5/3/1 top set is 65–95%) and therefore **minted nothing at all.**
⛔ **THE WINDOW IS THE ATHLETE'S BLOCK LENGTH** (`plans.duration_weeks`; no block →
`STATE_TREND_WINDOWS.defaultBlockWeeks`, which is the app's own default, not a number picked here).
**Provenance: Viada Part H p215** — the pretest sets the max at block start and the block is written
from it; Part F records the agreement with Wendler, *"progress without retesting on fixed increments."*
⚠️ **`buildBestByLiftSince` is a SECOND ACCESSOR beside `buildAllTimeBestByLift`, not a replacement:
a RECORD does not expire, a reference max does.** Merging them breaks one or the other.

### 6. Where records render: NOT a picker
Secondaries get their own line (ruling 5 supplies the minting set). Accessories get **records and best
sets, never a max line** — *"nobody trends a 1RM here."* ⛔ **No lift selector on the State screen.**
They hang in the folded "from your logged sets" section that already existed, whose own comment had
already named the gap (*"they have no home YET"*). Field standard: Strong and Hevy put a lift's record
on that lift, seen where it was already the subject.

### And one product ruling, permanent
⛔ **The standalone daily READINESS check-in comes off** (energy/soreness/sleep chips, `StateTab`).
Two independent reasons: the data is not obtainable from accessible dev APIs, and self-report is not
logged. ⚠️⚠️ **The BODY row STAYS** — effort rating + soreness written by the post-workout tap
(D-234/D-235) is live and populated, and an earlier framing of this ruling would have deleted a
working input. **Two rows, only one goes.**

**Supersedes / annotates:** Q-295 (closed both ends, back-annotated) · the item-4 note claiming no
defensible staleness window existed — **the source had the answer and was not consulted first**, which
is this codebase's own rule, missed twice in one arc · the `fitness_baselines` migration header's
"strength is intentionally not stored here" (back-annotated in the SQL).

**Deployed 2026-08-29:** `compute-snapshot` 145 · `compute-facts` 127 · `coach` 472 · `workout-detail`
353 · `analyze-running-workout` 832 · `analyze-cycling-workout` 219. Client served at `efforts.work`.
⛔ **VERIFIED: NO.** Nothing renders until a snapshot runs on the next ingest.

---

## D-457 — Separate the builders: the chosen frame is explicit at every call site, and no shared surface may default to one (2026-08-30, Michael)

**Michael's words:** *"We need to really separate the builders. The code and anyone touching it needs
to know the difference. There will be a lot of different builds."*

**THE LAW.** A function that behaves differently per frame takes the frame from its caller. No
shared surface silently falls back to `strength_5k`, and no screen reads a module constant baked
from one frame. Enforced by `src/lib/frame-is-explicit.test.ts`.

### Why — it has bitten five times, and every one failed silently

| # | What | What the athlete saw |
|---|---|---|
| 1 | The endurance card read `SLOT_KEYS`/`SLOT_LABEL`/`SLOT_OPTIONS`/`REQUIRED_SLOT_DISPLAY_ORDER`/`HARD_SLOT_KEYS` while its gate read the chosen frame | Four rows drawn, five answers demanded — **Continue disabled and unsatisfiable** |
| 2 | `SLOT_FAMILY`, indexed by a five-row frame's keys | `.family` on `undefined` — **the whole page blank** |
| 3 | `FRAME_ARCHETYPE` gave p274's ride row p246's RUN archetype | Empty ladder; both riding chips rendered as bare labels with no number |
| 4 | The equal-tiers guard's own comment swept `strength_5k` and reported it as the app's behaviour | A **provably false** sentence shipped on the other frame |
| 5 | The Build focus screen called `pickKeysInDayOrder()` and `dayLabelForPick()` with no frame | p246's nine controls over a p274 week; **five dead**, every option swept and none landed |

⛔ **NOT ONE OF THEM THREW.** A defaulted frame argument is indistinguishable, at the call site, from
a correct one — which is why the guard reads SOURCE. No runtime assertion can see the difference.

### The root cause is a fact about the pages, not about the code

**p246 is built on `secondary` accessory cells; p274 has none** — its accessory work is `braced` and
`focused`. So a pick table written for one frame does not merely mis-label on the other, it aims at
cells that do not exist. Expect the same shape from every future frame: two programmes that share a
composer do not share a membership.

### What shipped with this entry

- `pickReachesFrame` / `picksForFrame` (`accessory-picks.ts`) — reachability is **the composer's own
  rule read back**, not a second table: `compose.ts` consults a pick only for a cell that is
  `intent === 'HYP' && role === 'accessory'`, so a pick reaches a frame exactly when that frame
  carries such a cell of its category and pattern. No hand-kept per-frame list to rot.
- The Build focus screen passes `wizardFrame` to both call sites. Standard Focus draws four controls
  (Push isolation `day 1 · day 4`, Pull isolation `day 1`, Pull isolation `day 4`, Leg isolation
  `day 5`); `strength_5k` draws its nine unchanged.
- Three dead single-frame imports removed from `NonRaceBuilder` (`SLOT_KEYS`, `REQUIRED_SLOT_KEYS`,
  `HARD_SLOT_KEYS`) — unused since 2026-08-30 and invisible because `noUnusedLocals` is off.
- `frame-is-explicit.test.ts`: derives the guarded function list from the modules themselves, so a
  new frame-taking export is covered the moment it is written.

### ⚠️ What this entry does NOT claim

- **The defaults are not all removed.** ~35 signatures still carry `frame: FrameId = 'strength_5k'`,
  each documented as "absent keeps the frame every caller that predates a second frame used". Making
  them required is a mechanical change across every predating caller and was judged too large to ride
  along with a screen fix. **The guard covers the surface where all five defects landed — the
  screens — and a future session removing the defaults is the stronger form of this law.**
- **`strength_5k` is exempt from the pick filter by ruling, not by derivation.** The same rule would
  drop Hinge variation from that frame too, and would be right: p246's day-2 hinge cell is `DE`, the
  composer consults picks only on `HYP` cells, and all four of that pick's options were measured not
  to land on either frame. **That is a real pre-existing defect on the shipped path** — logged
  separately, not fixed by hiding a control.
- The source scan catches an **omitted** frame, not a **wrong** one. A screen passing the other
  frame's id still needs a rendered check, which is why every change in this area gets one.

### Queued, not started

Wiring `all_rounder` its own picks over p274's `braced` and `focused` cells — the athlete currently
has four controls over 22 slots, and no say at all over the braced supersets p275 prescribes. That
is a source-reading job before it is a code job (Michael: don't start it).

## D-458 — Run efficiency: withhold and NAME it when heat moves with the calendar (2026-09-02)

> ⛔ **SUPERSEDED THE SAME DAY BY D-460.** Michael, on reading the comparison to TrainingPeaks: *"I don't
> want to do things different, use different metrics — all the problems we have are because you
> extrapolate and add features."* The verdict, the fitted line, the confidence range and the heat model
> are ours; TrainingPeaks has none of them. The gate below stays in `heat-adjust.ts` (tested, harmless)
> and the server still emits `withheld` + reason, but **no screen reads the run verdict now** — the run
> plate and the workout page show the field's three facts only. Everything below is history.

**What.** `heat-adjust.ts routeTrend` fits `efficiency ~ heat + time` jointly. The gate that decides
whether heat is identifiable used the RAW spread of the heat term (SD ≥ 4°F). In a joint fit the spread
that identifies β_heat is the part time does not explain — SD(heat)·√(1−r²), r = corr(heat, day)
(Frisch–Waugh–Lovell). The gate now uses that, on the same 4°F floor; no new constant. Under it the
engine returns `still_learning` with `withheld: 'heat_confounded_with_time'`; `assemble.ts` maps it to
verdict `withheld`, pctChange null, and carries the reason on `efficiency.route.withheld` (and per group).
The card says "Reading N easy runs, all in the heat — heat and fitness can't be told apart yet."

**Why.** Live −22% on 45d122e7: 18 easy runs, all 69–89°F, hottest last. corr(heat, day) 0.65, VIF 1.7 —
NOT textbook collinearity, so a VIF gate would not fire and a lower one would be tuned to one athlete.
Raw heat SD 4.57 passed; partial SD 3.49 did not. The fit split a heat-driven fall between heat and
time and reported −21.7% [−40.7, −2.7]. Neither "declining" nor a silent fallback to time-only (which
re-blames time) is honest; withhold-and-say-why is. A seasonal arc (hot summer / cool winter) has low r
and is unaffected — pinned in `heat-adjust.test.ts`.

**Rejected.** VIF/|r| threshold (does not fire here at any standard cutoff); dropping to the old trend
(`runEfficiency.trend`, uncorrected — would show the same decline by another path); removing the heat
feature (Michael: withhold and flag, keep heat).

**Verification.** Local replay of compute-snapshot's exact pool → withheld. Prod recompute pending deploy.

## D-459 — Baselines AUTO / LOCKED: storage shape and the one input (2026-09-02)

**What.** `user_baselines.locked_baselines jsonb`, flat `{ <canonical lift>: number }`. Key present =
locked to that value; absent = auto. No `{value, source, set_at}` per lift — the resolver needs only the
number, provenance is the key's presence, and `updated_at` on the row already dates the write. On the
Baselines screen each lift is one row: the number in use, a source line, ONE input whose meaning follows
the switch (auto → edits the typed seed; locked → edits the locked value), and an auto/locked pill.
Tapping locked seeds the lock with the number in use; tapping auto deletes the key and keeps the seed.

**Why.** Garmin/TrainingPeaks auto-detect on/off, Michael's ruling (PLAN-strength-numbers §C). One input
per lift keeps the strength tab Strong/Hevy-familiar; two numbers per lift was the confusion this thread
started from. Typed stays a SEED (not a lock) so a new athlete's signup number yields to logs without a tap.

**Readers.** Every consumer of the resolver fetches the map (see the 2026-09-02 banner list). Migration
must land before function deploy — selects name the column.

## D-460 — The run read is TrainingPeaks', nothing more (2026-09-02)

**Ruling (Michael).** *"I don't want to do things different, use different metrics. I want to be the
same. Our graph chart should show specifics, but all the problems we have are because you extrapolate
and add features."* Then: *"this is what I want — we gotta stop adding features that make our numbers
messy."*

**What the run read is now.** Exactly TrainingPeaks' facts: (1) Efficiency Factor per run —
grade-adjusted pace ÷ average heart rate — one dot per run on a dated chart, per session type
(easy / long / hard cards, already the shape of `EnduranceReadCards`); (2) the latest run's number and
the recent easy-run pace at heart rate; (3) decoupling (Pa:Hr) as a bare percent on the latest run,
shown only when the session was steady. No verdict word, no percent change, no fitted line, no
confidence range, no heat coefficient, no "heat costs you", no withheld state.

**What went.** `<RunFitnessRow>` deleted (it was already unrendered since Round 3 pass 2, and was the
only client reader of the verdict, CI, route receipt and heat line). The run summary line's verdict
fallback → count/pace only. `workout-detail` no longer emits `discipline_trend` for run, so the
workout page's "run trend ↓ sliding −22%" line is gone; run joins swim as described-not-graded there.

**What stays, unread.** The server still computes `runFitness.efficiency` (verdict, route, groups,
D-458's withhold). Left in place so nothing downstream breaks; no screen consumes it. Removing the
computation is a later, separate cut.

**Not touched by ruling.** The bike row has the same shape of problem (verdict + percent from a
fitted trend) and is left alone this pass.

**Addendum (same day, Michael: "just let the plan tag it, don't do any more math than necessary").**
The easy / long / hard bucket comes from the attached PLAN session's words only
(`compute-facts classifyRunIntent`, step 1). Removed: inference from the file's interval structure,
from the athlete's own run name, and — at every grouping site in `compute-snapshot` — the analyser's
heart-rate-derived `steady_state | intervals | hill_repeats` fallback. Untagged run → easy. ⚠️ Forward-
only: `run_facts.workout_type` is rewritten when a run is recomputed. ⚠️ Not touched: the decoupling
substrate's `workout_intent` (`compute-facts:~858`) still reads the analyser's word first — a
different path, same shape of inference, flagged for the follow-up.
Follow-up the same evening: the standing plan tags its sessions `family:run_<family>` and names the
hard one "Hard Run"; neither reached the classifier, so the one attached hard run still read easy.
`classifyRunIntent` now reads the family tag first, then plan words (`quality` / `hard` added). Live
finding on the account: 20 of 23 runs point at planned rows that no longer exist (plans rebuilt) — the
plan cannot tag what it no longer has; those runs are easy by ruling until re-attached.

## D-461 — One 5K, one derivation, one writer (2026-09-02)

**Ruling (Michael).** *"Shouldn't the 5K pace just run once in Baselines?"* — and on hearing the trace:
*"let's clean that up."*

**What was there.** Two stored 5Ks (`performance_numbers.fiveK` from Baselines; `effort_source_time`
from the wizards). Three vDOT engines (`src/lib/effort-score.ts`, `generate-run-plan/effort-score.ts`,
and inline tables in `GoalsScreen.tsx`). Four writers of the derived `effort_*` columns: the race
wizard's calibration, the strength wizard's calibration (`run-pace-calibration.ts saveCalibration`),
`generate-run-plan` (on a performance_build), and `materialize-plan`, which recomputed the paces from
`effort_score` on EVERY materialization and wrote them back to the athlete's row. The typed easy pace
from the wizard was validated and discarded.

**What it is now.** The 5K lives in `performance_numbers.fiveK` only. `effortFieldsFromFiveKTimeSec`
(`run-pace-calibration.ts`) is the one derivation. Two entry points call it, both writing the same row
the same way: the Baselines save (`AppContext.saveUserBaselines`, whenever a 5K is on the row) and
`saveCalibration` (both wizards; it now also writes `performance_numbers.fiveK` and `.easyPace`).
`generate-run-plan` and `materialize-plan` no longer write to `user_baselines`. The Goals screen's
inline vDOT tables are deleted. The 25 readers of `effort_paces` are untouched — they read a cache with
one writer instead of four.

**Not done, deliberately.** (1) `effort_paces` is still a stored cache rather than computed on read;
deleting it touches ~25 readers and the plan builders. (2) `generate-run-plan/effort-score.ts` is
still a second copy of the vDOT engine, server-side. (3) The wizards still ASK for a 5K pace instead of
prefilling from Baselines. Each is its own cut.

**Legacy rows.** A row with `effort_*` but no `fiveK` keeps its columns until a 5K is entered — the
Baselines save leaves them alone rather than nulling them.

## D-462 — Threshold pace is the only pace anchor; easy is a heart-rate zone (2026-09-02)

**Rulings (Michael, in order, same evening).** *"Easy: no pace. Prescribe a heart rate zone. Threshold
and harder: prescribe a pace, from threshold pace."* Then: *"we don't have to do any easy or threshold
math from 5K, it's either learned or entered."* Industry check: TrainingPeaks / Garmin / Coros / Daniels
all anchor on threshold (test, race, or detected); none asks for an easy pace.

**What it is.** Threshold pace resolver: my number (chosen) > learned (med/high) > typed > derived from
learned easy runs (÷1.19, med/high only) > learned-low > null. No 5K seed, no `effort_paces`. Easy
pace resolver: threshold × 1.19 or null — a reference band, `is_estimate` true, never a prescription
source; `easyPace` / `easy_pace_source` are read by nothing. Materializer: threshold and easy from the
resolvers; marathon = threshold × 1.093; 5K-pace work = the typed 5K by division (`resolveCurrent5kPace`);
cruise/tempo tokens read threshold directly. `effort_paces` / `effort_score` no longer selected by
materialize-plan. An athlete with no learned and no typed threshold gets NO pace on hard runs — effort
target only — until a test, race or entry (accepted).

**Built by** the 2026-09-02 plan materialization audit session (`src/lib/run-paces-from-threshold.ts`,
resolvers, materialize-plan, arc-context, race-readiness; 148 tests). Baselines run tab: easy row is a
read-only "run by heart rate, reference pace from your threshold" line; `saveCalibration` no longer
writes `easyPace`. Back-annotated: Q-174, D-287 (easy half).

**Ripple, recorded not resolved.** Nine server readers of the easy resolver (analyze-running-workout,
compute-workout-analysis, compute-adaptation-metrics, end-plan-core, planning-context,
athlete-weekly-intent, block-adaptation, endurance-library/anchors, course-detail) now grade or plan
against the threshold-derived band instead of a measured easy pace. Analyzer verdicts on easy runs are
the surface most likely to move. `generate-run-plan` performance_build still requires
`effort_paces.race` (step 4, audit session).

**Amended the same evening (Michael: "why are we still doing math?").** Two of the three remaining
ratios go. (1) `derived-from-easy` is DROPPED: threshold is learned or entered, full stop. (2) Marathon
pace is NOT threshold × 1.093: it is the plan's entered goal time ÷ 26.2 — entered, not derived; no
goal time → effort target only. (3) Easy = threshold × 1.19 STAYS, as the industry's zone math, and
only as a reference band under a heart-rate prescription. The audit session applies (1) and (2).

**Checkpoint, no undo on accept — a decision (2026-09-02).** Accepting the six-week checkpoint re-prices
the unstarted endurance rows off the learned-or-entered numbers; there is no older number to return to
without pinning one, which this entry rules out. "Keep the block as built" before accepting is the
reversal path; Garmin and TrainingPeaks apply a threshold change the same way. Completed sessions never
change.

## D-463 — The book's tests, sendable; easy running read off a hard run's warm-up (2026-09-03)

> **2026-09-04 evening — the warm-up half of this decision is REVERSED (D-466).** The easy read off a hard run's
> warm-up was ours (no product does it) and is gone from `compute-snapshot` (both the aerobic spine and
> `runEffHistory`), from `assemble.ts` (`warmupRuns` / `recentFromWarmups`) and from the State row ("incl.
> warm-ups"). `run_facts.warmup_easy` is still written; nothing on State reads it. The tests half (sendable
> threshold trial) stands. Everything below on warm-ups is history.

**Tests (pp.210–213, read off the page).** Every test launched from Baselines is the book's protocol, step for
step, and every step is a TIMED step so Garmin takes it as-is: run trial p210 (7 min jog · 2 strides · 3×30 s
fast with 1 min easy · 1 min rest · 12/10/8-min trial · 9 min cool-down), FTP p212 (8 min easy · 3×1 min high
turnover/1 min easy · 3 min easy · 3 min at 9/10 · 7 min easy · 20 min best effort · 5 min cool-down, OURS).
Threshold pace = trial pace ÷ 0.88 (p210); FTP = 20-min average × 0.95 (p212). The protocol lives in
`materialize-plan` `buildAssessmentSteps` because the `assessment` tag bypasses token expansion. Strides are
20 s not 100 m so no pace is needed to size them. Verified on a throwaway account, server side.

**Warm-up easy read — OURS.** An All Rounder block has no easy runs, so the easy line went stale. The plan's
warm-up step is read from the samples with the first 3 minutes dropped (heart-rate lag, 2–3 min, field
standard); cool-downs are never used (post-effort HR stays elevated, so they read slow); at least 3 min of
moving, HR-bearing samples or nothing. It joins the easy pool as its own point on hard days and the State
line says "(incl. warm-ups)". Not a Viada rule, not a Garmin/TrainingPeaks feature — labelled OURS in
`_shared/run-warmup-easy.ts`. Verified on 45d122e7 (easy line 13:21 → 12:52 at 143).

**Threshold precedence stands (D-462):** a "my number" threshold outranks a test result until the athlete flips
the row to auto; the save re-prices. The test never silently overrides what the athlete typed.

## D-464 — No hard gates on the week; notes state the training effect; the Your week card reads the built plan (2026-09-03, PUSHED `c7c21af2` on main + DEPLOYED + client live, NOT device-verified)

**The ruling.** A tapped day is built exactly as tapped — two hard sessions on one day, three, the rest day
taken. Nothing moves and nothing blocks except the one absolute: a day marked "can't train" never gets a run
or ride. The plan's job is to say the direct training effect in a note, never "X moved to Y" (the chip shows
where it landed). Field backing, checked: TrainingPeaks stacks silently; TrainerRoad stacks and warns on
recovery; Runna and Garmin Coach hard-block one plan session per day. Efforts sits with the first two.
Book backing: pp.139–145 rules 6 (two-a-days, 6–8 h apart), 7 (a rest day is not always needed), 8 (the
seven-day cycle is an artificial constraint); the All Rounder as written (p274) has one hard session per
day and one rest day, which is why a departure is owed a sentence.

**Two engines were drawing one screen.** The sweep (63,840 composed weeks) found the server honours every
tap and never puts endurance on a day off, but the Your week card mixed the phone's own solver
(`suggest-hard-days.ts` → `week-model`) with the server preview: the hard-ride chip read Mon over a ride the
plan built on Tue because `IS_HARD_SESSION_NAME` could not see "Anaerobic Ride"; the "moved to" sentence named
the wrong day 30/42 times; the row label ("sustained threshold") was decided client-side over an anaerobic
ride; the "High fatigue risk" line read the phone's week. Now chips, dots, row label and conflict line all
read the preview, by `family:` tag (`src/lib/preview-week-read.ts`); the phone's solve is the pre-fill only.

**Two new conflict rules (`week-conflicts.ts`), through `placement_compromises` like the existing four:**
`two_hard_one_day` — any two of hard/long endurance on one day, names the day and both sessions, "Six to eight
hours between them, and the second one runs on legs that have already worked."; `no_rest_day` — names the
frame's rest day under the rotation and what took it. The generic "Two runs land on one day" spacing note
steps aside on a day the new rule names. Three notes reworded without our own words (lift on a day off, club
ride shorter than the plan's, one long session only). The wizard no longer composes a relocation note.

**The sweep is permanent:** `week-notes-sweep.test.ts`, 2,856 weeks across `all_rounder` + `strength_5k`
(every long day × every single hard tap on every slot × every single day off + fully-pinned samples).
Asserts nothing endurance on a day off, taps honoured, every stacked day named, seven used days flagged,
no "moved to" text, voice check, no "pinned / sport mix / carries a lifting day".

**Copy, same day.** Endurance focus intro is three lines in Michael's words + a "Limits and why" tap opening
five page-backed lines (p107 floor + drift stop; p239 5 h long ride; rule 5 one-third cut; p247 3–4%; p275
rides cost less). The "rarely more than 2 h" line was cut as an observation, not a rule. Your week subtitle:
"The week below is the program's. Any day can move. What a move costs shows up in the notes. A run club or
ride club can take a hard session or the long day." pp.190–191 (thermoregulation) filed in SOURCE Part K1.

**Open, not started:** the book-vocabulary debt — ~25 files still recognise a session by its printed name
rather than its tag (heaviest in `compose.ts` and `accessory-picks.ts`); only the Your week path was fixed.

## D-465 — The Performance screen follows the field: Execution + Drift in the header, no per-row scores, one drift, one word (2026-09-03)

**Header (runs and rides): Workload · Execution · Duration · Drift.** Execution = the work intervals'
pace-or-power score blended, averaged with moving time ÷ planned time (existing analyser numbers, never
shown before). The pace/GAP percentage that sat in the header is gone. **No per-row percentages** on a
planned session: TrainingPeaks and Garmin show planned beside actual and colour the actual — green in the
target, blue below, red above (Garmin's convention; Michael read blue as slower). One score per session.

**Drift, one definition, never withheld (Michael: "drift is going to be important").** Heart rate in the
second half of the session against the first, split by time, after the planned warm-up (else 3 min) —
`_shared/hr-drift-halves.ts`, written by BOTH analysers as `hr_drift_v1`. Session-detail and State read the
same precedence: the analyser's pace-to-heart-rate decoupling when it computed one, else `hr_drift_v1`.
Interval days print the number and say "whole session, intervals included". The book's 5% line (p107) is
written for steady sessions; the label carries that. The durability TREND still uses steady runs only.

**A session cut short is laid out for the part done** (compute-workout-summary): steps beyond the end of
the recording are emitted `not_done`; a short recording is not a mismatch; a power-targeted ride step keeps
its planned window. The ride analyser never calls a plan "easy" because no interval was graded.

**One word: Workload** on every screen (load points / run points / run load / Training Load renamed).
**Details:** IF tile removed (a rated session's IF is the rating table); Grade-Adj Pace for runs; moving
time keeps seconds from the Strava import onward (`metrics.moving_time_seconds`).

**Strength logger and plan card speak the book (p218):** ME / DE / SKILL / HYP leads each exercise with
its reps and reserve, read from the composer's own `slot_intent` / `target_rir`; the rep target sits greyed
in the reps box; Previous and the suggested weight read the same log.


## D-466 — One absolute reference per State number: TrainingPeaks whole for load and trends, intervals.icu whole for FTP, nothing of ours left but a zone midpoint (2026-09-04 evening, PUSHED to branch `claude/chat-archival-behavior-ee4r3z`; NOT on main, NOT deployed, NOT device-verified)

**Michael, 2026-09-04:** *"I want the numbers and the formulas to be the exact numbers and formulas used in
Garmin or TrainingPeaks and not a hodgepodge of the two … each metric has to have an absolute reference
point."* The morning's ledger (`STATE-NUMBERS.md`, first cut) had five numbers built from two products at once:
a TrainingPeaks formula under a Garmin window, with a Garmin arrow on top. This entry is the ruling applied,
number by number. It **supersedes the 28/28 half of the morning's nothing-invented spec** (that spec file is
deleted; its substance is here) and the FTP guardrails of `SPEC-ftp-estimator-2026-09-04.md`.

**Trends — TrainingPeaks, whole.** Efficiency Factor and Pa:Hr / Pw:Hr are per-workout numbers in the
TrainingPeaks workout summary, trended one dot per workout on a dashboard. So the run and bike rows and the open
cards print the **last steady session's** number with its date (`sport-summary.ts latestPoint`, `fmtDayShort`),
the chart is the trend (90 days, one colour), and the **↑→↓ arrow is off the screen** — it was Garmin's three
states (28 days vs the 28 before) over a number Garmin does not have. The 28-day-average headline (also Garmin's)
goes with it. `state-trend/classify.ts` still computes the 28/28 verdict; only the coach's copy reads it now
(a second vocabulary beside State's — Q-298 names it). The `SportRow.arrow` slot and the `efficiencyRow` /
`dirWord` / `changeMonth` / `sinceMonthFromSeries` / `recentAverage` / `recentHalfPoints` helpers are deleted
with their only callers. The "provisional" tag (ours: 3–4 sessions or a 21-day span) is no longer rendered.

**Load — TrainingPeaks, whole.** The LOAD line is the Performance Management Chart: fitness (42-day EWMA of
daily workload), fatigue (7-day), form (yesterday's fitness − yesterday's fatigue), with Friel's Form zone word
(transitional > +25, fresh +5..+25, grey zone −10..+5, optimal −30..−10, high risk < −30; a value on the line
takes the zone below — the ranges are printed, the boundary is not). This was **starved, not absent**:
`_shared/fitness-fatigue.ts` has computed it since 2026-07-09 as an "evaluation-only sibling signal" and the
coach shipped it as `load.fitness_fatigue`; nothing rendered it, and the coach fetched only 84 days, which
under-seeds a 42-day average. The fetch is now the whole history (TrainingPeaks seeds at zero from the first
workout), `formZone()` is added beside it, `LoadBar.tsx` prints the three numbers, and `COACH_PAYLOAD_VERSION`
/ `COACH_CLIENT_MIN_PAYLOAD_VERSION` are 195. **ACWR and the reconciled load word ("balanced") are off the
screen** — Gabbett's ratio and the app's own reconciler (D-260) are neither product's rule. Both stay on the
payload for the coach. The 7-day composition strip stays (TrainingPeaks' TSS-by-sport split), relabelled
"last 7 days".

**Strength workload — Friel's estimate, the same TrainingPeaks rule cardio already fell back to.** Points =
minutes ÷ 60 × RPE × 10 (Friel, "Estimating Training Stress Score": his own examples 30 min at RPE 6 = 30,
90 min at RPE 4 = 60). RPE = the session rating; else 10 − the average logged reps-in-reserve (Zourdos 2016);
nothing logged → 0. The planned side mirrors it from the planned minutes and the target RIR, so prescribed ==
performed still reconciles. **Replaces** (tonnage ÷ 10,000) × intensity² × 100 and the RIR-to-intensity band
table, both ours. `strengthSetVolume` and the band / bodyweight pricing (D-351, D1) stay for the VOLUME facts;
they no longer price load. Ripple, stated: every stored strength `workload_actual` / `workload_planned` is on
the old scale until `backfill-strength-load` re-prices it (it calls `calculate-workload`, so it needs no code of
its own beyond the planned `duration` it now selects); a strength session with no rating and no RIR scores 0;
no hrTSS for a strength session with heart rate, because the app holds no strength threshold heart rate.

**BODY — removed from State.** Effort (Foster's session RPE under our 7-vs-28 comparison) and soreness
(Hooper's scale under our z-score) are neither product's fitness-screen rule. `StateBodyBlock.tsx` is deleted
with its only mount; the server rows still feed the coach.

**FTP — the fit alone.** The best-20-minute ceiling and the ±5%-per-learn rate limit were ours on top of the
intervals.icu / TrainerRoad read; both deleted (`compoundFtp(b)`, `rateLimitFtp` gone, `ceiling_20min` off the
type). ⚠️ intervals.icu's exact eFTP model could not be read from this container (its pages and TrainerRoad's
are blocked by the egress proxy); the CP fit and 0.97 × CP stay cited to Hill / Jones / Vanhatalo and Morgan
2019 — a **hypothesis about intervals.icu's method, not a finding.** Q-298.

**What is still ours:** inside Friel's heart-rate table, where a two-value zone (Z1, Z2, Z5b) splits — at the
midpoint. Friel prints the range, not the split. Nothing else on the screen.

**What did NOT change:** cardio TSS / rTSS / sTSS and the Friel HR / rating fallbacks (`d635ac52`, this
afternoon — already TrainingPeaks); Garmin's 10-minute-in-the-aerobic-band rule for which rides count (it picks
steady rides; it does not compute the number); Brzycki e1RM; the swim count; the week-execution bars.

**Rejected:** keeping the arrow "because Michael said he was ok with it on 09-03" — that approval predates the
one-reference ruling; making ACWR Garmin's load ratio (Garmin's band could not be verified from here, and the
PMC already existed); an hrTSS rung for strength (no strength threshold HR exists in the app — it would have
been a guess).

**Verification that would settle it:** deploy the list in ENGINE-STATE's banner, run `backfill-strength-load`,
open State: LOAD reads three numbers and a zone word; the run row reads "aerobic efficiency 1.xxx · Sep N run"
with no arrow; the open card's drift line names one session; no BODY block. Then recompute fitness by hand from
`workouts.workload_actual` for one athlete and compare.

### D-466 addendum — the coach reads the same truth (2026-09-04, later the same evening, Michael: "State and coach must read one truth")

**Every athlete-facing sentence the coach builds from ACWR or from the Garmin 28/28 verdicts is gone in the same
change, not deferred.** Traced from `coach/index.ts` outward (`docs` of the trace: this entry).

- **Week verdict** (`buildVerdict`) reads TrainingPeaks' Form (TSB, `metrics.form`), not ACWR: "high risk"
  (form below −30, Friel) → Recover; else the completion / key-session / recovery-week branches as before.
  The `caution_ramping_fast` branch (ACWR ≥ warn) is gone with the ratio; the methodology `warn_acwr` /
  `high_acwr` thresholds are unread.
- **Training state title + kicker** are the Form zone word and "Form −12 — optimal (TrainingPeaks)";
  `load_ramp_acwr` is null. **`load.label`** is the zone word. **Evidence receipt** `acwr` → `form`.
  **Narrative facts** carry fitness / fatigue / form + the five zones and the instruction "Never say ACWR";
  the taper note speaks in form ("race day belongs in the fresh zone, +5 to +25").
- **Withdrawn as an input** (null passed): the weekly response model (`acwr_status` reads 'unknown'; the
  readiness word can no longer be minted from the ratio), the marathon-readiness load item, the reconciler's
  cross-training-spike escalation, `overReachCandidate` / the week accent ("Load is running 1.4× …" cannot
  print), the fact-packet limiter's "ACWR 1.42 (elevated)" evidence, `build-coaching-context`'s ACWR lines.
  The reconciler's interpretation strings no longer name the ratio.
- **No direction claim anywhere:** `fitness_direction` is null (the narrative core reads an empty direction
  as "no claim"), the "sliding" atypical-signal feed is empty, the per-lift 28/28 direction map is empty, the
  heart-rate verdict no longer gates the anchor descent. `readiness-receipts` / `loaded-legs` take an empty
  load label as "nothing to add" — the "· load balanced" tail is gone.
- **Client, the same sweep:** the State dot blocks (`FitnessDotBlock`, `Signal`, `DisciplineRow`) print the
  label, the dot and the evidence count — no verdict word, arrow or percent. The session screen's
  "discipline trend ↑ improving" chip (`MobileSummary`, `EnduranceIntervalTable`) is removed. The State
  glance headline no longer prints the reconciled load word; it speaks only in Friel's high-risk zone.
- **Still computed, nowhere spoken:** `state-trend/classify.ts` (28/28), `_shared/acwr.ts`, the
  `load.acwr` / `running_acwr` payload fields, `discipline_trend` on the session contract,
  `LoadContext.acwr_status`. Data, not copy. If the next session wants them deleted, that is a payload-shape
  change with its own version bump.

Tests: 223 green across `load-status-reconcile`, `response-model/`, `week-accent`, `fact-packet/`,
`fitness-fatigue`; client build clean.

## D-467 — The test week is optional again: "Know your numbers?" before the plan (2026-09-04)

**Ruling (Michael, 2026-09-04):** *"we are not making it non-optional… that's the whole purpose of this
change."* Reverses the 2026-08-30 always-test rule that lived only in `generate-strength-plan/index.ts`
comments ("week one is the test week, for everyone, every block"). Spec: `docs/SPEC-baseline-entry-2026-09-04.md`.

**What is built**
1. `wizard-steps.ts` — a `numbers` step on every route, immediately before `confirm` (`KnowYourNumbersStep.tsx`,
   rendered by `NonRaceBuilder`). One row per discipline the plan contains. A number on file → **Use current** /
   **Retest in week one** (Use is the default). Nothing on file → an inline field or **Test in week one**. Skippable.
2. Nothing is typed on this screen (Michael, 2026-09-04, same night: "Typing numbers lives in Training Baselines,
   not the wizard"). A row with nothing on file is tested in week one, full stop. The first cut carried inline
   fields that wrote through `saveUserBaselines`; they were removed before the second push and the screen writes
   nothing.
3. Strength · Use current → `training_prefs.skip_test_week: true` (the wizard's own, previously unsent
   `skipTestWeek` slot). `generate-strength-plan` now honours it: working numbers come from the resolved four on
   file (`readBarbellMaxesResolved`: locked > trusted learned > typed) via `workingNumberFromFile` (working = 1RM ×
   0.96, Viada p215, same shape as a test read, `cite` names the source), `skipTestWeek: true`, week one is a
   normal week. Retest / absent → the test week, unchanged.
4. A missing lift never refuses a build any more (both `generate-strength-plan` and its mirror in
   `create-goal-and-materialize-plan` only log). Under the test week it is a "By feel" test row (`compose.ts` already
   did this). Under Use current (Michael, later the same night: "price the lifts that have numbers, make only the
   missing lift a week-one test row — don't fall back to a full test week") the missing lift becomes its own
   week-one test session on its test day (`Test: Deadlift`, tags `standing_plan test_week 1rm_test`, the p215 ramp
   or "By feel"), beside the day's priced session; `rematerialize-standing-block` seeds the on-file lifts from the
   stored `config.working_numbers` so the week-one read of one lift does not drop the others. Use current is offered
   from one lift on file. The 65 lb floor still applies to every lift that has a number. Before this, an athlete
   with empty baselines could not build Standard Focus at all.
5. FTP / run threshold · Retest → after the plan is built (`useArcSetupComplete` `onBuilt`), the book's test session
   is scheduled into week one through `addPlannedWorkout`, the same rows Training Baselines schedules; the bodies
   moved to `src/lib/baseline-tests.ts` and Baselines reads them from there. Placement inside week one is OURS
   (`RETEST_OFFSET_DAYS`: run test day 3, FTP test day 5; the book says only "no hard training 48 h prior").
6. Swim: number on file or typed; no test is scheduled — the app has no swim test session.

**Not changed:** `locked_baselines` (D-459) keeps its own path (raw number, no fraction). `test-skip.ts`
(evidence-from-logged-sets skip offer) stays dead — the number on file is the athlete's answer.

**Back-annotation:** the 2026-08-30 comment block in `generate-strength-plan/index.ts` is history; its text is kept
above the new branch with a pointer here. No D-entry ever recorded the 08-30 ruling.

## D-468 — The week-one test set is the heaviest completed set, flag or no flag (2026-09-04)

**Bug (Michael's own Sep 1 "Test: Lower"):** `readTestWeek` accepted only sets carrying `amrap: true`. The deadlift
top set (170 × 3) carried the flag and priced; the squat top set (105 × 6, completed) did not, was dropped, and every
squat after it read "By feel" (`config.working_numbers` held bench, deadlift, overhead press and no squat). The flag is
stamped by the composer's ramp; the logger's rows do not always carry it back.

**Rule (Michael):** in a week-one session tagged `1rm_test`, the heaviest completed set for each tested lift IS the
test set — price from it regardless of the flag. Implemented in `working-number.ts readTestWeek`: heaviest completed
set wins; at equal weight the flagged set, then the later set; a set the row itself flags `warmup: true` is never the
test; uncompleted sets never count. A block with no `test_lift_names` falls back to the default names
(`TESTED_LIFT_NAME`). His plan does carry the four names, so that was not the cause. Tests: `test-week-read.test.ts`.

**Deployed:** `rematerialize-standing-block` v99 (03:33 UTC). The restate runs under the athlete's session only
(`requireUser`), so the apply for his plan is his tap: the Plans admin page's restate card, or any strength save from
the logger, which fires it. Expected after apply: squat working number 119 (105 × 6 → predicted 124, × 0.96), Sep 11
and later squat rows priced off it.

**Pre-existing, untouched:** `standing-plan-wiring.test.ts` "96% of the average" fails on the untouched tree too —
its expected Epley uses 1/30 where the code uses 0.0333 (203.5 vs 203.4852).

## D-469 — A by-feel set is not a ladder rung; the heavy set opens inside the band (2026-09-04)

**Bug (Michael's squat, same plan as D-468, after the restate applied):** every squat row from week 2 read
"105 × 6". The weight was right (working 119 × the ME percentage = 105, the same arithmetic as bench 135 and
deadlift 155). The reps were not: the ME row "opens at the reps last achieved", and the ladder had recorded
`recentReps [6]` from his Sep 4 squat — a set logged against a week-one row that was `awaiting_test`, "By feel",
with no prescription at all. So a calibration set became a rung and every later heavy set opened at 6, above
p218's 1–5 band.

**Rules:**
1. `me-history.ts earnedMeSets` — a composed ME row with `weight: null` (the by-feel weeks) is not in the ladder
   index; a set logged against it earns no set and sets no opening reps. The test week's own read is where those
   sets are measured.
2. `compose.ts` — the opening rep count is clamped to the ME band (`p218`, 1–5): "open at the reps last achieved" is
   a position inside the band, never a licence to prescribe outside it; a count above the band is the bar ladder's
   business, not the rep target's.

Tests: `me-ladder-by-feel.test.ts`. Deployed: `rematerialize-standing-block` v100 (03:57 UTC). The apply is the
athlete's tap (see D-468). Expected after apply: squat rows "105 × 1-5" with the top step inside the band.
