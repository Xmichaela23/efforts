# SPEC — Focus Front Door + Strength Intent Tiers + Assistance Rework (Wendler spine)

**Status:** BUILD CONTRACT — not built. Scaffolding; folds into a D-NNN and gets deleted on ship.
**Decided by:** Michael, 2026-08-05.
**Supersedes:** Q-212 (antagonist-balance — *partial*, see §8) and the "25 IS THE FLOOR AND IT STAYS" call of 2026-07-28 (see §8).
**Source of truth for "by the book":** Wendler, *5/3/1* 2nd ed. (`~/Downloads/531_2nd_Edition_Hard_Copy.pdf`), assistance chapter pp.46–54, concurrent chapter p.86.

**Three things this spec does:** (1) fixes the four accessory-selection defects (§0–§7), (2) wraps them in **three selectable strength tiers** on one Wendler spine (§A), and (3) reshapes the **front door** so the tiers have somewhere to be picked (§B). The tier changes the **strength work only** — accessory volume and character (plus a focus area for Definition). **Endurance is untouched** — the existing engine (quality days, hills, speed, run/ride choice, interference management) already handles it well; nothing here changes it. The 5/3/1 main-lift engine (TM, percentages, deload, the "+" set) is identical in all three.

**Source of truth is the Wendler book (above).** The strength side matches it; nothing here invents strength science. *(An earlier draft added an endurance-interference layer with external citations — Schumann/Van Hooren/Wilson. Removed 2026-08-05: endurance is out of scope, the existing engine already handles it. Strength matches Wendler, full stop.)*

---

## A. The three tiers (Strong / Heavy / Definition)

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

## B. The front door — three entry cards (Train / Race / Build), Train drills down

**Decided by Michael, 2026-08-05**, after the trace below. The tiers in §A need a place to be chosen,
and the goal step is currently a two-card screen. This section is the door only — it becomes a
**three-card entry (Train / Race / Build)** with drill-downs. The only *flows* that change: Strength
gains the tier step (§A), and Build is new (its work order). Race is a move, the placeholder
disciplines are stubs; nothing else is touched.

### Structure — three entry cards, Train drills down

**Decided by Michael, 2026-08-05.** NOT one screen of six. The entry is **three cards — Train · Race · Build** — and all three work. The disciplines live one tap under Train.

**Entry screen (3 cards):**

| Card | Treatment | Subtitle | Opens |
|---|---|---|---|
| **Train** | live (accent edge) | Run, ride, strength, or a mix | the four discipline cards ↓ |
| **Race** | live (accent edge) | Train for any race | the race list ↓ |
| **Build** | dashed ("create", set apart) | Write your own, the engine does the math | the build flow ↓ |

**Under Train (4 discipline cards):**

| Card | State | Subtitle | Opens |
|---|---|---|---|
| **Strength** | **LIVE** | Get stronger, bigger, or defined | the tier step (§A) → Strong / Heavy / Definition → today's flow |
| **Run** | PLACEHOLDER | Base, VO2 max, distance | nothing yet — greyed, non-tappable |
| **Ride** | PLACEHOLDER | FTP and endurance | nothing yet — greyed, non-tappable |
| **Athletic** | PLACEHOLDER | Several disciplines, balanced | nothing yet — greyed, non-tappable |

### Why drill-down beats bands (the change from the earlier draft)

The earlier draft put six cards in three bands on **one** screen. Drill-down is better for a reason the band version missed: **the three not-yet disciplines move off the front screen.** The first thing anyone sees is three choices that all work; the greyed ones only appear *once you've committed to Train.* Costs one extra tap on Strength — worth it. (`Athletic` = the ongoing, interference-managed multi-discipline plan; its subtitle must always show, since "Athletic" alone doesn't signal multi-discipline.)

### ⛔ Honesty rule — the door must not write a cheque the flow can't cash

Same trap as the July placeholders, one level down. Two entry subtitles promise more than exists today:

- **Race — "Train for any race."** Only the **marathon** flow is live; everything else behind Race is nothing yet.
- **Build — "Write your own…"** Spec'd for run/ride/strength, but only **strength** is in the work order.

Both are fine ONLY IF the drill-down scopes honestly: the **Race** screen shows marathon live and the rest greyed/not-yet; the **Build** screen shows strength live and run/ride not-yet — same greyed, non-tappable treatment as the disciplines under Train. **Entry subtitles may be broad; the screen behind each one must be honest about what is actually there.** Build is not a strength feature (author-your-own spans disciplines, `WORKORDER-build-your-own-strength-2026-08-04.md`); it just *opens* with strength.

### Locked calls

