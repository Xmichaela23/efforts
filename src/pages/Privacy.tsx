import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrivacyProps {
  onBack?: () => void;
}

export default function Privacy({ onBack }: PrivacyProps) {
  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header with back button */}
      {onBack && (
        <div className="mb-6">
          <Button 
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-black hover:text-blue-600"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      )}

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
              <li className="text-white">• Device data (when authorized)</li>
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
  );
}
