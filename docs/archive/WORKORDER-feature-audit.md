# WORK ORDER — Feature Audit / Reverse-Documentation (overnight, read-only)

**Status:** HELD — to be run in a fresh, dedicated overnight session (not appended to an active working session). When it runs: write-only, no commits — Michael reviews and commits the audit docs in the morning.

**Type:** Unattended overnight work order. Read-only. No code changes, no commits except the audit docs themselves, no migrations, no deploys.

**Goal:** Produce a written, code-derived account of what the Efforts app actually does — every feature, flow, and edge case — so the undocumented first ~6 months become a known quantity and the dormant edge-case paths are surfaced before any future cleanup.

**Why overnight:** It's large, mechanical, read-only, and needs no decisions mid-run. Walk away; review the output in the morning.

---

## HARD RULES (do not violate, unattended)

1. **READ-ONLY.** Do not modify, delete, or refactor any code. Do not run migrations or deploy. The ONLY writes are the audit markdown files in `docs/audit/`.
2. **DESCRIBE WHAT IS, DON'T JUDGE WHAT'S RIGHT.** Document what the code does, factually. You are mapping, not evaluating. If a behavior looks like it might be a bug or unintended, DO NOT fix it and DO NOT assume it's wrong — record it in the DISCREPANCIES section for human review. The human knows what the app is for; you know what it does. Stay in your lane.
3. **FLAG, DON'T RESOLVE.** Anything surprising, contradictory, redundant, or that looks dead/dormant → note it in the per-area "Flags" subsection. Never act on it.
4. **LEAN ON EXISTING DOCS.** For the recent (~2 month) layer, the DECISIONS-LOG, OPEN-QUESTIONS, ENGINE-STATE, and the SPEC-* files already document intent. Reconcile against them — don't re-derive what's already written. The PRIORITY is the undocumented older code.
5. **STAGE BY AREA, RESUMABLE.** Do the areas in the order below, one complete area per pass. Write each area's doc as you finish it so progress survives a context reset. If you run low on context, finish the current area's doc, note where you stopped in `docs/audit/00-INDEX.md`, and stop cleanly. The next session resumes at the next area.
6. **NO SPECULATION PRESENTED AS FACT.** If you can't determine whether a path is reachable or what triggers an edge case, say so explicitly ("trigger condition unclear from code") rather than guessing.

---

## OUTPUT STRUCTURE

Create `docs/audit/` with:

- `00-INDEX.md` — running index: which areas are done, which remain, where you stopped.
- One file per area: `01-ingestion.md`, `02-analyzers.md`, etc.

Every area doc uses this exact structure (consistency matters — the human reviews these side by side):

```
# AREA — <name>

## What this area does (plain-language overview)
2–5 sentences. What's this part of the app for?

## Features / flows
For each distinct feature or flow in this area:
### <feature name>
- **What it does:** plain language
- **How it works:** the actual mechanism — files, functions, edge functions, the data path
- **Inputs / outputs:** what it reads, what it writes
- **Triggers:** what causes it to run (user action, webhook, cron, condition)

## Edge cases & conditional handling  ← THE IMPORTANT SECTION
Every conditional/rare path this area handles: what the edge case is, what triggers it,
what the code does. These are the dormant-but-possibly-critical paths. Be exhaustive here —
this section is the protection list that makes future cleanup safe. A path being rare or
never-fired-in-normal-use is NOT a reason to omit it; it's the reason to document it.

## Redundancies / duplication (observed, not judged)
Where the same value is computed in >1 place, the same logic appears twice, duplicate helpers,
repeated queries. Observe and locate; do not consolidate.

## Discrepancies & flags (for human review)
- Anything that looks like it might be a bug, contradicts another part of the app, or
  contradicts the documented intent in DECISIONS-LOG/SPECs.
- Anything reachable-but-looks-dead, or whose trigger you couldn't determine.
- Anything surprising.
NEVER acted on — listed for the human.

## Cross-references
Links to relevant DECISIONS-LOG entries / SPECs / other audit areas.
```

---

## AREAS, IN ORDER

Adjust names to the actual repo structure, but cover all of this:

1. **Ingestion & sync** — Strava/Garmin webhooks, historical import, the cross-source dedup/merge, manual entry, HealthKit scaffolding. (Heavy edge-case area — backlog-vs-new-data, source preference, the merge gates. Much is documented recently; map the older parts and reconcile.)
2. **Analyzers (per discipline)** — run, ride, swim, strength: how each computes its facts, pace/power/GAP/pace-per-100/e1RM, the narrative generation, the fact packets. Note where disciplines diverge and where they duplicate.
3. **The spine / state-trend / snapshot** — how `state_trends_v1`, the cached snapshot, the verdicts/axes are assembled and consumed.
4. **Planning engine** — plan generation, session prescription, training-science logic (TSS/load/taper/brick), the combined plan engine.
5. **Compute & contracts** — compute-facts, compute-workout-summary, `session_detail_v1`, the resolvers (rideComputedNp, resolveSwimScalars, the run resolver), compute-snapshot.
6. **Screens (client)** — Performance, Details, State, home, Connections, baselines, goals, season plan. For each: what it reads, and (critically) where it does client-side math vs. reads server values.
7. **Baselines & athlete records** — where athlete data (HR zones, thresholds, fitness tiers) originates, is stored, and is read. (Connects to onboarding gap.)
8. **Cross-cutting** — auth/JWT, caching/invalidation, feedback popup, anything not captured above.

---

## AT THE END (after all areas, or when stopping)

Write `docs/audit/99-SUMMARY.md`:

- **The edge-case protection list:** a consolidated list of every dormant/conditional path found across all areas, in one place. This is the single most valuable output — it's what makes future cleanup safe.
- **Top redundancies:** the duplicate-computation / single-source-violation candidates, consolidated.
- **Top discrepancies:** the things most worth the human's attention, ranked.
- **Coverage note:** which areas are fully mapped vs. partial, honestly.

---

## REMINDER

The human (Michael) cannot review code with authority and the first ~6 months were vibe-coded
undocumented. This document IS the substitute for both. Its value is entirely in being
complete, honest, and descriptive. A confident-but-wrong audit is worse than an honest
"trigger unclear here" — flag uncertainty rather than paper over it. Do not editorialize, do not
fix, do not delete. Map the territory; the human reads the map.
