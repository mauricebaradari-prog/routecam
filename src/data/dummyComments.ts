// ⚠️ DUMMY-KOMMENTARE – nur zum Testen der Kommentar-Funktion.
// Später löschen: diese Datei entfernen und den Import in src/lib/routeComments.ts streichen.
// Personen sind erfunden. `at` = Anteil der Videolänge (0–1), wird in Sekunden umgerechnet.

import { ROUTES } from '@/hooks/useEditorState';
import type { RouteComment } from '@/lib/routeComments';

const PEOPLE = {
  nikos: { name: 'Nikos K.', color: '#3B82F6' },
  lena: { name: 'Lena R.', color: '#EC4899' },
  tom: { name: 'Tom B.', color: '#F59E0B' },
  sofia: { name: 'Sofia M.', color: '#10B981' },
  jan: { name: 'Jan W.', color: '#8B5CF6' },
  andreas: { name: 'Andreas P.', color: '#EF4444' },
  mia: { name: 'Mia S.', color: '#06B6D4' },
};

type P = keyof typeof PEOPLE;

const RAW: Record<string, [number, P, string][]> = {
  'route-1': [
    [0.04, 'nikos', 'Agios Georgios am Morgen – der Hafen ist um diese Zeit noch komplett leer 👌'],
    [0.22, 'lena', 'Hier geht’s richtig hoch, die Serpentinen sind ein Traum!'],
    [0.41, 'tom', 'Achtung, in der Kurve liegt oft Splitt.'],
    [0.63, 'sofia', 'Pano Arodes – unbedingt beim Kafeneio anhalten, bester Frappé.'],
    [0.86, 'jan', 'Blick runter auf die Chrysochou-Bucht 😍'],
  ],
  'route-2': [
    [0.1, 'andreas', 'Polis → Pomos ist meine Lieblingsküstenstrecke auf der Insel.'],
    [0.38, 'mia', 'Das Licht hier um diese Uhrzeit!'],
    [0.7, 'nikos', 'Ab hier wird die Straße schmaler, auf Gegenverkehr achten.'],
  ],
  'route-3': [
    [0.08, 'tom', 'Kouklia – Aphrodite-Heiligtum direkt links.'],
    [0.33, 'lena', 'Was für ein Asphalt hier oben, frisch gemacht?'],
    [0.55, 'sofia', 'Kidasi: kurzer Stopp an der alten Bahnbrücke lohnt sich.'],
    [0.9, 'jan', 'Schöne Abfahrt nach Agios Nikolaos 👍'],
  ],
  'route-4': [
    [0.15, 'andreas', 'Salamiou ist so ein ruhiges Dorf.'],
    [0.5, 'mia', 'Die Weinberge hier sind im Herbst der Hammer.'],
    [0.8, 'nikos', 'Kurz vor Mandria – Ziegen auf der Straße, war bei mir auch so 😂'],
  ],
  'route-5': [
    [0.2, 'jan', 'Welche Kamera-Halterung nutzt du? Kaum Vibrationen.'],
    [0.47, 'tom', 'Der Anstieg hinter Kouklia zieht sich ordentlich.'],
    [0.75, 'lena', 'Bin die Strecke letzte Woche auch gefahren, sehr zu empfehlen!'],
  ],
  'route-6': [
    [0.12, 'sofia', 'Kathikas – hier gibt’s die besten Weingüter.'],
    [0.44, 'andreas', 'Ab hier Funkloch, Offline-Karte laden!'],
    [0.72, 'mia', 'Blick auf den Troodos im Hintergrund 🏔️'],
  ],
  'route-7': [
    [0.18, 'nikos', 'Pegeia hoch ist steiler als es aussieht.'],
    [0.52, 'jan', 'Diese Kurvenkombination ist perfekt, sauber gefahren.'],
    [0.85, 'tom', 'Kathikas erreicht – Zeit für Halloumi 🧀'],
  ],
  'route-8': [
    [0.06, 'lena', 'Raus aus Paphos, endlich freie Straße.'],
    [0.37, 'sofia', 'Coral Bay rechts unten.'],
    [0.6, 'mia', 'Sea Caves – unbedingt mal anhalten und runtergehen!'],
    [0.92, 'andreas', 'Agios Georgios, Fischtaverne am Hafen empfehle ich.'],
  ],
  'route-9': [
    [0.25, 'tom', 'Küstenstraße B6 – Meerblick die ganze Zeit.'],
    [0.58, 'nikos', 'Aphrodite’s Rock auf der rechten Seite!'],
    [0.88, 'jan', 'Pissouri Bay – guter Spot für den Sonnenuntergang.'],
  ],
  'route-10': [
    [0.3, 'mia', 'Kelokedara, sehr ursprünglich hier.'],
    [0.66, 'lena', 'Schotterstück – mit Straßenreifen ok?'],
  ],
};

export const DUMMY_COMMENTS: RouteComment[] = Object.entries(RAW).flatMap(([routeId, list]) => {
  const duration = ROUTES.find(r => r.id === routeId)?.durationSeconds ?? 0;
  return list.map(([at, who, text], i) => ({
    id: `dummy-${routeId}-${i}`,
    routeId,
    seconds: Math.round(at * duration),
    author: PEOPLE[who].name,
    color: PEOPLE[who].color,
    text,
    createdAt: '2026-09-28T10:00:00Z',
    dummy: true,
  }));
});
