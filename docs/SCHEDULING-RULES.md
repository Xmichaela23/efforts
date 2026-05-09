# Scheduling Rules — Prescriptive

The rules the plan-generation engine should enforce. Constraint-based, athlete-aware, tradeoff-transparent.

Companion to `docs/SCHEDULING-RULES-EXTRACTED.md` (descriptive — what the code does today). This document is what the code *should* do.

---

## 0. Confidence tags

Each rule below carries one of three confidence tags:

- **[consensus]** — Coaching consensus AND research-backed. Strongly established. Violating these produces predictably worse outcomes.
- **[coaching-convention]** — Widely-used coaching heuristic without strong direct research backing. Defensible defaults; specific numerical thresholds are conventional, not absolute.
- **[derived]** — Reasoned from training-science principles, threshold values not empirically validated at scale. Starting defaults; should be tuned as the system observes athlete responses over time.

Confidence tag affects how aggressively a rule should be enforced and how much it can be tuned. Hard constraints are mostly [consensus]. Override gates are mostly [derived].

---

## 1. Philosophy

The plan engine is a constraint solver, not a default placer.

- The athlete provides preferences (pinned anchors, intent, strength philosophy, work schedule, group sessions).
- Training science provides constraints (gaps, recovery windows, hard-easy alternation, ramp limits).
- The athlete profile (age, history, current load, injury flags, recovery markers) gates which constraint severity applies.
- The solver finds the schedule that satisfies the most constraints.
- When constraints cannot all be satisfied, the system surfaces tradeoffs explicitly and lets the athlete choose what to relax.

Days of the week are not assumed. The athlete anchors the structure of their week (long-day pair, group sessions, work schedule). Defaults exist as solver hints for the typical athlete, not as requirements.

---

## 2. Athlete profile inputs

The rules engine reads these fields per athlete to decide rule severity:

| Input | Source | Used for |
|---|---|---|
| Age | profile | Recovery capacity tiers, intensity ceilings |
| Years consistent training | derived from `workout_facts` history depth | Volume tolerance, advanced override gating |
| Current CTL | `athlete_snapshot` | Load absorption capacity, block training eligibility |
| Recent injury flags | profile + recent workout flags | Down-regulates intensity, blocks specific session types |
| Recent recovery markers (RPE, soreness, sleep) | `PostWorkoutFeedback` | Week-over-week aggressiveness adjustment |
| Training intent | user-set: performance / fitness / longevity | Default rule severity |
| Strength intent | user-set: co-equal / supplementary / none | Strength frequency and stacking permissions |
| Pinned anchors | user-set: long-day pair, group sessions, masters swim, off days | Drive placement; rules calculate from these |
| Group session intensity | user-set per group session: easy / tempo / quality / hammer | Tells engine the fatigue cost |
| Discipline limiter | user-set: swim / bike / run | Volume distribution shifts |
| Work schedule | user-set: weekend worker, shift worker, standard | Determines which 2-day window is "low-stress weekend" |

Profile reads are not optional. The engine cannot apply rules correctly without them. Missing data defaults to the most conservative tier.

---

## 3. Hard constraints (universal — apply to every athlete, no overrides)

These rules are non-negotiable. Violating them is a bug.

### 3.1 Same-day matrix [consensus]
Two sessions on the same calendar day must satisfy the compatibility matrix in §8. The matrix encodes which sessions can share a day without compromising either.

### 3.2 80/20 polarized weekly distribution [consensus]
Weekly intensity distribution: ≥80% Z1-Z2, ≤20% Z3+. Validator check 2 enforces this. Hard floor at 70% Z1-Z2.

*Research basis: Seiler et al. on polarized training; Esteve-Lanao studies on elite endurance athletes. Exact ratio varies (75/5/20 vs 80/20 vs 85/15) but the principle that majority Z1-Z2 outperforms threshold-heavy training is well-established.*

### 3.3 Long_ride and long_run on different days [consensus]
Both are >2.5h sessions for endurance athletes. Same-day stacking destroys both stimuli.

### 3.4 No two consecutive HARD days, including week-boundary [consensus]
Sun-of-week-N HARD followed by Mon-of-week-N+1 HARD is a violation. Validator check 1.

*Hard-easy alternation is the foundational principle of all periodized endurance training (Bompa, Daniels, Friel, all converge on this).*

### 3.5 Phase progression cannot regress [coaching-convention]
Once a phase rank is reached (build > base, race_specific > build), the engine cannot revert except through recovery or post-taper reset. Validator check 12.

### 3.6 Race-week protections [consensus]
Race week long_run ≤45min and 3-5mi. Pre-A-race taper long_run ≤5mi. No new training stimulus in race week.

*Taper research (Mujika et al., Bosquet et al.) consistently shows reduced volume + maintained intensity preserves fitness while allowing supercompensation.*

