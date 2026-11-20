// Strecke aus einem Google-Maps-Link (Alternative zu GPX/KML).
//
// Ein solcher Link enthält nur die *geplante* Route: Wegpunkte und Verkehrsmittel, keine
// Zeitstempel. Daraus wird hier die Straßenstrecke berechnet (OSRM, wie für die eingebauten
// Fahrten). Kurzlinks (maps.app.goo.gl) löst /api/maps-link auf – der Browser darf der
// Weiterleitung wegen CORS nicht selbst folgen.
import type { TrackPoint } from '@/lib/track';
import { t } from '@/lib/i18n';

export type Waypoint = { lat: number; lng: number } | { name: string };
export type TravelMode = 'driving' | 'cycling' | 'walking';
export interface MapsRoute { waypoints: Waypoint[]; mode: TravelMode; names: string[] }

/** Sieht der Text nach einem Google-Maps-Link aus? */
export function isGoogleMapsLink(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return /(^|\.)(maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+)$/i.test(u.hostname)
      && (u.hostname.startsWith('maps.app') || u.pathname.startsWith('/maps') || u.hostname.startsWith('maps.') || u.searchParams.has('daddr'));
  } catch { return false; }
}

const isShort = (u: URL) => /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i.test(u.hostname);
const COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function point(s: string): Waypoint | null {
  const v = decodeURIComponent(s.replace(/\+/g, ' ')).trim();
  if (!v) return null;
  const m = v.match(COORD);
  if (m) {
    const lat = +m[1], lng = +m[2];
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return { name: v };
}

/** Wegpunkte und Verkehrsmittel aus der langen Adresse lesen – null, wenn keine Route drin ist */
export function parseMapsUrl(href: string): MapsRoute | null {
  const u = new URL(href);
  const modeOf = (code: string | null | undefined): TravelMode =>
    code === '1' || code === 'bicycling' ? 'cycling' : code === '2' || code === 'walking' ? 'walking' : 'driving';

  // google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=a|b&travelmode=…
  if (u.searchParams.has('destination')) {
    const list = [u.searchParams.get('origin'), ...(u.searchParams.get('waypoints') ?? '').split('|'), u.searchParams.get('destination')]
      .filter((s): s is string => !!s).map(point).filter((w): w is Waypoint => !!w);
    return list.length >= 2 ? { waypoints: list, mode: modeOf(u.searchParams.get('travelmode')), names: list.map(nameOf) } : null;
  }
  // alte Form: maps.google.com/?saddr=A&daddr=B+to:C
  if (u.searchParams.has('daddr')) {
    const list = [u.searchParams.get('saddr') ?? '', ...(u.searchParams.get('daddr') ?? '').split(/\s*\+?to:\s*/)]
      .map(point).filter((w): w is Waypoint => !!w);
    return list.length >= 2 ? { waypoints: list, mode: modeOf(u.searchParams.get('dirflg') === 'b' ? '1' : u.searchParams.get('dirflg') === 'w' ? '2' : '0'), names: list.map(nameOf) } : null;
  }
  // google.com/maps/dir/Ort+A/Ort+B/@lat,lng,zoom/data=…
  const path = u.pathname;
  const dir = path.indexOf('/dir/');
  if (dir < 0) return null;
  const segs = path.slice(dir + 5).split('/');
  const stop = segs.findIndex(s => s.startsWith('@') || s.startsWith('data='));
  const named = (stop < 0 ? segs : segs.slice(0, stop)).map(point).filter((w): w is Waypoint => !!w);
  const data = decodeURIComponent(path.slice(path.indexOf('data=') >= 0 ? path.indexOf('data=') : path.length));
  const mode = modeOf(data.match(/!3e(\d)/)?.[1]);
  // Koordinaten der Orte (und gezogener Zwischenpunkte) in Reihenfolge: !1d<lng>!2d<lat>
  const pairs = [...data.matchAll(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)].map(m => ({ lng: +m[1], lat: +m[2] }));
  let waypoints: Waypoint[];
  if (pairs.length >= 2 && named.every(w => 'name' in w)) waypoints = pairs;
  else {
    // gemischt (eingetippte Koordinaten): je Ort die Koordinate aus data=, sonst der Name
    const queue = [...pairs];
    waypoints = named.map(w => ('name' in w && queue.length ? queue.shift()! : w));
  }
  return waypoints.length >= 2 ? { waypoints, mode, names: named.map(nameOf) } : null;
}

function nameOf(w: Waypoint) {
  return 'name' in w ? w.name.split(',')[0].trim() : `${w.lat.toFixed(3)}, ${w.lng.toFixed(3)}`;
}

async function geocode(name: string): Promise<{ lat: number; lng: number }> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name)}`, { headers: { 'accept-language': 'en' } });
  const list = r.ok ? await r.json() as { lat: string; lon: string }[] : [];
  if (!list[0]) throw new Error(t('Der Ort „{name}“ aus dem Link wurde nicht gefunden.', { name }));
  return { lat: +list[0].lat, lng: +list[0].lon };
}

const ROUTER: Record<TravelMode, string> = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

/** Link (kurz oder lang) → Strecke als Punkte (ohne Zeit, ohne Höhe) plus Titelvorschlag */
export async function routeFromMapsLink(link: string): Promise<{ points: TrackPoint[]; title: string; mode: TravelMode }> {
  let u: URL;
  try { u = new URL(link.trim()); } catch { throw new Error(t('Das ist kein gültiger Google-Maps-Link.')); }
  if (isShort(u)) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const r = await fetch(`${base}/api/maps-link?url=${encodeURIComponent(u.toString())}`).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) as { url?: string } : {};
    if (!body.url) throw new Error(t('Der Kurzlink konnte nicht geöffnet werden. Öffne ihn im Browser und kopiere die lange Adresse aus der Adresszeile.'));
    u = new URL(body.url);
  }
  const route = parseMapsUrl(u.toString());
  if (!route) throw new Error(t('Der Link enthält keine Route. Plane in Google Maps eine Route (Start und Ziel) und teile dann diesen Link.'));
  const coords: { lat: number; lng: number }[] = [];
  for (const w of route.waypoints) {
    coords.push('name' in w ? await geocode(w.name) : w);
    if ('name' in w) await new Promise(r => setTimeout(r, 1100)); // Nominatim: höchstens 1 Anfrage je Sekunde
  }
  const path = coords.map(c => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const res = await fetch(`${ROUTER[route.mode]}/${path}?overview=full&geometries=geojson`).catch(() => null);
  const data = res?.ok ? await res.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] } : null;
  const line = data?.routes?.[0]?.geometry.coordinates;
  if (!line || line.length < 2) throw new Error(t('Für diesen Link konnte keine Strecke berechnet werden.'));
  const first = route.names[0], last = route.names[route.names.length - 1];
  return { points: line.map(([lng, lat]) => ({ lat, lng })), title: first && last ? `${first} → ${last}` : '', mode: route.mode };
}
