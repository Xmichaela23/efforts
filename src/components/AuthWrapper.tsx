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

    const fetchUserAndApproval = async () => {
      try {
        console.log('🔍 Starting approval check...');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('❌ No user found, setting user to null');
          setUser(null);
          setLoading(false);
          return;
        }

        console.log('✅ User found:', user.id);
        setUser(user);

        // Fetch approved flag from users table
        console.log('🔍 Fetching approval status from database...');
        const { data, error } = await supabase
          .from('users')
          .select('approved')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('❌ Error fetching approval:', error);
          console.log('🔧 Setting approved to false due to error');
          setApproved(false); // default to not approved
        } else {
          console.log('✅ Approval data from database:', data);
          console.log('🔧 Setting approved to:', data?.approved ?? false);
          setApproved(data?.approved ?? false);
        }
      } catch (err) {
        console.error('Auth error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndApproval();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

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