# SPEC — Per-Session Performance Engine (sport-agnostic, terrain + zone aware)

**Status:** Open spec · later (depends on Step 3 + GAP/grade data) · captured now to shape Step 3
**Priority:** the per-ride/per-run substance layer — what makes a session read "useful" not just "honest"
**Relates to:** bike-fitness spec (HR-at-power) · session-context spec (Layer 2 per-ride) · the spine · Step 2 narrative (honest-but-thin without this) · Garmin per-session analysis

## The insight

Cycling and running need the **same** per-session analysis machinery. How grade affects HR, whether you held prescribed zones when a climb hit, a per-session +/- verdict — that's ONE analytical engine reading two sports with sport-specific inputs. Build it bike-only and you re-pay for run later. Build it sport-agnostic and run drops in for free.

This is also what fills the gap Step 2 exposed: once the narrative stops fabricating trends, it's honest but thin (leans on boilerplate). The per-session read is the *true substance* that replaces the old false headline.

## The three reads (one engine, sport-agnostic)

### 1. Grade → HR coupling (aerobic response under load)
How much does HR climb when the terrain pitches up?
- **Cycling:** watts × grade × HR — at a given power, how much does a climb cost in HR?
- **Running:** pace/GAP × grade × HR — does HR spike disproportionately on hills?
A fitter athlete's HR rises less for the same graded effort. Trends over time = a real fitness signal, terrain-adjusted.

### 2. Zone adherence under terrain
Was this *prescribed* as Zone 2 (or whatever), and did you hold it when a climb forced the choice between zone and effort?
- The "did my Z2 stay Z2" question (session-context spec) made terrain-specific.
- Surfaces the common failure: a Z2 ride/run that blows past zone on every climb isn't a Z2 session, regardless of average.
- Needs: prescribed zone (from plan) + actual zone distribution + grade segmentation.

### 3. Per-session +/- verdict (Garmin-style, terrain-aware)
A single-session verdict: was this ride/run better/worse than your recent *comparable* sessions, accounting for terrain?
- Like Garmin's per-session read, but terrain-normalized so a hilly route doesn't read as "worse" just because it was harder.
- The per-session analog of the spine's trend verdict — one session vs. baseline, not weeks vs. weeks.

## The structural mandate (protects against rebuild)

**Build the engine sport-agnostic from day one.** It takes `(session, sport)` and the sport supplies its inputs:
- Cycling → power, grade, HR, prescribed zone
- Running → pace/GAP, grade, HR, prescribed zone
The grade/HR/zone analysis logic is shared; only the effort-metric (power vs pace) is sport-specific. Same lesson as the spine: one engine, sport-specific inputs — never a bike-only build that run has to re-pay for.

## Dependencies (why it's "later," not now)

- **Bike per-ride HR-at-power** (Step 3 bike-fitness build) is the cycling half's foundation.
- **Run GAP + grade data** — need reliable per-session grade segmentation and GAP (run intent fix landed; grade segmentation is the new need).
- **Prescribed-zone data** — zone adherence needs the plan's prescribed zone per session (ties to the plan builder / spine).
- Lands after Step 3, feeds the per-ride narrative substance + session-detail screen.

## Sign-offs owed when built

- Grade buckets — how is "a climb" defined (grade % thresholds, duration)?
- Zone-hold definition — what % time-in-zone counts as "held" vs "blew the zone"?
- Per-session +/- — what's "comparable" (same sport + similar terrain profile?), and the better/worse thresholds (noise-guarded, like the trend % thresholds).
- Sport-agnostic: keep grade/zone logic shared, effort-metric pluggable — verify run and bike both route through one engine.

## Open questions

- Does grade/HR coupling need per-second power+HR+elevation streams retained? (Confirm the data is stored — same check as HR-at-power's sample retention.)
- How does this surface — per-session screen, narrative substance, or both? (Likely both: engine computes, narrative describes, session-detail screen shows the detail.)
- Zone adherence needs prescribed zone — is that on the planned_workout, and does it survive to the logged session for comparison?
- Relationship to the spine: is per-session +/- a spine output (one more verdict) or a separate per-session layer the spine's trend aggregates from? (Likely the latter feeds the former — per-session reads are the points the trend is built from.)
