# Efforts — Plan Generation Contract

> The single source of truth for how training plans are built. This document is the spec. Code conforms to this; this does not conform to code.

**Status:** v1 — May 2026
**Scope:** Triathlon (sprint, olympic, 70.3, full IM) and standalone running (5K through marathon)
**Audience:** Engineers, athletes who want to understand decisions, future maintainers

---

## 1. First Principles

These are non-negotiable. Every downstream rule serves these.

### 1.1 The athlete is the authority on their schedule
The system does not pick training days for the athlete. The athlete declares anchors (long ride day, long run day, group ride day, run club day, work constraints). The system places the rest of the week around those anchors.

### 1.2 The science is the authority on training stress
The system does pick the structure of training — what kind of session goes on a day, how hard, how long, how it progresses. The athlete cannot override the protocol's prescription within a session. They can only declare schedule constraints around it.

### 1.3 Honesty over optimization
When the schedule cannot accommodate the athlete's stated constraints plus the science's requirements, the system says so explicitly. It does not silently degrade. It surfaces the conflict, names the trade-off, and asks the athlete to choose.

### 1.4 Progression is sacred
A plan that goes backward without intent is broken. Recovery weeks reduce load. The week after a recovery week resumes from where the build left off — never lower. Strength weights, long ride duration, long run miles, weekly TSS — all advance over the macrocycle except during planned recovery.

---

## 2. Athlete Profile Inputs

The system reads three categories of inputs:

### 2.1 Identity (from Arc)
- Age, gender, body weight (for power/weight calculations)
- Training history (months/years active in each discipline)
- Injury history (active limitations)

### 2.2 Fitness (from Arc — measured or learned)
- FTP (watts) — bike threshold
- Run threshold pace (sec/km)
- Swim CSS or 100yd pace
- Strength 1RMs (deadlift, squat, bench, row)
- Recent training volume (last 4 weeks per discipline)

### 2.3 Intent (from wizard)
- Race(s) — distance, date, A/B priority
- Training intent — performance / strong finish / first race
- Strength intent — performance (real lifting) / support (injury prevention) / none
- Swim intent — focus (3x, swim is a limiter) / race-ready (2x, swim is sufficient)
- Schedule anchors — see Section 4

---

## 3. Athlete Levels

The system recognizes four athlete levels per discipline. Level affects volume floor, intensity prescription, and recovery cadence — not schedule.

### 3.1 Beginner
- No prior race at this distance
- Limited training history (< 6 months consistent training)
- No baseline data on file
- **Behavior:** assessment week required OR conservative defaults. Volume starts low. Intensity is RPE-based, not pace/power-based, until baselines exist. Recovery every 2 weeks.

### 3.2 Returning
- Has done this distance before
- Coming off layoff, injury, or pregnancy (gap > 3 months)
- May or may not have stale baselines
- **Behavior:** rebuild from current fitness, not from prior race fitness. Recovery every 3 weeks. Intensity ramps in over first 4-6 weeks.

### 3.3 Active
- Trained consistently in the last 12 weeks
- Has at least one baseline per discipline
- Has done at least one race at any distance in the past year
- **Behavior:** standard 3:1 loading. Quality work from week 1. Volume scales to current fitness, not to race demand.

### 3.4 Performance
- Active + has clear performance goal (faster than prior result)
- Multiple seasons of training history
- Strong baselines across disciplines
- **Behavior:** 3:1 loading, quality from week 1, optional consolidated hard days (AM run + PM strength), back-to-back hard days permitted when athlete-declared.

---

## 4. Schedule Anchors

Anchors are athlete-declared days that the system pins. The optimizer places everything else around them.

### 4.1 Hard anchors (cannot be moved)
- **Long ride day** — athlete states which day. Default Saturday if not stated.
- **Long run day** — athlete states which day. Default Sunday if not stated.
- **Group ride day** — if athlete has one. Classified as quality_bike (competitive) or easy_bike (social) by athlete declaration.
- **Run club day** — if athlete has one. Classified as quality_run, easy_run, or long_run by athlete declaration.
- **Masters swim day** — if athlete has one. Classified as quality_swim or easy_swim.

