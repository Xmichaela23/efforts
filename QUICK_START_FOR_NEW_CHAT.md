# Quick Start for New Chat - Efforts Training App

## 🎯 CURRENT SYSTEM STATUS: JSON RULES ENGINE WITH SWIPE INTERFACE

**We have a fully functional, scientifically-sound JSON Rules Engine with clean swipe interface that's been extensively debugged and enhanced.**

## 🚨 CRITICAL RULE: NO FALLBACKS - REAL USER BASELINE DATA ONLY

### **⚠️ ABSOLUTE REQUIREMENT: User Baseline Data Must Be Complete**
The JSON Rules Engine **WILL NOT WORK** without complete user baseline data. This is by design to ensure scientific accuracy.

#### **✅ REQUIRED BASELINE DATA:**
- **FTP (Functional Threshold Power)** - Required for bike power calculations
- **Run Paces** - Either `easyPace` OR `fiveKPace` (for run pace calculations)
- **Swim Pace** - `swimPace100` (for swim pace calculations)
- **Strength 1RM Values** - `squat1RM`, `deadlift1RM`, `bench1RM` (for strength calculations)

#### **❌ NO FALLBACKS ALLOWED:**
- **No age-based estimates** - Only real performance data
- **No hardcoded defaults** - Everything must come from user baselines
- **No AI-generated values** - Only actual test results
- **No placeholder data** - Complete baseline data required

#### **🔒 SYSTEM BEHAVIOR:**
- **Throws clear errors** when baseline data is missing
- **Fails fast** - No silent failures or hidden assumptions
- **Requires validation** before plan generation
- **No partial plans** - Complete data or no plan

### **🎯 WHY THIS MATTERS:**
We switched from AI-based generation to a **reliable, science-based JSON Rules Engine** specifically because:
- **AI was unreliable** - Generated inconsistent, non-scientific plans
- **Fallbacks were dangerous** - Led to inappropriate training loads
- **User safety is paramount** - Only real baseline data ensures safe training
- **Scientific accuracy** - Every calculation must be based on actual performance

## 🏆 What's Working

### ✅ **Core System: JSON Rules Engine**
- **JSON Rules Engine** using json-rules-engine (2,874 stars)
- **Multi-distance support** (Sprint and 70.3 triathlon)
- **4-step assessment flow**: Distance → Strength → Time → Long Session Day
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression
- **Polarized training** with 80/20 easy/hard distribution
- **Complete workout generation** with evidence-based percentages
- **Progressive overload** with scientific phase progression
- **Clean, minimal UI** with swipe navigation
- **Professional workout details** with warm-ups, cool-downs, and target ranges

### ✅ **User Experience**
- **Simple 4-step assessment** with clear choices
- **Swipe navigation** for easy plan browsing
- **Professional workout details** with specific targets
- **Real-time validation** of user inputs
- **Clear error messages** when data is missing

### ✅ **Technical Architecture**
- **TypeScript** for type safety
- **React** with modern hooks
- **Supabase** for data persistence
- **JSON Rules Engine** for scalable logic
- **Tailwind CSS** for responsive design
- **Vercel** for deployment

## 🧠 Current Architecture

### **JSON Rules Engine**
**Core Service**: `src/services/TrainingRulesEngine.ts`
- **JSON Rules Engine**: Using json-rules-engine (2,874 stars)
- **Distance Rules**: Sprint (12 weeks) and 70.3 (16 weeks) with appropriate volumes
- **Philosophy Rules**: Polarized training with 80/20 easy/hard distribution
- **Strength Rules**: 5 strength options with complete workout generation
- **Personalization**: User baselines drive all targets and weights
- **Progressive Overload**: 12-week plans with Base → Build → Peak → Taper phases
- **Smart Distribution**: Polarized training principles with proper session placement
- **Session Generation**: Complete rules for swim, bike, run, strength, and brick sessions

**Integration Service**: `src/services/SimpleTrainingService.ts`
- **Rules Engine Integration**: Connects UI to JSON Rules Engine
- **User Baseline Management**: Loads and validates user performance data
- **Plan Generation**: Orchestrates rules engine for complete plan generation
- **Error Handling**: Comprehensive validation and error management

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
- **Session Generation**: Complete rules for all session types and intensities
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
- **Polarized Training**: 80% easy sessions, 20% hard sessions

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

