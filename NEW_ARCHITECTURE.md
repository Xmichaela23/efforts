# New Ground-Up Architecture: Algorithm-Based Training Plan System

## Overview

This document outlines the new ground-up approach to replace the AI generation system with an algorithm-based template system that eliminates fallbacks and provides personalized, science-based training plans.

## Core Philosophy

### **"Fail Correctly" Instead of "Never Fail"**
- **No fallbacks** - system fails if data is missing
- **Expose problems** instead of hiding them
- **Mathematical precision** instead of AI generation
- **Scientific validation** instead of generic content

### **Algorithm-Based Instead of AI-Generated**
- **Pre-defined templates** with scientific foundation
- **Mathematical interpretation** of user data
- **Structured validation** of all inputs
- **Predictable, consistent output**

## User Journey (5 Simple Choices)

### **1. What are you training for?**
- Sprint Distance
- Olympic Distance  
- 70.3 Distance
- Ironman Distance

### **2. Do you want strength training?**
- Yes/No

### **3. If Yes, choose strength focus:**
- Power Development (2x/week, +1-1.5 hours, triathlon performance)
- Stability Focus (2x/week, +1-1.2 hours, injury prevention)
- Compound Strength (2x/week, +1.5-2 hours, experimental approach)
- Cowboy Endurance (3x/week, +2-2.5 hours, performance + aesthetics)
- Cowboy Compound (3x/week, +2.5-3 hours, experimental + aesthetics)
- No Strength (0 hours, pure endurance)

### **4. How many training days?**
- Minimum required for their event (based on science)
- System enforces minimum: "Olympic needs 5+ days"

### **5. How many hours per week?**
- System shows personalized recommendations based on their fitness:
  - MINIMUM (6 hours/week): Event completion, basic fitness
  - RECOMMENDED (8-10 hours/week): Performance improvement
  - OPTIMAL (12-15 hours/week): Competitive performance

## Strength Training Options

### **1. Power Development** (2x/week, +1-1.5 hours)
- **Focus:** Explosive movements for bike power and run economy
- **Exercises:** Plyometrics, medicine ball throws, explosive movements
- **Time:** 2x/week, 30-45 min sessions
- **Evidence:** Good research support for triathlon performance
- **Recovery:** 24-48 hours between sessions
- **Phasing:** Taper 2-3 weeks before race, reduce to 1x/week

### **2. Stability Focus** (2x/week, +1-1.2 hours)
- **Focus:** Stability, mobility, single-leg work
- **Exercises:** Single-leg squats, planks, hip mobility, core work
- **Time:** 2x/week, 20-35 min sessions
- **Evidence:** Good research support for injury prevention
- **Recovery:** 24-48 hours between sessions
- **Phasing:** Taper 1-2 weeks before race, reduce to 1x/week

### **3. Compound Strength** (2x/week, +1.5-2 hours)
- **Focus:** Heavy compound lifts + plyometrics
- **Day 1:** Lower body compounds + plyo
- **Day 2:** Upper body compounds + core
- **Evidence:** Limited research for triathletes, may work for you
- **Note:** Popular approach among triathlon coaches
- **Recovery:** 48-72 hours between sessions (more demanding)
- **Phasing:** Taper 3-4 weeks before race, reduce to 1x/week

### **4. Cowboy Endurance** (3x/week, +2-2.5 hours)
- **Days 1-2:** Endurance strength (Power Development or Stability Focus)
- **Day 3:** Upper body focus, minimal endurance effects, mainly for aesthetics and balanced strength
- **Time:** 2x/week endurance strength + 1x/week upper body
- **Evidence:** Mixed approach with some research support
- **Recovery:** 24-48 hours between sessions
- **Phasing:** Taper 2-3 weeks before race, reduce to 1x/week

### **5. Cowboy Compound** (3x/week, +2.5-3 hours)
- **Days 1-2:** Compound strength (heavy compounds + plyo)
- **Day 3:** Upper body focus, minimal endurance effects, mainly for aesthetics and balanced strength
- **Time:** 2x/week compound strength + 1x/week upper body
- **Evidence:** Experimental approach, not well-studied for triathlon
- **Recovery:** 48-72 hours between sessions (most demanding)
- **Phasing:** Taper 3-4 weeks before race, reduce to 1x/week

