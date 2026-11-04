'use client';

// Teaser für die RouteCam-Tracker-App (Figma: „Schritt für Schritt“ → Marketing → Frame 2).
// Erscheint auf der Karte ein paar Sekunden nach dem Laden unten links, kommt animiert herein
// und lässt sich wegklicken. Weggeklickt (oder „Mehr erfahren“ geklickt) = gemerkt in
// localStorage, danach kommt er nicht wieder.
//
// Maße 1:1 aus Figma (250 × 400). Das Handy samt Schatten ist ein Bild aus Figma
// („Group 1“ als PNG @2x → public/teaser/phone.png).

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { t, useT } from '@/lib/i18n';
import { leaveWhilePlaying } from '@/lib/nav';

const DISMISS_KEY = 'routecam.trackerTeaserDismissed';
/** Wie lange nach dem Laden der Karte, bis der Teaser hereinkommt. */
const SHOW_DELAY_MS = 2500;
/** Ziel von „Mehr erfahren“ – der Onepager zur App kommt später. */
export const TRACKER_PAGE_HREF = '/tracker';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** leichtes Überschwingen für das Handy */
const EASE_BACK = 'cubic-bezier(0.34, 1.32, 0.64, 1)';

// Ablauf nach dem Hereinkommen (ms): Karte → grüne Fläche → Badge → Handy fliegt rein,
// gleichzeitig wird die Headline getippt; danach Link und X.
const T_GREEN = 120;
const T_BADGE = 380;
const T_PHONE = 300;
const T_TYPE = 620;
const CHAR_MS = 58;

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
  const [typed, setTyped] = useState(0);

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

  const line1 = t('Dein GPS');
  const line2 = t('Tracker');
  const chars1 = Array.from(line1);
  const chars2 = Array.from(line2);
  const total = chars1.length + chars2.length;
  const typeEnd = T_TYPE + total * CHAR_MS;

  // Headline Zeichen für Zeichen tippen
  useEffect(() => {
    if (phase !== 'in' || reduced) return;
    let iv = 0;
    const start = window.setTimeout(() => {
      iv = window.setInterval(() => {
        setTyped(n => {
          if (n + 1 >= total) window.clearInterval(iv);
          return Math.min(total, n + 1);
        });
      }, CHAR_MS);
    }, T_TYPE);
    return () => { window.clearTimeout(start); window.clearInterval(iv); };
  }, [phase, reduced, total]);

  if (phase === 'gone') return null;

  const shown = phase === 'in';
  const shownChars = reduced ? total : typed;
  const doneTyping = shownChars >= total;
  // ein Zeichen der Headline; unsichtbare Zeichen halten den Platz frei, damit nichts springt
  const ch = (c: string, i: number) => <span style={{ opacity: i < shownChars ? 1 : 0 }}>{c}</span>;
  const caretAt = Math.min(shownChars, total);
  const caret = (
    <span aria-hidden className="relative inline-block w-0 align-baseline">
      <span
        className="absolute left-[1px] bottom-[-3px] w-[2.5px] h-[26px] bg-[#1f1f1f]"
        style={{ animation: doneTyping ? 'rcTeaserCaret 0.9s steps(1) 3 forwards' : 'none' }}
      />
    </span>
  );
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
      className="fixed left-5 bottom-5 md:left-8 md:bottom-8 z-[70]"
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
          className="absolute left-[10px] top-[11px] w-[230px] h-[158px] rounded-[10px] bg-[#CCFF00] backdrop-blur-[15px] origin-top-left"
          style={enter(T_GREEN, 'scale(0.9)', 480)}
        />

        {/* Handy mit Schatten (Figma „Group 1“) */}
        <img
          src={`${BASE}/teaser/phone.png`}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute max-w-none select-none pointer-events-none"
          style={{
            left: -5.71, top: -71.63, width: 431.92, height: 521.31,
            ...enter(T_PHONE, 'translate(190px, 170px) rotate(16deg)', 1000),
            ...(!reduced && shown ? { transition: `opacity 400ms ease-out ${T_PHONE}ms, transform 1000ms ${EASE_BACK} ${T_PHONE}ms` } : null),
          }}
        />

        {/* Badge */}
        <div
          className="absolute left-[26px] top-[27px] h-[20px] inline-flex items-center justify-center rounded-full border border-[#1f1f1f] px-[9px] font-sans"
          style={enter(T_BADGE, 'translateY(8px) scale(0.85)', 420)}
        >
          <span className="block text-[9.5px] font-bold uppercase leading-none tracking-[0.5px] text-[#1f1f1f] whitespace-nowrap">
            {t('Neu · Kostenlos')}
          </span>
        </div>

        {/* Headline */}
        <h2
          className="absolute left-[26px] top-[56px] m-0 font-sans text-[28px] font-bold leading-[28px] tracking-[-0.8px] text-[#1f1f1f] whitespace-nowrap"
          style={{ opacity: shown ? 1 : 0, transition: 'opacity 220ms ease-in' }}
          aria-label={`${line1} ${line2}`}
        >
          <span aria-hidden>
            {caretAt === 0 && caret}
            {chars1.map((c, i) => <React.Fragment key={i}>{ch(c, i)}{caretAt === i + 1 && caret}</React.Fragment>)}
            <br />
            {chars2.map((c, i) => {
              const g = chars1.length + i;
              return <React.Fragment key={g}>{ch(c, g)}{caretAt === g + 1 && caret}</React.Fragment>;
            })}
          </span>
        </h2>
        <style>{'@keyframes rcTeaserCaret { 0% { opacity: 1 } 50% { opacity: 0 } 100% { opacity: 0 } }'}</style>

        {/* Mehr erfahren */}
        <Link
          href={TRACKER_PAGE_HREF}
          onClick={e => { markDismissed(); leaveWhilePlaying(e); }}
          className="absolute left-[27px] top-[136px] text-[13px] font-semibold leading-normal text-[#1f1f1f] underline decoration-from-font underline-offset-[from-font] hover:opacity-70 transition-opacity whitespace-nowrap"
          style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif', ...enter(typeEnd + 80, 'translateY(10px)', 460) }}
        >
          {t('Mehr erfahren')}
        </Link>

        {/* Schließen – Icon wie in Figma, Klickfläche 44 × 44 */}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Schließen')}
          className="absolute left-[202px] top-[2px] w-[44px] h-[44px] flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
          style={enter(typeEnd + 160, 'scale(0.6)', 360)}
        >
          <img src={`${BASE}/teaser/close.svg`} alt="" width={14} height={14} className="block" />
        </button>
      </div>
    </aside>
  );
}