### 4.2 Soft anchors (athlete preference, optimizer can override with explicit notice)
- **Quality run day** — athlete preferred day for intervals/tempo (when no run club exists)
- **Strength days** — default Monday upper / Thursday lower; athlete can declare different days

### 4.3 Constraints (days that block specific session types)
- **Hard bike avoid days** — days where athlete cannot do quality bike (work, family, travel)
- **Rest day requests** — explicit days off

### 4.4 Non-traditional schedules
The system makes no assumption that long days are weekends. An athlete who works weekends and trains Tuesday/Wednesday for long days is fully supported. The optimizer treats the declared long ride day and long run day as the structural anchors regardless of what days they fall on.

---

## 5. Same-Day Compatibility Matrix

Which session types can share a day. This is the core of placement logic.

| | long_ride | long_run | quality_bike | quality_run | easy_bike | easy_run | quality_swim | easy_swim | upper_strength | lower_strength |
|---|---|---|---|---|---|---|---|---|---|---|
| **long_ride** | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **long_run** | ✗ | — | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| **quality_bike** | ✗ | ✗ | — | ✗* | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| **quality_run** | ✗ | ✗ | ✗* | — | ✗ | ✗ | ✓** | ✓ | ✓ | ✓*** |
| **easy_bike** | ✗ | ✗ | ✗ | ✗ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| **easy_run** | ✗ | ✗ | ✗ | ✗ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **quality_swim** | ✗ | ✓ | ✓ | ✓** | ✓ | ✓ | — | ✗ | ✓ | ✗**** |
| **easy_swim** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | — | ✓ | ✓ |
| **upper_strength** | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| **lower_strength** | ✗ | ✗ | ✗ | ✓*** | ✓ | ✓ | ✗**** | ✓ | ✗ | — |

**Footnotes:**
- ***** quality_bike + quality_run same day: only allowed for performance athletes with co-equal strength intent, AM/PM split. Forbidden for all others.
- ****** quality_run + quality_swim: allowed only if the run is the priority session of the day (run AM, swim PM, ≥4hr separation).
- ******* quality_run + lower_strength: allowed for performance athletes only, AM run / PM lift, ≥6hr separation. This is the consolidated hard day pattern.
- ******** quality_swim + lower_strength: same-day discouraged due to leg fatigue affecting swim kick. Allowed only if separated ≥6hr and athlete explicitly accepts.

### 5.1 Hard-banned pairings (never allowed regardless of athlete level)
- Two long sessions same day (long_ride + long_run)
- Long_ride + any non-swim session
- Two upper or two lower strength sessions same day
- Quality_swim + easy_swim same day (one swim kind per day)

### 5.2 Maximum sessions per day
- **3 sessions** absolute ceiling, only with one being either easy_swim or upper_strength
- **2 sessions** standard ceiling
- **1 session** on long_ride day (long_ride is alone or with easy_swim only)

---

## 6. Sequential (Adjacent Day) Rules

Rules between consecutive days. These are independent of same-day rules.

### 6.1 After a long day
- Day after long_ride: easy or rest only, except long_run (canonical tri Sat/Sun pattern)
- Day after long_run: easy_swim, upper_strength, or rest. No easy_run (same tissue, back-to-back stress). No quality work.

### 6.2 After quality work
- Day after quality_bike: no quality_bike, no quality_run (except consolidated hard day for performance + co-equal strength)
- Day after quality_run: no quality_run, no quality_bike

### 6.3 Before sovereign days (long_ride, long_run)
- Day before long_ride: no quality_bike, no quality_run, no lower_strength
- Day before long_run: no quality_run, no lower_strength
- Two days before long_ride or long_run: no lower_strength (48hr leg recovery rule)

