# Decisions Log — Part 4 (D-471 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 → D-427** | [`DECISIONS-LOG-2.md`](DECISIONS-LOG-2.md) | frozen 2026-08-13, **still authoritative** |
| **D-428 → D-470** | [`DECISIONS-LOG-3.md`](DECISIONS-LOG-3.md) | frozen 2026-09-12 at the ~150 KB cap, **still authoritative** |
| **D-471 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every frozen entry is as binding as the ones here. Grep with a
glob: `docs/DECISIONS-LOG*.md`.

---

## D-471 — Every hard endurance session is the page's own shape at its level, and the ride caps are the book's (2026-09-11)

**The call.** The library stopped generating hard sessions from archetype rules and now prints the
shapes the book prints, per level (`printedIntervalsByLevel`, `repSecondsByLevel` in
`_shared/endurance-library/source-rules.ts`). Easy ride caps at 120 min (p108) and the long ride at
210 min (p239 level 2); run caps stay 90 easy and 100 long.

**Why.** Checked against the p231–p239 photographs, 8 of 28 hard workouts matched what the app built.
The rest were the app's own arithmetic wearing the book's labels. The fix was not to tune the
arithmetic; it was to stop deriving what the source states.

**Rejected.** Keeping the derivation and correcting the outliers — that leaves the next drift
undetectable. Also rejected: a 300-minute ride ceiling, which had no page behind it.

**Tradeoff.** Goldens moved (easy ride 175 → 100) and were regenerated deliberately.

---

## D-472 — ME rows keep the competition lifts; p220's secondaries are a swap in the logger (2026-09-11)

**The call.** The maximum-effort rows on the All Rounder still prescribe the competition lift. p220's
secondary variants are offered as a **swap list on the row in the logger** (`swap_options`,
`SECONDARY_BY_PATTERN`), not as the default and not as a wizard question.

**Why.** Michael, weighing the two: *"we offer both, with a caveat"*, then *"keep the compounds for
now, add the secondaries in swap in the logger… for ME"*. The secondaries are more complex movements
and each one an athlete adopts is another e1RM to carry and retest.

**Rejected.** Opening the ME rows onto the secondaries by default — built, then reverted the same day.
Also rejected: asking in the wizard, which makes a recovery-week choice into an intake decision.

---

## D-473 — A pairing the frame itself prints is not a conflict (2026-09-12)

**The call.** `week-conflicts.ts` no longer reports `hard_with_heavy_legs` when the FRAME COLUMN puts a
hard endurance slot on a heavy lower day. A pairing the athlete's own pins created still speaks.

**Why.** p274 prints the anaerobic ride on the All Rounder's heavy hinge day. The builder was therefore
warning about its own programme on every week of every golden — Michael: *"this warning shouldn't be
there, it's our program note for note."* A plan that warns about the page teaches the athlete to ignore
the warnings that matter.

**Tradeoff.** The rule now needs the frame day, so it turns the weekday back through the block's
rotation. If a frame ever gains a lower day with no printed endurance, nothing changes.

---

## D-474 — A finished build lands on Today, and Today says when the plan starts (2026-09-12)

**The call.** The intake's completion routes to Today rather than to the new plan's weekly planner.
`plan-overview` sends `starts_on` (week one's Monday) and `has_started` on every listed plan, and Today
prints "Your plan starts <weekday, month day>." in the slot a session would occupy until then.

**Why.** Michael: *"when your plan lands it puts you on the weekly planner, maybe it should land on
today with a note that says your plan starts when it starts."* The wizard defaults the start to next
Monday, so the common case is a build whose first session is days away, and the planner is the wrong
first thing to meet.

**Note.** `resolvePlanWeekIndex` clamps a pre-start date to week 1, so it cannot answer "has it
started". `planHasStarted` already existed for that and is what the new field reads.

---

## D-475 — Home is one lit screen: the ground carries the light, the cards are neutral instruments, and nothing is outlined (2026-09-12)

**The call.** Home's panel has its own light source (a wide, shapeless, white-cored glow behind the
session column). Every card on the screen — both session cards, the swipe deck, the completed card, the
load card and the past-day fallback row — wears one shared bed
(`galaxy-card readout-texture readout-texture--home`). No card carries a sport-coloured outline; the
sport lives in the title and in the glow the card throws on the floor.

**⛔ THE FINDING THAT COST THE MOST, RECORDED SO IT IS NOT REPEATED.** An afternoon of lighting changes
moved nothing on the session cards, because the cards are not drawn by `TodaysEffort.tsx` at all. They
come from `TodaySession` in `SessionDeck.tsx`, styled by `deckGlass` in `CardDeck.tsx`, whose background
was `rgba(19,21,27,0.90) → rgba(11,12,16,0.96)` — effectively opaque black painted over every change.
The load card was the only card on the screen that did **not** come through there, which is exactly why
it was the only one that ever looked different. The block in `TodaysEffort.tsx` that looks like the
session card is the **fallback row** for a past-day or skipped session, and its own comment says so.

**Why the cards are neutral.** Tinting each bed with its own sport hue while the ground is a strong warm
wash puts two opposite temperatures on one screen; every card went muddy (olive under the run, brown
under the lift). One channel per job: ground = light, card = neutral surface, colour = title and edge.

**Why no outline.** Michael: *"maybe it's no outline like state."* A drawn line in the sport colour makes
a card read as a tagged badge. Lead-versus-quiet moved off the border onto level, so the first session
still reads first.

**Why the floor was calmed afterwards.** The remaining heaviness was the VALUE GAP between a blazing
floor and a dark bed, not the cards. Lightening the bed had already cost legibility twice, so the peak
of the glow was halved and spread wide instead.

**Tradeoff.** The daylight is more subtle than the brightest version. If it needs to come back, put it in
the margins rather than across the whole field.

---

## D-476 — "Keep it easy" is gated on the VT1 band (2026-09-12)

**The call.** Today's spacing line says "Lift first and keep the <sport> easy" only when the endurance
session's `band:` tag is `vt1_or_easier`. Every other band reads "Lift first." A lift with no skill and
no speed sets, beside a session that is not VT1, draws no chevron at all.

**Why.** p144's rule 5 is about work that benefits from pre-fatigue and names VT1-intensity endurance as
that work. On screen the line was telling Michael to keep easy a run the same screen had just prescribed
hard at 48 minutes.

**> Supersedes** the 2026-09-10 ruling recorded in `today-lines.ts` that *"the band no longer picks a
branch"* — **for the first sentence only**. The ORDER sentence still reads the same on every band,
because p145 rule 6 and p77 are about the lift's own freshness and say nothing about the other session.
