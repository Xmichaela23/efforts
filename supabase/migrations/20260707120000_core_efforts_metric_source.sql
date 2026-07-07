-- core_efforts.metric_source — per-effort HR provenance (DESIGN-segments §4.3; ruled 2026-07-07).
--
-- Governance by construction (D-253): NOT NULL with NO DEFAULT → a write that omits provenance
-- ERRORS rather than silently landing an untagged row. metric_source is set from HR coverage INSIDE
-- the sliced core span (core-effort.ts), never a row-level boolean — an effort whose HR drops out
-- across the stretch is 'raw_pace_only' even if the run has HR elsewhere. Step 4 (the spine verdict)
-- must never mix a real pace:HR decoupling with a "never had HR" null.
--
-- Safe as NOT-NULL-without-default because core_efforts is empty at apply time (no rows to violate).
-- Apply via the Supabase SQL editor (repo migration-tracking divergence), reviewed — BEFORE the first
-- match-cores write.
ALTER TABLE public.core_efforts
  ADD COLUMN metric_source text NOT NULL
    CHECK (metric_source IN ('hr_aligned', 'raw_pace_only'));
