# Work order — sets are earned on every row, not only the heavy lift (2026-09-25)

Michael, 2026-09-25: "we need to turn the dials a bit because it's not like our customer is reading the
book." Today only the ME slot climbs its set range (`standing-plan/progression.ts` `meLadderStep`,
`meSetsFromHistory`, `ME_SET_LADDER_IS_OURS`; read by `rematerialize-standing-block` → `earnedMeSets` →
`composeBlock({ meSetsByPattern })` → `setsFor(band, position)` in `strength-grid/intents.ts`). HYP,
DE and SKILL rows sit at the low end of their p218 bands forever unless a muscle chip (`dialSlot`)
lifts HYP to four.

## The rule (the same ladder, on every row with a set band)

- Bands are p218's: ME 1–3, DE 4–6, SKILL 3–5, HYP 3–4. Start at the low end (p218: "sets should
  always remain on the lower end when starting a program").
- **Earn:** two logged sessions in a row on the same movement where every logged set is within one rep
  of the band's top with the row's reserve on target → +1 set, capped at the band top. (p245's
  two-in-a-row bar, `STALL_CONFIRMATIONS` / `ME_CLEAN_SESSIONS_TO_EARN`; "within one rep of the top" =
  `ME_CLEAN_REPS_WITHIN_TOP`, Michael 2026-08-24.)
- **Setback:** a logged session with any set under the band's floor → −1 set, floored at the band
  bottom. Mid-band holds and resets the run. No evidence holds (never zero) — pivot §4, as
  `meLadderStep` already does.
- Reserve on target: for HYP 0–2, DE/SKILL 3–4 (p218's bands via `rirTargetFor` in
  `strength-grid/intents.ts`); a set logged with reserve above the band's top (too easy) still counts
  as clean on reps; a set logged at 0 reserve inside a 0–2 band is clean. Do not invent a reserve rule
  beyond "inside the band".
- Keyed by **movement** (canonical name via `canonicalize`), not by slot: accessories rotate and swap,
  and the athlete's history is on the movement. A swapped-in movement starts at the low end.
- The muscle chip's fourth HYP set (`dialSlot`) stays as the FLOOR for that muscle: earned sets never go
  below what the chip set, and the chip never goes above the band.
- The earned count reaches the remaining unstarted weeks on the next rebuild, the same path the ME
  ladder rides (`rematerialize-standing-block` — read `earnedMeSets`, extend it, do not add a second
  reader). The live week keeps its count.

## What the athlete sees

1. The row has one more (or one fewer) set. That is the main signal (RP Hypertrophy shows a set change
   the same way — the row changes, nothing announces it).
2. One line on the session card, only in the week the count changed, then gone. Approved words
   (Michael, 2026-09-25):
   - up: **"Sets went from 3 to 4. Two sessions at the top of the range earned it."** (numbers from the
     row's old and new count)
   - down: **"Sets went from 4 to 3. Last session came in under the range."**
   The line rides on the row from the server (`computed`/`step_lines` style, like the ME earned line if
   one exists — check `_shared/planned-narrative.ts` / the State strength row's earned-set readout and
   reuse its transport; never the phone deriving it).
3. The block description gets one paragraph, approved words (Michael, 2026-09-25):
   **"Sets start at the low end. The heavy lift begins at one set and can reach three; the rest begin at
   three sets and can reach four. A set is added after two sessions in a row at the top of the rep
   range, and taken away after a session under it. The week's rows show the current count."**
   ⚠️ "the rest begin at three sets and can reach four" is true of HYP and SKILL's floor; DE starts at
   four and can reach six. Print the paragraph as approved; do not edit it. Report the mismatch so the
   PM can offer Michael a one-word fix.
4. The State strength row's set readout (it shows the heavy lift's earned count today) shows the
   accessories' counts the same way if it lists them; otherwise leave it and say so.

## Rules
- No new number. Every threshold above already exists and is cited; the extension to the other three
  intents is OURS — one ledger row in `docs/STATE-SOURCES.md` naming the reuse.
- Never reference Wendler or 5/3/1. Copy exactly as approved above, nothing else new on screen.
- Runs and rides untouched. The ME ladder's behaviour byte-identical (its tests must not change).
- Bump `PLAN_WRITER_VERSION` 31 → 32 with a note.
- Do not commit.

## Verify
- Fixtures per intent: HYP 3→4 after two clean sessions, holds mid-band, drops 4→3 on a floor miss,
  never below 3, never above 4; DE 4→5→6; SKILL 3→4→5; the chip floor holds; a swapped movement starts
  low; no-evidence holds. Three back-to-back runs.
- A composed All Rounder block with a synthetic 6-week log on the minimum kit: the rows in weeks 7–12
  carry the earned counts; the live week does not change; the card line appears once.
- ME ladder tests unchanged and green. builder-answers-sweep once. Standing-plan, strength-grid,
  logger suites once.

## Report
Files changed; the ladder's inputs per intent; where the card line is produced and which weeks carry
it; the State readout answer; the block-description mismatch noted above; test counts; anything that
did not survive.
