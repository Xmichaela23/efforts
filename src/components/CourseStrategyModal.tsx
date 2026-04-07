import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { invokeFunction } from '@/lib/supabase';

const ZONE_STROKE: Record<string, string> = {
  conservative: 'rgb(34, 197, 94)',
  cruise: 'rgb(59, 130, 246)',
  caution: 'rgb(234, 179, 8)',
  push: 'rgb(239, 68, 68)',
};

export type CourseDetailPayload = {
  course: {
    id: string;
    name: string;
    distance_mi: number;
    elevation_gain_ft: number;
    elevation_loss_ft: number;
    goal_time: string | null;
    /** When set, header shows predicted vs plan-target copy from coach race_readiness. */
    goal_time_source?: 'predicted' | 'plan' | null;
    plan_target_time?: string | null;
    strategy_updated_at: string | null;
    strategy_stale: boolean;
    has_strategy: boolean;
    elevation_profile: [number, number][];
  };
  display_groups: Array<{
    id: number;
    start_mi: number;
    end_mi: number;
    label: string;
    terrain_type: string;
    effort_zone: string;
    pace_range: string;
    hr_range: string;
    cue: string;
    tier: number;
  }>;
};

interface CourseStrategyModalProps {
  open: boolean;
  courseId: string | null;
  onClose: () => void;
  /** Coach `race_readiness.predicted_finish_time_seconds` when this course is for that race goal. */
  predictedFinishTimeSeconds?: number | null;
}

export default function CourseStrategyModal({
  open,
  courseId,
  onClose,
  predictedFinishTimeSeconds = null,
}: CourseStrategyModalProps) {
  const [payload, setPayload] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setErr(null);
    const body: Record<string, unknown> = { course_id: courseId };
    if (predictedFinishTimeSeconds != null && Number.isFinite(predictedFinishTimeSeconds)) {
      body.predicted_finish_time_seconds = predictedFinishTimeSeconds;
    }
    const { data, error } = await invokeFunction<CourseDetailPayload>('course-detail', body);
    setLoading(false);
    if (error) {
      setErr(error.message);
      setPayload(null);
      return;
    }
    setPayload(data);
  }, [courseId, predictedFinishTimeSeconds]);

  useEffect(() => {
    if (open && courseId) void load();
    if (!open) {
      setPayload(null);
      setErr(null);
    }
  }, [open, courseId, load]);

  const runStrategy = async () => {
    if (!courseId) return;
    setUpdating(true);
    setErr(null);
    const body: Record<string, unknown> = { course_id: courseId };
    if (predictedFinishTimeSeconds != null && Number.isFinite(predictedFinishTimeSeconds)) {
      body.predicted_finish_time_seconds = predictedFinishTimeSeconds;
    }
    const { error } = await invokeFunction('course-strategy', body);
    setUpdating(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  };

  const handleUpdateStrategy = () => void runStrategy();

  if (!open || !courseId) return null;

  const profile = payload?.course.elevation_profile ?? [];
  const fullSeries = profile.map(([mi, ft]) => ({ mi, ft }));
  const maxMi = payload?.course.distance_mi ?? Math.max(0.1, ...fullSeries.map((d) => d.mi));

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0b] overflow-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0a0a0b]/95 px-4 py-3 backdrop-blur-md">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/90">{payload?.course.name ?? 'Course strategy'}</p>
          {payload?.course.goal_time && (
            <div className="space-y-0.5">
              <p className="text-[11px] text-white/45">
                {payload.course.goal_time_source === 'predicted'
                  ? <>Predicted finish <span className="text-white/70">{payload.course.goal_time}</span> (from current fitness)</>
                  : <>Race target <span className="text-white/70">{payload.course.goal_time}</span></>}
              </p>
              {payload.course.plan_target_time && (
                <p className="text-[10px] text-white/35">Plan build target {payload.course.plan_target_time}</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        {loading && <p className="text-sm text-white/50">Loading…</p>}
        {err && <p className="text-sm text-red-400/90">{err}</p>}

        {payload?.course.strategy_stale && payload.course.has_strategy && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
            <span>Strategy may be outdated vs your latest training data.</span>
            <button
              type="button"
              disabled={updating}
              onClick={() => void handleUpdateStrategy()}
              className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${updating ? 'animate-spin' : ''}`} />
              Update
            </button>
          </div>
        )}

        {!payload?.course.has_strategy && !loading && courseId && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 space-y-2 text-[13px] text-white/60">
            <p>No strategy yet. Needs a race target from your goal or linked plan (same as plan build).</p>
            <button
              type="button"
              disabled={updating}
              onClick={() => void runStrategy()}
              className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
            >
              {updating ? 'Generating…' : 'Generate strategy'}
            </button>
          </div>
        )}

        {fullSeries.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 overflow-x-auto">
            <div style={{ minWidth: 800, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fullSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    type="number"
                    dataKey="mi"
                    domain={[0, maxMi]}
                    stroke="rgba(255,255,255,0.25)"
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                    label={{ value: 'mi', position: 'insideBottomRight', fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="ft"
                    stroke="rgba(255,255,255,0.25)"
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                    width={44}
                    label={{ value: 'ft', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ft"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {(payload?.display_groups ?? []).map((g) => {
                    const pts = fullSeries.filter((p) => p.mi >= g.start_mi && p.mi <= g.end_mi);
                    if (pts.length === 0) return null;
                    const stroke = ZONE_STROKE[g.effort_zone] ?? 'rgba(255,255,255,0.35)';
                    return (
                      <Line
                        key={g.id}
                        data={pts}
                        type="monotone"
                        dataKey="ft"
                        stroke={stroke}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        name={g.label}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 px-1 text-[10px] text-white/45">
              {(['conservative', 'cruise', 'caution', 'push'] as const).map((z) => (
                <span key={z} className="inline-flex items-center gap-1 capitalize">
                  <span className="h-2 w-2 rounded-sm" style={{ background: ZONE_STROKE[z] }} />
                  {z}
                </span>
              ))}
            </div>
          </div>
        )}

        {(payload?.display_groups ?? []).length > 0 && (
          <div className="space-y-3 pb-8">
            {payload!.display_groups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                style={{ marginLeft: g.tier === 1 ? 12 : 0 }}
              >
                <p className="text-[13px] font-medium text-white/88">{g.label}</p>
                <p
                  className="mt-1 font-mono text-[11px]"
                  style={{ color: ZONE_STROKE[g.effort_zone] ?? 'rgba(255,255,255,0.55)' }}
                >
                  {g.pace_range} · {g.hr_range}
                </p>
                {!!g.cue && <p className="mt-1 text-[12px] text-white/50 leading-snug">{g.cue}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
