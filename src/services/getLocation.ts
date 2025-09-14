import { supabase } from '@/lib/supabase';

export async function saveUserLocation(opts?: { date?: string }): Promise<{ ok: boolean; lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords as any;
        const d = opts?.date || new Date().toISOString().slice(0,10);
        // If not authenticated, skip invoking the edge function
        try {
          const { data: sess } = await supabase.auth.getSession();
          if (!sess?.session) return resolve({ ok: false });
        } catch {}
        const { error } = await supabase.functions.invoke('save-location', {
          body: { lat, lng, accuracy_m: Math.round(accuracy || 0), date: d, source: 'browser' }
        });
        if (error) return resolve({ ok: false });
        resolve({ ok: true, lat, lng });
      } catch { resolve({ ok: false }); }
    }, () => resolve({ ok: false }), { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  });
}


