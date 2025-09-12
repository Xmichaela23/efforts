import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  timestamp: string;
}

interface WeatherResponse {
  weather?: WeatherData;
  error?: string;
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: { 'Access-Control-Allow-Origin': '*' } 
    });
  }

  try {
    const { lat, lng, timestamp, workout_id } = await req.json();
    
    if (!lat || !lng || !timestamp) {
      return new Response(JSON.stringify({ 
        error: 'lat, lng, and timestamp are required' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // Check if we already have weather data for this workout
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (workout_id) {
      const { data: existing } = await supabase
        .from('workouts')
        .select('weather_data')
        .eq('id', workout_id)
        .single();
      
      if (existing?.weather_data) {
        return new Response(JSON.stringify({ 
          weather: existing.weather_data 
        }), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
        });
      }
    }

    // Get weather data from OpenWeatherMap
    const weatherData = await fetchWeatherData(lat, lng, timestamp);
    
    if (!weatherData) {
      return new Response(JSON.stringify({ 
        error: 'Unable to fetch weather data' 
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // Store weather data in workout record if workout_id provided
    if (workout_id) {
      await supabase
        .from('workouts')
        .update({ weather_data: weatherData })
        .eq('id', workout_id);
    }

    return new Response(JSON.stringify({ 
      weather: weatherData 
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });

  } catch (error) {
    console.error('Weather lookup error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
});

async function fetchWeatherData(lat: number, lng: number, timestamp: string): Promise<WeatherData | null> {
  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    console.error('OPENWEATHER_API_KEY not configured');
    return null;
  }

  try {
    // Convert timestamp to Unix timestamp for historical data
    const workoutDate = new Date(timestamp);
    const unixTimestamp = Math.floor(workoutDate.getTime() / 1000);
    
    // For historical data, we need to use the One Call API 3.0
    // For now, let's use current weather as a fallback
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=imperial`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      temperature: Math.round(data.main.temp),
      condition: data.weather[0].main,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      windDirection: data.wind.deg || 0,
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      timestamp: timestamp
    };
    
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}
