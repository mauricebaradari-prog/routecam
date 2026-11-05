// Texte des Tracker-Onepagers: nur Deutsch und Englisch (Werbetext – lieber sauber in zwei Sprachen
// als ungeprüft in sechzehn). Deutsch → Deutsch, jede andere eingestellte Sprache → Englisch.
import { currentLang } from '@/lib/i18n';

const EN: Record<string, string> = {
  "Animation abspielen": "Play animation",
  "App Download": "Download app",
  "Auf die Sekunde synchron.": "In sync to the second.",
  "Bereit": "Ready",
  "Dein GPS": "Your GPS",
  "Der RouteCam Tracker zeichnet deine Fahrt jede Sekunde auf – Position, Höhe und Tempo, jeweils mit der exakten GPS-Uhrzeit. Damit legt RouteCam Video und Strecke sekundengenau übereinander.": "RouteCam Tracker records your ride every second – position, elevation and speed, each with the exact GPS time. That’s how RouteCam lines up video and route to the second.",
  "GPX ist der Standard von Tracking-Apps, Navis und Sportuhren. Der Tracker speichert für jeden Punkt die GPS-Uhrzeit – damit passt die Position im Video auf die Sekunde.": "GPX is the standard used by tracking apps, sat navs and sports watches. The tracker stores the GPS time for every point – so the position matches the video to the second.",
  "Nur für Android": "Android only",
  "Scrollen": "Scroll",
  "Starte dein\nAbenteuer": "Start your\nadventure",
  "Tracker": "Tracker",
  "Zurück zu RouteCam": "Back to RouteCam",
  "Höhe": "Elevation",
  "Laufzeit": "Duration",
  "GPS-Zeit": "GPS time",
  "GPS-Status": "GPS status",
  "Tempo": "Speed",
  "Distanz": "Distance",
};

/** Onepager-Text in der Seitensprache (de/en). Komponenten rufen useT() auf, damit ein Sprachwechsel neu zeichnet. */
export function tx(de: string): string {
  return currentLang() === 'de' ? de : (EN[de] ?? de);
}
