import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/** Current conditions for major cities from Open-Meteo (free, no key), fetched in one batched request. */
const CITIES: Array<[string, number, number]> = [
  ['New York', 40.71, -74.0], ['Los Angeles', 34.05, -118.24], ['Chicago', 41.88, -87.63], ['Houston', 29.76, -95.37],
  ['Mexico City', 19.43, -99.13], ['Toronto', 43.65, -79.38], ['Vancouver', 49.28, -123.12], ['Anchorage', 61.22, -149.9],
  ['Honolulu', 21.31, -157.86], ['Havana', 23.11, -82.37], ['Bogotá', 4.71, -74.07], ['Lima', -12.05, -77.04],
  ['São Paulo', -23.55, -46.63], ['Buenos Aires', -34.6, -58.38], ['Santiago', -33.45, -70.67], ['Reykjavík', 64.15, -21.94],
  ['London', 51.51, -0.13], ['Paris', 48.86, 2.35], ['Madrid', 40.42, -3.7], ['Berlin', 52.52, 13.4],
  ['Rome', 41.9, 12.5], ['Stockholm', 59.33, 18.07], ['Warsaw', 52.23, 21.01], ['Kyiv', 50.45, 30.52],
  ['Istanbul', 41.01, 28.98], ['Moscow', 55.76, 37.62], ['Cairo', 30.04, 31.24], ['Tunis', 36.81, 10.18],
  ['Casablanca', 33.57, -7.59], ['Lagos', 6.52, 3.38], ['Accra', 5.6, -0.19], ['Kinshasa', -4.44, 15.27],
  ['Nairobi', -1.29, 36.82], ['Addis Ababa', 9.03, 38.74], ['Johannesburg', -26.2, 28.05], ['Cape Town', -33.92, 18.42],
  ['Riyadh', 24.71, 46.68], ['Dubai', 25.2, 55.27], ['Tehran', 35.69, 51.39], ['Karachi', 24.86, 67.0],
  ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Dhaka', 23.81, 90.41], ['Kathmandu', 27.72, 85.32],
  ['Bangkok', 13.76, 100.5], ['Singapore', 1.35, 103.82], ['Jakarta', -6.21, 106.85], ['Manila', 14.6, 120.98],
  ['Hong Kong', 22.32, 114.17], ['Shanghai', 31.23, 121.47], ['Beijing', 39.9, 116.41], ['Seoul', 37.57, 126.98],
  ['Tokyo', 35.68, 139.65], ['Ulaanbaatar', 47.89, 106.91], ['Novosibirsk', 55.01, 82.93], ['Perth', -31.95, 115.86],
  ['Sydney', -33.87, 151.21], ['Auckland', -36.85, 174.76], ['McMurdo Station', -77.85, 166.67], ['Nuuk', 64.18, -51.69],
];

// WMO weather interpretation codes
const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

export function startWeatherSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const lat = CITIES.map((c) => c[1]).join(',');
      const lon = CITIES.map((c) => c[2]).join(',');
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation' +
        '&wind_speed_unit=ms&timezone=auto';
      const res = await client.get(url);
      const rows: any[] = Array.isArray(res.data) ? res.data : [res.data];
      const out: Entity[] = rows.map((r, i) => {
        const [name, la, lo] = CITIES[i];
        const c = r.current || {};
        return {
          id: `weather:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          type: 'weather',
          position: { lat: la, lon: lo },
          timestamp: Date.parse(c.time) || Date.now(),
          metadata: {
            name,
            conditions: WMO[c.weather_code] ?? `Code ${c.weather_code}`,
            temperatureC: c.temperature_2m,
            feelsLikeC: c.apparent_temperature,
            humidityPct: c.relative_humidity_2m,
            windSpeedMs: c.wind_speed_10m,
            windDirDeg: c.wind_direction_10m,
            gustMs: c.wind_gusts_10m,
            pressureHpa: c.pressure_msl,
            precipitationMm: c.precipitation,
            timezone: r.timezone,
            sourceUrl: 'https://open-meteo.com/',
          },
        } as Entity;
      });
      console.log(`[Weather] ${out.length} cities`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Weather] Error:', err?.message || err);
      return 5 * 60 * 1000;
    }
  }, 20 * 60 * 1000);
}
