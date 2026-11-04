'use client';

// Übersetzungen. Schlüssel ist der deutsche Text selbst: t('Abmelden') → „Sign out“.
// Die Wörterbücher liegen in src/i18n/<code>.json und werden erst geladen, wenn die Sprache
// gebraucht wird. Fehlt eine Übersetzung, gilt Englisch, dann der deutsche Text.
//
// Platzhalter: t('Konto: {name}', { name }).
// Text mit Links o. Ä.: rich('Lies die <0>Bedingungen</0>.', [s => <a href="…">{s}</a>]).
//
// Die Sprache wechselt erst nach dem ersten Rendern (useEffect im I18nProvider), damit der
// statisch erzeugte deutsche HTML-Text zur ersten Darstellung passt.

import React, { useEffect, useSyncExternalStore } from 'react';
import { LANGUAGES, loadSettings, resolveLanguage, SETTINGS_CHANGE_EVENT } from '@/lib/settings';

type Dict = Record<string, string>;

const LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  en: () => import('@/i18n/en.json'),
  es: () => import('@/i18n/es.json'),
  fr: () => import('@/i18n/fr.json'),
  it: () => import('@/i18n/it.json'),
  pt: () => import('@/i18n/pt.json'),
  nl: () => import('@/i18n/nl.json'),
  pl: () => import('@/i18n/pl.json'),
  el: () => import('@/i18n/el.json'),
  tr: () => import('@/i18n/tr.json'),
  ru: () => import('@/i18n/ru.json'),
  ar: () => import('@/i18n/ar.json'),
  zh: () => import('@/i18n/zh.json'),
  ja: () => import('@/i18n/ja.json'),
  hi: () => import('@/i18n/hi.json'),
  id: () => import('@/i18n/id.json'),
};

const dicts: Record<string, Dict> = {};
let active = 'de';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Aktuelle Sprache (z. B. 'de', 'en'). */
export function currentLang() { return active; }

/** BCP-47-Locale für Datums- und Zahlenformate. */
export function locale() {
  return { de: 'de-DE', en: 'en-GB', pt: 'pt-BR', zh: 'zh-CN' }[active] ?? active;
}

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export { k } from '@/lib/i18nKey';

/** Name einer Sprache in der aktuellen Oberflächensprache (z. B. „Griechisch“ / „Greek“). */
export function languageName(code: string): string {
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

/** Übersetzt einen deutschen Text in die aktive Sprache. */
export function t(de: string, vars?: Record<string, string | number>): string {
  if (active === 'de') return interpolate(de, vars);
  const s = dicts[active]?.[de] ?? dicts.en?.[de] ?? de;
  return interpolate(s, vars);
}

/**
 * Wie t(), aber mit Bausteinen: '<0>…</0>' wird durch parts[0](inhalt) ersetzt.
 * Nicht verschachteln.
 */
export function rich(de: string, parts: ((inner: string) => React.ReactNode)[], vars?: Record<string, string | number>): React.ReactNode {
  const s = t(de, vars);
  const out: React.ReactNode[] = [];
  const re = /<(\d+)>(.*?)<\/\1>/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const fn = parts[Number(m[1])];
    out.push(<React.Fragment key={i++}>{fn ? fn(m[2]) : m[2]}</React.Fragment>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/**
 * In jeder Komponente aufrufen, die Text zeigt: sorgt dafür, dass sie beim Sprachwechsel neu
 * gerendert wird. Gibt t zurück, damit `const t = useT()` reicht.
 */
export function useT() {
  useSyncExternalStore(subscribe, () => active, () => 'de');
  return t;
}

/** Aktuelle Sprache als Hook (rendert beim Wechsel neu). */
export function useLang() {
  return useSyncExternalStore(subscribe, () => active, () => 'de');
}

async function apply(lang: string) {
  if (!(lang === 'de' || lang in LOADERS)) lang = 'en';
  try {
    if (lang !== 'de' && !dicts.en) dicts.en = (await LOADERS.en()).default;
    if (lang !== 'de' && !dicts[lang]) dicts[lang] = (await LOADERS[lang]()).default;
  } catch {
    lang = dicts.en ? 'en' : 'de';
  }
  const rtl = LANGUAGES.find(l => l.code === lang)?.rtl;
  document.documentElement.lang = lang;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  if (active !== lang) { active = lang; emit(); }
}

/** Einmal im Root-Layout: liest die Sprache aus den Einstellungen und lädt das Wörterbuch. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const sync = () => { void apply(resolveLanguage(loadSettings().language)); };
    sync();
    window.addEventListener(SETTINGS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, sync);
  }, []);
  return <>{children}</>;
}
