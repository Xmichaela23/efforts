/**
 * =============================================================================
 * ACWR GAUGE COMPONENT
 * =============================================================================
 * 
 * Displays the Acute:Chronic Workload Ratio with:
 * - Visual gauge bar showing position in zones
 * - Current status and ratio
 * - Acute and chronic totals
 * - Projected ACWR if planned workout exists
 * - Progressive disclosure for insufficient data
 */

import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import { ACWR_STATUS_CONFIG } from '@/lib/context-utils';
import type { ACWRData } from '@/hooks/useTrainingContext';

interface ACWRGaugeProps {
  acwr: ACWRData;
  showProjected?: boolean;
}

export const ACWRGauge: React.FC<ACWRGaugeProps> = ({ acwr, showProjected = true }) => {
  const [showInfo, setShowInfo] = useState(false);
  const config = ACWR_STATUS_CONFIG[acwr.status];
  
  // Calculate gauge position (0.5 = leftmost, 2.0 = rightmost)
  // Map 0.5-2.0 range to 0-100%
  const clampedRatio = Math.min(Math.max(acwr.ratio, 0.5), 2.0);
  const gaugePosition = ((clampedRatio - 0.5) / 1.5) * 100;

  // Progressive disclosure - show message if insufficient data
  if (acwr.data_days < 7) {
    const daysNeeded = 7 - acwr.data_days;
    return (
      <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
        <div className="text-center">
          <div className="text-white/60 text-sm">
            Train for {daysNeeded} more day{daysNeeded !== 1 ? 's' : ''} to unlock training load insights
          </div>
          <div className="text-white/40 text-xs mt-2">
            {acwr.data_days} day{acwr.data_days !== 1 ? 's' : ''} of data collected
          </div>
        </div>
      </div>
    );
  }

  // Build caveat for partial data
  let caveat = '';
  if (acwr.data_days < 14) {
    caveat = '(preliminary - 7 days)';
  } else if (acwr.data_days < 28) {
    caveat = `(${acwr.data_days} days of data)`;
  }

  return (
    <div className="instrument-card">
      {/* ACWR Value and Status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="text-2xl font-bold text-white">
              {acwr.ratio.toFixed(2)}
            </div>
            <div className={`text-sm ${config.textClass}`}>
              {config.label}
              {caveat && <span className="text-white/40 ml-1">{caveat}</span>}
            </div>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="What is ACWR?"
          >
            {showInfo ? (
              <X className="w-4 h-4 text-white/50" />
            ) : (
              <Info className="w-4 h-4 text-white/50" />
            )}
          </button>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>Acute (7d): {acwr.acute_total}</div>
          <div>Chronic (28d): {acwr.chronic_total}</div>
        </div>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="mb-4 p-3 bg-white/[0.05] rounded-lg border border-white/10 text-xs space-y-3">
          <div className="font-medium text-white/90">Acute:Chronic Workload Ratio</div>
          <div className="text-white/60">
            Compares your recent training to your fitness base to prevent injury from ramping up too fast.
          </div>
          
          {/* The Calculation */}
          <div className="bg-white/[0.03] rounded p-2.5">
            <div className="font-medium text-white/70 mb-1.5">Your calculation:</div>
            <div className="font-mono text-white/80 text-center py-1">
              ({acwr.acute_total} ÷ 7) ÷ ({acwr.chronic_total} ÷ 28) = <span className={config.textClass}>{acwr.ratio.toFixed(2)}</span>
            </div>
            <div className="text-white/50 text-center mt-1">
              {Math.round(acwr.acute_total / 7)}/day vs {Math.round(acwr.chronic_total / 28)}/day
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.03] rounded p-2">
              <div className="font-medium text-white/80">Acute (7d): {acwr.acute_total}</div>
              <div className="text-white/50">Recent stress - what you've done this week</div>
            </div>
            <div className="bg-white/[0.03] rounded p-2">
              <div className="font-medium text-white/80">Chronic (28d): {acwr.chronic_total}</div>
              <div className="text-white/50">Your fitness base - what you're adapted to</div>
            </div>
          </div>

          {/* Chronic explanation */}
          <div className="bg-white/[0.03] rounded p-2.5 border-l-2 border-green-500/50">
            <div className="font-medium text-white/80 mb-1">Why Chronic matters:</div>
            <div className="text-white/50 space-y-1">
              <div>• Higher chronic = more resilient. You can handle bigger acute weeks.</div>
              <div>• It's built gradually through consistent training over months.</div>
              <div>• A sudden spike in acute (with low chronic) = injury risk.</div>
            </div>
          </div>

          <div className="pt-1 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-blue-500/50"></div>
              <span className="text-white/60">&lt; 0.8 Undertrained - losing fitness</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-green-500/50"></div>
              <span className="text-white/60">0.8-1.3 Optimal - safe progression</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-yellow-500/50"></div>
              <span className="text-white/60">1.3-1.5 Elevated - prioritize recovery</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-red-500/50"></div>
              <span className="text-white/60">&gt; 1.5 High Risk - injury/illness risk</span>
            </div>
          </div>
        </div>
      )}

      {/* Gauge Bar */}
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden mb-2">
        {/* Zone indicators - positioned as percentages of the 0.5-2.0 range */}
        {/* 0.5-0.8 = undertrained (0-20%), 0.8-1.3 = optimal (20-53%), 1.3-1.5 = elevated (53-67%), 1.5-2.0 = high_risk (67-100%) */}
        <div className="absolute inset-0 flex">
          <div className="bg-blue-500/30" style={{ width: '20%' }}></div>
          <div className="bg-green-500/30" style={{ width: '33%' }}></div>
          <div className="bg-yellow-500/30" style={{ width: '14%' }}></div>
          <div className="bg-red-500/30" style={{ width: '33%' }}></div>
        </div>
        
        {/* Current position indicator */}
        <div 
          className={`absolute top-0 bottom-0 w-1.5 ${config.bgClass} rounded-full shadow-lg transition-all duration-300`}
          style={{ left: `${gaugePosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between text-xs text-white/30 mb-3">
        <span>0.5</span>
        <span>0.8</span>
        <span>1.3</span>
        <span>1.5</span>
        <span>2.0</span>
      </div>

      {/* Projected ACWR */}
      {showProjected && acwr.projected && (
        <div className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70">
          <span className="text-white/50">If you complete today's workout: </span>
          <span className={ACWR_STATUS_CONFIG[acwr.projected.status].textClass}>
            {acwr.projected.ratio.toFixed(2)} ({ACWR_STATUS_CONFIG[acwr.projected.status].label})
          </span>
        </div>
      )}
    </div>
  );
};

export default ACWRGauge;

