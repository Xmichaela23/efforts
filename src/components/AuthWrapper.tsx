import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AppLayout from './AppLayout';

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          // Check approval status AFTER setting user
          await checkApprovalStatus(user.id);
        } else {
          setUser(null);
          setIsApproved(null);
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
        
        if (session?.user) {
          setUser(session.user);
          // Check approval status when user logs in
          await checkApprovalStatus(session.user.id);
        } else {
          setUser(null);
          setIsApproved(null);
        }
        
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkApprovalStatus = async (userId: string) => {
    setCheckingApproval(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('approved')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error checking approval status:', error);
        // If no user record exists yet, create one (unapproved by default)
        if (error.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('users')
            .insert([{ id: userId, approved: false }]);
          
          if (insertError) {
            console.error('Error creating user record:', insertError);
          }
          setIsApproved(false);
        }
      } else {
        setIsApproved(data?.approved ?? false);
      }
    } catch (error) {
      console.error('Error in approval check:', error);
      setIsApproved(false);
    } finally {
      setCheckingApproval(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setIsApproved(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading || checkingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // If user is logged in
  if (user) {
    // If approved, show the app
    if (isApproved) {
      return <AppLayout onLogout={handleLogout} />;
    }
    
    // If not approved, show pending message
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">efforts</h1>
          <div className="p-6 bg-gray-50 rounded-lg space-y-3">
            <h2 className="text-xl font-semibold">Account Pending Approval</h2>
            <p className="text-gray-600">
              Thank you for registering! Your account is pending approval. 
              You'll be notified once your access has been granted.
            </p>
            <p className="text-sm text-gray-500">
              Logged in as: {user.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-900 underline text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
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