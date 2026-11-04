import type { TrackPoint } from '@/lib/track';
import { t } from '@/lib/i18n';

// GPS straight from the camera's own video file – no tracker app needed.
//
// GoPro (HERO5 and newer with GPS, MAX, Fusion, Karma) writes its sensor data as a separate
// "gpmd" track inside the MP4 – the open GPMF format (github.com/gopro/gpmf-parser).
// Because GPS and video come from the same clock, the position in the video is exact.
//
// Everything is read in the browser, piece by piece (File.slice): only the MP4 index and the
// small telemetry blocks are read, never the video itself, so multi-gigabyte files are fine
// and nothing is uploaded.
//
// Insta360 (ONE R/RS, X3, X4, X5, Ace …) appends a "trailer" to its original files (.insv and
// .mp4) with sensor records; record 7 is GPS – present only when the camera got GPS from the
// GPS remote or the phone app (most Insta360 models have no GPS receiver of their own).
// Layout as documented by github.com/AdrianEddy/telemetry-parser (src/insta360).
//
// Note: YouTube removes this data when the video is uploaded – it has to be the original file
// from the camera (or the card), not a download from YouTube or an edited export.

export const CAMERA_VIDEO_FILES = '.mp4,.mov,.360,.lrv,.insv';
export function isCameraVideo(name: string) {
  return /\.(mp4|mov|360|lrv|insv)$/i.test(name);
}

export interface CameraTrack {
  points: TrackPoint[];
  camera: string;        // e.g. "GoPro HERO8 Black"
  videoOffset?: number;  // track seconds at video second 0 of the first file – only when exactly known (GoPro)
  files: number;
}

// ── tiny MP4 reader ──────────────────────────────────────────────────────────

type Box = { type: string; start: number; size: number; header: number };

async function readBytes(file: Blob, offset: number, length: number): Promise<DataView> {
  const buf = await file.slice(offset, offset + length).arrayBuffer();
  return new DataView(buf);
}

function fourcc(dv: DataView, at: number) {
  return String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));
}

function u64(dv: DataView, at: number) {
  return dv.getUint32(at) * 2 ** 32 + dv.getUint32(at + 4);
}

// top-level boxes of the file (moov may sit at the start or the end)
async function topBoxes(file: Blob): Promise<Box[]> {
  const out: Box[] = [];
  let off = 0;
  while (off + 8 <= file.size && out.length < 1000) {
    const h = await readBytes(file, off, 16);
    let size = h.getUint32(0);
    const type = fourcc(h, 4);
    let header = 8;
    if (size === 1) { size = u64(h, 8); header = 16; }
    else if (size === 0) size = file.size - off;
    if (size < header) break;
    out.push({ type, start: off, size, header });
    off += size;
  }
  return out;
}

// children of a box inside an in-memory buffer
function children(dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = dv.getUint32(off);
    const type = fourcc(dv, off + 4);
    let header = 8;
    if (size === 1) { size = u64(dv, off + 8); header = 16; }
    else if (size === 0) size = end - off;
    if (size < header || off + size > end) break;
    out.push({ type, start: off, size, header });
    off += size;
  }
  return out;
}

const child = (dv: DataView, box: Box, type: string) => children(dv, box.start + box.header, box.start + box.size).find(b => b.type === type);

interface TelemetryTrack { timescale: number; samples: { offset: number; size: number; time: number; duration: number }[] }

