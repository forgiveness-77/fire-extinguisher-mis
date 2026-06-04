import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/users':         { target: 'http://localhost:3001', changeOrigin: true },
      '/api/notifications': { target: 'http://localhost:3001', changeOrigin: true },
      '/api/extinguishers': { target: 'http://localhost:3002', changeOrigin: true },
      '/api/inspections':   { target: 'http://localhost:3003', changeOrigin: true },
      '/api/maintenance':   { target: 'http://localhost:3003', changeOrigin: true },
      '/api/reports':       { target: 'http://localhost:3004', changeOrigin: true },
    },
  },
});
