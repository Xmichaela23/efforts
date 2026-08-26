# WORK ORDER — reps carry the progression

**2026-08-26.** Decided by Michael in the planning chat. Read
`docs/SOURCE-viada-hybrid-athlete.md` Parts A1, E1c and H before starting.

## STATE — three ways

| | |
|---|---|
| **pushed** | NO |
| **deployed** | NO |
| **verified on a device** | NO |

---

## The problem, in one paragraph

Viada's rate anchor is 1% every three weeks applied to the calculated 1RM (p247). A percentage
cannot be expressed on a bar below roughly 250 lb with 5 lb rounding. On a 170 bench the prescribed
heavy set is 145 and moves once in twelve weeks; on a 100 lb press it is 85 and moves once, at a
week decided by where the unrounded number happens to sit against the rounding line. The overload
has to live somewhere with finer resolution than a plate. One rep is worth about 3% — finer than a
5 lb jump on a light bar, which is 6%.

## The ruling

**Reps carry the progression. The 1% stays underneath as a floor.** RIR is not part of the
mechanism — a rep count is completed work, a reserve estimate is a guess about a rep that was not
performed, and it is least reliable in the athletes this is for.

---

## BUILD

1. **The rep stepper stops being bounded in either direction.** An athlete who gets 6 logs 6; one who
   fails the lift logs 0. This is the signal the whole mechanism reads, and the same fix serves both
   ends. Three states result, with no new UI concept:
   - logged with 1+ reps — completed
   - logged with 0 — attempted and failed
   - not logged — silence, already treated as no evidence

2. **Wire the progression that already exists.** Finish the range (or beat it) two sessions running
   → the bar takes one increment. `progressionVerdict` (`_shared/standing-plan/progression.ts:174`),
   `advanceStep` (:209), `STEP_UPPER_LB` / `STEP_LOWER_LB` (:206-207) and `STALL_CONFIRMATIONS = 2`
   are written, tested, and called by nothing outside their own tests.

   ⛔ **`STALL_BACKOFF = 0.10` does not ship. See the back-off ruling below.**

3. **A bar jump resets reps to the bottom of the range.** 5 reps at 85 and 3 reps at 90 are the same
   effort — the reset is what absorbs a 6% plate jump on a light bar.

4. **`scheduledRise` stays.** It is the floor, not the mechanism. When nobody earns anything, his 1%
   still moves the bar. Do not delete it — it is the one progression figure p247 actually states.

5. **Logger autofill.** Weight prefilled from the prescription. Reps prefilled with *what they did
   last time*, plus/minus to adjust. ⛔ Never prefill reps at the range top — everyone would tap
   through at the top and advance on a phantom. Prefilling last time's number makes the lazy path
   the honest one.

6. **The plan row shows last time's result.** `compose.ts:942` prints `${lo}-${hi}` and nothing else,
   so a block that is working correctly looks frozen for eight weeks. Show what they got.

7. **Rebuild the remaining weeks when a jump is earned early.** `rematerialize-standing-block`
   already reads logged history through the current week for the earned-sets ladder (`earnedMeSets`,
   `me-history.ts:80`). Same path, extended to the bar.

## NOT BUILDING

The plate/increment question (the field exists at `compose.ts:349` and stays unwired — the 5/10
default assumes a pair of 2.5s, which nearly everyone has). RIR prompts. Beginner/intermediate
tiers. Microplates. Back-off sets. Locked or climbing rep targets.

## COPY

On the row, constraint first: **"1–5 reps, stopped short of failure. If you get more than 5, log it."**

⛔ **HEAVY SETS ONLY.** The other three intents already print a reserve number — DE and SKILL 3-4,
HYP 0-2 — and a number says it better than a sentence. ME is the only intent Viada gives no number,
which is exactly why it is the one that needs the words. Do not put this line on the other three.

⛔ Do not write anything about extra reps moving the weight up sooner. True, but it turns the set
into a rep chase, which is the one thing p219 forbids on this slot.

"Stopped short of failure" is his own wording (p219). Note that he defines 0 reps in reserve as
**not** failure — the last rep still completes, slowly — so the band is wider than it sounds.

---

## THE BACK-OFF RULING (raised and settled 2026-08-26)

`progressionVerdict` returns `back_off` when a logged set falls below `repRange.lo`. On a heavy slot
that is `reps < 1` — unreachable for any set that was logged. The 10% back-off could never fire.

⛔ **It is not being fixed. It is being replaced.**

**A rep drop inside the band is not a stall.** 4 reps then 3 then 3, at the same weight, inside a 1–5
range, is normal variance — Tuesday's heavy lower work sits behind Monday's run, which is the entire
reason the haircut exists. A signal that fires inside the acceptable range contradicts the range.

**And the percentage back-off is a Wendler necessity, not a Viada one.** Wendler's training max
climbs every cycle whether or not the athlete keeps up, so they can get ahead of themselves and have
to be pulled back. Here the bar only moves when it is earned, so nobody can outrun it. There is
nothing to back off from.

**What ships instead: undo the jump.** An athlete who earned an increment and cannot hold it returns
to the weight they were holding before it. Proportional by construction, no percentage to choose,
self-correcting. If they never earned a jump they are on the 1% floor and nothing happens — correct.

**Trigger it on a real signal, not a wobble:** a failed set (0 reps), or a sustained decline across
three sessions. Not a one-rep swing.

## CONSTRAINTS

- ⛔ `standing-plan-me-sets.test.ts` forbids any row carrying `reps.hi` at `pct.hi`. Do not weaken or
  delete it. The slot prescribes the LOW end of the intensity band (Michael's ruling 2026-08-24) —
  90% of the working number, rep target open.
- The working number is 96% of a predicted max (p215) and is NOT Wendler's training max. No function
  may accept both.
- deno is at `~/.deno/bin/deno`, not on PATH:
  `~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/ src/` — 4,445 passing at
  handoff.
- `tsc --noEmit -p tsconfig.json` checks ZERO files. The real command is `-p tsconfig.app.json`, and
  the honest baseline is 316 pre-existing errors.
