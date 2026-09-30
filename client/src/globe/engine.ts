import * as Cesium from 'cesium';

/**
 * Viewer construction and imagery. Everything Cesium-specific that isn't a
 * data layer lives here.
 */

export type Basemap = 'satellite' | 'dark' | 'light' | 'terrain';
export type Overlay = 'labels' | 'radar' | 'clouds' | 'nightlights';

export const BASEMAPS: Array<{ id: Basemap; label: string; attribution: string }> = [
  { id: 'satellite', label: 'Satellite', attribution: 'Esri, Maxar, Earthstar Geographics' },
  { id: 'dark', label: 'Dark', attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' },
  { id: 'light', label: 'Light', attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' },
  { id: 'terrain', label: 'Topographic', attribution: 'Esri, HERE, Garmin, USGS' },
];

export const OVERLAYS: Array<{ id: Overlay; label: string; description: string; attribution: string }> = [
  { id: 'labels', label: 'Place names', description: 'Country, city and boundary labels', attribution: 'Esri' },
  { id: 'radar', label: 'Rain radar', description: 'Latest precipitation radar mosaic, refreshed every 10 minutes', attribution: 'RainViewer' },
  { id: 'clouds', label: 'Yesterday from orbit', description: 'MODIS true-colour imagery from the previous day', attribution: 'NASA GIBS / MODIS Terra' },
  { id: 'nightlights', label: 'City lights', description: 'VIIRS Black Marble night-time lights', attribution: 'NASA GIBS / VIIRS' },
];

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

function basemapProvider(id: Basemap) {
  switch (id) {
    // CARTO basemaps now require an API key (they return watermark tiles), so these use Esri Canvas.
    case 'dark':
      return new Cesium.UrlTemplateImageryProvider({ url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maximumLevel: 16, credit: 'Esri' });
    case 'light':
      return new Cesium.UrlTemplateImageryProvider({ url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maximumLevel: 16, credit: 'Esri' });
    case 'terrain':
      return new Cesium.UrlTemplateImageryProvider({ url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, maximumLevel: 18, credit: 'Esri' });
    default:
      return new Cesium.UrlTemplateImageryProvider({ url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maximumLevel: 18, credit: 'Esri' });
  }
}

function gibsDate(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

async function overlayProvider(id: Overlay, basemap: Basemap): Promise<Cesium.ImageryProvider | null> {
  switch (id) {
    case 'labels':
      return new Cesium.UrlTemplateImageryProvider({
        url:
          basemap === 'dark'
            ? `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`
            : basemap === 'light'
              ? `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`
              : `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
        maximumLevel: 16,
        credit: 'Esri',
      });
    case 'radar': {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const meta = await res.json();
      const frame = meta?.radar?.past?.at(-1);
      if (!frame) return null;
      return new Cesium.UrlTemplateImageryProvider({ url: `${meta.host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`, maximumLevel: 7, credit: 'RainViewer' });
    }
    case 'clouds':
      return new Cesium.UrlTemplateImageryProvider({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate(1)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        maximumLevel: 9,
        credit: 'NASA GIBS',
      });
    case 'nightlights':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
        maximumLevel: 8,
        credit: 'NASA GIBS',
      });
  }
}

const OVERLAY_ALPHA: Record<Overlay, number> = { labels: 1, radar: 0.7, clouds: 0.85, nightlights: 0.9 };

export function createViewer(container: HTMLElement) {
  (Cesium.Ion as any).defaultAccessToken = undefined;
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    creditContainer: document.createElement('div'),
    baseLayer: new Cesium.ImageryLayer(basemapProvider('satellite')),
    // Render on demand when idle; layers call requestRender after updates.
    requestRenderMode: true,
    maximumRenderTimeChange: 0.5,
    msaaSamples: 2,
  });
  const scene = viewer.scene;
  scene.rethrowRenderErrors = false;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0e1822');
  scene.globe.maximumScreenSpaceError = 2;
  scene.backgroundColor = Cesium.Color.fromCssColorString('#05090d');
  scene.fog.enabled = true;
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.hueShift = -0.04;
    scene.skyAtmosphere.saturationShift = -0.25;
    scene.skyAtmosphere.brightnessShift = -0.15;
  }
  const ctrl = scene.screenSpaceCameraController;
  ctrl.minimumZoomDistance = 150;
  ctrl.maximumZoomDistance = 60_000_000;
  ctrl.inertiaSpin = 0.9;
  ctrl.inertiaTranslate = 0.9;
  ctrl.inertiaZoom = 0.6;
  // Cesium's default (5) jumps orders of magnitude per wheel notch.
  (ctrl as any)._zoomFactor = 2.5;
  viewer.clock.shouldAnimate = true;
  viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
  viewer.clock.currentTime = Cesium.JulianDate.now();

  // Initial view: whole Earth, slightly tilted toward the user's longitude.
  const lon = -((new Date().getTimezoneOffset() / 60) * 15);
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, 20, 22_000_000) });
  return viewer;
}

export function setBasemap(viewer: Cesium.Viewer, id: Basemap) {
  const layers = viewer.imageryLayers;
  const base = layers.get(0);
  const next = new Cesium.ImageryLayer(basemapProvider(id));
  layers.add(next, 0);
  if (base) layers.remove(base, true);
  viewer.scene.requestRender();
}

const overlayLayers = new Map<Overlay, Cesium.ImageryLayer>();

export async function setOverlay(viewer: Cesium.Viewer, id: Overlay, on: boolean, basemap: Basemap) {
  const existing = overlayLayers.get(id);
  if (existing) {
    viewer.imageryLayers.remove(existing, true);
    overlayLayers.delete(id);
  }
  if (!on) {
    viewer.scene.requestRender();
    return;
  }
  const provider = await overlayProvider(id, basemap);
  if (!provider || viewer.isDestroyed()) return;
  const layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = OVERLAY_ALPHA[id];
  // Keep labels above data overlays.
  if (id !== 'labels') {
    const labels = overlayLayers.get('labels');
    if (labels) viewer.imageryLayers.raiseToTop(labels);
  }
  overlayLayers.set(id, layer);
  viewer.scene.requestRender();
}

export function flyTo(viewer: Cesium.Viewer, lat: number, lon: number, height = 1_500_000) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    duration: 1.6,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}