### 6.4 Strength spacing
- Lower body strength: minimum 48hr between sessions
- Upper body strength: minimum 48hr between sessions  
- Upper and lower can be 24hr apart (different systems)
- Lower body strength must not fall on the calendar day **immediately before** a day that combines **non-easy bike and non-easy run** (quality-density / recovery buffer before anchored double endurance days).

---

## 7. Experience Modifiers

These exceptions to the core rules unlock for specific athlete profiles.

### 7.1 Performance + co-equal strength athletes
- May stack quality_run + lower_strength same day (AM run / PM lift, consolidated hard day)
- May have quality_bike adjacent to quality_run if athlete-declared (e.g. Wed group ride + Thu intervals)
- When **quality_bike and quality_run share a calendar day**, default sequencing is **run AM / bike PM** (timing metadata + session order) to manage endurance interference within the day.
- Get the third strength session if the week supports it

### 7.2 Returning + first_race athletes
- Stricter scheduling matrix — never stack quality + quality
- Recovery every 2-3 weeks instead of every 4
- Intensity progression delayed by 2 weeks

### 7.3 7-day athletes
- Permitted to have 6 training days, 1 rest day
- Strength can land on quality bike day if upper, never on long_ride day
- Easy_swim or easy_bike can absorb a "spare" day

---

## 8. Hard No's (Communicate to Athlete)

These are non-negotiable. When the athlete's stated schedule violates one, the system explains why and asks them to choose.

### 8.1 "Two long days back-to-back"
**Trigger:** athlete declares long_ride and long_run on adjacent days that are NOT the canonical Sat-Sun pattern (e.g. Tue + Wed).
**Communication:** "Long ride and long run on consecutive days creates 6+ hours of weight-bearing fatigue with no recovery between. The Sat-Sun version works because of the bike→run order and the rest day after. On weekday consecutive long days, your run quality will suffer and injury risk doubles. Move one of them, or accept that the second day will be deeply fatigued."
**Resolution:** athlete picks: keep adjacency (system flags it as athlete-accepted), or move one session.

### 8.2 "Quality bike and quality run same day, no AM/PM separation"
**Trigger:** athlete with non-performance intent tries to stack two quality sessions same day.
**Communication:** "Two threshold-or-harder sessions in one day requires AM/PM separation of at least 4 hours and is only sustainable for athletes with multiple seasons of consistent training. For your level, this stacking causes overtraining within 3-4 weeks. We're placing them on separate days."
**Resolution:** system places on separate days. No athlete override at this level.

### 8.3 "Three quality sessions in 48 hours"
**Trigger:** athlete schedule forces three quality sessions (across disciplines) into a 48-hour window.
**Communication:** "Three quality sessions back-to-back across 48 hours exceeds your recovery capacity. Even for performance athletes, this leads to compromised quality on session 3 and accumulated fatigue into the long ride. We're moving one to a different day."
**Resolution:** system relocates the lowest-priority quality session.

### 8.4 "Lower body strength within 48 hours of long run or long ride"
**Trigger:** athlete declares strength day adjacent to long day.
**Communication:** "Lower body strength less than 48 hours before your long ride or long run will compromise the long session. Lower body strength less than 48 hours after compromises recovery. Your long ride is [day], so lower body strength needs to be at least 48 hours away in both directions."
**Resolution:** system relocates lower body strength.

### 8.5 "Strength frequency cannot fit declared anchors"
**Trigger:** athlete wants 2-3x strength but declared anchors leave no compatible days.
**Communication:** "You've requested 2x performance strength, but your anchors (long ride [day], long run [day], group ride [day], quality run [day]) leave no day with the required spacing for both sessions. To preserve 2x, we need to either: (a) move an anchor, (b) accept 1x strength this block, or (c) consolidate quality run and lower body strength into a single hard day. Which do you prefer?"
**Resolution:** athlete chooses.

