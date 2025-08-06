# Efforts - Fitness Training App

A comprehensive fitness training application built with React, TypeScript, and Supabase, featuring **template-based training plan generation** and integration with fitness platforms like Garmin and Strava.

## 🎯 CURRENT STATUS: SOLID PLAN ENGINE WITH SWIPE INTERFACE

### ✅ WORKING SYSTEM: Solid Plan Engine
**We've successfully built and deployed a solid, scalable training plan generator with clean swipe interface:**

**Core System (`SimpleTrainingService.ts`):**
- **Solid plan engine** with `generateSolidSprintPlan` and `generateSolid70_3Plan` methods
- **Template-based approach** using base templates + multipliers
- **Multi-distance support** (Sprint and 70.3 triathlon)
- **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression
- **Smart strength session distribution** with 3-tier placement strategy
- **Scientific workout generation** with evidence-based percentages

**UI (`SimplePlanBuilder.tsx`):**
- **Clean swipe interface** with dot indicators and smooth transitions
- **No ugly pill buttons** - replaced with intuitive swipe navigation
- **Professional workout details** with warm-ups, cool-downs, and target ranges
- **Rounded weights** for easy plate math
- **Proper session distribution** around user's chosen long day
- **Updated language**: "Would you like to integrate strength?" and "muscular balance and aesthetics"

### 🏆 What We've Achieved
1. **Scientifically Sound Plans**: Based on real coaching data and research
2. **Personalized Targets**: All paces, power, and weights based on user baselines
3. **Professional Workouts**: Detailed sessions with proper structure
4. **Clean Swipe UI**: Intuitive mobile-friendly interface
5. **Proper Recovery**: Sessions distributed around long day with recovery spacing
6. **Smart Strength Distribution**: 3-tier placement strategy for Cowboy options
7. **Complete Workout Generation**: All strength options with evidence-based percentages
8. **Progressive Overload**: Strength weights properly progress through phases (70%→75%→80%→65% 1RM)
9. **Proper Taper Phase**: Reduces session count from 8 to 4-6 sessions, eliminates extra strength sessions
10. **Multi-Distance Support**: Sprint and 70.3 triathlon with distance-specific templates

## 🧠 Current Architecture

### **Solid Plan Engine**
**Core Service**: `src/services/SimpleTrainingService.ts`
- **Solid Plan Methods**: `generateSolidSprintPlan` and `generateSolid70_3Plan`
- **Base Templates**: Sprint (6 hours/week) and 70.3 (10 hours/week with two long sessions)
- **Time Multipliers**: Scale sessions based on user's time commitment
- **Strength Integration**: 5 strength options with complete workout generation
- **Personalization**: User baselines drive all targets and weights
- **Progressive Overload**: 12-week plans with Base → Build → Peak → Taper phases
- **Smart Distribution**: 3-tier placement strategy for additional strength sessions
- **Phase-Based Strength**: Weights progress from 70% (base) → 75% (build) → 80% (peak) → 65% (taper) 1RM
- **Taper Optimization**: Reduces session count and eliminates extra strength sessions for proper recovery

**UI Integration**: `src/components/SimplePlanBuilder.tsx`
- **4-Step Assessment**: Distance → Strength → Time → Long Session Day
- **Swipe Interface**: Clean dot indicators and smooth week navigation
- **User Baselines**: Loaded from user profile (no manual input)
- **Validation**: Strict enforcement of required baseline data
- **Updated Language**: More conversational and clear strength integration messaging

### **Scientific Foundation**
- **Polarized Training**: 80/20 rule enforcement
- **Research-Based**: Uses actual coaching data (Lauersen et al., Rønnestad & Mujika, Beattie et al.)
- **Strength Percentages**: 80-85% 1RM for compound strength (evidence-based)
- **Recovery Spacing**: Proper session distribution to prevent overtraining
- **Progressive Overload**: Systematic volume and intensity increases
- **Phase-Based Strength Progression**: Weights increase through phases, decrease in taper
- **Workout Science**: Complete exercise prescriptions with proper sets, reps, and rest

## 🎨 User Experience

### **Assessment Flow**
1. **Distance**: Sprint Triathlon or 70.3 Triathlon
2. **Strength**: 5 options from none to cowboy compound with clear descriptions
3. **Time**: 4 levels (minimum to hardcore) with clear hour ranges
4. **Long Session Day**: User picks their preferred long workout day

### **Plan Display**
- **Swipe Interface**: Clean dot indicators and smooth transitions between weeks
- **Professional Layout**: Clean, minimal design with swipe navigation
- **Detailed Workouts**: Warm-ups, main sets, cool-downs with target ranges
- **Personalized Targets**: All based on user's actual baseline data
- **Rounded Weights**: Easy plate math for strength workouts
- **Proper Spacing**: Sessions distributed around long day with recovery
- **Complete Strength**: All 3 sessions properly placed for Cowboy options

### **Data Integration**
- **User Baselines**: FTP, 5K pace, easy pace, swim pace, 1RM values
- **No Fallbacks**: Strict enforcement of required data
- **Age-Based HR**: Heart rate zones calculated from user age
- **Imperial Units**: All paces and weights in imperial units

## 🔧 Technical Architecture

