/*
  # connection health (2026-09-07, docs/WORKORDER-plumbing-2026-09-07.md §4)

  user_connections (Garmin) and device_connections (Strava) learn whether the stored token still works:
    health       ok | needs_reauth | error
    last_error   the provider's last non-2xx, as text
    last_ok_at   the last 2xx from the provider
  Written by _shared/connection-health.ts from every function that calls a provider with a stored token
  (a 401/403 → needs_reauth; a 2xx → ok; anything else → error) and reset to ok when the athlete
  reconnects (bright-service, strava-token-exchange). The Connections screen shows "Reconnect ›" on
  needs_reauth; Home shows one line under Today while it is so.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor. Rerunnable.
*/

ALTER TABLE public.user_connections
  ADD COLUMN IF NOT EXISTS health     text        NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;

ALTER TABLE public.user_connections DROP CONSTRAINT IF EXISTS user_connections_health_check;
ALTER TABLE public.user_connections
  ADD CONSTRAINT user_connections_health_check CHECK (health IN ('ok', 'needs_reauth', 'error'));

ALTER TABLE public.device_connections
  ADD COLUMN IF NOT EXISTS health     text        NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;

ALTER TABLE public.device_connections DROP CONSTRAINT IF EXISTS device_connections_health_check;
ALTER TABLE public.device_connections
  ADD CONSTRAINT device_connections_health_check CHECK (health IN ('ok', 'needs_reauth', 'error'));

COMMENT ON COLUMN public.user_connections.health   IS 'ok | needs_reauth | error — written by _shared/connection-health.ts';
COMMENT ON COLUMN public.device_connections.health IS 'ok | needs_reauth | error — written by _shared/connection-health.ts';
