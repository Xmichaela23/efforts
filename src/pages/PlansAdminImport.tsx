import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PlanJSONImport from '@/components/PlanJSONImport';
import WorkloadAdmin from '@/components/WorkloadAdmin';

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
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <Button onClick={safeBack} variant="ghost" className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</Button>
              <h1 className="text-2xl font-bold">Admin</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate('/plans/catalog')} variant="ghost" className="text-sm font-medium text-gray-700 hover:bg-gray-50">Catalog</Button>
              <Button onClick={() => navigate('/')} variant="ghost" className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 space-y-8">
          <WorkloadAdmin />
          <PlanJSONImport />
        </div>
      </main>
    </div>
  );
}