### 3.7 Maintenance floors (non-recovery, non-taper weeks) [coaching-convention]
- Run: ≥2 sessions
- Bike: ≥1 session (if tri or bike-discipline plan)
- Swim: ≥1 session (if tri only)
- Strength: ≥1 session (unless `strength_intent === 'none'` or recovery_rebuild week 1-2)

*Specific session counts are coaching convention, not research-derived.*

### 3.8 Physiological floor failures fail the build [derived]
If after 12 normal rebuild passes + 1 deep pass the plan still violates ramp caps or long-run share caps, return HTTP 400. Do not silently ship a junk plan.

### 3.9 Group session intensity is honored [consensus]
The athlete tells the engine whether their group session is easy, tempo, quality, or hammer. The engine treats it as that intensity for all rule calculations.

---

## 4. Standard constraints (default rule severity)

These are the textbook rules for the typical athlete. Each has a science justification, a confidence tag, and a default severity. Severity may relax for qualifying profiles (§5).

### 4.1 Hard-easy alternation [consensus]
**Rule:** No two HARD same-sport sessions within 48h. HARD = quality_bike, quality_run, long_ride, long_run, lower_body_strength, hammer-intensity group session.

**Science:** Recovery from HARD sessions takes 24-48h. Stacking compromises both sessions and increases injury risk.

**Default severity:** ≥48h between same-sport HARD sessions. ≥24h between cross-sport HARD sessions.

### 4.2 Lower-body strength → long_run gap [consensus]
**Rule:** Heavy lower-body strength must precede long_run by ≥48h.

**Science:** Heavy lifting creates muscle damage and CNS fatigue lasting 24-48h. Running on damaged legs increases injury risk and reduces aerobic adaptation. Multiple studies (Doma et al. 2017; Bell et al. 2000) demonstrate impaired running economy and time-to-exhaustion 24-48h post heavy lower.

**Default severity:** ≥48h.

### 4.3 Lower-body strength → long_ride gap [coaching-convention]
**Rule:** Heavy lower-body strength must precede long_ride by ≥48h.

**Science:** Cycling research is less consistent than running. Doma & Deakin (2013) show cycling threshold power impaired at 24h post heavy squats; de Souza et al. (2007) show recovery within 24h for trained cyclists. The 48h default is the conservative reading.

**Default severity:** ≥48h (conservative). ≥24h is defensible for trained cyclists; covered by override 5.1.

### 4.4 Lower-body strength → quality_bike gap [coaching-convention]
**Rule:** Heavy lower-body strength must precede quality_bike by ≥48h.

**Science:** Same body of research as 4.3. The quality stimulus is wasted if power output is impaired.

**Default severity:** ≥48h.

**Current code status:** Enforced bidirectionally in `_shared/week-optimizer.ts` `sequentialOk` (extended in 2026-05-09 pass). `SEQUENTIAL_RULES_TEXT` in `_shared/schedule-session-constraints.ts` updated to match.

### 4.5 Quality_bike → quality_run next-day gap [consensus]
**Rule:** Quality bike on day N means quality run cannot be on day N+1.

**Science:** Hard-easy alternation. Even cross-sport, accumulated CNS and metabolic load makes back-to-back quality days produce sub-optimal stimuli.

**Default severity:** ≥24h gap, prefer ≥48h.

**Current code status:** Enforced in optimizer's `sequentialOk`. After the 2026-05-09 consolidation, the builder no longer schedules — it uses optimizer-derived day assignments verbatim — so this rule is enforced at the single authoritative layer.

### 4.6 Lower_body_strength → upper_body_strength spacing (2× weeks) [coaching-convention]
**Rule:** When strength is 2× per week, upper and lower must be spaced.

**Science:** Muscle protein synthesis is elevated 24-48h post-training (Damas et al. 2015). Non-overlapping muscle groups can recover in 24h; overlapping work needs 48h+. The "≥3 days" textbook recommendation is generous; ≥2 days is the functional minimum for short non-overlapping sessions.

**Default severity:** ≥3 days preferred, ≥2 days hard floor.

**Current code status:** Optimizer enforces ≥3 days in its strength placement loop. The builder's legacy non-reconciled fallback path (runs only when `long_run_day` is missing and the reconciler short-circuits) does not enforce spacing — that path is intentionally minimal and now scoped to genuinely malformed inputs. The 2-day hard-floor relaxation per override 5.5 is not yet wired and is part of the §5 advanced-overrides follow-up pass.

### 4.7 Quality_bike → next-day no HIGH [consensus]
**Rule:** Day after quality_bike cannot be long_ride, long_run, quality_run, or lower_body_strength.

**Science:** Quality bike depletes glycogen and creates CNS fatigue. Stacking another HIGH stimulus the next day produces a junk session.

**Default severity:** Hard rule for all profiles.

**Current code status:** Enforced in optimizer's `sequentialOk`. The builder consumes optimizer-derived day assignments after 2026-05-09 and no longer attempts independent enforcement.

### 4.8 Long_ride → next-day rules [consensus]
**Rule:** Day after long_ride must be long_run (canonical back-to-back), easy, or rest. Cannot be quality_run, quality_bike, or lower_body_strength.

