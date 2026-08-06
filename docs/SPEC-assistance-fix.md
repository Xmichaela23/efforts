# SPEC — Strength Assistance Rework (Wendler spine)

> # ✅ THE ENTRY WORK IS DONE. THIS FILE IS NOW ONLY THE ACCESSORY REWORK.
>
> **Shipped 2026-08-05 — do NOT rebuild any of it, and do not read this file for it:**
>
> | What | Where it is recorded now |
> |---|---|
> | The **Focus front door** — Goals → Focus, Train · Race · Build, the Train drill-down to Run / Ride / Strength / Athletic Focus, "Plan a season" moved inside Race | **[D-382]** |
> | The **tier picker** — Strength opens Strong / Heavy / Definition; Strong is a pass-through to today's block | **[D-383]** |
> | The **eye mark, the discipline palette, sizing and copy**, the Current / Start-something-new labels | **[D-384]** |
>
> 8 commits, `5634b4f3` → `8a0efcd7`. **Pushed + client-deployed** (client only — no edge function was
> touched). **Not device-verified — [Q-258].** The old §B is deleted; §B below is a stub pointing here.
>
> ⛔ **WHAT IS LEFT IS §0–§7: the four accessory-selection defects. NO CODE HAS BEEN WRITTEN FOR THEM.**
> Plus the engine behind the two dark tiers (§A) — the picker exists, the two protocols do not.

**Status:** BUILD CONTRACT for **§0–§7 only** (not built) + the §A engine (not built). The entry work
above is SHIPPED and folded into its D-entries. This file gets deleted when §0–§7 lands.
**Decided by:** Michael, 2026-08-05.
**Supersedes:** Q-212 (antagonist-balance — *partial*, see §8) and the "25 IS THE FLOOR AND IT STAYS" call of 2026-07-28 (see §8).
**Source of truth for "by the book":** Wendler, *5/3/1* 2nd ed. (`~/Downloads/531_2nd_Edition_Hard_Copy.pdf`), assistance chapter pp.46–54, concurrent chapter pp.86–88.

> ⛔ **AND WE RUN TWO BOOKS, NOT ONE. Read this before "correcting" anything to match the PDF.**
> Verified page by page 2026-08-05. The **numbers** are 2nd edition and match it exactly; the
> **structure** is *5/3/1 Forever* (2017), whose vocabulary does not appear in the 2nd edition at all.
>
> | What | Which book | Verified |
> |---|---|---|
> | Week percentages 65/75/85 · 70/80/90 · 75/85/95 · deload 40/50/60, reps 5/3/1 | 2nd ed. **p.23, "option one"** — Wendler's own recommended set | ✅ exact match to `PCT_BY_WEEK` / `ANCHOR_REPS` |
> | No max-reps set in the deload | 2nd ed. p.24 | ✅ matches (`amrap: … && !isDeload`) |
> | +5 lb upper / +10 lb lower per cycle | 2nd ed. p.63 | ✅ matches `cycleIncrementLb` |
> | e1RM = `Weight × Reps × .0333 + Weight` | 2nd ed. p.99 | ✅ matches `WENDLER_EPLEY_COEFF`, pinned by test |
> | **Training max = 85% of 1RM** | ⚠️ **NOT the 2nd ed.** — it says **90%**, on pp.21/22/30/60/91/99/104/106, with no exception. 85% and "lower it when recovery is uncertain" are *Forever* | sound for a hybrid athlete, **cited to the wrong book** |
> | **"Leader" / "anchor"** | ⚠️ **NOT the 2nd ed.** — neither word appears anywhere in it. *Forever* | — |
> | **Leader weeks carry no all-out set** | ⚠️ **NOT the 2nd ed.** — it gives every non-deload week a "+" set (p.23). *Forever*'s leaders drop it | deliberate, and `wendler-531.ts:44-50` argues it well |
>
> **Nothing here is wrong science** — it is Wendler's own later refinement, and lowering the training
> max is the right call for someone running three days a week. **The risk is a future session opening
> the 2nd edition, reading "90%", and "fixing" `WORKING_NUMBER_PCT_OF_1RM` back up.** That comment
> currently attributes the 80–85% advice to Wendler without naming which book, which is the opening.

