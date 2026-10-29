'use client';

import AccountGate from '@/components/AccountGate';

import React, { useEffect, useState } from 'react';
import PageShell, { Card } from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useSettings, LOCAL_DATA_KEYS, LANGUAGES, resolveLanguage } from '@/lib/settings';
import { VISIBILITY_OPTIONS } from '@/lib/routeVisibility';
import { VisibilityIcon } from '@/components/Visibility';

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  // browser language is only known on the client – read after mount (avoids a hydration mismatch)
  const [browserLang, setBrowserLang] = useState('de');
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
  useEffect(measure, []);

  function clearLocalData() {
    for (const { key } of LOCAL_DATA_KEYS) { try { localStorage.removeItem(key); } catch {} }
    setConfirmClear(false);
    setCleared(true);
    measure();
  }

  return (
    <PageShell title="Einstellungen" subtitle="Konto und Voreinstellungen für RouteCam">
      <Card title="Konto">
        {user ? (
          <div className="flex items-center gap-4">
            {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{user.name}</div>
              <div className="text-sm text-white/50 truncate">{user.email}</div>
              <div className="text-xs text-white/40 mt-1">Angemeldet mit Google</div>
            </div>
            <button onClick={signOut} className="h-9 px-4 rounded-full text-sm bg-white/10 hover:bg-white/20">Abmelden</button>
          </div>
        ) : (
          <p className="text-sm text-white/60">Nicht angemeldet – oben rechts über den Avatar mit Google anmelden.</p>
        )}
      </Card>

      <Card title="Sprache">
        <p className="text-xs text-white/50 mb-3">
          Sprache der Oberfläche. „Automatisch“ übernimmt die Sprache deines Browsers
          {settings.language === 'auto' && <> (gerade: <span className="text-white/80">{LANGUAGES.find(l => l.code === browserLang)?.native}</span>)</>}.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {[{ code: 'auto', native: 'Automatisch', german: 'Browsersprache' }, ...LANGUAGES].map(l => (
            <button
              key={l.code}
              onClick={() => update({ language: l.code })}
              lang={l.code === 'auto' ? undefined : l.code}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                settings.language === l.code ? 'border-[#CCFF00]/60 bg-[#CCFF00]/10' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <span className="block text-sm text-white">{l.native}</span>
              <span className="block text-[11px] text-white/40" lang="de">{l.german}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-amber-300/80 mt-3">
          Hinweis: Die Auswahl wird gespeichert, die Oberfläche ist aber vorerst nur auf Deutsch – die Übersetzungen folgen.
        </p>
      </Card>

      <div id="benachrichtigungen" className="scroll-mt-20">
        <Card title="Benachrichtigungen">
          <p className="text-xs text-white/50 -mt-2 mb-3">Worüber du bei deinen eigenen Fahrten informiert wirst (Glocke oben rechts).</p>
          <div className="flex flex-col gap-1">
            {([
              ['comment', 'Kommentare', 'Jemand kommentiert eine Stelle deiner Fahrt'],
              ['like', 'Likes', 'Jemandem gefällt deine Fahrt'],
              ['rating', 'Bewertungen', 'Jemand bewertet deine Fahrt mit Sternen'],
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

      <Card title="Neue Fahrten">
        <p className="text-xs text-white/50 mb-3">Diese Sichtbarkeit ist beim Anlegen einer Fahrt vorausgewählt.</p>
        <div className="flex flex-col gap-1">
          {VISIBILITY_OPTIONS.map(o => (
            <label key={o.value} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
              settings.defaultVisibility === o.value ? 'border-white/15 bg-white/[0.05]' : 'border-transparent hover:bg-white/5'
            }`}>
              <input type="radio" name="default-visibility" checked={settings.defaultVisibility === o.value} onChange={() => update({ defaultVisibility: o.value })} className="mt-1 accent-[#CCFF00]" />
              <VisibilityIcon v={o.value} size={18} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm">{o.label}</span>
                <span className="block text-xs text-white/40">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Daten in diesem Browser">
        <p className="text-xs text-white/50 mb-3">
          Bis Konten und Datenbank fertig sind, speichert RouteCam diese Daten nur hier im Browser. Sie hängen noch nicht an deinem Google-Konto.
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm mb-4">
          {LOCAL_DATA_KEYS.map(({ key, label }) => (
            <React.Fragment key={key}>
              <dt className="text-white/70">{label}</dt>
              <dd className="font-mono text-white/50 text-right">{counts[key] ?? 0}</dd>
            </React.Fragment>
          ))}
        </dl>
        {confirmClear ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-300">Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.</span>
            <button onClick={clearLocalData} className="h-9 px-4 rounded-full text-sm font-semibold bg-red-500 hover:bg-red-400">Löschen</button>
            <button onClick={() => setConfirmClear(false)} className="h-9 px-4 rounded-full text-sm hover:bg-white/10">Abbrechen</button>
          </div>
        ) : (
          <button onClick={() => { setCleared(false); setConfirmClear(true); }} className="h-9 px-4 rounded-full text-sm border border-red-500/40 text-red-300 hover:bg-red-500/10">
            Lokale Daten löschen
          </button>
        )}
        {cleared && <p className="text-xs text-[#CCFF00] mt-3">Gelöscht.</p>}
      </Card>
    </PageShell>
  );
}


export default function GatedSettingsPage() {
  return <AccountGate><SettingsPage /></AccountGate>;
}
