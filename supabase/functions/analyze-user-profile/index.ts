// Version: 2.0 - Algorithm-based validation only
// Features: No AI, validation-only, no fallbacks
// Updated: 2024-01-XX - Removed AI dependencies for plan generation
// Architecture: Algorithm-based plan generation with validation endpoint

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userContext } = await req.json()

    // Validate required fields for algorithm-based plan generation
    const requiredFields = ['distance', 'disciplineFocus', 'strengthTraining', 'trainingFrequency', 'weeklyHours']
    const missingFields = requiredFields.filter(field => !userContext.responses[field])

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // All validation passed - ready for algorithm plan generation
    return new Response(
      JSON.stringify({
        success: true,
        message: 'User profile validated successfully for algorithm-based plan generation',
        validatedFields: requiredFields
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid request format or validation failed'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}) 