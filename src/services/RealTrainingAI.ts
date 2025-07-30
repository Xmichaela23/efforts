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

export class RealTrainingAI {
  private baseURL: string;

  constructor() {
    // Use Supabase Edge Function instead of direct OpenAI calls
    this.baseURL = 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/generate-plan';
    
    console.log('🔗 Using Supabase Edge Function for AI plan generation');
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

      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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