# SLICE b — Auto-recalibrate the training max (reset down / bump up), announced and undoable (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
**Rewrites and replaces `SLICE-strength-max-calibration-4b.md`** — that doc was consent-first ("offer,
wait for a tap"). We changed the model to **auto-apply + announce + undo**, matching the field. Delete
the 4b file when this ships.
Terminal, one stage. Ships behind deno fixtures (Constitution Law 6). **Depends on slice a shipping
first** (it reads slice a's reset/climb engine). Ground in the book; cite pages.

## The goal, in one line
When a lift stalls (repeated miss → reset 10% down) or clearly outgrows its number (reps beat target →
bump up), the app **applies the change automatically**, tells the athlete plainly what it did and why,
and leaves a one-tap **undo** — never a silent write, never an up-front decision gate.

## Why this shape (verified 2026-08-12 — field practice, not memory)
- **Auto is the norm for apps that adjust at all.** StrongLifts auto-deloads 10% on three consecutive
  fails; Juggernaut AI auto-recalculates the training max off the week-3 AMRAP "without requiring
  manual input"; Fitbod auto-sets weight up/down each session; Hevy Trainer (Feb 2026) auto-adjusts
  working weights. The pure trackers (Strong, base Hevy) are the only manual ones — they log and
  celebrate PRs and make you bump the weight yourself. **No major app uses an up-front pick-an-option
  gate.** Sources: support.stronglifts.com, powerliftingtechnique.com (Juggernaut), fitbod.me,
  sensai.fit (Hevy).
- **Both directions auto, including the up-bump.** The up moves the *training max* — a submax number
  you work at 85–95% of, which the next cycle's AMRAP immediately re-tests and would reset back down if
  too high. It is not a max attempt, so the injury asymmetry that would justify a confirm is
  neutralized in practice. Bounded further by a conservative increment + the trusted-rep ceiling
  (D-417) + undo. Michael's call 2026-08-12: match the field, both auto-with-undo.
- **This is NOT the silent auto-progression we deleted.** That was pulled because it was *silent*
  ("the athlete opened the logger to a number they never agreed to" — `adapt-plan`, CLAUDE.md). Every
  app above is auto **and announced and reversible**. The difference is announcement + undo +
  pattern-gating, not consent-per-change.

## What the book says (cite)
- **p31** — reset 10% on a stall, per lift; multiple stalls → deload week + recalculate all.
- **p33** — one bad day is not a stall (pattern-gated, inherited from slice a).
- **p10 / p32** — the AMRAP is a rep record and the estimated-max test (Epley, D-339/D-337); a big set
  is celebrated (logger, already built) and is the evidence for the up-bump — bounded by D-417 so a
  25-rep set does not mint a huge jump.

## Existing infra — TRACE before building (do not rebuild)
- **The write + re-layout path exists.** `rematerialize-strength-block` rewrites the block from a new
  training max; `adapt-plan` `suggest` path (`strength_progression` / `strength_deload`) + the State
  strength-row adjust modal already write a new weight **on tap** and carry `plans.config.training_max`.
  Convert this from tap-to-apply to **auto-apply + undo**; reuse the same write.
- **The signal wire exists** — `plans.config.strength_calibration` (D-421, re-scoped by slice a).
  Repopulate it from slice a's reset/bump events instead of the retired ceiling pin.
- **The rep evidence exists** — `strength_facts.amrap_reps` / `.measured`, `exercise_log`,
  `amrapRepsForLift` (`cycle-verdicts.ts`), per-lift `estimated_1rm` (`compute-facts:967`).
- **The logger celebration exists** — `strength-row-text.ts` rep-PR badge. Leave it; logger only
  celebrates.

## The work
1. **Auto-apply, both directions, pattern-gated (from slice a):**
   - **Down (reset):** on slice a's confirmed stall, auto-write the −10% reset and re-lay out the rest
     of the block (`rematerialize-strength-block`).
   - **Up (bump):** when top-set reps clearly beat the target across the confirming window, auto-write
     a **conservative** training-max increase (Juggernaut-style: more reps over target → larger step,
     but capped), bounded by the trusted-rep ceiling (D-417) — never a precise max minted off a
     high-rep set. Re-lay out.
   - Neither fires on a single session (inherited p33 gate).
2. **Announce + undo (State is the actor; three roles, one signal):**
   - **Logger** — unchanged, celebration only. No decision mid-workout.
   - **State** — the plain, reversible line at the event, e.g.
     - *"Overhead press — the top set came up short two cycles running, so it reset 10% and is building
       back from X. That's the 5/3/1 reset; a run of good cycles usually comes right before it."*
     - *"Overhead press — you're clearing the top-set target by a lot, so it moved up to X on your rep
       test."*
     - Each carries **Undo** (restores the prior training max + re-lays out).
   - **Performance** — a courtesy echo of the same line, routing to the same undo. Not a second nudge.
3. **Ambient per-lift status on the strength row:** a calm state per lift — *climbing* vs *just reset*
   — always visible, so the event confirms what the row already showed rather than dropping out of
   nowhere. This is what the removed cap never gave the athlete (the original bug: a number that
   silently stopped moving with nothing on screen).

## Copy voice (enforce as templates, not vibes — `docs/COPY-VOICE.md`, D-319)
- Fact first, then what the program did, then that it is expected. **No imperative, no "you failed,"
  no cheerleading, no emojis.** Every line traces to p30/p31/p33.
- **Own voice — do NOT borrow other apps' wording.** Ground the lines in the book and our copy voice
  (`docs/COPY-VOICE.md`, D-319). No franken-copy stitched from StrongLifts/Juggernaut phrasing.

## Fixtures (Law 6 — permanent regressions)
- Confirmed stall → training max auto-writes −10%, block re-laid out; **undo restores the prior max.**
- Reps beat target across the window → auto-bump, **bounded by the trusted-rep ceiling**; undo restores.
- Single miss → **no write** (p33).
- On-target → no write either way.
- Logger unchanged (celebration only); no write happens mid-workout.
- **≥3 back-to-back recomputes** all clean for any LLM/stochastic copy path touched (never one green run).

## Do NOT touch
- Slice a's engine (the climb + reset live there; b only writes + announces).
- The e1RM formula (D-339), trusted-rep ceiling (D-417), overload verdict (D-418), record/PR display
  (D-420), the logger celebration.

## Supersede on ship
- Delete `SLICE-strength-max-calibration-4b.md` (this replaces it).
- Fold D-421's remainder in; back-annotate the deleted-auto-progression note (`adapt-plan`) — the
  distinction is silent vs announced+undoable.

## Deploy targets (after Michael's push/deploy go)
`adapt-plan`, `rematerialize-strength-block`, `generate-strength-plan`, the State client surface, the
Performance surface (every importer of the shared strength-system + the two screens).

## Acceptance
Rebuild a spine + payload: a synthetic stall auto-resets and shows the reversible State line, undo
restores; a reps-over-target case auto-bumps within the trusted-rep bound, undo restores; a single
miss writes nothing; the logger still only celebrates. Device pass with Michael. Fold into a D-NNN,
delete this file.
