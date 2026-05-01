import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
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
