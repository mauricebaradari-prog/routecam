import { useCallback, useEffect, useState } from 'react';
import type { Visibility } from '@/lib/routeVisibility';

// Per-user preferences. INTERIM STORAGE: localStorage (later: Supabase profile).
// Languages offered for the interface. Chosen for reach (internet users worldwide, Europe as the
// core riding market) plus the languages around Cyprus (Greek, Turkish, Russian community).
// Arabic is right-to-left – the layout needs dir="rtl" support before it can be switched on.
export const LANGUAGES: { code: string; native: string; german: string; rtl?: boolean }[] = [
  { code: 'de', native: 'Deutsch', german: 'Deutsch' },
  { code: 'en', native: 'English', german: 'Englisch' },
  { code: 'es', native: 'Español', german: 'Spanisch' },
  { code: 'fr', native: 'Français', german: 'Französisch' },
  { code: 'it', native: 'Italiano', german: 'Italienisch' },
  { code: 'pt', native: 'Português', german: 'Portugiesisch' },
  { code: 'nl', native: 'Nederlands', german: 'Niederländisch' },
  { code: 'pl', native: 'Polski', german: 'Polnisch' },
  { code: 'el', native: 'Ελληνικά', german: 'Griechisch' },
  { code: 'tr', native: 'Türkçe', german: 'Türkisch' },
  { code: 'ru', native: 'Русский', german: 'Russisch' },
  { code: 'ar', native: 'العربية', german: 'Arabisch', rtl: true },
  { code: 'zh', native: '中文', german: 'Chinesisch' },
  { code: 'ja', native: '日本語', german: 'Japanisch' },
  { code: 'hi', native: 'हिन्दी', german: 'Hindi' },
  { code: 'id', native: 'Bahasa Indonesia', german: 'Indonesisch' },
];

export interface Settings {
  defaultVisibility: Visibility; // preselected when creating a ride
  language: string;              // 'auto' = browser language, else a LANGUAGES code
  notify: { comment: boolean; like: boolean; rating: boolean }; // which notifications to show
}

const DEFAULTS: Settings = { defaultVisibility: 'public', language: 'auto', notify: { comment: true, like: true, rating: true } };

// 'auto' → first browser language we offer, otherwise German
export function resolveLanguage(setting: string): string {
  if (setting !== 'auto') return setting;
  if (typeof navigator === 'undefined') return 'de';
  for (const l of navigator.languages || [navigator.language]) {
    const code = l.toLowerCase().split('-')[0];
    if (LANGUAGES.some(x => x.code === code)) return code;
  }
  return 'de';
}
const STORAGE_KEY = 'routecam.settings';
const CHANGE_EVENT = 'routecam:settings';

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...stored, notify: { ...DEFAULTS.notify, ...(stored.notify || {}) } };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSettings(), ...patch })); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { settings, update };
}

// Everything RouteCam keeps in this browser (until accounts + database exist)
export const LOCAL_DATA_KEYS: { key: string; label: string }[] = [
  { key: 'routecam.userRoutes', label: 'Angelegte Fahrten' },
  { key: 'routecam.visibility', label: 'Sichtbarkeit der Routen' },
  { key: 'routecam.deletedRoutes', label: 'Ausgeblendete Routen' },
  { key: 'routecam.interactions', label: 'Likes, Bewertungen, Meldungen' },
  { key: 'routecam.comments', label: 'Eigene Kommentare' },
  { key: 'routecam.commentReports', label: 'Gemeldete Kommentare' },
  { key: 'routecam.groups', label: 'Gruppen' },
  { key: 'routecam.notifications', label: 'Benachrichtigungen' },
];
