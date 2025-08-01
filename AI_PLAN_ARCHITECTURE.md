# AI Plan Generation Architecture

## 🏗️ Kitchen Blueprint

### The Problem
The AI plan generation system is like having all the ingredients for a cake but a kitchen that doesn't work properly. We have the data and science, but the AI doesn't understand how to combine them to create personalized plans.

### Core Concept
- **The "What"** = Training baselines + Plan building answers (user's data)
- **The "How"** = Training philosophies (pyramid, polarized, threshold) - the scientific methodologies
- **The AI's Job** = Apply the "how" to the "what" to create personalized plans

## 🥘 Kitchen Components

### Frontend Prep Station

#### AIPlanBuilder.tsx
- **Current:** Collects assessment answers, builds massive prompt with all data
- **Should Be:** Collects assessment answers, organizes them clearly, sends structured data
- **Duty:** Organize ingredients for the kitchen

#### RealTrainingAI.ts
- **Current:** Builds long training science prompt, sends everything to Edge Function
- **Should Be:** Prepares clear training science instructions, focuses on "how" to apply science
- **Duty:** Prepare cooking instructions

### Backend Kitchen

#### analyze-user-profile Edge Function
- **Current:** Gets massive prompt, tries to analyze, returns generic parameters
- **Should Be:** Receives structured data, analyzes user's current state, determines training parameters
- **Duty:** Analyze ingredients

#### generate-plan Edge Function
- **Current:** Gets massive prompt, tries to generate plan, times out or produces generic plan
- **Should Be:** Receives analyzed data + clear instructions, applies training science to user data, produces personalized plan
- **Duty:** Cook the cake

## 📋 Recipe (System Prompts)

### Current State
- Vague instructions like "be a training expert"
- Massive prompts that overwhelm the AI
- Generic fallbacks instead of using user data

### Should Be
- Clear recipe for how to combine user data with training science
- Specific instructions for applying training philosophies
- No fallbacks - use actual user data

## 🔄 Data Flow

### Current Flow
1. User fills assessment → Massive prompt built → Edge Functions overwhelmed → Generic plan

### Target Flow
1. User fills assessment → Structured data organized → Clear instructions sent → AI applies science to data → Personalized plan

## 🛠️ Specific Changes Needed

### AIPlanBuilder.tsx
- **CHANGE:** Stop building massive prompts
- **TO:** Organize assessment data into clear, structured format
- **SEND:** Clean, organized user data instead of wall of text

### RealTrainingAI.ts
- **CHANGE:** Stop sending everything in one massive prompt
- **TO:** Separate user data from training science instructions
- **SEND:** Two clear pieces: (1) user data, (2) how to apply science

### analyze-user-profile Edge Function
- **CHANGE:** Stop trying to parse massive prompts
- **TO:** Receive structured user data
- **DO:** Analyze current fitness level, determine training parameters
- **SEND:** Clean analysis to generate-plan

### generate-plan Edge Function
- **CHANGE:** Stop getting overwhelmed by massive prompts
- **TO:** Receive analyzed data + clear cooking instructions
- **DO:** Apply training science to user data
- **PRODUCE:** Personalized plan using actual user numbers

### System Prompts
- **CHANGE:** Replace vague "be an expert" language
- **TO:** Clear recipe: "Take user's data, apply chosen training philosophy, use their specific numbers"

## 🎯 Training Philosophies (The "How")

### Pyramid Training
- Structure workouts with intensity progression: easy → moderate → hard → moderate → easy
- Use user's actual paces/FTP to create specific intensity targets within that pyramid

### Polarized Training
- Structure week with 80% easy sessions and 20% hard sessions
- Use user's actual paces/FTP to determine what "easy" and "hard" mean for them

### Threshold Training
- Focus on threshold-specific workouts
- Use user's actual paces/FTP to create threshold targets

## 🚀 Next Steps

1. **Document current state** of each component
2. **Rewrite system prompts** to be clear and actionable
3. **Restructure data flow** to be organized and efficient
4. **Test each component** to ensure it works as designed
5. **Validate output** to ensure personalized plans are generated

## 📝 Notes

- The AI has all the pieces (data + science) but doesn't understand how to combine them
- Need to teach the AI the translation process, not just give it the data
- Focus on "how to use" rather than "what to do"
- No fallbacks - expose real problems instead of hiding them 