import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3004, // ポート3004で起動するように設定
    // Configure proxy to forward API requests to the backend server (running on port 3000 by default)
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Assuming your Express server runs on port 3000
        changeOrigin: true,
        // Optional: rewrite path if needed, e.g., remove /api prefix
        // rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
