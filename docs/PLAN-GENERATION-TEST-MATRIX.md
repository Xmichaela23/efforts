# Efforts — Plan Generation Test Matrix

How we verify the plan engine works across every combination of athlete configuration. This is the answer to "how do we really know all these are working for all the various wizard combos."

**Not yet implemented.** This spec captures the design so it doesn't get forgotten while we finish the polish punch list. Implementation comes AFTER items 1-5 are complete — snapshotting incomplete behavior would freeze in bugs.

Last updated: May 10, 2026

---

## 0. Why this exists

The plan engine has many input dimensions:

- Race distance (sprint / oly / 70.3 / full)
- Plan length (9 / 12 / 17 / 18 / 24 weeks)
- Race structure (single A / B+A / A+A)
- Weekly hours (4-20 in 1-hour increments)
- Strength intent (none / support / co-equal)
- Equipment tier (full_barbell / dumbbell / bodyweight+bands)
- DB max (when applicable)
- 1RM presence (all / partial / none)
- Pull-up bar yes/no, Bench yes/no, Kettlebell yes/no, Box yes/no
- Athlete history (recent run/ride volumes, fitness level)
- Anchors (group ride / long run day / strength preferred days)
- Tri approach (race_peak / season_arc / build_only)
- Limiter sport (swim / bike / run)

Cartesian product of all dimensions is thousands of combinations. Manual testing doesn't scale. Without automated verification, regressions ship silently because no human will test every combination on every commit.

The test matrix is how we know the engine works for every athlete the wizard might produce.

---

## 1. Three layers of verification

### Layer 1: Invariant assertions (fast feedback, every commit)

Expand the existing 186-test contract suite to cover invariants that must hold for ANY generated plan:

- No NaN, undefined, or "0 lb" in any session field
- No empty strings where session names or descriptions are required
- Strength loads scale monotonically within a phase (except deload weeks)
- Equipment-gated exercises never appear when athlete lacks the equipment
- Substitution chains fire correctly (e.g., no DB Bench Press when no bench)
- Phase transitions are coherent (no base → race_specific without build between)
- Post-race rebuild lands in expected ranges (rebuild × 0.90-0.95 of pre-race peak)
- Race weeks have correct structure (taper Wed, race Sun, no quality sessions)
- Weekly TSS within sanity bounds for the hours tier
- Trade-off messages refer only to fields that exist
- Drill tokens render with display names, not raw underscored strings
- Equipment lines don't duplicate within a session
- All required prescription fields present (sets, reps, load, RIR, tempo for strength)

Run on every commit. Fast (< 30 sec). Catches the obvious class of regressions.

### Layer 2: Archetype snapshots (per-commit diff review)

Define 10 canonical athlete archetypes covering the dimension space. Generate each plan, save the markdown output as a snapshot. On every regeneration: diff against snapshot, surface unexpected changes for review.

**Archetypes:**

| # | Profile | Distance | Hours | Strength | Equipment | Plan Length |
|---|---|---|---|---|---|---|
| 1 | Beginner 70.3 | 70.3 | 8 | support | bodyweight+bands | 17 wk |
| 2 | Intermediate 70.3 co-equal (Michael) | 70.3 | 11 | co-equal | full_barbell home | 18 wk B+A |
| 3 | Advanced 70.3 DB | 70.3 | 14 | co-equal | dumbbell_based | 17 wk |
| 4 | Sprint athlete | sprint | 6 | none | n/a | 12 wk |
| 5 | Oly DB support | oly | 9 | support | dumbbell_based | 14 wk |
| 6 | Full IM full barbell | full | 16 | co-equal | full_barbell | 24 wk |
| 7 | Multi-race B+A | 70.3 | 11 | co-equal | full_barbell | 22 wk |
| 8 | Late entry fit | 70.3 | 12 | support | dumbbell_based | 9 wk |
| 9 | Returning from injury | 70.3 | 9 | support | bodyweight+bands | 17 wk |
| 10 | High-volume year-round | 70.3 | 18 | co-equal | full_barbell | 24 wk |

Snapshot tests catch unintended changes. Intentional changes get the snapshot updated as part of the PR. Reviewer sees the diff and confirms it's intentional before merge.

### Layer 3: Edge case probes (manual or scripted)

Specific combinations that historically broke. Probe them explicitly:

