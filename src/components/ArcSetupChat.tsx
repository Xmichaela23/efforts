import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { parseArcSetupFromAssistant, type ArcSetupPayload } from '@/lib/parse-arc-setup';
import type { GoalInsert } from '@/hooks/useGoals';

type ChatMessage = { role: 'assistant' | 'user'; content: string };

const SEED_ASSISTANT = 'What does your season look like?';

function threadForApi(thread: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const t = thread.map((m) => ({ role: m.role, content: m.content }));
  if (t[0]?.role === 'assistant') t.shift();
  return t;
}

function isValidGoalType(t: unknown): t is GoalInsert['goal_type'] {
  return t === 'event' || t === 'capacity' || t === 'maintenance';
}

function normalizeGoalInput(g: Record<string, unknown>): GoalInsert | null {
  const name = typeof g.name === 'string' && g.name.trim() ? g.name.trim() : null;
  if (!name) return null;
  const goal_type = g.goal_type;
  if (!isValidGoalType(goal_type)) return null;
  const target_date =
    typeof g.target_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g.target_date) ? g.target_date.slice(0, 10) : null;
  return {
    name,
    goal_type,
    target_date,
    sport: typeof g.sport === 'string' ? g.sport : null,
    distance: typeof g.distance === 'string' ? g.distance : null,
    course_profile: typeof g.course_profile === 'object' && g.course_profile !== null ? (g.course_profile as Record<string, unknown>) : {},
    target_metric: typeof g.target_metric === 'string' ? g.target_metric : null,
    target_value: typeof g.target_value === 'number' && Number.isFinite(g.target_value) ? g.target_value : null,
    current_value: typeof g.current_value === 'number' && Number.isFinite(g.current_value) ? g.current_value : null,
    priority: g.priority === 'B' || g.priority === 'C' ? g.priority : 'A',
    status: 'active',
    training_prefs: typeof g.training_prefs === 'object' && g.training_prefs !== null ? (g.training_prefs as Record<string, unknown>) : {},
    notes: typeof g.notes === 'string' ? g.notes : null,
  };
}

