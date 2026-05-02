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
  build: {
    target: 'esnext'
  },

});
