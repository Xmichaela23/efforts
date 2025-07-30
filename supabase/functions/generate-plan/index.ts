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
    // Clean the AI response first
    let cleanResponse = aiResponse;
    
    // Remove markdown code blocks
    cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Remove JavaScript comments
    cleanResponse = cleanResponse.replace(/\/\/.*$/gm, '');
    
    // Find the complete JSON object by counting braces
    let braceCount = 0;
    let endIndex = -1;
    
    for (let i = 0; i < cleanResponse.length; i++) {
      if (cleanResponse[i] === '{') {
        braceCount++;
      } else if (cleanResponse[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
    
    if (endIndex > 0) {
      cleanResponse = cleanResponse.substring(0, endIndex + 1);
    }
    
    // Try to parse the cleaned JSON
    const parsed = JSON.parse(cleanResponse);
    
    // Ensure it has the expected structure
    if (parsed.plan && parsed.plan.weeks) {
      return parsed;
    }
    
    // If it doesn't have the right structure, create a fallback
    throw new Error('Invalid plan structure');
    
  } catch (error) {
    console.log(`❌ PARSE ERROR: ${error.message}`);
    
    // Return a clean, structured fallback plan
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
        isIntegrated: true,
        phase: "Base Building",
        phaseDescription: "Building aerobic foundation and technique",
        trainingPhilosophy: "balanced",
        weeks: [
          {
            weekNumber: 1,
            focus: "Base Building - Aerobic Foundation",
            phase: "Base",
            workouts: [
              {
                day: "Monday",
                type: "Swim",
                duration: "45 minutes",
                warmup: "400m easy @ 2:05/100m",
                main: "8x50m @ 1:15/100m, 30s rest",
                cooldown: "200m easy @ 2:10/100m",
                notes: "Focus on technique, build aerobic base"
              },
              {
                day: "Tuesday",
                type: "Bike",
                duration: "60 minutes",
                warmup: "15min easy @ Zone 1",
                main: "3x10min @ 85% FTP, 5min rest",
                cooldown: "10min easy @ Zone 1",
                notes: "Build cycling strength, progressive overload"
              },
              {
                day: "Wednesday",
                type: "Run",
                duration: "45 minutes",
                warmup: "10min easy @ Zone 1",
                main: "20min @ Zone 2, 10min @ Zone 3",
                cooldown: "5min easy @ Zone 1",
                notes: "Build running endurance"
              },
              {
                day: "Thursday",
                type: "Strength",
                duration: "60 minutes",
                warmup: "10min dynamic stretching",
                main: "3x5 squats @ 85% 1RM, 3x3 deadlifts @ 90% 1RM, 3x5 bench @ 80% 1RM",
                cooldown: "5min static stretching",
                notes: "Power lifting - compound movements, heavy weight, low reps"
              },
              {
                day: "Friday",
                type: "Swim",
                duration: "30 minutes",
                warmup: "200m easy @ 2:05/100m",
                main: "6x50m @ 1:20/100m, 30s rest",
                cooldown: "200m easy @ 2:10/100m",
                notes: "Recovery swim, focus on technique"
              },
              {
                day: "Saturday",
                type: "Bike",
                duration: "90 minutes",
                warmup: "15min easy @ Zone 1",
                main: "60min @ Zone 2-3, long steady ride",
                cooldown: "15min easy @ Zone 1",
                notes: "Long ride to build endurance"
              },
              {
                day: "Sunday",
                type: "Run",
                duration: "60 minutes",
                warmup: "10min easy @ Zone 1",
                main: "45min @ Zone 2, long steady run",
                cooldown: "5min easy @ Zone 1",
                notes: "Long run to build endurance"
              }
            ]
          }
        ]
      },
      rawResponse: aiResponse,
      parseError: error.message
    };
  }
} 