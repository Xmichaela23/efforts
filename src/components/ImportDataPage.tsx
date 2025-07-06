import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Download, Watch, Smartphone, Activity } from 'lucide-react';
import FitFileImporter from './FitFileImporter';
import GarminConnect from './GarminConnect';

interface ImportDataPageProps {
  onClose: () => void;
  onWorkoutsImported: (workouts: any[]) => void;
}

const ImportDataPage: React.FC<ImportDataPageProps> = ({ onClose, onWorkoutsImported }) => {
  const [activeTab, setActiveTab] = useState('fit');

  const handleFileImport = (workouts: any[]) => {
    onWorkoutsImported(workouts);
    // Show success message or redirect
  };

  const handleCSVImport = () => {
    // Handle CSV import
    console.log('CSV import clicked');
  };

  const handleStravaImport = () => {
    // Handle Strava bulk export import
    console.log('Strava import clicked');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-sm font-medium hover:bg-gray-50"
            >
              ← Back
            </Button>
            <h1 className="text-xl font-semibold">Import Data</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Import Your Workouts</h2>
          <p className="text-gray-600">
            Bring your training data from other platforms and devices
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="fit">FIT Files</TabsTrigger>
            <TabsTrigger value="garmin">Garmin</TabsTrigger>
            <TabsTrigger value="strava">Strava</TabsTrigger>
            <TabsTrigger value="csv">CSV/Manual</TabsTrigger>
          </TabsList>

          {/* FIT Files Tab */}
          <TabsContent value="fit" className="space-y-4">
            <FitFileImporter onWorkoutsImported={handleFileImport} />
          </TabsContent>

          {/* Garmin Connect Tab */}
          <TabsContent value="garmin" className="space-y-4">
            <GarminConnect onWorkoutsImported={handleFileImport} />
          </TabsContent>

          {/* Strava Tab */}
          <TabsContent value="strava" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-500" />
                  Import from Strava
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600">
                  Import your activities from Strava bulk export
                </div>

                <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                  <h4 className="font-medium text-blue-900">How to export from Strava:</h4>
                  <ol className="text-sm text-blue-800 space-y-1">
                    <li>1. Go to Strava.com → Settings → My Account</li>
                    <li>2. Scroll to "Download or Delete Your Account"</li>
                    <li>3. Click "Request Your Archive"</li>
                    <li>4. Download the ZIP file when ready</li>
                    <li>5. Upload the GPX files here</li>
                  </ol>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <div className="space-y-2">
                    <div className="text-sm">Drop Strava GPX files here</div>
                    <Button variant="outline" onClick={handleStravaImport}>
                      Choose GPX Files
                    </Button>
                    <div className="text-xs text-gray-500">
                      Supports bulk GPX import from Strava export
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p><strong>What gets imported:</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>GPS tracks and routes</li>
                    <li>Activity type and duration</li>
                    <li>Basic metrics (distance, elevation)</li>
                    <li>Heart rate data (if available)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CSV/Manual Tab */}
          <TabsContent value="csv" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-500" />
                  CSV Import
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600">
                  Import workouts from spreadsheets or other training apps
                </div>

                <div className="p-4 bg-green-50 rounded-lg space-y-3">
                  <h4 className="font-medium text-green-900">CSV Format Example:</h4>
                  <div className="text-sm text-green-800 font-mono bg-white p-3 rounded border">
                    Date,Type,Duration,Distance,Intensity,Notes<br/>
                    2025-01-15,Run,45min,8km,Zone2,Easy recovery<br/>
                    2025-01-16,Bike,90min,35km,Zone3,Base endurance
                  </div>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <div className="space-y-2">
                    <div className="text-sm">Drop CSV files here</div>
                    <Button variant="outline" onClick={handleCSVImport}>
                      Choose CSV File
                    </Button>
                    <div className="text-xs text-gray-500">
                      Or download our template to get started
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    View Format Guide
                  </Button>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p><strong>Supported columns:</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Date, Type (Run/Bike/Swim/Strength)</li>
                    <li>Duration (minutes or HH:MM format)</li>
                    <li>Distance, Intensity/Zone, Notes</li>
                    <li>Optional: HR, Power, Pace, RPE</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Stats */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">FIT</div>
                <div className="text-xs text-gray-500">Most comprehensive</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">GPX</div>
                <div className="text-xs text-gray-500">GPS + basic metrics</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">CSV</div>
                <div className="text-xs text-gray-500">Simple & flexible</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Need Help?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-600">
              Having trouble importing your data? We're here to help.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                View Import Guide
              </Button>
              <Button variant="outline" size="sm">
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportDataPage;