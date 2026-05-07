# Plan engine & wizard — contract audit (read-only)

**Purpose.** Compare Efforts’ implemented hybrid wizard + plan pipeline against **Plan Generation Contract v1 (May 2026)** (`docs/PLAN-CONTRACT.md` once checked in). Per-section verdicts: **honored**, **partial**, **violated**, or **not wired**. Duplicate-rule hotspots called out — contract purity favors **one behavioral source of truth** per rule family.

**Note.** At audit time, `docs/PLAN-CONTRACT.md` may still need to be added from the canonical draft; this audit uses contract **v1** as referenced by product/engineering.

---

## Architecture (given brief + code confirmation)

**Hybrid wizard + bounded LLM.** Season setup is structured state in code; LLM jobs are narrow.

| Stage | What happens |
|-------|----------------|
| 1 | **ArcSetupWizard** (`src/components/ArcSetupWizard.tsx`) collects deterministic fields across **9 steps** into local state; header notes **five** bounded LLM touchpoints (race/intensity/coaching/conflict/unusual schedule). Product brief narrows to **race extraction** (step 1) and **edge-case interpretation** (step 9); reconcile doc vs brief so Cursor/users aren’t split. |
| 2 | Payload becomes **`training_prefs`** on the goal row (plus Arc-loaded slices). |
| 3 | **`create-goal-and-materialize-plan`** loads prefs + **`getArcContext`**, merges/backfills, invokes combined or standalone generation. |
| 4 | **`buildCombinedPlan`** runs **`backfillTriTrainingPrefsDefenseInDepth`**, which may call **`deriveOptimalWeek`** / **`deriveOptimalWeekWithCoEqualRecovery`** and merge **`preferred_days`** (with pin restore for anchors when matrix-valid). |
| 5 | **`generate-combined-plan`** builds **`sessions_by_week`** via **`buildWeek`** (`week-builder.ts`), serialization, optional assessment prepend. |
| 6 | **`activate-plan`** expands sessions into **`planned_workouts`** and drives **`materialize-plan`** for computed steps. |

**Bounded race LLM.** **`extract-races`** (`supabase/functions/extract-races/index.ts`) — JSON-only extraction + web search; does not own navigation.

---

## Files expected to align with contract

| File | Role vs contract |
|------|------------------|
| **`supabase/functions/_shared/week-optimizer.ts`** | Executable placement: matrix compatibility via shared constraints, sequential rules, **`conflicts`** / **`trade_offs`** surfacing. Strong candidate for **schedule authority** alongside shared matrix. |
| **`supabase/functions/_shared/schedule-session-constraints.ts`** | Declares **same-day matrix** + helpers; explicitly versioned to product matrix (Apr/May 2026 comments). **Single source for matrix bits** used by optimizer + other callers. |
| **`src/components/ArcSetupWizard.tsx`** | Maps athlete anchors (group ride intensity, run club, long days, swim intent, strength intent, assessment preference) into prefs — aligns with **§4** intent collection when persisted faithfully. |
| **`supabase/functions/extract-races/index.ts`** | Race listing only — aligns with “LLM doesn’t own flow.” |

---

## Files at highest risk of contract drift

| File | Why |
|------|-----|
| **`generate-combined-plan/week-builder.ts`** | Header **admits duplication** with `week-optimizer.ts`: shared matrix, **sequential rules and placement duplicated**. Any divergent edit violates **single source of truth** even if each file “looks correct.” Heavy **Tuesday / Thursday / Wednesday** defaults and narrative coupling (e.g. Wed group ride → Thu quality run + lower). |
| **`generate-combined-plan/session-factory.ts`** | **`toStrengthPhase`** maps combined-plan phase → protocol phase with **`start_week: 1`, `weeks_in_phase: 4` always** — risks **§9.4 / §9.5** (mesocycle continuity across phase boundaries). |
| **`shared/strength-system/placement/simple.ts`** | Methodology presets (e.g. Jack Daniels Tue lower stacking) — can fight **optimizer-declared** strength days if combined path ever routes through it inconsistently. |
| **`generate-triathlon-plan/generators/tri-generator.ts`** | Standalone tri path: **`preferred_days` overlays defaults** — parallel universe vs **`generate-combined-plan`** + week optimizer output. |
| **`create-goal-and-materialize-plan/index.ts`** | **Merge / backfill order**: optimizer output vs **`preferred_days` pins** vs **`co_equal_strength_provisional_1x`** — can diverge from **§1.3** if athlete-facing resolution isn’t guaranteed before silent caps. |

---

## Section-by-section vs implementation

### §1 First principles

