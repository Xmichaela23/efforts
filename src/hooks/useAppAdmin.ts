import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAppAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle();
      if (!cancelled) {
        setIsAdmin(!!data?.is_admin);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, loading };
}
