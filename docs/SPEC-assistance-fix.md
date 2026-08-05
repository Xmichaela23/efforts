# SPEC — Strength Intent Tiers + Assistance Rework (Wendler spine)

**Status:** BUILD CONTRACT — not built. Scaffolding; folds into a D-NNN and gets deleted on ship.
**Decided by:** Michael, 2026-08-05.
**Supersedes:** Q-212 (antagonist-balance — *partial*, see §8) and the "25 IS THE FLOOR AND IT STAYS" call of 2026-07-28 (see §8).
**Source of truth for "by the book":** Wendler, *5/3/1* 2nd ed. (`~/Downloads/531_2nd_Edition_Hard_Copy.pdf`), assistance chapter pp.46–54, concurrent chapter p.86.

**Two things this spec does:** (1) fixes the four accessory-selection defects (§0–§7), and (2) wraps them in **three selectable intent tiers** on one Wendler spine (§A). The tier chooses accessory *volume*, accessory *character*, and how hard *endurance* is trimmed. The 5/3/1 main-lift engine (TM, percentages, deload, the "+" set) is identical in all three.

**⛔ Citation rule (Michael, 2026-08-05):** every figure cites the *paper*, verified against the source — **never** the repo doc. Our own docs were found to carry at least one fabricated-looking effect size (see §A endurance note). Verified so far: Schumann 2023, Van Hooren 2024. Direction-only (numbers unverified): Wilson 2012. Not yet checked: Doma 2017, Coffey & Hawley 2017, Sabag 2018, Eddens 2018 — verify before they enter copy.

---

## A. The three tiers (Strong / Heavy / Definition)

One Wendler spine, three intents. Same main lifts and 5/3/1 loading; the tier moves three dials — accessory **volume**, accessory **character**, and **endurance trim**.

### What each gets the user

| Tier | The user gets | In the plan they'd see | Endurance | Who it's for |
|---|---|---|---|---|
| **Strong** *(default)* | **Stronger without getting bigger.** Neural / max-strength. | Minimal accessories — floor volume, ~2 movements, kept fresh; plyos for power. | **Kept high** — low lifting fatigue leaves room. | Performance-focused triathlete mid-season; anyone who doesn't want added mass. |
| **Heavy** | **Bigger — visible muscle.** Hypertrophy. | Most accessory tonnage — 3 full slots at high reps + "Boring But Big" 5×10 size work. | **Trimmed to maintenance floor** — fewer/shorter easy sessions. | Off-season / base block; wants to add muscle and accepts carrying it. |
| **Definition** | **Bigger where you choose.** Targeted hypertrophy + a focus area. | Area-biased block (glutes / arms / posterior / balanced) + some conditioning kept on purpose. | **Middle** — keeps some conditioning deliberately. | Wants shape in specific places; lift builds the shape, food reveals it. |

One-liner: **Strong = get stronger without getting bigger · Heavy = get bigger · Definition = get bigger where you choose.**

