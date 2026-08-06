# SPEC — the Heavy and Definition tier engine

> # ✅ §0–§7 SHIPPED 2026-08-05. THE ACCESSORY REWORK IS DONE AND ITS SUBSTANCE IS **[D-385]**.
>
> **Deleted from this file, deliberately.** A spec that outlives its build is a second, decaying copy
> of the code — that is the doc-rot engine `CLAUDE.md` opens with. What shipped:
>
> - press days carry a real push (day-type slot roles replace family collision; `BALANCE_POOL` gone)
> - no leg work on upper days; core last on every day
> - squat and deadlift days run opposite leg patterns
> - reps floor **50**, ceiling **75** — the Triumvirate's own band
>
> ⛔ **Four book citations in the old §2 were WRONG and are corrected in [D-385]** — the press-day
> third slot, the "squat↔pull" reading of p.53, "Face Pull is prehab", and the `_shared` paths. If you
> are working from a memory of this file, re-read the D-entry.
>
> **What is left, and the only reason this file still exists: the ENGINE behind Heavy and Definition.**
> The picker shipped ([D-383]); Strong is a pass-through; the other two are dark because what
> separates them was the accessory work — which now exists, so this is buildable.

**Status:** BUILD CONTRACT for the §A engine only. **Decided by:** Michael, 2026-08-05.
**Delete this file when Heavy and Definition ship.**

---

## A. The three tiers (Strong / Heavy / Definition) — ⚠️ PICKER SHIPPED, ENGINE NOT

**The screen exists ([D-383]): Strength opens Strong / Heavy / Definition. Strong is LIVE and is a
pass-through to today's block; Heavy and Definition are dark because what separates them is §0–§7.
What is left here is the ENGINE behind those two.**

One Wendler spine, three intents. Same main lifts and 5/3/1 loading; the tier moves the **strength work only** — accessory **volume** and **character** (plus a **focus area** for Definition). **Endurance is not a dial here** — the existing engine handles quality days, hills, speed, run/ride, and interference exactly as it does today.

### What each gets the user

| Tier | The user gets | In the plan they'd see | Who it's for |
|---|---|---|---|
| **Strong** *(default)* | **Stronger without getting bigger.** Neural / max-strength. | Minimal accessories — floor volume, ~2 movements, kept fresh; plyos for power. | Performance-focused athlete mid-season; anyone who doesn't want added mass. |
| **Heavy** | **Bigger — visible muscle.** Hypertrophy. | Most accessory tonnage — 3 full slots at high reps + "Boring But Big" 5×10 size work. | Off-season / base block; wants to add muscle and accepts carrying it. |
| **Definition** | **Bigger where you choose.** Targeted hypertrophy + a focus area. | Area-biased block (glutes / arms / posterior / balanced). | Wants shape in specific places; lift builds the shape, food reveals it. |

One-liner: **Strong = get stronger without getting bigger · Heavy = get bigger · Definition = get bigger where you choose.**

> **Naming:** third tier is **Definition**, not "Toned" (drops the gendered read; it's the honest word — muscle you can see). Strong / Heavy retained. **Default = Strong** (lowest fatigue, safest against the endurance side) — proposed, confirm.

### The "Definition" honest framing (ships as tier copy, verbatim)

> "Toning" isn't its own thing — it's muscle underneath plus low enough body fat to see it. The lifting below builds the shape (especially the glutes). Whether it shows is mostly food (enough protein, not a big surplus) plus a little conditioning. So: lift for the shape, eat for the reveal. *(Not diet or medical advice — the engine programs the lifting only.)*

### Where each dial hangs in existing code (trace 2026-08-05 — extend, don't rebuild)

- **Volume switch (Strong↔Heavy):** the two-lane pattern already exists — `strength-focus-split.ts` (`build` vs `power` lanes), plus the `RepProfile = strength|hypertrophy|maintenance|neural` vocab in `protocols/intent-taxonomy.ts`. **Missing piece:** a working `hypertrophy` rep-profile emitter (the base-phase ramp is deferred; `performance-neural.ts:162` emits an invalid `LOWER_HYPERTROPHY`).
- **Definition area bias:** the accessory-bias picker **shipped then was pulled to an "Adjust tab" (D-323)**. The mechanism survives — `single_leg_core` slot replacement in `assistance-menu.ts` + glute/hyrox fallbacks in `materialize-plan/index.ts:1169` + role tags in `exercise-role.ts:119`. Definition **re-lights that axis where D-323 sent it** (respects the prior decision, doesn't reverse it).
- **5/3/1 numbers:** single source `loading/wendler-531.ts` (`PCT_BY_WEEK`, `ANCHOR_REPS`; TM = **85%** of 1RM at `WORKING_NUMBER_PCT_OF_1RM`, 90% is the ceiling invariant). **Parameterize, do not copy.**
- **⛔ One structural decision first (from `docs/BUILD-ORDER-strength-spine.md`):** protocol + posture are currently **PLAN-scoped**. If tiers ever shift block-to-block, they must become **BLOCK-scoped**. For v1 (pick one tier per plan) plan-scoped is fine — decide before building if cross-block emphasis shifts are in scope.

---

## B. The front door — ✅ SHIPPED 2026-08-05, folded into **[D-382]** / **[D-384]**

**This section is gone. Its substance is `DECISIONS-LOG-2.md` D-382 (the door, the drill-down, the
seven locked calls) and D-384 (the eye, the palette, the sizing and copy).** Read those, not a copy
here — a spec section that outlives its build is how `docs/` rotted.

**What shipped:** Focus opens to Train · Race · Build; Train drills down to Run / Ride / Strength /
Athletic Focus; Strength opens the tiers (§A) then today's block; Race routes into the existing
marathon flow; Run / Ride / Athletic / Build are dimmed and inert. "Plan a season" moved inside Race.
Pushed + client-deployed, **not device-verified — see [Q-258]**.

⛔ **THE ONE THING TO CARRY FORWARD:** the tier's payload field name is **not** `strength_tier` — that
key already means the EQUIPMENT tier. See the warning in §10 and D-383.

---

---

## What is still open before this can be built

- **The tier does not reach the payload.** `strength_tier` is taken by the EQUIPMENT tier
  (`generate-strength-plan`, `strength_tier: 'barbell'`); `strength_intent` is the candidate. [D-383].
- **Plan-scoped vs block-scoped.** Protocol and posture are PLAN-scoped today. Fine for v1 (one tier
  per plan); decide before building if cross-block emphasis shifts are in scope.
- **The `hypertrophy` rep-profile emitter does not work** — `performance-neural.ts:162` emits an
  invalid `LOWER_HYPERTROPHY`.
- **Per-day override storage shape** and whether it survives re-materialize.
- **Default = Strong** — proposed, never confirmed.
