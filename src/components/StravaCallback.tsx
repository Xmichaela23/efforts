import React, { useEffect, useState } from 'react';

const StravaCallback: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Strava authorization...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleStravaCallback = async () => {
      try {
        setLoading(true);
        setStatus('loading');
        setMessage('Processing Strava authorization...');

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

        // Exchange code for tokens
        const response = await fetch('/api/strava-token-exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error(`Token exchange failed: ${response.statusText}`);
        }

        const tokenData = await response.json();

        // Store tokens in localStorage (like Garmin)
        localStorage.setItem('strava_access_token', tokenData.access_token);
        localStorage.setItem('strava_refresh_token', tokenData.refresh_token);
        localStorage.setItem('strava_expires_at', tokenData.expires_at);
        localStorage.setItem('strava_athlete', JSON.stringify(tokenData.athlete));
        localStorage.setItem('strava_connected', 'true');

        setStatus('success');
        setMessage('Successfully connected to Strava!');

        // Redirect back to main app after a short delay
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);

      } catch (error) {
        console.error('Error handling Strava callback:', error);
        setStatus('error');
        setMessage(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    handleStravaCallback();
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black">Strava Connection</h1>
        </div>

        <div className="space-y-4">
          {loading && (
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
              <p className="text-xs text-gray-500">This window will close automatically...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600 font-medium">Connection Failed</p>
              <p className="text-xs text-gray-500">{message}</p>
              <button 
                onClick={() => window.close()}
                className="text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StravaCallback;