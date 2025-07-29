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
  private apiKey: string;
  private baseURL: string;

  constructor() {
    // Get API key from environment - try multiple common variable names
    this.apiKey = (import.meta as any).env.VITE_OPENAI_API_KEY || 
                  (import.meta as any).env.OPENAI_API_KEY || 
                  (import.meta as any).env.VITE_AI_API_KEY || 
                  (import.meta as any).env.REACT_APP_OPENAI_API_KEY || '';
    this.baseURL = 'https://api.openai.com/v1/chat/completions';
    
    if (!this.apiKey) {
      console.warn('No OpenAI API key found. Check your .env file for OPENAI_API_KEY, VITE_OPENAI_API_KEY, VITE_AI_API_KEY, or REACT_APP_OPENAI_API_KEY');
    }
  }

  // Real AI plan generation with training science
  async generateTrainingPlan(
    prompt: string, 
    startDate: string,
    userContext: any = {}
  ): Promise<AITrainingPlan> {
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('🤖 Starting AI plan generation...');
    
    // Build context-aware prompt with real training science
    const systemPrompt = this.buildTrainingSciencePrompt();
    const userPrompt = this.buildUserPrompt(prompt, startDate, userContext);

    console.log('📤 Sending request to OpenAI...');

    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ Request timeout, using fallback...');
        controller.abort();
      }, 15000); // 15 second timeout

      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000, // Increased for better responses
        }),
      });

      clearTimeout(timeoutId);
      console.log('📥 Received response from OpenAI...');

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;

      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Parse AI response into structured plan
      return this.parseAIResponse(aiResponse, startDate);

    } catch (error) {
      console.error('AI Plan Generation Error:', error);
      
      // Fallback to science-based rules if AI fails
      return this.generateFallbackPlan(prompt, startDate);
    }
  }

  // FIXED: Much better training science system prompt
  private buildTrainingSciencePrompt(): string {
    return `You are an intelligent training AI with expertise in exercise science, periodization, and personalized training design.

INTELLIGENCE GUIDELINES:
- "Complete beginner" = Very conservative, focus on consistency
- "Some fitness" = Light structure, build base
- "Pretty fit" = Moderate intensity, structured progression  
- "Very fit" = Higher intensity, sport-specific training
- "Competitive athlete" = Advanced periodization, precise zones

BENCHMARK INTERPRETATION:
- Running: Use pace/time info to set appropriate training zones
- Cycling: Use speed/FTP data for power-based training
- Swimming: Use stroke ability and distance capacity for workouts
- Strength: Use relative strength for load progression
- Multi-sport: Use experience level for training complexity

TRAINING SCIENCE PRINCIPLES:
- Polarized training (80% easy, 20% hard) for endurance
- Progressive overload with recovery weeks every 3-4 weeks
- Multi-sport integration without overtraining
- Age-appropriate recovery and intensity

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

  // FIXED: Simplified parsing for flatter structure
  private parseAIResponse(aiResponse: string, startDate: string): AITrainingPlan {
    try {
      console.log('🔍 Raw AI Response:', aiResponse.substring(0, 300) + '...');
      
      // Clean the response - remove any markdown, extra text
      let cleanResponse = aiResponse.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      
      // Find the JSON object - look for the outermost braces
      const startIndex = cleanResponse.indexOf('{');
      const lastIndex = cleanResponse.lastIndexOf('}');
      
      if (startIndex === -1 || lastIndex === -1) {
        throw new Error('No JSON braces found in response');
      }
      
      const jsonString = cleanResponse.substring(startIndex, lastIndex + 1);
      console.log('🔍 Cleaned JSON:', jsonString.substring(0, 200) + '...');
      
      const parsedPlan = JSON.parse(jsonString);
      
      // FIXED: Handle both flat workouts array and nested weeks structure
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
      } else if (parsedPlan.weeks && Array.isArray(parsedPlan.weeks)) {
        // Nested weeks structure
        parsedPlan.weeks.forEach((week: any, weekIndex: number) => {
          if (week.workouts && Array.isArray(week.workouts)) {
            week.workouts.forEach((workout: any, dayIndex: number) => {
              const workoutDate = new Date(startDateObj);
              workoutDate.setDate(startDateObj.getDate() + (weekIndex * 7) + dayIndex);
              
              workouts.push({
                name: workout.name || 'Training Session',
                type: workout.type || 'run',
                date: workoutDate.toISOString().split('T')[0],
                duration: workout.duration || 2700,
                description: workout.description || 'Training session',
                intervals: this.parseIntervals(workout.intervals, workout.type),
                strength_exercises: workout.type === 'strength' ? 
                  this.parseStrengthExercises(workout.description || '') : undefined
              });
            });
          }
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

  // SIMPLIFIED: Better fallback plan
  private generateFallbackPlan(prompt: string, startDate: string): AITrainingPlan {
    console.log('🔄 Using intelligent fallback plan generation');
    
    // Detect discipline from prompt
    const promptLower = prompt.toLowerCase();
    let type = 'multi';
    if (promptLower.includes('running') && !promptLower.includes('multi')) type = 'run';
    else if (promptLower.includes('cycling') && !promptLower.includes('multi')) type = 'ride';
    else if (promptLower.includes('swimming') && !promptLower.includes('multi')) type = 'swim';
    else if (promptLower.includes('strength') && !promptLower.includes('multi')) type = 'strength';

    // Generate one week of workouts
    const workouts = this.generateIntelligentWorkouts(type, startDate);

    return {
      plan: {
        name: `${type === 'multi' ? 'Multi-Sport' : type.charAt(0).toUpperCase() + type.slice(1)} Training Plan`,
        description: 'Intelligent training plan based on your assessment',
        type,
        duration: 8,
        level: 'intermediate',
        goal: 'Progressive Training',
        status: 'active',
        currentWeek: 1,
        createdDate: new Date().toISOString().split('T')[0],
        totalWorkouts: workouts.length,
        disciplines: [type],
        isIntegrated: type === 'multi'
      },
      workouts
    };
  }

  // Generate intelligent workouts for fallback
  private generateIntelligentWorkouts(type: string, startDate: string): any[] {
    const workouts = [];
    const startDateObj = new Date(startDate);

    const templates = {
      run: [
        { name: 'Easy Run', type: 'run', duration: 2700, description: 'Comfortable aerobic pace, conversational effort' },
        { name: 'Rest Day', type: 'rest', duration: 0, description: 'Complete rest or light stretching' },
        { name: 'Tempo Run', type: 'run', duration: 3000, description: 'Comfortably hard pace, sustainable for 20-30 minutes' },
        { name: 'Easy Run', type: 'run', duration: 2400, description: 'Recovery pace, very comfortable' },
        { name: 'Intervals', type: 'run', duration: 3000, description: 'Short hard intervals with recovery' },
        { name: 'Long Run', type: 'run', duration: 4500, description: 'Extended aerobic run, build endurance' },
        { name: 'Rest Day', type: 'rest', duration: 0, description: 'Complete rest' }
      ],
      multi: [
        { name: 'Swim Technique', type: 'swim', duration: 2700, description: 'Focus on stroke mechanics and easy aerobic swimming' },
        { name: 'Easy Run', type: 'run', duration: 2400, description: 'Recovery pace running' },
        { name: 'Bike Intervals', type: 'ride', duration: 3000, description: 'Structured cycling intervals' },
        { name: 'Strength Training', type: 'strength', duration: 2700, description: 'Full body functional strength' },
        { name: 'Run Intervals', type: 'run', duration: 3000, description: 'Running speed work' },
        { name: 'Long Bike', type: 'ride', duration: 4200, description: 'Endurance cycling session' },
        { name: 'Rest Day', type: 'rest', duration: 0, description: 'Complete rest' }
      ]
    };

    const template = templates[type as keyof typeof templates] || templates.run;

    template.forEach((workout, index) => {
      if (workout.type !== 'rest') {
        const workoutDate = new Date(startDateObj);
        workoutDate.setDate(startDateObj.getDate() + index);
        
        workouts.push({
          name: workout.name,
          type: workout.type,
          date: workoutDate.toISOString().split('T')[0],
          duration: workout.duration,
          description: workout.description,
          intervals: [],
          strength_exercises: workout.type === 'strength' ? [] : undefined
        });
      }
    });

    return workouts;
  }
}