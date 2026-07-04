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

## Open for Michael
- Confirm the anchor wording (`none / moderate / extremely sore`) and the helper prompt.
- Confirm skippable (recommended) vs required.
- Confirm whether the daily readiness check-in's soreness slider should *also* move to the 7-chip control for consistency (it's the same scale now).