- Bodyweight-only athlete picking co-equal performance → must gate to durability with trade-off
- 1RM data missing → must surface conservative defaults trade-off
- DB max binding (athlete's DB cap exceeds 78% target) → reps must scale to compensate
- Recent volume > 2× spec floor → history-aware floor must engage, capped at race-specific peak
- Plan starts mid-phase (athlete signs up Week 4 of a 12-week target) → engine handles partial plan generation
- Race week exactly aligns with weekly long ride day → conflict resolution
- B-race at end of base phase → rebuild block must emit
- 9-week plan → base phase is skipped, trade-off must surface
- Two strength sessions can't fit anchors → reconciler emits ≥2-day fallback with trade-off
- Strength intent changes mid-plan (athlete edits wizard) → does engine regenerate cleanly?

---

## 2. Implementation strategy

### 2.1 Test harness lives in deno tests

Existing pattern: `supabase/functions/generate-combined-plan/*.test.ts`. Add:

- `archetype-snapshots.test.ts` — 10 archetypes, snapshot diffing
- `plan-invariants.test.ts` — invariants across all generated plans
- `edge-case-probes.test.ts` — historical-bug regression tests

### 2.2 Generation through real edge function

Tests should call `generate-combined-plan` end-to-end via test harness — NOT mock the engine. We're verifying the whole stack works, not unit-testing parts.

### 2.3 Snapshot format

Snapshots = full markdown plan export. Stored in `supabase/functions/generate-combined-plan/__snapshots__/archetype-N.md`. Diff readable in PR review.

### 2.4 Failure surfaces

When snapshot diff appears in CI:
- If diff is expected (intentional change) → update snapshot, note in PR description
- If diff is unexpected → investigate before merge
- Auto-comment on PR with diff summary so reviewer can scan quickly

### 2.5 Performance budget

Full matrix test runs every commit. Must complete in < 5 minutes. Each archetype generation should take < 30 sec. If too slow, parallelize or run reduced set on every commit, full matrix nightly.

---

## 3. What gets caught (and what doesn't)

### Catches:
- Regression in any archetype's plan output
- Equipment gating breaking
- Phase classification regressions (rebuild, recovery, taper)
- Strength load math errors
- Drill token rendering issues
- Equipment line duplication
- Missing fields, NaN, undefined values
- Wrong sport's metrics on a session
- Tradeoff messages referring to nonexistent fields

### Doesn't catch:
- Wizard UI bugs (separate test layer needed — Playwright or similar)
- Visual/CSS regressions
- Mobile-specific rendering
- Real-world coaching judgment ("this looks right" requires human eyes)
- Performance/load on the edge function under high traffic
- Database migration issues
- Auth/permissions

For those, additional test layers needed beyond this matrix.

---

## 4. When to build this

**Not yet.** Build the matrix after:

- Item 1 strength: 100% (one materialize-plan deferred item closes)
- Item 2 swim: 100% (Week 7 bug, race-spec yardage, drill rotation, equipment line dedup, drill token wiring, missing session types, CSS standardization)
- Item 3 cycling: 100% (CYCLING-PROTOCOL.md spec written, audit done, fixes shipped)
- Item 4 wizard clarity: 100% (all steps audited)
- Item 5 every question delivers something: 100% (end-to-end audit done)

Why wait: snapshotting incomplete behavior freezes bugs in place. Better to finish each surface, then snapshot what good actually looks like.

After items 1-5 close, this becomes the next major lift. The investment pays off forever — every architectural fix from then on gets paired with snapshot updates, and regressions are caught before deploy.

---

## 5. Maintenance contract

Once built:

- Archetypes added when new dimension combinations become important
- Snapshots updated as part of PRs that change generation
- Invariants added when a class of bug is closed (codify the contract)
- Edge case probes added when historical bugs surface
- Nightly run on main branch ensures no drift

Test matrix is living infrastructure. It grows with the app.

---

## 6. Process pattern (when ready)

1. Build archetype definitions in code
2. Implement snapshot harness
3. Implement invariant assertions
4. Implement edge case probes
5. Generate initial snapshots — review each one manually for correctness
6. Commit snapshots as the baseline
7. Wire into CI so every commit runs the matrix
8. Document in CLAUDE.md so future Claude Code sessions know to update snapshots when generation changes

---

## 7. Done = confident in the engine

When this is built and green across every archetype, you can ship engine changes confidently. The matrix tells you whether the change broke any of the 10 athlete profiles. No more manual "let me regenerate Michael's plan and see if it looks right" — the test suite does that across 10 profiles automatically.

That's how you really know.