> **Naming:** third tier is **Definition**, not "Toned" (drops the gendered read; it's the honest word — muscle you can see). Strong / Heavy retained. **Default = Strong** (lowest fatigue, safest against the endurance side) — proposed, confirm.

### The "Definition" honest framing (ships as tier copy, verbatim)

> "Toning" isn't its own thing — it's muscle underneath plus low enough body fat to see it. The lifting below builds the shape (especially the glutes). Whether it shows is mostly food (enough protein, not a big surplus) plus a little conditioning. So: lift for the shape, eat for the reveal. *(Not diet or medical advice — the engine programs the lifting only.)*

### The endurance dial — the one net-new, non-Wendler layer

Wendler's book barely addresses endurance; this coupling is **ours**, labeled as ours, and it rests on verified sources (§ citation rule):

- **Core principle — cutting endurance is a fatigue/time budget, almost never gain-protection.** Concurrent training *preserves* maximal strength and hypertrophy; only power/explosive is meaningfully blunted.
  > **Schumann et al. 2023**, *Sports Medicine*, DOI 10.1007/s40279-023-01943-9 — 43 studies: max strength SMD **−0.06**, hypertrophy **−0.01** (trivial); explosive **−0.28** within-session. **Verified against source.**
- **Strong keeps endurance** — max strength is the concurrent-tolerant adaptation (Schumann 2023) and low accessory volume = low total fatigue. ⚠️ Holds **only while "neural" means max strength.** If it ever means power/explosive, endurance must be capped *harder* (power is the sensitive adaptation, Schumann's −0.28; Wilson 2012 same direction).
- **Heavy trims endurance** — *not* to protect the muscle (hypertrophy survives concurrent, Schumann 2023) but to keep total weekly load recoverable. Avoid unwanted mass/fatigue: **Van Hooren et al. 2024**, *Sports Medicine*, DOI 10.1007/s40279-024-02110-4 — heavy loads >85–90%, stop one rep shy of failure to avoid hypertrophy the endurance athlete didn't ask for; add 1–2 plyometrics for RFD. **Verified against source.**
- **Definition keeps some conditioning** — hypertrophy survives concurrent (Schumann 2023) so conditioning doesn't threaten the shape; the reveal is food (framing above), not something we cite or prescribe.
- **Modality split (runner vs cyclist lower-body volume):** running interferes with lower-body strength/hypertrophy more than cycling — **Wilson et al. 2012**, *J Strength Cond Res* 26(8):2293–2307, PMID 22002517. ⚠️ **Direction only** — the specific effect sizes our repo doc quoted (0.94 / 0.32) do **not** match the abstract and are treated as unverified until pulled from full text. Dissenting signal: **Sabag 2018** (verify) found the reverse in one HIIT analysis. So: stay **conservative** (runner trims lower-body), don't claim it's settled.

### Where each dial hangs in existing code (trace 2026-08-05 — extend, don't rebuild)

- **Volume switch (Strong↔Heavy):** the two-lane pattern already exists — `strength-focus-split.ts` (`build` vs `power` lanes), plus the `RepProfile = strength|hypertrophy|maintenance|neural` vocab in `protocols/intent-taxonomy.ts`. **Missing piece:** a working `hypertrophy` rep-profile emitter (the base-phase ramp is deferred; `performance-neural.ts:162` emits an invalid `LOWER_HYPERTROPHY`).
- **Definition area bias:** the accessory-bias picker **shipped then was pulled to an "Adjust tab" (D-323)**. The mechanism survives — `single_leg_core` slot replacement in `assistance-menu.ts` + glute/hyrox fallbacks in `materialize-plan/index.ts:1169` + role tags in `exercise-role.ts:119`. Definition **re-lights that axis where D-323 sent it** (respects the prior decision, doesn't reverse it).
- **Endurance trim:** *not built.* Extension point is `MAINTENANCE_FLOORS` + the posture clamp in `generate-combined-plan/science.ts:795-827`. The coupling "strength intent → cardio cap" is exactly what `docs/SCIENCE-concurrent-training-interference.md:37,85` asks for and does not yet exist.
- **5/3/1 numbers:** single source `loading/wendler-531.ts` (`PCT_BY_WEEK`, `ANCHOR_REPS`; TM = **85%** of 1RM at `WORKING_NUMBER_PCT_OF_1RM`, 90% is the ceiling invariant). **Parameterize, do not copy.**
- **⛔ One structural decision first (from `docs/BUILD-ORDER-strength-spine.md`):** protocol + posture are currently **PLAN-scoped**. If tiers ever shift block-to-block, they must become **BLOCK-scoped**. For v1 (pick one tier per plan) plan-scoped is fine — decide before building if cross-block emphasis shifts are in scope.

---

## 0. The four defects this fixes

All live in `src/lib/assistance-menu.ts`, surfaced by `strength-primary-plan.ts`.

1. **Press days structurally cannot show a push.** `resolveAssistance` swaps any accessory that shares the main lift's movement *family*. A press day's main lift is always a press, so the `push` slot always collides, and it resolves through `BALANCE_POOL.push` — a list that contains **only pulls** (`Face Pull` first). Result: bench/OHP days get two pulls and zero push, every time, by design. Wendler never does this (§2).
2. **Lower-body work dumped on upper days.** The `single_leg_core` slot only gets rewritten on hinge days. On bench/OHP nothing collides with it, so `Single Leg Hip Thrust` passes straight through onto press days. Wendler's press-day third slot is abs, never legs (§2).
3. **Same lower-body pattern repeats day-to-day.** Hip Thrust on Squat day, Reverse Lunge on Deadlift day, Hip Thrust again on upper days — glute/ham load stacked across consecutive days and competing with the run legs.
4. **Reps floored at 25 — half the book's floor.** `ASSISTANCE_TOTAL_REPS_FLOOR = 25`. Every Wendler template floors at 50+ (§2). The floor is also flat across disciplines, ignoring that running interferes with lower-body strength ~3× more than cycling (Wilson 2012).

---

## 1. Decisions locked

| # | Decision | Choice |
|---|---|---|
| A | **Slot model** | Keep 3 slots per day; **fill the push** (Triumvirate / Periodization reading). Press days carry a real, varied push. |
| B | **Volume** | Raise floor **25 → 50** (Wendler's real minimum) AND make **lower-body** accessory volume **modality-aware** (runner conservative, cyclist headroom). Upper-body accessory not modality-split. |
| C | **Who picks** | **Both.** Engine ships a Wendler-correct default block; a **full per-day picker** lets the athlete swap any slot. Copy: "This is Wendler's block — change any of it." |

---

## 2. What "by the book" means (citations)

Every Wendler assistance template that touches a pressing day keeps a **push** on it, and varies *which* push:

- **The Triumvirate (p.48):** Military Press → **Dips** 5×15 + Chin-ups 5×10. Bench → DB Bench + DB Row. Push + pull, never two pulls.
- **Bodyweight (p.52):** Bench → **Pushups** + Chins. Press → Dips + Chins.
- **Periodization Bible (pp.50–51):** Bench *and* Press days **lead** with "Shoulders or Chest — DB bench, Incline, **Dips, Pushups**," then a pull, then triceps. The third slot on press days is **triceps or abs — never lower body.** Lower-body days (Squat, Deadlift) carry the two leg categories **+ abs**.
- **Simplest Strength Template (pp.52–54):** the *one* anti-repeat rule — pair each lift with an *opposing loadable* assistance: squat↔a pull, deadlift↔a squat-pattern, bench↔incline, **press↔a supine press.** Note: bench's balance is *incline* — a **different press**, not a pull. Wendler varies the push; he never deletes it.
- **Concurrent chapter (p.86)** — the *one* template that makes the assistance the pure antagonist (bench→chins) — is the minimal 1-movement model we explicitly **did not** take (Option 2 in the decision). It's why the old code cross-balanced; see §8.

**Reps floors, every template:** Triumvirate 50–75 per movement; Bodyweight "no less than 75 per exercise"; Periodization Bible 5×10–20 (50–100). Wendler's lowest number anywhere is **50**. We were at 25.

**Modality (why lower-body volume splits by discipline):** see §A "endurance dial" for the verified citations. Short form: concurrent training preserves max strength and hypertrophy (Schumann 2023 — verified), so low accessory volume is a fatigue/"don't-build-unwanted-size" choice (Van Hooren 2024 — verified), not strength-preservation; and running interferes with lower-body more than cycling (Wilson 2012 — direction only, numbers unverified), so the runner/cyclist split lives on the lower-body slot. **Do not cite the `docs/STRENGTH-PROTOCOL.md` effect sizes as fact — verify against source first.**

---

## 3. New selection model — per-day accessory template

Replace the single global `push / pull / single_leg_core` triad with **day-type slot roles**. The engine fills each day's three slots from the book, then the athlete may override (§6).

### Upper-body days (Bench, Overhead Press)
| Slot | Role | Rule | Proposed default |
|---|---|---|---|
| 1 | **Push (varied)** | A press that is NOT the main lift's pattern. Stays in the push family. | Bench → Incline Press or Dips. OHP → DB Bench / Pushup / Dips. |
| 2 | **Pull (plane-complement)** | Antagonist pull, plane-complementing the main press (keep existing `COMPLEMENT` logic — this part was right). | Bench (horizontal push) → vertical pull (Chin-up). OHP (vertical push) → horizontal pull (Inverted Row / DB Row). |
| 3 | **Core / abs** | Abs, **never lower-body.** | Hanging Leg Raise or Ab Wheel. |

### Lower-body days (Squat, Deadlift)
| Slot | Role | Rule | Proposed default |
|---|---|---|---|
| 1 | **Pull / posterior** | The 4 main lifts contain no row or chin — pulling volume must live here. Squat↔pull (book). | Squat → Chin-up or DB Row. Deadlift → a squat-pattern (Front Squat / Split Squat) per Simplest Template. |
| 2 | **Single-leg / quad (varied across the two days)** | Must NOT repeat the same pattern on consecutive lower days. | Squat day → Bulgarian Split Squat; Deadlift day → Reverse Lunge (or swap — just not identical). |
| 3 | **Core / abs** | Abs. | Hanging Leg Raise or Ab Wheel. |

> The exercise-level defaults above are the *starting* block, tuned during build against the book's menus and the existing `ASSISTANCE_MENU` option lists. The **roles and rules** (columns 2–3) are the locked contract; the specific exercises are adjustable and, per §6, athlete-overridable.

**Menu additions likely needed:** `Incline Press` (push), `Ab Wheel` (core), `Front Squat` / `Split Squat` (lower). Confirm against `ASSISTANCE_MENU` (`assistance-menu.ts:150-191`) during build.

---

## 4. New collision / variation rules

Rewrite the logic in `resolveAssistance` (`assistance-menu.ts:266-324`) and `BALANCE_POOL` (`222-231`).

- **Push slot, press-day collision → a DIFFERENT PUSH.** Never a pull. Resolve within the push family to a different movement pattern than the main lift (horizontal press → incline/vertical/dips; vertical press → horizontal press/dips). This is the core fix for defect #1.
- **Pull slot → keep antagonist + plane-complement** (unchanged; `COMPLEMENT` map, `complementFor`). OHP → Inverted Row stays correct.
- **Face Pull is demoted.** It is prehab, not the push slot. Remove it from `BALANCE_POOL.push` as a push-slot replacement. If we want rear-delt/upper-back prehab, it's a separate optional add-on, not the accessory slot. (Equipment substitution Face Pull→"Band Face Pulls" in `materialize-plan` becomes moot for the push slot.)
- **Third slot on upper days = core/abs**, resolved independent of the main lift (no lower-body).
- **Lower-day single-leg/quad slot = varied** between the two lower days (dedupe by movement pattern across Squat and Deadlift days).

New collision-note copy (`assistanceSubstitutionNote`, `335-354`) must read as *variation*, not deletion — e.g. "Dips instead of Bench-pattern work — same push, different angle, so it's not just repeating the main lift," not "this slot balances instead."

---

## 5. Volume model — 50 floor, modality-aware

Rewrite `assistanceTotalReps` (`assistance-menu.ts:109-139`) and `ASSISTANCE_TOTAL_REPS_FLOOR` (`90`).

- **Floor: 50** (Wendler's real minimum), replacing 25. Ceiling stays modest for a concurrent athlete — **proposed 75** (was 50); confirm.
- **Upper-body accessory:** floor 50 for both disciplines. The existing pull-slot scaling off `pullupMaxReps` stays as an *additional* earn toward the ceiling.
- **Lower-body accessory — modality-aware:**
  - **Run-primary athlete:** hold lower-body accessory at/near the floor (conservative — running already loads those tissues, Wilson 2012).
  - **Ride-primary athlete:** lower-body accessory earns headroom toward the ceiling.
  - Discipline read from the athlete's per-discipline posture / sport (`goals.training_prefs`, same source the plan already uses). Duathlete/triathlete with both: treat as run-primary for the lower-body slot (the more-interfering modality governs).
- **Anchor cycles still hold the floor** (existing rule, `line 115` — keep). The "insurance, not a target" framing and `assistanceBasisNote` copy stay.

> Exact coefficients (floor 50, ceiling 75, the runner/cyclist lower-body split points) are proposed anchors, not hand-tuned to any one athlete. Settle them during build against the book + interference science, and confirm on Michael's acceptance run (§9). **Do not tune to Michael's numbers.**

---

## 6. UX — default block + per-day picker

- **Default:** engine generates the §3 block automatically. No wizard step required. The coarse global picks already collected (`NonRaceBuilder.tsx:1979-1992`) seed the defaults where they apply, but the engine owns the per-day result.
- **Override (the "full day picker"):** a per-day editor on the generated plan where the athlete can swap **any** of the three slots from that slot's full menu. Framed as "This is Wendler's block — change any of it."
- **Persistence:** per-day overrides stored keyed by main-lift/day; unset slots fall back to the engine default. Storage location TBD during build (candidate: `goals.training_prefs.assistance_overrides`), must survive re-materialize.
- **Not in the build wizard** — this is an *adjust-later* surface on the plan, so the default path stays one tap. Keep it bro-friendly (Strong/Hevy: template with full edit), no clinical labels.

---

## 7. Code touch points (from trace, do not rebuild — edit)

| File | What changes |
|---|---|
| `src/lib/assistance-menu.ts` | `resolveAssistance` (266-324): day-type slot roles (§3), push-stays-push (§4), upper-day core slot, lower-day variation. `BALANCE_POOL` (222-231): drop Face-Pull-as-push. `assistanceTotalReps` + FLOOR/CEILING (90-139): 50 floor, modality-aware lower-body (§5). `ASSISTANCE_MENU` (150-191): add Incline/Ab Wheel/Front-Split-Squat. `assistanceSubstitutionNote` (335-354): variation copy. `ASSISTANCE_DEFAULTS` (194-198): reset. |
| `src/lib/exercise-config.ts` | Classification stays (`MovementFamily`, `COMPLEMENT`, `sharesMovementFamily`). May add patterns for new menu exercises. |
| `supabase/functions/_shared/strength-system/strength-primary-plan.ts` | `assistanceRows` (289-323) + call site (1339-1346): pass day-type; thread modality/sport for §5. |
| `supabase/functions/_shared/strength-system/assistance-collision.test.ts` | **Rewrite the pinned invariants** (§8) — Bench push slot must now assert a push, not Face Pull. |
| `src/components/NonRaceBuilder.tsx` | Seed-only; add the per-day override surface (§6) — likely a separate plan-side component, not the wizard. |
| `materialize-plan/index.ts` (~1109/1384) | Equipment substitution unaffected except Face-Pull-as-push is gone. |

> Per `_shared` deploy trap: redeploy `strength-primary-plan.ts`'s importers. Find with `grep -rln "strength-primary-plan" supabase/functions --include=index.ts`.

---

## 8. Supersessions

- **Q-212 (antagonist-balance) — PARTIAL supersede.** The push-slot half is *reversed*: a push that collides with a press now resolves to a different push, not a pull. The pull-slot half (plane-complement, OHP→Inverted Row) is *kept*. The test file that pins `Bench push → Face Pull` must be rewritten to the new invariant. Back-annotate Q-212 with a `>` blockquote at ship.
- **"25 floor stays" (2026-07-28, Michael's call, `assistance-menu.ts:77`) — SUPERSEDED** by this spec's floor of 50, modality-aware (Michael, 2026-08-05). Update the `⛔ 25 IS THE FLOOR` comment block, and the matching lines in `docs/SPEC-get-stronger.md:470-471` and `docs/BUILD-ORDER-strength-spine.md:90-91`.
- The concurrent-chapter (p.86) rationale in `DECISIONS-LOG` (the "that is our athlete exactly" entry) is **not** wrong — it correctly reads Wendler's concurrent template. This spec chooses the Triumvirate/Periodization model over it deliberately (decision C/A). Note the choice in the new D-NNN; do not delete the p.86 reasoning.

---

## 9. Verification

Per house method — deno fixtures, not prod; bug-case fixtures become permanent regressions.

1. **Regression fixtures (permanent):** one per defect in §0 —
   - Bench day emits a **push** accessory (not two pulls).
   - OHP day emits a push + a pull + core; no Face-Pull-as-push.
   - No lower-body movement on any upper day; third slot is core/abs.
   - Squat-day and Deadlift-day single-leg/quad patterns differ.
   - Floor = 50; run-primary lower-body accessory ≤ ride-primary at equal inputs.
2. **Selection invariants:** rewrite `assistance-collision.test.ts` to the §4 rules.
3. **Recompute stability:** the plan generator has an LLM narration layer — verify any generated-plan change with **≥3 back-to-back recomputes, all clean**, never one.
4. **One Michael-driven acceptance run** at the end: regenerate a Strength Focus block, eyeball a press day (has a push), a lower day (varied legs), and the rep floors. Confirm the coefficient anchors (§5) read right on a real block — without tuning them to his numbers.

---

## 10. Open items to confirm before/at build

- Ceiling: 75 vs keep 50. (Proposed 75.)
- Runner/cyclist lower-body split points — the actual floor/ceiling each discipline lands on.
- Per-day override storage shape + re-materialize survival (§6).
- Exact default exercises per slot (§3) — roles are locked, exercises are tuning.
