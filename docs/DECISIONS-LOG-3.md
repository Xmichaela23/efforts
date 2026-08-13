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
