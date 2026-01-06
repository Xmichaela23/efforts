import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch, Menu, User, Upload, Download, Link, Package, Settings, RefreshCw, Calendar } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import StravaPreview from '@/components/StravaPreview';
import GarminPreview from '@/components/GarminPreview';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SPORT_COLORS } from '@/lib/context-utils';
import { supabase } from '@/lib/supabase';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

interface TrainingBaselinesProps {
onClose: () => void;
onOpenBaselineTest?: (testName: string) => void;
}

interface BaselineData {
  // Personal details
birthday?: string;
height?: number;
weight?: number;
gender?: 'male' | 'female' | 'prefer_not_to_say';
units?: 'metric' | 'imperial';

  // Disciplines
age: number;
disciplines: string[];

  // Performance numbers (simplified - only what's needed)
performanceNumbers: {
    // Running
    fiveK?: string;
    easyPace?: string;
  // Cycling
  ftp?: number;
  // Swimming
  swimPace100?: string;
      // Strength
    squat?: number;
    deadlift?: number;
    bench?: number;
    overheadPress1RM?: number;
};

  // Equipment (only for swimming and strength)
equipment: {
  swimming?: string[];
  strength?: string[];
};

  // Keep these for backwards compatibility but don't collect them
  disciplineFitness: Record<string, string>;
  benchmarks: Record<string, string>;
  injuryHistory: string;
  injuryRegions: string[];
  trainingBackground: string;
}

export default function TrainingBaselines({ onClose, onOpenBaselineTest }: TrainingBaselinesProps) {
const { saveUserBaselines, loadUserBaselines } = useAppContext();
const navigate = useNavigate();
const { addPlannedWorkout } = usePlannedWorkouts() as any;

// FTP Test workout template - let user pick date
const [showFtpDatePicker, setShowFtpDatePicker] = useState(false);
const [ftpTestDate, setFtpTestDate] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() + 2); // Default to 2 days out
  return d.toISOString().split('T')[0];
});

const scheduleFtpTest = async () => {
  try {
    await addPlannedWorkout({
      name: 'FTP Test - 20 Min Protocol',
      type: 'ride',
      date: ftpTestDate,
      description: 'Standard 20-minute FTP test. PREPARATION: No hard training 48 hours prior. Indoor trainer recommended. WARMUP: 10min easy, 3x3min progressive build, 5min recovery. TEST: 20-min maximal sustainable effort. START CONSERVATIVELY, settle into rhythm, empty tank in final 2min. RESULT: Average power × 0.95 = your FTP.',
      duration: 60,
      steps_preset: [
        'bike_warmup_10',
        'bike_vo2_3x3min_R3min',
        'bike_recovery_5min_Z1',
        'bike_ftp_test_20min',
        'cooldown_bike_easy_10min'
      ],
      workout_status: 'planned',
      tags: ['ftp_test', 'baseline_establishment', 'key_workout']
    });
    
    setShowFtpDatePicker(false);
    const displayDate = new Date(ftpTestDate + 'T12:00:00').toLocaleDateString();
    alert(`FTP Test scheduled for ${displayDate}. Rest up - no hard training before then!`);
  } catch (error) {
    console.error('Error scheduling FTP test:', error);
    alert('Error scheduling FTP test. Please try again.');
  }
};

const [data, setData] = useState<BaselineData>({
  age: 0,
  disciplines: [],
    performanceNumbers: {},
    equipment: {},
    units: 'imperial',
    // Backwards compatibility defaults
  disciplineFitness: {},
  benchmarks: {},
  injuryHistory: '',
  injuryRegions: [],
  trainingBackground: '',
});

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState('');
const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'baselines' | 'data-import'>('baselines');
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [originalData, setOriginalData] = useState<string>(''); // JSON string for comparison

  // Learned fitness profile state
  const [learnedFitness, setLearnedFitness] = useState<any>(null);
  const [learningProfile, setLearningProfile] = useState(false);

  // Check if data has changed from original
  const hasChanges = JSON.stringify(data) !== originalData;

  // Strava connection state
const [stravaConnected, setStravaConnected] = useState(false);
const [stravaMessage, setStravaMessage] = useState('');
const [accessToken, setAccessToken] = useState<string | null>(null);

  // Garmin connection state
const [garminConnected, setGarminConnected] = useState(false);
const [garminMessage, setGarminMessage] = useState('');
const [garminAccessToken, setGarminAccessToken] = useState<string | null>(null);

  // Load existing baselines on mount
  useEffect(() => {
    loadBaselines();
  }, []);

  // Reload baselines when component becomes visible again (e.g., after saving from baseline test)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBaselines();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for custom event to reload after baseline test save
    const handleBaselineSaved = () => {
      loadBaselines();
    };
    window.addEventListener('baseline:saved', handleBaselineSaved);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('baseline:saved', handleBaselineSaved);
    };
  }, []);

  // Auto-open leftmost sport with data, or Run as default
useEffect(() => {
    if (!loading && activeSport === null) {
      const sportOrder = ['running', 'cycling', 'swimming', 'strength'];
      const firstWithData = sportOrder.find(s => data.disciplines.includes(s));
      setActiveSport(firstWithData || 'running');
    }
  }, [loading, data.disciplines]);

  // Check for existing Strava token