**Science:** Long rides drain glycogen. Long_run next day is the deliberate tri-specific durability stimulus. Other HIGH sessions are junk.

**Default severity:** Hard rule.

### 4.9 Long_run → next-day rules [consensus]
**Rule:** Day after long_run cannot be HIGH except long_ride. Cannot be easy_run unless `allow_easy_run_after_long_run` is set.

**Science:** Long runs cause more muscle damage than long rides (eccentric loading, ground impact). Recovery takes 48h+.

**Default severity:** Hard rule.

### 4.10 Pre-long-day taper (day before long_run / long_ride) [consensus]
**Rule:** Day before a long-day cannot be heavy lower body. Cannot be a quality session of the same discipline as the long day.

**Science:** Long days require fresh-ish legs for the duration to be productive.

**Default severity:** Hard rule.

### 4.11 Quality_run + quality_swim same-day stacking [coaching-convention]
**Rule:** Stacking depends on athlete intent and adjacent days.

**Science:** Different muscle groups, different energy systems — minimal acute interference. Some periodization models (Friel) deliberately use stacking before long-days to drive cumulative-fatigue adaptation. Other models avoid it. Both are legitimate.

**Default severity:**
- Allowed when training_intent = performance OR strength_intent = co-equal AND next day is not a long day
- Disallowed when next day is long_ride or long_run (default conservative)
- Disallowed otherwise

**Override 5.3** allows stacking before long-days for athletes intentionally using cumulative-fatigue blocks.

**Current code status:** Optimizer's `canPlaceWithModifier` enforces this rule per the 2026-05-09 pass: intent qualifies AND next day is not long_ride/long_run. The builder's tri-blanket override that previously forced disallowed regardless of intent has been removed. Override 5.3 (allow stacking before long-day for qualifying profiles) is not yet wired and is part of the §5 follow-up.

### 4.12 Brick session placement [coaching-convention]
**Rule:** Brick sessions follow phase requirements: 0/wk in base, 1/wk in build, 2/wk in race_specific, 1/wk in taper, 0/wk in recovery.

**Science:** Brick is tri-specific durability stimulus. Phase counts are widely-used coaching convention (Friel, Fitzgerald, others).

**Default severity:** Standard.

### 4.13 Brick day adjacency [consensus]
**Rule:** Day adjacent to brick cannot be HARD run.

**Science:** Brick already includes a hard run-off-bike. Stacking another hard run within 24h is junk.

**Default severity:** Hard rule.

### 4.14 Quality_run before brick gap [coaching-convention]
**Rule:** Quality run must precede brick by ≥48h.

**Science:** Brick run is race-pace; legs need to be fresh enough to execute.

**Default severity:** ≥48h.

### 4.15 Strength preferred days [consensus]
**Rule:** Honor athlete-specified `strength_preferred_days` first. Fall back only when preferred days violate hard or standard constraints.

**Science:** Adherence research consistently shows that consistent training on athlete-preferred schedule outperforms theoretically-optimal scheduling that the athlete skips.

**Default severity:** First-attempt preference.

**Fallback:** When preferred days fail, surface the conflict explicitly. Don't silently move.

**Current code status:** Optimizer reads `WeekOptimizerInputs.preferences.strength_preferred_days` and biases its placement order via `biasOrderForPreferredDay` (added 2026-05-09). When a preferred day is rejected, a `strength_preferred_days: …` string is appended to `conflicts[]` naming which day was rejected and where strength landed instead. The reconciler plumbs the field through and surfaces rejections in its telemetry log. The builder's preferred-days filter has been removed.

### 4.16 Long-day pair anchoring [consensus]
**Rule:** Athlete specifies which 2 consecutive days are their "low-stress window." Long_ride and long_run anchor to that pair.

**Science:** The pair must be 2 consecutive days for the back-to-back durability stimulus to work. *Which* 2 days is athlete-determined.

**Default:** Sat/Sun. Override with athlete `long_day_pair` setting.

### 4.17 Group session intensity routing [consensus]
**Rule:** Each group session is tagged with intensity (easy / tempo / quality / hammer):
- Easy → counts as easy_bike or easy_run for spacing rules
- Tempo → counts as moderate; respects ≥24h from quality, ≥36h from long-day
- Quality → counts as quality_bike or quality_run; full spacing rules apply
- Hammer → counts as quality + adds 24h additional recovery (more demanding than standard quality)

**Science:** Group sessions vary widely in intensity. Treating them uniformly produces broken plans.

**Default severity:** Standard.

### 4.18 Phase ramp caps [coaching-convention]
**Rule:** Week-over-week raw TSS ramp ≤15% for single-sport plans, ≤20% for tri plans.

**Science:** TrainingPeaks/Coggan framework default. Specific thresholds are coaching convention; the principle that progressive overload should be controlled is well-established. The 15-20% range is widely adopted but doesn't have specific injury-rate research validating these exact numbers.

**Default severity:** Hard rule. Validator rejects builds that exceed.

