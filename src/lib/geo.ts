/**
 * Pure TypeScript geo utilities — no external dependencies.
 * Implements great-circle interpolation, distance, and bearing.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in kilometers */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sin2));
}

/** Initial bearing from a → b in degrees [0, 360) */
export function bearing(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Interpolate a great-circle arc between two points.
 * Returns an array of [lng, lat] coordinate pairs.
 */
export function greatCircleArc(
  from: LngLat,
  to: LngLat,
  steps = 100
): [number, number][] {
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = toRad(to.lat);
  const lng2 = toRad(to.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    );

  // Very close points (GPS track points are often only a few metres apart): straight segment.
  // Must keep both ends – callers drop the first point of every following segment, so a
  // single-point result made whole stretches of recorded tracks disappear (d < 1e-5 rad ≈ 64 m).
  if (d < 1e-6 || steps <= 1) {
    return [[from.lng, from.lat], [to.lng, to.lat]];
  }

  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y =
      A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lng = toDeg(Math.atan2(y, x));
    coords.push([lng, lat]);
  }
  return coords;
}

/** Sample a point along a great-circle arc at fraction t ∈ [0, 1] */
export function sampleArc(from: LngLat, to: LngLat, t: number): LngLat {
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = toRad(to.lat);
  const lng2 = toRad(to.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    );

  if (d < 0.00001) return from;

  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x =
    A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
  const y =
    A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
  const lng = toDeg(Math.atan2(y, x));
  return { lng, lat };
}

/** Heading (bearing) at a point along a great-circle arc */
export function headingOnArc(from: LngLat, to: LngLat, t: number): number {
  const dt = 0.001;
  const t2 = Math.min(t + dt, 1);
  const p1 = sampleArc(from, to, t);
  const p2 = sampleArc(from, to, t2);
  return bearing(p1, p2);
}

/** Build a GeoJSON FeatureCollection of arcs for all city legs */
export function buildRouteGeoJSON(cities: Array<{ lng: number; lat: number }>) {
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < cities.length - 1; i++) {
    const from = cities[i];
    const to = cities[i + 1];
    const coords = greatCircleArc(from, to, 120);
    features.push({
      type: 'Feature',
      properties: { legIndex: i },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

export const RANDOM_CITIES = [
  { name: 'New York', country: 'US', lat: 40.7128, lng: -74.006 },
  { name: 'London', country: 'GB', lat: 51.5074, lng: -0.1278 },
  { name: 'Tokyo', country: 'JP', lat: 35.6762, lng: 139.6503 },
  { name: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 },
  { name: 'Sydney', country: 'AU', lat: -33.8688, lng: 151.2093 },
  { name: 'Dubai', country: 'AE', lat: 25.2048, lng: 55.2708 },
  { name: 'Singapore', country: 'SG', lat: 1.3521, lng: 103.8198 },
  { name: 'Los Angeles', country: 'US', lat: 34.0522, lng: -118.2437 },
  { name: 'Berlin', country: 'DE', lat: 52.52, lng: 13.405 },
  { name: 'Rio de Janeiro', country: 'BR', lat: -22.9068, lng: -43.1729 },
  { name: 'Mumbai', country: 'IN', lat: 19.076, lng: 72.8777 },
  { name: 'Cape Town', country: 'ZA', lat: -33.9249, lng: 18.4241 },
  { name: 'Toronto', country: 'CA', lat: 43.6532, lng: -79.3832 },
  { name: 'Amsterdam', country: 'NL', lat: 52.3676, lng: 4.9041 },
  { name: 'Bangkok', country: 'TH', lat: 13.7563, lng: 100.5018 },
  { name: 'Mexico City', country: 'MX', lat: 19.4326, lng: -99.1332 },
  { name: 'Istanbul', country: 'TR', lat: 41.0082, lng: 28.9784 },
  { name: 'Seoul', country: 'KR', lat: 37.5665, lng: 126.978 },
  { name: 'Cairo', country: 'EG', lat: 30.0444, lng: 31.2357 },
  { name: 'Moscow', country: 'RU', lat: 55.7558, lng: 37.6173 },
  { name: 'Barcelona', country: 'ES', lat: 41.3851, lng: 2.1734 },
  { name: 'Buenos Aires', country: 'AR', lat: -34.6037, lng: -58.3816 },
  { name: 'Nairobi', country: 'KE', lat: -1.2921, lng: 36.8219 },
  { name: 'Beijing', country: 'CN', lat: 39.9042, lng: 116.4074 },
  { name: 'Jakarta', country: 'ID', lat: -6.2088, lng: 106.8456 },
];
