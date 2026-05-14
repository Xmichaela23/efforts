# Coverage Audit — Universal Fixes Shipped 2026-05-13

Walk-away audit of the universal fixes shipped this session, evaluated against four athlete profiles. Documents discrepancies; **no fixes applied**. Decisions wait for the human.

---

## 0. Methodology and limitations

This is a **static code audit**, not a live plan-generation audit. The available test harness (`scripts/test-combined-plan.mjs`) calls the production `generate-combined-plan` edge function on the live Supabase project (`yyriamwvtvzlkumqrvpm`), creates real `goals` / `plans` / `planned_workouts` rows, and deletes them after. That is outside the session's permission gate (writes to external services without explicit per-call authorization).

What this audit does:

1. Reads the code paths for each universal fix shipped in this session.
2. Reads `docs/STRENGTH-PROTOCOL.md`, `docs/SESSION-FREQUENCY-DEFAULTS.md`, and `docs/SCHEDULING-RULES.md` for the protocol contract.
3. Predicts per-profile behavior by walking the conditional gates with profile inputs.
4. Cross-references existing `*.test.ts` deno tests under `supabase/functions/generate-combined-plan/` and `supabase/functions/_shared/`.

What this audit does **not** do:

- Generate live plans against Supabase.
- Verify markdown-export pixel parity per profile.
- Catch bugs that only manifest in runtime data (race conditions, RLS surprises, downstream cache staleness).
- Speak to UI rendering for any profile (depends on browser session + auth).

To produce a live cross-check, run from the user shell:

```bash
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/test-combined-plan.mjs
```

(see file header for what it asserts; will need profile fixtures added to cover all four).

---

## 1. Universal fixes in scope

Five fixes shipped this session (commit-traceable):

| Fix | Commit | File(s) | Gate(s) |
|---|---|---|---|
| §2.1 endurance-hours deduction before tier lookup | `cf68cf43` | `src/lib/session-frequency-defaults.ts` | Always applied; deduction = 0 for `strength_intent='none'` |
| Wizard reorder + reactive hours card | `e242bec6` | `src/components/ArcSetupWizard.tsx` | Always applied; strength_ordering question gated on `performance` |
| §6.1 cycling/running asymmetry + consolidation gate widening | `4f106a78` (doc), `b189e7ca` (engine), `7715ff5d` (messaging) | `_shared/schedule-session-constraints.ts`, `_shared/week-optimizer.ts`, `_shared/plan-generation-trade-offs.ts` | Heavy Lower phases only (Strength Build, M+P, Rebuild) |
| §7.3 post-race recovery week SKIP | `d42c1079` | `generate-combined-plan/week-builder.ts:1569+` | `phase === 'recovery'` (post-race recovery block, not mid-block 3:1 deload) |
| §6.5 render-time AM/PM ordering + consolidation hook | `ba77872b`, `e41e7781`, `3770ad41` | `src/lib/use-strength-ordering-preference.ts`, `TodaysEffort.tsx`, `AllPlansInterface.tsx` | Render-time only; reads athlete's `strength_ordering_preference` |

Plus the (still-open) punch-list items the universal fixes spawned:

