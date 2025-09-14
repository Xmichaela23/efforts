import { supabase } from '@/lib/supabase';

export async function saveUserLocation(opts?: { date?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords as any;
        const d = opts?.date || new Date().toISOString().slice(0,10);
        const { error } = await supabase.functions.invoke('save-location', {
          body: { lat, lng, accuracy_m: Math.round(accuracy || 0), date: d, source: 'browser' }
        });
        if (error) return resolve(false);
        resolve(true);
      } catch { resolve(false); }
    }, () => resolve(false), { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  });
}


