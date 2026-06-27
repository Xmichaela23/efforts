import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NonRaceBuilder from '@/components/NonRaceBuilder';
import { getStoredUserId } from '@/lib/supabase';

// Cut B3 — page wrapper for the non-race goal builder (mirrors ArcSetupPage). The entry point (a button
// from GoalsScreen) lands with the goal picker in a later cut; the route exists now so the shell is
// navigable end-to-end.
const NonRaceBuilderPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getStoredUserId()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return <NonRaceBuilder />;
};

export default NonRaceBuilderPage;
