// src/services/RealTrainingAI.ts
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

// Add interface for AI analysis results
export interface AIAnalysisResult {
  trainingPhilosophy: 'pyramid' | 'polarized' | 'balanced';
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
  private baseURL: string;

  constructor() {
    // Use Supabase Edge Function instead of direct OpenAI calls
    this.baseURL = 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/generate-plan';
    
    console.log('🔗 Using Supabase Edge Function for AI plan generation');
  }

  // NEW: Analyze user profile to determine training parameters
  async analyzeUserProfile(userBaselines: any, userResponses: any): Promise<AIAnalysisResult> {
    console.log('🧠 Starting AI user profile analysis...');
    
    try {
      // Build analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(userBaselines, userResponses);
      
      // Use the same edge function but with analysis-specific prompt
      const authToken = await this.getAuthToken();
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          prompt: analysisPrompt,
          startDate: new Date().toISOString().split('T')[0],
          userContext: { analysis: true }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Analysis error: ${data.error}`);
      }

      // Parse the analysis result
      const analysisResult = this.parseAnalysisResult(data);
      console.log('✅ AI analysis completed:', analysisResult);
      
      return analysisResult;

    } catch (error) {
      console.error('AI Analysis Error:', error);
      
      // Return intelligent fallback based on user data
      return this.generateFallbackAnalysis(userBaselines, userResponses);
    }
  }

  // Build analysis-specific prompt
  private buildAnalysisPrompt(userBaselines: any, userResponses: any): string {
    return `You are an expert exercise physiologist and training coach. Analyze the following user profile and determine optimal training parameters.

USER BASELINES:
${JSON.stringify(userBaselines, null, 2)}

USER RESPONSES:
${JSON.stringify(userResponses, null, 2)}

ANALYSIS TASK:
Analyze the user's fitness level, goals, constraints, and preferences to determine optimal training parameters. Consider:

1. **Training Philosophy Selection:**
   - Pyramid: For users needing gradual intensity progression within sessions
   - Polarized: For users with good base fitness seeking performance gains
   - Balanced: For users needing moderate intensity distribution

2. **Focus Areas:**
   - Identify limiting factors (swim/bike/run weaknesses)
   - Determine priority training areas
   - Consider injury history and age

3. **Volume & Intensity:**
   - Calculate appropriate weekly volume based on current fitness
   - Determine intensity distribution (easy/moderate/hard percentages)
   - Consider progression rate based on experience and age

4. **Strength Training:**
   - Determine appropriate strength focus
   - Consider equipment availability and injury history

5. **Recovery & Progression:**
   - Assess recovery needs based on age and current volume
   - Determine safe progression rate

6. **Baseline Fitness Assessment:**
   - Evaluate overall fitness level
   - Assess individual sport levels
   - Consider performance numbers and training history

RESPOND WITH ONLY JSON:
{
  "trainingPhilosophy": "pyramid|polarized|balanced",
  "focusAreas": ["swim", "bike", "run", "strength"],
  "weeklyVolume": 8,
  "intensityDistribution": {
    "easy": 60,
    "moderate": 25,
    "hard": 15
  },
  "strengthFocus": "injury_prevention|power_development|muscle_building|general_fitness",
  "progressionRate": "conservative|moderate|aggressive",
  "recoveryNeeds": "high|moderate|low",
  "injuryConsiderations": ["lower_back", "knee"],
  "equipmentOptimization": ["barbell", "dumbbells"],
  "ageAdjustments": {
    "recoveryTime": 48,
    "intensityModifier": 0.9,
    "volumeModifier": 0.85
  },
  "baselineFitness": {
    "overallLevel": "beginner|intermediate|advanced|elite",
    "swimLevel": "beginner|intermediate|advanced",
    "bikeLevel": "beginner|intermediate|advanced", 
    "runLevel": "beginner|intermediate|advanced",
    "strengthLevel": "beginner|intermediate|advanced"
  },
  "customParameters": {
    "swimPaceModifier": 1.1,
    "bikeFTPModifier": 0.9,
    "runPaceModifier": 1.05
  }
}`;
  }

  // Parse analysis result from AI response
  private parseAnalysisResult(data: any): AIAnalysisResult {
    try {
      console.log('🔍 Parsing AI analysis result:', data);
      
      // The edge function should return the analysis result directly
      if (data.trainingPhilosophy) {
        // Transform the AI response to match expected format
        const transformed = this.transformAIResponse(data);
        console.log('✅ Transformed AI response:', transformed);
        return transformed;
      }
      
      // If not in expected format, try to parse from response
      const responseText = typeof data === 'string' ? data : JSON.stringify(data);
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
        return sum + numVolume;
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
      trainingPhilosophy: aiResponse.trainingPhilosophy || 'balanced',
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

  // Generate intelligent fallback analysis
  private generateFallbackAnalysis(userBaselines: any, userResponses: any): AIAnalysisResult {
    console.log('🔄 Generating fallback analysis...');
    
    const age = userBaselines?.age || 30;
    const currentHours = this.calculateCurrentHours(userBaselines);
    const primaryGoal = userResponses?.primaryGoal || 'base';
    const injuryHistory = userBaselines?.injuryHistory;
    
    // Determine training philosophy based on goal and fitness
    let trainingPhilosophy: 'pyramid' | 'polarized' | 'balanced' = 'balanced';
    if (primaryGoal === 'performance' && currentHours >= 8) {
      trainingPhilosophy = 'polarized';
    } else if (primaryGoal === 'base' || currentHours < 6) {
      trainingPhilosophy = 'pyramid';
    }
    
    // Determine progression rate based on age and experience
    let progressionRate: 'conservative' | 'moderate' | 'aggressive' = 'moderate';
    if (age >= 40 || injuryHistory) {
      progressionRate = 'conservative';
    } else if (currentHours >= 10 && age < 30) {
      progressionRate = 'aggressive';
    }
    
    // Determine recovery needs
    let recoveryNeeds: 'high' | 'moderate' | 'low' = 'moderate';
    if (age >= 40 || injuryHistory) {
      recoveryNeeds = 'high';
    } else if (currentHours < 4) {
      recoveryNeeds = 'low';
    }
    
    // Calculate intensity distribution based on philosophy
    let intensityDistribution = { easy: 60, moderate: 25, hard: 15 };
    if (trainingPhilosophy === 'polarized') {
      intensityDistribution = { easy: 80, moderate: 5, hard: 15 };
    } else if (trainingPhilosophy === 'pyramid') {
      intensityDistribution = { easy: 40, moderate: 40, hard: 20 };
    }
    
    // Determine baseline fitness levels
    const baselineFitness = this.assessBaselineFitness(userBaselines, currentHours);
    
    return {
      trainingPhilosophy,
      focusAreas: this.determineFocusAreas(userResponses),
      weeklyVolume: Math.min(currentHours + 2, 12), // Conservative increase
      intensityDistribution,
      strengthFocus: this.determineStrengthFocus(userResponses, injuryHistory),
      progressionRate,
      recoveryNeeds,
      injuryConsiderations: injuryHistory ? this.parseInjuryRegions(userBaselines?.injuryRegions) : [],
      equipmentOptimization: this.optimizeEquipment(userBaselines?.equipment),
      ageAdjustments: this.calculateAgeAdjustments(age),
      baselineFitness,
      customParameters: this.calculateCustomParameters(userBaselines)
    };
  }

  // Helper methods for fallback analysis
  private calculateCurrentHours(baselines: any): number {
    // Extract current training hours from baselines
    const volumeData = baselines?.volumeIncreaseCapacity;
    if (volumeData?.triathlon) {
      const match = volumeData.triathlon.match(/(\d+)/);
      return match ? parseInt(match[1]) : 6;
    }
    return 6; // Default
  }

  private determineFocusAreas(responses: any): string[] {
    const focusAreas = ['swim', 'bike', 'run'];
    const weakness = responses?.disciplineWeakness;
    
    if (weakness === 'swimming') return ['swim'];
    if (weakness === 'biking') return ['bike'];
    if (weakness === 'running') return ['run'];
    
    return focusAreas;
  }

  private determineStrengthFocus(responses: any, injuryHistory: string): string {
    if (injuryHistory && injuryHistory !== 'No current injuries or limitations') {
      return 'injury_prevention';
    }
    
    const strengthTraining = responses?.strengthTraining;
    const mapping: { [key: string]: string } = {
      'power-development': 'power_development',
      'power-lifting': 'powerlifting',
      'injury-prevention': 'injury_prevention',
      'sport-specific': 'sport_specific',
      'build-muscle': 'muscle_building',
      'general-fitness': 'general_fitness',
      'no-strength': 'general_fitness'
    };
    
    return mapping[strengthTraining] || 'general_fitness';
  }

  private parseInjuryRegions(regions: string[]): string[] {
    return regions || [];
  }

  private optimizeEquipment(equipment: any): string[] {
    if (!equipment?.strength) return ['bodyweight'];
    return equipment.strength;
  }

  private calculateAgeAdjustments(age: number) {
    if (age >= 40) {
      return {
        recoveryTime: 48,
        intensityModifier: 0.9,
        volumeModifier: 0.85
      };
    } else if (age >= 30) {
      return {
        recoveryTime: 36,
        intensityModifier: 0.95,
        volumeModifier: 0.9
      };
    } else {
      return {
        recoveryTime: 24,
        intensityModifier: 1.0,
        volumeModifier: 1.0
      };
    }
  }

  private assessBaselineFitness(baselines: any, currentHours: number): any {
    let overallLevel = 'intermediate';
    if (currentHours >= 10) overallLevel = 'advanced';
    else if (currentHours >= 6) overallLevel = 'intermediate';
    else overallLevel = 'beginner';
    
    return {
      overallLevel,
      swimLevel: 'intermediate',
      bikeLevel: 'intermediate',
      runLevel: 'intermediate',
      strengthLevel: 'intermediate'
    };
  }

  private calculateCustomParameters(baselines: any): any {
    const age = baselines?.age || 30;
    const ageModifier = age >= 40 ? 0.9 : age >= 30 ? 0.95 : 1.0;
    
    return {
      swimPaceModifier: ageModifier,
      bikeFTPModifier: ageModifier,
      runPaceModifier: ageModifier
    };
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

      const response = await fetch(this.baseURL, {
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
      console.error('AI Plan Generation Error:', error);
      
      // No fallbacks - if AI fails, throw the error
      throw new Error(`AI plan generation failed: ${error.message}`);
    }
  }

  // FIXED: Evidence-based training science system prompt
  private buildTrainingSciencePrompt(): string {
    return `You are an intelligent training AI with expertise in exercise science, periodization, and personalized training design.

EVIDENCE-BASED TRAINING SCIENCE PRINCIPLES:

**PERIODIZATION (Based on Bompa & Haff research):**
- Linear periodization: Volume → Intensity → Peak → Taper
- Block periodization: Accumulation → Transmutation → Realization
- Undulating periodization: Daily/weekly intensity variation
- Recovery weeks every 3-4 weeks (20-30% volume reduction)

**POLARIZED TRAINING (Based on Seiler & Tønnessen research):**
- 80% of training at low intensity (Zone 1-2, <2 mmol/L lactate)
- 20% of training at high intensity (Zone 4-5, >4 mmol/L lactate)
- Minimal moderate intensity (Zone 3, "junk miles")
- Proven effective for endurance performance improvement

**PYRAMID TRAINING (Based on traditional strength training principles):**
- Intensity progression within sessions: easy → moderate → hard → moderate → easy
- Allows for proper warm-up and cool-down
- Prevents overtraining within single sessions
- Builds intensity tolerance gradually
- **ELITE ATHLETES:** Use Zone 2 → Zone 3 → Zone 4 → Zone 3 → Zone 2 progression
- **Example:** 10min easy → 15min moderate → 10min hard → 15min moderate → 10min easy

**PROGRESSIVE OVERLOAD (Based on Selye's General Adaptation Syndrome):**
- Systematic increase in training stress over time
- 5-10% weekly volume/intensity increases
- Deload periods every 3-4 weeks to prevent overtraining
- Supercompensation principle for performance gains

**MULTI-SPORT INTEGRATION (Based on triathlon research):**
- Swim-bike-run order for optimal recovery
- 24-48 hour recovery between high-intensity sessions
- Cross-training benefits for injury prevention
- Sport-specific strength training integration

**AGE-APPROPRIATE TRAINING (Based on Masters athlete research):**
- Increased recovery time with age (40+ years)
- Focus on technique and efficiency over volume
- Strength training for injury prevention
- Reduced high-intensity volume, maintained quality

**INJURY PREVENTION (Based on sports medicine research):**
- Gradual progression (10% rule)
- Proper warm-up and cool-down protocols
- Strength training for injury resilience
- Mobility and flexibility maintenance

**HEART RATE ZONES (Based on Karvonen formula):**
- Zone 1: 50-60% HRR (Recovery)
- Zone 2: 60-70% HRR (Aerobic base)
- Zone 3: 70-80% HRR (Tempo)
- Zone 4: 80-90% HRR (Threshold)
- Zone 5: 90-100% HRR (VO2 max)

**STRENGTH TRAINING (Based on NSCA guidelines):**
- Compound movements: squats, deadlifts, rows, presses
- 2-3 sets, 8-12 reps for hypertrophy
- 3-5 sets, 3-6 reps for strength
- 2-3 sessions per week for triathletes

**TAPER PRINCIPLES (Based on Mujika research):**
- 7-21 days before competition
- 40-60% volume reduction
- Maintain intensity, reduce frequency
- Peak performance typically 7-14 days post-taper

INTELLIGENCE GUIDELINES:
- "Complete beginner" = Very conservative, focus on consistency
- "Some fitness" = Light structure, build base
- "Pretty fit" = Moderate intensity, structured progression  
- "Very fit" = Higher intensity, sport-specific training, Zone 3-4 work
- "Competitive athlete" = Advanced periodization, precise zones, Zone 4-5 work
- **8+ hours/week = Elite level training, use Zone 3-4 for long sessions, Zone 4-5 for intervals**

RESPOND WITH ONLY JSON (no extra text):
{
  "plan": {
    "name": "Descriptive Plan Name",
    "description": "Intelligent explanation of training approach",
    "type": "run|ride|swim|strength|multi",
    "duration": 8,
    "level": "beginner|intermediate|advanced",
    "goal": "User's goal"
  },
  "workouts": [
    {
      "name": "Workout Name",
      "type": "run|ride|swim|strength|rest",
      "date": "2025-07-10",
      "duration": 2700,
      "description": "Specific workout with intensity and purpose",
      "intervals": "Detailed intervals if applicable"
    }
  ]
}

Create 7 days of workouts (Week 1) that match the user's fitness level and goals. 
IMPORTANT: Structure workouts based on weekday vs weekend time:
- Monday-Friday: Use weekday time constraints  
- Saturday-Sunday: Use weekend time availability
Include proper rest days and progression.`;
  }

  // Build user-specific prompt
  private buildUserPrompt(
    prompt: string, 
    startDate: string, 
    userContext: any = {}
  ): string {
    let contextInfo = `Start date: ${startDate}\n`;
    
    if (userContext?.focus) {
      contextInfo += `Primary focus: ${userContext.focus}\n`;
    }
    if (userContext?.currentFitness) {
      contextInfo += `Fitness level: ${userContext.currentFitness}\n`;
    }
    if (userContext?.benchmark) {
      contextInfo += `Performance benchmark: ${userContext.benchmark}\n`;
    }
    if (userContext?.frequency) {
      contextInfo += `Training frequency: ${userContext.frequency}\n`;
    }
    if (userContext?.weekdayTime) {
      contextInfo += `Weekday time: ${userContext.weekdayTime}\n`;
    }
    if (userContext?.weekendTime) {
      contextInfo += `Weekend time: ${userContext.weekendTime}\n`;
    }
    if (userContext?.goal) {
      contextInfo += `Main goal: ${userContext.goal}\n`;
    }

    return `${contextInfo}\nRequest: ${prompt}\n\nCreate a personalized training plan that matches their fitness level and constraints. Be intelligent about their descriptions and create appropriate workouts.`;
  }

  // FIXED: Return weeks structure directly for new UI
  private parseAIResponse(aiResponse: string, startDate: string): AITrainingPlan {
    let cleanResponse: string;
    let jsonString: string;
    
    try {
      console.log('🔍 Raw AI Response:', aiResponse.substring(0, 300) + '...');
      
      // Clean the response - remove any markdown, extra text
      cleanResponse = aiResponse.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      
      // Remove any leading/trailing non-JSON characters
      cleanResponse = cleanResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      
      // Find the JSON object - look for the outermost braces
      const startIndex = cleanResponse.indexOf('{');
      const lastIndex = cleanResponse.lastIndexOf('}');
      
      if (startIndex === -1 || lastIndex === -1) {
        throw new Error('No JSON braces found in response');
      }
      
      jsonString = cleanResponse.substring(startIndex, lastIndex + 1);
      console.log('🔍 Cleaned JSON:', jsonString.substring(0, 200) + '...');
      
      const parsedPlan = JSON.parse(jsonString);
      
      // Return the plan structure directly for new UI
      if (parsedPlan.plan && parsedPlan.plan.weeks) {
        console.log('✅ Parsed AI weeks successfully:', parsedPlan.plan.weeks.length);
        
        return {
          plan: {
            name: parsedPlan.plan.name || 'AI Training Plan',
            description: parsedPlan.plan.description || 'Personalized training plan',
            type: parsedPlan.plan.type || 'multi',
            duration: parsedPlan.plan.duration || 8,
            level: parsedPlan.plan.level || 'intermediate',
            goal: parsedPlan.plan.goal || 'Training',
            status: 'active',
            currentWeek: 1,
            createdDate: new Date().toISOString().split('T')[0],
            totalWorkouts: parsedPlan.plan.weeks.reduce((total: number, week: any) => 
              total + (week.workouts?.length || 0), 0),
            disciplines: [parsedPlan.plan.type || 'multi'],
            isIntegrated: (parsedPlan.plan.type || 'multi') === 'multi',
            // Add the weeks structure for new UI
            weeks: parsedPlan.plan.weeks,
            phase: parsedPlan.plan.phase,
            phaseDescription: parsedPlan.plan.phaseDescription
          },
          workouts: [] // Keep empty for compatibility
        };
      }

      // Fallback to old structure if weeks not found
      let workouts: any[] = [];
      const startDateObj = new Date(startDate);

      if (parsedPlan.workouts && Array.isArray(parsedPlan.workouts)) {
        // Direct workouts array
        workouts = parsedPlan.workouts.map((workout: any, index: number) => {
          const workoutDate = new Date(startDateObj);
          workoutDate.setDate(startDateObj.getDate() + index);
          
          return {
            name: workout.name || 'Training Session',
            type: workout.type || 'run',
            date: workoutDate.toISOString().split('T')[0],
            duration: workout.duration || 2700,
            description: workout.description || 'Training session',
            intervals: this.parseIntervals(workout.intervals, workout.type),
            strength_exercises: workout.type === 'strength' ? 
              this.parseStrengthExercises(workout.description || '') : undefined
          };
        });
      }

      console.log('✅ Parsed AI workouts successfully:', workouts.length);

      return {
        plan: {
          name: parsedPlan.plan?.name || 'AI Training Plan',
          description: parsedPlan.plan?.description || 'Personalized training plan',
          type: parsedPlan.plan?.type || 'multi',
          duration: parsedPlan.plan?.duration || 8,
          level: parsedPlan.plan?.level || 'intermediate',
          goal: parsedPlan.plan?.goal || 'Training',
          status: 'active',
          currentWeek: 1,
          createdDate: new Date().toISOString().split('T')[0],
          totalWorkouts: workouts.length,
          disciplines: [parsedPlan.plan?.type || 'multi'],
          isIntegrated: (parsedPlan.plan?.type || 'multi') === 'multi'
        },
        workouts
      };

    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.log('🔍 Full AI Response for debugging:', aiResponse);
      console.log('🔍 Cleaned response:', cleanResponse);
      console.log('🔍 JSON string extracted:', jsonString);
      
      // Throw error to trigger fallback
      throw error;
    }
  }

  // Parse intervals from AI description
  private parseIntervals(intervalStr: string, type: string): any[] {
    if (!intervalStr || type === 'strength') return [];

    const intervals = [];
    
    // Example: "5x3min @ Zone 4"
    const intervalMatch = intervalStr.match(/(\d+)x(\d+)min.*Zone (\d+)/i);
    if (intervalMatch) {
      const [, reps, duration, zone] = intervalMatch;
      
      intervals.push({
        duration: parseInt(duration) * 60,
        intensity: `Zone ${zone}`,
        rpeTarget: this.zoneToRPE(parseInt(zone)),
        repeatCount: parseInt(reps),
        effortLabel: `${duration}min @ Zone ${zone}`
      });
    }

    return intervals;
  }

  // Parse strength exercises from description
  private parseStrengthExercises(description: string): any[] {
    const exercises = [];
    
    // Look for exercise patterns like "Squats 3x8"
    const exerciseMatches = description.match(/([A-Za-z\s]+)\s+(\d+)x(\d+)/g);
    
    exerciseMatches?.forEach(match => {
      const parts = match.match(/([A-Za-z\s]+)\s+(\d+)x(\d+)/);
      if (parts) {
        exercises.push({
          name: parts[1].trim(),
          sets: parseInt(parts[2]),
          reps: parseInt(parts[3]),
          weight: null,
          rpe: 7
        });
      }
    });

    return exercises;
  }

  // Convert training zone to RPE
  private zoneToRPE(zone: number): string {
    const zoneRPE = {
      1: '3',
      2: '4', 
      3: '6',
      4: '8',
      5: '9'
    };
    return zoneRPE[zone as keyof typeof zoneRPE] || '5';
  }


}