### 4.19 Long-run TSS share [coaching-convention]
**Rule:** Long run ≤30% of weekly raw TSS for single-sport. ≤30% of run-discipline raw TSS for tri (when run TSS ≥40). ≤40% of total weekly TSS as a floor for tri plans with very low run weeks.

**Science:** Daniels, Pfitzinger, Hudson all converge on a 25-30% guideline. Aggregated coaching observation about injury patterns rather than landmark research.

**Default severity:** Hard rule via floor rebuild loop.

### 4.20 Recovery week cadence [coaching-convention]
**Rule:** Build, base, and race_specific weeks must hit a recovery week within `blockSize + 1` (4+1 for 3:1, 3+1 for 2:1).

**Science:** 3:1 and 2:1 patterns are standard periodization. Specific cadences are convention; the principle that sustained progressive load requires periodic deload is well-established.

**Default severity:** Hard rule.

---

## 5. Advanced overrides (rule severity relaxes for qualifying profiles)

Some athletes can absorb more aggressive scheduling than defaults assume. These overrides relax specific rules when the athlete profile qualifies. **All gating thresholds below are [derived]** — starting defaults to be tuned over time as the system observes athlete responses.

**All thresholds in §5 should be configurable in code** (not magic numbers in rule logic). Recommended location: a `OVERRIDE_GATES` constants module that the rules engine reads.

### 5.1 24h lower-body → quality_bike gap (Rule 4.4 relaxation) [derived]
**Override:** ≥24h gap allowed instead of ≥48h.

**Science:** Trained cyclist research (de Souza 2007, others) shows 24h recovery is sufficient for sub-VO2 cycling. Threshold work specifically (not VO2) is feasible 24h post heavy lower for trained athletes.

**Profile gates (configurable defaults):**
- Age < `OVERRIDE_5_1_AGE_MAX` (default 40)
- Years consistent training ≥ `OVERRIDE_5_1_HISTORY_MIN` (default 3)
- No recent lower-body injury
- Last lower session RPE ≤ `OVERRIDE_5_1_RPE_MAX` (default 7)
- Quality_bike intensity ≤ threshold (not VO2)

### 5.2 Same-day lower + quality_run (consolidated hard day) [derived]
**Override:** Lower_body_strength + quality_run same day allowed (AM run / PM lift).

**Science:** Concentrated hard-day pattern used by elite athletes. Concentrates fatigue into one day to free other days for full recovery.

**Profile gates (configurable defaults):**
- Training intent = performance
- Strength intent = co-equal
- Age < `OVERRIDE_5_2_AGE_MAX` (default 50)
- Years consistent ≥ `OVERRIDE_5_2_HISTORY_MIN` (default 4)
- CTL ≥ `OVERRIDE_5_2_CTL_MIN` (default 75)
- No recent lower injury

**Caveat:** Next day must be easy or rest. Cannot stack consolidated hard days.

### 5.3 Quality_run + quality_swim same day before long-day [derived]
**Override:** Stacking allowed when next day is long_ride or long_run.

**Science:** Cumulative-fatigue block patterns are legitimate periodization (Friel, others). Compounds fatigue into the long day intentionally. Acceptable for athletes with the base to absorb.

**Profile gates (configurable defaults):**
- Age < `OVERRIDE_5_3_AGE_MAX` (default 45)
- Years consistent tri ≥ `OVERRIDE_5_3_HISTORY_MIN` (default 4)
- CTL ≥ `OVERRIDE_5_3_CTL_MIN` (default 85)
- Last quality_run RPE ≤ `OVERRIDE_5_3_RPE_MAX_RUN` (default 7)
- Last quality_swim RPE ≤ `OVERRIDE_5_3_RPE_MAX_SWIM` (default 6)

**Caveat:** Long day intensity capped at endurance pace (no race-pace efforts) when this override fires.

### 5.4 Block training (consecutive HARD days) [derived]
**Override:** 3-4 consecutive quality sessions in a single week, violating standard hard-easy alternation.

**Science:** Block periodization (Issurin, Verkhoshansky) is established for elite endurance athletes. Concentrated overload + deep recovery exploits supercompensation. Less validated for amateurs at scale but real.

**Profile gates (configurable defaults):**
- Age < `OVERRIDE_5_4_AGE_MAX` (default 50)
- Years consistent ≥ `OVERRIDE_5_4_HISTORY_MIN` (default 5)
- CTL ≥ `OVERRIDE_5_4_CTL_MIN` (default 90)
- No recent injury
- Has used block training before (system observation) OR explicit informed-consent UI opt-in

**Required caveats:**
- Recovery week must be locked in immediately following
- Athlete acknowledges this is more aggressive than standard
- System monitors RPE; pulls plug if recovery markers degrade

### 5.5 ≥2-day strength spacing (Rule 4.6 relaxation) [coaching-convention]
**Override:** Upper + lower spaced ≥2 days instead of ≥3 days.

**Science:** Functional minimum for non-overlapping muscle groups; well-supported for short sessions.

