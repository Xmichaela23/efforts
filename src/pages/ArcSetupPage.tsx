import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ArcSetupChat, { ArcSetupScreenChrome } from '@/components/ArcSetupChat';
import { getStoredUserId } from '@/lib/supabase';

const ArcSetupPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getStoredUserId()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-zinc-950 text-white overflow-hidden">
      <ArcSetupScreenChrome title="Plan my season" />
      <div className="flex-1 flex flex-col min-h-0 w-full max-w-md mx-auto overflow-hidden">
        <ArcSetupChat />
      </div>
    </div>
  );
};

export default ArcSetupPage;
