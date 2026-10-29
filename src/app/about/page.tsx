'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import PageShell, { Card } from '@/components/PageShell';
import { openOnboarding } from '@/components/Onboarding';

// ─────────────────────────────────────────────────────────────────────────────
// Betreiberdaten – ALLE {{…}}-Felder vor dem Launch ausfüllen.
// Solange ein Feld leer ist, zeigt die Seite oben einen „Entwurf“-Hinweis.
// ─────────────────────────────────────────────────────────────────────────────
const OPERATOR = {
  company: '{{FIRMENNAME}} Ltd',
  regNo: '{{HE-Registernummer}}',
  address: ['{{Straße Nr.}}', '{{PLZ Ort}}', 'Zypern'],
  director: 'Maurice Baradari',
  email: '{{kontakt@…}}',
  vatId: '', // optional, leer lassen wenn nicht vorhanden
};
const LAST_UPDATED = '29. Oktober 2026';

const isDraft = JSON.stringify(OPERATOR).includes('{{');

const SECTIONS = [
  { id: 'routecam', label: 'Über RouteCam' },
  { id: 'support', label: 'Support' },
  { id: 'kontakt', label: 'Kontakt' },
  { id: 'agb', label: 'Nutzungsbedingungen' },
  { id: 'datenschutz', label: 'Datenschutz' },
  { id: 'impressum', label: 'Impressum' },
] as const;

const FAQ: { q: string; a: string }[] = [
  { q: 'Wie lege ich eine Fahrt an?', a: 'Oben rechts auf „Anlegen“: YouTube-Link einfügen, GPX- oder KML-Datei deiner Fahrt hochladen, Titel und Sichtbarkeit wählen. Länge und Titel des Videos werden automatisch übernommen.' },
  { q: 'Woher bekomme ich eine GPX-Datei?', a: 'Aus einer Tracking-App auf dem Handy (während der Fahrt aufzeichnen), aus einem Navi oder aus einer Kamera mit GPS. Mit Zeitstempeln passt die Position im Video später am genauesten.' },
  { q: 'Warum ist das Video nicht genau synchron?', a: 'Ohne Zeitstempel in den Geodaten wird die Position gleichmäßig über die Strecke geschätzt. Bei langsamen oder schnellen Passagen kann der Pin dem Video etwas vorauseilen oder hinterherlaufen. Im Sync-Editor kannst du Video und Strecke genau aufeinander ausrichten.' },
  { q: 'Was bedeutet „Perspektive wechseln“?', a: 'Wenn mehrere Fahrten dieselbe Straße zeigen, kannst du an derselben Stelle zur anderen Fahrt springen: gleicher Ort, anderes Video.' },
  { q: 'Wer sieht meine Fahrten?', a: 'Öffentlich: alle. Nicht gelistet: nur wer den Link hat. Privat: nur du. Tipp: Beginnt deine Aufzeichnung vor deiner Haustür, zeigt die Strecke deinen Wohnort. Starte die Aufzeichnung lieber ein Stück entfernt.' },
  { q: 'Wie melde ich einen Inhalt?', a: 'Eine Fahrt: im Community-Fenster auf der Karte über ⋯ → „Melden“. Einen Kommentar: mit der Maus über den Kommentar fahren und auf das Fähnchen klicken. Dann einen Grund auswählen. Wir prüfen jede Meldung.' },
  { q: 'Kostet RouteCam etwas?', a: 'Nein. RouteCam ist kostenlos und ohne Werbung.' },
  { q: 'Wie lösche ich mein Konto?', a: 'Schreib uns über die Kontaktadresse unten. Wir löschen dein Konto mit allen Fahrten, Likes und Kommentaren.' },
];

