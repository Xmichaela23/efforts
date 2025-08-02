# KITCHEN AUDIT - HOLISTIC ISSUES

## 🎯 WHAT WE'RE TRYING TO ACHIEVE

**We're building a personalized training plan system where:**
- **Every user gets a unique plan** based on their specific data
- **No two users should get the same plan** - each plan is a unique "training world"
- **The AI applies evidence-based training science** to the user's unique combination of baseline data + assessment answers
- **No fallbacks, no assumptions** - only real user data drives the plan

**The AI should create different "multiverses" based on combinations like:**
- User A: 70.3 + pyramidal + 8 weeks + strength focus = **World A** (structured progression, strength-heavy)
- User B: 70.3 + polarized + 24 weeks + endurance focus = **World B** (80/20 intensity, endurance-heavy)
- User C: Olympic + threshold + 16 weeks + speed focus = **World C** (sustained effort, speed-focused)

## ✅ CURRENT STATUS - FIXED

### **1. Assessment System Standardized**
- **`AIPlanBuilder.tsx`** - Single step-based assessment system (active)
- **`AICoachAssessment.tsx`** - Removed (was conflicting legacy)
- **`PlanEngine.ts`** - Removed (was overriding AI decisions)

### **2. Data Flow Cleaned**
- **Standardized data structure** sent to AI
- **Assessment validation** enforced before plan generation
- **No more auto-generation** with empty responses

### **3. AI Science-Based Foundation**
- **Evidence-based training philosophies** (Bompa, Seiler, Coggan research)
- **Scientific intensity zones** (Coggan's Power Training Zones)
- **Peer-reviewed methodologies** for each training approach

## 🧠 HOW AI WORKS NOW

### **Two-Stage AI Process:**

#### **Stage 1: Analysis (`analyze-user-profile` Edge Function)**
- **Receives:** User baseline data + assessment responses
- **Applies:** Training science framework (Bompa, Seiler, Coggan)
- **Returns:** Structured analysis with training parameters
- **Science Base:** Peer-reviewed research on training methodologies

#### **Stage 2: Plan Generation (`generate-plan` Edge Function)**
- **Receives:** Analysis results + user context
- **Applies:** Evidence-based training science to create workouts
- **Returns:** 4-week personalized training plan
- **Science Base:** Specific implementation of training philosophies

### **Training Science Framework:**

#### **PYRAMIDAL Training (Bompa's Periodization)**
- **Weekly intensity progression:** easy → moderate → hard → moderate → easy
- **Intensity distribution:** 60% easy, 25% moderate, 15% hard
- **Application:** Uses user's specific paces/FTP for each zone
- **Best for:** Structured progression, recovery optimization

#### **POLARIZED Training (Seiler & Tønnessen 80/20 Model)**
- **Intensity distribution:** 80% Zone 1-2 (<2mmol/L lactate), 20% Zone 4-5 (>4mmol/L lactate)
- **No Zone 3 work:** Avoids "junk miles"
- **Application:** Uses user's specific paces/FTP for zone targets
- **Best for:** Endurance performance, time efficiency

#### **THRESHOLD Training (Coggan & Allen Methodology)**
- **Intensity distribution:** 40% Zone 3 (threshold), 40% Zone 2 (aerobic), 20% Zone 4-5 (high intensity)
- **Focus:** Sustained effort at lactate threshold
- **Application:** Uses user's specific paces/FTP for threshold work
- **Best for:** Sustained effort events (70.3+, marathon, time trials)

### **Intensity Zone Application (Coggan's Power Training Zones):**
- **Zone 1 (Recovery):** <55% FTP, <68% HRmax
- **Zone 2 (Aerobic):** 55-75% FTP, 68-83% HRmax
- **Zone 3 (Tempo):** 75-90% FTP, 83-94% HRmax
- **Zone 4 (Threshold):** 90-105% FTP, 94-105% HRmax
- **Zone 5 (VO2max):** 105-120% FTP, >105% HRmax

## 📊 CURRENT DATA FLOW (WORKING)

```
User completes assessment (steps 0-5)
↓
Validation ensures all required data present
↓
Stage 1: AI Analysis
- analyze-user-profile Edge Function
- Applies training science framework
- Returns structured analysis
↓
Stage 2: Plan Generation
- generate-plan Edge Function
- Applies evidence-based methodologies
- Creates personalized 4-week plan
↓
Plan displayed with specific workouts using user's baseline data
```

## 🎯 UI IMPROVEMENTS

### **Training Philosophy Selection:**
- **PYRAMIDAL:** "Anyone newer to endurance training who should maximize recovery"
- **POLARIZED:** "Anyone training for endurance events" (most common approach)
- **THRESHOLD:** "Anyone training for 70.3, half marathon, or longer events"
- **Language:** Inviting, non-hierarchical, inclusive

### **No Fallbacks Protocol:**
- **Validation enforced** before plan generation
- **Errors thrown** if required data missing
- **No generic plans** - only personalized plans based on real data

## 🚀 CURRENT STATUS

✅ **Assessment system standardized**
✅ **Data flow cleaned**
✅ **AI science-based foundation established**
✅ **UI language improved**
✅ **No fallbacks protocol implemented**
✅ **Evidence-based training methodologies applied**

**The system now creates truly personalized, science-based training plans using peer-reviewed research and actual user data.**

## 💡 KEY INSIGHT
**The kitchen has multiple recipes for the same dish, and they're conflicting. We need to standardize on one approach and clean up the legacy code.**

**The goal is to create a system where the AI receives real user data and creates truly personalized training worlds, not generic plans.**

---

**This note captures the holistic issues found in the kitchen audit. The new chat should focus on fixing the assessment flow and data standardization to enable personalized training world creation.** 