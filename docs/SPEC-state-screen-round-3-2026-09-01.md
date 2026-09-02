# SPEC — STATE SCREEN ROUND 3: ONE BLOCK PER SPORT
**Written 2026-09-01 by the project-manager session, for Michael's approval BEFORE anything is built.
Round 0/1/2 are shipped and live (`origin/main == d455aca7`, 27 functions deployed).**

⛔ **THIS IS A DESIGN PASS, NOT A SERIES OF PATCHES.** The screen currently carries FOUR card
languages. Adjusting them one at a time is how it got four. Nothing in this spec is built until
Michael approves the shape.

---

## THE PROBLEM, IN HIS WORDS

> *"still seeing rides and bike"* — his bike appears in two places on one screen.
> *"there isn't a ton of visual continuity in the design"*
> *"what does this tell people? it's pretty primitive"*

⚠️ **AND THE CORRECTION THAT MATTERS:** Round 1 item 1c asked whether the two bike surfaces show the
same METRIC. They do not — one is efficiency, one is load — and that trace was right. **But that was
not the question he was asking.** His question is why his bike is in two places. That is a
CONSOLIDATION question, and this is where it is answered.

---

## THE RULE

**One block per sport. That block owns everything about that sport.** Nothing about the bike appears
outside the bike block. Nothing about running appears outside the run block.

⛔ **AND NO BLOCK MAY READ ANOTHER BLOCK'S PRESENCE.** This is already law from Round 3's
reordering constraint and it survives here: no `runSpineCovers`, no gate on another component's data.
A block decides what to draw from its OWN data only.

---

## WHAT EACH BLOCK CONTAINS, IN THIS ORDER

1. **Sport name + icon.** One heading style, everywhere.
2. **The one number that matters**, large, with its unit and a one-line definition of what it means.
3. **The chart.** One caption format across every chart on the screen.
4. **The supporting facts** — load, drift, counts — as a single line, not as a second card.
5. **One line of meaning**, fact-first, no imperative. Absent rather than invented when there is
   nothing honest to say.

### RUN
Easy and quality are TWO READINGS INSIDE ONE BLOCK, not two cards. They are the same subject read
two ways. ⚠️ Long runs are a third group already computed and undrawn (5a) — the block should have
room for it, but drawing it is a separate decision.

### BIKE
The efficiency reading and the load reading (`fitness · form`) live in the SAME block. Today they are
the rides card and the BIKE row, in different shapes, separated by other content.
⚠️ Rides carry no session-type split (5c). One group is correct until there is a classifier; do not
invent one.

### STRENGTH
**Already the closest to right, and it is the model for the others** — this is why it reads better
than the rest of the screen. Per-lift cards with the number, the record, the sessions, the all-out
set and the chart. Keep the shape; bring the others up to it rather than changing it.

### SWIM
Counts only, minimal, and it stays minimal. ⛔ Never propose swim features. This is placement, not a
feature.

---

## THE CARD LANGUAGE — ONE, NOT FOUR

Currently on one screen: lowercase headings with a giant number; caps headings with an icon and a
sentence; bordered cards with three columns of orange figures; a plain label-and-list. Different type
case, different number treatment, different chart captions, different rules about colour.

