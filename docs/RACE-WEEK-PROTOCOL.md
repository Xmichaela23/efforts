# RACE-WEEK PROTOCOL

> **Status: AUDIT-DERIVED DRAFT — 2026-05-18.** Sections 1–4 are the *verified current contract* (cited file:line, read-only audit). Sections 5–11 enumerate **GAPS** and the **DECISIONS NEEDED** before any code. This doc is written *before* code per `docs/POLISH-PUNCH-LIST.md` "Race-week protocol audit". Nothing here changes behavior yet.

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
- **A-race** — the primary goal (`Priority A`); the macrocycle terminates on its race day.
- **B-race** — a chronologically-earlier secondary race; the plan recovers and rebuilds *through* it toward the A-race.

### 1.1 Reference-plan ground truth (do not re-derive from memory)
For the two-70.3 reference plan (Santa Cruz = **A-race**, Northern California/Redding = **B-race**, plan start 2026-05-18), realized in `~/Downloads/…multi-sport-plan (48).md` and `(73).md`:

| Plan week | Role | Phase | Evidence |
|---|---|---|---|
| 1–12 | base/build/race_specific/deload toward B | (various) | — |
| **13** | **B-race week** | `taper` | `(73).md:649-668` race-day `IRONMAN 70.3 Northern California` |
| **14** | **post-B-race recovery** | `recovery` | `(73).md:671-697` (no strength, no quality) |
| 15–16 | inter-race rebuild | `rebuild` | `(73).md:700-799` "Rebuild Week 1/2" |
| **17** | **A-race week** | `taper` | `(73).md:802-821` race-day `IRONMAN 70.3 Santa Cruz` |

> **Caveat (flagged):** `POLISH-PUNCH-LIST.md:172` and `rebuild-phase.test.ts:46` use **Week 14 (B) / Week 18 (A)** — those are *synthetic test-fixture* week numbers (hardcoded `event_date 2026-08-15`/`2026-09-12`, `startDate 2026-05-11`), **not** the reference plan. The realized contract is **B=13, A=17**. POLISH:172 also misattributes the race-week-brick-0 cap to commit `e0aad332`; it was introduced by **`5d8f1577`** ("two tri races by calendar order"). Both POLISH:172 errors are tracked in §10.

---

## 2. Current race-week identification contract (verified)

Race-week behavior is **emergent**, not first-class. Three implicit mechanisms:

1. **`raceThisWeek`** — `week-builder.ts:602`: `raceAnchors.find(a => a.planWeek === weekNum)`. `raceAnchors` built at `phase-structure.ts:116-125` via `planWeekForCalendarEvent(startDate, g.event_date)` (`phase-structure.ts:45-50`). **`RaceAnchor` carries `{goalId, eventName, eventDate, planWeek, dayName}` only — no `priority` / no A-vs-B flag.** The engine cannot distinguish a B-race week from an A-race week.
2. **Race week == final `taper` block.** `buildSingleEventBlocks` (`phase-structure.ts:231-271`) ends every single-event macrocycle with a `taper` range; `buildAbbreviatedBlocks` (`:389-421`) does the same for the post-B A-race segment. Week 13 and Week 17 are both `phase === 'taper'`; the race day is overlaid on top.
3. **Race-day overlay** — `week-builder.ts:1836-1861`: when `raceThisWeek` **and** `slot && !slot.isRest`, the `dayName` slot's sessions are *replaced* with one `type:'race'` session: `tags:['tri_race','race_day','event','no_extra_training']`, `zone_targets:'race'`, `duration = projMin` (hardcoded `n.includes('santa cruz') ? 320 : 330`), `tss = round(estimateSessionTSS('race','MODERATE',projMin) * 0.9)`, description literal `'Race day. Swim 1.2mi → Bike 56mi → Run 13.1mi…'`.
4. **`isRaceWeek`** exists **only** in the preview conflict path (`index.ts:557` → `_shared/week-conflict-resolver.ts:48` `no_options_race`). It is never a property of a `PhaseBlock` / `GeneratedWeek` and never shapes session content.

---

## 3. Current race-week load-shaping contract (verified)

All keyed off `raceThisWeek` (symmetric for B and A — there is no divergence today):

| Behavior | Code | Effect |
|---|---|---|
| Bricks zeroed | `week-builder.ts:765` `effectiveBricks = raceThisWeek ? 0 : bricksThisWeek` (introduced `5d8f1577`) | No brick in race week (both B & A) |
| Long-run cap | `week-builder.ts:795-798` | `min(…,45)` min, `clamp(3,mi,5)` |
| Long-ride cap | `week-builder.ts:847-849` | `min(…,1.0)` h |
| Long-day floors excluded | `index.ts:234,299` `raceWeekNums` | Race weeks exempt from long-day enforcement |
| Swim substitution | `session-factory.ts:1094-1099` | Any **`phase==='taper'`** threshold swim → `raceWeekActivationSwim` (800 yd, 4×50 build) — *fires on taper phase, not strictly race-week* |
| Bike openers | `session-factory.ts:514-521` | Race-week opener ride |

