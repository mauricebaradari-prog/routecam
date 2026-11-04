import type { Metadata } from 'next';
import TrackerStory from '@/components/tracker/TrackerStory';

const TITLE = 'RouteCam Tracker – GPS-Logger für Android';
const DESCRIPTION =
  'Zeichnet deine Fahrt sekundengenau auf: Strecke, Höhe, Tempo, Distanz und GPS-Zeit – als GPX für RouteCam. Kostenlos, ohne Konto.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://routecam.app/tracker' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: 'https://routecam.app/tracker', siteName: 'RouteCam', type: 'website' },
};

export default function TrackerPage() {
  return <TrackerStory />;
}
