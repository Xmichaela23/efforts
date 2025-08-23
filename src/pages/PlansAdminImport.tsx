import React from 'react';
import PlanJSONImport from '@/components/PlanJSONImport';

export default function PlansAdminImport() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Admin: Publish Template</h2>
        <div className="flex gap-3">
          <a href="/plans/catalog" className="text-sm text-blue-600">Catalog</a>
          <a href="/" className="text-sm text-blue-600">Dashboard</a>
        </div>
      </div>
      <PlanJSONImport />
    </div>
  );
}


