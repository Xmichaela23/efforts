# STATE SCREEN — STRUCTURAL DEBT
**Written 2026-08-29, at the end of a long session that changed a lot of this screen's behaviour and
none of its structure. Deliberately SEPARATE from
`WORKORDER-viada-owns-the-engine-2026-08-29.md`, which is about the training programme.**

⛔ **THE BEHAVIOUR IS BETTER AND THE STRUCTURE IS WORSE.** Today the screen gained the endurance
efficiency cards, the per-lift charts and Viada's weekly dose, and lost several invented verdicts.
Every one of those arrived as an ADDITION; the things they replaced were then gated off rather than
deleted. That is how a screen grows by accretion, and Michael named it: *"a bunch of panicking
monkeys building code on top of code."*

## THE MEASUREMENTS

| | |
|---|---|
| `StateTab.tsx` | **2,078 lines** |
| `StatePerformanceSection.tsx` | **1,667 lines** |
| `StrengthReadCards.tsx` | 540 |
| `ViadaWeekCard.tsx` | 128 |
| inline IIFEs in `StateTab` | **8** |

## THE FOUR REAL DEBTS

1. ⛔⛔ **THE PER-LIFT SERIES EXISTS IN THREE PLACES UNDER TWO KEY NAMES, AND ONLY ONE REACHES THE
   CLIENT.** `state_trends_v1.strength.per_lift` (keyed `canonical`, has `series`),
   `state_trends_v1.display.strengthFitness.perLift` (same rows — the ONLY branch the coach forwards),
   and `response_model.strength.per_lift` (keyed `canonical_name`, the verdict row, NO series).
   **This cost four failed fixes in one session**: a key-name correction on the wrong object, a source
   change to an un-forwarded branch, and a stale cached payload, before the charts drew.
   ⛔ **ONE CONTRACT, ONE KEY, ONE READER.** Until that exists every consumer is guessing, and the
   failure mode is silent — an empty map, no chart, no error.

2. **Logic lives inside JSX.** Eight IIFEs in `StateTab`, several hundred lines each. Moving the load
   plate above the trends today required a script that located brace boundaries, because there was no
   component to move. Extract each block into a named component before anything else is reordered.

3. **Rows are gated on other components' data.** `runSpineCovers` makes the RUN row stand down when
   the spine cards cover it — coupling across files to compensate for not deleting the row. The
   STRENGTH row still duplicates the lift cards the same way and has NOT been gated, because it also
   hosts "from your logged sets" and "your best sets". Those two need to become their own component;
   then the row can go.

4. **Two "trends" surfaces.** The efficiency/lift cards are one; `StatePerformanceSection`'s
   per-discipline rows are the other. They answer the same question in two shapes on one screen.

## THE SHAPE IT WANTS

Three blocks, one component each, in this order (already the render order as of today):
1. **Now** — load + ACWR, body, planned vs actual, the week's lifting.
2. **Trends** — one block per sport, owning everything about that sport.
3. **Next**.

## HOW TO DO IT

⚠️ **NOT AS A REWRITE.** Extract components first with NO behaviour change and the fixtures green,
then delete the duplicated rows, then unify the per-lift contract. Each step is separately revertable.
⚠️ **THE COMMENTS ARE THE ASSET, NOT THE NOISE.** This screen's files carry the reasoning behind
rulings that were re-litigated and re-reversed repeatedly (the heavy gate, the fade words, the GAP
thresholds). Carry them across; a silent refactor that drops them will cost the next session the same
hours it cost this one.
