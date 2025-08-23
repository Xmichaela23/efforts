import React from 'react';
import PlanJSONImport from './PlanJSONImport';
import PlanCatalog from './PlanCatalog';

export default function PlanBuilder() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Plans</h2>
        <div className="text-sm text-gray-600 mb-3">Select a plan from the catalog or publish a new template.</div>
        <div className="border rounded">
          <PlanJSONImport />
        </div>
      </div>
      <PlanCatalog />
    </div>
  );
}