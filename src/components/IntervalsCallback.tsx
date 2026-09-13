import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// /auth/intervals/callback — Intervals.icu sends the athlete back here with ?code&state (or ?error=access_denied).
// The code must be exchanged within 2 minutes (Intervals OAuth thread, post #1), so the page hands it to the server
// at once; intervals-oauth checks the state was signed for this signed-in athlete, exchanges, and saves.
// Words approved by Michael, 2026-09-13 (docs/WORKORDER-intervals-oauth-2026-09-13.md, section 3).
const COPY = {
  title: 'Intervals.icu',
  failed: 'Intervals.icu did not connect.',
  calendarNotGranted: 'Intervals.icu did not connect. Calendar access is needed to send your rides.',
  back: 'Back to Connections',
};

const IntervalsCallback: React.FC = () => {
  const [failure, setFailure] = useState<string | null>(null);
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // one exchange per code, even when the effect runs twice
    started.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      if (params.get('error') || !code || !state) {
        console.warn('[IntervalsCallback] no code:', params.get('error') ?? 'missing code or state');
        setFailure(COPY.failed);
        return;
      }
      const { data, error } = await supabase.functions.invoke('intervals-oauth', { body: { action: 'exchange', code, state } });
      if (error || !data?.ok) {
        console.warn('[IntervalsCallback] exchange failed:', data?.reason ?? null, data?.error ?? error?.message);
        setFailure(data?.reason === 'calendar_not_granted' ? COPY.calendarNotGranted : COPY.failed);
        return;
      }
      navigate('/connections', { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold text-white/90">{COPY.title}</h1>
        {failure ? (
          <div className="space-y-4">
            <p className="text-sm text-white/80">{failure}</p>
            <button onClick={() => navigate('/connections', { replace: true })} className="text-sm text-white/90 underline">
              {COPY.back}
            </button>
          </div>
        ) : (
          <div className="w-8 h-8 border-2 border-white/60 border-t-transparent rounded-full animate-spin mx-auto" aria-busy="true" />
        )}
      </div>
    </div>
  );
};

export default IntervalsCallback;
