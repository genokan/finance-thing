import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds into ../server/public so the Express server serves the compiled SPA
// directly (server reads from dist/../public at runtime).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
