// Using Lucide-inspired SVG paths
const createIcon = (path: string, color: string = 'white', size: number = 24) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const Icons = {
  aircraft: createIcon('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l6 5-3 3-3.2-1.1c-.4-.1-.8.1-1 .5L1 17l4.5 1.5L7 23l1.6-1c.4-.2.6-.6.5-1L8 18l3-3 5 6l1.2-.7c.4-.2.7-.6.6-1.1Z"/>', '#38bdf8'),
  ship: createIcon('<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>', '#facc15'),
  satellite: createIcon('<path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/>', '#a78bfa'),
  earthquake: createIcon('<path d="M2 12h5l2-9 4 18 3-9h6"/>', '#ef4444'),
  event: createIcon('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', '#f97316'), // alert/flag style
  wildfire: createIcon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>', '#dc2626'),
  lightning: createIcon('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>', '#fef08a'),
  weather: createIcon('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', '#3b82f6'),
  launch: createIcon('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 3.82-13 1.5 1.5 0 0 0-2.18 2.18 22 22 0 0 1-13 3.82l-3-3"/><path d="M9 9 7 7"/><path d="m17 17-2-2"/><path d="m21 21-2-2"/><path d="m21 13-2-2"/><path d="m13 21-2-2"/>', '#10b981'),
  volcano: createIcon('<path d="m12 14-4-4-5 9h18l-5-9z"/><path d="m8 6-2-2"/><path d="m16 6 2-2"/><path d="M12 5V2"/>', '#ff6b35'),
};
