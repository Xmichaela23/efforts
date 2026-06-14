# SPEC — STATE Screen v2 (performance-trend centerpiece)

**Status:** Open spec · not yet built · pick up when ready
**Priority:** next major STATE work
**Relates to:** D-146/D-147 (load verdict, now correct) · readiness-into-BODY (held) · the
"how are my disciplines working together" goal · Garmin Training Status as reference

---

## The goal

Replace the current wall-of-text STATE screen with a screen that answers the question
that actually matters: **is the training working?** Not "did I show up" (adherence), but
"is each discipline improving, holding, or sliding" (performance trend). Adherence is
input; performance is output — the screen should lead with output.

This also fixes the density problem: the current narrative is ~150 words on a phone and
re-states what the rows already show. v2 distills to a status headline + a glanceable
performance view + a tight 2-3 sentence why.

## Centerpiece — performance trend per discipline (CONFIRMED)

Each discipline gets a one-glance verdict, the metric driving it, and the trend window:

| Discipline | Verdict source | Data state today |
|-----------|----------------|------------------|
| Strength  | e1RM slope (Brzycki, already computed) | **Strong** — buildable now |
| Bike      | FTP / power-at-threshold trend | **Good** — FTP tracked |
| Run       | GAP pace at comparable effort | **Thin** — often "needs data" until run consistency returns / Strava online |
| Swim      | pace per 100 (or yardage-vs-floor as fallback) | **Weak** — mostly "needs data" until pace history exists |

**Verdict states:** Improving · Holding · Sliding · Needs data
- Green/up = improving, amber/flat = holding, red/down = sliding, gray/dash = needs data.
- "Needs data" is a first-class honest state — never fabricate a trend. (Matches the
  app's anti-fabrication norm and the D-146/D-147 spirit: don't assert what the data
  doesn't support.)

### Hybrid fallback (recommended)
Because two disciplines have real performance signal and two often won't, each row shows:
- **Performance trend** where data exists (strength, bike).
- **Adherence** (planned vs actual, e.g. "0/2 planned") for disciplines without enough
  performance signal yet — so the row is never blank.
Each discipline graduates from adherence → performance automatically as data accumulates.
This keeps the screen full and honest today, and richer over time.

## Status headline (DECISION NEEDED)

The screen leads with a synthesized status. Two candidates:
- **Two-part richer line (recommended):** a short status + what's moving — e.g.
  *"Building — strength up, run sliding."* The rows carry detail; the headline is the
  one-glance read. Fits a multi-sport plan where one word can't capture "bike fine, swim
  the problem."
- **Single word:** Garmin-style — Building / Maintaining / Off-Plan / Detraining /
  Overreaching / Peaking / Recovery. Cleaner, but loses the per-discipline nuance.

Michael leaned "slightly richer than one word" → recommend the two-part line. Confirm
before build.

## Trend thresholds (SIGN-OFF REQUIRED — same as the 500 floor)

The Improving/Holding/Sliding cutoffs are judgment calls, NOT for the agent to guess.
To be proposed by the agent and approved by Michael before any code ships:
- **Strength:** e1RM % change over what window (4 wk?) counts as improving vs noise?
- **Bike:** FTP/power trend window + % threshold?
- **Run:** how many comparable-effort runs before it attempts a GAP trend (else "needs
  data")?
- **Swim:** pace-per-100 session count before trending; otherwise yardage-vs-floor.
- Guard against noise: a single session shouldn't flip a verdict (echoes the load-bug
  lesson — don't escalate off one data point).

## What v2 replaces / cleans up

- **Narrative wall → 2-3 sentences.** The status headline + performance rows carry the
  load; the paragraph becomes a brief "why," not a re-list of every metric.
- **RACE row is broken** — currently says "Add a race target" when two races exist
  (Santa Cruz A-race, NorCal B-race). v2 shows actual race target(s) + countdown. Label
  which race when both are relevant.
- **Readiness folds in here** — the held readiness-into-BODY work lands as part of v2
  (readiness is the subjective input alongside the performance output). Keep energy/
  soreness/sleep distinct (Q2), no-data on blank days (Q3).

## Build sequencing (suggested)

1. **Performance trend model per discipline** — start with strength + bike (real data),
   define the trend slope + thresholds. Stop for threshold sign-off.
2. **Hybrid fallback** — adherence fills disciplines without performance signal.
3. **Status headline** — synthesize the two-part line from the per-discipline verdicts.
4. **Narrative trim + RACE row fix + readiness fold-in.**

## Guardrails

- Phase: this is display/synthesis. Do NOT let trend verdicts feed prescription
  (adapt-plan / suggested_rir) without separate sign-off — that's autoregulation, later.
- Don't touch the D-139 rest/haptic path.
- Thresholds are a hard stop-point: agent proposes, Michael approves, then build.
- Each step its own commit + D-entry.

## Open questions to resolve when building

- Status headline: two-part line vs single word? (recommend two-part)
- Exact trend windows + % thresholds per discipline (the sign-off above).
- Does "Holding" during a deliberate deload/light block read as neutral, or should the
  screen know it's a planned light week and say "holding (deload)" rather than implying
  stagnation? (Ties to the same plan-awareness the load fix needed.)
- How far back does each trend look, and how is it shown — verdict only, or a sparkline?
