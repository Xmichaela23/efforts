import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, File, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface FitFileImporterProps {
  onWorkoutsImported: (workouts: any[]) => void;
}

interface ImportedWorkout {
  id: string;
  name: string;
  type: string;
  date: string;
  duration: number;
  distance?: number;
  metrics: {
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_power?: number;
    max_power?: number;
    normalized_power?: number;
    calories?: number;
    elevation_gain?: number;
    avg_speed?: number;
    max_speed?: number;
    avg_cadence?: number;
    max_cadence?: number;
    training_stress_score?: number;
    intensity_factor?: number;
    avg_temperature?: number;
    max_temperature?: number;
  };
  deviceInfo: {
    manufacturer?: string;
    product?: string;
  };
}

// Load the fit-file-parser library dynamically
const loadFitParser = async () => {
  if (window.FitParser) {
    return window.FitParser;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.skypack.dev/fit-file-parser';
    script.type = 'module';
    script.onload = () => {
      // The library exports as default, but we need to access it properly
      import('https://cdn.skypack.dev/fit-file-parser')
        .then(module => {
          window.FitParser = module.default;
          resolve(module.default);
        })
        .catch(reject);
    };
    script.onerror = () => reject(new Error('Failed to load FIT parser library'));
    document.head.appendChild(script);
  });
};

// Sport type mapping from FIT to our app types
const mapFitSportToAppType = (sport: string): string => {
  if (!sport) return 'ride'; // Default to ride for cycling files
  
  const sportLower = sport.toLowerCase();
  
  if (sportLower.includes('cycling') || sportLower.includes('biking') || sport === 'cycling') {
    return 'ride';
  } else if (sportLower.includes('running') || sport === 'running') {
    return 'run';
  } else if (sportLower.includes('swimming') || sport === 'swimming') {
    return 'swim';
  } else if (sportLower.includes('strength') || sportLower.includes('training') || sportLower.includes('fitness')) {
    return 'strength';
  } else {
    console.log(`Unknown sport "${sport}", defaulting to 'ride'`);
    return 'ride';
  }
};

