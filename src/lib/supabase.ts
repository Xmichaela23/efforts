import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
// Prefer environment variables; fall back to current defaults
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY';
const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };