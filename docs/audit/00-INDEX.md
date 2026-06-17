# Feature Audit — Index & Status

Reverse-documentation of what the Efforts app actually does, derived from code. See `WORKORDER-feature-audit.md` for the governing work order. **These docs are uncommitted — Michael reviews and commits.**

Run started: overnight session, 2026-06-16.

## Area status

| # | Area | File | Status |
|---|------|------|--------|
| 1 | Ingestion & sync | `01-ingestion.md` | done |
| 2 | Analyzers (per discipline) | `02-analyzers.md` | done |
| 3 | Spine / state-trend / snapshot | `03-spine-snapshot.md` | done |
| 4 | Planning engine | `04-planning.md` | done |
| 5 | Compute & contracts | `05-compute-contracts.md` | done |
| 6 | Screens (client) | `06-screens.md` | done |
| 7 | Baselines & athlete records | `07-baselines.md` | done |
| 8 | Cross-cutting | `08-cross-cutting.md` | done |
| 9 | DB schema (ground truth) | `09-db-schema.md` | done |
| — | Consolidated summary | `99-SUMMARY.md` | done |

Status values: `in progress` → `done` (doc written) / `partial` (note where it stopped here).

## Where we stopped
**Complete.** All eight area docs and the consolidated `99-SUMMARY.md` are written. Nothing committed — review and commit at your discretion (per the work order: write-only, you commit in the morning).

### Read order for review
1. `99-SUMMARY.md` first — §1 is the edge-case protection list (the single most valuable output), §3 is the ranked discrepancy triage queue.
2. Then the per-area docs `01`–`08` for the full detail behind any summary line.

### Honest coverage caveats (also in §4 of the summary)
- The audit is **code-derived only** — it did not query the database, so column existence and a couple of runtime behaviors (notably "recompute → which week's spine refreshes") are *inferred*, not confirmed. Flagged inline.
- Exact line numbers inside the very large files (combined-plan `week-builder.ts`/`session-factory.ts`, 1500–3000-line React components) were branch-mapped or sweep-cited — spot-verify a line before acting on it.
- No code was modified, deleted, or refactored. Suspected bugs were flagged for your review, never fixed.