const FitFileImporter: React.FC<FitFileImporterProps> = ({ onWorkoutsImported }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ImportedWorkout[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parserLoaded, setParserLoaded] = useState(false);

  // Initialize the FIT parser
  React.useEffect(() => {
    loadFitParser()
      .then(() => {
        setParserLoaded(true);
        console.log('FIT parser loaded successfully');
      })
      .catch(error => {
        console.error('Failed to load FIT parser:', error);
        setErrors(['Failed to load FIT file parser. Please refresh the page and try again.']);
      });
  }, []);

  const parseFitFile = async (file: File): Promise<ImportedWorkout> => {
    if (!window.FitParser) {
      throw new Error('FIT parser not loaded');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Create FitParser instance with optimal settings
          const fitParser = new window.FitParser({
            force: true,
            speedUnit: 'km/h',
            lengthUnit: 'km',
            temperatureUnit: 'celsius',
            pressureUnit: 'bar',
            elapsedRecordField: true,
            mode: 'both', // Use 'both' mode like the examples show
          });

          fitParser.parse(arrayBuffer, (error: any, data: any) => {
            if (error) {
              console.error('FIT parsing error:', error);
              reject(new Error(`Failed to parse FIT file: ${error.message || error}`));
              return;
            }

            try {
              console.log('Raw FIT data:', data);
              
              // 🔧 DEBUG: Check what data structure we actually get
              console.log('DEBUG - data.sessions exists?', !!data.sessions);
              console.log('DEBUG - data.sessions type:', typeof data.sessions);  
              console.log('DEBUG - data.sessions length:', data.sessions?.length);
              console.log('DEBUG - all data keys:', Object.keys(data));
              
              // 🔧 FIXED: Extract date from the correct location - prioritize local_timestamp
              let workoutDate = new Date().toISOString().split('T')[0]; // fallback to today
              
              console.log('🔧 DEBUG: Available timestamps:', {
                local_timestamp: data.local_timestamp,
                timestamp: data.timestamp,
                sessions_start_time: data.sessions?.[0]?.start_time
              });
              
              if (data.local_timestamp) {
                const dateObj = new Date(data.local_timestamp);
                workoutDate = dateObj.getFullYear() + '-' + 
                  String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(dateObj.getDate()).padStart(2, '0');
                console.log('✅ Using local_timestamp for date:', workoutDate);
              } else if (data.timestamp) {
                const dateObj = new Date(data.timestamp);
                workoutDate = dateObj.getFullYear() + '-' + 
                  String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(dateObj.getDate()).padStart(2, '0');
                console.log('✅ Using timestamp for date:', workoutDate);
              } else if (data.sessions && data.sessions[0] && data.sessions[0].start_time) {
                const dateObj = new Date(data.sessions[0].start_time);
                workoutDate = dateObj.getFullYear() + '-' + 
                  String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(dateObj.getDate()).padStart(2, '0');
                console.log('✅ Using sessions[0].start_time for date:', workoutDate);
              } else {
                console.log('⚠️ No timestamp found, using today:', workoutDate);
              }

              // 🔧 FIXED: Extract session data from the correct location
              let session = null;
              if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
                session = data.sessions[0];
                console.log('✅ Found sessions[0]:', session);
              } else {
                console.log('❌ No sessions array found, trying alternatives');
                console.log('DEBUG - Looking for alternative session data...');
                
                // Try alternative paths based on different parser modes
                if (data.activity) {
                  session = data.activity;
                  console.log('✅ Using data.activity as session:', session);
                } else if (data.session) {
                  session = data.session;
                  console.log('✅ Using data.session as session:', session);
                } else {
                  console.log('❌ No session data found in any location');
                  session = {}; // Create empty session to prevent crash
                }
              }

              // 🔧 FIXED: Extract sport from the correct location
              let sport = 'cycling'; // default
              if (data.sports && Array.isArray(data.sports) && data.sports[0] && data.sports[0].sport) {
                sport = data.sports[0].sport;
                console.log('✅ Found sport in sports array:', sport);
              } else if (session.sport) {
                sport = session.sport;
                console.log('✅ Found sport in session:', sport);
              } else {
                console.log('⚠️ No sport found, using default:', sport);
              }
              
              const workoutType = mapFitSportToAppType(sport);
              console.log('✅ Mapped sport to app type:', sport, '→', workoutType);

              // 🔧 FIXED: Extract duration from session and ensure it's a valid number
              const duration = session.total_elapsed_time ? Math.round(Number(session.total_elapsed_time)) : 
                              session.total_timer_time ? Math.round(Number(session.total_timer_time)) : 
                              0;
              console.log('✅ Extracted duration:', duration, 'seconds');

              // 🔧 FIXED: Extract distance from session and ensure it's a valid number or null
              const distance = session.total_distance ? 
                Math.round(Number(session.total_distance) * 100) / 100 : 
                null;
              console.log('✅ Extracted distance:', distance, 'km');

              // 🔧 CRITICAL FIX: Check multiple possible elevation field names
              let elevationGain = null;
              console.log('🔧 DEBUG: Checking all elevation fields in session:');
              console.log('  session.total_ascent:', session.total_ascent);
              console.log('  session.elevation_gain:', session.elevation_gain);
              console.log('  session.ascent:', session.ascent);
              console.log('  session.total_elevation_gain:', session.total_elevation_gain);
              console.log('  session.enhanced_ascent:', session.enhanced_ascent);
              
              if (session.total_ascent) {
                // 🔧 CRITICAL FIX: total_ascent is in kilometers, convert to meters
                elevationGain = Math.round(Number(session.total_ascent) * 1000);
                console.log('✅ Using total_ascent for elevation:', elevationGain, 'meters (converted from', session.total_ascent, 'km)');
              } else if (session.elevation_gain) {
                elevationGain = Math.round(Number(session.elevation_gain));
                console.log('✅ Using elevation_gain for elevation:', elevationGain);
              } else if (session.ascent) {
                elevationGain = Math.round(Number(session.ascent));
                console.log('✅ Using ascent for elevation:', elevationGain);
              } else if (session.total_elevation_gain) {
                elevationGain = Math.round(Number(session.total_elevation_gain));
                console.log('✅ Using total_elevation_gain for elevation:', elevationGain);
              } else if (session.enhanced_ascent) {
                elevationGain = Math.round(Number(session.enhanced_ascent));
                console.log('✅ Using enhanced_ascent for elevation:', elevationGain);
              } else {
                console.log('❌ No elevation field found in session');
              }

              // 🔧 FIXED: Extract all metrics directly from session object and sanitize for database
              const metrics = {
                // Heart Rate - ensure numbers or null
                avg_heart_rate: session.avg_heart_rate ? Number(session.avg_heart_rate) : null,
                max_heart_rate: session.max_heart_rate ? Number(session.max_heart_rate) : null,
                
                // Power (cycling) - ensure numbers or null
                avg_power: session.avg_power ? Number(session.avg_power) : null,
                max_power: session.max_power ? Number(session.max_power) : null,
                normalized_power: session.normalized_power ? Number(session.normalized_power) : null,
                
                // Calories & Energy - ensure numbers or null
                calories: session.total_calories ? Number(session.total_calories) : null,
                
                // 🔧 FIXED: Use the elevation value we found from multiple possible fields
                elevation_gain: elevationGain,
                
                // Speed - ensure numbers or null
                avg_speed: session.enhanced_avg_speed ? Number(session.enhanced_avg_speed) : 
                          session.avg_speed ? Number(session.avg_speed) : null,
                max_speed: session.enhanced_max_speed ? Number(session.enhanced_max_speed) : 
                          session.max_speed ? Number(session.max_speed) : null,
                
                // Cadence - ensure numbers or null
                avg_cadence: session.avg_cadence ? Number(session.avg_cadence) : null,
                max_cadence: session.max_cadence ? Number(session.max_cadence) : null,
                
                // Advanced Training Metrics - ensure numbers or null
                training_stress_score: session.training_stress_score ? Number(session.training_stress_score) : null,
                // 🔧 CRITICAL FIX: Convert intensity_factor from decimal to percentage (0.498 → 50)
                intensity_factor: session.intensity_factor ? Math.round(Number(session.intensity_factor) * 100) : null,
                
                // Temperature - ensure numbers or null
                avg_temperature: session.avg_temperature ? Number(session.avg_temperature) : null,
                max_temperature: session.max_temperature ? Number(session.max_temperature) : null,
              };

              console.log('✅ Extracted metrics from session:', metrics);
              console.log('🔧 DEBUG - Individual metric values:');
              console.log('  avg_heart_rate:', typeof metrics.avg_heart_rate, metrics.avg_heart_rate);
              console.log('  avg_power:', typeof metrics.avg_power, metrics.avg_power);
              console.log('  elevation_gain:', typeof metrics.elevation_gain, metrics.elevation_gain, 'meters');
              console.log('  intensity_factor:', typeof metrics.intensity_factor, metrics.intensity_factor, '(converted from decimal to percentage)');
              console.log('  duration:', typeof duration, duration);
              console.log('  distance:', typeof distance, distance);

              // Create the workout object with proper data types for database
              const workout: ImportedWorkout = {
                id: `fit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: file.name.replace('.fit', '').replace(/[_-]/g, ' '),
                type: workoutType,
                date: workoutDate,
                duration: duration,
                distance: distance,
                // 🔧 FIXED: Don't include nested metrics object - it causes database issues
                metrics: {
                  avg_heart_rate: metrics.avg_heart_rate,
                  max_heart_rate: metrics.max_heart_rate,
                  avg_power: metrics.avg_power,
                  max_power: metrics.max_power,
                  normalized_power: metrics.normalized_power,
                  calories: metrics.calories,
                  elevation_gain: metrics.elevation_gain,
                  avg_speed: metrics.avg_speed,
                  max_speed: metrics.max_speed,
                  avg_cadence: metrics.avg_cadence,
                  max_cadence: metrics.max_cadence,
                  training_stress_score: metrics.training_stress_score,
                  intensity_factor: metrics.intensity_factor,
                  avg_temperature: metrics.avg_temperature,
                  max_temperature: metrics.max_temperature,
                },
                deviceInfo: {
                  manufacturer: data.file_id?.manufacturer || data.file_creator?.software_version || 'Unknown',
                  product: data.file_id?.product || 'FIT Device'
                }
              };

              console.log('✅ Created workout from FIT data:', workout);
              console.log('📊 Final extracted metrics:', workout.metrics);
              resolve(workout);
              
            } catch (processingError) {
              console.error('Error processing FIT data:', processingError);
              reject(new Error(`Error processing workout data: ${processingError.message}`));
            }
          });
          
        } catch (parseError) {
          console.error('Error reading FIT file:', parseError);
          reject(new Error(`Error reading file: ${parseError.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (!parserLoaded) {
      setErrors(['FIT parser is still loading. Please wait a moment and try again.']);
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    const fitFiles = files.filter(file => 
      file.name.toLowerCase().endsWith('.fit')
    );
    
    if (fitFiles.length === 0) {
      setErrors(['Please drop only .fit files']);
      return;
    }
    
    setIsProcessing(true);
    setErrors([]);
    const processedWorkouts: ImportedWorkout[] = [];
    const processingErrors: string[] = [];
    
    for (const file of fitFiles) {
      try {
        console.log(`Processing FIT file: ${file.name}`);
        const workout = await parseFitFile(file);
        processedWorkouts.push(workout);
        console.log(`Successfully processed: ${file.name}`);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        processingErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    setProcessedFiles(processedWorkouts);
    setErrors(processingErrors);
    setIsProcessing(false);
    
    if (processedWorkouts.length > 0) {
      onWorkoutsImported(processedWorkouts);
    }
  }, [onWorkoutsImported, parserLoaded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!parserLoaded) {
      setErrors(['FIT parser is still loading. Please wait a moment and try again.']);
      return;
    }
    
    const files = Array.from(e.target.files || []);
    const fitFiles = files.filter(file => 
      file.name.toLowerCase().endsWith('.fit')
    );
    
    if (fitFiles.length === 0) {
      setErrors(['Please select only .fit files']);
      return;
    }
    
    setIsProcessing(true);
    setErrors([]);
    const processedWorkouts: ImportedWorkout[] = [];
    const processingErrors: string[] = [];
    
    for (const file of fitFiles) {
      try {
        console.log(`Processing FIT file: ${file.name}`);
        const workout = await parseFitFile(file);
        processedWorkouts.push(workout);
        console.log(`Successfully processed: ${file.name}`);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        processingErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    setProcessedFiles(processedWorkouts);
    setErrors(processingErrors);
    setIsProcessing(false);
    
    if (processedWorkouts.length > 0) {
      onWorkoutsImported(processedWorkouts);
    }
  }, [onWorkoutsImported, parserLoaded]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Import FIT Files</h2>
        <p className="text-gray-600">
          Upload your .fit files from Garmin, Wahoo, or other devices. 
          All metrics including power, heart rate, elevation, and training data will be extracted automatically.
        </p>
      </div>

      {/* Parser Status */}
      {!parserLoaded && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
          <Info className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0" />
          <span className="text-blue-700">Loading FIT file parser...</span>
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : parserLoaded 
              ? 'border-gray-300 hover:border-gray-400'
              : 'border-gray-200 bg-gray-50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className={`mx-auto h-12 w-12 mb-4 ${
          isDragOver 
            ? 'text-blue-500' 
            : parserLoaded 
              ? 'text-gray-400'
              : 'text-gray-300'
        }`} />
        
        {isProcessing ? (
          <div>
            <p className="text-lg font-medium mb-2">Processing FIT files...</p>
            <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium mb-2">
              {parserLoaded 
                ? 'Drop .fit files here or click to select' 
                : 'Loading FIT parser...'}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Automatically extracts sport type, power, heart rate, elevation, and all training metrics
            </p>
            <input
              type="file"
              accept=".fit"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="file-input"
              disabled={!parserLoaded}
            />
            <label htmlFor="file-input">
              <Button className="cursor-pointer" disabled={!parserLoaded}>
                <File className="h-4 w-4 mr-2" />
                Select FIT Files
              </Button>
            </label>
          </div>
        )}
      </div>

      {/* Supported Metrics Info */}
      {parserLoaded && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Automatically Extracted Metrics:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
            <div>• Activity Type</div>
            <div>• Distance & Duration</div>
            <div>• Heart Rate (avg/max)</div>
            <div>• Power (avg/max/NP)</div>
            <div>• Speed & Pace</div>
            <div>• Cadence</div>
            <div>• Elevation Gain</div>
            <div>• Calories</div>
            <div>• Training Stress Score</div>
            <div>• Temperature</div>
            <div>• Intensity Factor</div>
            <div>• Device Information</div>
          </div>
        </div>
      )}

      {/* Results */}
      {processedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            Successfully Imported ({processedFiles.length})
          </h3>
          <div className="space-y-3">
            {processedFiles.map((workout, index) => (
              <div key={index} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{workout.name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">{workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}</span>
                      {' • '}{workout.date}
                      {workout.duration > 0 && ` • ${Math.floor(workout.duration / 3600)}:${Math.floor((workout.duration % 3600) / 60).toString().padStart(2, '0')}:${(workout.duration % 60).toString().padStart(2, '0')}`}
                      {workout.distance && ` • ${workout.distance} km`}
                    </p>
                    {/* Show key metrics */}
                    <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-3">
                      {workout.metrics.avg_heart_rate && (
                        <span>HR: {workout.metrics.avg_heart_rate} bpm</span>
                      )}
                      {workout.metrics.avg_power && (
                        <span>Power: {workout.metrics.avg_power}W</span>
                      )}
                      {workout.metrics.calories && (
                        <span>Calories: {workout.metrics.calories}</span>
                      )}
                      {workout.metrics.elevation_gain && (
                        <span>Elevation: {workout.metrics.elevation_gain}m</span>
                      )}
                      {workout.metrics.training_stress_score && (
                        <span>TSS: {workout.metrics.training_stress_score}</span>
                      )}
                      {workout.metrics.intensity_factor && (
                        <span>IF: {workout.metrics.intensity_factor}%</span>
                      )}
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            Errors ({errors.length})
          </h3>
          <div className="space-y-2">
            {errors.map((error, index) => (
              <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Extend window object for TypeScript
declare global {
  interface Window {
    FitParser: any;
  }
}

export default FitFileImporter;