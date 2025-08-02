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

    // Check if this is an analysis request
    const isAnalysis = userContext?.analysis === true;
    console.log(`🔍 IS ANALYSIS REQUEST: ${isAnalysis}`);

    // Build OpenAI request
    const openaiRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: isAnalysis 
            ? `You are an expert exercise physiologist and training coach. Your task is to analyze user data and return ONLY a JSON object with training parameters. Do not include any text outside the JSON.`
            : `You are an exercise physiologist and training scientist. Your task is to create personalized training plans by applying evidence-based training science to user data.

CRITICAL: You MUST use the AI analysis data provided in the userContext.aiAnalysis object to create the plan.

TRAINING SCIENCE APPLICATION:

1. TRAINING PHILOSOPHY IMPLEMENTATION (Evidence-Based):
   - PYRAMIDAL: Apply Bompa's periodization theory with weekly intensity progression. Structure: Monday (easy) → Tuesday (moderate) → Wednesday (hard) → Thursday (moderate) → Friday (easy) → Weekend (moderate). Use user's specific paces/FTP for each zone.
   - POLARIZED: Apply Seiler & Tønnessen's 80/20 model. 80% of sessions at <2mmol/L lactate (Zone 1-2), 20% at >4mmol/L lactate (Zone 4-5). No Zone 3 work. Use user's specific paces/FTP for zone targets.
   - THRESHOLD: Apply Coggan & Allen's lactate threshold methodology. 40% Zone 3 (threshold), 40% Zone 2 (aerobic), 20% Zone 4-5 (high intensity). Focus on sustained effort at lactate threshold using user's specific paces/FTP.

2. INTENSITY ZONE APPLICATION (Based on Coggan's Power Training Zones):
   - Zone 1 (Recovery): <55% FTP, <68% HRmax - Use user's easyPace for running, 50% FTP for cycling
   - Zone 2 (Aerobic): 55-75% FTP, 68-83% HRmax - Use user's easyPace for running, 60-70% FTP for cycling
   - Zone 3 (Tempo): 75-90% FTP, 83-94% HRmax - Use user's fiveK pace for running, 80-85% FTP for cycling
   - Zone 4 (Threshold): 90-105% FTP, 94-105% HRmax - Use user's fiveK pace for running, 90-95% FTP for cycling
   - Zone 5 (VO2max): 105-120% FTP, >105% HRmax - Use faster than fiveK pace for running, 105-110% FTP for cycling

3. WORKOUT STRUCTURE REQUIREMENTS:
   - Always use user's specific baseline data (FTP, fiveK pace, easyPace, 1RMs)
   - Never use generic descriptions - create specific, measurable workouts
   - For strength: Include exercises, sets, reps, and weights based on user's 1RMs
   - For intervals: Use exact paces/FTP percentages with specific rest periods
   - For endurance: Use specific pace targets and durations

4. RESPECT USER PREFERENCES (MANDATORY):
   - If user chose "7 days per week" - create 7 workouts per week (NO REST DAYS)
   - If aiAnalysis.strengthFocus exists - you MUST include strength training workouts
   - If aiAnalysis.strengthFocus is "powerlifting" - include compound lifts (squat, bench, deadlift)
   - If aiAnalysis.strengthFocus is "power_development" - include Olympic lifts and plyometrics
   - If aiAnalysis.strengthFocus is "injury_prevention" - include mobility/stability work
   - If aiAnalysis.strengthFocus is "sport_specific" - include sport-specific movements
   - If aiAnalysis.strengthFocus is "muscle_building" - include hypertrophy work (8-12 reps)
   - If aiAnalysis.strengthFocus is "general_fitness" - include balanced strength work

5. WORKOUT DISTRIBUTION RULES:
   - If aiAnalysis.strengthFocus exists: Include 1-2 strength workouts per week
   - If user chose 7 days: Create exactly 7 workouts per week (no rest days)
   - Distribute remaining workouts across swim/bike/run based on aiAnalysis.focusAreas
   - Example: 7 days with strength = 1 strength + 2 swim + 2 bike + 2 run

6. CREATE STRUCTURED OUTPUT: Return a valid JSON plan with this exact structure:

{
  "plan": {
    "name": "Your Training Plan",
    "description": "Personalized training plan based on your assessment",
    "type": "endurance",
    "duration": 4,
    "level": "intermediate",
    "goal": "70.3",
    "status": "active",
    "currentWeek": 0,
    "createdDate": "2025-01-27",
    "totalWorkouts": 28,
    "disciplines": ["swimming"],
    "isIntegrated": true,
    "phase": "Build Phase",
    "phaseDescription": "Building endurance and technique",
    "trainingPhilosophy": "pyramid"
  },
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "Foundation",
      "phase": "Build",
      "workouts": [
        {
          "day": "Monday",
          "type": "Swim",
          "duration": "45 minutes",
          "warmup": "200m easy freestyle",
          "main": "8x100m at 1:45 pace with 30s rest",
          "cooldown": "200m easy freestyle",
          "notes": "Focus on technique"
        }
      ]
    }
  ]
}

CRITICAL: You MUST generate exactly 4 weeks of workouts. Each week should show progression in volume, intensity, or complexity based on the training philosophy. Do not generate fewer than 4 weeks.

Your job is to apply evidence-based training science to the user's unique data to create a scientifically-sound, personalized training plan.`
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

    if (isAnalysis) {
      // For analysis requests, return the AI response directly
      console.log(`🏁 RETURNING ANALYSIS RESULT`);
      return new Response(aiResponse, {
        status: 200,
        headers
      });
    } else {
      // For plan generation requests, parse into structured plan
      const trainingPlan = parseAIResponse(aiResponse, startDate);
      console.log(`🏁 RETURNING TRAINING PLAN`);
      return new Response(JSON.stringify(trainingPlan), {
        status: 200,
        headers
      });
    }

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
    
    // Remove JavaScript comments and any trailing text
    cleanResponse = cleanResponse.replace(/\/\/.*$/gm, '');
    cleanResponse = cleanResponse.replace(/\n\s*\/\/.*$/gm, '');
    
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
    
    console.log('Cleaned JSON:', cleanResponse.substring(0, 500) + '...');
    
    // Try to parse the cleaned JSON
    const parsed = JSON.parse(cleanResponse);
    
    console.log('Parsed plan structure:', JSON.stringify(parsed, null, 2));
    console.log('Plan object exists:', !!parsed.plan);
    console.log('Weeks array exists:', !!parsed.weeks);
    console.log('Plan keys:', parsed.plan ? Object.keys(parsed.plan) : 'No plan object');
    console.log('Root keys:', Object.keys(parsed));
    
    // Ensure it has the expected structure
    if (parsed.plan && parsed.weeks) {
      // Remove AI language from the plan
      if (parsed.plan.name) {
        parsed.plan.name = parsed.plan.name.replace('AI Generated Training Plan', 'Your Training Plan');
        parsed.plan.name = parsed.plan.name.replace('Generated by OpenAI', 'Personalized training plan');
      }
      if (parsed.plan.description) {
        parsed.plan.description = parsed.plan.description.replace('Generated by OpenAI', 'Personalized training plan based on your assessment');
      }
      return parsed;
    }
    
    // If it doesn't have the right structure, throw error
    throw new Error('Invalid plan structure - missing weeks array');
    
  } catch (error) {
    console.log(`❌ PARSE ERROR: ${error.message}`);
    
    // No fallbacks - throw error if AI fails
    throw new Error(`AI plan generation failed: ${error.message}`);
  }
} 