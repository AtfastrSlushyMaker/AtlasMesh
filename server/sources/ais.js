"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAISSource = startAISSource;
const ws_1 = __importDefault(require("ws"));
function toNumber(v) {
    if (v === null || v === undefined)
        return undefined;
    if (typeof v === 'number')
        return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
/**
 * AISStream.io WebSocket adapter.
 * Sends the required subscription message on connect with API key and global bounding box.
 */
function startAISSource(onEntities, opts) {
    const url = opts?.url ?? process.env.AISSTREAM_URL ?? 'wss://stream.aisstream.io/v0/stream';
    const token = process.env.AISSTREAM_TOKEN;
    let ws = null;
    let stopped = false;
    const reconnectMs = opts?.reconnectMs ?? 10000;
    if (!token) {
        console.warn('AIS: No AISSTREAM_TOKEN set — skipping AIS source');
        return () => { };
    }
    function connect() {
        ws = new ws_1.default(url);
        ws.on('open', () => {
            console.log('AIS WS connected to', url);
            // AISStream requires a subscription message with API key and bounding boxes
            const subscriptionMsg = {
                APIKey: token,
                BoundingBoxes: [
                    [[-90, -180], [90, 180]] // Global coverage
                ],
                FiltersShipMMSI: [],
                FilterMessageTypes: ["PositionReport"]
            };
            ws.send(JSON.stringify(subscriptionMsg));
            console.log('AIS: Sent subscription message');
        });
        ws.on('message', (data) => {
            try {
                const text = data.toString();
                const msg = JSON.parse(text);
                // AISStream format: { Message: { PositionReport: {...} }, MetaData: {...} }
                if (msg.Message?.PositionReport && msg.MetaData) {
                    const pos = msg.Message.PositionReport;
                    const meta = msg.MetaData;
                    const lat = toNumber(pos.Latitude);
                    const lon = toNumber(pos.Longitude);
                    if (lat === undefined || lon === undefined)
                        return;
                    const mmsi = meta.MMSI?.toString() || Math.random().toString(36).slice(2, 9);
                    const entity = {
                        id: `ship:ais:${mmsi}`,
                        type: 'ship',
                        position: { lat, lon, alt: 0 },
                        velocity: toNumber(pos.Sog),
                        heading: toNumber(pos.TrueHeading ?? pos.Cog),
                        timestamp: Date.now(),
                        metadata: {
                            mmsi,
                            shipName: meta.ShipName?.trim() || '',
                            country: meta.country || '',
                            sog: pos.Sog,
                            cog: pos.Cog,
                        }
                    };
                    onEntities([entity]);
                }
            }
            catch (err) {
                // ignore parse errors
            }
        });
        ws.on('close', () => {
            console.log('AIS WS closed');
            if (!stopped)
                setTimeout(connect, reconnectMs);
        });
        ws.on('error', (err) => {
            console.warn('AIS WS error:', err?.message || err);
            try {
                ws?.close();
            }
            catch (e) { }
        });
    }
    connect();
    return () => {
        stopped = true;
        try {
            ws?.close();
        }
        catch (e) { }
    };
}