useEffect(() => {
  const existingToken = localStorage.getItem('strava_access_token');
  if (existingToken) {
    setAccessToken(existingToken);
    setStravaConnected(true);
  }
}, []);

  // Check for existing Garmin token
useEffect(() => {
  const existingToken = localStorage.getItem('garmin_access_token');
  if (existingToken) {
    setGarminAccessToken(existingToken);
    setGarminConnected(true);
  }
}, []);

  // Listen for OAuth callback messages
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'STRAVA_AUTH_SUCCESS') {
      const { access_token } = event.data.data;
      setAccessToken(access_token);
      setStravaConnected(true);
      localStorage.setItem('strava_access_token', access_token);
      setStravaMessage('Successfully connected to Strava!');
    } else if (event.data.type === 'STRAVA_AUTH_ERROR') {
      setStravaMessage(`Error: ${event.data.error}`);
    } else if (event.data.type === 'GARMIN_AUTH_SUCCESS') {
      const { code } = event.data;
      handleGarminOAuthSuccess(code);
    } else if (event.data.type === 'GARMIN_AUTH_ERROR') {
      setGarminMessage(`Error: ${event.data.error}`);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

const loadBaselines = async () => {
  try {
    setLoading(true);
    const baselines = await loadUserBaselines();
    if (baselines) {
      setData(baselines as BaselineData);
      setOriginalData(JSON.stringify(baselines)); // Store original for comparison
      setLastUpdated(baselines.lastUpdated || null);
      // Load learned fitness if available
      if ((baselines as any).learned_fitness) {
        setLearnedFitness((baselines as any).learned_fitness);
      }
    } else {
      // No saved data yet - set original to current defaults
      setOriginalData(JSON.stringify(data));
    }
    setLoading(false);
  } catch (error) {
    console.error('Error loading baselines:', error);
    setLoading(false);
  }
};

// Fetch learned fitness profile from edge function
const refreshLearnedProfile = async () => {
  try {
    setLearningProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    const { data: result, error } = await supabase.functions.invoke('learn-fitness-profile', {
      body: { user_id: user.id }
    });

    if (error) {
      console.error('Error learning profile:', error);
      return;
    }

    setLearnedFitness(result);
    console.log('Learned fitness profile:', result);
  } catch (error) {
    console.error('Error refreshing learned profile:', error);
  } finally {
    setLearningProfile(false);
  }
};

// Format pace from seconds per km to mm:ss/mi
const formatPace = (secPerKm: number | undefined): string => {
  if (!secPerKm) return '--';
  const secPerMile = secPerKm * 1.60934;
  const mins = Math.floor(secPerMile / 60);
  const secs = Math.round(secPerMile % 60);
  return `${mins}:${String(secs).padStart(2, '0')}/mi`;
};

// Get confidence dots
const getConfidenceDots = (confidence: string | undefined): string => {
  switch (confidence) {
    case 'high': return '●●●';
    case 'medium': return '●●○';
    case 'low': return '●○○';
    default: return '○○○';
  }
};

// Calculate age from birthday
const calculateAge = (birthday: string | undefined): number | null => {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 && age < 120 ? age : null;
};

// Calculate age-based HR estimates
const getAgeBasedHREstimates = (birthday: string | undefined) => {
  const age = calculateAge(birthday);
  if (!age) return null;
  
  const maxHR = 220 - age;
  const thresholdHR = Math.round(maxHR * 0.88);
  const easyHR = Math.round(maxHR * 0.70);
  
  return {
    maxHR,
    thresholdHR,
    easyHR,
    age
  };
};

const handleSave = async () => {
  try {
    setSaving(true);
    setSaveMessage('');
    await saveUserBaselines(data as any);
    setOriginalData(JSON.stringify(data)); // Update original after save
    setSaveMessage('Saved!');
    setLastUpdated(new Date().toISOString());
    setTimeout(() => setSaveMessage(''), 2000);
  } catch (error) {
    console.error('Error saving baselines:', error);
    setSaveMessage('Error saving. Please try again.');
  } finally {
    setSaving(false);
  }
};

  // Strava connection
const connectStrava = () => {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  const redirectUri = 'https://efforts.work/strava/callback';
  const scope = 'read,activity:read_all';
  
  if (!clientId || clientId === 'undefined') {
      setStravaMessage('Error: Strava client ID not configured.');
    return;
  }
  
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    const popup = window.open(authUrl, 'strava-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');

  if (!popup) {
    setStravaMessage('Popup was blocked. Please allow popups and try again.');
  }
};

const disconnectStrava = () => {
  setStravaConnected(false);
  setAccessToken(null);
  localStorage.removeItem('strava_access_token');
  setStravaMessage('Disconnected from Strava');
};

  // PKCE helper
const generatePKCE = async () => {
  const codeVerifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { codeVerifier, codeChallenge };
};

  // Garmin OAuth success handler
const handleGarminOAuthSuccess = async (code: string) => {
  try {
    const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User must be logged in');
    }

    const tokenResponse = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/bright-service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        code: code,
        codeVerifier: codeVerifier,
        redirectUri: 'https://efforts.work/auth/garmin/callback'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
        console.error('Garmin token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    setGarminAccessToken(tokenData.access_token);
    setGarminConnected(true);
    localStorage.setItem('garmin_access_token', tokenData.access_token);
    setGarminMessage('Successfully connected to Garmin!');
    sessionStorage.removeItem('garmin_code_verifier');
  } catch (error) {
      console.error('Garmin OAuth error:', error);
    setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    sessionStorage.removeItem('garmin_code_verifier');
  }
};

  // Garmin connection
const connectGarmin = async () => {
    localStorage.removeItem('garmin_access_token');
  setGarminMessage('Connecting to Garmin...');
  
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    sessionStorage.setItem('garmin_code_verifier', codeVerifier);
    
    const authUrl = 'https://connect.garmin.com/oauth2Confirm';
    const clientId = (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '';
    const redirectUri = 'https://efforts.work/auth/garmin/callback';
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      state: Math.random().toString(36).substring(2, 15)
    });
    
    const fullAuthUrl = `${authUrl}?${params.toString()}`;
    const popup = window.open(fullAuthUrl, 'garmin-auth', 'width=600,height=600');
    
    if (!popup) {
      setGarminMessage('Popup was blocked. Please allow popups for this site and try again.');
      sessionStorage.removeItem('garmin_code_verifier');
    }
  } catch (error) {
    setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    sessionStorage.removeItem('garmin_code_verifier');
  }
};

