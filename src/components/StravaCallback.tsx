import React, { useEffect, useState } from 'react';

const StravaCallback: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Strava authorization...');

  useEffect(() => {
    const handleStravaCallback = async () => {
      try {
        // Get the authorization code from URL (like Garmin does)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(`Authorization failed: ${error}`);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          return;
        }

        // Exchange code for tokens directly with Strava (like Garmin does)
        const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
        const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET;

        const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Token exchange failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();

        // Store in localStorage (exactly like Garmin does)
        localStorage.setItem('strava_access_token', tokenData.access_token);
        localStorage.setItem('strava_refresh_token', tokenData.refresh_token);
        localStorage.setItem('strava_expires_at', tokenData.expires_at);
        localStorage.setItem('strava_athlete', JSON.stringify(tokenData.athlete));
        localStorage.setItem('strava_connected', 'true');

        setStatus('success');
        setMessage('Successfully connected to Strava!');

        // Redirect back to main app (like Garmin does)
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);

      } catch (error) {
        console.error('Error handling Strava callback:', error);
        setStatus('error');
        setMessage(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    handleStravaCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Strava Connection</h1>
          
          {status === 'loading' && (
            <div className="space-y-4">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-600 font-medium">{message}</p>
              <p className="text-sm text-gray-500">Redirecting back to app...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-red-600 font-medium">{message}</p>
              <button 
                onClick={() => window.location.href = '/'}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Go Back to App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StravaCallback;