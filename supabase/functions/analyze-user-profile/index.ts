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
    const { prompt } = await req.json();
    
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
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
          content: `You are a training coach. You MUST return a JSON object with these EXACT fields:

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

CRITICAL INSTRUCTIONS:
1. You MUST include BOTH "timeline" and "eventType" fields in your JSON response
2. Use the timeline and eventType values provided in the user data - do not calculate them yourself
3. If the user data shows "Timeline: 11 weeks" and "Event Type: 70.3", then include:
   - "timeline": 11
   - "eventType": "70.3"
4. If timeline or eventType are not provided in user data, use defaults:
   - "timeline": 12
   - "eventType": "General Training"

EXAMPLE RESPONSE:
{
  "trainingPhilosophy": "pyramid",
  "weeklyVolume": { "swim": 2, "bike": 4, "run": 4, "strength": 2 },
  "intensityDistribution": { "easy": 60, "moderate": 25, "hard": 15 },
  "progressionType": "moderate",
  "focusAreas": ["swim", "bike", "run", "strength"],
  "strengthApproach": "power-lifting",
  "recoveryEmphasis": "moderate",
  "timeline": 11,
  "eventType": "70.3"
}

YOU MUST INCLUDE BOTH timeline AND eventType IN YOUR JSON RESPONSE.`
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