import React from 'react';
import SimplePlanBuilder from './SimplePlanBuilder';

export default function PlanBuilder() {
  console.log('🎯 PlanBuilder component rendering');

  return (
    <div className="w-full">
      <SimplePlanBuilder />
    </div>
  );
}