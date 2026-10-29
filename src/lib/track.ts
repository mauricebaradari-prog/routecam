// Parsing and analysis of GPS track files (GPX, KML) in the browser.

export interface TrackPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number; // ms since epoch
}

export interface ParsedTrack {
  name?: string;
  points: TrackPoint[];
}

export interface TrackStats {
  pointCount: number;
  distanceKm: number;
  climbM: number | null;
  durationSeconds: number | null; // only if the file has timestamps
  startTime: number | null;
  hasTime: boolean;
  hasElevation: boolean;
}

export const ACCEPTED_TRACK_FILES = '.gpx,.kml';

export function parseTrackFile(text: string, fileName: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist kein gültiges XML.');
  const ext = fileName.toLowerCase().split('.').pop();
  const track = ext === 'kml' ? parseKml(doc) : parseGpx(doc);
  const points = track.points.filter(p => isFinite(p.lat) && isFinite(p.lng));
  if (points.length < 2) throw new Error('In der Datei wurden keine Trackpunkte gefunden.');
  return { ...track, points };
}

function byTag(el: Document | Element, tag: string): Element[] {
  // getElementsByTagNameNS('*', …) ignores namespace prefixes (gpx:trkpt, gx:coord …)
  return Array.from(el.getElementsByTagNameNS('*', tag));
}

function text(el: Element, tag: string): string | undefined {
  return byTag(el, tag)[0]?.textContent?.trim() || undefined;
}

function parseGpx(doc: Document): ParsedTrack {
  // Recorded track first; fall back to a planned route
  let nodes = byTag(doc, 'trkpt');
  if (!nodes.length) nodes = byTag(doc, 'rtept');
  const points = nodes.map(n => {
    const ele = text(n, 'ele');
    const time = text(n, 'time');
    return {
      lat: parseFloat(n.getAttribute('lat') || ''),
      lng: parseFloat(n.getAttribute('lon') || ''),
      ele: ele !== undefined ? parseFloat(ele) : undefined,
      time: time ? Date.parse(time) || undefined : undefined,
    };
  });
  const trk = byTag(doc, 'trk')[0];
  return { name: (trk && text(trk, 'name')) || text(doc.documentElement, 'name'), points };
}

function parseKml(doc: Document): ParsedTrack {
  const name = text(doc.documentElement, 'name');
  // Google Earth tracks: <gx:Track><when/>…<gx:coord>lng lat ele</gx:coord>
  const coords = byTag(doc, 'coord');
  if (coords.length) {
    const whens = byTag(doc, 'when');
    return {
      name,
      points: coords.map((c, i) => {
        const [lng, lat, ele] = (c.textContent || '').trim().split(/\s+/).map(Number);
        const t = whens[i]?.textContent ? Date.parse(whens[i].textContent!.trim()) : NaN;
        return { lat, lng, ele: isFinite(ele) ? ele : undefined, time: isFinite(t) ? t : undefined };
      }),
    };
  }
  // Plain <LineString><coordinates>lng,lat,ele lng,lat,ele …
  const lines = byTag(doc, 'LineString').flatMap(l => byTag(l, 'coordinates'));
  const points = lines.flatMap(l =>
    (l.textContent || '').trim().split(/\s+/).filter(Boolean).map(tuple => {
      const [lng, lat, ele] = tuple.split(',').map(Number);
      return { lat, lng, ele: isFinite(ele) ? ele : undefined };
    }),
  );
  return { name, points };
}

export function distanceKm(a: TrackPoint, b: TrackPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function trackStats(points: TrackPoint[]): TrackStats {
  let dist = 0;
  for (let i = 1; i < points.length; i++) dist += distanceKm(points[i - 1], points[i]);

  const eles = points.map(p => p.ele).filter((e): e is number => e !== undefined && isFinite(e));
  let climb: number | null = null;
  if (eles.length > 1) {
    // Smooth (moving average over 5 points), then ignore steps below 5 m – GPS altitude is noisy
    const smooth = eles.map((_, i) => {
      const w = eles.slice(Math.max(0, i - 2), i + 3);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
    climb = 0;
    let ref = smooth[0];
    for (const e of smooth) {
      if (e - ref >= 5) { climb += e - ref; ref = e; }
      else if (e < ref) ref = e;
    }
  }

  const times = points.map(p => p.time).filter((t): t is number => t !== undefined);
  const hasTime = times.length > points.length * 0.9;
  return {
    pointCount: points.length,
    distanceKm: dist,
    climbM: climb,
    durationSeconds: hasTime ? Math.round((times[times.length - 1] - times[0]) / 1000) : null,
    startTime: hasTime ? times[0] : null,
    hasTime,
    hasElevation: eles.length > points.length * 0.9,
  };
}

// Douglas-Peucker, tightening/loosening the tolerance until at most `maxPoints` remain.
export function simplifyTrack(points: TrackPoint[], maxPoints = 400): TrackPoint[] {
  if (points.length <= maxPoints) return points;
  let tol = 0.000005; // in degrees, ≈ 0.5 m; doubled until the point budget fits
  let result = points;
  for (let i = 0; i < 20 && result.length > maxPoints; i++) {
    result = douglasPeucker(points, tol);
    tol *= 2;
  }
  return result;
}

function douglasPeucker(pts: TrackPoint[], tol: number): TrackPoint[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pts[a], pts[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist2(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const k = Math.cos((a.lat * Math.PI) / 180); // squash longitude
  const px = p.lng * k, py = p.lat, ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

// Evenly sampled elevations (for sparklines); empty when the file has no elevation.
export function sampleElevation(points: TrackPoint[], samples = 40): number[] {
  const eles = points.filter(p => p.ele !== undefined && isFinite(p.ele!));
  if (eles.length < 2) return [];
  return Array.from({ length: samples }, (_, i) => Math.round(eles[Math.round((i / (samples - 1)) * (eles.length - 1))].ele!));
}

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// "34:16", "1:02:03" or "2056" → seconds
export function parseClock(input: string): number | null {
  const parts = input.trim().split(':').map(p => p.trim());
  if (!parts.every(p => /^\d+$/.test(p)) || parts.length > 3) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0) || null;
}
