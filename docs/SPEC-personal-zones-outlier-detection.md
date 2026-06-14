# SPEC — Personal Zones & Outlier Detection

**Status:** Open spec · the `resolveZoneBand` seam ships with the bike slice now; the feature comes later
**Priority:** future-proofing the zone system for physiological outliers (athletes who run hot/cold vs. the population model)
**Relates to:** bike-fitness build (HR-at-power band) · per-session engine (Read 2 zone adherence + grade→HR) · the spine's resolve-pattern · the "honest about what it knows" principle

---

## The problem

Industry-standard zones (Coggan power, LTHR-based HR) are **population averages anchored to
one threshold number.** They assume everyone's physiology distributes the same way around
that anchor. Individual lactate and ventilatory thresholds genuinely vary — an athlete can
run hot (conversational at a HR the population model calls Zone 3) or cold. The standard
isn't wrong, it's *averaged* — and outliers aren't the average.

Patient-zero example: conversational at 138 bpm = a Strava/population Zone 3, but it's this
athlete's genuine easy effort. The population model mis-labels him.

## What the data can and cannot do (the honesty line)

**Two different things — conflating them is where apps overclaim:**

1. **Anchor zones to a real threshold** — DOABLE WELL. Anchor to the athlete's *actual*
   lactate threshold / LTHR / tested FTP, not a population %. The athlete (or their test)
   supplies the truth; the app applies it. We're qualified to do this because we're not
   making the physiological call — the test is.

2. **Infer true metabolic zones from training streams alone** — CANNOT do reliably, and
   neither can Garmin. True zone boundaries come from lab testing (lactate curves, gas
   exchange/VO2 with ventilatory thresholds). Estimating them from HR/power streams is an
   approximation of an approximation. We are NOT qualified to invent this — and the honest
   move is to never pretend we can. Garmin's "your Zone 2" is also a guess; we differ by
   *saying so*.

## The architecture — anchor is a per-user INPUT, not a computed truth

The app must not *decide* the athlete's zones. It must:

- **Default** to industry standard (Coggan / LTHR) → transitioning users see familiar
  numbers (continuity).
- **Let the athlete override** with their own anchor: lab VO2max/lactate test, field
  threshold test, or manually entered personal zones.
- **Be honest about which is in use** — "zones from your lab test" vs. "zones estimated
  from FTP (population model)" — so the athlete always knows real-personal vs. averaged-guess.

This is the same principle as the rest of the app: don't assert what the data can't support;
respect the athlete's own data over the population model; label which is which.

## The `resolveZoneBand` seam (ships NOW with the bike slice)

The bike slice's HR-at-power band must be built as a **resolvable input, not a hardcoded
formula** — exactly like resolveThresholds for the spine:

```
resolveZoneBand(athlete, sport) →
  athlete.personalZones ? personalZones[sport]   // their tested/entered truth
                        : cogganDefault(FTP)      // population model fallback
```

Today it returns Coggan-from-FTP. The day personal zones exist, it returns the real numbers
and **nothing downstream changes** — the bike/HR engine just reads the band. This is the
seam, not the feature: one line of architecture now, so the feature is never a retrofit.

**Build instruction for the bike slice:** the HR reference band comes from resolveZoneBand,
not an inline [0.56, 0.75] × FTP. The Coggan default lives inside resolveZoneBand.

## The feature (later)

### Personal zone input
- Athlete enters zones from a VO2max test, lactate test, or field threshold test.
- Or enters threshold anchors (LT, LTHR, tested FTP) and the app builds zones off the
  athlete's anchor instead of the population %.
- Stored per-athlete, per-sport; resolveZoneBand reads them.
- Always labeled "personal (from test)" vs. "estimated (population model)".

### Outlier detection (the smart, data-honest middle ground)
The app can't *compute* true zones, but it CAN *observe* a discrepancy and prompt:
- Notice when easy/conversational efforts consistently run hotter (or cooler) than the
  population model predicts — e.g. "your HR at easy efforts runs ~10 bpm above standard
  Zone 2."
- Surface it as a prompt, not a verdict: "you may want to set personal zones from a test."
- This is data-honest: it observes a *measurable discrepancy* (real) and asks the athlete
  to supply the *truth* (which only a test can give) — it never invents the truth.
- Powered by the per-session engine's grade→HR / HR-at-effort work, pointed at this purpose.

### Zone-model choice (continuity for transitioning users)
- Eventually let users pick their zone model (Coggan / British Cycling / 80/20 / USAT) so a
  user coming from another platform keeps the zones they know.
- Ties to Read 2 (zone adherence) — defer with that read.

## Why this is better than the incumbents

Garmin/TrainingPeaks apply population zones and present them as "your" zones without flagging
the guess. This app: defaults to the same standard (continuity), lets the athlete supply
real personal zones (respects outliers), and **labels personal-vs-estimated** (honesty). The
outlier prompt is something the incumbents don't do at all — it tells you when the standard
likely doesn't fit you, instead of silently mis-zoning you.

## Sign-offs / open questions when built

- What personal-zone inputs to accept (full zone table? threshold anchors? both)?
- Outlier-detection threshold — how big a discrepancy, over how many sessions, before
  prompting (noise-guarded, don't prompt off one hot day in the heat)?
- Heat/fatigue/cardiac-drift confounders — HR runs hot for reasons other than physiology;
  the outlier detection must not mistake a heatwave for a metabolic outlier.
- Which zone models to offer, and is the model choice global or per-sport?
- Labeling UX — how "personal vs estimated" surfaces without clutter.
