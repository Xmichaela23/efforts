# Post-completion soreness input — UI spec (SPEC ONLY, held for Michael's review)

**Status:** design, not built. Backend (D-234) is shipped; this is the client surface that feeds it.
**Scope:** all discipline post-completion popups (run, ride, swim, strength). One shared component.

---

## What it is
A one-tap **muscle-soreness** capture shown when a workout is marked complete, on the **Hooper 1–7** scale (D-234). It writes the **per-workout** soreness that feeds the cards' cross-domain carryover — distinct from the daily readiness check-in.

## The control — a 7-chip row
A single horizontal row of 7 tappable chips, `1 … 7`, one tap to select (no confirm step — the tap *is* the log). Anchored labels under **1, 4, 7 only** to keep the row clean:

```
   ○   ○   ○   ○   ○   ○   ○
   1               4               7
 none          moderate      extremely sore
```

- Chips 2, 3, 5, 6 show the number only (no label) — the anchors imply the gradient.
- Selected chip fills; the row stays visible so it can be changed before dismiss.
- **Optional / skippable** — soreness is not required to save the workout (compliance > completeness; a forced field kills the popup). No default selection (an unset value writes null, not a 1).
- One line of helper text above: *"How sore are your muscles right now?"*

## Where it writes
- **Field:** `workouts.workout_metadata.readiness.soreness` (integer 1–7), on the just-completed workout. **No new column** — this generalizes the existing strength per-workout readiness field to all disciplines.
- **Not** `readiness_checkins` — that is the *daily* whole-body check-in, a separate signal (see topology below).
- Value domain enforced client-side to 1–7 (never write 0 or 8–10).

## Two-field topology (D-234 — the documented distinction)
| Field | Grain | Captured by | Feeds |
|---|---|---|---|
| `readiness_checkins.soreness` | **Daily** (one/day) | daily readiness check-in UI | coach LEGS SORE, compute-snapshot |
| `workout_metadata.readiness.soreness` | **Per-workout** | **this popup** (all disciplines) | the cards' cross-domain carryover |

They answer different questions — *"how sore am I today"* vs *"how did this session leave me"* — so both exist by design.

## Strength-logger reconciliation (the "don't confuse it" item)
The strength logger already has a check-in dropdown that writes **both** the per-workout blob and a daily `readiness_checkins` upsert. Two required changes so it doesn't fork:
1. Its soreness dropdown must switch **1–10 → 1–7** (same Hooper anchors) — otherwise it writes legacy-scale values post-migration.
2. Prefer converging its per-workout soreness onto this same shared 7-chip component so strength and the other disciplines capture soreness identically.

## Provenance (why the timing is safe)
This popup fires **after** the session. The carryover read (`resolveCarriedInSoreness`, D-234) enforces a **before-session guard**: a workout's own post-completion soreness can never trigger *its own* carryover card — only soreness carried in from prior sessions counts. So logging "sore" after today's ride correctly influences *tomorrow's* card, never today's. No client action needed; the guard is server-side.

## Coordination / sequencing
Ship this client scale-switch **with** the D-234 migration (`supabase db push`) so there's no window where the client writes 1–10 into a rescaled 1–7 world. Until both land, the server's `>7` scale-guard catches 8–10 leaks (1–7-range legacy values are low-impact given sparse logging).

## Sibling controls — the readiness check-in (D-235)
The same 7-chip component is reused for the **subjective** wellness items; **sleep is the exception**:
- **Energy** → 7-chip row, anchors **1 low · 4 moderate · 7 high** (now Hooper 1–7, was a 1–10 slider).
- **Soreness** → 7-chip row, anchors **1 none · 4 moderate · 7 extremely sore**.
- **Sleep** → **stays an hours slider** (`0–12h, step 0.5`, shown "Xh") — objective measure, NOT a 1–7 rating (D-235). Do not convert it to chips.

`StrengthLogger.tsx` sliders must switch with this: energy `max=10`→`max=7`, soreness `min=0 max=10`→`min=1 max=7`; sleep unchanged.

## Mobile ergonomics (verify at Capacitor viewport before build)
- **Tap targets ≥44px** (Apple HIG minimum). Seven chips across the smallest supported width (~320–360px CSS px inside the WKWebView) leaves ~40–46px per chip after gaps — **borderline**. Verify on-device/simulator at the Capacitor width before committing to a single row.
- **One-thumb reachable** — the row sits in the lower half of the completion sheet, within thumb arc; no reach to the top edge.
- **Fallback layouts if seven chips are cramped** (propose in spec, do NOT build until Michael picks):
  - **(A) Segmented bar** — a single 1–7 track split into 7 equal hit-zones (full-width tap targets, no inter-chip gaps) with anchor labels under 1/4/7. Recommended fallback — maximizes target size.
  - **(B) 4+3 two-row wrap** — chips 1–4 then 5–7; keeps circular chips but doubles height.
  - **(C) Stepper** — `−  [n]  +` with the anchor scale shown; smallest footprint, but two taps to reach extremes (worse compliance).
- Selected state must be legible in both themes; the numeric value echoes above the control (as the current sliders do).

## Open for Michael
- Confirm the anchor wording (`none / moderate / extremely sore`) and the helper prompt.
- Confirm skippable (recommended) vs required.
- Confirm whether the daily readiness check-in's soreness slider should *also* move to the 7-chip control for consistency (it's the same scale now).
