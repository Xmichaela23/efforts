import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ArcSetupChat, { ArcSetupScreenChrome } from '@/components/ArcSetupChat';
import { getStoredUserId } from '@/lib/supabase';

const ArcSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const arcNudgeSeed = (() => {
    const raw = (location.state as { arcNudgeSeed?: unknown } | null)?.arcNudgeSeed;
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
  })();

  useEffect(() => {
    if (!getStoredUserId()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="h-[100dvh] w-full min-w-0 flex flex-col bg-zinc-950 text-white overflow-x-hidden overflow-y-hidden">
      <ArcSetupScreenChrome title="Plan my season">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full max-w-lg mx-auto overflow-hidden">
          <ArcSetupChat seedUserMessage={arcNudgeSeed || undefined} />
        </div>
      </ArcSetupScreenChrome>
    </div>
  );
};

export default ArcSetupPage;
