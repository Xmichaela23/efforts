/*
  # Add source_preference to users.preferences
  
  Adds support for activity source preference in the users.preferences JSONB column.
  
  Valid values for preferences.source_preference:
  - 'garmin' = Garmin only (ignore Strava activities)
  - 'strava' = Strava only (ignore Garmin activities)  
  - 'both' = Accept both sources (default, may result in duplicates if auto-sync enabled)
  
  Default: 'both' (existing behavior)
*/

-- Add a comment documenting the source_preference field
COMMENT ON COLUMN users.preferences IS 'User preferences JSONB. Keys: useImperial (boolean), theme (string), source_preference (garmin|strava|both - controls which activity sources to accept)';