**Profile gates (configurable defaults):**
- Age < `OVERRIDE_5_5_AGE_MAX` (default 50)
- Years consistent strength ≥ `OVERRIDE_5_5_HISTORY_MIN` (default 2)
- Upper session ≤ `OVERRIDE_5_5_UPPER_MAX_MIN` (default 45 min)
- Lower session ≤ `OVERRIDE_5_5_LOWER_MAX_MIN` (default 60 min)

### 5.6 Volume-tolerant (high-history low-CTL athlete) [derived]
**Override:** Standard rules apply but volume can be higher than CTL alone would suggest.

**Science:** Connective tissue, mitochondrial density, and motor patterns built over years persist through detraining. CTL underestimates capacity for these athletes.

**Profile gates (configurable defaults):**
- Years consistent ≥ `OVERRIDE_5_6_HISTORY_MIN` (default 8)
- Lifetime peak CTL ≥ `OVERRIDE_5_6_PEAK_CTL_MIN` (default 100)
- No recent injury

**Caveat:** Volume only — intensity ceilings (per §5.7) still apply per age.

### 5.7 Older but trained (intensity ceiling adjustment) [consensus]
**Override:** Volume rules unchanged; intensity ceilings shifted down.

**Science:** Masters endurance research (Tanaka & Seals 2008, Joyner, Coggan) consistently shows VO2max-targeting work has diminishing returns and slower recovery in older athletes. Threshold/sweet-spot work preserves more of its effectiveness with age. Volume tolerance preserved longer than intensity tolerance.

**Profile gates:**
- Age ≥ `OVERRIDE_5_7_AGE_MIN` (default 60), regardless of history

**Behavior:** VO2 sessions become threshold sessions for these athletes unless they explicitly request VO2.

---

## 6. Conflict resolution

When constraints cannot all be satisfied:

### 6.1 Solver order

1. Place hard constraints (§3) first. Failures here = no plan.
2. Place anchored sessions (long-day pair, pinned group sessions). Failures here = surface to user, ask to relax pin.
3. Place standard-rule sessions (§4) using athlete-preferred days as solver hints.
4. If standard placement fails, check if profile qualifies for advanced overrides (§5). If yes, retry with relaxed rules.
5. If still failing, identify the lowest-cost rule to relax and present tradeoff to user.

### 6.2 Relaxation cost ordering

When the engine must relax a rule, it relaxes in this order (lowest training cost first):

