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
        console.log('🔍 AuthWrapper: Starting user check...');
        const { data: { user } } = await supabase.auth.getUser();
        console.log('🔍 AuthWrapper: User found:', user?.email || 'No user');
        
        if (user) {
          setUser(user);
          // Check approval status AFTER setting user
          await checkApprovalStatus(user.id);
        } else {
          setUser(null);
          setIsApproved(null);
        }
      } catch (error) {
        console.error('❌ Error checking user:', error);
      } finally {
        console.log('🔍 AuthWrapper: Setting loading to false');
        setLoading(false);
      }
    };

    checkUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email);
        
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
    console.log('🔐 Checking approval for userId:', userId);
    setCheckingApproval(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('approved')
        .eq('id', userId)
        .single();

      console.log('🔐 Approval query result:', { data, error });

      if (error) {
        console.error('❌ Error checking approval status:', error);
        // If no user record exists yet, create one (unapproved by default)
        if (error.code === 'PGRST116') {
          console.log('🔐 Creating new user record...');
          const { error: insertError } = await supabase
            .from('users')
            .insert([{ id: userId, approved: false }]);
          
          if (insertError) {
            console.error('❌ Error creating user record:', insertError);
          }
          setIsApproved(false);
        }
      } else {
        const approvalStatus = data?.approved ?? false;
        console.log('🔐 User approval status:', approvalStatus);
        setIsApproved(approvalStatus);
      }
    } catch (error) {
      console.error('❌ Error in approval check:', error);
      setIsApproved(false);
    } finally {
      console.log('🔐 Setting checkingApproval to false');
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

  console.log('🎨 Render state:', { 
    loading, 
    checkingApproval, 
    user: user?.email, 
    isApproved 
  });

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
      console.log('✅ User approved, showing app');
      return <AppLayout onLogout={handleLogout} />;
    }
    
    // If not approved, show pending message
    console.log('⏳ User not approved, showing pending message');
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
  console.log('🔒 No user, showing login');
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