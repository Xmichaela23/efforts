# Weekly Context UI: Reframe + Rename + Layout (Implementation Brief)

## Goal
Current "Weekly Context" over-emphasizes ACWR and uses language that feels clinical ("Heart & Lungs") or brandy ("Engine/Chassis"). We want a quiet, adult, decision-support layout that emphasizes *state* first, *risk* second, *guidance* last.

Key principle:
- **State first. Constraint second. Decision last.**
ACWR is a constraint (ramp risk), not a readiness headline.

---

## Rename (copy should be neutral, non-medical, non-hype)

### Replace labels
- "Heart & Lungs" -> **Aerobic Load**
- "Muscle & Joints" -> **Structural Load**
- "Burnout Risk" (or "Systemic Risk") -> **Load Change Risk**
- "The Verdict" -> **Training Guidance**

### Replace status words (if needed)
Avoid: "Fresh", "Tired", "Loaded" (too vibe-y / bro-y)
Use:
- **Low fatigue**
- **Moderate fatigue**
- **Elevated fatigue**
Or:
- **Low strain**
- **Moderate strain**
- **Elevated strain**

---

## Layout (visual hierarchy)

### Section 1 (top, most prominent): Current Training State
Show only the two state pillars and a one-line interpretation.

Example:
```
CURRENT TRAINING STATE
- Aerobic Load: Elevated fatigue
- Structural Load: Low fatigue

Interpretation line (deterministic):
"Your limiting factor right now is aerobic recovery, not structural readiness."
```

**Limiter rule (deterministic, must be visible):**
- Use severity tiers: **Low** / **Moderate** / **Elevated** for each pillar.
- If tiers **differ**: the pillar with the **higher** tier is the limiter (e.g. Aerobic Elevated, Structural Low → limiter = Aerobic).
- If **same tier**: "No clear limiter; proceed as planned."
- Define the margin now (tier comparison). Do not leave this to subjective interpretation.

### Section 2: Why (small, explainable) — cap at 2–3 bullets per pillar
**Do not let this become a data dump.** Only the strongest drivers. Tight version:

- **Aerobic Load (based on):** HR drift trend, pace adherence, last 3 runs efficiency
- **Structural Load (based on):** lifting volume (7d), avg RIR (7d), impact exposure (optional)

That’s it. Do NOT list everything you compute. Do NOT mention organs or anatomy.

Example one-liners (no raw number dump unless meaningful):
- "Aerobic Load is elevated (based on: HR drift ↑, pace adherence ↓)."
- "Structural Load is low fatigue (based on: avg RIR 2.6, low recent lifting stress)."

### Section 3 (quiet, separate): Load Change Risk (ACWR)
This is a safety constraint. Present it as a small "Risk" line item, not a headline.

**Copy rule:** ACWR must **never** be described as "burnout" or "systemic" anywhere—including tooltips, help text, and info panels. Remove any existing "burnout" / "systemic" / "Undertrained" wording when implementing.

```
LOAD CHANGE RISK
- ACWR: 0.xx
- Label: Below baseline / In range / Ramping fast / Overreaching
```

Important: remove the big colored ACWR bar as the primary visual.
If we keep a visual, use a tiny indicator (badge), not a spectrum.

Label rules (deterministic; keep your existing thresholds):
- < 0.80 => "Below baseline"
- 0.80–1.30 => "In range"
- 1.31–1.50 => "Ramping fast"
- > 1.50 => "Overreaching"

Copy rule:
Never frame <0.8 as negative. It's not "bad"; it's just below recent norm.
Suggested copy:
"Below baseline: you're training under your recent norm. Not a ramp risk."

### Section 4: Training Guidance (action)
One or two lines. Should reconcile state + constraint.

Examples:
- If Aerobic fatigue elevated AND Structural low:
  "Proceed with planned sessions; avoid adding intensity today."
- If Structural elevated:
  "Reduce impact/strength stress; keep intensity controlled."
- If Load Change Risk high:
  "Do not add volume; prioritize recovery to reduce ramp risk."

Avoid vague phrasing like "Proceed with caution" without explaining why.
Always include a reason ("because aerobic fatigue is elevated" / "because ramp risk is high").

