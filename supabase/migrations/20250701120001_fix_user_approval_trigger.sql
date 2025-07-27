/*
  # Fix user approval trigger

  This migration updates the handle_new_user function to set approved = true
  for new user registrations, ensuring they can access the app immediately.
*/

-- Update the handle_new_user function to include approved field
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, email, full_name, approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    true  -- Set new users as approved by default
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 