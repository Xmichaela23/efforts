/**
 * ⛔ THE LONGER-SESSION OFFER (Michael, 2026-09-27; server `endurance-checkpoint` `length_offer`). A session may get
 * longer at the book's timing, by at most 5% of the week's easy minutes (p148), inside its level's printed range (p239)
 * — and only when the rider taps accept. Every word and number is the server's; with no approved words the card draws
 * nothing. Keep records the answer; the offer returns at the session's next interval.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Offer = { slot: string; from: number; to: number; line: string | null; accept: string | null; keep: string | null };

export default function LengthOfferCard({ enabled }: { enabled: boolean }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    supabase.functions.invoke('endurance-checkpoint', { body: { length_offer: true } })
      .then(({ data }) => { if (!cancelled && data?.success) setOffers(Array.isArray(data.length_offers) ? data.length_offers : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);

  const answer = async (o: Offer, decision: 'accept' | 'keep') => {
    setBusy(o.slot);
    try {
      const { data } = await supabase.functions.invoke('endurance-checkpoint', {
        body: { length_offer_answer: { slot: o.slot, to: o.to, decision } },
      });
      if (data?.success) {
        setOffers((xs) => xs.filter((x) => x.slot !== o.slot));
        try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch { /* no window */ }
      }
    } finally {
      setBusy(null);
    }
  };

  const shown = offers.filter((o) => o.line && o.accept && o.keep);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((o) => (
        <div key={o.slot} className="galaxy-card readout-texture rounded-2xl px-3 py-3 mb-2">
          <p className="text-body text-label-primary">{o.line}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() => answer(o, 'accept')}
              className="text-caption font-medium px-3 py-1.5 rounded-xl text-white bg-white/[0.12] border border-white/25 disabled:opacity-50"
            >
              {o.accept}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => answer(o, 'keep')}
              className="text-caption font-medium px-3 py-1.5 rounded-xl text-label-secondary bg-white/[0.05] border border-white/15 disabled:opacity-50"
            >
              {o.keep}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