### 8.6 "Insufficient recovery before A race"
**Trigger:** athlete wants high volume in taper week or skips taper.
**Communication:** "Your taper is the difference between racing your fitness and racing your fatigue. The science shows performance drops 1-2% per missing taper week. Your A race is in [N] weeks; we need to start tapering [date]. Volume cannot stay at peak through that week."
**Resolution:** system enforces taper. No athlete override.

---

## 9. Progression Rules

### 9.1 Weekly TSS progression
- Build phase: each week 5-10% higher TSS than the previous build week
- Recovery week: 60-65% of the prior build week's TSS
- Week after recovery: matches or exceeds the highest pre-recovery TSS

### 9.2 Long ride progression
- Builds 10-15% per week through build phase
- Caps at race-specific projected ride duration × 1.1
- Recovery week long ride: 50-60% of the prior peak
- Week after recovery: meets or exceeds prior peak long ride

### 9.3 Long run progression
- Builds 10% per week (max +1mi for athletes under 12mi long runs)
- Caps at race distance × 1.0 for HM/marathon, 12mi for 70.3
- Recovery week long run: 60% of prior peak
- Week after recovery: meets or exceeds prior peak long run

### 9.4 Strength progression
- Performance protocol: weight increases each build week. Recovery week: 80% of prior weight, lower volume. Week after recovery: continues progression from where build left off.
- Support protocol: stable weight, same exercises, focus on form
- Mesocycle counter does NOT reset on phase boundaries — Week 5 is heavier than Week 3, period

### 9.5 The "no regression" rule
Any session type whose volume or intensity is lower in week N+1 than week N (where N is a build week and N+1 is a build week) is a bug. The only exception is recovery weeks (every 4th week in 3:1 pattern).

---

## 10. Acceptance Scenarios

These are the test cases. Any plan generation that fails these is wrong.

### 10.1 Performance dual-70.3 athlete (Michael's case)
**Inputs:**
- A race: 70.3 Santa Cruz, Sept 13
- B race: 70.3 Redding, Aug 16
- Training intent: performance
- Strength intent: performance
- Swim intent: race-ready (2x)
- Days/week: 7
- Group ride: Wednesday, competitive
- Long ride: Saturday
- Long run: Sunday
- Strength: 2x (upper + lower)
- Has FTP, threshold pace, swim pace baselines

**Expected week structure (any build week):**
- Monday: upper body strength
- Tuesday: easy bike OR rest
- Wednesday: quality bike (group ride)
- Thursday: quality run + lower body strength (PM)
- Friday: easy swim + easy bike OR upper recovery + easy swim
- Saturday: long ride
- Sunday: long run

**Validation:**
- Wednesday MUST have quality bike, never sweet spot on Tuesday
- Thursday MUST have lower body strength
- Both upper AND lower body strength must appear in the plan
- Long ride duration must increase week-over-week through build
- Strength weights must increase week-over-week through build
- Week 5 (post-recovery) long ride ≥ week 3 long ride
- Week 5 (post-recovery) strength weights ≥ week 3 strength weights

### 10.2 Beginner first 70.3 athlete
**Inputs:**
- A race: 70.3 in 24 weeks
- Training intent: first_race
- Strength intent: support
- Swim intent: focus (3x — swim is the limiter)
- Days/week: 5
- No group ride, no run club
- Long ride: Saturday
- Long run: Sunday
- Strength: 1x
- No FTP, no threshold pace, no swim baseline

**Expected behavior:**
- Plan starts with assessment week (week 0)
- Week 1 begins after assessment baselines write back
- Quality work uses RPE for first 4 weeks until learned baselines accumulate
- Recovery every 2 weeks for first 8 weeks, every 3 weeks after
- Volume floor based on age/gender median minus 15%

