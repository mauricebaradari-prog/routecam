'use client';

import React, { useState } from 'react';
import PageShell, { Card } from '@/components/PageShell';
import { openOnboarding } from '@/components/Onboarding';
import GeoFilesHelp from '@/components/GeoFilesHelp';
import { t, useLang, k } from '@/lib/i18n';
import { isDraft, LegalDe, Section, Prose } from './legal';
import { LegalEn } from './legalEn';

const SECTIONS = [
  { id: 'routecam', label: k('Über RouteCam') },
  { id: 'support', label: k('Support') },
  { id: 'kontakt', label: k('Kontakt') },
  { id: 'agb', label: k('Nutzungsbedingungen') },
  { id: 'datenschutz', label: k('Datenschutz') },
  { id: 'impressum', label: k('Impressum') },
] as const;

// more: opens an explanation window below the answer
const FAQ: { q: string; a: string; more?: 'geo' }[] = [
  { q: k('Wie lege ich eine Fahrt an?'), a: k('Oben rechts auf „Anlegen“: YouTube-Link einfügen, GPX- oder KML-Datei deiner Fahrt hochladen, Titel und Sichtbarkeit wählen. Länge und Titel des Videos werden automatisch übernommen.') },
  { q: k('Woher bekomme ich eine GPX-Datei?'), a: k('Aus einer Tracking-App auf dem Handy (während der Fahrt aufzeichnen), aus einem Navi oder aus einer Kamera mit GPS. Mit Zeitstempeln passt die Position im Video später am genauesten.'), more: 'geo' },
  { q: k('Warum ist das Video nicht genau synchron?'), a: k('Ohne Zeitstempel in den Geodaten wird die Position gleichmäßig über die Strecke geschätzt. Bei langsamen oder schnellen Passagen kann der Pin dem Video etwas vorauseilen oder hinterherlaufen. Im Sync-Editor kannst du Video und Strecke genau aufeinander ausrichten.') },
  { q: k('Was bedeutet „Perspektive wechseln“?'), a: k('Wenn mehrere Fahrten dieselbe Straße zeigen, kannst du an derselben Stelle zur anderen Fahrt springen: gleicher Ort, anderes Video.') },
  { q: k('Wer sieht meine Fahrten?'), a: k('Öffentlich: alle. Nicht gelistet: nur wer den Link hat. Privat: nur du. Tipp: Beginnt deine Aufzeichnung vor deiner Haustür, zeigt die Strecke deinen Wohnort. Starte die Aufzeichnung lieber ein Stück entfernt.') },
  { q: k('Wie melde ich einen Inhalt?'), a: k('Eine Fahrt: im Community-Fenster auf der Karte über ⋯ → „Melden“. Einen Kommentar: mit der Maus über den Kommentar fahren und auf das Fähnchen klicken. Dann einen Grund auswählen. Wir prüfen jede Meldung.') },
  { q: k('Kostet RouteCam etwas?'), a: k('Nein. RouteCam ist kostenlos und ohne Werbung.') },
  { q: k('Wie lösche ich mein Konto?'), a: k('In den Einstellungen unter „Konto“ auf „Löschung anfragen“ klicken oder an admin@routecam.app schreiben. Wir löschen dein Konto mit allen Fahrten, Kommentaren, Likes und Gruppen innerhalb von 30 Tagen.') },
];

