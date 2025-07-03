import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Privacy Policy for Efforts Training Platform</h1>
          <p className="text-gray-600">Last Updated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p>
              Efforts ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile-first training platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Information We Collect</h2>
            
            <h3 className="text-lg font-medium mb-2">Personal Information</h3>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li><strong>Account Information:</strong> Email address, name, profile information</li>
              <li><strong>Training Data:</strong> Workout plans, exercise logs, training notes</li>
              <li><strong>Device Data:</strong> Information from connected fitness devices and apps</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">Garmin Integration Data</h3>
            <p className="mb-2">When you connect your Garmin account, we may access:</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Activity data and files (.FIT, .GPX, .TCX files)</li>
              <li>Heart rate, power, and performance metrics</li>
              <li>GPS and route data</li>
              <li>Training load and recovery metrics</li>
            </ul>
            <p className="font-medium text-blue-600">
              Important: All Garmin data is accessed read-only for display purposes only.
            </p>

            <h3 className="text-lg font-medium mb-2 mt-4">Technical Information</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Usage Data:</strong> How you interact with our platform</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
              <li><strong>Cookies:</strong> Essential cookies for platform functionality</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How We Use Your Information</h2>
            <p className="mb-2">We use your information to:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Provide and improve our training platform services</li>
              <li>Display your workout data and fitness metrics</li>
              <li>Sync data across your devices</li>
              <li>Communicate with you about your account</li>
              <li>Ensure platform security and prevent fraud</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Storage and Security</h2>
            
            <h3 className="text-lg font-medium mb-2">Security Measures</h3>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li><strong>End-to-end encryption</strong> for data at rest and in transit</li>
              <li><strong>OAuth 2.0</strong> secure authentication</li>
              <li><strong>Regular security audits</strong> and updates</li>
              <li><strong>Limited access</strong> to your data by authorized personnel only</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">Data Retention</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>User-controlled:</strong> You can export or delete your data at any time</li>
              <li><strong>Local caching:</strong> Activity data cached for 30 days for offline functionality</li>
              <li><strong>Account deletion:</strong> All data permanently deleted upon account closure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-Party Integrations</h2>
            
            <h3 className="text-lg font-medium mb-2">Garmin Connect</h3>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>We integrate with Garmin's APIs under their terms of service</li>
              <li>Data access is limited to read-only display purposes</li>
              <li>We comply with Garmin's rate limits and data policies</li>
              <li>Your Garmin data remains subject to Garmin's privacy policy</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">Other Services</h3>
            <p>We may integrate with other fitness platforms with your explicit consent.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Your Rights and Choices</h2>
            <p className="mb-2">You have the right to:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Access</strong> your personal data</li>
              <li><strong>Correct</strong> inaccurate information</li>
              <li><strong>Delete</strong> your account and all associated data</li>
              <li><strong>Export</strong> your data in a portable format</li>
              <li><strong>Withdraw consent</strong> for data processing</li>
              <li><strong>Opt-out</strong> of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Sharing</h2>
            <p className="mb-2">We do not sell, trade, or rent your personal information. We may share data only:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights and safety</li>
              <li>With service providers under strict confidentiality agreements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">International Users</h2>
            <p>
              Your information may be processed in the United States. By using Efforts, you consent to the transfer of your information to the U.S., which may have different data protection laws than your country.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Children's Privacy</h2>
            <p>
              Efforts is not intended for users under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
            <p className="mb-2">We may update this Privacy Policy periodically. We will notify you of material changes by:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Posting the updated policy on our website</li>
              <li>Sending an email notification</li>
              <li>Displaying a prominent notice in the app</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact Us</h2>
            <p className="mb-2">If you have questions about this Privacy Policy or your data:</p>
            <p className="mb-4">
              <strong>Email:</strong> michaelangelos@gmail.com<br />
              <strong>Subject:</strong> Privacy Policy Inquiry
            </p>

            <h3 className="text-lg font-medium mb-2">Data Protection Officer</h3>
            <p>
              For EU users or data protection inquiries:<br />
              <strong>Email:</strong> michaelangelos@gmail.com<br />
              <strong>Subject:</strong> Data Protection Inquiry
            </p>
          </section>

          <section className="border-t pt-6">
            <p className="text-sm text-gray-600 italic">
              This Privacy Policy is effective as of {new Date().toLocaleDateString()} and applies to all users of the Efforts platform.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}