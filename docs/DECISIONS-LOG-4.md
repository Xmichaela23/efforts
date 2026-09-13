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


---

## D-477 — Today and the Performance panels wear State's bed, literally; one sun above the cards (2026-09-12)

**The call.** Every card on Today (`CardDeck.tsx deckGlass`) and every panel on Performance
(`UnifiedWorkoutView.tsx getCardClass / getCardStyle`) uses State's exact bed: `galaxy-card readout-texture
readout-texture--spectral` with `readoutPlateStyle(undefined, { galaxy: true })`. The `--home` and `--sport`
texture variants are deleted. Performance's grid runs at 0.35 (`--quiet`). Home's light is one radial sun
above the cards (`TodaysEffort.tsx`, screen-blended, blurred, core at `170px 96px at 50% 20%`, top −16px so
it never straddles the panel clip); the wash across the field is gone.

**Why.** Michael: the Home daylight read as *"coming from outer space … washed out"*; then, holding State
beside it: *"I just really like how the cards look in the state screen … more premium, subtle depth,
texture."* One bed for the whole app is the continuity rule applied to surfaces; the screen-blend wash over
translucent cards was what muddied them.

**> Supersedes D-475's lighting**, not its finding. D-475's rule that the cards are drawn by `SessionDeck` /
`CardDeck` and not `TodaysEffort` still stands and is why this pass landed on the right element first time.
D-475's "halved and spread wide" glow is replaced by the sun; its neutral-bed principle survives as the
shared bed.

**Also on Today, same day.** The status rows moved inside the sticky header card under the weather
("shorter, not narrower" — a first pass narrowed it and was reverted); swipe anywhere on the scroll
container to slide between days (60 px commit or a flick, 8 px axis lock, `[data-deck]` excluded so the
session deck keeps its own swipe); the floating + is the existing `LogFAB`, pinned `position:fixed` above
the tab bar (`bottom: calc(var(--tabbar-h) + safe-area + 12px)`) — an absolute + inside the scroll panel
sat below the fold and "was not showing".

---

## D-478 — The Performance screen: State's sectioned grammar, one header formula for run, ride and lift (2026-09-12)

**The call.** Every sport's Performance tab is one bed cut into sections (`px-3 py-3`, divided by
`border-t border-white/[0.055]`), a section label of 11 px uppercase tracking 0.12em, and readings as
State's rows — 11 px lowercase label, 13 px value (`SessionNarrative.tsx Reading`). The header line reads
`16.4 MI · 59:55 [· 72°F] [· Indoor]`. The date row carries Share, and Strava only for a lift when
auto-share is off (`users.preferences.strava_auto_share_strength`); a lift's second header row is the plan
line, as a ride's is. Recompute is gone as a standing button; a failed analysis shows "Try again".
Removed lines: "Heart rate at easy power" (no book page puts it first), "No all-out set" (a lift with no
AMRAP said so on every visit). The lift compare table is one section per lift, its intent printed as the
book's word — Maximal effort · Dynamic effort · Hypertrophy · Skill (`_shared/session-detail/strength-slots.ts:45
SLOT_INTENT_WORD`, p218 spelled out; the ME / DE / SKILL / HYP abbreviations of D-465 are display history).

**Why.** Michael: *"a lot of dead space up top … an issue across all sports"*; *"the whole top section
just feels messy … doesn't feel like a presentation"*; *"run and ride are fine so [a lift] should just
follow the same formula"*; *"get it in line with state and today."* Recompute was *"helpful for dev, not
sure it's necessary for users."*

---

## D-479 — One drift rule: steady runs and rides only, the ride's ratio before heart rate alone, every reader the same function (2026-09-12)

**The call.** `_shared/session-detail/drift-pct.ts` is THE rule. `isIntervalSession` (more than two planned
steps, a 75 s pace spread across five or more segments, or rendered rows with recoveries between work — the
D-372 structural test, moved here from `build.ts`) gates everything: an interval run or ride has **no
drift** — null, not a labelled number. Then: the run analyser's decoupling (`heart_rate_summary.decouplingPct`,
basis gap/raw); else a ride's power-to-heart-rate ratio (`computed.analysis.efficiency.aerobic_decoupling_pct`,
basis power — TrainingPeaks' Pw:Hr, the number State's spine already read); else `hr_drift_v1` (basis hr).
Readers: the Drift tile and the heart-rate line (`build.ts:851`), Today's boom line
(`session-boom/line.ts:149`, whose prior-row select now carries `total_steps` and the ride ratio), and the
fact-packet flags (`flags.ts:74` — no HR-drift flag on an interval session). The cycling analyser's
"Cardiac drift" insight is deleted; `_shared/ride-halves-steady.ts` (the OURS 10 % halves-power gate) is
deleted with no importers left. Interval sessions print no heart-rate line and no HR-category flag on
Performance.

**Why.** Michael read the same ride's drift as one number on State and another on Performance: *"so not a
single source of truth."* Traced: the cycling analyser never writes `decouplingPct`, so the builder fell to
heart rate alone while State read the ratio. Then: *"drift should really only be mentioned in steady state
rides and runs, I would confirm that with the book."* p107 (read this session): cardiac drift is *"a general
guideline when assessing the maximum recommended dose of easy/VT1 work in a given session"* — a pace or
output at a heart rate. An interval session has no such pace, so it has no drift. And the boom line was a
third copy: *"we need consistent rules across all screens."*

**> Reverses D-465's "drift, one definition, never withheld"** (`DECISIONS-LOG-3.md`) on the "never withheld"
half. The one-definition half is kept and made literal: one function, not one precedence copied by hand.
`compute-snapshot driftReadForPoint` still carries the precedence by hand for State's trend; it does not
import the file.

**Deploy set for a change to `drift-pct.ts`** (transitive import graph, 2026-09-13): `analyze-running-workout`,
`compute-session-boom`, `workout-detail` — and `analyze-cycling-workout` only because its own "Cardiac drift"
insight was deleted in the same commit. ⚠️ The cycling analyser does **not** reach `drift-pct.ts`: it carries
its own `_shared/cycling-v1/flags.ts`, and `fact-packet/flags.ts` (the HR-drift-flag gate) is imported only by
`fact-packet/build.ts`, which only `analyze-running-workout` imports. That is not a gap: `cycling-v1/flags.ts`
emits no drift flag at all (grepped 2026-09-13), so a ride has nothing to gate.

---

## D-480 — "Indoor" on the header line, and the indoor predicate fed the columns it reads (2026-09-12/13)

**The call.** `session_detail_v1.indoor` (boolean) is stamped from `isIndoorSession`
(`_shared/indoor-session.ts`); the header line appends "Indoor"; an indoor session's `weather` is null, its
rows' temperatures null, and a ride's conditions row hidden (`build.ts:1142`). An outdoor ride keeps terrain
and temperature. The predicate was **starved, not absent**: `workout-detail`'s by-id select never fetched
`provider_sport` or `strava_data`, so Strava's `VirtualRide` word never reached it and a trainer ride printed
85°F under "INDOOR". The select now carries both (`workout-detail/index.ts:1561`).

**Why.** Michael: *"can we clarify … when rides are done on a trainer? assuming I will see terrain and temp
on an outdoor ride"* — yes. The first deploy showed "85°F · INDOOR" together, which is the tell for the
starved predicate; the second commit closed the weather.

---

## D-481 — The typed-in log: one form for run, ride and swim, through the whole chain (2026-09-12)

**The call.** `src/components/ManualEntry.tsx` replaces `ManualSwimEntry.tsx` (deleted). Fields: distance
(mi/km, or yd/m for a swim), time, pool length for a swim, date, and the app's one effort scale
(`EffortScale`, optional, written to `workouts.rpe`). It inserts a completed `source='manual'` row (distance
in km; duration, moving and elapsed time in minutes) and invokes `recompute-workout` with the athlete's JWT
(`ManualEntry.tsx:109`), so a typed-in session reaches summary, analysis, facts and the snapshot like any
other. `AppLayout.tsx` routes `log-run | log-ride | log-swim` to it. Upload Course and Log Mobility are hidden
from the menu (`LogFAB.tsx hidden: true`), not deleted. Words, approved: "Log a run" · "Log run" ·
"Run logged" · "Could not log the run" (and ride, swim).

**Why.** Michael: *"no sensors, it's all reported, so … see what other apps do and put it on the lap and
have the user basically report it … it should probably go through the large analysis."* Effort is on the
form rather than a popup after: *"integrate it in."*

---

## D-482 — Keep this client dumb: the plan line and the lift slot words are composed on the server (2026-09-13)

**The call.** `session_detail_v1.block.line` — "Standard Focus · week 2 of 12" — is stamped in
`workout-detail/index.ts:1206` from the plan's own name and position. The client prints `sd.block?.line` in
a lift's header (`UnifiedWorkoutView.tsx`) and on a run's or ride's tile row (`AdherenceChips.tsx weekLabel`,
falling to `plan_context.week_label`). `buildWeekLabel` (`build.ts:1349`) is name · week N · focus-or-phase
and **never** the default week intent — a Standard Focus ride read "WEEK 2 · BUILD" because "Build" was the
generator's default intent, not a marathon carry-over. `src/lib/strength-block-line.ts` and
`kindWordFromSlot` are deleted; `StrengthCompareTable` prints `intent_word` verbatim.

**Why.** Michael: *"says build — should be true to plan"*; *"keep this client dumb."* Two client helpers
had begun composing plan words from contract fragments; that is the smart-client disease one step in.

---

## D-483 — The step walk ends where movement ended; Unattach re-runs the chain (2026-09-13)

**The call.** `compute-workout-summary/index.ts:1789 walkEndIdx`: when the recording carries a distance
progression, the planned-step walk stops at the last sample where distance grew (by 0.5 m), and steps beyond
it are `not_done`. A ride stopped after interval 12 now reads "12 of 14" with 13 and 14 not done and interval
12 keeping its own 4:16, instead of laying fourteen planned steps across the samples the head unit kept
recording after the athlete stopped. `detach-planned` now posts to `recompute-workout` (service key,
`user_id`, `include_summary: true`) on both of its paths (`detach-planned/index.ts:17 fireRecompute`), as
Attach already did, so an unattached ride sheds the plan's intervals, grades and plan context instead of
keeping them "baked in".

**Why.** Michael: *"it says 14 of 14 intervals, I missed some"*; *"unattached it looks a little baked in."*
Both are D-465's cut-short layout finished: the end of a session is the end of movement, not the end of the
file.
