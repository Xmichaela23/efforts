import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['mapbox-gl']
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true }
  },
  ssr: {
    noExternal: ['mapbox-gl']
  },
  server: {
    port: 8080,
    proxy: {
      '/api/garmin/di-oauth2-service': {
        target: 'https://connectapi.garmin.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/garmin/, ''),
        secure: true
      },
      '/api/garmin': {
        target: 'https://apis.garmin.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/garmin/, ''),
        secure: true
      }
    }
  }
})