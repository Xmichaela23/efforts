import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, ChevronRight, Clock } from 'lucide-react';

interface TodaysEffortProps {
  onAddEffort: () => void;
  onViewCompleted: () => void;
  onEditEffort?: (workout: any) => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ onAddEffort, onViewCompleted, onEditEffort }) => {
  const { useImperial } = useAppContext();
  const [todaysWorkout, setTodaysWorkout] = useState<any>(null);
  const [showIntervals, setShowIntervals] = useState(false);
  
  // Helper function for reliable local date formatting
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getLocalDateString();

  // FIXED: Complete function to load today's workout
  const loadTodaysWorkout = () => {
    try {
      const today = getLocalDateString();
      console.log('TodaysEffort: Loading for date:', today); // Debug log
      
      // FIXED: Check date-specific storage first (primary source)
      const dateKey = `workout_${today}`;
      const dateWorkouts = JSON.parse(localStorage.getItem(dateKey) || '[]');
      console.log('TodaysEffort: Date storage:', dateWorkouts); // Debug log
      
      if (dateWorkouts.length > 0) {
        const todayWorkout = dateWorkouts[0]; // Take first workout for today
        console.log('TodaysEffort: Found in date storage:', todayWorkout);
        setTodaysWorkout(todayWorkout);
        return;
      }
      
      // FIXED: Fallback to main workouts array
      const savedWorkouts = JSON.parse(localStorage.getItem('workouts') || '[]');
      const todayWorkout = savedWorkouts.find((w: any) => w.date === today);
      console.log('TodaysEffort: Found in main storage:', todayWorkout);
      
      setTodaysWorkout(todayWorkout || null);