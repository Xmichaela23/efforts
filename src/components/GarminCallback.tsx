import React, { useEffect, useState } from 'react';

const GarminCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing Garmin authorization...');

  useEffect(() => {
    const handleGarminCallback = async () => {
      try {
        // Debug logging
        console.log('Full callback URL:', window.location.href);
        console.log('URL params:', window.location.search);
        
        // Only process if we have URL parameters (meaning we came from OAuth)
        if (!window.location.search) {
          console.log('No URL parameters found - not processing OAuth callback');
          setStatus('error');
          setMessage('No OAuth parameters found');
          return;
        }
        
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        
        console.log('Extracted code:', code);
        console.log('Extracted error:', error);

        if (error) {
          throw new Error(`Garmin authorization denied: ${error}`);
        }

        if (!code) {
          throw new Error('No authorization code received from Garmin');
        }

        setMessage('Authorization successful! Completing connection...');
        setStatus('success');

        // Check if this is a popup window or direct navigation
        if (window.opener) {
          // This is a popup - send message to parent
          window.opener.postMessage({
            type: 'GARMIN_AUTH_SUCCESS',
            code: code
          }, window.location.origin);

          // Close popup after short delay
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          // This is direct navigation - redirect to home with code
          // Store the code for the main app to pick up
          sessionStorage.setItem('garmin_auth_code', code);
          
          // Redirect to main app
          window.location.href = '/';
        }

      } catch (error) {
        console.error('Garmin callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unknown error occurred');

        // Send error back to parent window if popup, otherwise show error
        if (window.opener) {
          window.opener.postMessage({
            type: 'GARMIN_AUTH_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
          }, window.location.origin);

          setTimeout(() => {
            window.close();
          }, 2000);
        }
      }
    };

    handleGarminCallback();
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black">Garmin Connection</h1>
        </div>

        <div className="space-y-4">
          {status === 'processing' && (
            <div className="space-y-2">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm text-gray-600">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-2">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-green-600 font-medium">{message}</p>
              <p className="text-xs text-gray-500">
                {window.opener ? 'This window will close automatically...' : 'Redirecting...'}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600 font-medium">{message}</p>
              <p className="text-xs text-gray-500">
                {window.opener ? 'This window will close automatically...' : 'Please try again'}
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Powered by Garmin Connect
          </p>
        </div>
      </div>
    </div>
  );
};

export default GarminCallback;