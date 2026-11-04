// Echte Fahrt aus dem RouteCam Tracker (#015, Hoher Atlas, 10.10.2026), aus der GPX umgerechnet:
// pro Punkt [x, y, Höhe m, Sekunden seit Start, km/h, Meter seit Start].
// x/y sind schon in Bildschirm-dp des Trackers projiziert (gleiche Projektion und Größe wie in der
// App, Startpunkt = 0/0) – so liegt die Route im Endzustand pixelgenau wie im echten Screen.
import ride from '@/data/trackerDemoRide.json';

export type RidePoint = [number, number, number, number, number, number];

export const PTS = ride.pts as RidePoint[];
export const META = ride.meta;
export const TOTAL_M = PTS[PTS.length - 1][5];
export const TOTAL_S = PTS[PTS.length - 1][3];

/** Startpunkt der Route im Tracker-Screen (dp), gemessen am Original-Screenshot. */
export const ROUTE_ORIGIN = { x: 183.85, y: 166.4 };

/** Zeitzone des Handys bei der Aufnahme (die App zeigt Ortszeit: 13:35 UTC → 16:35). */
export const RIDE_TZ_OFFSET_S = 3 * 3600;
export const RIDE_START_UTC_S = Date.parse(META.startUtc) / 1000;

export type Head = { i: number; f: number; x: number; y: number; ele: number; t: number; kmh: number; m: number };

/** Kopf der Strecke bei Anteil `frac` (0…1) der Gesamtdistanz, zwischen zwei Punkten interpoliert. */
export function headAt(frac: number): Head {
  if (frac >= 1) {
    // am Ziel genau der letzte Punkt (am Ende steht man – mehrere Punkte mit gleicher Distanz)
    const z = PTS[PTS.length - 1];
    return { i: PTS.length - 1, f: 0, x: z[0] + ROUTE_ORIGIN.x, y: z[1] + ROUTE_ORIGIN.y, ele: z[2], t: z[3], kmh: z[4], m: z[5] };
  }
  const target = Math.max(0, frac) * TOTAL_M;
  let lo = 0, hi = PTS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PTS[mid][5] <= target) lo = mid; else hi = mid;
  }
  const a = PTS[lo], b = PTS[hi];
  const span = b[5] - a[5];
  const f = span > 0 ? Math.max(0, Math.min(1, (target - a[5]) / span)) : 0;
  const L = (k: number) => a[k] + (b[k] - a[k]) * f;
  return { i: lo, f, x: L(0) + ROUTE_ORIGIN.x, y: L(1) + ROUTE_ORIGIN.y, ele: L(2), t: L(3), kmh: L(4), m: L(5) };
}

export const ELE_MIN = Math.min(...PTS.map(p => p[2]));
export const ELE_MAX = Math.max(...PTS.map(p => p[2]));

/** Ø-Tempo wie in der App: Distanz / Gesamtzeit. */
export const AVG_KMH = (TOTAL_M / 1000) / (TOTAL_S / 3600);
