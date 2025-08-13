import React, { useEffect, useState } from 'react';

const StravaCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing Strava authorization...');

  useEffect(() => {
    const handleStravaCallback = async () => {
      try {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(`Strava authorization denied: ${error}`);
        }

        if (!code) {
          throw new Error('No authorization code received from Strava');
        }

        setMessage('Exchanging authorization code for access token...');

        // Exchange code for access token
        const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
        const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET;

        console.log('Client ID:', clientId); // Debug log
        console.log('Client Secret exists:', !!clientSecret); // Debug log (don't log actual secret)

        if (!clientId || !clientSecret) {
          throw new Error('Strava client credentials not configured');
        }

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
          const errorText = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        console.log('Token response:', tokenData); // Debug log

        if (!tokenData.access_token) {
          throw new Error('No access token received from Strava');
        }

        // ✅ SUCCESS: Only show after getting real tokens
        setMessage('Successfully connected to Strava!');
        setStatus('success');

        // Send token data back to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'STRAVA_AUTH_SUCCESS',
            data: {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: tokenData.expires_at,
              athlete: tokenData.athlete
            }
          }, window.location.origin);

          // Close popup after short delay
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          // Fallback: store in localStorage and redirect
          localStorage.setItem('strava_access_token', tokenData.access_token);
          setMessage('Connected! You can close this window.');
        }

      } catch (error) {
        console.error('Strava callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unknown error occurred');

        // Send error back to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'STRAVA_AUTH_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
          }, window.location.origin);

          setTimeout(() => {
            window.close();
          }, 2000);
        }
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