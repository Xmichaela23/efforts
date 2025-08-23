import { createClient } from '@supabase/supabase-js';

// Hard‑pin client to the active Supabase project used across the app
// This avoids any environment mismatch during deploy
const supabaseUrl = 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY';

export const supabase = createClient(supabaseUrl, supabaseKey);