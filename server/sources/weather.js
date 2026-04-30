"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWeatherSource = startWeatherSource;
const axios_1 = __importDefault(require("axios"));
// A small grid of coordinates to represent global weather
const WEATHER_GRID = [
    { lat: 40.71, lon: -74.00, name: "New York" },
    { lat: 51.50, lon: -0.12, name: "London" },
    { lat: 35.67, lon: 139.65, name: "Tokyo" },
    { lat: -33.86, lon: 151.20, name: "Sydney" },
    { lat: -23.55, lon: -46.63, name: "Sao Paulo" },
    { lat: 1.35, lon: 103.81, name: "Singapore" },
    { lat: 25.20, lon: 55.27, name: "Dubai" },
    { lat: -1.29, lon: 36.82, name: "Nairobi" }
];
function startWeatherSource(onEntities, opts) {
    const intervalMs = opts?.intervalMs ?? 30 * 60 * 1000; // 30 mins
    let stopped = false;
    let timer = null;
    async function fetchAndEmit() {
        try {
            const entities = [];
            for (const loc of WEATHER_GRID) {
                if (stopped)
                    break;
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m`;
                const res = await axios_1.default.get(url);
                const current = res.data.current;
                entities.push({
                    id: `weather:${loc.name.replace(/\s+/g, '_')}`,
                    type: 'weather',
                    position: { lat: loc.lat, lon: loc.lon },
                    timestamp: new Date(current.time).getTime(),
                    metadata: {
                        name: loc.name,
                        temperature: current.temperature_2m,
                        wind_speed: current.wind_speed_10m,
                        wind_direction: current.wind_direction_10m
                    }
                });
            }
            console.log(`[Weather] Fetched ${entities.length} weather stations`);
            onEntities(entities);
        }
        catch (err) {
            console.warn('[Weather] Error:', err?.message || err);
        }
        finally {
            if (!stopped) {
                timer = setTimeout(fetchAndEmit, intervalMs);
            }
        }
    }
    fetchAndEmit();
    return () => {
        stopped = true;
        if (timer)
            clearTimeout(timer);
    };
}
