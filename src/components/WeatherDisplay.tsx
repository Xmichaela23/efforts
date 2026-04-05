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
  /** Device avg temp from Strava/Garmin in °C (shown as °F) when API has no payload yet */
  fallbackTemperature?: number;
  className?: string;
}

const celsiusToF = (c: number) => Math.round((c * 9) / 5 + 32);

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({ 
  weather, 
  loading = false, 
  fallbackTemperature,
  className = ""
}) => {
  if (loading) {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <span className="text-white/60 text-xs">Loading weather...</span>
      </div>
    );
  }

  if (weather) {
    return (
      <div className={`flex items-center gap-2 text-white/90 ${className}`}>
        <span className="font-medium">
          {weather.temperature}°F
        </span>
        <span className="text-white/70">
          {weather.condition}
        </span>
        {weather.humidity && (
          <span className="text-white/60 text-xs">
            {weather.humidity}% humidity
          </span>
        )}
        {weather.windSpeed > 0 && (
          <span className="text-white/60 text-xs">
            {weather.windSpeed} mph wind
          </span>
        )}
      </div>
    );
  }

  if (fallbackTemperature != null && Number.isFinite(Number(fallbackTemperature))) {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <span className="text-white/90">
          {celsiusToF(Number(fallbackTemperature))}°F
        </span>
      </div>
    );
  }

  return null;
};

export default WeatherDisplay;
