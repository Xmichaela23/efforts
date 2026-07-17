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
-- Apply via the Supabase SQL editor (repo migration-tracking divergence), reviewed. STAGED — not yet applied.
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
