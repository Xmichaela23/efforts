import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AppLayout from './AppLayout';

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userApproved, setUserApproved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  const checkUserApproval = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('approved')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error checking user approval:', error);
        return false;
      }

      return data?.approved || false;
    } catch (error) {
      console.error('Error in checkUserApproval:', error);
      return false;
    }
  };

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        if (user) {
          const approved = await checkUserApproval(user.id);
          setUserApproved(approved);
        }
      } catch (error) {
        console.error('Error checking user:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const approved = await checkUserApproval(session.user.id);
          setUserApproved(approved);
        } else {
          setUserApproved(null);
        }
        
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserApproved(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // If user is logged in but not approved, show pending message
  if (user && userApproved === false) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">efforts</h1>
            <p className="mt-4 text-gray-600">Account Pending Approval</p>
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-700">
              Your account has been created successfully! We'll notify you once your access has been approved.
            </p>
          </div>
          
          <div className="text-sm text-gray-500">
            <p>Signed in as: {user.email}</p>
          </div>
          
          <button
            onClick={handleLogout}
            className="text-black hover:underline text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // If user is logged in and approved, show the main app
  if (user && userApproved === true) {
    return <AppLayout onLogout={handleLogout} />;
  }

  // If not logged in, show auth forms
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
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