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
        <h1 className="text-3xl font-bold text-black">Privacy Policy</h1>
        
        <div className="space-y-4">
          <p className="text-gray-700">
            <strong>Efforts Work</strong> (referred to as "Efforts", "we", or "us") respects your privacy. 
            This policy describes how we collect, use, and protect your information when you use our services.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">Information We Collect</h2>
            <ul className="space-y-2 ml-4">
              <li className="text-gray-700">• User account details (such as name and email address)</li>
              <li className="text-gray-700">• Workout, activity, and health-related data you choose to log</li>
              <li className="text-gray-700">• Device data (when authorized)</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">How We Use Information</h2>
            <ul className="space-y-2 ml-4">
              <li className="text-gray-700">• To provide and improve the Efforts platform</li>
              <li className="text-gray-700">• To allow you to track and manage your training</li>
              <li className="text-gray-700">• We do not sell or share your data with third parties</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">Data Retention and Deletion</h2>
            <ul className="space-y-2 ml-4">
              <li className="text-gray-700">• Users can delete their accounts and all associated data at any time</li>
              <li className="text-gray-700">• Cached activity data is stored for up to 30 days for offline functionality</li>
              <li className="text-gray-700">• All data is permanently deleted upon user account deletion</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">Your Rights</h2>
            <p className="text-gray-700 ml-4">
              • You can request data export or deletion by contacting us at{' '}
              <a 
                href="mailto:michaelangelos@gmail.com" 
                className="text-blue-600 hover:text-blue-700 underline"
              >
                michaelangelos@gmail.com
              </a>
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">Changes</h2>
            <p className="text-gray-700">
              We may update this policy. You will be notified of significant changes through the app or our website.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-black">Contact</h2>
            <p className="text-gray-700">
              If you have questions, please email{' '}
              <a 
                href="mailto:michaelangelos@gmail.com" 
                className="text-blue-600 hover:text-blue-700 underline"
              >
                michaelangelos@gmail.com
              </a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
new
