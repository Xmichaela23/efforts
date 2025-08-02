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

    // Log the AI analysis data for debugging
    if (userContext?.aiAnalysis) {
      console.log(`🧠 AI ANALYSIS DATA RECEIVED:`);
      console.log(`   - Training Philosophy: ${userContext.aiAnalysis.trainingPhilosophy}`);
      console.log(`   - Weekly Volume: ${JSON.stringify(userContext.aiAnalysis.weeklyVolume)}`);
      console.log(`   - Intensity Distribution: ${JSON.stringify(userContext.aiAnalysis.intensityDistribution)}`);
      console.log(`   - Strength Focus: ${userContext.aiAnalysis.strengthFocus}`);
      console.log(`   - Progression Type: ${userContext.aiAnalysis.progressionType}`);
      console.log(`   - Recovery Needs: ${userContext.aiAnalysis.recoveryNeeds}`);
    } else {
      console.log(`❌ NO AI ANALYSIS DATA FOUND IN USER CONTEXT`);
    }

    // Build OpenAI request
    const openaiRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: isAnalysis 
            ? `You are an expert exercise physiologist and training coach. Your task is to analyze user data and return ONLY a JSON object with training parameters. Do not include any text outside the JSON.`
            : `You are creating personalized training plans. You MUST use the user's specific data - NO GENERIC PLANS.

CRITICAL RULES - USE USER DATA ONLY:

1. TRAINING PHILOSOPHY: Use userContext.aiAnalysis.trainingPhilosophy - DO NOT CHANGE THIS VALUE
2. USER PERFORMANCE NUMBERS: Use userContext.baseline.performanceNumbers for exact paces/power
   - Running: Use their exact easyPace for Zone 2, convert their fiveK time to pace per mile for Zone 4
   - Cycling: Use their exact FTP for power targets
   - Swimming: Use their exact swimPace100 for threshold work
   - Strength: Use their exact 1RMs for weight prescriptions
3. EQUIPMENT: Only prescribe exercises for equipment in userContext.baseline.equipment.strength
4. TRAINING FREQUENCY: Use userContext.responses.trainingFrequency (4-days, 5-days, 6-days, 7-days)
5. STRENGTH TRAINING: Include strength if userContext.aiAnalysis.strengthFocus is not "no-strength"
6. WEEKEND AVAILABILITY: Use userContext.responses.weekendAvailability for long session scheduling
7. USER GOALS: Use userContext.responses.goals to tailor workouts to their specific objectives

NO GENERIC DESCRIPTIONS - USE EXACT NUMBERS:
- Never say "moderate pace" - use their exact pace
- Never say "threshold effort" - use their exact threshold pace/power
- Never say "easy pace" - use their exact easy pace
- Never say "heavy weights" - use their exact 1RM percentages

CREATE 4 WEEKS OF WORKOUTS with progression based on their training philosophy.

Return valid JSON plan structure.`
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