# WIZARD AUDIT — `ArcSetupWizard.tsx`

**Filed:** 2026-05-25 (D-054 / Item 5).
**Scope:** read-only audit of every step in `src/components/ArcSetupWizard.tsx` (2951 lines). Flags questions that are confusing, redundant, or missing context for a non-technical athlete. **No UI changes** — recommendations for follow-up only.

**Surveyed step components:** `Step1Races`, `StepPriorRace`, `Step2Intent`, `Step3Swim`, `Step4Bike`, `Step5Run`, `StepTriRunQualityPlacement`, `StepTriBikeQualityPlacement`, `Step6LongDays`, `Step7Budget`, `Step7BHours`, `Step8Strength`, `Step8bStrengthOrdering`, `Step9Confirm`.

---

## Findings — by step

### Step1Races (race calendar)
- **Clear.** Distance + date + priority is concrete and well-labeled.
- **Minor:** "Priority" toggle (A/B/C) has no inline definition. Most athletes don't think in A/B/C priority terms. Consider one-line explainer chip or rename to "Importance: Main goal / Secondary / Practice."

### StepPriorRace (prior comparable race)
- **Clear purpose:** seeds the post-race-recovery context.
- **Confusing:** "Training since that race" is open-ended free text and athletes don't know how much detail is useful. Recommend a short structured input (weeks since / recovery vs build vs nothing) or a placeholder example.

### Step2Intent (training intent)
- **Three options promise distinct prescriptions** — but per `DECISIONS-LOG.md` and POLISH-PUNCH-LIST line 145, the engine only branches on `training_intent` for 6 same-day pairing exceptions. **`completion` and `first_race` are functionally identical** in terms of pace targets, loading pattern, run-quality selection, and phase structure today.
- **Flagged:** "Race the clock" copy promises "Interval and threshold sessions, pace targets on every quality workout, recovery every 3–4 weeks" — partly accurate.
- **Flagged:** "Strong, healthy finish" promises "Tempo-based quality work, no pace targets, recovery every 3 weeks" — currently NOT differentiated from `first_race`.
- **Flagged:** "First time at this distance" promises "Conservative ramp, recovery every 2 weeks, no intensity pressure" — currently NOT differentiated from `completion`.
- **Item 11 in the D-054 batch addresses this** by softening completion + first_race copy to match engine reality. **Wiring `training_intent` through to loading pattern + pace-target emission is Ticket B** — see POLISH-PUNCH-LIST line 145.

### Step3Swim (experience + weekly structure)
- **Clear** experience choices ("learning / steady / strong") with concrete descriptions.
- **Good:** the "Learning or rebuilding" choice surfaces a `<ArcHint>` with the 200yd time-trial protocol → 100yd pace baseline. This is exactly the kind of inline calibration help that other steps lack.
- **Confusing:** "Weekly structure" choice between "Race-ready — 2 sessions/week" and "Swim focus — 3 sessions/week" describes typical yardage ranges, but the difference between them is presented as "good when pool time is limited" vs "better technique frequency; pulls a bit more from bike/run load." The trade-off articulation is solid; the underlying choice naming ("race-ready" vs "swim focus") could mislead — an athlete might pick "race-ready" thinking it's the *better* choice when actually it's a session-count trade-off.

### Step4Bike (group ride anchor)
- **Clear:** group ride yes/no, day, intensity (hard vs easy).
- **Good:** route URL is optional with explanatory text.
- **Minor:** "How hard is it?" question for the group ride has only two options (quality / easy); a third "varies" or "mostly aerobic with surges" option may match more group rides (the kind where a hammerhead breaks the group apart for 20 min then it regroups). Today's binary is a forced choice.

### Step5Run (run quality)
- **Clear.** Optional group run / track night anchor.
- **No issues flagged.**

### StepTriRunQualityPlacement / StepTriBikeQualityPlacement
- **Confusing:** the binary "fold into long run/ride" vs "standalone mid-week" choice is presented without explaining WHY an athlete would pick one. The engine context ("contract", "anchor") leaks through. Athletes don't know whether they should pick the blend or the standalone. Recommend: lead with the athlete-side question ("Are mid-week mornings tight for you?") with the engine logic as supporting copy.

### Step6LongDays (long ride/run day pinning)
- **Clear:** day-of-week dropdowns for long ride and long run.
- **Confusing:** the "long ride / long run on same day" conflict warning fires at Step 9 (Confirm), not here. Athletes can pin both to Saturday in Step 6 with no inline feedback. Recommend: surface the conflict inline at the moment of pinning.

### Step7Budget (days per week)
- **Clear.** "Days per week (4–7). Rest days are scheduled automatically around long and quality sessions."
- **Minor:** doesn't surface what each option implies for fitness gain trajectory or recovery cost. A 4-day athlete vs 7-day athlete will have very different builds — athletes don't know the trade-off. Recommend a one-line "Most age-groupers find 5–6 the right balance" hint.

