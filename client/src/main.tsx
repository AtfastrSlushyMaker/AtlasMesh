// Ensure Cesium finds its static assets correctly in Vite
(window as any).CESIUM_BASE_URL = '/cesium/';

if (import.meta.env.DEV) {
  const baseUrl = (window as any).CESIUM_BASE_URL;
  console.info('[Cesium] CESIUM_BASE_URL =', baseUrl);
  fetch(`${baseUrl}Workers/createTaskProcessorWorker.js`, { method: 'HEAD' })
    .then((res) => {
      console.info('[Cesium] Worker probe status:', res.status, res.url);
    })
    .catch((err) => {
      console.warn('[Cesium] Worker probe failed:', err);
    });
}

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