1. **Race Focus is a MOVE, not a build.** The `marathon` card comes off the top level and sits behind
   Race Focus. The race intake, the payload, the generator — **none of it is touched.** Michael,
   2026-08-05: *"we arent touching marathon."* Race is an **entry card**; the race list lives *under*
   it — **all races consolidate there, scoped to what's live (marathon today); no per-race top-level
   cards.** half / 10k / tri arrive inside the Race drill-down as they're built.
2. **Strength Focus keeps its whole current flow, and that flow IS the Strong tier.** Michael:
   *"we well use current stregnth fous for strong but it needs to be fixed based on the doc."* So
   Strong is not new work beyond §0–§7 — it is the block that exists, with the accessory defects
   fixed. Heavy and Definition are the two new dial settings on top of it.
3. **Placeholders live UNDER Train, greyed and non-tappable — never on the entry screen.** The three
   entry cards (Train / Race / Build) all work. The not-yet disciplines (Run / Ride / Athletic) appear
   only *after* tapping Train — greyed, no navigation, **no "Soon" tag.** ⛔ **Do not wire them to
   `build_endurance` / `build_speed` / `starting_over`** — those seed ids still exist in
   `non-race-goal-seeds.ts` and pointing a card at one would open exactly the unfinished flow this rule
   exists to keep shut. **Build is a live entry card** (SPEC'D, work order) — it opens with strength;
   run/ride *inside* it are the greyed ones (the honesty rule above).

> ⛔ **THIS REVERSES A STANDING CALL — BACK-ANNOTATE IT AT SHIP.** `NonRaceBuilder.tsx:60-70` carries
> Michael's 2026-07-25 instruction: *"let's clear out all the placeholders — let's just have Strength
> Focus now,"* with the reasoning *"a front door offering five things that do not work is worse than
> a door offering one that does."* **That reasoning is not wrong and it is not being discarded** — the
> difference is that these placeholders do not pretend to work. Rewrite that comment block when the
> cards land; do not leave it standing as a rule the code now breaks.

### Where it lives in code (traced 2026-08-05 — edit, do not rebuild)

- **The card list:** `GOAL_ORDER` (`src/components/NonRaceBuilder.tsx:77`) — today `['get_stronger', 'marathon']`.
- **The card render + the auto-advance on tap:** `NonRaceBuilder.tsx:1229-1260`, inside the `goal` step
  (`currentStep === 'goal'`, `:1218`). The per-card blurbs are inline here, gated on the goal id.
- **The labels:** `GOAL_LABELS` (`src/lib/non-race-goal-seeds.ts:34`) — one place, deliberately. The
  card, the goal name, the block summary and the duration copy all read it. **Add new labels here,
  not in the component** (a special case in the component is the exact bug that was fixed to create
  this rule).
- **The step machine:** `scheduleSteps()` / `getSteps` — the entry `goal` step now shows **three cards
  (Train / Race / Build)**; **Train adds a discipline-picker step**, and Strength adds the **tier step**
  (§A) after it. So the strength path is `goal → Train → Strength → tier → flow`. `stepNo()` /
  `hideProgress` already handle branches of unequal length (`:1222-1226`).
- **Placeholders need a fourth state.** `optBtn` (`:1211`) has active and inactive only. A
  not-yet-available style is new — keep it inside `optBtn` rather than a second style helper.

### Resolved on this section (Michael, 2026-08-05)

- **Tier reaches the plan as its own field `strength_tier`, NOT overloaded onto `strength_protocol`.**
  The tier carries three things (accessory volume, endurance trim, area bias); a protocol name carries
  one. Derive the protocol from the tier; do not cram the tier into it. `assemblePayload` (`:523-700`)
  gains `strength_tier` alongside the existing `strength_protocol`. Tier is **plan-scoped in v1** (see
  §A block-scoped note).
- **Placeholder card copy** — see the subtitle columns in the structure tables above. Stated as what
  each will be, not "coming soon." Placeholder disciplines render greyed and non-tappable **under
  Train** per Locked call #3.

---

## 0. The four defects this fixes

All live in `src/lib/assistance-menu.ts`, surfaced by `strength-primary-plan.ts`.

1. **Press days structurally cannot show a push.** `resolveAssistance` swaps any accessory that shares the main lift's movement *family*. A press day's main lift is always a press, so the `push` slot always collides, and it resolves through `BALANCE_POOL.push` — a list that contains **only pulls** (`Face Pull` first). Result: bench/OHP days get two pulls and zero push, every time, by design. Wendler never does this (§2).
2. **Lower-body work dumped on upper days.** The `single_leg_core` slot only gets rewritten on hinge days. On bench/OHP nothing collides with it, so `Single Leg Hip Thrust` passes straight through onto press days. Wendler's press-day third slot is abs, never legs (§2).
3. **Same lower-body pattern repeats day-to-day.** Hip Thrust on Squat day, Reverse Lunge on Deadlift day, Hip Thrust again on upper days — glute/ham load stacked across consecutive days and competing with the run legs.
4. **Reps floored at 25 — half the book's floor.** `ASSISTANCE_TOTAL_REPS_FLOOR = 25`. Every Wendler template floors at 50+ (§2). Fix: floor 50, ceiling 75, flat (§5).

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

## 5. Volume model — 50 floor, 75 ceiling (flat, Wendler)

Rewrite `assistanceTotalReps` (`assistance-menu.ts:109-139`) and `ASSISTANCE_TOTAL_REPS_FLOOR` (`90`).

- **Floor: 50** (Wendler's real minimum), replacing 25. **Ceiling: 75** (Michael, 2026-08-05 — was 50). The band opens up so the §A tiers have room: at ceiling 50 floor=ceiling and Strong/Heavy would be identical on volume. 75 gives Strong the floor, Heavy the top, under Wendler's own 75–100.
- **Same for everyone — Wendler does not split accessory reps by sport.** Floor 50 / ceiling 75 regardless of run or ride.
- The existing pull-slot scaling off `pullupMaxReps` stays as an *additional* earn toward the ceiling.
- **Anchor cycles still hold the floor** (existing rule, `line 115` — keep). The "insurance, not a target" framing and `assistanceBasisNote` copy stay.

> ⛔ **DO NOT add a runner/cyclist rep split here — that behavior is ALREADY BUILT elsewhere.** The app is already modality-aware where it belongs: the per-discipline `MAINTENANCE_FLOORS` in `generate-combined-plan/science.ts:822-827` back cardio off differently for runners (0.15) vs cyclists (0.12). Interference/modality is the existing engine's job; accessory reps stay Wendler-flat. *(An earlier draft re-specced this as a lower-body rep split — removed 2026-08-05, it duplicated built behavior. This is the exact "don't rebuild what exists" trap.)*

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
| `src/lib/assistance-menu.ts` | `resolveAssistance` (266-324): day-type slot roles (§3), push-stays-push (§4), upper-day core slot, lower-day variation. `BALANCE_POOL` (222-231): drop Face-Pull-as-push. `assistanceTotalReps` + FLOOR/CEILING (90-139): 50 floor / 75 ceiling, flat (§5) — no sport split. `ASSISTANCE_MENU` (150-191): add Incline/Ab Wheel/Front-Split-Squat. `assistanceSubstitutionNote` (335-354): variation copy. `ASSISTANCE_DEFAULTS` (194-198): reset. |
| `src/lib/exercise-config.ts` | Classification stays (`MovementFamily`, `COMPLEMENT`, `sharesMovementFamily`). May add patterns for new menu exercises. |
| `supabase/functions/_shared/strength-system/strength-primary-plan.ts` | `assistanceRows` (289-323) + call site (1339-1346): pass day-type. (No modality threading — reps are flat; interference lives in the existing `science.ts` floors.) |
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
   - Reps floor = 50, ceiling 75, flat across sports (no runner/cyclist rep split).
2. **Selection invariants:** rewrite `assistance-collision.test.ts` to the §4 rules.
3. **Deterministic — no recompute-for-variance needed.** The accessory/plan path has **no LLM** (verified 2026-08-05: no model calls in `strength-system` or `assistance-menu.ts`). Same input → same output, so a fixture asserting the exact resolved accessories per day is definitive on one run. (The ≥3-recompute rule is for stochastic/LLM generators; it does not apply here.)
4. **One Michael-driven acceptance run** at the end: regenerate a Strength Focus block, eyeball a press day (has a push), a lower day (varied legs), and the rep floors. Confirm the coefficient anchors (§5) read right on a real block — without tuning them to his numbers.

---

## 10. Open items to confirm before/at build

- ~~Ceiling 75 vs 50~~ **CLOSED — 75 (Michael, 2026-08-05).** See §5.
- ~~Tier payload field vs `strength_protocol`~~ **CLOSED — own field `strength_tier` (§B).**
- ~~Placeholder card copy~~ **CLOSED — subtitles in the §B table.**
- ~~Runner/cyclist lower-body split points~~ **DROPPED — reps are flat Wendler (§5); modality is the existing `science.ts` floors, already built.**
- Per-day override storage shape + re-materialize survival (§6).
- Exact default exercises per slot (§3) — roles are locked, exercises are tuning.
