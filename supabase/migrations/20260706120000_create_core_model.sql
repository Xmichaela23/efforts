-- Route-core model — the commercial-grade "am I faster on this stretch" substrate.
-- Spec: docs/DESIGN-segments.md (Q-132 / D-250). Doctrine: D-253 (governance by construction).
-- Vocabulary: "core" = the frozen fixed sub-path (kept distinct from the constitutional
--   "spine" AND from terrain_segments; the schema is the most durable doc there is).
-- Rulings (2026-07-06, grounded in a live-DB introspection):
--   * GREENFIELD (not adopting the terrain trio): terrain_segments held 420 one-off
--     micro-chunks and segment_progress_metrics was ~92% dead (42/546 rows) — a broken,
--     wrong-shaped substrate serving a different consumer (fact-packet terrain profiling).
--   * AUTO-CORE, FROZEN + logged amendment policy: a detected core's geometry is frozen;
--     re-detection mints a NEW version row (`version`, `superseded_by`), old efforts stay
--     pinned to old geometry — never silent drift (the 420-fragment failure mode).
--   * SEPARATE direction: `direction_bucket` bands the core; a reverse traversal is a
--     different core (the terrain trio folded reverse — a bug we don't inherit).
--   * Correct idempotency: core_efforts UNIQUE(workout_id, core_id) + delete-then-write
--     per workout on re-derive (kills the route model's orphan double-count, D-250).
--   * TWO tables, folded: an effort IS a match + its metrics. The trio split match from
--     metrics and the effort writer died in the gap (546 matches / 42 efforts). One row
--     makes "a match with no effort" unrepresentable (D-253, applied to the write path).
-- NOTE: repo migration-tracking divergence (see docs/MAINTENANCE-DEBT.md + the cycling
--   migration header) — apply via the Supabase SQL editor, reviewed, NOT `db push`.

-- ============================================================
-- route_cores — the frozen fixed sub-path (the "core"). One row per user per core per version.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.route_cores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- identity / idempotent detection guard (canonical: trailhead|start|end|dir|distbucket)
  core_key          text NOT NULL,
  trailhead_cell    text,                       -- start-cluster anchor for grouping cores by trailhead

  -- frozen geometry (the yardstick — set once at detection, matched against thereafter)
  point_polyline    jsonb NOT NULL,             -- ordered resampled [[lat,lng],...] at fixed spacing (4.1 match input)
  geohash_seq       text  NOT NULL,             -- ordered cell sequence (reference/debug; identity is geometric, not this hash)
  start_lat         double precision NOT NULL,
  start_lng         double precision NOT NULL,
  end_lat           double precision NOT NULL,
  end_lng           double precision NOT NULL,
  direction_bearing numeric,                    -- degrees, start->end
  direction_bucket  smallint,                   -- bearing binned (fork 2: reverse is a different bucket)
  distance_m        numeric NOT NULL,
  elev_gain_m       numeric,
  avg_grade_pct     numeric,

  -- amendment policy (frozen, versioned — re-freeze is deliberate + logged, never drift)
  version           integer NOT NULL DEFAULT 1,
  is_active         boolean NOT NULL DEFAULT true,   -- current version to match new runs against
  superseded_by     uuid REFERENCES public.route_cores(id) ON DELETE SET NULL,
  frozen_at         timestamptz NOT NULL DEFAULT now(),
  detected_from_n   integer,                    -- # runs the core was detected from at birth (the >=K evidence; immutable)

  -- NOTE: effort_count / first_seen / last_seen are DERIVED AT READ from core_efforts, NOT stored.
  -- D-253 criterion 5 (ruled 2026-07-06): route_cores has NO post-freeze write path — geometry
  -- AND bookkeeping are write-once-at-birth. No mutable counter for a future writer to defect into.
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT route_cores_user_corekey_version_key UNIQUE (user_id, core_key, version)
);

CREATE INDEX IF NOT EXISTS route_cores_user_active_idx ON public.route_cores (user_id, is_active);
CREATE INDEX IF NOT EXISTS route_cores_user_trailhead_idx ON public.route_cores (user_id, trailhead_cell);

-- ============================================================
-- core_efforts — one row per (core, workout). SLICED facts (Law 2: facts, not verdicts).
-- The verdict is NOT here — it is born on the spine (Law 5). This table holds measured facts
-- only, and CANNOT hold a verdict (there is no column for one) — Law 5 by construction.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.core_efforts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  core_id           uuid NOT NULL REFERENCES public.route_cores(id) ON DELETE CASCADE,
  workout_id        uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effort_date       date NOT NULL,

  -- ordered-match result (4.1): where in the activity polyline the core was traversed
  entry_idx         integer,
  exit_idx          integer,
  overlap_ratio     numeric,                    -- fraction of the core covered (should be ~1.0 for a real effort)
  matched_distance_m numeric,
  matcher_version   text NOT NULL DEFAULT 'v1', -- which core-match version produced this effort (backfill/re-derive guard)

  -- SLICED metrics over just the core span (NOT apportioned whole-run averages — the trio's fatal flaw)
  duration_s        integer NOT NULL,
  distance_m        numeric,
  avg_pace_s_per_km numeric,
  avg_hr_bpm        numeric,
  decoupling_pct    numeric,
  temp_f            double precision,           -- from weather_data (heat parked, D-251; captured for the later refinement)

  sample_quality    text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT core_efforts_workout_core_key UNIQUE (workout_id, core_id)
);

CREATE INDEX IF NOT EXISTS core_efforts_core_date_idx ON public.core_efforts (core_id, effort_date DESC);
CREATE INDEX IF NOT EXISTS core_efforts_user_idx ON public.core_efforts (user_id);
CREATE INDEX IF NOT EXISTS core_efforts_workout_idx ON public.core_efforts (workout_id);

-- ============================================================
-- RLS — auth.uid() = user_id (edge functions use the service role and bypass; client reads own).
-- ============================================================
ALTER TABLE public.route_cores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_efforts ENABLE ROW LEVEL SECURITY;

CREATE POLICY route_cores_owner_rw ON public.route_cores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY core_efforts_owner_rw ON public.core_efforts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
