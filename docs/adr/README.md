# Architecture Decision Records (ADRs)

Short-lived decisions live in PRs; **cross-cutting rules** that should govern future work live here.

| ADR | Title |
|-----|--------|
| [0001](./0001-performance-attach-and-session-detail-v1.md) | Performance UI, attach/recompute, and `session_detail_v1` |
| [0002](./0002-phaseblock-one-week-rows.md) | `PhaseBlock` rows are one week each — phase-relative week math |

**Day-to-day enforcement for agents:** `.cursor/rules/performance-session-contract.mdc` mirrors ADR 0001 in actionable form.
