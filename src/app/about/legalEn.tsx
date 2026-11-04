'use client';

// English version of the legal texts. A translation of the German version (legal.tsx, LegalDe),
// which prevails in case of doubt. Keep both in step when either changes.

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/PageShell';
import { OPERATOR, LAST_UPDATED_EN, Section, Prose, H, Meta } from './legal';

export function LegalEn() {
  return (
    <>
      {/* ── Terms of use ──────────────────────────────────────────────── */}
      <Section id="agb">
        <Card title="Terms of Use">
          <Prose>
            <Meta>Last updated: {LAST_UPDATED_EN} · This is a translation; in case of doubt, the German version applies.</Meta>

            <H>1. Provider and scope</H>
            <p>RouteCam is operated by {OPERATOR.company} (see <a href="#impressum">Legal notice</a>). These terms apply to the use of RouteCam. By signing in, you agree to them.</p>

            <H>2. Service</H>
            <p>RouteCam is free of charge. We aim for uninterrupted operation but cannot guarantee constant availability, and we may change, restrict or discontinue features. Routes, elevations and maps are calculated from third-party data and may be inaccurate. They are not a navigation aid.</p>

            <H>3. Account</H>
            <p>To create rides, like and comment you need an account, which you create with your Google account. You must be at least 16 years old. Keep your Google account secure; activity under your account is attributed to you.</p>

            <H>4. Your content</H>
            <p>Content you post (rides with geodata, titles, video links, comments, ratings) remains yours. You grant {OPERATOR.company} a simple, worldwide, royalty-free right to store, display and technically process it within RouteCam (for example to smooth routes or link them with other rides as perspectives) and to use it to present RouteCam. This right may be transferred to a legal successor who continues to operate RouteCam. It ends when you delete the content or your account; copies in backups are overwritten in the usual cycle.</p>
            <p>Videos stay on YouTube. RouteCam only embeds them. Only link videos that you published yourself or are allowed to embed.</p>
            <p>You confirm that you hold the necessary rights to your content and that it does not infringe the rights of people who can be identified in it.</p>

            <H>5. What is not allowed</H>
            <ul className="list-disc pl-5 space-y-1">
              <li>unlawful, offensive, hateful or sexually explicit content;</li>
              <li>content that encourages or glorifies dangerous or illegal riding;</li>
              <li>other people&apos;s content without permission, spam, advertising unrelated to rides;</li>
              <li>geodata that reveals where other people live or are staying against their will;</li>
              <li>automated scraping, overloading or circumventing technical safeguards.</li>
            </ul>
            <p>Never use RouteCam while riding.</p>

            <H>6. Reports and moderation</H>
            <p>Anyone can report content via “Report” or the <a href="#kontakt">contact address</a>. We review reports promptly and may hide or delete content and suspend accounts if they violate the law or these terms. If we remove any of your content, we tell you why, and you can object via the contact address.</p>

            <H>7. Liability</H>
            <p>We are liable without limitation for intent and gross negligence and for injury to life, body and health. Otherwise we are only liable for breach of essential obligations, limited to the typically foreseeable damage. We are not liable for content posted by other users or for the accuracy of route and map data.</p>

            <H>8. End of use</H>
            <p>You can have your account deleted at any time. We may block use in the event of violations or discontinue RouteCam with reasonable notice.</p>

            <H>9. Changes and governing law</H>
            <p>If these terms change materially, we will inform you in the app beforehand. The law of the Republic of Cyprus applies. Mandatory consumer protection rules of your country of residence remain unaffected. We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Privacy ───────────────────────────────────────────────────── */}
      <Section id="datenschutz">
        <Card title="Privacy Policy">
          <Prose>
            <Meta>Last updated: {LAST_UPDATED_EN} · This is a translation; in case of doubt, the German version applies.</Meta>

            <H>In short</H>
            <p>We only process what RouteCam needs to work. No advertising, no tracking, no selling of data.</p>

            <H>Controller</H>
            <p>{OPERATOR.company}, {OPERATOR.address.join(', ').replace('Zypern', 'Cyprus')}. Email: {OPERATOR.email}</p>

            <H>What we process and why</H>
            <p><strong>When you visit the site.</strong> The web server processes technically necessary connection data (IP address, time, page requested, browser) to deliver the site and protect it against abuse. Legal basis: legitimate interest in secure operation (Art. 6(1)(f) GDPR).</p>
            <p><strong>When you sign in with Google.</strong> Google sends us your name, email address, profile picture and a Google identifier. We use them to create your account and your RouteCam channel. Your name, profile picture and public rides are visible to everyone on your channel; your name also appears next to your comments. Your email address is not visible to others. Legal basis: providing the account (Art. 6(1)(b) GDPR).</p>
            <p><strong>Your rides.</strong> A ride contains geodata with timestamps, the video link, title and visibility. Geodata can show where you have been, for example where a ride starts. You decide who can see a ride (public, unlisted, private). Legal basis: Art. 6(1)(b) GDPR.</p>
            <p><strong>Likes, ratings, comments, reports.</strong> We store them with your account to display them, generate notifications and handle reports. Legal basis: Art. 6(1)(b) and (f) GDPR.</p>
            <p><strong>Browser storage.</strong> RouteCam stores settings such as language and view in your browser&apos;s storage (localStorage). This is necessary for the service to work and is not used for tracking. You can delete this data under <Link href="/settings">Settings</Link>. We do not use analytics or advertising cookies.</p>

            <H>Services loaded while you use RouteCam</H>
            <p>So that maps, videos and elevation profiles work, your browser loads content directly from these providers. They receive your IP address and technical browser data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Google / YouTube</strong> (Google Ireland Ltd.): sign-in, embedded videos, thumbnails. If you are not signed in, the site also loads Google&apos;s sign-in service, which offers one-click sign-in (“One Tap”); Google may be able to tell whether you are signed in to Google in your browser. When you play a video, YouTube&apos;s privacy policy also applies.</li>
              <li><strong>Esri</strong> (USA): satellite maps.</li>
              <li><strong>OSRM / Project OSRM</strong>: calculating road paths from waypoints.</li>
              <li><strong>Open-Meteo</strong> (Switzerland): elevation data for the coordinates of a route.</li>
            </ul>
            <p>The legal basis is our legitimate interest in being able to display maps and videos (Art. 6(1)(f) GDPR). Transfers to the USA are based on the EU-US Data Privacy Framework or EU Standard Contractual Clauses.</p>

            <H>Hosting and database</H>
            <p>The website is delivered via Cloudflare (Cloudflare, Inc., USA). We store accounts and content with Supabase on servers in Frankfurt am Main, Germany. Data processing agreements are in place with both.</p>

            <H>How long</H>
            <p>We keep account data and content until you delete them or your account. Server logs are deleted after 30 days at the latest. Content we removed because of a violation may be kept for up to 6 months as evidence.</p>

            <H>Your rights</H>
            <p>You have the right of access, rectification, erasure, restriction of processing, data portability and to object to processing based on legitimate interests. To exercise them, write to {OPERATOR.email}. You can also lodge a complaint with a data protection authority, for example the Cyprus Commissioner for Personal Data Protection (dataprotection.gov.cy) or the authority of your country of residence.</p>

            <H>Changes</H>
            <p>When RouteCam changes, we update this policy. The version published here applies.</p>
          </Prose>
        </Card>
      </Section>

      {/* ── Legal notice ──────────────────────────────────────────────── */}
      <Section id="impressum">
        <Card title="Legal Notice">
          <Prose>
            <p>
              {OPERATOR.company}<br />
              {OPERATOR.address.map(l => <React.Fragment key={l}>{l === 'Zypern' ? 'Cyprus' : l}<br /></React.Fragment>)}
            </p>
            <p>
              Registered with the Registrar of Companies, Cyprus<br />
              Registration number: {OPERATOR.regNo}<br />
              {OPERATOR.vatId && <>VAT ID: {OPERATOR.vatId}<br /></>}
              Represented by the director: {OPERATOR.director}
            </p>
            <p>Email: {OPERATOR.email}</p>
            <p>Responsible for content: {OPERATOR.director}, address as above.</p>
            <p className="text-white/50">Users are responsible for the content they post. Please report infringements via “Report” or the contact address.</p>
          </Prose>
        </Card>
      </Section>
    </>
  );
}
