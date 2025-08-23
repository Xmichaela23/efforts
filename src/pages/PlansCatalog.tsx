import React from 'react';
import PlanCatalog from '@/components/PlanCatalog';

export default function PlansCatalogPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Select a Plan</h2>
        <div className="flex gap-3">
          <a href="/plans/admin" className="text-sm text-blue-600">Admin</a>
          <a href="/" className="text-sm text-blue-600">Dashboard</a>
        </div>
      </div>
      <PlanCatalog />
    </div>
  );
}