1. Drop a soft preference (preferred day → next-best day)
2. Reduce strength frequency (2× → 1×, or skip a slot)
3. Reduce quality_swim frequency
4. Move quality_run by 1 day (if it doesn't violate hard rules)
5. Allow consolidated hard day (if profile permits)
6. Reduce a quality session intensity (VO2 → threshold)
7. Skip a quality session entirely
8. Last resort: violate a soft rule with explicit user acknowledgment

### 6.3 Tradeoff communication

Every relaxation must surface to the user. The plan generation response includes:

- The plan that was produced
- Which rules were relaxed and why
- What was traded off
- Options the user can pick to retry with different relaxations

Example:
> "Your Tuesday lower-body preference conflicted with Wednesday's hammer-intensity group ride (need 48h gap).
>
> Plan generated: lower-body moved to Monday.
>
> Alternative options:
> - Move quality bike off Wednesday → keep Tuesday lower-body
> - Tag Wednesday group ride as tempo instead of hammer → Tuesday lower-body becomes possible
> - Drop second strength session this week → no scheduling conflict
> - Accept Monday lower-body (current plan)"

### 6.4 Monitoring guidance

Every plan that includes relaxed rules must tell the user what to watch for. The relaxation isn't just a tradeoff — it's a hypothesis that the athlete can absorb the compromise. The user is the one who validates or falsifies it.

For each relaxation surfaced to the user, the plan generation includes specific signals to monitor:

- Performance signals: long ride pace dropping more than expected, long run feeling heavier than effort suggests, quality session targets unreachable
- Recovery signals: elevated RPE on easy days, soreness lingering past 48h, sleep disruption, motivation dropping
- Pattern signals: skipping more sessions than usual, dreading specific days, accumulated fatigue across weeks

The monitoring guidance is plan-specific, not generic. If the engine compromised by stacking quality_run before long_ride, the guidance names *that compromise*: "watch for Saturday's first hour feeling heavier than usual." Generic "let us know if you feel tired" is not adequate.

### 6.5 Feedback loop

Athlete feedback on monitored signals adjusts next-week plan generation.

When the engine compromises this week to honor an anchor or accommodate a constraint, it logs:
- What was compromised
- Why (which anchor or constraint forced the compromise)
- What signals to monitor

Next week, when the engine reads recent PostWorkoutFeedback data, it checks specifically against those logged signals. Two outcomes:

- **Signals confirmed compromise was absorbed:** Athlete reported normal RPE, expected pace, no unusual fatigue. The compromise pattern is sustainable for this athlete; next week can use the same pattern.

- **Signals confirmed compromise was too much:** Athlete reported elevated RPE, dropped pace, lingering fatigue. The compromise pattern is not sustainable; next week should compromise differently — typically by relaxing the anchor itself (suggest the user skip one group ride) or reducing total load.

The feedback loop is *not* a generic CTL/ATL adjustment. It's tied to the specific compromises the engine made, so the response is targeted.

### 6.6 User agency: direct plan editing

The athlete can edit any plan element directly when they judge the plan is too much (or too little). The system honors edits without arguing.

When a user edits a session, the system:
- Records the edit and the user's stated reason (if provided)
- Updates downstream sessions to maintain rule compliance (e.g. if user moves quality run to Wednesday, the engine reshuffles to maintain spacing)
- Surfaces any new tradeoffs created by the edit
- Treats the edit as signal for future plan generation (this athlete prefers / needs X pattern)

User edits are first-class data. They're not corrections to a "correct" plan — they're the athlete's lived knowledge of what works for their body and life. The engine should learn from them.

---

## 7. Tradeoff vocabulary

The system speaks in athlete-readable language, not engineering language. Three contexts have distinct tone requirements.

### 7.1 Standard tradeoffs (engine-driven compromises)

When the engine relaxed a rule due to constraint conflict, language is direct and informative:

**Good:**
- "We moved your quality run to Thursday because Wednesday's group ride is tagged as a hammer session, which needs 48 hours of recovery before another hard effort."
- "Your preferred Friday strength day conflicts with Saturday's long ride. We can keep Friday strength if you accept that Saturday's ride will feel heavier than usual, or move strength to Wednesday."

**Bad:**
- "Conflict: lower_body_strength × long_ride 48h gap violation"
- "Constraint relaxed: allowConsolidatedHardException"

### 7.2 Social anchor tradeoffs

When the engine compromises to honor a user-pinned social session (group ride, group run, masters swim, club workout), the tone shifts. The anchor isn't a constraint to work around — it's a choice the athlete made for legitimate reasons. Language acknowledges the choice and explains the cost without lecturing.

**Good:**
- "This week is shaped around your Wednesday group ride. To fit the ride and your Sat/Sun long days, we moved quality run to Tuesday and dropped lower-body strength to 1×. Watch for Saturday's first hour feeling heavier than usual — if it consistently does, we'll adjust."
- "Your Saturday club run is your anchor. We've kept it as quality and adjusted everything else around it. The compromise this week: Sunday's ride is shorter than ideal for build phase. If you feel like you're not building enough cycling fitness, we can suggest moving the club run to a recovery week."
- "Holding your Wednesday group ride as a hammer session means Thursday is recovery and Friday is your only quality run option. That stacks fatigue into Saturday's long ride. This is reasonable for 4-6 weeks. If we hold it longer, watch for accumulated fatigue across multiple weekends."

**Bad:**
- "Your Wednesday group ride is causing scheduling conflicts." (frames the user's choice as the problem)
- "We had to drop your strength session because of your group ride." (passive blame)
- "For optimal training, consider removing your group ride." (lectures)

### 7.3 Advanced override tradeoffs

When the engine activates an advanced override per §5, language explains the more aggressive plan and what the athlete is signing up for:

**Good:**
- "This week is more aggressive than your standard plan. We're using a block training pattern that requires next week to be a deep recovery week. You have the history to absorb this, but the recovery week is non-negotiable."
- "We're stacking your quality run and quality swim on Tuesday because your CTL and recent recovery support it. If Wednesday feels heavier than expected, that's the signal to back off."

**Bad:**
- "Override 5.4 activated: block_training_pattern."
- "Profile gates passed; aggressive scheduling enabled."

### 7.4 Vocabulary principles

Across all three contexts:

- The engineering language stays in code; the athlete language stays in plan output.
- Acknowledge user choices as legitimate before naming costs.
- Name specific signals to watch for, not generic "feel free to give feedback."
- Bound the timeframe ("for 4-6 weeks") rather than imply indefinite acceptance.
- Offer paths back if the compromise stops working ("we can adjust if X").

---

## 8. Same-day session compatibility matrix

Updated matrix incorporating all decisions from §4 and §5. ✓ = always allowed. ✗ = never allowed. ⚠ = conditionally allowed (see notes).

|                       | easy_bike | easy_run | easy_swim | quality_swim | quality_bike | quality_run | long_ride | long_run | lower_body_strength | upper_body_strength |
|-----------------------|-----------|----------|-----------|--------------|--------------|-------------|-----------|----------|---------------------|---------------------|
| **easy_bike**         | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| **easy_run**          | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ⚠¹ | ✗ |
| **easy_swim**         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| **quality_swim**      | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠² | ✗ | ✗ | ✓ | ✓ |
| **quality_bike**      | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **quality_run**       | ✓ | ✗ | ✓ | ⚠² | ✗ | ✗ | ✗ | ✗ | ⚠³ | ✓ |
| **long_ride**         | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **long_run**          | ✗ | ✗ | ⚠⁴ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **lower_body_strength** | ✓ | ⚠¹ | ✓ | ✓ | ✗ | ⚠³ | ✗ | ✗ | ✗ | ✓ |
| **upper_body_strength** | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |

**Conditional notes:**

¹ Lower-body strength + easy_run: allowed if easy_run ≤45min and ≤Z2. Lift-first order recommended (avoids pre-fatiguing legs for the lifting stimulus). Not allowed for longer or harder runs. [coaching-convention]

² Quality_run + quality_swim: allowed when training_intent = performance OR strength_intent = co-equal, AND next day is not long_ride or long_run. Override 5.3 may relax the next-day restriction for qualifying profiles. [coaching-convention]

³ Lower_body_strength + quality_run: allowed only under override 5.2 (consolidated hard day) for qualifying performance + co-equal profiles. Otherwise disallowed. [derived]

⁴ Long_run + easy_swim: disallowed by default. Allowed for tri-specific kick-focus swim ≤2000yd flagged `kick_tri_long_course`. [coaching-convention]

---

## 9. Athlete-anchor placement

Defaults are solver hints, not requirements. The athlete's anchors and work schedule drive actual placement.

### 9.1 Long-day pair
Athlete-specified 2-day window. Defaults to Sat/Sun. Common alternatives:
- Sun/Mon (Saturday workers)
- Tue/Wed (weekend workers in hospitality, healthcare)
- Wed/Thu (Friday-Sunday workers)

The pair must be 2 consecutive days. Long_ride first, long_run second is the canonical order; flipping is allowed but increases lower-body fatigue burden on the second day.

### 9.2 Group sessions
Athlete-pinned by day, by intensity tag, and by sport. Engine treats the pinned slot as immovable. Other sessions cascade around it.

### 9.3 Quality sessions
- Quality_bike: defaults to "anchor +2 days" (Tuesday for Sat/Sun pair). Solver may move based on group session pinning.
- Quality_run: solver-placed respecting all gaps. Defaults to ≥48h after quality_bike, ≥48h before long_run, ≥48h after long_run.

### 9.4 Strength
- Upper: athlete-preferred days, defaults to Mon and/or Thu.
- Lower: athlete-preferred days, defaults to Tue or Fri (with appropriate gaps from long-day pair).
- 48h gaps from long-days drive placement; preferred days drive within that constraint.

### 9.5 Easy sessions
Filler. Placed in remaining slots respecting hard-easy alternation. No specific day requirements.

---

## 10. Discipline-specific branches

### 10.1 Triathlon
- Brick required per §4.12.
- Limiter shifts: limiter sport gets +0.07 weekly TSS share, capped at 0.65; other sports reduce equally.
- Swim frequency by intent: 2× standard, 3× when swim_intent = focus.
- Long-ride caps: hours capped to `max(race_bike_duration × 0.8, min(race_bike_duration × 1.1, weekly_hours × 0.45))`.
- Pre-race-week long_run cap: ≤5mi in taper for tri (not race week).

### 10.2 Run-only
- Long-run share cap is 30% of weekly TSS (Rule 4.19).
- Strength integration depends on intent:
  - Co-equal: 2× per week (1 upper, 1 lower) with 5.2 override available
  - Supplementary: 1-2× per week, never compromising run quality
  - None: 0×

### 10.3 Multi-event sequencing
When 2+ A races in a season:
- ≤4 weeks apart: shared peak block, separate tapers.
- 4-8 weeks: compressed; abbreviated build between.
- 8-16 weeks: overlapping; full taper + recovery + abbreviated build.
- >16 weeks: sequential; full macrocycle for each.

Inter-race recovery weeks per `recoveryWeeksPostRace(distance, priority)`. Cannot taper → build without recovery in between.

---

## 11. Audit and transparency

Every plan generation logs:

- **Athlete profile read:** Which fields were present, which used the conservative default.
- **Rules fired:** Which rules from §3, §4, §5 applied to this plan.
- **Overrides activated:** Which advanced overrides the profile qualified for.
- **Tradeoffs surfaced:** Which rules were relaxed and why.
- **Monitoring guidance issued:** What signals the user was told to watch for, tied to specific compromises.
- **Constraint failures:** Any hard rule that couldn't be satisfied (should be empty for shipped plans).
- **Solver passes:** Which optimizer/builder paths ran, and any fallbacks that triggered.
- **User edits:** Any direct edits the user made to the plan, with stated reasons if provided.

The audit log is the source of truth for the coach surface ("Why does my Tuesday have a recovery run?") and for the feedback loop (§6.5). When next week's plan generation reads recent PostWorkoutFeedback, it cross-references against this week's audit log to determine which compromises were absorbed and which weren't.

The athlete can view a simplified version of the audit on demand: which compromises were made, what signals to watch for, what feedback they've given, and how next week's plan reflects that feedback. This is the transparency contract — the system explains itself, and the athlete has visibility into their own training response over time.

---

## 12. Implementation gaps

Cross-referenced to `docs/SCHEDULING-RULES-EXTRACTED.md` findings.

### 12.1 Closed in the 2026-05-09 consolidation pass

- **Optimizer is the sole scheduling authority.** Builder no longer schedules — it consumes optimizer-derived day assignments via `AthleteState.strength_optimizer_slots` and the reconciler-populated `bike_quality_day` / `bike_easy_day` / `run_quality_day` / `swim_*_day` fields. The "two engines disagree" failure mode that motivated this doc is gone for the reconciled path.
- **Reconciler runs unconditionally inside `generate-combined-plan`** (tri and single-sport). It self-short-circuits when `long_run_day` is missing; the builder's legacy fallback path runs only in that contained edge case.
- **§4.4 lower-body strength → quality_bike 48h gap** is enforced bidirectionally in `sequentialOk`. `SEQUENTIAL_RULES_TEXT` prose updated to match (closes Finding 8).
- **§4.11 quality_run + quality_swim same-day rule** moved to the optimizer's `canPlaceWithModifier` with the next-day-long check. Builder's tri-blanket override removed.
- **§4.15 strength_preferred_days** plumbed through `WeekOptimizerInputs.preferences` into the optimizer's strength placement; rejections surfaced in `conflicts[]` and the reconciler telemetry log. Builder's preferred-days filter removed.
- **Builder cleanup:** ~557 lines of anchor-bumping, lower-body 48h floor, density guards, and the "drop guards and place anyway" fallback chain deleted. Builder header rewritten to reflect optimizer-owned scheduling.
- **Partial dead-code removal:** `PREF_KEEP_QUALITY_RUN_ACTIONS`, `groupRideRouteHighVerticalStress` import, `brickDaysSet`/`brickDaysSetForQr`, the second-pass swim-quality-vs-run-quality safety guard, and several stranded `let` declarations all removed.

### 12.2 Remaining gaps

1. **Athlete profile gating (§5)** — Rules engine still profile-blind. Must read age, history, CTL, injury flags, recovery markers and apply override tiers. **All gating thresholds must be configurable** via an `OVERRIDE_GATES` constants module, not embedded in rule logic. Override 5.5 (≥2-day strength spacing) is the most adjacent to consolidated work.

2. **Group session intensity tagging (§4.17)** — User-facing input + plan engine routing. Currently group sessions are typed by sport only.

3. **Long-day pair as athlete input (§4.16, §9.1)** — Replace Sat/Sun assumption with `long_day_pair` user input. Default to Sat/Sun, allow override.

4. **Tradeoff communication UX (§6.3, §7)** — Optimizer now surfaces rejections in `conflicts[]` / `trade_offs[]` and the reconciler logs them; the rich athlete-facing options-with-paths-back UI from §6.3 / §7.2 is not wired.

5. **Monitoring guidance + feedback loop (§6.4, §6.5)** — Audit log structure exists in concept (`week_trade_offs`, `conflict_events`) but plan-specific monitoring signals and the next-week feedback loop are not yet implemented.

6. **Direct user plan editing (§6.6)** — Edit-with-reshuffle and edit-as-signal are not yet implemented. Out of scope for the rules engine; a UI surface concern.

7. **Audit transparency (§11)** — Current `console.log` telemetry from the reconciler covers a subset; the structured per-plan audit log including profile reads, rules fired, and override gating decisions is not yet built.

8. **Dead code remaining** (Findings 1, 2, 14):
   - `validator.ts:267` `tss_within_budget: true` is hardcoded; `checkTSSWithinBudget` (`validator.ts:69-77`) is unreachable. Either re-enable or delete.
   - `week-builder.ts:2174` passes `allowConsolidatedHardException = false` literal; the exception branch in `enforceHardEasy` (`week-builder.ts:323-324`) is unreachable from this call site.
   - Diagonal cells in the `ROWS` matrix are short-circuited at `schedule-session-constraints.ts:144`; their values are dead lookups.

9. **Doc/code reconciliation residual** (Findings 3, 9):
   - `.cursor/rules/lower-body-strength-pairing.mdc:13-16` lists easy run as an allowed lower-body partner; the matrix at `schedule-session-constraints.ts:56` says `lower_body_strength × easy_run = 0`. Conditional ⚠¹ in §8 of this doc is the resolution; the cursor rule needs to be reconciled to match.
   - `STRENGTH_FREQUENCY_RULES_TEXT` mentions "If Wed = quality_bike, Wed must be upper-only" in prose; no standalone Wed-specific code path exists. The matrix already enforces this implicitly via `quality_bike × lower_body_strength = 0`, so the prose is informational only — verify and either remove or reword.

10. **Soft-validation visibility** (Finding 12) — Validator failures from `validatePlan` log to `console.warn` (`generate-combined-plan/index.ts:204-209`) but ship the plan. Per §6.3 these should surface to the user with options.

11. **TSS within budget validator** (overlaps with item 8 above) — see Finding 1.

---

End of document.
