# RACE-WEEK PROTOCOL

> **Status: IMPLEMENTED & SHIPPED — 2026-05-18 (Phases 1–4 complete).** §8 (the locked spec) is fully implemented and deployed: Phase 1 `4a63f44e` (§8.1 A/B + chronology guard) · Phase 2 `9c393119` (§8.3 distance-aware race day + §8.4 hard guarantee) · Phase 3 `7221b8d5` (§8.2 A-taper inviolable + §8.5 min-rebuild + Decision-A hard-fail) · Phase 4 `f7580ec5`/`3076ba72`/`0b54318d`/`95bd017e` (§8.6 Gap 6 / 9b-d / 8-T6 / 7). Locked rationale → DECISIONS-LOG **D-019**; verified-state → ENGINE-STATE "Solid → Race-week protocol (Phases 1–4)". §1–4 remain the verified current contract; §5 is the (now-closed) gap analysis.

---

## 0. Scope & supersession

### 0.1 What this doc owns
The **race-week**, **taper-into-race transition**, and **post-race handoff** for `generate-combined-plan` (multi-sport / triathlon plans with a B-race and an A-race). The race week as a *distinct architectural class* — not the general phase machinery.

### 0.2 What it does NOT own (pointers)
- General phase structure / macrocycle → `generate-combined-plan/phase-structure.ts`, `science.ts`.
- Same-day placement / sequencing → `docs/SCHEDULING-RULES.md` (prescriptive), `docs/SCHEDULING-RULES-EXTRACTED.md` (descriptive).
- Strength session internals & inter-race rebuild strength → `docs/STRENGTH-PROTOCOL.md` §3.7, §7.4 (authoritative; this doc references, does not restate).
- Swim session internals → `docs/SWIM-PROTOCOL.md` §4.4.
- Brick caps → `docs/BRICK-PROTOCOL.md`.

### 0.3 Binding rules this spec must not contradict
- **`SCHEDULING-RULES.md §3.6`** [consensus]: race-week `long_run` ≤45 min and 3–5 mi; pre-A-race taper `long_run` ≤5 mi; **no new training stimulus in race week**.
- **`SCHEDULING-RULES.md §3.7`**: maintenance / long-day floors **exclude** taper & recovery weeks; the race week (a taper week) is exempt.
- **`STRENGTH-PROTOCOL.md §3.7` / §7.4**: taper → Taper Priming / 1 light session early week then skip; inter-race (post-B → A) rebuild strength contract lives in §7.4 — **authoritative there; do not restate here**.
- **`SWIM-PROTOCOL.md §4.4`** "Taper (race week)": Race-Spec Light + Recovery only; no long sets, no threshold, final swim 2–3 days pre-race.
- **`OPEN-QUESTIONS.md` Q-011**: there is **no hard long-*ride* floor**; do **not** introduce a race-week long-ride-floor framing — the race-week brick/long-ride exclusion is intentional.
- **`docs/PLAN-CONTRACT.md` is SUPERSEDED** (CLAUDE.md "Known doc/code drifts"; its §5 matrix disagrees with code). Do **not** cite it for placement.

---

## 1. Definitions & ground truth

- **Race week** — the plan week `W` such that some `RaceAnchor.planWeek === W` (`week-builder.ts:602`). Currently the only race-week predicate in the generation engine.
- **A-race** — the primary goal (`Priority A`); the macrocycle terminates on its race day. **Protected above everything else.**
- **B-race** — a chronologically-earlier secondary race; the plan recovers and rebuilds *through* it toward the A-race. Treated as a hard training day the athlete races.

### 1.1 Reference-plan ground truth (do not re-derive from memory)
For the two-70.3 reference plan (Santa Cruz = **A-race**, Northern California/Redding = **B-race**, plan start 2026-05-18), realized in `~/Downloads/…multi-sport-plan (48).md` and `(73).md`:

| Plan week | Role | Phase | Evidence |
|---|---|---|---|
| 1–12 | base/build/race_specific/deload toward B | (various) | — |
| **13** | **B-race week** | `taper` | `(73).md:649-668` race-day `IRONMAN 70.3 Northern California` |
| **14** | **post-B-race recovery** | `recovery` | `(73).md:671-697` (no strength, no quality) |
| 15–16 | inter-race rebuild | `rebuild` | `(73).md:700-799` "Rebuild Week 1/2" |
| **17** | **A-race week** | `taper` | `(73).md:802-821` race-day `IRONMAN 70.3 Santa Cruz` |

