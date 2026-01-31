# ACWR / Load Change Risk — Product & UI Rules (Tell Cursor)

## Core decision
We are placing too much emphasis on ACWR. It confuses users and creates contradictions during structured training (marathon prep has cutbacks/tapers by design). ACWR must be treated as a *safety guardrail*, not a narrative about whether the user is training "enough".

## Rename + meaning
- Rename "Burnout Risk" / "Systemic Risk" -> **Load Change Risk**
- ACWR answers ONLY: "Is load ramping too fast vs recent base?"
- ACWR does NOT mean: undertrained, losing fitness, off plan, etc.

## Hard copy rules
1) Delete ALL "Undertrained" language.
   - Remove "Undertrained – losing fitness" and any similar text from legends/tooltips.
   - ACWR < 0.8 must NEVER be framed as a warning or identity label.

2) "Below baseline" must be neutral.
   - Use: **Below baseline** (optional helper: "often normal in recovery/taper/step-back weeks")
   - Never: "losing fitness", "undertraining", "not enough volume"

3) ACWR only becomes prominent when it's risky.
   - If ACWR <= 1.3: show as a small line item (or even collapsed).
   - If ACWR > 1.3: elevate visibility and show a clear ramp warning.

## Deterministic thresholds (same math, different UX)
- < 0.80: **Below baseline** (neutral)
- 0.80–1.30: **In range**
- 1.31–1.50: **Ramping fast** (warning starts)
- > 1.50: **Overreaching** (strong warning)

## Layout change
ACWR must not be the headline card/gauge.
In `TrainingContextTab.tsx`:
- Move ACWR content into a small "Load Change Risk" row under the state + guidance sections.
- Remove/replace the big `ACWRGauge` visualization. If kept, shrink to an inline badge, not a bar.

## Plan-awareness rule (avoid contradictions)
If the screen says "On plan", ACWR < 0.8 must not read negative.
- Preferred: "Below baseline — consistent with planned down-week patterns."
- At minimum: neutral "Below baseline" with no warning tone.

## Implementation targets
- `TrainingContextTab.tsx`: reorder sections so "Current Training State" and "Training Guidance" are primary; ACWR is secondary.
- `ACWRGauge.tsx`: remove "Undertrained – losing fitness" and any negative low-zone copy; convert to minimal row or badge.

---

## If Cursor asks: "Should we hide ACWR completely when it's low?"

**Answer:**
- **Yes, optionally collapse it** behind "Safety checks" unless ACWR > 1.3.
- If it remains visible, it must be a single quiet line, not a chart.

That's the directive.