> ## ⛔ THE SCHEDULING INSTRUCTION — read this before "fixing" the week to match the book
>
> **"Place the lifts around the pinned endurance days, book rules as far as the anchors allow."
> NOT "force the pure book week."** Michael, 2026-08-05.
>
> The book's basic week (2nd ed. p.11) is **Press · Deadlift · Bench · Squat** — it alternates
> upper/lower, and in all three of Wendler's suggested day sets the two pressing days land 3 days
> apart. That is the target **shape**, not a layout to impose. The athlete's endurance days are
> ANCHORS (§2.3, hard), the clearance law binds above everything, and the book gets whatever room is
> left after both. A week that matches p.11 and breaks a 48h long-run clearance is wrong; a week that
> misses p.11 because the anchors did not allow it is right, and should SAY it missed.
>
> ⚠️ **There is a live conflict, and it is not a bug to silently resolve.** `upperLowerShortfall`
> pushes press days ≥3 days from leg days; the book puts them ADJACENT (Mon Press, Tue Deadlift).
> The two pull opposite ways, and `upperLowerShortfall` outranks Q-214's press-spacing term by
> Michael's explicit call — so the book's alternation loses on score (measured 5 vs 4 on the
> no-anchor week). **Whether that floor should survive contact with p.11 is Michael's to rule on.
> Do not reverse it in passing.**

**What the remaining work does:** fixes the four accessory-selection defects (§0–§7), and builds the
engine behind the tiers (§A). The tier changes the **strength work only** — accessory volume and
character (plus a focus area for Definition). **Endurance is untouched** — the existing engine (quality
days, hills, speed, run/ride choice, interference management) already handles it well; nothing here
changes it. The 5/3/1 main-lift engine (TM, percentages, deload, the "+" set) is identical in all three.

**Source of truth is the Wendler book (above).** The strength side matches it; nothing here invents strength science. *(An earlier draft added an endurance-interference layer with external citations — Schumann/Van Hooren/Wilson. Removed 2026-08-05: endurance is out of scope, the existing engine already handles it. Strength matches Wendler, full stop.)*

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
- **Periodization Bible (pp.50–51):** Bench *and* Press days **lead** with "Shoulders or Chest — DB bench, DB Incline, DB Military, **Incline press, Dips, Pushups**," then Lats/Upper Back, then Triceps.
- **Simplest Strength Template (pp.52–55):** the *one* anti-repeat rule — pair each lift with an *opposing loadable* assistance: squat↔a pull, deadlift↔a squat-pattern, bench↔incline, **press↔a supine press.** Note: bench's balance is *incline* — a **different press**, not a pull. Wendler varies the push; he never deletes it. The worked template (p.55) is Press→**Close Grip Bench**, Bench→**Incline Press**.

> ⛔ **CORRECTED 2026-08-05 — THE THIRD SLOT ON A PRESS DAY IS NOT "TRICEPS OR ABS".** An earlier
> draft of this line said that, and read against the pages it is wrong in a way that matters, because
> §3 below locks the upper-day slot roles. **Four of the five templates put ARMS / UPPER BACK there
> and put ABS on the lower days:** Periodization Bible (p.51) = Triceps; Simplest Strength (p.55) =
> "Lats, Upper Back, Triceps, Biceps" on press days and "Hamstrings, Lower Back, Abs" on squat and
> deadlift days; Bodyweight (p.52) = Press→Chins+Dips, Bench→Chins+Pushups, with Leg Raises on
> deadlift day and Sit-ups on squat day; Triumvirate (p.48) = Hanging Leg Raise on deadlift day only.
>
> ✅ **Abs-on-an-upper-day has exactly ONE source, and it is the right one for us:** the **concurrent
> chapter, p.87**, whose upper-body AND lower-body templates both end in a **Core Movement**. That is
> the chapter written for an athlete who lifts and conditions — us. **So §3's upper-day core slot
> STANDS; it is sourced from p.87, not from the four powerlifting templates.** Choosing it over
> triceps is a deliberate call, and it should be recorded as one rather than presented as "the book
> says abs", which the book does not.

- **Concurrent chapter (pp.86–88)** — the *one* template that makes the **strength** assistance a pure antagonist (bench→chins, press→bent-over rows). Cited correctly by `assistance-menu.ts` for that pairing, and it is the minimal model we explicitly did not take (Option 2 in the decision); see §8.

