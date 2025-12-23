import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch, Menu, User, Upload, Link } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import StravaPreview from '@/components/StravaPreview';
import GarminPreview from '@/components/GarminPreview';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

interface TrainingBaselinesProps {
onClose: () => void;
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

export default function TrainingBaselines({ onClose }: TrainingBaselinesProps) {
const { saveUserBaselines, loadUserBaselines } = useAppContext();
const navigate = useNavigate();

const goToDashboard = () => {
  navigate('/dashboard');
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

  // Discipline options
const disciplineOptions = [
    { id: 'running', name: 'Run', icon: Activity },
    { id: 'cycling', name: 'Cycle', icon: Bike },
    { id: 'swimming', name: 'Swim', icon: Waves },
    { id: 'strength', name: 'Strength', icon: Dumbbell }
  ];

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
                <Button variant="ghost" size="icon" className="p-0.5">
                  <Menu className="h-5 w-5" />
                </Button>
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
                <DropdownMenuItem onClick={() => navigate('/')}>
                  <Upload className="mr-2 h-4 w-4" />
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
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="text-2xl font-bold text-primary">efforts</h1>
            <button 
              onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} 
              className="text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={goToDashboard} 
              className="text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dashboard
            </button>
          </div>
        </div>
        <div className="px-4 pb-2">
          <h2 className="text-2xl font-bold">Training Baselines</h2>
        </div>
      </div>
    </header>

      <main className="mobile-main-content">
        <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Loading your baselines...</p>
          </div>
        ) : (
          <>
              <div className="text-center mb-6">
                <p className="text-gray-600">Your performance data for personalized training plans</p>
              {lastUpdated && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {new Date(lastUpdated).toLocaleDateString()}
                </p>
              )}
            </div>

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
                <div className="space-y-6">
                  {/* Basic Information */}
                      <div className="space-y-2">
                    <h2 className="text-sm font-medium text-gray-700">Basic Information</h2>
                    
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 whitespace-nowrap">Birthday</label>
                        <input
                          type="date"
                          value={data.birthday || ''}
                          onChange={(e) => setData(prev => ({ ...prev, birthday: e.target.value }))}
                          className="h-8 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Gender</label>
                        <select
                          value={data.gender || ''}
                          onChange={(e) => setData(prev => ({ ...prev, gender: e.target.value as any }))}
                          className="h-8 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                        >
                          <option value="">-</option>
                          <option value="male">M</option>
                          <option value="female">F</option>
                          <option value="prefer_not_to_say">-</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Units</label>
                        <select
                          value={data.units || 'imperial'}
                          onChange={(e) => setData(prev => ({ ...prev, units: e.target.value as any }))}
                          className="h-8 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                        >
                          <option value="imperial">lbs</option>
                          <option value="metric">kg</option>
                        </select>
                        </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Ht</label>
                        <input
                          type="number"
                          value={data.height || ''}
                          onChange={(e) => setData(prev => ({ ...prev, height: parseInt(e.target.value) || undefined }))}
                          placeholder="70"
                          className="w-12 h-8 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                        />
                        <span className="text-xs text-gray-400">{data.units === 'metric' ? 'cm' : 'in'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Wt</label>
                        <input
                          type="number"
                          value={data.weight || ''}
                          onChange={(e) => setData(prev => ({ ...prev, weight: parseInt(e.target.value) || undefined }))}
                          placeholder="160"
                          className="w-14 h-8 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                        />
                        <span className="text-xs text-gray-400">{data.units === 'metric' ? 'kg' : 'lb'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Disciplines */}
                  <div className="space-y-2">
                    <div>
                      <h2 className="text-sm font-medium text-gray-700">Your Sports</h2>
                      <p className="text-xs text-gray-500">Add baselines for personalized plans</p>
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
                            className={`relative flex items-center justify-center gap-1.5 py-2 rounded border text-center transition-colors ${
                              isActive
                                ? 'border-gray-400 bg-gray-100'
                                : hasData
                                  ? 'border-gray-300 bg-gray-50'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {!isActive && (
                              <span className="absolute -top-1 -right-1 text-[10px] text-gray-500">
                                {hasData ? '✓' : '+'}
                                      </span>
                            )}
                            <Icon className={`h-4 w-4 ${isActive ? 'text-gray-700' : hasData ? 'text-gray-600' : 'text-gray-400'}`} />
                            <span className={`text-xs font-medium ${isActive ? 'text-gray-700' : hasData ? 'text-gray-600' : 'text-gray-500'}`}>
                              {discipline.name}
                                      </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                  {/* Per-discipline performance numbers */}
                  {activeSport && (
                    <div className="space-y-4">
                      <h2 className="text-sm font-medium text-gray-700">Performance Numbers</h2>

                      {/* Running */}
                      {activeSport === 'running' && (
                        <div className="space-y-3 pb-4 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-gray-600" />
                            <h3 className="text-sm font-medium">Running</h3>
                                    </div>
                          <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500">5K Time</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                                    </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500">Easy Pace</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                              <span className="text-xs text-gray-400">/mi</span>
                                    </div>
                                    </div>
                        </div>
                      )}

                      {/* Cycling */}
                      {activeSport === 'cycling' && (
                        <div className="space-y-3 pb-4 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <Bike className="h-4 w-4 text-gray-600" />
                            <h3 className="text-sm font-medium">Cycling</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">FTP</label>
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
                              className="w-20 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                            <span className="text-xs text-gray-400">watts</span>
                                    </div>
                                  </div>
                                )}

                      {/* Swimming */}
                      {activeSport === 'swimming' && (
                        <div className="space-y-3 pb-4 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <Waves className="h-4 w-4 text-gray-600" />
                            <h3 className="text-sm font-medium">Swimming</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">100yd Pace</label>
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
                              className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                            <span className="text-xs text-gray-400">mm:ss</span>
                                    </div>
                          <div className="space-y-2">
                            <label className="text-xs text-gray-500">Equipment</label>
                            <div className="flex flex-wrap gap-2">
                              {swimmingEquipmentOptions.map((option) => {
                                const isSelected = (data.equipment.swimming || []).includes(option);
                                return (
                                  <button
                                    key={option}
                                    onClick={() => toggleEquipment('swimming', option)}
                                    className={`px-2 py-1 text-xs rounded-full transition-colors ${
                                      isSelected
                                        ? 'bg-gray-300 text-gray-800'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
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
                        <div className="space-y-3 pb-4">
                          <div className="flex items-center gap-2">
                            <Dumbbell className="h-4 w-4 text-gray-600" />
                            <h3 className="text-sm font-medium">Strength</h3>
                            <span className="text-xs text-gray-400">1 rep max ({data.units === 'metric' ? 'kg' : 'lbs'})</span>
                          </div>
                          
                          {/* Baseline Test Note */}
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <p className="text-xs text-gray-700 mb-2">
                              Don't know your numbers? Or want to retest?
                            </p>
                            <p className="text-xs text-gray-600 mb-2">
                              Log a{' '}
                              <button
                                onClick={() => {
                                  const today = new Date().toISOString().split('T')[0];
                                  window.dispatchEvent(new CustomEvent('open:strengthLogger', {
                                    detail: {
                                      planned: {
                                        name: 'Baseline Test: Lower Body',
                                        type: 'strength',
                                        date: today,
                                        workout_status: 'planned'
                                      }
                                    }
                                  }));
                                }}
                                className="text-blue-600 hover:text-blue-800 underline font-medium"
                              >
                                Baseline Test: Lower Body
                              </button>
                              {' '}or{' '}
                              <button
                                onClick={() => {
                                  const today = new Date().toISOString().split('T')[0];
                                  window.dispatchEvent(new CustomEvent('open:strengthLogger', {
                                    detail: {
                                      planned: {
                                        name: 'Baseline Test: Upper Body',
                                        type: 'strength',
                                        date: today,
                                        workout_status: 'planned'
                                      }
                                    }
                                  }));
                                }}
                                className="text-blue-600 hover:text-blue-800 underline font-medium"
                              >
                                Upper Body
                              </button>
                              {' '}workout. We'll guide you through warmups and calculate your 1RM automatically.
                            </p>
                            <p className="text-xs text-gray-500 italic">
                              💡 Tip: Retest every 8-12 weeks to track progress.
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500">Squat</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500">DL</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500">Bench</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                                    </div>
                            <div className="flex items-center gap-1">
                              <label className="text-xs text-gray-500">OHP</label>
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
                                className="w-16 h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                                      />
                                    </div>
                                  </div>
                          <div className="space-y-3">
                            <label className="text-xs text-gray-500">Equipment Access</label>
                            
                            {/* Commercial vs Home gym toggle */}
                            <div className="flex gap-4">
                          <button
                                onClick={() => {
                                  // Set to commercial gym, clear individual equipment
                                  setData(prev => ({
                                    ...prev,
                                    equipment: { ...prev.equipment, strength: ['Commercial gym'] }
                                  }));
                                }}
                                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition-colors ${
                                  hasCommercialGym
                                    ? 'border-gray-400 bg-gray-100 text-gray-800'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full border-2 ${hasCommercialGym ? 'border-gray-600 bg-gray-600' : 'border-gray-400'}`} />
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
                                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition-colors ${
                                  !hasCommercialGym
                                    ? 'border-gray-400 bg-gray-100 text-gray-800'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full border-2 ${!hasCommercialGym ? 'border-gray-600 bg-gray-600' : 'border-gray-400'}`} />
                                Home gym
                              </button>
                  </div>

                            {/* Home gym equipment details - only show if not commercial */}
                            {!hasCommercialGym && (
                              <div className="space-y-2 pl-1">
                                <p className="text-xs text-gray-400">Select your equipment:</p>
                                <div className="flex flex-wrap gap-2">
                                  {homeGymEquipmentOptions.map((option) => {
                                    const isSelected = (data.equipment.strength || []).includes(option);
                                    return (
                        <button
                                        key={option}
                                        onClick={() => toggleEquipment('strength', option)}
                                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                                          isSelected
                                            ? 'bg-gray-300 text-gray-800'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                      >
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
                </div>
              ) : (
                /* Data Import Tab */
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">Import Training Data</h3>
                    <p className="text-sm text-gray-600">Connect your fitness accounts to auto-populate baseline data</p>
                  </div>
                  
                  {/* Strava Connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-orange-500" />
                      <h4 className="font-medium">Strava Integration</h4>
                    </div>

                    {!stravaConnected ? (
                      <button
                        onClick={connectStrava}
                        className="w-full px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 transition-colors font-medium rounded-md"
                      >
                        Connect with Strava
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-green-50 rounded-md">
                          <p className="text-sm text-green-800">✓ Connected to Strava</p>
                        </div>
                          <button
                            onClick={disconnectStrava}
                            className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {stravaMessage && (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-700">{stravaMessage}</p>
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
                      <h4 className="font-medium">Garmin Integration</h4>
                    </div>

                    {!garminConnected ? (
                      <button
                        onClick={connectGarmin}
                        className="w-full px-4 py-3 text-white bg-blue-500 hover:bg-blue-600 transition-colors font-medium rounded-md"
                      >
                        Connect with Garmin
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-green-50 rounded-md">
                          <p className="text-sm text-green-800">✓ Connected to Garmin</p>
                        </div>
                          <button
                            onClick={disconnectGarmin}
                            className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {garminMessage && (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-700">{garminMessage}</p>
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
                    saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {saveMessage}
                  </div>
                )}
                {hasChanges && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                    className="w-full py-3 text-gray-700 hover:text-gray-900 transition-colors font-medium disabled:text-gray-400"
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
