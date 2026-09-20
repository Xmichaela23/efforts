-- Projection for the Record tab's history read. PROJECTION ONLY — no ranking, no sums, no opinion.
--
-- ⛔ WHY THIS EXISTS: 383 KB AND 3.1 SECONDS (measured 2026-09-20, 463 workouts). Selecting
-- `computed->run_records`, `computed->ride_records` and `computed->power_curve` pulls every field of
-- every effort on every workout, and the ranker reads exactly two of them: `elapsed_s` on a distance
-- and the watts on a duration. The rest — `gap_s_per_mi`, `avg_hr`, `net_elev_m`, the curve's `_hr`
-- sibling — is carried across the wire and thrown away. On a phone that is the whole first-open wait.
--
-- ⚠️ IT MUST NEVER DECIDE ANYTHING. Ranking stays in `_shared/athletic-record/rank.ts`, in one
-- language, with its fixtures. The day this function picks a best, the app has two rankers and they
-- will disagree. It flattens shapes and drops unread keys; that is all it is allowed to do.
--
-- ⚠️ THE SHAPE IT RETURNS IS THE SHAPE `rank.ts` READS, minus the unread fields. If an effort ever
-- grows a field the ranker uses, it has to be added here too or it silently arrives as undefined.

CREATE OR REPLACE FUNCTION public.athletic_record_rows(p_user_id uuid)
RETURNS TABLE (
  id               uuid,
  date             date,
  name             text,
  type             text,
  workout_status   text,
  distance         numeric,
  elevation_gain   numeric,
  moving_time      numeric,
  elapsed_time     numeric,
  duration         numeric,
  run_records      jsonb,
  ride_records     jsonb,
  power_curve      jsonb,
  overall          jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.date,
    w.name,
    w.type,
    w.workout_status,
    w.distance,
    w.elevation_gain,
    w.moving_time,
    w.elapsed_time,
    w.duration,
    -- Each effort keeps only `elapsed_s`; the trend fields beside it are not read by the ranker.
    (SELECT jsonb_object_agg(k, jsonb_build_object('elapsed_s', v -> 'elapsed_s'))
       FROM jsonb_each(w.computed -> 'run_records') AS t(k, v)
      WHERE jsonb_typeof(w.computed -> 'run_records') = 'object'),
    (SELECT jsonb_object_agg(k, jsonb_build_object('elapsed_s', v -> 'elapsed_s'))
       FROM jsonb_each(w.computed -> 'ride_records') AS t(k, v)
      WHERE jsonb_typeof(w.computed -> 'ride_records') = 'object'),
    -- The curve is label -> watts already; only its `_hr` sibling is dropped.
    (SELECT jsonb_object_agg(k, v)
       FROM jsonb_each(w.computed -> 'power_curve') AS t(k, v)
      WHERE jsonb_typeof(w.computed -> 'power_curve') = 'object' AND k <> '_hr'),
    -- The totals ladder reads three exact-seconds fields off `overall` and nothing else.
    jsonb_strip_nulls(jsonb_build_object(
      'duration_s_moving',  w.computed -> 'overall' -> 'duration_s_moving',
      'duration_s_elapsed', w.computed -> 'overall' -> 'duration_s_elapsed',
      'duration_s',         w.computed -> 'overall' -> 'duration_s'
    ))
  FROM public.workouts w
  WHERE w.user_id = p_user_id
    AND (w.workout_status IS NULL OR w.workout_status <> 'planned')
  ORDER BY w.date ASC;
$$;

-- SECURITY INVOKER + the explicit user filter: the caller's RLS still applies, and a service-role
-- caller must pass the athlete it means. Nothing here widens what a client can read.
GRANT EXECUTE ON FUNCTION public.athletic_record_rows(uuid) TO authenticated, service_role;
