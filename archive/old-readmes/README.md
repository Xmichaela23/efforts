# Archived Readmes — Superseded Docs Index

> Archived. These docs describe legacy JSON-rules engines and UI that have been replaced by the universal catalog/import flow and deterministic scheduler documented in the root README.

---

A comprehensive fitness training application built with React, TypeScript, and Supabase, featuring **JSON Rules Engine training plan generation** and integration with fitness platforms like Garmin and Strava.

## 🎯 CURRENT STATUS: JSON RULES ENGINE WITH SWIPE INTERFACE

### ✅ WORKING SYSTEM: JSON Rules Engine
**We've successfully built and deployed a scalable, science-based JSON Rules Engine with clean swipe interface:**

**Core System (`TrainingRulesEngine.ts`):**
- **JSON Rules Engine** using json-rules-engine (2,874 stars)
- **Multi-distance support** (Sprint and 70.3 triathlon)
- **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression
- **Polarized training** with 80/20 easy/hard distribution
- **Complete workout generation** with evidence-based percentages
- **Progressive overload** with scientific phase progression

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
We built a **clean, reliable, scalable JSON Rules Engine** that adapts to user preferences before generating plans. This approach ensures:
- **Reliability** - Consistent, science-based plan generation
- **Scalability** - Easy to add new distances and preferences
- **User Safety** - Only real baseline data ensures safe training
- **Scientific Accuracy** - Every calculation based on actual performance

### **🔧 FUTURE AI INTEGRATION:**
- **AI will be used for tracking** user metrics from wearables (Garmin, etc.)
- **Plan generation remains** clean, reliable JSON Rules Engine
- **AI enhances tracking** - not plan generation
- **Separation of concerns** - reliable plans + smart tracking

### **🔧 IMPLEMENTATION:**
- **Gating mechanism** will be implemented to ensure complete baseline data
- **Validation checks** at every step of the process
- **Clear error messages** when data is missing
- **No plan generation** without complete baselines

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

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Complete user baseline data (FTP, run paces, swim pace, strength 1RM values)

### Installation
```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

### Usage
1. **Complete baseline assessment** with real performance data
2. **Choose distance** (Sprint or 70.3)
3. **Select strength option** (None, Traditional, Compound, Cowboy)
4. **Set time commitment** (Minimum, Moderate, Serious, Hardcore)
5. **Choose long session day** (Saturday or Sunday)
6. **Review generated plan** with swipe navigation

## 📊 Current Test Results

### ✅ **Sprint Triathlon Plans**
- **All combinations tested** and working
- **Polarized training** properly implemented
- **Progressive overload** scientifically applied
- **Session balance** maintained across disciplines
- **Recovery spacing** optimized for performance

### ✅ **70.3 Half Ironman Plans**
- **Extended volume** properly scaled
- **Longer sessions** appropriately distributed
- **Brick sessions** strategically placed
- **Strength integration** maintained

## 🔧 Development

### Key Files
- `src/services/TrainingRulesEngine.ts` - Core JSON Rules Engine
- `src/services/SimpleTrainingService.ts` - Plan generation service
- `src/components/SimplePlanBuilder.tsx` - 4-step assessment UI
- `src/components/WorkoutCalendar.tsx` - Plan display component

### Testing
```bash
npm run test
npm run test:rules-engine
```

## 📈 Roadmap

### Phase 1: Core System ✅
- [x] JSON Rules Engine implementation
- [x] Sprint triathlon plans
- [x] 70.3 triathlon plans
- [x] 4-step assessment flow
- [x] Swipe navigation
- [x] Professional workout details

### Phase 2: Enhanced Features
- [ ] Olympic distance plans
- [ ] Ironman distance plans
- [ ] Advanced strength options
- [ ] Custom training philosophies
- [ ] Integration with Garmin/Strava

### Phase 3: Advanced Features
- [ ] AI-powered plan optimization
- [ ] Real-time performance tracking
- [ ] Adaptive training plans
- [ ] Social features

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure all baseline data requirements are met
4. Test thoroughly with real user data
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues or questions:
1. Check the baseline data requirements
2. Ensure all required fields are provided
3. Review error messages for missing data
4. Contact the development team

---

**Remember: This system requires complete user baseline data. No fallbacks, no estimates, no AI-generated values. Only real performance data ensures safe and effective training plans.**