- [ ] **One heading style.** Pick caps-with-icon (the sport rows' shape) and apply it everywhere.
- [ ] **One number treatment.** Value, unit, one-line definition beneath.
- [ ] **One chart caption format.** Today there are four: *"10 weeks"*, *"10 weeks of readings"*,
      *"last 11 weeks · recent 6 in color · tap to expand"*, *"last 18 weeks · recent 6 weeks in
      color"*. One phrasing, one rule.
- [ ] **One expand rule.** Every chart expands, or none does. Today two say "tap to expand" and two
      do not, in the same card family.
- [ ] **The generic caution once per screen, not per card.** *"one session doesn't tell you much…"*
      is printed under all three efficiency cards.
- [ ] **Colour stays the sport's.** Strength orange, bike green, run yellow. Unchanged.

---

## WHAT THIS ROUND DOES NOT DO

- ⛔ **No new metrics.** Everything here is already computed.
- ⛔ **No new verdicts.** Surfaces render; they never re-decide (Constitution Law 4).
- ⛔ **No interference verdict.** Researched 2026-09-01: the strength/endurance trade-off appears over
  MONTHS and mainly at high endurance volume. It does not produce a week-to-week see-saw, so a screen
  claiming to show one would be lying. Both trends, side by side, over months — no claim about cause.
- ⛔ **Not the copy pass.** "his range is 8-12 sets", the raw session labels, the run-on body
  paragraph — Round 4.
- ⛔ **Not the reorderable blocks.** That was ruled and it comes AFTER this: consolidate first, then
  let the athlete move whole blocks. Ordering a mess is still a mess.

---

## THE OPEN DESIGN QUESTION — MICHAEL'S, AND THE ONLY ONE

**Does the "this week's lifting" block stay where it is, or fold into the strength block?**
Today it sits in the NOW section (muscle sets, pattern bands, session work sets) while the lift cards
sit in TRENDS. Both are strength. Folding gives one strength subject; keeping them apart preserves
the now/trends split that the rest of the screen uses.
⚠️ **Recommendation: keep them apart.** The now/trends split is the screen's spine and it is worth
more than subject purity — "what did I do this week" and "am I getting stronger" are genuinely
different questions.

---

## AND THE THING HE ACTUALLY ASKED FOR, WHICH IS NOT LAYOUT

> *"what does this tell people? it's pretty primitive"*

The weekly lifting block reports INPUTS and leaves the interpretation to the reader: eight muscle
rows, then a range at the bottom, and the athlete does the subtraction. The one line that answers a
real question — *is today's lifting going to cost me tomorrow's run* — is the LAST line of the block.

- [ ] **The muscle list states under / in / over range per muscle** rather than printing a number and
      a range separately. ⚠️ The data is already there; this is presentation.
- [ ] **The work-set cost line leads that block rather than closing it.** It is the only line on the
      screen that answers the hybrid athlete's actual question.
- [ ] ⚠️ **"Effective reps" is a niche term.** Most lifters do not know it. Round 4, but noted here
      because it sits in the block this round restructures.

---

# ADDENDUM — THE WEEKLY LIFTING BLOCK, SPEC'D AGAINST THE BOOK
**Added 2026-09-01 after reading `SOURCE-viada-hybrid-athlete.md` §B2 and §B5 directly.
Michael: "lets build it its why we are here". APPROVED TO BUILD.**

## ⛔ TWO THINGS THE EARLIER NOTES IN THIS ARC GOT WRONG. Do not carry them forward.

1. **"His 8–12 is below the field's 10–20."** FALSE. §B2: *"8–12 sets per muscle per week is solid;
   **18–20 borders overreaching**."* His ceiling is 18–20; 8–12 is the SOLID band, not the maximum.
   The book and the field agree. There is nothing to explain or caveat on screen.
2. **"Effective reps is niche jargon — strip it."** FALSE, and it is the opposite. **Effective reps
   are the book's own unit and the actual dose**; sets are the proxy. §B2: *"~4 effective reps per
   set … therefore **32–48 effective reps per muscle per week** recommended; **70–80 is the
   maximum**."* It is also bucket 5 of his five-bucket weekly accounting (§B5). **Teach the term, do
   not remove it.**

## THE SOURCE, VERBATIM — every number this block may state

| what | value | page |
|---|---|---|
| Sets per muscle per week | **8–12 solid · 18–20 borders overreaching** | p86 |
| Effective reps per muscle per week | **32–48 recommended · 70–80 maximum** | p86 |
| Effective reps per set | **~4** | p86 |
| Rep range / effort | **8–10 reps preferred · 1–2 RIR, never to failure** | p86 |
| Session cost | **6–8 work sets recover in ~24–48h · 14+ can cost up to 72h** | p86 |
| ⛔ **The change rule** | **no bucket moves >10% week to week, ideally ≤5%**; when overreaching back off ALL buckets equally | §B5 |
| The five buckets | sub-VT1 min · near-threshold min · over-threshold min · high-intensity work sets · effective reps per muscle | §B5 |

## WHAT THE BLOCK BECOMES

**Order matters — it is currently exactly inverted.**

1. **THE COST LINE LEADS.** It is the only line answering the hybrid athlete's real question: is
   today's lifting going to cost tomorrow's run. State which of the week's sessions sit in which
   bracket rather than printing the rule and leaving the comparison to the reader.
2. **COVERAGE.** What got nothing. *"nothing this week for triceps, glutes"* is already the best line
   on the block — it is the only one that states a conclusion. Keep it, promote it.
3. **DOSE PER MUSCLE, AGAINST THE TARGET.** Effective reps done vs **32–48**, and sets vs **8–12**.
   ⛔ The screen already prints both numbers and prints NEITHER target, which is why they read as
   decoration. Chest at 11 sets / 44 effective reps is INSIDE both bands — the screen never says so.
4. **THE CHANGE RULE.** Week over week, flag any bucket moving **>10%**. ⚠️ This is the genuinely
   actionable weekly read and nothing in the app draws it.
5. **The detail list stays**, underneath, as detail rather than as the headline.

## ⛔ TRACE THESE BEFORE BUILDING — do not assume any of them

- **Is last week's data available to compute a week-over-week delta?** The change rule is worthless
  without it. If the card only has the current window, say so and STOP — that is a payload question,
  not a layout one.
- **`week_ledger_v1` is persisted and deliberately unrendered.** Its header says so. ⚠️ The 2026-08-28
  reason was that the PLANNED buckets are fixed at compose time — twelve identical weeks. **Measured
  off what was LOGGED they vary, which is a different object.** Establish which one is on the payload
  before treating it as the source; `ViadaWeekCard` is already counted off logged work.
- **Which bands are already computed server-side** vs which would be a new client comparison.
  ⛔ Verdicts are the spine's (Law 4). If "inside / over / under" is a verdict, it is resolved on the
  server, not invented at the display edge.

## NOT IN THIS ADDENDUM

- ⛔ **No body map / heatmap.** It is the field's answer to coverage (Hevy's muscle diagram,
  Boostcamp's heatmap) and it is a real build. Filed, not approved.
- ⛔ **No endurance buckets.** Three of the five are endurance minutes. This addendum is the LIFTING
  block only; drawing the other three is its own decision.
- ⛔ Copy voice — "his range", the raw session labels — remains Round 4.
