# CONSOLIDATED-MODE — Strength Integration Mode (Separated vs Consolidated)

> **Status: SPEC DRAFT — 2026-05-18. Decisions LOCKED; doc-before-code (no engine code until this is approved).** Parallel to `SCHEDULING-RULES.md §4.21` (separated mode). Theme B per `docs/POLISH-PUNCH-LIST.md`. §11 (wizard research copy) needs **product-owner-supplied citation text** — engine/data-path semantics below are complete and final.

---

## 0. Scope & binding context

Defines a new athlete-level `integration_mode: 'separated' | 'consolidated'` (**default `separated`**) controlling whether same-day `lower_body_strength + leg-quality endurance` (`quality_run`/`quality_bike`) is **avoided** (separated, today's §4.21) or **preferred** (consolidated).

**Must not contradict (carve-outs in §8):** D-006 (AM/PM ordering only for run+lower), D-017 (strength provenance split — mode is a *pref*, never a day-pin), D-018 (QR+lower trade-off: builder `collectQualityRunLowerBodyTradeOffs` is sole owner; **no optimizer emit**), Q-012 (easy-run+lower recovery-flush is pref-insensitive — untouched), D-019 (race-week — consolidation inert in race/A-taper/recovery/rebuild).

---

## 1. The two-axis model

`integration_mode` and `strength_ordering_preference` are **orthogonal**:

| Axis | Question it answers | Values | Default |
|---|---|---|---|
| `integration_mode` | *Same day, or 24h apart?* | `separated` / `consolidated` | `separated` |
| `strength_ordering_preference` | *If same day, which first (AM/PM)?* | `endurance_first` / `strength_first` | `endurance_first` |

`integration_mode` decides **whether** QR+lower share a day; `strength_ordering_preference` decides **AM/PM within** a shared day (via `decideOrdering`, unchanged). Do not collapse them into one question.

---

## 2. Definitions

- **Separated mode** (default): today's `SCHEDULING-RULES.md §4.21` — `lower_body_strength` keeps **≥24h separation in both directions** from `quality_run`/`quality_bike`; same-day is ✗; the sandwich/Δ1 patterns are hard-rejected at placement.
- **Consolidated mode** (`SCHEDULING-RULES.md §5.2` / `STRENGTH-PROTOCOL.md §6.1.5`): same-day QR+lower (AM run / PM lift, eccentric-mechanics rationale) is the **preferred placement**; a forced *separated* arrangement becomes **the trade-off**.

---

## 3. The gate (LOCKED — decision 2026-05-18)

```
allowConsolidation = (isCoEq && (isPerf || strength_ordering_preference === 'strength_first'))
                     || integration_mode === 'consolidated'
```

- **OR-branch, purely additive (Decision 1):** the existing shipped perf+co-equal path is **preserved** — perf+co-equal athletes keep today's consolidation even if they never touch the wizard question. `integration_mode === 'consolidated'` is a *new, independent* unlock for everyone else. No regression; `week-optimizer.anchor-contract.test.ts:196` ("isPerf path unchanged") stays the regression lock.
- **`strength_first` back-compat preserved (Decision 3):** the legacy "`strength_first` also unlocks consolidation" clause stays as-is. `strength_ordering_preference` is ordering-only going *forward*; the legacy unlock is kept, documented, **not** silently removed.
- This is the **only** behavior-model decision Theme B introduces — recorded in the close-out D-NNN. No shipped path changes ⇒ no behavior-change D-NNN / fixture realignment.

---

## 4. What Consolidated flips (exact decision points — all `_shared/week-optimizer.ts` unless noted)

| # | Site | Separated (today) | Consolidated |
|---|---|---|---|
| 1 | `canPlaceWithModifier` `allowConsolidation` (~:410-415) & `deriveOptimalWeek` mirror (~:1204-1206) | gate = `isCoEq && (isPerf\|\|strength_first)` | gate = above **OR `integration_mode==='consolidated'`** (§3) |
| 2 | `deriveOptimalWeek` placement order (~:1178-1245) | separated preferred-QR placement runs first; consolidation is the fallback | when `integration_mode==='consolidated'` **and `strFreq >= 2`**: the consolidation block runs **first** (preferred); the separated-clean placement becomes the fallback/trade-off path |
| 3 | `week-builder.ts:1874` `allowConsolidatedHardException = false` (literal) | hardcoded `false` — builder suppresses consolidation for everyone | becomes `integration_mode === 'consolidated'` (regression-guarded: separated athletes still get the `enforceHardEasy` QR+lower downgrade) — **highest-risk single change** |
| 4 | static matrix `schedule-session-constraints.ts:124-133` (`QR×lower=0`) | unchanged | **unchanged — do NOT flip the cell.** Same-day is unlocked *dynamically per-athlete* via `canPlaceWithModifier`; flipping the static cell would make it legal globally and break separated-mode athletes |

Primarily **(c) flip preferred-vs-trade-off ordering** (#2) + **(a) an OR-branch gate** (#1) + a **builder carve-out** (#3). Explicitly **not** a matrix flip.

---

## 5. The 24h adjacent-day rule still holds (LOCKED — Decision 2)

Consolidated mode flips **same-day preference only**. The `§4.21` **24h adjacent-day** strength↔leg-quality block (`sequentialOk` :495/:502/:524/:557) **still applies** to the non-same-day case. An athlete either (a) consolidates QR+lower **same day**, or (b) keeps **≥24h** apart — **never** an unprotected ~12–18h adjacent gap. "Separated becomes the trade-off" = *placement-preference order*, **not** deleting the interference-protection floor.

---

## 6. Trade-off semantics (D-018 — builder is sole owner)

When anchors/recovery rules force a *separated* arrangement under consolidated mode, the realized plan emits an inverse trade-off ("kept strength and your mid-week quality run apart — anchors blocked the consolidated hard day"). It is emitted **only** from the builder's realized-grid collector (`collectQualityRunLowerBodyTradeOffs` family, `week-builder.ts:~2117`). **No optimizer `trade_offs.push`** — D-018 footgun is explicit; the builder-coverage gate (prove builder covers the case) is the precondition for any optimizer emit (recommended: none).

---

## 7. Phase carve-outs (D-019)

`integration_mode === 'consolidated'` is **inert** when: `raceThisWeek`, A-taper, post-race recovery, rebuild weeks, **or `strFreq < 2`**. Those weeks have ≤1 strength session / no quality_run to consolidate and D-019 makes the A-taper inviolable. Natural gate points: the `strFreq >= 2` guard (mirrors `week-optimizer.ts:1207`) + the existing `raceThisWeek`/phase forks.

---

## 8. Carve-out matrix vs settled decisions (explicit non-reopen)

| Decision | Carve-out | Why it's safe |
|---|---|---|
| D-006 / Q-001 | reuse `decideOrdering` (run+lower / easy / long_ride only) unchanged | mode = whether-same-day; ordering = AM/PM. Orthogonal. |
| D-017 | `integration_mode` lives in `training_prefs`, threads via `freshCombinedPrefs` like SOP; never a `strength_preferred_days`/`strength_optimizer_slots` write | pure mode flag, not a day-pin |
| D-018 | inverse trade-off builder-only (§6) | sole-owner footgun honored |
| Q-012 | `integration_mode` scoped to the **quality**-partner branch; never touches `decideOrdering`'s easy_run/easy_bike recovery-flush branch | easy-flush stays pref-insensitive |
| D-019 | inert in race/A-taper/recovery/rebuild & `strFreq<2` (§7) | A-taper inviolable preserved |

---

## 9. Data path (Slice 1 — mirrors `strength_ordering_preference`, the proven template)

`integration_mode?: 'separated' | 'consolidated'` threads, end to end:
1. `ArcSetupWizard.tsx` — state field + initializer (`~:356`/`~:464`); new wizard step in `getSteps()` (`~:2747`, ungated by `strength_intent==='performance'` — applies whenever strength is included; default Separated covers non-askers); `Step` component mirroring `Step8bStrengthOrdering` (`:2327`).
2. `ArcSetupWizard.tsx:~691-700` — conditional spread into `trainingPrefs`.
3. `_shared/combined-schedule-prefs.ts` — type member (`~:301`), camel/snake-tolerant parse (`~:364`), merge write (`~:450`).
4. `create-goal-and-materialize-plan/index.ts:~1700` — **unconditional ternary defaulting `'separated'`** into the `athlete_state` payload (the safe-default resolution point; legacy goals → `separated`, behavior unchanged).
5. `generate-combined-plan/types.ts:~109` — `AthleteState.integration_mode?`.
6. `reconcile-athlete-state-week-optimizer.ts:~203-205` — spread into `inputs.athlete`.
7. `_shared/week-optimizer.ts:~215` — `athlete` input type; consumed at the §4 gates.

---

## 10. Phased implementation plan

- **Slice 0** — this spec (+ §11 product sign-off) + close-out D-NNN recording the model + the 3 locked sub-decisions. **Blocking; gated.**
- **Slice 1** — data-path threading (§9) with safe default. **Zero behavior change** (no engine reads it yet); all suites green.
- **Slice 2** — engine gating (§4 #1/#2/#3 + §7 phase carve-out). OR-branch + regression guards. **DROP** §5.2's `[derived]` age/CTL/history profile gates (never implemented; superseded by the explicit wizard choice).
- **Slice 3** — inverse trade-off (§6), builder-only.
- **Slice 4** — wizard step + copy/UI (§11 signed-off citations only).
- **Slice 5** — tests: extend `week-optimizer.anchor-contract.test.ts` (consolidated cases; `:196` is the no-regression lock), CLEAN/SOFT/SANDWICH tier suite (consolidated variant), `same-day-pairing` (confirm Q-012 easy branch unperturbed), trade-off suite. **Flag-C:** new fixtures with `integration_mode:'consolidated'` — do **not** mutate the existing separated fixtures (they are the separated-mode regression lock; same discipline as race-week's realized-vs-synthetic distinction).

**Explicitly DROP/defer:** §5.2 `[derived]` profile gates · Theme C day-count matrix (depends on this field; separate item) · any optimizer-side trade-off emit · consolidation in race/taper/recovery/rebuild.

---

## 11. Wizard copy + research backing — **[PRODUCT-OWNER INPUT REQUIRED]**

Structure (mirror `Step8bStrengthOrdering`'s research-`<details>` pattern): question *"How should strength fit into your week?"* → **Separated** (default) / **Consolidated**, each with a "Research backing" disclosure.

**Citations to be supplied/verified by the product owner — NOT fabricated here:**
- Separated: *Hickson 1980* (concurrent-training interference) — exact claim/quote TBD by product owner.
- Consolidated: *Crawley/Omnia, Nick Bare, Blaine Lints* — exact claims/attribution TBD by product owner.

Engine behavior does not depend on the copy; Slice 4 is blocked only on this section.

---

## 12. Close-out decision record (for the D-NNN at arc completion)

Theme B introduces one model decision (Separated/Consolidated `integration_mode`, default Separated) + three locked sub-decisions: **(1)** OR-branch precedence (shipped perf+co-equal path preserved), **(2)** same-day-preference-only (24h adjacency floor retained), **(3)** `strength_first` legacy unlock kept (back-compat). No shipped-path behavior change. Full rationale → the close-out D-NNN; verified-state → ENGINE-STATE "Solid" at arc completion (same pattern as D-019 / race-week).
