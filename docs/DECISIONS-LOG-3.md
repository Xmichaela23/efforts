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
