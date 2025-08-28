import React from 'react';
import { useNavigate } from 'react-router-dom';
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
              <button onClick={safeBack} className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <h1 className="text-2xl font-bold">Select a Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/plans/admin')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Admin</button>
              <button onClick={() => navigate('/')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</button>
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


