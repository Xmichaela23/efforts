import { useEffect, useState } from 'react';
import { getStoredUserId, supabase } from '@/lib/supabase';

export function useAppAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getStoredUserId();
      if (!uid) {
        if (!cancelled) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from('users').select('is_admin').eq('id', uid).maybeSingle();
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
