import React, { useState, useEffect } from 'react';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import StravaPreview from '@/components/StravaPreview';
import GarminPreview from '@/components/GarminPreview';

interface TrainingBaselinesProps {
onClose: () => void;
}

interface BaselineData {
// Enhanced user details
birthday?: string;
height?: number;
weight?: number;
gender?: 'male' | 'female' | 'prefer_not_to_say';
units?: 'metric' | 'imperial';
current_volume?: { [discipline: string]: string };
training_frequency?: { [discipline: string]: string };
volume_increase_capacity?: { [discipline: string]: string };
training_status?: { [discipline: string]: string };
benchmark_recency?: { [discipline: string]: string };

// Existing fields
age: number;
disciplines: string[];
disciplineFitness: {
  running?: string;
  cycling?: string;
  swimming?: string;
  strength?: string;
};
benchmarks: {
  running?: string;
  cycling?: string;
  swimming?: string;
  strength?: string;
};
performanceNumbers: {
  // Cycling
  ftp?: number;
  avgSpeed?: number;
  // Swimming
  swimPace100?: string;
  swim200Time?: string;
  swim400Time?: string;
  // Running
  fiveK?: string;
  tenK?: string;
  halfMarathon?: string;
  marathon?: string;
  // Strength
  squat?: number;
  deadlift?: number;
  bench?: number;
};
injuryHistory: string;
injuryRegions: string[];
trainingBackground: string;
equipment: {
  running?: string[];
  cycling?: string[];
  swimming?: string[];
  strength?: string[];
};
}

export default function TrainingBaselines({ onClose }: TrainingBaselinesProps) {
// Get context functions
const { saveUserBaselines, loadUserBaselines } = useAppContext();

const [data, setData] = useState<BaselineData>({
  age: 0,
  disciplines: [],
  disciplineFitness: {},
  benchmarks: {},
  performanceNumbers: {},
  injuryHistory: '',
  injuryRegions: [],
  trainingBackground: '',
  equipment: {},
  units: 'imperial',
  current_volume: {},
  training_frequency: {},
  volume_increase_capacity: {},
  training_status: {},
  benchmark_recency: {}
});

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState('');
const [lastUpdated, setLastUpdated] = useState<string | null>(null);
const [activeTab, setActiveTab] = useState<'assessment' | 'baselines' | 'data-import'>('assessment');

// NEW: Strava connection state
const [stravaConnected, setStravaConnected] = useState(false);
const [stravaMessage, setStravaMessage] = useState('');
const [accessToken, setAccessToken] = useState<string | null>(null);

// NEW: Garmin connection state
const [garminConnected, setGarminConnected] = useState(false);
const [garminMessage, setGarminMessage] = useState('');
const [garminAccessToken, setGarminAccessToken] = useState<string | null>(null);

// Load existing baselines on component mount
useEffect(() => {
  loadBaselines();
}, []);

// NEW: Check for existing Strava token
useEffect(() => {
  const existingToken = localStorage.getItem('strava_access_token');
  if (existingToken) {
    setAccessToken(existingToken);
    setStravaConnected(true);
  }
}, []);

// NEW: Check for existing Garmin token
useEffect(() => {
  const existingToken = localStorage.getItem('garmin_access_token');
  if (existingToken) {
    setGarminAccessToken(existingToken);
    setGarminConnected(true);
  }
}, []);

// NEW: Listen for OAuth callback messages
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
    
    console.log('Raw birthday from database:', baselines?.birthday);
    console.log('Type of birthday:', typeof baselines?.birthday);
    
    if (baselines) {
      setData(baselines);
      setLastUpdated(baselines.lastUpdated || null);
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
    
    await saveUserBaselines(data);
    
    setSaveMessage('Saved successfully!');
    setLastUpdated(new Date().toISOString());
    
    setTimeout(() => setSaveMessage(''), 3000);
    
  } catch (error) {
    console.error('Error saving baselines:', error);
    setSaveMessage('Error saving. Please try again.');
  } finally {
    setSaving(false);
  }
};

