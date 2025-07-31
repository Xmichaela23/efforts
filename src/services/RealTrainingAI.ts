export interface AITrainingPlan {
  plan: {
    name: string;
    description: string;
    type: string;
    duration: number;
    level: string;
    goal: string;
    status: string;
    currentWeek: number;
    createdDate: string;
    totalWorkouts: number;
    disciplines: string[];
    isIntegrated: boolean;
    weeks?: any[]; // Added for new UI
    phase?: string; // Added for new UI
    phaseDescription?: string; // Added for new UI
  };
  workouts: Array<{
    name: string;
    type: string;
    date: string;
    duration: number;
    description: string;
    intervals?: any[];
    strength_exercises?: any[];
  }>;
}

export interface AIAnalysisResult {
  trainingPhilosophy: 'pyramid' | 'polarized' | 'threshold';
  focusAreas: string[];
  weeklyVolume: number;
  intensityDistribution: {
    easy: number;
    moderate: number;
    hard: number;
  };
  strengthFocus: string;
  progressionRate: 'conservative' | 'moderate' | 'aggressive';
  recoveryNeeds: 'high' | 'moderate' | 'low';
  injuryConsiderations: string[];
  equipmentOptimization: string[];
  ageAdjustments: {
    recoveryTime: number;
    intensityModifier: number;
    volumeModifier: number;
  };
  baselineFitness: {
    overallLevel: 'beginner' | 'intermediate' | 'advanced' | 'elite';
    swimLevel: string;
    bikeLevel: string;
    runLevel: string;
    strengthLevel: string;
  };
  customParameters: {
    [key: string]: any;
  };
}

export class RealTrainingAI {
  private analysisURL: string;
  private planURL: string;

  constructor() {
    // Use Supabase Edge Functions for AI analysis and plan generation
    this.analysisURL = 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/analyze-user-profile';
    this.planURL = 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/generate-plan';
  }

