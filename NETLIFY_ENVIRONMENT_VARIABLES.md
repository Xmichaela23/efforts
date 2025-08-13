# Netlify Environment Variables

This document lists all environment variables configured in Netlify for the **efforts.work** project.

## **Current Environment Variables**

### **Strava API Integration**
```
VITE_STRAVA_CLIENT_ID=168897
VITE_STRAVA_CLIENT_SECRET=[REDACTED]
```
- **Purpose**: Strava OAuth authentication and API access
- **Scope**: All scopes
- **Context**: Same value in all deploy contexts
- **Status**: ✅ Active

### **Mapbox Integration**
```
VITE_MAPBOX_ACCESS_TOKEN=[REDACTED]
```
- **Purpose**: Mapbox maps and geolocation services
- **Scope**: All scopes
- **Context**: Same value in all deploy contexts
- **Status**: ✅ Active

## **How to Access These Variables**

### **In Frontend Code (React/Vite)**
```typescript
// Access Strava credentials
const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET;

// Access Mapbox token
const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
```

### **In Supabase Edge Functions**
```typescript
// Access from Deno environment
const stravaClientId = Deno.env.get('VITE_STRAVA_CLIENT_ID');
const stravaClientSecret = Deno.env.get('VITE_STRAVA_CLIENT_SECRET');
```

## **Adding New Environment Variables**

### **Steps:**
1. Go to Netlify Dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Click **"Add a variable"**
4. Fill in:
   - **Key**: Variable name (e.g., `VITE_NEW_SERVICE_KEY`)
   - **Value**: Variable value
   - **Secret**: Check if contains sensitive data
   - **Scopes**: Usually "All scopes"
   - **Context**: Usually "Same value in all deploy contexts"
5. Click **"Create variable"**

### **Naming Convention:**
- **Frontend variables**: Use `VITE_` prefix
- **Backend/function variables**: Use descriptive names without prefix
- **Secret variables**: Check "Contains secret values"

## **Security Notes**

- **Client IDs** (like Strava Client ID) are safe to expose in frontend
- **Client Secrets** and **API Keys** should be marked as secrets
- Never commit environment variables to version control
- Use Netlify's secret management for sensitive values

## **Deployment**

- Environment variables are automatically available after creation
- Netlify will rebuild your site with new variables
- Changes take effect immediately after deployment

## **Troubleshooting**

### **Variable Not Available:**
- Check if variable name matches exactly (case-sensitive)
- Ensure variable is added to correct Netlify site
- Verify variable scope and context settings
- Check Netlify build logs for any errors

### **Common Issues:**
- **Undefined values**: Variable not added or named incorrectly
- **Build failures**: Check variable syntax and values
- **Runtime errors**: Verify variable scope and context

---

**Last Updated**: [Current Date]
**Project**: efforts.work
**Platform**: Netlify
