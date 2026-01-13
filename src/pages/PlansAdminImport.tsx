import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MobileHeader } from '@/components/MobileHeader';
import PlanJSONImport from '@/components/PlanJSONImport';
import WorkloadAdmin from '@/components/WorkloadAdmin';
import PlanGeneratorTest from '@/components/PlanGeneratorTest';

export default function PlansAdminImport() {
  const navigate = useNavigate();

  const safeBack = () => {
    try {
      if (window.history && window.history.length > 1) navigate(-1);
      else navigate('/');
    } catch {
      navigate('/');
    }
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader
        showBackButton
        onBack={safeBack}
        rightContent={
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/plans/catalog')} variant="ghost" className="text-sm font-medium text-white/80 hover:text-white hover:bg-white/10">Catalog</Button>
            <Button onClick={() => navigate('/')} variant="ghost" className="text-sm font-medium text-white/80 hover:text-white hover:bg-white/10">Dashboard</Button>
          </div>
        }
      />

      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 space-y-8">
          <WorkloadAdmin />
          <PlanJSONImport />
          <PlanGeneratorTest />
        </div>
      </main>
    </div>
  );
}


