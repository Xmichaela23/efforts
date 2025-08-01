import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { 'Content-Type': 'application/json', ...corsHeaders };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Only POST requests allowed' }), {
      status: 405, headers
    });
  }

  try {
    const { prompt, userContext } = await req.json();
    
    if (!prompt || !userContext) {
      return new Response(JSON.stringify({ error: 'Missing prompt or userContext parameter' }), {
        status: 400, headers
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers
      });
    }

    const openaiRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a training analysis AI. Your task is to analyze user data and determine appropriate training parameters.

HOW TO ANALYZE USER DATA:

1. USE THE USER'S DATA: Analyze their baseline fitness metrics, assessment answers, and preferences to determine appropriate training parameters.

2. DETERMINE TRAINING PHILOSOPHY: Based on their assessment choice (pyramid, polarized, or threshold), set the training approach.

3. CALCULATE WEEKLY VOLUME: Based on their training frequency, availability, and event distance, determine appropriate volume for each discipline.

4. SET INTENSITY DISTRIBUTION: Based on their fitness level, age, and training philosophy, determine the right mix of easy, moderate, and hard sessions.

5. ASSESS PROGRESSION: Based on their timeline, experience level, and goals, determine if progression should be conservative, moderate, or aggressive.

6. IDENTIFY FOCUS AREAS: Based on their selected disciplines and goals, determine which areas need focus.

7. SET STRENGTH APPROACH: Based on their strength training choice, determine the appropriate approach.

8. EVALUATE RECOVERY NEEDS: Based on their age, fitness level, and training volume, determine recovery emphasis.

9. USE ACTUAL TIMELINE AND EVENT TYPE: Use the exact timeline and event type from their assessment data.

Return a JSON object with these exact fields:
{
  "trainingPhilosophy": "pyramid" or "polarized" or "threshold",
  "weeklyVolume": { "swim": number, "bike": number, "run": number, "strength": number },
  "intensityDistribution": { "easy": number, "moderate": number, "hard": number },
  "progressionType": "conservative" or "moderate" or "aggressive",
  "focusAreas": ["array", "of", "focus", "areas"],
  "strengthApproach": "power-lifting" or "power-development" or "injury-prevention" or "sport-specific" or "build-muscle" or "general-fitness",
  "recoveryEmphasis": "high" or "moderate" or "low",
  "timeline": number,
  "eventType": "string"
}

CRITICAL: Use the actual timeline and eventType from user data. If not provided, throw an error - no defaults.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    };

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return new Response(JSON.stringify({
        error: 'OpenAI analysis error',
        status: openaiResponse.status,
        details: errorText
      }), {
        status: openaiResponse.status,
        headers
      });
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0]?.message?.content;

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: 'No analysis response from AI' }), {
        status: 500, headers
      });
    }

    console.log('AI Response:', aiResponse);

    // Parse and validate the response
    const analysisResult = parseAnalysisResponse(aiResponse);
    
    // Log the final result for debugging
    console.log('Final Analysis Result:', JSON.stringify(analysisResult, null, 2));
    
    return new Response(JSON.stringify(analysisResult), {
      status: 200, headers
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Analysis error',
      message: error.message
    }), {
      status: 500, headers
    });
  }
});

function parseAnalysisResponse(aiResponse) {
  try {
    let cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    const parsed = JSON.parse(cleanResponse);
    
    const requiredFields = [
      'trainingPhilosophy', 'weeklyVolume', 'intensityDistribution', 'progressionType',
      'focusAreas', 'strengthApproach', 'recoveryEmphasis', 'timeline', 'eventType'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in parsed));
    
    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields);
      console.log('Parsed response:', parsed);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    return parsed;
    
  } catch (error) {
    throw new Error(`AI analysis failed: ${error.message}`);
  }
} 