const disconnectGarmin = () => {
  setGarminConnected(false);
  setGarminAccessToken(null);
  localStorage.removeItem('garmin_access_token');
  setGarminMessage('Disconnected from Garmin');
};

  // Discipline options with colors
const disciplineOptions = [
    { id: 'running', name: 'Run', icon: Activity, color: SPORT_COLORS.run },
    { id: 'cycling', name: 'Cycle', icon: Bike, color: SPORT_COLORS.cycling },
    { id: 'swimming', name: 'Swim', icon: Waves, color: SPORT_COLORS.swim },
    { id: 'strength', name: 'Strength', icon: Dumbbell, color: SPORT_COLORS.strength }
  ];
  
  // Get active sport color
  const getActiveSportColor = () => {
    const active = disciplineOptions.find(d => d.id === activeSport);
    return active?.color || '#ffffff';
  };

  const toggleDiscipline = (disciplineId: string) => {
    // If clicking the already active sport, close it
    if (activeSport === disciplineId) {
      setActiveSport(null);
    } else {
      // Switch to the new sport and ensure it's in disciplines
      setActiveSport(disciplineId);
      setData(prev => ({
        ...prev,
        disciplines: prev.disciplines.includes(disciplineId)
          ? prev.disciplines
          : [...prev.disciplines, disciplineId]
      }));
    }
  };

  // Equipment options
  const swimmingEquipmentOptions = [
    "Pool access",
    "Open water access",
    "Paddles",
    "Pull buoy",
    "Kickboard",
    "Fins",
    "Snorkel"
  ];

  // Home gym equipment options (only shown when "Home gym" is selected)
  const homeGymEquipmentOptions = [
    "Barbell + plates",
    "Dumbbells",
    "Squat rack / Power cage",
    "Bench (flat/adjustable)",
    "Pull-up bar",
    "Kettlebells",
    "Cable machine",
    "Resistance bands"
  ];
  
  // Helper to check if user has commercial gym access
  const hasCommercialGym = (data.equipment.strength || []).includes('Commercial gym');

const toggleEquipment = (disciplineId: string, option: string) => {
  const currentItems = data.equipment[disciplineId as keyof typeof data.equipment] || [];
  const updatedItems = currentItems.includes(option)
    ? currentItems.filter(item => item !== option)
    : [...currentItems, option];
  
  setData(prev => ({
    ...prev,
    equipment: {
      ...prev.equipment,
      [disciplineId]: updatedItems
    }
  }));
};

const DisciplineIcon = ({ discipline }: { discipline: string }) => {
  const option = disciplineOptions.find(d => d.id === discipline);
  if (!option) return null;
  const Icon = option.icon;
  return <Icon className="h-5 w-5" />;
};

