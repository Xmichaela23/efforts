# SPEC — ONE LTHR. The anchor everything hangs off resolves four different ways.

**Status:** SPEC (2026-07-13). Not built. **The highest-leverage continuity work left.**
**Law:** Constitution Law 1 (one source per claim), Law 2 (measured ≠ inferred), Law 3 (confidence travels).
**Pattern already proven three times:** `resolveCurrentFtp` (bike), `resolveCurrentRunEasyPace` (D-285/D-287), `friel-zones.ts` (D-286). **This is the same move, on the root.**

---

## 0. Why this one matters more than the others

**LTHR is the root of the run stack.** Every one of these is derived from it:

- the **easy band** (`easy-hr.ts` — 70-89% LTHR)
- every **HR zone** (`friel-zones.ts` — Z1..Z5)
- the **zone bins** on the Details screen → `intensity_distribution` → the **80/20 read**
- the **easy-pace learner** (which runs qualify)
- `calculate-workload` (HR-vs-threshold intensity)
- the coach's HR bins

We spent 2026-07-13 making everything *derived* from LTHR agree (D-286: one Friel model). **We never fixed LTHR itself.** The audit that morning said so in terms — *"the BAND is one definition; the ANCHOR is four"* — and the anchor was never touched.

---

## 1. The fracture (verified against code, 2026-07-13)

