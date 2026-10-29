'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Route as RouteIcon, MessageCircle, Heart, SquareUser, Bell, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { onSignupWall, openSignupWall, type WallReason } from '@/lib/signupWall';

// Free sign-up wall: blurred background, what you get with an account, Google sign-in.
// Opens on gated actions (see lib/signupWall.ts) and once per session while a visitor is
// clearly enjoying a ride. Visitors also get Google's small "One Tap" prompt.

const COPY: Record<WallReason, { title: string; text: string }> = {
  comment:  { title: 'Melde dich an, um zu kommentieren', text: 'Dein Kommentar bleibt im Feld stehen – nach der Anmeldung nur noch absenden.' },
  create:   { title: 'Melde dich an, um deine Fahrt anzulegen', text: 'Video und GPS-Strecke verbinden, auf deinem eigenen Kanal zeigen.' },
  interact: { title: 'Dir gefällt, was du siehst?', text: 'Mit einem kostenlosen Konto likest und bewertest du so viele Fahrten, wie du willst.' },
  engaged:  { title: 'Werde Teil der RouteCam-Community', text: 'Kostenlos und in fünf Sekunden – mit deinem Google-Konto.' },
};

const BENEFITS = [
  { icon: RouteIcon, text: 'Eigene Fahrten anlegen: YouTube-Video + GPX ergibt eine Fahrt auf dem 3D-Globus' },
  { icon: SquareUser, text: 'Dein eigener Kanal mit allen Fahrten und Gruppen' },
  { icon: MessageCircle, text: 'Kommentieren, genau an der Stelle im Video' },
  { icon: Heart, text: 'Liken und bewerten, so oft du willst' },
  { icon: Bell, text: 'Benachrichtigt werden, wenn andere auf deine Fahrten reagieren' },
];

const AUTO_KEY = 'routecam.wall.autoShown';   // sessionStorage: auto-open at most once per session
const RIDES_KEY = 'routecam.wall.rides';      // sessionStorage: rides opened this session
const ONETAP_KEY = 'routecam.oneTapShown';    // sessionStorage
const WATCH_SECONDS = 180;
const RIDES_BEFORE_WALL = 3;

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} },
};

export default function SignupWall() {
  const { user, configured, renderSignInButton, promptOneTap } = useAuth();
  const [reason, setReason] = useState<WallReason | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const [btnError, setBtnError] = useState(false);
  const [btnReady, setBtnReady] = useState(false);

  // A playing ride pauses while the wall is open, and continues on "Später"
  const resumeRef = useRef(false);
  const pauseRide = () => {
    const st = (window as any).__EDITOR_STATE;
    const player = (window as any).__YT_PLAYER;
    if (st?.isAnimating && player?.pauseVideo) { resumeRef.current = true; try { player.pauseVideo(); } catch {} }
  };
  const dismiss = () => {
    setReason(null);
    if (resumeRef.current) {
      resumeRef.current = false;
      try { (window as any).__YT_PLAYER?.playVideo?.(); } catch {}
    }
  };

  // open on request
  useEffect(() => onSignupWall(r => { pauseRide(); setReason(r); }), []);

  // signed in → wall closes (the first-login tutorial takes over)
  useEffect(() => { if (user) { resumeRef.current = false; setReason(null); } }, [user]);

  // engagement: ~3 min watched, or the 3rd ride opened → once per session
  useEffect(() => {
    if (user) return;
    let watched = 0;
    const iv = setInterval(() => {
      if (ss.get(AUTO_KEY)) return;
      const st = (window as any).__EDITOR_STATE;
      if (!st) return;
      if (st.isAnimating) watched += 1;
      if (st.activeRouteId) {
        const seen: string[] = JSON.parse(ss.get(RIDES_KEY) || '[]');
        if (!seen.includes(st.activeRouteId)) ss.set(RIDES_KEY, JSON.stringify([...seen, st.activeRouteId]));
      }
      const rides = JSON.parse(ss.get(RIDES_KEY) || '[]').length;
      if (watched >= WATCH_SECONDS || rides >= RIDES_BEFORE_WALL) {
        ss.set(AUTO_KEY, '1');
        openSignupWall('engaged');
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [user]);

  // Google One Tap for visitors: a few seconds after arriving, once per session
  useEffect(() => {
    if (user || !configured || ss.get(ONETAP_KEY)) return;
    const t = setTimeout(() => { ss.set(ONETAP_KEY, '1'); promptOneTap(); }, 6000);
    return () => clearTimeout(t);
  }, [user, configured, promptOneTap]);

  // Google button inside the wall
  useEffect(() => {
    if (!reason || user || !configured || !btnRef.current) return;
    setBtnError(false);
    setBtnReady(false);
    const el = btnRef.current;
    renderSignInButton(el, 'outline')
      // Google swaps in its (sometimes personalised) button a moment later – fade it in once it's there
      .then(() => setTimeout(() => setBtnReady(true), 250))
      .catch(() => setBtnError(true));
  }, [reason, user, configured, renderSignInButton]);

  // Escape = later
  useEffect(() => {
    if (!reason) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [reason]);

  if (!reason || user) return null;
  const copy = COPY[reason];

  return (
    <div className="fixed inset-0 z-[96] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md signup-fade" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-title"
        className="relative w-full sm:max-w-[440px] max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-2xl sm:rounded-2xl bg-[#151515] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.7)] text-white signup-rise"
      >
        <button onClick={dismiss} aria-label="Schließen" className="absolute right-3 top-3 z-10 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white">
          <X size={16} />
        </button>

        <div className="px-6 pt-7 pb-6 relative">
          <h2 id="signup-title" className="pr-8 text-xl font-semibold tracking-tight text-balance">{copy.title}</h2>
          <p className="mt-1.5 text-sm text-white/60 leading-relaxed">{copy.text}</p>

          <ul className="mt-5 flex flex-col gap-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/85 leading-snug">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-[#CCFF00]/10 text-[#CCFF00] flex items-center justify-center">
                  <Icon size={15} />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col items-center gap-3">
            {configured && !btnError ? (
              <>
                {/* fixed box: the window must not jump while Google renders its button */}
                <div ref={btnRef} className={`h-11 w-[240px] flex items-center justify-center overflow-hidden transition-opacity duration-200 ${btnReady ? 'opacity-100' : 'opacity-0'}`} />
                <span className="inline-flex items-center rounded-full bg-[#CCFF00] text-black text-[11px] font-semibold px-2.5 py-1">Kostenlos</span>
              </>
            ) : (
              <p className="text-xs text-amber-300 text-center">Die Anmeldung ist gerade nicht erreichbar. Bitte später noch einmal versuchen.</p>
            )}
            <p className="text-[11px] text-white/40 text-center leading-snug">
              Kein Passwort, keine Werbung. Mit der Anmeldung akzeptierst du die{' '}
              <Link href="/about#agb" onClick={() => setReason(null)} className="text-white/70 underline underline-offset-2">Nutzungsbedingungen</Link> und hast die{' '}
              <Link href="/about#datenschutz" onClick={() => setReason(null)} className="text-white/70 underline underline-offset-2">Datenschutzerklärung</Link> gelesen.
            </p>
            <button onClick={dismiss} className="text-sm text-white/50 hover:text-white px-3 py-1.5">
              Später
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