function findGpmdTrack(moov: DataView): TelemetryTrack | null {
  for (const trak of children(moov, 8, moov.byteLength).filter(b => b.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia'); if (!mdia) continue;
    const hdlr = child(moov, mdia, 'hdlr');
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    const stsd = stbl && child(moov, stbl, 'stsd');
    if (!hdlr || !stbl || !stsd) continue;
    const handler = fourcc(moov, hdlr.start + hdlr.header + 8);
    const format = fourcc(moov, stsd.start + stsd.header + 12);
    if (handler !== 'meta' || format !== 'gpmd') continue;

    const mdhd = child(moov, mdia, 'mdhd')!;
    const p = mdhd.start + mdhd.header;
    const timescale = moov.getUint8(p) === 1 ? moov.getUint32(p + 20) : moov.getUint32(p + 12);

    const body = (b: Box | undefined) => (b ? b.start + b.header : -1);
    const stts = body(child(moov, stbl, 'stts'));
    const stsz = body(child(moov, stbl, 'stsz'));
    const stsc = body(child(moov, stbl, 'stsc'));
    const stco = body(child(moov, stbl, 'stco'));
    const co64 = body(child(moov, stbl, 'co64'));
    if (stts < 0 || stsz < 0 || stsc < 0 || (stco < 0 && co64 < 0)) continue;

    // sizes
    const fixed = moov.getUint32(stsz + 4), count = moov.getUint32(stsz + 8);
    const sizes = Array.from({ length: count }, (_, i) => (fixed || moov.getUint32(stsz + 12 + i * 4)));
    // times
    const times: number[] = [], durs: number[] = [];
    let t = 0;
    for (let e = 0, n = moov.getUint32(stts + 4); e < n; e++) {
      const c = moov.getUint32(stts + 8 + e * 8), d = moov.getUint32(stts + 12 + e * 8);
      for (let k = 0; k < c; k++) { times.push(t); durs.push(d); t += d; }
    }
    // chunk offsets
    const chunkOffsets: number[] = [];
    if (co64 >= 0) for (let i = 0, n = moov.getUint32(co64 + 4); i < n; i++) chunkOffsets.push(u64(moov, co64 + 8 + i * 8));
    else for (let i = 0, n = moov.getUint32(stco + 4); i < n; i++) chunkOffsets.push(moov.getUint32(stco + 8 + i * 4));
    // samples per chunk
    const runs: [number, number][] = [];
    for (let e = 0, n = moov.getUint32(stsc + 4); e < n; e++) runs.push([moov.getUint32(stsc + 8 + e * 12), moov.getUint32(stsc + 12 + e * 12)]);

    const samples: TelemetryTrack['samples'] = [];
    let s = 0;
    for (let c = 0; c < chunkOffsets.length && s < count; c++) {
      const run = [...runs].reverse().find(r => r[0] <= c + 1);
      let off = chunkOffsets[c];
      for (let k = 0; k < (run?.[1] ?? 1) && s < count; k++, s++) {
        samples.push({ offset: off, size: sizes[s], time: (times[s] ?? 0) / timescale, duration: (durs[s] ?? 0) / timescale });
        off += sizes[s];
      }
    }
    return { timescale, samples };
  }
  return null;
}

// ── GPMF (KLV) ───────────────────────────────────────────────────────────────

interface Klv { key: string; type: string; structSize: number; repeat: number; at: number; len: number }

function klvs(dv: DataView, start: number, end: number): Klv[] {
  const out: Klv[] = [];
  let off = start;
  while (off + 8 <= end) {
    const key = fourcc(dv, off);
    const type = String.fromCharCode(dv.getUint8(off + 4));
    const structSize = dv.getUint8(off + 5), repeat = dv.getUint16(off + 6);
    const len = structSize * repeat;
    if (key === '\0\0\0\0') break;
    if (off + 8 + len > end) break;
    out.push({ key, type: dv.getUint8(off + 4) === 0 ? '\0' : type, structSize, repeat, at: off + 8, len });
    off += 8 + ((len + 3) & ~3);
  }
  return out;
}

const SIZE: Record<string, number> = { b: 1, B: 1, c: 1, s: 2, S: 2, l: 4, L: 4, f: 4, d: 8, j: 8, J: 8, q: 4, Q: 8 };
function readNum(dv: DataView, at: number, t: string): number {
  switch (t) {
    case 'b': return dv.getInt8(at);
    case 'B': return dv.getUint8(at);
    case 's': return dv.getInt16(at);
    case 'S': return dv.getUint16(at);
    case 'l': return dv.getInt32(at);
    case 'L': return dv.getUint32(at);
    case 'f': return dv.getFloat32(at);
    case 'd': return dv.getFloat64(at);
    case 'j': return Number(dv.getBigInt64(at));
    case 'J': return Number(dv.getBigUint64(at));
    case 'q': return dv.getInt32(at) / 65536;
    case 'Q': return Number(dv.getBigInt64(at)) / 2 ** 32;
    default: return NaN;
  }
}

// one record = structSize bytes; for complex ('?') records the TYPE string lists the fields
function records(dv: DataView, k: Klv, typeStr?: string): number[][] {
  const fields = k.type === '?' && typeStr ? typeStr.split('') : null;
  const out: number[][] = [];
  for (let r = 0; r < k.repeat; r++) {
    const base = k.at + r * k.structSize;
    const rec: number[] = [];
    if (fields) {
      let o = 0;
      for (const f of fields) { rec.push(readNum(dv, base + o, f)); o += SIZE[f] ?? 0; }
    } else {
      const n = k.structSize / (SIZE[k.type] ?? 1);
      for (let i = 0; i < n; i++) rec.push(readNum(dv, base + i * (SIZE[k.type] ?? 1), k.type));
    }
    out.push(rec);
  }
  return out;
}

function str(dv: DataView, k: Klv) {
  let s = '';
  for (let i = 0; i < k.len; i++) { const c = dv.getUint8(k.at + i); if (c) s += String.fromCharCode(c); }
  return s.trim();
}

// "yymmddhhmmss.sss" → ms since epoch
function gpsuTime(s: string): number | null {
  const m = s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d(?:\.\d+)?)$/);
  if (!m) return null;
  const sec = parseFloat(m[6]);
  return Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], Math.floor(sec), Math.round((sec % 1) * 1000));
}

