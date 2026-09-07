import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/MobileHeader';

interface SupportProps {
  onBack?: () => void;
}

/**
 * Support page — the address given to Garmin and Strava as the support site for athletes
 * who connect them (Strava Extended Access form, 2026-09-07). Plain answers only; anything
 * describing what we do with connected data must agree with /privacy.
 */
export default function Support({ onBack }: SupportProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader showBackButton={true} onBack={handleBack} />
      <main className="mobile-main-content">
        <div className="p-4 max-w-4xl mx-auto">
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Support</h1>

            <p className="text-white">
              Efforts builds a strength plan around the riding and running you already do, and adjusts it
              from what you actually complete. If something is wrong or unclear, write to{' '}
              <a href="mailto:support@efforts.work" className="underline">support@efforts.work</a>. A person
              reads every message and answers within two working days.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Connecting Strava or Garmin</h2>
              <p className="text-white">
                Open the menu, then Connections, then the service you want. You sign in on their site, not
                ours, and you choose what to allow. Once connected, activities reach Efforts on their own
                after you finish recording them.
              </p>
              <p className="text-white">
                If activities stop arriving, the connection has usually expired. Connections will say so and
                offer to reconnect.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Disconnecting</h2>
              <p className="text-white">
                Open Connections and tap Disconnect. We tell that service to stop sending us your activities
                straight away. You can also remove Efforts from your Strava or Garmin account on their own
                site, and we stop reading your data when they tell us.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Your data</h2>
              <ul className="space-y-2 ml-4">
                <li className="text-white">
                  • Your activities are shown only to you. They are never shared with other athletes, sold,
                  or used to study athletes in aggregate.
                </li>
                <li className="text-white">
                  • Nothing is sent to any artificial intelligence or machine learning service. Every number
                  in the app is measured from your own activities or worked out with a published formula.
                </li>
                <li className="text-white">
                  • Account, then Download your data, gives you everything we hold about you as a file.
                </li>
                <li className="text-white">
                  • Account, then Delete account, removes all of it. We tell Strava and Garmin to stop at the
                  same time. This cannot be undone.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Common questions</h2>
              <p className="text-white">
                <strong>An activity is missing.</strong> Give it a few minutes. If it is still absent, check
                Connections, then use Import on the Strava card to pull recent activities in by hand.
              </p>
              <p className="text-white">
                <strong>A workout says the analysis failed.</strong> Open it and tap Try again. If it fails a
                second time, write to us with the date of the workout.
              </p>
              <p className="text-white">
                <strong>The numbers on my plan look wrong.</strong> Open Adjust. Every number the plan uses is
                there and you can change it. Changes apply to sessions you have not done yet.
              </p>
              <p className="text-white">
                <strong>I forgot my password.</strong> Use the forgotten password link on the sign-in screen.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Contact</h2>
              <p className="text-white">
                <a href="mailto:support@efforts.work" className="underline">support@efforts.work</a>
              </p>
              <p className="text-white">
                Our <a href="/privacy" className="underline">privacy policy</a> describes exactly what we read
                from a connected service and what we do with it.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
