// Höhenprofil aus den Höhenwerten der GPX-Datei.
// Gespeichert sind sie gleichmäßig über die Aufzeichnung verteilt (also über die Zeit, bei Dateien
// ohne Zeitstempel über die Punkte). Das Profil auf der Karte läuft aber über die Strecke – darum
// wird mit der Zeitachse der Fahrt von „Zeit“ auf „Strecke“ umgerechnet.
import { trackTimeAtDist, type TrackTimeline } from '@/lib/trackSync';

export function elevationByDistance(sample: number[] | undefined, timeline?: TrackTimeline, n = 100): number[] | null {
  if (!sample || sample.length < 2) return null;
  const at = (x: number) => { // x: 0–1 über die Aufzeichnung
    const p = Math.max(0, Math.min(1, x)) * (sample.length - 1), i = Math.floor(p), k = p - i;
    return i >= sample.length - 1 ? sample[sample.length - 1] : sample[i] + k * (sample[i + 1] - sample[i]);
  };
  if (!timeline || timeline.durationSeconds <= 0) {
    // ohne Zeitachse: Punkte ≈ Strecke
    return Array.from({ length: n }, (_, j) => Math.round(at(j / (n - 1))));
  }
  return Array.from({ length: n }, (_, j) => Math.round(at(trackTimeAtDist(timeline, j / (n - 1)) / timeline.durationSeconds)));
}