### **Backend Stack**
- **Supabase**: Database, authentication, and edge functions
- **PostgreSQL**: Relational database for user data
- **Row Level Security**: Secure data access

### **Integration Stack**
- **Garmin Connect**: Activity and workout data
- **Strava**: Social fitness platform integration
- **OpenAI**: AI-powered plan analysis

## 🚀 Key Features

### **Training Plan Generation**
- **JSON Rules Engine**: Science-based plan generation
- **Multi-Distance Support**: Sprint and 70.3 triathlon
- **Personalized Targets**: All based on user baselines
- **Progressive Overload**: 12-week structured plans
- **Polarized Training**: 80/20 easy/hard distribution

### **Strength Integration**
- **5 Strength Options**: From none to cowboy compound
- **Evidence-Based Percentages**: 80-85% 1RM for compounds
- **Complete Workouts**: Full exercise prescriptions
- **Smart Distribution**: Proper session placement

### **User Experience**
- **Swipe Interface**: Clean, mobile-friendly navigation
- **Professional Workouts**: Detailed session descriptions
- **Personalized Plans**: All targets match user's fitness
- **Easy Assessment**: 4-step plan generation flow

## 📊 Development Status

### **✅ Completed Features**
- **JSON Rules Engine**: Complete implementation with science-based rules
- **Multi-Distance Support**: Sprint and 70.3 triathlon
- **Strength Integration**: All 5 strength options with complete workouts
- **Swipe Interface**: Clean, mobile-optimized navigation
- **User Baseline Integration**: Comprehensive data collection and validation
- **Polarized Training**: Proper 80/20 easy/hard distribution

### **🔄 In Development**
- **Additional Distances**: Olympic and Ironman triathlon
- **Advanced Analytics**: Training progress tracking
- **Enhanced Integrations**: Real-time data sync
- **Mobile App**: Native mobile development

## 🎯 Getting Started

### **Prerequisites**
- Node.js 18+ and npm
- Supabase account
- Garmin Connect account (optional)
- **Complete user baseline data** (FTP, run paces, swim pace, strength 1RM values)

### **Installation**
```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
```

### **Environment Setup**
```bash
# Copy environment template
cp .env.example .env.local

# Add your Supabase credentials
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### **Development**
```bash
npm run dev
```

### **Build & Deploy**
```bash
npm run build
npm run preview
```

## 📈 Performance

### **Current Metrics**
- **Build Time**: ~2 seconds
- **Bundle Size**: ~1MB (optimized)
- **Load Time**: <1 second
- **User Experience**: Smooth 60fps animations

### **Scalability**
- **JSON Rules Engine**: Infinitely scalable for new distances and preferences
- **Database**: PostgreSQL with proper indexing
- **CDN**: Vercel edge network for global performance

## 🤝 Contributing

### **Development Guidelines**
1. **Maintain scalability**: Keep the rules-based approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Minimal design with professional presentation
5. **Enforce baseline requirements**: No fallbacks or estimates allowed

### **Code Standards**
- **TypeScript**: Strict typing throughout
- **Console logging**: Extensive logging for debugging
- **Validation**: Comprehensive plan validation
- **Testing**: Systematic testing of all combinations
- **Error handling**: Clear error messages for missing data

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### **Documentation**
- **Current Status**: [CURRENT_TEST_RESULTS.md](CURRENT_TEST_RESULTS.md)
- **Quick Start**: [QUICK_START_FOR_NEW_CHAT.md](QUICK_START_FOR_NEW_CHAT.md)
- **Architecture**: [NEW_ARCHITECTURE.md](NEW_ARCHITECTURE.md)

### **Issues & Bugs**
- **GitHub Issues**: Report bugs and feature requests
- **Discord**: Community support and discussions

---

**Built with ❤️ using React, TypeScript, and Supabase. The JSON Rules Engine provides scalable, science-based training plan generation for triathletes of all levels!** 🏆

**Remember: This system requires complete user baseline data. No fallbacks, no estimates, no AI-generated values. Only real performance data ensures safe and effective training plans.** 