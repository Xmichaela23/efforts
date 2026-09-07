import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/MobileHeader';
import SupportContent from '@/components/SupportContent';

interface SupportProps {
  onBack?: () => void;
}

/**
 * PUBLIC support page — the address given to Strava and Garmin for athletes who connect them
 * (Strava Extended Access form, 2026-09-07). It must open without a session, so it is its own route
 * and not part of the app shell. Signed in, the same text is a screen inside the app (see AppLayout,
 * `showSupport`) and carries the tab bar like every other screen.
 */
export default function Support({ onBack }: SupportProps) {
  const navigate = useNavigate();
  // Always the app, never browser history: reached from a link there is nothing to go back to.
  const handleBack = () => (onBack ? onBack() : navigate('/'));

  return (
    <div className="mobile-app-container">
      <MobileHeader showBackButton={true} onBack={handleBack} />
      <main className="mobile-main-content">
        <SupportContent />
      </main>
    </div>
  );
}
