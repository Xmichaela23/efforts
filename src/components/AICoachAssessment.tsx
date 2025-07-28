import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageCircle, User, Calendar as CalendarIcon } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { RealTrainingAI } from '@/services/RealTrainingAI';

interface ConversationMessage {
  id: string;
  type: 'ai' | 'user';
  content: string;
  options?: string[];
  selectedOption?: string;
  timestamp: Date;
  showDatePicker?: boolean;
}

interface AssessmentState {
  currentStep: number;
  responses: Record<string, any>;
  isComplete: boolean;
  generatedPlan: any;
}

export default function AICoachAssessment() {
  const { loadUserBaselines } = useAppContext();
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [assessmentState, setAssessmentState] = useState<AssessmentState>({
    currentStep: 0,
    responses: {},
    isComplete: false,
    generatedPlan: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [baselineData, setBaselineData] = useState<any>(null);

  // Load baseline data and initialize conversation
  useEffect(() => {
    const initializeAssessment = async () => {
      try {
        const baselines = await loadUserBaselines();
        setBaselineData(baselines);
        
        if (conversation.length === 0) {
          startConversation(baselines);
        }
      } catch (error) {
        console.error('Error loading baselines:', error);
        if (conversation.length === 0) {
          startConversation(null);
        }
      }
    };
    
    initializeAssessment();
  }, []);

  const startConversation = (baselines: any = null) => {
    let content = "What are you training for?";
    let options = [
      "70.3 Triathlon",
      "Ironman", 
      "Marathon",
      "Strength Training",
      "Keeping base fitness",
      "Other"
    ];

    // Use baseline data to personalize the conversation
    if (baselines) {
      const currentVolume = baselines.current_volume || {};
      const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
        const hours = parseInt(vol as string) || 0;
        return sum + hours;
      }, 0) as number;

      if (totalHours > 0) {
        content = `I see you're currently training ${totalHours} hours per week. What are you training for?`;
      }
    }

    const initialMessage: ConversationMessage = {
      id: '1',
      type: 'ai',
      content,
      options,
      timestamp: new Date()
    };
    setConversation([initialMessage]);
  };

  const handleOptionSelect = async (option: string) => {
    setIsLoading(true);
    
    // Add user selection to conversation
    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: option,
      timestamp: new Date()
    };

    // Update the AI message with selection
    const updatedConversation = conversation.map(msg => 
      msg.type === 'ai' && msg.options ? 
        { ...msg, selectedOption: option } : msg
    );

    setConversation([...updatedConversation, userMessage]);

    // Update assessment state
    const newResponses = { ...assessmentState.responses };
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion) {
      newResponses[currentQuestion.key] = option;
    }

    // Generate next AI response
    const nextResponse = await generateNextResponse(option, newResponses);
    
    if (nextResponse) {
      const aiMessage: ConversationMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: nextResponse.content,
        options: nextResponse.options,
        timestamp: new Date()
      };
      
      setConversation(prev => [...prev, aiMessage]);
      
      if (nextResponse.isComplete) {
        setAssessmentState(prev => ({
          ...prev,
          isComplete: true,
          responses: newResponses
        }));
      } else {
        setAssessmentState(prev => ({
          ...prev,
          currentStep: prev.currentStep + 1,
          responses: newResponses
        }));
      }
    }

    setIsLoading(false);
  };

  const getCurrentQuestion = () => {
    const questions = [
      { key: 'hasSpecificEvent', label: 'Specific Event' },
      { key: 'goal', label: 'Training Goal' },
      { key: 'timeline', label: 'Timeline' },
      { key: 'previousExperience', label: 'Previous Experience' },
      { key: 'previousTimes', label: 'Previous Times' },
      { key: 'swimming', label: 'Swimming Relationship' },
      { key: 'cycling', label: 'Cycling Relationship' },
      { key: 'running', label: 'Running Relationship' },
      { key: 'trainingFrequency', label: 'Training Frequency' },
      { key: 'weekdayDuration', label: 'Weekday Duration' },
      { key: 'weekendDuration', label: 'Long Session Days' },
      { key: 'longSessionDuration', label: 'Long Session Duration' },
      { key: 'strength', label: 'Strength Training' },
      { key: 'strengthGoal', label: 'Strength Goal' },
      { key: 'philosophy', label: 'Training Philosophy' }
    ];
    return questions[assessmentState.currentStep];
  };

    const generateNextResponse = async (selectedOption: string, responses: Record<string, any>) => {
    // Simulate AI response generation
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { goal, timeline, swimming, cycling, running, previousExperience, previousTimes, hasSpecificEvent, eventDate, courseProfile, surfaceType, climate, trainingFrequency, weekdayDuration, weekendDuration, longSessionDuration, strength, strengthGoal, philosophy } = responses;

    if (!responses.hasSpecificEvent) {
      return {
        content: "Do you have a specific event in mind?",
        options: [
          "Yes, I'm registered for a specific event",
          "Yes, but I haven't registered yet",
          "No, just training for the distance",
          "I'm looking for events to target"
        ],
        isComplete: false
      };
    }

    if (!goal) {
      return {
        content: "What are you training for?",
        options: [
          "70.3 Triathlon",
          "Olympic Triathlon", 
          "Sprint Triathlon",
          "Ironman",
          "Marathon",
          "Half Marathon",
          "10K",
          "5K",
          "General fitness"
        ],
        isComplete: false
      };
    }

    if (!timeline) {
      // Smart timeline recommendation based on baselines
      let timelineRecommendation = "6 months";
      let timelineExplanation = "";
      
      if (baselineData) {
        const currentVolume = baselineData.current_volume || {};
        const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
          const hours = parseInt(vol as string) || 0;
          return sum + hours;
        }, 0) as number;
        
        const trainingBackground = baselineData.trainingBackground || "";
        const hasRaceExperience = baselineData.benchmarks?.running || baselineData.benchmarks?.cycling || baselineData.benchmarks?.swimming;
        
        // 3-month criteria
        if (totalHours >= 8 && trainingBackground.includes("2+ years") && hasRaceExperience) {
          timelineRecommendation = "3 months";
          timelineExplanation = "You have excellent fitness and experience for a 3-month timeline.";
        }
        // 6-month criteria  
        else if (totalHours >= 4 && trainingBackground.includes("6+ months")) {
          timelineRecommendation = "6 months";
          timelineExplanation = "You have a solid base for a 6-month timeline.";
        }
        // 12-month criteria
        else if (totalHours < 4 || trainingBackground.includes("new") || trainingBackground.includes("inconsistent")) {
          timelineRecommendation = "12 months";
          timelineExplanation = "You'll benefit from a longer timeline to build your base safely.";
        }
      }
      
      return {
        content: `Based on your baseline assessment, we recommend ${timelineRecommendation}. ${timelineExplanation} When is your event?`,
        options: ["3 months (experienced)", "6 months (recommended)", "12 months (beginner)", "No specific timeline"],
        isComplete: false
      };
    }

    // If they have a specific event, validate timeline against fitness
    if (responses.hasSpecificEvent === "Yes, I'm registered for a specific event" && !responses.eventDate) {
      return {
        content: "When is your event? (This will help us validate your timeline)",
        options: [
          "Enter event date",
          "I'll enter it later"
        ],
        isComplete: false,
        showDatePicker: true
      };
    }

    // Course details for specific events
    if (responses.hasSpecificEvent && responses.eventDate && !responses.courseProfile) {
      return {
        content: "What's the course profile like?",
        options: [
          "Flat/Rolling",
          "Hilly",
          "Mountainous", 
          "Mixed terrain"
        ],
        isComplete: false
      };
    }

    if (responses.courseProfile && !responses.surfaceType) {
      return {
        content: "What's the surface type?",
        options: [
          "Road/Pavement",
          "Trail/Dirt",
          "Gravel",
          "Mixed surfaces",
          "Track"
        ],
        isComplete: false
      };
    }

    if (responses.surfaceType && !responses.climate) {
      return {
        content: "What's the expected climate?",
        options: [
          "Cool (under 60°F)",
          "Moderate (60-75°F)",
          "Warm (75-85°F)",
          "Hot (85-95°F)",
          "Very hot (95°F+)",
          "Humid conditions",
          "High altitude"
        ],
        isComplete: false
      };
    }

    // Timeline validation for specific events
    if (responses.hasSpecificEvent && responses.eventDate && !timeline) {
      const eventDate = new Date(responses.eventDate);
      const today = new Date();
      const weeksUntilEvent = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
      
      const currentVolume = baselineData?.current_volume || {};
      const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
        const hours = parseInt(vol as string) || 0;
        return sum + hours;
      }, 0) as number;
      
      const trainingBackground = baselineData?.trainingBackground || "";
      
      // Validate timeline against fitness level
      if (goal && goal.includes("70.3")) {
        if (weeksUntilEvent < 12 && totalHours < 6) {
          return {
            content: `Your event is in ${weeksUntilEvent} weeks, but you're currently training ${totalHours} hours per week. For a 70.3, you'll need at least 6+ hours per week. Consider:`,
            options: ["Continue anyway", "Find a later event", "Build base first"],
            isComplete: false
          };
        } else if (weeksUntilEvent < 16 && trainingBackground.includes("new")) {
          return {
            content: `Your event is in ${weeksUntilEvent} weeks, but you're new to structured training. Consider:`,
            options: ["Continue anyway", "Find a later event", "Build base first"],
            isComplete: false
          };
        }
      }
      
      // Set timeline based on event date
      return {
        content: `Your event is in ${weeksUntilEvent} weeks. Based on your current fitness, this timeline is ${weeksUntilEvent >= 16 ? 'realistic' : weeksUntilEvent >= 12 ? 'challenging but possible' : 'aggressive'}.`,
        options: ["Continue with this timeline", "Find a later event", "Build base first"],
        isComplete: false
      };
    }

    // 70.3 Training Gate Check (for non-specific events)
    if (goal && goal.includes("70.3") && !timeline && !responses.hasSpecificEvent) {
      const currentVolume = baselineData?.current_volume || {};
      const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
        const hours = parseInt(vol as string) || 0;
        return sum + hours;
      }, 0) as number;

      if (totalHours < 4) {
        return {
          content: `For a 70.3, you'll need at least 4-5 hours per week to start. You're currently training ${totalHours} hours. Most successful 70.3 athletes build to 8-13 hours per week.`,
          options: ["Continue anyway", "Extend timeline", "Build base first"],
          isComplete: false
        };
      }
    }

    if (!swimming) {
      return {
        content: "What's your relationship with swimming?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!cycling) {
      return {
        content: "Got it. What's your relationship with cycling?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!running) {
      return {
        content: "And what's your relationship with running?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!responses.previousExperience) {
      return {
        content: "Have you completed similar events before?",
        options: [
          "Yes, multiple times",
          "Yes, once or twice", 
          "No, this would be my first",
          "Similar but shorter distance"
        ],
        isComplete: false
      };
    }

    if (!responses.previousTimes) {
      return {
        content: "What were your previous finish times? (If applicable)",
        options: [
          "I don't remember the exact times",
          "I was happy with my performance", 
          "I struggled but finished",
          "I didn't finish (DNF)",
          "This is my first attempt",
          "I can enter my exact times"
        ],
        isComplete: false
      };
    }



    if (!trainingFrequency) {
      // 70.3-specific frequency options
      if (goal && goal.includes("70.3")) {
        return {
          content: "For a 70.3, you'll need at least 6 days per week (2 swims, 3 bikes, 2 runs). How many days can you train?",
          options: [
            "6 days (minimum for 70.3)",
            "7 days (optimal)",
            "5 days (challenging but possible)"
          ],
          isComplete: false
        };
      }
      
      return {
        content: "How many days per week can you train?",
        options: [
          "2-3 days",
          "4-5 days",
          "6+ days"
        ],
        isComplete: false
      };
    }

    if (!weekdayDuration) {
      // 70.3-specific weekday options
      if (goal && goal.includes("70.3")) {
        return {
          content: "For 70.3 training, weekday sessions should be 45-90 minutes. How long do you want your weekday sessions?",
          options: [
            "45-60 minutes (minimum)",
            "60-75 minutes (recommended)",
            "75-90 minutes (optimal)"
          ],
          isComplete: false
        };
      }
      
      return {
        content: "How long do you want your weekday sessions?",
        options: [
          "30-45 minutes",
          "45-60 minutes",
          "60-90 minutes",
          "90+ minutes"
        ],
        isComplete: false
      };
    }

    if (!weekendDuration) {
      // 70.3-specific weekend options with back-to-back emphasis
      if (goal && goal.includes("70.3")) {
        return {
          content: "For 70.3, you'll need long bike rides (up to 3 hours) and long runs (up to 90 minutes). When are your long training days?",
          options: [
            "Saturday & Sunday (traditional)",
            "Tuesday & Wednesday (midweek)",
            "Wednesday & Thursday (midweek)",
            "Friday & Saturday (weekend start)",
            "Sunday & Monday (weekend end)"
          ],
          isComplete: false
        };
      }
      
      return {
        content: "How long do you want your longer sessions?",
        options: [
          "1-2 hours",
          "2-3 hours",
          "3-4 hours",
          "4+ hours"
        ],
        isComplete: false
      };
    }

    if (!longSessionDuration) {
      // 70.3-specific long session duration
      if (goal && goal.includes("70.3")) {
        return {
          content: "How long do you want your long sessions? (Bike rides up to 3 hours, runs up to 90 minutes)",
          options: [
            "1.5-2 hours (bike) / 60-75 min (run)",
            "2-2.5 hours (bike) / 75-90 min (run)",
            "2.5-3 hours (bike) / 90+ min (run)"
          ],
          isComplete: false
        };
      }
      
      return {
        content: "How long do you want your longer sessions?",
        options: [
          "1-2 hours",
          "2-3 hours",
          "3-4 hours",
          "4+ hours"
        ],
        isComplete: false
      };
    }

    if (!strength) {
      return {
        content: "What's your strength training goal?",
        options: [
          "Power (explosive strength)",
          "Hypertrophy (muscle building)",
          "Sport-specific (strength for your sport)",
          "General fitness"
        ],
        isComplete: false
      };
    }



    if (!strengthGoal) {
      return {
        content: "What's your training philosophy preference?",
        options: [
          "🟢 POLARIZED (80% easy, 20% hard)",
          "⚡ PYRAMIDAL (70% easy, 20% moderate, 10% hard)",
          "⚖️ BALANCED (strategic mix)"
        ],
        isComplete: false
      };
    }

    // All questions answered
    return {
      content: "Perfect! I'll build you a personalized training plan based on your responses. Here's what I understand:",
      options: ["Generate my plan", "Review my responses", "Start over"],
      isComplete: true
    };

    return {
      content: "I'm ready to build your plan!",
      options: ["Generate my plan"],
      isComplete: true
    };
  };

  const resetConversation = () => {
    setConversation([]);
    setAssessmentState({
      currentStep: 0,
      responses: {},
      isComplete: false,
      generatedPlan: null
    });
  };

  const generatePlan = async () => {
    setIsLoading(true);
    
    try {
      const ai = new RealTrainingAI();
      
      // Build comprehensive prompt from responses
      const prompt = buildAIPrompt(assessmentState.responses, baselineData);
      const startDate = new Date().toISOString().split('T')[0];
      
      console.log('Generating plan with prompt:', prompt);
      
      const aiPlan = await ai.generateTrainingPlan(prompt, startDate, {
        baselineData,
        responses: assessmentState.responses
      });
      
      // Transform AI plan to display format
      const plan = {
        name: aiPlan.plan.name,
        description: aiPlan.plan.description,
        weeklySchedule: aiPlan.workouts.map(workout => 
          `${workout.date}: ${workout.name} - ${workout.description}`
        ).slice(0, 7), // Show first week
        fullPlan: aiPlan
      };

      setAssessmentState(prev => ({
        ...prev,
        generatedPlan: plan
      }));
      
    } catch (error) {
      console.error('Error generating plan:', error);
      // Fallback to simple plan
      const plan = {
        name: "Your Training Plan",
        description: "Here's your personalized plan based on your assessment.",
        weeklySchedule: [
          "Monday: Swim technique + Strength",
          "Tuesday: Bike intervals", 
          "Wednesday: Easy run + Core",
          "Thursday: Swim endurance",
          "Friday: Bike long ride",
          "Saturday: Long run",
          "Sunday: Rest or active recovery"
        ]
      };
      
      setAssessmentState(prev => ({
        ...prev,
        generatedPlan: plan
      }));
    }
    
    setIsLoading(false);
  };

  const buildAIPrompt = (responses: Record<string, any>, baselineData: any) => {
    const { goal, timeline, swimming, cycling, running, previousExperience, previousTimes, hasSpecificEvent, eventDate, courseProfile, surfaceType, climate, philosophy, strength, sessionDuration, strengthGoal, trainingFrequency, weekdayDuration, weekendDuration, longSessionDuration } = responses;
    
    let prompt = `Create a ${timeline} training plan for ${goal}`;
    
    // Timeline-specific guidance
    if (timeline === "3 months (experienced)") {
      prompt += `. This is for an experienced athlete with strong base fitness. Focus on high-intensity training and race-specific workouts.`;
    } else if (timeline === "6 months (recommended)") {
      prompt += `. This is for an intermediate athlete with solid base. Include proper periodization with base, build, and peak phases.`;
    } else if (timeline === "12 months (beginner)") {
      prompt += `. This is for a beginner athlete. Focus on building aerobic base, technique development, and injury prevention.`;
    }
    
    prompt += `. The athlete's relationship with swimming is: ${swimming}, cycling: ${cycling}, running: ${running}`;
    
    // Race experience context
    if (previousExperience) {
      prompt += `. Previous race experience: ${previousExperience}`;
      if (previousTimes) {
        prompt += `. Previous performance: ${previousTimes}`;
      }
    }

    // Course details for specific events
    if (hasSpecificEvent && eventDate) {
      prompt += `. Specific event with date: ${eventDate}`;
      if (courseProfile) {
        prompt += `. Course profile: ${courseProfile}`;
      }
      if (surfaceType) {
        prompt += `. Surface type: ${surfaceType}`;
      }
      if (climate) {
        prompt += `. Expected climate: ${climate}`;
      }
    }
    
    if (philosophy) {
      prompt += `. Training philosophy: ${philosophy}`;
    }
    
    if (strength && strength !== "No") {
      prompt += `. Include strength training: ${strength}`;
      if (strengthGoal) {
        prompt += ` with focus on ${strengthGoal}`;
      }
    }
    
    // Training frequency and duration
    if (trainingFrequency) {
      prompt += `. Training frequency: ${trainingFrequency}`;
    }
    if (weekdayDuration) {
      prompt += `. Weekday session duration: ${weekdayDuration}`;
    }
    if (longSessionDuration) {
      prompt += `. Long session duration: ${longSessionDuration}`;
    }
    
    // Age-specific considerations for 40+ athletes
    if (baselineData?.age >= 40) {
      prompt += `. Athlete is ${baselineData.age} years old - prioritize recovery and injury prevention.`;
    }
    
    // Baseline data for context
    if (baselineData) {
      prompt += `. Current training volume: ${JSON.stringify(baselineData.current_volume)}`;
      prompt += `. Training background: ${baselineData.trainingBackground}`;
      if (baselineData.benchmarks) {
        prompt += `. Performance benchmarks: ${JSON.stringify(baselineData.benchmarks)}`;
      }
    }
    
    prompt += `. Create a structured training plan with proper periodization: base phase (aerobic development), build phase (intensity increase), peak phase (race-specific), and taper phase (recovery). Include recovery weeks every 3-4 weeks with 50-70% volume reduction. Ensure progressive overload with appropriate intensity distribution based on training philosophy.`;
    
    // Add nutrition guidance for training sessions
    if (goal && (goal.includes("70.3") || goal.includes("Ironman") || goal.includes("Marathon"))) {
      prompt += ` Include training nutrition guidance: 30-60g carbs per hour for sessions over 60 minutes, hydration recommendations, and race day nutrition strategy.`;
    }
    
    return prompt;
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-gray-600" />
            <h1 className="text-xl font-semibold">Training Assessment</h1>
          </div>
          <button
            onClick={resetConversation}
            className="px-4 py-2 text-gray-600 hover:text-black transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Conversation */}
        <div className="space-y-4 mb-6">
          {conversation.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'ai' ? 'justify-start' : 'justify-end'}`}
            >
                              <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                    message.type === 'ai'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-gray-200 text-gray-900'
                  }`}
                >
                <div className="flex items-center gap-2 mb-2">
                  {message.type === 'ai' ? (
                    <MessageCircle className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                                     <span className="text-xs opacity-75">
                     {message.type === 'ai' ? 'Training Assistant' : 'You'}
                   </span>
                </div>
                <p className="text-sm">{message.content}</p>
                
                {/* Options for AI messages */}
                {message.type === 'ai' && message.options && !message.selectedOption && (
                  <div className="mt-3 space-y-2">
                    {message.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => handleOptionSelect(option)}
                        disabled={isLoading}
                        className="w-full text-left p-2 text-sm bg-white border border-gray-400 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
                    
                    {/* Date Picker for Event Date */}
                    {message.showDatePicker && (
                      <div className="mt-3">
                        <div className="relative">
                          <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="date"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleOptionSelect(e.target.value);
                              }
                            }}
                            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                             <span className="text-sm">Building your plan...</span>
            </div>
          </div>
        )}

        {/* Plan Generation */}
        {assessmentState.isComplete && assessmentState.generatedPlan && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">{assessmentState.generatedPlan.name}</h2>
            <p className="text-gray-600 mb-4">{assessmentState.generatedPlan.description}</p>
            
            <div className="space-y-2">
              <h3 className="font-medium">Your Weekly Schedule:</h3>
              {assessmentState.generatedPlan.weeklySchedule.map((day: string, index: number) => (
                <div key={index} className="text-sm p-2 bg-white rounded border">
                  {day}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Plan Button */}
        {assessmentState.isComplete && !assessmentState.generatedPlan && (
          <div className="text-center">
            <button
              onClick={generatePlan}
              disabled={isLoading}
              className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Generating your plan..." : "Generate My Plan"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}