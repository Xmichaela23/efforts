import React, { useState, useEffect } from 'react';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface TrainingBaselinesProps {
  onClose: () => void;
}

interface BaselineData {
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
    equipment: {}
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assessment' | 'baselines'>('assessment');

  // Load existing baselines on component mount
  useEffect(() => {
    loadBaselines();
  }, []);

  const loadBaselines = async () => {
    try {
      setLoading(true);
      
      // ✅ REPLACED: Use actual context function
      const baselines = await loadUserBaselines();
      
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
      
      // ✅ REPLACED: Use actual context function
      await saveUserBaselines(data);
      
      setSaveMessage('Saved successfully!');
      setLastUpdated(new Date().toISOString());
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
      
    } catch (error) {
      console.error('Error saving baselines:', error);
      setSaveMessage('Error saving. Please try again.');
    } finally {
      setSaving(false);
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
                </div>

                {activeTab === 'assessment' ? (
                  /* Assessment Tab - Full Form Interface */
                  <div className="space-y-8">

              {/* Basic Information */}
              <div className="space-y-4">
                <h2 className="text-lg font-medium">Basic Information</h2>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Age</label>
                  <input
                    type="number"
                    value={data.age || ''}
                    onChange={(e) => setData(prev => ({ ...prev, age: parseInt(e.target.value) || 0 }))}
                    placeholder="Enter your age"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                  />
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

              {/* Performance Benchmarks */}
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
                          {/* Discipline-Specific Fitness Level */}
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

                          {/* Performance Level */}
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

                          {/* Performance Numbers - Always Visible */}
                          <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                            <label className="text-sm font-medium">Performance Numbers (Optional)</label>
                            
                            {disciplineId === 'running' && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-600">5K time</label>
                                  <input
                                    type="text"
                                    placeholder="22:30"
                                    value={data.performanceNumbers.fiveK || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        fiveK: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">10K time</label>
                                  <input
                                    type="text"
                                    placeholder="46:45"
                                    value={data.performanceNumbers.tenK || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        tenK: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Half Marathon</label>
                                  <input
                                    type="text"
                                    placeholder="1:42:30"
                                    value={data.performanceNumbers.halfMarathon || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        halfMarathon: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Marathon</label>
                                  <input
                                    type="text"
                                    placeholder="3:45:00"
                                    value={data.performanceNumbers.marathon || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        marathon: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            )}

                            {disciplineId === 'cycling' && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-600">FTP (watts)</label>
                                  <input
                                    type="number"
                                    placeholder="285"
                                    value={data.performanceNumbers.ftp || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        ftp: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Average Speed (mph)</label>
                                  <input
                                    type="number"
                                    placeholder="18"
                                    value={data.performanceNumbers.avgSpeed || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        avgSpeed: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            )}

                            {disciplineId === 'swimming' && (
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="text-xs text-gray-600">100-yard pace</label>
                                  <input
                                    type="text"
                                    placeholder="1:25"
                                    value={data.performanceNumbers.swimPace100 || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        swimPace100: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">200m time</label>
                                  <input
                                    type="text"
                                    placeholder="3:15"
                                    value={data.performanceNumbers.swim200Time || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        swim200Time: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">400m time</label>
                                  <input
                                    type="text"
                                    placeholder="7:45"
                                    value={data.performanceNumbers.swim400Time || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        swim400Time: e.target.value
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            )}

                            {disciplineId === 'strength' && (
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="text-xs text-gray-600">Squat 1RM (lbs)</label>
                                  <input
                                    type="number"
                                    placeholder="315"
                                    value={data.performanceNumbers.squat || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        squat: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Deadlift 1RM (lbs)</label>
                                  <input
                                    type="number"
                                    placeholder="405"
                                    value={data.performanceNumbers.deadlift || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        deadlift: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Bench 1RM (lbs)</label>
                                  <input
                                    type="number"
                                    placeholder="225"
                                    value={data.performanceNumbers.bench || ''}
                                    onChange={(e) => setData(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        bench: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            )}
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

                {/* Injury Regions - Show if they have injuries */}
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
              ) : (
                /* Baselines Tab - Clean Data Summary */
                <div className="space-y-8">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">Your Training Baselines Summary</h3>
                    <p className="text-sm text-gray-600">Quick view and edit of your key data</p>
                  </div>

                  {/* Basic Info Summary */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Basic Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-600">Age</label>
                        <p className="text-sm py-1">{data.age || 'Not set'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Training Background</label>
                        <p className="text-sm py-1">{data.trainingBackground || 'Not set'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Disciplines Summary */}
                  {data.disciplines.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-medium">Your Sports</h4>
                      <div className="space-y-4">
                        {data.disciplines.map((disciplineId) => {
                          const discipline = disciplineOptions.find(d => d.id === disciplineId);
                          if (!discipline) return null;
                          
                          return (
                            <div key={disciplineId} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <DisciplineIcon discipline={disciplineId} />
                                <h5 className="font-medium capitalize">{discipline.name}</h5>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Fitness Level: </span>
                                  <span>{data.disciplineFitness[disciplineId as keyof typeof data.disciplineFitness] || 'Not set'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Performance Level: </span>
                                  <span>{data.benchmarks[disciplineId as keyof typeof data.benchmarks] || 'Not set'}</span>
                                </div>
                              </div>

                              {/* Quick Edit Performance Numbers */}
                              {disciplineId === 'running' && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-600">5K time</label>
                                    <input
                                      type="text"
                                      placeholder="22:30"
                                      value={data.performanceNumbers.fiveK || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, fiveK: e.target.value }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">10K time</label>
                                    <input
                                      type="text"
                                      placeholder="46:45"
                                      value={data.performanceNumbers.tenK || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, tenK: e.target.value }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                </div>
                              )}

                              {disciplineId === 'cycling' && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-600">FTP (watts)</label>
                                    <input
                                      type="number"
                                      placeholder="285"
                                      value={data.performanceNumbers.ftp || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, ftp: parseInt(e.target.value) || undefined }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">Avg Speed (mph)</label>
                                    <input
                                      type="number"
                                      placeholder="18"
                                      value={data.performanceNumbers.avgSpeed || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, avgSpeed: parseInt(e.target.value) || undefined }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                </div>
                              )}

                              {disciplineId === 'swimming' && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-600">100-yard pace</label>
                                    <input
                                      type="text"
                                      placeholder="1:25"
                                      value={data.performanceNumbers.swimPace100 || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, swimPace100: e.target.value }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">200m time</label>
                                    <input
                                      type="text"
                                      placeholder="3:15"
                                      value={data.performanceNumbers.swim200Time || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, swim200Time: e.target.value }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">400m time</label>
                                    <input
                                      type="text"
                                      placeholder="7:45"
                                      value={data.performanceNumbers.swim400Time || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, swim400Time: e.target.value }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                </div>
                              )}

                              {disciplineId === 'strength' && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-600">Squat (lbs)</label>
                                    <input
                                      type="number"
                                      placeholder="315"
                                      value={data.performanceNumbers.squat || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, squat: parseInt(e.target.value) || undefined }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">Deadlift (lbs)</label>
                                    <input
                                      type="number"
                                      placeholder="405"
                                      value={data.performanceNumbers.deadlift || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, deadlift: parseInt(e.target.value) || undefined }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">Bench (lbs)</label>
                                    <input
                                      type="number"
                                      placeholder="225"
                                      value={data.performanceNumbers.bench || ''}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, bench: parseInt(e.target.value) || undefined }
                                      }))}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-black"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Injury Summary */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Injury Status</h4>
                    <p className="text-sm">{data.injuryHistory || 'Not set'}</p>
                    {data.injuryRegions.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Affected regions:</p>
                        <p className="text-sm">{data.injuryRegions.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Save Button - Shows on both tabs */}
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