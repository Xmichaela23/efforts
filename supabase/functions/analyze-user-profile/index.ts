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
          content: `You are an exercise physiologist and training scientist. Your task is to analyze user data and determine appropriate training parameters based on peer-reviewed research and evidence-based training science.

TRAINING SCIENCE FRAMEWORK:

1. TRAINING PHILOSOPHIES (Evidence-Based Approaches):
   - PYRAMIDAL: Progressive intensity loading with mid-week peak and recovery taper. Based on Bompa's periodization theory and Seiler's research on training progression. Intensity distribution: 60% easy, 25% moderate, 15% hard. Best for: Structured progression, recovery optimization, injury prevention.
   - POLARIZED: 80/20 intensity distribution model based on Seiler & Tønnessen's research (2009). 80% at <2mmol/L lactate (Zone 1-2), 20% at >4mmol/L lactate (Zone 4-5), minimal Zone 3. Best for: Endurance performance improvement, avoiding "junk miles", time efficiency.
   - THRESHOLD: Lactate threshold training methodology from Coggan & Allen's power-based training research. 40% Zone 3 (threshold), 40% Zone 2 (aerobic), 20% Zone 4-5 (high intensity). Best for: Sustained effort events requiring steady-state performance (70.3+, marathon, time trials).

2. INTENSITY ZONES (Based on Coggan's Power Training Zones):
   - Zone 1 (Recovery): <55% FTP, <68% HRmax
   - Zone 2 (Aerobic): 55-75% FTP, 68-83% HRmax
   - Zone 3 (Tempo): 75-90% FTP, 83-94% HRmax
   - Zone 4 (Threshold): 90-105% FTP, 94-105% HRmax
   - Zone 5 (VO2max): 105-120% FTP, >105% HRmax

3. PROGRESSION PRINCIPLES (Based on Bompa's Periodization):
   - CONSERVATIVE: 5-10% volume increases, 2-3 week adaptation cycles. Best for: Injury history, limited training time, gradual progression needs.
   - MODERATE: 10-15% volume increases, 1-2 week adaptation cycles. Best for: Most athletes, balanced progression.
   - AGGRESSIVE: 15-25% volume increases, 1 week adaptation cycles. Best for: High training capacity, experienced athletes.

4. RECOVERY SCIENCE (Based on Fry's Supercompensation Theory):
   - HIGH: 48-72 hour recovery between hard sessions. Best for: Injury history, high stress, limited recovery capacity.
   - MODERATE: 24-48 hour recovery between hard sessions. Best for: Most athletes, balanced training load.
   - LOW: 12-24 hour recovery between hard sessions. Best for: High training capacity, experienced athletes.

ANALYSIS REQUIREMENTS:
Analyze user data and return a JSON object with these exact fields:
{
  "trainingPhilosophy": "pyramid" or "polarized" or "threshold",
  "weeklyVolume": { "swim": number, "bike": number, "run": number, "strength": number },
  "intensityDistribution": { "easy": number, "moderate": number, "hard": number },
  "progressionType": "conservative" or "moderate" or "aggressive",
  "focusAreas": ["array", "of", "focus", "areas"],
  "strengthApproach": "power-lifting" or "power-development" or "injury-prevention" or "sport-specific" or "build-muscle" or "general-fitness",
  "recoveryEmphasis": "high" or "moderate" or "low",
  "timeline": number,
  "eventType": "string",
  "injuryConsiderations": ["array", "of", "injury", "considerations"],
  "equipmentOptimization": ["array", "of", "equipment", "optimizations"],

  "baselineFitness": { "overallLevel": "beginner" or "intermediate" or "advanced" or "elite", "swimLevel": "string", "bikeLevel": "string", "runLevel": "string", "strengthLevel": "string" }
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