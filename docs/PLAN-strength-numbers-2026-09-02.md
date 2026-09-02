# PLAN — one source of truth for strength/pace numbers (2026-09-02)

**Origin.** Live audit of the real account (45d122e7) found the same number in three places, disagreeing:
deadlift **150** (typed at signup 2025-08) / **185** (shown, from logged sets) / **225** (learned baseline).
Michael: *"the product of features being added in true LLM slop… here we are in this mess."* This is
TRUTH-MAP fracture #1 (strength contradicts itself), now confirmed on live data.

## Shipped + verified today (2026-09-02)
- **The 225 was a 105×35 conditioning set run through a 1RM formula.** The learned-max writer skipped the
  ≤10-rep trust gate the display already uses. Fixed in `compute-facts` (pure `aggregateLearnedStrengthMaxes`
  in `strength-facts-lib.ts`), tested against the real logged sets, deployed, and **verified on the account:
  learned deadlift 225 → 185.** Squat 125 / bench 160 / OHP 110 all now from real work sets.
- Run card: `quality`→`hard`, fade/decoupling prose removed, real recorded pace surfaced (deployed).

## The model (industry standard — Strong/Hevy + Garmin/TrainingPeaks, researched 2026-09-02)
- Strength apps keep **no typed baseline** — logged sets are the source, e1RM updates automatically.
- Threshold apps **auto-detect + let you manually override**; the manual value **holds** until newer data
  passes it. Efforts already does this for FTP (`resolveCurrentFtp`, learned-first + adopt UI).
- So: **logged-from-your-lifts is the default; typed is a seed until logs exist; a manual override wins and
  holds; the app nudges when your lifts climb past what you set.**

## Two features, and they are DIFFERENT (Michael's split, 2026-09-02)
1. **Performance screen = edit the logged DATA.** Fix a mis-typed/mis-logged set at the source (e.g. the
   609-lb barbell row on 2026-02-16 that shows a fake 710 all-time best). Corrects the number, everything
   recomputes clean. Set-edit UI already exists (`StrengthLogger` / strength completed view) — verify it
   reaches a past workout and rewrites `exercise_log`.
2. **Baselines = override the COMPUTED number.** The app fills baselines from your lifts; you set your own if
   you disagree. Override UI largely exists (`TrainingBaselines.tsx` — FTP/HR overrides, strength 1RM fields,
   comment already says *"typed answers seed, logs decide"*).

## The one real fix + the wiring
- **A. Flip the authority (reverses D-231).** `capacity-resolver.ts` currently returns typed-wins. Make it
  **learned-first when trusted** (≥3 samples, ≥medium confidence, fresh — the gate is already written as
  `isTrustedAggregate`), typed as seed/fallback. Rewrite `capacity-resolver.test.ts` to the new precedence.
  Back-annotate D-231, add a new D-entry. ⚠️ Changes the coach's per-lift judgement (now grades against real
  strength — a correction).
- **B. Route the PLAN prescription through the resolver.** `materialize-plan` reads typed raw
  (`mergeAnchor1RmLb`), NOT the resolver — so plan weights won't move until this is wired. This is what makes
  prescribed weights climb 150→185 to match reality. Higher risk (touches plan gen) — do after A, verify with
  a recompute.
- **C. The AUTO / LOCKED switch (Michael's ruling 2026-09-02, = the Garmin model).** Each number is either
  **auto** (default — the trusted learned value) or **locked** (the user set it; learning never touches it
  until they change it or flip back to auto). No date arbitration, no silent picking — the user owns the choice.
  Store a `locked_baselines` map on `user_baselines` (presence = locked to that value; absence = auto). Resolver
  precedence becomes **locked > trusted-learned (auto) > typed-seed**. Strong keeps NO manual number (log is
  truth); Garmin/TP use exactly this auto-detect-on/off switch — researched 2026-09-02.

  ⛔ **THE GUARD THIS REVERSES — do not lose it.** `capacity-resolver.test.ts` Fixture 1 is a PERMANENT
  regression test (typed 150 must win over learned 125) guarding the "score that lies" bug: a low logged set
  (a Viada speed/deload day) silently dropping the athlete's number and making the coach say "back off"
  (Q-107 H1). Learned-first is only safe because (a) the trusted gate already excludes thin/stale sets
  (`isTrustedAggregate`: ≥3 samples, ≥medium conf, fresh), (b) slot_intent already keeps speed/deload sets off
  the e1RM series, and (c) a locked value freezes it. Rewrite Fixture 1 to assert the NEW precedence AND add a
  fixture proving a speed/deload low set can't drop an auto number. If any of a/b/c is shaky, learned-first
  reintroduces the "back off" lie — build carefully.

## Sequence
1. A (resolver flip + tests) — contained, does not touch plan gen.
2. C (override storage + Baselines wiring) — small data-model addition.
3. B (route materialize through the resolver) — plan weights move; verify by recompute.
4. Verify the performance-screen set-edit fixes the 609 row at source; add the outlier guard as a small
   background rule (a set wildly out of line with your own history doesn't set a record).

## Open decision for Michael
The override storage shape in **C** (per-lift `{value, source, set_at}`). Everything else follows the FTP
pattern already in the app.