| Clause | Verdict | Evidence / gap |
|--------|---------|----------------|
| **1.1 Athlete authority on schedule** | **Partial** | Wizard + prefs supply anchors; **`week-optimizer`** respects anchors when matrix-valid. **`week-builder`** still applies **hardcoded weekday defaults** (e.g. bike quality defaults toward **Tuesday**, swim quality toward **Thursday**, run-only Thursday easy run) when prefs incomplete — blurs “system never picks days.” |
| **1.2 Science authority on stress** | **Honored** | Templates, TSS budgeting, phase blocks, intensity classes driven by **`buildWeek`** / protocols — athlete doesn’t edit in-session prescription in setup flow. |
| **1.3 Honesty over optimization** | **Partial** | **`deriveOptimalWeek`** exposes **`conflicts`** / **`trade_offs`**. **`buildCombinedPlan`** persists **`generation_trade_offs`** via **`buildCombinedPlanGenerationTradeOffs`** + optimizer snapshots. **Gap:** silent mitigations still exist (e.g. **co-equal 1× fallback**, template **`co_equal_provisional_1x`**) — contract **§8.5 / Appendix A.3** want explicit athlete choice, not only post-hoc copy. |
| **1.4 Progression sacred** | **Partial / violated** | Recovery handling exists, but **`returnFromRecoveryDeload`** / caps in **`week-builder`** and **`toStrengthPhase`** reset-like behavior risk **§9.3–9.5** “no unintended regression” across recovery boundaries (known product concern: long ride / strength progression). |

### §2 Athlete profile inputs

| Bucket | Verdict | Notes |
|--------|---------|------|
| **2.1 Identity (Arc)** | **Partial** | **`getArcContext`** path exists for combined build; not every standalone generator field is guaranteed mirrored in **`AthleteState`**. |
| **2.2 Fitness** | **Partial** | FTP, thresholds, swim pace flow through **`AthleteState`** when present; gaps filled with RPE/defaults — aligns directionally with contract edge cases (**Appendix A.4**). |
| **2.3 Intent (wizard)** | **Partial** | **`ArcSetupWizard`** covers intent, swim, strength, assessment preference. Contract’s **“strong finish”** wording maps loosely to **`completion`** / **`first_race`** — naming parity missing. |

### §3 Athlete levels

| Level | Verdict | Notes |
|-------|---------|------|
| Beginner / Returning / Active / Performance | **Partial** | **`training_intent`**, **`tri_approach`**, **`transition_mode`**, **`loading_pattern`** approximate behaviors. **Fine-grained rules** in §3 (e.g. beginner recovery **every 2 weeks first 8 weeks**) are **not obviously centralized** as level-specific policy tables — risk scatter across **`phase-structure`**, **`applyLoadingPattern`**, and **`week-builder`**. |

### §4 Schedule anchors

| Topic | Verdict | Notes |
|-------|---------|------|
| Hard anchors | **Honored / partial** | Long ride/run, group ride/run classification exist in wizard → prefs → optimizer inputs. **Single `group_run` anchor** in **`WeekOptimizerInputs`** limits multi-club scenarios contract mentions conceptually. |
| Soft anchors | **Partial** | **`quality_run`** preference exists in optimizer; strength defaults drift toward **Mon upper / Thu lower** in comments and placement paths vs athlete-declared soft anchors — contract **§4.2** allows optimizer override **with explicit notice**; verify user-visible **`trade_offs`** always fire. |
| Constraints | **Partial** | **`hard_bike_avoid_days`**, **`rest_days`** exist on optimizer side; **`AthleteState`** mirrors several — coverage OK where wired from prefs. |
| Non-traditional schedules | **Partial** | Supported in principle via **day indices**; **run-only** path still **fixes Thursday easy run** in **`week-builder`**, which fights **“Sunday isn’t special”** for odd layouts. |

### §5 Same-day compatibility matrix

| Topic | Verdict | Notes |
|-------|---------|------|
| Core matrix | **Honored** | **`schedule-session-constraints.ts`** is explicit and consumed by optimizer. |
| Footnotes (performance-only stacking) | **Partial** | **§5** footnotes (e.g. quality_bike + quality_run AM/PM only performance, quality_run + lower_body rules) are enforced partly in **`week-builder`** exceptions (`Console`-logged allowances) — **not all exceptions live in one declarative layer**. Divergence risk vs contract wording. |
| Max sessions / swim pairing | **Partial** | Logic spread **`week-builder`** + optimizer; needs checklist against **§5.1–5.2**. |

### §6 Sequential (adjacent day) rules

| Verdict | **Partial + duplication risk** |
|---------|-------------------------------|
| **Evidence** | **`week-optimizer.ts`** documents sequential rules; **`week-builder.ts`** repeats **48h lower-body vs long day**, **after-quality** behavior, brick/long coupling. **Contract requirement:** single authoritative sequential policy exported from one module and imported elsewhere — **not current state** (explicit duplicate comment at top of **`week-builder`**). |

### §7 Experience modifiers

| Modifier | Verdict | Notes |
|----------|---------|------|
| Performance + co-equal strength | **Partial** | Consolidated hard-day path exists in **`week-builder`**; must stay aligned with **§5–6** footnotes. |
| Returning / first_race stricter matrix | **Partial** | Intent flags exist; strictness may not uniformly downgrade stacking everywhere. |
| 7-day athletes | **Partial** | **`training_days: 7`** in optimizer; validate against **§7.3** bullets (upper on quality bike day allowed, etc.). |

