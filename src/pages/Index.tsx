import React from 'react';
import AuthWrapper from '@/components/AuthWrapper';
import { AppProvider } from '@/contexts/AppContext';

const Index: React.FC = () => {
  return (
    <AppProvider>
      <AuthWrapper />
    </AppProvider>
  );
};

export default Index;