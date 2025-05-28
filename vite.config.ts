import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Configure proxy to forward API requests to the backend server (running on port 3004)
    proxy: {
      '/api': {
        target: 'http://localhost:3004', // Express server runs on port 3004
        changeOrigin: true,
        // Optional: rewrite path if needed, e.g., remove /api prefix
        // rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