async function persistArcSetup(payload: ArcSetupPayload): Promise<{ ok: boolean; error?: string }> {
  const userId = getStoredUserId();
  if (!userId) return { ok: false, error: 'Not signed in' };

  const goalsRaw = Array.isArray(payload.goals) ? payload.goals : [];
  const idPatch = (payload.athlete_identity && typeof payload.athlete_identity === 'object' && !Array.isArray(payload.athlete_identity))
    ? (payload.athlete_identity as Record<string, unknown>)
    : null;

  try {
    for (const g of goalsRaw) {
      if (typeof g !== 'object' || g === null) continue;
      const row = normalizeGoalInput(g as Record<string, unknown>);
      if (!row) continue;
      const { error } = await supabase.from('goals').insert([
        {
          user_id: userId,
          ...row,
        },
      ]);
      if (error) {
        console.error('[arc-setup] goal insert', error);
        return { ok: false, error: error.message };
      }
    }

    if (idPatch) {
      const { data: ub, error: fe } = await supabase
        .from('user_baselines')
        .select('id, athlete_identity')
        .eq('user_id', userId)
        .maybeSingle();
      if (fe) {
        return { ok: false, error: fe.message };
      }
      const prev = (ub?.athlete_identity as Record<string, unknown>) || {};
      const merged: Record<string, unknown> = {
        ...prev,
        ...idPatch,
        arc_setup_confirmed_at: new Date().toISOString(),
      };
      if (ub?.id) {
        const { error: ue } = await supabase
          .from('user_baselines')
          .update({ athlete_identity: merged, updated_at: new Date().toISOString() })
          .eq('id', ub.id);
        if (ue) {
          return { ok: false, error: ue.message };
        }
      } else {
        const { error: ie } = await supabase.from('user_baselines').insert([
          {
            user_id: userId,
            age: 0,
            disciplines: [] as string[],
            discipline_fitness: {},
            benchmarks: {},
            performance_numbers: {},
            equipment: {},
            injury_regions: [] as string[],
            training_background: '',
            athlete_identity: merged,
          } as Record<string, unknown>,
        ]);
        if (ie) {
          return { ok: false, error: ie.message };
        }
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}

type ArcSetupChatProps = {
  focusDate?: string;
  /** @deprecated server builds prompt; kept for compatibility */
  onSystemPromptSupplement?: (s: string, arc: unknown) => void;
};

/**
 * AL season setup: chat with Claude via `arc-setup-chat` (server uses web search for race research when needed).
 * No extra loading state — searches add latency only.
 * Optional `<arc_setup>` confirmation card.
 */
export default function ArcSetupChat({ focusDate }: ArcSetupChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: SEED_ASSISTANT }]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState<{
    payload: ArcSetupPayload;
    summaryLine: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingSetup, scrollToBottom]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    const userId = getStoredUserId();
    if (!userId) {
      setError('Sign in to continue');
      return;
    }
    setError(null);
    setDraft('');
    setSending(true);
    const nextThread = [...messages, { role: 'user' as const, content: t }];
    setMessages(nextThread);

    const api = threadForApi(nextThread);
    const today = focusDate && /^\d{4}-\d{2}-\d{2}/.test(focusDate) ? focusDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('arc-setup-chat', {
        body: { user_id: userId, messages: api, focus_date: today },
      });
      if (fnErr) {
        setError(fnErr.message || 'Request failed');
        return;
      }
      const dataErr = (data as { error?: string } | null)?.error;
      if (dataErr) {
        setError(dataErr);
        return;
      }
      const text = (data as { text?: string } | null)?.text;
      if (typeof text !== 'string' || !text.trim()) {
        setError('No response from coach');
        return;
      }
      const { displayText, payload } = parseArcSetupFromAssistant(text);
      const show = displayText || (payload ? 'Here’s a draft we can save—check the card below.' : '');
      setMessages((prev) => [...prev, { role: 'assistant', content: show }]);
      const hasGoals = Array.isArray(payload?.goals) && payload.goals.length > 0;
      const hasId =
        payload?.athlete_identity &&
        typeof payload.athlete_identity === 'object' &&
        !Array.isArray(payload.athlete_identity) &&
        Object.keys(payload.athlete_identity as object).length > 0;
      if (payload && (hasGoals || hasId)) {
        setPendingSetup({
          payload,
          summaryLine:
            typeof payload.summary === 'string' && payload.summary.trim()
              ? payload.summary.trim()
              : 'Review and confirm to save to your account.',
        });
      } else {
        setPendingSetup(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  const onConfirm = async () => {
    if (!pendingSetup) return;
    setSending(true);
    setError(null);
    const { ok, error: pe } = await persistArcSetup(pendingSetup.payload);
    setSending(false);
    if (!ok) {
      setError(pe || 'Save failed');
      return;
    }
    setPendingSetup(null);
  };

  const onClarify = () => {
    setPendingSetup(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-lg mx-auto">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-2 pb-28">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'ml-8 pl-2 py-1.5 text-[13px] leading-snug text-white/90 bg-white/[0.07] rounded-lg border border-white/[0.08]'
                : 'mr-6 text-[13px] leading-snug text-white/80'
            }
          >
            {m.content}
          </div>
        ))}

        {pendingSetup && (
          <div className="mt-3 p-3 rounded-xl border border-teal-500/35 bg-teal-950/40">
            <p className="text-[11px] font-medium text-teal-200/90 uppercase tracking-wide mb-1.5">Ready to save</p>
            <p className="text-[13px] text-white/85 leading-snug mb-3">{pendingSetup.summaryLine}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => void onConfirm()}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-teal-500/30 text-teal-100 border border-teal-500/50 hover:bg-teal-500/40 disabled:opacity-50"
              >
                Looks right
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={onClarify}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/80 border border-white/15 hover:bg-white/10"
              >
                Let me clarify
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-[12px] text-red-300/90 px-1">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-zinc-950/95 backdrop-blur-md">
        <div className="max-w-lg mx-auto flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Message…"
            className="flex-1 min-h-[44px] max-h-28 resize-y rounded-xl bg-white/[0.07] border border-white/15 text-[13px] text-white placeholder:text-white/30 px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="shrink-0 h-11 px-4 rounded-xl bg-teal-500/25 text-teal-100 text-[12px] font-medium border border-teal-500/40 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ArcSetupScreenChrome({ title = 'Plan my season' }: { title?: string }) {
  const navigate = useNavigate();
  return (
    <header className="shrink-0 z-40 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-zinc-950/80">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06]"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-sm font-medium text-white/90 tracking-wide">{title}</h1>
    </header>
  );
}
