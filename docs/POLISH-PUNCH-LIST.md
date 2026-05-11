# Efforts — Polish Punch List

Tracking the work to get the app from "engine works" to "every flow ships clean." No new features past this point. Only finish what's started.

Last updated: May 11, 2026

---

## Core principle — architectural fix over bandaids

When a bug surfaces, **fix the architecture that allowed it**, not just the symptom.

If a label is wrong, ask why labels can drift from source.
If a counter resets unexpectedly, ask what contract the counter violates.
If a value doesn't appear, ask what threading or selection logic failed.

One-off fixes compound into architectural debt. Root-cause fixes prevent the next ten bugs of the same type.

**Canonical examples (May 10, 2026):**

1. **equipment_location vs capability_tier split.** Multiple display bugs (tier label wrong, protocol header wrong) traced to one root cause: athlete's location choice was being overwritten by capability inference. Fix: preserve location as separate field, rename capability tier to remove location implication, surface both honestly in export. One architectural change closed multiple bugs.

2. **Floor canonical-value contract.** Three "different" trade-off message bugs ("21.2335mi" string, no rounding, no race-specific cap) all traced to validate-training-floors returning raw math that flowed straight to athlete-facing messages. Fix: effective floor functions return a single canonical value (capped at race-specific peak, rounded for display) that both threshold and message read from. No downstream re-derivation possible. One return-value change closed the class.

3. **Explicit `rebuild` phase post-B-race.** Week 16 Push Press dropped from 105lb to 70lb because the next goal's `base` week 1 was indistinguishable from a fresh-start macrocycle to consumers (strength loads, swim ceilings, long-day floors). Initial debugging looked at the week-in-phase counter, but the counter was working correctly — the *model* was missing semantic information. Fix: add `rebuild` to the Phase enum, emit 1-2 rebuild weeks between recovery and the next goal's abbreviated cycle, populate `weeksSinceRaceIncludingRebuild` for diagnostics, and have each consumer read `phase === 'rebuild'` to apply pre-race × 0.85 (or +5%/wk ramp) instead of base values. One enum addition + scoped consumer arms closed Push Press, swim yardage, and long-day floor regressions in the same code path.

This principle applies to all remaining polish work.

---

## Process pattern (working)

For each numbered item:
1. Research the science / best practices
2. Write the protocol spec doc (in chat, save to repo)
3. Hand to Claude Code: "audit existing implementation against spec, report gaps, do not write code yet"
4. Review findings, pick scope
5. Implementation in rocks (commits)
6. Test, deploy

---

## 1. Strength 100% across user choices

**Status:** ~95% — architecture complete, two known bugs remain

### Done
- [x] STRENGTH-PROTOCOL.md spec doc written
- [x] Durability protocol rewritten to AA-MS-SM (Norwegian/Friel)
- [x] Three-tier equipment classification (full_barbell / dumbbell_based / bodyweight_bands)
- [x] Performance gate when no barbell + no DBs (downgrades to durability with trade-off)
- [x] Maintenance + Power loads tuned (87% → 72%)
- [x] Taper Priming loads tuned (75% → 55%)
- [x] Sets bumped 3 → 3-4 in Hypertrophy and Strength Build
- [x] 1RM conservative defaults + trade-off message
- [x] Equipment summary line on every session
- [x] Power phase rotation (Push Press added)
- [x] Wizard surfaces equipment gate inline
- [x] Wizard surfaces intent labels with descriptions
- [x] Wizard surfaces 1RM warning when missing
- [x] Dumbbell tier exercise substitutions + load capping (Part 1)
- [x] Bodyweight + bands tier substitutions in durability (Part 2)
- [x] DB max wizard field for dumbbell-only athletes
- [x] Part 3 — exercise-level equipment gating (hasBench + hasBox substitution chains)
- [x] Equipment location preserved as athlete's literal choice (separate from capability tier)
- [x] Capability tier renamed from commercial_gym → full_barbell
- [x] Plan export shows both Equipment Location AND Capability Tier
- [x] "Strength Protocol: durability" mislabel fixed (suppressed for tri exports)
- [x] Week 16 Push Press regression — fixed at architectural level via explicit `rebuild` phase + canonical post-race ramp contract (strength reads previous build × 0.90 +5%/wk; long-day floors and swim ceilings continue pre-race progression)
- [x] Broad Jumps not appearing in power rotation — small targeted fix: removed `'push_press'` from dumbbell_based / bodyweight_bands tier rotations in `triathlon_performance.ts`. Home/DB athletes now rotate plyo + KB only, so Broad Jumps reaches selection in short race-prep windows.