> ⛔ **AND p.86 IS NOT A ONE-MOVEMENT TEMPLATE — THE PAGE OUR CURRENT CODE LEANS ON REFUTES IT.**
> Verified 2026-08-05. `resolveAssistance` cites p.86 to justify a press day resolving to a pull. The
> pairing on p.86 is real, but it is only the *strength* half; **pp.87–88 continue the same template
> with a conditioning circuit containing two more upper-body assistance movements and a core
> movement.** Wendler's own worked example, p.88:
>
> > Bench Press 5/3/1 → Barbell Rows 5×10 → 3 rounds of: Med Ball Slams · **Dips** · Burpees ·
> > Chin-ups · Planks
>
> **Dips are on the bench day, in the very template we quote to prove they should not be.** And p.87's
> "Assistance Movements for Upper Body" list is push AND pull throughout — bench, dips, press, incline,
> DB presses, floor press, close grip, push-ups, ring push-ups, push press, alongside the chins and
> rows. **There is no page anywhere in this book where a push slot becomes a pull.** `BALANCE_POOL.push`
> is invented. This is the strongest evidence for defect #1 and it comes from defect #1's own citation.

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
| 1 | **Pull / posterior** | The 4 main lifts contain no row or chin — pulling volume must live here. | Squat → Chin-up or DB Row. Deadlift → a squat-pattern (Front Squat / Bulgarian Split Squat) per Simplest Template. |

> ⚠️ **CORRECTED 2026-08-05 — "Squat↔pull (book)" WAS A MISREADING OF p.53, AND THE CONCLUSION STILL
> HOLDS ON A DIFFERENT PAGE.** p.53 says *"I have paired the squat day with an assistance pulling
> movement."* Read alone that sounds like a row or a chin-up. **It is not:** the template it describes
> (p.55) pairs Squat → **Straight Leg Deadlift** — a pull off the floor, a hinge, not an upper-body
> pull. **No powerlifting template in the book puts an upper-body pull on a lower day.**
>
> ✅ **The real support is p.88, and it is explicit.** The concurrent chapter's worked squat session
> is: Squat 5/3/1 → Good Mornings → 2 rounds of Hang Clean · Wall Sits · Mountain Climbers ·
> **"Chin-ups (these can be done both days) – 15 reps"** · Pikes. Wendler puts chins on the lower day
> and says in parentheses that they belong on both. **Same chapter as the core slot, same athlete.**
> Cite p.88 here, not p.53.
| 2 | **Single-leg / quad (varied across the two days)** | Must NOT repeat the same pattern on consecutive lower days. | Squat day → Bulgarian Split Squat; Deadlift day → Reverse Lunge (or swap — just not identical). |
| 3 | **Core / abs** | Abs. | Hanging Leg Raise or Ab Wheel. |

> The exercise-level defaults above are the *starting* block, tuned during build against the book's menus and the existing `ASSISTANCE_MENU` option lists. The **roles and rules** (columns 2–3) are the locked contract; the specific exercises are adjustable and, per §6, athlete-overridable.

**Menu additions likely needed:** `Incline Press` (push), `Ab Wheel` (core), `Front Squat` / `Split Squat` (lower). Confirm against `ASSISTANCE_MENU` (`assistance-menu.ts:150-191`) during build.

---

## 4. New collision / variation rules

Rewrite the logic in `resolveAssistance` (`assistance-menu.ts:266-324`) and `BALANCE_POOL` (`222-231`).

- **Push slot, press-day collision → a DIFFERENT PUSH.** Never a pull. Resolve within the push family to a different movement pattern than the main lift (horizontal press → incline/vertical/dips; vertical press → horizontal press/dips). This is the core fix for defect #1.
- **Pull slot → keep antagonist + plane-complement** (unchanged; `COMPLEMENT` map, `complementFor`). OHP → Inverted Row stays correct.
- **Face Pull comes out of the PUSH slot — and that is the whole of it.** ⚠️ **Corrected 2026-08-05: an earlier draft said "it is prehab, demote it," and the book does not support that.** Wendler lists Face Pulls on **p.50 under "Lats or Upper Back"** as a legitimate 5×10–20 choice, right beside DB rows, chins and T-bar rows. What p.53 says is narrower — face pulls are not in the **"big" loadable** category (alongside DB benches, also excluded), so they can't be the *second lift of the day*. **Neither statement makes it prehab, and neither is the defect.** The defect is that we made an upper-back movement the answer to a **push** slot. So: remove it from `BALANCE_POOL.push`, **keep it available in the pull slot**, and do not write copy calling it prehab. (Equipment substitution Face Pull→"Band Face Pulls" in `materialize-plan` becomes moot for the push slot only.)
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
| `supabase/functions/shared/strength-system/strength-primary-plan.ts` | `assistanceRows` (289-323) + call site (1339-1346): pass day-type. (No modality threading — reps are flat; interference lives in the existing `science.ts` floors.) |
| `supabase/functions/shared/strength-system/assistance-collision.test.ts` | **Rewrite the pinned invariants** (§8) — Bench push slot must now assert a push, not Face Pull. |
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
