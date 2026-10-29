// Video ↔ GPS track synchronisation.
//
// A ride has ONE continuous video. The track (GPX with timestamps) usually covers more
// than the video. Alignment is a single number – the offset:
//   trackSeconds = videoSeconds + syncOffset
// Everything else is derived from the track's time → distance table ("timeline").
//
// App-wide, `animationProgress` stays VIDEO time (0–1 of the video). The map converts it to a
// position along the route with toRoute(); clicks on the route convert back with toVideo().

import { distanceKm, type TrackPoint } from '@/lib/track';

export interface TrackTimeline {
  // [seconds since track start, fraction of the track distance 0–1], sampled every few seconds
  samples: [number, number][];
  durationSeconds: number; // whole track
  distanceKm: number;      // whole track
}

export interface SyncFields {
  timeline?: TrackTimeline;
  syncOffset?: number;   // track seconds at video second 0
  synced?: boolean;      // true once the rider confirmed the alignment in the sync editor
  durationSeconds: number;
}

const SAMPLE_STEP = 2; // seconds

// Built from the full-resolution track (before simplification), so stops keep their length.
export function buildTimeline(points: TrackPoint[]): TrackTimeline | undefined {
  const pts = points.filter(p => p.time !== undefined);
  if (pts.length < 2 || pts.length < points.length * 0.9) return undefined;
  const t0 = pts[0].time!;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceKm(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;
  const duration = (pts[pts.length - 1].time! - t0) / 1000;
  const samples: [number, number][] = [];
  let j = 0;
  for (let t = 0; t <= duration; t += SAMPLE_STEP) {
    while (j < pts.length - 2 && (pts[j + 1].time! - t0) / 1000 < t) j++;
    const ta = (pts[j].time! - t0) / 1000, tb = (pts[j + 1].time! - t0) / 1000;
    const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    samples.push([t, +((cum[j] + f * (cum[j + 1] - cum[j])) / total).toFixed(5)]);
  }
  if (samples[samples.length - 1][0] < duration) samples.push([+duration.toFixed(1), 1]);
  return { samples, durationSeconds: Math.round(duration), distanceKm: +total.toFixed(2) };
}

// Fraction of the track distance at a track time (clamped to the track).
export function distAtTrackTime(tl: TrackTimeline, t: number): number {
  const s = tl.samples;
  if (t <= 0) return s[0][1];
  if (t >= s[s.length - 1][0]) return 1;
  let i = Math.min(s.length - 2, Math.floor(t / SAMPLE_STEP));
  while (i > 0 && s[i][0] > t) i--;
  while (i < s.length - 2 && s[i + 1][0] < t) i++;
  const [ta, da] = s[i], [tb, db] = s[i + 1];
  return da + (tb > ta ? (t - ta) / (tb - ta) : 0) * (db - da);
}

// First track time at which the rider reached a distance fraction.
export function trackTimeAtDist(tl: TrackTimeline, d: number): number {
  const s = tl.samples;
  if (d <= s[0][1]) return 0;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m][1] < d) lo = m + 1; else hi = m; }
  if (lo === 0) return 0;
  const [ta, da] = s[lo - 1], [tb, db] = s[lo];
  return ta + (db > da ? (d - da) / (db - da) : 0) * (tb - ta);
}

// Speed (km/h) around a track time, averaged over ±6 s
export function speedAtTrackTime(tl: TrackTimeline, t: number): number {
  const a = Math.max(0, t - 6), b = Math.min(tl.durationSeconds, t + 6);
  if (b <= a) return 0;
  return ((distAtTrackTime(tl, b) - distAtTrackTime(tl, a)) * tl.distanceKm) / ((b - a) / 3600);
}

// Speed curve for the sync timeline: one value per `step` seconds
export function speedCurve(tl: TrackTimeline, step = 10): number[] {
  const out: number[] = [];
  for (let t = 0; t <= tl.durationSeconds; t += step) out.push(speedAtTrackTime(tl, t));
  return out;
}

// Stops ≥ minSeconds below 3 km/h – snapping targets and visual landmarks
export function findStops(tl: TrackTimeline, minSeconds = 20): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let t = 0; t <= tl.durationSeconds; t += SAMPLE_STEP) {
    const slow = speedAtTrackTime(tl, t) < 3;
    if (slow && start === null) start = t;
    if (!slow && start !== null) { if (t - start >= minSeconds) out.push({ from: start, to: t }); start = null; }
  }
  return out;
}

export interface SyncMapper {
  active: boolean;                       // false → linear fallback (no timestamps)
  toRoute: (videoFraction: number) => number;
  toVideo: (routeFraction: number) => number;
  speedAt: ((routeFraction: number) => number) | null;
}

const IDENTITY: SyncMapper = { active: false, toRoute: p => p, toVideo: p => p, speedAt: null };

export function syncMapper(route: SyncFields | undefined): SyncMapper {
  const tl = route?.timeline;
  const dur = route?.durationSeconds || 0;
  if (!tl || !dur) return IDENTITY;
  const off = route!.syncOffset ?? 0;
  return {
    active: true,
    toRoute: p => distAtTrackTime(tl, p * dur + off),
    toVideo: d => Math.min(1, Math.max(0, (trackTimeAtDist(tl, d) - off) / dur)),
    speedAt: d => speedAtTrackTime(tl, trackTimeAtDist(tl, d)),
  };
}

export function clampOffset(offset: number, videoSeconds: number, tl: TrackTimeline): number {
  // allow the video to overhang the track by at most its own length on either side
  return Math.max(-videoSeconds, Math.min(tl.durationSeconds, offset));
}