### 3.1 Post-race handoff (the one explicit piece)
Two chronological tri races → `phase-structure.ts:127-153`: `buildSingleEventBlocks(B)` → `insertRecoveryBlock` (`recoveryWeeksPostRace`; 70.3 B = 7 d → 1 wk, `science.ts:386`) → `rebuildWeeksAfterRace` (70.3 → 2 desired, capped `windowWeeks-1`, `phase-structure.ts:336-342`) → `insertRebuildBlock` (`phase:'rebuild'`, `tssMultiplier:0.85`) → `buildAbbreviatedBlocks(A)` (base + race_specific + taper, **no `build`**). **After the A-race: nothing** — `totalWeeks` clamps to end on A-race day (`phase-structure.ts:104-107`).

---

## 4. Race-day session contract (verified — and its limits)

`week-builder.ts:1843-1851`:
- `type:'race'`; `tags:['tri_race','race_day','event','no_extra_training']`; `zone_targets:'race'`.
- `duration = projMin = n.includes('santa cruz') ? 320 : 330` — **event-name string match, not distance/projection-driven**.
- `tss = round(estimateSessionTSS('race','MODERATE',projMin) * 0.9)` — no athlete-projection input.
- `description` = literal `'Swim 1.2mi → Bike 56mi → Run 13.1mi'` — **70.3-hardcoded regardless of actual race distance**.
- Emitted **only when `slot && !slot.isRest`** — if the race-day grid slot is rest, the race session is **silently dropped**; no validator asserts otherwise.

---

## 5. CONTRACT GAPS — the spec's decision agenda

Each gap: *current behavior (cited)* → *why a gap* → **DECISION NEEDED**.

### Gap 1 — No first-class race-week / B-vs-A concept
`raceThisWeek` is anonymous; `RaceAnchor` has no `priority`; `isRaceWeek` is preview-only. The engine *physically cannot* apply different rules to a B-race week vs an A-race week.
**DECISION NEEDED:** Should `RaceAnchor` carry `priority` and should `PhaseBlock`/`GeneratedWeek` carry an explicit `race_week: 'A'|'B'|null`? Which behaviors must legitimately differ (see Gap 5)?

### Gap 2 — Taper-into-race transition asymmetry is not honored
`taperWeeks`: A-70.3 = 2, B-70.3 = 1 (`science.ts:321-369`). But `buildAbbreviatedBlocks` compresses the A-taper to **1 week** when only 1 pre-race week remains after rebuild (`phase-structure.ts:404` `Math.min(taperWeeks, totalWeeks)`). Realized: B-taper (Wk13) and A-taper (Wk17) are **structurally identical 1-week tapers**, contradicting the §3.6 / STRENGTH §3.7 intent of a longer, more protected A-taper.
**DECISION NEEDED:** Should the spec mandate a *minimum A-race taper length* that the rebuild window must yield to (i.e., compress **rebuild**, not the A-taper)?

### Gap 3 — Race-day session shape is hardcoded & non-distance-aware
`projMin` via `n.includes('santa cruz')`; description literal 70.3. A sprint / full-IM race emits a wrong description and a name-string-dependent duration.
**DECISION NEEDED:** Canonical race-day contract — duration source (distance/projection, not name), TSS source, description templating by distance, tag set.

### Gap 4 — Race-day session not guaranteed to materialize
Emitted only if the race-day slot is non-rest (`week-builder.ts:1840`); silently dropped otherwise. No validator check that every `raceAnchor.planWeek` contains a `type:'race'` session on `dayName`.
**DECISION NEEDED:** Must the race-day session always materialize independent of slot state? Add a validator assertion (see Gap 9)?

### Gap 5 — Post-B-race rebuild handoff: correct but unspecified & edge-fragile
Rebuild emits only when `windowWeeks ≥ 2` (`phase-structure.ts:334`), capped `windowWeeks-1` (`:342`). The short-window case (`POLISH-PUNCH-LIST.md:74`, open) **skips rebuild entirely** — athlete drops from B-recovery straight into A-base with no bridge. The *endurance* rebuild shape (sport distribution, 0.85× TSS, 0.85× long-day) has **no prose spec**; it lives only in `phase-structure.ts:373-386` + scattered consumers. (Strength rebuild is owned by STRENGTH §7.4 — reference, do not restate.)
**DECISION NEEDED:** Minimum-rebuild guarantee + short-window policy; a single prose spec for the endurance rebuild shape.