interface RawFix { media: number; lat: number; lng: number; ele: number; utc?: number }

// GPS fixes of one telemetry sample (≈ 1 s), with their media time in the file
function parseSample(dv: DataView, mediaStart: number, mediaDur: number, out: RawFix[], meta: Meta) {
  for (const devc of klvs(dv, 0, dv.byteLength).filter(k => k.key === 'DEVC')) {
    const devItems = klvs(dv, devc.at, devc.at + devc.len);
    const dvnm = devItems.find(k => k.key === 'DVNM');
    if (dvnm && !meta.camera) meta.camera = str(dv, dvnm);
    for (const strm of devItems.filter(k => k.key === 'STRM')) {
      const items = klvs(dv, strm.at, strm.at + strm.len);
      const gps5 = items.find(k => k.key === 'GPS5');
      const gps9 = items.find(k => k.key === 'GPS9');
      const data = gps9 ?? gps5;
      if (!data || !data.repeat) continue;
      const scalK = items.find(k => k.key === 'SCAL');
      const scal = scalK ? records(dv, scalK).map(r => r[0]) : [];
      const sc = (i: number) => (scal.length > 1 ? scal[i] : scal[0]) || 1;
      const typeK = items.find(k => k.key === 'TYPE');
      const rows = records(dv, data, typeK ? str(dv, typeK) : gps9 ? 'lllllllSS' : undefined);
      const n = rows.length;

      if (gps9) {
        // lat, lon, alt, 2D speed, 3D speed, days since 2000, secs since midnight, DOP, fix
        rows.forEach((r, i) => {
          const fix = r[8] / sc(8), dop = r[7] / sc(7);
          if (fix < 2 || dop > 10) return;
          const utc = Date.UTC(2000, 0, 1) + (r[5] / sc(5)) * 86400000 + (r[6] / sc(6)) * 1000;
          out.push({ media: mediaStart + (i / n) * mediaDur, lat: r[0] / sc(0), lng: r[1] / sc(1), ele: r[2] / sc(2), utc });
        });
      } else {
        const fixK = items.find(k => k.key === 'GPSF');
        const dopK = items.find(k => k.key === 'GPSP');
        const fix = fixK ? records(dv, fixK)[0][0] : 3;
        const dop = dopK ? records(dv, dopK)[0][0] / 100 : 0;
        if (fix < 2 || dop > 10) continue;
        const uK = items.find(k => k.key === 'GPSU');
        const utc = uK ? gpsuTime(str(dv, uK)) : null;
        if (utc !== null && meta.utcBase === undefined) meta.utcBase = utc - mediaStart * 1000;
        rows.forEach((r, i) => out.push({ media: mediaStart + (i / n) * mediaDur, lat: r[0] / sc(0), lng: r[1] / sc(1), ele: r[2] / sc(2) }));
      }
    }
  }
}

