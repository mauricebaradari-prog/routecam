import { useEffect, useState } from 'react';
import type { RouteConfig } from '@/hooks/useEditorState';

// "Same road, different ride": finds where other rides run along the same road as the
// active one, and maps positions between them, so a viewer can switch perspective at a
// point on the road (not at a point in time).
//
// Stage 1 (client-side, no backend): purely geometric. Both lines are resampled and a
// sample counts as shared when the other line is within OVERLAP_M metres and runs in a
// similar (or the opposite) direction. Later this moves to the server (PostGIS + map
// matching to OSM ways), see 07_TODO.md.

type LngLat = [number, number];

export interface OverlapSection {
  fromA: number; toA: number;   // progress range (0–1) on the active route
  fromB: number; toB: number;   // matching progress range on the other route
  direction: 'same' | 'opposite';
  lengthKm: number;
}

export interface RouteOverlap {
  route: RouteConfig;           // the other ride
  sections: OverlapSection[];
  sharedKm: number;
  // maps a progress on the active route to the progress on the other ride (null outside the shared sections)
  mapToOther: (pA: number) => number | null;
}

const SAMPLE_M = 40;            // resolution of the comparison
const OVERLAP_M = 45;           // max. distance between the lines to count as the same road
const MIN_SECTION_M = 400;      // ignore short touches (crossings, roundabouts)
const GAP_SAMPLES = 3;          // tolerate short GPS glitches inside a section
const MERGE_GAP_M = 1500;       // join sections of the same direction separated by short gaps
                                // (coarse lines, e.g. hand-set waypoints, drift off the road in bends)

// ── geometry ────────────────────────────────────────────────────────────────

function loadOsrmCache(): Record<string, LngLat[]> {
  try { return JSON.parse(localStorage.getItem('osrmCache') || '{}'); } catch { return {}; }
}

// Same line the map draws: GPS tracks and straight routes as-is, otherwise the cached road geometry.
export function routeGeometry(route: RouteConfig, cache = loadOsrmCache()): LngLat[] {
  const cs = route.cities;
  if (route.source === 'track' || route.forceStraight) return cs.map(c => [c.lng, c.lat]);
  const out: LngLat[] = [];
  for (let i = 0; i < cs.length - 1; i++) {
    const seg = cache[`${cs[i].id}-${cs[i + 1].id}`] || [[cs[i].lng, cs[i].lat], [cs[i + 1].lng, cs[i + 1].lat]];
    out.push(...(i > 0 ? seg.slice(1) : seg));
  }
  return out;
}

// local metric projection (good enough for a few hundred km)
function projector(lat0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  return (p: LngLat) => [p[0] * kx, p[1] * ky] as [number, number];
}

interface Line { pts: [number, number][]; cum: number[]; total: number; }

function toLine(coords: LngLat[], proj: (p: LngLat) => [number, number]): Line {
  const pts = coords.map(proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
}

// evenly spaced samples with their progress and heading
function resample(line: Line, step: number) {
  const out: { x: number; y: number; p: number; hx: number; hy: number }[] = [];
  let seg = 1;
  for (let d = 0; d <= line.total; d += step) {
    while (seg < line.pts.length - 1 && line.cum[seg] < d) seg++;
    const a = line.pts[seg - 1], b = line.pts[seg];
    const len = line.cum[seg] - line.cum[seg - 1] || 1;
    const t = (d - line.cum[seg - 1]) / len;
    out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, p: line.total ? d / line.total : 0, hx: (b[0] - a[0]) / len, hy: (b[1] - a[1]) / len });
  }
  return out;
}

// nearest point on a line: distance, progress, heading there
function nearest(line: Line, x: number, y: number) {
  let best = { d: Infinity, p: 0, hx: 0, hy: 0 };
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
    const px = a[0] + t * dx, py = a[1] + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) {
      const len = Math.sqrt(len2) || 1;
      best = { d, p: line.total ? (line.cum[i - 1] + t * len) / line.total : 0, hx: dx / len, hy: dy / len };
    }
  }
  return best;
}

