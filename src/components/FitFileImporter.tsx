/**
 * ⛔ THE PHONE NO LONGER PARSES THE FILE (2026-09-10, audit H-D05). It used to load a parser from a
 * CDN at run time, build the workout summary itself (sport defaulted to ride, elevation loss stored
 * 1,000x too small, intensity factor as 50 where the analysis stores 0.50) and send no samples. Each
 * file now goes up as it is to `import-fit-file`, which parses it, saves the row through
 * `save-imported-workout` (which runs recompute-workout) and answers with the saved row and the summary
 * this screen prints. Nothing about the file is worked out here.
 */
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, File, CheckCircle, AlertCircle } from 'lucide-react';
import { invokeFunctionFormData } from '@/lib/supabase';

/** What `import-fit-file` answers per file: the saved row and the summary the card prints. */
export type FitImportResult = { workout: any; imported: ImportedWorkout };

interface FitFileImporterProps {
  onWorkoutsImported: (results: FitImportResult[]) => void;
}

interface ImportedWorkout {
  id: string;
  name: string;
  type: string;
  date: string;
  duration: number;
  distance?: number;
  
  // 🆕 NEW TOP-LEVEL FIELDS for CompletedTab
  timestamp?: string;
  start_position_lat?: number;
  start_position_long?: number;
  friendly_name?: string;
  moving_time?: number;
  elapsed_time?: number;
  
  metrics: {
    // EXISTING FIELDS
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
    
    // 🆕 NEW TIME DATA
    total_timer_time?: number;
    total_elapsed_time?: number;
    
    // 🆕 NEW WORK/ENERGY
    total_work?: number;
    
    // 🆕 NEW ELEVATION
    total_descent?: number;
    
    // 🆕 NEW PERFORMANCE
    avg_vam?: number;
    total_training_effect?: number;
    total_anaerobic_effect?: number;
    
    // 🆕 NEW ZONES DATA
    functional_threshold_power?: number;
    threshold_heart_rate?: number;
    hr_calc_type?: string;
    pwr_calc_type?: string;
    
    // 🆕 NEW USER PROFILE DATA
    age?: number;
    weight?: number;
    height?: number;
    gender?: string;
    default_max_heart_rate?: number;
    resting_heart_rate?: number;
    dist_setting?: string;
    weight_setting?: string;
    
    // 🆕 NEW CYCLING DETAILS DATA
    avg_fractional_cadence?: number;
    avg_left_pedal_smoothness?: number;
    avg_left_torque_effectiveness?: number;
    max_fractional_cadence?: number;
    left_right_balance?: number;
    threshold_power?: number;
    total_cycles?: number;
  };
  
  deviceInfo: {
    manufacturer?: string;
    product?: string;
  };
}

const FitFileImporter: React.FC<FitFileImporterProps> = ({ onWorkoutsImported }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ImportedWorkout[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  /** One file up, one answer back. The server's error text is what the list prints. */
  const importFitFile = async (file: File): Promise<FitImportResult> => {
    const fd = new FormData();
    fd.append('file', file);
    const { data, error } = await invokeFunctionFormData<FitImportResult>('import-fit-file', fd);
    if (error || !data?.workout?.id || !data?.imported) {
      throw new Error(error?.message || 'Import failed');
    }
    return data;
  };

  const importFiles = async (files: File[]) => {
    setIsProcessing(true);
    setErrors([]);
    const results: FitImportResult[] = [];
    const processingErrors: string[] = [];
    for (const file of files) {
      try {
        results.push(await importFitFile(file));
      } catch (error) {
        processingErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    setProcessedFiles(results.map((r) => r.imported));
    setErrors(processingErrors);
    setIsProcessing(false);
    if (results.length > 0) {
      onWorkoutsImported(results);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const fitFiles = files.filter(file => 
      file.name.toLowerCase().endsWith('.fit')
    );
    
    if (fitFiles.length === 0) {
      setErrors(['Please drop only .fit files']);
      return;
    }
    
    await importFiles(fitFiles);
  }, [onWorkoutsImported]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const fitFiles = files.filter(file => 
      file.name.toLowerCase().endsWith('.fit')
    );
    
    if (fitFiles.length === 0) {
      setErrors(['Please select only .fit files']);
      return;
    }
    
    await importFiles(fitFiles);
  }, [onWorkoutsImported]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Import FIT Files</h2>
        <p className="text-gray-600">
          Upload your .fit files from Garmin, Wahoo, or other devices. 
          All metrics including power, heart rate, elevation, location, zones, and user profile data will be extracted automatically.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className={`mx-auto h-12 w-12 mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
        
        {isProcessing ? (
          <div>
            <p className="text-lg font-medium mb-2">Processing FIT files...</p>
            <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium mb-2">
              Drop .fit files here or click to select
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Automatically extracts sport type, power, heart rate, elevation, location, zones, user profile, and all training metrics
            </p>
            <input
              type="file"
              accept=".fit"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button className="cursor-pointer">
                <File className="h-4 w-4 mr-2" />
                Select FIT Files
              </Button>
            </label>
          </div>
        )}
      </div>

      {/* Supported Metrics Info */}
      {(
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Automatically Extracted Metrics:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
            <div>• Activity Type & Location</div>
            <div>• Distance & Duration</div>
            <div>• Heart Rate (avg/max)</div>
            <div>• Power (avg/max/NP)</div>
            <div>• Speed & Pace</div>
            <div>• Cadence & Cycling Details</div>
            <div>• Elevation Gain/Loss</div>
            <div>• Calories & Total Work</div>
            <div>• Training Stress Score</div>
            <div>• Temperature & VAM</div>
            <div>• Intensity Factor</div>
            <div>• Device & User Profile</div>
            <div>• Training Zones Data</div>
            <div>• Power Curve Details</div>
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
                      {workout.start_position_lat && workout.start_position_long && ` • GPS`}
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
                        <span>IF: {workout.metrics.intensity_factor}%</span>
                      )}
                      {workout.metrics.intensity_factor && (
                        <span>IF: {workout.metrics.intensity_factor}%</span>
                      )}
                      {workout.metrics.total_work && (
                        <span>Work: {Math.round(workout.metrics.total_work / 1000)}kJ</span>
                      )}
                      {workout.friendly_name && (
                        <span>Device: {workout.friendly_name}</span>
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

export default FitFileImporter;