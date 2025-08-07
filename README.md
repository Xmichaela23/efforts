# Efforts - Fitness Training App

A comprehensive fitness training application built with React, TypeScript, and Supabase, featuring **clean, modular training plan generation** and integration with fitness platforms like Garmin and Strava.

## 🎯 CURRENT FOCUS: Clean 3-File Architecture

**We've successfully built a clean, modular training system with scientifically sound 70.3 triathlon plans.**

### **📚 Essential Documentation:**
- **[App Bible](APP_BIBLE.md)** - Complete design rules, development philosophy, and system architecture
- **[App Overview](QUICK_START_FOR_NEW_CHAT.md)** - Complete system overview, architecture, and current status
- **[70.3 Implementation Plan](70.3_JSON_ENGINE_PLAN.md)** - Simple, science-based 70.3 triathlon rules

### **🚨 CRITICAL RULE: NO FALLBACKS**
The training system **WILL NOT WORK** without complete user baseline data (FTP, run paces, swim pace, strength 1RM values). This is by design to ensure scientific accuracy.

## 🏆 What's Working

- **Clean 3-File Architecture**: `Seventy3Template.ts`, `StrengthTemplate.ts`, `TrainingEngine.ts`
- **Scientifically sound templates** with detailed coach-quality workouts
- **Modular strength integration** (5 options: traditional, compound, cowboy variants)
- **Equipment-aware workouts** (pool/open water, power meter/HR, barbell/dumbbells)
- **Phase-based progression** (Base → Build → Peak → Taper)
- **Strength/endurance balance** (reduces strength during peak endurance weeks)
- **Clean, minimal UI** with swipe navigation

## 🧠 Clean Architecture

### **File 1: `Seventy3Template.ts` (280 lines)**
- **70.3-specific template** with detailed workouts
- **Equipment-aware** swim/bike/run sessions
- **Phase-based** progression
- **Coach-quality** detailed sessions

### **File 2: `StrengthTemplate.ts` (200 lines)**
- **All 5 strength options** (traditional, compound, cowboy variants)
- **Evidence-based** percentages (75% 1RM, etc.)
- **Equipment-aware** substitutions
- **Phase-aware** intensity adjustments

### **File 3: `TrainingEngine.ts` (250 lines)**
- **The brain** that personalizes everything
- **Volume scaling** based on fitness and phase
- **Strength/endurance balance** (reduces strength during peak)
- **NO FALLBACKS** validation
- **Progressive overload** across 12 weeks

## 🚀 Quick Start

```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

**For complete setup and architecture details, see [App Overview](QUICK_START_FOR_NEW_CHAT.md).**

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

## 🚀 Deployment

### Vercel Deployment
- Automatic deployment from main branch
- Environment variables configured in Vercel dashboard
- Supabase integration for database and edge functions

## 📝 License

MIT License - see LICENSE file for details. 