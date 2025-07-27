/*
  # Add approved column to users table

  This migration adds an approved column to the users table to support
  manual approval workflow for new user registrations.
*/

-- Add approved column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;

-- Add comment to document the column
COMMENT ON COLUMN users.approved IS 'Whether the user account has been approved for access';

-- Create index for better performance on approval queries
CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved) WHERE approved = false; 