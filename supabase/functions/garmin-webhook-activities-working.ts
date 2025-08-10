import { createClient } from 'jsr:@supabase/supabase-js@2';

// Helper function to get official Garmin total ascent
function getTotalAscentOfficial(detailsJson: any): number | null {
  const dto = detailsJson?.summaryDTO ?? {};
  return Number.isFinite(Number(dto.totalElevationGain))
    ? Number(dto.totalElevationGain)
    : null;
}

Deno.serve(async (req) => {
// ... existing code ...
