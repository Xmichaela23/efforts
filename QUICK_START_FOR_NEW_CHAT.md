# Efforts - Complete System Overview

## 🎯 CURRENT STATUS: Clean 3-File Architecture

**We've successfully built a clean, modular training system with scientifically sound 70.3 triathlon plans.**

### **📚 Essential Documentation:**
- **[App Bible](APP_BIBLE.md)** - Complete design rules, development philosophy, and system architecture
- **[App Overview](QUICK_START_FOR_NEW_CHAT.md)** - Complete system overview, architecture, and current status

### **🚨 CRITICAL RULE: NO FALLBACKS - REAL USER BASELINE DATA ONLY**

#### **⚠️ ABSOLUTE REQUIREMENT: User Baseline Data Must Be Complete**
The training system **WILL NOT WORK** without complete user baseline data. This is by design to ensure scientific accuracy.

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
We built a **clean, modular training system** that adapts to user preferences before generating plans. This approach ensures:
- **Reliability** - Consistent, science-based plan generation
- **Scalability** - Easy to add new distances and preferences
- **User Safety** - Only real baseline data ensures safe training
- **Scientific Accuracy** - Every calculation based on actual performance

## 🏆 What's Working

### ✅ **Core System: Clean 3-File Architecture**
- **`Seventy3Template.ts`** (280 lines) - 70.3-specific template with detailed workouts
- **`StrengthTemplate.ts`** (200 lines) - All 5 strength options with evidence-based percentages
- **`TrainingEngine.ts`** (250 lines) - The brain that personalizes everything
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
- **Clean 3-file architecture** for scalable logic
- **Tailwind CSS** for responsive design
- **Vercel** for deployment

## 🧠 Current Architecture

### **Clean 3-File System**
**Core Files**: 
- **`src/services/Seventy3Template.ts`** - 70.3-specific template with detailed workouts
- **`src/services/StrengthTemplate.ts`** - All 5 strength options with evidence-based percentages
- **`src/services/TrainingEngine.ts`** - The brain that personalizes everything

**UI Integration**: `src/components/SimplePlanBuilder.tsx`
- **4-Step Assessment**: Distance → Strength → Time → Long Session Day
- **Swipe Interface**: Clean dot indicators and smooth week navigation
- **User Baselines**: Loaded from user profile (no manual input)

## 🧪 Scientific Foundation

### **Training Principles**
- **Polarized Training**: 80/20 easy/hard ratio enforcement
- **Progressive Overload**: Systematic volume and intensity increases
- **Recovery Spacing**: Proper session distribution prevents overtraining
- **Evidence-Based Percentages**: 75% 1RM for compound strength

### **Clean Architecture Benefits**
- **Scalable**: Easy to add new distances, philosophies, strength options
- **Science-based**: All templates grounded in training research
- **Deterministic**: Consistent plans without random variations
- **Personalized**: All sessions based on user's actual data
- **Maintainable**: Clear file structure for easy updates
- **No fallbacks**: Only real user baseline data used

## 🚀 Quick Start

```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

## 🎯 Current Development

**Focus: Clean, Modular Architecture**
- **3 focused files** instead of 3000+ line monoliths
- **Scientifically sound templates** with detailed workouts
- **Equipment-aware** personalization
- **Phase-based** progression
- **No fallbacks** (fail fast when data missing)

## 🏗️ Technical Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** + **shadcn/ui** for styling
- **Supabase** for backend (database + edge functions)

### Backend
- **Supabase** (PostgreSQL database)
- **Supabase Edge Functions** (AI analysis, plan generation)
- **Row Level Security (RLS)** for data protection

### Integrations
- **Garmin Connect API** - Activity data, webhooks, real-time sync
- **Strava API** - Additional fitness data sources

## 📊 Data Flow Architecture

```
User Flow:
1. Training Baselines (Fitness Assessment) → user_baselines table
2. Plan Builder (Goal Assessment) → TrainingEngine → plan generation
3. TrainingEngine → Creates unique training plans
4. Workout Execution → Logging & tracking
```

## 🎯 User Interface Flow

### Main App Interface
**Entry Point**: Calendar view showing today's date
**Primary Navigation**: Swipe gestures for date selection

### Plan Building Flow
- **4-step assessment**: Distance → Strength → Time → Long Session Day
- **Swipe interface**: Clean dot indicators and smooth week navigation
- **User baselines**: Loaded from user profile (no manual input)
- **Professional workout details**: Warm-ups, main sets, cool-downs, specific targets

## 🚀 Deployment

### Vercel Deployment
- Automatic deployment from main branch
- Environment variables configured in Vercel dashboard
- Supabase integration for database and edge functions

## 📝 License

MIT License - see LICENSE file for details. 