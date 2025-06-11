import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables
  const env = loadEnv(mode, process.cwd(), '')
  
  // Get backend port from environment variable or use default
  const backendPort = process.env.VITE_BACKEND_PORT || env.VITE_BACKEND_PORT || '3004';
  
  console.log(`Vite: Proxying API requests to backend port ${backendPort}`);
  
  return {
    plugins: [react()],
    server: {
      // Configure proxy to forward API requests to the backend server
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        }
      }
    }
  }
})