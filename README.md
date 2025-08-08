# Efforts - 80/20 Triathlon Training App

A comprehensive triathlon training application built with React, TypeScript, and Supabase, implementing **Matt Fitzgerald & David Warden's 80/20 Triathlon methodology** with clean, modular training plan generation.

## 🎯 CURRENT FOCUS: 80/20 Triathlon DNA

**We've successfully implemented the proven 80/20 Triathlon methodology as our TrainingEngine DNA, with 50,000+ successful athletes backing this approach.**

### **📚 Essential Documentation:**
- **[80/20 Methodology](src/services/80-20-methodology.md)** - Our single source of truth and TrainingEngine DNA
- **[App Bible](APP_BIBLE.md)** - Complete design rules, development philosophy, and system architecture
- **[App Overview](QUICK_START_FOR_NEW_CHAT.md)** - Complete system overview, architecture, and current status
- **[70.3 Implementation Plan](70-3-research-comparison.md)** - Simple, science-based 70.3 triathlon rules

### **🚨 CRITICAL RULE: NO FALLBACKS**
The training system **WILL NOT WORK** without complete user baseline data (FTP, run paces, swim pace, strength 1RM values). This is by design to ensure scientific accuracy.

## 🏆 What's Working

- **80/20 Triathlon Methodology**: Proven system with 50,000+ successful athletes
- **Clean 3-File Architecture**: `Seventy3Template.ts`, `StrengthTemplate.ts`, `TrainingEngine.ts`
- **Polarized Training**: 80% low intensity, 20% moderate to high intensity
- **5-Phase Strength System**: David Warden's periodized strength integration
- **Equipment-aware workouts** (pool/open water, power meter/HR, barbell/dumbbells)
- **Phase-based progression** (Base → Build → Peak → Taper)
- **Scientific session distribution** (48-hour strength spacing, hard/easy approach)
- **Clean, minimal UI** with swipe navigation

## 🧠 Clean Architecture

### **File 1: `Seventy3Template.ts` (680+ lines)**
- **80/20 Triathlon 70.3 template** with phase-specific workouts
- **Equipment-aware** swim/bike/run sessions
- **Phase-based** progression
- **Coach-quality** detailed sessions

### **File 2: `StrengthTemplate.ts` (200 lines)**
- **2 strength options**: Traditional (2x/week) and Cowboy (3x/week)
- **Scientific distribution**: Based on training science principles (48-72h spacing, recovery windows)
- **Evidence-based** percentages (75% 1RM, etc.)
- **Equipment-aware** substitutions
- **Phase-aware** intensity adjustments

### **File 3: `TrainingEngine.ts` (250 lines)**
- **The brain** that personalizes everything
- **Volume scaling** based on fitness and phase
- **Strength/endurance balance** (reduces strength during peak)
- **NO FALLBACKS** validation
- **Progressive overload** across 12 weeks

## 🎯 Strength Training Options

### **Traditional (2x/week)**
- **Lower body focus** (Squat, Deadlift, Single-leg)
- **Upper body focus** (Bench Press, Rows, Overhead Press)
- **6-day training week**
- **+1.8h/week** time commitment

### **Cowboy (3x/week)**
- **2 functional sessions** (Farmer's Walks, Carries, Pull-ups)
- **1 upper body session** (Bench Press, Overhead Press, Rows, Curls)
- **7-day training week**
- **+2.2h/week** time commitment
- **Includes 3rd day for balance and aesthetics**

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
- **Scientific session distribution** (no hardcoded days)
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