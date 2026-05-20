# DAY-COUNT-GATES — Wizard refusal/warning matrix for over-packed training weeks

> **Status: SPEC DRAFT — 2026-05-20. Promoted from `POLISH-PUNCH-LIST.md:180-187` (Theme C punch-list bullet) to a proper spec doc so implementation is anchored to a citable contract rather than a checkbox list.** Theme C per `docs/POLISH-PUNCH-LIST.md`. §11 (wizard copy review) needs **product-owner-supplied copy text** before Slice 3 ships; engine-side semantics below are complete and final.

---

## 0. Scope & binding context

Defines a wizard-side gate that **warns or blocks** when the athlete's declared `(training_days × hours × training_intent × strength_intent × integration_mode)` would produce a session count that does not fit the chosen day count without violating spacing rules. The gate fires **upstream** of plan generation — at wizard submit time — so athletes never receive a silent-degradation plan with sessions dropped via trade-off when the engine could have refused the combination outright.

**Must not contradict (carve-outs in §8):**
- **CONSOLIDATED-MODE.md** (Theme B): the matrix's "Consolidated" cells depend on `integration_mode === 'consolidated'` — Theme C cannot ship until Theme B Slice 4 wires the wizard step (which is itself blocked on §11 product-owner citations).
- **SCHEDULING-RULES.md §4.21**: separated-mode 24h spacing is the source of the spacing math used to derive session-count fit; this doc does NOT introduce new spacing rules.
- **SESSION-FREQUENCY-DEFAULTS.md**: session counts come from the existing frequency matrix (already implemented by `computeSessionFrequencyDefaults`); this doc adds the UPSTREAM gate, not new frequency math.
- **D-017** (strength provenance split): the gate is a *pref*, not a day-pin; it never writes to `strength_preferred_days` or `strength_optimizer_slots`.

---

## 1. The two-axis model

The gate is driven by two independent axes the athlete sets in the wizard:

| Axis | Question it answers | Source field | Default |
|---|---|---|---|
| `training_days` | *How many calendar days per week?* | `goals.training_prefs.days_per_week` | (no default — required wizard input) |
| Load-policy axis | *How aggressively to pack those days?* | `(training_intent, strength_intent, integration_mode)` triple | `(completion, support, separated)` |

The session count comes from the **frequency matrix** (`src/lib/session-frequency-defaults.ts:computeSessionFrequencyDefaults`), which takes `(hours, training_days, training_intent, strength_intent, swim_intent, limiter_sport)` and emits the per-sport `_per_week` counts. The gate's job is to compare that derived count + spacing-rule slot consumption against `training_days` before the wizard accepts the submission.

---

## 2. Definitions

- **Co-equal**: `strength_intent === 'performance'` **AND** `training_intent === 'performance'`. The combination that triggers the §6.1.5 consolidated AM/PM stack and the §5.2 EXPERIENCE_MODIFIER. The hardest concurrent-training population — strength PRs treated as on par with endurance race performance.
- **Performance**: `training_intent === 'performance'`. Race-time / podium / PR-driven athlete; cannot tolerate silent session drops because every prescribed session has explicit purpose.
- **Co-equal Separated**: Co-equal athlete with `integration_mode === 'separated'`. The hardest packing problem: 2 strength + leg-quality must keep ≥24h on both sides, and the athlete is unwilling to accept consolidation as a fallback.
- **Co-equal Consolidated**: Co-equal athlete with `integration_mode === 'consolidated'`. Easier to pack — the consolidated AM/PM stack collapses one calendar slot.
- **Spacing rule**: §4.21 (24h separation in both directions) for `separated`, §5.2 / §6.1.5 (consolidated AM run / PM lift) for `consolidated`.

---

## 3. The matrix (LOCKED — promoted from `POLISH-PUNCH-LIST.md:181-183`)

