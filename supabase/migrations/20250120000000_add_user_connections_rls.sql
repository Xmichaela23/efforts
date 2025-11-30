/*
  # Add RLS policies to user_connections table
  
  This migration ensures user_connections table has proper Row Level Security
  policies to prevent users from accessing other users' connection data.
  
  If the table doesn't exist, it will be created with the schema inferred
  from code usage. If it exists, only RLS and policies will be added.
*/

-- Create user_connections table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connection_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS (idempotent - won't error if already enabled)
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can read own connections" ON user_connections;
DROP POLICY IF EXISTS "Users can insert own connections" ON user_connections;
DROP POLICY IF EXISTS "Users can update own connections" ON user_connections;
DROP POLICY IF EXISTS "Users can delete own connections" ON user_connections;

-- Create RLS policies
CREATE POLICY "Users can read own connections"
  ON user_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON user_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON user_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON user_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_connections_user_id ON user_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_connections_provider ON user_connections(provider);
CREATE INDEX IF NOT EXISTS idx_user_connections_user_provider ON user_connections(user_id, provider);

-- Add updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_user_connections_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_connections_updated_at ON user_connections;
CREATE TRIGGER update_user_connections_updated_at
  BEFORE UPDATE ON user_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_user_connections_updated_at();