### 10.3 Returning athlete with non-traditional schedule
**Inputs:**
- A race: marathon in 16 weeks
- Training intent: strong finish
- Coming off 4-month layoff
- Days/week: 5
- Works weekends — long run Tuesday, quality run Friday
- Has stale baselines (12 months old)

**Expected behavior:**
- Long run on Tuesday (athlete-declared)
- Quality run on Friday (athlete-declared)
- Sunday treated as easy day or rest, not as long run day
- Recovery every 3 weeks
- Baselines marked stale; first 3 weeks use conservative interpretation

### 10.4 Performance athlete, anchors conflict with strength frequency
**Inputs:**
- A race: 70.3 in 16 weeks
- Group ride Wednesday, run club Tuesday + Saturday tempo
- Long ride Sunday, long run Friday
- Strength intent: performance, 2x

**Expected behavior:**
- System detects no valid 2-strength placement
- Surfaces hard-no #8.5 to athlete
- Athlete chooses: drop run club Tuesday, accept 1x strength, or consolidate quality run + lower body
- Plan generates after athlete resolves

---

## 11. Output Contract

What the plan generator must produce, end-to-end:

### 11.1 Per-week structure
For each week, output `sessions_by_week[weekNum]` containing an array of `PlannedSession` objects. Every session has:
- `day` — Sunday through Saturday
- `type` — sport type
- `discipline` — sport type (duplicate field for activate-plan)
- `name` — descriptive label
- `description` — full prose instructions
- `duration` — minutes
- `steps_preset` — token array (empty for free-form sessions)
- `tags` — including `assessment` for tests, `quality` for hard sessions
- `timing` — AM/PM when relevant for consolidated days
- `intensity_class` — easy/tempo/threshold/vo2max
- `tss` — calculated load
- `zone_targets` — pace/power/HR targets
- `serves_goal` — primary discipline focus

### 11.2 Plan-level metadata
- `duration_weeks` — total
- `phase_by_week` — base/build/race_specific/taper/recovery per week
- `peak_week_tss` — single number
- `average_weekly_tss` — single number
- `generation_trade_offs` — array of structured trade-off objects with template IDs

### 11.3 Per-athlete adjustments stored
- `athlete_state.projected_bike_hours` — from real projection
- `athlete_state.projected_run_hours` — from real projection
- `athlete_state.assessment_week_preference` — if applicable
- All wizard-declared anchors

---

## 12. What This Document Is Not

This is not implementation detail. It is the contract that implementation must satisfy. Specifically:

- This document does not specify file structure, function names, or code organization
- This document does not specify which edge function handles which job
- This document does not specify caching strategy or invalidation patterns
- This document does not specify UI behavior beyond communication of hard-no's

If a code change matches this contract, it is correct. If it doesn't, it's wrong — regardless of how well-written the code is.

---

## 13. Versioning

Changes to this contract require:
1. Written justification (what changed, why)
2. New acceptance scenario covering the change
3. Migration plan for existing plans built under prior contract
4. Bump version number

Current version: **v1**

---

## Appendix A — Edge Cases We've Hit

### A.1 Athlete declares Wed quality_bike (group ride) AND Thursday quality_run
**Status:** valid for performance + co-equal athletes. System must respect both. Adjacent quality days are athlete-accepted; surface trade-off note but do not relocate.

### A.2 Two-race season (A + B race 4 weeks apart)
**Status:** treat as single 18-20 week plan with mid-season race as B race tune-up. Inter-race block is 2-week recovery + 2-week sharpening, not full rebuild.

### A.3 Strength intent = performance but no time for 2x
**Status:** trigger hard-no #8.5. Do not silently downgrade to 1x.

### A.4 Athlete has FTP but no threshold pace
**Status:** bike sessions use FTP zones; run sessions use RPE until threshold pace accumulates from training data.

### A.5 Group ride classified as "social"
**Status:** treated as easy_bike, not quality_bike. Does not pin a hard day. Optimizer can place quality bike elsewhere.

---

**End of contract v1.**
