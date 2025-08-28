import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PlanCatalog from '@/components/PlanCatalog';

export default function PlansCatalogPage() {
  const navigate = useNavigate();
  const safeBack = () => { try { if (window.history.length>1) navigate(-1); else navigate('/'); } catch { navigate('/'); } };

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <Button onClick={safeBack} variant="ghost" className="h-8 leading-none text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate('/plans/admin')} variant="ghost" className="h-8 leading-none text-sm font-medium text-gray-700 hover:bg-gray-50">Admin</Button>
              <Button onClick={() => navigate('/')} variant="ghost" className="h-8 leading-none text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</Button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4">
          <PlanCatalog />
        </div>
      </main>
    </div>
  );
}