| Row | training_days | training_intent | strength_intent | integration_mode | Verdict |
|---|---|---|---|---|---|
| 1 | 5 | performance | performance | separated | **HARD BLOCK** |
| 2 | 5 | performance | * | * | **HARD BLOCK** |
| 3 | <5 | performance | * | * | **HARD BLOCK** |
| 4 | 6 | performance | performance | separated | **SOFT WARN** |
| 5 | 5 | performance | performance | consolidated | **SOFT WARN** |
| 6 | <5 | performance | performance | * | **SOFT WARN** |
| 7 | (all other combinations) | * | * | * | **OK** |

**Decoded:**
- **Hard block (rows 1-3):** wizard refuses to submit. The athlete must change one of the inputs ([bump days] / [switch mode] / [drop intent]). No [continue] button.
- **Soft warn (rows 4-6):** wizard surfaces the math + the four options, but allows submit ([continue] proceeds with the trade-off path).
- **OK (row 7):** silent pass — the existing engine-side trade-off rails (drop-and-trade-off in `_shared/week-optimizer.ts:1330, 1431, 1470, 1705, 1807, 1902`) handle any edge cases that slip through.

**Resolution precedence:** rows match top-down. Row 1 fires before Row 2 (more specific first); Row 3 captures the broad `<5 + performance` case after Row 1's more specific check fails. This ordering matters when wiring the gate function.

**The matrix is intentionally one-sided** — only Performance-intent and Co-equal-strength athletes hit it. Completion/first-race/comeback and support-strength athletes silently pass (Row 7); the engine's existing trade-off path is appropriate for those populations (they EXPECTED some flexibility when they declared lower training intent).

---

## 4. The math (how the verdict is computed)

```
sessionCount = swimsPerWeek + bikesPerWeek + runsPerWeek + strengthFrequency
             - bricksThatStackOnExistingDays
             + (integration_mode === 'consolidated' ? 0 : -consolidationCollapses)
```

(Strength stacks per `SESSION-FREQUENCY-DEFAULTS.md §7`; bricks stack per the canonical 6-day template.)

The verdict is then:

```
slotsAvailable = training_days - structuralRestDays
slotsRequired  = sessionCount × spacingRuleMultiplier(integration_mode)
```

When `slotsRequired > slotsAvailable`:
- For Performance + (Co-equal Separated OR ≤5d): **HARD BLOCK** (matrix Row 1-3).
- For Performance + (other rows in the matrix): **SOFT WARN** (matrix Row 4-6).
- Otherwise: silent pass; engine drops sessions with trade-offs.

The `spacingRuleMultiplier` derivation:
- `separated`: each `lower_body_strength` consumes its day PLUS the two adjacent slots (±24h). Equivalent to ~1.4× session weight in slot calculus.
- `consolidated`: `lower_body_strength` stacked on `quality_run` day consumes one slot (AM/PM); no adjacent-day penalty. Equivalent to ~1.0× session weight.

Engine-side reference: `computeSessionFrequencyDefaults` already produces `gate_block: 'hours_too_high_for_days'` at `src/lib/session-frequency-defaults.ts:117, 297-303` for the 14+hr × 5d cell (the upper-right corner of the hours-vs-days matrix). Theme C **extends** this rail — the existing flag becomes one of multiple gate-block reasons, and the wizard finally consumes it (today it is produced but never read; the dead exit at `:117` is half-built).

---

## 5. Copy templates (LOCKED — wording in §11 awaits product-owner sign-off)

### Soft warn

> **Tight fit.** {session_count} sessions in {training_days} days with {spacing_rule}. Options:
> - **Bump days** to {recommended_days}
> - **Switch mode** to {alt_mode}
> - **Continue** (engine will drop {expected_drops} to fit)
> - **Drop intent** to {alt_intent}

`spacing_rule` is rendered as "24h separation" (separated) or "consolidated AM/PM stack" (consolidated).

### Hard block

> **Won't fit.** {session_count} sessions in {training_days} days with {spacing_rule} cannot be scheduled without violating concurrent-training spacing. Options:
> - **Bump days** to {recommended_days}
> - **Switch mode** to {alt_mode}
> - **Drop intent** to {alt_intent}

