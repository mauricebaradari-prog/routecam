import type { RouteConfig } from '@/hooks/useEditorState';
import { distAtTrackTime } from '@/lib/trackSync';

// Cut a recorded ride down to the part between two track times (seconds since the start of
// the recording). Used by the sync editor so that the ride is exactly what the video shows –
// or less, e.g. to cut away the stretch in front of the rider's home.
//
// Everything that describes the track is cut consistently:
//   - the drawn line (route.cities, the simplified track points) – cut at the matching
//     distance fractions, with interpolated end points
//   - the timeline (track time → distance fraction), shifted so the new start is 0 s
//   - the elevation sample used for the small profiles in the dashboard and channel
//   - the sync offset: track time = video time + offset, so it moves by the cut-off seconds
// Video-based data (comments at a video second, likes) is not touched.

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const MIN_TRIM_SECONDS = 10;

export function trimRoute(route: RouteConfig, from: number, to: number): Partial<RouteConfig> | null {
  const tl = route.timeline;
  if (!tl || route.cities.length < 2) return null;
  const t0 = Math.max(0, Math.min(from, tl.durationSeconds));
  const t1 = Math.max(t0, Math.min(to, tl.durationSeconds));
  if (t1 - t0 < MIN_TRIM_SECONDS) return null;
  const f0 = distAtTrackTime(tl, t0), f1 = distAtTrackTime(tl, t1);
  const span = f1 - f0 || 1;

  // ── timeline ──
  const samples: [number, number][] = [[0, 0]];
  for (const [t, f] of tl.samples) {
    if (t > t0 && t < t1) samples.push([+(t - t0).toFixed(1), +Math.min(1, Math.max(0, (f - f0) / span)).toFixed(5)]);
  }
  samples.push([+(t1 - t0).toFixed(1), 1]);
  const timeline = { samples, durationSeconds: Math.round(t1 - t0), distanceKm: +(tl.distanceKm * (f1 - f0)).toFixed(2) };

  // ── drawn line ──
  const coords = route.cities.map(c => [c.lng, c.lat] as [number, number]);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || 1;
  const frac = cum.map(c => c / total);
  const pointAt = (f: number): [number, number] => {
    let i = 1;
    while (i < frac.length - 1 && frac[i] < f) i++;
    const k = frac[i] > frac[i - 1] ? (f - frac[i - 1]) / (frac[i] - frac[i - 1]) : 0;
    return [coords[i - 1][0] + k * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + k * (coords[i][1] - coords[i - 1][1])];
  };
  const kept: [number, number][] = [pointAt(f0), ...coords.filter((_, i) => frac[i] > f0 && frac[i] < f1), pointAt(f1)];
  const first = route.cities[0], last = route.cities[route.cities.length - 1];
  const cities = kept.map((c, i) => ({
    id: `${route.id}-t${i}`,
    name: i === 0 ? first.name : i === kept.length - 1 ? last.name : `P${i}`,
    country: first.country,
    lat: +c[1].toFixed(6),
    lng: +c[0].toFixed(6),
  }));

  // ── elevation sample (taken evenly over the recording) ──
  let elevationSample = route.elevationSample;
  if (elevationSample && elevationSample.length > 1 && tl.durationSeconds > 0) {
    const src = elevationSample;
    const at = (x: number) => { // x: 0–1 over the original recording
      const p = x * (src.length - 1), i = Math.floor(p), k = p - i;
      return i >= src.length - 1 ? src[src.length - 1] : src[i] + k * (src[i + 1] - src[i]);
    };
    const a = t0 / tl.durationSeconds, b = t1 / tl.durationSeconds;
    elevationSample = Array.from({ length: src.length }, (_, i) => Math.round(at(a + (i / (src.length - 1)) * (b - a))));
  }

  return { cities, timeline, elevationSample, syncOffset: +((route.syncOffset ?? 0) - t0).toFixed(1) };
}
