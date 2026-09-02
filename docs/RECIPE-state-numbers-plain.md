# HOW EACH NUMBER ON THE STATE SCREEN IS WORKED OUT — plain words

**Written 2026-09-01 for Michael. One page, no code. This is the single reference — if a number is
ever computed a different way, that is the bug, not this doc.** Everything below is traced from the
live code, not remembered.

---

### Load
How much you've trained in the last 7 days, each session scored by how long × how hard (about an hour
at your threshold ≈ 100). The bar splits it by sport. **ACWR** is that 7-day total ÷ your typical week
(your ~4-week average); near 1.0 is normal, higher means you're ramping up. If your base is under about
4 weeks it says "provisional" rather than trusting the ratio. The word ("balanced", etc.) is the app's
one load read; if you're behind the plan it states the fact ("3 of 5 sessions done this week"), and if
the week was meant to be light or you have no plan, it says nothing. Nothing is excluded.

### Body
Soreness and how hard sessions have felt, from what you logged. Stated as facts, not judged. Nothing
computed here that isn't something you entered.

### Run efficiency
Your pace divided by your heart rate, averaged over your recent **easy** runs, plotted week by week.
A rising line means you're going faster at the same heart rate. **Hard runs and long runs are counted
separately** — they're not comparable to easy runs. **Nothing is excluded for being too short** (that
old 30-minute cutoff is gone — it used to throw away two of every three of your runs). The only runs
left out are ones with a broken heart-rate reading. The one-line summary shows a direction only when
there are enough easy runs to trust it; otherwise it just shows the count.

### Run durability
Whether your pace holds through a long steady run (how much your heart rate drifts up late in the run).
Needs a genuinely steady effort — intervals and short runs don't count. If it's been a while, it says
"last steady run N days ago" rather than pretending it's current.

### Bike
Two reads. **Watts per heartbeat** (efficiency) — like run efficiency, same power at a lower heart
rate is fitter. **Power** — your best 20-minute effort. Hard rides are left out of the efficiency read
(it's a same-effort comparison), and rides with no power data can't feed the power read. The collapsed
line leads with watts per heartbeat.

### Strength
For each main lift: your **estimated 1-rep max** from your heaviest set that week (using the standard
Epley/Brzycki formula), plotted week by week, plus your all-time best, your session count, and your
last all-out set. Only your heaviest set each week counts, so speed days don't drag the line down.
Sets over 10 reps are left out — the formula gets unreliable past that, and this number sets next
week's weights. Warm-ups don't count. A lift needs two logged weeks before it draws a line. The
collapsed line leads with the lift that actually moved.
⚠️ **Two numbers you may see that look like a contradiction and aren't:** your *tested max* (e.g. 185)
and your *working weight* for the block (e.g. 176). The working weight is deliberately about 96% of
the tested max — that's the program, not a disagreement. (The app currently works the max out with two
slightly different copies of the formula; that's being fixed to one — see the audit.)

### Swim
Just how many swims in the recent window. Not graded. (True "last swim N ago" needs a data field we
don't store yet.)

### What's next / planned vs actual / "nothing this week for…"
These only appear when you have a plan — they compare what you did to what the plan asked. With no
plan they disappear entirely (a gap only means something against a plan).

---

⛔ **The honesty test:** every number above can be said in one plain sentence. If a future number can't
be, it shouldn't be on the screen.

---

## WHAT CHANGES YOUR BASELINES, AND WHEN — [traced 2026-09-01]

These are the numbers your PRESCRIPTIONS are built from. The question that matters: **can one move
without you knowing?** For some, yes — and that is a real problem, named here, not filed quietly.

| baseline | what updates it | when | keeps a history? | can it move silently? |
|---|---|---|---|---|
| **Lift maxes** (squat, bench, deadlift, overhead) | your logged sets / a test | on ingest + at a test | learned copy yes; the stored max is overwritten | ⛔ **partly.** Saving a baseline ASKS you before writing a number that would drop. But the block's working weights re-price off a test set **silently** — the exact thing that happened tonight. |
| **Run threshold pace** | re-learned from your runs | **every time a run comes in** (automatically) | ⛔ **NO — single value, overwritten in place** | ⛔ **YES. This is the live one.** It changes on its own with no record of what it was. Your run prescriptions rest on a number with no audit trail. (Open item Q-290.) |
| **Easy / VT1 pace** | re-learned from your easy runs | every time a run comes in | ⛔ no — overwritten in place | ⛔ **yes**, same as above |
| **FTP (bike)** | estimated from your rides | every time a ride comes in | ✅ **yes — a dated trail** (the 176 / 173 / 165 … you've seen) | ⚠️ it updates automatically, but it keeps the trail AND won't drop to a lower-confidence reading — so it's traceable, not silent |
| **5K / race pace** | from a logged/official result | at the race | stored value | changes only at a result |

⛔ **THE ANSWER TO HIS QUESTION:** yes, the same silent-move shape that bit the strength side tonight
exists on the ENDURANCE side too — **run threshold pace and easy pace are overwritten automatically on
every new run, in place, with no history.** That is a live defect, not a cosmetic one. FTP is the
exception: it keeps a dated trail and resists a weaker reading.

✅ **AND THE PART HE WORRIED ABOUT IS FINE:** the efficiency numbers on the State screen are **read-only
— they do NOT feed any baseline.** The baselines are worked out separately from your raw run/ride data;
the efficiency figure you see is a display of that data, not an input to your prescriptions. So looking
at the screen, or the screen's efficiency read, never moves your numbers.
