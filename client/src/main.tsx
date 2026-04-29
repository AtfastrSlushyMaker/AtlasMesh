// Ensure Cesium finds its static assets correctly in Vite
(window as any).CESIUM_BASE_URL = '/cesium/';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
