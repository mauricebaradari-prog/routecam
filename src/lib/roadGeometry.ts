import bundledJson from '@/data/roadGeometry.json';

// Road geometry between two waypoints ("cityId-cityId" → [lng, lat][]).
//
// The built-in rides ship with their road course precomputed (src/data/roadGeometry.json,
// fetched once from OSRM). Visitors therefore never call the public OSRM demo server for them –
// it allows ~1 request per second and is not meant for production apps.
// Only waypoints that are not in the bundle (none today: own rides are drawn straight from
// their GPS track) are still fetched and then kept in this browser's localStorage.
// To refresh the bundle after changing built-in waypoints: clear the 'osrmCache' key, open the
// map once, and copy localStorage.osrmCache into src/data/roadGeometry.json.

export type LngLat = [number, number];
const BUNDLED = bundledJson as unknown as Record<string, LngLat[]>;
const STORAGE_KEY = 'osrmCache';

export function loadRoadCache(): Record<string, LngLat[]> {
  let stored: Record<string, LngLat[]> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {}
  const out: Record<string, LngLat[]> = {};
  // drop broken single-point segments cached by an older greatCircleArc (see lib/geo.ts)
  for (const [k, v] of Object.entries(stored)) if (Array.isArray(v) && v.length >= 2) out[k] = v;
  return { ...out, ...BUNDLED };
}

// Saves only what is not bundled anyway
export function saveRoadCache(cache: Record<string, LngLat[]>) {
  const own: Record<string, LngLat[]> = {};
  for (const [k, v] of Object.entries(cache)) if (!(k in BUNDLED)) own[k] = v;
  try {
    if (Object.keys(own).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(own));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
