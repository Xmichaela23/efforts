# FTP Cold-Start Spec
## Efforts — Cycling Baseline Onboarding

**Status:** Draft — 2026-05-26
**Scope:** New user FTP estimation at wizard time. Does not change the learned-FTP system for existing users.

---

## Problem

New users have no power history. The current system:

- `learned` FTP = null (no rides yet)
- `manual` FTP = whatever the user enters — most athletes don't know their FTP
- Fallback = hardcoded 200W in `compute-workout-analysis` (display-only, not used for planning)

Result: plan materialization falls through to null FTP, IF and power zone calculations are meaningless, and the first structured cycling session has no useful target.

---

## Design Principles

1. **Never leave FTP null for a new user.** A plausible estimate beats null or a hardcoded constant.
2. **The estimate should yield quickly to real data.** Once 2+ qualifying rides exist, `learned` overwrites the seed. The seed only needs to be good enough to make Week 1 useful.
3. **Don't ask athletes what they don't know.** "What's your FTP?" is the wrong question for most new users. Ask proxies.
4. **Cycling-specific.** Run threshold pace has a separate cold-start path. This spec is cycling only.

---

## Wizard Flow

### Gate condition
Only shown when `performance_numbers.ftp` is null AND `learned.ride_ftp_estimated` is null or low-confidence. Existing users with a learned FTP skip this entirely.

### Question sequence (cycling step in wizard)

**Q1 — Do you know your cycling FTP?**
> "FTP (Functional Threshold Power) is the average watts you can hold for ~60 minutes at max effort. If you've tested recently, enter it."

- [ ] Yes, I know it → input field (watts) → stored as `performance_numbers.ftp`, `source: 'manual'`
- [ ] No / not sure → proceed to Q2

**Q2 — How would you describe your cycling fitness?**
> "Be honest — this sets your initial training zones. The app will update it from your ride data."

- [ ] Just getting started (riding < 6 months or < 3 days/week)
- [ ] Recreational (comfortable on 1–2 hr rides, occasional group rides)
- [ ] Trained (regular structured training, race or event history)
- [ ] Competitive (consistent racing, FTP tests, power-based training)

**Q3 — Your weight** (if not already collected)
Already in wizard as part of strength/baselines step. Re-use existing value.

---

## Estimation Algorithm

### W/kg ranges by tier (sourced from Coggan Power Profile Table + USA Cycling benchmarks)

| Tier | Label | W/kg (untrained) | W/kg (trained within tier) | Notes |
|---|---|---|---|---|
| 1 | Just getting started | 1.5 | 2.0 | Use midpoint 1.75 |
| 2 | Recreational | 2.0 | 2.5 | Use midpoint 2.25 |
| 3 | Trained | 2.8 | 3.4 | Use midpoint 3.1 |
| 4 | Competitive | 3.5 | 4.5 | Use midpoint 4.0 |

**Formula:**
```
estimated_ftp_watts = midpoint_wkg × weight_kg
```

**Apply 0.90 conservative discount** — the wizard estimate is intentionally modest. It's easier to bump zones up after a strong first ride than to have Week 1 sessions feel impossible.

```
seeded_ftp = round(estimated_ftp_watts × 0.90)
```

**Example:** Recreational athlete, 78 kg → 2.25 × 78 × 0.90 = **158W**

### Storage

```typescript
user_baselines.learned_fitness.ride_ftp_estimated = {
  value: seededFtp,
  confidence: 'low',           // forces learned-low tier — real rides will overwrite
  source: 'wizard_estimated',  // new source label, distinct from 'coggan_20min' etc.
  sample_count: 0,
  estimated_at: new Date().toISOString()
}
```

`confidence: 'low'` is deliberate — the resolver already has a `learned-low` tier that permissive consumers (display, workload) will use, while quality-gated consumers (race projections, plan floor calculations) won't rely on it. As soon as `learn-fitness-profile` gets 2+ qualifying rides it overwrites with medium/high confidence and the seed is gone.

---

## Resolver Impact

No change to `resolve-current-ftp.ts` precedence order:

1. learned (medium/high) → wins
2. manual (> 0) → wins
3. **learned-low** ← seed lands here
4. null

The seed occupies slot 3 until real data arrives. If the athlete also entered a manual FTP (Q1 "yes"), that sits at slot 2 and wins over the seed.

---

## Consumer Behavior at Week 1

| Consumer | Behavior with seeded FTP |
|---|---|
| Power zone histogram | Uses seeded value — zones display, roughly correct |
| IF calculation | Uses seeded value — will read slightly low if athlete is stronger than estimated |
| Plan materialization | Uses seeded value for sweet-spot / threshold targets — conservative is fine |
| Race projections | Rejects low-confidence — shows "not enough data" instead of false precision |
| Fitness inference | Rejects low-confidence — same |

---

## UI Feedback

After the estimate is set, show inline in the wizard cycling step:

> "Starting FTP estimate: **158W** (2.3 W/kg). This updates automatically after your first few rides."

Link to a tooltip explaining what FTP is and that the app will refine it.

---

## When the Seed Gets Replaced

`learn-fitness-profile` runs after every sync milestone. After 2 qualifying rides (20-120 min, hard effort by HR or power threshold), it will produce a `confidence: 'medium'` estimate from the `95% of best 20-min power` or `95% of best NP` tier, which slots into position 1 of the resolver and permanently supersedes the seed.

Typical timeline for an active athlete: **2–4 weeks**.

---

## Out of Scope

- CSS (swim threshold pace) cold-start — separate spec
- Run threshold pace cold-start — separate spec
- FTP update UI (post-ride "your FTP may have changed" prompt) — separate spec
- Zwift / structured test integration — future; for now manual entry covers this
- Heart-rate-only FTP estimation (no power meter) — deferred; current user base assumed to have power

---

## Implementation Notes

**Files touched:**
- `ArcSetupWizard.tsx` — add cycling fitness tier question + conditional FTP entry field
- `TrainingBaselines.tsx` — add FTP field to the cycling baselines section (already has CSS pace)
- `learn-fitness-profile/index.ts` — add `wizard_estimated` as a valid source string; ensure it doesn't block the overwrite path
- `resolve-current-ftp.ts` — no changes needed; low-confidence learned already handled

**Migration:** no schema change. `learned_fitness` is already a JSONB column; `source: 'wizard_estimated'` is a new string value within existing shape.

**Test coverage needed:**
- Resolver correctly uses seeded low-confidence FTP when manual is null
- Resolver correctly prefers manual over seed when both present
- `learn-fitness-profile` overwrites seed once ≥2 qualifying rides exist
- Wizard renders FTP entry field when tier = "yes I know it", hides when tier selected

---

## Open Questions

- **Q: Should we show the estimated watts to the athlete in the wizard, or just use it silently?**
  Recommendation: show it. Transparency builds trust and gives athletes a number to react to ("that seems low — let me enter my actual FTP").

- **Q: What if the athlete has a power meter but zero qualifying rides in Efforts yet (just onboarded)?**
  Current answer: they land in the seed path. After 2 rides the learned system takes over. Acceptable.

- **Q: 0.90 conservative discount — right size?**
  To validate with first cohort of new users. If Week 1 sweet-spot sessions feel too easy, bump to 0.95.
