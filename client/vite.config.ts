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
    port: 3000,
    proxy: {
      // Backend runs on 3001 in dev (Vite owns 3000); /api is proxied to it.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
