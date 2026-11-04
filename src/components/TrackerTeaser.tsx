'use client';

// Teaser für die RouteCam-Tracker-App (Figma: „Schritt für Schritt“ → Marketing → Frame 2).
// Erscheint auf der Karte ein paar Sekunden nach dem Laden unten rechts, kommt animiert herein
// und lässt sich wegklicken. Weggeklickt (oder „Mehr erfahren“ geklickt) = gemerkt in
// localStorage, danach kommt er nicht wieder.
//
// Maße 1:1 aus Figma (250 × 400). Das Handy samt Schatten ist ein Bild aus Figma
// („Group 1“ als PNG @2x → public/teaser/phone.png).

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import { t, useT } from '@/lib/i18n';
import { leaveWhilePlaying } from '@/lib/nav';

const bricolage = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], weight: '800', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin', 'latin-ext'], weight: '700', display: 'swap' });

const DISMISS_KEY = 'routecam.trackerTeaserDismissed';
/** Wie lange nach dem Laden der Karte, bis der Teaser hereinkommt. */
const SHOW_DELAY_MS = 2500;
/** Ziel von „Mehr erfahren“ – der Onepager zur App kommt später. */
export const TRACKER_PAGE_HREF = '/tracker';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

type Phase = 'waiting' | 'in' | 'out' | 'gone';

function isDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* privates Fenster o. Ä. */ }
}

export default function TrackerTeaser() {
  useT();
  const [phase, setPhase] = useState<Phase>('gone');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (isDismissed()) return;
    /* eslint-disable react-hooks/set-state-in-effect -- Sichtbarkeit hängt an localStorage und matchMedia */
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setPhase('waiting');
    /* eslint-enable react-hooks/set-state-in-effect */
    let raf = 0;
    const timer = window.setTimeout(() => {
      // ein Frame im Startzustand, damit die Übergänge auch laufen
      raf = requestAnimationFrame(() => setPhase('in'));
    }, SHOW_DELAY_MS);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  const dismiss = useCallback(() => {
    markDismissed();
    setPhase('out');
    window.setTimeout(() => setPhase('gone'), 320);
  }, []);

  if (phase === 'gone') return null;

  const shown = phase === 'in';
  // Elemente kommen gestaffelt: Karte, dann Handy, dann Texte
  const enter = (delay: number, from: string, ms = 520): React.CSSProperties => reduced
    ? { opacity: shown ? 1 : 0, transition: `opacity 200ms linear ${shown ? delay : 0}ms` }
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : from,
        transition: phase === 'out'
          ? `opacity 220ms ease-in, transform 260ms ease-in`
          : `opacity ${ms}ms ${EASE} ${delay}ms, transform ${ms}ms ${EASE} ${delay}ms`,
      };

  return (
    <aside
      aria-label={t('RouteCam Tracker')}
      aria-hidden={!shown}
      className="fixed right-4 bottom-4 md:right-6 md:bottom-6 z-[70]"
      style={{ pointerEvents: shown ? 'auto' : 'none' }}
    >
      <div
        className="relative overflow-hidden rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        style={{
          width: 250,
          height: 400,
          backgroundColor: '#1f1f1f',
          backgroundImage: 'linear-gradient(#333333 1px, transparent 1px), linear-gradient(90deg, #333333 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          ...enter(0, 'translateY(28px) scale(0.96)', 560),
        }}
      >
        {/* Abdunklung unten */}
        <div
          aria-hidden
          className="absolute left-0 bottom-0 w-[250px] h-[184px]"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%)' }}
        />

        {/* grüne Fläche */}
        <div
          aria-hidden
          className="absolute left-[10px] top-[11px] w-[230px] h-[158px] rounded-[10px] bg-[#CCFF00] backdrop-blur-[15px]"
          style={enter(80, 'translateY(-10px)')}
        />

        {/* Handy mit Schatten (Figma „Group 1“) */}
        <img
          src={`${BASE}/teaser/phone.png`}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute max-w-none select-none pointer-events-none"
          style={{ left: -5.71, top: -71.63, width: 431.92, height: 521.31, ...enter(220, 'translate(46px, 40px) rotate(4deg)', 760) }}
        />

        {/* Badge */}
        <div
          className="absolute left-[26px] top-[27px] rounded-full border-[0.774px] border-[#1f1f1f] px-[9.293px] py-[3.872px]"
          style={enter(360, 'translateY(8px)')}
        >
          <span className={`${dmSans.className} block text-[9.293px] font-bold uppercase leading-normal tracking-[0.3872px] text-[#1f1f1f] whitespace-nowrap`}>
            {t('Neu · Kostenlos')}
          </span>
        </div>

        {/* Headline */}
        <h2
          className={`${bricolage.className} absolute left-[27px] top-[56.14px] m-0 text-[27.862px] font-extrabold leading-[27.862px] tracking-[-0.5358px] text-[#1f1f1f] whitespace-nowrap`}
          style={{ fontVariationSettings: '"opsz" 14, "wdth" 100', ...enter(420, 'translateY(10px)') }}
        >
          {t('Dein GPS')}<br />{t('Tracker')}
        </h2>

        {/* Mehr erfahren */}
        <Link
          href={TRACKER_PAGE_HREF}
          onClick={e => { markDismissed(); leaveWhilePlaying(e); }}
          className="absolute left-[27px] top-[136px] text-[13px] font-semibold leading-normal text-[#1f1f1f] underline decoration-from-font underline-offset-[from-font] hover:opacity-70 transition-opacity whitespace-nowrap"
          style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif', ...enter(480, 'translateY(10px)') }}
        >
          {t('Mehr erfahren')}
        </Link>

        {/* Schließen – Icon wie in Figma, Klickfläche 44 × 44 */}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Schließen')}
          className="absolute left-[202px] top-[2px] w-[44px] h-[44px] flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
          style={enter(480, 'scale(0.6)')}
        >
          <img src={`${BASE}/teaser/close.svg`} alt="" width={14} height={14} className="block" />
        </button>
      </div>
    </aside>
  );
}