| # | site | its LTHR chain | order |
|---|---|---|---|
| 1 | **`_shared/easy-hr.ts`** `resolveRunEasyHrBand` — the **EASY BAND** (feeds compute-facts, compute-snapshot, learn-fitness-profile, and now the analyzer's Z3 floor) | `learned_fitness.run_threshold_hr` → `performance_numbers.threshold_heart_rate` → `run_max_hr_observed` (bootstrap) | **LEARNED first** |
| 2 | **`compute-workout-analysis:1578`** — the **ZONE BINS** on the Details screen | `configured_hr_zones.threshold_heart_rate` → `workouts.threshold_heart_rate` → `learnedLthr` | **CONFIGURED/MANUAL first, LEARNED LAST** |
| 3 | **`calculate-workload:241`** | the workout's own `threshold_heart_rate` → `learned.run_threshold_hr` → generic | workout-first |
| 4 | **`coach:2087`** | `learned_fitness.run_threshold_hr` only | learned-only |

**#1 and #2 are INVERTED against each other.**

### The realised bug
An athlete who **types an LTHR in Baselines** (`configured_hr_zones.threshold_heart_rate`, written by `TrainingBaselines.tsx:704` with `source: 'manual'`) gets:
- **zone bins** computed from their **typed** LTHR, and
- **the easy band** computed from the **learned** LTHR.

**Two LTHRs. Two zone tables. One athlete.** That is D-286's bug, one level up — at the root, where it propagates into everything.

### ⚠ A scare that is NOT real — recorded so nobody re-raises it
`strava-token-exchange:131-141` writes `configured_hr_zones` on connect, and the analyzer trusts that object first. It looked like a synced **220-age default** could outrank a measured LTHR. **It cannot.** Strava writes `threshold_heart_rate: null` (`:139`) — it supplies only zone boundaries and an inferred max HR. It never sets an LTHR. (It *does* store `custom_zones`, which is worth keeping for the max-HR path.) **Do not "fix" this.**

### Not (yet) realised, but latent
`workouts.threshold_heart_rate` (chain #2 tier 2, chain #3 tier 1) is a **per-workout, device-supplied** value that **`easy-hr.ts` never sees at all.** If it is ever populated, the analyzer and the band diverge again, silently.

---

## 2. The fix — `resolveCurrentLthr()`

`src/lib/resolve-current-lthr.ts`. Pure, no I/O, client + edge (the `resolve-current-ftp.ts` precedent — shared code lives in `src/lib/`, edge imports *from* it; **the client never imports from `supabase/functions/_shared`**).

```ts
export type LthrSource = 'manual-chosen' | 'learned' | 'manual' | 'device' | 'learned-low';
export type ResolvedLthr = {
  bpm: number | null;
  source: LthrSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  as_of: string | null;      // Q-173 — the newest SESSION behind it
  is_estimate: boolean;      // Law 2
};
export function resolveCurrentLthr(b: BaselinesLike): ResolvedLthr;
```

### Precedence — ⚠ THE ONE OPEN DESIGN CALL (Michael's)

```
0. the athlete's EXPLICIT choice     (`lthr_source: 'manual' | 'learned'` — the Q-174 mechanism, reused)
1. learned  run_threshold_hr         (medium/high, sample_count > 0)   <- MEASURED
2. manual / configured (source: 'manual')                              <- an ASSERTION
3. learned-low
4. device  (workouts.threshold_heart_rate)                             <- lowest; provenance unknown
5. null                                                                <- SAY SO. Never 220-age. Never invent.
```

**The tension, stated honestly.** `resolveCurrentFtp` puts **learned first**, and #1 above copies it. But:
- A **real threshold test** the athlete performed and typed in is **better** than a passive learn off ambient runs — the primary user's LTHR is **`n=2`**.
- The app **cannot distinguish** a tested number from a guessed one. Both arrive as "manual".
- **This is exactly the problem Q-174 already solved for easy pace: let the athlete say.** Tier 0 above is that mechanism, reused verbatim. Default = learned (byte-identical to today); the athlete can override; and their override is honoured.

**Non-negotiable regardless of the ordering:** the `sample_count: 0` gate from D-284 applies. A `run_threshold_hr` written as *"88% of observed max (estimated)"* with **zero samples** is a formula, not a measurement, and **cannot anchor** — it must fall through. (`easy-hr.ts` already enforces this; the other three sites do not.)

---

## 3. Call sites to route (4)

| site | change |
|---|---|
| `_shared/easy-hr.ts` `resolveRunEasyHrBand` | take the resolved LTHR instead of doing its own 2-tier chain. **This is the one that already has the `sample_count: 0` gate — lift that gate INTO the resolver.** |
| `compute-workout-analysis:1578` | delete the `configured → workout → learned` chain. ⚠ **Behavior change:** an athlete with a typed LTHR will see their zone bins move. Name it. |
| `calculate-workload:241` | delete the `workout → learned → generic` chain. |
| `coach:2087` | already learned-only; route it anyway so there is one reader. |

**Also do `threshold_pace` in the same pass.** It has **no resolver at all** and is read directly everywhere (`race-projections`, `race-readiness`, `week-builder`, `infer-training-fitness`, `arc-context`, `create-goal`, `generate-run-plan`, `TrainingBaselines`, `ArcSetupWizard` — 15 files). Same shape, same session.

---

## 4. Blast radius

- **Zone bins move** for any athlete with a typed LTHR that differs from their learned one → `intensity_distribution` → the **80/20 read**. This is a **correction**, not a regression, but it is visible and must be named.
- **Stored zone bins are per-workout.** A recompute is owed, exactly as D-284's was (`scripts/verify-d284-backfill.mjs` is the mechanism — deterministic chain only, **never** the analyzer, which regenerates LLM narratives).
- The **easy band** does not move for anyone whose learned LTHR already wins (which is everyone today who hasn't typed one).
- **Nothing derived changes shape** — `friel-zones.ts` and `easy-hr.ts` already agree. Only the *input* is corrected.

---

## 5. Verification

- Fixtures: every precedence tier; the `sample_count: 0` refusal; **a sweep asserting all four call sites return the SAME bpm for the same baselines** (the Law 1 pin — this is the test that would have caught the original fracture, and the one D-286 taught us to write: **grep for other copies before trusting a green test**).
- Then: recompute + a before/after on `intensity_distribution`.

---

## 6. ⚠ What this does NOT fix

The primary user's LTHR is **151, n=2, medium confidence, 53 days old.** **This spec makes four surfaces agree about that number. It does not make the number better.** Only a threshold test does that — and *"his easy pace is Friel Zone 3"* vs *"his anchors are underestimated"* remain indistinguishable from the data until he does one. **Do not "fix" his zones by inference.**