export default function AboutPage() {
  return (
    <PageShell current="about" title="About" subtitle="Über RouteCam, Hilfe und Rechtliches">
      {isDraft && (
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs text-amber-200">
          Entwurf: Die Betreiberangaben sind noch nicht vollständig ausgefüllt.
        </p>
      )}

      <nav aria-label="Abschnitte" className="flex flex-wrap gap-2 -mt-2">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30 transition-colors">
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── Über RouteCam ─────────────────────────────────────────────── */}
      <Section id="routecam">
        <Card title="Über RouteCam">
          <Prose>
            <p>RouteCam verbindet dein Fahrvideo mit der Strecke, auf der es entstanden ist. Während das Video läuft, fährt ein Pin über einen 3D-Globus, und das Höhenprofil zeigt, wo du gerade bist. Zuschauer sehen also nicht nur die Straße, sondern auch, wo auf der Welt sie liegt.</p>
            <p>So funktioniert es:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Fahrt mit dem Handy oder Navi als GPX aufzeichnen und filmen.</li>
              <li>Video auf YouTube hochladen.</li>
              <li>In RouteCam den YouTube-Link und die GPX-Datei zusammenführen.</li>
            </ol>
            <p>Fahren mehrere Leute dieselbe Straße, entstehen Perspektiven: derselbe Ort, gesehen von verschiedenen Fahrern, an verschiedenen Tagen.</p>
            <p>RouteCam ist kostenlos, läuft im Browser und entsteht auf Zypern, aus Touren mit dem Motorrad.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Support ───────────────────────────────────────────────────── */}
      <Section id="support">
        <Card title="Support · Häufige Fragen">
          <div className="flex flex-col divide-y divide-white/10">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-3 first:pt-0 last:pb-0">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-medium">
                  {q}
                  <span className="text-white/40 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
          <button onClick={openOnboarding} className="mt-4 text-xs text-[#CCFF00] hover:underline">Einführung noch einmal ansehen</button>
        </Card>
      </Section>

      {/* ── Kontakt ───────────────────────────────────────────────────── */}
      <Section id="kontakt">
        <Card title="Kontakt">
          <Prose>
            <p>Fragen, Feedback, Fehler oder eine Bitte um Löschung: schreib uns.</p>
            <CopyLine value={OPERATOR.email} />
            <p>Einzelne Fahrten oder Kommentare meldest du am schnellsten direkt im Community-Fenster über ⋯ → „Melden“.</p>
            <p className="text-white/50">Diese Adresse ist auch die zentrale Kontaktstelle für Behörden und Nutzer nach dem Digital Services Act (Art. 11 und 12 DSA). Wir antworten auf Deutsch und Englisch.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Nutzungsbedingungen ───────────────────────────────────────── */}
      <Section id="agb">
        <Card title="Nutzungsbedingungen">
          <Prose>
            <Meta>Stand: {LAST_UPDATED}</Meta>

            <H>1. Anbieter und Geltung</H>
            <p>RouteCam wird betrieben von {OPERATOR.company} (siehe <a href="#impressum">Impressum</a>). Diese Bedingungen gelten für die Nutzung von RouteCam. Mit der Anmeldung stimmst du ihnen zu.</p>

            <H>2. Leistung</H>
            <p>RouteCam ist kostenlos. Wir bemühen uns um einen störungsfreien Betrieb, können aber keine ständige Verfügbarkeit zusagen und dürfen Funktionen ändern, einschränken oder einstellen. Strecken, Höhen und Karten werden aus Fremddaten berechnet und können ungenau sein. Sie sind keine Navigationshilfe.</p>

            <H>3. Konto</H>
            <p>Für das Anlegen von Fahrten, Likes und Kommentare brauchst du ein Konto, das du mit deinem Google-Konto erstellst. Du musst mindestens 16 Jahre alt sein. Halte dein Google-Konto sicher; Aktivitäten unter deinem Konto werden dir zugerechnet.</p>

            <H>4. Deine Inhalte</H>
            <p>Inhalte, die du einstellst (Fahrten mit Geodaten, Titel, Videolinks, Kommentare, Bewertungen), bleiben deine. Du räumst {OPERATOR.company} daran ein einfaches, weltweites, unentgeltliches Recht ein, sie im Rahmen von RouteCam zu speichern, anzuzeigen, technisch aufzubereiten (zum Beispiel Strecken zu glätten oder mit anderen Fahrten als Perspektiven zu verknüpfen) und RouteCam damit vorzustellen. Dieses Recht darf auf einen Rechtsnachfolger übertragen werden, der RouteCam weiterbetreibt. Es endet, wenn du den Inhalt oder dein Konto löschst; Kopien in Sicherungen werden im üblichen Turnus überschrieben.</p>
            <p>Videos bleiben auf YouTube. RouteCam bettet sie nur ein. Verlinke nur Videos, die du selbst veröffentlicht hast oder einbetten darfst.</p>
            <p>Du versicherst, dass du die nötigen Rechte an deinen Inhalten hast und dass auf ihnen erkennbare Personen nicht in ihren Rechten verletzt werden.</p>

            <H>5. Was nicht erlaubt ist</H>
            <ul className="list-disc pl-5 space-y-1">
              <li>rechtswidrige, beleidigende, hetzerische oder sexuell explizite Inhalte;</li>
              <li>Inhalte, die zu gefährlichem oder illegalem Fahren aufrufen oder es verherrlichen;</li>
              <li>fremde Inhalte ohne Erlaubnis, Spam, Werbung ohne Bezug zu Fahrten;</li>
              <li>Geodaten, die den Wohnort oder Aufenthaltsort anderer Personen gegen deren Willen preisgeben;</li>
              <li>automatisiertes Auslesen, Überlasten oder Umgehen technischer Schutzmaßnahmen.</li>
            </ul>
            <p>Nutze RouteCam nie während der Fahrt.</p>

            <H>6. Meldungen und Moderation</H>
            <p>Jeder kann Inhalte über „Melden“ oder die <a href="#kontakt">Kontaktadresse</a> melden. Wir prüfen Meldungen zeitnah und können Inhalte ausblenden oder löschen und Konten sperren, wenn sie gegen Gesetze oder diese Bedingungen verstoßen. Wenn wir einen deiner Inhalte entfernen, sagen wir dir, warum, und du kannst über die Kontaktadresse widersprechen.</p>

            <H>7. Haftung</H>
            <p>Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für Schäden an Leben, Körper und Gesundheit. Im Übrigen haften wir nur für die Verletzung wesentlicher Pflichten und begrenzt auf den typischerweise vorhersehbaren Schaden. Für Inhalte anderer Nutzer und für die Richtigkeit von Strecken- und Kartendaten haften wir nicht.</p>

            <H>8. Ende der Nutzung</H>
            <p>Du kannst dein Konto jederzeit löschen lassen. Wir können die Nutzung bei Verstößen sperren oder RouteCam mit angemessener Ankündigung einstellen.</p>

            <H>9. Änderungen und Recht</H>
            <p>Ändern sich diese Bedingungen wesentlich, informieren wir dich vorher in der App. Es gilt das Recht der Republik Zypern. Zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt. Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Datenschutz ───────────────────────────────────────────────── */}
      <Section id="datenschutz">
        <Card title="Datenschutzerklärung">
          <Prose>
            <Meta>Stand: {LAST_UPDATED}</Meta>

            <H>Kurz gesagt</H>
            <p>Wir verarbeiten nur, was RouteCam zum Funktionieren braucht. Keine Werbung, kein Tracking, kein Verkauf von Daten.</p>

            <H>Verantwortlicher</H>
            <p>{OPERATOR.company}, {OPERATOR.address.join(', ')}. E-Mail: {OPERATOR.email}</p>

            <H>Was wir verarbeiten und warum</H>
            <p><strong>Beim Besuch der Seite.</strong> Der Webserver verarbeitet technisch nötige Verbindungsdaten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser), um die Seite auszuliefern und vor Missbrauch zu schützen. Rechtsgrundlage: berechtigtes Interesse am sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).</p>
            <p><strong>Bei der Anmeldung mit Google.</strong> Google übermittelt uns deinen Namen, deine E-Mail-Adresse, dein Profilbild und eine Google-Kennung. Damit legen wir dein Konto und deinen RouteCam-Kanal an. Auf deinem Kanal sind dein Name, dein Profilbild und deine öffentlichen Fahrten für alle sichtbar; dein Name erscheint außerdem bei deinen Kommentaren. Deine E-Mail-Adresse ist für andere nicht sichtbar. Rechtsgrundlage: Bereitstellung des Kontos (Art. 6 Abs. 1 lit. b DSGVO).</p>
            <p><strong>Deine Fahrten.</strong> Eine Fahrt enthält Geodaten mit Zeitstempeln, den Videolink, Titel und Sichtbarkeit. Geodaten können zeigen, wo du dich aufgehalten hast, etwa wo eine Fahrt beginnt. Du bestimmst, wer eine Fahrt sieht (öffentlich, nicht gelistet, privat). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
            <p><strong>Likes, Bewertungen, Kommentare, Meldungen.</strong> Wir speichern sie mit deinem Konto, um sie anzuzeigen, Benachrichtigungen zu erzeugen und Meldungen zu bearbeiten. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.</p>
            <p><strong>Speicher im Browser.</strong> RouteCam legt im Speicher deines Browsers (localStorage) Einstellungen wie Sprache und Ansicht ab. Das ist für die Funktion nötig und wird nicht zum Tracking genutzt. Du kannst diese Daten unter <Link href="/settings">Einstellungen</Link> löschen. Wir setzen keine Analyse- oder Werbe-Cookies.</p>

            <H>Dienste, die beim Nutzen geladen werden</H>
            <p>Damit Karten, Videos und Höhenprofile funktionieren, lädt dein Browser Inhalte direkt von diesen Anbietern. Dabei erhalten sie deine IP-Adresse und technische Browserdaten:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Google / YouTube</strong> (Google Ireland Ltd.): Anmeldung, eingebettete Videos, Vorschaubilder. Wenn du nicht angemeldet bist, lädt die Seite außerdem den Anmeldedienst von Google, der dir die Anmeldung mit einem Klick anbietet („One Tap“); dabei kann Google erkennen, ob du in deinem Browser bei Google angemeldet bist. Beim Abspielen eines Videos gelten zusätzlich die Datenschutzbestimmungen von YouTube.</li>
              <li><strong>Esri</strong> (USA): Satellitenkarten.</li>
              <li><strong>OSRM / Project OSRM</strong>: Berechnung von Straßenverläufen aus Wegpunkten.</li>
              <li><strong>Open-Meteo</strong> (Schweiz): Höhendaten zu Koordinaten der Strecke.</li>
            </ul>
            <p>Rechtsgrundlage ist unser berechtigtes Interesse, Karten und Videos darstellen zu können (Art. 6 Abs. 1 lit. f DSGVO). Übermittlungen in die USA stützen sich auf das EU-US Data Privacy Framework oder EU-Standardvertragsklauseln.</p>

            <H>Hosting und Datenbank</H>
            <p>Die Website liegt bei IONOS (Deutschland). Konten und Inhalte speichern wir bei Supabase auf Servern in Frankfurt am Main. Mit beiden bestehen Verträge zur Auftragsverarbeitung.</p>

            <H>Wie lange</H>
            <p>Kontodaten und Inhalte speichern wir, bis du sie oder dein Konto löschst. Server-Protokolle werden nach spätestens 30 Tagen gelöscht. Inhalte, die wir wegen eines Verstoßes entfernt haben, können wir zur Nachweisführung bis zu 6 Monate aufbewahren.</p>

            <H>Deine Rechte</H>
            <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen. Schreib dafür an {OPERATOR.email}. Du kannst dich außerdem bei einer Datenschutzaufsichtsbehörde beschweren, etwa beim zyprischen Commissioner for Personal Data Protection (dataprotection.gov.cy) oder bei der Behörde deines Wohnsitzlandes.</p>

            <H>Änderungen</H>
            <p>Wenn sich RouteCam ändert, passen wir diese Erklärung an. Es gilt die hier veröffentlichte Fassung.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Impressum ─────────────────────────────────────────────────── */}
      <Section id="impressum">
        <Card title="Impressum">
          <Prose>
            <p>
              {OPERATOR.company}<br />
              {OPERATOR.address.map(l => <React.Fragment key={l}>{l}<br /></React.Fragment>)}
            </p>
            <p>
              Registriert beim Registrar of Companies, Zypern<br />
              Registernummer: {OPERATOR.regNo}<br />
              {OPERATOR.vatId && <>USt-IdNr.: {OPERATOR.vatId}<br /></>}
              Vertreten durch den Director: {OPERATOR.director}
            </p>
            <p>E-Mail: {OPERATOR.email}</p>
            <p>Inhaltlich verantwortlich: {OPERATOR.director}, Anschrift wie oben.</p>
            <p className="text-white/50">Für Inhalte, die Nutzer einstellen, sind die jeweiligen Nutzer verantwortlich. Rechtsverletzungen bitte über „Melden“ oder die Kontaktadresse mitteilen.</p>
          </Prose>
        </Card>
      </Section>
    </PageShell>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <div id={id} className="scroll-mt-20">{children}</div>;
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 text-sm leading-relaxed text-white/70 [&_a]:text-[#CCFF00] [&_a:hover]:underline [&_strong]:text-white/90 [&_strong]:font-medium max-w-[68ch]">{children}</div>;
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white mt-3 first:mt-0">{children}</h3>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-white/40">{children}</p>;
}

// e-mail as selectable text with a copy button (mailto links are unreliable)
function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="flex items-center gap-2">
      <span className="select-all rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-white font-mono text-[13px]">{value}</span>
      <button onClick={copy} className="text-xs text-white/50 hover:text-white px-2 py-1">{copied ? 'Kopiert' : 'Kopieren'}</button>
    </div>
  );
}
