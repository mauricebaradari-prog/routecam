// Geschwindigkeit aus der Zeitachse der Fahrt (GPX/KML mit Zeitstempeln: alle 2 s, wie weit man war).
// Ø = Fahrt-Schnitt ohne Standzeiten (Ampel, Pause); max = höchster Wert über 10 s gemittelt,
// damit einzelne GPS-Sprünge nicht als Spitze zählen.
import type { TrackTimeline } from '@/lib/trackSync';

export interface RideSpeed { avgKmh: number; maxKmh: number; movingSeconds: number; movingKm: number }

const STANDING_KMH = 3;   // darunter gilt man als stehend
const MAX_WINDOW_S = 10;  // Glättung für die Höchstgeschwindigkeit

export function rideSpeed(tl: TrackTimeline | undefined): RideSpeed | null {
  if (!tl || tl.samples.length < 2 || tl.distanceKm <= 0) return null;
  const s = tl.samples;
  let movingSeconds = 0, movingKm = 0, maxKmh = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i][0] - s[i - 1][0];
    if (dt <= 0) continue;
    const km = (s[i][1] - s[i - 1][1]) * tl.distanceKm;
    if ((km / dt) * 3600 >= STANDING_KMH) { movingSeconds += dt; movingKm += km; }
  }
  for (let i = 0, j = 0; i < s.length; i++) {
    while (j < s.length - 1 && s[j][0] - s[i][0] < MAX_WINDOW_S) j++;
    const dt = s[j][0] - s[i][0];
    if (dt >= MAX_WINDOW_S * 0.8) maxKmh = Math.max(maxKmh, ((s[j][1] - s[i][1]) * tl.distanceKm / dt) * 3600);
  }
  if (movingSeconds < 30) return null;
  return { avgKmh: (movingKm / movingSeconds) * 3600, maxKmh, movingSeconds, movingKm };
}
