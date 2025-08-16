import React, { useMemo, useState } from 'react';
import { buildGetStrongerFaster8w } from '@/services/plans/skeletons/get_stronger_faster_8w';
import { composeWeek } from '@/services/plans/compose';
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
    standaloneMobility: false,
  });
  const [currentWeek, setCurrentWeek] = useState(1);

  const { weeks, sessionsByWeek } = useMemo(() => {
    const built = buildGetStrongerFaster8w(cfg);
    const sessions = new Map<number, Session[]>();
    built.weeks.forEach((w: SkeletonWeek) => {
      const composed = composeWeek({ weekNum: w.weekNumber, skeletonWeek: w, baselines: undefined }) as any[];
      const mapped: Session[] = composed.map(s => ({
        day: s.day,
        discipline: s.discipline,
        type: s.type,
        duration: s.duration,
        intensity: s.intensity,
        description: s.description,
      }));
      sessions.set(w.weekNumber, mapped);
    });
    return { weeks: built.weeks, sessionsByWeek: sessions };
  }, [cfg]);

  const rec = useMemo(() => {
    if (cfg.timeLevel === 'beginner') return { total: '3–4', strength: '2' };
    if (cfg.timeLevel === 'advanced') return { total: '6–7', strength: '3' };
    return { total: '5–6', strength: '2–3' };
  }, [cfg.timeLevel]);

  const onChipToggle = (d: Day) => {
    setCfg(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(d)
        ? prev.availableDays.filter(x => x !== d)
        : [...prev.availableDays, d].sort((a,b)=>dayChips.indexOf(a)-dayChips.indexOf(b))
    }));
  };

  const onStrengthPrefToggle = (d: Day) => {
    setCfg(prev => ({
      ...prev,
      strengthDaysPreferred: (prev.strengthDaysPreferred ?? []).includes(d)
        ? (prev.strengthDaysPreferred ?? []).filter(x => x !== d)
        : ([...(prev.strengthDaysPreferred ?? []), d] as Day[])
    }));
  };

  const weekSessions = sessionsByWeek.get(currentWeek) || [];
  const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const sortedSessions = [...weekSessions].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  const totalMinutes = sortedSessions.reduce((t, s) => t + (s.duration || 0), 0);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
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

          <div>
            <div className="text-sm font-medium mb-1">Available days</div>
            <div className="flex flex-wrap gap-2">
              {dayChips.map(d => (
                <button key={d} onClick={() => onChipToggle(d)}
                  className={`px-2 py-1 border rounded text-sm ${cfg.availableDays.includes(d)? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{d}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Long run day</div>
            <div className="flex gap-2">
              {(['Sat','Sun'] as const).map(d => (
                <button key={d} onClick={() => setCfg(prev=>({...prev, longRunDay: d }))}
                  className={`px-3 py-1 border rounded ${cfg.longRunDay===d? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{d}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Run quality days</div>
            <div className="flex gap-2">
              {[1,2].map(n => (
                <button key={n} onClick={() => setCfg(prev=>({...prev, runQualityDays: n as 1|2 }))}
                  className={`px-3 py-1 border rounded ${cfg.runQualityDays===n? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Include strength</div>
            <div className="flex gap-2">
              {([true,false] as const).map(v => (
                <button key={String(v)} onClick={() => setCfg(prev=>({...prev, includeStrength: v, strengthDaysPerWeek: v ? prev.strengthDaysPerWeek : 0 }))}
                  className={`px-3 py-1 border rounded ${cfg.includeStrength===v? 'bg-gray-100 border-gray-300':'border-gray-200'}`}>{v? 'Yes':'No'}</button>
              ))}
            </div>
          </div>

          <div aria-disabled={!cfg.includeStrength}>
            <div className="text-sm font-medium mb-1">Strength focus</div>
            <div className="flex gap-2">
              {(['power','endurance','hybrid'] as StrengthTrack[]).map(t => (
                <button key={t} onClick={() => cfg.includeStrength && setCfg(prev=>({...prev, strengthTrack: t }))}
                  disabled={!cfg.includeStrength}
                  className={`px-3 py-1 border rounded ${cfg.strengthTrack===t? 'bg-gray-100 border-gray-300':'border-gray-200'} ${!cfg.includeStrength? 'opacity-50 cursor-not-allowed':''}`}>{t}</button>
              ))}
            </div>
          </div>

          <div aria-disabled={!cfg.includeStrength}>
            <div className="text-sm font-medium mb-1">Strength days/week</div>
            <div className="flex gap-2">
              {[0,1,2,3].map(n => (
                <button key={n} onClick={() => cfg.includeStrength && setCfg(prev=>({...prev, strengthDaysPerWeek: n as 0|1|2|3 }))}
                  disabled={!cfg.includeStrength}
                  className={`px-3 py-1 border rounded ${cfg.strengthDaysPerWeek===n? 'bg-gray-100 border-gray-300':'border-gray-200'} ${!cfg.includeStrength? 'opacity-50 cursor-not-allowed':''}`}>{n}</button>
              ))}
            </div>
          </div>

          <div aria-disabled={!cfg.includeStrength}>
            <div className="text-sm font-medium mb-1">Preferred strength days</div>
            <div className="flex flex-wrap gap-2">
              {(['Mon','Wed','Fri'] as Day[]).map(d => (
                <button key={d} onClick={() => cfg.includeStrength && onStrengthPrefToggle(d)} disabled={!cfg.includeStrength}
                  className={`px-2 py-1 border rounded text-sm ${(cfg.strengthDaysPreferred ?? []).includes(d)? 'bg-gray-100 border-gray-300':'border-gray-200'} ${!cfg.includeStrength? 'opacity-50 cursor-not-allowed':''}`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Mobility controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium mb-1">Add standalone mobility work</div>
              <div className="flex gap-2">
                {([true,false] as const).map(v => (
                  <button key={String(v)} onClick={() => setCfg(prev=>({...prev, standaloneMobility: v }))}
                    className={`px-3 py-1 border rounded ${cfg.standaloneMobility===v? 'bg-gray-100 border-gray-400':'border-gray-200'}`}>{v? 'Yes':'No'}</button>
                ))}
              </div>
            </div>

            <div aria-disabled={!cfg.standaloneMobility}>
              <div className="text-sm font-medium mb-1">Mobility days/week</div>
              <div className="flex gap-2">
                {[0,1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => cfg.standaloneMobility && setCfg(prev=>({...prev, mobilityDaysPerWeek: n as 0|1|2|3|4|5 }))}
                    disabled={!cfg.standaloneMobility}
                    className={`px-3 py-1 border rounded ${cfg.mobilityDaysPerWeek===n? 'bg-gray-100 border-gray-300':'border-gray-200'} ${!cfg.standaloneMobility? 'opacity-50 cursor-not-allowed':''}`}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          <div aria-disabled={!cfg.includeMobility}>
            <div className="text-sm font-medium mb-1">Mobility days/week</div>
            <div className="flex gap-2">
              {[0,1,2,3,4,5].map(n => (
                <button key={n} onClick={() => cfg.includeMobility && setCfg(prev=>({...prev, mobilityDaysPerWeek: n as 0|1|2|3|4|5 }))}
                  disabled={!cfg.includeMobility}
                  className={`px-3 py-1 border rounded ${cfg.mobilityDaysPerWeek===n? 'border-gray-900':'border-gray-300'} ${!cfg.includeMobility? 'opacity-50 cursor-not-allowed':''}`}>{n}</button>
              ))}
            </div>
          </div>

          <div aria-disabled={!cfg.standaloneMobility}>
            <div className="text-sm font-medium mb-1">Preferred mobility days</div>
            <div className="flex flex-wrap gap-2">
              {dayChips.map(d => (
                <button key={d} onClick={() => cfg.standaloneMobility && setCfg(prev=>({
                  ...prev,
                  mobilityDaysPreferred: (prev.mobilityDaysPreferred ?? []).includes(d)
                    ? (prev.mobilityDaysPreferred ?? []).filter(x=>x!==d)
                    : ([...(prev.mobilityDaysPreferred ?? []), d] as Day[])
                }))} disabled={!cfg.standaloneMobility}
                  className={`px-2 py-1 border rounded text-sm ${(cfg.mobilityDaysPreferred ?? []).includes(d)? 'bg-gray-100 border-gray-300':'border-gray-200'} ${!cfg.standaloneMobility? 'opacity-50 cursor-not-allowed':''}`}>{d}</button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">Short 10–15 min mobility resets to improve range of motion and recovery. Doesn’t count as hard and can stack with any session.</p>
          </div>
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


