import {
  mdiAirplane,
  mdiFerry,
  mdiSatelliteVariant,
  mdiMapMarkerAlert,
  mdiMeteor,
  mdiFire,
  mdiLightningBolt,
  mdiWeatherCloudy,
  mdiRocketLaunch,
  mdiVolcano,
  mdiCableData,
  mdiFactory,
  mdiWindTurbine,
  mdiRouterNetwork,
  mdiStarFourPoints,
  mdiSpaceStation,
} from '@mdi/js';

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VE6P4sAAAAASUVORK5CYII=';

const createIcon = (pathData: string, color: string = '#ffffff', size: number = 48) => {
  try {
    if (typeof document === 'undefined') {
      return TRANSPARENT_PIXEL;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return TRANSPARENT_PIXEL;

    const center = size / 2;
    const radius = Math.max(10, Math.floor(size * 0.34));

    ctx.clearRect(0, 0, size, size);

    // Outer glow
    ctx.beginPath();
    ctx.arc(center, center, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fill();

    // Solid icon disc
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White Material Design glyph in center.
    ctx.save();
    ctx.translate(center, center);
    const glyphSize = size * 0.48;
    const scale = glyphSize / 24;
    ctx.scale(scale, scale);
    ctx.translate(-12, -12);
    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(pathData));
    ctx.restore();

    return canvas.toDataURL('image/png');
  } catch {
    return TRANSPARENT_PIXEL;
  }
};

export const Icons = {
  aircraft: createIcon(mdiAirplane, '#38bdf8'),
  ship: createIcon(mdiFerry, '#facc15'),
  satellite: createIcon(mdiSatelliteVariant, '#a78bfa'),
  earthquake: createIcon(mdiMapMarkerAlert, '#ef4444'),
  event: createIcon(mdiMeteor, '#f97316'),
  wildfire: createIcon(mdiFire, '#dc2626'),
  lightning: createIcon(mdiLightningBolt, '#f59e0b'),
  weather: createIcon(mdiWeatherCloudy, '#3b82f6'),
  launch: createIcon(mdiRocketLaunch, '#10b981'),
  volcano: createIcon(mdiVolcano, '#ff6b35'),
  cable: createIcon(mdiCableData, '#00ffaa'),
  powerplant: createIcon(mdiFactory, '#fbbf24'),
  meteorite: createIcon(mdiMeteor, '#fb923c'),
  windfarm: createIcon(mdiWindTurbine, '#34d399'),
  ixp: createIcon(mdiRouterNetwork, '#818cf8'),
  starlink: createIcon(mdiStarFourPoints, '#c084fc'),
  iss: createIcon(mdiSpaceStation, '#22d3ee'),
};
