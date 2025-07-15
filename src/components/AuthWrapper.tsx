import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AppLayout from './AppLayout';

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    console.log('AuthWrapper mounted');
    
    // Simple user check
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('User check complete:', user?.email || 'no user');
      setUser(user);
      setLoading(false);
    }).catch(err => {
      console.error('Auth error:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // TEMPORARY: Skip approval check entirely
  if (user) {
    return <AppLayout onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-sm text-gray-500 text-center">[AUTHWRAPPER TEST COMMIT]</div>
        {showRegister ? (
          <RegisterForm
            onSuccess={() => setShowRegister(false)}
            onSwitchToLogin={() => setShowRegister(false)}
          />
        ) : (
          <LoginForm
            onSwitchToRegister={() => setShowRegister(true)}
          />
        )}
      </div>
    </div>
  );
};

export default AuthWrapper;
