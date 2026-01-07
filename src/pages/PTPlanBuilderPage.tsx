import React, { useMemo, useState } from 'react';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';

type ParsedItem = {
  name: string;
  sets?: number;
  reps?: number;
  duration_seconds?: number;  // For duration-based exercises (planks, holds, etc.)
  perSide?: boolean;
  weight?: number;
  unit?: 'lb' | 'kg';
  weightRange?: string;  // Store full weight range text like "10-30 lb band"
  cues?: string;
};

/**
 * Deterministic parser for exercise lines
 * Uses clear, prioritized rules in order:
 * 1. Extract structured data (sets, reps, weight) using regex patterns
 * 2. Extract notes using explicit separators (pipe |, colon :, cue:, focus:)
 * 3. Extract name by removing structured data and notes
 * 
 * Preferred format (cleanest, most reliable):
 *   Exercise name — sets/reps/weight | notes
 * 
 * Examples:
 *   - Red superband kickbacks — 2×15 each side, 10-30 lb band | do left until it BURNS, match reps on right
 *   - Side plank with top leg elevated — 3×20 seconds each side, bodyweight | top leg on bench, bottom leg floating
 * 
 * All patterns are deterministic regex - no AI or ML involved
 */
function parseLine(line: string): ParsedItem | null {
  const raw = String(line || '').trim();
  if (!raw) return null;
  
  // Step 1: Clean input
  const cleaned = raw.replace(/^[-•\s]+/, '').trim();
  // Detect "per side" OR "each side" for bilateral exercises
  const out: ParsedItem = { name: cleaned, perSide: /(?:per\s*side|each\s+side)/i.test(cleaned) };
  
  // Step 2: Extract structured data (sets, reps, weight) - deterministic patterns
  // Multiple patterns handle different input variations - all deterministic regex
  // IMPORTANT: Check duration patterns FIRST to avoid treating "2-3×20 seconds" as reps
  
  // Pattern 2a: Duration-based "2-3 sets of 20 seconds" or "3x20s" or "2-3×20 seconds"
  // For duration-based exercises, store duration_seconds instead of reps
  const durationPattern = cleaned.match(/(\d+)(?:-\d+)?\s*(?:sets?\s*of|[x×])\s*(\d+)\s*(?:seconds?|sec|s)\b/i);
  if (durationPattern) {
    out.sets = parseInt(durationPattern[1], 10);
    out.duration_seconds = parseInt(durationPattern[2], 10);  // Store as duration, not reps
    // Don't set reps for duration-based exercises
  }
  
  // Pattern 2d: "2 sets until..." or "2 sets of until..." (sets only, no reps)
  // This pattern takes priority - if we have "sets until", don't try to extract reps
  // Check this BEFORE Pattern 2b/2c to prevent reps extraction
  if (!durationPattern && !out.sets) {
    const setsUntilPattern = cleaned.match(/(\d+)\s*sets?\s+until/i);
    if (setsUntilPattern) {
      out.sets = parseInt(setsUntilPattern[1], 10);
      // Don't set reps for "until" patterns - it's descriptive (e.g., "until glute burns")
      // This prevents Pattern 2b/2c from trying to extract reps
    }
  }
  
  // Pattern 2b: "3x8" or "3 x 8" or "3×8" (multiplication symbol) - only if not duration and not "until" pattern
  if (!durationPattern && !out.sets) {
    const setsRepsPattern1 = cleaned.match(/(\d+)(?:-\d+)?\s*[x×]\s*(\d+)/i);
    if (setsRepsPattern1) {
      out.sets = parseInt(setsRepsPattern1[1], 10);
      out.reps = parseInt(setsRepsPattern1[2], 10);
    }
    
    // Pattern 2c: "3 sets of 8" or "2-3 sets of 20" or "3 sets x 8"
    if (!setsRepsPattern1) {
      const setsRepsPattern2 = cleaned.match(/(\d+)(?:-\d+)?\s*sets?\s*(?:of|x)\s*(\d+)/i);
      if (setsRepsPattern2) {
        out.sets = parseInt(setsRepsPattern2[1], 10);
        out.reps = parseInt(setsRepsPattern2[2], 10);
      }
    }
  }
  
  // Pattern 2e: Weight - "20 lbs" or "(10-30 lbs)" or "25 lb" or "20kg" or "10-30 lb band"
  // Match weight even if preceded by comma (e.g., "..., 10-30 lb band")
  const weightPattern = cleaned.match(/(?:\(|^|\s|,)\s*(\d+)(?:-(\d+))?\s*(lb|lbs|kg)(?:\s+band)?\b/i);
  if (weightPattern) {
    out.weight = parseFloat(weightPattern[1]);
    out.unit = /kg/i.test(weightPattern[3]) ? 'kg' : 'lb';
    // If it's a weight range (has second number), store the full range text for notes
    if (weightPattern[2]) {
      // Check if "band" appears in the original match
      const fullMatch = weightPattern[0];
      const hasBand = /band/i.test(fullMatch);
      const fullRange = `${weightPattern[1]}-${weightPattern[2]} ${weightPattern[3]}${hasBand ? ' band' : ''}`;
      out.weightRange = fullRange;
    }
  }
  
  // Pattern 2f: Weight with @ symbol or dash "exercise @ 20 lbs" or "exercise — 20 lbs"
  if (!weightPattern) {
    const weightAtPattern = cleaned.match(/[@—–-]\s*(\d+)(?:-(\d+))?\s*(lb|lbs|kg)(?:\s+band)?\b/i);
    if (weightAtPattern) {
      out.weight = parseFloat(weightAtPattern[1]);
      out.unit = /kg/i.test(weightAtPattern[3]) ? 'kg' : 'lb';
    }
  }
  
  // Step 3: Extract notes using explicit separators (deterministic)
  let notesPart = '';
  let namePart = cleaned;
  
  // Rule 3a: Pipe separator "exercise — sets/reps/weight | notes" (highest priority - cleanest format)
  // Preferred format: Name — Sets/Reps/Weight | Notes
  const pipeIndex = cleaned.indexOf('|');
  if (pipeIndex > 0) {
    const beforePipe = cleaned.substring(0, pipeIndex).trim();
    const afterPipe = cleaned.substring(pipeIndex + 1).trim();
    if (afterPipe) {
      notesPart = afterPipe;
      // Extract name from before pipe - look for em dash separator
      const dashIndex = beforePipe.search(/[—–-]/);
      if (dashIndex > 0) {
        // Format: "Name — sets/reps/weight"
        namePart = beforePipe.substring(0, dashIndex).trim();
        // Also extract structured data from after the dash (before pipe) for proper parsing
        const afterDash = beforePipe.substring(dashIndex + 1).trim();
        // Re-run pattern matching on afterDash to ensure sets/weight are extracted
        // Pattern 2d: "2 sets until..." (sets only, no reps)
        if (!out.sets) {
          const setsUntilPattern = afterDash.match(/(\d+)\s*sets?\s+until/i);
          if (setsUntilPattern) {
            out.sets = parseInt(setsUntilPattern[1], 10);
          }
        }
        // Pattern 2e: Weight - check afterDash for weight patterns (handle commas)
        if (!out.weight) {
          const weightPatternAfterDash = afterDash.match(/(?:\(|^|\s|,)\s*(\d+)(?:-(\d+))?\s*(lb|lbs|kg)(?:\s+band)?\b/i);
          if (weightPatternAfterDash) {
            out.weight = parseFloat(weightPatternAfterDash[1]);
            out.unit = /kg/i.test(weightPatternAfterDash[3]) ? 'kg' : 'lb';
            // If it's a weight range (has second number), store the full range text for notes
            if (weightPatternAfterDash[2]) {
              const fullMatch = weightPatternAfterDash[0];
              const hasBand = /band/i.test(fullMatch);
              const fullRange = `${weightPatternAfterDash[1]}-${weightPatternAfterDash[2]} ${weightPatternAfterDash[3]}${hasBand ? ' band' : ''}`;
              out.weightRange = fullRange;
            }
          }
        }
      } else {
        // No dash - remove sets/reps/weight from namePart manually
        namePart = beforePipe;
        namePart = namePart.replace(/\b\d+\s*x\s*\d+\b/i, '').trim();
        namePart = namePart.replace(/\b\d+\s*sets?\s*(?:of\s*\d+|until\s+[^,|]+)/i, '').trim();
        namePart = namePart.replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)(?:\s+band)?\b/i, '').trim();
        namePart = namePart.replace(/\bbodyweight\b/i, '').trim();
        namePart = namePart.replace(/\beach\s+side\b/i, '').trim();
        namePart = namePart.replace(/\bper\s*side\b/i, '').trim();
        namePart = namePart.replace(/\bseconds?\b/i, '').trim();
      }
    }
  }
  
  // Rule 3b: Explicit "cue:" or "focus:" patterns
  if (!notesPart) {
    const explicitCuePattern = cleaned.match(/(?:cue|focus)\s*:\s*(.+)$/i);
    if (explicitCuePattern) {
      notesPart = explicitCuePattern[1].trim();
      namePart = cleaned.replace(/,?\s*(?:cue|focus)\s*:.*$/i, '').trim();
    }
  }
  
  // Rule 3c: Colon separator "exercise: notes" (but not numbered lists)
  if (!notesPart) {
    // Match colon but handle numbered lists specially
    // Look for colon that's not part of a numbered list
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex > 0) {
      const beforeColon = cleaned.substring(0, colonIndex).trim();
      const afterColon = cleaned.substring(colonIndex + 1).trim();
      
      // Check if it's a numbered list pattern like "1) item, 2) item"
      const isNumberedList = /^\d+\)/.test(afterColon);
      
      if (isNumberedList) {
        // It's a numbered list - extract name and all numbered items as notes
        namePart = beforeColon;
        notesPart = afterColon;
      } else if (afterColon) {
        // Regular colon-separated notes
        namePart = beforeColon;
        notesPart = afterColon;
        // Remove sets/reps from namePart if they're there
        namePart = namePart.replace(/\b\d+\s*(?:x\s*\d+|sets?\s*(?:of\s*\d+|until))/i, '').trim();
      }
    }
  }
  
  // Rule 3d: Em dash separator "exercise — sets/reps/weight" format (without pipe)
  if (!notesPart) {
    // Look for em dash (—) or en dash (–) or double dash (--) or spaced hyphen ( - )
    // IMPORTANT: Don't match single hyphens in words like "step-ups" or "single-leg"
    const dashMatch = cleaned.match(/[—–]|--|\s-\s/);
    if (dashMatch && dashMatch.index !== undefined) {
      const afterDash = cleaned.substring(dashMatch.index + dashMatch[0].length).trim();
      // Check if it looks like structured data (sets/reps/weight)
      const looksLikeStructured = afterDash.match(/^\d+\s*(?:x\s*\d+|sets?\s*(?:of\s*\d+|until))/i);
      if (!looksLikeStructured && afterDash.length > 10) {
        // Doesn't look like structured data and is substantial - might be notes
        namePart = cleaned.substring(0, dashMatch.index).trim();
        notesPart = afterDash;
      }
    }
  }
  
  // Rule 3e: Text after sets/reps pattern (like "until X, and match Y")
  if (!notesPart) {
    // Match "2 sets until X" pattern specifically
    const untilMatch = cleaned.match(/\d+\s*sets?\s+until\s+(.+)/i);
    if (untilMatch) {
      notesPart = untilMatch[1].trim();
      // Extract name part before "sets until"
      const beforeUntil = cleaned.substring(0, untilMatch.index).trim();
      namePart = beforeUntil;
    } else {
      // Match other sets/reps patterns like "3x8", "3 sets of 8"
      const setsRepsMatch = cleaned.match(/(\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+))/i);
      if (setsRepsMatch && setsRepsMatch.index !== undefined) {
        const matchEnd = setsRepsMatch.index + setsRepsMatch[0].length;
        const afterSets = cleaned.substring(matchEnd).trim();
        
        if (afterSets && !afterSets.match(/^\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+)/i)) {
          // Extract text after sets/reps as notes
          notesPart = afterSets;
        }
      }
    }
  }
  
  // Rule 3f: Descriptive text between commas (before sets/reps/weight)
  if (!notesPart) {
    const commaParts = cleaned.split(',');
    if (commaParts.length > 1) {
      // Find where structured data starts (sets/reps/weight)
      let structuredDataIndex = -1;
      for (let i = 0; i < commaParts.length; i++) {
        const part = commaParts[i].trim();
        if (part.match(/\d+\s*x\s*\d+|\d+\s*sets?\s*(?:of\s*\d+|until)|\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i)) {
          structuredDataIndex = i;
          break;
        }
      }
      
      if (structuredDataIndex > 1) {
        // Everything between first part and structured data is notes
        notesPart = commaParts.slice(1, structuredDataIndex).join(',').trim();
        namePart = commaParts[0].trim();
      } else if (structuredDataIndex === 0) {
        // Structured data is in first part, check if there's descriptive text after
        if (commaParts.length > 1) {
          // Check if remaining parts are descriptive (not structured)
          const remainingParts = commaParts.slice(1);
          const hasStructured = remainingParts.some(p => p.trim().match(/\d+\s*x\s*\d+|\d+\s*sets?\s*(?:of\s*\d+|until)|\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i));
          if (!hasStructured && remainingParts.length > 0) {
            // All remaining parts are descriptive text - extract as notes
            notesPart = remainingParts.join(',').trim();
          }
        }
      } else if (structuredDataIndex === -1) {
        // No structured data found in any comma part
        // Check if last part looks like structured data (weight only)
        const lastPart = commaParts[commaParts.length - 1].trim();
        const isWeightOnly = lastPart.match(/^\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i);
        
        if (!isWeightOnly) {
          // Check if first part contains structured data
          const firstPart = commaParts[0].trim();
          const firstHasStructured = firstPart.match(/\d+\s*x\s*\d+|\d+\s*sets?\s*(?:of\s*\d+|until)/i);
          
          if (!firstHasStructured && commaParts.length > 1) {
            // First part is name, rest is notes
            notesPart = commaParts.slice(1).join(',').trim();
            namePart = commaParts[0].trim();
          }
        } else {
          // Last part is weight, everything before last is name+notes
          // Extract name from first part, notes from middle parts
          if (commaParts.length > 2) {
            namePart = commaParts[0].trim();
            notesPart = commaParts.slice(1, -1).join(',').trim();
          }
        }
      }
    }
  }
  
  // Step 4: Clean name (remove all structured data and notes)
  let name = namePart
    .replace(/\([^)]*\)/g, '') // Remove parentheses (weight ranges, alternatives)
    .replace(/,?\s*(?:cue|focus)\s*:.*/i, '') // Remove explicit cues
    .replace(/\b\d+\s*x\s*\d+\b/i, '') // Remove sets x reps
    .replace(/\b\d+(?:-\d+)?\s*sets?\s+until\s+[^,|]+/i, '') // Remove "sets until [text]" (more aggressive)
    .replace(/\b\d+(?:-\d+)?\s*sets?\s*(?:of\s*\d+)/i, '') // Remove "sets of [number]"
    .replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)(?:\s+band)?\b/i, '') // Remove weight (including "band")
    .replace(/\buntil\s+[^,|]+/gi, '') // Remove any remaining "until [text]" patterns (case insensitive, global)
    .replace(/\bglute\s+burns?\b/gi, '') // Remove "glute burns" or "glute burn"
    .replace(/\bper\s*side\b/i, '') // Remove "per side"
    .replace(/\beach\s+side\b/i, '') // Remove "each side"
    .replace(/\bswitches?\b/i, '') // Remove "switches"
    .replace(/\bseconds?\b/i, '') // Remove "seconds" or "second"
    .replace(/\bsec\b/i, '') // Remove "sec"
    .replace(/\d+\)\s*/g, '') // Remove numbered list items like "1) "
    .replace(/--+/g, ' ') // Remove double dashes
    .replace(/[,;]/g, ' ') // Replace commas/semicolons with spaces
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim();
  
  // Step 4b: For prose-style input, extract just the exercise name (first meaningful phrase)
  // If name is too long (>60 chars), it's likely prose - truncate to first phrase
  if (name.length > 60) {
    const originalName = name;
    // Try to extract exercise name - look for common patterns
    // Pattern: first words before "using", "with", "on", "off", "for", "go", "hold", "focus", "ensure"
    const proseMatch = name.match(/^(.+?)\s+(?:using|with|on\s+(?:your|the|a)|off\s+(?:a|the)|for\s+\d|go\s+\d|hold\s+\d|focus\s+on|ensure\s+the|foot\s+stays|get\s+tall)/i);
    if (proseMatch && proseMatch[1].length >= 3) {
      name = proseMatch[1].trim();
      // Capture the rest as notes if we don't have notes yet
      if (!notesPart) {
        notesPart = originalName.substring(proseMatch[1].length).trim();
      }
    } else {
      // Fallback: take first 4-5 words or up to first major break
      const words = name.split(/\s+/);
      const maxWords = Math.min(5, words.length);
      name = words.slice(0, maxWords).join(' ');
      // Capture remaining words as notes
      if (!notesPart && words.length > maxWords) {
        notesPart = words.slice(maxWords).join(' ');
      }
    }
  }
  
  // Also remove any notes text that might have leaked into the name
  // This handles cases where notes weren't properly extracted
  if (notesPart) {
    // Remove notes text from name if it appears there
    // Split notes into phrases and remove each from name
    const notesPhrases = notesPart.split(',').map(p => p.trim()).filter(p => p.length > 5);
    notesPhrases.forEach(phrase => {
      // Create a regex that matches the phrase as a whole or individual significant words
      const significantWords = phrase.split(/\s+/).filter(w => w.length > 3);
      significantWords.forEach(word => {
        const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        name = name.replace(wordRegex, '').replace(/\s{2,}/g, ' ').trim();
      });
    });
  }
  
  // Step 5: Clean notes (remove any structured data that leaked in)
  if (notesPart) {
    notesPart = notesPart
      .replace(/\b\d+\s*x\s*\d+\b/i, '')
      .replace(/\b\d+(?:-\d+)?\s*sets?\s*(?:of\s*\d+|until)/i, '')
      .replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i, '')
      .replace(/\bper\s*side\b/i, '')
      .replace(/\beach\s+side\b/i, '')
      .replace(/--+/g, ' ')
      .replace(/\bseconds?\b/i, '') // Remove standalone "seconds" word
      .replace(/\bsec\b/i, '') // Remove standalone "sec"
      .replace(/\bs\b/i, '') // Remove standalone "s" (but be careful - might remove other words)
      .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
      .trim();
  }
  
  // Step 6: Finalize
  if (!name) name = raw;
  out.name = name.charAt(0).toUpperCase() + name.slice(1);
  
  // Combine notes with weight range if present
  let finalNotes = notesPart || '';
  if (out.weightRange && finalNotes) {
    finalNotes = `${out.weightRange}, ${finalNotes}`;
  } else if (out.weightRange) {
    finalNotes = out.weightRange;
  }
  
  if (finalNotes) {
    out.cues = finalNotes;
    console.log(`📝 Parser extracted notes for "${out.name}": "${finalNotes}"`);
  } else {
    console.log(`📝 Parser found no notes for "${out.name}"`);
  }
  
  return out;
}

