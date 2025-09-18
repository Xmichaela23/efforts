import React from 'react';

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  timestamp: string;
}

interface WeatherDisplayProps {
  weather?: WeatherData | null;
  loading?: boolean;
  fallbackTemperature?: number;
  className?: string;
}

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({ 
  weather, 
  loading = false, 
  fallbackTemperature,
  className = ""
}) => {
  if (loading) {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <span className="text-gray-500 text-xs">Loading weather...</span>
      </div>
    );
  }

  if (weather) {
    return (
      <div className={`flex items-center gap-2 text-black ${className}`}>
        <span className="font-medium">
          {String(weather.temperature)}°F
        </span>
        <span className="text-gray-600">
          {String(weather.condition ?? '')}
        </span>
        {Number.isFinite(weather.humidity as any) && (
          <span className="text-gray-500 text-xs">
            {String(weather.humidity)}% humidity
          </span>
        )}
        {Number.isFinite(weather.windSpeed as any) && weather.windSpeed > 0 && (
          <span className="text-gray-500 text-xs">
            {String(weather.windSpeed)} mph wind
          </span>
        )}
      </div>
    );
  }

  if (fallbackTemperature) {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <span className="text-black">
          {String(fallbackTemperature)}°F
        </span>
      </div>
    );
  }

  return null;
};

export default WeatherDisplay;
