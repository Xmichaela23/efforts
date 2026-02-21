# Triathlon Plan Generation — Domain Knowledge

Preserved from `SimplePlanBuilder.tsx`, `TrainingEngine.ts`, `Seventy3Template.ts`, and `StrengthTemplate.ts` before deletion. These files implemented client-side triathlon plan generation. The architecture was wrong (client as brain), but the training science is worth keeping for when triathlon gets added to PlanWizard as a server-side flow.

## Architectural Principle

**The client is UI, not brain.** PlanWizard collects inputs and ships them to `generate-run-plan` on the server. When triathlon is added, it should follow the same pattern: new wizard steps to collect tri-specific inputs, then a `generate-tri-plan` edge function does the rest. The client never needs to know how a 70.3 plan is structured.

---

## Wizard Inputs Needed for Triathlon

### Distance
- Sprint Triathlon (1–1.5 hours race, 8–12 weeks training)
- 70.3 / Half Ironman (4–6 hours race, 12–16 weeks training)

### Multi-Discipline Baselines
- **Cycling**: FTP (Functional Threshold Power) — required for all power-based bike prescriptions
- **Running**: 5K time or easy pace — same as current PlanWizard
- **Swimming**: 100m/100yd pace — required for swim workout prescriptions
- **Strength**: Squat/Deadlift/Bench 1RMs — same as current PlanWizard (if strength integration selected)

### Time Commitment Tiers (calibrated for triathlon volume)
| Tier | Hours/Week | Notes |
|------|-----------|-------|
| Minimum | 8–10h | First-time 70.3, honors scheduling limitations |
| Moderate | 10–12h | Consistent training, balanced |
| Serious | 12–14h | Experienced, performance focus |
| Maximum | 14–16h | Advanced, multiple 70.3s completed |

### Strength Integration Options
- **None**: Pure endurance focus, 0 additional hours
- **Traditional (2x/week)**: Upper/lower split, +1.8h/week
- **Cowboy (3x/week)**: 2 functional + 1 upper body/aesthetics day, +2.2h/week. Requires Moderate+ time commitment.

### Long Session Scheduling
- Default: Long bike Saturday, long run Sunday
- Custom: User picks both days
- Constraint: Strength sessions should not be adjacent to long sessions. Lower body strength needs 48h separation from long bike/run.

### Recovery Preference
- Active / Rest / Mixed

---

## Periodization Model

12-week cycle with 4 phases:

| Phase | Weeks | Focus | Volume Multiplier |
|-------|-------|-------|-------------------|
| Base | 1–4 | Aerobic foundation | 0.90 → 0.99 (gentle ramp) |
| Build | 5–8 | Intensity + specificity | 1.03 → 1.15 |
| Peak | 9–11 | Race-specific | 1.16 → 1.20 |
| Taper | 12 | Reduce volume, maintain intensity | 0.65 |

### Intensity Distribution (80/20 Polarized — Matt Fitzgerald / David Warden)
| Phase | Zone 2 (easy) | Zone 3+ (hard) |
|-------|--------------|----------------|
| Base | 70–85% | 15–30% |
| Build | 50–70% | 30–50% |
| Peak | 40–60% | 40–60% |
| Taper | 70–85% | 15–30% |

### Session Type Introduction Timing
- **Threshold**: Introduce in base phase (weeks 3–5)
- **Race-pace**: Introduce in build phase (weeks 6–8)
- **Brick sessions**: Introduce in build phase (weeks 6–8)
- **VO2max**: Introduce in peak phase (weeks 9–11)

---

## 70.3 Weekly Template (Base Phase Example)

| Day | Discipline | Type | Duration | Intensity |
|-----|-----------|------|----------|-----------|
| Mon | Swim | Endurance | 60min | Zone 2 |
| Tue | Bike | Tempo | 75min | Zone 3 |
| Wed | Run | Endurance | 60min | Zone 2 |
| Thu | Swim | Tempo | 45min | Zone 3 |
| Fri | Bike | Endurance | 75min | Zone 2 |
| Sat | Bike | Long | 120min | Zone 2 |
| Sun | Run | Long | 90min | Zone 2 |

### Long Session Progression by Phase
| Discipline | Base | Build | Peak |
|-----------|------|-------|------|
| Bike | 90–150min | 120–180min | 150–210min |
| Run | 60–90min | 90–120min | 120–150min |
| Swim | 45–75min | 60–90min | 75–105min |

### Minimum Sessions per Discipline (70.3)
- Swim: 2/week
- Bike: 3/week (2 in taper)
- Run: 2/week

---

## Brick Workouts

Bike-to-run transitions specific to triathlon:
- Split: 60% bike / 40% run
- Bike at Zone 2 power (65–75% FTP)
- Run at easy pace
- 2-minute transition between

---

## Fitness Scaling (FTP-based)

| FTP | Level | Volume Multiplier |
|-----|-------|-------------------|
| 280+ | Elite (Cat 1–2) | 1.3x |
| 250–279 | High (Cat 3) | 1.2x |
| 200–249 | Medium (Cat 4–5) | 1.1x |
| 150–199 | Average (recreational) | 1.0x |
| 100–149 | Developing | 0.9x |
| <100 | Insufficient for 70.3 | Reject — needs base building |

---

## Strength-Endurance Integration Rules

### Interference Management
- Lower body strength on same day as bike/run: reduce endurance volume to 70%
- Upper body strength on same day as bike/run: reduce endurance volume to 90%
- Functional strength on same day as bike/run: reduce endurance volume to 95%
- Swim has minimal interference with strength

### Strength Session Spacing
- Lower body: 48h minimum between sessions
- Upper body: 24h minimum
- Functional: 24h minimum (can integrate well)
- Max 4 strength sessions/week for endurance athletes

### Phase-Based Strength Adjustments
- **Base**: Conservative progression (60–65% 1RM, higher reps)
- **Build**: Moderate progression (65–70% 1RM)
- **Peak**: Reduce strength intensity (80% of prescribed weight, 80% of reps)
- **Taper**: Minimal — 1 session/week max, bodyweight only

### Progressive Overload
- 2.5% weekly increase, capped by phase (base: 15%, build: 25%, peak: 30%)
- Taper reduces by 20% from current level

---

## Swim Workout Prescriptions

All based on 100yd/100m pace input:
- **Endurance**: Main set at pace ±5sec/100, 30s rest
- **Tempo**: 10–15sec faster than endurance pace, 45s rest
- **Threshold**: At tempo range, 30s rest, shorter intervals (100s)
- Typical volumes: 1500–2500 yards for a 60min session
- Structure: 200yd warmup + 4x50 drills + main set + 200yd cooldown
- Progressive drill system rotates every 4 weeks by phase

## Bike Workout Prescriptions

All based on FTP:
- **Endurance**: Zone 2 = 65–75% FTP
- **Tempo**: 82–88% FTP
- **Threshold**: 88–95% FTP, cap total work at 30–40min, 10–12min reps
- **VO2max**: 105–115% FTP, cap total work at 24–30min, 3–5min reps with 1:1 recovery

## Run Workout Prescriptions

Based on 5K pace and easy pace:
- **Tempo**: ~108% of 5K pace (slower than 5K)
- **Threshold**: ~110% of 5K pace
- **VO2max**: ~97% of 5K pace, cap at 18–24min total, 3min reps

---

## References
- Matt Fitzgerald & David Warden, *80/20 Triathlon* (2019)
- Lauersen et al. (2014) — strength training for endurance athletes
- Beattie et al. (2017) — strength session distribution
- Stephen Seiler — 80/20 polarized training model
