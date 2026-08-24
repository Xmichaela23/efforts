# Device findings — the Standing Plan walked on a phone, 2026-08-24

Michael walked the full flow on his phone and exported two built blocks
(`strong-focus (16).md`, `(17).md`). This is the consolidated punch list. Two
terminal sessions: A = engine, B = wizard/screens. Read the pivot doc and the
stage 4/5 notes before either.

## What device testing CONFIRMED WORKING — do not re-litigate

- Test week seeds off baselines exactly per p215 (bench 150 → 115×6 / 130×5 /
  135 max-clean-reps). Two guided sessions, upper then lower.
- Weeks 2–12: 2 upper + 2 lower (ME Mon/Tue, DE Thu/Fri), squat/deadlift ME
  rotation alternating weekly. The frame's shape, correct.
- Hard sessions land per the slot answers; slot answers reach the engine
  (`training_prefs.endurance_slots` visible in the export).
- Muscle floors fire with printed reasons; volume asks are honoured (8 mi ask
  → 28m easy + long session), no silent inflation.
- The endurance-week screen: neutral start, gating, caps, rate line — verified
  at 390px and by Michael on device.

---

## SESSION A — ENGINE

> ## ✅ SESSION A IS DONE (2026-08-24 evening) — **A1, A2, A3 and A4 are all built in the tree.**
> Not pushed, not deployed, not seen on a device. Write-up:
> **`docs/NOTES-session-a-device-fixes-2026-08-24.md`**. Everything below is the ORIGINAL finding,
> kept as written. Three things a reader of this file needs before trusting it:
>
> 1. ⛔ **A2 sat on a defect this file did not know about.** The composer prescribed the top of BOTH
>    of Viada's bands at once — `reps.hi` at `pctOf1RM.hi` — so ME rows read *five reps at 100% of a
>    working number that is already 96% of a predicted max*. The earn rule could never have fired.
>    Michael ruled the slot opens at the **bottom** of the intensity band. **ME and DE weights moved
>    on every block.**
> 2. ⛔ **A3's "three placements" line below is WRONG and was retracted the same evening.** The
>    1/3/6 layout is the **half-marathon frame's (p250)**; this doc conflated it with p246, which
>    places the plyo warm-up on **day 3 alone**, both columns
>    (`SOURCE-viada-hybrid-athlete.md` Part E1a, off `p246.jpg`, verified 2026-08-23). It was built,
>    measured — the week went 9 sessions → 11 and `strength_days` 5 days → 6 — and **reverted**.
>    **What A3 correctly asked for shipped: named drills, no generic row.**
> 3. ⚠️ **B2 cannot be verified as written.** The focus chips reach no standing-plan composer at all,
>    so adding the Core chip is necessary and not sufficient — B2 has to build the wire too.


### A1. The accessory picker's additions never reach the composer ⛔ (the placebo disease, third instance)

Michael added ab and single-leg movements on the accessory screen. The built
plan shows `plank — "Floor: core had nothing else this week"` — the engine
recording it saw NO core from the athlete. The old per-day drop-downs write
Get Stronger's assistance config; the Standing Plan composer reads only focus
chips + its own slots + floors.

**Ruling (standing, 8-21): the picker SURVIVES — athlete picks are honoured.**
Fix: the composer consumes the athlete's accessory picks — a pick fills the
matching HYP/floor slot for that muscle (dedupe against the week; ceilings
still hold). Trace what the picker writes (`assistance picks` /
`state.assistancePicks`) and read it in `compose.ts` where floors run. If a
pick can't be honoured (equipment, ceiling), placement_compromises says so.

### A2. ME sets are frozen at 1 forever — undershoots the source's own dose ⛔

Every ME slot prescribes `1×1-5`, all 12 weeks. Work-order gap #11 ("when
does 1 to 3 sets become 2 or 3") was left unfilled; the cost is now visible:
Part B1 (p84, read off the page) wants **4–6 reps above 90% per pattern per
week** — one set of 1–5 sits at or below that floor permanently. His only
guidance: "start low, go up if progressing well with recovery to spare."

Fix: a deterministic earn rule, numbers OURS and labelled: after N
consecutive ME sessions on a pattern at/above the rep target with the
prescribed stop-short quality (default N=2, from field practice), the slot
gains a second set; cap 3 (his range); a miss or a hold drops it back one.
Wire through the same restater path that already moves weights.

### A3. Plyos are a placeholder, and underdelivered vs the frame ⛔

Built: "Plyometric drills 3×4", Wednesday only. ⛔ **THE NEXT CLAUSE IS RETRACTED — see the box at
the top of this file.** The frame (p246) places plyo
on ~~THREE days — day 1 ×1, day 3 ×2, day 6 ×1~~ **day 3 alone** — and the corpus (Part A4, p227)
names the three drill families (bounding/skip · ground-contact · footspeed)
with the stop-on-quality rule already in the copy.

Fix: ~~(a) restore the frame's placements;~~ **(a) is retracted — the placement was already right.**
(b) prescribe NAMED drills — pick
per-day from the families (bounding family always present for runners;
rotate within family week to week per his variety note), each drill its own
row, "~4 efforts, full rest, stop when crisp" (ours, labelled). No generic
"Plyometric drills" row survives.

### A4. NEEDS MICHAEL'S RULING (open since the placebo find): the hard-slot
session choice (top-end vs sustained vs club) still doesn't reach the
composer — frame decides. Real control (athlete may swap which slot carries
top-end + club replaces) or display-only fact. Session A implements
whichever he rules; club-replaces is already ruled policy (work order §club).

---

## SESSION B — WIZARD / SCREENS

### B1. The schedule screen re-adds a LONG RUN the week doesn't have ⛔

Michael's long slot = RIDE. The schedule screen still asked for (and
recorded) `Long Run: sunday` alongside `Long Ride: saturday`, showed "Pick
one" over an already-defaulted day, and re-asked high-intensity days. The
built week is right (one Sat 2h50 ride, no long run) — the SCREEN is asking
questions the slot screen already answered, and inventing a long run in the
prefs.

Fix: the rows ARE the sessions from the slot screen, one each, sport already
known — only the DAY is asked. No long-run row when the long is a ride; no
OPTIONAL high-intensity row. Day picking is neutral-until-tapped (consistent
with the slot screen ruling); no "Pick one" nag over a default. Preview must
match the slot week exactly. Kill the stale "Long Run" pref write when the
long is a ride. Also remove/replace the "Optimal schedule" overclaim line
(work order flags it; say what is true).

### B2. Core is missing from the focus chips ⛔

Chips offer Arms/Chest/Shoulders/Glutes/Balanced. Core can only enter via
the one-slot floor, so an athlete cannot ask for ab work. Stage 3 carries
core as its own budget. Add the Core chip, wire like the others, verify a
core focus biases the built week.

### B3. Preview truncation hides the very work Michael went looking for ⚠️

The day rows cut at three exercises with "…" — abs/floors are always last,
so they are always the hidden ones. Small fix: show all, or truncate at
more, or bias the visible three to include any athlete-picked movement.

---

## Sequence

A first (the plan people train on), B second (the screens that build it).
Each session: mutation-test new tests, Get Stronger byte-identical, browser
verify for B at 390px, do NOT commit/push/deploy, dated notes, banner.
