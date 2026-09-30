// Cesium loads workers and assets from here (copied by vite-plugin-cesium).
(window as any).CESIUM_BASE_URL = '/cesium/';

import React from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './index.css';
import App from './App';
import { ErrorBoundary } from './shell/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