### Step7BHours (weekly hours)
- **Clear.** Hours/week input.
- **Missing context:** what hours include — does pool warm-up count? Does drive time? Trainer warm-up? Recommend: explicit "Include all training time including warm-ups; exclude drive time and gym changing time."

### Step8Strength (frequency + intent + equipment)
- **Clear:** include? frequency? intent? equipment tier? DB max?
- **Confusing:** "What role does strength play this season?" — the choices are "Hybrid Strength Athlete," "Durability," "None" (likely). "Hybrid" is fitness-industry jargon; athletes without strength background don't know what it means. Recommend: rename "Hybrid Strength Athlete" to something like "Strength as a co-equal training piece (2× weekly compound lifting)" with a tooltip.
- **Good:** equipment tier (full barbell / DB-based / bodyweight-bands) has concrete descriptions.
- **Good:** DB max input has a why-we-ask explainer.

### Step8bStrengthOrdering (AM/PM pairing)
- **Clear** for athletes who train AM and PM. **Confusing** for athletes who only have one window per day — they have to pick anyway and the UI doesn't explain that the answer only matters when sessions stack on the same day.
- Recommend: surface "Only matters when an endurance and strength session land on the same day" inline.

### Step9Confirm (plan summary + start date + freeform)
- **Confusing:** the schedule summary uses internal-engine vocabulary the athlete may not have seen elsewhere ("Long ride", "Long run", "Quality bike vs run anchor"). For an athlete who skipped over the placement questions, "Quality run vs bike day: Folded into long run (no separate mid-week quality)" is opaque.
- **Good:** "Anything unusual about your schedule? (optional)" freeform field is well-positioned — gives athletes an escape valve for cases the structured wizard didn't cover.
- **Good:** plan start date picker. (D-046 / earlier batch allowed past dates up to 8 weeks — useful for backfill.)
- **Confusing in some flows:** "Looks right — build my plan" button text is friendly, but "Building…" hides the fact that plan generation can take 30-60s. Recommend: show progress indicator or estimated time.

---

## Global findings

### G1. **Engine vocabulary leaks throughout**
Multiple steps refer to internal-engine terms ("anchor", "contract", "standalone", "blend", "co-equal", "intent", "phase") in athlete-facing copy. Athletes won't know what these mean. Recommend a glossary tooltip or a wizard-wide vocabulary pass to translate engineering terms to athlete-side language.

### G2. **Missing inline trade-off feedback**
Several steps allow choices that conflict (long ride + long run same day; group ride + group run same day; strength frequency vs days-per-week) but the conflict only surfaces at Step 9 Confirm. Athletes have to backtrack to fix. Recommend: inline real-time conflict warnings at the source step.

### G3. **No clear "I don't know" path for several choices**
Step3 swim experience, Step8 strength intent, Step8b strength ordering all force a choice. Athletes without prior structured training don't know how to pick. Recommend: a "Not sure — pick what's typical" option that defers to engine defaults for each.

### G4. **Promises vs reality gap (training_intent)**
Step 2 promises three distinct prescriptions; engine treats two of them identically. Soften copy now (Item 11 in this batch) and queue the wiring as Ticket B.

### G5. **No back-out for "I want to redo this" mid-wizard**
The wizard is linear with back / next. No "restart" or "jump to section" affordance. For a long wizard (~10 steps) this can be frustrating. Recommend: a "Review all" jump-back affordance on Step 9.

### G6. **Race priority terms (A/B/C) lack inline definition**
Step 1 lets the athlete pick race priority without explaining the terms. The engine treats them as load-bearing (D-019 §8.1 chronology guard hard-fails on misordered priorities). Athletes without race-planning experience don't know how to pick. Recommend: tooltip or rename.

### G7. **Plan-start picker is in the LAST step (Confirm)**
Athletes may want to verify the start date earlier in the flow (e.g. to confirm the plan starts AFTER a trip / surgery / etc.). Today's placement at Step 9 means they discover the date after answering everything else. Recommend: surface plan start date earlier OR add an "edit" affordance at Step 9 that re-opens the relevant step.

---

## Priority recommendations (if a follow-up pass happens)

| Priority | Finding | Approach |
|---|---|---|
| High | G1: Engine vocab leaks | Coordinated copy pass + glossary tooltips |
| High | G4 / Step2: training_intent promises vs reality | Item 11 (this batch) covers copy; Ticket B covers wiring |
| Medium | G2: Inline conflict warnings | Step-side validators with red flags |
| Medium | G3: "Not sure" path | Add deferred-default option per choice |
| Medium | G6: A/B/C priority labels | Tooltips or rename |
| Low | G5: Mid-wizard navigation | Defer until other UX is solid |
| Low | G7: Plan-start surfacing | Defer until other UX is solid |

---

## Out of scope for this audit

- Mobile responsiveness, accessibility (WCAG / a11y), keyboard navigation
- Visual design / color / spacing
- Telemetry / instrumentation
- Locale / i18n (single-language English audit)
