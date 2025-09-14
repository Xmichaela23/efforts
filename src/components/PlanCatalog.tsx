import React, { useEffect, useState } from 'react';
import { listLibraryPlans, deleteLibraryPlan, type LibraryPlan } from '@/services/LibraryPlans';
import { useAppContext } from '@/contexts/AppContext';
import PlanJSONImport from './PlanJSONImport';

type Tab = 'run'|'ride'|'swim'|'strength'|'triathlon'|'hybrid';

export default function PlanCatalog() {
  const [tab, setTab] = useState<Tab>('run');
  const [items, setItems] = useState<LibraryPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string|null>(null);
  const { plansBundleReady } = useAppContext();

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const data = await listLibraryPlans(tab);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [tab]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this catalog plan? This cannot be undone.')) return;
    try {
      await deleteLibraryPlan(id);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h2 className="text-2xl font-semibold">Plans</h2>
      <div className="flex gap-2">
        {(['run','ride','swim','strength','triathlon','hybrid'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded ${tab===t ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && items.length === 0 && (
        <div className="text-sm text-gray-600">No plans yet.</div>
      )}

      <div className="space-y-2">
        {items.map(p => {
          const isTriBlueprint = String(p.discipline||'').toLowerCase()==='triathlon' && (!p.template || !p.template.sessions_by_week);
          return (
            <div key={p.id} className="p-3 flex items-start justify-between hover:bg-gray-50">
              <div className="max-w-[75%]">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-gray-600">{p.duration_weeks} weeks • {p.discipline}{isTriBlueprint? ' • blueprint' : ''}</div>
                {p.description && (
                  <div className="mt-1 text-xs text-gray-700 line-clamp-2">{p.description}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isTriBlueprint ? (
                  <span className="text-sm text-gray-400 cursor-not-allowed">Coming soon</span>
                ) : (
                  <a href={`/plans/select?id=${p.id}`} className="text-sm text-blue-600">Select</a>
                )}
                <button onClick={() => handleDelete(p.id)} className="text-sm text-red-600">Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