### Gap 6 — Activation-swim substitution scoped to `phase==='taper'`, not race-week
`session-factory.ts:1097` substitutes in *any* taper week, broader than race week — could fire in a multi-week A-taper's first week where SWIM §4.4 still wants Race-Spec Light, not pure activation. Also explains the **export-48 → 73 change**: `(48).md:580,706` show `Swim Threshold — 800 yd`; `(73).md:663,816` show `Race-Week Activation Swim — 800 yd` (substitution shipped between the two exports).
**DECISION NEEDED:** Scope the trigger to race-week (vs taper-phase); reconcile with SWIM §4.4 multi-week A-taper; lock which export (48 threshold vs 73 activation) is correct.

### Gap 7 — Docs vs realized-export drift
`PLAN-GENERATION-TEST-MATRIX.md:48` describes race weeks as "taper Wed, race Sun, no quality sessions" but is silent on the realized Mon Race-Specific Aerobic Swim + Tue Bike Openers + Fri Activation Swim. `SWIM-PROTOCOL.md §4.3` hardcodes "race-specific phase weeks 11-14" which does not match realized phase weeks — descriptive drift.
**DECISION NEEDED:** Document the canonical realized race-week session list; mark SWIM §4.3 week-numbers explicitly non-binding.

### Gap 8 — Test coverage gap
Only race-week coverage: `long-day-volume-floors.test.ts:229,585` (asserts floors *not* enforced in race week) and `rebuild-phase.test.ts:46` (synthetic wk14/18 phase-block layout). **Zero** tests of: race-day session shape/tags/duration, the activation-swim substitution, B-vs-A taper differentiation, race-day-always-present, or end-to-end realized weeks 13/17. No `_shared/*.test.ts` covers race weeks.
**DECISION NEEDED:** Minimum race-week regression test set the spec requires.

### Gap 9 — No validator race-week check
`validator.ts` has 12 checks; none assert race-day presence, race-week brick=0, race-week long-day caps, or B→recovery→rebuild→A week-level ordering (Check 6 `checkTapersPresent` / Check 8 `checkPostRaceRecovery` are phase-block-level only). Every race-week invariant is enforced inline in `week-builder.ts` with no independent gate.
**DECISION NEEDED:** Which race-week invariants get a validator check.

---

## 6. Known drifts to fix-or-flag

1. **`POLISH-PUNCH-LIST.md:172`** — (a) "Week 14 (B-race) / Week 18 (A-race)" → realized is **B=13, A=17** (14/18 are test-fixture numbers); (b) race-week-brick-0 attributed to `e0aad332` → actually `5d8f1577`. *Correcting POLISH:172 is a separate gated doc edit — flagged, not yet done.*
2. **`SWIM-PROTOCOL.md §4.3`** — "race-specific phase weeks 11-14" is descriptive drift; does not match realized phase weeks. Mark non-binding.
3. **`PLAN-GENERATION-TEST-MATRIX.md:48`** — incomplete race-week structure description (omits Mon swim / Tue openers / Fri activation).

---

## 7. Code reference index (read before touching race-week behavior)

- `phase-structure.ts:45-50` `planWeekForCalendarEvent`; `:104-107` totalWeeks clamp; `:116-125` `raceAnchors`; `:127-153` two-tri handoff; `:231-271` `buildSingleEventBlocks`; `:334-342` rebuild-weeks cap; `:355-387` `insertRebuildBlock`; `:389-421` `buildAbbreviatedBlocks`.
- `science.ts:321-369` `taperWeeks`; `:371-425` `recoveryDaysPostRace`.
- `week-builder.ts:602` `raceThisWeek`; `:765` `effectiveBricks`; `:795-798`/`:847-849` race-week caps; `:1836-1861` race-day overlay.
- `session-factory.ts:514-521` bike openers; `:596-626` `raceWeekActivationSwim`; `:1094-1099` taper→activation substitution.
- `index.ts:234,299` `raceWeekNums`; `:557` preview-only `isRaceWeek`.
- `validator.ts:109-161` taper/post-race checks (no race-week check).

---

## 8. Open questions for the next session (decision-ordered)

1. First-class race-week class & A/B flag — yes/no, and shape (Gap 1).
2. Minimum A-race taper guarantee vs rebuild compression (Gap 2).
3. Canonical race-day session contract (Gap 3) + always-materialize guarantee (Gap 4).
4. Minimum-rebuild guarantee + endurance-rebuild prose spec (Gap 5).
5. Activation-swim trigger scoping + export-48-vs-73 lock (Gap 6).
6. Validator + regression-test minimums (Gaps 8, 9).
7. Doc-drift corrections (§6) — gated edits.

*No code is written until the §8 decisions are made. This doc is the agenda, not the answers.*