### §8 Hard no’s (communicate)

| Verdict | **Partial** |
|---------|------------|
| **Evidence** | Conflict/trade-off plumbing (**`ConflictEvent`**, **`generation_trade_offs`**, resolver **`week-conflict-resolver.ts`**). |
| **Gap** | Contract wants **named hard-no templates** (e.g. **§8.5** multi-option resolution). Today **`PLAN_GENERATION_MESSAGE_TEMPLATES`** has related prose (**`co_equal_provisional_1x`**, **`quality_run_unplaced`**) but **not a complete enumerated §8 catalog**; athlete-choice gates may lag **§1.3**. |

### §9 Progression rules

| Topic | Verdict | Notes |
|-------|---------|------|
| **9.1–9.3** TSS / long ride / long run | **Partial** | Implemented via **`buildWeek`** budgeting and caps; **post-recovery rebound** and **week-over-week monotonicity** need targeted verification (known regression class). |
| **9.4 Strength / mesocycle** | **Violated / high risk** | **`toStrengthPhase`** always passes **`start_week: 1`, `weeks_in_phase: 4`** — contradicts contract **§9.4** (“mesocycle counter does NOT reset on phase boundaries”). |
| **9.5 No regression** | **Partial** | Intended by science layer; undermined if strength phase context resets or recovery caps over-apply. |

### §10 Acceptance scenarios

| Verdict | **Not formally enforced in-repo** |
|---------|----------------------------------|
| **Evidence** | Targeted contract tests exist (**`week-optimizer.anchor-contract.test.ts`**, **`scheduler-anchor.contract.test.ts`**) but **do not cover all four §10 narratives end-to-end** (wizard → prefs → combined plan → progression assertions). |

### §11 Output contract

| Verdict | **Partial** |
|---------|------------|
| **Evidence** | **`serializeSession`** / **`plan_contract_v1`** in **`generate-combined-plan/index.ts`** move toward structured output. |
| **Gap** | Field parity vs **§11** checklist (`generation_trade_offs` shape, metadata completeness) should be audited against live **`plans`** rows and clients. |

### §12–13 Process

Meta — **honored** if **`docs/PLAN-CONTRACT.md`** is committed and version bumps are disciplined.

---

## Duplicate sources of truth (explicit flags)

1. **Sequential + placement rules:** **`week-optimizer.ts`** ⟷ **`week-builder.ts`** (file header admits duplication). Contract prefers **one** sequential engine.
2. **Tri plan geometry:** **`tri-generator.ts`** slot defaults ⟷ **`deriveOptimalWeek`** ⟷ **`week-builder`** placement — three layers can disagree under regression.
3. **Strength progression context:** Protocol **`PlacementPolicy`** / **`simple.ts`** weekday lore ⟷ **`week-builder`** tri strength placement ⟷ **`toStrengthPhase`** synthetic phase window — risk contradictory **§4.2 / §9.4**.
4. **Same-day matrix:** **`schedule-session-constraints.ts`** is centralized; **experience modifiers** partially re-litigated in **`week-builder`** — acceptable only if **documented as thin wrappers**, not alternate matrices.

---

## Recommended reading order for a fix pass

1. `docs/PLAN-CONTRACT.md` (canonical spec)  
2. `ArcSetupWizard.tsx` → prefs shape actually persisted  
3. `create-goal-and-materialize-plan/index.ts` (`backfillTriTrainingPrefsDefenseInDepth`, `buildCombinedPlan`)  
4. `week-optimizer.ts` + `schedule-session-constraints.ts`  
5. `generate-combined-plan/week-builder.ts` + `session-factory.ts`  
6. `tri-generator.ts` (standalone path parity)  
7. `activate-plan/index.ts` (what athletes finally see)

---

## Summary table

| Contract area | Overall |
|---------------|---------|
| §1 Principles | Partial (honesty + progression weakest) |
| §2–3 Inputs / levels | Partial |
| §4 Anchors | Partial (defaults + run-only quirks) |
| §5 Matrix | Mostly honored (footnotes fragmented) |
| §6 Sequential | Partial (**duplication**) |
| §7 Modifiers | Partial |
| §8 Hard no’s | Partial (templates incomplete vs §8 list) |
| §9 Progression | **High-risk / violated** (strength phase reset + recovery caps) |
| §10 Acceptance | Not fully automated |
| §11 Output | Partial |

**Bottom line.** The **architecture matches** the hybrid wizard brief and **`schedule-session-constraints` + `week-optimizer`** are the strongest alignment with **§4–6**. The largest **contract integrity risks** are **`week-builder` duplication**, **`tri-generator` parallelism**, **`toStrengthPhase` resetting mesocycle context**, and **§1.3 / §8** not yet matching the **explicit athlete-choice** bar for impossible schedules.