// ── Insta360 trailer ─────────────────────────────────────────────────────────

const INSTA_MAGIC = '8db42d694ccc418790edff439fe026bf';
const INSTA_FOOTER = 32 + 4 + 4 + 32; // padding, trailer size, version, magic

async function readInsta360(file: File): Promise<{ fixes: RawFix[]; meta: Meta } | null> {
  if (file.size < INSTA_FOOTER) return null;
  const foot = await readBytes(file, file.size - INSTA_FOOTER, INSTA_FOOTER);
  let magic = '';
  for (let i = 40; i < 72; i++) magic += String.fromCharCode(foot.getUint8(i));
  if (magic !== INSTA_MAGIC) return null;
  const trailerSize = foot.getUint32(32, true);
  if (trailerSize < INSTA_FOOTER || trailerSize > file.size) return null;

  // walk the records backwards: each record's data sits right before its 6-byte descriptor
  // (format u8, id u8, size u32 LE), the last descriptor right before the footer
  const fixes: RawFix[] = [];
  let off = INSTA_FOOTER + 6;
  for (let n = 0; off <= trailerSize && n < 256; n++) {
    const d = await readBytes(file, file.size - off, 6);
    const id = d.getUint8(1), size = d.getUint32(2, true);
    if (off + size > trailerSize) break;
    if (id === 7 && size >= 53) {
      const g = await readBytes(file, file.size - off - size, size);
      for (let p = 0; p + 53 <= size; p += 53) {
        const sec = Number(g.getBigUint64(p, true)), ms = g.getUint16(p + 8, true);
        const fixed = String.fromCharCode(g.getUint8(p + 10)) === 'A';
        let lat = g.getFloat64(p + 11, true);
        const ns = String.fromCharCode(g.getUint8(p + 19));
        let lng = g.getFloat64(p + 20, true);
        const ew = String.fromCharCode(g.getUint8(p + 28));
        const ele = g.getFloat64(p + 45, true);
        if (!fixed) continue;
        if (ns === 'S') lat = -Math.abs(lat);
        if (ew === 'W') lng = -Math.abs(lng);
        fixes.push({ media: NaN, lat, lng, ele, utc: sec * 1000 + ms });
      }
    }
    off += size + 6;
  }
  if (!fixes.length) return null;
  fixes.sort((a, b) => a.utc! - b.utc!);
  // no exact link to the video's first frame here – the sync editor aligns it
  fixes.forEach(f => { f.media = (f.utc! - fixes[0].utc!) / 1000; });
  return { fixes, meta: { camera: 'Insta360', inexact: true } };
}

type Meta = { camera?: string; utcBase?: number; inexact?: boolean };

