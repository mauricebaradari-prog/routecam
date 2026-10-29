'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, FileCheck2, AlertTriangle, Video, Trash2, Clock } from 'lucide-react';
import {
  ACCEPTED_TRACK_FILES, parseTrackFile, trackStats, parseYouTubeId, formatClock,
  type TrackPoint, type TrackStats,
} from '@/lib/track';
import { VISIBILITY_OPTIONS, type Visibility } from '@/lib/routeVisibility';
import { useYouTubeDuration } from '@/lib/youtubeDuration';
import { loadSettings } from '@/lib/settings';
import { VisibilityBadge, VisibilityIcon } from '@/components/Visibility';

export interface NewRide {
  title: string;
  videoId: string;
  durationSeconds: number;
  points: TrackPoint[];
  visibility: Visibility;
  align: boolean; // open the sync editor right after creating
}

interface Props {
  onClose: () => void;
  onCreate: (ride: NewRide) => void | Promise<void>;
}

export default function CreateRideModal({ onClose, onCreate }: Props) {
  const [ytInput, setYtInput] = useState('');
  const [titleMode, setTitleMode] = useState<'youtube' | 'custom'>('youtube');
  const [customTitle, setCustomTitle] = useState('');
  const [file, setFile] = useState<{ name: string; points: TrackPoint[]; stats: TrackStats } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(() => loadSettings().defaultVisibility); // see /settings
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const customInput = useRef<HTMLInputElement>(null);

  const videoId = parseYouTubeId(ytInput);
  const ytInvalid = ytInput.trim() !== '' && !videoId;
  const yt = useYouTubeDuration(videoId);
  const durationSeconds = yt.status === 'ok' ? yt.seconds : null;
  const ytTitle = yt.status === 'ok' ? yt.title : '';
  const effectiveMode = titleMode;

  // The YouTube title is always the default – also after switching to another video
  useEffect(() => { setTitleMode('youtube'); }, [videoId]);
  const title = (effectiveMode === 'youtube' ? ytTitle : customTitle).trim();
  const canSave = !!videoId && !!file && title !== '' && !!durationSeconds && !saving;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function handleFile(f: File) {
    setFileError(null);
    try {
      const parsed = parseTrackFile(await f.text(), f.name);
      const stats = trackStats(parsed.points);
      setFile({ name: f.name, points: parsed.points, stats });
      if (!customTitle && parsed.name) setCustomTitle(parsed.name);
    } catch (e) {
      setFile(null);
      setFileError(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  // Sync is possible when the track has timestamps (one continuous video, one offset)
  const canAlign = !!file?.stats.hasTime;
  const videoTooLong = !!(file?.stats.durationSeconds && durationSeconds && durationSeconds > file.stats.durationSeconds + 5);

  async function submit(e: React.FormEvent, align = canAlign) {
    e.preventDefault();
    if (!canSave || !file || !videoId || !durationSeconds) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onCreate({ title, videoId, durationSeconds, points: file.points, visibility, align });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-0 md:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full h-full md:h-auto md:max-w-5xl flex flex-col bg-[#1f1f1f] md:rounded-2xl border border-white/10 shadow-2xl text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 h-16 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-white/40">Fahrt anlegen</div>
            <h2 className={`text-lg font-semibold truncate ${title ? 'text-white' : 'text-white/30'}`}>{title || 'Neue Fahrt'}</h2>
          </div>
          <div className="ml-auto shrink-0"><VisibilityBadge v={visibility} size="md" /></div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10">
            <X size={22} />
          </button>
        </div>

        {/* Body: left = video + geodata, right = title + visibility. Scrolls only on small screens. */}
        <div className="flex-1 overflow-y-auto md:overflow-visible grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-6 md:gap-8 px-6 py-5">
          {/* ── Left column ── */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* YouTube */}
            <Field label="YouTube-Video" required>
              <div className="flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <input
                    autoFocus
                    value={ytInput}
                    onChange={e => setYtInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className={inputCls(ytInvalid)}
                  />
                  {/* fixed-height status line so the dialog doesn't jump */}
                  <p className={`mt-1.5 h-4 text-xs truncate ${ytInvalid || yt.status === 'error' ? 'text-red-300' : 'text-white/40'}`}>
                    {ytInvalid && 'Das ist kein gültiger YouTube-Link.'}
                    {!ytInvalid && yt.status === 'loading' && 'Video wird geladen …'}
                    {!ytInvalid && yt.status === 'ok' && <>Videolänge <span className="font-mono text-white/80">{formatClock(yt.seconds)}</span></>}
                    {!ytInvalid && yt.status === 'error' && yt.message}
                  </p>
                </div>
                <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {yt.status === 'ok' && (
                    <span className="absolute bottom-1 right-1 z-10 rounded bg-black/80 px-1 py-px text-[10px] font-mono">{formatClock(yt.seconds)}</span>
                  )}
                  {videoId
                    ? <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                    : <Video size={22} className="text-white/20" />}
                </div>
              </div>
            </Field>

            {/* Geodaten */}
            <Field label="Geodaten" required hint="GPX oder KML">
              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  className={`w-full h-[244px] rounded-xl border-2 border-dashed px-6 flex flex-col items-center justify-center gap-2 transition-colors ${
                    dragOver ? 'border-[#CCFF00] bg-[#CCFF00]/5' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"><Upload size={20} /></span>
                  <span className="text-sm font-medium">Datei hierher ziehen oder auswählen</span>
                  <span className="text-xs text-white/40">aus einer Tracking-App, einem Navi oder der Kamera</span>
                </button>
              ) : (
                <div className="h-[244px] rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <div className="flex items-center gap-3">
                    <FileCheck2 size={18} className="text-[#CCFF00] shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{file.name}</span>
                    <button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }} title="Datei entfernen" className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <TrackPreview points={file.points} />
                  <dl className="grid grid-cols-4 gap-3 text-xs">
                    <Stat label="Distanz" value={`${file.stats.distanceKm.toFixed(1)} km`} />
                    <Stat label="Höhe ↑" value={file.stats.climbM !== null ? `${Math.round(file.stats.climbM)} m` : '–'} />
                    <Stat label="Fahrzeit" value={file.stats.durationSeconds ? formatClock(file.stats.durationSeconds) : '–'} />
                    <Stat label="Punkte" value={file.stats.pointCount.toLocaleString('de-DE')} />
                  </dl>
                  {/* fixed-height status line: timestamps / video coverage */}
                  <p className={`mt-2 h-4 flex gap-2 text-xs truncate ${!file.stats.hasTime || videoTooLong ? 'text-amber-300' : 'text-white/50'}`}>
                    {!file.stats.hasTime ? (<>
                      <AlertTriangle size={14} className="shrink-0" />
                      Keine Zeitstempel – die Position im Video wird gleichmäßig geschätzt.
                    </>) : videoTooLong ? (<>
                      <AlertTriangle size={14} className="shrink-0" />
                      Das Video ist länger als die Aufzeichnung – passt die Datei zum Video?
                    </>) : durationSeconds ? (<>
                      <Clock size={14} className="shrink-0 text-[#CCFF00]" />
                      <span>Video <span className="font-mono text-white/80">{formatClock(durationSeconds)}</span> · Aufzeichnung <span className="font-mono text-white/80">{formatClock(file.stats.durationSeconds!)}</span> · Start gleichgesetzt</span>
                    </>) : 'Zeitstempel vorhanden – Video lässt sich ausrichten'}
                  </p>
                </div>
              )}
              <input ref={fileInput} type="file" accept={ACCEPTED_TRACK_FILES} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <p className="mt-1.5 h-4 text-xs text-red-300 truncate">{fileError}</p>
            </Field>
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-5 min-w-0 md:border-l md:border-white/10 md:pl-8">
            {/* Titel */}
            <Field label="Titel" required>
              <div className="flex flex-col gap-1">
                <label className={`flex items-start gap-3 px-3 py-3 rounded-lg cursor-pointer border transition-colors ${
                  effectiveMode === 'youtube' ? 'border-[#CCFF00]/40 bg-[#CCFF00]/[0.06]' : 'border-transparent hover:bg-white/5'
                }`}>
                  <input type="radio" name="title-mode" checked={effectiveMode === 'youtube'} onChange={() => setTitleMode('youtube')} className="mt-1 accent-[#CCFF00]" />
                  <span className="min-w-0">
                    <span className="block text-xs text-white/50">YouTube-Titel übernehmen</span>
                    <span className={`block mt-1 text-[15px] font-medium leading-snug line-clamp-2 ${ytTitle ? 'text-white' : 'text-white/30'}`}>
                      {ytTitle || (yt.status === 'loading' ? 'Wird geladen …' : 'Erscheint, sobald das Video geladen ist')}
                    </span>
                  </span>
                </label>
                <label className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                  effectiveMode === 'custom' ? 'border-[#CCFF00]/40 bg-[#CCFF00]/[0.06]' : 'border-transparent hover:bg-white/5'
                }`}>
                  <input type="radio" name="title-mode" checked={effectiveMode === 'custom'} onChange={() => { setTitleMode('custom'); setTimeout(() => customInput.current?.focus(), 0); }} className="mt-1 accent-[#CCFF00]" />
                  <span className="block text-sm">Eigener Titel</span>
                </label>
                {/* always rendered (reserves its space); typing into it switches to "Eigener Titel" */}
                <input
                  ref={customInput}
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  onFocus={() => setTitleMode('custom')}
                  placeholder="z. B. Paphos → Troodos"
                  maxLength={100}
                  className={inputCls(false) + ` mt-1 transition-opacity ${effectiveMode === 'custom' ? '' : 'opacity-40'}`}
                />
              </div>
            </Field>

            {/* Sichtbarkeit */}
            <Field label="Sichtbarkeit">
              <div className="flex flex-col gap-1">
                {VISIBILITY_OPTIONS.map(o => (
                  <label key={o.value} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                    visibility === o.value ? 'border-white/15 bg-white/[0.05]' : 'border-transparent hover:bg-white/5'
                  }`}>
                    <input type="radio" name="new-ride-visibility" checked={visibility === o.value} onChange={() => setVisibility(o.value)} className="mt-1 accent-[#CCFF00]" />
                    <VisibilityIcon v={o.value} size={18} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm">{o.label}</span>
                      <span className="block text-xs text-white/40">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-white/10 shrink-0">
          <p className="text-[11px] text-white/35 flex-1">{saveError ? <span className="text-red-300">{saveError}</span> : 'Wird vorerst nur in diesem Browser gespeichert.'}</p>
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">Abbrechen</button>
          {canAlign && (
            <button
              type="button"
              disabled={!canSave}
              onClick={e => submit(e, false)}
              title="Mit dem angenommenen Video-Start speichern – ausrichten geht später im Dashboard"
              className="h-10 px-4 rounded-full text-sm font-medium border border-white/15 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Anlegen
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="h-10 px-5 rounded-full text-sm font-semibold bg-[#CCFF00] text-black disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {canAlign ? 'Anlegen & ausrichten' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full h-11 px-3 rounded-lg bg-[#121212] border text-[15px] text-white placeholder:text-white/30 outline-none transition-colors ${
    invalid ? 'border-red-400/60' : 'border-white/15 focus:border-[#CCFF00]/60'
  }`;
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}{required && <span className="text-[#CCFF00]"> *</span>}</span>
        {hint && <span className="text-xs text-white/40">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className="font-mono mt-0.5">{value}</dd>
    </div>
  );
}

// Small outline of the uploaded track, fitted into the box.
function TrackPreview({ points }: { points: TrackPoint[] }) {
  const d = useMemo(() => {
    const W = 600, H = 140, pad = 8;
    const step = Math.max(1, Math.floor(points.length / 800));
    const pts = points.filter((_, i) => i % step === 0);
    const k = Math.cos((pts[0].lat * Math.PI) / 180);
    const xs = pts.map(p => p.lng * k), ys = pts.map(p => p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
    return pts.map((_, i) => `${i ? 'L' : 'M'}${(ox + (xs[i] - minX) * scale).toFixed(1)},${(H - oy - (ys[i] - minY) * scale).toFixed(1)}`).join(' ');
  }, [points]);
  return (
    <svg viewBox="0 0 600 140" className="w-full flex-1 min-h-0 my-2.5 rounded-lg bg-black/30">
      <path d={d} fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