  async analyzeUserProfile(userBaselines: any, userResponses: any): Promise<AIAnalysisResult> {
    console.log('🧠 Starting AI user profile analysis...');

    // FAIL-FAST VALIDATION - Check baseline data before any AI calls
    console.log('🔍 Baseline Data Validation:');
    if (!userBaselines) {
      throw new Error('❌ MISSING: No userBaselines object found');
    }

    const performanceNumbers = userBaselines.performanceNumbers;
    console.log('🔍 Performance Numbers:', performanceNumbers);
    console.log('🔍 Current Fitness (5K):', userBaselines.currentFitness);
    console.log('🔍 Full userBaselines object:', userBaselines);
    
    if (!performanceNumbers?.ftp) throw new Error('❌ MISSING: FTP');
    if (!performanceNumbers?.squat) throw new Error('❌ MISSING: Squat 1RM');
    if (!performanceNumbers?.bench) throw new Error('❌ MISSING: Bench 1RM');
    if (!performanceNumbers?.deadlift) throw new Error('❌ MISSING: Deadlift 1RM');
    if (!userBaselines.currentFitness) throw new Error('❌ MISSING: Current Fitness (5K pace)');
    if (!performanceNumbers?.tenK) throw new Error('❌ MISSING: 10K pace');
    if (!performanceNumbers?.swimPace100) throw new Error('❌ MISSING: Swim pace');

    // Calculate age from birthday if not set
    if (!userBaselines.age && userBaselines.birthday) {
      const birthDate = new Date(userBaselines.birthday);
      const today = new Date();
      userBaselines.age = today.getFullYear() - birthDate.getFullYear();
      console.log('✅ Calculated age from birthday:', userBaselines.age);
    }

    if (!userBaselines.age) throw new Error('❌ MISSING: Age (no birthday provided)');
    if (!userBaselines.equipment?.strength || userBaselines.equipment.strength.length === 0) throw new Error('❌ MISSING: Strength equipment');
    if (!userBaselines.injuryHistory) throw new Error('❌ MISSING: Injury history');

    console.log('✅ All required baseline data present');

    try {
      // Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(userBaselines, userResponses);
      console.log('📝 Analysis prompt built, calling AI...');

      // Call the AI analysis Edge Function
      const token = await this.getAuthToken();
      const response = await fetch(this.analysisURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 AI Analysis Response:', data);

      // Parse the analysis result
      const analysisResult = this.parseAnalysisResult(data);
      console.log('✅ AI analysis completed:', analysisResult);
      
      return analysisResult;

    } catch (error) {
      console.error('AI Analysis Error:', error);
      
      // NO FALLBACKS - THROW THE ERROR
      throw error;
    }
  }

  // Build analysis-specific prompt
  private buildAnalysisPrompt(userBaselines: any, userResponses: any): string {
    // Extract key user preferences for emphasis
    const raceDistance = userResponses.distance;
    const strengthChoice = userResponses.strengthTraining;
    
    // Calculate timeline and eventType from user data
    let timeline = 0;
    if (userResponses.eventDate) {
      const eventDate = new Date(userResponses.eventDate);
      const today = new Date();
      timeline = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
    }
    
    let eventType = '';
    if (userResponses.distance) {
      switch (userResponses.distance) {
        case 'ironman':
          eventType = 'Ironman';
          break;
        case '70.3':
          eventType = '70.3';
          break;
        case 'olympic':
          eventType = 'Olympic';
          break;
        case 'sprint':
          eventType = 'Sprint';
          break;
      }
    }
    
    const trainingFrequency = userResponses.trainingFrequency;
    const goals = userResponses.goals || [];
    
    // Safely access baseline data (validation already done above)
    const equipment = userBaselines.equipment;
    const injuryHistory = userBaselines.injuryHistory;
    const injuryRegions = userBaselines.injuryRegions;
    const performanceNumbers = userBaselines.performanceNumbers;
    const currentVolume = userBaselines.current_volume;
    const trainingBackground = userBaselines.trainingBackground;
    const age = userBaselines.age;
    const gender = userBaselines.gender;
    const height = userBaselines.height;
    const weight = userBaselines.weight;
    const disciplineFitness = userBaselines.disciplineFitness;
    const trainingStatus = userBaselines.training_status;
    const volumeIncreaseCapacity = userBaselines.volume_increase_capacity;
    const benchmarkRecency = userBaselines.benchmark_recency;
    const trainingFrequencyBaseline = userBaselines.training_frequency;
    const disciplines = userBaselines.disciplines;
    const units = userBaselines.units;
    
    return `You are an expert exercise physiologist and training coach. Your task is to analyze ALL user answers holistically and create a scientifically-based training plan.

CRITICAL INSTRUCTION: You MUST map and understand EVERY SINGLE ANSWER. Do not focus on individual answers. Instead, understand how ALL answers interact to create the optimal training plan.

COMPLETE USER PROFILE MAPPING:
- Race Distance: ${raceDistance || 'Not specified'}
- Race Name: ${userResponses.raceName || 'Not specified'}
- Event Date: ${userResponses.eventDate || 'Not specified'}
- Water Conditions: ${userResponses.waterConditions || 'Not specified'}
- Cycling Elevation: ${userResponses.cyclingElevationGain || 'Not specified'}
- Cycling Course Profile: ${userResponses.cyclingCourseProfile || 'Not specified'}
- Running Elevation: ${userResponses.runningElevationGain || 'Not specified'}
- Running Course Profile: ${userResponses.runningCourseProfile || 'Not specified'}
- Climate: ${userResponses.climate || 'Not specified'}
- Strength Training Choice: ${strengthChoice || 'Not specified'}
- Timeline: ${timeline} weeks
- Event Type: ${eventType}
- Training Frequency: ${trainingFrequency || 'Not specified'}
- Weekend Availability: ${userResponses.weekendAvailability || 'Not specified'}
- Long Session Preferences: ${userResponses.longSessionPreferences || 'Not specified'}
- Weekday Session Duration: ${userResponses.weekdayDuration || 'Not specified'}
- Weekend Session Duration: ${userResponses.weekendDuration || 'Not specified'}
- Goals: ${goals.join(', ') || 'Not specified'}
- Equipment Available: ${JSON.stringify(equipment)}
- Injury History: ${injuryHistory}
- Injury Regions: ${JSON.stringify(injuryRegions)}
- Performance Numbers: ${JSON.stringify(performanceNumbers)}
- Current Training Volume: ${JSON.stringify(currentVolume)}
- Training Background: ${trainingBackground}
- Age: ${age}
- Gender: ${gender}
- Height: ${height}
- Weight: ${weight}
- Discipline Fitness: ${JSON.stringify(disciplineFitness)}
- Training Status: ${JSON.stringify(trainingStatus)}
- Volume Increase Capacity: ${JSON.stringify(volumeIncreaseCapacity)}
- Benchmark Recency: ${JSON.stringify(benchmarkRecency)}
- Training Frequency: ${JSON.stringify(trainingFrequencyBaseline)}
- Disciplines: ${JSON.stringify(disciplines)}
- Units: ${units}

TRAINING SCIENCE FRAMEWORK:
1. Training Philosophies:
   - PYRAMID: Builds from high volume/low intensity to low volume/high intensity. Best for: Beginners, base building, injury prevention, those with limited time.
   - POLARIZED: 80% easy, 20% hard with minimal moderate work. Best for: Advanced athletes, performance focus, those with high training capacity.
   - THRESHOLD: Focuses on lactate threshold work. Best for: Time-crunched athletes, specific performance goals, intermediate athletes.

2. Strength Training Approaches:
   - POWER-LIFTING: Compound lifts (squat, bench, deadlift) with progressive overload. Best for: Building maximal strength, power development.
   - POWER-DEVELOPMENT: Olympic lifts, plyometrics, explosive movements. Best for: Athletic performance, power output.
   - INJURY-PREVENTION: Mobility work, corrective exercises, stability training. Best for: Injury history, prevention focus.
   - SPORT-SPECIFIC: Movements that mimic sport demands. Best for: Performance athletes, sport-specific goals.
   - BUILD-MUSCLE: Hypertrophy focus with moderate rep ranges. Best for: Muscle building, aesthetic goals.
   - GENERAL-FITNESS: Balanced approach with variety. Best for: General health, maintenance.

3. Progression Types:
   - CONSERVATIVE: 5-10% increases, longer adaptation periods. Best for: Beginners, injury history, older athletes.
   - MODERATE: 10-15% increases, balanced progression. Best for: Most athletes, intermediate level.
   - AGGRESSIVE: 15-25% increases, rapid progression. Best for: Advanced athletes, high training capacity.

4. Recovery Emphasis:
   - HIGH: More rest days, lower intensity, longer recovery periods. Best for: Injury history, older athletes, high stress.
   - MODERATE: Balanced recovery approach. Best for: Most athletes.
   - LOW: Minimal recovery focus, higher intensity. Best for: Young athletes, high training capacity.

ANALYSIS REQUIREMENTS:
You MUST return a JSON object with these EXACT fields:
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

YOU MUST INCLUDE BOTH timeline AND eventType IN YOUR JSON RESPONSE.`;
  }

  private parseAnalysisResult(data: any): AIAnalysisResult {
    try {
      console.log('🔍 Parsing AI analysis result:', data);
      
      // Handle the case where data is already a parsed object
      if (data.trainingPhilosophy) {
        // Transform the AI response to match expected format
        const transformed = this.transformAIResponse(data);
        console.log('✅ Transformed AI response:', transformed);
        return transformed;
      }
      
      // Handle the case where data is a string (from Edge Function)
      if (typeof data === 'string') {
        console.log('📝 Parsing string response from Edge Function');
        const jsonMatch = data.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ Parsed JSON from string:', parsed);
          const transformed = this.transformAIResponse(parsed);
          return transformed;
        }
      }
      
      // Handle the case where data is an object but needs parsing
      const responseText = JSON.stringify(data);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const transformed = this.transformAIResponse(parsed);
        return transformed;
      }
      
      throw new Error('Could not parse analysis result');
      
    } catch (error) {
      console.error('Failed to parse analysis result:', error);
      throw error;
    }
  }

  // Transform AI response to match expected AIAnalysisResult format
  private transformAIResponse(aiResponse: any): AIAnalysisResult {
    console.log('🔄 Transforming AI response to expected format');
    
    // Transform weeklyVolume from object to number
    let weeklyVolume = 8; // Default
    if (aiResponse.weeklyVolume && typeof aiResponse.weeklyVolume === 'object') {
      // Sum up all sport volumes
      const volumes = Object.values(aiResponse.weeklyVolume);
      weeklyVolume = volumes.reduce((sum: number, volume: unknown) => {
        const numVolume = typeof volume === 'number' ? volume : Number(volume) || 0;
        return sum + (numVolume as number);
      }, 0);
    } else if (typeof aiResponse.weeklyVolume === 'number') {
      weeklyVolume = aiResponse.weeklyVolume;
    }
    
    // Transform intensityDistribution
    let intensityDistribution = { easy: 60, moderate: 25, hard: 15 }; // Default
    if (aiResponse.intensityDistribution) {
      const ai = aiResponse.intensityDistribution;
      intensityDistribution = {
        easy: ai.easy || ai.threshold || 60,
        moderate: ai.moderate || ai.threshold || 25,
        hard: ai.hard || ai.vo2max || 15
      };
    }
    
    // Transform strength approach
    let strengthFocus = 'general_fitness'; // Default
    if (aiResponse.strengthApproach) {
      const mapping: { [key: string]: string } = {
        'power-lifting': 'powerlifting',
        'power-development': 'power_development',
        'injury-prevention': 'injury_prevention',
        'sport-specific': 'sport_specific',
        'build-muscle': 'muscle_building',
        'general-fitness': 'general_fitness'
      };
      strengthFocus = mapping[aiResponse.strengthApproach] || 'general_fitness';
    }
    
    // Transform progression type
    let progressionRate: 'conservative' | 'moderate' | 'aggressive' = 'moderate'; // Default
    if (aiResponse.progressionType) {
      progressionRate = aiResponse.progressionType as 'conservative' | 'moderate' | 'aggressive';
    }
    
    // Transform recovery emphasis
    let recoveryNeeds: 'high' | 'moderate' | 'low' = 'moderate'; // Default
    if (aiResponse.recoveryEmphasis) {
      recoveryNeeds = aiResponse.recoveryEmphasis as 'high' | 'moderate' | 'low';
    }
    
    const transformed: AIAnalysisResult = {
      trainingPhilosophy: aiResponse.trainingPhilosophy || 'threshold',
      focusAreas: aiResponse.focusAreas || ['swim', 'bike', 'run'],
      weeklyVolume,
      intensityDistribution,
      strengthFocus,
      progressionRate,
      recoveryNeeds,
      injuryConsiderations: aiResponse.injuryConsiderations || [],
      equipmentOptimization: aiResponse.equipmentOptimization || [],
      ageAdjustments: aiResponse.ageAdjustments || {
        recoveryTime: 24,
        intensityModifier: 1.0,
        volumeModifier: 1.0
      },
      baselineFitness: aiResponse.baselineFitness || {
        overallLevel: 'intermediate',
        swimLevel: 'intermediate',
        bikeLevel: 'intermediate',
        runLevel: 'intermediate',
        strengthLevel: 'intermediate'
      },
      customParameters: aiResponse.customParameters || {}
    };
    
    console.log('✅ Transformation complete:', transformed);
    return transformed;
  }

  private async getAuthToken(): Promise<string> {
    try {
      // Get Supabase session for authentication
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://yyriamwvtvzlkumqrvpm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      );
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('User must be logged in to generate training plans');
      }
      
      return session.access_token;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw new Error('Authentication required for AI analysis');
    }
  }

  // Real AI plan generation with training science
  async generateTrainingPlan(
    prompt: string, 
    startDate: string,
    userContext: any = {}
  ): Promise<AITrainingPlan> {
    
    console.log('🤖 Starting AI plan generation via Edge Function...');
    
    // Build context-aware prompt with real training science
    const systemPrompt = this.buildTrainingSciencePrompt();
    const userPrompt = this.buildUserPrompt(prompt, startDate, userContext);
    
    // Combine system and user prompts for edge function
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    console.log('📤 Sending request to Supabase Edge Function...');

    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ Request timeout, aborting...');
        controller.abort();
      }, 45000); // 45 second timeout

      // Get Supabase session for authentication
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://yyriamwvtvzlkumqrvpm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      );
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('User must be logged in to generate training plans');
      }

      const response = await fetch(this.planURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: fullPrompt,
          startDate,
          userContext
        }),
      });

      clearTimeout(timeoutId);
      console.log('📥 Received response from Edge Function...');
      console.log('📥 Response status:', response.status);
      console.log('📥 Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('📥 Error response:', errorText);
        throw new Error(`Edge Function error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // The edge function returns the parsed plan directly
      if (data.error) {
        console.error('❌ Edge Function returned error:', data.error);
        throw new Error(`Edge Function error: ${data.error}`);
      }

      console.log('🤖 Plan generated successfully via Edge Function');
      return data;

    } catch (error) {
      console.error('❌ Plan generation failed:', error);
      
      // NO FALLBACKS - THROW THE ERROR
      throw error;
    }
  }

  // Build comprehensive training science prompt
  private buildTrainingSciencePrompt(): string {
    return `You are an expert exercise physiologist and training coach specializing in endurance sports and strength training. Your task is to create scientifically-based, personalized training plans.

TRAINING SCIENCE PRINCIPLES:

1. PERIODIZATION:
   - Base Phase: Build aerobic capacity and strength foundation
   - Build Phase: Increase intensity and sport-specific work
   - Peak Phase: Taper and race-specific preparation
   - Recovery: Active recovery and maintenance

2. INTENSITY ZONES:
   - Zone 1 (Recovery): 50-60% FTP/HR, very easy effort
   - Zone 2 (Aerobic): 60-75% FTP/HR, conversational pace
   - Zone 3 (Tempo): 75-85% FTP/HR, moderate-hard effort
   - Zone 4 (Threshold): 85-95% FTP/HR, hard but sustainable
   - Zone 5 (VO2max): 95-105% FTP/HR, very hard intervals
   - Zone 6 (Anaerobic): 105%+ FTP/HR, sprint efforts

3. STRENGTH TRAINING PROGRESSION:
   - Week 1-2: 65-70% 1RM, 3x10-12 reps, focus on form
   - Week 3-4: 70-75% 1RM, 3x8-10 reps, build strength
   - Week 5-6: 75-80% 1RM, 3x6-8 reps, strength focus
   - Week 7-8: 80-85% 1RM, 3x4-6 reps, power development

4. RECOVERY PRINCIPLES:
   - Hard days followed by easy days
   - Weekly recovery day (active recovery or complete rest)
   - Progressive overload with adequate recovery
   - Listen to body signals (fatigue, soreness, motivation)

5. SPORT-SPECIFIC CONSIDERATIONS:
   - SWIM: Technique focus, stroke efficiency, open water skills
   - BIKE: Power development, cadence work, bike handling
   - RUN: Running economy, form, terrain specificity
   - STRENGTH: Sport-specific movements, injury prevention

6. NUTRITION TIMING:
   - Pre-workout: 2-3 hours before, balanced meal
   - During: 30-60g carbs/hour for sessions >90 minutes
   - Post-workout: 20-30g protein + carbs within 30 minutes

7. EQUIPMENT OPTIMIZATION:
   - Use available equipment efficiently
   - Adapt exercises to equipment limitations
   - Progressive equipment upgrades as needed

8. INJURY PREVENTION:
   - Proper warm-up and cool-down
   - Gradual progression in volume and intensity
   - Mobility and flexibility work
   - Listen to warning signs

CRITICAL REQUIREMENTS:
1. ALWAYS return a valid JSON object with the exact structure specified
2. Include ALL required fields: name, description, type, duration, level, goal, status, currentWeek, createdDate, totalWorkouts, disciplines, isIntegrated, weeks
3. Each workout MUST have: name, type, date, duration, description
4. Use realistic durations and intensities based on user's fitness level
5. Include proper warm-up and cool-down for each workout
6. Ensure progressive overload throughout the plan
7. Balance training stress with recovery
8. Consider user's equipment limitations and preferences
9. Adapt to user's schedule and availability
10. Include specific instructions for each workout

EXAMPLE PLAN STRUCTURE:
{
  "plan": {
    "name": "4-Week Training Preview",
    "description": "Personalized training plan focusing on [user goals]",
    "type": "triathlon",
    "duration": 4,
    "level": "intermediate",
    "goal": "performance",
    "status": "active",
    "currentWeek": 1,
    "createdDate": "2024-01-01",
    "totalWorkouts": 20,
    "disciplines": ["swim", "bike", "run", "strength"],
    "isIntegrated": true,
    "weeks": [
      {
        "weekNumber": 1,
        "workouts": [
          {
            "day": "Monday",
            "type": "strength",
            "duration": 60,
            "description": "Full body strength session focusing on compound movements..."
          }
        ]
      }
    ]
  }
}

REMEMBER: This is a 4-week preview plan. Focus on building a solid foundation and establishing good training habits.`;
  }

  // Build user-specific prompt
  private buildUserPrompt(
    prompt: string, 
    startDate: string, 
    userContext: any = {}
  ): string {
    return `USER REQUEST: ${prompt}

START DATE: ${startDate}

USER CONTEXT: ${JSON.stringify(userContext, null, 2)}

Please create a 4-week training plan that:
1. Matches the user's goals and current fitness level
2. Uses their available equipment and schedule
3. Follows proper training science principles
4. Includes specific workout details and instructions
5. Provides a solid foundation for continued training

Return ONLY the JSON plan object, no additional text.`;
  }

  // Parse AI response into structured plan
  private parseAIResponse(aiResponse: string, startDate: string): AITrainingPlan {
    try {
      console.log('🔍 Parsing AI plan response...');
      
      // Clean the response
      let cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Parse the JSON
      const parsed = JSON.parse(cleanResponse);
      
      // Validate the structure
      if (!parsed.plan || !parsed.plan.weeks) {
        throw new Error('Invalid plan structure - missing plan or weeks');
      }
      
      // Add default values if missing
      const plan = {
        name: parsed.plan.name || 'Your Training Plan',
        description: parsed.plan.description || 'Personalized training plan',
        type: parsed.plan.type || 'triathlon',
        duration: parsed.plan.duration || 4,
        level: parsed.plan.level || 'intermediate',
        goal: parsed.plan.goal || 'performance',
        status: parsed.plan.status || 'active',
        currentWeek: parsed.plan.currentWeek || 1,
        createdDate: parsed.plan.createdDate || new Date().toISOString().split('T')[0],
        totalWorkouts: parsed.plan.totalWorkouts || 0,
        disciplines: parsed.plan.disciplines || ['swim', 'bike', 'run'],
        isIntegrated: parsed.plan.isIntegrated !== undefined ? parsed.plan.isIntegrated : true,
        weeks: parsed.plan.weeks || []
      };
      
      // Calculate total workouts
      plan.totalWorkouts = plan.weeks.reduce((total: number, week: any) => {
        return total + (week.workouts ? week.workouts.length : 0);
      }, 0);
      
      console.log('✅ Plan parsed successfully');
      return { plan, workouts: [] };
      
    } catch (error) {
      console.error('❌ Failed to parse AI plan response:', error);
      throw new Error(`Plan parsing failed: ${error.message}`);
    }
  }

  // Parse intervals from workout description
  private parseIntervals(intervalStr: string, type: string): any[] {
    const intervals = [];
    
    // Simple interval parsing - can be enhanced
    const intervalMatches = intervalStr.match(/(\d+)x(\d+)(\w+)/g);
    if (intervalMatches) {
      intervalMatches.forEach(match => {
        const [reps, duration, unit] = match.match(/(\d+)x(\d+)(\w+)/)?.slice(1) || [];
        intervals.push({
          reps: parseInt(reps),
          duration: parseInt(duration),
          unit: unit,
          intensity: 'moderate'
        });
      });
    }
    
    return intervals;
  }

  // Parse strength exercises from description
  private parseStrengthExercises(description: string): any[] {
    const exercises = [];
    
    // Simple exercise parsing - can be enhanced
    const exerciseMatches = description.match(/(\d+)x(\d+)\s+([^,]+)/g);
    if (exerciseMatches) {
      exerciseMatches.forEach(match => {
        const [sets, reps, exercise] = match.match(/(\d+)x(\d+)\s+(.+)/)?.slice(1) || [];
        exercises.push({
          name: exercise.trim(),
          sets: parseInt(sets),
          reps: parseInt(reps),
          weight: 'bodyweight'
        });
      });
    }
    
    return exercises;
  }

  // Convert zone to RPE
  private zoneToRPE(zone: number): string {
    const rpeMap: { [key: number]: string } = {
      1: 'Very Easy (RPE 1-2)',
      2: 'Easy (RPE 3-4)',
      3: 'Moderate (RPE 5-6)',
      4: 'Hard (RPE 7-8)',
      5: 'Very Hard (RPE 9-10)',
      6: 'Maximum (RPE 10)'
    };
    return rpeMap[zone] || 'Moderate (RPE 5-6)';
  }
} 