---

## Computation / Data model notes
- Treat Aerobic Load and Structural Load as **state signals**.
- Treat ACWR as a **constraint signal** (governor).
- Overall "readiness %" should be optional; if kept, it must be downstream of state pillars, not ACWR.

If "Readiness %" exists:
- It should be explained as "overall training state estimate" and list the dominant limiter.
- It should not visually outrank the "Current Training State" section.

---

## Acceptance checklist
- [ ] ACWR is no longer the headline metric.
- [ ] No anatomical labels ("Heart & Lungs") and no hype metaphors ("Engine/Chassis").
- [ ] The first thing a user sees tells them: (1) current state, (2) limiter, (3) what to do.
- [ ] "Below baseline" is presented as neutral (not a warning).
- [ ] Guidance always includes a reason tied to the state signals.
- [ ] "Based on" language present for each pillar (data source / date range).
- [ ] No "burnout" or "systemic" anywhere (labels, tooltips, help).

---

## Product-level correction: page header

The screen is effectively **today’s readiness**, not weekly planning. Rename so the header matches:

- **Header:** "Current training state"
- **Subheader:** "Updated from your last 7 days"

If you keep calling it "Weekly Context," users will expect weekly planning. Use the above so it’s clear this is state/readiness from the last 7 days.

---

## Implementation sequence (minimal risk order)

Do these in order. Do not skip steps.

### Step 1 — Reorder without changing visuals
In `TrainingContextTab.tsx`, move blocks into the target order only. Keep existing cards as-is (same content, same styling).  
**Goal:** Confirm layout works and nothing breaks.

### Step 2 — Create the new "Current Training State" card
Add a new card (or inline block) that renders:
- Aerobic Load status (new label; use Low / Moderate / Elevated fatigue)
- Structural Load status (new label; same tier words)
- Limiter line (deterministic: tier comparison; if same tier → "No clear limiter")

Keep it text-first. No gradients. No gauges.

### Step 3 — Add the "Why" block (small)
2–3 bullets per pillar max. Example:
- "Aerobic Load is elevated (based on: HR drift ↑, pace adherence ↓)."
- "Structural Load is low fatigue (based on: avg RIR 2.6, low recent lifting stress)."

Do **not** show raw numbers unless they’re already meaningful to a user.

### Step 4 — Shrink/replace `ACWRGauge.tsx`
Either:
- Convert it into a single-line "Load Change Risk" row (badge + ACWR value), or
- Remove the gauge from the tab and render a minimal inline ACWR display in `TrainingContextTab.tsx`.

**Hard rule:** ACWR is not visually dominant anymore. Remove the big colored bar as the primary visual. Remove any "burnout" / "systemic" / "Undertrained" from tooltips/help.

### Step 5 — Rename "Verdict" → "Training Guidance" and force "reason"
Every guidance output must include:
- **action**
- **reason** tied to the limiter
- optional constraint mention if Load Change Risk (ACWR) is high

**Bad:** "Proceed with caution"  
**Good:** "Keep today easy because aerobic fatigue is elevated."

---

## Component tree (codebase mapping)

**Main container (Week view):**
- `src/components/context/TrainingContextTab.tsx` — entire Week tab; contains inline cards and imports `ACWRGauge`.

**Current structure (before reframe):**
1. Cockpit strip ("Training Context" header + refresh)
2. Smart Insights (if any) — `SmartInsights`
3. Divider
4. **ACWRGauge** — `src/components/context/ACWRGauge.tsx` (big ACWR card, bar, projected)
5. **Training Stability (7d)** — inline in `TrainingContextTab`: Heart & Lungs, Muscle & Joints, Burnout Risk + coaching copy
6. **The Verdict (Readiness)** — inline in `TrainingContextTab`: % + permission line + server message
7. Training Load Chart — `TrainingLoadChart`
8. Sport Breakdown — `SportBreakdown`
9. On-plan progress — inline in `TrainingContextTab`
10. Week-over-Week — inline
11. Activity Timeline — `ActivityTimeline`