function expandRecurrence(start: string, weeks: number, dayNames: string[]): string[] {
  // Anchor to Monday and schedule selected weekdays for N weeks (user local time)
  const s = new Date(start + 'T12:00:00'); // normalize to local midday to avoid DST/offset issues
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDaysLocalNoon = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0);
  const day = s.getDay(); // 0=Sun..6=Sat
  const monday = addDaysLocalNoon(s, (day === 0 ? -6 : (1 - day))); // start of week (Mon) at local noon
  const offsetByName: Record<string, number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  const offsets = Array.from(new Set(dayNames.map(n=>offsetByName[n]).filter(n=>typeof n==='number'))).sort((a,b)=>a-b);
  const out: string[] = [];
  for (let w = 0; w < Math.max(1, weeks); w++) {
    for (const off of offsets) {
      const d = addDaysLocalNoon(monday, w * 7 + off);
      // Compare by date-only semantics in local time
      if (toIso(d) >= toIso(s)) out.push(toIso(d));
    }
  }
  return out;
}

export default function MobilityPlanBuilderPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [planName, setPlanName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [weeks, setWeeks] = useState(4);
  const [text, setText] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon','Wed','Fri']);
  const { addPlannedWorkout } = usePlannedWorkouts() as any;
  const navigate = useNavigate();
  const { addPlan } = useAppContext();

  const items = useMemo(() => {
    return text.split(/\n+/).map(parseLine).filter(Boolean) as ParsedItem[];
  }, [text]);

  const addPlanAction = async () => {
    if (!text.trim() || items.length === 0) { alert('Please enter at least one exercise.'); return; }
    if (!selectedDays.length) { alert('Please select at least one day of the week.'); return; }
    const dates = expandRecurrence(startDate, Math.max(1, weeks), selectedDays);
    // Build sessions_by_week in the same shape as unified plans
    const weekdayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const weekdayFull = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const startPartsArr = startDate.split('-').map(x=>parseInt(x,10));
    const startObj2 = new Date(startPartsArr[0], (startPartsArr[1]||1)-1, (startPartsArr[2]||1), 12, 0, 0);
    const jsStart = startObj2.getDay();
    const startMonday = new Date(startObj2.getFullYear(), startObj2.getMonth(), startObj2.getDate() - (jsStart===0?6:(jsStart-1)));
    const fullDayName = (iso:string) => weekdayFull[new Date(iso+'T12:00:00').getDay()];
    const weekIndexFromStart = (iso:string) => {
      const d = new Date(iso+'T12:00:00');
      const diffDays = Math.floor((d.getTime() - startMonday.getTime())/86400000);
      return Math.floor(diffDays/7) + 1; // Week 1 anchored to start week
    };
    const sessionsByWeek: Record<string, any[]> = {};
    dates.forEach((iso)=>{
      const dayFull = fullDayName(iso);
      const w = weekIndexFromStart(iso);
      const normalized = items.map((it)=>({
        name: 'Mobility Session',
        type: 'mobility',
        description: 'Mobility session',
        mobility_exercises: items.map(ii=>{
          const exerciseData: any = {
            name: ii.name,
            description: ii.cues || '',
            // Preserve parsed load for downstream prefilling
            weight: typeof (ii as any).weight === 'number' ? (ii as any).weight : undefined,
            unit: (ii as any).unit || undefined,
            // Store per_side flag for logger expansion
            per_side: ii.perSide || false
          };
          // For duration-based exercises, store duration_seconds and sets
          if (ii.duration_seconds !== undefined) {
            exerciseData.duration_seconds = ii.duration_seconds;
            exerciseData.sets = ii.sets || 1;  // Store sets explicitly for duration-based exercises
            exerciseData.duration = `${ii.sets || 1}x${ii.duration_seconds} seconds${ii.perSide?' per side':''}`;
          } else if (ii.sets && ii.reps) {
            exerciseData.sets = ii.sets;  // Store sets for rep-based exercises too
            exerciseData.duration = `${ii.sets}x${ii.reps}${ii.perSide?' per side':''}`;
          } else if (ii.sets && !ii.reps) {
            // Sets without reps (e.g., "2 sets until glute burns") - store sets but no reps
            exerciseData.sets = ii.sets;
            exerciseData.duration = `${ii.sets} sets${ii.perSide?' per side':''}`;
          } else if (ii.reps) {
            exerciseData.duration = `${ii.reps} reps`;
          } else {
            exerciseData.duration = '2-3 minutes';
          }
          console.log(`📝 Plan builder storing exercise:`, exerciseData, `(cues="${ii.cues}", duration_seconds=${ii.duration_seconds})`);
          return exerciseData;
        })
      }));
      const arr = sessionsByWeek[String(w)] || [];
      arr.push({ day: dayFull, type: 'mobility', name: 'Mobility Session', description: 'Mobility session', mobility_exercises: normalized[0]?.mobility_exercises || [] });
      sessionsByWeek[String(w)] = arr;
    });

    const payload = {
      name: planName || 'Mobility Plan',
      duration_weeks: Math.max(1, weeks),
      start_date: startDate,
      sessions_by_week: sessionsByWeek,
      status: 'active',
      config: { user_selected_start_date: startDate, source: 'mobility_builder', source_dsl: text }
    } as any;
    await addPlan(payload);
    alert(`Mobility plan created with ${dates.length} sessions`);
    navigate('/');
  };

  const saveTemplate = async () => {
    alert('Saving to templates will be added in the Plans section. For now, use Add plan to place sessions on your calendar.');
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Build Mobility Plan</div>
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={()=>navigate('/')}>Dashboard</button>
      </div>
      <div className="space-y-2">
        <label className="text-sm">Plan Name</label>
        <input className="border rounded px-2 py-2 w-full bg-white text-gray-900" value={planName} onChange={(e)=>setPlanName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <label className="text-sm">Start Date</label>
          <input type="date" className="border rounded px-2 py-2 w-full bg-white text-gray-900" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Weeks</label>
          <input type="number" min={1} max={12} className="border rounded px-2 py-2 w-full bg-white text-gray-900" value={weeks} onChange={(e)=>setWeeks(parseInt(e.target.value||'1',10))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Days of Week</label>
          <div className="flex flex-wrap gap-2">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <button
                key={d}
                type="button"
                onClick={()=> setSelectedDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d])}
                className={`px-2 py-1 rounded border text-sm ${selectedDays.includes(d) ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'}`}
              >{d}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm">Exercises (one per line)</label>
        <div className="text-xs text-gray-500 mb-1">
          Preferred format: <span className="font-mono">Exercise name — sets/reps/weight | notes</span>
        </div>
        <textarea rows={8} className="border rounded px-2 py-2 w-full font-mono text-sm bg-white text-gray-900 placeholder:text-gray-400" value={text} onChange={(e)=>setText(e.target.value)} placeholder={"Example:\nRed superband kickbacks — 2×15 each side, 10-30 lb band | do left until it BURNS, match reps on right\nRed superband half step-outs — 2×15 each side, 10-30 lb band | band perpendicular to chest, arms fully extended\nSide plank with top leg elevated — 3×20 seconds each side, bodyweight | top leg on bench, bottom leg floating\nBird dog rows — 2×8 per side, 20 lb | focus on kicking back leg straight back\nSingle leg RDL rows — 2×12 per side, 25 lb | weight on same side as kicked-back leg"} />
      </div>
      <div className="space-y-2">
        <label className="text-sm">Preview</label>
        <div className="border rounded p-3 text-sm space-y-2 bg-white text-gray-900">
          <div className="font-medium">{planName}</div>
          {items.map((it, i)=> (
            <div key={i}>
              {i+1}. {it.name} — {it.sets?`${it.sets}x${it.reps}`:''}{it.perSide?' per side':''}{it.weight?`, ${it.weight} ${it.unit||'lb'}`:''}{it.cues?` | ${it.cues}`:''}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-4 items-center">
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={()=>history.back()}>Cancel</button>
        <button className="text-sm text-blue-600 hover:text-blue-700" onClick={addPlanAction}>Add plan</button>
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={saveTemplate}>Save to Templates</button>
      </div>
    </div>
  );
}


