import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { MobileHeader } from '@/components/MobileHeader';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type BaselineRow = {
  learned_fitness: Record<string, unknown> | null;
  athlete_identity: Record<string, unknown> | null;
  disciplines: string[] | null;
  training_background: string | null;
};

export default function OnboardingProfilePage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<BaselineRow | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const uid = getStoredUserId();
      if (!uid) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_baselines')
        .select('id, learned_fitness, athlete_identity, disciplines, training_background')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) {
        console.error(error);
        toast({ title: 'Could not load profile', variant: 'destructive' });
      } else {
        setRow(data as BaselineRow);
        setId((data as { id?: string })?.id ?? null);
      }
      setLoading(false);
    })();
  }, [toast]);

  const confirm = async () => {
    const uid = getStoredUserId();
    if (!uid || !id) return;
    setSaving(true);
    try {
      const ai = { ...(row?.athlete_identity || {}), confirmed_by_user: true, confirmed_at: new Date().toISOString() };
      const { error } = await supabase.from('user_baselines').update({ athlete_identity: ai, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Profile saved' });
      navigate('/');
    } catch (e) {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const lf = row?.learned_fitness;
  const ai = row?.athlete_identity;

  return (
    <div className="mobile-app-container min-h-screen bg-black text-white">
      <MobileHeader showBackButton onBack={() => navigate('/')} rightContent={<span className="text-sm text-white/50">Inferred profile</span>} />
      <div className="p-4 max-w-md mx-auto space-y-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
          </div>
        ) : !row ? (
          <p className="text-white/60 text-sm">No baselines yet. Connect Strava and import activities first.</p>
        ) : (
          <>
            <p className="text-sm text-white/70">
              Here is what we inferred from your training data. Adjust anything that looks off in baselines later — this
              just locks in that you have reviewed the summary.
            </p>
            {ai && Object.keys(ai).length > 0 && (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-2 text-sm">
                <h2 className="text-white font-medium">Athlete identity</h2>
                <p><span className="text-white/50">Focus</span> {String(ai.discipline_identity ?? '—')}</p>
                <p><span className="text-white/50">Phase</span> {String(ai.current_phase ?? '—')}</p>
                <p><span className="text-white/50">Signal</span> {String(ai.phase_signal ?? '—')}</p>
                <p><span className="text-white/50">Style</span> {String(ai.training_personality ?? '—')}</p>
                {row.disciplines && row.disciplines.length > 0 && (
                  <p>
                    <span className="text-white/50">Disciplines</span> {row.disciplines.join(', ')}
                  </p>
                )}
                {row.training_background && <p className="text-white/80 pt-2">{row.training_background}</p>}
                {ai.confirmed_by_user === true && (
                  <p className="text-xs text-emerald-400/90 pt-2">Confirmed {String(ai.confirmed_at ?? '')}</p>
                )}
              </div>
            )}
            {lf && Object.keys(lf).length > 0 && (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-2 text-sm">
                <h2 className="text-white font-medium">Learned fitness (90d)</h2>
                <p className="text-white/50">Status: {String((lf as { learning_status?: string }).learning_status ?? '—')}</p>
                <p className="text-white/50">Workouts analyzed: {String((lf as { workouts_analyzed?: number }).workouts_analyzed ?? '—')}</p>
              </div>
            )}
            {ai?.confirmed_by_user !== true && (
              <Button className="w-full" onClick={confirm} disabled={saving || !id}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Looks right — confirm'}
              </Button>
            )}
            <Button variant="ghost" className="w-full text-white/60" onClick={() => navigate('/')}>
              Back to app
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
