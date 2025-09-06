import React from 'react';
import StrengthCompareTable from './StrengthCompareTable';

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
};

const fmtTime = (sec?: number) => {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtPace = (secPerMi?: number) => {
  if (!secPerMi || secPerMi <= 0 || !Number.isFinite(secPerMi)) return '—';
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
};

const fmtDistanceMi = (km?: number) => {
  if (!km || km <= 0) return '—';
  const mi = km * 0.621371;
  return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
};

const joinPlannedLabel = (step: any): string => {
  // Try distance first, fallback to time
  if (typeof step.distanceMeters === 'number' && step.distanceMeters > 0) {
    const mi = step.distanceMeters / 1609.34;
    const paceStr = step.paceTarget || step.target_pace || step.pace || '';
    const paceClean = String(paceStr).includes('/') ? String(paceStr) : '';
    return `${mi.toFixed(mi < 1 ? 2 : 1)} mi${paceClean ? ` @ ${paceClean}` : ''}`;
  }
  if (typeof step.duration === 'number' && step.duration > 0) {
    const paceStr = step.paceTarget || step.target_pace || step.pace || '';
    const paceClean = String(paceStr).includes('/') ? String(paceStr) : '';
    return `${fmtTime(step.duration)}${paceClean ? ` @ ${paceClean}` : ''}`;
  }
  // Generic label
  const label = step.effortLabel || step.name || step.type || '';
  return String(label || '').toString();
};

const completedValueForStep = (completed: any, plannedStep: any): string => {
  if (!completed) return '—';
  // Minimal viable: use overall averages; later we can slice sensor_data per step
  const isRunOrWalk = /run|walk/i.test(completed.type || '') || /running|walking/i.test(completed.activity_type || '');
  const isRide = /ride|bike|cycling/i.test(completed.type || '') || /cycling|bike/i.test(completed.activity_type || '');
  const isSwim = /swim/i.test(completed.type || '') || /swim/i.test(completed.activity_type || '');

  if (typeof plannedStep.distanceMeters === 'number' && plannedStep.distanceMeters > 0) {
    const mi = plannedStep.distanceMeters / 1609.34;
    if (isRunOrWalk) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace; // seconds per km
      const secPerMi = typeof secPerKm === 'number' ? secPerKm * 1.60934 : undefined;
      return `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${fmtPace(secPerMi)}`;
    }
    if (isRide) {
      const kph = completed.avg_speed || completed.metrics?.avg_speed; // km/h
      const mph = typeof kph === 'number' ? kph * 0.621371 : undefined;
      return `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${mph ? `${mph.toFixed(1)} mph` : '—'}`;
    }
    if (isSwim) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace;
      const secPer100 = typeof secPerKm === 'number' ? (secPerKm / 10) : undefined;
      return `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${secPer100 ? `${fmtTime(secPer100)} /100m` : '—'}`;
    }
  }

  if (typeof plannedStep.duration === 'number' && plannedStep.duration > 0) {
    if (isRunOrWalk) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace;
      const secPerMi = typeof secPerKm === 'number' ? secPerKm * 1.60934 : undefined;
      return `${fmtTime(plannedStep.duration)} @ ${fmtPace(secPerMi)}`;
    }
    if (isRide) {
      const kph = completed.avg_speed || completed.metrics?.avg_speed;
      const mph = typeof kph === 'number' ? kph * 0.621371 : undefined;
      return `${fmtTime(plannedStep.duration)} @ ${mph ? `${mph.toFixed(1)} mph` : '—'}`;
    }
    if (isSwim) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace;
      const secPer100 = typeof secPerKm === 'number' ? (secPerKm / 10) : undefined;
      return `${fmtTime(plannedStep.duration)} @ ${secPer100 ? `${fmtTime(secPer100)} /100m` : '—'}`;
    }
  }

  // Fallback: overall time and distance
  const dist = typeof completed.distance === 'number' ? fmtDistanceMi(completed.distance) : undefined;
  const durSec = typeof completed.total_timer_time === 'number' ? completed.total_timer_time : (typeof completed.moving_time === 'number' ? completed.moving_time : undefined);
  const paceSecPerKm = completed.avg_pace || completed.metrics?.avg_pace;
  const pacePerMi = typeof paceSecPerKm === 'number' ? paceSecPerKm * 1.60934 : undefined;
  if (dist && durSec) {
    return `${dist} @ ${fmtPace(pacePerMi)}`;
  }
  if (durSec) return fmtTime(durSec);
  return '—';
};

export default function MobileSummary({ planned, completed }: MobileSummaryProps) {
  if (!planned) {
    return (
      <div className="text-sm text-gray-600">No planned session to compare.</div>
    );
  }

  const type = String(planned.type || '').toLowerCase();

  // Strength uses compare table
  if (type === 'strength') {
    const plannedStrength = (planned.strength_exercises || []).map((ex: any)=>({ name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight }));
    const completedStrength = (completed?.strength_exercises || []).map((ex: any)=>({ name: ex.name, setsArray: Array.isArray(ex.sets)?ex.sets:[] }));
    return (
      <div className="space-y-4">
        <StrengthCompareTable planned={plannedStrength} completed={completedStrength} />
        {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
          <div className="text-sm text-gray-700">
            <div className="font-medium mb-1">Add‑ons</div>
            {completed.addons.map((a:any, idx:number)=> (
              <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
                <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Endurance (run/ride/swim)
  const steps: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : (Array.isArray(planned?.intervals) ? planned.intervals : []);

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
        <div className="font-medium text-black">Planned</div>
        <div className="font-medium text-black">Completed</div>
      </div>
      <div className="mt-2 divide-y divide-gray-100">
        {steps.map((st, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-4 py-2 text-sm">
            <div className="text-gray-800">{joinPlannedLabel(st)}</div>
            <div className="text-gray-900">{completedValueForStep(completed, st)}</div>
          </div>
        ))}
        {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
          <div className="py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-gray-800">Add‑ons</div>
              <div className="text-gray-900 space-y-1">
                {completed.addons.map((a:any, idx:number)=> (
                  <div key={idx} className="flex items-center justify-between">
                    <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                    <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


