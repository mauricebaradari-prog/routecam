'use client';

// Cookie-Banner: mittig, Hintergrund weichgezeichnet, ein Keks im Look unserer Routenlinie.
// Fragt nur, was eine Einwilligung braucht (YouTube, Google One Tap); alles andere ist
// notwendig und wird im FAQ-Teil nur erklärt. Texte auf Deutsch und Englisch – wie die
// Rechtstexte –, jede andere Sprache bekommt Englisch.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { currentLang, useT } from '@/lib/i18n';
import { getConsent, setConsent, onConsentOpen, useConsent } from '@/lib/consent';

const LIME = '#CCFF00';

type Item = { name: string; keys?: string; text: string };
type Copy = {
  title: string; intro: string; necessaryTitle: string; necessaryNote: string; optionalTitle: string; optionalNote: string;
  necessary: Item[]; optional: Item[]; footer: string; privacy: string; reject: string; accept: string; always: string;
  videoNote: string; videoLoad: string; settings: string;
};

const DE: Copy = {
  title: 'Cookies braucht man nicht nur beim Motorradfahren – sondern auch bei routecam.app',
  intro: 'RouteCam selbst setzt keine Werbe- oder Analyse-Cookies. Nur für die eingebetteten YouTube-Videos und die Google-Anmeldung mit einem Klick brauchen wir dein Okay.',
  necessaryTitle: 'Notwendig',
  necessaryNote: 'Damit RouteCam funktioniert – immer aktiv.',
  optionalTitle: 'Externe Medien',
  optionalNote: 'Nur mit deinem Okay.',
  always: 'Immer aktiv',
  necessary: [
    { name: 'Anmeldung', keys: 'routecam.auth', text: 'Hält dich angemeldet, nachdem du dich mit Google eingeloggt hast.' },
    { name: 'Einstellungen', keys: 'routecam.settings, routecam.mapStyle', text: 'Merkt sich Sprache, Ansicht und Kartenstil.' },
    { name: 'Hinweise', keys: 'routecam.onboardingSeen, routecam.trackerTeaserDismissed …', text: 'Damit Einführung und Hinweise nicht bei jedem Besuch wieder auftauchen.' },
    { name: 'Zwischenspeicher', keys: 'routecam.dbcache, osrmCache', text: 'Bereits berechnete Strecken und Daten, damit die Karte schneller lädt.' },
    { name: 'Deine Wahl hier', keys: 'routecam.consent', text: 'Merkt sich, was du in diesem Fenster entschieden hast.' },
  ],
  optional: [
    { name: 'YouTube (Google)', text: 'Spielt die Videos zu den Fahrten ab. YouTube setzt dabei eigene Cookies (z. B. YSC, VISITOR_INFO1_LIVE) und erfährt, dass du die Seite besuchst. Ohne dein Okay siehst du statt des Videos einen Platzhalter.' },
    { name: 'Google-Anmeldung mit einem Klick', text: 'Bietet dir die Anmeldung unten in der Ecke an („One Tap“). Google erkennt dabei, ob du im Browser bei Google angemeldet bist. Ohne dein Okay meldest du dich einfach über „Anmelden“ an.' },
  ],
  footer: 'Alles liegt im Speicher deines Browsers. Deine Wahl kannst du jederzeit im Menü unter „Cookie-Einstellungen“ ändern.',
  privacy: 'Datenschutz',
  reject: 'Nur notwendige',
  accept: 'Alle erlauben',
  videoNote: 'Das Video kommt von YouTube. Beim Laden setzt YouTube eigene Cookies.',
  videoLoad: 'Video von YouTube laden',
  settings: 'Cookie-Einstellungen',
};

