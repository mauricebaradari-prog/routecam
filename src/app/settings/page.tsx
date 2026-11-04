'use client';

import AccountGate from '@/components/AccountGate';

import React, { useEffect, useState } from 'react';
import PageShell, { Card } from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useSettings, LOCAL_DATA_KEYS, LANGUAGES, resolveLanguage } from '@/lib/settings';
import { VISIBILITY_OPTIONS } from '@/lib/routeVisibility';
import { VisibilityIcon } from '@/components/Visibility';
import { t, rich, useT, languageName } from '@/lib/i18n';

function SettingsPage() {
  useT();
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  // browser language is only known on the client – read after mount (avoids a hydration mismatch)
  const [browserLang, setBrowserLang] = useState('de');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once after the static page has loaded
  useEffect(() => setBrowserLang(resolveLanguage('auto')), []);

  // size of each local data set (entries), so it's clear what "delete" would remove
  const measure = () => {
    const out: Record<string, number> = {};
    for (const { key } of LOCAL_DATA_KEYS) {
      try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        out[key] = Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
      } catch { out[key] = 0; }
    }
    setCounts(out);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once after the static page has loaded
  useEffect(measure, []);

  function clearLocalData() {
    for (const { key } of LOCAL_DATA_KEYS) { try { localStorage.removeItem(key); } catch {} }
    setConfirmClear(false);
    setCleared(true);
    measure();
  }

  return (
    <PageShell title={t('Einstellungen')} subtitle={t('Konto und Voreinstellungen für RouteCam')}>
      <Card title={t('Konto')}>
        {user ? (
          <div className="flex items-center gap-4">
            {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{user.name}</div>
              <div className="text-sm text-white/50 truncate">{user.email}</div>
              <div className="text-xs text-white/40 mt-1">{t('Angemeldet mit Google')}</div>
            </div>
            <button onClick={signOut} className="h-9 px-4 rounded-full text-sm bg-white/10 hover:bg-white/20">{t('Abmelden')}</button>
          </div>
        ) : null}
        {user && (
          <p className="mt-4 pt-4 border-t border-white/10 text-xs text-white/50">
            {t('Konto löschen? Schreib uns – wir entfernen dein Konto mit allen Fahrten, Kommentaren, Likes und Gruppen innerhalb von 30 Tagen.')}{' '}
            <a
              href={`mailto:admin@routecam.app?subject=${encodeURIComponent('Konto löschen / Delete account')}&body=${encodeURIComponent(t('Bitte lösche mein RouteCam-Konto ({email}) mit allen Daten.', { email: user.email }))}`}
              className="text-white/80 underline underline-offset-2 hover:text-white"
            >
              {t('Löschung anfragen')}
            </a>
          </p>
        )}
        {!user && (
          <p className="text-sm text-white/60">{t('Nicht angemeldet – oben rechts über den Avatar mit Google anmelden.')}</p>
        )}
      </Card>

      <Card title={t('Sprache')}>
        <p className="text-xs text-white/50 mb-3">
          {t('Sprache der Oberfläche. „Automatisch“ übernimmt die Sprache deines Browsers.')}
          {settings.language === 'auto' && <> {rich('Gerade: <0>{lang}</0>', [s => <span className="text-white/80">{s}</span>], { lang: LANGUAGES.find(l => l.code === browserLang)?.native ?? browserLang })}</>}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {[{ code: 'auto', native: t('Automatisch'), german: '' }, ...LANGUAGES].map(l => (
            <button
              key={l.code}
              onClick={() => update({ language: l.code })}
              lang={l.code === 'auto' ? undefined : l.code}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                settings.language === l.code ? 'border-[#CCFF00]/60 bg-[#CCFF00]/10' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <span className="block text-sm text-white">{l.native}</span>
              <span className="block text-[11px] text-white/40">{l.code === 'auto' ? t('Browsersprache') : languageName(l.code)}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/40 mt-3">
          {t('Rechtstexte (Nutzungsbedingungen, Datenschutz, Impressum) gibt es auf Deutsch und Englisch.')}
        </p>
      </Card>

      <div id="benachrichtigungen" className="scroll-mt-20">
        <Card title={t('Benachrichtigungen')}>
          <p className="text-xs text-white/50 -mt-2 mb-3">{t('Worüber du bei deinen eigenen Fahrten informiert wirst (Glocke oben rechts).')}</p>
          <div className="flex flex-col gap-1">
            {([
              ['comment', t('Kommentare'), t('Jemand kommentiert eine Stelle deiner Fahrt')],
              ['like', t('Likes'), t('Jemandem gefällt deine Fahrt')],
              ['rating', t('Bewertungen'), t('Jemand bewertet deine Fahrt mit Sternen')],
            ] as const).map(([key, label, hint]) => (
              <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 cursor-pointer">
                <span className="flex-1">
                  <span className="block text-sm">{label}</span>
                  <span className="block text-xs text-white/40">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.notify[key]}
                  onChange={e => update({ notify: { ...settings.notify, [key]: e.target.checked } })}
                  className="w-4 h-4 accent-[#CCFF00] cursor-pointer"
                />
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t('Neue Fahrten')}>
        <p className="text-xs text-white/50 mb-3">{t('Diese Sichtbarkeit ist beim Anlegen einer Fahrt vorausgewählt.')}</p>
        <div className="flex flex-col gap-1">
          {VISIBILITY_OPTIONS.map(o => (
            <label key={o.value} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
              settings.defaultVisibility === o.value ? 'border-white/15 bg-white/[0.05]' : 'border-transparent hover:bg-white/5'
            }`}>
              <input type="radio" name="default-visibility" checked={settings.defaultVisibility === o.value} onChange={() => update({ defaultVisibility: o.value })} className="mt-1 accent-[#CCFF00]" />
              <VisibilityIcon v={o.value} size={18} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm">{t(o.label)}</span>
                <span className="block text-xs text-white/40">{t(o.hint)}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card title={t('Alte Daten in diesem Browser')}>
        <p className="text-xs text-white/50 mb-3">
          {t('Fahrten, Kommentare, Likes und Gruppen liegen jetzt in deinem Konto. Was RouteCam früher nur hier im Browser gespeichert hat, wird bei der ersten Anmeldung in dein Konto übernommen. Danach ist das hier nur noch eine alte Kopie, die du löschen kannst – dein Konto bleibt davon unberührt.')}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm mb-4">
          {LOCAL_DATA_KEYS.map(({ key, label }) => (
            <React.Fragment key={key}>
              <dt className="text-white/70">{t(label)}</dt>
              <dd className="font-mono text-white/50 text-right">{counts[key] ?? 0}</dd>
            </React.Fragment>
          ))}
        </dl>
        {confirmClear ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-300">{t('Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.')}</span>
            <button onClick={clearLocalData} className="h-9 px-4 rounded-full text-sm font-semibold bg-red-500 hover:bg-red-400">{t('Löschen')}</button>
            <button onClick={() => setConfirmClear(false)} className="h-9 px-4 rounded-full text-sm hover:bg-white/10">{t('Abbrechen')}</button>
          </div>
        ) : (
          <button onClick={() => { setCleared(false); setConfirmClear(true); }} className="h-9 px-4 rounded-full text-sm border border-red-500/40 text-red-300 hover:bg-red-500/10">
            {t('Alte Kopie löschen')}
          </button>
        )}
        {cleared && <p className="text-xs text-[#CCFF00] mt-3">{t('Gelöscht.')}</p>}
      </Card>
    </PageShell>
  );
}


export default function GatedSettingsPage() {
  return <AccountGate><SettingsPage /></AccountGate>;
}