> **Caveat (flagged):** `POLISH-PUNCH-LIST.md:172` and `rebuild-phase.test.ts:46` use **Week 14 (B) / Week 18 (A)** — those are *synthetic test-fixture* week numbers (hardcoded `event_date 2026-08-15`/`2026-09-12`, `startDate 2026-05-11`), **not** the reference plan. The realized contract is **B=13, A=17**. POLISH:172's earlier brick-cap attribution to `e0aad332` was wrong; it was introduced by **`5d8f1577`** ("two tri races by calendar order"). Both POLISH:172 errors were corrected 2026-05-18 (commit `2b448bff`).

---

## 2. Current race-week identification contract (verified)

Race-week behavior is **emergent**, not first-class. Three implicit mechanisms:

1. **`raceThisWeek`** — `week-builder.ts:602`: `raceAnchors.find(a => a.planWeek === weekNum)`. `raceAnchors` built at `phase-structure.ts:116-125` via `planWeekForCalendarEvent(startDate, g.event_date)` (`phase-structure.ts:45-50`). **`RaceAnchor` carries `{goalId, eventName, eventDate, planWeek, dayName}` only — no `priority` / no A-vs-B flag.** The engine cannot distinguish a B-race week from an A-race week.
2. **Race week == final `taper` block.** `buildSingleEventBlocks` (`phase-structure.ts:231-271`) ends every single-event macrocycle with a `taper` range; `buildAbbreviatedBlocks` (`:389-421`) does the same for the post-B A-race segment. Week 13 and Week 17 are both `phase === 'taper'`; the race day is overlaid on top.
3. **Race-day overlay** — `week-builder.ts:1836-1861`: when `raceThisWeek` **and** `slot && !slot.isRest`, the `dayName` slot's sessions are *replaced* with one `type:'race'` session: `tags:['tri_race','race_day','event','no_extra_training']`, `zone_targets:'race'`, `duration = projMin` (hardcoded `n.includes('santa cruz') ? 320 : 330`), `tss = round(estimateSessionTSS('race','MODERATE',projMin) * 0.9)`, description literal `'Race day. Swim 1.2mi → Bike 56mi → Run 13.1mi…'`.
4. **`isRaceWeek`** exists **only** in the preview conflict path (`index.ts:557` → `_shared/week-conflict-resolver.ts:48` `no_options_race`). It is never a property of a `PhaseBlock` / `GeneratedWeek` and never shapes session content.

---

## 3. Current race-week load-shaping contract (verified)

All keyed off `raceThisWeek` (symmetric for B and A — there is no divergence today; **§8.1 changes this**):

| Behavior | Code | Effect |
|---|---|---|
| Bricks zeroed | `week-builder.ts:765` `effectiveBricks = raceThisWeek ? 0 : bricksThisWeek` (introduced `5d8f1577`) | No brick in race week (both B & A) |
| Long-run cap | `week-builder.ts:795-798` | `min(…,45)` min, `clamp(3,mi,5)` |
| Long-ride cap | `week-builder.ts:847-849` | `min(…,1.0)` h |
| Long-day floors excluded | `index.ts:234,299` `raceWeekNums` | Race weeks exempt from long-day enforcement |
| Swim substitution | `session-factory.ts:1094-1099` | Any **`phase==='taper'`** threshold swim → `raceWeekActivationSwim` — *fires on taper phase, not strictly race-week* (**§8.6 scopes this to race-week**) |
| Bike openers | `session-factory.ts:514-521` | Race-week opener ride |

### 3.1 Post-race handoff (the one explicit piece)
Two chronological tri races → `phase-structure.ts:127-153`: `buildSingleEventBlocks(B)` → `insertRecoveryBlock` (`recoveryWeeksPostRace`; 70.3 B = 7 d → 1 wk, `science.ts:386`) → `rebuildWeeksAfterRace` (70.3 → 2 desired, capped `windowWeeks-1`, `phase-structure.ts:336-342`) → `insertRebuildBlock` (`phase:'rebuild'`, `tssMultiplier:0.85`) → `buildAbbreviatedBlocks(A)` (base + race_specific + taper, **no `build`**). **After the A-race: nothing** — `totalWeeks` clamps to end on A-race day (`phase-structure.ts:104-107`).

---

## 4. Race-day session contract (verified — and its limits)

`week-builder.ts:1843-1851`:
- `type:'race'`; `tags:['tri_race','race_day','event','no_extra_training']`; `zone_targets:'race'`.
- `duration = projMin = n.includes('santa cruz') ? 320 : 330` — **event-name string match, not distance/projection-driven** (**§8.3 fixes this**).
- `tss = round(estimateSessionTSS('race','MODERATE',projMin) * 0.9)` — no athlete-projection input.
- `description` = literal `'Swim 1.2mi → Bike 56mi → Run 13.1mi'` — **70.3-hardcoded regardless of actual race distance** (**§8.3**).
- Emitted **only when `slot && !slot.isRest`** — if the race-day grid slot is rest, the race session is **silently dropped** (**§8.4 makes this a hard guarantee**).

