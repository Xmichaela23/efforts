-- fitness_baselines — the athlete's per-discipline fitness ANCHOR (the tick a fitness dot is placed against).
--
-- Reversal of the manual-only rule (2026-07-16): baselines are AUTO-DERIVED from the athlete's own history
-- (provisional), confirmable or changeable with one tap. This table IS the audit trail the contract requires:
-- supersede-not-delete is a superseded_at timestamp + a lineage pointer, not a hand-managed JSON array; the
-- source event is a relational id citing a real workout; status is a queryable column, not string-parsing.
--
-- ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ INVARIANTS:                                                                                    │
-- │  • ONE ACTIVE record per (user, discipline, metric) — enforced by the partial unique index     │
-- │    below (superseded_at IS NULL). Supersede = stamp the old row's superseded_at + superseded_by │
-- │    and insert a new active row; NOTHING is deleted.                                            │
-- │  • status: 'provisional' = auto-derived (renders the "auto" label); 'confirmed' = the athlete   │
-- │    accepted it (label drops "auto"). A manual change writes a 'confirmed' active row.           │
-- │  • CONFIRMED IS NEVER AUTO-UPDATED. Re-derivation may supersede a PROVISIONAL active row when a  │
-- │    better qualifying effort appears; it must SKIP any 'confirmed' row (contract §3).            │
-- │  • Spine/server-authored ONLY. Auto-derivation writes it on coach compute; the confirm/change    │
-- │    tap goes through an edge function (service role), never a direct client write. No owner write │
-- │    policy on purpose (mirrors core_verdicts).                                                   │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- STRENGTH is intentionally NOT stored here — its declared 1RMs in user_baselines are already confirmed
-- anchors (contract §2d). This table holds the DERIVABLE disciplines: run / bike / swim.
--
-- ⛔⛔ REVERSED 2026-08-28 BY MICHAEL'S RULING — the paragraph directly above is now HISTORY. Typed-in
-- and learned baselines MUST carry a date stamp, and this table is the mechanism they move onto
-- (his instruction, verbatim: "do not build a new mechanism"). §2d assumed a CONFIRMED anchor needs
-- no history; the derived heavy gate's block-length window is the reader that proves otherwise — an
-- undated 1RM cannot be tested against "is this max still current?", so a number typed two years ago
-- still counts today. See docs/WORKORDER-the-progress-standard-2026-08-28.md ITEM 6 and D-456.
--
-- ⛔ WHAT THAT MEANS FOR THIS FILE WHEN ITEM 6 IS BUILT (it is SPEC ONLY today — nothing built):
--   · the `discipline` CHECK below must admit 'strength'. It is the only schema blocker.
--   · `metric` is free text with NO CHECK, so per-lift metrics ('squat', 'bench_press', …) and the
--     run's 'threshold_pace' (Q-290) need no schema change at all.
-- ⚠️ THE REAL WORK IS NOT IN THIS FILE. compute-snapshot's reconciler is keyed by DISCIPLINE, not by
--    (discipline, metric) — it builds Map<discipline,row> and loops run/bike/swim — while the partial
--    unique index below is ALREADY per-metric. So the database can hold many metrics per discipline
--    and the writer cannot. Both halves of item 6 need that reconciler made metric-keyed; do it once.
--
-- Apply via the Supabase SQL editor (repo migration-tracking divergence), reviewed.
-- ⛔ CORRECTION 2026-08-28: THIS IS APPLIED AND LIVE IN PRODUCTION. The line here read "STAGED — not
-- yet applied" long after it had been applied, and that was believed on sight during the endurance
-- trace until a direct select proved otherwise — 14 rows for the primary athlete, the supersede
-- chain intact (six dated bike FTP readings, 176 → 153 → 168, plus seven run decoupling rows).
-- ⚠️ THE LEDGER CANNOT TELL YOU THIS. `supabase migration list` records only `0000` for this repo;
-- every migration here was applied by hand, so a file's own header is the only claim about its state
-- and this one was wrong. Verify against the database, never against the header.
CREATE TABLE IF NOT EXISTS public.fitness_baselines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline       text NOT NULL CHECK (discipline IN ('run','bike','swim')),
  metric           text NOT NULL,   -- 'decoupling' | 'ftp' | 'css_pace' (the anchored metric for the discipline)
  value            numeric NOT NULL,-- the metric value at the anchor (the tick position)
  lower_is_better  boolean NOT NULL,-- decoupling & pace: lower is better; ftp: higher — carried for render orientation
  source_event_id  uuid,            -- soft reference to workouts.id (the source effort); NULL when the source is
                                     -- an estimate (bike FTP) rather than one workout. Not a hard FK on purpose:
                                     -- a deleted/re-ingested workout must not cascade-delete the audit record.
  source_date      date,            -- date of the source effort / estimate
  source_label     text NOT NULL,   -- human: 'steady run' | 'FTP estimate' | 'hard swim'
  confidence       text,            -- carried for the label where the source has one (bike FTP estimate)
  status           text NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional','confirmed')),
  superseded_at    timestamptz,     -- NULL = the ACTIVE record; non-NULL = kept-for-history, replaced
  superseded_by    uuid REFERENCES public.fitness_baselines(id) ON DELETE SET NULL, -- lineage pointer
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ONE active anchor per discipline/metric — the partial unique index is the "single source" guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS fitness_baselines_active_key
  ON public.fitness_baselines (user_id, discipline, metric)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS fitness_baselines_user_idx ON public.fitness_baselines (user_id);
CREATE INDEX IF NOT EXISTS fitness_baselines_lookup_idx ON public.fitness_baselines (user_id, discipline, metric, superseded_at);

ALTER TABLE public.fitness_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY fitness_baselines_owner_read ON public.fitness_baselines
  FOR SELECT USING (auth.uid() = user_id);
-- writes (auto-derivation + confirm/change) are service-role only; no owner write policy on purpose.
