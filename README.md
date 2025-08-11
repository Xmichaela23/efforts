# Efforts - Fitness Tracking & Training Plans

A React + TypeScript fitness app that integrates with Garmin Connect to display GPS routes, workout analytics, and generates training plans using proven methodology.

## Core Features
- **Garmin Integration**: Automatic workout sync via webhooks, GPS route display with Mapbox maps
- **Interactive Analytics**: Side-by-side GPS map and elevation profile with heart rate, power, and VAM overlays
- **Training Plans**: 12-week triathlon plans using proven balanced methodology
- **Workout Tracking**: Manual logging + Garmin auto-sync with detailed metrics

## Garmin Integration Overview
- **Webhook Sync**: Real-time workout data from Garmin Connect
- **GPS Routes**: Interactive Mapbox maps showing workout paths
- **Performance Metrics**: Heart rate, power, speed/pace overlays on elevation charts
- **Data Storage**: Supabase backend with PostgreSQL for workout history

## Quick Start
```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

## Environment Variables
- `VITE_MAPBOX_ACCESS_TOKEN` - For GPS route maps
- Supabase credentials for database and auth

See `APP_BIBLE.md` for architecture details and `GARMIN_INTEGRATION.md` for integration specifics. 