No [Continue] option — submit button stays disabled until the athlete picks one of the three actions.

**Math display:** both templates must show the actual computed session count and the actual spacing-rule slot consumption, so the athlete understands *why* the gate fired. No "we know best" hand-waving.

---

## 6. Action semantics (what each option does in wizard state)

| Action | Wizard state change |
|---|---|
| Bump days | `goals.training_prefs.days_per_week = recommended_days` (next-higher value that puts the row in OK), re-render gate. |
| Switch mode | `goals.training_prefs.integration_mode = alt_mode` (typically `separated → consolidated`), re-render gate. Requires Theme B already wired. |
| Continue (soft only) | submit through; engine handles the trade-off downstream. |
| Drop intent | `goals.training_prefs.training_intent = 'completion'` (the next-down tier) OR `strength_intent = 'support'`, re-render gate. UI surfaces both sub-options. |

`recommended_days` and `alt_mode` are computed by the gate function — the cheapest single-axis change that moves the row into OK. If multiple changes are needed, the wizard surfaces them sequentially.

---

## 7. Step ordering (LOCKED)

The gate fires **after** all of `(training_days, hours, training_intent, strength_intent, integration_mode)` are collected. In today's wizard step order (`src/components/ArcSetupWizard.tsx:getSteps()` `:2719-2754`), that's **after** the integration_mode step (Theme B Slice 4) — which means the gate naturally sits **on the Confirm step**, not on Step7Budget.

Two options for the UX surface:
- **(a) Re-validate at Confirm.** Add the gate check to the Confirm step's existing "conflicts" surface (`:2470-2629`). The "No conflicts detected" message becomes "Tight fit — N sessions in D days" when the gate triggers.
- **(b) Interstitial card after integration_mode.** Insert a new wizard step that runs the gate immediately after `integration_mode` is set, surfacing the warning before the athlete navigates further.

(a) is cheaper and keeps the wizard's linear flow; (b) gives the athlete earlier feedback. **Spec recommends (a)** — the Confirm step is already the canonical "review everything before submit" surface; doubling its purpose is consistent.

---

## 8. Carve-out matrix vs settled decisions

| Decision | Carve-out | Why it's safe |
|---|---|---|
| D-017 (provenance split) | Gate is a pref-only flag; never writes `strength_preferred_days` or `strength_optimizer_slots`. | Pure wizard-side concern — no engine state mutation beyond what the wizard already writes. |
| D-018 (builder is sole owner of QR+lower trade-off) | When the athlete picks [Continue] on a soft warn, the engine's existing trade-off rails handle the drop. The gate does NOT pre-emptively write a trade-off. | D-018 sole-owner footgun honored. |
| D-019 (race-week protocol) | Gate is wizard-time only; race-week rebuild/A-taper logic is plan-time. Orthogonal. | A race-week with 5-day plan that hard-blocks at wizard never reaches the race-week computation; otherwise the gate doesn't fire. |
| CONSOLIDATED-MODE.md §3 OR-branch | Matrix Row 5 (`5d + Co-equal + Consolidated`) is SOFT, not HARD — consolidation collapses one slot, but 5d is still tight. The Co-equal + Performance population in Row 1-2 is the same population that already triggers the §6.1.5 path; this gate just refuses the impossible packing geometry upstream. | Theme B's OR-branch unlocks consolidation; Theme C's matrix recognizes when even consolidation isn't enough to fit. |
| Q-001 (swim+upper Mon ordering) | Gate doesn't touch same-day ordering — that's `decideOrdering`'s concern. | Orthogonal. |
| Q-012 (easy run + lower recovery-flush) | Same as Q-001 — gate is about *whether* sessions fit, not how they're ordered. | Orthogonal. |

---

## 9. The `clampDaysForMatrix` ambiguity (must be resolved as part of Theme C)