async function readOneFile(file: File, onProgress?: (p: number) => void) {
  const insta = await readInsta360(file);
  if (insta) { onProgress?.(1); return insta; }
  const boxes = await topBoxes(file);
  const moovBox = boxes.find(b => b.type === 'moov');
  if (!moovBox) throw new Error(t('„{name}“ ist keine MP4-Videodatei.', { name: file.name }));
  if (moovBox.size > 200 * 1024 * 1024) throw new Error(t('„{name}“ hat einen ungewöhnlich großen Index.', { name: file.name }));
  const moov = await readBytes(file, moovBox.start, moovBox.size);
  const track = findGpmdTrack(moov);
  if (!track) return null;

  const fixes: RawFix[] = [];
  const meta: Meta = {};
  // read samples in batches of consecutive bytes (fewer, larger reads)
  const S = track.samples;
  for (let i = 0; i < S.length;) {
    let j = i, end = S[i].offset + S[i].size;
    while (j + 1 < S.length && S[j + 1].offset === end && end - S[i].offset < 4 * 1024 * 1024) { j++; end += S[j].size; }
    const chunk = await readBytes(file, S[i].offset, end - S[i].offset);
    for (let k = i; k <= j; k++) {
      const s = S[k];
      try {
        parseSample(new DataView(chunk.buffer, s.offset - S[i].offset, s.size), s.time, s.duration, fixes, meta);
      } catch { /* a damaged block is skipped */ }
    }
    i = j + 1;
    onProgress?.(i / S.length);
  }
  return { fixes, meta };
}

// Reads the GPS of one or more camera files (several = chapters of one ride, e.g. GH01…, GH02…)
export async function readCameraGps(files: File[], onProgress?: (p: number) => void): Promise<CameraTrack> {
  const parts: { file: File; fixes: RawFix[]; meta: Meta }[] = [];
  for (let f = 0; f < files.length; f++) {
    const r = await readOneFile(files[f], p => onProgress?.((f + p) / files.length));
    if (r && r.fixes.length) parts.push({ file: files[f], ...r });
  }
  if (!parts.length) {
    throw new Error(t('In der Datei sind keine GPS-Daten. Unterstützt werden Original-Dateien von GoPro (mit GPS) und Insta360 (mit GPS-Fernbedienung oder App aufgenommen) – ein Video von YouTube oder ein geschnittener Export enthält sie nicht mehr.'));
  }

  // absolute time per fix: GPS9 carries it; GPS5 gets it from GPSU (else the file order)
  let fallback = Date.UTC(2000, 0, 1);
  const withTime = parts.map(p => {
    const base = p.meta.utcBase ?? (p.fixes[0].utc !== undefined ? p.fixes[0].utc - p.fixes[0].media * 1000 : fallback);
    fallback = base + (p.fixes[p.fixes.length - 1].media + 3600) * 1000;
    return { ...p, base, fixes: p.fixes.map(x => ({ ...x, time: x.utc ?? base + x.media * 1000 })) };
  }).sort((a, b) => a.base - b.base);

  // thin out to at most ~2 points per second (GoPro records 10–18 per second)
  const points: TrackPoint[] = [];
  let lastT = -Infinity;
  for (const p of withTime) for (const x of p.fixes) {
    if (x.time - lastT < 500) continue;
    if (!isFinite(x.lat) || !isFinite(x.lng) || Math.abs(x.lat) > 90 || Math.abs(x.lng) > 180 || (x.lat === 0 && x.lng === 0)) continue;
    points.push({ lat: x.lat, lng: x.lng, ele: isFinite(x.ele) ? Math.round(x.ele * 10) / 10 : undefined, time: Math.round(x.time) });
    lastT = x.time;
  }
  if (points.length < 2) throw new Error(t('Die Kamera hatte während der Aufnahme keinen GPS-Empfang.'));

  // the first file's video second 0 lies this many seconds before the first GPS point
  const first = withTime[0];
  const videoOffset = first.meta.inexact ? undefined : +((first.base - points[0].time!) / 1000).toFixed(1);
  if (first.meta.inexact) return { points, camera: first.meta.camera || 'Insta360', videoOffset, files: parts.length };
  const name = first.meta.camera && !/^camera$/i.test(first.meta.camera) ? first.meta.camera : 'GoPro';
  return { points, camera: /gopro/i.test(name) ? name : `GoPro ${name}`, videoOffset, files: parts.length };
}
