/*
  # connection_events — what happened to a provider connection (2026-09-07)

  One row per event on a user's Garmin / Strava connection so support can answer "what happened":
    deregistration      Garmin told us the user removed efforts in Garmin Connect (garmin-webhook-user);
                        detail carries the per-table delete counts of the Garmin-sourced data
    permissions_change  Garmin told us the user narrowed what we may read; detail.permissions is the list
    disconnect          the user disconnected from our side (disconnect-connection); detail says whether the
                        provider's deregistration call went through (provider_notified / provider_status)

  user_id is nullable: a deregistration for a Garmin user we cannot match still gets a row (matched: false).
  Because the column is named user_id, delete_user_data(uid) sweeps these rows with the rest of the account.

  RLS on with no policies: only the service role (the edge functions) reads or writes. Nothing on the client
  can reach it. Writers tolerate the table being absent (they log and carry on), so applying this migration
  late loses rows, not requests.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor.
*/

CREATE TABLE IF NOT EXISTS public.connection_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  provider    text        NOT NULL,
  event       text        NOT NULL,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connection_events_user_at_idx ON public.connection_events (user_id, at DESC);

ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.connection_events FROM anon, authenticated;
GRANT ALL ON TABLE public.connection_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.connection_events_id_seq TO service_role;

COMMENT ON TABLE public.connection_events IS
  'Provider connection events (deregistration, permissions_change, disconnect). Service role only; written by garmin-webhook-user and disconnect-connection.';