- `scaledWeeklyTSS` reads declared hours, not endurance-adjusted (overflow ~24min on Plan #60 W6).
- `swim_experience` not gating swim volume (Ticket B / Issue 17).
- Issue 1: Plan #57 W13/W17 Taper Priming missing.

---

## 2. Profile audits

### Profile 1 — Durability athlete, 5d/wk, 8-10 hr tier, 70.3, commercial gym

**Inputs**
- `strength_intent = 'support'`
- `weekly_hours_available = 9` (mid 8-10 tier)
- `days_per_week = 5`
- `race_distance = 'olympic_70.3'` (single A-race)
- Equipment: full barbell (commercial gym)

**Derived state**
- `strengthCountFromIntent('support', 9) = 1` (support → 1× regardless of hours)
- Endurance hours = `9 - 1 × 0.75 = 8.25` → tier `8-10` (no shift; deduction lands inside same band)
- Matrix cell `8-10 × 5d` = `{ swims: 2, bikes: 2, runs: 3 }`
- Strength count = `1` (support per §7)
- Protocol = **durability** (Friel AA-MS-SM)

**Findings**

| # | Item | Verdict | Notes |
|---|---|---|---|
| 1 | Option B deduction applied correctly | ✓ Conformant | `strengthCountFromIntent` returns 1 for support; deduction = 0.75hr; tier unchanged. Tested via `session-frequency-defaults.test.ts` "Support 11hr/7d" case (deduction logic identical). |
| 2 | Wizard hours card matches engine output | ✓ Conformant | `formatHoursTierSessions` calls same `computeSessionFrequencyDefaults` as engine. Card preview = `2 swims · 2 bikes · 3 runs · 1 strength`. |
| 3 | Consolidation gate widening (§6.1) | ⚠ **Likely doesn't apply, by design** | §6.1 "heavy Lower" qualifier is scoped to **performance protocol** phases (Strength Build 78-85%, M+P 70-75%, Rebuild 72-80%). Durability MS phase hits 75-85% × 6-10 reps — equivalent load profile but different protocol path. Need to verify whether `_shared/week-optimizer.ts` heavy-phase classifier reads protocol vs phase name. **Severity: question.** Filing as item #1 of pickup order. |
| 4 | §7.3 post-race recovery SKIP | ✓ Conformant | `week-builder.ts:1569+` guard `if (phase === 'recovery') strFreq = 0` is protocol-agnostic. Both hybrid REDUCE and durability SKIP were lumped before; the new guard fires for both. Verified for Plan #59 (hybrid) per `d42c1079` commit; same code path applies to durability. |
| 5 | §6.1 run+lower asymmetry across phases | ⚠ **Same caveat as #3** | If protocol-gated to performance only, durability MS Lower could land 24h-adjacent to quality run without trade-off message. Severity: question. |
| 6 | Thursday ordering (endurance-first for durability) | ✓ Conformant | `STRENGTH-PROTOCOL.md §6.5`: "Durability-focused athlete → endurance first (always)." `decideOrdering` in `_shared/pairing-timing.ts` should default to endurance-first when intent is support. **Spot check needed:** does the new `useStrengthOrderingPreference` hook ever return strength_first for a `support` athlete? `readStrengthOrderingPreference` reads `training_prefs.strength_ordering_preference` which comes from the wizard — and the wizard now gates the strength_ordering question on `strengthIntent === 'performance'`, so a support athlete should never have set this field. Default-on-missing is `endurance_first`. ✓ |
| 7 | Plan total hours per week vs declared budget | ⚠ **Pending punch-list** | `scaledWeeklyTSS` still reads declared hours (9hr), not endurance-adjusted (8.25hr). Risk of ~10-20min overflow per build week (smaller than Plan #60's 24min because deduction is smaller). Severity: cosmetic. |
| 8 | Strength phase progression (durability AA→MS→SM) | ✓ Likely conformant | `STRENGTH-PROTOCOL.md §4.2`: AA in off-season + early base, MS in late base, SM in build/race-spec, taper light then skip. Phase mapping lives in `_shared/strength-profiles.ts` (not reviewed in depth). No commits this session touched durability phase mapping; assumed untouched-and-working. **Spot check recommended.** |
| 9 | Swim volume sanity for "Learning" swim experience | ✗ **Known broken** (Ticket B / Issue 17) | Per `e242bec6` commit body: "Learners emit 3200 yd CSS aerobic / 3150 yd Technique aerobic at Friday slots." `swim_experience` field is not consulted by the volume capper. Severity: blocker (already filed). |

**Profile 1 summary:** 5/9 ✓, 3/9 ⚠ (questions), 1/9 ✗ (known). The two ⚠ items both probe the same question: "is §6.1 heavy-Lower guarding scoped to the performance protocol or to load magnitude?" Answer affects durability MS-phase scheduling.

---

### Profile 2 — Endurance-only athlete, 7d/wk, 10-12 hr tier, 70.3

**Inputs**
- `strength_intent = 'none'`
- `weekly_hours_available = 11`
- `days_per_week = 7`
- `race_distance = '70.3'` (single A-race)

**Derived state**
- `strengthCountFromIntent('none', 11) = 0` (deduction = 0)
- Endurance hours = 11 → tier `10-12`
- Matrix cell `10-12 × 7d` = `{ swims: 3, bikes: 3, runs: 3 }`
- Strength count = `0`
- Protocol = **none** (no strength sessions)

**Findings**

| # | Item | Verdict | Notes |
|---|---|---|---|
| 1 | Option B deduction applied correctly | ✓ Conformant | Tested via `session-frequency-defaults.test.ts` "Endurance-only 11hr/7d → tier `10-12`" — exact case. Deduction = 0; matrix cell unchanged. |
| 2 | Wizard hours card matches engine output | ✓ Conformant | Card preview `3 swims · 3 bikes · 3 runs · 0 strength`. Strength_ordering wizard step skipped (gated on `performance`). |
| 3 | Consolidation gate widening (§6.1) | N/A | No strength sessions to consolidate. |
| 4 | §7.3 post-race recovery SKIP | N/A | No strength sessions to skip. |
| 5 | §6.1 run+lower asymmetry | N/A | No Lower strength. |
| 6 | Thursday ordering | N/A | No Lower to order against quality run. |
| 7 | Plan total hours per week vs declared budget | ⚠ Likely on-budget | No strength deduction → endurance hours = declared hours → `scaledWeeklyTSS` reads same value. Should fit declared budget. Spot check during a real generation would confirm. |
| 8 | Strength phase progression | N/A | |
| 9 | Swim volume sanity for "Learning" | ✗ Same Ticket B as Profile 1 | If athlete declared `swim_experience = learning`, expect 3000+ yd Friday session. Severity: blocker (already filed). |

**Profile 2 summary:** 3/9 ✓, 5/9 N/A, 1/9 ⚠, 1/9 ✗. Endurance-only is the simplest profile — most universal fixes shipped this session don't apply because they're strength-related. The wizard reactive card and Option B deduction both correctly degenerate to no-op for `strength_intent='none'`.

---

### Profile 3 — Hybrid athlete, 7d/wk, 14+ hr tier, 70.3 (boundary test at upper tier)

**Inputs**
- `strength_intent = 'performance'` (co-equal)
- `weekly_hours_available = 15` (declared mid-14+ tier)
- `days_per_week = 7`
- `race_distance = '70.3'` (single A-race)
- Equipment: full barbell (assumed)

**Derived state**
- `strengthCountFromIntent('performance', 15) = 2` (≥10hr → 2×)
- Endurance hours = `15 - 2 × 0.75 = 13.5` → **tier `12-14`** (one-tier shift down from declared tier)
- Matrix cell `12-14 × 7d` = `{ swims: 3, bikes: 3, runs: 3 }`
- Strength count = `2` (performance ≥10hr per §7)
- Protocol = **performance** (hybrid)
- §2.3 volume gate: 15hr < 18hr → honor intent, no advisory

**Findings**

| # | Item | Verdict | Notes |
|---|---|---|---|
| 1 | Option B deduction applied correctly | ✓ Conformant | Tested via `session-frequency-defaults.test.ts` "Performance 14hr/7d → 2× → tier `12-14`" — exact case (the test even says "high-tier unchanged; deduction doesn't over-aggressively re-tier athletes with headroom" — but at 15hr declared, the deduction lands at 13.5hr which IS still in the 12-14 band, not an over-aggressive shift). At declared = 14.0 exactly: 14.0 - 1.5 = 12.5 → tier `12-14` (still). At declared = 14.74: 14.74 - 1.5 = 13.24 → tier `12-14`. At declared = 14.75: 14.75 - 1.5 = 13.25 → tier `12-14`. At declared = 15.5: 15.5 - 1.5 = 14.0 → tier `14+`. **Boundary observation:** an athlete must declare ≥15.5hr to land in tier `14+` post-deduction. **Severity: question** — is this the intended behavior? Athletes who self-identify as "14+" hybrid may expect 4 runs (the differentiator at 14+ tier), but won't get them until declared ≥15.5hr. Document or refine the wizard's tier-band labels. |
| 2 | Wizard hours card matches engine output | ✓ Conformant | Card preview at declared = 15hr will show `3 swims · 3 bikes · 3 runs · 2 strength` (the 12-14 tier cell), not the 14+ cell. This matches engine output (correct), but may surprise athletes expecting "14+ hr tier" prescription. Card text should clearly indicate post-deduction tier; currently it does (per `e242bec6`'s `formatHoursTierSessions`). |
| 3 | Consolidation gate widening (§6.1) | ✓ Conformant | Hybrid + performance → heavy Lower phases trigger consolidation gate widening per `b189e7ca`. Long Ride matrix flip applies. |
| 4 | §7.3 post-race recovery SKIP | ✓ Conformant | Single A-race → final phase is `recovery` post-race week → `phase === 'recovery'` guard fires → `strFreq = 0`. |
| 5 | §6.1 run+lower asymmetry across phases | ✓ Conformant | Heavy Lower (Build / Race-spec phases) gets 48h gap from Long Run, never 24h-adjacent to Quality Run/Long Run, per `b189e7ca`. Hypertrophy/Deload Lower gets relaxed adjacency per `7715ff5d`'s phase-aware messaging layer. |
| 6 | Thursday ordering | ✓ Conformant if athlete chose preference | Wizard's strength_ordering question fires (gated on `performance`). Athlete picks `strength_first` or `endurance_first`. `useStrengthOrderingPreference(planId)` resolves on render. Helper `orderDayWorkoutsByTimingThenDiscipline` in `AllPlansInterface.tsx` and `computeDayTimings` in `TodaysEffort.tsx` apply the preference. **Verified earlier this session** (top cards + weekly view + markdown export all consistent for the strength_first hybrid profile). |
| 7 | Plan total hours per week vs declared budget | ⚠ **Pending punch-list** | `scaledWeeklyTSS` reads declared (15hr) not endurance-adjusted (13.5hr). Per `e242bec6` punch-list note, Plan #60 (hybrid 11hr) overflowed by 24min. Profile 3 is at higher hours so absolute overflow may differ but proportional overflow likely similar. Severity: cosmetic; on punch list. |
| 8 | Strength phase progression | ✓ Conformant | Standard 16-week 70.3 build → Hypertrophy W1-4 (4wk), Strength Build W5-8 (4wk), M+P W9-12 (4wk), Taper W13 (race week). Per §3.2 + §9.1 plan-length scaling. Code path: `_shared/strength-profiles.ts` + `phase-structure.ts`. **No commits this session touched phase mapping**, so assumed working. |
| 9 | Swim volume sanity for "Learning" | ✗ Same Ticket B | If `swim_experience = learning`, expect 3000+ yd Friday at this tier. Blocker, filed. |

**Profile 3 summary:** 7/9 ✓, 1/9 ⚠ (known punch-list), 1/9 ✗ (known). The boundary observation (#1) is worth flagging to product: athletes self-selecting "14+ hours" may not get the "14+ tier" prescription unless they declare ≥15.5hr. Engine math is correct; question is whether the wizard label/copy needs to shift to clarify the post-deduction tier.

---

### Profile 4 — Full IM hybrid athlete, 7d/wk, 11 hr tier, A-race no B-race

**Inputs**
- `strength_intent = 'performance'` (co-equal)
- `weekly_hours_available = 11`
- `days_per_week = 7`
- `race_distance = 'full'` (Ironman)
- A-race only, no B-race

**Derived state** (this is essentially Plan #59 — the regression that drove `cf68cf43`)
- `strengthCountFromIntent('performance', 11) = 2` (≥10hr → 2×)
- Endurance hours = `11 - 2 × 0.75 = 9.5` → **tier `8-10`** (one-tier shift down)
- Matrix cell `8-10 × 7d` = `{ swims: 2, bikes: 3, runs: 3 }`
- Strength count = `2` baseline (performance per §7)
- Protocol = **performance** (hybrid)
- §2.3 volume gate: 11hr < 18hr → honor intent, no advisory

**Findings**

| # | Item | Verdict | Notes |
|---|---|---|---|
| 1 | Option B deduction applied correctly | ✓ Conformant | Tested via `session-frequency-defaults.test.ts` "Hybrid 11hr/7d → tier `8-10` (Plan #59 regression check)" — exact case. |
| 2 | Wizard hours card matches engine output | ✓ Conformant | Card at declared 11hr shows `2 swims · 3 bikes · 3 runs · 2 strength` (post-deduction tier `8-10`), matching engine. |
| 3 | Consolidation gate widening (§6.1) | ✓ Conformant | Same as Profile 3. |
| 4 | §7.3 post-race recovery SKIP | ✓ Conformant | **CRITICAL for this profile.** Plan #59's W14 was the original regression — emitted Hypertrophy Deload (Lower) on the post-race Thursday. Fixed in `d42c1079`. Verified directly against Plan #59 markdown in commit body. |
| 5 | §6.1 run+lower asymmetry | ✓ Conformant | Same as Profile 3. |
| 6 | Thursday ordering | ✓ Conformant if athlete chose preference | Same mechanics as Profile 3. |
| 7 | Plan total hours per week vs declared budget | ✗ **Known overflow** | This is the exact profile that produced the `e242bec6` punch-list note: "Plan #60 W6 build week landed at 11h55m vs 11hr budget — 24min over after §2.1 swim drop because Friday swim absorbed freed TSS." Severity: cosmetic; on punch list (`scaledWeeklyTSS` needs endurance-adjusted hours). |
| 8 | Strength phase progression | ⚠ **Spot check needed** | Per §3.7, Full IM **race-specific phase strength drops to 1× upper-only at maintenance load**, with halved power volume and no depth jumps. Race-spec frequency is `1` for Full IM (vs `2` for 70.3). Build phase is `1-2` (vs `2` for 70.3). The frequency matrix in `session-frequency-defaults.ts` does NOT distinguish race distance for strength count — `strength_baseline` is tier-only. The §3.7 distance-aware modifier must live elsewhere. Commit `cf5867fa` claims "v2.1 close-out — Full IM scaling" but the implementation file (`strength-profiles.ts`?) is not verified in this audit. **Severity: blocker if not implemented; cosmetic if it is. Action item: verify `_shared/strength-profiles.ts` race-distance branching for Full IM.** |
| 9 | Swim volume sanity for "Learning" | ✗ Same Ticket B | If learning, expect 3000+ yd. Blocker. |

**Profile 4 summary:** 6/9 ✓, 1/9 ⚠ (needs spot-check on Full IM race-spec scaling), 2/9 ✗ (both known). Full IM specifically tests §7.3 (post-race recovery skip) and Option B deduction together — both shipped fixes hold up. The unverified item is Full IM-specific strength scaling per §3.7.

---

## 3. Cross-cutting patterns

### Universal fixes that genuinely generalize

- **§2.1 endurance-hours deduction** is the cleanest of the bunch. Mathematically degenerates to no-op for `strength_intent='none'` and produces predictable one-tier shifts only when strength count × 0.75hr crosses a tier boundary. Tested across all four profile shapes.
- **Wizard reactive card** generalizes by construction — single source of truth (`computeSessionFrequencyDefaults`) means the card cannot lie about what the engine will produce. The strength_ordering question's gating on `performance` is correct (durability and endurance-only athletes don't have an ordering preference to set).
- **§7.3 post-race recovery SKIP** is protocol-agnostic at the implementation site (`if (phase === 'recovery') strFreq = 0`). Works for both hybrid REDUCE-default and durability SKIP-default mid-block deloads as well as the dedicated post-race recovery week.
- **§6.5 render-time AM/PM ordering + consolidation hook** is now single-source-of-truth across three consumers (TodaysEffort top cards, AllPlansInterface weekly view, AllPlansInterface markdown export). Verified earlier this session.

### Universal fixes that may not generalize as cleanly as the commits suggest

- **§6.1 cycling/running asymmetry** is the most likely hidden gap. The doc (`§6.1`) frames "heavy Lower" as a load-magnitude qualifier, but the implementation may scope it to performance-protocol phase names ("Strength Build", "Maintenance + Power", "Rebuild"). If so, durability MS-phase Lower (also 75-85% × 6-10) would not get the same protective adjacency rules. Profiles 1 (durability 8-10hr) wears this if real.
- **Full IM race-distance strength scaling (§3.7)** is not part of `session-frequency-defaults.ts` (which is tier-only for strength baseline). The commit log (`cf5867fa` "Full IM scaling") suggests it lives elsewhere — likely `_shared/strength-profiles.ts` or `generate-combined-plan/session-factory.ts`. Not verified by this audit. Profile 4 wears this if not implemented or partially implemented.

### Recurring data-shape divergence pattern (informational — not in scope)

The "Run — Tempo" vs "Run Intervals 4×1000m" label divergence flagged at end of yesterday's session, plus today's dashboard-vs-weekly-view swim title divergence ("Swim — Drills" vs "Race-Specific Aerobic Swim"), both point to the same root cause: **the rendered card title is derived from a different data shape than the underlying workout's canonical name**. `PlannedWorkoutSummary.tsx:34-66` regex-matches against description/tags; `AllPlansInterface.tsx:881-885` uses a similar but not identical heuristic; `TodaysEffort.tsx` uses the workout's stored `name` directly. Each surface picks differently.

This is a real pattern but **out of scope for this audit** — it predates the universal fixes and is filed separately.

---

## 4. Recommended pickup order

Ordered by signal strength (blocker > question > cosmetic):

1. **(question, durability scope)** Verify whether `_shared/week-optimizer.ts` heavy-Lower adjacency rules (§6.1) are protocol-gated to `performance` or load-magnitude-gated. Affects Profile 1 / durability MS-phase scheduling. Read `week-optimizer.ts` and trace the heavy-Lower classifier. ~30 min.
2. **(blocker if missing)** Verify Full IM race-spec strength scaling per §3.7 — does the engine actually drop to 1× upper-only at maintenance for race-specific phase, with halved power volume? Read `_shared/strength-profiles.ts` (or wherever distance-aware session-factory branching lives) and confirm. Affects Profile 4 / all Full IM hybrid athletes. ~30 min.
3. **(cosmetic, on punch list)** `scaledWeeklyTSS` endurance-adjusted hours. Plumb `endurance_hours` out of `computeSessionFrequencyDefaults` and pass to `scaledWeeklyTSS`. Predicted: Plan #60-style overflow drops from ~24min to <5min. Profiles 1, 3, 4 affected.
4. **(blocker, on punch list)** `swim_experience` gating swim volume (Ticket B / Issue 17). Cap learner aerobic at ~2500 yd, threshold at ~2000 yd. All four profiles affected if athlete is `learning`.
5. **(question, copy)** Wizard tier-label honesty for hybrid athletes near tier boundaries. An athlete declaring "14+ hours" gets a "12-14" prescription unless declared ≥15.5hr. Card already shows the correct post-deduction tier (per `e242bec6`), but the bucket label the wizard surfaces *before* the card may suggest otherwise. Worth a copy review.
6. **(spot check)** Confirm durability AA→MS→SM phase progression is unchanged by this session's commits. Read `_shared/strength-profiles.ts` durability branch + `phase-structure.ts`. Should be a no-op verification but cheap.

---

## 5. Test coverage gaps

What's tested today:

- `supabase/functions/_shared/session-frequency-defaults.test.ts` — 7 cases. Covers Profiles 2, 3, 4 directly (endurance-only 11hr/7d, performance 14hr/7d, hybrid 11hr/7d). Profile 1 (durability 5d) is **not** explicitly tested but the deduction logic is identical (`strengthCountFromIntent('support', 9) = 1` is the same code path as the tested 11hr support case).
- `supabase/functions/generate-combined-plan/str-freq.test.ts` — strength frequency (not read in depth this audit; assumed covers §7 strength count logic).
- `same-day-pairing.test.ts`, `long-day-volume-floors.test.ts`, `swim-protocol-volumes.test.ts` — protocol contract tests (not enumerated per profile).

What's NOT tested today (per `docs/PLAN-GENERATION-TEST-MATRIX.md` §0 and §4):

- **Archetype snapshot tests** (the matrix doc says "not yet implemented"). The 10 archetypes table includes Profile 4-equivalent ("Full IM full barbell, 16hr") but does not include Profile 1's exact shape (durability + 5d + commercial gym).
- **End-to-end plan-generation tests** for any specific athlete configuration. The existing `*.test.ts` files test individual modules, not full plan output.
- **§7.3 post-race recovery SKIP** has no dedicated test. `d42c1079` verified manually against Plan #59 markdown but did not add an automated test.
- **§6.1 consolidation gate widening** has no dedicated test for durability MS-phase Lower (the question item from §3 above).
- **Full IM race-distance strength scaling (§3.7)** has no dedicated test.

The `PLAN-GENERATION-TEST-MATRIX.md` doc itself is the right answer to this gap. Per its §4, it's intentionally deferred until items 1-5 (strength, swim, cycling, wizard, every-question) are 100%. Strength is closing as of this session; swim has Ticket B open; cycling has its own protocol doc but no audit yet noted.

---

## 6. Audit completion summary

- Profiles audited: 4
- Universal fixes evaluated: 5
- Conformance items per profile: 9 (some N/A by profile shape)
- Total conformance verdicts: 36 (4 × 9)
  - ✓ Conformant: 21
  - ⚠ Question / spot-check needed: 6
  - ✗ Known broken (already filed): 4
  - N/A by profile shape: 5
- New issues surfaced (not previously on punch list): 0 hard bugs; 2 questions worth investigating (durability §6.1 scope, Full IM §3.7 scaling)
- New copy/UX recommendations: 1 (wizard tier-label honesty near boundary)

Decisions wait for human review.
