import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/MobileHeader';

interface PrivacyProps {
  onBack?: () => void;
}

export default function Privacy({ onBack }: PrivacyProps) {
  const navigate = useNavigate();
  
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      // Try to go back, or go to home if no history
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader
        showBackButton={true}
        onBack={handleBack}
      />
      <main className="mobile-main-content">
        <div className="p-4 max-w-4xl mx-auto">
          {/* Privacy Policy Content */}
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
            
            <div className="space-y-4">
              <p className="text-white">
                <strong>Efforts Work</strong> (referred to as "Efforts", "we", or "us") respects your privacy. 
                This policy describes how we collect, use, and protect your information when you use our services.
              </p>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Information We Collect</h2>
                <ul className="space-y-2 ml-4">
                  <li className="text-white">• User account details (such as name and email address)</li>
                  <li className="text-white">• Workout, activity, and health-related data you choose to log</li>
                  <li className="text-white">• Activity data from services you connect (Garmin, Strava), described below</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Connected Services: Garmin and Strava</h2>
                <p className="text-white">
                  When you connect a Garmin account, Garmin sends us your activities as you record them. From each activity we read
                  the activity type, start time, duration, distance, calories, speed and pace, heart rate, cadence, power, elevation,
                  starting location, device name, laps, and the per-second recording (heart rate, speed, position, elevation, temperature).
                  We use it to show your training and to shape your plan. If you ask, we send a planned workout to your Garmin device.
                </p>
                <p className="text-white">
                  When you connect a Strava account, Strava sends us the same kind of activity data, and we read it the same way.
                </p>
                <ul className="space-y-2 ml-4">
                  <li className="text-white">• When you disconnect Garmin or Strava in Efforts, we tell that service to stop sending us your data and we remove our access to it.</li>
                  <li className="text-white">• When you remove Efforts from your Garmin account, Garmin tells us, we stop reading your Garmin data, and we delete the activities and connection details we received from Garmin. Your Efforts account and everything you logged yourself stay.</li>
                  <li className="text-white">• When you delete your Efforts account, we tell Garmin and Strava to stop, and all of your data, including everything received from them, is permanently deleted.</li>
                  <li className="text-white">• We do not sell Garmin or Strava data, and we do not share it with anyone else.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">How We Use Information</h2>
                <ul className="space-y-2 ml-4">
                  <li className="text-white">• To provide and improve the Efforts platform</li>
                  <li className="text-white">• To allow you to track and manage your training</li>
                  <li className="text-white">• We do not sell or share your data with third parties</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Data Retention and Deletion</h2>
                <ul className="space-y-2 ml-4">
                  <li className="text-white">• Users can delete their accounts and all associated data at any time</li>
                  <li className="text-white">• Cached activity data is stored for up to 30 days for offline functionality</li>
                  <li className="text-white">• All data is permanently deleted upon user account deletion</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Your Rights</h2>
                <p className="text-white ml-4">
                  • You can request data export or deletion by contacting us at{' '}
                  <a 
                    href="mailto:support@efforts.work" 
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    support@efforts.work
                  </a>
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Changes</h2>
                <p className="text-white">
                  We may update this policy. You will be notified of significant changes through the app or our website.
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Contact</h2>
                <p className="text-white">
                  If you have questions, please email{' '}
                  <a 
                    href="mailto:support@efforts.work" 
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    support@efforts.work
                  </a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
