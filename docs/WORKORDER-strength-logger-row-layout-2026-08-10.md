# WORK ORDER — Strength logger: card-per-set → row-per-set (2026-08-10)

**Roles:** architect = Michael; PM = this doc; engineer = terminal, one focused session, **device-verified**.
**Surface:** `src/components/StrengthLogger.tsx` (~4700 lines). Client-only; no edge functions.
**Visual spec (mockup):** https://claude.ai/code/artifact/4c768bb1-7af4-4923-9ab3-5a4462e5ba4c

## The change, in one line

Replace the tall **card-per-set** (big centered reps number, `target`, `last:`, `−1/+1`, `Done/×`, one metric visible at a time) with a compact **row-per-set table** — one line per set, weight and reps side by side, previous inline, a checkmark to complete. Same information, laid across instead of stacked. This is the layout Strong/Hevy use; it's the "feels familiar to lifters" bar Michael set.

## The row (from the mockup)

Per exercise: one container (the warm strength card), a column-label header, then one row per set.

- **Grid:** `Set · Previous · Weight · Reps · ✓` — `grid-template-columns: 24px 88px 1fr 1fr 36px`, gap 10px. Holds 375–430pt (mini → Pro Max).
- **De-boxed numbers:** weight and reps are the bare number with a 1.5px underline (tap to edit) — NOT bordered boxes. The **check is the only boxed element** (it's the action). One container per exercise, not a box inside a box inside a box.
- **Previous** column = the existing `last:` anchor (D-122), inline on every row, tappable to fill.
- **Labels** (`SET / PREVIOUS / LB / REPS`) and previous values at readable brightness (~.78 / ~.9 opacity, not the dim .38 the first pass had).
- **Completed set:** row tints amber, number underlines go amber, check fills amber. Colors from the mockup CSS.
- Keep the header (Start session, Pick planned, date, Source) and the exercise top bar (search, Swap, ×) as they are.

## ⛔ MUST NOT BREAK — the wiring the tall cards carry today

The visuals are the easy half. Every behavior below is live and some feed the athlete's data reads. Preserve each:

1. **RIR — shown/asked/stored ONLY for protocols that call for it.** Gate on `protocolUsesRir(profile)` / the `usesRir` flag (D-162). Accessories under a RIR protocol keep RIR; a **5/3/1 main lift reads its AMRAP top set, not RIR** — never show or store a RIR it doesn't use. **RIR feeds e1RM (compute-facts) and the execution score** — and **auto-filled RIR (Done with no manual entry) must stay flagged and EXCLUDED** from e1RM / RIR-adherence / execution, else the prescription reads back as observed effort (the docblock at the top of the set type is explicit). Keep the D-134 confirm-on-Done RIR selector — just place it in/under the row instead of the card.
2. **AMRAP top set** (open reps, RIR gate accepts 0–3, D-224) — the `amrap` set. The reps field is open, not clamped to target.
3. **Bodyweight rep-max test** (pull-ups, `repMaxTest`, Q-102) — the clean-rep COUNT is the result: no weight, no e1RM, no RIR, 0 valid. Row must render without weight/RIR for these.
4. **Plate math** (`calculatePlates`, the expandable "Plates" readout) — keep, reachable from the row (an affordance on the weight cell).
5. **`target` reps** from the plan's `set_plan` — surface it (a small target hint near reps, or on the previous/label line) without the tall block.
6. **Add / remove set**, **per-set complete** (Done → the checkmark), **Swap**, **per-set pencil edit**, and the keypad fields (`reps | weight | rir | band`).
7. **Session clock** (Start session, D-410) and **mobility mode** (`isMobilitySession`, no clock, `floorMinutes:0`) — untouched.
8. **Draft restore** (D-132 identity-scoped keys) — the row edits must persist/restore exactly as the cards did.

## Verify (device, per Michael)

One real Strong Focus session end-to-end: log the **Deadlift** (5/3/1 main → AMRAP top set, **no RIR**) and a RIR accessory (RIR shown, confirm-on-Done), complete sets, save. Then confirm on State/Performance that **e1RM and execution are unchanged** vs the card layout (RIR auto-fill still excluded). Check a bodyweight rep-max lift renders with no weight/RIR. Screenshot the row layout at a small width. Report PUSHED / DEPLOYED (client) / VERIFIED separately.

## Not in scope

Set-type tagging menu (warmup/drop-set) — parked; the engine already knows warmup ramp vs AMRAP from `set_plan`. Rest-timer auto-popup and swipe-to-delete — later. This order is the layout + preserving what's wired, nothing new.
