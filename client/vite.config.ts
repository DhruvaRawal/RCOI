import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = process.env.RCOI_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from other devices on the local network
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
