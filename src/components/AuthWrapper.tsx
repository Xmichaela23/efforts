import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AppLayout from './AppLayout';

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    console.log('AuthWrapper mounted');

    // Listen for auth state changes and check approval every time
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('🔍 Auth state changed, checking approval for user:', session.user.id);
        // Fetch approved flag from users table
        const { data, error } = await supabase
          .from('users')
          .select('approved')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.error('❌ Error fetching approval:', error);
          setApproved(false);
        } else {
          console.log('✅ Approval data from database:', data);
          setApproved(data?.approved ?? false);
        }
      } else {
        setApproved(null);
      }
      setLoading(false);
    });

    // On initial mount, check for an existing session
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('🔍 Initial session found, checking approval for user:', session.user.id);
        const { data, error } = await supabase
          .from('users')
          .select('approved')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.error('❌ Error fetching approval (initial):', error);
          setApproved(false);
        } else {
          console.log('✅ Approval data from database (initial):', data);
          setApproved(data?.approved ?? false);
        }
      } else {
        setApproved(null);
        setLoading(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApproved(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
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
  }

  if (user && approved === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white text-center">
        <div className="text-xl font-medium mb-2">You're almost in!</div>
        <div className="text-gray-600 text-sm">
          Your account is pending approval. We'll notify you as soon as it's ready.
        </div>
        <button
          onClick={handleLogout}
          className="mt-6 text-sm text-blue-600 hover:text-blue-700"
        >
          Log out
        </button>
      </div>
    );
  }

  return <AppLayout onLogout={handleLogout} />;
};

export default AuthWrapper;