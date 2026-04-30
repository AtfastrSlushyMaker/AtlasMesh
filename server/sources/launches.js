"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLaunchesSource = startLaunchesSource;
const axios_1 = __importDefault(require("axios"));
function startLaunchesSource(onEntities, opts) {
    const intervalMs = opts?.intervalMs ?? 15 * 60 * 1000; // 15 minutes
    const url = opts?.url ?? 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10';
    let stopped = false;
    let timer = null;
    async function fetchAndEmit() {
        try {
            const res = await axios_1.default.get(url);
            const results = res.data.results || [];
            const entities = results.map((l) => {
                const pad = l.pad;
                return {
                    id: `launch:${l.id}`,
                    type: 'launch',
                    position: {
                        lon: parseFloat(pad.longitude),
                        lat: parseFloat(pad.latitude)
                    },
                    timestamp: new Date(l.net).getTime(), // NET (No Earlier Than) time
                    metadata: {
                        name: l.name,
                        status: l.status.name,
                        provider: l.launch_service_provider?.name,
                        pad: pad.name
                    }
                };
            });
            console.log(`[Launches] Fetched ${entities.length} upcoming launches`);
            onEntities(entities);
        }
        catch (err) {
            console.warn('[Launches] Error:', err?.message || err);
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
