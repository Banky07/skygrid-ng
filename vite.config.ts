import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev: forward /api/metar to NOAA (on Vercel, api/metar.js does this).
    proxy: {
      '/api/metar': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        rewrite: path => '/api/data/metar?format=json&' + (path.split('?')[1] ?? 'ids=DNMM,DNAA'),
      },
    },
  },
})