return (
  <div className="mobile-app-container">
    <header className="mobile-header">
      <div className="w-full">
        <div className="flex items-center justify-between h-16 w-full px-4">
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-white/80 hover:text-white transition-colors p-2">
                  <Menu className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/')}>
                  <Activity className="mr-2 h-4 w-4" />
                  Training Baselines
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/connections')}>
                  <Link className="mr-2 h-4 w-4" />
                  Connections
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Package className="mr-2 h-4 w-4" />
                  Gear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/')}>
                  <Download className="mr-2 h-4 w-4" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Upload className="mr-2 h-4 w-4" />
                  Export Data
                </DropdownMenuItem>
                <DropdownMenuItem>
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/')}>
                  Sign Out
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/plans/admin')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Admin – Add template (JSON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="text-3xl font-extralight tracking-widest text-white">efforts</h1>
          </div>
        </div>
        <div className="px-4 pb-2">
          <h2 className="text-2xl font-bold text-white">Training Baselines</h2>
        </div>
      </div>
    </header>

      <main className="mobile-main-content">
        <div className="max-w-2xl mx-auto px-4 pb-6">
          {/* Description with proper spacing */}
          <div className="text-center mb-6 mt-12">
            <p className="text-white/50 text-sm">Your performance data for personalized training plans</p>
            {lastUpdated && (
              <p className="text-xs text-white/40 mt-2">
                Last updated: {new Date(lastUpdated).toLocaleDateString()}
              </p>
            )}
          </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-white/60">Loading your baselines...</p>
          </div>
        ) : (
          <>

              {/* Tabs - Data Import hidden for now */}
              {/* <div className="flex mb-6">
                <button
                  onClick={() => setActiveTab('baselines')}
                  className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                    activeTab === 'baselines'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Baselines
                </button>
                <button
                  onClick={() => setActiveTab('data-import')}
                  className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                    activeTab === 'data-import'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Data Import
                </button>
              </div> */}

              {activeTab === 'baselines' ? (
                <div className="space-y-5">
                  {/* Basic Information */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                    <h2 className="text-sm font-semibold text-white/90 mb-3 tracking-wide">Basic Information</h2>
                    
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60 whitespace-nowrap">Birthday</label>
                        <input
                          type="date"
                          value={data.birthday || ''}
                          onChange={(e) => setData(prev => ({ ...prev, birthday: e.target.value }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Gender</label>
                        <select
                          value={data.gender || ''}
                          onChange={(e) => setData(prev => ({ ...prev, gender: e.target.value as any }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="" className="bg-[#1a1a1a]">-</option>
                          <option value="male" className="bg-[#1a1a1a]">M</option>
                          <option value="female" className="bg-[#1a1a1a]">F</option>
                          <option value="prefer_not_to_say" className="bg-[#1a1a1a]">-</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Units</label>
                        <select
                          value={data.units || 'imperial'}
                          onChange={(e) => setData(prev => ({ ...prev, units: e.target.value as any }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="imperial" className="bg-[#1a1a1a]">lbs</option>
                          <option value="metric" className="bg-[#1a1a1a]">kg</option>
                        </select>
                        </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Ht</label>
                        <input
                          type="number"
                          value={data.height || ''}
                          onChange={(e) => setData(prev => ({ ...prev, height: parseInt(e.target.value) || undefined }))}
                          placeholder="70"
                          className="w-12 h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <span className="text-xs text-white/60">{data.units === 'metric' ? 'cm' : 'in'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Wt</label>
                        <input
                          type="number"
                          value={data.weight || ''}
                          onChange={(e) => setData(prev => ({ ...prev, weight: parseInt(e.target.value) || undefined }))}
                          placeholder="160"
                          className="w-14 h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <span className="text-xs text-white/60">{data.units === 'metric' ? 'kg' : 'lb'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Disciplines */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                    <div className="mb-3">
                      <h2 className="text-sm font-semibold text-white/90 tracking-wide">Your Sports</h2>
                      <p className="text-xs text-white/50 mt-0.5">Tap to add performance baselines</p>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {disciplineOptions.map((discipline) => {
                        const Icon = discipline.icon;
                        const isActive = activeSport === discipline.id;
                        const hasData = data.disciplines.includes(discipline.id);
                        return (
                          <button
                            key={discipline.id}
                            onClick={() => toggleDiscipline(discipline.id)}
                            className={`relative flex items-center justify-center gap-1.5 py-2.5 rounded-full border text-center transition-all duration-300 backdrop-blur-lg ${
                              isActive
                                ? 'border-transparent'
                                : hasData
                                  ? 'border-white/20 bg-white/[0.06] hover:bg-white/[0.10]'
                                  : 'border-white/15 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
                            }`}
                            style={{ 
                              fontFamily: 'Inter, sans-serif',
                              ...(isActive ? {
                                backgroundColor: `${discipline.color}20`,
                                borderColor: discipline.color,
                                borderWidth: '1.5px',
                                boxShadow: `0 0 20px ${discipline.color}30, inset 0 0 20px ${discipline.color}10`
                              } : {})
                            }}
                          >
                            {!isActive && hasData && (
                              <span 
                                className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold"
                                style={{ backgroundColor: discipline.color, color: '#000' }}
                              >
                                ✓
                              </span>
                            )}
                            <Icon 
                              className="h-4 w-4 transition-colors duration-300" 
                              style={{ color: isActive || hasData ? discipline.color : 'rgba(255,255,255,0.5)' }}
                            />
                            <span 
                              className="text-xs font-medium transition-colors duration-300"
                              style={{ color: isActive ? discipline.color : hasData ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}
                            >
                              {discipline.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-discipline performance numbers */}
                  {activeSport && (
                    <div 
                      className="p-4 rounded-2xl backdrop-blur-xl border transition-all duration-300"
                      style={{
                        backgroundColor: `${getActiveSportColor()}08`,
                        borderColor: `${getActiveSportColor()}30`,
                        boxShadow: `0 4px 30px ${getActiveSportColor()}10`
                      }}
                    >
                      <h2 
                        className="text-sm font-semibold mb-4 tracking-wide"
                        style={{ color: getActiveSportColor() }}
                      >
                        Performance Numbers
                      </h2>

                      {/* Running */}
                      {activeSport === 'running' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4" style={{ color: SPORT_COLORS.run }} />
                            <h3 className="text-sm font-medium text-white/90">Running</h3>
                          </div>
                          <div className="flex flex-wrap gap-6 mt-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs text-white/50 font-medium">5K Time</label>
                              <input
                                type="text"
                                value={data.performanceNumbers?.fiveK || ''}
                                onChange={(e) => setData(prev => ({
                                  ...prev,
                                  performanceNumbers: {
                                    ...prev.performanceNumbers,
                                    fiveK: e.target.value
                                  }
                                }))}
                                placeholder="25:00"
                                className="w-24 h-12 px-3 text-lg font-medium bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-teal-500/50 text-center"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs text-white/50 font-medium">Easy Pace</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={data.performanceNumbers?.easyPace || ''}
                                  onChange={(e) => setData(prev => ({
                                    ...prev,
                                    performanceNumbers: {
                                      ...prev.performanceNumbers,
                                      easyPace: e.target.value
                                    }
                                  }))}
                                  placeholder="9:30"
                                  className="w-24 h-12 px-3 text-lg font-medium bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-teal-500/50 text-center"
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                />
                                <span className="text-sm text-white/50">/mi</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cycling */}
                      {activeSport === 'cycling' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Bike className="h-4 w-4" style={{ color: SPORT_COLORS.cycling }} />
                            <h3 className="text-sm font-medium text-white/90">Cycling</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-white/60">FTP</label>
                                      <input
                              type="number"
                              value={data.performanceNumbers?.ftp || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                  ftp: parseInt(e.target.value) || undefined
                                          }
                                        }))}
                              placeholder="250"
                              className="w-20 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                            <span className="text-xs text-white/60">watts</span>
                                    </div>
                                  </div>
                                )}

                      {/* Swimming */}
                      {activeSport === 'swimming' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Waves className="h-4 w-4" style={{ color: SPORT_COLORS.swim }} />
                            <h3 className="text-sm font-medium text-white/90">Swimming</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-white/60">100yd Pace</label>
                                      <input
                                        type="text"
                                        value={data.performanceNumbers?.swimPace100 || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            swimPace100: e.target.value
                                          }
                                        }))}
                              placeholder="1:45"
                              className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                            <span className="text-xs text-white/60">mm:ss</span>
                                    </div>
                          <div className="space-y-2">
                            <label className="text-xs text-white/60">Equipment</label>
                            <div className="flex flex-wrap gap-2">
                              {swimmingEquipmentOptions.map((option) => {
                                const isSelected = (data.equipment.swimming || []).includes(option);
                                return (
                                  <button
                                    key={option}
                                    onClick={() => toggleEquipment('swimming', option)}
                                    className={`px-2 py-1 text-xs rounded-full transition-all duration-300 ${
                                      isSelected
                                        ? 'bg-white/[0.12] border border-white/50 text-white'
                                        : 'bg-white/[0.08] border border-white/25 text-white/80 hover:bg-white/[0.12] hover:border-white/35 hover:text-white'
                                    }`}
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                                    </div>
                                  </div>
                                )}

                      {/* Strength */}
                      {activeSport === 'strength' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Dumbbell className="h-4 w-4" style={{ color: SPORT_COLORS.strength }} />
                            <h3 className="text-sm font-medium text-white/90">Strength</h3>
                            <span className="text-xs text-white/50">1RM ({data.units === 'metric' ? 'kg' : 'lbs'})</span>
                          </div>
                          
                          {/* Baseline Test Note */}
                          <div 
                            className="p-3 rounded-xl backdrop-blur-lg border"
                            style={{ 
                              backgroundColor: `${SPORT_COLORS.strength}10`,
                              borderColor: `${SPORT_COLORS.strength}30`
                            }}
                          >
                            <p className="text-xs text-white/90 mb-2">
                              Don't know your numbers? Or want to retest?
                            </p>
                            <p className="text-xs text-white/70 mb-2">
                              Log a{' '}
                              <button
                                onClick={() => {
                                  if (onOpenBaselineTest) {
                                    onOpenBaselineTest('Baseline Test: Lower Body');
                                  }
                                }}
                                className="underline font-medium hover:opacity-80"
                                style={{ color: SPORT_COLORS.strength }}
                              >
                                Baseline Test: Lower Body
                              </button>
                              {' '}or{' '}
                              <button
                                onClick={() => {
                                  if (onOpenBaselineTest) {
                                    onOpenBaselineTest('Baseline Test: Upper Body');
                                  }
                                }}
                                className="underline font-medium hover:opacity-80"
                                style={{ color: SPORT_COLORS.strength }}
                              >
                                Upper Body
                              </button>
                              {' '}workout. We'll guide you through warmups and calculate your 1RM automatically.
                            </p>
                            <p className="text-xs text-white/60 italic">
                              Tip: Retest every 8-12 weeks to track progress.
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-white/60">Squat</label>
                                      <input
                                        type="number"
                                        value={data.performanceNumbers?.squat || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            squat: parseInt(e.target.value) || undefined
                                          }
                                        }))}
                                placeholder="225"
                                className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-white/60">DL</label>
                                      <input
                                        type="number"
                                        value={data.performanceNumbers?.deadlift || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            deadlift: parseInt(e.target.value) || undefined
                                          }
                                        }))}
                                placeholder="315"
                                className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-white/60">Bench</label>
                                      <input
                                        type="number"
                                        value={data.performanceNumbers?.bench || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            bench: parseInt(e.target.value) || undefined
                                          }
                                        }))}
                                placeholder="185"
                                className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-white/60">OHP</label>
                                      <input
                                        type="number"
                                        value={data.performanceNumbers?.overheadPress1RM || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            overheadPress1RM: parseInt(e.target.value) || undefined
                                          }
                                        }))}
                                placeholder="135"
                                className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                                    </div>
                                  </div>
                          <div className="space-y-4 mt-4 pt-4 border-t border-white/10">
                            <h4 className="text-sm font-medium text-white/80">Equipment Access</h4>
                            
                            {/* Commercial vs Home gym toggle */}
                            <div className="flex gap-3">
                              <button
                                onClick={() => {
                                  // Set to commercial gym, clear individual equipment
                                  setData(prev => ({
                                    ...prev,
                                    equipment: { ...prev.equipment, strength: ['Commercial gym'] }
                                  }));
                                }}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-xl border-2 transition-all duration-300 ${
                                  hasCommercialGym
                                    ? 'text-white'
                                    : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                }`}
                                style={{ 
                                  fontFamily: 'Inter, sans-serif',
                                  ...(hasCommercialGym ? {
                                    borderColor: SPORT_COLORS.strength,
                                    backgroundColor: `${SPORT_COLORS.strength}15`
                                  } : {})
                                }}
                              >
                                <span 
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                  style={{ 
                                    borderColor: hasCommercialGym ? SPORT_COLORS.strength : 'rgba(255,255,255,0.3)',
                                    backgroundColor: hasCommercialGym ? SPORT_COLORS.strength : 'transparent'
                                  }}
                                >
                                  {hasCommercialGym && <span className="text-[10px] text-black font-bold">✓</span>}
                                </span>
                                Commercial gym
                              </button>
                              <button
                                onClick={() => {
                                  // Switch to home gym - only clear if coming FROM commercial gym
                                  if (hasCommercialGym) {
                                    setData(prev => ({
                                      ...prev,
                                      equipment: { ...prev.equipment, strength: [] }
                                    }));
                                  }
                                  // If already home gym, do nothing - keep existing equipment
                                }}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-xl border-2 transition-all duration-300 ${
                                  !hasCommercialGym
                                    ? 'text-white'
                                    : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                }`}
                                style={{ 
                                  fontFamily: 'Inter, sans-serif',
                                  ...(!hasCommercialGym ? {
                                    borderColor: SPORT_COLORS.strength,
                                    backgroundColor: `${SPORT_COLORS.strength}15`
                                  } : {})
                                }}
                              >
                                <span 
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                  style={{ 
                                    borderColor: !hasCommercialGym ? SPORT_COLORS.strength : 'rgba(255,255,255,0.3)',
                                    backgroundColor: !hasCommercialGym ? SPORT_COLORS.strength : 'transparent'
                                  }}
                                >
                                  {!hasCommercialGym && <span className="text-[10px] text-black font-bold">✓</span>}
                                </span>
                                Home gym
                              </button>
                            </div>

                            {/* Home gym equipment details - only show if not commercial */}
                            {!hasCommercialGym && (
                              <div className="space-y-3">
                                <p className="text-xs text-white/50 font-medium">Select your equipment:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {homeGymEquipmentOptions.map((option) => {
                                    const isSelected = (data.equipment.strength || []).includes(option);
                                    return (
                                      <button
                                        key={option}
                                        onClick={() => toggleEquipment('strength', option)}
                                        className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-all duration-300 ${
                                          isSelected
                                            ? 'text-white'
                                            : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                        }`}
                                        style={{ 
                                          fontFamily: 'Inter, sans-serif',
                                          ...(isSelected ? {
                                            borderColor: `${SPORT_COLORS.strength}80`,
                                            backgroundColor: `${SPORT_COLORS.strength}15`
                                          } : {})
                                        }}
                                      >
                                        <span 
                                          className="w-3.5 h-3.5 rounded flex items-center justify-center border"
                                          style={{ 
                                            borderColor: isSelected ? SPORT_COLORS.strength : 'rgba(255,255,255,0.25)',
                                            backgroundColor: isSelected ? SPORT_COLORS.strength : 'transparent'
                                          }}
                                        >
                                          {isSelected && <span className="text-[8px] text-black font-bold">✓</span>}
                                        </span>
                                        {option}
                        </button>
                                    );
                                  })}
                    </div>
                  </div>
                            )}
                </div>
                                    </div>
                                  )}
                                    </div>
                                  )}

                  {/* Heart Rate Zones - Auto-learned */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] mt-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-sm font-semibold text-white/90 tracking-wide">Heart Rate Zones</h2>
                        <p className="text-xs text-white/50 mt-0.5">Auto-learned from your training</p>
                      </div>
                      <button
                        onClick={refreshLearnedProfile}
                        disabled={learningProfile}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-white/[0.08] border border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${learningProfile ? 'animate-spin' : ''}`} />
                        {learningProfile ? 'Learning...' : 'Refresh'}
                      </button>
                    </div>

                    {!learnedFitness || learnedFitness.learning_status === 'insufficient_data' ? (
                      (() => {
                        const ageEstimates = getAgeBasedHREstimates(data.birthday);
                        
                        if (!ageEstimates) {
                          return (
                            <div className="text-center py-6">
                              <p className="text-sm text-white/60 mb-2">Add your birthday above to see estimated zones</p>
                              <p className="text-xs text-white/40">
                                Or keep training with heart rate and we'll learn your zones automatically.
                              </p>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="space-y-4">
                            {/* Warning banner about estimates */}
                            <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                              <p className="text-xs text-yellow-400/90 font-medium mb-1">
                                These are rough estimates based on age ({ageEstimates.age})
                              </p>
                              <p className="text-xs text-yellow-400/60">
                                Individual max HR can vary ±15-20 bpm from the 220-age formula. 
                                Analyze your workouts to get accurate values.
                              </p>
                            </div>
                            
                            {/* Age-based estimates */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-yellow-500/20">
                                <div>
                                  <div className="text-xs text-white/50">Threshold HR</div>
                                  <div className="text-sm font-medium text-white/70">{ageEstimates.thresholdHR} bpm</div>
                                </div>
                                <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">EST</div>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-yellow-500/20">
                                <div>
                                  <div className="text-xs text-white/50">Easy HR</div>
                                  <div className="text-sm font-medium text-white/70">{ageEstimates.easyHR} bpm</div>
                                </div>
                                <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">EST</div>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-yellow-500/20">
                                <div>
                                  <div className="text-xs text-white/50">Max HR</div>
                                  <div className="text-sm font-medium text-white/70">{ageEstimates.maxHR} bpm</div>
                                </div>
                                <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">EST</div>
                              </div>
                            </div>

                            {/* CTA to analyze */}
                            <div className="pt-3 border-t border-white/10 text-center">
                              <button
                                onClick={refreshLearnedProfile}
                                disabled={learningProfile}
                                className="px-5 py-2.5 text-sm font-medium rounded-full bg-teal-500/20 border border-teal-500/50 text-teal-400 hover:bg-teal-500/30 transition-all disabled:opacity-50"
                              >
                                {learningProfile ? 'Analyzing...' : 'Analyze My Workouts'}
                              </button>
                              <p className="text-xs text-white/50 mt-3">
                                Get accurate zones based on your actual training data
                              </p>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-4">
                        {/* Running HR Zones */}
                        {(learnedFitness.run_threshold_hr || learnedFitness.run_easy_hr) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Activity className="h-4 w-4" style={{ color: SPORT_COLORS.run }} />
                              <span className="text-xs font-medium text-white/80">Running</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {learnedFitness.run_threshold_hr && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Threshold HR</div>
                                    <div className="text-sm font-medium text-white">{learnedFitness.run_threshold_hr.value} bpm</div>
                                  </div>
                                  <div className="text-xs text-white/40" title={`${learnedFitness.run_threshold_hr.sample_count} samples`}>
                                    {getConfidenceDots(learnedFitness.run_threshold_hr.confidence)}
                                  </div>
                                </div>
                              )}
                              {learnedFitness.run_easy_hr && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Easy HR</div>
                                    <div className="text-sm font-medium text-white">{learnedFitness.run_easy_hr.value} bpm</div>
                                  </div>
                                  <div className="text-xs text-white/40" title={`${learnedFitness.run_easy_hr.sample_count} samples`}>
                                    {getConfidenceDots(learnedFitness.run_easy_hr.confidence)}
                                  </div>
                                </div>
                              )}
                              {learnedFitness.run_threshold_pace_sec_per_km && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Threshold Pace</div>
                                    <div className="text-sm font-medium text-white">{formatPace(learnedFitness.run_threshold_pace_sec_per_km.value)}</div>
                                  </div>
                                  <div className="text-xs text-white/40">
                                    {getConfidenceDots(learnedFitness.run_threshold_pace_sec_per_km.confidence)}
                                  </div>
                                </div>
                              )}
                              {learnedFitness.run_max_hr_observed && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Max HR</div>
                                    <div className="text-sm font-medium text-white">{learnedFitness.run_max_hr_observed.value} bpm</div>
                                  </div>
                                  <div className="text-xs text-white/40">observed</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Cycling HR Zones */}
                        {(learnedFitness.ride_threshold_hr || learnedFitness.ride_easy_hr || learnedFitness.ride_ftp_estimated) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Bike className="h-4 w-4" style={{ color: SPORT_COLORS.cycling }} />
                              <span className="text-xs font-medium text-white/80">Cycling</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {learnedFitness.ride_threshold_hr && (
                                <div className={`px-3 py-2 rounded-lg border ${
                                  learnedFitness.ride_threshold_hr.confidence === 'low' 
                                    ? 'bg-yellow-500/5 border-yellow-500/20' 
                                    : 'bg-white/[0.04] border-white/10'
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="text-xs text-white/50">Threshold HR</div>
                                      <div className="text-sm font-medium text-white">{learnedFitness.ride_threshold_hr.value} bpm</div>
                                    </div>
                                    <div className="text-xs text-white/40">
                                      {getConfidenceDots(learnedFitness.ride_threshold_hr.confidence)}
                                    </div>
                                  </div>
                                  {learnedFitness.ride_threshold_hr.confidence === 'low' && (
                                    <div className="mt-1.5 text-[10px] text-yellow-400/80">
                                      Need more hard rides for accurate threshold
                                    </div>
                                  )}
                                </div>
                              )}
                              {learnedFitness.ride_easy_hr && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Easy HR</div>
                                    <div className="text-sm font-medium text-white">{learnedFitness.ride_easy_hr.value} bpm</div>
                                  </div>
                                  <div className="text-xs text-white/40">
                                    {getConfidenceDots(learnedFitness.ride_easy_hr.confidence)}
                                  </div>
                                </div>
                              )}
                              {learnedFitness.ride_ftp_estimated && (
                                <div className={`px-3 py-2 rounded-lg border ${
                                  learnedFitness.ride_ftp_estimated.confidence === 'low' 
                                    ? 'bg-yellow-500/5 border-yellow-500/20' 
                                    : 'bg-white/[0.04] border-white/10'
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="text-xs text-white/50">FTP</div>
                                      <div className="text-sm font-medium text-white">{learnedFitness.ride_ftp_estimated.value} W</div>
                                    </div>
                                    <div className="text-xs text-white/40">
                                      {getConfidenceDots(learnedFitness.ride_ftp_estimated.confidence)}
                                    </div>
                                  </div>
                                  <div className="mt-1.5">
                                    {!showFtpDatePicker ? (
                                      <div className={`text-[10px] ${learnedFitness.ride_ftp_estimated.confidence === 'low' ? 'text-yellow-400/80' : 'text-white/50'}`}>
                                        <button 
                                          onClick={() => setShowFtpDatePicker(true)}
                                          className="underline hover:text-white/80 inline-flex items-center gap-1"
                                        >
                                          <Calendar className="h-3 w-3" />
                                          {learnedFitness.ride_ftp_estimated.confidence === 'low' ? 'Schedule FTP Test' : 'Retest FTP'}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 mt-1">
                                        <input
                                          type="date"
                                          value={ftpTestDate}
                                          onChange={(e) => setFtpTestDate(e.target.value)}
                                          min={new Date().toISOString().split('T')[0]}
                                          className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white"
                                        />
                                        <button
                                          onClick={scheduleFtpTest}
                                          className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                                        >
                                          Add
                                        </button>
                                        <button
                                          onClick={() => setShowFtpDatePicker(false)}
                                          className="text-xs px-2 py-1 text-white/50 hover:text-white"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {learnedFitness.ride_max_hr_observed && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                  <div>
                                    <div className="text-xs text-white/50">Max HR</div>
                                    <div className="text-sm font-medium text-white">{learnedFitness.ride_max_hr_observed.value} bpm</div>
                                  </div>
                                  <div className="text-xs text-white/40">observed</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Status footer */}
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                          <div className="text-xs text-white/40">
                            {learnedFitness.learning_status === 'confident' ? 'Profile confident' : 'Still learning'} 
                            {' • '}{learnedFitness.workouts_analyzed} workouts analyzed
                          </div>
                          {learnedFitness.last_updated && (
                            <div className="text-xs text-white/30">
                              {new Date(learnedFitness.last_updated).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Data Import Tab */
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2 text-white/90">Import Training Data</h3>
                    <p className="text-sm text-white/70">Connect your fitness accounts to auto-populate baseline data</p>
                  </div>
                  
                  {/* Strava Connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-orange-500" />
                      <h4 className="font-medium text-white/90">Strava Integration</h4>
                    </div>

                    {!stravaConnected ? (
                      <button
                        onClick={connectStrava}
                        className="w-full px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 transition-colors font-medium rounded-full"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Connect with Strava
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                          <p className="text-sm text-cyan-400">✓ Connected to Strava</p>
                        </div>
                          <button
                            onClick={disconnectStrava}
                            className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 hover:bg-white/[0.12]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {stravaMessage && (
                      <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                        <p className="text-sm text-white/90">{stravaMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Strava Preview */}
                  {stravaConnected && accessToken && (
                    <StravaPreview 
                      accessToken={accessToken}
                      currentBaselines={data}
                      onDataSelected={(selectedData) => {
                        setData(prev => ({ ...prev, ...selectedData }));
                      }}
                    />
                  )}

                  {/* Garmin Connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Watch className="h-5 w-5 text-blue-500" />
                      <h4 className="font-medium text-white/90">Garmin Integration</h4>
                    </div>

                    {!garminConnected ? (
                      <button
                        onClick={connectGarmin}
                        className="w-full px-4 py-3 text-white bg-blue-500 hover:bg-blue-600 transition-colors font-medium rounded-full"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Connect with Garmin
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                          <p className="text-sm text-cyan-400">✓ Connected to Garmin</p>
                        </div>
                          <button
                            onClick={disconnectGarmin}
                            className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 hover:bg-white/[0.12]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {garminMessage && (
                      <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                        <p className="text-sm text-white/90">{garminMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Garmin Preview */}
                  {garminConnected && garminAccessToken && (
                    <GarminPreview 
                      accessToken={garminAccessToken}
                      currentBaselines={data}
                      onDataSelected={(selectedData) => {
                        setData(prev => ({ ...prev, ...selectedData }));
                      }}
                    />
                  )}
                </div>
              )}

              {/* Save Button */}
              <div className="pt-8 pb-8">
                {saveMessage && (
                  <div className={`text-center mb-4 text-sm ${
                    saveMessage.includes('Error') ? 'text-red-400' : 'text-cyan-400'
                  }`}>
                    {saveMessage}
                  </div>
                )}
                {hasChanges && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                    className="w-full py-3 px-4 rounded-full bg-white/[0.12] border border-white/50 text-white hover:bg-white/[0.15] hover:border-white/60 transition-all duration-300 font-medium disabled:bg-white/[0.05] disabled:border-white/20 disabled:text-white/40"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    {saving ? 'Saving...' : 'Save Baselines'}
                </button>
                )}
            </div>
          </>
        )}
      </div>
    </main>
  </div>
);
}
