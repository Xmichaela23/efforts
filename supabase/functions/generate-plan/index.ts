import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  
  // CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log(`✅ CORS PREFLIGHT: Allowing OPTIONS request`);
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  // Response headers with CORS
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders
  };

  // Only handle POST requests (after OPTIONS)
  if (req.method !== 'POST') {
    console.log(`❌ REJECTED: Method ${req.method} not allowed`);
    return new Response(JSON.stringify({
      error: 'Only POST requests allowed'
    }), {
      status: 405,
      headers
    });
  }

  try {
    console.log(`🚀 GENERATE-PLAN STARTED: ${new Date().toISOString()}`);
    console.log(`📥 REQUEST URL: ${req.url}`);

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.log(`❌ ERROR: OpenAI API key not found in environment`);
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured'
      }), {
        status: 500,
        headers
      });
    }

    console.log(`🔑 OPENAI API KEY: ${openaiApiKey.substring(0, 20)}...`);

    // Parse request body
    const requestBody = await req.json();
    const { prompt, startDate, userContext } = requestBody;

    if (!prompt) {
      console.log(`❌ ERROR: Missing prompt parameter`);
      return new Response(JSON.stringify({
        error: 'Missing prompt parameter'
      }), {
        status: 400,
        headers
      });
    }

    console.log(`📝 PROMPT RECEIVED: ${prompt.substring(0, 100)}...`);
    console.log(`📅 START DATE: ${startDate}`);
    console.log(`👤 USER CONTEXT: ${JSON.stringify(userContext)}`);

    // Build OpenAI request
    const openaiRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent training AI with expertise in exercise science, periodization, and personalized training design.

EVIDENCE-BASED TRAINING SCIENCE PRINCIPLES:
- **Periodization:** Linear, Block, Undulating periodization models
- **Polarized Training:** 80% easy, 20% hard intensity distribution
- **Pyramid Training:** Intensity progression within sessions
- **Progressive Overload:** Gradual increase in training stress
- **Multi-Sport Integration:** Swim, bike, run coordination
- **Age-Appropriate Training:** Recovery and progression for different ages
- **Injury Prevention:** Mobility, stability, corrective exercises
- **Heart Rate Zones:** Karvonen formula for zone calculation
- **Strength Training:** NSCA guidelines for resistance training
- **Taper Principles:** Mujika research on tapering strategies

You must generate detailed, specific training plans with actual numbers, not generic descriptions.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    };

    console.log(`🌐 MAKING REQUEST TO OPENAI...`);
    console.log(`📤 OPENAI REQUEST: ${JSON.stringify(openaiRequest, null, 2)}`);

    // Make request to OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openaiRequest)
    });

    console.log(`📡 OPENAI RESPONSE STATUS: ${openaiResponse.status}`);
    console.log(`📡 OPENAI RESPONSE HEADERS: ${JSON.stringify(Object.fromEntries(openaiResponse.headers))}`);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.log(`❌ OPENAI ERROR: ${errorText}`);
      return new Response(JSON.stringify({
        error: 'OpenAI API error',
        status: openaiResponse.status,
        details: errorText
      }), {
        status: openaiResponse.status,
        headers
      });
    }

    // Parse OpenAI response
    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0]?.message?.content;

    if (!aiResponse) {
      console.log(`❌ ERROR: No response from AI`);
      return new Response(JSON.stringify({
        error: 'No response from AI'
      }), {
        status: 500,
        headers
      });
    }

    console.log(`✅ AI RESPONSE RECEIVED: ${aiResponse.substring(0, 200)}...`);

    // Parse AI response into structured plan
    const trainingPlan = parseAIResponse(aiResponse, startDate);

    console.log(`🏁 RETURNING TRAINING PLAN`);
    return new Response(JSON.stringify(trainingPlan), {
      status: 200,
      headers
    });

  } catch (error) {
    console.error(`💥 GENERATE-PLAN ERROR: ${error.message}`);
    console.error(`💥 ERROR STACK: ${error.stack}`);
    return new Response(JSON.stringify({
      error: 'Plan generation error',
      message: error.message
    }), {
      status: 500,
      headers
    });
  }
});

// Parse AI response into structured training plan
function parseAIResponse(aiResponse: string, startDate: string) {
  try {
    // Try to parse as JSON first
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }

    // If not JSON, return as text with structure
    return {
      plan: {
        name: "AI Generated Training Plan",
        description: "Generated by OpenAI",
        type: "triathlon",
        duration: 8,
        level: "intermediate",
        goal: "complete_triathlon",
        status: "active",
        currentWeek: 1,
        createdDate: startDate,
        totalWorkouts: 56,
        disciplines: ["swim", "bike", "run"],
        isIntegrated: true
      },
      workouts: [],
      rawResponse: aiResponse
    };
  } catch (error) {
    console.log(`❌ PARSE ERROR: ${error.message}`);
    return {
      plan: {
        name: "AI Generated Training Plan",
        description: "Generated by OpenAI",
        type: "triathlon",
        duration: 8,
        level: "intermediate",
        goal: "complete_triathlon",
        status: "active",
        currentWeek: 1,
        createdDate: startDate,
        totalWorkouts: 56,
        disciplines: ["swim", "bike", "run"],
        isIntegrated: true
      },
      workouts: [],
      rawResponse: aiResponse,
      parseError: error.message
    };
  }
} 