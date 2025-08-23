import React, { useEffect, useState } from 'react';
import { listLibraryPlans, type LibraryPlan } from '@/services/LibraryPlans';
import { useAppContext } from '@/contexts/AppContext';
import PlanJSONImport from './PlanJSONImport';

type Tab = 'run'|'ride'|'swim'|'strength'|'hybrid';

export default function PlanCatalog() {
  const [tab, setTab] = useState<Tab>('run');
  const [items, setItems] = useState<LibraryPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { plansBundleReady } = useAppContext();

  useEffect(() => {
    setLoading(true);
    listLibraryPlans(tab).then(setItems).finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h2 className="text-2xl font-semibold">Plans</h2>
      <div className="flex gap-2">
        {(['run','ride','swim','strength','hybrid'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 border rounded ${tab===t?'bg-gray-100 border-gray-300':'border-gray-200'}`}>{t[0].toUpperCase()+t.slice(1)}</button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="text-sm text-gray-600">No plans yet.</div>
      )}

      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="p-3 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-600">{p.duration_weeks} weeks • {p.discipline}</div>
            </div>
            {/* Reuse the importer in plan mode by feeding template JSON via URL/payload in future; for now the importer accepts pasted JSON */}
            <a href={`/plans/select?id=${p.id}`} className="text-sm text-blue-600">Select</a>
          </div>
        ))}
      </div>
    </div>
  );
}