---

## 5. Contract gaps (analysis → resolved in §8)

Each gap: *current behavior (cited)* → *why a gap* → **resolution pointer**.

### Gap 1 — No first-class race-week / B-vs-A concept
`raceThisWeek` anonymous; `RaceAnchor` has no `priority`; `isRaceWeek` preview-only. The engine *physically cannot* apply different rules to a B-race week vs an A-race week. **RESOLVED → §8.1.**

### Gap 2 — Taper-into-race asymmetry not honored
`taperWeeks` A-70.3=2 / B-70.3=1, but `buildAbbreviatedBlocks` compresses the A-taper to 1 wk via `Math.min(taperWeeks, totalWeeks)` (`phase-structure.ts:404`). Realized B-taper and A-taper are structurally identical. **RESOLVED → §8.2.**

### Gap 3 — Race-day session hardcoded & non-distance-aware
`projMin` via `n.includes('santa cruz')`; description literal 70.3. Sprint/full-IM emit wrong shape. **RESOLVED → §8.3.**

### Gap 4 — Race-day session not guaranteed to materialize
Emitted only if race-day slot non-rest (`week-builder.ts:1840`); silently dropped otherwise; no validator. **RESOLVED → §8.4.**

### Gap 5 — Post-B rebuild handoff correct but unspecified & edge-fragile
Rebuild emits only `windowWeeks ≥ 2`; short-window case skips rebuild entirely (`POLISH-PUNCH-LIST.md:74`). Endurance rebuild shape has no prose spec. **RESOLVED → §8.5.**

### Gap 6 — Activation-swim substitution scoped to `phase==='taper'`, not race-week
`session-factory.ts:1097` fires in *any* taper week; broader than race week. Explains export-48 (threshold) → 73 (activation) change. **RESOLVED → §8.6.**

### Gap 7 — Docs vs realized-export drift
`PLAN-GENERATION-TEST-MATRIX.md:48` incomplete; `SWIM-PROTOCOL.md §4.3` "weeks 11-14" descriptive drift. **RESOLVED → §8.6.**

### Gap 8 — Test coverage gap
Only `long-day-volume-floors.test.ts:229,585` + synthetic `rebuild-phase.test.ts:46`. Zero tests of race-day shape, substitution, B-vs-A taper, race-day-always-present, end-to-end realized weeks. **RESOLVED → §8.6.**

### Gap 9 — No validator race-week check
`validator.ts` 12 checks; none race-week-specific. Every invariant inline in `week-builder.ts`, no independent gate. **RESOLVED → §8.6.**

---

## 6. Known drifts to fix-or-flag

1. **`POLISH-PUNCH-LIST.md:172`** — week numbers (14/18→**13/17**) and brick-cap attribution (`e0aad332`→**`5d8f1577`**) **corrected 2026-05-18 (`2b448bff`)**; item bumped `[ ]`→`[~]`.
2. **`SWIM-PROTOCOL.md §4.3`** — "race-specific phase weeks 11-14" descriptive drift; **§8.6 marks non-binding**.
3. **`PLAN-GENERATION-TEST-MATRIX.md:48`** — incomplete race-week structure description; **§8.6 completes it**.

---

## 7. Code reference index (read before touching race-week behavior)

- `phase-structure.ts:45-50` `planWeekForCalendarEvent`; `:104-107` totalWeeks clamp; `:116-125` `raceAnchors`; `:127-153` two-tri handoff; `:231-271` `buildSingleEventBlocks`; `:334-342` rebuild-weeks cap; `:355-387` `insertRebuildBlock`; `:389-421` `buildAbbreviatedBlocks` (`:404` A-taper compression).
- `science.ts:321-369` `taperWeeks`; `:371-425` `recoveryDaysPostRace`.
- `week-builder.ts:602` `raceThisWeek`; `:765` `effectiveBricks`; `:795-798`/`:847-849` race-week caps; `:1836-1861` race-day overlay (`:1840` rest-slot gate, `:1843-1851` hardcoded shape).
- `session-factory.ts:514-521` bike openers; `:596-626` `raceWeekActivationSwim`; `:1094-1099` taper→activation substitution.
- `index.ts:234,299` `raceWeekNums`; `:557` preview-only `isRaceWeek`.
- `validator.ts:109-161` taper/post-race checks (no race-week check).

---

## 8. RESOLVED SPEC DECISIONS — IMPLEMENTED & SHIPPED (Phases 1–4, 2026-05-18)

Product-owner decisions, locked **and implemented**. Phase→commit map in the §0 banner; locked rationale in DECISIONS-LOG **D-019**; verified-state in ENGINE-STATE "Solid → Race-week protocol (Phases 1–4)". The §8.x items below are the **shipped contract**, not pending work.