// NEW: Strava connection functions
const connectStrava = () => {
  const clientId = (import.meta as any).env.VITE_STRAVA_CLIENT_ID;
  const redirectUri = `${window.location.origin}/strava/callback`;
  const scope = 'read,activity:read_all';
  
  console.log('Client ID:', clientId);
  console.log('Redirect URI:', redirectUri);
  
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  
  console.log('Auth URL:', authUrl);
  
  // Open popup for OAuth
  const popup = window.open(
    authUrl,
    'strava-auth',
    'width=600,height=700,scrollbars=yes,resizable=yes'
  );

  // Check if popup was blocked
  if (!popup) {
    setStravaMessage('Popup was blocked. Please allow popups and try again.');
    return;
  }
};

const disconnectStrava = () => {
  setStravaConnected(false);
  setAccessToken(null);
  localStorage.removeItem('strava_access_token');
  setStravaMessage('Disconnected from Strava');
};

const testStravaApi = async () => {
  if (!accessToken) return;

  try {
    setStravaMessage('Testing API call...');
    
    const response = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    const data = await response.json();
    setStravaMessage(`API test successful! Hello ${data.firstname} ${data.lastname}`);
  } catch (error) {
    setStravaMessage(`API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// PKCE helper function
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

// Handle Garmin OAuth success
const handleGarminOAuthSuccess = async (code: string) => {
  try {
    const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    console.log('🔍 GARMIN DEBUG: Starting token exchange...');

    // Get user session token
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User must be logged in');
    }

    // Exchange code for access token using Supabase function
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
      console.error('🔍 GARMIN DEBUG: Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('🔍 GARMIN DEBUG: Token exchange successful, token starts with:', tokenData.access_token?.substring(0, 20) + '...');

    // CRITICAL: Set both state and localStorage with the new token
    setGarminAccessToken(tokenData.access_token);
    setGarminConnected(true);
    localStorage.setItem('garmin_access_token', tokenData.access_token);
    setGarminMessage('Successfully connected to Garmin!');

    console.log('🔍 GARMIN DEBUG: Token stored in state and localStorage');

    // Clean up
    sessionStorage.removeItem('garmin_code_verifier');

  } catch (error) {
    console.error('🔍 GARMIN DEBUG: OAuth error:', error);
    setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    sessionStorage.removeItem('garmin_code_verifier');
  }
};

// NEW: Garmin connection functions - REAL OAUTH
const connectGarmin = async () => {
  localStorage.removeItem('garmin_access_token'); // THE 1-LINE FIX - CLEAR OLD TOKEN FIRST
  setGarminMessage('Connecting to Garmin...');
  
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    
    // Store code verifier for later use
    sessionStorage.setItem('garmin_code_verifier', codeVerifier);
    
    const authUrl = 'https://connect.garmin.com/oauth2Confirm';
    const clientId = '17e358e3-9e6c-45ae-9267-91a06d126e4b';
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
    
    // Open popup for OAuth
    const popup = window.open(fullAuthUrl, 'garmin-auth', 'width=600,height=600');
    
    // Check if popup was blocked
    if (!popup) {
      setGarminMessage('Popup was blocked. Please allow popups for this site and try again.');
      sessionStorage.removeItem('garmin_code_verifier');
      return;
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

const testGarminApi = async () => {
  if (!garminAccessToken) {
    setGarminMessage('No access token available');
    return;
  }

  try {
    setGarminMessage('Testing API call...');
    
    console.log('🔍 GARMIN DEBUG: Using access token:', garminAccessToken.substring(0, 20) + '...');
    
    // Try the user permissions endpoint using Supabase function
    const response = await fetch(`https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=/wellness-api/rest/user/permissions&token=${garminAccessToken}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      }
    });

    console.log('🔍 GARMIN DEBUG: API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔍 GARMIN DEBUG: API error response:', errorText);
      throw new Error(`API call failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    setGarminMessage(`API test successful! Connected to Garmin - Permissions: ${JSON.stringify(data)}`);
    console.log('🔍 GARMIN DEBUG: API success:', data);
  } catch (error) {
    console.error('🔍 GARMIN DEBUG: API test error:', error);
    setGarminMessage(`API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const disciplineOptions = [
  { id: 'running', name: 'Running', icon: Activity },
  { id: 'cycling', name: 'Cycling', icon: Bike },
  { id: 'swimming', name: 'Swimming', icon: Waves },
  { id: 'strength', name: 'Strength Training', icon: Dumbbell }
];

const getDisciplineFitnessOptions = (discipline: string) => {
  switch (discipline) {
    case 'running':
      return [
        "New to running",
        "Recreational runner",
        "Regular runner",
        "Competitive runner"
      ];
    case 'cycling':
      return [
        "New to cycling", 
        "Recreational rider",
        "Regular cyclist",
        "Competitive cyclist"
      ];
    case 'swimming':
      return [
        "New to swimming",
        "Recreational swimmer", 
        "Regular swimmer",
        "Competitive swimmer"
      ];
    case 'strength':
      return [
        "New to strength training",
        "Recreational lifter",
        "Regular lifter", 
        "Competitive lifter"
      ];
    default:
      return [];
  }
};

const getBenchmarkOptions = (discipline: string) => {
  switch (discipline) {
    case 'running':
      return [
        "Don't know my running pace/times",
        "5K in 30+ minutes (recreational runner)",
        "5K in 25-30 minutes (fitness runner)",
        "5K in 20-25 minutes (trained runner)",
        "5K under 20 minutes (competitive runner)",
        "I know my exact times/paces"
      ];
    case 'cycling':
      return [
        "Don't track cycling speed/power",
        "Average 12-15 mph on flats (recreational)",
        "Average 16-18 mph on flats (fitness rider)",
        "Average 19-21 mph on flats (trained cyclist)",
        "Average 22+ mph on flats (competitive cyclist)",
        "I know my FTP (watts)"
      ];
    case 'swimming':
      return [
        "Don't know swimming pace/new to swimming",
        "Can swim 25 yards continuously",
        "Can swim 100 yards continuously",
        "Can swim 500+ yards continuously",
        "Competitive swimmer/masters level",
        "I know my 100-yard pace"
      ];
    case 'strength':
      return [
        "Don't know my strength levels",
        "Bodyweight movements only",
        "Can squat/deadlift around bodyweight",
        "Can squat/deadlift 1.25x bodyweight",
        "Can squat/deadlift 1.5x+ bodyweight",
        "I know my compound 1RMs"
      ];
    default:
      return [];
  }
};

const getEquipmentOptions = (discipline: string) => {
  switch (discipline) {
    case 'running':
      return ["Treadmill access", "Road running", "Trail access", "Track access"];
    case 'cycling':
      return ["Road bike", "Indoor trainer/smart trainer", "Gym stationary bikes", "Mountain bike"];
    case 'swimming':
      return ["Pool access", "Open water access", "Paddles", "Pull buoy", "Kickboard", "Fins", "Snorkel", "No regular swimming access"];
    case 'strength':
      return ["Full barbell + plates", "Adjustable dumbbells", "Fixed dumbbells", "Squat rack or power cage", "Bench (flat/adjustable)", "Pull-up bar", "Kettlebells", "Resistance bands", "Cable machine/functional trainer", "Bodyweight only", "Full commercial gym access"];
    default:
      return [];
  }
};

const getVolumeOptions = () => [
  "0-2 hours",
  "2-4 hours", 
  "4-6 hours",
  "6-8 hours",
  "8+ hours"
];

const getTrainingFrequencyOptions = () => [
  "1-2 days per week",
  "3-4 days per week",
  "5-6 days per week",
  "7 days per week"
];

const getVolumeIncreaseOptions = () => [
  "Yes, I can easily increase by 10% or more",
  "Yes, but I'd need to be careful about it",
  "Maybe, but I'd need to reduce intensity",
  "No, I'm at my current limit",
  "I'm not sure, haven't tried"
];

const getTrainingStatusOptions = () => [
  "Building base fitness",
  "In regular training routine",
  "Peak season / competing regularly",
  "Maintaining current fitness",
  "Returning after break (1-3 months)",
  "Returning after extended break (3+ months)"
];

const getBenchmarkRecencyOptions = () => [
  "Within the last month",
  "1-3 months ago",
  "3-6 months ago", 
  "6-12 months ago",
  "Over a year ago",
  "These are goals, not current fitness"
];

const injuryOptions = [
  "No current injuries or limitations",
  "Minor aches/pains but can train normally",
  "Previous injury - need to avoid certain movements",
  "Current injury - working around limitations"
];

const trainingBackgroundOptions = [
  "Brand new to structured training",
  "Returning after 6+ months off",
  "Train occasionally but inconsistently",
  "Train consistently for 6+ months",
  "Train consistently for 2+ years"
];

const bodyRegionOptions = [
  "Head/Neck/Cervical spine",
  "Shoulder (Left)",
  "Shoulder (Right)", 
  "Elbow/Forearm (Left)",
  "Elbow/Forearm (Right)",
  "Wrist/Hand (Left)",
  "Wrist/Hand (Right)",
  "Chest/Ribs",
  "Upper back/Thoracic spine",
  "Lower back/Lumbar spine",
  "Hip/Pelvis (Left)",
  "Hip/Pelvis (Right)",
  "Thigh/Quad/Hamstring (Left)",
  "Thigh/Quad/Hamstring (Right)",
  "Knee (Left)",
  "Knee (Right)",
  "Calf/Shin (Left)",
  "Calf/Shin (Right)",
  "Ankle/Foot (Left)",
  "Ankle/Foot (Right)"
];

const toggleDiscipline = (disciplineId: string) => {
  setData(prev => ({
    ...prev,
    disciplines: prev.disciplines.includes(disciplineId)
      ? prev.disciplines.filter(d => d !== disciplineId)
      : [...prev.disciplines, disciplineId]
  }));
};

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

const toggleInjuryRegion = (region: string) => {
  setData(prev => ({
    ...prev,
    injuryRegions: prev.injuryRegions.includes(region)
      ? prev.injuryRegions.filter(r => r !== region)
      : [...prev.injuryRegions, region]
  }));
};

const DisciplineIcon = ({ discipline }: { discipline: string }) => {
  const option = disciplineOptions.find(d => d.id === discipline);
  if (!option) return null;
  const Icon = option.icon;
  return <Icon className="h-5 w-5" />;
};

// NEW: Helper function to get specific performance numbers for display
const getPerformanceNumbers = (disciplineId: string) => {
  const numbers = [];
  
  switch (disciplineId) {
    case 'running':
      if (data.performanceNumbers?.fiveK) numbers.push(`5K: ${data.performanceNumbers.fiveK}`);
      if (data.performanceNumbers?.tenK) numbers.push(`10K: ${data.performanceNumbers.tenK}`);
      if (data.performanceNumbers?.halfMarathon) numbers.push(`Half: ${data.performanceNumbers.halfMarathon}`);
      if (data.performanceNumbers?.marathon) numbers.push(`Marathon: ${data.performanceNumbers.marathon}`);
      break;
    case 'cycling':
      if (data.performanceNumbers?.ftp) numbers.push(`FTP: ${data.performanceNumbers.ftp}W`);
      if (data.performanceNumbers?.avgSpeed) numbers.push(`Avg Speed: ${data.performanceNumbers.avgSpeed}`);
      break;
    case 'swimming':
      if (data.performanceNumbers?.swimPace100) numbers.push(`100m: ${data.performanceNumbers.swimPace100}`);
      if (data.performanceNumbers?.swim200Time) numbers.push(`200m: ${data.performanceNumbers.swim200Time}`);
      if (data.performanceNumbers?.swim400Time) numbers.push(`400m: ${data.performanceNumbers.swim400Time}`);
      break;
    case 'strength':
      if (data.performanceNumbers?.squat) numbers.push(`Squat: ${data.performanceNumbers.squat}lbs`);
      if (data.performanceNumbers?.deadlift) numbers.push(`Deadlift: ${data.performanceNumbers.deadlift}lbs`);
      if (data.performanceNumbers?.bench) numbers.push(`Bench: ${data.performanceNumbers.bench}lbs`);
      break;
  }
  
  return numbers;
};

const hasInjuries = data.injuryHistory && data.injuryHistory !== "No current injuries or limitations";

return (
  <div className="min-h-screen bg-white">
    <main className="max-w-4xl mx-auto px-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="max-w-2xl mx-auto space-y-8">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Loading your baselines...</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-medium mb-2">Training Baselines</h1>
              <p className="text-gray-600">
                Your fitness data for personalized training plans
              </p>
              {lastUpdated && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {new Date(lastUpdated).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Tabs */}
            <div className="space-y-6">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('assessment')}
                  className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                    activeTab === 'assessment'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Assessment
                </button>
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
              </div>

              {activeTab === 'assessment' ? (
                /* Assessment Tab */
                <div className="space-y-8">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium">Basic Information</h2>
                    
                    <div className="space-y-4">
                      {/* Birthday */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Birthday</label>
                        <p className="text-xs text-gray-500">Used to calculate current age and training zones</p>
                        <input
                          type="date"
                          value={data.birthday || ''}
                          onChange={(e) => setData(prev => ({ ...prev, birthday: e.target.value }))}
                          className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                        />
                      </div>

                      {/* Units Preference */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Units Preference</label>
                        <div className="flex gap-4">
                          <button
                            onClick={() => setData(prev => ({ ...prev, units: 'imperial' }))}
                            className={`px-4 py-2 text-sm transition-colors ${
                              (data.units === 'imperial' || !data.units) ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <span className="font-medium mr-2">
                              {(data.units === 'imperial' || !data.units) ? '●' : '○'}
                            </span>
                            Imperial (lbs, ft/in)
                          </button>
                          <button
                            onClick={() => setData(prev => ({ ...prev, units: 'metric' }))}
                            className={`px-4 py-2 text-sm transition-colors ${
                              data.units === 'metric' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <span className="font-medium mr-2">
                              {data.units === 'metric' ? '●' : '○'}
                            </span>
                            Metric (kg, cm)
                          </button>
                        </div>
                      </div>

                      {/* Height */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Height ({(data.units === 'metric') ? 'cm' : 'inches'})
                        </label>
                        <p className="text-xs text-gray-500">
                          {(data.units === 'metric') ? 'Centimeters' : 'Total inches (5\'10" = 70 inches)'}
                        </p>
                        <input
                          type="number"
                          value={data.height || ''}
                          onChange={(e) => setData(prev => ({ ...prev, height: parseInt(e.target.value) || undefined }))}
                          placeholder={(data.units === 'metric') ? '178' : '70'}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                        />
                      </div>

                      {/* Weight */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Weight ({(data.units === 'metric') ? 'kg' : 'lbs'})
                        </label>
                        <input
                          type="number"
                          value={data.weight || ''}
                          onChange={(e) => setData(prev => ({ ...prev, weight: parseInt(e.target.value) || undefined }))}
                          placeholder={(data.units === 'metric') ? '80' : '175'}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                        />
                      </div>

                      {/* Gender */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Gender</label>
                        <div className="space-y-2">
                          {[
                            { value: 'male', label: 'Male' },
                            { value: 'female', label: 'Female' },
                            { value: 'prefer_not_to_say', label: 'Prefer not to say' }
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => setData(prev => ({ ...prev, gender: option.value as any }))}
                              className={`w-full p-3 text-left text-sm transition-colors ${
                                data.gender === option.value ? 'text-blue-600' : 'hover:text-blue-600'
                              }`}
                            >
                              <span className="font-medium text-gray-500 mr-3">
                                {data.gender === option.value ? '●' : '○'}
                              </span>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Disciplines */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium">Training Disciplines</h2>
                    <p className="text-sm text-gray-600">Select which sports you want to track baselines for</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {disciplineOptions.map((discipline) => {
                        const Icon = discipline.icon;
                        const isSelected = data.disciplines.includes(discipline.id);
                        return (
                          <button
                            key={discipline.id}
                            onClick={() => toggleDiscipline(discipline.id)}
                            className={`p-4 text-center transition-colors ${
                              isSelected ? 'text-black' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <Icon className="h-6 w-6 mx-auto mb-2" />
                            <div className="text-sm font-medium">{discipline.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Enhanced per-discipline sections */}
                  {data.disciplines.length > 0 && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-medium">Performance Benchmarks</h2>
                      
                      {data.disciplines.map((disciplineId) => {
                        const discipline = disciplineOptions.find(d => d.id === disciplineId);
                        if (!discipline) return null;
                        
                        return (
                          <div key={disciplineId} className="space-y-4">
                            <div className="flex items-center gap-2">
                              <DisciplineIcon discipline={disciplineId} />
                              <h3 className="font-medium capitalize">{discipline.name}</h3>
                            </div>
                            
                            <div className="space-y-4 ml-7">
                              {/* Current Volume */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                  How many hours per week do you currently {disciplineId}?
                                </label>
                                <div className="space-y-2">
                                  {getVolumeOptions().map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        current_volume: {
                                          ...prev.current_volume,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.current_volume?.[disciplineId] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.current_volume?.[disciplineId] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Training Frequency */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                  How many days per week do you currently {disciplineId}?
                                </label>
                                <div className="space-y-2">
                                  {getTrainingFrequencyOptions().map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        training_frequency: {
                                          ...prev.training_frequency,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.training_frequency?.[disciplineId] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.training_frequency?.[disciplineId] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Volume Increase Capacity */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                  Can you currently increase your {disciplineId} training by 10% without issues?
                                </label>
                                <div className="space-y-2">
                                  {getVolumeIncreaseOptions().map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        volume_increase_capacity: {
                                          ...prev.volume_increase_capacity,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.volume_increase_capacity?.[disciplineId] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.volume_increase_capacity?.[disciplineId] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Training Status */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                  Current {disciplineId} training status?
                                </label>
                                <div className="space-y-2">
                                  {getTrainingStatusOptions().map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        training_status: {
                                          ...prev.training_status,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.training_status?.[disciplineId] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.training_status?.[disciplineId] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Benchmark Recency */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                  When did you last achieve these performance numbers?
                                </label>
                                <div className="space-y-2">
                                  {getBenchmarkRecencyOptions().map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        benchmark_recency: {
                                          ...prev.benchmark_recency,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.benchmark_recency?.[disciplineId] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.benchmark_recency?.[disciplineId] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Existing fitness level and performance sections */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Fitness Level</label>
                                <div className="space-y-2">
                                  {getDisciplineFitnessOptions(disciplineId).map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        disciplineFitness: {
                                          ...prev.disciplineFitness,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.disciplineFitness[disciplineId as keyof typeof data.disciplineFitness] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.disciplineFitness[disciplineId as keyof typeof data.disciplineFitness] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Performance Level</label>
                                <div className="space-y-2">
                                  {getBenchmarkOptions(disciplineId).map((option, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setData(prev => ({
                                        ...prev,
                                        benchmarks: {
                                          ...prev.benchmarks,
                                          [disciplineId]: option
                                        }
                                      }))}
                                      className={`w-full p-3 text-left text-sm transition-colors ${
                                        data.benchmarks[disciplineId as keyof typeof data.benchmarks] === option
                                          ? 'text-blue-600' 
                                          : 'hover:text-blue-600'
                                      }`}
                                    >
                                      <span className="font-medium text-gray-500 mr-3">
                                        {data.benchmarks[disciplineId as keyof typeof data.benchmarks] === option ? '●' : '○'}
                                      </span>
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Equipment */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Equipment Access</label>
                                <div className="space-y-2">
                                  {getEquipmentOptions(disciplineId).map((option, index) => {
                                    const isSelected = (data.equipment[disciplineId as keyof typeof data.equipment] || []).includes(option);
                                    return (
                                      <button
                                        key={index}
                                        onClick={() => toggleEquipment(disciplineId, option)}
                                        className={`w-full p-3 text-left text-sm transition-colors ${
                                          isSelected ? 'text-blue-600' : 'hover:text-blue-600'
                                        }`}
                                      >
                                        <span className="font-medium text-gray-500 mr-3">
                                          {isSelected ? '✓' : '○'}
                                        </span>
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Performance Numbers */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Performance Numbers</label>
                                <p className="text-xs text-gray-500">Enter your current performance numbers for personalized training plans</p>
                                
                                {disciplineId === 'cycling' && data.benchmarks?.cycling === 'I know my FTP (watts)' && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs text-gray-600">FTP (watts)</label>
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
                                        placeholder="Enter your FTP"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                {disciplineId === 'running' && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs text-gray-600">5K Time (mm:ss)</label>
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
                                        placeholder="mm:ss"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">10K Time (mm:ss)</label>
                                      <input
                                        type="text"
                                        value={data.performanceNumbers?.tenK || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            tenK: e.target.value
                                          }
                                        }))}
                                        placeholder="mm:ss"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">Half Marathon (hh:mm)</label>
                                      <input
                                        type="text"
                                        value={data.performanceNumbers?.halfMarathon || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            halfMarathon: e.target.value
                                          }
                                        }))}
                                        placeholder="hh:mm"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                {disciplineId === 'swimming' && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs text-gray-600">100m Pace (mm:ss)</label>
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
                                        placeholder="mm:ss"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">200m Time (mm:ss)</label>
                                      <input
                                        type="text"
                                        value={data.performanceNumbers?.swim200Time || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            swim200Time: e.target.value
                                          }
                                        }))}
                                        placeholder="mm:ss"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                {disciplineId === 'strength' && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs text-gray-600">Squat 1RM (lbs)</label>
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
                                        placeholder="Enter your 1RM"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">Deadlift 1RM (lbs)</label>
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
                                        placeholder="Enter your 1RM"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">Bench Press 1RM (lbs)</label>
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
                                        placeholder="Enter your 1RM"
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-sm"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Injury History */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium">Injury History</h2>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Current Status</label>
                      <div className="space-y-2">
                        {injuryOptions.map((option, index) => (
                          <button
                            key={index}
                            onClick={() => setData(prev => ({ ...prev, injuryHistory: option }))}
                            className={`w-full p-3 text-left text-sm transition-colors ${
                              data.injuryHistory === option ? 'text-blue-600' : 'hover:text-blue-600'
                            }`}
                          >
                            <span className="font-medium text-gray-500 mr-3">
                              {data.injuryHistory === option ? '●' : '○'}
                            </span>
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    {hasInjuries && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Affected Body Regions</label>
                        <div className="space-y-2">
                          {bodyRegionOptions.map((region, index) => {
                            const isSelected = data.injuryRegions.includes(region);
                            return (
                              <button
                                key={index}
                                onClick={() => toggleInjuryRegion(region)}
                                className={`w-full p-3 text-left text-sm transition-colors ${
                                  isSelected ? 'text-blue-600' : 'hover:text-blue-600'
                                }`}
                              >
                                <span className="font-medium text-gray-500 mr-3">
                                  {isSelected ? '✓' : '○'}
                                </span>
                                {region}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Training Background */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium">Training Background</h2>
                    
                    <div className="space-y-2">
                      {trainingBackgroundOptions.map((option, index) => (
                        <button
                          key={index}
                          onClick={() => setData(prev => ({ ...prev, trainingBackground: option }))}
                          className={`w-full p-3 text-left text-sm transition-colors ${
                            data.trainingBackground === option ? 'text-blue-600' : 'hover:text-blue-600'
                          }`}
                        >
                          <span className="font-medium text-gray-500 mr-3">
                            {data.trainingBackground === option ? '●' : '○'}
                          </span>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeTab === 'baselines' ? (
                /* Baselines Tab */
                <div className="space-y-8">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">Your Training Baselines Summary</h3>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Basic Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-600">Age</label>
                        <p className="text-sm py-1">{data.age || 'Not set'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Birthday</label>
                        <p className="text-sm py-1">
                          {data.birthday ? (() => {
                            const [year, month, day] = data.birthday.split('-');
                            return `${month}/${day}/${year}`;
                          })() : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Height</label>
                        <p className="text-sm py-1">
                          {data.height ? `${data.height} ${data.units === 'imperial' ? 'in' : 'cm'}` : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Weight</label>
                        <p className="text-sm py-1">
                          {data.weight ? `${data.weight} ${data.units === 'imperial' ? 'lbs' : 'kg'}` : 'Not set'}
                        </p>
                      </div>
                    </div>
                  </div>

{(() => {
                    // Check ALL possible sports for saved data, regardless of current selection
                    const allPossibleSports = ['running', 'cycling', 'swimming', 'strength'];
                    const sportsWithData = allPossibleSports.filter(disciplineId => {
                      return data.current_volume?.[disciplineId] || 
                             data.training_frequency?.[disciplineId] ||
                             data.volume_increase_capacity?.[disciplineId] ||
                             data.training_status?.[disciplineId] || 
                             data.benchmark_recency?.[disciplineId] ||
                             data.disciplineFitness?.[disciplineId] || 
                             data.benchmarks?.[disciplineId] || 
                             (data.equipment?.[disciplineId] && data.equipment[disciplineId].length > 0);
                    });

                    return sportsWithData.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-medium">Your Sports</h4>
                        <div className="space-y-4">
                          {sportsWithData.map((disciplineId) => {
                            const discipline = disciplineOptions.find(d => d.id === disciplineId);
                            if (!discipline) return null;
                            
                            const performanceNumbers = getPerformanceNumbers(disciplineId);
                            
                            return (
                              <div key={disciplineId} className="p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <DisciplineIcon discipline={disciplineId} />
                                  <h5 className="font-medium capitalize">{discipline.name}</h5>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-gray-600">Current Volume: </span>
                                    <span>{data.current_volume?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Training Frequency: </span>
                                    <span>{data.training_frequency?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Volume Increase Capacity: </span>
                                    <span>{data.volume_increase_capacity?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Training Status: </span>
                                    <span>{data.training_status?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Fitness Level: </span>
                                    <span>{data.disciplineFitness?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Performance Level: </span>
                                    <span>{data.benchmarks?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  {performanceNumbers.length > 0 && (
                                    <div className="md:col-span-2">
                                      <span className="text-gray-600">Performance Numbers: </span>
                                      <span>{performanceNumbers.join(', ')}</span>
                                    </div>
                                  )}
                                  <div className="md:col-span-2">
                                    <span className="text-gray-600">Benchmark Recency: </span>
                                    <span>{data.benchmark_recency?.[disciplineId] || 'Not set'}</span>
                                  </div>
                                  {data.equipment?.[disciplineId] && data.equipment[disciplineId].length > 0 && (
                                    <div className="md:col-span-2">
                                      <span className="text-gray-600">Equipment: </span>
                                      <span>{data.equipment[disciplineId].join(', ')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
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
                        <div className="flex gap-3">
                          <button
                            onClick={testStravaApi}
                            className="flex-1 px-4 py-2 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
                          >
                            Test API Call
                          </button>
                          <button
                            onClick={disconnectStrava}
                            className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    )}

                    {stravaMessage && (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-700">{stravaMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Strava Preview Component */}
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
                        <div className="flex gap-3">
                          <button
                            onClick={testGarminApi}
                            className="flex-1 px-4 py-2 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
                          >
                            Test API Call
                          </button>
                          <button
                            onClick={disconnectGarmin}
                            className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    )}

                    {garminMessage && (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-700">{garminMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Garmin Preview Component */}
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
              <div className="pt-6 pb-8">
                {saveMessage && (
                  <div className={`text-center mb-4 text-sm ${
                    saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {saveMessage}
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full px-4 py-3 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                >
                  {saving ? 'Saving...' : 'Save Training Baselines'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  </div>
);
}