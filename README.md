# Efforts - Fitness Tracking & Training Plans

A React + TypeScript fitness app that integrates with Garmin Connect to display GPS routes, workout analytics, and generates training plans using proven methodology.

## 🚀 **Current Status: LIVE & WORKING**

The app is **fully functional** with:
- ✅ **Garmin Integration** - Automatic workout sync via webhooks
- ✅ **GPS Route Maps** - Interactive Mapbox maps showing workout paths
- ✅ **Elevation Charts** - Interactive elevation profiles with metric overlays
- ✅ **Workout Analytics** - Comprehensive performance metrics and data
- ✅ **Training Plans** - 12-week triathlon plans using proven methodology

## 🎯 **Current Focus: Elevation Chart Enhancement**

We're currently working on improving the **Completed Tab** elevation chart experience:

### **What We're Building:**
- **Interactive Elevation Profile** - Strava-style fixed height, responsive width
- **Metric Selection** - Toggle between Pace, Heart Rate (BPM), and VAM
- **Smart Cursor** - Shows selected metric data as you scroll through workout
- **Clean UI** - Minimal Scandinavian design, no cards/borders/black boxes

### **Current Implementation:**
- **`CleanElevationChart`** - New, clean component handling metric selection and data display
- **Metric Buttons** - Simple text with underlines (Pace, BPM, VAM)
- **Interactive Tooltips** - Show distance, elevation, and selected metric data
- **Scroll Control** - Range slider to navigate through workout timeline

### **Recent Fixes:**
- ✅ **Map Loading** - Fixed Mapbox initialization and GPS route display
- ✅ **Metric Buttons** - Enhanced visibility with colors and shadows
- ✅ **Chart Rendering** - Increased height and improved data processing
- ✅ **Tooltip Data** - Shows selected metric values, not just elevation

## 🏗️ **Architecture**

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Maps**: Mapbox GL JS for GPS route display
- **Charts**: Recharts for elevation profiles and data visualization
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Data**: Garmin Connect integration via webhooks

## 🚀 **Quick Start**

```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

## 🔑 **Environment Variables**

- `VITE_MAPBOX_ACCESS_TOKEN` - For GPS route maps
- Supabase credentials for database and auth

## 📁 **Key Components**

- **`CompletedTab.tsx`** - Main workout detail view with map and elevation chart
- **`CleanElevationChart.tsx`** - Interactive elevation profile with metric selection
- **`ActivityMap.tsx`** - Mapbox GPS route display
- **`useWorkouts.ts`** - Data fetching and transformation hook

## 🎨 **Design Principles**

- **Minimal Scandinavian Design** - Clean, uncluttered interfaces
- **No Cards/Borders** - Direct content presentation
- **Inter Font** - Modern, readable typography
- **Responsive Layout** - Works on all device sizes

## 📚 **Documentation**

- **`APP_BIBLE.md`** - Complete development philosophy and architecture
- **`QUICK_START_FOR_NEW_CHAT.md`** - Quick setup for new developers
- **`GARMIN_ACTIVITY_API.md`** - Garmin Connect integration details
- **`GARMIN_TRAINING_API_V2.md`** - Training data API specifications
- **`GARMIN_OAUTH2_PKCE.md`** - Authentication flow documentation
- **`GARMIN_DATABASE_SCHEMA.md`** - Database structure for Garmin data

---

**Status**: ✅ **Production Ready** - All core features working, currently enhancing elevation chart UX
**Last Updated**: January 2025
**Next Milestone**: Perfect the interactive elevation chart experience 