### §8.1 — First-class A/B race-week differentiation (Gap 1) ✅
- `RaceAnchor` carries `priority: 'A' | 'B'` (from the goal's priority). `PhaseBlock` and `GeneratedWeek` carry `race_week: 'A' | 'B' | null`.
- **A-race week — full taper protection.** Multi-week protected taper (§8.2), distance-aware race-day overlay (§8.3), brick=0, long-day caps, no new stimulus, race-week activation swim. The plan protects the A-race week and its taper **above everything else** (Santa Cruz is the goal).
- **B-race week — "a hard training day you happen to race."** The B-race is embedded in the build: **no multi-week protected taper** (the athlete races through accumulated training fatigue), short recovery after (existing 1-week 70.3-B recovery), then rebuild toward A; the B-block is **subordinate to the A-build**.
- **Race-day safety applies to BOTH (locked interpretation):** the race-day session always materializes (§8.4), brick=0 on the actual race day, and **no extra training is stacked on race day** — you cannot train on top of a raced 70.3 regardless of priority. The A/B difference is in the *surrounding weeks' load shaping* (taper depth, recovery depth, subordination), **not** in piling training onto B-race day.

### §8.2 — A-race taper is inviolable (Gap 2) ✅
- The A-race taper gets its full distance-driven `taperWeeks` allocation (70.3 A = 2). It is **never** compressed. The rebuild window between B-recovery and A-taper absorbs any shortfall (subject to the §8.5 minimum).
- **Compression priority order:** A-taper (inviolable) > minimum rebuild (≥1 wk, §8.5) > post-B recovery (distance-fixed) > all other weeks absorb.
- Replaces the current `Math.min(taperWeeks, totalWeeks)` A-taper compression in `buildAbbreviatedBlocks` (`phase-structure.ts:404`).

### §8.3 — Distance-aware race-day session (Gap 3) ✅
- Race-day `duration`, `tss`, and `description` derive from the **race distance/type** (sprint / Olympic / 70.3 / full IM), never an event-name string. Remove `n.includes('santa cruz')` (`week-builder.ts:1843-1851`).
- **Duration:** distance→projected-finish table, refined by athlete projection when available. **Description:** templated per distance (swim/bike/run leg distances by race type). **TSS:** `estimateSessionTSS('race','MODERATE', distanceDuration)`. Adding a sprint or a full IM "just works."

### §8.4 — Race-day session hard guarantee (Gap 4) ✅
- For every `RaceAnchor` (A **and** B), exactly one `type:'race'` session MUST materialize on `RaceAnchor.dayName` in `RaceAnchor.planWeek`, **independent of the grid slot's rest state**. Remove/override the `slot && !slot.isRest` gate (`week-builder.ts:1840`). **Silent omission on race day is unacceptable.**
- Enforced by a **hard** validator check (§8.6/Gap 9): generation hard-fails if any `raceAnchor.planWeek` lacks exactly one race session on `dayName`.

### §8.5 — Minimum rebuild guarantee (Gap 5) ✅
- **≥ 1 week** of `rebuild` phase always exists between post-B recovery and A-race base/taper. **Never** B-recovery → A-base directly. If the window is tight, compress per the §8.2 order — rebuild floors at 1 week; the A-taper never yields.
- The endurance rebuild shape (currently implicit, `phase-structure.ts:373-386`) gets a prose spec (sport distribution, 0.85× TSS, 0.85× long-day). Strength rebuild stays owned by `STRENGTH-PROTOCOL.md §7.4` (reference, not restated).

### §8.6 — Technical cleanup, reasonable defaults (Gaps 6–9) ✅
- **Gap 6 (activation swim):** scope the `taper`-phase threshold-swim → activation-swim substitution (`session-factory.ts:1094-1099`) to **race week only**. Non-race weeks of a multi-week A-taper keep SWIM §4.4 Race-Spec Light. Locks export-73 (activation in race week) as correct, scoped.
- **Gap 9 (validator):** add race-week validator checks — (a) race-day session present (§8.4, hard-fail), (b) race-week brick=0, (c) race-week long-day caps respected, (d) B→recovery→rebuild→A week-level ordering.
- **Gap 8 (tests):** minimum regression set — race-day shape/tags/duration *by distance* (sprint/Oly/70.3/IM), activation-swim race-week-only, A-vs-B taper differentiation, race-day-always-present (incl. rest-slot edge), end-to-end realized two-70.3 weeks 13/17.
- **Gap 7 (doc drift):** mark `SWIM-PROTOCOL.md §4.3` "weeks 11-14" explicitly non-binding; complete `PLAN-GENERATION-TEST-MATRIX.md:48` with the realized race-week session list.

*Decisions locked 2026-05-18. Implementation: doc before code — no code until the session implementation plan is reviewed and approved.*
