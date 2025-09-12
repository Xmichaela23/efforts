-- Add weather_data column to workouts table
ALTER TABLE workouts 
ADD COLUMN weather_data JSONB;

-- Add index for weather data queries
CREATE INDEX IF NOT EXISTS idx_workouts_weather_data 
ON workouts USING GIN (weather_data);

-- Add comment
COMMENT ON COLUMN workouts.weather_data IS 'Weather conditions during workout (temperature, condition, humidity, wind, precipitation)';