### **6. No Strength** (0 hours, pure endurance)
- **Focus:** Pure endurance training only
- **Time:** 0 hours strength training
- **Evidence:** Many successful triathletes train this way

## Distance-Specific Impact & Recommendations

### **Sprint Distance:**
- **Minimum:** 4-6 hours/week
- **All strength options:** Manageable
- **Recommendation:** Choose based on goals and time availability

### **Olympic Distance:**
- **Minimum:** 6-8 hours/week
- **All strength options:** Manageable
- **Cowboy options:** Require higher time commitment but are doable
- **Recommendation:** Choose based on goals and time availability

### **70.3 Distance:**
- **Minimum:** 8-12 hours/week
- **Traditional options:** Recommended (Power Development, Stability Focus)
- **Compound Strength:** Experimental approach, high time commitment
- **Cowboy options:** Very high time commitment, may interfere with endurance training
- **Recommendation:** Consider traditional or injury prevention focus for optimal 70.3 preparation

### **Ironman Distance:**
- **Minimum:** 12-18 hours/week
- **Traditional options:** Strongly recommended (Power Development, Stability Focus)
- **Compound Strength:** Experimental approach, very high time commitment
- **Cowboy options:** Extremely high time commitment, not recommended
- **Recommendation:** Focus on traditional or injury prevention for optimal Ironman preparation

## Discipline Focus Options

### **Standard (Recommended):**
- 2-3 sessions per discipline
- Balanced approach for most athletes

### **Swim Focus:**
- 3 swims, 2 bikes, 2 runs
- For athletes who need swim improvement

### **Bike Focus:**
- 2 swims, 3 bikes, 2 runs
- For athletes who need bike improvement

### **Run Focus:**
- 2 swims, 2 bikes, 3 runs
- For athletes who need run improvement

### **Messaging:**
```
"Discipline Focus:
You may be inclined to add a discipline you enjoy, and while we totally support your training being fulfilling, you may want to consider focusing on an area you feel needs more development.

Standard (recommended): 2-3 sessions per discipline
Swim Focus: 3 swims, 2 bikes, 2 runs
Bike Focus: 2 swims, 3 bikes, 2 runs  
Run Focus: 2 swims, 2 bikes, 3 runs

Note: Individual response may vary. Standard distribution is recommended for most athletes."
```

## Template Structure

### **Standard Triathlon Week:**
```
Monday: Swim
Tuesday: Bike (drills/intervals)
Wednesday: Run (zone 2)
Thursday: Swim
Friday: Bike (drills/intervals)
Saturday: Long run
Sunday: Long ride or brick
```

### **With Strength Integrated:**
```
Monday: Swim + Strength
Tuesday: Bike (drills/intervals) + Strength
Wednesday: Run (zone 2)
Thursday: Swim + Strength
Friday: Bike (drills/intervals)
Saturday: Long run + Strength
Sunday: Long ride or brick
```

### **Recovery Guidelines:**
- **3-4 hours** between strength and endurance sessions
- **24-48 hours** between strength sessions (traditional)
- **48-72 hours** between strength sessions (compound)
- **Progressive overload** in strength training
- **Taper strength** in peak phase

## Algorithm Implementation

### **Mathematical Interpretation:**
```
User Data: FTP = 220W, 5K = 24:00, swim = 2:10/100m
Algorithm Calculation:
- Zone 2 bike = 220W × 0.60-0.75 = 132-165W
- Zone 5 bike = 220W × 1.05-1.20 = 231-264W
- Zone 2 run = 5K pace + 45-90 seconds = 8:30-9:15/mile
- Zone 5 run = 5K pace - 15-30 seconds = 7:30-7:45/mile
- Zone 2 swim = 2:10/100m + 15-30 seconds = 2:25-2:40/100m
- Zone 5 swim = 2:10/100m - 5-15 seconds = 1:55-2:05/100m
```