### **Frontend Stack**
- **React + TypeScript**: Modern, type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Professional component library
- **Vite**: Fast development and building

### **Backend Services**
- **Supabase**: Database, authentication, real-time subscriptions
- **User Profiles**: Comprehensive baseline data storage
- **Plan Storage**: Generated plans saved to user accounts

### **External Integrations**
- **Garmin Connect**: OAuth flow, workout import, webhook processing
- **Strava**: OAuth flow, workout import, data preview
- **FIT File Import**: Complete workout data extraction

## 📊 Current Features

### ✅ Working Features
- **Solid plan generation** for Sprint and 70.3 triathlon
- **Personalized workout targets** based on user baselines
- **Professional workout details** with proper structure
- **Clean swipe interface** with dot indicators and smooth transitions
- **Complete strength integration** with 5 different options and full workout generation
- **Smart session distribution** with 3-tier placement strategy
- **Progressive overload** across 12-week plans
- **User baseline management** with comprehensive data collection
- **Scientific workout generation** with evidence-based percentages
- **Multi-distance support** with distance-specific templates

### 🔄 In Development
- **Additional distances** (Olympic, Ironman)
- **Enhanced analytics** for training progress tracking
- **Real-time data sync** across all integrations

## 🚀 Development Status

### **Current Focus**
- **Sprint and 70.3 triathlon plans** are working and professional
- **Solid plan engine** is proven and scalable
- **Swipe UI** is clean and user-friendly
- **Scientific foundation** is sound and evidence-based
- **Strength distribution** is smart and scientifically sound
- **Workout generation** is complete and evidence-based

### **Next Steps**
1. **Extend to other distances** using the same solid plan approach
2. **Add advanced features** like plan comparison and analytics
3. **Improve real-time sync** for better data integration

## 🧪 Testing & Validation

### **Scientific Validation**
- **Polarized distribution**: 80/20 easy/hard ratio maintained
- **Recovery spacing**: Proper session distribution prevents overtraining
- **Progressive overload**: Systematic increases across training phases
- **Strength integration**: Evidence-based percentages and rest periods
- **Workout science**: Complete exercise prescriptions with proper structure
- **Distribution logic**: Smart 3-tier placement strategy for additional sessions

### **User Experience Validation**
- **Clean swipe interface**: No ugly buttons, smooth transitions
- **Professional workouts**: Detailed sessions with proper structure
- **Personalized targets**: All based on actual user data
- **Easy navigation**: Swipe weeks and clear session organization
- **Clear messaging**: Updated language for strength integration

## 📚 Documentation

### **Key Files**
- **`src/services/SimpleTrainingService.ts`**: Core solid plan engine with smart distribution
- **`src/components/SimplePlanBuilder.tsx`**: Main UI component with swipe interface
- **`src/contexts/AppContext.tsx`**: User baseline management
- **`src/components/TrainingBaselines.tsx`**: Baseline data collection
- **`src/services/TrainingTemplates.ts`**: Strength option definitions and descriptions

### **Research Foundation**
- **Lauersen et al. (2014)**: Injury prevention
- **Rønnestad & Mujika (2014)**: Cycling performance
- **Beattie et al. (2014)**: Running economy
- **Seiler & Tønnessen**: Polarized training model
- **Strength Training**: Evidence-based percentages and exercise selection

## 🎯 Success Metrics

### **Technical Success**
- ✅ **Solid plan engine working**: Clean, scalable approach
- ✅ **Personalization working**: All targets based on user data
- ✅ **Swipe UI working**: Professional, intuitive interface
- ✅ **Scientific validation**: Evidence-based training principles
- ✅ **Distribution working**: Smart placement strategy for all strength options
- ✅ **Workout generation**: Complete exercise prescriptions
- ✅ **Multi-distance support**: Sprint and 70.3 with distance-specific templates

### **User Success**
- ✅ **Professional plans**: Detailed, realistic workouts
- ✅ **Easy to use**: Simple 4-step assessment flow
- ✅ **Personalized**: All targets match user's actual fitness
- ✅ **Scalable**: Solid plan approach works for different users
- ✅ **Complete strength**: All 3 sessions properly placed for Cowboy options
- ✅ **Intuitive navigation**: Clean swipe interface

## 🚀 Deployment

### **Frontend Deployment**
- **Method**: Git-based deployment
- **Process**: Commit and push to main branch
- **Automatic**: Vercel handles deployment

### **Backend Deployment**
- **Supabase**: Database and authentication
- **Edge Functions**: Webhook processing for real-time data

## 📞 Support & Development

### **Current State**
- **Sprint and 70.3 triathlon plans**: Fully functional and professional
- **Solid plan engine**: Proven and ready for expansion
- **Swipe UI**: Clean, intuitive, and user-friendly
- **Scientific foundation**: Sound and evidence-based
- **Strength distribution**: Smart and scientifically sound
- **Workout generation**: Complete and evidence-based

### **Development Guidelines**
1. **Maintain simplicity**: Keep the solid plan approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Swipe interface with professional presentation
5. **Ensure distribution**: Smart placement strategy for all session types
6. **Complete workouts**: Full exercise prescriptions with proper structure

**The system is working excellently with a solid plan engine that generates professional, personalized training plans with smart session distribution, complete workout generation, and a clean swipe interface!** 🎯