function bbox(c: LngLat[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

export function computeOverlap(a: RouteConfig, b: RouteConfig, cache = loadOsrmCache()): RouteOverlap | null {
  const ca = routeGeometry(a, cache), cb = routeGeometry(b, cache);
  if (ca.length < 2 || cb.length < 2) return null;
  // quick reject: bounding boxes (+~500 m) don't touch
  const ba = bbox(ca), bb = bbox(cb), pad = 0.005;
  if (ba.x1 + pad < bb.x0 || bb.x1 + pad < ba.x0 || ba.y1 + pad < bb.y0 || bb.y1 + pad < ba.y0) return null;

  const proj = projector((ba.y0 + ba.y1) / 2);
  const la = toLine(ca, proj), lb = toLine(cb, proj);
  const samples = resample(la, SAMPLE_M);
  const hits = samples.map(s => {
    const n = nearest(lb, s.x, s.y);
    if (n.d > OVERLAP_M) return null;
    const dot = s.hx * n.hx + s.hy * n.hy; // cos of the angle between both directions
    if (Math.abs(dot) < 0.5) return null;  // crossing, not running along
    return { pA: s.p, pB: n.p, dir: dot > 0 ? 'same' as const : 'opposite' as const };
  });

  // group consecutive hits into sections (bridging short gaps)
  const sections: OverlapSection[] = [];
  const pairs: { pA: number; pB: number }[] = [];
  let start = -1, last = -1, gap = 0;
  const close = () => {
    if (start < 0) return;
    const run = hits.slice(start, last + 1).filter(Boolean) as NonNullable<(typeof hits)[number]>[];
    const lengthM = (last - start) * SAMPLE_M;
    if (lengthM >= MIN_SECTION_M && run.length) {
      const same = run.filter(h => h.dir === 'same').length >= run.length / 2;
      sections.push({ fromA: run[0].pA, toA: run[run.length - 1].pA, fromB: run[0].pB, toB: run[run.length - 1].pB, direction: same ? 'same' : 'opposite', lengthKm: lengthM / 1000 });
      pairs.push(...run.map(h => ({ pA: h.pA, pB: h.pB })));
    }
    start = -1; gap = 0;
  };
  hits.forEach((h, i) => {
    if (h) { if (start < 0) start = i; last = i; gap = 0; }
    else if (start >= 0 && ++gap > GAP_SAMPLES) close();
  });
  close();
  if (!sections.length) return null;

  // merge neighbouring sections (same direction, short gap on both lines)
  const merged: OverlapSection[] = [];
  for (const sec of sections) {
    const prev = merged[merged.length - 1];
    const gapA = prev ? (sec.fromA - prev.toA) * la.total : Infinity;
    const gapB = prev ? Math.abs(sec.fromB - prev.toB) * lb.total : Infinity;
    if (prev && prev.direction === sec.direction && gapA < MERGE_GAP_M && gapB < MERGE_GAP_M) {
      prev.toA = sec.toA;
      prev.toB = sec.toB;
      prev.lengthKm += sec.lengthKm + gapA / 1000;
    } else merged.push({ ...sec });
  }
  sections.length = 0;
  sections.push(...merged);

  const mapToOther = (pA: number) => {
    const sec = sections.find(s => pA >= s.fromA - 0.002 && pA <= s.toA + 0.002);
    if (!sec) return null;
    // nearest sampled pair (pairs are ordered along A)
    let best = pairs[0];
    for (const pr of pairs) if (Math.abs(pr.pA - pA) < Math.abs(best.pA - pA)) best = pr;
    return best.pB;
  };

  return { route: b, sections, sharedKm: sections.reduce((s, x) => s + x.lengthKm, 0), mapToOther };
}

// All rides sharing road with the active one. Recomputed when the route changes and whenever
// the map has fetched new road geometry (GlobeMap fires 'routecam:geometry').
export function useRouteOverlaps(active: RouteConfig | undefined, routes: RouteConfig[]) {
  const [overlaps, setOverlaps] = useState<RouteOverlap[]>([]);
  useEffect(() => {
    if (!active) { setOverlaps([]); return; }
    let timer = 0;
    const run = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const cache = loadOsrmCache();
        const list = routes
          .filter(r => r.id !== active.id)
          .map(r => computeOverlap(active, r, cache))
          .filter((o): o is RouteOverlap => o !== null)
          .sort((x, y) => y.sharedKm - x.sharedKm);
        setOverlaps(list);
      }, 300);
    };
    run();
    window.addEventListener('routecam:geometry', run);
    return () => { window.clearTimeout(timer); window.removeEventListener('routecam:geometry', run); };
  }, [active, routes]);
  return overlaps;
}
