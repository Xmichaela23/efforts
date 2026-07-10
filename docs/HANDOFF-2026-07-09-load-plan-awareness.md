# HANDOFF — Load verdict plan-awareness (D-267 + D-268), 2026-07-09

For the next session. This session made the load system **read the plan's primary discipline instead of hardcoding running**, and shipped it across the whole visible State card. One surface remains (D-268 Phase 4) and is intentionally left for a fresh session.

---

## 1. What was the problem

The load verdict was **run-only** (`body-response.ts:461` "Primary signal: run-only load vs run plan"). The primary user is on a **strength-primary plan** (`config.source === 'strength_primary'`, "Get stronger", 12wk). He maintains strength and swaps runs for rides/swims. The card told him **"build more" / "Running behind plan" / "you have headroom"** — all wrong: he's on plan, above his chronic load (ACWR 1.3). The engine judged him on the wrong discipline.

**The principle (Michael):** plan-agnostic, user-agnostic, session-agnostic — the engine simply reads the data (the plan's declared intent + the actual sessions + the user's baselines) and reflects it. Hardcode nothing.

## 2. What shipped (all live, 2026-07-09)

**D-267** (`docs/DESIGN-D267-plan-primary-load-verdict.md`) — the reconciler reads `planPrimary`:
- `resolvePlanPrimary(planConfig)` + `computePrimaryAdherence` in `_shared/load-status-reconcile.ts`, threaded into the reconciler (the sole verdict authority — D-260). `body-response.ts` UNCHANGED (raw input only).
- Invariant: strength met ⟹ a run-only `under` NEVER survives. `under` needs strength-not-met AND ACWR < 0.8.
- **Fix 1:** adherence `met` is session-based; veto only on genuine e1RM decline (`weeklyResponseModel.strength.overall.trend === 'declining'`), NOT the RIR trend (that was a live bug — RIR 'declining' = pushing harder, wrongly vetoed).

**D-268** (`docs/DESIGN-D268-plan-aware-everywhere.md`) — plan-primary is a SYSTEM invariant (Constitution Law 1/4). Shipped:
- **Phase 1** — reconciler rewrites the interpretation, strips the "Running load X% below plan" lead for strength-primary.
- **Phase 2** — `off-plan-banner.ts` plan-aware ("On plan — strength on track…" not "Running behind plan"); `planPrimary` HOISTED to one place in coach (single source), read by reconciler + banner.
- **Phase 3** — a `narrativeFact` tells the LLM the plan is strength-primary; intent_summary high-load line names the primary discipline.
- **Phase 5** — client "you have headroom" only when load is genuinely light (`acwr < 1.0`).

**Live versions:** coach `v293` (D-267 + D-268 P1/P2/P3; **Banister rides watch-only** — drives nothing). Client: Phase 5 pushed (Netlify). `COACH_PAYLOAD_VERSION = 71`.

## 3. The rules held (verify any new work against these)

- **Single source (Law 1, D-264):** `planPrimary` resolved ONCE in coach (`resolvePlanPrimary`), read by verdict + banner + narrative. No divergent re-derivation.
- **Smart server / dumb client (Law 4):** the client reads server verdicts; the one client observation (headroom) reads the server-computed `acwr`, doesn't invent a verdict.
- **THE LAW (D-260):** the reconciler is the only place a verdict/prescription is minted. `body-response.ts` supplies raw signals; it was never edited.
- **Zero regression:** endurance/tri/hybrid athletes are untouched at every phase (each has a NEG fixture).

## 4. THE REMAINING WORK — D-268 Phase 4 (Q-149)

**`generate-training-context/index.ts` is still plan-blind (run-only).** It is NOT on the State card — it feeds the AI narrative, the arc, and goal-prediction. Phase 3 already gave the LLM the plan-primary fact, so the prose risk is largely covered; Phase 4 closes the rest.

**Do it as its own tested pass:**
1. Import the shared `resolvePlanPrimary` (single source — do NOT write a second classifier).
2. `next_key_session.sport` defaults `'run'` (`:1863`/`:1865`) → default off `planPrimary`.
3. Gap-scan copy "Add N more run session(s)" (`:1131`) → primary-discipline-aware.
4. Recent-form / key-session-audit queries filter `type in (run,running)` (`:728`, `:830`, `:1438`) → discipline-aware.
5. **Cleanup (D-268 §7):** `arc-context.ts:683` re-derives `discipline` (`config.discipline || config.sport || plan_type`) separately from `resolvePlanPrimary` — collapse to one (D-264).

Fixtures where testable; endurance/tri zero regression; verify on the live "Get stronger" account (user `45d122e7-a950-4d50-858c-380b492061aa`).

## 5. Working notes for the next session

- **Deploy:** `supabase functions deploy coach --project-ref yyriamwvtvzlkumqrvpm`. Client ships via `git push origin main` (Netlify). Deno at `$HOME/.deno/bin/deno`.
- **Cache:** any coach edit that changes payload VALUES needs a `COACH_PAYLOAD_VERSION` bump (line ~126) or cached rows serve stale (24h TTL). Learned the hard way this session.
- **DB (read-only diagnosis, Michael's account):** service-role REST via `.env` `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. NEVER write his data. The live receipt lives in `coach_cache.payload` (path: `athlete_snapshot.body_response.load_status`).
- **Verify by fixture + one live receipt, not a device session alone.** ≥3 recomputes for anything stochastic (the LLM narrative).
- **Comms:** short and plain in chat (Michael reads the decision, not the internals); deep detail goes in these docs. Don't deviate from an approved sequence without asking.
- **Banister:** committed, rides in coach watch-only, drives nothing. Its own deploy/observation-window decision is still Michael's, later.
