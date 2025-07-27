import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageCircle, User } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { RealTrainingAI } from '@/services/RealTrainingAI';

interface ConversationMessage {
  id: string;
  type: 'ai' | 'user';
  content: string;
  options?: string[];
  selectedOption?: string;
  timestamp: Date;
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
      { key: 'goal', label: 'Training Goal' },
      { key: 'timeline', label: 'Timeline' },
      { key: 'swimming', label: 'Swimming Relationship' },
      { key: 'cycling', label: 'Cycling Relationship' },
      { key: 'running', label: 'Running Relationship' },
      { key: 'philosophy', label: 'Training Philosophy' },
      { key: 'strength', label: 'Strength Training' }
    ];
    return questions[assessmentState.currentStep];
  };

  const generateNextResponse = async (selectedOption: string, responses: Record<string, any>) => {
    // Simulate AI response generation
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { goal, timeline, swimming, cycling, running, philosophy, strength } = responses;

    if (!goal) {
      return {
        content: "Great! When is your 70.3?",
        options: ["4 months", "6 months", "8+ months", "No specific timeline"],
        isComplete: false
      };
    }

    if (!timeline) {
      return {
        content: "Perfect! What's your relationship with swimming?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!swimming) {
      return {
        content: "Got it. What's your relationship with cycling?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!cycling) {
      return {
        content: "And what's your relationship with running?",
        options: ["I love it", "I tolerate it", "I hate it", "It's my strength"],
        isComplete: false
      };
    }

    if (!running) {
      return {
        content: "Excellent! What's your training philosophy preference?",
        options: [
          "🟢 POLARIZED (80% easy, 20% hard)",
          "⚡ PYRAMIDAL (70% easy, 20% moderate, 10% hard)",
          "⚖️ BALANCED (strategic mix)"
        ],
        isComplete: false
      };
    }

    if (!philosophy) {
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

    if (!strength) {
      return {
        content: "Do you want to add strength training to your plan?",
        options: ["Yes", "No", "Maybe, tell me more"],
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
    const { goal, timeline, swimming, cycling, running, philosophy, strength } = responses;
    
    let prompt = `Create a training plan for ${goal}`;
    
    if (timeline && timeline !== "No specific timeline") {
      prompt += ` with ${timeline} timeline`;
    }
    
    prompt += `. The athlete's relationship with swimming is: ${swimming}, cycling: ${cycling}, running: ${running}`;
    
    if (philosophy) {
      prompt += `. Training philosophy: ${philosophy}`;
    }
    
    if (strength && strength !== "No") {
      prompt += `. Include strength training: ${strength}`;
    }
    
    if (baselineData) {
      prompt += `. Current training volume: ${JSON.stringify(baselineData.current_volume)}`;
      prompt += `. Training background: ${baselineData.trainingBackground}`;
    }
    
    return prompt;
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-blue-600" />
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
                    : 'bg-blue-600 text-white'
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
                        className="w-full text-left p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
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
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
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
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Generating your plan..." : "Generate My Plan"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
} 