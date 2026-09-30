import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cesium({
      cesiumBuildRootPath: '../node_modules/cesium/Build',
      cesiumBuildPath: '../node_modules/cesium/Build/Cesium',
      cesiumBaseUrl: 'cesium',
    }),
  ],
  server: {
    // The API runs on :3000 in development; the WebSocket connects there directly.
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
  },
});