const EN: Copy = {
  title: 'Cookies aren’t just for motorcycle rides – routecam.app needs a few too',
  intro: 'RouteCam itself sets no advertising or analytics cookies. We only need your okay for the embedded YouTube videos and one-click Google sign-in.',
  necessaryTitle: 'Necessary',
  necessaryNote: 'So RouteCam works – always on.',
  optionalTitle: 'External media',
  optionalNote: 'Only with your okay.',
  always: 'Always on',
  necessary: [
    { name: 'Sign-in', keys: 'routecam.auth', text: 'Keeps you signed in after you log in with Google.' },
    { name: 'Settings', keys: 'routecam.settings, routecam.mapStyle', text: 'Remembers your language, view and map style.' },
    { name: 'Hints', keys: 'routecam.onboardingSeen, routecam.trackerTeaserDismissed …', text: 'So the introduction and hints don’t show up again on every visit.' },
    { name: 'Cache', keys: 'routecam.dbcache, osrmCache', text: 'Routes and data that were already calculated, so the map loads faster.' },
    { name: 'Your choice here', keys: 'routecam.consent', text: 'Remembers what you decided in this window.' },
  ],
  optional: [
    { name: 'YouTube (Google)', text: 'Plays the videos of the rides. YouTube sets its own cookies (e.g. YSC, VISITOR_INFO1_LIVE) and learns that you are visiting the site. Without your okay you see a placeholder instead of the video.' },
    { name: 'One-click Google sign-in', text: 'Offers you sign-in in the corner (“One Tap”). Google can tell whether you are signed in to Google in your browser. Without your okay you simply sign in via “Sign in”.' },
  ],
  footer: 'Everything is kept in your browser’s storage. You can change your choice at any time in the menu under “Cookie settings”.',
  privacy: 'Privacy',
  reject: 'Necessary only',
  accept: 'Allow all',
  videoNote: 'The video comes from YouTube. When it loads, YouTube sets its own cookies.',
  videoLoad: 'Load video from YouTube',
  settings: 'Cookie settings',
};

export const consentCopy = () => (currentLang() === 'de' ? DE : EN);

/** Keks als Routenlinie: Verlauf Weiß → Neongrün, Glow, Start- und Endpunkt am Biss, Krümel als Punkte */
function RouteCookie() {
  // Kreis mit Biss rechts oben, als ein durchgehender Pfad (Start und Ende an den Biss-Kanten)
  // Kreis (Mitte 60/64, r 44) mit Biss oben rechts: die Route läuft einmal außen herum,
  // Start (weiß) und Ziel (neongrün) liegen an den Kanten des Bisses, der Biss selbst ist gestrichelt.
  const route = 'M 71.4 21.5 A 44 44 0 1 0 102.5 52.6';
  const bite = 'M 71.4 21.5 A 24 24 0 0 0 102.5 52.6';
  return (
    <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden className="block mx-auto overflow-visible">
      <defs>
        <linearGradient id="cookie-route" x1="60" y1="18" x2="104" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.4" stopColor="#efffbf" />
          <stop offset="1" stopColor={LIME} />
        </linearGradient>
        <filter id="cookie-glow" filterUnits="userSpaceOnUse" x="-20" y="-20" width="164" height="164"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      <path d={bite} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" className="cookie-crumb" style={{ animationDelay: '1.3s' }} />
      <path d={route} fill="none" stroke={LIME} strokeOpacity="0.5" strokeWidth="9" strokeLinecap="round" filter="url(#cookie-glow)" className="cookie-draw" pathLength={1} />
      <path d={route} fill="none" stroke="url(#cookie-route)" strokeWidth="3.6" strokeLinecap="round" className="cookie-draw" pathLength={1} />
      {/* Krümel – wie Wegpunkte */}
      {[[38, 54], [58, 78], [34, 84], [76, 94], [52, 100], [84, 72], [56, 48]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 2.6 : 3.4} fill={LIME} className="cookie-crumb" style={{ animationDelay: `${0.9 + i * 0.08}s` }} />
      ))}
      <circle cx="71.4" cy="21.5" r="5" fill="#fff" stroke="#0c0d11" strokeWidth="2" />
      <circle cx="102.5" cy="52.6" r="6" fill={LIME} stroke="#0c0d11" strokeWidth="2" className="cookie-crumb" style={{ animationDelay: '1.45s' }} />
    </svg>
  );
}

function Faq({ item, defaultOpen = false }: { item: Item; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/[0.07] first:border-t-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-2.5 text-left text-sm text-white/90 hover:text-white">
        <span>{item.name}</span>
        <ChevronDown size={16} className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-3 -mt-0.5 text-[13px] leading-relaxed text-white/60">
          {item.text}
          {item.keys && <div className="mt-1 font-mono text-[11px] text-white/35 break-words">{item.keys}</div>}
        </div>
      )}
    </div>
  );
}