`src/lib/session-frequency-defaults.ts:239-244` silently re-maps `training_days: 4 → 5` for matrix lookup. Today this is invisible to the athlete — the wizard offers a "4 days" button (`ArcSetupWizard.tsx:1978`) that the engine then treats as 5.

**Resolution required:** Theme C's `<5d + Performance` HARD BLOCK row and `<5d + Co-equal` SOFT WARN row depend on the 4-day case being **visible**, not silently clamped. Two options:

- **(a)** Remove the 4-day button from the wizard. `training_days ∈ {5, 6, 7}` only. Cleanest, but loses an existing user-facing option.
- **(b)** Keep 4-day but route it through the gate. The gate fires for 4d + Performance (HARD BLOCK) and 4d + Co-equal (SOFT WARN), forcing the athlete to acknowledge the upcoming clamp + session-drop reality, then submits with `training_days: 5` after the action.

**Spec recommends (b)** — preserves user choice, surfaces the real consequence.

---

## 10. Phased implementation plan

- **Slice 0** — this spec (+ §11 product sign-off on copy) + close-out D-NNN. **Blocking; gated by §11.**
- **Slice 1** — pure gate function: `computeDayCountGate(input) → { verdict: 'block' | 'warn' | 'ok', sessionCount, message, recommendations }`. ~50-80 LOC in `src/lib/day-count-gate.ts`. Unit tests against the 7-row matrix. **Zero wizard or engine changes.**
- **Slice 2** — wire the gate into `Step7BudgetGate` (new Confirm-step section per §7a). Surface the soft-warn / hard-block UI with action buttons. Wire the action handlers to mutate wizard state and re-render.
- **Slice 3** — wire `gate_block` flag from `computeSessionFrequencyDefaults` into the new gate function as one of the contributing reasons (the existing `hours_too_high_for_days` flag becomes a sub-case of HARD BLOCK Row 2/3). Make `clampDaysForMatrix` 4→5 visible per §9 option (b).
- **Slice 4** — component tests + end-to-end wizard test fixtures hitting each of the 6 gating rows.

**Hard dependency:** Theme B Slice 4 (wizard `integration_mode` step) must land before Theme C Slice 2 ships. Theme C Slice 1 (the pure function) and Slice 0 (this spec) can land independently.

**Explicitly DROP/defer:** new spacing-rule math (use existing §4.21 / §5.2 only) · re-organizing the wizard step order beyond §7 · changing `computeSessionFrequencyDefaults` matrix cells (they're orthogonal — the gate consumes the matrix output, doesn't modify the matrix).

---

## 11. Wizard copy review — **[PRODUCT-OWNER INPUT REQUIRED]**

Engine semantics in §3-§6 are LOCKED. The user-facing copy in §5 is a placeholder — product owner must review:
- The soft-warn and hard-block phrasing (especially the "{spacing_rule}" rendering — separated → "24h separation" feels engineering-flavored; product may prefer "concurrent-training spacing" or similar).
- The action button labels ("Bump days" / "Switch mode" / "Continue" / "Drop intent") — verify these match the brand voice elsewhere in the wizard.
- Whether the math-display should be more or less prominent.

Engine behavior does not depend on the copy; Slice 2 is blocked only on this section.

---

## 12. Close-out decision record (for the D-NNN at arc completion)

Theme C introduces:
1. **The 6-cell gate matrix** (§3) — locked decision on which Performance/Co-equal cells warn vs block.
2. **The math basis** (§4) — slot calculus per spacing rule; cites existing engine rails, no new math.
3. **Action semantics** (§6) — what each user-facing button does in wizard state.
4. **Step ordering** (§7) — gate fires at Confirm step (option a), not as an interstitial.
5. **`clampDaysForMatrix` visibility** (§9) — keep 4-day button but route through gate (option b).

Full rationale → the close-out D-NNN; verified-state → ENGINE-STATE "Solid" at arc completion (same pattern as D-019 race-week / D-020 swim arc / Theme B's pending D-021).
