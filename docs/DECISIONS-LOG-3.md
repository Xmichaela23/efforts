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

### D-432 — Strong Focus aligns to 5/3/1 Forever: three-week cycles, standalone light weeks, the verdict on the rested week, FSL in the leaders (2026-08-15, **PUSHED: no — edits only. NOT DEPLOYED. NOT DEVICE-VERIFIED**) — supersedes the volume half of [D-385] and the pairing half of [D-387]

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
