"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVolcanoSource = startVolcanoSource;
const axios_1 = __importDefault(require("axios"));
/**
 * Fetches active volcano data from the Smithsonian GVP (Global Volcanism Program)
 * via the USGS Volcano Hazards API.
 */
function startVolcanoSource(onEntities, opts) {
    const intervalMs = opts?.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
    // USGS Volcano Hazards CAP Alerts (free, no auth)
    const url = 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP';
    let stopped = false;
    let timer = null;
    async function fetchAndEmit() {
        try {
            const res = await axios_1.default.get(url, { timeout: 15000 });
            const volcanoes = res.data || [];
            const entities = [];
            const filtered = Array.isArray(volcanoes) ? volcanoes : [];
            filtered.forEach((v) => {
                const lat = parseFloat(v.latitude);
                const lon = parseFloat(v.longitude);
                if (isNaN(lat) || isNaN(lon))
                    return;
                entities.push({
                    id: `volcano:${v.volcanoNumber || v.volcanoName}`,
                    type: 'volcano',
                    position: { lat, lon, alt: v.elevation ? parseFloat(v.elevation) : 0 },
                    timestamp: Date.now(),
                    metadata: {
                        name: v.volcanoName || 'Unknown',
                        country: v.country || '',
                        type: v.volcanoType || '',
                        elevation: v.elevation ? parseFloat(v.elevation) : undefined,
                        lastEruption: v.lastEruptionYear || 'Unknown',
                    }
                });
            });
            console.log(`[Volcanoes] Fetched ${entities.length} volcanoes`);
            if (entities.length > 0) {
                onEntities(entities);
            }
        }
        catch (err) {
            console.warn('[Volcanoes] Error:', err?.message || err);
            // No mock data fallback!
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
