# SPEC — Session Context & Behavioral Trends

**Status:** Open spec · not yet built · pick up when ready
**Priority:** feeds STATE v2 (adherence axis) and D-147 (off-plan verdict); behavioral layer is the long-term prize
**Relates to:** STATE v2 (performance + adherence as co-equal axes) · D-147 (off-plan light-week verdict) · HR/power per-ride signals

---

## The core insight

Adherence and performance are **co-equal axes**, not a fallback relationship. A session
can be low-adherence (planned ride became social) yet still carry real performance signal
(HR-at-power, HR drift across surges/lulls, time-in-zone). Neither axis substitutes for
the other — they answer different questions.

But raw adherence is just a guilt meter unless the app knows *why* a session deviated.
"1/3 planned" reads as failure; "planned ride became a non-drop group ride" reads as a
legitimate different session. Capturing that context turns adherence from punishment into
information — and, accumulated, into a feedback loop on the athlete's own training
behavior.

## Three layers (build order is forced — each depends on the prior)

### Layer 1 — Capture (the feature)
On the post-session grade/RPE popup, let the user tag what the session actually was:
- Followed plan
- Became social
- Group ride — drop
- Group ride — non-drop
- Cut short
- (extensible — keep the tag set open to add more)

This is the foundational data-capture step. Everything else depends on it accumulating.

### Layer 2 — Per-ride read
For a single session, show the context tag alongside its performance signal:
- HR-at-power (aerobic efficiency for that ride)
- HR drift across surges vs. lulls
- **Intended zone vs. actual** — did the planned Zone 2 ride stay Zone 2, or did it run
  hot because it became social?
This is the most crucial layer per-ride: it tells the athlete what *this* session actually
delivered, regardless of whether it matched the plan.

### Layer 3 — Accumulated behavioral trends (the prize)
Correlate context tags against performance over time. The questions this answers — both
sides of the same loop:
- **Context × performance:** "Is swapping planned rides for group rides helping me?" — if
  FTP / HR-efficiency climbs on group-ride-heavy weeks, they're working; if flat/sliding,
  the social swaps are costing fitness.
- **Intended vs. actual, accumulated:** "Am I getting lax on Zone 2 because I'm riding
  with friends?" — if rides tagged 'group' run consistently hotter than solo Zone 2 rides
  (higher HR, less time-in-zone), that's discipline leaking, quantified.

These are the same feedback loop: did the deviation help or hurt, and am I actually
getting the work I intended? (Michael: "both — they're the same loop.")

This is beyond Garmin: Garmin sees the ride but doesn't know it was *meant* to be Zone 2
and then sandbagged socially. The intent + context tag is what makes the behavioral read
possible.

## Dependency / sequencing

Forced order — cannot shortcut to the insight:
1. **Capture** (Layer 1) — ship the tag UI; start accumulating.
2. **Per-ride read** (Layer 2) — surface context + HR/power/zone for each session.
3. **Behavioral trends** (Layer 3) — needs months of tagged history before it has signal.

So Layer 1 is the thing to build first even though Layer 3 is the payoff — the trends are
worthless without the tagged data underneath them.

## Connections to existing work

- **STATE v2:** the adherence axis displays the context tag (not just planned/actual
  counts). Performance axis already specced.
- **D-147 (off-plan verdict):** a "became social" / "group ride" tag is exactly what
  should stop the off-plan verdict from reading a deliberate deviation as failure. The tag
  feeds the verdict's context.
- **HR-efficiency as its own signal:** HR-at-power / HR-drift are richer than a 6-week FTP
  trend — they're per-ride fitness reads. Could become a distinct discipline-card element
  ("aerobic efficiency") later, separate from the FTP-trend line.

## Open questions to resolve when building

- Tag taxonomy — final set, and is it ride-specific or cross-discipline (runs/swims get
  context tags too)?
- Does the tag also capture *intended* zone/session type, or is that already in the plan
  data? (Needed for intended-vs-actual.)
- Layer 3 correlation model — how much tagged history before a behavioral trend is shown
  (same noise-guard discipline as the STATE trend primitive — don't assert a pattern off
  3 rides).
- Where does the behavioral insight surface — STATE, a per-discipline drill-in, or a
  separate "patterns" view?
- Zone-drift detection needs reliable HR-zone classification per ride (ties to the same
  zone-data dependency as the Garmin-style energy-system view).
