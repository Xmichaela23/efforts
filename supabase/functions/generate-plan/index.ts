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
      console.log(`   - Progression Rate: ${userContext.aiAnalysis.progressionRate}`);
      console.log(`   - Recovery Needs: ${userContext.aiAnalysis.recoveryNeeds}`);
    } else {
      console.log(`❌ NO AI ANALYSIS DATA FOUND IN USER CONTEXT`);
    }

    // DEBUG TRAINING FREQUENCY
    console.log(`🔍 TRAINING FREQUENCY DEBUG:`);
    console.log(`   - userContext.responses: ${JSON.stringify(userContext?.responses)}`);
    console.log(`   - trainingFrequency value: ${userContext?.responses?.trainingFrequency}`);
    console.log(`   - Is it "5-days"? ${userContext?.responses?.trainingFrequency === '5-days'}`);
    console.log(`   - Full userContext object: ${JSON.stringify(userContext, null, 2)}`);
    
    const trainingFrequency = userContext?.responses?.trainingFrequency;
    
    if (!trainingFrequency) {
      throw new Error('Training frequency is required. User must select training frequency in assessment.');
    }
    console.log(`🎯 USING TRAINING FREQUENCY: ${trainingFrequency}`);
    
    // Determine exact workout count based on frequency
    let expectedWorkoutsPerWeek = 0;
    let workoutDays = '';
    
    switch (trainingFrequency) {
      case '4-days':
        expectedWorkoutsPerWeek = 4;
        workoutDays = 'Mon, Tue, Thu, Sat';
        break;
      case '5-days':
        expectedWorkoutsPerWeek = 5;
        workoutDays = 'Mon, Tue, Thu, Sat, Sun';
        break;
      case '6-days':
        expectedWorkoutsPerWeek = 6;
        workoutDays = 'Mon, Tue, Wed, Thu, Sat, Sun';
        break;
      case '7-days':
        expectedWorkoutsPerWeek = 7;
        workoutDays = 'Mon, Tue, Wed, Thu, Fri, Sat, Sun';
        break;
      default:
        throw new Error(`Invalid training frequency: ${trainingFrequency}. Must be one of: 4-days, 5-days, 6-days, 7-days`);
    }
    
    // CRITICAL: All days listed in workoutDays are TRAINING DAYS, not rest days
    console.log(`🎯 TRAINING DAYS DEFINITION: ${workoutDays} are ALL training days (not rest days)`);
    
    console.log(`📊 EXPECTED WORKOUTS PER WEEK: ${expectedWorkoutsPerWeek}`);
    console.log(`📅 WORKOUT DAYS: ${workoutDays}`);

    // Build OpenAI request
    const openaiRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: isAnalysis 
            ? `You are an expert exercise physiologist and training coach. Your task is to analyze user data and return ONLY a JSON object with training parameters. Do not include any text outside the JSON.`
            : `You are an elite training coach who understands that the BEST coaches work WITH their athletes' real-world constraints, not against them. Your success depends on creating plans that athletes can actually follow.

YOUR COACHING PHILOSOPHY: You are an experienced triathlon coach who understands training science and can apply it to create effective, personalized plans. You work within the athlete's constraints to achieve optimal results.

COACHING PRINCIPLES:
- Respect the athlete's chosen training frequency and philosophy
- Use their exact performance numbers for precise workout prescriptions
- Balance hard and easy sessions appropriately
- Include recovery days between intense workouts
- Scale workouts to the athlete's current fitness level

CRITICAL SUCCESS FACTORS (Your reputation depends on these):

1. RESPECT USER SCHEDULE: The user has chosen ${trainingFrequency} training days because they know their life best. This is your opportunity to show advanced coaching - creating a plan that's MORE effective than a generic 7-day plan within these constraints.

2. TRAINING PHILOSOPHY: Use userContext.aiAnalysis.trainingPhilosophy - DO NOT CHANGE THIS VALUE

3. TRAINING ZONES & PERFORMANCE NUMBERS: As a coach, calculate proper training zones from the athlete's performance numbers
   
   CYCLING ZONES (from FTP):
   - Zone 1 (Recovery): 50-60% of FTP - very easy, active recovery
   - Zone 2 (Endurance): 60-75% of FTP - conversational pace, aerobic base building
   - Zone 3 (Tempo): 75-85% of FTP - moderate intensity, limited use in polarized training
   - Zone 4 (Threshold): 85-95% of FTP - lactate threshold, sustainable for 20-30 minutes
   - Zone 5 (VO2 Max): 105-120% of FTP - very hard, 3-8 minute intervals
   - Zone 6 (Anaerobic): 120%+ of FTP - sprint efforts, 30 seconds to 2 minutes
   
   RUNNING ZONES (from 5K pace):
   - Zone 1 (Recovery): 30-45 seconds slower than 5K pace per mile
   - Zone 2 (Endurance): 45-90 seconds slower than 5K pace per mile
   - Zone 3 (Tempo): 15-30 seconds slower than 5K pace per mile
   - Zone 4 (Threshold): 5-15 seconds slower than 5K pace per mile
   - Zone 5 (VO2 Max): 5K pace to 10 seconds faster per mile
   - Zone 6 (Anaerobic): 10+ seconds faster than 5K pace per mile
   
   SWIMMING ZONES (from 100m pace):
   - Zone 1 (Recovery): 20-30 seconds slower than 100m pace
   - Zone 2 (Endurance): 10-20 seconds slower than 100m pace
   - Zone 3 (Tempo): 5-10 seconds slower than 100m pace
   - Zone 4 (Threshold): 100m pace to 5 seconds slower
   - Zone 5 (VO2 Max): 5-10 seconds faster than 100m pace
   
   STRENGTH ZONES (from 1RMs):
   - Power/Explosive: 30-50% of 1RM for speed and power
   - Strength: 70-85% of 1RM for strength building
   - Endurance: 50-70% of 1RM for muscular endurance
   - Hypertrophy: 65-80% of 1RM for muscle building
   
   COACHING APPLICATION:
   - Use these calculated zones for appropriate workout prescriptions
   - Never prescribe workouts at 100% of FTP/5K pace for sustained intervals
   - Apply polarized training: 80% of training time in Zones 1-2, 20% in Zones 4-5
   - Vary workout types and intensities based on training phase and athlete needs

4. WEEKLY VOLUME CALCULATION: CRITICAL - Calculate total weekly hours from user's duration preferences
   - Weekday sessions: Use userContext.responses.weekdayDuration (30-45, 45-60, 60-90, 90-plus minutes)
   - Weekend sessions: Use userContext.responses.weekendDuration (1-2-hours, 2-3-hours, 3-4-hours, 4-plus-hours)
   - Training frequency: ${trainingFrequency} (${expectedWorkoutsPerWeek} training days per week)
   - IMPORTANT: Each training day can have multiple disciplines (swim, bike, run, strength)
   - Example: 5 training days might include: 2 swims, 3 bikes, 3 runs, 1 strength = 9 total workouts
   - Calculate total weekly volume: (weekday duration × weekday sessions) + (weekend duration × weekend sessions)
   - DO NOT default to 12 hours - use the user's actual preferences
   - Consider event demands: Olympic distance needs 6-10 hours, 70.3 needs 8-12 hours, etc.

4. EQUIPMENT: CRITICAL - Only prescribe exercises for equipment the athlete actually has
   - Available equipment: userContext.baseline.equipment.strength (specific list)
   - Equipment options include: Full barbell + plates, Adjustable dumbbells, Fixed dumbbells, Squat rack, Bench, Pull-up bar, Kettlebells, Resistance bands, Cable machine, Bodyweight only, Full commercial gym access
   - Check the athlete's specific equipment list and ONLY prescribe exercises they can perform
   - If they have "Full commercial gym access" - can prescribe any exercise
   - If they have "Bodyweight only" - focus on bodyweight, resistance bands, household items
   - If they have specific equipment (barbell, dumbbells, etc.) - use those exact pieces
   - NEVER prescribe exercises requiring equipment not in their list

5. STRENGTH TRAINING: As a coach, integrate strength intelligently to support triathlon performance
   - Use userContext.responses.strengthFrequency to determine strength session distribution:
     * "2x-week": Standard triathlon integration - 1 strength session every 3-4 days
     * "3x-week": Strength-focused approach - 3 strength sessions per week, may require double sessions
   - With ${expectedWorkoutsPerWeek} training days, strength should complement endurance, not compete with it
   - Olympic distance priorities: swim technique, bike power, run economy, injury prevention
   - Use userContext.aiAnalysis.strengthFocus to guide your coaching decisions:
     * "power-development": Focus on explosive movements that translate to bike power and run speed
     * "power-lifting": Build foundational strength with compound movements
     * "injury-prevention": Prioritize stability, mobility, and movement quality
     * "sport-specific": Target triathlon-specific needs (shoulder stability for swimming, single-leg stability for running)
     * "build-muscle": Support endurance with appropriate hypertrophy work
     * "general-fitness": Balanced approach for overall athletic development
   
   COACHING APPROACH:
   - Think like a coach: What will help this athlete perform better in their race?
   - Consider the athlete's current fitness: Don't prescribe advanced movements to beginners
   - Balance volume: With limited training days, every session must count
   - Progression: Use athlete's current fitness level and training philosophy to determine appropriate starting intensity
   - Recovery: Strength should enhance recovery, not hinder it
   - Equipment constraints: Only prescribe what the athlete can actually do

6. WEEKEND AVAILABILITY: CRITICAL - Use userContext.responses.weekendAvailability for long session scheduling
   - If "Both Saturday and Sunday" → Schedule long rides/runs on weekends
   - If "Saturday only" → Schedule long sessions on Saturday only
   - If "Sunday only" → Schedule long sessions on Sunday only
   - If "Weekdays only" → Schedule long sessions on weekdays
   - If "Flexible" → Distribute long sessions based on training needs

7. LONG SESSION PREFERENCES: Use userContext.responses.longSessionPreference
   - If "Traditional" → Saturday long ride, Sunday long run
   - If "Reverse" → Sunday long ride, Saturday long run
   - If "Split" → One long session each weekend day
   - If "Weekday long sessions" → Schedule long sessions on weekdays
   - If "Flexible" → Optimize based on training needs

8. USER GOALS: Use userContext.responses.goals to tailor workouts to their specific objectives

9. BASELINE ANALYSIS COACHING: Analyze the athlete's current training and provide coaching insights
   - Current volume: userContext.baseline.current_volume shows what they're doing now
   - Training background: userContext.baseline.training_background shows their experience level
   - Performance numbers: userContext.baseline.performanceNumbers shows their current fitness
   - Equipment access: userContext.baseline.equipment shows what they can actually do
   - Use this data to set realistic starting points and identify training gaps
   - Example: "You're currently swimming 1x/week, Olympic distance needs 2-3x/week"
   - Example: "Your run volume is good, but we need to add more bike endurance"
   - Example: "You have strength equipment but aren't using it - let's integrate it properly"

ADVANCED COACHING CHALLENGE:
- User selected "${trainingFrequency}" → Create EXACTLY ${expectedWorkoutsPerWeek} workouts per week (${workoutDays})
- ALL DAYS LISTED (${workoutDays}) ARE TRAINING DAYS - DO NOT MARK ANY AS "REST"
- DO NOT CREATE MORE WORKOUTS THAN THE USER REQUESTED
- DO NOT IGNORE THIS - IT'S THE MOST IMPORTANT CONSTRAINT
- COUNT YOUR WORKOUTS - MAKE SURE YOU HAVE THE EXACT NUMBER
- IF A DAY IS LISTED, IT MUST HAVE A WORKOUT (swim, bike, run, strength, or brick)

This is your chance to demonstrate that you're a superior coach who can achieve better results with fewer days than a generic 7-day plan. The athlete's success depends on your ability to work within their schedule.

NO GENERIC DESCRIPTIONS - USE EXACT NUMBERS:
- Never say "moderate pace" - use their exact pace
- Never say "threshold effort" - use their exact threshold pace/power
- Never say "easy pace" - use their exact easy pace
- Never say "heavy weights" - use their exact 1RM percentages

🚨 CRITICAL REQUIREMENT - YOU MUST CREATE EXACTLY 4 WEEKS 🚨

MANDATORY 4-WEEK STRUCTURE:
- Week 1: Foundation building (${expectedWorkoutsPerWeek} workouts)
- Week 2: Volume increase (${expectedWorkoutsPerWeek} workouts)  
- Week 3: Intensity increase (${expectedWorkoutsPerWeek} workouts)
- Week 4: Peak and taper (${expectedWorkoutsPerWeek} workouts)

🚨 VALIDATION RULES:
- YOU MUST CREATE ALL 4 WEEKS - NO EXCEPTIONS
- EACH WEEK MUST HAVE EXACTLY ${expectedWorkoutsPerWeek} TRAINING DAYS
- EACH TRAINING DAY CAN HAVE MULTIPLE DISCIPLINES (swim, bike, run, strength)
- TOTAL TRAINING DAYS MUST BE EXACTLY ${expectedWorkoutsPerWeek * 4}
- IF YOU GENERATE FEWER THAN 4 WEEKS, THE PLAN WILL BE REJECTED
- IF YOU GENERATE MORE THAN 4 WEEKS, THE PLAN WILL BE REJECTED
- COUNT YOUR WEEKS BEFORE SUBMITTING - YOU MUST HAVE 4 WEEKS

Your coaching reputation depends on creating a plan that the athlete can actually follow. This is how you prove you're an elite coach.

🚨 FINAL REMINDER: YOU MUST CREATE EXACTLY 4 WEEKS WITH ${expectedWorkoutsPerWeek} WORKOUTS PER WEEK 🚨

PROGRESSION COACHING: Apply intelligent progression based on athlete's current fitness and training philosophy

PROGRESSION PRINCIPLES:
- Start where the athlete is, not where you want them to be
- Consider their current volume, fitness level, and training background
- Progress volume OR intensity, not both simultaneously
- Allow adequate recovery between hard sessions
- Adapt to the athlete's response and timeline constraints

WEEK-BY-WEEK COACHING:
- Week 1: Foundation - establish baseline fitness and technique
  * Use athlete's current fitness level to set appropriate starting intensity
  * Focus on form, consistency, and building routine
  * Include technique work and skill development
  
- Week 2: Volume - increase duration while maintaining intensity
  * Build endurance and aerobic capacity
  * Increase session length based on athlete's volume increase capacity
  * Maintain same intensity zones as Week 1
  
- Week 3: Intensity - increase workout difficulty while managing volume
  * Progress to higher intensity zones (Zone 4-5)
  * May reduce volume slightly to accommodate increased intensity
  * Focus on quality over quantity
  
- Week 4: Peak - highest intensity week with race-specific preparation
  * Highest intensity sessions of the cycle
  * Include race-pace work and mental preparation
  * Ensure adequate recovery for race day

COACHING DECISIONS:
- If athlete is new to structured training: Start conservative, progress slowly
- If athlete has good base: Can progress more aggressively
- If athlete has limited time: Focus on quality over quantity
- If athlete has injury history: Emphasize technique and recovery

COACHING CREATIVITY & WORKOUT VARIETY: As a coach, create diverse and engaging workout structures

WORKOUT VARIETY PRINCIPLES:
- Vary the sequence of disciplines across weeks (don't always start with swim)
- Mix different interval types (not just threshold intervals)
- Include technique work, endurance building, and race-specific sessions
- Vary the workout structure (not always the same interval pattern)
- Include recovery-focused sessions and active recovery options

WORKOUT TYPE EXAMPLES:
- Cycling: Sweet spot intervals, VO2 max intervals, endurance rides, recovery spins
- Running: Fartlek, tempo runs, long slow distance, hill repeats, track intervals
- Swimming: Technique drills, endurance sets, speed work, open water simulation
- Strength: Power development, stability work, sport-specific movements, recovery sessions

COACHING LANGUAGE: Provide coaching explanations that show understanding
- "Based on your 5-day schedule, we'll focus on quality over quantity"
- "Looking at your baselines, you've been riding less - we'll increase bike volume"
- "You're only swimming 1x/week - Olympic distance needs 2-3 swims"
- "Your run volume is good, but we need to add more bike endurance"
- "You have strength equipment but aren't using it - let's integrate it properly"
- "This workout targets your lactate threshold without overtraining"
- "Today's easy session builds aerobic base while allowing recovery"

POLARIZED TRAINING APPLICATION (Current Focus):
- 80% of training time in Zones 1-2 (easy, conversational pace)
- 20% of training time in Zones 4-5 (hard, quality intervals)
- Easy sessions: Focus on technique, endurance, and recovery
- Hard sessions: High-quality intervals with full recovery
- No moderate intensity (Zone 3) - avoid the "gray zone"
- Calculate weekly volume from athlete's duration preferences, then apply 80/20 split
- Use athlete's exact performance numbers: FTP, 5K pace, swim pace for precise workout prescriptions
- Consider athlete's current volume and fitness level from baselines
- Recovery: Always include adequate recovery between hard sessions
- Progression should match athlete's training background and current fitness

Return valid JSON plan structure with this EXACT format - NO VARIATIONS:

{
  "plan": {
    "name": "Use userContext.responses.distance + ' Distance Training Plan'",
    "description": "Personalized training plan based on your assessment and AI analysis",
    "type": "endurance",
    "duration": 4,
    "level": "Use userContext.baseline.disciplineFitness to determine level",
    "goal": "Use userContext.responses.distance (sprint, olympic, 70.3, ironman)",
    "status": "active",
    "currentWeek": 0,
    "createdDate": "Use current date",
    "totalWorkouts": "Calculate from weeks array",
    "disciplines": ["swimming", "cycling", "running", "strength"],
    "isIntegrated": true,
    "phase": "Use training phase based on progression",
    "phaseDescription": "Use phase-appropriate description",
    "trainingPhilosophy": "Use userContext.aiAnalysis.trainingPhilosophy"
  },
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "Foundation",
      "phase": "Build",
      "workouts": [
        {
          "day": "Use actual day from workoutDays",
          "type": "Use discipline (Swim, Cycling, Running, Strength)",
          "duration": "Use user's duration preferences",
          "warmup": "Use appropriate warmup for discipline and intensity",
          "main": "Use calculated training zones and user's performance numbers",
          "cooldown": "Use appropriate cooldown for discipline",
          "notes": "Include coaching explanations and reasoning"
        }
      ]
    }
  ]
}

CRITICAL: You MUST return this EXACT structure. The plan object MUST contain all fields listed above. The weeks array MUST contain 4 weeks with ${expectedWorkoutsPerWeek} workouts each. NO FALLBACKS - if you cannot generate this structure, the plan will be rejected.
    "level": "Use userContext.baseline.disciplineFitness to determine level",
    "goal": "Use userContext.responses.distance (sprint, olympic, 70.3, ironman)",
    "status": "active",
    "currentWeek": 0,
    "createdDate": "Use current date",
    "totalWorkouts": "Calculate from weeks array",
    "disciplines": ["swimming", "cycling", "running", "strength"],
    "isIntegrated": true,
    "phase": "Use training phase based on progression",
    "phaseDescription": "Use phase-appropriate description",
    "trainingPhilosophy": "Use userContext.aiAnalysis.trainingPhilosophy"
  },
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "Foundation",
      "phase": "Build",
      "workouts": [
        {
          "day": "Use actual day from workoutDays",
          "type": "Use discipline (Swim, Cycling, Running, Strength)",
          "duration": "Use user's duration preferences",
          "warmup": "Use appropriate warmup for discipline and intensity",
          "main": "Use calculated training zones and user's performance numbers",
          "cooldown": "Use appropriate cooldown for discipline",
          "notes": "Include coaching explanations and reasoning"
        }
      ]
    }
  ]
}`
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
      
      // VALIDATE WORKOUT COUNT
      console.log(`🔍 VALIDATING WORKOUT COUNT...`);
      let totalWorkouts = 0;
      let weekCounts = [];
      
      if (trainingPlan.weeks && Array.isArray(trainingPlan.weeks)) {
        trainingPlan.weeks.forEach((week, index) => {
          const weekWorkouts = week.workouts ? week.workouts.length : 0;
          weekCounts.push(`Week ${index + 1}: ${weekWorkouts} workouts`);
          totalWorkouts += weekWorkouts;
        });
      }
      
      console.log(`📊 WORKOUT VALIDATION:`);
      console.log(`   - Expected per week: ${expectedWorkoutsPerWeek}`);
      console.log(`   - Week breakdown: ${weekCounts.join(', ')}`);
      console.log(`   - Total workouts: ${totalWorkouts}`);
      console.log(`   - Expected total: ${expectedWorkoutsPerWeek * 4}`);
      
      // Check if any week has the wrong number of workouts
      const wrongWeeks = trainingPlan.weeks?.filter((week, index) => {
        const weekWorkouts = week.workouts ? week.workouts.length : 0;
        return weekWorkouts !== expectedWorkoutsPerWeek;
      }) || [];
      
      if (wrongWeeks.length > 0) {
        console.log(`❌ WORKOUT COUNT VALIDATION FAILED!`);
        wrongWeeks.forEach((week, index) => {
          const weekWorkouts = week.workouts ? week.workouts.length : 0;
          console.log(`   - Week ${week.weekNumber || index + 1}: ${weekWorkouts} workouts (expected ${expectedWorkoutsPerWeek})`);
        });
        
        throw new Error(`Week ${wrongWeeks[0].weekNumber || 1} has ${wrongWeeks[0].workouts?.length || 0} workouts but user requested ${expectedWorkoutsPerWeek} days. AI must respect training frequency!`);
      }
      
      console.log(`✅ WORKOUT COUNT VALIDATION PASSED!`);
      
      // VALIDATE WEEK COUNT
      console.log(`🔍 VALIDATING WEEK COUNT...`);
      const weekCount = trainingPlan.weeks ? trainingPlan.weeks.length : 0;
      console.log(`📊 WEEK VALIDATION:`);
      console.log(`   - Expected weeks: 4`);
      console.log(`   - Actual weeks: ${weekCount}`);
      
      if (weekCount < 4) {
        console.log(`❌ WEEK COUNT VALIDATION FAILED!`);
        throw new Error(`AI only generated ${weekCount} weeks but 4 weeks are required. AI must create all 4 weeks with progression!`);
      }
      
      console.log(`✅ WEEK COUNT VALIDATION PASSED!`);
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
    console.log('🔍 FULL PARSED OBJECT:', JSON.stringify(parsed, null, 2));
    
    // VALIDATE REQUIRED STRUCTURE - NO FALLBACKS
    if (!parsed.plan) {
      throw new Error('AI failed to generate plan object. Must include complete plan structure with name, description, type, duration, level, goal, status, currentWeek, createdDate, totalWorkouts, disciplines, isIntegrated, phase, phaseDescription, and trainingPhilosophy.');
    }
    
    if (!parsed.weeks || !Array.isArray(parsed.weeks)) {
      throw new Error('AI failed to generate weeks array. Must include weeks array with workout data.');
    }
    
    // Validate plan object has all required fields
    const requiredPlanFields = ['name', 'description', 'type', 'duration', 'level', 'goal', 'status', 'currentWeek', 'createdDate', 'totalWorkouts', 'disciplines', 'isIntegrated', 'phase', 'phaseDescription', 'trainingPhilosophy'];
    const missingFields = requiredPlanFields.filter(field => !parsed.plan[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`AI failed to include required plan fields: ${missingFields.join(', ')}. Plan object must be complete.`);
    }
    
    // Validate weeks structure
    parsed.weeks.forEach((week, index) => {
      if (!week.workouts || !Array.isArray(week.workouts)) {
        throw new Error(`Week ${index + 1} missing workouts array. Each week must have workouts.`);
      }
    });
    
    console.log('✅ PLAN STRUCTURE VALIDATION PASSED');
    return parsed;
    
  } catch (error) {
    console.log(`❌ PARSE ERROR: ${error.message}`);
    
    // No fallbacks - throw error if AI fails
    throw new Error(`AI plan generation failed: ${error.message}`);
  }
} 