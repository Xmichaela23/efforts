import React, { useMemo, useState, useEffect } from 'react';
import { buildWeekFromDropdowns } from '@/services/plans/scheduler/buildWeekFromDropdowns';
import { composeGetStrongerFasterWeek } from '@/services/plans/composeGetStrongerFaster';
import type { SimpleSchedulerParams } from '@/services/plans/scheduler/types';
import type { Day, PlanConfig, StrengthTrack, SkeletonWeek } from '@/services/plans/types';
import { useAppContext } from '@/contexts/AppContext';
import { LABEL_RUN_VOLUME, HELP_RUN_VOLUME, RUN_VOLUME_OPTIONS } from './planBuilder/strings';

type Session = {
  day: string;
  discipline: 'run'|'bike'|'swim'|'strength'|'brick';
  type: string;
  duration: number;
  intensity: string;
  description: string;
};

const dayChips: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function GetStrongerFasterBuilder() {
  const { plansBundleReady, plansBundleError, addPlan } = useAppContext();
  const [cfg, setCfg] = useState<PlanConfig>({
    durationWeeks: 8,
    timeLevel: 'intermediate',
    weeklyHoursTarget: 8,
    availableDays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    longRunDay: 'Sun',
    runQualityDays: 2,
    strengthDaysPerWeek: 2,
    strengthDaysPreferred: ['Mon','Fri'],
    strengthTrack: 'hybrid',
    includeStrength: true,
    includeMobility: true,
    mobilityDaysPerWeek: 2,
    mobilityDaysPreferred: [],
  });
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [weeks, setWeeks] = useState<SkeletonWeek[]>([]);
  const [sessionsByWeek, setSessionsByWeek] = useState<Map<number, Session[]>>(new Map());
  const [notesByWeek, setNotesByWeek] = useState<Map<number, string[]>>(new Map());

  // Build skeleton weeks
  const skeletonWeeks = useMemo(() => {
    if (!plansBundleReady) return [];
    
    const weeksOut: SkeletonWeek[] = [];
    const level = cfg.timeLevel === 'beginner' ? 'new' : cfg.timeLevel === 'advanced' ? 'veryExperienced' : 'experienced';
    const preferredStrengthDays: Day[] = ['Mon','Fri','Wed'];

    for (let w = 1; w <= cfg.durationWeeks; w++) {
      const phase: SkeletonWeek['phase'] = w <= 2 ? 'base' : w <= 6 ? 'build' : w === 7 ? 'peak' : 'taper';
      const params: SimpleSchedulerParams = {
        availableDays: cfg.availableDays,
        longRunDay: cfg.longRunDay,
        level: level as any,
        strengthTrack: cfg.strengthTrack ?? 'hybrid',
        strengthDays: (cfg.strengthDaysPerWeek ?? 2) as 2 | 3,
        preferredStrengthDays,
        includeMobility: false,
        mobilityDays: 0,
        preferredMobilityDays: []
      };
      const { week, notes: weekNotes } = buildWeekFromDropdowns(w, phase, params);
      weeksOut.push(week);
      notesByWeek.set(w, weekNotes);
    }
    
    setWeeks(weeksOut);
    setNotesByWeek(new Map(notesByWeek));
    return weeksOut;
  }, [cfg, plansBundleReady]);

  // Compose sessions for each week
  useEffect(() => {
    if (!skeletonWeeks.length) return;
    
    const composeAllWeeks = async () => {
      const newSessions = new Map<number, Session[]>();
      
      for (let w = 1; w <= cfg.durationWeeks; w++) {
        try {
          const composed = await composeGetStrongerFasterWeek({
            weekNum: w,
            skeletonWeek: skeletonWeeks[w - 1],
            strengthTrack: cfg.strengthTrack ?? 'hybrid',
            strengthDays: (cfg.strengthDaysPerWeek ?? 2) as 2 | 3
          });
          
          const mapped: Session[] = composed.map(s => ({
            day: s.day,
            discipline: s.discipline,
            type: s.type,
            duration: s.duration,
            intensity: s.intensity,
            description: s.description,
          }));
          
          newSessions.set(w, mapped);
        } catch (error) {
          console.error('Error composing week:', w, error);
          newSessions.set(w, []);
        }
      }
      
      setSessionsByWeek(newSessions);
    };
    
    composeAllWeeks();
  }, [skeletonWeeks, cfg.strengthTrack, cfg.strengthDaysPerWeek]);

  const rec = useMemo(() => {
    if (cfg.timeLevel === 'beginner') return { total: '3–4', strength: '2' };
    if (cfg.timeLevel === 'advanced') return { total: '6–7', strength: '3' };
    return { total: '5–6', strength: '2–3' };
  }, [cfg.timeLevel]);

  // Auto-set quality days based on level (science-backed defaults)
  useEffect(() => {
    const wanted: 1 | 2 = cfg.timeLevel === 'beginner' ? 1 : 2;
    if (cfg.runQualityDays !== wanted) {
      setCfg(prev => ({ ...prev, runQualityDays: wanted }));
    }
  }, [cfg.timeLevel]);

  // Keep long run day valid within available days
  useEffect(() => {
    if (!cfg.availableDays.includes(cfg.longRunDay)) {
      // Find the first available weekend day, or default to 'Sun'
      const weekendDay = cfg.availableDays.find(d => d === 'Sat' || d === 'Sun') || 'Sun';
      setCfg(prev => ({ ...prev, longRunDay: weekendDay as 'Sat' | 'Sun' }));
    }
  }, [cfg.availableDays]);

  const onChipToggle = (d: Day) => {
    setCfg(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(d)
        ? prev.availableDays.filter(x => x !== d)
        : [...prev.availableDays, d].sort((a,b)=>dayChips.indexOf(a)-dayChips.indexOf(b))
    }));
  };

  // Preferred strength days removed; scheduler places deterministically

  const weekSessions = sessionsByWeek.get(currentWeek) || [];
  const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const sortedSessions = [...weekSessions].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  const totalMinutes = sortedSessions.reduce((t, s) => t + (s.duration || 0), 0);

  const handleAcceptPlan = async () => {
    if (!plansBundleReady) return;
    
    setIsSaving(true);
    try {
      // Create the plan data structure
      const planData = {
        name: `Get Stronger Faster - ${cfg.timeLevel} (8 weeks)`,
        description: `8-week plan to improve 5K-10K times with strength training. ${cfg.strengthTrack} strength focus, ${cfg.availableDays.length} days/week available.`,
        duration_weeks: cfg.durationWeeks,
        current_week: 1,
        status: 'active',
        plan_type: 'get_stronger_faster',
        config: cfg,
        weeks: weeks,
        sessions_by_week: Object.fromEntries(sessionsByWeek),
        notes_by_week: Object.fromEntries(notesByWeek)
      };

      await addPlan(planData);
      setShowSuccess(true);
      
      // The parent component (AppLayout) will handle navigation to All Plans
      // through the onPlanGenerated callback
      
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-3 space-y-6">
      {!plansBundleReady && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">
          {plansBundleError || 'Plan data bundle is not ready.'}
        </div>
      )}
      <h2 className="text-2xl font-semibold">Get Stronger Faster (8 weeks)</h2>
      <p className="text-sm text-gray-700">
        8 weeks to get faster and stronger. For runners who want sharper 5K–10K times and the durability strength brings.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">{LABEL_RUN_VOLUME}</div>
            <p className="text-xs text-gray-800 mb-2">{HELP_RUN_VOLUME}</p>
            <div className="flex gap-2">
              {RUN_VOLUME_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setCfg(prev=>({...prev, timeLevel: opt.value === 'new' ? 'beginner' : opt.value === 'veryExperienced' ? 'advanced' : 'intermediate' }))}
                  className={`px-3 py-1 border rounded ${(
                    (opt.value==='new' && cfg.timeLevel==='beginner') ||
                    (opt.value==='experienced' && cfg.timeLevel==='intermediate') ||
                    (opt.value==='veryExperienced' && cfg.timeLevel==='advanced')
                  )? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-800">Recommended: {rec.total} days/week (including {rec.strength} strength)</p>
          <p className="text-xs text-gray-800">Quality run days/week: {cfg.timeLevel === 'beginner' ? '1' : '2'}</p>

          <div>
            <div className="text-sm font-medium mb-1">Available days</div>
            <div className="flex flex-wrap gap-2">
              {dayChips.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChipToggle(d)}
                  className={`px-2 py-1 border rounded text-sm ${cfg.availableDays.includes(d)? 'bg-gray-100 border-gray-300':'border-gray-200'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="flex items-end gap-2 w-full">
              <div className="shrink-0">
                <div className="text-sm font-medium mb-1">Long run day</div>
                <select
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                  value={cfg.longRunDay}
                  onChange={(e)=> setCfg(prev=>({ ...prev, longRunDay: e.target.value as 'Sat' | 'Sun' }))}
                >
                  {cfg.availableDays.filter(d => d === 'Sat' || d === 'Sun').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="shrink-0">
                <div className="text-sm font-medium mb-1">Strength / wk</div>
                <div className="flex flex-nowrap items-end gap-2">
                  <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-16"
                    value={cfg.strengthDaysPerWeek}
                    onChange={(e)=> setCfg(prev=>({ ...prev, strengthDaysPerWeek: (parseInt(e.target.value,10) as 2|3) }))}
                  >
                    <option value={2}>2</option>
                    <option value={3} disabled={!(cfg.availableDays.length >= 6)}>3</option>
                  </select>
                </div>
              </div>
              <span
                className="text-xs text-gray-800 flex-1 whitespace-normal break-words"
                title={'Cowboy option: choose a 3rd upper body focus strength day for aesthetics and balance'}
              >
                Cowboy option: choose a 3rd upper body focus strength day for aesthetics and balance
              </span>
            </div>
          </div>

          {/* Quality run days are auto-determined by experience level */}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Strength focus</div>
            <div className="flex gap-2">
              {(['power','endurance','hybrid'] as StrengthTrack[]).map(t => (
                <button key={t} onClick={() => setCfg(prev=>({...prev, strengthTrack: t }))}
                  className={`px-3 py-1 border rounded ${cfg.strengthTrack===t? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{t}</button>
              ))}
            </div>
            {/* inline description – no frame */}
            {cfg.strengthTrack === 'power' && (
              <p className="mt-1 text-xs text-gray-800">Heavy, low-rep lifting to build raw strength and neural drive.</p>
            )}
            {cfg.strengthTrack === 'endurance' && (
              <p className="mt-1 text-xs text-gray-800">Higher-rep, lighter weights to support stamina and muscular durability.</p>
            )}
            {cfg.strengthTrack === 'hybrid' && (
              <p className="mt-1 text-xs text-gray-800">A mix of heavy and endurance work — balanced strength for all-around performance.</p>
            )}
          </div>
          {/* Preferred strength days removed; scheduler will place Mon/Fri/Wed with safe stacking */}

          {/* Standalone mobility removed for now; integrated mobility remains inside sessions */}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-700">Week {currentWeek} • {Math.round((totalMinutes/60)*10)/10}h • {weekSessions.length} sessions</div>
          <div className="flex gap-2">
            {Array.from({ length: cfg.durationWeeks }, (_, i) => i+1).map(w => (
              <button key={w} onClick={() => setCurrentWeek(w)} className={`w-6 h-6 text-xs border rounded ${currentWeek===w? 'border-gray-900':'border-gray-300'}`}>{w}</button>
            ))}
          </div>
        </div>

        {/* Week-level Notes */}
        {notesByWeek?.get(currentWeek)?.length ? (
          <div className="mb-3 text-xs text-gray-800">
            <div className="font-medium text-gray-800">Notes</div>
            <ul className="list-disc pl-5 space-y-1">
              {notesByWeek.get(currentWeek)!.map((n, i) => (<li key={i}>{n}</li>))}
            </ul>
          </div>
        ) : null}

        {/* Plan Overview */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm font-medium text-blue-900 mb-2">Plan Overview</div>
          <div className="text-xs text-blue-800 space-y-1">
            <div>• Week 1-2: Base building - establish routine and form</div>
            <div>• Week 3-6: Build phase - increase intensity and volume</div>
            <div>• Week 7: Peak week - highest training load</div>
            <div>• Week 8: Taper - reduce volume, maintain intensity</div>
          </div>
        </div>

        {/* Week Progression Details */}
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
          <div className="text-sm font-medium text-gray-900 mb-2">Week {currentWeek} Details</div>
          <div className="text-xs text-gray-700 space-y-2">
            {currentWeek <= 2 && (
              <div>• <strong>Base Phase:</strong> Focus on building endurance and establishing good form. Easy pace runs with 1-2 quality sessions per week.</div>
            )}
            {currentWeek >= 3 && currentWeek <= 6 && (
              <div>• <strong>Build Phase:</strong> Increasing intensity and volume. More challenging workouts while maintaining recovery.</div>
            )}
            {currentWeek === 7 && (
              <div>• <strong>Peak Week:</strong> Highest training load. Push your limits while staying healthy.</div>
            )}
            {currentWeek === 8 && (
              <div>• <strong>Taper Week:</strong> Reduce volume by 20-30%, maintain intensity. Focus on feeling fresh and ready.</div>
            )}
            <div>• <strong>Strength Focus:</strong> {cfg.strengthTrack === 'power' ? 'Heavy weights, low reps for neural drive' : cfg.strengthTrack === 'endurance' ? 'Moderate weights, higher reps for muscular endurance' : 'Balanced approach with both power and endurance elements'}</div>
          </div>
        </div>

        <div className="space-y-3">
          {(() => {
            const grouped: Record<string, Session[]> = {};
            sortedSessions.forEach(s => {
              grouped[s.day] = grouped[s.day] ? [...grouped[s.day], s] : [s];
            });
            const days = Object.keys(grouped).sort((a,b)=> dayOrder.indexOf(a) - dayOrder.indexOf(b));
            return days.map(day => {
              const list = grouped[day];
              const dayTotal = list.reduce((t, s) => t + (s.duration||0), 0);
              return (
                <div key={day} className="border border-gray-200 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">{day}</div>
                    <div className="text-xs text-gray-500">{dayTotal} min</div>
                  </div>
                  <div className="space-y-2">
                    {list.map((s, idx) => {
                      let detail: string;
                      if (s.discipline === 'strength') {
                        if (/(upper\/core|upper|core)/i.test(s.description)) {
                          detail = 'upper/core';
                        } else if (/(neural)/i.test(s.description)) {
                          detail = 'neural';
                        } else {
                          detail = 'strength';
                        }
                      } else {
                        detail = `${s.type} • ${s.intensity}`;
                      }
                      return (
                        <div key={idx} className="">
                          <div className="text-sm text-gray-700">{s.discipline} • {detail}</div>
                          <div className="text-sm text-gray-600">{s.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Accept Button */}
        <div className="border-t pt-6 mt-6">
          {showSuccess ? (
            <div className="text-center p-4 bg-green-50 border border-green-200 rounded">
              <div className="text-green-800 font-medium mb-2">Plan Created Successfully!</div>
              <div className="text-green-700 text-sm">Your plan has been saved and is now active.</div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleAcceptPlan}
                disabled={!plansBundleReady || isSaving}
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating Plan...' : 'Accept & Create Plan'}
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-3 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