**After reframe (hierarchy):**
1. **Section 1 (new top card):** "Current Training State" — Aerobic Load + Structural Load (status words: Low/Moderate/Elevated fatigue) + one-line limiter. *Replace or absorb current "Training Stability" card; move to top.*
2. **Section 2 (new):** "Why" — small explanatory block with "based on" language for each pillar. *Can be same card, collapsed/expandable, or a second small card.*
3. **Section 3 (demoted):** "Load Change Risk" — small ACWR line (no big bar). *Shrink `ACWRGauge` or replace with minimal inline block in `TrainingContextTab`; remove prominence.*
4. **Section 4:** "Training Guidance" — one or two lines with reason. *Rename "The Verdict" card to "Training Guidance"; keep server message but ensure copy includes reason.*
5. Rest unchanged: Smart Insights, Training Load Chart, Sport Breakdown, On-plan progress, Week-over-Week, Activity Timeline.

**Files to touch:**
- `TrainingContextTab.tsx`: reorder sections; rename labels/copy; add "Current Training State" as Section 1; add "Why" (Section 2); shrink or inline ACWR (Section 3); rename Verdict → Training Guidance (Section 4); add "based on" copy; update cockpit strip to "Current training state" / "Updated from your last 7 days".
- `ACWRGauge.tsx`: either reduce to a minimal "Load Change Risk" display (small badge + label) or move that content into `TrainingContextTab` and remove the big gauge from the top. Remove "burnout"/"systemic"/"Undertrained" from any tooltips/help.

---

## Current JSX render tree (TrainingContextTab) — Section mapping

Simplified structure. **Section 1–4** = new reframe. **Below the fold** = unchanged order after Section 4.

```jsx
<div className="space-y-3 pb-6">
  {/* Cockpit strip — RENAME: "Current training state" / "Updated from your last 7 days" */}
  <div style={{ cockpit strip }} >
    <span>Week</span>
    <span>Training Context</span>   {/* → "Current training state" */}
    <button>Refresh</button>
  </div>

  {data.insights?.length > 0 && <SmartInsights />}
  <div className="instrument-divider" />

  {/* ——— SECTION 3 (demote): currently ACWR Gauge — move down, shrink to one line ——— */}
  <ACWRGauge acwr={data.acwr} />   {/* → Replace with minimal "Load Change Risk" row or inline */}

  {/* ——— SECTION 1 (new top): Current Training State ——— */}
  {/* Currently "Training Stability (7d)" card — REPLACE with new card: */}
  <div className="instrument-card">
    <span>Training Stability (7d)</span>
    {/* Heart & Lungs → Aerobic Load (Low/Moderate/Elevated fatigue) */}
    {/* Muscle & Joints → Structural Load (same tiers) */}
    {/* Burnout Risk → REMOVE from this card; goes to Section 3 */}
    {/* ADD: one-line limiter (deterministic from tier comparison) */}
  </div>

  {/* ——— SECTION 2 (new): Why — small "based on" block ——— */}
  {/* ADD new small card or block: 2–3 bullets per pillar, capped */}

  {/* ——— SECTION 4: Training Guidance (rename Verdict) ——— */}
  {data.weekly_verdict ? (
    <div className="instrument-card">
      <span>The Verdict</span>   {/* → "Training Guidance" */}
      {/* Keep %; ensure message includes reason (action + because...) */}
    </div>
  ) : ( /* empty state */ )}

  {/* ——— BELOW THE FOLD (unchanged order) ——— */}
  <TrainingLoadChart />
  {data.plan_progress && <div className="instrument-card">On-plan progress ...</div>}
  {data.week_comparison && <div className="instrument-card">Week-over-Week ...</div>}
  <SportBreakdown />
  <ActivityTimeline />
</div>
```

**After reframe, target order in file:**
1. Cockpit strip (renamed header/subheader)
2. Smart Insights (if any) + divider
3. **Section 1:** Current Training State (Aerobic Load + Structural Load + limiter line)
4. **Section 2:** Why (small "based on" block)
5. **Section 3:** Load Change Risk (minimal ACWR line; no big bar)
6. **Section 4:** Training Guidance (renamed Verdict; reason required)
7. Training Load Chart
8. On-plan progress
9. Week-over-Week
10. Sport Breakdown
11. Activity Timeline