export default function ConsentBanner() {
  useT();
  const choice = useConsent();
  const [reopened, setReopened] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- erst im Browser entscheiden (statischer Export)
  useEffect(() => { setMounted(true); return onConsentOpen(() => setReopened(true)); }, []);

  const show = mounted && (choice === 'unset' || reopened);
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [show]);
  if (!show) return null;

  const c = consentCopy();
  const decide = (v: 'necessary' | 'all') => { setConsent(v); setReopened(false); };
  const current = getConsent();

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
      {/* Desktop: links Keks, Text und Knöpfe – rechts das FAQ. Handy: untereinander, Knöpfe unten. */}
      <div className="consent-card relative w-full max-w-[540px] md:max-w-[980px] max-h-[calc(100dvh-32px)] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0d11]/95 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="[grid-area:intro] self-center px-6 pt-7 pb-4 md:px-12 md:pt-10 md:pb-6">
          <RouteCookie />
          <h2 id="consent-title" className="mt-4 md:mt-6 mb-2 md:mb-3 text-center text-[21px] md:text-[28px] font-bold leading-tight text-white">{c.title}</h2>
          <p className="m-0 text-center text-sm md:text-[15px] leading-relaxed text-white/65">{c.intro}</p>
        </div>

        {/* scrollt, aber ohne sichtbaren Scrollbalken; unten blendet es weich aus */}
        <div className="consent-scroll [grid-area:faq] min-h-0 overflow-y-auto overscroll-contain px-6 pb-4 md:px-8 md:py-8 md:border-l md:border-white/[0.08]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: LIME }}>{c.optionalTitle}</span>
              <span className="text-xs text-white/40">{c.optionalNote}</span>
            </div>
            <div className="mt-1">{c.optional.map(it => <Faq key={it.name} item={it} />)}</div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-white/80">{c.necessaryTitle}</span>
              <span className="text-xs text-white/40">{c.always}</span>
            </div>
            <div className="mt-0.5 text-xs text-white/40">{c.necessaryNote}</div>
            <div className="mt-1">{c.necessary.map(it => <Faq key={it.name} item={it} />)}</div>
          </div>

          <p className="mt-4 mb-0 text-xs leading-relaxed text-white/45">
            {c.footer} <Link href="/about#datenschutz" className="underline underline-offset-2 hover:text-white" onClick={() => setReopened(false)}>{c.privacy}</Link>
          </p>
        </div>

        {/* gleich große Knöpfe, immer sichtbar: Ablehnen ist so leicht wie Zustimmen */}
        <div className="[grid-area:btn] border-t border-white/[0.08] px-6 py-4 md:px-12 md:py-6 grid grid-cols-2 gap-2.5 md:gap-3">
          <button type="button" onClick={() => decide('necessary')}
            className={`h-12 md:h-14 rounded-full text-[14px] sm:text-[15px] md:text-base font-semibold border transition-colors ${current === 'necessary' ? 'border-white/40' : 'border-white/15'} bg-white/[0.08] text-white hover:bg-white/[0.14]`}>
            {c.reject}
          </button>
          <button type="button" onClick={() => decide('all')}
            className="h-12 md:h-14 rounded-full text-[14px] sm:text-[15px] md:text-base font-semibold text-black hover:brightness-110 transition" style={{ background: LIME }}>
            {c.accept}
          </button>
        </div>
      </div>
      <style>{`
        .consent-card { display: grid; grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr) auto; grid-template-areas: 'intro' 'faq' 'btn'; }
        @media (min-width: 768px) { .consent-card { grid-template-columns: minmax(0,1fr) minmax(0,1fr); grid-template-rows: minmax(0,1fr) auto; grid-template-areas: 'intro faq' 'btn faq'; } }
        .consent-scroll { scrollbar-width: none; -ms-overflow-style: none; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); }
        .consent-scroll::-webkit-scrollbar { display: none; }
        .cookie-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cookieDraw 1.4s cubic-bezier(.45,0,.2,1) .15s forwards; }
        .cookie-crumb { opacity: 0; transform-box: fill-box; transform-origin: center; animation: cookieCrumb .35s ease-out forwards; }
        @keyframes cookieDraw { to { stroke-dashoffset: 0 } }
        @keyframes cookieCrumb { from { opacity: 0; transform: scale(.2) } to { opacity: 1; transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) { .cookie-draw { animation: none; stroke-dashoffset: 0 } .cookie-crumb { animation: none; opacity: 1 } }
      `}</style>
    </div>
  );
}