### Open
- [ ] 9-week edge case trade-off message — when plan length forces base phase to 0 weeks, surface explicit "base phase skipped due to plan length" trade-off instead of silent skip
- [ ] Minimum rebuild week count enforcement — when post-B-race window <2 weeks, current code skips rebuild entirely; consider whether to compress taper to guarantee ≥1 rebuild week
- [ ] Verify all 6 intent × tier combinations end-to-end
- [ ] Materialize-plan numerical resolution for % 1RM strings (deferred)

---

## 2. Swim program 100%

**Status:** ~70% — drill rendering + sighting + equipment line shipped, content gaps remain

### Done
- [x] Drill display names lookup
- [x] Sighting drill added end-to-end
- [x] Equipment-aware session substitution
- [x] Per-session gear summary line

### Open
- [ ] Week 7 build week showing 1,750yd recovery-level volume — bug
- [ ] Race-Specific Aerobic sessions too short (1,000yd) — should scale 1,500-2,500yd by phase
- [ ] Drill rotation only working in Technique Aerobic sessions
- [ ] Equipment line duplicating on some sessions
- [ ] Wire new drill tokens (Single-Arm, 6-3-6, Zipper, Sculling) into session generators
- [ ] Add missing session types: Swim Time Trial, Open Water Skills, Mixed/Fartlek, Race-Pace Sustained
- [ ] Standardize all swim intensity references to CSS percentages

---

## 3. Cycling 100% — stop calling Z2 weekday rides "long rides"

**Status:** 0% — not yet audited

### Open
- [ ] Write CYCLING-PROTOCOL.md spec doc
- [ ] Audit cycling session naming — "Long Ride" only the genuine weekly long session
- [ ] Distinguish Easy / Endurance / Long / Quality / Brick rides
- [ ] Verify cycling power zones (read from athlete FTP)
- [ ] Audit brick session structure
- [ ] Confirm Wednesday group ride anchor flows through correctly

---

## 4. Wizard language + clarity

**Status:** ~20% — strength step clear, other steps not audited

### Done
- [x] Strength step: intent labels with descriptions
- [x] Strength step: equipment gate inline warning
- [x] Strength step: 1RM warning when missing

### Open
- [ ] Audit every wizard step — each question's purpose clear
- [ ] Surface tradeoffs at decision time, not after plan generation
- [ ] Link each equipment chip to what it unlocks
- [ ] Explain what each baseline input drives

---

## 5. Every flow question delivers something

**Status:** ~30% — most questions wired, no end-to-end audit done

### Open
- [ ] Audit each wizard question, confirm engine reads it
- [ ] Remove dead questions
- [ ] Document what each input drives
- [ ] Verify equipment chips → strength protocol selection
- [ ] Verify 1RM data → strength loading
- [ ] Verify FTP → cycling power zones
- [ ] Verify CSS / threshold pace → swim intensity
- [ ] Verify threshold pace / VDOT → run zones
- [ ] Verify recent training history → volume floor calibration
- [ ] Tradeoff messages should disappear when their question isn't violated

---

## Background items (not blocking, surface as bugs are observed)

### Done
- [x] Floor numbers showing extra decimals ("21.2335mi") in tradeoff messages — fixed at architectural level

### Open
- [ ] Tradeoff message filtering — strings like "Strength: default" or "Weekly layout: moved" shouldn't appear when no anchors exist
- [ ] Brick session not appearing in plan export markdown
- [ ] Schedule Adjustments panel should hide when generation_trade_offs is empty after filtering
- [ ] Bypass-path audit for strength_intent normalization

---

## Done = launchable

When items 1-5 are all 100% and background items are closed, the app ships every flow clean. No new features past this point. Polish only.
