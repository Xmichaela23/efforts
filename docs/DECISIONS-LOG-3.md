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
your top-end fitness. Your miles and hours default to easy pace and recovery if none is picked — and
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
