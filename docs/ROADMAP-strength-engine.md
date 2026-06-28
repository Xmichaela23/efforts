# ROADMAP — One Scalable Strength Engine

**Purpose:** the plan for evolving strength from today's working-but-limited state into **one scalable strength engine**, so the next session picks up clean. This is **additive work on a sound foundation — NOT a teardown.** Captured 2026-06-27 after the strength-continuity + race-quality audit.

---

## The goal

**One strength engine where modalities plug into a single chassis:**
- **Modality-pluggable** — 5×5, hypertrophy, durability, power, the progression ladder (Texas/Madcow/5-3-1) all register into the **one protocol chassis** (the `StrengthProtocol` slot → `selector` registry → dispatch). Add a modality = add a module + register, never fork the engine.
- **Frequency-capable** — 3–4-day weeks, true upper/lower splits, not the current 2–3× concurrent cap.
- **One strength path** — retire the legacy/combined fork so run, tri, and non-race strength all flow through one place.
- **Extend, don't fork (D-213 applied to strength)** — same principle that unified plan-gen into "one engine, two output shapes": extend the one strength engine for every new modality/entry point, never spin up a parallel strength path.

## What already exists — the foundation (KEEPS, not a rebuild)

This is real and sound; the roadmap builds on it:
- **The protocol chassis** — `StrengthProtocol` interface → `selector.ts` registry → `getProtocol` dispatch. Proven by the 5×5 add (a module + 6 registration spots, no engine fork). The pluggability is already there.
- **Seven science-documented protocols** — each now has honest sourcing (`SCIENCE-5x5-linear-progression.md`, `SCIENCE-durability-injury-prevention.md`, `SCIENCE-minimum-dose-maintenance.md`, `SCIENCE-upper-aesthetics-hypertrophy.md`, `SCIENCE-neural-speed-running-economy.md`, `SCIENCE-triathlon-strength-friel.md`, + `triathlon_performance` in `STRENGTH-PROTOCOL.md`). Mechanism-vs-convention separated per claim. **The ground truth is mapped.**
- **The deterministic engine** — `createWeekSessions(context)` per protocol, the combined-plan dispatch (`runStrength`/`triathlonStrength`, now `sessionIndex`-correct post Q-089), `intent-taxonomy` gating, equipment-tier scaling (`db-prescription`).

The roster truth (from the audit): **one standalone-capable program (`five_by_five`); six supplementary slots.** The engine was built concurrent (strength-as-a-slot); the roadmap adds standalone capability without breaking the concurrent slots.

---

## The phased roadmap (with dependency logic)

### Phase 1 — Independent, shippable now (no frequency unlock needed)
The "unify what exists + fix what's broken" phase. Each item is independent:
1. **Q-087 — done (this session).** The `strength-overlay.ts:620` filter that stripped the upper session from `upper_aesthetics` @ freq 2 (shipping zero upper). Removed; guard test added; deploy-gated marathon check owed.
2. **Vocabulary unification (Q-084)** — migrate ArcSetupWizard's tri strength from *intent-role* labels ("training priority" / "Durability-Focused") to the **named-protocol vocabulary** the builder + PlanWizard use ("Durability" anchor + §13.1). One strength language across all three entry points. UI/doc work, no generator change.
3. **Marathon-strength surfacing in the Arc flow** — ArcSetupWizard tri-gates strength away, so a marathoner in the modern Arc flow gets no strength choice (only legacy PlanWizard offers it). Surface the §13.1 named-protocol choice for run goals, role-correct (don't offer Upper Aesthetics as "performance" strength — it's a supplementary aesthetic overlay).

### Phase 2 — THE UNLOCK (load-bearing; everything richer depends on it)
4. **Q-088 — raise the frequency cap.** Today `ProtocolContext.strengthFrequency: 2 | 3` (no 4), and freq-3's extra day is another *lower*, not a true split. Raise the cap, build a **true upper/lower 4-day split**, and accept that this touches **every strength cell** (concurrent + standalone). This is the pivot between "unify what exists" and "build better strength."
5. **Q-086 — wire the live 1RM loop** (pairs with Phase 2). The observed-1RM estimator (Epley/Brzycki) exists but its output doesn't flow back into `ProtocolContext.userBaselines` / the next prescription's anchor. Wiring it makes baselines **live** so 5×5 (and any progression) is honest. Can ship independently but naturally lands with the frequency rebuild.

### Phase 3 — Needs Phase 2
6. **Real standalone strength programs beyond 5×5-at-2×** — a 3–4-day hypertrophy/strength block, and the **progression ladder (Q-083)** (Texas Method / Madcow / 5-3-1 as configs of one recovery-aware cadence engine: session→week→month cadence × heavy/light/medium). *Blocked on the frequency unlock.*
7. **Race-strength dosing** — let a racer who wants more strength choose 3–4 days (today everything is derived/hardcoded to 2–3, except PlanWizard). *Blocked on the frequency unlock.*

### Path consolidation — a deliberate LATER migration, NOT Phase 1
Retiring the legacy run-strength path (`generate-run-plan/strength-overlay.ts`) and routing run goals through the combined engine. **The scout found this is a snag-laden migration, not a clean swap:**
- `runStrength` is a *content* function entangled with the combined week-builder/optimizer-slot context that `generate-run-plan` (and `adapt-plan`, a second consumer) don't have — so "consolidation" really means routing run goals through `buildCombinedPlan` **entirely** (changing the endurance plan too + relaxing the `<2 event goals` gate).
- It would **lose** strength-overlay's sensitivity-gated taper, memory `noDoubles`, and the intent→`neural_speed` resolver upgrade unless those are ported first.
- **Best done alongside Q-088** (you're rebuilding the engine's guts anyway), **NOT before**, and **optional once Q-087 is fixed** (the bug-driven urgency is gone; the two paths can correctly coexist).

---

## The open questions this roadmap ties together

| Q | What | Phase |
|---|---|---|
| **Q-087** | Upper-stripping filter bug (legacy run strength) | **1 — done this session** |
| **Q-084** | Vocabulary harmonization (Arc tri strength → named protocols) | 1 |
| **Q-088** | Strength frequency cap (2-3 → 4+, true split) | **2 — the unlock** |
| **Q-086** | Live 1RM feedback loop (observed → next anchor) | 2 (independent-capable) |
| **Q-083** | The progression ladder as one recovery-aware cadence engine | 3 (needs Q-088) |
| **Q-090** | minimum_dose intensity (recovery-economy vs literature) | 3 / parallel tuning |

## Cross-references

- **D-213** (`SPEC-one-engine-two-shapes.md`) — the "extend, don't fork" principle this roadmap applies to strength.
- The seven `SCIENCE-*.md` strength docs + `STRENGTH-PROTOCOL.md` — the documented protocol foundation (what each is, who it's for, standalone vs supplementary, science status).
- `SPEC-per-discipline-periodization.md §13.1` — the builder's posture→protocol→label contract (the vocabulary Phase-1 unifies toward).
- `SCIENCE-concurrent-training-interference.md` — the interference science governing the frequency/dosing decisions in Phase 2.
- The strength chassis: `shared/strength-system/protocols/` (`selector.ts`, `StrengthProtocol`, `intent-taxonomy.ts`).
