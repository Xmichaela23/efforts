import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ArcSetupWizard from '@/components/ArcSetupWizard';
import { getStoredUserId } from '@/lib/supabase';

const ArcSetupPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getStoredUserId()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return <ArcSetupWizard />;
};

export default ArcSetupPage;