### **Template Selection Logic:**
```javascript
function selectTemplate(event, strengthOption, frequency, days, hours) {
  // Pre-defined polarized templates
  const templates = {
    sprint: { /* template data */ },
    olympic: { /* template data */ },
    seventy3: { /* template data */ },
    ironman: { /* template data */ }
  };
  
  // Select base template
  let template = templates[event];
  
  // Add strength sessions
  if (strengthOption !== 'none') {
    template = addStrengthSessions(template, strengthOption, frequency);
  }
  
  // Scale to user's hours
  template = scaleTemplate(template, hours);
  
  return template;
}
```

## Science Foundation

### **Training Science (Kitchen Architecture):**
- **Polarized Training:** 80/20 intensity distribution (Seiler & Tønnessen)
- **Intensity Zones:** Coggan's Power Training Zones
- **Periodization:** Bompa's periodization theory
- **Recovery Science:** Fry's Supercompensation Theory

### **Strength Training Research:**
- **Power Development:** Rønnestad & Mujika (2014), Beattie et al. (2014)
- **Injury Prevention:** Lauersen et al. (2014), van der Worp et al. (2016)
- **Compound Training:** Limited triathlon-specific research
- **Concurrent Training:** Wilson et al. (2012) - separate sessions with recovery

### **Mobility & Warm-ups:**
- **Dynamic Stretching:** Behm & Chaouachi (2011) - improves performance
- **Warm-up Protocols:** Fradkin et al. (2010) - improves performance and reduces injury
- **Sport-Specific:** McGowan et al. (2015) - sport-specific warm-ups most effective

## Implementation Plan

### **Phase 1: Replace AI Generation with Algorithm**
- **Keep kitchen science:** Polarized training, intensity zones, evidence-based approaches
- **Replace AI generation:** Use algorithm templates instead
- **Keep validation:** No fallbacks protocol
- **Keep structure:** Two-stage process (analysis → plan generation)

### **Phase 2: Add Strength Training Options**
- **Integrate 6 strength options:** Into existing plan generation
- **Add distance-specific impact:** To user interface
- **Add recovery guidelines:** To plan structure
- **Add phasing:** Taper and race preparation

### **Phase 3: Add Discipline Focus Options**
- **Add discipline distribution:** Standard, Swim Focus, Bike Focus, Run Focus
- **Add personalized messaging:** Supportive but educational
- **Add science backing:** Weakness focus vs. enjoyment

### **Phase 4: Enhance with Mobility**
- **Add warm-up protocols:** To existing sessions
- **Add mobility work:** To strength sessions
- **Add sport-specific prep:** To endurance sessions

## Benefits

### ✅ **No Fallbacks**
- **Mathematical calculations only**
- **No AI generation possible**
- **Predictable, consistent output**
- **System fails if data missing**

### ✅ **Science-Based**
- **Evidence-based training methodologies**
- **Peer-reviewed research frameworks**
- **Proper recovery guidelines**
- **Distance-specific recommendations**

### ✅ **Personalized**
- **User's exact performance numbers**
- **Distance-specific impact calculations**
- **Individual strength preferences**
- **Discipline focus options**

### ✅ **User-Friendly**
- **5 simple choices**
- **Clear time commitments**
- **Honest about benefits and trade-offs**
- **Supportive but educational messaging**

## Success Metrics

### **Technical Performance:**
- **Zero fallbacks** in plan generation
- **Mathematical precision** in all calculations
- **Predictable output** for same inputs
- **Fast response times** (no API calls)

### **User Experience:**
- **Clear decision points** with personalized impact
- **Honest communication** about benefits and trade-offs
- **Supportive messaging** that respects user choices
- **Educational content** that improves user knowledge

### **Scientific Rigor:**
- **Evidence-based** training methodologies
- **Peer-reviewed** research foundation
- **Proper validation** of all inputs
- **Distance-appropriate** recommendations

## Conclusion

This new ground-up architecture replaces AI generation with algorithm-based templates, eliminates fallbacks, and provides personalized, science-based training plans. The system respects user choices while providing educational guidance and maintaining scientific rigor throughout. 