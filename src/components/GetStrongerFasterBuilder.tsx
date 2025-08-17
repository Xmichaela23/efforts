import React, { useMemo, useState, useEffect } from 'react';
import { composeWeek } from '@/services/plans/compose';
import { buildWeekFromDropdowns } from '@/services/plans/scheduler/buildWeekFromDropdowns';
import type { SimpleSchedulerParams } from '@/services/plans/scheduler/types';
import type { Day, PlanConfig, StrengthTrack, SkeletonWeek } from '@/services/plans/types';

type Session = {
  day: string;
  discipline: 'run'|'ride'|'swim'|'strength';
  type: string;
  duration: number;
  intensity: string;
  description: string;
};

const dayChips: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function GetStrongerFasterBuilder() {
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

  const { weeks, sessionsByWeek, notesByWeek } = useMemo(() => {
    const sessions = new Map<number, Session[]>();
    const notes = new Map<number, string[]>();
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
      const composed = composeWeek({ weekNum: w, skeletonWeek: week, baselines: undefined }) as any[];
      const mapped: Session[] = composed.map(s => ({
        day: s.day,
        discipline: s.discipline,
        type: s.type,
        duration: s.duration,
        intensity: s.intensity,
        description: s.description,
      }));
      sessions.set(w, mapped);
      notes.set(w, weekNotes);
    }
    return { weeks: weeksOut, sessionsByWeek: sessions, notesByWeek: notes };
  }, [cfg]);

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
      const next = cfg.availableDays[0] ?? 'Sun';
      setCfg(prev => ({ ...prev, longRunDay: next as Day }));
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

  return (
    <div className="max-w-3xl mx-auto p-3 space-y-6">
      <h2 className="text-2xl font-semibold">Get Stronger Faster (8 weeks)</h2>
      <p className="text-sm text-gray-700">
        8 weeks to get faster and stronger. For runners who want sharper 5K–10K times and the durability strength brings.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Experience</div>
            <div className="flex gap-2">
              {([
                { key: 'beginner', label: 'New to running' },
                { key: 'intermediate', label: 'Experienced' },
                { key: 'advanced', label: 'Very experienced' }
              ] as const).map(l => (
                <button key={l.key} onClick={() => setCfg(prev=>({...prev, timeLevel: l.key }))}
                  className={`px-3 py-1 border rounded ${cfg.timeLevel===l.key? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{l.label}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500">Recommended: {rec.total} days/week (including {rec.strength} strength)</p>
          <p className="text-xs text-gray-500">Quality run days/week: {cfg.timeLevel === 'beginner' ? '1' : '2'}</p>

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

          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <div className="text-sm font-medium mb-1">Long run day</div>
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                value={cfg.longRunDay}
                onChange={(e)=> setCfg(prev=>({ ...prev, longRunDay: e.target.value as Day }))}
              >
                {cfg.availableDays.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Inline hint spanning between the two controls for tighter UI */}
            {(() => {
              const canThree = (cfg.availableDays.length >= 6);
              return (
                <div className="col-span-2 text-xs text-gray-500 -mt-1">
                  {!canThree && '3 strength days require ≥6 available days.'}
                </div>
              );
            })()}

            <div>
              <div className="text-sm font-medium mb-1">Strength / wk</div>
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
              <p className="mt-1 text-xs text-gray-600">Heavy, low-rep lifting to build raw strength and neural drive.</p>
            )}
            {cfg.strengthTrack === 'endurance' && (
              <p className="mt-1 text-xs text-gray-600">Higher-rep, lighter weights to support stamina and muscular durability.</p>
            )}
            {cfg.strengthTrack === 'hybrid' && (
              <p className="mt-1 text-xs text-gray-600">A mix of heavy and endurance work — balanced strength for all-around performance.</p>
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
          <div className="mb-3 text-xs text-gray-600">
            <div className="font-medium text-gray-700">Notes</div>
            <ul className="list-disc pl-5 space-y-1">
              {notesByWeek.get(currentWeek)!.map((n, i) => (<li key={i}>{n}</li>))}
            </ul>
          </div>
        ) : null}

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
                  {/* Notes for this week/day */}
                  {notesByWeek.get(currentWeek)?.length ? (
                    <div className="mb-2 text-xs text-gray-600">
                      <div className="font-medium text-gray-700">Notes</div>
                      <ul className="list-disc pl-5">
                        {notesByWeek.get(currentWeek)!.map((n, i) => (<li key={i}>{n}</li>))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {list.map((s, idx) => {
                      const detail = s.discipline === 'strength'
                        ? (/(Neural)/i.test(s.description) ? 'neural' : 'strength')
                        : `${s.type} • ${s.intensity}`;
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
      </div>
    </div>
  );
}