export default function AboutPage() {
  const lang = useLang();
  const [geoHelp, setGeoHelp] = useState(false);
  return (
    <PageShell current="about" title="About" subtitle={t('Über RouteCam, Hilfe und Rechtliches')}>
      {isDraft && (
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs text-amber-200">
          Entwurf: Die Betreiberangaben sind noch nicht vollständig ausgefüllt.
        </p>
      )}

      <nav aria-label={t('Abschnitte')} className="flex flex-wrap gap-2 -mt-2">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30 transition-colors">
            {t(s.label)}
          </a>
        ))}
      </nav>

      {/* ── Über RouteCam ─────────────────────────────────────────────── */}
      <Section id="routecam">
        <Card title={t('Über RouteCam')}>
          <Prose>
            <p>{t('RouteCam verbindet dein Fahrvideo mit der Strecke, auf der es entstanden ist. Während das Video läuft, fährt ein Pin über einen 3D-Globus, und das Höhenprofil zeigt, wo du gerade bist. Zuschauer sehen also nicht nur die Straße, sondern auch, wo auf der Welt sie liegt.')}</p>
            <p>{t('So funktioniert es:')}</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t('Fahrt mit dem Handy oder Navi als GPX aufzeichnen und filmen.')}</li>
              <li>{t('Video auf YouTube hochladen.')}</li>
              <li>{t('In RouteCam den YouTube-Link und die GPX-Datei zusammenführen.')}</li>
            </ol>
            <p>{t('Fahren mehrere Leute dieselbe Straße, entstehen Perspektiven: derselbe Ort, gesehen von verschiedenen Fahrern, an verschiedenen Tagen.')}</p>
            <p>{t('RouteCam ist kostenlos, läuft im Browser und entsteht auf Zypern, aus Touren mit dem Motorrad.')}</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Support ───────────────────────────────────────────────────── */}
      <Section id="support">
        <Card title={t('Support · Häufige Fragen')}>
          <div className="flex flex-col divide-y divide-white/10">
            {FAQ.map(({ q, a, more }) => (
              <details key={q} className="group py-3 first:pt-0 last:pb-0">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-medium">
                  {t(q)}
                  <span className="text-white/40 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">{t(a)}</p>
                {more === 'geo' && (
                  <button type="button" onClick={() => setGeoHelp(true)} className="mt-2 text-xs text-[#CCFF00] hover:underline underline-offset-2">
                    {t('Was sind GPX- und KML-Dateien?')} →
                  </button>
                )}
              </details>
            ))}
          </div>
          <button onClick={openOnboarding} className="mt-4 text-xs text-[#CCFF00] hover:underline">{t('Einführung noch einmal ansehen')}</button>
        </Card>
      </Section>

      {/* ── Kontakt ───────────────────────────────────────────────────── */}
      <Section id="kontakt">
        <Card title={t('Kontakt')}>
          <Prose>
            <p>{t('Fragen, Feedback, Fehler oder eine Bitte um Löschung: schreib uns.')}</p>
            {/* the address as a picture made of outlines – nothing to copy or scrape; it stays as text in the imprint */}
            <span className="self-start inline-flex rounded-md bg-white/5 border border-white/10 px-3 py-2">
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/contact-email.svg`}
                width={140} height={15}
                alt={t('E-Mail-Adresse (steht auch im Impressum)')}
                draggable={false}
                className="block h-[15px] w-auto select-none pointer-events-none"
              />
            </span>
            <p>{t('Einzelne Fahrten oder Kommentare meldest du am schnellsten direkt im Community-Fenster über ⋯ → „Melden“.')}</p>
            <p className="text-white/50">{t('Diese Adresse ist auch die zentrale Kontaktstelle für Behörden und Nutzer nach dem Digital Services Act (Art. 11 und 12 DSA). Wir antworten auf Deutsch und Englisch.')}</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Rechtstexte: Deutsch (maßgeblich) oder Englisch ──────────── */}
      {lang === 'de' ? <LegalDe /> : (
        <>
          {lang !== 'en' && (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/60">
              {t('Die Rechtstexte (Nutzungsbedingungen, Datenschutz, Impressum) gibt es auf Deutsch und Englisch. Hier steht die englische Fassung; maßgeblich ist die deutsche.')}
            </p>
          )}
          <LegalEn />
        </>
      )}
      {geoHelp && <GeoFilesHelp onClose={() => setGeoHelp(false)} />}
    </PageShell>
  );
}
