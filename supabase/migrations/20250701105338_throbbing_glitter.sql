/*
  # Create device connections table for Garmin and other integrations

  1. New Tables
    - `device_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `provider` (text, device provider: garmin, strava, etc.)
      - `provider_user_id` (text, external user ID)
      - `access_token` (text, encrypted access token)
      - `refresh_token` (text, encrypted refresh token)
      - `expires_at` (timestamp, token expiration)
      - `connection_data` (jsonb, additional connection info)
      - `is_active` (boolean, connection status)
      - `last_sync` (timestamp, last successful sync)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `device_connections` table
    - Add policies for users to manage their own connections
*/

-- Create device_connections table
CREATE TABLE IF NOT EXISTS device_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL CHECK (provider IN ('garmin', 'strava', 'polar', 'suunto', 'wahoo')),
  provider_user_id text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connection_data jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE device_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own connections"
  ON device_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON device_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON device_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON device_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_device_connections_updated_at
  BEFORE UPDATE ON device_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_device_connections_user_id ON device_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_device_connections_provider ON device_connections(provider);
CREATE INDEX IF NOT EXISTS idx_device_connections_active ON device_connections(is_active) WHERE is_active = true;